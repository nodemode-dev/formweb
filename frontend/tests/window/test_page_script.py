import re

import pytest
from playwright.sync_api import expect

SCRIPT = "document.getElementById('ps-target').textContent = 'The page script ran'"
NOTE = "A page script has no box on the page, so these settings do not apply to it."
CONTROLS = "input:visible, select:visible, textarea:visible, button:visible"


def element(key, name, tag="div", text="", attrs=None, styles=None):
    return {"id": key, "tag": tag, "name": name, "text": text, "children": [], "attrs": attrs or {}, "styles": styles or {}, "breakpoints": {}}


@pytest.fixture
def old_script(coldmere):
    coldmere.command(None, [
        {"command": "code.sections.allow", "params": {"enabled": True}},
        {"command": "node.add", "params": {"parent": "hm-hero-copy", "node": element("ps-target", "Target", "p", "Waiting", {"id": "ps-target"})}},
        {"command": "node.add", "params": {"parent": "hm-hero-copy", "node": element("old-script", "Old script", styles={"display": "contents"})}},
        {"command": "code.section.set", "params": {"node": "old-script", "value": {"enabled": True, "html": "", "js": SCRIPT}}},
        {"command": "node.add", "params": {"parent": "hm-hero-copy", "node": element("old-code", "Old code", styles={"display": "contents"})}},
        {"command": "code.section.set", "params": {"node": "old-code", "value": {"enabled": True, "html": "<p>Kept as code</p>", "css": ""}}},
    ], batch=True)
    coldmere.until(lambda site: "old-code" in site["nodes"], "the old-way page script and code section")
    expect(block(coldmere, "old-script")).to_be_visible()
    expect(coldmere.layer_row("old-script")).to_be_visible()
    return coldmere


def block(editor, key):
    return editor.canvas.locator(f'[data-fw-id="{key}"] > [data-fw-poster]')


def click_block(editor, key, button="left"):
    box = block(editor, key).bounding_box()
    editor.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, button=button)


def tab(editor, name):
    return editor.page.locator(".inspector button.quiet", has_text=name)


def is_open(editor, name):
    expect(tab(editor, name)).to_have_class(re.compile(r"\bactive\b"))


def selected(editor):
    return editor.page.locator('#fw-layers-list .layer-row[aria-selected="true"]').evaluate_all("rows => rows.map(r => r.dataset.key)")


def drawn_icon(editor, key):
    return editor.layer_row(key).locator(":scope > .icon").evaluate("i => [...i.querySelectorAll('svg')].filter(s => s.getClientRects().length).map(s => s.innerHTML)")


def outline(locator):
    return locator.evaluate("e => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; }")


def script_box(editor):
    boxes = editor.page.locator(".inspector-scroll textarea")
    values = boxes.evaluate_all("ts => ts.map(t => t.value)")
    assert SCRIPT in values, f"no field in the right panel holds the script; the text fields hold {values}"
    return boxes.nth(values.index(SCRIPT))


def menu_entries(editor):
    return [item.inner_text().split("\n")[0] for item in editor.menu().locator('[role="menuitem"]').all()]


def test_a_script_only_code_section_made_the_old_way_is_shown_on_the_canvas_as_a_page_script_block(old_script):
    words = block(old_script, "old-script").inner_text().split("\n")
    assert words[0] == "Page script"
    assert "Runs in Preview and on the published site, not on this canvas." in words
    expect(old_script.canvas.locator("#ps-target")).to_have_text("Waiting")


def test_clicking_the_page_script_block_selects_its_layer_and_the_block_shows_the_selection_outline(old_script):
    start = old_script.site()["site"]
    old_script.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(old_script.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    selection = outline(old_script.canvas.locator('[data-fw-id="hm-lead"]'))
    assert outline(block(old_script, "old-script")) != selection
    click_block(old_script, "old-script")
    expect(old_script.layer_row("old-script")).to_have_attribute("aria-selected", "true")
    expect(old_script.page.locator(".inspector-name")).to_have_text("Old script")
    assert selected(old_script) == ["old-script"]
    assert outline(block(old_script, "old-script")) == selection
    after = old_script.site()["site"]
    assert after["nodes"]["old-script"] == start["nodes"]["old-script"]
    assert after["extensions"]["code"]["sections"]["old-script"] == start["extensions"]["code"]["sections"]["old-script"]


def test_the_page_script_layer_row_shows_its_own_icon_and_ordinary_rows_do_not(old_script):
    script = drawn_icon(old_script, "old-script")
    ordinary = [drawn_icon(old_script, key) for key in ("hm-lead", "hm-btns", "ps-target")]
    assert len(script) == 1 and all(len(icon) == 1 for icon in ordinary)
    assert all(icon == ordinary[0] for icon in ordinary)
    assert script != ordinary[0], "the Page script row draws the same icon as an ordinary element"
    assert script != drawn_icon(old_script, "old-code"), "the Page script row draws the same icon as a code section with HTML"


def test_a_selected_page_script_shows_its_code_on_content_and_only_the_note_on_design_and_motion(old_script):
    old_script.canvas.locator('[data-fw-id="hm-h1"]').click()
    tab(old_script, "Motion").click()
    is_open(old_script, "Motion")
    click_block(old_script, "old-script")
    expect(old_script.layer_row("old-script")).to_have_attribute("aria-selected", "true")
    is_open(old_script, "Content")
    expect(script_box(old_script)).to_be_in_viewport()
    for name in ("Design", "Motion"):
        tab(old_script, name).click()
        is_open(old_script, name)
        expect(old_script.page.locator(".inspector-scroll").locator(CONTROLS)).to_have_count(0)
        shown = old_script.page.locator(".inspector-scroll").inner_text().strip()
        assert shown == NOTE, f"{name} shows {shown[:300]!r}"


def test_selecting_an_ordinary_element_after_the_page_script_brings_the_controls_and_the_earlier_tab_back(old_script):
    old_script.canvas.locator('[data-fw-id="hm-h1"]').click()
    tab(old_script, "Motion").click()
    is_open(old_script, "Motion")
    controls = old_script.page.locator(".inspector-scroll").locator(CONTROLS)
    expect(controls.first).to_be_visible()
    click_block(old_script, "old-script")
    is_open(old_script, "Content")
    old_script.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(old_script.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    is_open(old_script, "Motion")
    expect(controls.first).to_be_visible()
    expect(old_script.page.locator(".inspector-scroll").get_by_text(NOTE, exact=True).locator("visible=true")).to_have_count(0)
    tab(old_script, "Design").click()
    is_open(old_script, "Design")
    expect(controls.first).to_be_visible()
    expect(old_script.page.locator(".inspector-scroll").get_by_text(NOTE, exact=True).locator("visible=true")).to_have_count(0)


def test_the_page_script_menu_has_no_background_spacing_or_size_while_an_ordinary_elements_menu_has_them(old_script):
    design = {"Background", "Spacing", "Size"}
    click_block(old_script, "old-script", button="right")
    expect(old_script.menu()).to_be_visible()
    script = menu_entries(old_script)
    old_script.page.keyboard.press("Escape")
    assert selected(old_script) == ["old-script"]
    assert {"Copy", "Delete", "Rename", "Select parent"} <= set(script), script
    assert not design & set(script), script
    old_script.canvas.locator('[data-fw-id="hm-lead"]').click(button="right")
    expect(old_script.menu()).to_be_visible()
    ordinary = menu_entries(old_script)
    old_script.page.keyboard.press("Escape")
    assert design <= set(ordinary), ordinary


def test_a_code_section_with_html_reads_code_section_and_a_click_on_its_block_goes_to_the_element_around_it(old_script):
    expect(block(old_script, "old-code")).to_have_text("Code section")
    click_block(old_script, "old-code")
    expect(old_script.layer_row("hm-hero-copy")).to_have_attribute("aria-selected", "true")
    assert selected(old_script) == ["hm-hero-copy"]


def test_a_heading_dragged_onto_the_page_script_block_is_never_dropped_inside_it(old_script):
    start = old_script.site()["site"]
    old_script.canvas.locator('[data-fw-id="hm-h1"]').click()
    expect(old_script.layer_row("hm-h1")).to_have_attribute("aria-selected", "true")
    source = old_script.canvas.locator('[data-fw-id="hm-h1"]').bounding_box()
    target = block(old_script, "old-script").bounding_box()
    pointer = old_script.canvas_pointer()
    pointer.move(source["x"] + 12, source["y"] + 8)
    pointer.down()
    pointer.move(target["x"] + target["width"] / 2, target["y"] + target["height"] / 2, steps=15, held=True)
    where = old_script.page.locator(".fw-canvas-proxy-where")
    expect(where).to_have_text(re.compile(r"\S"))
    landing = where.inner_text()
    assert not landing.startswith("Inside Old script"), landing
    pointer.up()
    expect(old_script.page.locator("body")).not_to_have_class(re.compile(r"\bfw-canvas-dragging\b"))
    if landing == "Stays where it is":
        assert old_script.site()["site"] == start
    else:
        old_script.changed_from(start)
    assert old_script.site()["site"]["nodes"]["old-script"]["children"] == []


def test_the_page_script_runs_in_preview_as_published(old_script):
    expect(old_script.canvas.locator("#ps-target")).to_have_text("Waiting")
    old_script.page.locator('[data-cmd="view.preview-full"]').click()
    overlay = old_script.page.get_by_role("dialog", name="Preview as published")
    expect(overlay).to_be_visible()
    shown = overlay.locator("iframe.fw-fp-frame:visible")
    expect(shown).to_have_count(1)
    expect(overlay.frame_locator("iframe.fw-fp-frame:visible").locator("#ps-target")).to_have_text("The page script ran")
