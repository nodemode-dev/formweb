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


def call(client, name, arguments):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}}
    r = client.post("/mcp", json=body, headers=MCP_HEADERS)
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    assert not result.get("isError"), result
    return result.get("structuredContent") or json.loads(result["content"][0]["text"])


def code_sections(client):
    return (client.get("/api/state").json()["site"].get("extensions", {}).get("code") or {}).get("sections") or {}


def test_an_import_asked_to_bring_pages_in_as_elements_with_no_window_open_keeps_them_as_code_and_says_why(client, agents_on):
    revision = call(client, "library_import_site", {"data": DATA, "action": "review"})["revision"]
    answer = call(client, "library_import_site", {"data": DATA, "action": "import", "expected_revision": revision, "bring_in": "elements"})
    assert len(code_sections(client)) == 2
    assert answer["conversion"].startswith("The pages stayed code sections:")
    assert "editor window" in answer["conversion"]


def test_an_html_import_asked_to_bring_it_in_as_elements_with_no_window_open_stays_one_code_section_and_says_why(client, agents_on):
    answer = call(client, "library_import_html", {"html": page("Single", "<h2>One page</h2>"), "bring_in": "elements"})
    assert list(code_sections(client)) == [answer["root"]]
    assert answer["conversion"].startswith("The pages stayed code sections:")


def test_an_import_left_at_the_default_bring_in_answers_without_a_conversion_note(client, agents_on):
    answer = call(client, "library_import_html", {"html": page("Single", "<h2>One page</h2>")})
    assert "conversion" not in answer
    assert list(code_sections(client)) == [answer["root"]]
