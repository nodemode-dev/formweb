import re

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
NODE = "h-logo-word"
LIST_FIELDS = (("align-self", "Align self"), ("justify-self", "Justify self"), ("object-fit", "Object fit"), ("font-weight", "Weight"), ("font-variant-caps", "Capitals"), ("font-kerning", "Kerning"), ("position", "Position"), ("overflow", "Overflow"))
FRAMES = "n => new Promise(done => { const step = left => left ? requestAnimationFrame(() => step(left - 1)) : done(); step(n); })"
BOXES = """() => [...document.querySelectorAll('.inspector [data-style]')].map(node => {
  const scroller = node.closest('.inspector-scroll');
  const origin = scroller.getBoundingClientRect();
  const box = node.closest('.field').getBoundingClientRect();
  return [node.dataset.style, box.x - origin.x, box.y - origin.y + scroller.scrollTop, box.width, box.height];
})"""
WATCH_BODY = """() => {
  window.__bodyFocused = 0;
  const tick = () => { if (document.activeElement === document.body || !document.activeElement) window.__bodyFocused++; requestAnimationFrame(tick); };
  document.addEventListener('focusin', () => { if (document.activeElement === document.body) window.__bodyFocused++; }, true);
  requestAnimationFrame(tick);
}"""
FOCUSED = "() => { const a = document.activeElement; return a === document.body ? 'body' : (a.dataset.style || a.getAttribute('role') || a.textContent.trim().slice(0, 20)); }"


class Sent:
    def __init__(self, editor):
        self.requests = []
        editor.page.on("request", lambda r: self.requests.append(r.post_data) if r.method == "POST" and OWN_CHANGE.search(r.url) else None)

    def __len__(self):
        return len(self.requests)


def choice(editor, key):
    return editor.page.locator(f'select[data-style="{key}"]')


def listbox(editor):
    return editor.page.get_by_role("listbox")


def option(editor, name):
    return listbox(editor).get_by_role("option", name=name, exact=True)


def bar(editor):
    return editor.page.locator("[data-try-bar]")


def bar_button(editor, name):
    return bar(editor).get_by_role("button", name=re.compile(rf"^{name}"))


def computed(editor, prop):
    return editor.canvas.locator(f'[data-fw-id="{NODE}"]').evaluate(f"e => getComputedStyle(e).getPropertyValue('{prop}')")


def shows(editor, prop, value):
    expect(editor.canvas.locator(f'[data-fw-id="{NODE}"]'), f"{prop} of {NODE} on the page").to_have_css(prop, value)


def stored(editor, key, site=None):
    return (site or editor.site()["site"])["nodes"][NODE]["styles"].get(key)


def browser_popup_open(select):
    return select.evaluate("s => s.matches(':open')")


def focused(editor):
    return editor.page.evaluate(FOCUSED)


def frames(editor, count):
    editor.page.evaluate(FRAMES, count)


def run(editor, command):
    editor.page.evaluate(f"window.formweb.run('{command}')")


def open_list(editor, key):
    field = choice(editor, key)
    field.scroll_into_view_if_needed()
    field.click()
    expect(listbox(editor)).to_be_visible()
    return field


def inside_window(editor, box):
    size = editor.page.viewport_size
    return box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= size["width"] and box["y"] + box["height"] <= size["height"]


@pytest.fixture
def logo(harbour):
    harbour.layer_row(NODE).click()
    expect(harbour.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {NODE}$"))
    assert stored(harbour, "font-weight") == "700" and stored(harbour, "align-self") is None
    return harbour


def test_a_click_on_a_choice_field_opens_the_editors_own_list_of_the_same_choices_with_the_stored_one_marked(logo):
    field = choice(logo, "font-weight")
    names = field.locator("option").all_inner_texts()
    field.scroll_into_view_if_needed()
    field.click()
    expect(listbox(logo)).to_be_visible()
    assert not browser_popup_open(field), "the browser's own popup opened as well"
    expect(field).to_have_attribute("aria-expanded", "true")
    expect(listbox(logo)).to_have_accessible_name("Weight")
    expect(listbox(logo).get_by_role("option")).to_have_text(names)
    expect(listbox(logo).locator('[role="option"][aria-selected="true"]')).to_have_text(["700"])
    expect(option(logo, "700").locator("svg")).to_be_visible()
    expect(option(logo, "400").locator("svg")).to_be_hidden()
    assert inside_window(logo, listbox(logo).bounding_box()), listbox(logo).bounding_box()
    expect(bar(logo)).to_be_hidden()


def test_a_click_on_a_list_item_tries_it_on_the_page_keeps_the_list_open_and_writes_nothing(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "font-weight")
    shows(logo, "font-weight", "700")
    option(logo, "400").click()
    shows(logo, "font-weight", "400")
    expect(listbox(logo)).to_be_visible()
    expect(bar(logo)).to_be_visible()
    expect(bar(logo)).to_contain_text("Trying: 400")
    expect(option(logo, "400")).to_have_attribute("aria-selected", "true")
    expect(field).to_have_value("700")
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_arrow_keys_home_and_end_move_through_the_list_and_try_each_item_without_writing(logo):
    sent = Sent(logo)
    before = logo.site()
    open_list(logo, "align-self")
    shows(logo, "align-self", "auto")
    steps = (("ArrowDown", "auto", "auto"), ("ArrowDown", "stretch", "stretch"), ("ArrowDown", "center", "center"), ("ArrowUp", "stretch", "stretch"),
             ("End", "end", "end"), ("Home", "Inherit", "auto"), ("End", "end", "end"))
    for key, row, value in steps:
        logo.page.keyboard.press(key)
        shows(logo, "align-self", value)
        expect(listbox(logo).locator('[role="option"][aria-selected="true"]'), f"after {key}").to_have_text([row])
    expect(listbox(logo)).to_be_visible()
    expect(choice(logo, "align-self")).to_have_value("")
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_a_typed_letter_in_the_list_goes_to_the_next_item_starting_with_it_and_tries_it(logo):
    sent = Sent(logo)
    before = logo.site()
    open_list(logo, "align-self")
    for letter, value in (("s", "stretch"), ("s", "start"), ("S", "stretch"), ("c", "center"), ("e", "end")):
        logo.page.keyboard.press(letter)
        shows(logo, "align-self", value)
        expect(option(logo, value)).to_have_attribute("aria-selected", "true")
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_a_typed_letter_on_the_closed_field_opens_the_list_and_tries_the_matching_item_without_changing_the_field(logo):
    sent = Sent(logo)
    before = logo.site()
    field = choice(logo, "align-self")
    field.scroll_into_view_if_needed()
    field.focus()
    logo.page.keyboard.press("c")
    expect(listbox(logo)).to_be_visible()
    shows(logo, "align-self", "center")
    expect(option(logo, "center")).to_have_attribute("aria-selected", "true")
    expect(field).to_have_value("")
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_keys_on_the_closed_field_open_the_list_and_never_change_the_stored_value_by_themselves(logo):
    sent = Sent(logo)
    before = logo.site()
    field = choice(logo, "align-self")
    field.scroll_into_view_if_needed()
    for key in ("ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "End"):
        field.focus()
        logo.page.keyboard.press(key)
        expect(listbox(logo), f"{key} on the closed field did not open the list").to_be_visible()
        expect(field, f"{key} on the closed field changed its value").to_have_value("")
        logo.page.keyboard.press("Escape")
        expect(listbox(logo)).to_be_hidden()
        shows(logo, "align-self", "auto")
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_space_enter_arrow_down_and_alt_arrow_down_on_the_focused_field_open_the_list_and_try_nothing(logo):
    sent = Sent(logo)
    before = logo.site()
    field = choice(logo, "font-weight")
    field.scroll_into_view_if_needed()
    for key in ("Space", "Enter", "ArrowDown", "ArrowUp", "Alt+ArrowDown"):
        field.focus()
        logo.page.keyboard.press(key)
        expect(listbox(logo), f"{key} did not open the list").to_be_visible()
        assert not browser_popup_open(field), f"{key} opened the browser's own popup"
        frames(logo, 3)
        assert computed(logo, "font-weight") == "700", f"{key} tried something"
        expect(bar(logo)).to_be_hidden()
        expect(listbox(logo).locator('[role="option"][aria-selected="true"]')).to_have_text(["700"])
        expect(field).to_have_value("700")
        logo.page.keyboard.press("Escape")
        expect(listbox(logo)).to_be_hidden()
        assert focused(logo) == "font-weight", f"after Escape focus is on {focused(logo)!r}, not the field"
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_enter_keeps_the_tried_item_in_one_undo_step_closes_the_list_and_the_field_shows_it(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "font-weight")
    option(logo, "400").click()
    shows(logo, "font-weight", "400")
    logo.page.keyboard.press("Enter")
    after = logo.until(lambda site: stored(logo, "font-weight", site) == "400", "the kept weight")
    assert logo.site()["revision"] == before["revision"] + 1
    assert len(sent) == 1, sent.requests
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    expect(field).to_have_value("400")
    shows(logo, "font-weight", "400")
    assert focused(logo) == "font-weight"
    assert after["nodes"][NODE]["styles"] == {**before["site"]["nodes"][NODE]["styles"], "font-weight": "400"}
    run(logo, "edit.undo")
    logo.restored_to(before["site"])
    expect(field).to_have_value("700")
    shows(logo, "font-weight", "700")


def test_the_keep_button_keeps_the_tried_item_and_puts_focus_back_on_the_field(logo):
    before = logo.site()
    field = open_list(logo, "align-self")
    option(logo, "end").click()
    shows(logo, "align-self", "end")
    bar_button(logo, "Keep").click()
    logo.until(lambda site: stored(logo, "align-self", site) == "end", "the kept alignment")
    assert logo.site()["revision"] == before["revision"] + 1
    expect(listbox(logo)).to_be_hidden()
    expect(field).to_have_value("end")
    assert focused(logo) == "align-self"
    run(logo, "edit.undo")
    logo.restored_to(before["site"])


def test_undo_and_redo_pressed_on_the_focused_field_after_keep_act_and_the_field_shows_the_stored_value_while_focused(logo):
    before = logo.site()
    field = open_list(logo, "font-weight")
    option(logo, "400").click()
    logo.page.keyboard.press("Enter")
    kept = logo.until(lambda site: stored(logo, "font-weight", site) == "400", "the kept weight")
    expect(field).to_have_value("400")
    assert focused(logo) == "font-weight"
    logo.page.keyboard.press("Control+z")
    logo.restored_to(before["site"])
    expect(field).to_have_value("700")
    shows(logo, "font-weight", "700")
    assert focused(logo) == "font-weight", "focus left the field before the undone value showed"
    logo.page.keyboard.press("Control+Shift+z")
    logo.until(lambda site: site == kept, "the redo")
    expect(field).to_have_value("400")
    shows(logo, "font-weight", "400")
    assert focused(logo) == "font-weight"


def test_cut_pressed_on_a_focused_list_field_does_not_remove_the_element(logo):
    logo.page.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=logo.base)
    before = logo.site()
    logo.layer_row(NODE).click()
    logo.page.keyboard.press("Control+x")
    logo.until(lambda site: NODE not in site["nodes"], "Cut from the Layers list to remove the element")
    run(logo, "edit.undo")
    logo.restored_to(before["site"])
    logo.layer_row(NODE).click()
    expect(logo.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {NODE}$"))
    field = choice(logo, "font-weight")
    field.scroll_into_view_if_needed()
    field.focus()
    revision = logo.site()["revision"]
    logo.page.keyboard.press("Control+x")
    open_list(logo, "font-weight")
    logo.page.keyboard.press("Escape")
    frames(logo, 10)
    assert NODE in logo.site()["site"]["nodes"], "Cut on the focused field removed the element"
    assert logo.site()["revision"] == revision, "Cut on the focused field changed the site"
    expect(logo.canvas.locator(f'[data-fw-id="{NODE}"]')).to_be_attached()


def test_escape_closes_the_list_reverts_the_page_and_says_the_field_is_unchanged(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "font-weight")
    option(logo, "900").click()
    shows(logo, "font-weight", "900")
    logo.page.keyboard.press("Escape")
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    shows(logo, "font-weight", "700")
    expect(field).to_have_value("700")
    expect(logo.status).to_have_text("Not kept: Weight is unchanged.")
    assert focused(logo) == "font-weight"
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_the_revert_button_closes_the_list_reverts_the_page_and_puts_focus_back_on_the_field(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "align-self")
    option(logo, "center").click()
    shows(logo, "align-self", "center")
    bar_button(logo, "Revert").click()
    expect(listbox(logo)).to_be_hidden()
    shows(logo, "align-self", "auto")
    expect(field).to_have_value("")
    assert focused(logo) == "align-self"
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_a_click_outside_the_list_closes_it_and_reverts_the_page_without_dropping_focus_to_the_page(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "align-self")
    option(logo, "center").click()
    shows(logo, "align-self", "center")
    logo.page.locator(".inspector-tabs").click(position={"x": 2, "y": 2})
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    shows(logo, "align-self", "auto")
    expect(field).to_have_value("")
    frames(logo, 5)
    assert focused(logo) == "align-self", f"focus is on {focused(logo)!r}, not the field"
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_a_click_into_another_fields_text_box_reverts_the_trial_and_leaves_focus_there(logo):
    before = logo.site()
    open_list(logo, "align-self")
    option(logo, "center").click()
    shows(logo, "align-self", "center")
    logo.page.locator('input[data-style="width"]').click()
    expect(listbox(logo)).to_be_hidden()
    shows(logo, "align-self", "auto")
    frames(logo, 5)
    assert focused(logo) == "width"
    assert logo.site() == before


def test_tab_from_revert_goes_on_to_the_next_field_reverts_the_trial_and_never_leaves_focus_on_the_page(logo):
    sent = Sent(logo)
    before = logo.site()
    open_list(logo, "align-self")
    logo.page.evaluate(WATCH_BODY)
    logo.page.keyboard.press("ArrowDown")
    logo.page.keyboard.press("ArrowDown")
    shows(logo, "align-self", "stretch")
    logo.page.keyboard.press("Tab")
    expect(bar_button(logo, "Keep")).to_be_focused()
    logo.page.keyboard.press("Tab")
    expect(bar_button(logo, "Revert")).to_be_focused()
    shows(logo, "align-self", "stretch")
    logo.page.keyboard.press("Tab")
    expect(choice(logo, "justify-self"), "Tab from Revert did not go on to the next field").to_be_focused()
    shows(logo, "align-self", "auto")
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    frames(logo, 5)
    assert logo.page.evaluate("window.__bodyFocused") == 0, "focus was on the page body on the way"
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_turning_trying_off_while_a_list_trial_is_on_closes_the_list_puts_the_page_back_and_keeps_focus_on_the_field(logo):
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "font-weight")
    option(logo, "900").click()
    shows(logo, "font-weight", "900")
    run(logo, "view.try-choices")
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    shows(logo, "font-weight", "700")
    expect(field).to_have_value("700")
    frames(logo, 5)
    assert focused(logo) == "font-weight"
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_a_click_on_another_element_on_the_canvas_closes_the_list_and_drops_the_trial(logo):
    sent = Sent(logo)
    before = logo.site()
    open_list(logo, "font-weight")
    option(logo, "400").click()
    shows(logo, "font-weight", "400")
    logo.canvas.locator('[data-fw-id="h-tools"]').click()
    expect(logo.page.locator(".inspector-tag")).not_to_have_text(re.compile(rf"· {NODE}$"))
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()
    shows(logo, "font-weight", "700")
    frames(logo, 5)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_delete_and_backspace_in_the_list_and_on_keep_and_revert_remove_nothing(logo):
    before = logo.site()
    logo.layer_row(NODE).click()
    logo.page.keyboard.press("Delete")
    logo.until(lambda site: NODE not in site["nodes"], "Delete from the Layers list to remove the element")
    run(logo, "edit.undo")
    logo.restored_to(before["site"])
    logo.layer_row(NODE).click()
    expect(logo.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {NODE}$"))
    before = logo.site()
    sent = Sent(logo)
    open_list(logo, "align-self")
    option(logo, "center").click()
    for target in (listbox(logo), bar_button(logo, "Keep"), bar_button(logo, "Revert")):
        target.focus()
        for key in ("Delete", "Backspace"):
            logo.page.keyboard.press(key)
            shows(logo, "align-self", "center")
    frames(logo, 10)
    assert len(sent) == 0, sent.requests
    assert logo.site() == before
    expect(logo.canvas.locator(f'[data-fw-id="{NODE}"]')).to_be_attached()


def test_while_keep_is_pending_rows_and_keys_do_nothing_and_exactly_the_kept_item_is_written(logo):
    page = logo.page
    held = []
    page.route(OWN_CHANGE, lambda route: held.append(route))
    sent = Sent(logo)
    before = logo.site()
    field = open_list(logo, "font-weight")
    option(logo, "400").click()
    shows(logo, "font-weight", "400")
    page.keyboard.press("Enter")
    logo.eventually(lambda: held, "Keep to send its command")
    expect(listbox(logo)).to_have_attribute("aria-busy", "true")
    option(logo, "900").click()
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Home")
    page.keyboard.press("Escape")
    page.keyboard.press("Enter")
    frames(logo, 10)
    shows(logo, "font-weight", "400")
    assert len(sent) == 1, f"while Keep was pending the window sent {sent.requests}"
    assert logo.site() == before
    held.pop(0).continue_()
    page.unroute(OWN_CHANGE)
    logo.until(lambda site: stored(logo, "font-weight", site) == "400", "the kept weight")
    expect(listbox(logo)).to_be_hidden()
    expect(field).to_have_value("400")
    shows(logo, "font-weight", "400")
    frames(logo, 10)
    assert len(sent) == 1, sent.requests
    assert logo.site()["revision"] == before["revision"] + 1


def test_pointing_at_list_rows_and_at_keep_and_revert_changes_nothing_on_the_page(logo):
    sent = Sent(logo)
    before = logo.site()
    open_list(logo, "align-self")
    pointer = logo.canvas_pointer()
    for name in ("stretch", "center", "start", "end"):
        box = option(logo, name).bounding_box()
        pointer.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=5)
        frames(logo, 60)
        assert computed(logo, "align-self") == "auto", f"pointing at {name} changed the page"
        expect(bar(logo)).to_be_hidden()
        expect(listbox(logo).locator('[role="option"][aria-selected="true"]')).to_have_text(["Inherit"])
    option(logo, "center").click()
    shows(logo, "align-self", "center")
    for name in ("Keep", "Revert"):
        box = bar_button(logo, name).bounding_box()
        pointer.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=5)
        frames(logo, 60)
        assert computed(logo, "align-self") == "center", f"pointing at {name} changed the page"
        expect(listbox(logo)).to_be_visible()
    assert len(sent) == 0, sent.requests
    assert logo.site() == before


def test_no_inspector_field_moves_or_changes_size_when_a_list_trial_starts_changes_or_ends(logo):
    expect(listbox(logo)).to_be_hidden()
    choice(logo, "align-self").scroll_into_view_if_needed()
    start = logo.page.evaluate(BOXES)
    open_list(logo, "align-self")
    assert logo.page.evaluate(BOXES) == start, "a field moved when the list opened"
    option(logo, "center").click()
    shows(logo, "align-self", "center")
    assert logo.page.evaluate(BOXES) == start, "a field moved when the trial started"
    logo.page.keyboard.press("End")
    shows(logo, "align-self", "end")
    assert logo.page.evaluate(BOXES) == start, "a field moved when the trial changed"
    logo.page.keyboard.press("Escape")
    shows(logo, "align-self", "auto")
    expect(listbox(logo)).to_be_hidden()
    assert logo.page.evaluate(BOXES) == start, "a field moved when the trial ended"


def test_a_program_that_sets_the_field_and_fires_change_still_writes_at_once(logo):
    before = logo.site()
    field = choice(logo, "align-self")
    field.evaluate("s => { s.value = 'center'; s.dispatchEvent(new Event('change', { bubbles: true })); }")
    logo.until(lambda site: stored(logo, "align-self", site) == "center", "the program's value to be stored")
    assert logo.site()["revision"] == before["revision"] + 1
    shows(logo, "align-self", "center")
    expect(listbox(logo)).to_be_hidden()
    expect(field).to_have_value("center")


def test_with_trying_switched_off_the_field_is_the_browsers_own_select_and_a_pick_writes_at_once(logo):
    field = choice(logo, "align-self")
    field.scroll_into_view_if_needed()
    field.click()
    expect(listbox(logo)).to_be_visible()
    logo.page.keyboard.press("Escape")
    expect(listbox(logo)).to_be_hidden()
    run(logo, "view.try-choices")
    assert logo.page.evaluate("localStorage.getItem('formweb.try-choices')") == "0"
    before = logo.site()
    field.click()
    logo.eventually(lambda: browser_popup_open(field), "the browser's own popup to open")
    expect(listbox(logo)).to_be_hidden()
    logo.page.keyboard.press("Escape")
    field.select_option("stretch")
    logo.until(lambda site: stored(logo, "align-self", site) == "stretch", "the pick to be stored")
    assert logo.site()["revision"] == before["revision"] + 1
    shows(logo, "align-self", "stretch")
    expect(listbox(logo)).to_be_hidden()
    expect(bar(logo)).to_be_hidden()


@pytest.mark.parametrize("width", [900, 1440])
def test_every_list_is_placed_fully_on_screen_next_to_its_field_at_the_bottom_and_the_top_of_the_scrolled_inspector(logo, width):
    logo.page.set_viewport_size({"width": width, "height": 900})
    scroller = logo.page.locator(".inspector-scroll")
    scroller.evaluate("s => { s.scrollTop = s.scrollHeight; }")
    frames(logo, 2)
    assert scroller.evaluate("s => s.scrollTop > 0 && s.scrollTop + s.clientHeight >= s.scrollHeight - 1"), "the inspector did not scroll to its end"
    edges = scroller.bounding_box()
    for key, name in LIST_FIELDS:
        for edge in ("end", "start"):
            field = choice(logo, key)
            field.evaluate(f"s => s.scrollIntoView({{ block: '{edge}' }})")
            own = field.bounding_box()
            near = own["y"] + own["height"] >= edges["y"] + edges["height"] - 2 if edge == "end" else own["y"] <= edges["y"] + 2
            assert near, f"{name} {own} is not at the {edge} of the inspector {edges}"
            field.click()
            expect(listbox(logo)).to_be_visible()
            expect(listbox(logo)).to_have_accessible_name(name)
            frames(logo, 2)
            pop = listbox(logo).bounding_box()
            own = field.bounding_box()
            where = f"{name} at the {edge} of the inspector, {width} px wide"
            assert inside_window(logo, pop), f"{where}: the list {pop} is not inside the window"
            overlap = pop["y"] < own["y"] + own["height"] and own["y"] < pop["y"] + pop["height"] and pop["x"] < own["x"] + own["width"] and own["x"] < pop["x"] + pop["width"]
            assert not overlap, f"{where}: the list {pop} covers the field {own}"
            gap = pop["y"] - (own["y"] + own["height"]) if pop["y"] >= own["y"] else own["y"] - (pop["y"] + pop["height"])
            assert 0 <= gap <= own["height"], f"{where}: the list {pop} is not next to the field {own}"
            assert pop["x"] < own["x"] + own["width"] and own["x"] < pop["x"] + pop["width"], f"{where}: the list {pop} is not under or over the field {own}"
            assert not browser_popup_open(field), f"{where}: the browser's own popup opened"
            logo.page.keyboard.press("Escape")
            expect(listbox(logo)).to_be_hidden()
