import hashlib
import io
import json
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
QUIET = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done))))"
UPGRADED = ("opacity", "width", "height", "max-width", "gap", "padding", "margin", "border-radius", "font-size", "line-height", "letter-spacing", "top", "left", "color", "background", "grid-template-columns", "grid-template-rows")
BOXES = """() => [...document.querySelectorAll('.inspector [data-style]')].map(node => {
  const scroller = node.closest('.inspector-scroll');
  const origin = scroller.getBoundingClientRect();
  const box = node.closest('.field').getBoundingClientRect();
  return [node.dataset.style, box.x - origin.x, box.y - origin.y + scroller.scrollTop, box.width, box.height];
})"""
SHOWN = "keys => Object.fromEntries(keys.map(key => [key, document.querySelector(`input[data-style=\"${key}\"]`).value]))"
GRADIENT = "linear-gradient(90deg, #5b3cc4 0%, #c0398f 50%, #a594df 100%)"


class Changes:
    def __init__(self, editor):
        self.editor = editor
        self.sent = []
        self.done = []
        editor.page.on("request", lambda r: self.sent.append(r) if OWN_CHANGE.search(r.url) else None)
        editor.page.on("requestfinished", lambda r: self.done.append(r) if OWN_CHANGE.search(r.url) else None)
        editor.page.on("requestfailed", lambda r: self.done.append(r) if OWN_CHANGE.search(r.url) else None)

    def settled(self):
        self.editor.page.evaluate(QUIET)
        self.editor.eventually(lambda: len(self.done) == len(self.sent), "every change the window sent to be answered")
        return self.editor.until(lambda site: True, "the window to show the newest revision")


def select(editor, node):
    editor.layer_row(node).click()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {re.escape(node)}$"))


def field(editor, key):
    return editor.page.locator(f'input[data-style="{key}"]')


def slider(editor, name):
    return editor.page.get_by_role("slider", name=name, exact=True)


def named(editor, name):
    return editor.page.get_by_role("button", name=name, exact=True)


def raw_switch(editor, label):
    return named(editor, f"Type {label} by hand")


def styles(site, node, breakpoint="desktop"):
    item = site["nodes"][node]
    return item["styles"] if breakpoint == "desktop" else item["breakpoints"].get(breakpoint, {})


def stored(editor, node, key, breakpoint="desktop"):
    return styles(editor.site()["site"], node, breakpoint).get(key)


def type_value(editor, key, value):
    box = field(editor, key)
    box.fill(value)
    box.press("Enter")


def run(editor, command):
    editor.page.evaluate(f"window.formweb.run('{command}')")


def boxes(editor):
    return editor.page.evaluate(BOXES)


def fields_show_state(editor, node, breakpoint="desktop"):
    site = editor.until(lambda s: True, "the window to show the newest revision")
    own = styles(site, node, breakpoint)
    shown = editor.page.evaluate(SHOWN, list(UPGRADED))
    held = {key: own.get(key, "") for key in UPGRADED}
    assert shown == held, f"{node} on {breakpoint}: fields {[(k, shown[k]) for k in UPGRADED if shown[k] != held[k]]} against state {[(k, held[k]) for k in UPGRADED if shown[k] != held[k]]}"


def export_files(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}


def drag_from(editor, target, start):
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    pointer = editor.canvas_pointer()
    y = box["y"] + box["height"] / 2
    pointer.move(box["x"] + box["width"] * start, y)
    pointer.down()
    return pointer, box, y


def open_menu(editor, menu, command):
    editor.page.locator(f'[data-menu="{menu}"]').click()
    return editor.page.locator(f'[role="menu"]:visible [data-command="{command}"]')


def open_preferences(editor):
    open_menu(editor, "Edit", "edit.settings").click()
    dialog = editor.page.get_by_role("dialog", name="Preferences")
    dialog.get_by_role("tab", name="Interface").click()
    return dialog


@pytest.fixture
def word(harbour):
    select(harbour, "h-logo-word")
    return harbour


@pytest.fixture
def grid(harbour):
    select(harbour, "hero-in")
    return harbour


@pytest.mark.parametrize("key, control, typed", [
    ("background", "Choose Background", "var(--accent)"),
    ("width", "Width", "calc(100% - 2rem)"),
    ("font-size", "Font size", "larger"),
    ("opacity", "Opacity", "0.5 !important"),
], ids=["token", "calc", "keyword", "important"])
def test_a_value_typed_into_a_field_with_a_control_is_stored_exactly_as_typed_in_one_undo_step(word, key, control, typed):
    part = named(word, control) if control.startswith("Choose") else slider(word, control)
    expect(part).to_be_visible()
    before = word.site()
    type_value(word, key, typed)
    after = word.changed_from(before["site"])
    assert styles(after, "h-logo-word").get(key) == typed
    assert word.site()["revision"] == before["revision"] + 1
    expect(field(word, key)).to_be_visible()
    expect(field(word, key)).to_have_value(typed)
    run(word, "edit.undo")
    word.restored_to(before["site"])


@pytest.mark.parametrize("node, key, control, first, unshowable, second", [
    ("h-logo-word", "width", "Width", "120px", "calc(100% - 2rem)", "240px"),
    ("h-logo-word", "background", "Choose Background", "#123456", "linear-gradient(#ff0000, #0000ff), linear-gradient(#0000ff, #ff0000)", "#654321"),
    ("hero-in", "grid-template-columns", "Choose Grid columns", "repeat(3, 1fr)", "var(--cols)", "1fr 2fr"),
], ids=["slider", "swatch", "grid"])
def test_a_value_the_control_cannot_show_hides_it_until_a_showable_value_returns_and_no_design_field_moves(harbour, node, key, control, first, unshowable, second):
    select(harbour, node)
    part = named(harbour, control) if control.startswith("Choose") else slider(harbour, control)
    for value, visible in ((first, True), (unshowable, False), (second, True)):
        type_value(harbour, key, value)
        harbour.until(lambda site: styles(site, node).get(key) == value, f"{key} {value} to be stored")
        expect(field(harbour, key)).to_have_value(value)
        if visible:
            expect(part).to_be_visible()
            if value == first:
                start = boxes(harbour)
        else:
            expect(part).to_be_hidden()
            expect(field(harbour, key)).to_be_visible()
        assert boxes(harbour) == start, f"a Design field moved or changed size with {key} {value}"


def test_the_control_follows_a_value_typed_into_its_field(word):
    type_value(word, "width", "240px")
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the typed width")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "240")
    type_value(word, "opacity", "0.3")
    word.until(lambda site: styles(site, "h-logo-word").get("opacity") == "0.3", "the typed opacity")
    expect(slider(word, "Opacity")).to_have_attribute("aria-valuenow", "0.3")


def test_the_control_follows_an_undo(word):
    type_value(word, "width", "240px")
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the first width")
    type_value(word, "width", "400px")
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "400px", "the second width")
    field(word, "width").blur()
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "400")
    word.undo()
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the undo")
    expect(field(word, "width")).to_have_value("240px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "240")


def test_the_control_follows_a_change_sent_to_the_engine_from_outside_the_window(word):
    type_value(word, "width", "240px")
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the typed width")
    field(word, "width").blur()
    word.command("node.update", {"id": "h-logo-word", "patch": {"styles": {"width": "333px", "background": "#00aa00"}}})
    expect(field(word, "width")).to_have_value("333px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "333")
    expect(field(word, "background")).to_have_value("#00aa00")
    expect(named(word, "Choose Background")).to_be_visible()
    word.command("node.update", {"id": "h-logo-word", "patch": {"styles": {"width": "calc(50% + 1px)"}}})
    expect(field(word, "width")).to_have_value("calc(50% + 1px)")
    expect(slider(word, "Width")).to_be_hidden()


def test_the_control_follows_the_selection_to_another_element_and_back(word):
    type_value(word, "width", "240px")
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the first width")
    select(word, "h-tools")
    type_value(word, "width", "100px")
    word.until(lambda site: styles(site, "h-tools").get("width") == "100px", "the second width")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "100")
    select(word, "h-logo-word")
    expect(field(word, "width")).to_have_value("240px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "240")
    select(word, "h-tools")
    expect(field(word, "width")).to_have_value("100px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "100")


def test_one_drag_on_a_slider_is_one_undo_step(word):
    changes = Changes(word)
    before = word.site()
    pointer, box, y = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(box["x"] + box["width"] * 0.5, y, steps=6, held=True)
    pointer.move(box["x"] - 40, y, steps=6, held=True)
    expect(field(word, "opacity")).to_have_value("0")
    pointer.up()
    word.until(lambda site: styles(site, "h-logo-word").get("opacity") == "0", "the dragged opacity")
    changes.settled()
    assert len(changes.sent) == 1
    assert word.site()["revision"] == before["revision"] + 1
    run(word, "edit.undo")
    word.restored_to(before["site"])


def test_one_held_arrow_key_with_repeats_on_a_slider_is_one_undo_step(word):
    changes = Changes(word)
    before = word.site()
    slider(word, "Opacity").focus()
    for _ in range(5):
        word.page.keyboard.down("ArrowLeft")
    expect(field(word, "opacity")).to_have_value("0.95")
    word.page.keyboard.up("ArrowLeft")
    word.until(lambda site: styles(site, "h-logo-word").get("opacity") == "0.95", "the stepped opacity")
    changes.settled()
    assert len(changes.sent) == 1
    assert word.site()["revision"] == before["revision"] + 1
    run(word, "edit.undo")
    word.restored_to(before["site"])


def test_one_click_on_a_slider_is_one_undo_step(word):
    changes = Changes(word)
    before = word.site()
    pointer, box, y = drag_from(word, slider(word, "Opacity"), 0)
    pointer.up()
    word.until(lambda site: styles(site, "h-logo-word").get("opacity") == "0", "the clicked opacity")
    changes.settled()
    assert len(changes.sent) == 1
    assert word.site()["revision"] == before["revision"] + 1
    run(word, "edit.undo")
    word.restored_to(before["site"])


def test_the_raw_css_switch_turns_the_control_of_that_one_field_off_and_on(word):
    switch = raw_switch(word, "Opacity")
    expect(switch).to_have_attribute("aria-pressed", "false")
    expect(slider(word, "Opacity")).to_be_visible()
    start = boxes(word)
    switch.click()
    expect(switch).to_have_attribute("aria-pressed", "true")
    expect(slider(word, "Opacity")).to_be_hidden()
    expect(field(word, "opacity")).to_be_visible()
    expect(slider(word, "Width")).to_be_visible()
    expect(raw_switch(word, "Width")).to_have_attribute("aria-pressed", "false")
    assert boxes(word) == start
    switch.click()
    expect(switch).to_have_attribute("aria-pressed", "false")
    expect(slider(word, "Opacity")).to_be_visible()
    assert boxes(word) == start


def test_the_raw_css_switch_survives_a_reload(word):
    raw_switch(word, "Opacity").click()
    expect(raw_switch(word, "Opacity")).to_have_attribute("aria-pressed", "true")
    word.page.reload()
    word.page.get_by_role("button", name="Back to Editor").click()
    select(word, "h-logo-word")
    expect(raw_switch(word, "Opacity")).to_have_attribute("aria-pressed", "true")
    expect(slider(word, "Opacity")).to_be_hidden()
    expect(field(word, "opacity")).to_be_visible()
    expect(slider(word, "Width")).to_be_visible()


def test_the_raw_css_switch_is_in_neither_the_site_state_nor_the_exported_zip(word):
    changes = Changes(word)
    before = word.site()
    files = export_files(word)
    raw_switch(word, "Opacity").click()
    raw_switch(word, "Background").click()
    expect(slider(word, "Opacity")).to_be_hidden()
    expect(named(word, "Choose Background")).to_be_hidden()
    changes.settled()
    assert changes.sent == []
    assert word.site() == before
    assert export_files(word) == files


def test_the_design_fields_preference_applies_at_once_to_every_field_without_its_own_choice(word):
    raw_switch(word, "Opacity").click()
    raw_switch(word, "Opacity").click()
    expect(raw_switch(word, "Opacity")).to_have_attribute("aria-pressed", "false")
    dialog = open_preferences(word)
    choice = dialog.get_by_role("combobox", name="Show in Design fields")
    expect(choice).to_have_value("controls")
    choice.select_option(label="CSS text")
    expect(raw_switch(word, "Width")).to_have_attribute("aria-pressed", "true")
    expect(slider(word, "Width")).to_be_hidden()
    expect(named(word, "Choose Background")).to_be_hidden()
    expect(raw_switch(word, "Opacity")).to_have_attribute("aria-pressed", "false")
    expect(slider(word, "Opacity")).to_be_visible()


def test_use_for_all_fields_clears_the_choice_made_in_each_field(word):
    raw_switch(word, "Opacity").click()
    raw_switch(word, "Opacity").click()
    dialog = open_preferences(word)
    dialog.get_by_role("combobox", name="Show in Design fields").select_option(label="CSS text")
    expect(slider(word, "Opacity")).to_be_visible()
    every = dialog.get_by_role("button", name="Use for all fields")
    expect(every).to_be_enabled()
    every.click()
    expect(raw_switch(word, "Opacity")).to_have_attribute("aria-pressed", "true")
    expect(slider(word, "Opacity")).to_be_hidden()
    expect(every).to_be_disabled()
    dialog.get_by_role("combobox", name="Show in Design fields").select_option(label="Controls")
    expect(slider(word, "Opacity")).to_be_visible()
    expect(slider(word, "Width")).to_be_visible()


def test_the_view_command_flips_the_default_and_its_checked_state_follows_the_preference(word):
    item = open_menu(word, "View", "view.design-controls")
    expect(item).to_have_attribute("aria-checked", "true")
    item.click()
    expect(slider(word, "Width")).to_be_hidden()
    expect(raw_switch(word, "Width")).to_have_attribute("aria-pressed", "true")
    expect(open_menu(word, "View", "view.design-controls")).to_have_attribute("aria-checked", "false")
    word.page.keyboard.press("Escape")
    dialog = open_preferences(word)
    choice = dialog.get_by_role("combobox", name="Show in Design fields")
    expect(choice).to_have_value("css")
    choice.select_option(label="Controls")
    expect(slider(word, "Width")).to_be_visible()
    dialog.get_by_role("button", name="Done").click()
    expect(open_menu(word, "View", "view.design-controls")).to_have_attribute("aria-checked", "true")


def test_reset_clears_an_upgraded_field_and_its_control_shows_the_unset_value_in_one_undo_step(word):
    type_value(word, "width", "240px")
    before = word.until(lambda site: styles(site, "h-logo-word").get("width") == "240px", "the typed width")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "240")
    named(word, "Reset Width to the inherited value").click()
    word.until(lambda site: "width" not in styles(site, "h-logo-word"), "the width to be reset")
    expect(field(word, "width")).to_have_value("")
    expect(slider(word, "Width")).to_be_visible()
    expect(slider(word, "Width")).not_to_have_attribute("aria-valuenow", "240")
    run(word, "edit.undo")
    word.restored_to(before)
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "240")


def test_enter_on_a_property_search_result_lands_in_the_text_input_of_a_field_with_a_control(word):
    search = word.page.get_by_placeholder("Search properties")
    search.fill("background")
    expect(word.page.locator("#inspector-results-list .inspector-result").first).to_contain_text("Background")
    search.press("Enter")
    expect(field(word, "background")).to_be_focused()
    expect(named(word, "Choose Background")).to_be_visible()


@pytest.mark.parametrize("key, label, value", [("order", "Order", "5"), ("width", "Width", "100px")])
def test_a_click_on_the_name_of_a_field_puts_the_cursor_in_its_input_and_keeps_the_value(word, key, label, value):
    type_value(word, key, value)
    before = word.until(lambda site: styles(site, "h-logo-word").get(key) == value, f"{key} {value} to be stored")
    field(word, key).blur()
    changes = Changes(word)
    head = field(word, key).locator("xpath=ancestor::label[1]").locator(".field-label")
    expect(head).to_contain_text(label)
    head.click(position={"x": 3, "y": 9})
    changes.settled()
    assert word.site()["site"] == before, f"a click on the name {label} changed the site: {key} is now {stored(word, 'h-logo-word', key)!r}"
    expect(field(word, key)).to_be_focused()
    expect(field(word, key)).to_have_value(value)


def test_a_slider_used_while_tablet_is_picked_writes_the_tablet_value_only(word):
    word.page.get_by_role("combobox", name="Responsive breakpoint").select_option("tablet")
    expect(word.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("tablet")
    before = word.site()["site"]
    slider(word, "Opacity").focus()
    word.page.keyboard.press("Home")
    after = word.until(lambda site: styles(site, "h-logo-word", "tablet").get("opacity") == "0", "the tablet opacity")
    assert "opacity" not in after["nodes"]["h-logo-word"]["styles"]
    assert after["nodes"]["h-logo-word"]["breakpoints"].get("mobile", {}) == before["nodes"]["h-logo-word"]["breakpoints"].get("mobile", {})
    assert {k: v for k, v in after["nodes"].items() if k != "h-logo-word"} == {k: v for k, v in before["nodes"].items() if k != "h-logo-word"}


@pytest.mark.parametrize("target", ["Opacity", "Choose Background", "Type Width by hand", "Choose Grid columns"], ids=["slider", "swatch", "raw-switch", "grid-button"])
def test_delete_and_backspace_with_focus_on_a_control_never_remove_an_element(grid, target):
    changes = Changes(grid)
    before = grid.site()["site"]
    part = slider(grid, target) if target == "Opacity" else named(grid, target)
    part.focus()
    expect(part).to_be_focused()
    grid.page.keyboard.press("Delete")
    grid.page.keyboard.press("Backspace")
    after = changes.settled()
    assert len(after["nodes"]) == len(before["nodes"])
    assert "hero-in" in after["nodes"]
    expect(grid.layer_row("hero-in")).to_be_visible()


def press_through(editor, dialog, stops):
    for _ in range(stops):
        inside = dialog.evaluate("(box) => box.contains(document.activeElement)")
        assert inside, "focus left the open popover"
        if not editor.page.evaluate("document.activeElement.matches('input, textarea, select')"):
            editor.page.keyboard.press("Delete")
            editor.page.keyboard.press("Backspace")
        editor.page.keyboard.press("Tab")


def test_delete_and_backspace_inside_the_open_color_picker_never_remove_an_element(grid):
    changes = Changes(grid)
    before = grid.site()["site"]
    named(grid, "Choose Background").press("Enter")
    dialog = grid.page.get_by_role("dialog", name="Color picker for Background")
    expect(dialog).to_be_visible()
    press_through(grid, dialog, 12)
    grid.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    after = changes.settled()
    assert len(after["nodes"]) == len(before["nodes"])
    expect(grid.layer_row("hero-in")).to_be_visible()


def test_delete_and_backspace_inside_the_open_grid_chooser_never_remove_an_element(grid):
    changes = Changes(grid)
    before = grid.site()["site"]
    named(grid, "Choose Grid columns").press("Enter")
    dialog = grid.page.get_by_role("dialog", name="Choose Grid columns")
    expect(dialog).to_be_visible()
    for key in ("ArrowRight", "ArrowDown", "ArrowRight"):
        grid.page.keyboard.press("Delete")
        grid.page.keyboard.press("Backspace")
        grid.page.keyboard.press(key)
    press_through(grid, dialog, 4)
    grid.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    after = changes.settled()
    assert len(after["nodes"]) == len(before["nodes"])
    assert after["nodes"]["hero-in"]["styles"] == before["nodes"]["hero-in"]["styles"]
    expect(grid.layer_row("hero-in")).to_be_visible()


def test_ctrl_z_with_focus_on_a_slider_after_a_drag_undoes_the_drag(word):
    before = word.site()["site"]
    pointer, box, y = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(box["x"] - 40, y, steps=6, held=True)
    pointer.up()
    word.until(lambda site: styles(site, "h-logo-word").get("opacity") == "0", "the dragged opacity")
    expect(slider(word, "Opacity")).to_be_focused()
    word.page.keyboard.press("Control+z")
    word.restored_to(before)
    expect(field(word, "opacity")).to_have_value("")


def test_a_drag_cut_off_by_a_selection_change_without_the_pointer_writes_nothing_and_both_elements_show_the_state(word):
    changes = Changes(word)
    before = word.site()["site"]
    pointer, box, y = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(box["x"] + box["width"] * 0.3, y, steps=6, held=True)
    expect(field(word, "opacity")).not_to_have_value("")
    run(word, "edit.select-parent")
    expect(word.page.locator(".inspector-tag")).to_have_text(re.compile(r"· h-logo$"))
    pointer.move(box["x"] + box["width"] * 0.1, y, steps=4, held=True)
    pointer.up()
    changes.settled()
    assert changes.sent == []
    assert word.site()["site"] == before
    fields_show_state(word, "h-logo")
    select(word, "h-logo-word")
    fields_show_state(word, "h-logo-word")


def test_a_drag_cut_off_by_a_breakpoint_switch_writes_nothing_and_each_breakpoint_shows_the_state(word):
    changes = Changes(word)
    before = word.site()["site"]
    pointer, box, y = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(box["x"] + box["width"] * 0.3, y, steps=6, held=True)
    expect(field(word, "opacity")).not_to_have_value("")
    run(word, "view.tablet")
    expect(word.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("tablet")
    pointer.move(box["x"] + box["width"] * 0.1, y, steps=4, held=True)
    pointer.up()
    changes.settled()
    assert changes.sent == []
    assert word.site()["site"] == before
    fields_show_state(word, "h-logo-word", "tablet")
    run(word, "view.desktop")
    expect(word.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("desktop")
    fields_show_state(word, "h-logo-word")


def hold_first_change(editor):
    held = []
    editor.page.route(OWN_CHANGE, lambda route: route.continue_() if held else held.append((route, route.fetch())))
    return held


def test_a_slider_used_while_a_typed_value_is_on_its_way_steps_from_the_typed_value(word):
    held = hold_first_change(word)
    type_value(word, "width", "40px")
    word.eventually(lambda: held, "the typed width to reach the engine")
    slider(word, "Width").focus()
    word.page.keyboard.press("ArrowRight")
    expect(field(word, "width")).to_have_value("41px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "41")
    route, answer = held[0]
    route.fulfill(response=answer)
    word.until(lambda site: styles(site, "h-logo-word").get("width") == "41px", "the stepped width")
    expect(field(word, "width")).to_have_value("41px")
    expect(slider(word, "Width")).to_have_attribute("aria-valuenow", "41")


def test_the_color_picker_opened_while_a_typed_gradient_is_on_its_way_opens_on_the_gradient(word):
    held = hold_first_change(word)
    type_value(word, "background", GRADIENT)
    word.eventually(lambda: held, "the typed gradient to reach the engine")
    named(word, "Choose Background").click()
    dialog = word.page.get_by_role("dialog", name="Color picker for Background")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role("tab", name="Gradient")).to_have_attribute("aria-selected", "true")
    route, answer = held[0]
    route.fulfill(response=answer)
    word.until(lambda site: styles(site, "h-logo-word").get("background") == GRADIENT, "the typed gradient")
    expect(dialog.get_by_role("tab", name="Gradient")).to_have_attribute("aria-selected", "true")
    word.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    assert stored(word, "h-logo-word", "background") == GRADIENT


def test_tab_moves_through_a_color_field_in_the_order_it_is_drawn_swatch_then_input(word):
    swatch = named(word, "Choose Background")
    assert swatch.bounding_box()["x"] < field(word, "background").bounding_box()["x"]
    raw_switch(word, "Background").focus()
    word.page.keyboard.press("Tab")
    expect(swatch).to_be_focused()
    word.page.keyboard.press("Tab")
    expect(field(word, "background")).to_be_focused()


CONTROL_PARTS = {
    "slider": '.inspector [role="slider"]',
    "color swatch": '.inspector button[aria-label^="Choose "]',
    "raw switch": '.inspector button[aria-label$=" by hand"]',
    "unit chooser": '.inspector select[aria-label^="Unit for "]',
}

WATCH = """(selectors) => {
  window.__before = [];
  window.__after = [];
  window.__framesBefore = 0;
  const look = () => {
    const ready = document.body && document.body.classList.contains('app-ready');
    if (!ready) window.__framesBefore += 1;
    const seen = ready ? window.__after : window.__before;
    for (const [name, selector] of Object.entries(selectors)) {
      for (const el of document.querySelectorAll(selector)) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !seen.includes(name)) seen.push(name);
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}"""


def test_on_a_cold_load_no_part_of_any_control_is_visible_before_the_editor_is_ready(chromium, fresh_engine):
    context = chromium.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = context.new_page()
        page.add_init_script(f"({WATCH})({json.dumps(CONTROL_PARTS)})")
        cdp = context.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        page.goto(fresh_engine + "/", wait_until="load")
        expect(page.locator("body")).to_have_class(re.compile(r"\bapp-ready\b"), timeout=60_000)
        page.locator('[data-demo="harbour-ferries"]').click()
        expect(page.locator('#fw-layers-list .layer-row[data-key="h-logo-word"]')).to_be_visible()
        page.locator('#fw-layers-list .layer-row[data-key="h-logo-word"]').click()
        page.wait_for_function("names => names.every(name => window.__after.includes(name))", arg=list(CONTROL_PARTS), timeout=30_000)
        assert page.evaluate("window.__framesBefore") > 0
        assert page.evaluate("window.__before") == []
    finally:
        context.close()


FRAMES = """(keys) => {
  window.__frames = [];
  const look = () => {
    window.__frames.push(keys.map(key => {
      const box = document.querySelector(`input[data-style="${key}"]`).closest('.field').getBoundingClientRect();
      const parts = [...document.querySelector(`input[data-style="${key}"]`).closest('.field').querySelectorAll('[role="slider"], button[aria-label^="Choose "]')];
      return [key, box.x, box.y, box.width, box.height, parts.some(el => el.checkVisibility({ visibilityProperty: true }))];
    }));
    if (window.__frames.length < 100000) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}"""


def test_no_control_flashes_and_no_field_moves_in_any_frame_while_the_selection_changes(word):
    keys = ["opacity", "width", "height", "border-radius", "background", "color"]
    word.page.evaluate(FRAMES, keys)
    for node in ("h-tools", "hero-copy", "h-logo-word", "hero-copy", "h-tools"):
        select(word, node)
        word.page.evaluate(QUIET)
    frames = word.page.evaluate("window.__frames")
    assert len(frames) > 5
    assert all(visible for frame in frames for *_, visible in frame), f"a control was hidden in a frame: {next(f for f in frames if not all(v for *_, v in f))}"
    shapes = {tuple(tuple(part[:5]) for part in frame) for frame in frames}
    assert len(shapes) == 1, f"the fields took {len(shapes)} different places"
