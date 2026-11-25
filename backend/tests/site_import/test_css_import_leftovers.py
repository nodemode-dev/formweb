import re

import pytest

from site_zips import zip_of

REVIEW = "/api/library/import-site/review"
IMPORT = "/api/library/import-site"
LINKED = '<html><head><link rel="stylesheet" href="{0}"></head><body><p>x</p></body></html>'
IMPORT_TARGET = re.compile(r"@import\s+(?:url\(\s*)?['\"]?([^'\")\s;]+)", re.IGNORECASE)


def local_imports(css):
    return [t for t in IMPORT_TARGET.findall(css) if not re.match(r"(?i)(https?:)?//", t)]


@pytest.fixture()
def blank(client):
    r = client.post("/api/new", json={"name": "Blank", "blank": True})
    assert r.status_code == 200, r.text
    return r.json()


def imported_css(client, files):
    data = zip_of(files)
    review = client.post(REVIEW, content=data)
    assert review.status_code == 200, review.text
    r = client.post(f"{IMPORT}?mode=new&revision={review.json()['revision']}", content=data)
    assert r.status_code == 200, r.text
    site = client.get("/api/state").json()["site"]
    page = next(p for p in site["pages"] if p["id"] == r.json()["pages"][0])
    sections = site["extensions"]["code"]["sections"]
    css = "".join(sections[c]["css"] for c in site["nodes"][page["root"]]["children"] if c in sections)
    notes = {"review": [w for p in review.json()["pages"] for w in p["warnings"]], "import": list(r.json()["warnings"])}
    return css, notes


LOOP = {"index.html": LINKED.format("a.css"), "a.css": '@import "b.css";\n.from-a{color:red}', "b.css": '@import url("a.css");\n.from-b{color:blue}'}


def chain(levels):
    files = {"index.html": LINKED.format("l0.css")}
    for level in range(levels):
        files[f"l{level}.css"] = f'@import "l{level + 1}.css";\n.level-{level}{{color:red}}'
    files[f"l{levels}.css"] = f".level-{levels}{{color:blue}}"
    return files


def test_after_a_css_import_loop_the_page_css_holds_no_local_import(client, blank):
    css, _ = imported_css(client, LOOP)
    assert ".from-a" in css and ".from-b" in css
    assert local_imports(css) == [], css


@pytest.mark.parametrize("step", ["review", "import"])
def test_the_review_and_the_import_each_name_a_stylesheet_of_the_loop(client, blank, step):
    _, notes = imported_css(client, LOOP)
    assert any(("a.css" in note or "b.css" in note) and note.endswith(".") for note in notes[step]), notes


def test_imports_six_levels_deep_stop_after_four_and_leave_no_local_import(client, blank):
    css, _ = imported_css(client, chain(6))
    assert [n for n in range(7) if f".level-{n}{{" in css] == [0, 1, 2, 3, 4]
    assert local_imports(css) == [], css


@pytest.mark.parametrize("step", ["review", "import"])
def test_the_review_and_the_import_each_name_the_stylesheet_past_the_level_limit_and_the_limit(client, blank, step):
    _, notes = imported_css(client, chain(6))
    assert any("l5.css" in note and "4" in note and note.endswith(".") for note in notes[step]), notes


def test_a_chain_exactly_four_levels_deep_arrives_whole_without_a_note(client, blank):
    css, notes = imported_css(client, chain(4))
    assert [n for n in range(5) if f".level-{n}{{" in css] == [0, 1, 2, 3, 4]
    assert local_imports(css) == [], css
    assert not any(".css" in note for note in notes["review"] + notes["import"]), notes


def test_an_import_of_an_outside_stylesheet_stays_as_written(client, blank):
    outside = '@import url("https://fonts.example.org/family.css");'
    css, _ = imported_css(client, {"index.html": LINKED.format("s.css"), "s.css": outside + "\n.own{color:red}"})
    assert outside in css
    assert ".own" in css
    assert local_imports(css) == []
