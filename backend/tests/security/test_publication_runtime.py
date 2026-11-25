import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import pytest

OPAQUE = {"origin": "null"}
FOREIGN = {"origin": "https://example.org"}
MEMBERS_WORD = "TIDEPOOL-ORCHID"
EMAIL = "grace@example.org"
PASSWORD = "harbour-member-2026"
STOPS = {"title": "Twelve ferry stops", "secret": "kept on the server"}
PRODUCT = {"id": "gid://shopify/Product/1", "title": "Season pass", "variants": [{"id": "gid://shopify/ProductVariant/11", "title": "Adult", "price": {"amount": "120.00", "currencyCode": "EUR"}, "availableForSale": True}]}


class Stops(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(STOPS).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def node(identifier, tag, text="", **attrs):
    return {"id": identifier, "tag": tag, "name": identifier, "attrs": attrs, "styles": {}, "children": [], "text": text}


def add(parent, item):
    return {"command": "node.add", "params": {"parent": parent, "node": item}}


def page_config(html):
    return json.loads(re.search(r'<script type="application/json" id="fw-config">(.*?)</script>', html, re.S).group(1))


@pytest.fixture(scope="module")
def club(client):
    server = ThreadingHTTPServer(("127.0.0.1", 0), Stops)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    saved = {name: os.environ.get(name) for name in ("FORMWEB_FETCH_SOURCES", "FORMWEB_FETCH_HOSTS", "FORMWEB_PROVIDER_ALLOW_LOOPBACK")}
    os.environ["FORMWEB_FETCH_SOURCES"] = json.dumps({"stops": {"url": f"http://127.0.0.1:{server.server_address[1]}/stops", "public": True, "fields": ["title"]}})
    os.environ["FORMWEB_FETCH_HOSTS"] = "127.0.0.1"
    os.environ["FORMWEB_PROVIDER_ALLOW_LOOPBACK"] = "1"
    r = client.post("/api/new", json={"name": "Harbour Club"})
    assert r.status_code == 200, r.text
    site = client.get("/api/state").json()["site"]
    home = site["pages"][0]["root"]
    commands = [
        add(home, node("club-login", "div")),
        add(home, node("club-gate", "div")),
        add(home, node("club-data", "div")),
        add(home, node("club-product", "div")),
        add(home, node("club-link", "a", "Members", href="/members")),
        {"command": "page.add", "params": {"name": "Members", "slug": "/members", "id": "members", "root": "members-root"}},
        add("members-root", node("members-word", "p", f"Only members read the {MEMBERS_WORD} rota.")),
        {"command": "extension.set", "params": {"group": "integrations", "value": {
            "widgets": {"club-login": {"type": "member-login"}, "club-gate": {"type": "member-gate"}, "club-data": {"type": "fetch", "source": "stops", "field": "title"}, "club-product": {"type": "product", "product": PRODUCT["id"]}},
            "gates": [{"route": "/members", "groups": ["member"]}],
        }}},
    ]
    r = client.post("/api/batch", json={"commands": commands})
    assert r.status_code == 200, r.text
    from app.providers.common import store
    store.put("catalogs", site["id"], {"provider": "Shopify", "status": "ready", "products": [PRODUCT]})
    releases = {}
    for slug in ("club", "other"):
        r = client.post("/api/publish", json={"slug": slug})
        assert r.status_code == 200, r.text
        published = r.json()
        prefix = f"/published/{slug}/{published['version']}/"
        home_page = client.get(prefix)
        assert home_page.status_code == 200
        releases[slug] = {"prefix": prefix, "version": published["version"], "config": page_config(home_page.text), "folder": Path(os.environ["FORMWEB_DATA_DIR"]) / "publications" / slug / published["version"]}
    r = client.post("/api/releases/promote", json={"slug": "club", "version": releases["club"]["version"]})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    yield {"site": site["id"], **releases}
    server.shutdown()
    for name, value in saved.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value


def runtime(client, release, path, body=None, token=None, headers=None, query=None):
    token = release["config"]["context"]["runtimeToken"] if token is None else token
    context = {key: value for key, value in release["config"]["context"].items() if key != "runtimeToken"}
    address = f"/api/runtime/~{token}{path}" if token else f"/api/runtime{path}"
    sent = {**OPAQUE, **(headers or {})}
    if body is None:
        return client.get(address, params={**context, **(query or {})}, headers=sent)
    return client.post(address, params={**context, **(query or {})}, json=body, headers={**sent, "content-type": "application/json"})


def signed_in(client, release):
    r = runtime(client, release, "/member/register", {"email": EMAIL, "password": PASSWORD})
    assert r.status_code in (200, 409), r.text
    r = runtime(client, release, "/member/login", {"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r


def test_every_page_of_a_publication_carries_a_runtime_token_of_its_own(club):
    first, second = club["club"]["config"]["context"], club["other"]["config"]["context"]
    assert len(first["runtimeToken"]) >= 32 and len(second["runtimeToken"]) >= 32
    assert first["runtimeToken"] != second["runtimeToken"]
    assert (first["slug"], first["version"]) == ("club", club["club"]["version"])


def test_no_file_an_opaque_origin_may_read_holds_the_runtime_token(client, club):
    release = club["club"]
    token = release["config"]["context"]["runtimeToken"]
    readable = [path.relative_to(release["folder"]).as_posix() for path in release["folder"].rglob("*") if path.is_file()]
    readable = [name for name in readable if name.startswith("assets/") or name in ("search-index.json", "site.webmanifest")]
    assert "assets/runtime.js" in readable
    answered = 0
    for name in readable:
        r = client.get(release["prefix"] + name, headers=OPAQUE)
        assert r.status_code in (200, 401), name
        assert token.encode() not in r.content and token.encode() not in (release["folder"] / name).read_bytes(), name
        answered += r.status_code == 200
    assert answered >= 3


def test_a_sandboxed_publication_signs_a_member_up_and_in_without_cookies(client, club):
    release = club["club"]
    r = runtime(client, release, "/member/register", {"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["registered"] is True
    r = runtime(client, release, "/member/login", {"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.headers["access-control-allow-origin"] == "null"
    assert "access-control-allow-credentials" not in r.headers
    assert "set-cookie" not in r.headers
    visitor = r.json()["visitorToken"]
    r = runtime(client, release, "/member/session", headers={"x-formweb-visitor": visitor})
    assert r.json() == {"authenticated": True, "email": EMAIL, "groups": ["member"]}
    assert runtime(client, release, "/member/session").json()["authenticated"] is False


def test_a_sandboxed_publication_reads_its_data_source_and_its_product_catalog(client, club):
    release = club["club"]
    r = runtime(client, release, "/data/stops")
    assert r.status_code == 200, r.text
    assert r.headers["access-control-allow-origin"] == "null"
    assert "Twelve ferry stops" in r.text and "kept on the server" not in r.text
    r = runtime(client, release, "/commerce/catalog")
    assert r.status_code == 200, r.text
    assert [product["title"] for product in r.json()["products"]] == ["Season pass"]


def test_the_preflight_of_a_runtime_call_needs_the_token_too(client, club):
    release = club["club"]
    ask = {**OPAQUE, "access-control-request-method": "POST", "access-control-request-headers": "content-type, x-formweb-visitor"}
    r = client.options(f"/api/runtime/~{release['config']['context']['runtimeToken']}/member/login", headers=ask)
    assert r.status_code == 204
    assert r.headers["access-control-allow-origin"] == "null"
    r = client.options("/api/runtime/~" + "x" * 43 + "/member/login", headers=ask)
    assert r.status_code == 403
    assert "access-control-allow-origin" not in r.headers


@pytest.mark.parametrize("token", ["", "x" * 43, "not a token"], ids=["none", "made-up", "malformed"])
def test_runtime_routes_refuse_an_opaque_origin_without_a_real_token(client, club, token):
    release = club["club"]
    for path, body in (("/member/session", None), ("/member/login", {"email": EMAIL, "password": PASSWORD}), ("/data/stops", None), ("/commerce/catalog", None)):
        r = runtime(client, release, path, body, token=token)
        assert r.status_code in (403, 404), path
        assert "access-control-allow-origin" not in r.headers, path
        assert "visitorToken" not in r.text and "Twelve ferry stops" not in r.text and "Season pass" not in r.text, path


def test_a_runtime_token_works_only_for_its_own_publication(client, club):
    r = runtime(client, club["club"], "/member/session", token=club["other"]["config"]["context"]["runtimeToken"])
    assert r.status_code == 403
    assert "another publication" in r.json()["detail"]


def test_a_member_session_from_one_publication_is_not_accepted_by_another(client, club):
    visitor = signed_in(client, club["club"]).json()["visitorToken"]
    r = runtime(client, club["other"], "/member/session", headers={"x-formweb-visitor": visitor})
    assert r.status_code == 200
    assert r.json()["authenticated"] is False


def test_a_foreign_origin_cannot_use_a_publication_token(client, club):
    r = runtime(client, club["club"], "/member/login", {"email": EMAIL, "password": PASSWORD}, headers=FOREIGN)
    assert r.status_code == 403
    assert "visitorToken" not in r.text


def test_the_members_page_is_refused_without_a_session(client, club):
    r = client.get(club["club"]["prefix"] + "members/")
    assert r.status_code == 401
    assert MEMBERS_WORD not in r.text


def test_a_members_link_ticket_opens_the_members_page_and_carries_the_session_once(client, club):
    release = club["club"]
    visitor = signed_in(client, release).json()["visitorToken"]
    r = runtime(client, release, "/member/handoff", {}, headers={"x-formweb-visitor": visitor})
    assert r.status_code == 200, r.text
    ticket = r.json()["ticket"]
    r = client.get(release["prefix"] + "members/", params={"fw-member": ticket})
    assert r.status_code == 200, r.text
    assert MEMBERS_WORD in r.text
    r = runtime(client, release, "/member/resume", {"ticket": ticket})
    assert r.status_code == 200, r.text
    resumed = r.json()["visitorToken"]
    assert resumed != visitor
    assert runtime(client, release, "/member/session", headers={"x-formweb-visitor": resumed}).json()["email"] == EMAIL
    assert runtime(client, release, "/member/resume", {"ticket": ticket}).status_code == 401
    r = client.get(release["prefix"] + "members/", params={"fw-member": ticket})
    assert r.status_code == 401
    assert MEMBERS_WORD not in r.text


def test_a_members_link_ticket_needs_a_signed_in_member_and_its_own_publication(client, club):
    release = club["club"]
    assert runtime(client, release, "/member/handoff", {}).status_code == 401
    visitor = signed_in(client, release).json()["visitorToken"]
    ticket = runtime(client, release, "/member/handoff", {}, headers={"x-formweb-visitor": visitor}).json()["ticket"]
    r = client.get(club["other"]["prefix"] + "members/", params={"fw-member": ticket})
    assert r.status_code == 401
    assert MEMBERS_WORD not in r.text
    assert runtime(client, club["other"], "/member/resume", {"ticket": ticket}).status_code == 401


def test_the_publication_script_reads_its_own_pages_and_route_list_with_its_token(client, club):
    release = club["club"]
    own = {**OPAQUE, "x-formweb-runtime": release["config"]["context"]["runtimeToken"]}
    for path in ("", "routes.json", "sitemap.xml"):
        r = client.get(release["prefix"] + path, headers=own)
        assert r.status_code == 200, path
        assert r.headers["access-control-allow-origin"] == "null", path
        assert "access-control-allow-credentials" not in r.headers, path
        assert r.headers["cache-control"] == "private, no-store", path
        assert "x-formweb-runtime" in r.headers["vary"].lower(), path
    assert any(row["page"] == "members" for row in client.get(release["prefix"] + "routes.json", headers=own).json())
    r = client.get("/sites/club/", headers=own)
    assert r.status_code == 200
    assert 'data-fw-widget="member-login"' in r.text


def test_an_opaque_origin_without_the_token_cannot_read_the_pages_or_route_list(client, club):
    release = club["club"]
    for headers in (OPAQUE, {**OPAQUE, "x-formweb-runtime": club["other"]["config"]["context"]["runtimeToken"]}, {**OPAQUE, "x-formweb-runtime": "x" * 43}):
        for path in ("", "routes.json"):
            r = client.get(release["prefix"] + path, headers=headers)
            assert r.status_code == 403, path
            assert "access-control-allow-origin" not in r.headers, path
            assert "member-login" not in r.text and "members" not in r.text, path


def test_the_token_does_not_unlock_a_members_page(client, club):
    release = club["club"]
    r = client.get(release["prefix"] + "members/", headers={**OPAQUE, "x-formweb-runtime": release["config"]["context"]["runtimeToken"]})
    assert r.status_code == 401
    assert MEMBERS_WORD not in r.text
