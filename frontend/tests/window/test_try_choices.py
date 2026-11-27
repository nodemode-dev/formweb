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
LOOK = "(node, prop) => getComputedStyle(node).getPropertyValue(prop)"
FIELD_BOXES = """() => [...document.querySelectorAll('.inspector .field')].filter(node => node.getClientRects().length).map(node => {
  const scroller = node.closest('.inspector-scroll');
  const origin = scroller.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  return [box.x - origin.x, box.y - origin.y + scroller.scrollTop, box.width, box.height];
})"""
RECORD = """(node) => {
  window.__seen = [];
  const frame = document.querySelector('iframe[title="Website canvas"]');
  const look = () => {
    if (window.__seen === null) return;
    const target = frame.contentDocument.querySelector(`[data-fw-id="${node}"]`);
    window.__seen.push(target ? getComputedStyle(target).textAlign : 'gone');
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}"""
STOP = "() => { const seen = window.__seen; window.__seen = null; return seen; }"
REST = "() => new Promise(done => { let left = 30; const tick = () => (--left ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); })"
WATCH = """() => {
  window.__before = 0;
  window.__after = 0;
  window.__framesBefore = 0;
  const look = () => {
    const ready = document.body && document.body.classList.contains('app-ready');
    if (!ready) window.__framesBefore += 1;
    for (const el of document.querySelectorAll('[data-try-bar]')) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        if (ready) window.__after += 1; else window.__before += 1;
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}"""
NOT_KEPT = "Not kept: Text alignment is unchanged."
ELSEWHERE = "The element was changed elsewhere, so the trial was dropped."
SWITCH = "Try choices on the page before keeping them"


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

    def bodies(self):
        return [r.post_data_json for r in self.sent]


def select(editor, node):
    editor.layer_row(node).click()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {re.escape(node)}$"))


def group(editor, label="Text alignment"):
    return editor.page.get_by_role("group", name=label, exact=True)


def segment(editor, name, label="Text alignment"):
    return group(editor, label).get_by_role("button", name=name, exact=True)


def bar(editor):
    return editor.page.locator("[data-try-bar]")


def keep_button(editor):
    return bar(editor).get_by_role("button", name=re.compile(r"^Keep\b"))


def revert_button(editor):
    return bar(editor).get_by_role("button", name=re.compile(r"^Revert\b"))


def look(editor, node, prop="text-align"):
    return editor.canvas.locator(f'[data-fw-id="{node}"]').evaluate(LOOK, prop)


def shows(editor, node, value, prop="text-align"):
    editor.eventually(lambda: look(editor, node, prop) == value, f"{node} to show {prop} {value} on the page (it shows {look(editor, node, prop)!r})")


def styles(site, node, breakpoint="desktop"):
    item = site["nodes"][node]
    return item["styles"] if breakpoint == "desktop" else item.get("breakpoints", {}).get(breakpoint, {})


def stored(editor, node, key="text-align", breakpoint="desktop"):
    return styles(editor.site()["site"], node, breakpoint).get(key)


def open_menu(editor, menu, command):
    editor.page.locator(f'[data-menu="{menu}"]').click()
    return editor.page.locator(f'[role="menu"]:visible [data-command="{command}"]')


def open_preferences(editor):
    open_menu(editor, "Edit", "edit.settings").click()
    dialog = editor.page.get_by_role("dialog", name="Preferences")
    dialog.get_by_role("tab", name="Interface").click()
    return dialog


def export_files(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}


def outside(editor, node, style):
    editor.command("node.update", {"id": node, "patch": {"styles": style}})


def hold_changes(editor):
    held = []
    editor.page.route(OWN_CHANGE, lambda route: held.append(route))
    return held


def try_center(editor, node="hero-h"):
    segment(editor, "Center").click()
    shows(editor, node, "center")
    expect(bar(editor)).to_be_visible()
    expect(bar(editor)).to_contain_text("Trying: Center")


@pytest.fixture
def heading(harbour):
    select(harbour, "hero-h")
    shows(harbour, "hero-h", "start")
    return harbour


@pytest.fixture
def trial(heading):
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    return heading, changes, before


def nothing_written(editor, changes, before):
    after = changes.settled()
    assert [r.post_data_json for r in changes.sent] == [], "the window sent a change"
    assert editor.site()["revision"] == before["revision"]
    assert after == before["site"]


def test_a_click_on_a_segment_shows_the_choice_on_the_page_and_writes_nothing(trial):
    editor, changes, before = trial
    assert look(editor, "hero-p") == "start"
    nothing_written(editor, changes, before)
    assert stored(editor, "hero-h") is None
    expect(editor.page.locator("footer.statusbar .status-revision")).to_contain_text(re.compile(rf"\brev {before['revision']}\b"))


def test_the_bar_names_the_tried_choice_and_the_tried_segment_looks_unlike_the_stored_and_the_others(heading):
    outside(heading, "hero-h", {"text-align": "right"})
    shows(heading, "hero-h", "right")
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    look_of = "node => { const s = getComputedStyle(node); return [s.outlineStyle, s.outlineColor, s.backgroundColor, s.color].join(' ') }"
    plain = segment(heading, "Left").evaluate(look_of)
    kept = segment(heading, "Right").evaluate(look_of)
    try_center(heading)
    expect(keep_button(heading)).to_be_visible()
    expect(revert_button(heading)).to_be_visible()
    expect(segment(heading, "Center")).to_have_attribute("aria-pressed", "false")
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    tried = segment(heading, "Center").evaluate(look_of)
    assert tried != plain and tried != kept, f"the tried segment looks like another one: tried {tried}, stored {kept}, plain {plain}"
    shown, field = bar(heading).bounding_box(), group(heading).bounding_box()
    apart = shown["y"] >= field["y"] + field["height"] or shown["y"] + shown["height"] <= field["y"]
    assert apart, f"the bar {shown} covers the field {field}"
    gap = max(shown["y"] - (field["y"] + field["height"]), field["y"] - (shown["y"] + shown["height"]))
    assert gap < shown["height"], f"the bar is {gap} px away from the field"
    panel = heading.page.locator("aside.inspector").bounding_box()
    assert heading.page.viewport_size["width"] == 1440
    inside = panel["x"] <= shown["x"] and shown["x"] + shown["width"] <= panel["x"] + panel["width"]
    assert inside, f"the bar spans x {shown['x']} to {shown['x'] + shown['width']}, outside the right panel's {panel['x']} to {panel['x'] + panel['width']}"


def test_arrow_keys_home_and_end_try_each_choice_in_turn_without_writing(trial):
    editor, changes, before = trial
    for key, value in (("ArrowRight", "right"), ("ArrowRight", "justify"), ("ArrowLeft", "right"), ("Home", "left"), ("End", "justify")):
        editor.page.keyboard.press(key)
        shows(editor, "hero-h", value)
        assert editor.site()["revision"] == before["revision"], f"{key} wrote a change"
    expect(bar(editor)).to_contain_text("Trying: Justify")
    nothing_written(editor, changes, before)


@pytest.mark.parametrize("how", ["enter", "button"])
def test_keep_writes_the_tried_value_in_one_undo_step(trial, how):
    editor, changes, before = trial
    if how == "enter":
        editor.page.keyboard.press("Enter")
    else:
        keep_button(editor).click()
    after = editor.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to be stored")
    assert editor.site()["revision"] == before["revision"] + 1
    assert len(changes.sent) == 1
    expect(bar(editor)).to_be_hidden()
    shows(editor, "hero-h", "center")
    assert {k: v for k, v in after["nodes"].items() if k != "hero-h"} == {k: v for k, v in before["site"]["nodes"].items() if k != "hero-h"}
    editor.undo()
    editor.restored_to(before["site"])
    shows(editor, "hero-h", "start")


@pytest.mark.parametrize("how", ["escape", "button"])
def test_revert_puts_the_page_back_and_says_the_field_is_unchanged(trial, how):
    editor, changes, before = trial
    if how == "escape":
        editor.page.keyboard.press("Escape")
    else:
        revert_button(editor).click()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    expect(editor.status).to_have_text(NOT_KEPT)
    nothing_written(editor, changes, before)


def test_keep_on_the_value_already_stored_ends_quietly_and_sends_nothing(heading):
    outside(heading, "hero-h", {"text-align": "right"})
    shows(heading, "hero-h", "right")
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    heading.page.keyboard.press("ArrowRight")
    expect(bar(heading)).to_contain_text("Trying: Right")
    heading.page.keyboard.press("Enter")
    expect(bar(heading)).to_be_hidden()
    shows(heading, "hero-h", "right")
    heading.page.evaluate(QUIET)
    expect(heading.status).not_to_contain_text("Not kept")
    nothing_written(heading, changes, before)


def test_a_click_on_the_stored_segment_tries_no_own_value_and_keep_clears_it(heading):
    outside(heading, "hero-h", {"text-align": "right"})
    shows(heading, "hero-h", "right")
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    before = heading.site()
    segment(heading, "Right").click()
    shows(heading, "hero-h", "start")
    expect(bar(heading)).to_contain_text("Trying: Inherit")
    assert heading.site() == before
    keep_button(heading).click()
    heading.until(lambda site: "text-align" not in styles(site, "hero-h"), "text-align to be cleared")
    assert heading.site()["revision"] == before["revision"] + 1
    shows(heading, "hero-h", "start")
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "false")


def test_under_tablet_a_trial_and_its_keep_touch_the_tablet_value_only(heading):
    picker = heading.page.get_by_role("combobox", name="Responsive breakpoint")
    picker.select_option("tablet")
    expect(picker).to_have_value("tablet")
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    assert heading.site() == before
    heading.page.keyboard.press("Enter")
    after = heading.until(lambda site: styles(site, "hero-h", "tablet").get("text-align") == "center", "the tablet value")
    assert "text-align" not in after["nodes"]["hero-h"]["styles"]
    assert after["nodes"]["hero-h"]["breakpoints"].get("mobile", {}) == before["site"]["nodes"]["hero-h"]["breakpoints"].get("mobile", {})
    assert len(changes.sent) == 1


def test_trying_hidden_hides_the_element_and_revert_shows_it_again_still_selected(heading):
    changes = Changes(heading)
    before = heading.site()
    shown = look(heading, "hero-h", "display")
    assert shown != "none"
    segment(heading, "Hidden", "Display").click()
    shows(heading, "hero-h", "none", "display")
    expect(bar(heading)).to_contain_text("Trying: Hidden")
    revert_button(heading).click()
    shows(heading, "hero-h", shown, "display")
    expect(heading.page.locator(".inspector-tag")).to_have_text(re.compile(r"· hero-h$"))
    expect(heading.layer_row("hero-h")).to_have_attribute("aria-selected", "true")
    nothing_written(heading, changes, before)


def test_with_trying_switched_off_a_segment_click_writes_at_once_and_shows_no_bar(heading):
    open_menu(heading, "View", "view.try-choices").click()
    expect(heading.status).to_have_text("Clicked choices are now written at once.")
    before = heading.site()
    segment(heading, "Center").click()
    heading.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to be stored")
    assert heading.site()["revision"] == before["revision"] + 1
    shows(heading, "hero-h", "center")
    expect(bar(heading)).to_be_hidden()


def test_a_canvas_click_on_another_element_drops_the_trial_and_writes_nothing(trial):
    editor, changes, before = trial
    editor.canvas.locator('[data-fw-id="hero-p"]').click()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(r"· hero-p$"))
    shows(editor, "hero-h", "start")
    assert look(editor, "hero-p") == "start"
    expect(bar(editor)).to_be_hidden()
    nothing_written(editor, changes, before)


@pytest.mark.parametrize("how", ["click", "double-click"])
def test_a_canvas_press_on_the_element_already_selected_reverts_the_trial_and_writes_nothing(trial, how):
    editor, changes, before = trial
    target = editor.canvas.locator('[data-fw-id="hero-h"]')
    editing = editor.canvas.locator('[data-fw-text="hero-h"][contenteditable="true"]')
    if how == "click":
        target.click()
    else:
        target.dblclick()
        expect(editing).to_be_visible()
        expect(editing).to_be_focused()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(r"· hero-h$"))
    nothing_written(editor, changes, before)
    if how == "double-click":
        text = before["site"]["nodes"]["hero-h"]["text"]
        editor.page.keyboard.press("Tab")
        expect(editing).to_have_count(0)
        after = changes.settled()
        assert after == before["site"], "leaving text editing changed the site"
        assert editor.site()["revision"] == before["revision"]
        assert all(json.dumps(body["params"]["patch"]) == json.dumps({"text": text}) for body in changes.bodies()), f"leaving text editing sent more than the unchanged text: {changes.bodies()}"
        shows(editor, "hero-h", "start")


@pytest.mark.parametrize("how", ["layers", "select-parent"])
def test_selecting_another_element_from_layers_or_the_edit_menu_ends_the_trial_and_writes_nothing(trial, how):
    editor, changes, before = trial
    if how == "layers":
        select(editor, "hero-p")
    else:
        open_menu(editor, "Edit", "edit.select-parent").click()
        expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(r"· hero-copy$"))
    shows(editor, "hero-h", "start")
    assert look(editor, "hero-p") == "start"
    assert look(editor, "hero-copy") == "start"
    expect(bar(editor)).to_be_hidden()
    nothing_written(editor, changes, before)


def test_picking_another_breakpoint_ends_the_trial_and_the_fields_show_that_breakpoints_stored_value(heading):
    heading.command("node.update", {"id": "hero-h", "patch": {"breakpoints": {"tablet": {"text-align": "right"}}}})
    heading.until(lambda site: styles(site, "hero-h", "tablet").get("text-align") == "right", "the tablet value")
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    picker = heading.page.get_by_role("combobox", name="Responsive breakpoint")
    picker.select_option("tablet")
    expect(picker).to_have_value("tablet")
    shows(heading, "hero-h", "right")
    expect(bar(heading)).to_be_hidden()
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    expect(segment(heading, "Center")).to_have_attribute("aria-pressed", "false")
    expect(group(heading).locator("[data-trying]")).to_have_count(0)
    nothing_written(heading, changes, before)


def test_opening_another_page_ends_the_trial_and_coming_back_shows_the_stored_look(trial):
    editor, changes, before = trial
    editor.page_row("p-fares").click()
    editor.canvas.locator('[data-fw-id="p-fares-root"]').wait_for()
    expect(bar(editor)).to_be_hidden()
    editor.page_row("home").click()
    editor.canvas.locator('[data-fw-id="hero-h"]').wait_for()
    shows(editor, "hero-h", "start")
    nothing_written(editor, changes, before)


@pytest.mark.parametrize("how", ["live-preview", "full-preview"])
def test_leaving_design_for_a_preview_ends_the_trial_and_the_page_shows_the_stored_look_on_return(trial, how):
    editor, changes, before = trial
    if how == "live-preview":
        open_menu(editor, "View", "view.preview").click()
        expect(bar(editor)).to_be_hidden()
        item = open_menu(editor, "View", "view.preview")
        expect(item).to_have_attribute("aria-checked", "true")
        item.click()
    else:
        editor.page.locator('[data-cmd="view.preview-full"]').click()
        dialog = editor.page.get_by_role("dialog", name="Preview as published")
        expect(dialog).to_be_visible()
        expect(bar(editor)).to_be_hidden()
        dialog.get_by_role("button", name="Close").click()
        expect(dialog).to_be_hidden()
    editor.canvas.locator('[data-fw-id="hero-h"]').wait_for()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    nothing_written(editor, changes, before)


def kept_right(editor):
    segment(editor, "Right").click()
    shows(editor, "hero-h", "right")
    editor.page.keyboard.press("Enter")
    return editor.until(lambda site: styles(site, "hero-h").get("text-align") == "right", "right to be kept")


@pytest.mark.parametrize("how", ["ctrl-z", "toolbar", "menu"])
def test_undo_during_a_trial_reverts_the_trial_and_undoes_nothing_and_the_next_undo_really_undoes(heading, how):
    start = heading.site()
    kept_right(heading)
    before = heading.site()
    assert before["canUndo"] is True
    changes = Changes(heading)

    def undo():
        if how == "ctrl-z":
            heading.undo()
        elif how == "toolbar":
            heading.page.locator('button[data-cmd="edit.undo"]').click()
        else:
            open_menu(heading, "Edit", "edit.undo").click()

    try_center(heading)
    undo()
    shows(heading, "hero-h", "right")
    expect(bar(heading)).to_be_hidden()
    nothing_written(heading, changes, before)
    assert heading.site()["canRedo"] is False, "Redo became available, so the undo undid a kept change"
    assert stored(heading, "hero-h") == "right"
    undo()
    heading.restored_to(start["site"])
    shows(heading, "hero-h", "start")


def test_ctrl_z_on_a_site_with_no_undo_history_still_reverts_the_trial(trial):
    editor, changes, before = trial
    assert before["canUndo"] is False, "the freshly opened site already has undo history"
    editor.undo()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    expect(editor.status).to_have_text(NOT_KEPT)
    nothing_written(editor, changes, before)


def test_an_undo_run_by_a_program_during_a_trial_reverts_the_trial_and_really_undoes(heading):
    start = heading.site()
    kept_right(heading)
    try_center(heading)
    answer = heading.page.evaluate("window.formweb.run('edit.undo')")
    assert answer.get("ran") is True, answer
    heading.restored_to(start["site"])
    shows(heading, "hero-h", "start")
    expect(bar(heading)).to_be_hidden()


def test_duplicate_from_the_menu_during_a_trial_reverts_it_first_and_copies_the_stored_element(trial):
    editor, changes, before = trial
    open_menu(editor, "Edit", "edit.duplicate").click()
    after = editor.changed_from(before["site"])
    copies = [k for k in after["nodes"]["hero-copy"]["children"] if k not in before["site"]["nodes"]]
    assert len(copies) == 1
    assert "text-align" not in after["nodes"][copies[0]]["styles"]
    assert after["nodes"]["hero-h"] == before["site"]["nodes"]["hero-h"]
    shows(editor, "hero-h", "start")
    shows(editor, copies[0], "start")
    assert editor.site()["revision"] == before["revision"] + 1


def test_delete_from_the_menu_during_a_trial_reverts_it_first_and_undo_brings_back_the_stored_element(trial):
    editor, changes, before = trial
    open_menu(editor, "Edit", "edit.delete").click()
    editor.until(lambda site: "hero-h" not in site["nodes"], "hero-h to be deleted")
    assert editor.site()["revision"] == before["revision"] + 1
    expect(bar(editor)).to_be_hidden()
    editor.undo()
    editor.restored_to(before["site"])
    shows(editor, "hero-h", "start")


def reset_link(editor):
    return editor.page.get_by_role("button", name="Reset Text alignment to the inherited value", exact=True)


def test_reset_on_the_tried_field_reverts_the_trial_and_then_clears_the_stored_value(heading):
    outside(heading, "hero-h", {"text-align": "right"})
    before = heading.until(lambda site: styles(site, "hero-h").get("text-align") == "right", "right to be stored")
    changes = Changes(heading)
    try_center(heading)
    reset_link(heading).click()
    heading.until(lambda site: "text-align" not in styles(site, "hero-h"), "text-align to be reset")
    assert len(changes.sent) == 1
    shows(heading, "hero-h", "start")
    expect(bar(heading)).to_be_hidden()
    heading.undo()
    heading.restored_to(before)


def test_backspace_right_after_a_click_on_reset_during_a_trial_removes_nothing(heading):
    outside(heading, "hero-h", {"text-align": "right"})
    heading.until(lambda site: styles(site, "hero-h").get("text-align") == "right", "right to be stored")
    changes = Changes(heading)
    try_center(heading)
    reset_link(heading).click()
    heading.page.keyboard.press("Backspace")
    heading.page.keyboard.press("Delete")
    after = changes.settled()
    assert "hero-h" in after["nodes"], "Backspace after Reset removed the selected element"
    assert "text-align" not in styles(after, "hero-h")
    expect(heading.layer_row("hero-h")).to_be_visible()
    shows(heading, "hero-h", "start")


def test_an_outside_change_to_another_element_leaves_the_trial_on_and_keep_still_works(trial):
    editor, changes, before = trial
    outside(editor, "hero-p", {"color": "rgb(1, 2, 3)"})
    shows(editor, "hero-p", "rgb(1, 2, 3)", "color")
    assert look(editor, "hero-h") == "center", "the trial left the page"
    expect(bar(editor)).to_be_visible()
    keep_button(editor).click()
    after = editor.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to be kept")
    assert styles(after, "hero-p").get("color") == "rgb(1, 2, 3)"
    assert len(changes.sent) == 1


def test_an_outside_change_to_the_tried_field_drops_the_trial_and_shows_the_outside_value(trial):
    editor, changes, before = trial
    outside(editor, "hero-h", {"text-align": "right"})
    shows(editor, "hero-h", "right")
    expect(bar(editor)).to_be_hidden()
    expect(editor.status).to_have_text(ELSEWHERE)
    expect(segment(editor, "Right")).to_have_attribute("aria-pressed", "true")
    expect(segment(editor, "Center")).not_to_have_attribute("data-trying", "")
    changes.settled()
    assert changes.sent == []
    assert stored(editor, "hero-h") == "right"


def test_an_outside_removal_of_the_tried_element_ends_the_trial_without_an_error(trial):
    editor, changes, before = trial
    errors = []
    editor.page.on("pageerror", lambda error: errors.append(error))
    editor.command("node.remove", {"id": "hero-h"})
    editor.until(lambda site: "hero-h" not in site["nodes"], "hero-h to be removed")
    expect(editor.canvas.locator('[data-fw-id="hero-h"]')).to_have_count(0)
    expect(bar(editor)).to_be_hidden()
    expect(editor.status).to_have_text(ELSEWHERE)
    expect(editor.status).not_to_have_class(re.compile(r"\berror\b"))
    changes.settled()
    assert changes.sent == []
    assert errors == []


@pytest.mark.parametrize("how", ["tab", "click"])
def test_moving_focus_to_another_field_reverts_the_trial(trial, how):
    editor, changes, before = trial
    if how == "tab":
        editor.page.keyboard.press("Tab")
        expect(keep_button(editor)).to_be_focused()
        editor.page.keyboard.press("Tab")
        expect(revert_button(editor)).to_be_focused()
        assert look(editor, "hero-h") == "center"
        editor.page.keyboard.press("Tab")
        assert not editor.page.evaluate("document.activeElement.closest('[data-try-bar], .fw-seg') !== null")
    else:
        editor.page.locator('input[data-style="font-size"]').click()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    expect(editor.status).to_have_text(NOT_KEPT)
    nothing_written(editor, changes, before)


def test_switching_to_another_window_and_back_leaves_the_trial_on(trial):
    editor, changes, before = trial
    other = editor.page.context.new_page()
    other.bring_to_front()
    editor.page.evaluate("window.dispatchEvent(new FocusEvent('blur'))")
    editor.page.bring_to_front()
    editor.page.evaluate("window.dispatchEvent(new FocusEvent('focus'))")
    editor.page.evaluate(QUIET)
    other.close()
    assert look(editor, "hero-h") == "center", "the trial left the page"
    expect(bar(editor)).to_be_visible()
    editor.page.keyboard.press("Enter")
    editor.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to be kept")
    assert len(changes.sent) == 1


def test_scrolling_the_page_and_the_inspector_with_the_wheel_leaves_the_trial_on(trial):
    editor, changes, before = trial
    frame = editor.page.locator('iframe[title="Website canvas"]').bounding_box()
    editor.page.mouse.move(frame["x"] + frame["width"] / 2, frame["y"] + frame["height"] / 2)
    editor.page.mouse.wheel(0, 400)
    editor.eventually(lambda: editor.canvas.locator("html").evaluate("node => node.ownerDocument.defaultView.scrollY") > 0, "the page to scroll")
    scroller = editor.page.locator(".inspector-scroll:visible").first
    start = scroller.evaluate("node => node.scrollTop")
    box = scroller.bounding_box()
    editor.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    editor.page.mouse.wheel(0, 300)
    editor.eventually(lambda: scroller.evaluate("node => node.scrollTop") != start, "the inspector to scroll")
    editor.page.evaluate(QUIET)
    assert look(editor, "hero-h") == "center", "the trial left the page"
    expect(bar(editor)).to_be_visible()
    nothing_written(editor, changes, before)


EMPTY_SPOT = """(seg) => {
  const area = seg.closest('.inspector-section');
  const box = area.getBoundingClientRect();
  for (let y = box.top + 2; y < box.bottom; y += 2) {
    for (const x of [box.left + 2, box.right - 3]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === area || hit.classList.contains('form-grid')) && hit.tabIndex < 0) return [x, y];
    }
  }
  return null;
}"""


def test_a_press_on_empty_inspector_padding_leaves_the_trial_on_and_backspace_then_removes_nothing(trial):
    editor, changes, before = trial
    spot = group(editor).evaluate(EMPTY_SPOT)
    assert spot, "no empty spot in the Typography section"
    editor.page.mouse.click(*spot)
    editor.page.evaluate(QUIET)
    assert look(editor, "hero-h") == "center", "the trial left the page"
    expect(bar(editor)).to_be_visible()
    assert not editor.page.evaluate("document.activeElement === document.body"), "focus fell to the page body"
    editor.page.keyboard.press("Backspace")
    editor.page.keyboard.press("Delete")
    nothing_written(editor, changes, before)
    expect(editor.layer_row("hero-h")).to_be_visible()


def test_a_trial_on_another_field_reverts_the_first_so_only_the_second_is_on_the_page(trial):
    editor, changes, before = trial
    segment(editor, "Flex", "Display").click()
    shows(editor, "hero-h", "flex", "display")
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_contain_text("Trying: Flex")
    expect(group(editor).locator("[data-trying]")).to_have_count(0)
    nothing_written(editor, changes, before)


def test_starting_to_drag_a_slider_reverts_the_trial(trial):
    editor, changes, before = trial
    thumb = editor.page.get_by_role("slider", name="Opacity", exact=True)
    thumb.scroll_into_view_if_needed()
    box = thumb.bounding_box()
    pointer = editor.canvas_pointer()
    y = box["y"] + box["height"] / 2
    pointer.move(box["x"] + box["width"] * 0.9, y)
    pointer.down()
    pointer.move(box["x"] + box["width"] * 0.5, y, steps=6, held=True)
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    pointer.up()
    after = editor.until(lambda site: "opacity" in styles(site, "hero-h"), "the dragged opacity")
    assert "text-align" not in styles(after, "hero-h")
    shows(editor, "hero-h", "start")


@pytest.mark.parametrize("how", ["view-menu", "preferences"])
def test_turning_the_switch_off_ends_the_trial_and_writes_nothing(trial, how):
    editor, changes, before = trial
    if how == "view-menu":
        open_menu(editor, "View", "view.try-choices").click()
    else:
        box = open_preferences(editor).get_by_role("checkbox", name=SWITCH)
        expect(box).to_be_checked()
        box.uncheck()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    nothing_written(editor, changes, before)
    assert editor.page.evaluate("localStorage.getItem('formweb.try-choices')") == "0"


def test_a_reload_during_a_trial_leaves_the_site_as_stored(trial):
    editor, changes, before = trial
    editor.page.reload()
    editor.page.get_by_role("button", name="Back to Editor").click()
    editor.canvas.locator('[data-fw-id="hero-h"]').wait_for()
    shows(editor, "hero-h", "start")
    assert changes.sent == []
    assert editor.site() == before


@pytest.mark.parametrize("trying", [True, False], ids=["during-a-trial", "no-trial"])
def test_folding_the_section_by_a_click_on_its_title_reverts_a_trial_and_a_backspace_right_after_removes_nothing(heading, trying):
    changes = Changes(heading)
    before = heading.site()
    if trying:
        try_center(heading)
    title = heading.page.locator(".inspector-section .section-title", has_text="Typography")
    title.click()
    expect(title).to_have_attribute("aria-expanded", "false")
    expect(group(heading)).to_be_hidden()
    expect(title).to_be_focused()
    shows(heading, "hero-h", "start")
    expect(bar(heading)).to_be_hidden()
    if trying:
        expect(heading.status).to_have_text(NOT_KEPT)
    heading.page.keyboard.press("Backspace")
    heading.page.keyboard.press("Delete")
    after = changes.settled()
    assert "hero-h" in after["nodes"], "Backspace on the folded section's title removed the selected element"
    nothing_written(heading, changes, before)
    expect(heading.layer_row("hero-h")).to_be_visible()
    expect(heading.layer_row("hero-h")).to_have_attribute("aria-selected", "true")


@pytest.mark.parametrize("how", ["tab", "search"])
def test_hiding_the_field_reverts_the_trial_and_a_backspace_right_after_removes_nothing(trial, how):
    editor, changes, before = trial
    if how == "tab":
        editor.page.locator(".inspector button.quiet", has_text="Motion").click()
        expect(group(editor)).to_be_hidden()
    else:
        editor.page.get_by_placeholder("Search properties").fill("opacity")
        expect(group(editor)).to_be_hidden()
    shows(editor, "hero-h", "start")
    expect(bar(editor)).to_be_hidden()
    editor.page.keyboard.press("Backspace")
    editor.page.keyboard.press("Delete")
    assert not editor.page.evaluate("document.activeElement === document.body"), "focus fell to the page body"
    nothing_written(editor, changes, before)
    expect(editor.layer_row("hero-h")).to_be_visible()


@pytest.mark.parametrize("target", ["segment", "keep", "revert"])
def test_delete_and_backspace_with_focus_on_a_segment_or_the_bar_remove_nothing(trial, target):
    editor, changes, before = trial
    part = {"segment": segment(editor, "Center"), "keep": keep_button(editor), "revert": revert_button(editor)}[target]
    part.focus()
    expect(part).to_be_focused()
    editor.page.keyboard.press("Delete")
    editor.page.keyboard.press("Backspace")
    assert look(editor, "hero-h") == "center", "the trial left the page"
    nothing_written(editor, changes, before)
    expect(editor.layer_row("hero-h")).to_be_visible()


def test_with_a_slow_engine_keys_and_clicks_after_keep_change_nothing_and_one_write_lands_with_no_old_frame(trial):
    editor, changes, before = trial
    held = hold_changes(editor)
    editor.page.evaluate(RECORD, "hero-h")
    editor.page.keyboard.press("Enter")
    editor.eventually(lambda: held, "Keep to reach the engine")
    expect(bar(editor)).to_have_attribute("aria-busy", "true")
    for key in ("Enter", "Escape", "ArrowRight"):
        editor.page.keyboard.press(key)
    segment(editor, "Justify").click()
    editor.page.evaluate(QUIET)
    assert look(editor, "hero-h") == "center"
    assert len(changes.sent) == 1
    held[0].continue_()
    editor.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to be kept")
    expect(bar(editor)).to_be_hidden()
    editor.page.evaluate(QUIET)
    seen = editor.page.evaluate(STOP)
    assert len(seen) > 1
    assert set(seen) == {"center"}, f"the page showed {sorted(set(seen))} between Enter and the answer"
    changes.settled()
    assert len(changes.sent) == 1
    body = json.dumps(changes.bodies()[0])
    assert '"hero-h"' in body and '"center"' in body and '"justify"' not in body and '"right"' not in body, body
    assert editor.site()["revision"] == before["revision"] + 1
    assert {k: v for k, v in editor.site()["site"]["nodes"].items() if k != "hero-h"} == {k: v for k, v in before["site"]["nodes"].items() if k != "hero-h"}


def test_selecting_another_element_while_keep_is_pending_lands_the_value_on_the_first_and_the_field_takes_a_new_trial_at_once(trial):
    editor, changes, before = trial
    held = hold_changes(editor)
    editor.page.evaluate(RECORD, "hero-h")
    editor.page.keyboard.press("Enter")
    editor.eventually(lambda: held, "Keep to reach the engine")
    select(editor, "hero-p")
    expect(bar(editor)).to_be_hidden()
    segment(editor, "Right").click()
    shows(editor, "hero-p", "right")
    expect(bar(editor)).to_contain_text("Trying: Right")
    assert look(editor, "hero-h") == "center"
    held[0].continue_()
    after = editor.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center to land on hero-h")
    assert "text-align" not in styles(after, "hero-p")
    seen = editor.page.evaluate(STOP)
    assert set(seen) == {"center"}, f"hero-h showed {sorted(set(seen))} while its Keep was on the way"
    assert look(editor, "hero-p") == "right", "the new trial on hero-p left the page when the first Keep landed"
    expect(bar(editor)).to_be_visible()
    editor.page.keyboard.press("Escape")
    shows(editor, "hero-p", "start")
    changes.settled()
    assert len(changes.sent) == 1
    assert stored(editor, "hero-p") is None


@pytest.mark.parametrize("how", ["refused", "conflict"])
def test_a_keep_the_engine_refuses_puts_the_page_and_the_field_back_to_the_stored_value_and_says_why(heading, how):
    outside(heading, "hero-h", {"text-align": "right"})
    heading.until(lambda site: styles(site, "hero-h").get("text-align") == "right", "right to be stored")
    try_center(heading)
    if how == "refused":
        heading.page.route(OWN_CHANGE, lambda route: route.fulfill(status=400, content_type="application/json", body=json.dumps({"detail": "Refused for this test."})))
        keep_button(heading).click()
        expect(heading.status).to_have_text("Refused for this test.")
    else:
        held = hold_changes(heading)
        keep_button(heading).click()
        heading.eventually(lambda: held, "Keep to reach the engine")
        outside(heading, "hero-p", {"color": "rgb(1, 2, 3)"})
        heading.until(lambda site: styles(site, "hero-p").get("color") == "rgb(1, 2, 3)", "the outside change")
        held[0].continue_()
        expect(heading.status).to_contain_text("revision", ignore_case=True)
    expect(heading.status).to_have_class(re.compile(r"\berror\b"))
    shows(heading, "hero-h", "right")
    expect(bar(heading)).to_be_hidden()
    expect(segment(heading, "Right")).to_have_attribute("aria-pressed", "true")
    expect(group(heading).locator("[data-trying]")).to_have_count(0)
    assert stored(heading, "hero-h") == "right"


def test_with_two_elements_selected_the_trial_and_its_keep_touch_the_last_picked_only(heading):
    heading.layer_row("hero-k").click()
    heading.layer_row("hero-p").click(modifiers=["Control"])
    expect(heading.page.locator('#fw-layers-list .layer-row[aria-selected="true"]')).to_have_count(2)
    changes = Changes(heading)
    before = heading.site()
    segment(heading, "Center").click()
    shows(heading, "hero-p", "center")
    assert look(heading, "hero-k") == "start"
    assert heading.site() == before
    keep_button(heading).click()
    after = heading.until(lambda site: styles(site, "hero-p").get("text-align") == "center", "center on hero-p")
    assert "text-align" not in styles(after, "hero-k")
    assert look(heading, "hero-k") == "start"
    assert len(changes.sent) == 1


def test_with_the_scene_scrubber_on_a_trial_still_shows_on_the_page(heading):
    frames = [{"at": 0, "styles": {"opacity": "0.25"}}, {"at": 1, "styles": {"opacity": "0.25"}}]
    heading.command("motion.set", {"kind": "scenes", "node": "hero", "value": {"stage": "hero-in", "length": 400, "tracks": [{"node": "hero-h", "keyframes": frames}]}})
    scrubber = heading.page.get_by_role("group", name="Scene scrubber")
    expect(scrubber).to_be_visible()
    assert look(heading, "hero-h", "opacity") == "1"
    scrubber.get_by_role("slider", name="Scene progress").fill("50")
    shows(heading, "hero-h", "0.25", "opacity")
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    assert look(heading, "hero-h", "opacity") == "0.25", "the scrubbed frame left the page when the trial began"
    nothing_written(heading, changes, before)


def test_preferences_has_the_switch_on_by_default_with_a_sentence_that_explains_it(heading):
    dialog = open_preferences(heading)
    box = dialog.get_by_role("checkbox", name=SWITCH)
    expect(box).to_be_visible()
    expect(box).to_be_checked()
    expect(dialog.get_by_text("A clicked choice shows on the page and is written when you press Keep.", exact=False)).to_be_visible()


def test_the_view_menu_switch_carries_a_check_mark_and_says_what_it_did(heading):
    item = open_menu(heading, "View", "view.try-choices")
    expect(item).to_have_attribute("aria-checked", "true")
    item.click()
    expect(heading.status).to_have_text("Clicked choices are now written at once.")
    item = open_menu(heading, "View", "view.try-choices")
    expect(item).to_have_attribute("aria-checked", "false")
    item.click()
    expect(heading.status).to_have_text("A clicked choice now shows on the page until you press Keep.")
    expect(open_menu(heading, "View", "view.try-choices")).to_have_attribute("aria-checked", "true")
    heading.page.keyboard.press("Escape")
    try_center(heading)


def test_the_switch_survives_a_reload_stays_out_of_the_site_and_reset_all_preferences_turns_it_back_on(heading):
    before = heading.site()
    files = export_files(heading)
    open_menu(heading, "View", "view.try-choices").click()
    expect(heading.status).to_have_text("Clicked choices are now written at once.")
    assert heading.site() == before
    assert export_files(heading) == files
    heading.page.reload()
    heading.page.get_by_role("button", name="Back to Editor").click()
    select(heading, "hero-h")
    expect(open_menu(heading, "View", "view.try-choices")).to_have_attribute("aria-checked", "false")
    heading.page.keyboard.press("Escape")
    segment(heading, "Center").click()
    heading.until(lambda site: styles(site, "hero-h").get("text-align") == "center", "center written at once")
    expect(bar(heading)).to_be_hidden()
    dialog = open_preferences(heading)
    dialog.get_by_role("tab", name="General").click()
    dialog.get_by_role("button", name="Reset All Preferences...").click()
    with heading.page.expect_navigation():
        dialog.get_by_role("button", name="Reset", exact=True).click()
    heading.page.get_by_role("button", name="Back to Editor").click()
    select(heading, "hero-h")
    expect(open_menu(heading, "View", "view.try-choices")).to_have_attribute("aria-checked", "true")
    heading.page.keyboard.press("Escape")
    segment(heading, "Right").click()
    shows(heading, "hero-h", "right")
    expect(bar(heading)).to_contain_text("Trying: Right")
    assert stored(heading, "hero-h") == "center", "the trial after Reset All Preferences wrote at once"


def rest_over(editor, pointer, part):
    part.scroll_into_view_if_needed()
    box = part.bounding_box()
    pointer.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=5)
    editor.page.evaluate(REST)


def test_moving_and_resting_the_pointer_on_choices_and_on_the_bar_changes_nothing(heading):
    changes = Changes(heading)
    before = heading.site()
    pointer = heading.canvas_pointer()
    shown = look(heading, "hero-h", "display")
    for label, names in (("Text alignment", ("Left", "Center", "Right", "Justify")), ("Display", ("Flex", "Grid", "Hidden"))):
        for name in names:
            rest_over(heading, pointer, segment(heading, name, label))
            assert look(heading, "hero-h") == "start", f"resting on {name} changed the page"
            assert look(heading, "hero-h", "display") == shown, f"resting on {name} changed the page"
    expect(bar(heading)).to_be_hidden()
    try_center(heading)
    for part in (keep_button(heading), revert_button(heading), segment(heading, "Justify"), segment(heading, "Hidden", "Display")):
        rest_over(heading, pointer, part)
        assert look(heading, "hero-h") == "center", "resting on a choice or the bar changed the trial on the page"
        assert look(heading, "hero-h", "display") == shown
    expect(bar(heading)).to_contain_text("Trying: Center")
    nothing_written(heading, changes, before)


def test_keyboard_focus_arriving_on_a_segment_group_by_tab_changes_nothing_until_an_arrow_key(heading):
    changes = Changes(heading)
    before = heading.site()
    heading.page.locator('input[data-style="letter-spacing"]').focus()
    for _ in range(8):
        heading.page.keyboard.press("Tab")
        if heading.page.evaluate("document.activeElement.closest('[role=group]')?.getAttribute('aria-label') === 'Text alignment'"):
            break
    assert heading.page.evaluate("document.activeElement.closest('[role=group]')?.getAttribute('aria-label')") == "Text alignment", "Tab never reached Text alignment"
    heading.page.evaluate(REST)
    assert look(heading, "hero-h") == "start"
    expect(bar(heading)).to_be_hidden()
    nothing_written(heading, changes, before)
    heading.page.keyboard.press("ArrowRight")
    shows(heading, "hero-h", "left")
    expect(bar(heading)).to_contain_text("Trying: Left")
    nothing_written(heading, changes, before)


def test_while_a_trial_is_on_the_engine_a_second_window_and_the_export_hold_the_stored_value(heading):
    files = export_files(heading)
    changes = Changes(heading)
    before = heading.site()
    try_center(heading)
    assert heading.site() == before
    assert export_files(heading) == files
    context = heading.page.context.browser.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = context.new_page()
        page.goto(heading.base + "/", wait_until="domcontentloaded")
        page.get_by_role("button", name="Back to Editor").click()
        other = page.frame_locator('iframe[title="Website canvas"]').locator('[data-fw-id="hero-h"]')
        other.wait_for()
        assert other.evaluate(LOOK, "text-align") == "start", "the second window shows the trial"
    finally:
        context.close()
    assert look(heading, "hero-h") == "center"
    nothing_written(heading, changes, before)


def test_no_inspector_field_moves_when_a_trial_starts_changes_and_ends(heading):
    start = heading.page.evaluate(FIELD_BOXES)
    assert len(start) > 20
    segment(heading, "Center").click()
    expect(bar(heading)).to_be_visible()
    assert heading.page.evaluate(FIELD_BOXES) == start, "a field moved when the trial started"
    heading.page.keyboard.press("ArrowRight")
    expect(bar(heading)).to_contain_text("Trying: Right")
    assert heading.page.evaluate(FIELD_BOXES) == start, "a field moved when the trial changed"
    heading.page.keyboard.press("Escape")
    expect(bar(heading)).to_be_hidden()
    assert heading.page.evaluate(FIELD_BOXES) == start, "a field moved when the trial ended"


def test_on_a_cold_load_nothing_of_the_bar_is_visible_before_the_editor_is_ready(chromium, fresh_engine):
    context = chromium.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = context.new_page()
        page.add_init_script(f"({WATCH})()")
        cdp = context.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        page.goto(fresh_engine + "/", wait_until="load")
        expect(page.locator("body")).to_have_class(re.compile(r"\bapp-ready\b"), timeout=60_000)
        page.locator('[data-demo="harbour-ferries"]').click()
        page.locator('#fw-layers-list .layer-row[data-key="hero-h"]').click()
        page.get_by_role("group", name="Text alignment", exact=True).get_by_role("button", name="Center", exact=True).click()
        page.wait_for_function("() => window.__after > 0", timeout=30_000)
        assert page.evaluate("window.__framesBefore") > 0
        assert page.evaluate("window.__before") == 0, "the bar was visible in a frame before the editor was ready"
    finally:
        context.close()
