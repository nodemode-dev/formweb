import io
import re
import zipfile

import pytest
from playwright.sync_api import expect

GRID = "hm-sv-grid"
NOT_GRID = "hm-sv-in"
COLUMNS = ("Grid columns", "grid-template-columns")
ROWS = ("Grid rows", "grid-template-rows")
NOT_GRID_SENTENCE = "Grid columns only takes effect when this element's Display is Grid."


def select(editor, key):
    editor.canvas.locator(f'[data-fw-id="{key}"]').scroll_into_view_if_needed()
    editor.layer_row(key).click()
    expect(editor.layer_row(key)).to_have_attribute("aria-selected", "true")
    expect(editor.page.locator(".inspector-name")).to_have_text(editor.site()["site"]["nodes"][key]["name"])


def opener(editor, field=COLUMNS):
    return editor.page.get_by_role("button", name=f"Choose {field[0]}", exact=True)


def chooser(editor, field=COLUMNS):
    return editor.page.get_by_role("dialog", name=f"Choose {field[0]}", exact=True)


def entry(editor, name, field=COLUMNS):
    return chooser(editor, field).get_by_title(name, exact=True)


def pressed(editor, field=COLUMNS):
    return chooser(editor, field).locator('button[aria-pressed="true"]')


def entries(editor, field=COLUMNS):
    return chooser(editor, field).locator("button[title]")


def text_field(editor, field=COLUMNS):
    return editor.page.locator(f'input[data-style="{field[1]}"]')


def open_chooser(editor, field=COLUMNS):
    opener(editor, field).click()
    expect(chooser(editor, field)).to_be_visible()
    expect(opener(editor, field)).to_have_attribute("aria-expanded", "true")


def styles(site, key, breakpoint=None):
    node = site["nodes"][key]
    return node["styles"] if breakpoint is None else node.get("breakpoints", {}).get(breakpoint, {})


def computed(editor, key, prop):
    return editor.canvas.locator(f'[data-fw-id="{key}"]').evaluate(f"e => getComputedStyle(e).getPropertyValue('{prop}')")


def tracks(editor, key, prop="grid-template-columns"):
    return [float(width) for width in re.findall(r"([\d.]+)px", computed(editor, key, prop))]


def all_computed(editor, key):
    return editor.canvas.locator(f'[data-fw-id="{key}"]').evaluate(
        "e => { const s = getComputedStyle(e); return Array.from(s, name => name + ':' + s.getPropertyValue(name)).join(';'); }"
    )


def two_frames(editor):
    editor.page.evaluate("() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
    editor.canvas.locator("body").evaluate("() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")


def one_step_after(editor, revision, what):
    editor.eventually(lambda: editor.site()["revision"] > revision, what)
    reply = editor.site()
    return editor.until(lambda site: site == reply["site"], what)


def type_value(editor, value, field=COLUMNS, key=GRID):
    text_field(editor, field).fill(value)
    text_field(editor, field).press("Enter")
    return editor.until(lambda site: styles(site, key).get(field[1]) == value, f"{value!r} to be stored")


def exported_columns(editor, key):
    with editor.page.expect_download() as download:
        editor.page.locator('[data-cmd="file.export"]').click()
    values = []
    with zipfile.ZipFile(io.BytesIO(open(download.value.path(), "rb").read())) as archive:
        for name in archive.namelist():
            if not name.endswith(".css"):
                continue
            css = archive.read(name).decode("utf-8")
            for rule in re.finditer(r'\[data-fw-node="' + re.escape(key) + r'"\]\{([^}]*)\}', css):
                values += [part.split(":", 1)[1] for part in rule.group(1).split(";") if part.startswith("grid-template-columns:")]
    return values


@pytest.mark.parametrize("field, wanted", [(COLUMNS, ["3 columns", "Narrow left, wide right", "Fixed sidebar on the left", "At least 200 px each"]), (ROWS, ["3 rows", "Header, content, footer", "Header and content"])], ids=["columns", "rows"])
def test_grid_columns_and_grid_rows_each_show_a_button_that_opens_a_chooser_of_named_layouts(coldmere, field, wanted):
    select(coldmere, GRID)
    before = coldmere.site()
    expect(opener(coldmere, field)).to_be_visible()
    expect(chooser(coldmere, field)).to_be_hidden()
    open_chooser(coldmere, field)
    for name in wanted:
        expect(entry(coldmere, name, field)).to_be_visible()
    coldmere.page.keyboard.press("Escape")
    expect(chooser(coldmere, field)).to_be_hidden()
    assert coldmere.site() == before


def test_choosing_three_equal_columns_stores_repeat_3_1fr_draws_three_equal_tracks_and_one_undo_restores(coldmere):
    select(coldmere, GRID)
    type_value(coldmere, "1fr 2fr")
    coldmere.eventually(lambda: len(tracks(coldmere, GRID)) == 2, "two tracks on the canvas")
    start = coldmere.site()
    open_chooser(coldmere)
    entry(coldmere, "3 columns").click()
    after = coldmere.changed_from(start["site"])
    assert styles(after, GRID)["grid-template-columns"] == "repeat(3, 1fr)"
    assert coldmere.site()["revision"] == start["revision"] + 1
    expect(chooser(coldmere)).to_be_hidden()
    expect(text_field(coldmere)).to_have_value("repeat(3, 1fr)")
    coldmere.eventually(lambda: len(tracks(coldmere, GRID)) == 3, "three tracks on the canvas")
    widths = tracks(coldmere, GRID)
    assert max(widths) - min(widths) <= 1, f"the three columns are not of equal width: {widths}"
    coldmere.undo()
    coldmere.restored_to(start["site"])
    expect(text_field(coldmere)).to_have_value(styles(start["site"], GRID)["grid-template-columns"])


def test_the_exported_css_carries_the_chosen_repeat_3_1fr_unchanged(coldmere):
    assert "repeat(3, 1fr)" not in exported_columns(coldmere, GRID)
    select(coldmere, GRID)
    start = coldmere.site()["site"]
    open_chooser(coldmere)
    entry(coldmere, "3 columns").click()
    coldmere.changed_from(start)
    assert "repeat(3, 1fr)" in exported_columns(coldmere, GRID)


def test_on_an_element_that_is_not_a_grid_the_chooser_says_so_and_a_pick_stores_nothing_until_it_is_made_a_grid_in_one_undo_step(coldmere):
    select(coldmere, NOT_GRID)
    start = coldmere.site()
    assert computed(coldmere, NOT_GRID, "display") != "grid"
    open_chooser(coldmere)
    expect(chooser(coldmere)).to_contain_text(NOT_GRID_SENTENCE)
    make = chooser(coldmere).get_by_role("button", name="Make this element a grid", exact=True)
    expect(make).to_be_visible()
    entry(coldmere, "2 columns").click()
    expect(chooser(coldmere)).to_be_visible()
    expect(pressed(coldmere)).to_have_count(1)
    expect(pressed(coldmere)).to_have_attribute("title", "2 columns")
    assert coldmere.site() == start
    make.click()
    after = one_step_after(coldmere, start["revision"], "the element to become a grid")
    assert coldmere.site()["revision"] == start["revision"] + 1
    own = styles(after, NOT_GRID)
    assert own["display"] == "grid" and own["grid-template-columns"] == "repeat(2, 1fr)", own
    coldmere.eventually(lambda: computed(coldmere, NOT_GRID, "display") == "grid" and len(tracks(coldmere, NOT_GRID)) == 2, "a two-column grid on the canvas")
    coldmere.undo()
    restored = coldmere.restored_to(start["site"])
    assert "display" not in styles(restored, NOT_GRID) and "grid-template-columns" not in styles(restored, NOT_GRID)
    coldmere.eventually(lambda: computed(coldmere, NOT_GRID, "display") != "grid", "the canvas element to stop being a grid")


def test_with_the_tablet_breakpoint_picked_make_this_element_a_grid_stores_display_and_columns_for_tablet_only_in_one_undo_step(coldmere):
    coldmere.page.get_by_label("Responsive breakpoint").select_option("tablet")
    expect(coldmere.page.get_by_label("Responsive breakpoint")).to_have_value("tablet")
    select(coldmere, NOT_GRID)
    start = coldmere.site()
    open_chooser(coldmere)
    entry(coldmere, "3 columns").click()
    expect(pressed(coldmere)).to_have_attribute("title", "3 columns")
    assert coldmere.site() == start
    chooser(coldmere).get_by_role("button", name="Make this element a grid", exact=True).click()
    after = one_step_after(coldmere, start["revision"], "the element to become a grid on Tablet")
    assert coldmere.site()["revision"] == start["revision"] + 1
    tablet = styles(after, NOT_GRID, "tablet")
    assert tablet.get("display") == "grid" and tablet.get("grid-template-columns") == "repeat(3, 1fr)", tablet
    assert styles(after, NOT_GRID) == styles(start["site"], NOT_GRID)
    assert {k: v for k, v in after["nodes"][NOT_GRID].get("breakpoints", {}).items() if k != "tablet"} == {k: v for k, v in start["site"]["nodes"][NOT_GRID].get("breakpoints", {}).items() if k != "tablet"}
    coldmere.undo()
    coldmere.restored_to(start["site"])


def test_picking_an_entry_on_an_element_that_is_not_a_grid_moves_nothing_in_the_chooser(coldmere):
    select(coldmere, NOT_GRID)
    open_chooser(coldmere)
    parts = chooser(coldmere).locator("button, p, code, [role=group], input")
    boxes = lambda: [parts.nth(i).bounding_box() for i in range(parts.count())]
    before = [chooser(coldmere).bounding_box()] + boxes()
    for name in ("3 columns", "Fixed sidebar on the left", "At least 160 px each"):
        entry(coldmere, name).click()
        expect(pressed(coldmere)).to_have_attribute("title", name)
        assert [chooser(coldmere).bounding_box()] + boxes() == before, f"the chooser's layout moved when {name!r} was picked"


@pytest.mark.parametrize("field, typed, name", [
    (COLUMNS, "1fr 1fr 1fr", "3 columns"),
    (COLUMNS, "REPEAT(2,  1fr)", "2 columns"),
    (COLUMNS, "1fr 2fr", "Narrow left, wide right"),
    (COLUMNS, "240px 1fr", "Fixed sidebar on the left"),
    (COLUMNS, "repeat(auto-fit, minmax(200px, 1fr))", "At least 200 px each"),
    (ROWS, "auto 1fr auto", "Header, content, footer"),
], ids=["equal-thirds-spelled-out", "upper-case-repeat", "one-to-two", "fixed-sidebar", "as-many-as-fit", "header-content-footer"])
def test_a_hand_typed_value_the_chooser_understands_marks_exactly_its_entry_when_the_chooser_opens(coldmere, field, typed, name):
    select(coldmere, GRID)
    type_value(coldmere, typed, field)
    open_chooser(coldmere, field)
    expect(pressed(coldmere, field)).to_have_count(1)
    expect(pressed(coldmere, field)).to_have_attribute("title", name)
    expect(pressed(coldmere, field)).to_be_focused()
    coldmere.page.keyboard.press("Escape")
    expect(chooser(coldmere, field)).to_be_hidden()
    assert styles(coldmere.site()["site"], GRID)[field[1]] == typed
    expect(text_field(coldmere, field)).to_have_value(typed)


@pytest.mark.parametrize("typed", ["[full-start] 1fr [full-end]", "subgrid", "var(--cols)"], ids=["named-lines", "subgrid", "variable"])
def test_a_hand_typed_value_the_chooser_cannot_read_is_left_exactly_as_typed_and_its_button_steps_aside_until_a_readable_one_returns(coldmere, typed):
    select(coldmere, GRID)
    expect(opener(coldmere)).to_be_visible()
    text_field(coldmere).scroll_into_view_if_needed()
    box = text_field(coldmere).bounding_box()
    type_value(coldmere, typed)
    expect(opener(coldmere)).to_be_hidden()
    expect(chooser(coldmere)).to_be_hidden()
    expect(text_field(coldmere)).to_have_value(typed)
    assert text_field(coldmere).bounding_box() == box
    assert styles(coldmere.site()["site"], GRID)["grid-template-columns"] == typed
    type_value(coldmere, "1fr 2fr")
    expect(opener(coldmere)).to_be_visible()
    assert text_field(coldmere).bounding_box() == box


@pytest.mark.parametrize("typed", [None, "minmax(100px, 1fr) 2fr", "1fr 2fr 3fr"], ids=["demo-minmax-thirds", "minmax-and-fr", "three-unequal"])
def test_a_value_the_chooser_does_not_offer_marks_no_entry_and_is_left_exactly_as_it_was(coldmere, typed):
    select(coldmere, GRID)
    value = type_value(coldmere, typed)["nodes"][GRID]["styles"]["grid-template-columns"] if typed else styles(coldmere.site()["site"], GRID)["grid-template-columns"]
    start = coldmere.site()
    open_chooser(coldmere)
    expect(entries(coldmere).first).to_be_visible()
    expect(pressed(coldmere)).to_have_count(0)
    coldmere.page.keyboard.press("Escape")
    expect(chooser(coldmere)).to_be_hidden()
    expect(text_field(coldmere)).to_have_value(value)
    assert coldmere.site() == start


@pytest.mark.parametrize("key", [GRID, NOT_GRID], ids=["grid", "not-a-grid"])
def test_resting_the_pointer_on_every_entry_without_pressing_changes_nothing_on_the_page(coldmere, key):
    select(coldmere, key)
    start = coldmere.site()
    look = all_computed(coldmere, key)
    open_chooser(coldmere)
    targets = entries(coldmere).all()
    make = chooser(coldmere).get_by_role("button", name="Make this element a grid", exact=True)
    if key == NOT_GRID:
        targets.append(make)
    assert len(targets) >= 18
    for target in targets:
        box = target.bounding_box()
        coldmere.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=4)
        two_frames(coldmere)
        assert all_computed(coldmere, key) == look, f"the canvas element changed while the pointer rested on {target.get_attribute('title') or 'the make-grid button'}"
        assert coldmere.site() == start, f"the site changed while the pointer rested on {target.get_attribute('title') or 'the make-grid button'}"
    expect(chooser(coldmere)).to_be_visible()
    entry(coldmere, "2 columns").click()
    if key == NOT_GRID:
        make.click()
    after = one_step_after(coldmere, start["revision"], "the one choice after the hovering")
    assert coldmere.site()["revision"] == start["revision"] + 1, "the hovering wrote to the site before the choice"
    assert styles(after, key)["grid-template-columns"] == "repeat(2, 1fr)"


def test_the_chooser_works_by_keyboard_alone(coldmere):
    select(coldmere, GRID)
    start = coldmere.site()
    text_field(coldmere).click()
    coldmere.page.keyboard.press("Shift+Tab")
    expect(opener(coldmere)).to_be_focused()
    coldmere.page.keyboard.press("Enter")
    expect(chooser(coldmere)).to_be_visible()
    expect(entry(coldmere, "One column")).to_be_focused()
    coldmere.page.keyboard.press("ArrowRight")
    expect(entry(coldmere, "2 columns")).to_be_focused()
    coldmere.page.keyboard.press("ArrowRight")
    expect(entry(coldmere, "3 columns")).to_be_focused()
    coldmere.page.keyboard.press("Enter")
    after = coldmere.changed_from(start["site"])
    assert styles(after, GRID)["grid-template-columns"] == "repeat(3, 1fr)"
    expect(chooser(coldmere)).to_be_hidden()
    expect(opener(coldmere)).to_be_focused()
    chosen = coldmere.site()
    coldmere.page.keyboard.press(" ")
    expect(chooser(coldmere)).to_be_visible()
    expect(pressed(coldmere)).to_have_attribute("title", "3 columns")
    expect(pressed(coldmere)).to_be_focused()
    coldmere.page.keyboard.press("ArrowDown")
    expect(entry(coldmere, "6 columns")).to_be_focused()
    coldmere.page.keyboard.press("ArrowUp")
    expect(pressed(coldmere)).to_be_focused()
    coldmere.page.keyboard.press("Escape")
    expect(chooser(coldmere)).to_be_hidden()
    expect(opener(coldmere)).to_be_focused()
    assert coldmere.site() == chosen


def test_delete_and_backspace_inside_the_open_chooser_never_remove_an_element_of_the_page(coldmere):
    select(coldmere, GRID)
    start = coldmere.site()
    open_chooser(coldmere)
    for key in ("Delete", "Backspace", "ArrowRight", "Delete", "ArrowDown", "Backspace"):
        coldmere.page.keyboard.press(key)
    expect(chooser(coldmere)).to_be_visible()
    entry(coldmere, "2 columns").focus()
    coldmere.page.keyboard.press("Backspace")
    coldmere.page.keyboard.press("Delete")
    coldmere.page.keyboard.press("Enter")
    after = one_step_after(coldmere, start["revision"], "the choice made after the key presses")
    assert coldmere.site()["revision"] == start["revision"] + 1, "a key press inside the chooser changed the site before the choice"
    assert sorted(after["nodes"]) == sorted(start["site"]["nodes"])
    assert styles(after, GRID)["grid-template-columns"] == "repeat(2, 1fr)"
    expect(coldmere.canvas.locator(f'[data-fw-id="{GRID}"]')).to_have_count(1)


def test_ctrl_z_inside_the_open_chooser_undoes_the_last_choice(coldmere):
    select(coldmere, GRID)
    start = coldmere.site()["site"]
    open_chooser(coldmere)
    entry(coldmere, "3 columns").click()
    coldmere.changed_from(start)
    open_chooser(coldmere)
    expect(pressed(coldmere)).to_have_attribute("title", "3 columns")
    expect(pressed(coldmere)).to_be_focused()
    coldmere.page.keyboard.press("Control+z")
    coldmere.restored_to(start)
    expect(text_field(coldmere)).to_have_value(styles(start, GRID)["grid-template-columns"])
    assert chooser(coldmere).evaluate("panel => panel.contains(document.activeElement)"), "focus left the chooser after the undo"


def test_a_selection_change_while_the_chooser_is_open_closes_it_writes_nothing_and_drops_the_pending_pick(coldmere):
    select(coldmere, NOT_GRID)
    start = coldmere.site()
    parent = next(key for key, node in start["site"]["nodes"].items() if NOT_GRID in node["children"])
    open_chooser(coldmere)
    entry(coldmere, "2 columns").click()
    expect(pressed(coldmere)).to_have_attribute("title", "2 columns")
    coldmere.page.evaluate("() => window.formweb.run('edit.select-parent')")
    expect(coldmere.page.locator(".inspector-name")).to_have_text(start["site"]["nodes"][parent]["name"])
    expect(chooser(coldmere)).to_be_hidden()
    expect(opener(coldmere)).to_have_attribute("aria-expanded", "false")
    expect(opener(coldmere)).to_be_focused()
    open_chooser(coldmere)
    expect(entry(coldmere, "2 columns")).to_have_attribute("aria-pressed", "false")
    coldmere.page.keyboard.press("Escape")
    expect(chooser(coldmere)).to_be_hidden()
    assert coldmere.site() == start
