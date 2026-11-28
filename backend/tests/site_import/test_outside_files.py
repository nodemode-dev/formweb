import pytest

from site_zips import page, zip_of

REVIEW = "/api/library/import-site/review"
PASTE = "/api/library/import-html"
EARLIER_PAGE_FIELDS = {"file", "name", "title", "description", "route", "newRoute", "replaces", "bytes", "warnings"}
EARLIER_REVIEW_FIELDS = {"pages", "assets", "supportFiles", "skipped", "ignored", "canReplace", "replaceNote", "notes", "revision"}
EARLIER_PASTE_FIELDS = {"canRedo", "canUndo", "revision", "site", "root", "warnings"}


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def zipped(client, files):
    r = client.post(REVIEW, content=zip_of(files))
    assert r.status_code == 200, r.text[:400]
    return r.json()


def loose(client, files):
    r = client.post(REVIEW, json={"files": [{"name": name, "html": html} for name, html in files.items()]})
    assert r.status_code == 200, r.text[:400]
    return r.json()


def page_of(review, file):
    return next(p for p in review["pages"] if p["file"] == file)


def outside(review, file="index.html"):
    found = page_of(review, file)
    assert "outside" in found, f"the review of {file} has no outside list: {sorted(found)}"
    return found["outside"]


def entries(listed):
    return [(item["kind"], item["host"], item["url"]) for item in listed]


def link(href, rel="stylesheet"):
    return f'<link rel="{rel}" href="{href}">'


def script(src):
    return f'<script src="{src}"></script>'


MIXED = page(
    "Stopwatch",
    "<h1>Lap times</h1>" + script("https://code.example.org/late.js") + link("https://cdn.example.net/print.css"),
    link("https://cdn.example.net/look.css") + script("https://code.example.org/tick.js") + link("https://fonts.example.com/face.css"),
)
MIXED_LIST = [
    ("stylesheet", "cdn.example.net", "https://cdn.example.net/look.css"),
    ("script", "code.example.org", "https://code.example.org/tick.js"),
    ("stylesheet", "fonts.example.com", "https://fonts.example.com/face.css"),
    ("script", "code.example.org", "https://code.example.org/late.js"),
    ("stylesheet", "cdn.example.net", "https://cdn.example.net/print.css"),
]


def test_a_page_names_each_outside_stylesheet_and_script_with_its_kind_host_and_address_in_document_order(client, blank):
    assert entries(outside(zipped(client, {"index.html": MIXED}))) == MIXED_LIST


def test_the_same_page_picked_as_a_loose_file_names_the_same_outside_files_as_inside_a_zip(client, blank):
    as_zip = outside(zipped(client, {"index.html": MIXED}))
    as_file = outside(loose(client, {"index.html": MIXED}))
    assert as_file == as_zip
    assert entries(as_file) == MIXED_LIST


def test_an_outside_file_the_page_names_twice_is_listed_once(client, blank):
    twice = page("Twice", script("https://code.example.org/a.js"), link("https://cdn.example.net/a.css") + script("https://code.example.org/a.js") + link("https://cdn.example.net/a.css"))
    assert entries(outside(loose(client, {"index.html": twice}))) == [
        ("stylesheet", "cdn.example.net", "https://cdn.example.net/a.css"),
        ("script", "code.example.org", "https://code.example.org/a.js"),
    ]


@pytest.mark.parametrize("count, kind, tag", [(21, "script", script), (25, "script", script), (300, "stylesheet", link)])
def test_a_page_with_more_than_twenty_outside_files_lists_the_first_twenty_and_counts_the_rest(client, blank, count, kind, tag):
    many = page("Many", "<p>many</p>", "".join(tag(f"https://cdn.example.net/f{i}.{'js' if kind == 'script' else 'css'}") for i in range(count)))
    for review in (loose(client, {"index.html": many}), zipped(client, {"index.html": many})):
        found = page_of(review, "index.html")
        assert [item["url"] for item in outside(review)] == [f"https://cdn.example.net/f{i}.{'js' if kind == 'script' else 'css'}" for i in range(20)]
        assert {item["kind"] for item in found["outside"]} == {kind}
        assert found["outsideMore"] == count - 20


def test_a_page_with_twenty_outside_files_lists_all_of_them_and_counts_none_more(client, blank):
    twenty = page("Twenty", "<p>twenty</p>", "".join(script(f"https://code.example.org/f{i}.js") for i in range(20)))
    found = page_of(loose(client, {"index.html": twenty}), "index.html")
    assert len(found["outside"]) == 20
    assert found["outsideMore"] == 0


def test_a_page_with_no_outside_files_gets_an_empty_list_and_every_earlier_field_as_written(client, blank):
    plain = page("Opening hours", '<h1>Open daily</h1><script src="js/app.js"></script>', link("css/site.css"), "When we are open")
    review = zipped(client, {"hours.html": plain, "css/site.css": "h1{color:#123456}", "js/app.js": "document.title = 'x';"})
    assert set(review) == EARLIER_REVIEW_FIELDS
    found = page_of(review, "hours.html")
    assert set(found) == EARLIER_PAGE_FIELDS | {"outside", "outsideMore", "outsideWarnings"}
    assert (found["outside"], found["outsideMore"], found["outsideWarnings"]) == ([], 0, [])
    assert (found["name"], found["title"], found["description"], found["newRoute"], found["warnings"]) == ("Opening hours", "Opening hours", "When we are open", "/hours", [])
    assert found["bytes"] == len(plain.encode("utf-8"))


def test_naming_outside_files_changes_none_of_the_pages_other_fields_but_its_size_and_warnings(client, blank):
    body = "<h1>Lap times</h1>"
    without = page("Stopwatch", body, "", "Time your laps")
    with_outside = page("Stopwatch", body, link("https://cdn.example.net/look.css") + script("https://code.example.org/tick.js"), "Time your laps")
    plain = page_of(zipped(client, {"index.html": without}), "index.html")
    loading = page_of(zipped(client, {"index.html": with_outside}), "index.html")
    assert plain["outside"] == [] and len(loading["outside"]) == 2
    kept = EARLIER_PAGE_FIELDS - {"bytes", "warnings"}
    assert {k: loading[k] for k in kept} == {k: plain[k] for k in kept}
    assert plain["warnings"] == []
    assert any("https://code.example.org/tick.js" in w for w in loading["warnings"]), loading["warnings"]
    assert any("https://cdn.example.net/look.css" in w for w in loading["warnings"]), loading["warnings"]


@pytest.mark.parametrize("reference", ["data:text/javascript,document.title='x'", "blob:https://cdn.example.net/1f2e3d", "DATA:text/css,body{}"])
def test_data_and_blob_addresses_are_not_outside_files(client, blank, reference):
    sample = page("Inline", "<p>x</p>", script(reference) + link(reference) + script("https://control.example.net/c.js"))
    assert entries(outside(loose(client, {"index.html": sample}))) == [("script", "control.example.net", "https://control.example.net/c.js")]


@pytest.mark.parametrize("rel", ["preconnect", "icon", "dns-prefetch", "shortcut icon"])
def test_a_link_that_is_not_a_stylesheet_is_not_an_outside_stylesheet(client, blank, rel):
    sample = page("Links", "<p>x</p>", link("https://hints.example.net/x", rel) + link("https://cdn.example.net/look.css"))
    assert entries(outside(loose(client, {"index.html": sample}))) == [("stylesheet", "cdn.example.net", "https://cdn.example.net/look.css")]


def test_a_script_and_a_stylesheet_inside_the_archive_are_local_and_not_listed(client, blank):
    sample = page("Local", script("js/app.js") + script("/js/more.js"), link("css/site.css") + link("./css/print.css") + script("https://code.example.org/tick.js"))
    review = zipped(client, {"index.html": sample, "css/site.css": "h1{color:red}", "css/print.css": "h1{color:blue}", "js/app.js": "1;", "js/more.js": "2;"})
    assert entries(outside(review)) == [("script", "code.example.org", "https://code.example.org/tick.js")]


def test_a_protocol_relative_address_is_an_outside_file_of_its_host(client, blank):
    sample = page("Relative", script("//code.example.org/tick.js"), link("//cdn.example.net/look.css"))
    listed = outside(loose(client, {"index.html": sample}))
    assert [(item["kind"], item["host"]) for item in listed] == [("stylesheet", "cdn.example.net"), ("script", "code.example.org")]
    assert [item["url"].split("/")[2] for item in listed] == ["cdn.example.net", "code.example.org"]


def test_an_upper_case_scheme_and_host_are_listed_in_lower_case(client, blank):
    sample = page("Upper", "<p>x</p>", link("HTTPS://CDN.EXAMPLE.NET/Look.css") + script("Http://Code.Example.ORG/Tick.js"))
    listed = outside(loose(client, {"index.html": sample}))
    assert [item["host"] for item in listed] == ["cdn.example.net", "code.example.org"]
    assert [item["url"].split("/")[2] for item in listed] == ["cdn.example.net", "code.example.org"]
    assert [item["url"].split(":")[0] for item in listed] == ["https", "http"]


def test_an_import_of_an_outside_stylesheet_counts_as_a_stylesheet_from_that_host_from_a_local_stylesheet_and_from_a_style_block(client, blank):
    sample = page("Imports", "<p>x</p>", link("css/site.css") + '<style>@import url("https://style.example.org/block.css"); p{color:red}</style>')
    review = zipped(client, {
        "index.html": sample,
        "css/site.css": '@import url(https://fonts.example.com/face.css);\n@import "base.css";\nh1{color:red}',
        "css/base.css": "@import 'https://deep.example.net/deep.css';\nh2{color:blue}",
    })
    assert entries(outside(review)) == [
        ("stylesheet", "fonts.example.com", "https://fonts.example.com/face.css"),
        ("stylesheet", "deep.example.net", "https://deep.example.net/deep.css"),
        ("stylesheet", "style.example.org", "https://style.example.org/block.css"),
    ]


def test_five_files_from_one_host_are_five_entries_of_that_host_and_a_repeated_file_is_not_a_sixth(client, blank):
    five = page("Five", "<p>x</p>", "".join(script(f"https://five.example.net/s{i}.js") for i in range(5)) + script("https://five.example.net/s2.js"))
    listed = outside(loose(client, {"index.html": five}))
    assert [item["host"] for item in listed] == ["five.example.net"] * 5
    assert [item["url"] for item in listed] == [f"https://five.example.net/s{i}.js" for i in range(5)]


def test_in_a_zip_of_three_pages_only_the_page_that_loads_outside_files_names_them(client, blank):
    review = zipped(client, {
        "index.html": page("Home", "<h1>Home</h1>", link("css/site.css")),
        "about.html": page("About", "<h1>About</h1>", link("https://cdn.example.net/look.css") + script("https://code.example.org/tick.js")),
        "contact.html": page("Contact", "<h1>Contact</h1>"),
        "css/site.css": "h1{color:red}",
    })
    named = {p["file"]: [item["host"] for item in p["outside"]] for p in review["pages"]}
    assert named == {"index.html": [], "about.html": ["cdn.example.net", "code.example.org"], "contact.html": []}


def test_the_paste_route_answers_with_the_pages_outside_files_beside_its_earlier_fields(client, blank):
    pasted = page("Stopwatch", "<h1>Lap times</h1>", link("https://cdn.example.net/look.css") + script("//code.example.org/tick.js"))
    r = client.post(PASTE, json={"html": pasted})
    assert r.status_code == 200, r.text[:400]
    answer = r.json()
    assert set(answer) == EARLIER_PASTE_FIELDS | {"outside", "outsideMore"}
    assert [(item["kind"], item["host"]) for item in answer["outside"]] == [("stylesheet", "cdn.example.net"), ("script", "code.example.org")]
    assert answer["outsideMore"] == 0
    section = answer["site"]["extensions"]["code"]["sections"][answer["root"]]
    assert section["html"] == "<h1>Lap times</h1>"
    assert answer["revision"] == client.get("/api/state").json()["revision"]


def covered_warnings(found):
    assert "outsideWarnings" in found, f"the review has no outsideWarnings: {sorted(found)}"
    assert all(isinstance(i, int) and 0 <= i < len(found["warnings"]) for i in found["outsideWarnings"]), found
    return [found["warnings"][i] for i in found["outsideWarnings"]]


def test_the_warnings_that_the_outside_list_names_in_full_are_pointed_at_and_the_warnings_stay_as_they_were(client, blank):
    head = link("https://cdn.example.net/look.css") + script("https://code.example.org/tick.js") + '<style>@import url(https://style.example.org/block.css);</style>'
    found = page_of(loose(client, {"index.html": page("Stopwatch", "<p>x</p>", head)}), "index.html")
    covered = covered_warnings(found)
    assert len(covered) == 2, found
    script_line = next(w for w in covered if "script" in w)
    sheet_line = next(w for w in covered if "stylesheet" in w)
    assert "https://code.example.org/tick.js" in script_line and "cdn.example.net" not in script_line
    assert "https://cdn.example.net/look.css" in sheet_line and "code.example.org" not in sheet_line
    left = [w for i, w in enumerate(found["warnings"]) if i not in found["outsideWarnings"]]
    assert len(left) == 1 and "https://style.example.org/block.css" in left[0], "the @import warning says more than the list and must not be pointed at"


@pytest.mark.parametrize("case, head", [
    ("a data script beside an outside one", script("data:text/javascript,1") + script("https://code.example.org/tick.js")),
    ("a refused host beside a good one", script("https://under_score.example.net/x.js") + script("https://code.example.org/tick.js")),
    ("twenty-one outside scripts", "".join(script(f"https://code.example.org/f{i}.js") for i in range(21))),
])
def test_a_script_warning_that_counts_a_file_the_list_does_not_name_is_not_pointed_at(client, blank, case, head):
    found = page_of(loose(client, {"index.html": page("Partly named", "<p>x</p>", head)}), "index.html")
    assert found["outside"], f"{case}: nothing was listed, so the page was not read"
    script_lines = [i for i, w in enumerate(found["warnings"]) if "external script" in w]
    assert len(script_lines) == 1, found["warnings"]
    assert script_lines[0] not in covered_warnings(found) and script_lines[0] not in found["outsideWarnings"], f"{case}: {found}"
