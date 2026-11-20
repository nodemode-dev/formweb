#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / ".claude" / "skills"
MIRROR = ROOT / ".agents" / "skills"
MANIFEST = ROOT / "agents" / "manifest.json"
APP = "formweb"
WINDOW_GATED = ("run_ui_command",)
REMOVE_GATED = ("apply_commands",)
DOCK = {"present": True, "positions": ["bottom", "right"], "tabs": ["shell", "claude", "codex", "cursor", "antigravity", "chat"]}
DOCK_DIR = ROOT / "frontend" / "src" / "dock"
DOCK_VERSION = "2.2.1"
LOOKUP = ROOT / "backend" / "app" / "agent_lookup.py"
LOOKUP_HASHES = {"1.0.0": "252ea9bb9419d4990f174f91914f09800497bc69e98f849f5643bbf4217cc3f3", "1.0.1": "62667f9b68b7d101e1896ce617240424e33b7e498c560bc79d45f0ab26c77d51"}
EXTENSIONS = None


def lookup_problems() -> list[str]:
    import hashlib
    import re

    rel = LOOKUP.relative_to(ROOT).as_posix()
    try:
        raw = LOOKUP.read_bytes()
    except OSError:
        return [f"{rel}: missing (the shared finder for the agent programs)"]
    said = re.search(rb'^VERSION = "([^"\r\n]+)"\r?$', raw, re.M)
    version = said.group(1).decode("ascii", "replace") if said else "unknown"
    if LOOKUP_HASHES.get(version) != hashlib.sha256(raw).hexdigest():
        return [f"{rel}: does not match the hash recorded for version {version} (the shared finder changes only as a whole new version)"]
    return []


def lookup_check() -> int:
    problems = lookup_problems()
    for problem in problems:
        print(f"agents: {problem}")
    if not problems:
        print("agents: the shared finder matches the hash recorded for its version")
    return 1 if problems else 0


def dock_problems(folder: Path = DOCK_DIR) -> list[str]:
    import hashlib
    import re

    listing = folder / "MANIFEST.json"
    if not listing.is_file():
        return ["frontend/src/dock/MANIFEST.json is missing"]
    manifest = json.loads(listing.read_text(encoding="utf-8"))
    problems = [] if manifest.get("version") == DOCK_VERSION else [f"MANIFEST.json names module {manifest.get('version')}, expected {DOCK_VERSION}"]
    wanted = manifest.get("files", {})
    found = {path.name: path for path in folder.iterdir() if path.is_file() and path.name != "MANIFEST.json"}
    for name in sorted(set(wanted) | set(found)):
        if name not in found:
            problems.append(f"{name} is missing")
        elif name not in wanted:
            problems.append(f"{name} is extra")
        elif hashlib.sha256(found[name].read_bytes()).hexdigest() != wanted[name]:
            problems.append(f"{name} differs from MANIFEST.json")
    for name, path in sorted(found.items()):
        if path.suffix == ".ts":
            for target in re.findall(r"""(?:from|import)\s*\(?\s*['"]([^'"]+)['"]""", path.read_text(encoding="utf-8")):
                if not (target.startswith("./") and "/" not in target[2:]) and not target.startswith("@xterm/"):
                    problems.append(f"{name} imports {target} from outside the dock folder")
    return problems


def dock_check() -> int:
    problems = dock_problems()
    for problem in problems:
        print(f"agents: dock module: {problem}")
    if not problems:
        print("agents: frontend/src/dock matches its MANIFEST.json")
    return 1 if problems else 0


def files(folder: Path) -> dict[str, bytes]:
    return {str(path.relative_to(folder)): path.read_bytes() for path in sorted(folder.rglob("*")) if path.is_file()}


def sync(check: bool) -> int:
    if not SOURCE.is_dir():
        print("agents: .claude/skills is missing")
        return 1
    source_names = {path.name for path in SOURCE.iterdir() if path.is_dir() and (path / "SKILL.md").is_file()}
    mirror_names = {path.name for path in MIRROR.iterdir() if path.is_dir()} if MIRROR.is_dir() else set()
    changed = []
    for name in sorted(source_names | mirror_names):
        source, target = SOURCE / name, MIRROR / name
        if name not in source_names:
            changed.append(name)
            if not check:
                shutil.rmtree(target)
        elif not target.is_dir() or files(source) != files(target):
            changed.append(name)
            if not check:
                if target.exists():
                    shutil.rmtree(target)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(source, target)
    if changed:
        print("agents: " + ("drifted " if check else "mirrored ") + ", ".join(changed))
    else:
        print("agents: skills in step")
    return 1 if check and changed else 0


def skills() -> list[dict]:
    listed = []
    for path in sorted(SOURCE.iterdir()):
        if path.is_dir() and (path / "SKILL.md").is_file():
            folder = path / "sub-skills"
            subs = sorted(sub.name for sub in folder.iterdir() if sub.is_dir() and (sub / "SUB-SKILL.md").is_file()) if folder.is_dir() else []
            listed.append({"name": path.name, "sub_skills": subs})
    return listed


def mcp() -> dict:
    sys.dont_write_bytecode = True
    with tempfile.TemporaryDirectory(prefix="formweb-agents-", ignore_cleanup_errors=True) as scratch:
        os.environ["FORMWEB_DATA_DIR"] = scratch
        sys.path.insert(0, str(ROOT / "backend"))
        from app import seal
        from app.mcp_server import TOOLS, mcp_app

        seal._CACHE.update(tried=True, available=False, key=None)
        asks_by_default = bool(seal.effective("manifest", {})["agentDestructive"])
    by_name = {item["name"]: item for item in TOOLS}
    for name in WINDOW_GATED + REMOVE_GATED:
        if name not in by_name:
            raise ValueError(f"{name} is not in the MCP tool registry")
    transports = [name for name, served in (("stdio", (ROOT / "setup" / "mcp_stdio.py").is_file()), ("http", any(getattr(route, "path", "") == "/mcp" for route in mcp_app.routes))) if served]
    return {
        "tools": list(by_name),
        "read_only": [name for name, item in by_name.items() if item["annotations"].get("readOnlyHint")],
        "approval_gated": [name for name, item in by_name.items() if name in WINDOW_GATED or (asks_by_default and (name in REMOVE_GATED or item["annotations"].get("destructiveHint")))],
        "transports": transports,
    }


def manifest_text() -> str:
    document = {"format": "form-agent-manifest", "version": 1, "app": APP, "mcp": mcp(), "skills": skills(), "dock": DOCK, "extensions": EXTENSIONS}
    return json.dumps(document, indent=2) + "\n"


def manifest_sync(check: bool) -> int:
    try:
        wanted = manifest_text().encode("utf-8")
    except Exception as error:
        print(f"agents: agents/manifest.json could not be built: {error}")
        return 1
    if MANIFEST.is_file() and MANIFEST.read_bytes() == wanted:
        print("agents: agents/manifest.json in step")
        return 0
    if check:
        print("agents: drifted agents/manifest.json")
        return 1
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_bytes(wanted)
    print("agents: wrote agents/manifest.json")
    return 0


def sync_all(check: bool) -> int:
    return max(sync(check), manifest_sync(check), dock_check(), lookup_check())


def install() -> int:
    print("FormWeb works with four agent programs: Claude Code, Codex, Cursor and Antigravity.")
    print("Project MCP configurations are included for Claude Code, Codex and Cursor:")
    for name in (".mcp.json", ".codex/config.toml", ".cursor/mcp.json"):
        print(f"  {ROOT / name}")
    print("Antigravity reads ~/.gemini/config/mcp_config.json; its card in Agent Connect adds FormWeb's entry there when you ask.")
    print(f"Launch command: {ROOT / 'formweb'} mcp")
    print(f"Windows launch command: {ROOT / 'formweb.bat'} mcp")
    print("Start ./formweb boot or serve, enable Agents in the editor, then trust this project in your client.")
    print("No user-level configuration or installed skills were changed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="FormWeb project agent wiring and exact skill mirrors")
    parser.add_argument("command", choices=("sync", "install"), nargs="?", default="install")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    return sync_all(args.check) if args.command == "sync" else install()


if __name__ == "__main__":
    raise SystemExit(main())
