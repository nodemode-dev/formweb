import zipfile

import pytest

from site_zips import page, zip_of

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
NOTHING = "Nothing was imported."
OVER_CAP = page("Long", "<p>" + "".join(f"line {i} of a long page. " for i in range(60000)) + "</p>")


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def state_of(client):
    state = client.get("/api/state").json()
    return state["revision"], state["site"]


def loose(files):
    return {"files": [{"name": name, "html": html} for name, html in files.items()]}


def review_of(client, files):
    r = client.post(REVIEW, json=loose(files))
    assert r.status_code == 200, r.text[:400]
    return r.json()


def imported(client, body, mode="new", zipped=False):
    send = {"content": body} if zipped else {"json": body}
    review = client.post(REVIEW, **send)
    assert review.status_code == 200, review.text[:400]
    r = client.post(f"{IMPORT}?mode={mode}&revision={review.json()['revision']}", **send)
    assert r.status_code == 200, r.text[:400]
    return review.json(), r.json()


def pages_as_seen(site):
    sections = site["extensions"]["code"]["sections"]
    seen = []
    for p in site["pages"]:
        held = [sections[c]["html"] for c in site["nodes"][p["root"]]["children"] if c in sections]
        seen.append((p["slug"], p["seo"]["title"], p["seo"]["description"], held))
    return sorted(seen)


def refusal(client, route, **send):
    before = state_of(client)
    r = client.post(route, **send)
    assert state_of(client) == before, "a refused import changed the site or its revision"
    assert 400 <= r.status_code < 500, (r.status_code, r.text[:400])
    detail = r.json()["detail"]
    assert detail.endswith(NOTHING), detail
    return r.status_code, detail


def test_one_loose_html_file_is_reviewed_with_its_address_and_imported_as_a_page(client, blank):
    body = loose({"about.html": page("About us", "<h1>About</h1>", description="Who we are")})
    review, result = imported(client, body)
    assert [(p["file"], p["newRoute"], p["title"]) for p in review["pages"]] == [("about.html", "/about", "About us")]
    assert len(result["pages"]) == 1
    slugs = {p["slug"]: p for p in state_of(client)[1]["pages"]}
    assert slugs["/about"]["seo"]["description"] == "Who we are"


def test_several_loose_files_with_htm_and_upper_case_extensions_all_become_pages(client, blank):
    review = review_of(client, {"about.html": page("About", "<p>a</p>"), "contact.htm": page("Contact", "<p>c</p>"), "PRICES.HTML": page("Prices", "<p>p</p>")})
    assert sorted(p["file"] for p in review["pages"]) == ["PRICES.HTML", "about.html", "contact.htm"]
    assert {p["title"] for p in review["pages"]} == {"About", "Contact", "Prices"}
    assert review["skipped"] == []


@pytest.mark.parametrize("name, base", [("../x.html", "x.html"), ("..\\..\\y.html", "y.html"), ("../../etc/z.html", "z.html"), ("C:\\Users\\me\\site\\w.html", "w.html")])
def test_a_loose_name_with_path_parts_is_reduced_to_its_base_name(client, blank, name, base):
    review = review_of(client, {name: page("T", "<p>t</p>")})
    assert [p["file"] for p in review["pages"]] == [base]


def test_two_loose_files_whose_names_differ_only_in_letter_case_are_refused(client, blank):
    status, detail = refusal(client, REVIEW, json=loose({"About.html": page("A", "<p>a</p>"), "about.html": page("B", "<p>b</p>")}))
    assert status == 400
    assert "about.html" in detail.lower()


@pytest.mark.parametrize("name", ["style.css", "app.js", "photo.png", "notes.txt"])
def test_a_loose_file_that_is_not_html_is_refused_by_name(client, blank, name):
    status, detail = refusal(client, IMPORT, json=loose({"index.html": page("H", "<p>h</p>"), name: "x"}))
    assert status == 400
    assert name in detail


@pytest.mark.parametrize("name", ["", ".hidden.html", "folder/"])
def test_a_loose_file_without_an_ordinary_name_is_refused(client, blank, name):
    status, _ = refusal(client, REVIEW, json=loose({name: page("H", "<p>h</p>")}))
    assert status == 400


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_an_empty_list_of_loose_files_is_refused(client, blank, route):
    status, _ = refusal(client, route, json={"files": []})
    assert status == 400


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_more_than_a_hundred_loose_files_are_refused(client, blank, route):
    status, detail = refusal(client, route, json=loose({f"p{i}.html": page(f"P{i}", "<p>x</p>") for i in range(101)}))
    assert status == 413
    assert "101" in detail


def test_a_hundred_loose_files_are_accepted(client, blank):
    review = review_of(client, {f"p{i}.html": page(f"P{i}", "<p>x</p>") for i in range(100)})
    assert len(review["pages"]) == 100


@pytest.mark.parametrize("body", ['{"files": [', '{"files": "about.html"}', '[{"name": "a.html", "html": "x"}]', '{"files": [{"name": "a.html"}]}', "[" * 100000], ids=["cut_short", "files_not_a_list", "a_bare_list", "a_file_without_html", "deeply_nested"])
def test_a_loose_body_that_is_not_the_expected_json_is_refused(client, blank, body):
    status, _ = refusal(client, REVIEW, content=body.encode(), headers={"content-type": "application/json"})
    assert status == 400


@pytest.mark.parametrize("route", [REVIEW, IMPORT])
def test_a_loose_file_whose_html_holds_a_lone_surrogate_is_refused_and_names_the_file(client, blank, route):
    body = b'{"files": [{"name": "a.html", "html": "<p>\\ud800</p>"}]}'
    status, detail = refusal(client, route, content=body, headers={"content-type": "application/json"})
    assert status == 400
    assert "a.html" in detail


def test_a_loose_file_whose_html_holds_a_valid_surrogate_pair_is_imported(client, blank):
    body = b'{"files": [{"name": "a.html", "html": "<p>\\ud83d\\ude00</p>"}]}'
    headers = {"content-type": "application/json"}
    review = client.post(REVIEW, content=body, headers=headers)
    assert review.status_code == 200, review.text[:400]
    r = client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=body, headers=headers)
    assert r.status_code == 200, r.text[:400]
    html = "".join(h for slug, _, _, held in pages_as_seen(state_of(client)[1]) for h in held)
    assert "\U0001F600" in html


def test_a_loose_file_over_the_page_cap_is_skipped_with_the_same_reason_a_zip_gives(client, blank):
    assert len(OVER_CAP.encode()) > 1024 * 1024
    files = {"index.html": page("Home", "<p>h</p>"), "long.html": OVER_CAP}
    from_loose = review_of(client, files)
    from_zip = client.post(REVIEW, content=zip_of(files, zipfile.ZIP_STORED)).json()
    assert [s["file"] for s in from_loose["skipped"]] == ["long.html"]
    assert from_loose["skipped"] == from_zip["skipped"]
    assert from_loose["skipped"][0]["reason"].endswith(".")
    assert [p["file"] for p in from_loose["pages"]] == ["index.html"]


EQUIVALENT = {
    "index.html": page("Home", '<h1>Home</h1><a href="about.html">About</a><a href="contact.htm#form">Contact</a>', description="Start here"),
    "about.html": page("About", '<h2>About</h2><a href="index.html">Home</a><img src="https://example.org/a.png" alt="">', '<script src="https://cdn.example.org/x.js"></script>'),
    "contact.htm": page("Contact", "<h2>Contact</h2><style>h2{color:#123456}</style>"),
    "Caf\u00e9.HTML": page("Caf\u00e9", "<p>menu</p>"),
    "long.html": OVER_CAP,
}


def test_the_review_of_loose_files_equals_the_review_of_a_zip_of_the_same_files(client, blank):
    from_loose = review_of(client, EQUIVALENT)
    from_zip = client.post(REVIEW, content=zip_of(EQUIVALENT, zipfile.ZIP_STORED))
    assert from_zip.status_code == 200, from_zip.text[:400]
    assert from_loose == from_zip.json()
    assert len(from_loose["pages"]) == 4


def test_importing_loose_files_gives_the_same_pages_as_importing_a_zip_of_the_same_files(client):
    client.post("/api/new", json={"name": "Same", "blank": True})
    _, loose_result = imported(client, loose(EQUIVALENT))
    loose_site = pages_as_seen(state_of(client)[1])
    client.post("/api/new", json={"name": "Same", "blank": True})
    _, zip_result = imported(client, zip_of(EQUIVALENT, zipfile.ZIP_STORED), zipped=True)
    zip_site = pages_as_seen(state_of(client)[1])
    assert loose_result["message"] == zip_result["message"]
    assert loose_result["skipped"] == zip_result["skipped"]
    assert loose_result["warnings"] == zip_result["warnings"]
    assert len(loose_site) == 5
    assert loose_site == zip_site


def test_an_import_of_loose_files_is_one_undo_step(client, blank):
    before = state_of(client)[1]
    imported(client, loose({"about.html": page("About", "<p>a</p>"), "contact.html": page("Contact", "<p>c</p>")}))
    assert len(state_of(client)[1]["pages"]) == 3
    client.post("/api/command", json={"command": "history.undo", "params": {}})
    assert state_of(client)[1] == before


def test_an_import_of_loose_files_after_the_site_changed_since_the_review_is_refused(client, blank):
    body = loose({"about.html": page("About", "<p>a</p>")})
    revision = review_of(client, {"about.html": page("About", "<p>a</p>")})["revision"]
    client.post("/api/command", json={"command": "page.add", "params": {"name": "Meanwhile", "slug": "/meanwhile"}})
    before = state_of(client)
    r = client.post(f"{IMPORT}?mode=new&revision={revision}", json=body)
    assert r.status_code == 409, r.text[:400]
    assert "review" in r.json()["detail"].lower()
    assert state_of(client) == before


def test_loose_files_imported_again_with_replace_mode_swap_content_without_adding_pages(client, blank):
    imported(client, loose({"about.html": page("About", "<p>About first</p>")}))
    count = len(state_of(client)[1]["pages"])
    review, _ = imported(client, loose({"about.html": page("About", "<p>About second</p>")}), mode="replace")
    assert review["canReplace"] is True
    site = state_of(client)[1]
    assert len(site["pages"]) == count
    seen = dict((slug, html) for slug, _, _, html in pages_as_seen(site))
    assert "About second" in "".join(seen["/about"]) and "About first" not in "".join(seen["/about"])
