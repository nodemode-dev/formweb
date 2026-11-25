import base64
import json

import pytest

from site_zips import page, zip_of

MCP_HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}
DATA = base64.b64encode(zip_of({"index.html": page("Tool", "<h1>From the tool</h1>"), "about.html": page("About", "<p>about</p>")})).decode()


@pytest.fixture()
def agents_on(client):
    assert client.post("/api/new", json={"name": "Blank", "blank": True}).status_code == 200
    assert client.post("/api/agents", json={"enabled": True}).status_code == 200
    yield
    client.post("/api/agents", json={"enabled": False})


def site_of(client):
    return client.get("/api/state").json()["site"]


def call(client, arguments):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "library_import_site", "arguments": arguments}}
    r = client.post("/mcp", json=body, headers=MCP_HEADERS)
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    text = result["content"][0]["text"] if result.get("content") else ""
    return result, text


def reviewed(client):
    result, text = call(client, {"data": DATA, "action": "review"})
    assert not result.get("isError"), text
    return (result.get("structuredContent") or json.loads(text))["revision"]


def made_stale(client):
    stale = reviewed(client)
    assert client.post("/api/command", json={"command": "page.add", "params": {"name": "Meanwhile", "slug": "/meanwhile"}}).status_code == 200
    return stale, client.get("/api/state").json()["revision"]


def imported_pages(client):
    return sorted(p["seo"].get("title", "") for p in site_of(client)["pages"] if p["seo"].get("title") in ("Tool", "About"))


@pytest.mark.parametrize("name", ["expected_revision", "revision"])
def test_the_import_tool_accepts_the_reviewed_revision_under_either_name(client, agents_on, name):
    revision = reviewed(client)
    result, text = call(client, {"data": DATA, "action": "import", "mode": "new", name: revision})
    assert not result.get("isError"), text
    assert imported_pages(client) == ["About", "Tool"]


@pytest.mark.parametrize("name", ["expected_revision", "revision"])
def test_a_stale_revision_under_either_name_is_refused_and_imports_nothing(client, agents_on, name):
    stale, _ = made_stale(client)
    before = site_of(client)
    result, text = call(client, {"data": DATA, "action": "import", "mode": "new", name: stale})
    assert result.get("isError") is True
    assert text.strip()
    assert site_of(client) == before


def test_expected_revision_wins_when_it_is_current_and_revision_is_stale(client, agents_on):
    stale, current = made_stale(client)
    result, text = call(client, {"data": DATA, "action": "import", "mode": "new", "expected_revision": current, "revision": stale})
    assert not result.get("isError"), text
    assert imported_pages(client) == ["About", "Tool"]


def test_expected_revision_wins_when_it_is_stale_and_revision_is_current(client, agents_on):
    stale, current = made_stale(client)
    before = site_of(client)
    result, text = call(client, {"data": DATA, "action": "import", "mode": "new", "expected_revision": stale, "revision": current})
    assert result.get("isError") is True
    assert site_of(client) == before
