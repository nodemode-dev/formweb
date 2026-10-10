#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / ".claude" / "skills"
MIRROR = ROOT / ".agents" / "skills"


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


def install() -> int:
    print("Project MCP configurations are included:")
    for name in (".mcp.json", ".codex/config.toml", ".cursor/mcp.json"):
        print(f"  {ROOT / name}")
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
    return sync(args.check) if args.command == "sync" else install()


if __name__ == "__main__":
    raise SystemExit(main())
