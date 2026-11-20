import importlib.util
import json
import shutil

from conftest import REPO

DOCK = REPO / "frontend" / "src" / "dock"
FRONTEND = REPO / "frontend"


def agents():
    spec = importlib.util.spec_from_file_location("formweb_agents_sync", REPO / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_dock_folder_matches_its_manifest():
    assert agents().dock_problems() == []


def test_a_changed_missing_or_extra_dock_file_is_named(tmp_path):
    copy = tmp_path / "dock"
    shutil.copytree(DOCK, copy)
    (copy / "keys.ts").write_text((copy / "keys.ts").read_text(encoding="utf-8") + "\n", encoding="utf-8")
    (copy / "dom.ts").unlink()
    (copy / "mine.ts").write_text("import { state } from '../api';\n", encoding="utf-8")
    problems = agents().dock_problems(copy)
    assert "keys.ts differs from MANIFEST.json" in problems
    assert "dom.ts is missing" in problems
    assert "mine.ts is extra" in problems
    assert "mine.ts imports ../api from outside the dock folder" in problems


def test_the_agent_manifest_describes_the_dock():
    dock = json.loads((REPO / "agents" / "manifest.json").read_text(encoding="utf-8"))["dock"]
    assert dock == {"present": True, "positions": ["bottom", "right"], "tabs": ["shell", "claude", "codex", "cursor", "chat"]}


def test_the_old_layout_word_is_moved_once_and_reserved_before_paint():
    adapter = (FRONTEND / "src" / "dock-adapter.ts").read_text(encoding="utf-8")
    page = (FRONTEND / "index.html").read_text(encoding="utf-8")
    assert "DOCK_KEY = 'formweb.dock'" in adapter and "DOCK_OLD_KEY = 'formweb_terminal'" in adapter
    assert "open: word === 'open', seen: true" in adapter
    assert "localStorage.getItem('formweb.dock')" in page and "localStorage.getItem('formweb_terminal') === 'open'" in page
    for name in ("data-ft-dock", "data-ft-dock-side", "data-ft-dock-h", "data-ft-dock-w", "--ft-dock-size", "--ft-dock-wsize"):
        assert name in page


def test_the_dialog_offers_only_what_the_engine_sends():
    adapter = (FRONTEND / "src" / "dock-adapter.ts").read_text(encoding="utf-8")
    assert "x === 'deny' || x === 'once'" in adapter
    assert "row.kind !== 'agent.tool'" in adapter
    assert "decision: choice === 'deny' ? 'deny' : 'approve'" in adapter


LOOKUP = "backend/app/agent_lookup.py"


def lookup_version():
    import re

    return re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)


def test_the_shared_finder_matches_the_hash_recorded_for_its_version():
    import hashlib

    module = agents()
    assert module.LOOKUP_HASHES[lookup_version()] == hashlib.sha256((REPO / LOOKUP).read_bytes()).hexdigest()
    assert module.lookup_problems() == []


def test_the_check_names_the_shared_finder_edited_in_place_or_missing(tmp_path):
    copy = tmp_path / "repo"
    (copy / "backend" / "app").mkdir(parents=True)
    (copy / "setup").mkdir()
    shutil.copy(REPO / "setup" / "agents.py", copy / "setup" / "agents.py")
    shutil.copy(REPO / LOOKUP, copy / LOOKUP)
    spec = importlib.util.spec_from_file_location("formweb_agents_copy", copy / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.lookup_problems() == []
    with open(copy / LOOKUP, "a", encoding="utf-8") as out:
        out.write("\n")
    assert module.lookup_problems() == [f"{LOOKUP}: does not match the hash recorded for version {lookup_version()} (the shared finder changes only as a whole new version)"]
    (copy / LOOKUP).unlink()
    assert module.lookup_problems() == [f"{LOOKUP}: missing (the shared finder for the agent programs)"]


def test_the_shared_finder_imports_nothing_from_the_app():
    import re

    imports = set(re.findall(r"^\s*(?:from|import)\s+([\w.]+)", (REPO / LOOKUP).read_text(encoding="utf-8"), re.M))
    assert imports == {"__future__", "dataclasses", "os", "pathlib", "re", "shutil", "signal", "subprocess", "sys", "threading", "time", "winreg"}


def test_the_old_terminal_panel_is_gone():
    assert not (FRONTEND / "src" / "features" / "terminal.ts").exists()
    assert not (FRONTEND / "src" / "styles" / "terminal.css").exists()
    for path in (FRONTEND / "src").rglob("*.ts"):
        if DOCK not in path.parents:
            assert "fw-term" not in path.read_text(encoding="utf-8"), path
