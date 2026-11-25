import unicodedata

import pytest

from site_zips import answered_within, zip_declaring_smaller_sizes, zip_of, zip_with_symlink

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
BOUND = 30
CODE_CSS_CAP = 256 * 1024
INDEX = "<html><body><p>ok</p></body></html>"


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def site_of(client):
    return client.get("/api/state").json()["site"]


def still_answering(client):
    r = client.get("/api/health")
    assert r.status_code == 200


def deep_path(levels):
    return "/".join(f"d{i}" for i in range(levels)) + "/page.html"


REFUSED = {
    "a_name_climbing_out_of_its_folder": lambda: zip_of({"index.html": INDEX, "../evil.html": INDEX}),
    "a_name_climbing_out_from_inside_a_folder": lambda: zip_of({"site/index.html": INDEX, "site/../../evil.html": INDEX}),
    "an_absolute_name": lambda: zip_of({"index.html": INDEX, "/etc/evil.html": INDEX}),
    "a_drive_letter_name": lambda: zip_of({"index.html": INDEX, "C:/evil.html": INDEX}),
    "a_drive_letter_name_with_backslashes": lambda: zip_of({"index.html": INDEX, "C:\\Windows\\evil.html": INDEX}),
    "a_backslash_name_climbing_out": lambda: zip_of({"index.html": INDEX, "..\\evil.html": INDEX}),
    "a_backslash_name_climbing_out_from_inside_a_folder": lambda: zip_of({"index.html": INDEX, "site\\..\\..\\evil.html": INDEX}),
    "a_symbolic_link_entry": lambda: zip_with_symlink(),
    "an_entry_that_expands_a_thousand_times": lambda: zip_of({"index.html": INDEX, "big.css": b"a" * (4 * 1024 * 1024)}),
    "two_thousand_files": lambda: zip_of({f"f{i}.html": "" for i in range(2000)}),
    "two_names_equal_but_for_case": lambda: zip_of({"index.html": INDEX, "About.html": INDEX, "about.html": INDEX}),
    "two_names_equal_but_for_unicode_form": lambda: zip_of({"index.html": INDEX, unicodedata.normalize("NFC", "caf\u00e9.html"): INDEX, unicodedata.normalize("NFD", "caf\u00e9.html"): INDEX}),
    "a_path_twenty_folders_deep": lambda: zip_of({"index.html": INDEX, deep_path(20): INDEX}),
    "sizes_declared_smaller_than_the_data": lambda: zip_declaring_smaller_sizes("index.html", "<html><body>" + "<p>x</p>" * 400000 + "</body></html>", 100),
    "an_empty_body": lambda: b"",
    "bytes_that_are_not_a_zip": lambda: b"<html><body>not a zip</body></html>" * 10,
}


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
@pytest.mark.parametrize("case", list(REFUSED))
def test_a_hostile_archive_is_refused_with_a_sentence_and_the_site_is_unchanged(client, blank, case, route):
    data = REFUSED[case]()
    before = site_of(client)
    r = answered_within(BOUND, lambda: client.post(route, content=data))
    assert 400 <= r.status_code < 500, (r.status_code, r.text[:300])
    detail = r.json()["detail"]
    assert isinstance(detail, str) and detail.endswith(".") and len(detail.split()) >= 4
    assert "Traceback" not in detail
    assert site_of(client) == before
    still_answering(client)


def test_a_path_twelve_folders_deep_is_still_accepted(client, blank):
    r = client.post(REVIEW, content=zip_of({"index.html": INDEX, deep_path(11): INDEX}))
    assert r.status_code == 200, r.text
    assert len(r.json()["pages"]) == 2


def test_a_thousand_files_is_still_accepted(client, blank):
    r = client.post(REVIEW, content=zip_of({"index.html": INDEX, **{f"img/{i}.txt": "x" for i in range(999)}}))
    assert r.status_code == 200, r.text
    assert len(r.json()["skipped"]) == 999


def test_system_files_and_dot_folders_are_ignored_and_counted(client, blank):
    r = client.post(REVIEW, content=zip_of({"index.html": INDEX, "__MACOSX/._index.html": "x", ".git/config": "x", "node_modules/a/index.html": INDEX, ".DS_Store": "x"}))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ignored"] == 4
    assert [p["file"] for p in body["pages"]] == ["index.html"]


def css_of_imported(client, data):
    review = answered_within(BOUND, lambda: client.post(REVIEW, content=data))
    assert review.status_code == 200, review.text
    r = answered_within(BOUND, lambda: client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=data))
    assert r.status_code == 200, r.text
    still_answering(client)
    return review.json(), r.json(), site_of(client)


def section_css(site, page_id):
    page = next(p for p in site["pages"] if p["id"] == page_id)
    sections = site["extensions"]["code"]["sections"]
    return [sections[c]["css"] for c in site["nodes"][page["root"]]["children"] if c in sections]


LOOP = {"index.html": '<html><head><link rel="stylesheet" href="a.css"></head><body><p>x</p></body></html>', "a.css": '@import "b.css";\n.from-a{color:red}', "b.css": '@import "a.css";\n@import url("b.css");\n.from-b{color:blue}'}


def sentences(review, result):
    return [w for p in review["pages"] for w in p["warnings"]] + list(result["warnings"]) + [s["reason"] for s in result["skipped"]]


def test_a_css_import_loop_ends_and_each_file_arrives_at_most_once(client, blank):
    review, result, site = css_of_imported(client, zip_of(LOOP))
    assert len(result["pages"]) == 1
    css = section_css(site, result["pages"][0])
    assert len(css) == 1
    assert css[0].count(".from-a") == 1 and css[0].count(".from-b") == 1


def test_a_css_import_loop_is_named_in_a_plain_sentence(client, blank):
    review, result, site = css_of_imported(client, zip_of(LOOP))
    assert any(s.endswith(".") for s in sentences(review, result))


def fan_out(levels, width):
    files = {"index.html": '<html><head><link rel="stylesheet" href="l0.css"></head><body><p>x</p></body></html>'}
    for level in range(levels):
        files[f"l{level}.css"] = "".join(f'@import "l{level + 1}.css";\n' for _ in range(width)) + f".level-{level}{{color:red}}"
    files[f"l{levels}.css"] = ".leaf{" + "margin:0;" * 100 + "}"
    return files


def test_a_css_import_fan_out_stays_within_the_code_section_cap_and_the_leaf_arrives_at_most_once(client, blank):
    review, result, site = css_of_imported(client, zip_of(fan_out(5, 40)))
    assert len(result["pages"]) == 1
    css = section_css(site, result["pages"][0])[0]
    assert len(css.encode()) <= CODE_CSS_CAP
    assert css.count(".leaf") <= 1


def test_a_css_import_fan_out_that_is_cut_short_is_named_in_a_plain_sentence(client, blank):
    review, result, site = css_of_imported(client, zip_of(fan_out(5, 40)))
    css = section_css(site, result["pages"][0])[0]
    assert ".leaf" in css or any(s.endswith(".") for s in sentences(review, result))


def test_twenty_thousand_links_to_one_stylesheet_bring_its_rules_once(client, blank):
    links = '<link rel="stylesheet" href="s.css">' * 20000
    data = zip_of({"index.html": f"<html><head>{links}</head><body><p>x</p></body></html>", "s.css": ".linked{" + "padding:0;" * 20 + "}"})
    review, result, site = css_of_imported(client, data)
    assert len(result["pages"]) == 1
    css = section_css(site, result["pages"][0])[0]
    assert css.count(".linked") == 1


def test_twenty_thousand_links_to_missing_stylesheets_still_import_the_page(client, blank):
    links = "".join(f'<link rel="stylesheet" href="missing-{i}.css">' for i in range(20000))
    data = zip_of({"index.html": f"<html><head>{links}</head><body><p>kept</p></body></html>"})
    review, result, site = css_of_imported(client, data)
    assert len(result["pages"]) == 1
    page = next(p for p in site["pages"] if p["id"] == result["pages"][0])
    sections = site["extensions"]["code"]["sections"]
    assert [sections[c]["html"] for c in site["nodes"][page["root"]]["children"] if c in sections] == ["<p>kept</p>"]


def test_unclosed_body_tags_still_import_the_page_with_its_links_rewritten(client, blank):
    body = "<div><section><p>" * 20000 + '<a href="about.html">About'
    data = zip_of({"index.html": f"<html><head><title>Open</title></head><body>{body}", "about.html": "<html><body><p>about</p></body></html>"})
    review, result, site = css_of_imported(client, data)
    routes = {p["file"]: p["newRoute"] for p in review["pages"]}
    assert set(routes) == {"index.html", "about.html"}
    assert len(result["pages"]) == 2
    page = next(p for p in site["pages"] if p["id"] in result["pages"] and p["seo"]["title"] == "Open")
    sections = site["extensions"]["code"]["sections"]
    html = "".join(sections[c]["html"] for c in site["nodes"][page["root"]]["children"] if c in sections)
    assert html.endswith(f'<a href="{routes["about.html"]}">About')
