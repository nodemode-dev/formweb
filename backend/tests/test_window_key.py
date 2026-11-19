import json
import re

import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import LOOPBACK, WS_PATH

READS = {"GET", "HEAD", "OPTIONS"}
OPEN = {("POST", "/api/window/key")}
VISITOR = re.compile(r"^(/api/forms/|/api/runtime/|/api/providers/commerce/webhook$|/published/|/sites/|/preview/)")
REFUSED = {"detail": "Only the FormWeb window can do this."}
NOKEY = {"x-formweb-window-key": ""}


class Bare:
    def __init__(self, client):
        self.client = client

    def request(self, method, url, headers=None, **kwargs):
        return self.client.request(method, url, headers={**NOKEY, **(headers or {})}, **kwargs)

    def get(self, url, headers=None):
        return self.request("GET", url, headers)

    def post(self, url, headers=None, **kwargs):
        return self.request("POST", url, headers, **kwargs)

    def websocket_connect(self, url, headers=None):
        return self.client.websocket_connect(url, headers={**NOKEY, **(headers or {})})


@pytest.fixture()
def bare(client):
    return Bare(client)


def write_operations(app):
    return [(m.upper(), path) for path, item in app.openapi()["paths"].items() for m in item if m.upper() not in READS]


def test_the_open_list_is_short_and_named():
    from app import window_key

    assert set(window_key.OPEN) == {"/mcp", "/api/window/key"}


def test_every_write_route_needs_the_window_key(app, bare):
    ops = write_operations(app)
    assert len(ops) > 60
    answered = []
    for method, path in ops:
        if (method, path) in OPEN or VISITOR.match(path):
            continue
        url = re.sub(r"\{[^}]+\}", "x", path)
        for headers in ({}, {"x-formweb-window-key": "x" * 43}, {"x-formweb-channel": "human"}):
            r = bare.request(method, url, json={}, headers=headers)
            if r.status_code != 403 or r.json() != REFUSED:
                answered.append(f"{method} {path} {r.status_code}")
    assert not answered, "write routes that answer without the window key (add the key, or name the route and its caller in window_key.OPEN): " + ", ".join(answered)


@pytest.mark.parametrize("path", ["/api/approvals", "/api/terminal/sessions"])
def test_reads_that_name_pending_work_need_the_key(bare, client, path):
    assert bare.get(path).status_code == 403
    assert client.get(path).status_code == 200


def test_the_window_writes_with_the_key(client, fresh):
    r = client.post("/api/command", json={"command": "page.add", "params": {"name": "Keyed", "slug": "/keyed"}, "expectedRevision": fresh["revision"]})
    assert r.status_code == 200 and r.json()["revision"] == fresh["revision"] + 1


def test_the_bootstrap_answers_once(bare):
    from app import window_key

    saved = dict(window_key.STATE)
    window_key.STATE.update(claimed=False, secondClaim=False)
    try:
        first = bare.post("/api/window/key")
        assert first.status_code == 200 and first.json()["key"] == window_key.KEY
        assert bare.post("/api/window/key").status_code == 409
        assert window_key.STATE["secondClaim"]
    finally:
        window_key.STATE.update(saved)


def test_the_bootstrap_does_not_exist_when_the_shell_reads_the_key(bare, monkeypatch):
    monkeypatch.setenv("FORMWEB_WINDOW_KEY_STDOUT", "1")
    assert bare.post("/api/window/key").status_code == 404


def socket_message(client, query):
    with client.websocket_connect(WS_PATH + query, headers=LOOPBACK) as ws:
        message = json.loads(ws.receive_text())
        if message["type"] == "error":
            with pytest.raises(WebSocketDisconnect):
                ws.receive_text()
    return message


def test_a_terminal_socket_needs_the_key_or_a_one_time_ticket(bare, client):
    assert socket_message(bare, "")["message"] == REFUSED["detail"]
    assert socket_message(bare, "?ticket=made-up")["message"] == REFUSED["detail"]
    assert bare.post("/api/window/ticket").status_code == 403
    ticket = client.post("/api/window/ticket").json()["ticket"]
    first = socket_message(bare, "?ticket=" + ticket)
    assert first["message"] != REFUSED["detail"]
    assert socket_message(bare, "?ticket=" + ticket)["message"] == REFUSED["detail"]


def test_only_the_window_turns_agents_or_approval_settings(bare, client):
    assert bare.post("/api/agents", json={"enabled": True}).status_code == 403
    assert bare.post("/api/approvals/settings", json={"agentDestructive": False}, headers={"x-formweb-channel": "human"}).status_code == 403
    assert bare.post("/api/terminal/open", json={"kind": "shell"}).status_code == 403
    assert client.post("/api/approvals/settings", json={"agentDestructive": False}).status_code == 200


def test_an_approval_is_not_decided_by_an_agent_or_the_terminal(client):
    from app.access import LOCAL_OWNER, actor, channel
    from app.service import studio

    async def ask():
        actor.set(LOCAL_OWNER)
        channel.set("agent")
        return studio.approvals.create("agent.tool", {"tool": "page.remove"})

    item = client.portal.call(ask)
    for name in ("agent", "terminal"):
        r = client.post(f"/api/approvals/{item['id']}", json={"decision": "approve"}, headers={"x-formweb-channel": name})
        assert r.status_code == 403
    r = client.post(f"/api/approvals/{item['id']}", json={"decision": "deny"})
    assert r.status_code == 200 and r.json()["status"] == "denied"


def test_an_in_app_token_lives_in_an_owner_only_file_and_ends_with_its_tab():
    import os
    import stat

    from app import claude_code

    token, path = claude_code.issue()
    other, _ = claude_code.issue()
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600 and token in path.read_text()
    assert token not in " ".join(claude_code._base("claude", "", "", False, path))
    claude_code.revoke(token)
    assert not path.exists() and not claude_code.valid_token(token) and claude_code.valid_token(other)
    claude_code.revoke(other)


def test_the_stored_approval_choice_is_sealed(monkeypatch):
    import keyring
    from keyring.backend import KeyringBackend

    from app import seal

    class Memory(KeyringBackend):
        priority = 1
        values: dict = {}

        def get_password(self, service, username):
            return self.values.get((service, username))

        def set_password(self, service, username, password):
            self.values[(service, username)] = password

        def delete_password(self, service, username):
            self.values.pop((service, username), None)

    seal.reset()
    monkeypatch.setattr(keyring, "get_password", Memory().get_password)
    monkeypatch.setattr(keyring, "set_password", Memory().set_password)
    try:
        signed = seal.sign("p", {"agentDestructive": False, "publishReview": False})
        assert seal.effective("p", signed)["seal"] == "ok"
        edited = {**seal.sign("p", {"agentDestructive": True}), "agentDestructive": False}
        assert seal.effective("p", edited) == {"agentDestructive": True, "publishReview": False, "seal": "broken", "sealBroken": True}
    finally:
        seal.reset()


def test_without_a_keychain_the_seal_reports_unavailable(monkeypatch):
    import keyring

    from app import seal

    def fail(*_):
        raise RuntimeError("no backend")

    seal.reset()
    monkeypatch.setattr(keyring, "get_password", fail)
    try:
        assert seal.effective("p", {"agentDestructive": False})["seal"] == "unavailable"
        assert "seal" not in seal.sign("p", {"agentDestructive": False})
    finally:
        seal.reset()
