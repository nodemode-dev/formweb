import io
import re
import struct
import tempfile
import urllib.request
import zipfile
import zlib
from pathlib import Path

import pytest
from playwright.sync_api import expect

PASTE_TOTAL = "A paste can bring at most 8,000 elements in all. Copy fewer elements at a time."
NOT_CLIPPED = "e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1"


def one_pixel_png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\x10\x80\x30")) + chunk(b"IEND", b"")


def boxes(locator):
    return locator.evaluate_all("els => els.map(e => { const r = e.getBoundingClientRect(); return [e.className, r.x, r.y, r.width, r.height]; })")


def test_the_width_note_is_readable_beside_a_long_selection_path_and_moves_nothing(coldmere):
    page = coldmere.page
    coldmere.layer_row("hm-t3-t").scroll_into_view_if_needed()
    coldmere.layer_row("hm-t3-t").click()
    crumbs = page.locator(".fw-crumbs .fw-crumb:not(.fw-crumb-more)")
    expect(crumbs).to_have_count(8)
    hint = page.locator(".viewport-hint")
    others = page.locator(".stage-head > :not(.viewport-hint):not(.fw-crumbs)")
    head = page.locator(".stage-head").bounding_box()
    fixed = boxes(others)
    trail = page.locator(".fw-crumbs").bounding_box()
    expect(hint).to_be_hidden()
    width = page.get_by_label("Canvas viewport width in pixels")
    width.fill("700")
    width.press("Enter")
    expect(hint).to_be_visible()
    expect(hint).to_contain_text("outside this breakpoint")
    assert hint.evaluate(NOT_CLIPPED)
    note = hint.bounding_box()
    now = page.locator(".fw-crumbs").bounding_box()
    assert now["x"] + now["width"] <= note["x"] + 1, f"the path {now} runs under the note {note}"
    assert (now["x"], now["y"], now["height"]) == (trail["x"], trail["y"], trail["height"])
    assert boxes(others) == fixed
    assert page.locator(".stage-head").bounding_box() == head
    assert "Desktop" in page.locator("select").evaluate_all("ss => ss.map(s => s.selectedOptions[0]?.textContent)")
    width.fill("1280")
    width.press("Enter")
    expect(hint).to_be_hidden()
    assert boxes(others) == fixed
    assert page.locator(".stage-head").bounding_box() == head


@pytest.mark.parametrize("width", [1100, 1440])
def test_a_deep_selection_path_folds_its_middle_into_a_menu_and_no_crumbs_overlap(coldmere, width):
    page = coldmere.page
    page.set_viewport_size({"width": width, "height": 900})
    coldmere.layer_row("hm-t3-t").scroll_into_view_if_needed()
    coldmere.layer_row("hm-t3-t").click()
    current = page.locator('.fw-crumbs .fw-crumb[aria-current="true"]')
    expect(current).to_have_text("Hm t3 t")
    shown = boxes(page.locator(".fw-crumbs > .fw-crumb:visible"))
    assert len(shown) >= 2
    for left, right in zip(shown, shown[1:]):
        assert left[1] + left[3] <= right[1] + 0.5, f"{left} overlaps {right}"
    trail = page.locator(".fw-crumbs").bounding_box()
    assert shown[-1][1] + shown[-1][3] <= trail["x"] + trail["width"] + 0.5
    assert trail["x"] + trail["width"] <= page.locator(".viewport-hint").bounding_box()["x"] + 1
    assert current.evaluate("e => e.clientWidth >= Math.min(e.scrollWidth, 40)")
    more = page.get_by_role("button", name="Show the hidden part of the selection path")
    expect(more).to_be_visible()
    more.click()
    hidden = coldmere.menu().locator(".fw-menu-label").all_inner_texts()
    assert hidden and set(hidden) <= {"Page", "Hm main", "Hm hero", "Hm hero in", "Hm hero copy", "Hm ticks", "Hm t3"}
    assert "Hm hero" in hidden
    coldmere.menu().get_by_role("menuitem", name="Hm hero", exact=True).click()
    expect(current).to_have_text("Hm hero")
    expect(coldmere.layer_row("hm-hero")).to_have_attribute("aria-selected", "true")


def test_a_site_with_no_themes_reads_none_and_neither_theme_button_is_pressed(coldmere):
    page = coldmere.page
    switch = page.get_by_role("group", name="Canvas theme")
    for name in ("Preview dark theme", "Preview light theme"):
        expect(switch.get_by_role("button", name=name)).to_have_attribute("aria-pressed", "false")
        expect(switch.get_by_role("button", name=name)).to_be_disabled()
    page.locator('[data-menu="Window"]').click()
    page.locator('[role="menu"]:visible [data-command="window.tokens"]').click()
    dialog = page.get_by_role("dialog", name="Design system tokens")
    expect(dialog.locator('[data-field="themes.default"] option:checked')).to_have_text("None")
    assert not coldmere.site()["site"].get("settings", {}).get("themes")


def test_the_plus_shortcut_shows_as_plus_and_the_key_picks_add_anchor_point(coldmere):
    page = coldmere.page
    page.locator('[data-menu="Vector"]').click()
    item = page.locator('[role="menu"]:visible [data-command="vector.add-anchor"]')
    expect(item.locator(".fw-menu-keys")).to_have_text("+")
    page.keyboard.press("Escape")
    command = next(c for c in page.evaluate("window.formweb.commands()") if c["id"] == "vector.add-anchor")
    assert command["keys"] == ["+"]
    assert command["checked"] is False
    coldmere.layer_row("hd-mark").click()
    page.keyboard.press("+")
    coldmere.eventually(lambda: next(c for c in page.evaluate("window.formweb.commands()") if c["id"] == "vector.add-anchor")["checked"], "Add Anchor Point to be picked")


@pytest.fixture
def new_image(coldmere):
    page = coldmere.page
    start = coldmere.site()["site"]
    coldmere.layer_row("hm-hero-copy").click()
    page.locator('[data-menu="Insert"]').click()
    with page.expect_file_chooser() as chooser:
        page.locator('[role="menu"]:visible [data-command="insert.image"]').click()
    chooser.value.set_files(files=[{"name": "dot.png", "mimeType": "image/png", "buffer": one_pixel_png()}])
    site = coldmere.changed_from(start)
    image = next(key for key in site["nodes"] if key not in start["nodes"])
    assert site["nodes"][image]["tag"] == "img"
    page.locator(".inspector button.quiet", has_text="Content").click()
    return coldmere, image


def audit_rows_for(editor, key):
    editor.page.locator('[data-cmd="page.audit"]').click()
    dialog = editor.page.get_by_role("dialog", name="SEO & accessibility audit")
    expect(dialog.locator(".empty-note:visible").first).to_contain_text("found")
    rows = dialog.locator(f'.audit-row[data-node="{key}"]').all_inner_texts()
    editor.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    return rows


def test_decorative_image_and_clearing_alt_text_follow_the_audit(new_image):
    editor, image = new_image
    alt = editor.page.get_by_role("textbox", name="Alternative text")
    decorative = editor.page.get_by_role("checkbox", name=re.compile("Decorative image"))
    assert "alt" not in editor.site()["site"]["nodes"][image]["attrs"]
    assert any("needs alt text" in row for row in audit_rows_for(editor, image))
    before = editor.site()["site"]
    decorative.check()
    site = editor.changed_from(before)
    assert site["nodes"][image]["attrs"]["alt"] == ""
    expect(alt).to_be_disabled()
    assert audit_rows_for(editor, image) == []
    decorative.uncheck()
    site = editor.changed_from(site)
    expect(alt).to_be_enabled()
    alt.fill("A teal dot")
    alt.press("Tab")
    site = editor.changed_from(site)
    assert site["nodes"][image]["attrs"]["alt"] == "A teal dot"
    assert audit_rows_for(editor, image) == []
    alt.fill("")
    alt.press("Tab")
    site = editor.changed_from(site)
    assert "alt" not in site["nodes"][image]["attrs"]
    assert any("needs alt text" in row for row in audit_rows_for(editor, image))


def test_opening_a_demo_changes_none_of_its_images_alt_text(coldmere):
    site = coldmere.site()["site"]
    images = {key: node["attrs"].get("alt") for key, node in site["nodes"].items() if node["tag"] == "img"}
    assert images
    assert all(text for text in images.values()), images


def test_undo_redo_renames_and_a_token_edit_each_say_what_happened(coldmere):
    page = coldmere.page
    seen = []

    def changed(before):
        site = coldmere.changed_from(before)
        expect(coldmere.status).not_to_have_text(seen[-1] if seen else "")
        seen.append(coldmere.status.inner_text())
        return site

    site = coldmere.site()["site"]
    page.locator('[data-menu="Window"]').click()
    page.locator('[role="menu"]:visible [data-command="window.tokens"]').click()
    dialog = page.get_by_role("dialog", name="Design system tokens")
    token = dialog.locator('.tokens-row[data-key="accent"] > input').first
    token.fill("#123456")
    token.press("Enter")
    site = changed(site)
    assert "--accent" in seen[-1]
    dialog.get_by_role("button", name="Close").last.click()
    expect(dialog).to_be_hidden()
    coldmere.undo()
    site = changed(site)
    page.keyboard.press("Control+Shift+z")
    site = changed(site)
    coldmere.layer_row("hm-lead").click()
    page.keyboard.press("F2")
    page.keyboard.type("Lead text")
    page.keyboard.press("Enter")
    site = changed(site)
    assert "Lead text" in seen[-1]
    coldmere.page_row("services").click()
    page.keyboard.press("F2")
    page.keyboard.press("Control+a")
    page.keyboard.type("Our services")
    page.keyboard.press("Enter")
    site = changed(site)
    assert "Our services" in seen[-1]
    assert len(set(seen)) == 5, seen
    assert "--accent" not in seen[1] and "--accent" not in seen[2]


def test_add_page_fills_the_address_from_the_name_and_refuses_a_taken_one(coldmere):
    page = coldmere.page
    start = coldmere.site()["site"]
    page.get_by_role("button", name="Add page").click()
    dialog = page.get_by_role("dialog", name="Add page")
    name = dialog.get_by_role("textbox", name="Page name")
    slug = dialog.get_by_role("textbox", name="URL slug")
    name.fill("Boiler Repairs")
    expect(slug).to_have_value("/boiler-repairs")
    name.fill("Services")
    expect(slug).to_have_value("/services")
    dialog.get_by_role("button", name="Add page").click()
    expect(dialog).to_be_visible()
    expect(dialog.locator(".fw-page-address")).to_contain_text("/services")
    assert coldmere.site()["site"] == start
    slug.fill("/our-services")
    name.fill("Services again")
    expect(slug).to_have_value("/our-services")
    dialog.get_by_role("button", name="Add page").click()
    site = coldmere.until(lambda s: len(s["pages"]) == len(start["pages"]) + 1, "the new page")
    assert site["pages"][-1]["slug"] == "/our-services"
    assert site["pages"][-1]["name"] == "Services again"


def test_add_page_refuses_an_address_another_page_has_in_capital_letters_as_the_engine_does(coldmere):
    page = coldmere.page
    start = coldmere.site()["site"]
    owner = next(p["name"] for p in start["pages"] if p["slug"].strip("/") == "services")
    page.get_by_role("button", name="Add page").click()
    dialog = page.get_by_role("dialog", name="Add page")
    dialog.get_by_role("textbox", name="Page name").fill("Loud services")
    dialog.get_by_role("textbox", name="URL slug").fill("/SERVICES")
    note = dialog.locator(".fw-page-address")
    expect(note).to_have_class(re.compile(r"\berror\b"))
    expect(note).to_contain_text(owner)
    dialog.get_by_role("button", name="Add page").click()
    expect(dialog).to_be_visible()
    assert coldmere.site()["site"] == start
    with pytest.raises(urllib.error.HTTPError) as refusal:
        coldmere.command("page.add", {"name": "Loud services", "slug": "/SERVICES"})
    assert owner in refusal.value.read().decode()
    assert coldmere.site()["site"] == start


@pytest.mark.parametrize("language", ["en", "de"])
def test_library_tabs_are_not_clipped_at_the_minimum_window_size(editor, language):
    page = editor.page
    page.set_viewport_size({"width": 760, "height": 640})
    if language != "en":
        page.keyboard.press("Control+,")
        picker = page.get_by_label("Editor language")
        picker.select_option(language)
        expect(page.locator("html")).to_have_attribute("lang", language)
        page.keyboard.press("Escape")
    editor.open_demo("coldmere-plumbing", "services")
    page.locator('[data-command="window.library"]').first.click()
    tabs = page.locator(".fw-lib-tabs [role=tab]")
    expect(tabs).to_have_count(3)
    for tab in tabs.all():
        expect(tab).to_be_visible()
        assert tab.evaluate(NOT_CLIPPED), f"{tab.inner_text()!r} is clipped"
        text_box = tab.evaluate("e => { const r = document.createRange(); r.selectNodeContents(e); const t = r.getBoundingClientRect(); const b = e.getBoundingClientRect(); return [t.left >= b.left - 0.5, t.right <= b.right + 0.5, t.top >= b.top - 0.5, t.bottom <= b.bottom + 0.5]; }")
        assert all(text_box), f"{tab.inner_text()!r} runs outside its tab"
    if language == "de":
        assert tabs.nth(0).inner_text() != "Sections" or tabs.nth(2).inner_text() != "Import HTML"


def test_unstyled_text_has_the_same_font_on_the_canvas_and_in_the_exported_page(editor):
    page = editor.page
    page.locator('[data-run="file.new"]').first.click()
    page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    expect(page.locator("#fw-layers-list .layer-row")).to_have_count(1)
    start = editor.site()["site"]
    page.get_by_role("button", name="Add page").click()
    dialog = page.get_by_role("dialog", name="Add page")
    dialog.get_by_role("textbox", name="Page name").fill("Plain")
    dialog.get_by_role("button", name="Add page").click()
    site = editor.until(lambda s: len(s["pages"]) == 2, "the new page")
    plain = site["pages"][-1]
    expect(editor.page_row(plain["id"])).to_have_attribute("aria-current", "page")
    page.get_by_role("button", name="Insert element").click()
    page.keyboard.type("Paragraph")
    page.keyboard.press("Enter")
    site = editor.until(lambda s: len(s["nodes"][plain["root"]]["children"]) == 1, "the paragraph")
    paragraph = site["nodes"][plain["root"]]["children"][0]
    revision = editor.command("node.update", {"id": plain["root"], "patch": {"styles": {"font-family": None}}})["revision"]
    site = editor.until(lambda s: "font-family" not in s["nodes"][plain["root"]]["styles"], "the page root without a font")
    expect(page.locator("footer.statusbar .status-revision")).to_contain_text(f"rev {revision}")
    expect(editor.canvas.locator(f'[data-fw-id="{plain["root"]}"]')).not_to_have_attribute("style", re.compile("font-family"))
    assert not {"font", "font-family"} & (set(site["nodes"][paragraph]["styles"]) | set(site["nodes"][plain["root"]]["styles"]))
    on_canvas = editor.canvas.locator(f'[data-fw-id="{paragraph}"]').evaluate("e => getComputedStyle(e).fontFamily")
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    folder = Path(tempfile.mkdtemp(prefix="formweb-export-"))
    archive.extractall(folder)
    exported = page.context.new_page()
    exported.goto((folder / plain["slug"].strip("/") / "index.html").as_uri())
    text = site["nodes"][paragraph]["text"]
    published = exported.locator("p", has_text=text).first
    expect(published).to_be_visible()
    assert published.evaluate("e => getComputedStyle(e).fontFamily") == on_canvas
    exported.close()


def test_a_one_letter_search_ends_with_a_row_saying_the_first_120_are_shown_that_cannot_be_picked(coldmere):
    page = coldmere.page
    field = page.get_by_placeholder("Search properties")
    field.fill("a")
    more = page.locator(".inspector-results-more")
    expect(more).to_have_text("Showing the first 120 results. Type more to narrow it down.")
    rows = page.locator("#inspector-results-list > *")
    assert rows.count() <= 120
    assert more.get_attribute("role") != "option"
    more.click()
    expect(field).to_have_value("a")
    expect(more).to_be_visible()


def test_ctrl_click_on_a_layer_a_page_and_a_canvas_element_adds_and_never_opens_a_menu(coldmere):
    page = coldmere.page
    menus = page.locator('[role="menu"]:visible')
    coldmere.layer_row("hm-eyebrow").click()
    coldmere.layer_row("hm-lead").click(modifiers=["Control"])
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(2)
    expect(menus).to_have_count(0)
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').click(modifiers=["Control"])
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(3)
    expect(menus).to_have_count(0)
    coldmere.page_row("about").click(modifiers=["Control"])
    expect(page.locator('#fw-pages-list .list-row[aria-selected="true"]')).to_have_count(2)
    expect(menus).to_have_count(0)


def test_copying_more_than_8000_elements_in_all_is_refused_in_one_sentence_and_the_clipboard_is_kept(editor):
    page = editor.page
    page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=editor.base)
    page.locator('[data-run="file.new"]').first.click()
    page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    expect(page.locator("#fw-layers-list .layer-row")).to_have_count(1)
    root = editor.site()["site"]["pages"][0]["root"]
    commands = []
    for block in range(5):
        commands.append({"command": "node.add", "params": {"parent": root, "node": {"id": f"block-{block}", "tag": "section"}}})
        commands += [{"command": "node.add", "params": {"parent": f"block-{block}", "node": {"id": f"b{block}-{i}", "tag": "i"}}} for i in range(1601)]
    for at in range(0, len(commands), 4000):
        revision = editor.command(None, commands[at:at + 4000], batch=True)["revision"]
    expect(page.locator("footer.statusbar .status-revision")).to_contain_text(f"rev {revision}")
    editor.layer_row("block-0").click(button="right")
    editor.menu().get_by_role("menuitem", name="Collapse all").click()
    expect(page.locator("#fw-layers-list .layer-row")).to_have_count(6)
    expect(editor.layer_row("block-0")).to_have_attribute("aria-selected", "true")
    editor.layer_row("block-0").focus()
    page.keyboard.press("Control+a")
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(5)
    page.evaluate("navigator.clipboard.writeText('kept on the clipboard')")
    page.keyboard.press("Control+c")
    expect(editor.status).to_have_text(PASTE_TOTAL)
    assert page.evaluate("navigator.clipboard.readText()") == "kept on the clipboard"
    assert editor.site()["revision"] == revision
