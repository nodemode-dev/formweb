import re

from playwright.sync_api import expect

FRAMES = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))"


def centre(box, dx=0, dy=0):
    return box["x"] + box["width"] / 2 + dx, box["y"] + box["height"] / 2 + dy


def on_canvas(editor, key):
    return editor.canvas.locator(f'[data-fw-id="{key}"]')


def marked(editor):
    return editor.canvas.locator("[data-fw-hover]")


def marked_rows(editor):
    return editor.page.locator("#fw-layers-list .layer-row[data-fw-hover]")


def marked_keys(editor):
    return marked(editor).evaluate_all("els => els.map(e => e.dataset.fwId)")


def settle(editor):
    editor.page.evaluate(FRAMES)


def nothing_marked(editor, what):
    settle(editor)
    assert marked_keys(editor) == [], f"{what}: the canvas shows a hover outline on {marked_keys(editor)}"
    rows = marked_rows(editor).evaluate_all("rows => rows.map(r => r.dataset.key)")
    assert rows == [], f"{what}: the Layers list tints {rows}"


def point_at_row(editor, key, dx=0):
    editor.layer_row(key).scroll_into_view_if_needed()
    editor.page.mouse.move(*centre(editor.layer_row(key).bounding_box(), dx))


def point_at_element(editor, key, dx=0):
    editor.page.mouse.move(*centre(on_canvas(editor, key).bounding_box(), dx))


def outline(locator):
    return locator.evaluate("e => { const s = getComputedStyle(e); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; }")


def layout(editor):
    return {
        "boxes": editor.canvas.locator("[data-fw-id]").evaluate_all("els => els.slice(0, 80).map(e => { const r = e.getBoundingClientRect(); return [e.dataset.fwId, r.x, r.y, r.width, r.height]; })"),
        "scroll": editor.canvas.locator("html").evaluate("e => e.ownerDocument.scrollingElement.scrollTop"),
        "selected": editor.page.locator('#fw-layers-list .layer-row[aria-selected="true"]').evaluate_all("rows => rows.map(r => r.dataset.key)"),
        "inspector": editor.page.locator(".inspector-name").inner_text(),
    }


def hover_menu_item(editor):
    editor.page.locator('[data-menu="View"]').click()
    return editor.page.locator('[role="menu"]:visible [data-command="view.hover-outline"]')


def test_resting_on_a_layer_row_outlines_exactly_its_element_thinner_than_the_selection_and_moves_nothing(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').click()
    expect(coldmere.layer_row("hm-eyebrow")).to_have_attribute("aria-selected", "true")
    coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    before = layout(coldmere)
    point_at_row(coldmere, "hm-lead")
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-lead"]
    hover = outline(on_canvas(coldmere, "hm-lead"))
    selection = outline(on_canvas(coldmere, "hm-eyebrow"))
    assert hover["style"] != "none" and hover["width"] > 0, hover
    assert hover["width"] < selection["width"], f"hover outline {hover} is not thinner than the selection outline {selection}"
    assert layout(coldmere) == before
    coldmere.page.mouse.move(720, 890)
    expect(marked(coldmere)).to_have_count(0)


def test_resting_on_a_canvas_element_outlines_it_and_tints_its_layer_row_without_scrolling_the_list(coldmere):
    row = coldmere.layer_row("hm-lead")
    top = coldmere.layer_row("root").bounding_box()
    plain = row.evaluate("r => getComputedStyle(r).backgroundColor")
    point_at_element(coldmere, "hm-lead")
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-lead"]
    expect(marked_rows(coldmere)).to_have_count(1)
    expect(row).to_have_attribute("data-fw-hover", "")
    assert row.evaluate("r => getComputedStyle(r).backgroundColor") != plain
    assert coldmere.layer_row("root").bounding_box() == top
    point_at_element(coldmere, "hm-h1")
    expect(row).not_to_have_attribute("data-fw-hover", "")
    assert marked_keys(coldmere) == ["hm-h1"]


def test_the_selected_element_never_gets_a_hover_outline(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(coldmere.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    point_at_element(coldmere, "hm-h1")
    expect(marked(coldmere)).to_have_count(1)
    point_at_element(coldmere, "hm-lead")
    expect(marked(coldmere)).to_have_count(0)
    nothing_marked(coldmere, "pointing at the selected element")
    point_at_row(coldmere, "hm-h1")
    expect(marked(coldmere)).to_have_count(1)
    point_at_row(coldmere, "hm-lead")
    expect(marked(coldmere)).to_have_count(0)
    nothing_marked(coldmere, "pointing at the selected row")


def test_nothing_is_marked_during_a_canvas_drag(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    lead, h1 = on_canvas(coldmere, "hm-lead").bounding_box(), on_canvas(coldmere, "hm-h1").bounding_box()
    pointer = coldmere.canvas_pointer()
    pointer.move(lead["x"] + 12, lead["y"] + 8)
    pointer.down()
    pointer.move(h1["x"] + 6, h1["y"] + h1["height"] * 0.3, steps=15, held=True)
    expect(coldmere.page.locator("body")).to_have_class(re.compile(r"\bfw-canvas-dragging\b"))
    pointer.move(*centre(h1), steps=3, held=True)
    nothing_marked(coldmere, "during a canvas drag")
    coldmere.page.keyboard.press("Escape")
    pointer.up()
    expect(coldmere.status).to_have_text("Drag cancelled. Nothing moved.")
    pointer.move(*centre(h1, 3), steps=2)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-h1"]


def test_nothing_is_marked_during_a_layer_drag(coldmere):
    coldmere.layer_row("hm-eyebrow").scroll_into_view_if_needed()
    source, target = coldmere.layer_row("hm-lead").bounding_box(), coldmere.layer_row("hm-eyebrow").bounding_box()
    coldmere.page.mouse.move(source["x"] + 60, source["y"] + source["height"] / 2)
    coldmere.page.mouse.down()
    coldmere.page.mouse.move(target["x"] + 60, target["y"] + 4, steps=10)
    expect(coldmere.page.locator(".fw-drop-line")).to_be_visible()
    coldmere.page.mouse.move(target["x"] + 62, target["y"] + 5)
    nothing_marked(coldmere, "during a layer drag")
    start = coldmere.site()["site"]
    coldmere.page.mouse.up()
    coldmere.changed_from(start)
    point_at_row(coldmere, "hm-h1", 4)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-h1"]


def test_nothing_is_marked_while_text_is_being_edited(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').dblclick()
    editing = coldmere.canvas.locator('[data-fw-text="hm-h1"][contenteditable="true"]')
    expect(editing).to_be_visible()
    point_at_element(coldmere, "hm-lead")
    nothing_marked(coldmere, "pointing at an element while text is edited")
    point_at_row(coldmere, "hm-eyebrow")
    nothing_marked(coldmere, "pointing at a row while text is edited")
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(coldmere.canvas.locator('[contenteditable="true"]')).to_have_count(0)
    point_at_row(coldmere, "hm-eyebrow", 4)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-eyebrow"]


def test_nothing_is_marked_while_a_context_menu_is_open(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').click(button="right")
    expect(coldmere.menu()).to_be_visible()
    point_at_row(coldmere, "hm-lead")
    nothing_marked(coldmere, "pointing at a row with the canvas menu open")
    coldmere.page.keyboard.press("Escape")
    expect(coldmere.page.locator('[role="menu"]:visible')).to_have_count(0)
    point_at_row(coldmere, "hm-lead", 4)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-lead"]


def test_nothing_is_marked_while_quick_insert_is_open(coldmere):
    coldmere.page.get_by_role("button", name="Insert element").click()
    flyout = coldmere.page.locator('.fw-flyout[aria-label="Quick insert"]')
    expect(flyout).to_be_visible()
    point_at_element(coldmere, "hm-lead")
    nothing_marked(coldmere, "pointing at an element with Quick insert open")
    point_at_row(coldmere, "hm-eyebrow")
    nothing_marked(coldmere, "pointing at a row with Quick insert open")
    coldmere.page.keyboard.press("Escape")
    expect(flyout).to_be_hidden()
    point_at_element(coldmere, "hm-lead", 4)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-lead"]


def test_nothing_is_marked_in_preview_as_published(coldmere):
    overlay = coldmere.page.get_by_role("dialog", name="Preview as published")
    lead = on_canvas(coldmere, "hm-lead").bounding_box()
    row = coldmere.layer_row("hm-h1")
    row.scroll_into_view_if_needed()
    coldmere.page.locator('[data-cmd="view.preview-full"]').click()
    expect(overlay).to_be_visible()
    coldmere.page.mouse.move(*centre(lead))
    coldmere.page.mouse.move(*centre(row.bounding_box()))
    nothing_marked(coldmere, "in Preview as published")
    coldmere.page.keyboard.press("Escape")
    expect(overlay).to_be_hidden()
    point_at_row(coldmere, "hm-h1", 4)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-h1"]


def test_a_pen_pointer_never_marks_anything_where_the_mouse_does(coldmere):
    lead = centre(on_canvas(coldmere, "hm-lead").bounding_box())
    coldmere.layer_row("hm-eyebrow").scroll_into_view_if_needed()
    row = centre(coldmere.layer_row("hm-eyebrow").bounding_box())
    pen = coldmere.pen()
    pen.move(*lead, steps=4)
    nothing_marked(coldmere, "a pen resting on an element")
    pen.move(*row, steps=4)
    nothing_marked(coldmere, "a pen resting on a row")
    mouse = coldmere.canvas_pointer()
    mouse.move(lead[0] + 3, lead[1], steps=2)
    expect(marked(coldmere)).to_have_count(1)
    assert marked_keys(coldmere) == ["hm-lead"]


def test_show_hover_outlines_is_on_at_first_switches_the_marks_off_survives_a_reload_and_is_never_in_the_site(coldmere):
    item = hover_menu_item(coldmere)
    expect(item).to_have_attribute("aria-checked", "true")
    coldmere.page.keyboard.press("Escape")
    point_at_element(coldmere, "hm-lead")
    expect(marked(coldmere)).to_have_count(1)
    start = coldmere.site()
    hover_menu_item(coldmere).click()
    expect(coldmere.status).to_have_text("Hover outlines are off.")
    point_at_element(coldmere, "hm-h1")
    nothing_marked(coldmere, "with hover outlines off")
    point_at_row(coldmere, "hm-eyebrow")
    nothing_marked(coldmere, "pointing at a row with hover outlines off")
    coldmere.page.reload()
    coldmere.page.get_by_role("button", name="Back to Editor").click()
    coldmere.page_row("services").wait_for()
    coldmere.canvas.locator('[data-fw-id="root"]').wait_for()
    expect(on_canvas(coldmere, "hm-lead")).to_be_visible()
    expect(hover_menu_item(coldmere)).to_have_attribute("aria-checked", "false")
    coldmere.page.keyboard.press("Escape")
    point_at_element(coldmere, "hm-lead", 3)
    nothing_marked(coldmere, "after a reload with hover outlines off")
    assert coldmere.site() == start
    hover_menu_item(coldmere).click()
    expect(coldmere.status).to_contain_text("Hover outlines are on")
    point_at_element(coldmere, "hm-h1", 3)
    expect(marked(coldmere)).to_have_count(1)
    assert coldmere.site() == start

