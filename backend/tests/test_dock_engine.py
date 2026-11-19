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
    for name in ("claude", "codex", "cursor-agent"):
        (folder / name).write_text(PROGRAM.replace("{name}", name))
        (folder / name).chmod(0o755)
    shell = tmp_path / "shell"
    shell.write_text(SHELL)
    shell.chmod(0o755)
    monkeypatch.setenv("PATH", f"{folder}:/usr/bin:/bin")
    monkeypatch.setenv("SHELL", str(shell))
    claude_code._found[:] = []
    agent_programs.reset()
    yield folder
    claude_code._found[:] = []
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
            task = asyncio.ensure_future(studio.approvals.wait("agent.tool", {"tool": "delete_project", "agent": "Test Agent", "inApp": False}, timeout=0.3))
            await asyncio.sleep(0.05)
            row = next(item for item in studio.approvals.list("pending")["approvals"] if item["subject"]["tool"] == "delete_project")
            if answer:
                channel.set("human")
                window_key.window.set(True)
                studio.approvals.decide(row["id"], answer)
            try:
                await task
                status = 200
            except EngineError as error:
                status = error.status
            return row, status, [queue.get_nowait()[0] for _ in range(queue.qsize())], studio.approvals.get(row["id"])
        finally:
            studio.subscribers.discard(queue)

    return client.portal.call(run)


def test_a_waiting_agent_call_says_who_asked_and_which_answers_there_are(client):
    row, status, notices, after = waiting_call(client, "deny")
    assert row["agent"] == "Test Agent" and row["inApp"] is False and row["what"] == "run delete_project"
    assert row["offers"] == ["deny", "once"] and row["always"] == "all"
    assert 0 < row["expires"] - time.time() * 1000 < 1000
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


def test_agent_status_answers_for_the_three_programs_in_one_call(client, standins):
    answer = client.get("/api/agents/status").json()
    assert answer["contract"] == "2.0.1" and answer["tabs"] == ["shell", "claude", "chat", "codex", "cursor"]
    for kind, name in (("claude", "claude"), ("codex", "codex"), ("cursor", "cursor-agent")):
        assert answer[kind]["installed"] is True and answer[kind]["version"] == f"{name} 9.9.9 (stand-in)" and answer[kind]["install"] == ""
        assert answer[kind]["signedIn"] in (True, None)


def test_agent_status_gives_an_install_line_for_a_missing_program(client, monkeypatch):
    from app import agent_programs

    monkeypatch.setattr(agent_programs, "find", lambda kind: None)
    answer = client.get("/api/agents/status").json()
    for kind in ("claude", "codex", "cursor"):
        assert answer[kind] == {"installed": False, "version": None, "install": agent_programs.PROGRAMS[kind]["install"], "signedIn": None, "path": None, "title": agent_programs.PROGRAMS[kind]["title"]}
    refused = client.post("/api/terminal/open", json={"kind": "codex"})
    assert refused.status_code == 424 and "not installed" in refused.json()["detail"] and refused.json()["code"] == "notInstalled"


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


def test_the_entry_the_engine_writes_for_its_own_tabs_is_named_formweb_tab():
    import json

    from app import claude_code

    assert list(json.loads(claude_code.mcp_config("t"))["mcpServers"]) == ["formweb_tab"]
    assert "mcp__formweb_tab" in claude_code._base("claude", "", "", False, "config.json")
