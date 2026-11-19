import json
import subprocess
import sys

import pytest

from conftest import MCP_PATH, REPO

SYNC = [sys.executable, "-I", str(REPO / "setup" / "agents.py"), "sync", "--check"]
ACCEPT = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


@pytest.fixture()
def agents_on(client):
    assert client.post("/api/agents", json={"enabled": True}).status_code == 200
    yield
    client.post("/api/agents", json={"enabled": False})


def test_the_committed_agent_manifest_is_current():
    result = subprocess.run(SYNC, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "agents/manifest.json in step" in result.stdout


def test_the_manifest_lists_what_tools_list_returns(client, agents_on):
    manifest = json.loads((REPO / "agents" / "manifest.json").read_text(encoding="utf-8"))["mcp"]
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    listed = client.post(MCP_PATH, json=body, headers=ACCEPT).json()["result"]["tools"]
    assert manifest["tools"] == [tool["name"] for tool in listed]
    assert manifest["read_only"] == [tool["name"] for tool in listed if tool["annotations"].get("readOnlyHint")]
    assert set(manifest["approval_gated"]) <= set(manifest["tools"])
