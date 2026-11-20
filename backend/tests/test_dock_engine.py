import asyncio
import os
import stat
import time

import pytest

from conftest import INAPP_HEADER, MCP_PATH

ACCEPT = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
NOKEY = {"x-formweb-window-key": ""}
SITE = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_site", "arguments": {"detail": "summary"}}}
PROGRAM = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "{name} 9.9.9 (stand-in)"; exit 0; fi\nsleep 30\n'
SHELL = '#!/bin/sh\nif [ "$1" = "-l" ]; then shift; fi\nexec /bin/sh "$@"\n'


@pytest.fixture()
def standins(tmp_path, monkeypatch):
    from app import agent_programs, claude_code

    folder = tmp_path / "bin"
    folder.mkdir()
    for name in ("claude", "codex", "cursor-agent", "agy"):
        (folder / name).write_text(PROGRAM.replace("{name}", name))
        (folder / name).chmod(0o755)
    shell = tmp_path / "shell"
    shell.write_text(SHELL)
    shell.chmod(0o755)
    monkeypatch.setenv("PATH", f"{folder}:/usr/bin:/bin")
    monkeypatch.setenv("SHELL", str(shell))
    agent_programs.reset()
    yield folder
    agent_programs.reset()


@pytest.fixture()
def nothing_installed(monkeypatch):
    from app import agent_programs

    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    agent_programs.reset()
    yield
    agent_programs.reset()


def waiting_call(client, answer):
    from app import window_key
    from app.access import LOCAL_OWNER, actor, channel
    from app.engine import EngineError
    from app.service import studio

    async def run():
        actor.set(LOCAL_OWNER)
        channel.set("agent")
        queue = asyncio.Queue(maxsize=8)
        studio.subscribers.add(queue)
        try:
            asked = time.time()
            task = asyncio.ensure_future(studio.approvals.wait("agent.tool", {"tool": "delete_project", "agent": "Test Agent", "inApp": False}, timeout=0.3))
            first = await queue.get()
            seen = time.time()
            row = next(item for item in studio.approvals.list("pending")["approvals"] if item["subject"]["tool"] == "delete_project")
            row["window"] = (int((asked + 0.3) * 1000), int((seen + 0.3) * 1000))
            if answer:
                channel.set("human")
                window_key.window.set(True)
                studio.approvals.decide(row["id"], answer)
            try:
                await task
                status = 200
            except EngineError as error:
                status = error.status
            return row, status, [first[0]] + [queue.get_nowait()[0] for _ in range(queue.qsize())], studio.approvals.get(row["id"])
        finally:
            studio.subscribers.discard(queue)

    return client.portal.call(run)


def test_a_waiting_agent_call_says_who_asked_and_which_answers_there_are(client):
    row, status, notices, after = waiting_call(client, "deny")
    assert row["agent"] == "Test Agent" and row["inApp"] is False and row["what"] == "run delete_project"
    assert row["offers"] == ["deny", "once"] and row["always"] == "all"
    assert row["window"][0] <= row["expires"] <= row["window"][1]
    assert status == 403 and after["status"] == "denied" and after["expires"] is None
    assert [(item.name, item.data) for item in notices] == [("approval", {"type": "request", "id": row["id"]}), ("approval", {"type": "withdrawn", "id": row["id"], "reason": "denied"})]


def test_approve_is_once_and_the_stream_says_so(client):
    row, status, notices, after = waiting_call(client, "approve")
    assert status == 200 and after["status"] == "approved"
    assert notices[-1].data == {"type": "withdrawn", "id": row["id"], "reason": "approved"}


def test_a_request_nobody_answers_is_withdrawn_when_its_time_is_up(client):
    row, status, notices, after = waiting_call(client, None)
    assert status == 408 and after["status"] == "expired"
    assert notices[-1].data == {"type": "withdrawn", "id": row["id"], "reason": "expired"}


def test_a_release_review_row_carries_no_dialog_fields(client):
    from app.access import LOCAL_OWNER, actor
    from app.service import studio

    async def ask():
        actor.set(LOCAL_OWNER)
        item = studio.approvals.create("release.promote", {"slug": "dock-engine", "version": "1"})
        studio.approvals.mark(item["id"], "expired")
        return item

    assert not {"agent", "offers", "always", "expires"} & set(client.portal.call(ask))


def test_a_stored_blocked_refuses_every_agent_and_the_apps_own_tabs(client):
    from app import claude_code
    from app.service import BLOCKED

    token = claude_code.issue_env("Codex")
    try:
        assert client.get("/api/agents/access").json()["choice"] == "off"
        assert client.post(MCP_PATH, json=SITE, headers={**ACCEPT, INAPP_HEADER: token}).status_code == 200
        assert client.post("/api/agents/access", json={"choice": "blocked"}, headers=NOKEY).status_code == 403
        assert client.post("/api/agents/access", json={"choice": "maybe"}).status_code == 422
        answer = client.post("/api/agents/access", json={"choice": "blocked"}).json()
        assert answer["choice"] == "blocked" and answer["stored"] == "blocked" and answer["ownTabs"] is False
        for headers in ({INAPP_HEADER: token}, {}):
            refused = client.post(MCP_PATH, json=SITE, headers={**ACCEPT, **headers})
            assert refused.status_code == 403 and refused.json() == {"detail": BLOCKED}
        assert client.get("/api/system").json()["agentsEnabled"] is False
        assert client.post("/api/agents", json={"enabled": True}).json()["agentsEnabled"] is True
        assert client.get("/api/agents/access").json()["stored"] is None
    finally:
        client.post("/api/agents", json={"enabled": True})
        client.post("/api/agents", json={"enabled": False})
        claude_code.revoke(token)
    assert client.get("/api/agents/access").json()["choice"] == "off"


def test_a_blocked_record_changed_outside_stays_blocked_and_says_so(monkeypatch):
    import keyring

    from app import seal

    values: dict = {}
    seal.reset()
    monkeypatch.setattr(keyring, "get_password", lambda service, name: values.get((service, name)))
    monkeypatch.setattr(keyring, "set_password", lambda service, name, value: values.__setitem__((service, name), value))
    try:
        signed = seal.access_sign("blocked")
        assert seal.access_effective(signed) == {"stored": "blocked", "sealBroken": False}
        assert seal.access_effective({"choice": "allowed", "seal": "x" * 64}) == {"stored": "blocked", "sealBroken": True}
        assert seal.access_effective(None) == {"stored": None, "sealBroken": False}
    finally:
        seal.reset()


def test_agent_status_answers_for_the_four_programs_in_one_call(client, standins):
    answer = client.get("/api/agents/status").json()
    assert answer["contract"] == "2.0.1" and answer["tabs"] == ["shell", "claude", "chat", "codex", "cursor", "antigravity"]
    for kind, name in (("claude", "claude"), ("codex", "codex"), ("cursor", "cursor-agent"), ("antigravity", "agy")):
        assert answer[kind]["installed"] is True and answer[kind]["finding"] == "runs" and answer[kind]["version"] == "9.9.9" and answer[kind]["install"] == ""
        assert answer[kind]["path"] == str(standins / name) and answer[kind]["how"] == "path"
        assert answer[kind]["signedIn"] in (True, None)
    assert answer["antigravity"]["signedIn"] is None and answer["antigravity"]["title"] == "Antigravity"


def test_agent_status_says_where_it_looked_for_a_missing_program(client, nothing_installed):
    from app import agent_lookup, agent_programs

    answer = client.get("/api/agents/status", params={"fresh": "true"}).json()
    for kind in ("claude", "codex", "cursor", "antigravity"):
        said = answer[kind]
        assert said["installed"] is False and said["finding"] == "missing" and said["path"] is None and said["version"] is None and said["signedIn"] is None
        assert said["install"] == agent_lookup.install(kind) and said["title"] == agent_programs.PROGRAMS[kind]["title"]
        assert said["looked"][0] == "PATH (/usr/bin:/bin)" and said["said"].startswith(f"{said['title']} was not found. Looked in: PATH (/usr/bin:/bin)")
    refused = client.post("/api/terminal/open", json={"kind": "codex"})
    assert refused.status_code == 424 and refused.json()["detail"].startswith("Codex was not found.") and refused.json()["code"] == "notInstalled"


def test_a_program_that_is_found_but_does_not_start_is_reported_as_broken(client, standins):
    from app import agent_programs

    (standins / "codex").write_text("#!/bin/sh\necho 'codex cannot start here' >&2\nexit 3\n")
    agent_programs.reset()
    answer = client.get("/api/agents/status", params={"fresh": "true"}).json()["codex"]
    assert answer["installed"] is False and answer["finding"] == "broken" and answer["path"] == str(standins / "codex") and answer["error"] == "codex cannot start here"
    assert client.post("/api/terminal/open", json={"kind": "codex"}).status_code == 424


def test_a_codex_or_cursor_tab_gets_its_token_in_the_environment_and_loses_it_when_closed(client, standins):
    from app import agent_programs, claude_code

    for kind, title in (("codex", "Codex"), ("cursor", "Cursor")):
        argv, env, folder, token = agent_programs.launch(kind)
        assert token not in " ".join(argv) and env[agent_programs.TOKEN_ENV] == token and claude_code.valid_token(token) and claude_code.tab_name(token) == title
        claude_code.revoke(token)
        assert not claude_code.valid_token(token)
    written = folder / ".cursor" / "mcp.json"
    assert stat.S_IMODE(os.stat(written).st_mode) == 0o600 and "${env:FORMWEB_INAPP_TOKEN}" in written.read_text() and '"formweb_tab"' in written.read_text()
    assert client.post("/api/terminal/open", json={"kind": "codex"}, headers=NOKEY).status_code == 403
    assert client.post("/api/terminal/open", json={"kind": "vim"}).status_code == 422
    tab = client.post("/api/terminal/open", json={"kind": "codex"}).json()
    assert tab["kind"] == "codex" and tab["title"] == "Codex"
    assert {"id": tab["id"], "title": "Codex", "kind": "codex", "app": True, "alive": True} in client.get("/api/terminal/sessions").json()["sessions"]
    assert "Codex" in claude_code.NAMES.values()
    assert client.post("/api/terminal/close", json={"id": tab["id"]}, headers=NOKEY).status_code == 403
    assert client.post("/api/terminal/close", json={"id": tab["id"]}).json() == {"id": tab["id"], "closed": True}
    assert client.post("/api/terminal/close", json={"id": tab["id"]}).json() == {"id": tab["id"], "closed": False}
    assert "Codex" not in claude_code.NAMES.values()


def test_an_antigravity_tab_has_its_entry_in_the_folder_file_until_it_closes(client, standins, tmp_path, monkeypatch):
    import json

    from app import agent_programs, claude_code

    folder = tmp_path / "tab"
    written = folder / ".agents" / "mcp_config.json"
    written.parent.mkdir(parents=True)
    written.write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}, "keep": 7}))
    monkeypatch.setattr(agent_programs, "tab_folder", lambda kind: folder)
    tab = client.post("/api/terminal/open", json={"kind": "antigravity"}).json()
    assert tab["kind"] == "antigravity" and tab["title"] == "Antigravity"
    held = json.loads(written.read_text())
    token = held["mcpServers"]["formweb_tab"]["headers"]["X-FormWeb-Inapp"]
    assert held["mcpServers"]["formweb_tab"]["serverUrl"] == claude_code.mcp_url() and held["mcpServers"]["other"] == {"command": "x"} and held["keep"] == 7
    assert stat.S_IMODE(os.stat(written).st_mode) == 0o600 and claude_code.valid_token(token) and claude_code.tab_name(token) == "Antigravity"
    assert client.post("/api/terminal/close", json={"id": tab["id"]}).json() == {"id": tab["id"], "closed": True}
    assert json.loads(written.read_text()) == {"mcpServers": {"other": {"command": "x"}}, "keep": 7}
    assert not claude_code.valid_token(token)


def test_two_antigravity_tabs_each_have_a_folder_and_an_entry_of_their_own(client, standins):
    import json

    from app import agent_programs, claude_code, terminal
    from app.config import DATA_DIR

    home = DATA_DIR / "agent-tabs" / "antigravity"
    tabs = [client.post("/api/terminal/open", json={"kind": "antigravity"}).json() for _ in range(2)]
    tokens = [next(item.inapp for item in terminal.SESSIONS.values() if item.id == tab["id"]) for tab in tabs]
    folders = [agent_programs.TAB_FOLDERS[token] for token in tokens]
    assert folders[0] != folders[1] and all(folder.parent == home for folder in folders)
    assert not (claude_code.workdir() / ".agents" / "mcp_config.json").exists()
    for folder, token in zip(folders, tokens):
        entry = json.loads((folder / ".agents" / "mcp_config.json").read_text())["mcpServers"]["formweb_tab"]
        assert entry["headers"]["X-FormWeb-Inapp"] == token and claude_code.valid_token(token)
    kept = (folders[1] / ".agents" / "mcp_config.json").read_text()
    assert client.post("/api/terminal/close", json={"id": tabs[0]["id"]}).json()["closed"] is True
    assert not folders[0].exists() and not claude_code.valid_token(tokens[0])
    assert (folders[1] / ".agents" / "mcp_config.json").read_text() == kept and claude_code.valid_token(tokens[1])
    assert client.post("/api/terminal/close", json={"id": tabs[1]["id"]}).json()["closed"] is True
    assert list(home.iterdir()) == [] and not claude_code.valid_token(tokens[1]) and agent_programs.TAB_FOLDERS == {}


def test_an_antigravity_tab_with_an_unreadable_servers_file_is_refused_with_a_sentence(client, standins, tmp_path, monkeypatch):
    from app import agent_programs, claude_code

    folder = tmp_path / "tab"
    written = folder / ".agents" / "mcp_config.json"
    written.parent.mkdir(parents=True)
    monkeypatch.setattr(agent_programs, "tab_folder", lambda kind: folder)
    names = dict(claude_code.NAMES)
    for text in ("not json at all", "[1, 2]"):
        written.write_text(text)
        answer = client.post("/api/terminal/open", json={"kind": "antigravity"})
        assert answer.status_code == 409 and answer.json()["detail"] == f"Antigravity was not started: {written} is not an MCP servers file FormWeb can read, so it was left alone."
        assert written.read_text() == text and claude_code.NAMES == names


def test_the_antigravity_card_adds_one_entry_and_leaves_the_rest(client, standins):
    import json

    from app import clients

    path = clients.antigravity_file()
    listed = client.get("/api/agents/clients").json()["clients"]
    assert [item["id"] for item in listed] == ["claude-code", "codex", "cursor", "antigravity"]
    assert listed[3]["status"] == "missing" and listed[3]["cliFound"] is True and listed[3]["file"] == "~/.gemini/config/mcp_config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"mcpServers": {"other": {"serverUrl": "http://x"}}, "theme": "dark"}))
    assert client.post("/api/agents/clients/antigravity", json={}).json()["status"] == "ready"
    assert json.loads(path.read_text()) == {"mcpServers": {"other": {"serverUrl": "http://x"}, "formweb": clients.antigravity_entry()}, "theme": "dark"}
    stamp = os.stat(path).st_mtime_ns
    assert client.post("/api/agents/clients/antigravity", json={}).json()["status"] == "ready" and os.stat(path).st_mtime_ns == stamp
    path.write_text(json.dumps({"mcpServers": {"formweb": {"command": "/elsewhere"}}}))
    kept = client.post("/api/agents/clients/antigravity", json={}).json()
    assert kept["status"] == "changed" and "did not write" in kept["note"] and json.loads(path.read_text()) == {"mcpServers": {"formweb": {"command": "/elsewhere"}}}
    path.unlink()


def test_the_entry_the_engine_writes_for_its_own_tabs_is_named_formweb_tab():
    import json

    from app import claude_code

    assert list(json.loads(claude_code.mcp_config("t"))["mcpServers"]) == ["formweb_tab"]
    assert "mcp__formweb_tab" in claude_code._base("claude", "", "", False, "config.json")
