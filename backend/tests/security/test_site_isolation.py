import os
import struct
import zlib
from pathlib import Path
from urllib.parse import urlsplit

import pytest

from conftest import REPO

OPAQUE = {"origin": "null"}
FOREIGN = {"origin": "https://example.org"}
DEMO = REPO / "frontend" / "public" / "demos" / "harbour-ferries" / "site.fweb"
GATED = "/fares"
PASSWORD = "harbour-gate-7"
TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
    ".xml": "application/xml",
    ".txt": "text/plain",
    ".webp": "image/webp",
}


def sandbox_flags(policy):
    for directive in policy.split(";"):
        words = directive.split()
        if words and words[0].lower() == "sandbox":
            return {word.lower() for word in words[1:]}
    return None


def nosniff(response):
    return response.headers.get("x-content-type-options", "").split(",")[0].strip().lower() == "nosniff"


def assert_isolated(response, what):
    policy = response.headers.get("content-security-policy", "")
    flags = sandbox_flags(policy)
    assert flags is not None, f"{what} has no sandbox policy: {policy!r}"
    assert "allow-same-origin" not in flags, f"{what} keeps the editor origin: {policy!r}"
    assert nosniff(response), what


def png(width=2, height=2):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + b"\xff\x00\x00" * width for _ in range(height))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def release(client):
    r = client.post("/api/load", content=DEMO.read_bytes(), headers={"content-type": "application/json"})
    assert r.status_code == 200, r.text
    site = client.get("/api/state").json()["site"]
    home = next(page for page in site["pages"] if page["slug"] == "/")
    for parent, node in (
        (home["root"], {"id": "iso-form", "tag": "form", "name": "Contact form", "attrs": {}, "styles": {}, "children": []}),
        ("iso-form", {"id": "iso-name", "tag": "input", "name": "Name", "attrs": {"name": "name", "type": "text"}, "styles": {}, "children": []}),
        ("iso-form", {"id": "iso-send", "tag": "button", "name": "Send", "attrs": {"type": "submit"}, "styles": {}, "children": [], "text": "Send"}),
    ):
        r = client.post("/api/command", json={"command": "node.add", "params": {"parent": parent, "node": node}})
        assert r.status_code == 200, r.text
    r = client.post("/api/page-passwords", json={"route": GATED, "password": PASSWORD})
    assert r.status_code == 200, r.text
    r = client.post("/api/publish", json={"slug": "isolated"})
    assert r.status_code == 200, r.text
    published = r.json()
    r = client.post("/api/releases/promote", json={"slug": "isolated", "version": published["version"]})
    assert r.status_code == 200, r.text
    prefix = urlsplit(published["url"]).path
    if not prefix.startswith("/published/"):
        prefix = f"/published/isolated/{published['version']}/"
    folder = Path(os.environ["FORMWEB_DATA_DIR"]) / "publications" / "isolated" / published["version"]
    files = sorted(path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file())
    return {"prefix": prefix, "active": "/sites/isolated/", "files": files, "site": site["id"]}


def test_a_published_home_page_runs_in_a_sandbox_without_the_editor_origin(client, release):
    r = client.get(release["prefix"])
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert_isolated(r, "the published home page")
    flags = sandbox_flags(r.headers["content-security-policy"])
    assert {"allow-scripts", "allow-forms", "allow-popups"} <= flags


def test_the_active_site_address_runs_in_the_same_sandbox(client, release):
    r = client.get(release["active"])
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert_isolated(r, "the active site home page")


def test_every_file_of_a_publication_is_isolated_and_has_its_own_content_type(client, release):
    assert any(name.endswith(".woff2") for name in release["files"])
    assert any(name.endswith(".js") for name in release["files"])
    checked = 0
    for name in release["files"]:
        if name.endswith(".html") and name.split("/")[0] in ("fares",):
            continue
        r = client.get(release["prefix"] + name)
        assert r.status_code == 200, name
        assert_isolated(r, name)
        expected = TYPES.get(Path(name).suffix)
        if expected:
            assert r.headers["content-type"].split(";")[0] == expected, name
        checked += 1
    assert checked > 10


def test_a_missing_path_of_a_publication_answers_inside_the_sandbox(client, release):
    r = client.get(release["prefix"] + "no-such-page/")
    assert r.status_code == 404
    assert_isolated(r, "a missing publication path")


def test_the_password_form_can_run_no_script_and_posts_with_its_own_origin(client, release):
    r = client.get(release["prefix"] + GATED.strip("/") + "/")
    assert r.status_code == 401
    assert 'name="password"' in r.text
    policy = r.headers["content-security-policy"]
    directives = {d.split()[0]: d.split()[1:] for d in policy.split(";") if d.strip()}
    assert directives.get("default-src") == ["'none'"]
    assert "script-src" not in directives
    assert r.headers["referrer-policy"] == "same-origin"


def test_the_right_password_opens_the_gated_page_inside_the_sandbox(client, release):
    own = {"origin": client.base_url.scheme + "://" + client.base_url.netloc.decode()}
    r = client.post(release["prefix"] + "__formweb_password", content=f"route={GATED}&password={PASSWORD}", headers={**own, "content-type": "application/x-www-form-urlencoded"}, follow_redirects=False)
    assert r.status_code == 303
    cookie = r.headers["set-cookie"].split(";", 1)[0]
    r = client.get(release["prefix"] + GATED.strip("/") + "/", headers={"cookie": cookie})
    assert r.status_code == 200
    assert "Password required" not in r.text
    assert_isolated(r, "the unlocked gated page")


def test_an_opaque_origin_cannot_try_a_page_password(client, release):
    r = client.post(release["prefix"] + "__formweb_password", content=f"route={GATED}&password={PASSWORD}", headers={**OPAQUE, "content-type": "application/x-www-form-urlencoded"}, follow_redirects=False)
    assert r.status_code == 403
    assert "set-cookie" not in r.headers


def test_a_sandboxed_page_can_load_its_own_font_without_credentials(client, release):
    font = next(name for name in release["files"] if name.endswith(".woff2"))
    r = client.get(release["prefix"] + font, headers=OPAQUE)
    assert r.status_code == 200
    assert r.content[:4] == b"wOF2"
    assert r.headers["access-control-allow-origin"] == "null"
    assert "access-control-allow-credentials" not in r.headers


def test_a_sandboxed_page_can_post_its_form_and_read_the_reply(client, release):
    r = client.post(f"{release['prefix']}api/forms/{release['site']}/iso-form", content="name=Grace", headers={**OPAQUE, "content-type": "application/x-www-form-urlencoded", "accept": "application/json"})
    assert r.status_code == 200, r.text
    assert r.headers["access-control-allow-origin"] == "null"
    inbox = client.get("/api/forms", params={"siteId": release["site"]}).json()["submissions"]
    assert any(item["values"] == {"name": "Grace"} and item["formId"] == "iso-form" for item in inbox)


WRITES = [
    ("/api/batch", {"commands": [{"command": "site.update", "params": {"patch": {"name": "Changed from outside"}}}]}),
    ("/api/command", {"command": "site.update", "params": {"patch": {"name": "Changed from outside"}}}),
    ("/api/new", {"name": "Changed from outside"}),
    ("/api/publish", {"slug": "outside"}),
    ("/api/page-passwords", {"route": "/", "password": None}),
    ("/api/projects/save", {"name": "Changed from outside"}),
    ("/api/window/key", {}),
    ("/api/window/ticket", {}),
    ("/api/agents", {"enabled": True}),
    ("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
]


@pytest.mark.parametrize("origin", [OPAQUE, FOREIGN], ids=["opaque", "foreign"])
def test_state_changing_routes_refuse_an_opaque_or_foreign_origin_even_with_the_window_key(client, release, origin):
    before = client.get("/api/state").json()
    for path, body in WRITES:
        r = client.post(path, json=body, headers=origin)
        assert r.status_code == 403, path
        assert "access-control-allow-origin" not in r.headers, path
    after = client.get("/api/state").json()
    assert after["revision"] == before["revision"]
    assert after["site"]["name"] == before["site"]["name"]
    assert "outside" not in [row.get("slug") for row in client.get("/api/publications").json()["publications"]]


@pytest.mark.parametrize("origin", [OPAQUE, FOREIGN], ids=["opaque", "foreign"])
def test_an_opaque_or_foreign_origin_cannot_read_the_site_or_the_window_key(client, origin):
    for path in ("/api/state", "/api/projects", "/api/forms", "/api/assets"):
        r = client.get(path, headers=origin)
        assert r.status_code == 403, path
        assert "site" not in r.json() and "access-control-allow-origin" not in r.headers, path


def test_a_preflight_from_an_opaque_origin_to_the_engine_is_refused(client):
    r = client.options("/api/batch", headers={**OPAQUE, "access-control-request-method": "POST", "access-control-request-headers": "content-type, x-formweb-window-key"})
    assert r.status_code == 403
    assert "access-control-allow-origin" not in r.headers


def test_an_uploaded_picture_and_svg_can_never_run_script_when_opened(client):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c00"/></svg>'
    for body, media in ((png(), "image/png"), (svg, "image/svg+xml")):
        r = client.post("/api/assets", content=body, headers={"content-type": media, "x-filename": "picture" + ("." + media.split("/")[1].split("+")[0])})
        assert r.status_code == 200, r.text
        asset = r.json()["id"]
        r = client.get(f"/api/assets/{asset}")
        assert r.status_code == 200
        assert r.content == body
        assert r.headers["content-type"].split(";")[0] == media
        flags = sandbox_flags(r.headers["content-security-policy"])
        assert flags is not None and "allow-scripts" not in flags and "allow-same-origin" not in flags, media
        assert nosniff(r), media
