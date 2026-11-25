import hashlib
import re

import pytest

from site_zips import png_bytes, zip_of

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


def test_a_picture_in_an_imported_stylesheet_points_at_its_stored_asset_without_a_false_missing_file_note(client, blank):
    files = {"index.html": LINKED.format("css/site.css"), "css/site.css": '@import "parts/hero.css";\n.own{color:red}', "css/parts/hero.css": ".hero{background:url(../../img/dot.png)}", "img/dot.png": png_bytes()}
    css, notes = imported_css(client, files)
    asset = "/api/assets/" + hashlib.sha256(png_bytes()).hexdigest() + ".png"
    assert f'url("{asset}")' in css
    assert not any("not in the archive" in note for note in notes["review"] + notes["import"]), notes


def test_a_missing_picture_in_an_imported_stylesheet_is_named_once_as_written(client, blank):
    files = {"index.html": LINKED.format("css/site.css"), "css/site.css": '@import "parts/hero.css";', "css/parts/hero.css": ".hero{background:url(gone.png)}"}
    _, notes = imported_css(client, files)
    said = [note for note in notes["review"] if "not in the archive" in note]
    assert len(said) == 1 and said[0].startswith("1 reference points") and "gone.png" in said[0], said


def css_rules_before(css, statement):
    head = css[:css.index(statement)]
    return re.sub(r"@import[^;]*;|\s+", "", head)


@pytest.mark.parametrize("step", ["review", "import"])
def test_an_outside_import_after_other_rules_moves_to_the_top_of_the_page_styles_and_is_named(client, blank, step):
    outside = '@import url("https://fonts.example.org/family.css");'
    page = '<html><head><style>.first{color:blue}</style><link rel="stylesheet" href="s.css"></head><body><p>x</p></body></html>'
    css, notes = imported_css(client, {"index.html": page, "s.css": ".second{color:red}\n" + outside})
    assert css.count(outside) == 1
    assert css_rules_before(css, outside) == "", css
    assert ".first" in css and ".second" in css
    assert any("https://fonts.example.org/family.css" in note and "outside stylesheet" in note for note in notes[step]), notes
