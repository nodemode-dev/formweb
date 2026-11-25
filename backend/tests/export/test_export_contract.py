import io
import json
import zipfile

import pytest

from site_zips import five_page_site, zip_of


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Contract", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def site_of(client):
    return client.get("/api/state").json()["site"]


def export(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    return r


def read_back(response):
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    assert archive.testzip() is None
    return archive


def assert_publisher_shape(archive, site):
    names = archive.namelist()
    for required in ("routes.json", "index.html", "site.formweb.json"):
        assert required in names
    assert len(names) == len(set(names))
    routes = json.loads(archive.read("routes.json"))
    assert sorted(r["page"] for r in routes) == sorted(p["id"] for p in site["pages"])
    for route in routes:
        assert route["path"] in names
        assert archive.read(route["path"]).decode().lower().startswith("<!doctype html")
    home = next(p for p in site["pages"] if p["slug"] == "/")
    assert next(r["path"] for r in routes if r["page"] == home["id"]) == "index.html"
    document = json.loads(archive.read("site.formweb.json"))
    assert [p["id"] for p in document["pages"]] == [p["id"] for p in site["pages"]]
    assert [p["slug"] for p in document["pages"]] == [p["slug"] for p in site["pages"]]


def test_the_export_answers_a_zip_attachment_named_site_export_zip(client, blank):
    r = export(client)
    assert r.headers["content-type"] == "application/zip"
    assert r.headers["content-disposition"] == 'attachment; filename="site-export.zip"'
    assert r.content[:4] == b"PK\x03\x04"
    assert_publisher_shape(read_back(r), site_of(client))


def test_the_export_lists_a_route_per_page_after_a_reorder_a_page_background_and_a_site_import(client, blank):
    data = zip_of(five_page_site())
    revision = client.post("/api/library/import-site/review", content=data).json()["revision"]
    imported = client.post(f"/api/library/import-site?mode=new&revision={revision}", content=data)
    assert imported.status_code == 200, imported.text
    site = site_of(client)
    last = site["pages"][-1]
    assert client.post("/api/command", json={"command": "page.move", "params": {"id": last["id"], "index": 1}}).status_code == 200
    assert client.post("/api/command", json={"command": "node.update", "params": {"id": last["root"], "patch": {"styles": {"background": "#c0ffee"}}}}).status_code == 200
    site = site_of(client)
    assert len(site["pages"]) == 6
    archive = read_back(export(client))
    assert_publisher_shape(archive, site)
    paths = {r["page"]: r["path"] for r in json.loads(archive.read("routes.json"))}
    for page in site["pages"]:
        expected = "index.html" if page["slug"] == "/" else page["slug"].strip("/") + "/index.html"
        assert paths[page["id"]] == expected
    assert "#c0ffee" in "".join(archive.read(n).decode() for n in archive.namelist() if n.endswith(".css"))


def test_two_exports_of_an_unchanged_site_hold_the_same_files_and_routes(client, blank):
    data = zip_of(five_page_site())
    revision = client.post("/api/library/import-site/review", content=data).json()["revision"]
    client.post(f"/api/library/import-site?mode=new&revision={revision}", content=data)
    first = read_back(export(client))
    second = read_back(export(client))
    assert first.namelist() == second.namelist()
    assert json.loads(first.read("routes.json")) == json.loads(second.read("routes.json"))
    assert json.loads(first.read("site.formweb.json")) == json.loads(second.read("site.formweb.json"))


def test_the_exported_site_document_matches_the_open_site_pages(client, blank):
    client.post("/api/command", json={"command": "page.add", "params": {"name": "Later", "slug": "/later"}})
    site = site_of(client)
    document = json.loads(read_back(export(client)).read("site.formweb.json"))
    assert {p["id"]: p["seo"] for p in document["pages"]} == {p["id"]: p["seo"] for p in site["pages"]}
