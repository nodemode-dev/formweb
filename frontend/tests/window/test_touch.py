import re

import pytest
from playwright.sync_api import expect

from test_canvas import section_with_two_headings  # noqa: F401

LIFTED = "#fw-layers-list .layer-row.is-lifted"
POINTER_TYPES = """() => { window.__pointerTypes = [];
  const note = e => window.__pointerTypes.push(e.pointerType);
  document.addEventListener('pointerdown', note, true);
  document.querySelector('iframe[title="Website canvas"]').contentDocument.addEventListener('pointerdown', note, true); }"""


@pytest.fixture
def touch_coldmere(touch_editor):
    touch_editor.open_demo("coldmere-plumbing", "services")
    return touch_editor


@pytest.fixture
def editor(touch_editor):
    return touch_editor


def centre_left(box, dx=60):
    return box["x"] + dx, box["y"] + box["height"] / 2


def hero_copy(editor):
    return editor.site()["site"]["nodes"]["hm-hero-copy"]["children"]


def test_a_long_press_lifts_a_layer_row_and_moving_drops_it_in_one_undo_step(touch_coldmere):
    start = touch_coldmere.site()["site"]
    assert hero_copy(touch_coldmere)[:3] == ["hm-eyebrow", "hm-h1", "hm-lead"]
    touch_coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    x, y = centre_left(touch_coldmere.layer_row("hm-lead").bounding_box())
    target = touch_coldmere.layer_row("hm-eyebrow").bounding_box()
    finger = touch_coldmere.finger()
    finger.down(x, y)
    expect(touch_coldmere.layer_row("hm-lead")).to_have_class(re.compile(r"\bis-lifted\b"))
    finger.move(x, target["y"] + 4, steps=10)
    expect(touch_coldmere.page.locator(".fw-drop-line")).to_be_visible()
    finger.up()
    moved = touch_coldmere.changed_from(start)
    assert moved["nodes"]["hm-hero-copy"]["children"][:3] == ["hm-lead", "hm-eyebrow", "hm-h1"]
    touch_coldmere.undo()
    touch_coldmere.restored_to(start)


def test_a_long_press_lifts_a_page_row_and_moving_reorders_the_pages(touch_editor):
    touch_editor.open_demo("harbour-ferries", "p-fares")
    start = touch_editor.site()["site"]
    names = touch_editor.page_names(start)
    rows = touch_editor.page.locator("#fw-pages-list .list-row")
    fourth = rows.nth(3)
    expect(fourth).to_be_in_viewport()
    x, y = centre_left(fourth.bounding_box())
    finger = touch_editor.finger()
    finger.down(x, y)
    expect(fourth).to_have_class(re.compile(r"\bis-lifted\b"))
    finger.move(x, rows.nth(1).bounding_box()["y"] + 3, steps=10)
    expect(touch_editor.page.locator(".fw-drop-line")).to_be_visible()
    finger.up()
    after = touch_editor.changed_from(start)
    assert touch_editor.page_names(after) == names[:1] + names[3:4] + names[1:3] + names[4:]
    touch_editor.undo()
    touch_editor.restored_to(start)


def test_a_quick_swipe_scrolls_the_layers_list_and_moves_nothing(touch_coldmere):
    start = touch_coldmere.site()["site"]
    layers = touch_coldmere.page.locator("#fw-layers-list")
    box = layers.bounding_box()
    top = layers.evaluate("e => e.scrollTop")
    x, y = box["x"] + 80, box["y"] + box["height"] - 40
    finger = touch_coldmere.finger()
    finger.down(x, y)
    finger.move(x, y - 250, steps=10)
    finger.up()
    touch_coldmere.eventually(lambda: layers.evaluate("e => e.scrollTop") > top, "the layers list to scroll")
    expect(touch_coldmere.page.locator(LIFTED)).to_have_count(0)
    expect(touch_coldmere.page.locator("body")).not_to_have_class(re.compile(r"\bfw-row-dragging\b"))
    assert touch_coldmere.site()["site"] == start


def test_a_tap_on_a_layer_row_selects_it(touch_coldmere):
    touch_coldmere.layer_row("hm-lead").tap()
    expect(touch_coldmere.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    expect(touch_coldmere.page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(1)
    expect(touch_coldmere.page.locator('[role="menu"]:visible')).to_have_count(0)


def test_a_long_press_released_without_moving_opens_the_row_menu_once(touch_coldmere):
    start = touch_coldmere.site()["site"]
    touch_coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    x, y = centre_left(touch_coldmere.layer_row("hm-lead").bounding_box())
    finger = touch_coldmere.finger()
    finger.down(x, y)
    expect(touch_coldmere.layer_row("hm-lead")).to_have_class(re.compile(r"\bis-lifted\b"))
    finger.up()
    expect(touch_coldmere.page.locator('[role="menu"]:visible')).to_have_count(1)
    expect(touch_coldmere.menu().get_by_role("menuitem", name="Duplicate")).to_be_visible()
    expect(touch_coldmere.page.locator(LIFTED)).to_have_count(0)
    touch_coldmere.page.keyboard.press("Escape")
    expect(touch_coldmere.page.locator('[role="menu"]:visible')).to_have_count(0)
    assert touch_coldmere.site()["site"] == start


def test_a_second_finger_cancels_a_lifted_row_and_nothing_moves(touch_coldmere):
    start = touch_coldmere.site()["site"]
    touch_coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    x, y = centre_left(touch_coldmere.layer_row("hm-lead").bounding_box())
    target = touch_coldmere.layer_row("hm-eyebrow").bounding_box()
    finger = touch_coldmere.finger()
    finger.down(x, y)
    expect(touch_coldmere.layer_row("hm-lead")).to_have_class(re.compile(r"\bis-lifted\b"))
    finger.down(x + 40, y + 120)
    expect(touch_coldmere.page.locator(LIFTED)).to_have_count(0)
    finger.move(x, target["y"] + 4, steps=10)
    finger.up()
    expect(touch_coldmere.page.locator(".fw-drop-line:visible")).to_have_count(0)
    expect(touch_coldmere.page.locator('[role="menu"]:visible')).to_have_count(0)
    assert touch_coldmere.site()["site"] == start


def test_the_ticket_example_by_long_press_on_a_canvas_below_full_zoom(section_with_two_headings):
    editor, section, first, second = section_with_two_headings
    zoom = int(editor.page.locator(".stage").inner_text().split("%")[0].split()[-1])
    assert zoom < 100
    start = editor.site()["site"]
    a = editor.canvas.locator(f'[data-fw-id="{first}"]').bounding_box()
    b = editor.canvas.locator(f'[data-fw-id="{second}"]').bounding_box()
    finger = editor.finger()
    finger.down(a["x"] + 20, a["y"] + a["height"] / 2)
    expect(editor.canvas.locator(f'[data-fw-id="{first}"][data-fw-lifted]')).to_have_count(1)
    finger.move(a["x"] + 20, b["y"] + b["height"] - 3, steps=15)
    expect(editor.page.locator("body")).to_have_class(re.compile(r"\bfw-canvas-dragging\b"))
    finger.up()
    after = editor.changed_from(start)
    assert after["nodes"][section]["children"] == [second, first]
    expect(editor.page.locator("#fw-layers-list .layer-row").nth(3)).to_have_attribute("data-key", first)
    editor.undo()
    editor.restored_to(start)


def test_a_long_press_drag_on_a_scrolled_canvas_puts_the_first_line_below_the_second(touch_coldmere):
    page = touch_coldmere.page
    start = touch_coldmere.site()["site"]
    frame = page.locator('iframe[title="Website canvas"]').bounding_box()
    page.mouse.move(frame["x"] + frame["width"] / 2, frame["y"] + frame["height"] / 2)
    page.mouse.wheel(0, 80)
    touch_coldmere.eventually(lambda: touch_coldmere.canvas.locator("html").evaluate("e => e.ownerDocument.scrollingElement.scrollTop") > 0, "the canvas to scroll")
    a = touch_coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').bounding_box()
    b = touch_coldmere.canvas.locator('[data-fw-id="hm-h1"]').bounding_box()
    finger = touch_coldmere.finger()
    finger.down(a["x"] + 20, a["y"] + a["height"] / 2)
    expect(touch_coldmere.canvas.locator('[data-fw-id="hm-eyebrow"][data-fw-lifted]')).to_have_count(1)
    finger.move(a["x"] + 20, b["y"] + b["height"] - 3, steps=15)
    finger.up()
    after = touch_coldmere.changed_from(start)
    assert after["nodes"]["hm-hero-copy"]["children"][:3] == ["hm-h1", "hm-eyebrow", "hm-lead"]
    touch_coldmere.undo()
    touch_coldmere.restored_to(start)


def test_a_pen_drags_a_layer_row_like_a_mouse(touch_coldmere):
    start = touch_coldmere.site()["site"]
    touch_coldmere.page.evaluate(POINTER_TYPES)
    touch_coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    x, y = centre_left(touch_coldmere.layer_row("hm-lead").bounding_box())
    target = touch_coldmere.layer_row("hm-eyebrow").bounding_box()
    pen = touch_coldmere.pen()
    pen.move(x, y)
    pen.down()
    pen.move(x, target["y"] + 4, steps=10, held=True)
    expect(touch_coldmere.page.locator(".fw-drop-line")).to_be_visible()
    pen.up()
    moved = touch_coldmere.changed_from(start)
    assert moved["nodes"]["hm-hero-copy"]["children"][:3] == ["hm-lead", "hm-eyebrow", "hm-h1"]
    assert touch_coldmere.page.evaluate("window.__pointerTypes") == ["pen"]


def test_a_pen_with_its_barrel_button_held_never_drags_a_row_or_an_element(touch_coldmere):
    page = touch_coldmere.page
    start = touch_coldmere.site()["site"]
    page.evaluate(POINTER_TYPES)
    page.evaluate("""() => { window.__dragSeen = false;
      new MutationObserver(() => { if (/fw-(row|canvas)-dragging/.test(document.body.className)) window.__dragSeen = true; })
        .observe(document.body, { attributes: true, attributeFilter: ['class'] }); }""")
    touch_coldmere.layer_row("hm-lead").scroll_into_view_if_needed()
    x, y = centre_left(touch_coldmere.layer_row("hm-lead").bounding_box())
    target = touch_coldmere.layer_row("hm-eyebrow").bounding_box()
    pen = touch_coldmere.pen(barrel=True)
    pen.move(x, y)
    pen.down()
    pen.move(x, target["y"] + 4, steps=10, held=True)
    pen.up()
    page.keyboard.press("Escape")
    a = touch_coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').bounding_box()
    b = touch_coldmere.canvas.locator('[data-fw-id="hm-h1"]').bounding_box()
    pen.move(a["x"] + 20, a["y"] + a["height"] / 2)
    pen.down()
    pen.move(a["x"] + 20, b["y"] + b["height"] - 3, steps=15, held=True)
    pen.up()
    page.keyboard.press("Escape")
    assert page.evaluate("window.__pointerTypes") == ["pen", "pen"]
    assert page.evaluate("window.__dragSeen") is False
    assert touch_coldmere.site()["site"] == start


def pick_bar(editor, heading):
    return editor.page.locator(f'.panel-head:has(.fw-fold-head[aria-controls="{heading}"]) .fw-pick-bar')


def pick_toggle(editor, heading):
    return editor.page.locator(f'.panel-head:has(.fw-fold-head[aria-controls="{heading}"]) .fw-pick-toggle')


def heading_boxes(editor):
    heads = editor.page.locator(".panel-head:has(.fw-fold-head)")
    return heads.evaluate_all("hs => hs.map(h => { const r = h.getBoundingClientRect(); const t = h.querySelector('.fw-fold-head').getBoundingClientRect(); return [r.x, r.y, r.width, r.height, t.x, t.y]; })")


def canvas_boxes(editor, keys):
    return [editor.canvas.locator(f'[data-fw-id="{key}"]').bounding_box() for key in keys]


def test_select_several_from_the_layers_heading_adds_and_removes_by_tap_and_counts_them(touch_coldmere):
    page = touch_coldmere.page
    touch_coldmere.layer_row("hm-eyebrow").tap()
    expect(touch_coldmere.layer_row("hm-eyebrow")).to_have_attribute("aria-selected", "true")
    heads = heading_boxes(touch_coldmere)
    headings_on_canvas = canvas_boxes(touch_coldmere, ["hm-eyebrow", "hm-h1", "hm-lead"])
    pick_toggle(touch_coldmere, "fw-layers-list").tap()
    expect(pick_toggle(touch_coldmere, "fw-layers-list")).to_have_attribute("aria-pressed", "true")
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_be_visible()
    assert heading_boxes(touch_coldmere) == heads
    assert canvas_boxes(touch_coldmere, ["hm-eyebrow", "hm-h1", "hm-lead"]) == headings_on_canvas
    touch_coldmere.layer_row("hm-h1").tap()
    touch_coldmere.layer_row("hm-lead").tap()
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_contain_text("3 selected")
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(3)
    touch_coldmere.layer_row("hm-h1").tap()
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_contain_text("2 selected")
    expect(touch_coldmere.layer_row("hm-h1")).to_have_attribute("aria-selected", "false")
    pick_bar(touch_coldmere, "fw-layers-list").get_by_role("button", name="Done").tap()
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_be_hidden()
    expect(pick_toggle(touch_coldmere, "fw-layers-list")).to_have_attribute("aria-pressed", "false")
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(2)
    assert heading_boxes(touch_coldmere) == heads


def test_select_several_from_the_pages_heading_picks_pages_and_a_double_tap_does_not_rename(touch_editor):
    touch_editor.open_demo("harbour-ferries", "p-fares")
    page = touch_editor.page
    start = touch_editor.site()["site"]
    pick_toggle(touch_editor, "fw-pages-list").tap()
    expect(pick_bar(touch_editor, "fw-pages-list")).to_be_visible()
    touch_editor.page_row("p-fares").tap()
    expect(pick_bar(touch_editor, "fw-pages-list")).to_contain_text("2 selected")
    touch_editor.page_row("p-routes").dblclick()
    expect(page.locator("#fw-pages-list input:visible")).to_have_count(0)
    expect(pick_bar(touch_editor, "fw-pages-list")).to_contain_text("2 selected")
    page.keyboard.press("Escape")
    expect(pick_bar(touch_editor, "fw-pages-list")).to_be_hidden()
    expect(page.locator('#fw-pages-list .list-row[aria-selected="true"]')).to_have_count(2)
    assert touch_editor.site()["site"] == start


def test_edit_select_several_turns_it_on_and_canvas_taps_add_elements(touch_coldmere):
    page = touch_coldmere.page
    touch_coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').tap()
    expect(touch_coldmere.layer_row("hm-eyebrow")).to_have_attribute("aria-selected", "true")
    before = canvas_boxes(touch_coldmere, ["hm-eyebrow", "hm-h1", "hm-lead"])
    page.locator('[data-menu="Edit"]').click()
    item = page.locator('[role="menu"]:visible [data-command="edit.select-mode"]')
    expect(item).to_contain_text("Select several")
    item.click()
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_contain_text("1 selected")
    assert canvas_boxes(touch_coldmere, ["hm-eyebrow", "hm-h1", "hm-lead"]) == before
    touch_coldmere.canvas.locator('[data-fw-id="hm-h1"]').tap()
    touch_coldmere.canvas.locator('[data-fw-id="hm-lead"]').tap()
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_contain_text("3 selected")
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(3)
    page.keyboard.press("Escape")
    expect(pick_bar(touch_coldmere, "fw-layers-list")).to_be_hidden()
    expect(page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(3)
