import pytest

SECRET = "Quillowbramble"


def command(client, name, params):
    r = client.post("/api/command", json={"command": name, "params": params})
    assert r.status_code == 200, r.text
    return r.json()


def node(client, parent, id, tag, text="", attrs=None):
    command(client, "node.add", {"parent": parent, "node": {"id": id, "tag": tag, "name": id, "text": text, "children": [], "attrs": attrs or {}, "styles": {}, "breakpoints": {}}})


@pytest.fixture()
def searchable_site_with_a_password_page(client):
    r = client.post("/api/new", json={"name": "Gated search", "blank": True})
    assert r.status_code == 200, r.text
    home = r.json()["site"]["pages"][0]
    node(client, home["root"], "find", "input", attrs={"type": "search", "aria-label": "Search"})
    node(client, home["root"], "found", "div")
    node(client, home["root"], "found-one", "a", attrs={"hidden": "", "data-fw-slot": "link", "href": "#"})
    node(client, home["root"], "open-text", "p", "Ferries leave the harbour every hour.")
    command(client, "motion.set", {"kind": "actions", "node": "find", "value": [{"trigger": "input", "action": "search", "input": "find", "results": "found", "template": "found-one", "limit": 8}]})
    command(client, "page.add", {"id": "vault", "root": "vault-root", "name": "Staff notes", "slug": "/staff"})
    command(client, "page.update", {"id": "vault", "patch": {"seo": {"title": "Staff notes", "description": "Rota", "noindex": False}}})
    node(client, "vault-root", "vault-h", "h1", f"{SECRET} rota")
    node(client, "vault-root", "vault-p", "p", f"The {SECRET} shift starts at six.")
    r = client.post("/api/page-passwords", json={"route": "/staff", "password": "harbour-gate"})
    assert r.status_code == 200, r.text
    return client


def test_a_password_set_after_publishing_also_hides_the_page_text_in_that_earlier_release(searchable_site_with_a_password_page):
    client = searchable_site_with_a_password_page
    assert client.post("/api/page-passwords", json={"route": "/staff", "password": None}).status_code == 200
    r = client.post("/api/publish", json={"slug": "gated-later"})
    assert r.status_code == 200, r.text
    base = f"/published/gated-later/{r.json()['version']}/"
    assert SECRET in client.get(base + "search-index.json").text
    assert client.post("/api/page-passwords", json={"route": "/staff", "password": "harbour-gate"}).status_code == 200
    index = client.get(base + "search-index.json")
    assert index.status_code == 200
    assert SECRET not in index.text and "Ferries leave the harbour" in index.text
    assert index.headers["cache-control"] == "private, no-store"
    assert client.get(base + "site.formweb.json").status_code == 404


def test_a_site_with_a_password_page_cannot_be_exported_as_static_files(searchable_site_with_a_password_page):
    r = searchable_site_with_a_password_page.get("/api/export")
    assert r.status_code == 409
    assert "/staff" in r.json()["detail"]
