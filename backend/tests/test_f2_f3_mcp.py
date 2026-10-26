import json
import subprocess
import sys

import httpx
import pytest

from conftest import ENGINE_PORT, INAPP_HEADER, MCP_PATH, STDIO_CMD

ACCEPT = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
INIT = {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"}}


def rpc(client, method, params=None, headers=None, id=1):
    body = {"jsonrpc": "2.0", "id": id, "method": method, "params": params or {}}
    return client.post(MCP_PATH, json=body, headers={**ACCEPT, **(headers or {})})


def call(client, name, arguments=None, headers=None):
    response = rpc(client, "tools/call", {"name": name, "arguments": arguments or {}}, headers)
    assert response.status_code == 200, response.text
    return response.json()["result"]


def payload(result):
    return result.get("structuredContent") or json.loads(result["content"][0]["text"])


@pytest.fixture()
def agents_on(client):
    assert client.post("/api/agents", json={"enabled": True}).status_code == 200
    yield
    client.post("/api/agents", json={"enabled": False})


def test_mcp_refuses_while_agents_are_off(client):
    response = rpc(client, "initialize", INIT)
    assert response.status_code == 403
    assert "Agents are disabled" in response.json()["detail"]


def test_a_wrong_or_empty_in_app_token_does_not_open_the_gate(client):
    for value in ("", "wrong", "x" * 40):
        assert rpc(client, "initialize", INIT, {INAPP_HEADER: value}).status_code == 403


def test_the_in_app_token_opens_the_gate_without_turning_agents_on(client):
    from app.claude_code import INAPP_TOKEN

    assert rpc(client, "initialize", INIT, {INAPP_HEADER: INAPP_TOKEN}).status_code == 200
    assert rpc(client, "initialize", INIT).status_code == 403


def test_turning_agents_off_closes_the_gate_again(client):
    client.post("/api/agents", json={"enabled": True})
    assert rpc(client, "initialize", INIT).status_code == 200
    client.post("/api/agents", json={"enabled": False})
    assert rpc(client, "initialize", INIT).status_code == 403


def test_initialize_answers_without_an_origin(client, agents_on):
    response = rpc(client, "initialize", INIT)
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["serverInfo"]["name"] == "FormWeb"
    assert "tools" in result["capabilities"]


@pytest.mark.parametrize("origin", ["http://evil.example", "null", "http://localhost:3099"])
def test_mcp_refuses_a_foreign_origin(client, agents_on, origin):
    assert rpc(client, "initialize", INIT, {"origin": origin}).status_code == 403


def test_mcp_refuses_a_foreign_host(client, agents_on):
    assert rpc(client, "initialize", INIT, {"host": "evil.example"}).status_code in (403, 421)


def test_tools_list_names_exactly_the_catalogue(client, agents_on):
    from app.mcp_server import TOOLS

    listed = rpc(client, "tools/list").json()["result"]["tools"]
    assert [t["name"] for t in listed] == [t["name"] for t in TOOLS]
    assert len(listed) == len(TOOLS) > 50
    assert len({t["name"] for t in listed}) == len(listed)
    for tool in listed:
        assert tool["description"].strip()
        assert tool["inputSchema"]["type"] == "object"
        assert "readOnlyHint" in tool["annotations"]


def test_read_only_tool_returns_the_open_site(client, agents_on, fresh):
    result = call(client, "get_site", {"detail": "summary"})
    assert not result.get("isError")
    assert "revision" in json.dumps(payload(result))


def test_unknown_method_is_error_32601(client, agents_on):
    assert rpc(client, "no/such/method").json()["error"]["code"] == -32601


def test_unknown_tool_and_bad_arguments_are_tool_errors_not_edits(client, agents_on, fresh):
    before = client.get("/api/state").json()
    assert call(client, "no_such_tool")["isError"] is True
    bad = call(client, "apply_commands", {"commands": "nope"})
    assert bad["isError"] is True
    assert call(client, "get_site", {"detail": "everything"})["isError"] is True
    assert client.get("/api/state").json() == before


def test_apply_commands_edits_and_history_undo_reverses_it(client, agents_on, fresh):
    before = client.get("/api/state").json()["site"]
    result = call(client, "apply_commands", {"commands": [{"command": "node.add", "params": {"parent": "work", "node": {"id": "from-mcp", "tag": "p", "text": "hi"}}}]})
    assert not result.get("isError"), result
    assert "from-mcp" in client.get("/api/state").json()["site"]["nodes"]
    undone = call(client, "history", {"action": "undo"})
    assert not undone.get("isError")
    assert client.get("/api/state").json()["site"] == before


def test_a_stale_expected_revision_is_refused_through_mcp(client, agents_on, fresh):
    result = call(client, "apply_commands", {"commands": [{"command": "token.set", "params": {"name": "zz", "value": "#fff"}}], "expected_revision": fresh["revision"] + 5})
    assert result["isError"] is True
    assert "conflict" in json.dumps(payload(result)).lower()
    assert "zz" not in client.get("/api/state").json()["site"]["tokens"]


def test_an_invalid_node_tree_is_refused_through_mcp(client, agents_on, fresh):
    before = client.get("/api/state").json()["site"]
    result = call(client, "apply_commands", {"commands": [{"command": "node.add", "params": {"parent": "work", "node": {"tag": "script"}}}]})
    assert result["isError"] is True
    assert client.get("/api/state").json()["site"] == before


def test_resources_list_the_site(client, agents_on):
    resources = rpc(client, "resources/list").json()["result"]["resources"]
    assert "formweb://site" in {str(r["uri"]) for r in resources}


def test_the_tool_catalogue_has_no_changing_tool_marked_read_only():
    from app.mcp_server import TOOLS

    read_only = {t["name"] for t in TOOLS if t["annotations"]["readOnlyHint"]}
    for name in ("apply_commands", "history", "save_project", "open_project", "export_site", "publish_site", "set_page_password"):
        assert name not in read_only


def bearer(engine, token=None, **extra):
    headers = {**ACCEPT, "host": f"127.0.0.1:{engine['port']}", **extra}
    if token is not None:
        headers["authorization"] = "Bearer " + token
    return headers


def post_mcp(engine, headers, method="initialize", params=None):
    return httpx.post(engine["base"] + MCP_PATH, headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or (INIT if method == "initialize" else {})}, timeout=10, trust_env=False)


def test_mcp_needs_its_bearer_token(secured_engine):
    assert post_mcp(secured_engine, bearer(secured_engine)).status_code == 401
    assert post_mcp(secured_engine, bearer(secured_engine, "wrong-token")).status_code == 401
    assert post_mcp(secured_engine, {**bearer(secured_engine), "authorization": "Basic abc"}).status_code == 401
    assert post_mcp(secured_engine, bearer(secured_engine, secured_engine["token"])).status_code == 200


def test_a_session_cookie_does_not_stand_in_for_the_mcp_bearer(secured_engine):
    auth = httpx.post(secured_engine["base"] + "/api/auth", headers={"host": f"127.0.0.1:{secured_engine['port']}", "authorization": "Bearer " + secured_engine["token"]}, timeout=10, trust_env=False)
    assert auth.status_code == 200
    cookie = auth.headers["set-cookie"].split(";")[0]
    assert post_mcp(secured_engine, bearer(secured_engine, cookie=cookie)).status_code == 401


def test_protected_api_routes_need_the_token_too(secured_engine):
    host = {"host": f"127.0.0.1:{secured_engine['port']}"}
    for path in ("/api/state", "/api/projects", "/api/project-file", "/api/audit"):
        assert httpx.get(secured_engine["base"] + path, headers=host, timeout=10, trust_env=False).status_code == 401, path
        ok = httpx.get(secured_engine["base"] + path, headers={**host, "authorization": "Bearer " + secured_engine["token"]}, timeout=10, trust_env=False)
        assert ok.status_code == 200, path
    assert httpx.get(secured_engine["base"] + "/api/health", headers=host, timeout=10, trust_env=False).status_code == 200


def test_a_protected_tool_call_without_the_token_does_nothing(secured_engine):
    body = {"commands": [{"command": "token.set", "params": {"name": "nope", "value": "#fff"}}]}
    response = post_mcp(secured_engine, bearer(secured_engine), "tools/call", {"name": "apply_commands", "arguments": body})
    assert response.status_code == 401
    state = httpx.get(secured_engine["base"] + "/api/state", headers={"host": f"127.0.0.1:{secured_engine['port']}", "authorization": "Bearer " + secured_engine["token"]}, timeout=10, trust_env=False).json()
    assert "nope" not in state["site"]["tokens"]


def test_the_stdio_relay_reaches_the_engine_and_lists_the_same_tools(secured_engine):
    from app.mcp_server import TOOLS

    env = {**secured_engine["env"], "FORMWEB_PORT": str(secured_engine["port"])}
    proc = subprocess.Popen(STDIO_CMD, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)

    def send(message):
        proc.stdin.write(json.dumps(message) + "\n")
        proc.stdin.flush()

    def reply(wanted):
        while True:
            message = json.loads(proc.stdout.readline())
            if message.get("id") == wanted:
                return message

    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": INIT})
        assert reply(1)["result"]["serverInfo"]["name"] == "FormWeb"
        send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        send({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        assert len(reply(2)["result"]["tools"]) == len(TOOLS)
    finally:
        proc.kill()


def test_the_stdio_relay_without_the_token_cannot_list_tools(secured_engine):
    env = {k: v for k, v in secured_engine["env"].items() if k != "FORMWEB_AUTH_TOKEN"}
    env["FORMWEB_PORT"] = str(secured_engine["port"])
    proc = subprocess.run(STDIO_CMD, env=env, input="", capture_output=True, text=True, timeout=60)
    assert proc.returncode != 0
