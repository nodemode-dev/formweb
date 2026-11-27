import io
import json
import urllib.error
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect


def html_page(title, heading):
    return f"""<!doctype html><html><head><title>{title}</title><style>
.notice {{ padding: 32px; background: #fff4d6; font-family: Georgia, serif; }}
</style></head><body><div class="notice"><h2>{heading}</h2><p>From 1 October the Gull Island boat sails at weekends only.</p></div></body></html>"""


def html_file(tmp_path, name, title, heading=None):
    path = tmp_path / name
    path.write_text(html_page(title, heading or title), "utf-8")
    return path


def zip_file(tmp_path, name, entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        for entry, body in entries.items():
            archive.writestr(entry, body)
    path = tmp_path / name
    path.write_bytes(data.getvalue())
    return path


def code_sections(site):
    return (site.get("extensions", {}).get("code") or {}).get("sections") or {}


def parents(site):
    return {child: node["id"] for node in site["nodes"].values() for child in node["children"]}


def added_tops(before, after):
    new = set(after["nodes"]) - set(before["nodes"])
    up = parents(after)
    return [key for key in new if up.get(key) not in new]


def open_page(editor, site):
    key = editor.page.locator('#fw-pages-list .list-row[aria-current="page"]').get_attribute("data-key")
    return next(p for p in site["pages"] if p["id"] == key)


def pick(editor, command, *paths):
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate(f"window.formweb.run('{command}')")
    chooser.value.set_files([str(p) for p in paths])
    return editor.page.locator(".fw-lib-site")


def service_review(editor, path):
    request = urllib.request.Request(editor.base + "/api/library/import-site/review", data=path.read_bytes(), method="POST", headers={"Content-Type": "application/zip", "X-FormWeb-Window-Key": editor.window_key})
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())["detail"]


def box(locator):
    found = locator.bounding_box()
    return found["y"], found["height"]


def expect_clean_site_view(view):
    expect(view).to_be_visible()
    expect(view.locator(".fw-lib-site-review")).to_be_hidden()
    expect(view.locator(".fw-lib-site-chosen")).to_have_count(0)
    expect(view.locator(".fw-lib-note")).to_have_text("")
    expect(view.locator(".fw-lib-insert")).not_to_contain_text("Imported")
    expect(view.locator(".fw-lib-insert")).to_be_disabled()


def test_file_import_html_files_from_the_menu_opens_the_file_picker_for_several_html_files_with_the_library_behind_it(harbour):
    harbour.page.locator('[data-menu="File"]').click()
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.locator('[role="menu"]:visible [data-command="file.import-html"]').click()
    assert chooser.value.is_multiple()
    accepted = chooser.value.element.get_attribute("accept").split(",")
    assert ".html" in accepted and ".zip" not in accepted
    expect(harbour.page.locator(".fw-lib-import-part").first).to_be_visible()


def test_from_the_start_screen_one_html_file_becomes_a_new_page_at_its_own_address_and_one_undo_of_the_code_import_takes_it_away(editor, tmp_path):
    expect(editor.page.locator('[data-demo="harbour-ferries"]')).to_be_visible()
    before = editor.site()["site"]
    view = pick(editor, "file.import-html", html_file(tmp_path, "opening-hours.html", "Opening hours"))
    expect(editor.page.locator('[data-demo="harbour-ferries"]')).to_be_hidden()
    review = view.locator(".fw-lib-site-review")
    expect(review).to_be_visible()
    expect(review.locator(".fw-lib-site-item")).to_have_count(1)
    expect(review.locator(".fw-lib-site-item")).to_contain_text("Opening hours")
    expect(review.locator(".fw-lib-site-item")).to_contain_text("opening-hours.html")
    expect(review.locator(".fw-lib-site-item")).to_contain_text("/opening-hours")
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    expect(view.locator(".fw-lib-note")).to_contain_text("Imported 1 page")
    after = editor.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "one more page")
    assert "Opening hours" in editor.page_names(after)
    editor.page.evaluate("window.formweb.run('edit.undo')")
    editor.restored_to(before)
    expect_clean_site_view(view)


def test_two_html_files_picked_at_once_become_two_new_pages_and_as_a_section_is_not_offered(harbour, tmp_path):
    before = harbour.site()["site"]
    view = pick(harbour, "file.import-html", html_file(tmp_path, "winter-timetable.html", "Winter timetable"), html_file(tmp_path, "lost-property.html", "Lost property"))
    expect(view.locator(".fw-lib-site-chosen")).to_have_count(2)
    expect(view.get_by_role("radio", name="As a section of this page")).to_be_disabled()
    expect(view.get_by_role("radio", name="As new pages", exact=True)).to_have_attribute("aria-checked", "true")
    rows = view.locator(".fw-lib-site-review .fw-lib-site-item")
    expect(rows).to_have_count(2)
    expect(view.locator(".fw-lib-site-review")).to_contain_text("/winter-timetable")
    expect(view.locator(".fw-lib-site-review")).to_contain_text("/lost-property")
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    expect(view.locator(".fw-lib-note")).to_contain_text("Imported 2 pages")
    after = harbour.until(lambda s: len(s["pages"]) == len(before["pages"]) + 2, "two more pages")
    assert {"Winter timetable", "Lost property"} <= set(harbour.page_names(after))


def test_one_html_file_as_a_section_lands_in_the_open_page_in_view_and_the_note_speaks_of_the_section(harbour, tmp_path):
    before = harbour.site()["site"]
    page = open_page(harbour, before)
    last = before["nodes"][page["root"]]["children"][-1]
    expect(harbour.canvas.locator(f'[data-fw-id="{last}"]')).not_to_be_in_viewport()
    view = pick(harbour, "file.import-html", html_file(tmp_path, "winter-notice.html", "Winter notice", "Winter timetable"))
    view.get_by_role("radio", name="As a section of this page").click()
    expect(view.get_by_role("radio", name="As a section of this page")).to_have_attribute("aria-checked", "true")
    view.locator(".fw-lib-insert:not([disabled])").click()
    expect(view.locator(".fw-lib-note")).to_contain_text("section")
    expect(view.locator(".fw-lib-note")).not_to_contain_text("pages")
    after = harbour.until(lambda s: len(added_tops(before, s)) == 1 and any(n["text"] == "Winter timetable" for n in s["nodes"].values()), "one new section")
    assert len(after["pages"]) == len(before["pages"]), "a section import must not add a page"
    section = added_tops(before, after)[0]
    up = parents(after)
    top = section
    while top in up:
        top = up[top]
    assert top == page["root"], f"the new section belongs to the page with root {top}, not the open page {page['name']}"
    branch = section
    while up[branch] != page["root"]:
        branch = up[branch]
    order = after["nodes"][page["root"]]["children"]
    assert order.index(branch) > order.index(last), "the section was expected below the part of the page that was off screen"
    expect(harbour.canvas.locator(f'[data-fw-id="{section}"]')).to_be_in_viewport()
    expect(harbour.canvas.locator(f'[data-fw-id="{section}"]')).to_have_attribute("data-fw-selected", "")


def test_import_site_from_zip_takes_a_loose_html_file_and_makes_it_a_new_page(harbour, tmp_path):
    before = harbour.site()["site"]
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.evaluate("window.formweb.run('file.import-site')")
    accepted = chooser.value.element.get_attribute("accept").split(",")
    assert ".zip" in accepted and ".html" in accepted
    chooser.value.set_files(str(html_file(tmp_path, "ferry-tickets.html", "Ferry tickets")))
    view = harbour.page.locator(".fw-lib-site")
    expect(view.locator(".fw-lib-site-review")).to_contain_text("/ferry-tickets")
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    after = harbour.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "one more page")
    assert "Ferry tickets" in harbour.page_names(after)


def test_the_library_import_view_has_html_files_a_site_zip_and_pasted_html_and_the_paste_part_still_imports_a_section(harbour):
    before = harbour.site()["site"]
    with harbour.page.expect_file_chooser():
        harbour.page.evaluate("window.formweb.run('file.import-html')")
    harbour.page.keyboard.press("Escape")
    parts = harbour.page.locator(".fw-lib-import:not(.fw-lib-site) .fw-lib-import-part")
    expect(parts).to_have_count(3)
    expect(parts.locator("> h3")).to_have_text(["HTML files", "A whole site in a .zip", "Paste HTML code"])
    expect(parts.nth(0).get_by_role("button", name="Choose .html files...")).to_be_visible()
    expect(parts.nth(1).get_by_role("button", name="Choose a .zip file...")).to_be_visible()
    paste = parts.nth(2)
    paste.get_by_placeholder("<!doctype html>").fill(html_page("Winter notice", "Winter timetable"))
    paste.locator('[data-bring="code"]').click()
    paste.get_by_role("button", name="Import as section").click()
    expect(paste.locator(".fw-lib-note")).to_have_text("HTML section imported.")
    after = harbour.until(lambda s: len(code_sections(s)) == len(code_sections(before)) + 1, "one new code section")
    assert len(after["pages"]) == len(before["pages"])


def test_a_zip_of_a_projects_source_is_refused_with_the_services_own_sentence_and_the_site_is_unchanged(harbour, tmp_path):
    source = zip_file(tmp_path, "shop-source.zip", {
        "package.json": json.dumps({"name": "shop", "scripts": {"build": "vite build"}}),
        "index.html": '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>',
        "src/main.tsx": "export const app = 1;",
    })
    before = harbour.site()
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.evaluate("window.formweb.run('file.import-site')")
    chooser.value.set_files(str(source))
    view = harbour.page.locator(".fw-lib-site")
    expect(view.locator(".fw-lib-note")).to_contain_text("Nothing was imported.")
    status, sentence = service_review(harbour, source)
    assert status == 400, f"the service accepted a project's source: {sentence}"
    assert "Build it first" in sentence and sentence.endswith("Nothing was imported.")
    expect(view.locator(".fw-lib-note")).to_have_text(sentence)
    expect(view.locator(".fw-lib-site-review")).to_be_hidden()
    expect(view.locator(".fw-lib-insert")).to_be_disabled()
    assert harbour.site() == before, "the refused zip changed the site"


def test_a_pick_that_mixes_a_zip_with_an_html_file_is_refused_with_one_sentence_and_nothing_is_sent(harbour, tmp_path):
    site_zip = zip_file(tmp_path, "site.zip", {"index.html": html_page("Home", "Welcome")})
    loose = html_file(tmp_path, "extra.html", "Extra")
    sent = []
    harbour.page.on("request", lambda r: sent.append(r.url) if "/api/library/import-site" in r.url else None)
    before = harbour.site()
    view = pick(harbour, "file.import-site", site_zip, loose)
    expect(view.locator(".fw-lib-note")).to_have_text("Choose one .zip file, or one or more .html files.")
    expect(view.locator(".fw-lib-site-review")).to_be_hidden()
    expect(view.locator(".fw-lib-insert")).to_be_disabled()
    assert sent == [], f"the mixed pick was sent to the service: {sent}"
    assert harbour.site() == before, "the refused pick changed the site"


def test_the_review_of_a_zip_says_how_many_files_in_system_and_dependency_folders_were_ignored(harbour, tmp_path):
    archive = zip_file(tmp_path, "with-folders.zip", {
        "index.html": html_page("Home", "Welcome"),
        "node_modules/left/index.js": "module.exports = 1;",
        "node_modules/right/index.js": "module.exports = 2;",
        "__MACOSX/._index.html": "x",
    })
    view = pick(harbour, "file.import-site", archive)
    expect(view.locator(".fw-lib-site-review")).to_contain_text("3 files in system and dependency folders are ignored.")


def test_a_second_import_starts_from_a_clean_view_with_no_earlier_review_note_or_greyed_button_behind_the_picker(harbour, tmp_path):
    before = harbour.site()["site"]
    view = pick(harbour, "file.import-site", zip_file(tmp_path, "first.zip", {"timetable.html": html_page("Timetable", "Sailings")}))
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    expect(view.locator(".fw-lib-insert")).to_contain_text("Imported")
    harbour.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "the first import")
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.evaluate("window.formweb.run('file.import-site')")
    expect_clean_site_view(view)
    chooser.value.set_files(str(zip_file(tmp_path, "second.zip", {"fares.html": html_page("Fares", "Prices")})))
    rows = view.locator(".fw-lib-site-review .fw-lib-site-item")
    expect(rows).to_have_count(1)
    expect(rows).to_contain_text("fares.html")
    expect(view.locator(".fw-lib-note")).to_have_text("")
    with harbour.page.expect_file_chooser():
        harbour.page.evaluate("window.formweb.run('file.import-html')")
    expect(view).to_be_hidden()
    expect(harbour.page.locator(".fw-lib-import:not(.fw-lib-site) .fw-lib-import-part").first).to_be_visible()


def test_nothing_above_the_review_or_a_refusal_moves_when_it_appears(harbour, tmp_path):
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.evaluate("window.formweb.run('file.import-site')")
    view = harbour.page.locator(".fw-lib-site")
    choose = view.locator(".fw-lib-choose:not(.fw-lib-site-back)")
    files = view.locator(".fw-lib-site-files")
    button = view.locator(".fw-lib-insert")
    expect(choose).to_be_visible()
    places = lambda: {"choose button (top, height)": box(choose), "chosen-file list top": box(files)[0], "import button (top, height)": box(button)}
    waiting = places()
    chooser.value.set_files(str(zip_file(tmp_path, "two.zip", {"a.html": html_page("Alpha", "A"), "b.html": html_page("Beta", "B")})))
    expect(view.locator(".fw-lib-site-review .fw-lib-site-item")).to_have_count(2)
    assert places() == waiting, "something above the review moved when the review appeared"
    refused = zip_file(tmp_path, "notes.zip", {"package.json": "{}", "src/app.js": "x"})
    with harbour.page.expect_file_chooser() as chooser:
        harbour.page.evaluate("window.formweb.run('file.import-site')")
    assert places() == waiting, "the view behind the second picker is not laid out as the first waiting view"
    chooser.value.set_files(str(refused))
    expect(view.locator(".fw-lib-note")).to_contain_text("Nothing was imported.")
    assert places() == waiting, "something moved when the refusal appeared"


HEADING = "Crème brûlée à €4,50"
PARAGRAPH = "“Déjà vu” – naïve façade, Œuvre, señor, Zürich, ‘quoted’."


def encoded_page(title, encoding):
    return f"<!doctype html><html><head><title>{title}</title></head><body><h1>{HEADING}</h1><p>{PARAGRAPH}</p></body></html>".encode(encoding)


def import_as_code(editor, view, what):
    before = code_sections(editor.site()["site"])
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    site = editor.until(lambda s: len(code_sections(s)) == len(before) + 1, what)
    added = [record for key, record in code_sections(site).items() if key not in before]
    return site, added[0]["html"]


@pytest.mark.parametrize("encoding", ["windows-1252", "utf-8-sig"])
def test_a_picked_html_file_not_in_plain_utf8_arrives_with_the_same_text_as_inside_a_zip_as_a_page_and_as_a_section(harbour, tmp_path, encoding):
    title = "Café " + encoding
    data = encoded_page(title, encoding)
    assert data.startswith(b"\xef\xbb\xbf") if encoding == "utf-8-sig" else b"\x80" in data and b"\x93" in data
    archive = tmp_path / "zipped.zip"
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("zipped.html", data)
    loose = tmp_path / "loose.html"
    loose.write_bytes(data)
    _, zipped = import_as_code(harbour, pick(harbour, "file.import-site", archive), "the zipped page")
    site, as_page = import_as_code(harbour, pick(harbour, "file.import-html", loose), "the picked file as a page")
    view = pick(harbour, "file.import-html", loose)
    view.get_by_role("radio", name="As a section of this page").click()
    _, as_section = import_as_code(harbour, view, "the picked file as a section")
    for path, html in (("inside a zip", zipped), ("picked as a page", as_page), ("picked as a section", as_section)):
        assert HEADING in html and PARAGRAPH in html, f"{path}, the text did not arrive as written: {html[:300]!r}"
        assert "�" not in html and "﻿" not in html, f"{path}, a replacement or byte order mark character was stored: {html[:300]!r}"
    assert as_page == zipped, "the picked page differs from the same bytes imported inside a zip"
    assert [name for name in harbour.page_names(site) if name.startswith("Caf")] == [title, title]


def test_after_the_service_refuses_a_picked_file_the_sentence_stays_in_view_nothing_can_be_imported_and_a_new_pick_works(harbour, tmp_path):
    hidden = tmp_path / ".hidden.html"
    hidden.write_text(html_page("Hidden", "Hidden"), "utf-8")
    before = harbour.site()
    view = pick(harbour, "file.import-html", hidden)
    note = view.locator(".fw-lib-note")
    expect(note).to_contain_text("Nothing was imported.")
    request = urllib.request.Request(harbour.base + "/api/library/import-site/review", data=json.dumps({"files": [{"name": ".hidden.html", "html": hidden.read_text("utf-8")}]}).encode(), method="POST", headers={"Content-Type": "application/json", "X-FormWeb-Window-Key": harbour.window_key})
    try:
        urllib.request.urlopen(request, timeout=30)
        raise AssertionError("the service accepted a file whose name starts with a dot")
    except urllib.error.HTTPError as error:
        sentence = json.loads(error.read())["detail"]
    expect(note).to_have_text(sentence)
    expect(note).to_be_in_viewport()
    button = view.locator(".fw-lib-insert")
    expect(button).to_be_disabled()
    view.get_by_role("radio", name="As a section of this page").click()
    expect(view.get_by_role("radio", name="As a section of this page")).to_have_attribute("aria-checked", "true")
    expect(button).to_be_disabled()
    expect(note).to_have_text(sentence)
    expect(note).to_be_in_viewport()
    assert harbour.site() == before, "the refused file changed the site"
    with harbour.page.expect_file_chooser() as chooser:
        view.locator(".fw-lib-choose:not(.fw-lib-site-back)").click()
    chooser.value.set_files(str(html_file(tmp_path, "harbour-walk.html", "Harbour walk")))
    expect(note).to_have_text("")
    expect(view.locator(".fw-lib-site-review")).to_contain_text("/harbour-walk")
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    after = harbour.until(lambda s: len(s["pages"]) == len(before["site"]["pages"]) + 1, "the new pick to import one page")
    assert "Harbour walk" in harbour.page_names(after)
