import copy
import json

import pytest

from site_zips import zip_of

HOSTILE_TAGS = ["script", "iframe", "object", "embed", "meta", "base", "link", "frame", "frameset", "animate", "set", "foreignObject"]
URL_ATTRS = ("href", "src", "action", "formaction", "xlink:href", "poster", "data")
BAD_URLS = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "data:text/html,<script>alert(1)</script>", "DATA:text/html;base64,PHNjcmlwdD4="]
HOSTILE_ATTRS = [
    ("p", {"onclick": "alert(1)"}),
    ("p", {"ONCLICK": "alert(1)"}),
    ("img", {"src": "https://example.org/a.png", "alt": "", "onerror": "alert(1)"}),
    ("div", {"onmouseover": "alert(1)"}),
    ("section", {"onload": "alert(1)"}),
    ("div", {"style": "background:url(javascript:alert(1))"}),
    ("p", {"style": "color:red"}),
    ("div", {"srcdoc": "<script>alert(1)</script>"}),
    *[("a", {"href": url}) for url in BAD_URLS],
    *[("img", {"src": url, "alt": ""}) for url in BAD_URLS],
    *[("form", {"action": url}) for url in BAD_URLS],
]
HOSTILE_DOCUMENT = (
    '<html><head><meta http-equiv="refresh" content="0;url=https://evil.example.org">'
    '<meta http-equiv="Content-Security-Policy" content="script-src *"><base href="https://evil.example.org/">'
    '<link rel="stylesheet" href="https://evil.example.org/x.css"><script>window.top.location = "https://evil.example.org"</script></head>'
    '<body><p onclick="alert(1)" style="color:red">p</p><a href="javascript:alert(1)">a</a><form action="javascript:alert(1)"><button formaction="data:text/html,x">b</button></form>'
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><object data="x.swf"></object><embed src="x.swf">'
    '<svg><script>alert(1)</script><a href="#"><animate attributeName="href" to="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(1)"/></a></svg>'
    '<img src="x.png" onerror="alert(1)"></body></html>'
)
MCP_HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def compact(value):
    return "".join(ch for ch in value if ch > " ").lower()


def hostile_parts(site):
    found = []
    for nid, node in site["nodes"].items():
        if node["tag"].lower() in {t.lower() for t in HOSTILE_TAGS}:
            found.append(f"{nid}: <{node['tag']}>")
        for name, value in node.get("attrs", {}).items():
            low = name.lower()
            if low.startswith("on") or low in ("style", "srcdoc"):
                found.append(f"{nid}: {name}")
            if low in URL_ATTRS and isinstance(value, str) and compact(value).startswith(("javascript:", "data:text/html", "vbscript:")):
                found.append(f"{nid}: {name}={value!r}")
    return found


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    root = r.json()["site"]["pages"][0]["root"]
    added = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": root, "node": {"id": "plain", "tag": "p", "text": "plain"}}}]})
    assert added.status_code == 200, added.text
    return root


def site_of(client):
    return client.get("/api/state").json()["site"]


@pytest.mark.parametrize("tag", HOSTILE_TAGS)
def test_a_batch_that_adds_a_hostile_element_is_refused_and_adds_no_node(client, blank, tag):
    before = client.get("/api/state").json()
    r = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": blank, "node": {"id": "fine", "tag": "p", "text": "ok"}}}, {"command": "node.add", "params": {"parent": blank, "node": {"tag": tag}}}]})
    assert 400 <= r.status_code < 500
    assert isinstance(r.json()["detail"], str) and r.json()["detail"]
    after = client.get("/api/state").json()
    assert after["site"] == before["site"] and after["revision"] == before["revision"]
    assert hostile_parts(after["site"]) == []


@pytest.mark.parametrize("tag", ["script", "animate", "set", "foreignObject"])
def test_script_and_href_animation_cannot_be_added_inside_an_svg(client, blank, tag):
    r = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": blank, "node": {"id": "pic", "tag": "svg", "attrs": {"viewBox": "0 0 10 10"}}}}]})
    assert r.status_code == 200, r.text
    before = site_of(client)
    r = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": "pic", "node": {"tag": tag, "attrs": {"attributeName": "href", "to": "javascript:alert(1)"}}}}]})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


@pytest.mark.parametrize("tag,attrs", HOSTILE_ATTRS, ids=[f"{t}-{next(iter(a))}-{i}" for i, (t, a) in enumerate(HOSTILE_ATTRS)])
def test_a_batch_that_adds_an_element_with_a_hostile_attribute_is_refused(client, blank, tag, attrs):
    before = site_of(client)
    r = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": blank, "node": {"tag": tag, "attrs": attrs}}}]})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before
    assert hostile_parts(site_of(client)) == []


@pytest.mark.parametrize("tag,attrs", HOSTILE_ATTRS, ids=[f"{t}-{next(iter(a))}-{i}" for i, (t, a) in enumerate(HOSTILE_ATTRS)])
def test_a_batch_that_updates_an_element_with_a_hostile_attribute_is_refused(client, blank, tag, attrs):
    safe = {k: v for k, v in attrs.items() if k in ("alt",)}
    if tag == "img":
        safe["src"] = "https://example.org/fine.png"
    made = client.post("/api/batch", json={"commands": [{"command": "node.add", "params": {"parent": blank, "node": {"id": "target", "tag": tag, "attrs": safe}}}]})
    assert made.status_code == 200, made.text
    before = site_of(client)
    r = client.post("/api/batch", json={"commands": [{"command": "node.update", "params": {"id": "target", "patch": {"attrs": attrs}}}]})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before
    assert hostile_parts(site_of(client)) == []


@pytest.mark.parametrize("tag", ["script", "iframe", "meta", "base"])
def test_an_update_cannot_turn_an_element_into_a_hostile_one(client, blank, tag):
    before = site_of(client)
    r = client.post("/api/batch", json={"commands": [{"command": "node.update", "params": {"id": "plain", "patch": {"tag": tag}}}]})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before
    assert site_of(client)["nodes"]["plain"]["tag"] == "p"


def test_import_html_with_hostile_markup_makes_no_hostile_node(client, blank):
    client.post("/api/library/import-html", json={"html": HOSTILE_DOCUMENT})
    assert hostile_parts(site_of(client)) == []


def test_a_site_zip_with_hostile_pages_makes_no_hostile_node(client, blank):
    data = zip_of({"index.html": HOSTILE_DOCUMENT, "about.html": HOSTILE_DOCUMENT.replace("<p ", "<p id=\"x\" ")})
    review = client.post("/api/library/import-site/review", content=data)
    if review.status_code == 200:
        client.post(f"/api/library/import-site?mode=new&revision={review.json()['revision']}", content=data)
    assert hostile_parts(site_of(client)) == []


def fragment_with(client, tag, attrs):
    fragment = client.post("/api/fragment", json={"node": "plain"}).json()
    hostile = copy.deepcopy(fragment)
    node = hostile["nodes"][hostile["root"]]
    node["tag"] = tag
    node["attrs"] = attrs
    node["text"] = "" if tag in ("img", "embed", "meta", "base", "link") else node["text"]
    return fragment, hostile


@pytest.mark.parametrize("tag,attrs", [(t, {}) for t in HOSTILE_TAGS] + HOSTILE_ATTRS, ids=[f"tag-{t}" for t in HOSTILE_TAGS] + [f"{t}-{next(iter(a))}-{i}" for i, (t, a) in enumerate(HOSTILE_ATTRS)])
def test_a_paste_of_a_fragment_with_a_hostile_element_or_attribute_pastes_nothing(client, blank, tag, attrs):
    good, hostile = fragment_with(client, tag, attrs)
    before = site_of(client)
    r = client.post("/api/paste", json={"fragments": [good, hostile], "parent": blank})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before
    assert hostile_parts(site_of(client)) == []


def test_a_paste_of_a_fragment_with_a_hostile_child_pastes_nothing(client, blank):
    fragment = client.post("/api/fragment", json={"node": "plain"}).json()
    root = fragment["root"]
    fragment["nodes"][root]["tag"] = "div"
    fragment["nodes"][root]["text"] = ""
    fragment["nodes"][root]["children"] = ["inner"]
    fragment["nodes"]["inner"] = {"attrs": {"src": "javascript:alert(1)"}, "breakpoints": {}, "children": [], "id": "inner", "name": "", "styles": {}, "tag": "script", "text": ""}
    before = site_of(client)
    r = client.post("/api/paste", json={"fragment": fragment, "parent": blank})
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


@pytest.mark.parametrize("tag,attrs", [("script", {}), ("iframe", {"srcdoc": "<script>alert(1)</script>"}), ("a", {"href": "javascript:alert(1)"}), ("p", {"onclick": "alert(1)"})], ids=["script", "iframe-srcdoc", "javascript-link", "onclick"])
def test_a_saved_project_from_someone_else_with_a_hostile_node_is_refused_and_the_open_site_stays(client, blank, tag, attrs):
    envelope = client.get("/api/project-file").json()
    envelope.pop("checkpoint", None)
    envelope["site"]["nodes"]["plain"]["tag"] = tag
    envelope["site"]["nodes"]["plain"]["attrs"] = attrs
    before = site_of(client)
    r = client.post("/api/load", content=json.dumps(envelope))
    assert 400 <= r.status_code < 500
    assert site_of(client) == before


def test_an_agent_command_adding_a_script_is_a_tool_error_and_changes_nothing(client, blank):
    assert client.post("/api/agents", json={"enabled": True}).status_code == 200
    try:
        before = site_of(client)
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "apply_commands", "arguments": {"commands": [{"command": "node.add", "params": {"parent": blank, "node": {"tag": "p", "attrs": {"onclick": "alert(1)"}}}}]}}}
        r = client.post("/mcp", json=body, headers=MCP_HEADERS)
        assert r.status_code == 200, r.text
        assert r.json()["result"].get("isError") is True
        assert site_of(client) == before
    finally:
        client.post("/api/agents", json={"enabled": False})


STATE_CHANGING = [
    ("/api/batch", {"commands": [{"command": "node.add", "params": {"parent": "root", "node": {"id": "sneaked", "tag": "p", "text": "x"}}}]}),
    ("/api/command", {"command": "node.add", "params": {"parent": "root", "node": {"id": "sneaked", "tag": "p", "text": "x"}}}),
    ("/api/library/import-html", {"html": "<p>sneaked</p>"}),
]


@pytest.mark.parametrize("path,body", STATE_CHANGING, ids=[p for p, _ in STATE_CHANGING])
def test_a_state_changing_request_without_the_window_key_is_refused_and_changes_nothing(client, blank, path, body):
    before = site_of(client)
    r = client.post(path, json=body, headers={"x-formweb-window-key": ""})
    assert r.status_code == 403
    assert r.json() == {"detail": "Only the FormWeb window can do this."}
    assert site_of(client) == before


@pytest.mark.parametrize("origin", ["http://evil.example", "null", "https://127.0.0.1.evil.example"])
@pytest.mark.parametrize("path,body", STATE_CHANGING, ids=[p for p, _ in STATE_CHANGING])
def test_a_state_changing_request_from_a_foreign_origin_is_refused_and_changes_nothing(client, blank, path, body, origin):
    before = site_of(client)
    r = client.post(path, json=body, headers={"origin": origin})
    assert r.status_code == 403
    assert r.json()["detail"]
    assert site_of(client) == before


def test_a_site_zip_import_without_the_window_key_is_refused_and_changes_nothing(client, blank):
    data = zip_of({"index.html": "<html><body><p>sneaked</p></body></html>"})
    revision = client.post("/api/library/import-site/review", content=data).json()["revision"]
    before = site_of(client)
    r = client.post(f"/api/library/import-site?mode=new&revision={revision}", content=data, headers={"x-formweb-window-key": ""})
    assert r.status_code == 403
    assert site_of(client) == before
    r = client.post(f"/api/library/import-site?mode=new&revision={revision}", content=data, headers={"origin": "http://evil.example"})
    assert r.status_code == 403
    assert site_of(client) == before


def test_a_paste_from_a_foreign_origin_is_refused_and_pastes_nothing(client, blank):
    fragment = client.post("/api/fragment", json={"node": "plain"}).json()
    before = site_of(client)
    r = client.post("/api/paste", json={"fragment": fragment, "parent": blank}, headers={"origin": "http://evil.example"})
    assert r.status_code == 403
    assert site_of(client) == before
