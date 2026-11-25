import io
import math
import re
import zipfile

import pytest
from playwright.sync_api import expect

from test_canvas import section_with_two_headings  # noqa: F401

LAYER = ".fw-layout div:visible"
OUTLINES = ".fw-layout-box:visible"
SLOTS = ".fw-layout-slot:visible"
TRACKS = ".fw-layout-track:visible"
GUIDES = ".fw-layout-guide:visible"
GAPS = ".fw-layout-gap:visible"
WHERE = ".fw-canvas-proxy-where"
TIP = "Tip: drag a selected element to move it; on a touch screen, hold it first. It snaps to the places the layout allows."


def press_and_move(editor, source, to, grab=(12, 8)):
    pointer = editor.canvas_pointer()
    pointer.move(source["x"] + grab[0], source["y"] + grab[1])
    pointer.down()
    pointer.move(*to, steps=15, held=True)
    return pointer


def box_of(editor, key):
    return editor.canvas.locator(f'[data-fw-id="{key}"]').bounding_box()


def ancestors(site, key, root="root"):
    up = {child: node["id"] for node in site["nodes"].values() for child in node["children"]}
    chain = []
    while key in up:
        key = up[key]
        chain.append(key)
        if key == root:
            break
    return chain


def toggle_outlines(editor):
    editor.page.locator('[data-menu="View"]').click()
    editor.page.locator('[role="menu"]:visible [data-command="view.layout-outlines"]').click()


def test_a_canvas_drag_shows_the_layout_grid_names_the_landing_place_and_clears_it_after_the_drop(coldmere):
    site = coldmere.site()["site"]
    kids = site["nodes"]["hm-hero-copy"]["children"]
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    lead, h1 = box_of(coldmere, "hm-lead"), box_of(coldmere, "hm-h1")
    pointer = press_and_move(coldmere, lead, (h1["x"] + 6, h1["y"] + h1["height"] * 0.3))
    expect(coldmere.page.locator(LAYER).first).to_be_visible()
    assert coldmere.page.locator(OUTLINES).count() >= len(ancestors(site, "hm-lead"))
    expect(coldmere.page.locator(SLOTS)).to_have_count(len(kids))
    expect(coldmere.page.locator(WHERE)).to_have_text(f"Before {site['nodes']['hm-h1']['name']}")
    pointer.up()
    after = coldmere.changed_from(site)
    moved = after["nodes"]["hm-hero-copy"]["children"]
    assert moved.index("hm-lead") + 1 == moved.index("hm-h1")
    expect(coldmere.page.locator(LAYER)).to_have_count(0)
    expect(coldmere.page.locator(SLOTS)).to_have_count(0)
    expect(coldmere.page.locator(OUTLINES)).to_have_count(0)


def test_escape_during_a_canvas_drag_removes_the_layout_grid_and_moves_nothing(coldmere):
    start = coldmere.site()["site"]
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    lead, h1 = box_of(coldmere, "hm-lead"), box_of(coldmere, "hm-h1")
    pointer = press_and_move(coldmere, lead, (h1["x"] + 6, h1["y"] + h1["height"] * 0.3))
    expect(coldmere.page.locator(SLOTS).first).to_be_visible()
    coldmere.page.keyboard.press("Escape")
    expect(coldmere.page.locator(LAYER)).to_have_count(0)
    expect(coldmere.page.locator(SLOTS)).to_have_count(0)
    pointer.up()
    expect(coldmere.status).to_have_text("Drag cancelled. Nothing moved.")
    assert coldmere.site()["site"] == start


@pytest.mark.parametrize("key", ["Control+d", "Control+Shift+p"], ids=["duplicate", "preview"])
def test_a_shortcut_pressed_during_a_canvas_drag_ends_the_drag_first_so_nothing_is_left_drawn_and_nothing_is_dropped(coldmere, key):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    lead, h1 = box_of(coldmere, "hm-lead"), box_of(coldmere, "hm-h1")
    pointer = press_and_move(coldmere, lead, (h1["x"] + 6, h1["y"] + h1["height"] * 0.3))
    expect(coldmere.page.locator(SLOTS).first).to_be_visible()
    coldmere.page.keyboard.press(key)
    for drawn in (LAYER, ".fw-canvas-proxy:visible", ".fw-canvas-line:visible", ".fw-canvas-box:visible"):
        expect(coldmere.page.locator(drawn)).to_have_count(0)
    before = coldmere.site()["site"]
    pointer.move(h1["x"] + 6, h1["y"] + 2, steps=3, held=True)
    pointer.up()
    coldmere.page.wait_for_timeout(300)
    assert coldmere.site()["site"]["nodes"]["hm-hero-copy"]["children"] == before["nodes"]["hm-hero-copy"]["children"]


def test_a_page_that_changes_under_a_canvas_drag_ends_the_drag_and_removes_what_it_drew(coldmere):
    coldmere.page.locator('[data-menu="Page"]').click()
    coldmere.page.locator('[role="menu"]:visible [data-command="page.duplicate"]').click()
    site = coldmere.until(lambda s: len(s["pages"]) == 6, "the copy of Home")
    copy = next(page for page in site["pages"] if page["name"] == "Home copy")
    lead_id = next(key for key, node in site["nodes"].items() if node["name"] == site["nodes"]["hm-lead"]["name"] and key != "hm-lead")
    h1_id = next(key for key, node in site["nodes"].items() if node["name"] == site["nodes"]["hm-h1"]["name"] and key != "hm-h1")
    coldmere.canvas.locator(f'[data-fw-id="{lead_id}"]').click()
    lead, h1 = box_of(coldmere, lead_id), box_of(coldmere, h1_id)
    pointer = press_and_move(coldmere, lead, (h1["x"] + 6, h1["y"] + h1["height"] * 0.3))
    expect(coldmere.page.locator(SLOTS).first).to_be_visible()
    coldmere.command("page.remove", {"id": copy["id"]})
    for drawn in (LAYER, ".fw-canvas-proxy:visible", ".fw-canvas-line:visible"):
        expect(coldmere.page.locator(drawn)).to_have_count(0)
    expect(coldmere.status).to_have_text("Drag cancelled. Nothing moved.")
    pointer.up()


def test_the_layout_grid_follows_the_canvas_when_the_window_is_resized_during_a_drag(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    lead, h1 = box_of(coldmere, "hm-lead"), box_of(coldmere, "hm-h1")
    pointer = press_and_move(coldmere, lead, (h1["x"] + 6, h1["y"] + h1["height"] * 0.3))
    expect(coldmere.page.locator(SLOTS).first).to_be_visible()
    lines = lambda: sorted((round(box["x"]), round(box["y"])) for box in (slot.bounding_box() for slot in coldmere.page.locator(SLOTS).all()) if box)
    before = lines()
    coldmere.page.set_viewport_size({"width": 1340, "height": 900})
    coldmere.eventually(lambda: lines() != before, "the landing lines to move with the resized canvas")
    coldmere.page.wait_for_timeout(300)
    after = lines()
    pointer.move(*pointer.at, held=True)
    coldmere.page.wait_for_timeout(300)
    assert after and lines() == after
    coldmere.page.keyboard.press("Escape")
    pointer.up()


def test_dragging_the_first_heading_below_the_second_reads_inside_the_section_at_the_end(section_with_two_headings):
    editor, section, first, second = section_with_two_headings
    site = editor.site()["site"]
    a, b = box_of(editor, first), box_of(editor, second)
    pointer = press_and_move(editor, a, (a["x"] + 20, b["y"] + b["height"] - 3), grab=(20, a["height"] / 2))
    expect(editor.page.locator(WHERE)).to_have_text(f"Inside {site['nodes'][section]['name']}, at the end")
    pointer.up()
    assert editor.changed_from(site)["nodes"][section]["children"] == [second, first]


def test_a_drag_in_a_css_grid_draws_the_grids_own_tracks(coldmere):
    site = coldmere.site()["site"]
    grid = site["nodes"]["hm-sv-grid"]
    columns = int(re.match(r"repeat\((\d+),", grid["styles"]["grid-template-columns"]).group(1))
    cells = columns * math.ceil(len(grid["children"]) / columns)
    first, fifth = grid["children"][0], grid["children"][4]
    coldmere.canvas.locator(f'[data-fw-id="{first}"]').scroll_into_view_if_needed()
    coldmere.layer_row(first).click()
    expect(coldmere.layer_row(first)).to_have_attribute("aria-selected", "true")
    source, target = box_of(coldmere, first), box_of(coldmere, fifth)
    pointer = press_and_move(coldmere, source, (target["x"] - 5, target["y"] + target["height"] / 2), grab=(4, 4))
    expect(coldmere.page.locator(TRACKS)).to_have_count(cells)
    expect(coldmere.page.locator(WHERE)).to_have_text(f"Before {site['nodes'][fifth]['name']}")
    coldmere.page.keyboard.press("Escape")
    pointer.up()
    expect(coldmere.page.locator(TRACKS)).to_have_count(0)


def test_in_a_flex_row_the_guides_run_along_the_neighbours_edges_and_the_gap_is_measured(coldmere):
    site = coldmere.site()["site"]
    links = site["nodes"]["hd-nav"]["children"]
    width = 1280
    gap = min(max(18, 0.024 * width), 32)
    coldmere.canvas.locator(f'[data-fw-id="{links[-1]}"]').click()
    source, first = box_of(coldmere, links[-1]), box_of(coldmere, links[0])
    pointer = press_and_move(coldmere, source, (first["x"] + first["width"] * 0.15, first["y"] + first["height"] / 2))
    expect(coldmere.page.locator(WHERE)).to_have_text(f"Before {site['nodes'][links[0]]['name']}")
    guides = coldmere.page.locator(GUIDES)
    expect(guides).to_have_count(2)
    ys = sorted(guides.nth(i).bounding_box()["y"] for i in range(2))
    assert abs(ys[0] - first["y"]) <= 1.5 and abs(ys[1] - (first["y"] + first["height"])) <= 1.5
    expect(coldmere.page.locator(GAPS)).to_have_count(1)
    expect(coldmere.page.locator(GAPS)).to_have_text(f"{round(gap, 1):g} px")
    coldmere.page.keyboard.press("Escape")
    pointer.up()
    expect(coldmere.page.locator(GUIDES)).to_have_count(0)


def test_dragging_two_selected_elements_names_the_count_and_the_landing_place(coldmere):
    site = coldmere.site()["site"]
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').click(modifiers=["Control"])
    lead, buttons = box_of(coldmere, "hm-lead"), box_of(coldmere, "hm-btns")
    pointer = press_and_move(coldmere, lead, (buttons["x"] + 10, buttons["y"] + buttons["height"] + 2))
    expect(coldmere.page.locator(".fw-canvas-proxy-name")).to_have_text("2 elements")
    expect(coldmere.page.locator(WHERE)).to_have_text(re.compile(r"^(Before|Inside) "))
    expect(coldmere.page.locator(SLOTS).first).to_be_visible()
    coldmere.page.keyboard.press("Escape")
    pointer.up()
    expect(coldmere.page.locator(LAYER)).to_have_count(0)
    assert coldmere.site()["site"] == site


def test_show_layout_outlines_outlines_the_containers_around_the_selection_without_a_drag_and_survives_a_reload(coldmere):
    site = coldmere.site()["site"]
    hero = site["nodes"]["hm-hero-in"]
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(coldmere.page.locator(OUTLINES)).to_have_count(0)
    toggle_outlines(coldmere)
    expect(coldmere.page.locator(OUTLINES)).to_have_count(len(ancestors(site, "hm-lead")))
    expect(coldmere.page.locator(TRACKS)).to_have_count(len(hero["styles"]["grid-template-columns"].split("minmax(")) - 1)
    expect(coldmere.page.locator(SLOTS)).to_have_count(0)
    coldmere.page.locator('[data-menu="View"]').click()
    expect(coldmere.page.locator('[role="menu"]:visible [data-command="view.layout-outlines"]')).to_have_attribute("aria-checked", "true")
    coldmere.page.keyboard.press("Escape")
    coldmere.page.reload()
    coldmere.page_row("services").wait_for()
    coldmere.canvas.locator('[data-fw-id="root"]').wait_for()
    expect(coldmere.page.locator(OUTLINES)).to_have_count(1)
    coldmere.page.keyboard.press("Control+Alt+g")
    expect(coldmere.page.locator(LAYER)).to_have_count(0)
    expect(coldmere.status).to_have_text("Layout outlines are off.")


def test_nothing_of_the_layout_grid_is_drawn_in_preview(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    toggle_outlines(coldmere)
    expect(coldmere.page.locator(OUTLINES).first).to_be_visible()
    coldmere.page.locator('[data-menu="View"]').click()
    coldmere.page.locator('[role="menu"]:visible [data-command="view.preview"]').click()
    expect(coldmere.page.get_by_role("button", name="Back to design")).to_be_visible()
    expect(coldmere.page.locator(LAYER)).to_have_count(0)
    coldmere.page.get_by_role("button", name="Back to design").click()
    expect(coldmere.page.locator(OUTLINES).first).to_be_visible()
    coldmere.page.locator('[data-cmd="view.preview-full"]').click()
    expect(coldmere.page.locator(".fw-fp")).to_be_visible()
    expect(coldmere.page.locator(LAYER)).to_have_count(0)


def test_the_exported_site_is_byte_identical_with_layout_outlines_on_and_off(coldmere):
    def export():
        with coldmere.page.expect_download() as download:
            coldmere.page.locator('[data-cmd="file.export"]').click()
        with zipfile.ZipFile(io.BytesIO(open(download.value.path(), "rb").read())) as archive:
            return {name: archive.read(name) for name in archive.namelist()}

    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    off = export()
    toggle_outlines(coldmere)
    expect(coldmere.page.locator(OUTLINES).first).to_be_visible()
    on = export()
    assert off and sorted(on) == sorted(off)
    assert all(on[name] == off[name] for name in off)


def test_the_first_canvas_selection_of_a_session_tells_how_to_drag_once(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click()
    expect(coldmere.status).to_have_text(TIP)
    toggle_outlines(coldmere)
    expect(coldmere.status).not_to_have_text(TIP)
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').click()
    expect(coldmere.layer_row("hm-h1")).to_have_attribute("aria-selected", "true")
    coldmere.page.wait_for_timeout(300)
    expect(coldmere.status).not_to_have_text(TIP)


def test_a_selected_element_shows_the_move_cursor_and_the_page_itself_does_not(coldmere):
    lead = coldmere.canvas.locator('[data-fw-id="hm-lead"]')
    cursor = lambda: lead.evaluate("e => getComputedStyle(e).cursor")
    coldmere.page.mouse.move(0, 0)
    assert cursor() != "move"
    lead.click()
    box = lead.bounding_box()
    coldmere.page.mouse.move(box["x"] + 10, box["y"] + 6)
    coldmere.eventually(lambda: cursor() == "move", "the move cursor over the selected element")
    coldmere.layer_row("root").click()
    root = coldmere.canvas.locator('[data-fw-id="root"]')
    assert root.evaluate("e => getComputedStyle(e).cursor") != "move"


@pytest.fixture
def touch_coldmere(touch_editor):
    touch_editor.open_demo("coldmere-plumbing", "services")
    return touch_editor


def test_a_long_press_drag_shows_the_layout_grid_and_clears_it_on_release(touch_coldmere):
    site = touch_coldmere.site()["site"]
    lead, h1 = box_of(touch_coldmere, "hm-lead"), box_of(touch_coldmere, "hm-h1")
    finger = touch_coldmere.finger()
    finger.down(lead["x"] + 20, lead["y"] + lead["height"] / 2)
    expect(touch_coldmere.canvas.locator('[data-fw-id="hm-lead"][data-fw-lifted]')).to_have_count(1)
    finger.move(h1["x"] + 20, h1["y"] + h1["height"] * 0.3, steps=15)
    expect(touch_coldmere.page.locator(SLOTS).first).to_be_visible()
    expect(touch_coldmere.page.locator(WHERE)).to_have_text(f"Before {site['nodes']['hm-h1']['name']}")
    finger.up()
    touch_coldmere.changed_from(site)
    expect(touch_coldmere.page.locator(LAYER)).to_have_count(0)
