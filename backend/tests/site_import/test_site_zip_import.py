import base64
import hashlib
import json
import re
import threading
import time

import pytest

from site_zips import five_page_site, png_bytes, zip_of, SVG

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
FILE_ROUTES = {"about.html": "/about", "contact/index.html": "/contact", "blog/index.html": "/blog", "blog/first-post.html": "/blog/first-post"}


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def site_of(client):
    return client.get("/api/state").json()["site"]


def section_of(site, page):
    sections = site["extensions"]["code"]["sections"]
    held = [child for child in site["nodes"][page["root"]]["children"] if child in sections]
    assert len(held) == 1
    return sections[held[0]]


def by_slug(site):
    return {p["slug"]: p for p in site["pages"]}


def imported(client, data, mode="new"):
    review = client.post(REVIEW, content=data)
    assert review.status_code == 200, review.text
    r = client.post(f"{IMPORT}?mode={mode}&revision={review.json()['revision']}", content=data)
    assert r.status_code == 200, r.text
    return review.json(), r.json()


def test_the_review_lists_pages_addresses_assets_and_skipped_files_and_changes_nothing(client, blank):
    before = site_of(client)
    review = client.post(REVIEW, content=zip_of(five_page_site())).json()
    routes = {p["file"]: p["newRoute"] for p in review["pages"]}
    assert len(routes) == 5
    for file, route in FILE_ROUTES.items():
        assert routes[file] == route
    assert routes["index.html"] != "/"
    assert review["assets"]["count"] == 3
    assert review["assets"]["bytes"] == len(png_bytes()) + len(SVG) + 72
    assert [s["file"] for s in review["skipped"]] == ["notes.txt"]
    assert review["skipped"][0]["reason"].endswith(".")
    assert site_of(client) == before


def test_importing_a_five_page_site_adds_every_page_with_its_address_title_and_description(client, blank):
    _, result = imported(client, zip_of(five_page_site()))
    site = site_of(client)
    pages = by_slug(site)
    assert len(site["pages"]) == 6
    assert len(result["pages"]) == 5
    expected = {"/about": ("About us", "Who we are"), "/contact": ("Contact", "Write to us"), "/blog": ("Journal", "News"), "/blog/first-post": ("First post", "The first post")}
    for slug, (title, description) in expected.items():
        assert pages[slug]["seo"]["title"] == title
        assert pages[slug]["seo"]["description"] == description
    home = next(p for p in site["pages"] if p["seo"]["title"] == "Mill Lane")
    assert home["seo"]["description"] == "The home page"
    assert "<h1>Home first</h1>" in section_of(site, home)["html"]
    assert "dataset.ready" in section_of(site, home)["js"]
    assert "#123456" in section_of(site, pages["/about"])["css"]


def test_links_between_imported_pages_follow_their_new_addresses_and_outside_links_stay(client, blank):
    review, _ = imported(client, zip_of(five_page_site()))
    route = {p["file"]: p["newRoute"] for p in review["pages"]}
    site = site_of(client)
    slugs = {p["slug"] for p in site["pages"]}
    home = section_of(site, by_slug(site)[route["index.html"]])["html"]
    hrefs = re.findall(r'href="([^"]+)"', home)
    assert hrefs == [route["about.html"], route["contact/index.html"], route["blog/index.html"], route["blog/first-post.html"] + "#comments", "https://example.org/elsewhere?q=1", "mailto:hi@example.org"]
    post = section_of(site, by_slug(site)[route["blog/first-post.html"]])["html"]
    assert re.findall(r'href="([^"]+)"', post) == [route["index.html"], route["blog/index.html"]]
    for html in (section_of(site, p)["html"] for p in site["pages"][1:]):
        for href in re.findall(r'href="(/[^"#]*)', html):
            assert href in slugs


def test_imported_pictures_and_fonts_are_stored_under_their_digest_and_served(client, blank):
    files = five_page_site()
    imported(client, zip_of(files))
    site = site_of(client)
    text = json.dumps(site["extensions"]["code"]["sections"])
    for name in ("mill/img/logo.png", "mill/img/photo.svg", "mill/fonts/mill.woff2"):
        data = files[name].encode() if isinstance(files[name], str) else files[name]
        digest = hashlib.sha256(data).hexdigest()
        url = f"/api/assets/{digest}.{name.rsplit('.', 1)[1]}"
        assert url in text
        served = client.get(url)
        assert served.status_code == 200
        assert served.content == data
    assert "img/logo.png" not in text and "fonts/mill.woff2" not in text


def test_a_site_import_is_one_undo_step(client, blank):
    before = site_of(client)
    imported(client, zip_of(five_page_site()))
    assert site_of(client) != before
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert site_of(client) == before


def test_replace_mode_swaps_the_content_of_matching_routes_without_adding_pages(client, blank):
    imported(client, zip_of(five_page_site("first")))
    count = len(site_of(client)["pages"])
    review, result = imported(client, zip_of(five_page_site("second")), mode="replace")
    assert review["canReplace"] is True
    site = site_of(client)
    assert len(site["pages"]) == count
    pages = by_slug(site)
    for slug, heading in (("/about", "About"), ("/contact", "Contact"), ("/blog", "Journal"), ("/blog/first-post", "First post")):
        assert [p["slug"] for p in site["pages"]].count(slug) == 1
        html = section_of(site, pages[slug])["html"]
        assert f"{heading} second" in html and f"{heading} first" not in html


def test_an_import_after_the_site_changed_since_the_review_is_refused_and_changes_nothing(client, blank):
    data = zip_of(five_page_site())
    revision = client.post(REVIEW, content=data).json()["revision"]
    client.post("/api/command", json={"command": "page.add", "params": {"name": "Meanwhile", "slug": "/meanwhile"}})
    before = site_of(client)
    r = client.post(f"{IMPORT}?mode=new&revision={revision}", content=data)
    assert r.status_code == 409
    assert "review" in r.json()["detail"].lower()
    assert site_of(client) == before


def test_a_page_that_is_not_a_static_site_file_is_skipped_with_a_reason_and_the_rest_imports(client, blank):
    data = zip_of({"index.html": "<html><body><p>hi</p></body></html>", "icon.ico": b"\x00\x00\x01\x00", "font.ttf": b"\x00\x01\x00\x00", "run.exe": b"MZ"})
    review, result = imported(client, data)
    reasons = {s["file"]: s["reason"] for s in result["skipped"]}
    assert set(reasons) == {"icon.ico", "font.ttf", "run.exe"}
    assert "WOFF2" in reasons["font.ttf"]
    assert all(reason.endswith(".") for reason in reasons.values())
    assert len(result["pages"]) == 1


MCP_HEADERS = {"accept": "application/json, text/event-stream", "content-type": "application/json"}


def mcp(client, arguments):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "library_import_site", "arguments": arguments}}
    r = client.post("/mcp", json=body, headers=MCP_HEADERS)
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    return result, result.get("structuredContent") or json.loads(result["content"][0]["text"])


@pytest.fixture()
def agents_asking(client):
    assert client.post("/api/agents", json={"enabled": True}).status_code == 200
    previous = client.post("/api/approvals/settings", json={}).json()["agentDestructive"]
    client.post("/api/approvals/settings", json={"agentDestructive": True})
    yield
    client.post("/api/approvals/settings", json={"agentDestructive": previous})
    client.post("/api/agents", json={"enabled": False})


def pending_imports(client):
    return [a for a in client.get("/api/approvals?status=pending").json()["approvals"] if a["subject"].get("tool") == "library_import_site"]


def test_the_agent_tool_reviews_without_change_and_imports_new_pages_without_asking(client, blank, agents_asking):
    data = base64.b64encode(zip_of(five_page_site())).decode()
    before = site_of(client)
    result, review = mcp(client, {"data": data, "action": "review"})
    assert not result.get("isError")
    assert {p["newRoute"] for p in review["pages"]} >= set(FILE_ROUTES.values())
    assert site_of(client) == before
    result, done = mcp(client, {"data": data, "action": "import", "mode": "new", "revision": review["revision"]})
    assert not result.get("isError"), done
    assert len(done["pages"]) == 5
    assert len(site_of(client)["pages"]) == 6
    assert pending_imports(client) == []


def test_the_agent_tool_asks_before_replacing_and_the_approval_shows_size_action_and_mode(client, blank, agents_asking):
    raw = zip_of(five_page_site("second"))
    imported(client, zip_of(five_page_site("first")))
    revision = client.get("/api/state").json()["revision"]
    box = {}
    worker = threading.Thread(target=lambda: box.update(answer=mcp(client, {"data": base64.b64encode(raw).decode(), "action": "import", "mode": "replace", "revision": revision})), daemon=True)
    worker.start()
    waiting = []
    for _ in range(400):
        waiting = pending_imports(client)
        if waiting:
            break
        time.sleep(0.05)
    assert len(waiting) == 1
    shown = json.loads(waiting[0]["subject"]["arguments"])
    assert shown["action"] == "import" and shown["mode"] == "replace"
    size = int(re.search(r"([0-9][0-9,]*) bytes", shown["data"]).group(1).replace(",", ""))
    assert abs(size - len(raw)) <= 2
    assert "UEsDB" not in shown["data"]
    assert "About first" in section_of(site_of(client), by_slug(site_of(client))["/about"])["html"]
    assert client.post(f"/api/approvals/{waiting[0]['id']}", json={"decision": "approve"}).status_code == 200
    worker.join(60)
    assert not worker.is_alive()
    result, _ = box["answer"]
    assert not result.get("isError")
    assert "About second" in section_of(site_of(client), by_slug(site_of(client))["/about"])["html"]
