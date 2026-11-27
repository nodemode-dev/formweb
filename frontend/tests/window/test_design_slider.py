import io
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
TWO_FRAMES = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))"
ELEMENT = "hero-p"
FIELDS = (
    ("Opacity", "opacity", "0.5"),
    ("Width", "width", "240px"),
    ("Height", "height", "120px"),
    ("Max width", "max-width", "40rem"),
    ("Gap", "gap", "12px"),
    ("Padding", "padding", "16px"),
    ("Margin", "margin", "-8px"),
    ("Radius", "border-radius", "6px"),
    ("Font size", "font-size", "1.25rem"),
    ("Line height", "line-height", "1.4"),
    ("Letter spacing", "letter-spacing", "0.5px"),
    ("Top", "top", "10px"),
    ("Left", "left", "5%"),
)
RECORD = """() => {
  const input = document.querySelector('[data-style="opacity"]');
  window.__seen = [input.value];
  const tick = () => { const value = input.value; if (value !== window.__seen[window.__seen.length - 1]) window.__seen.push(value); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}"""


def slider(editor, label):
    return editor.page.get_by_role("slider", name=label, exact=True)


def field(editor, key):
    return editor.page.locator(f'[data-style="{key}"]')


def stored(editor, key, site=None):
    return (site or editor.site()["site"])["nodes"][ELEMENT]["styles"].get(key)


def computed(editor, prop):
    return editor.canvas.locator(f'[data-fw-id="{ELEMENT}"]').evaluate(f"e => getComputedStyle(e).{prop}")


def sent_commands(page):
    sent = []
    page.on("request", lambda request: sent.append(request.post_data) if request.method == "POST" and OWN_CHANGE.search(request.url) else None)
    return sent


def type_value(editor, key, value):
    field(editor, key).fill(value)
    field(editor, key).press("Enter")
    return editor.until(lambda site: stored(editor, key, site) == value, f"{key} to be stored as {value!r}")


def select(editor, key, name):
    editor.canvas.locator(f'[data-fw-id="{key}"]').click()
    expect(editor.page.locator(".inspector-name")).to_have_text(name)


def track(editor, label):
    handle = slider(editor, label)
    handle.scroll_into_view_if_needed()
    box = handle.bounding_box()
    knob = handle.locator(".fw-slider-thumb").bounding_box()["width"]
    return box["x"] + knob / 2, box["y"] + box["height"] / 2, box["width"] - knob


def exported_css(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return "\n".join(archive.read(name).decode("utf-8", "replace") for name in archive.namelist() if name.endswith(".css"))


@pytest.fixture
def lead(harbour):
    harbour.command("node.update", {"id": ELEMENT, "patch": {"styles": {key: None for _, key, _ in FIELDS}}})
    harbour.until(lambda site: not any(stored(harbour, key, site) for _, key, _ in FIELDS), "the slider fields of the lead paragraph to be unset")
    select(harbour, ELEMENT, "Hero p")
    return harbour


def test_each_of_the_thirteen_fields_shows_a_slider_when_empty_and_when_holding_one_number_with_a_known_unit(lead):
    for label, key, _ in FIELDS:
        expect(field(lead, key)).to_have_value("")
        expect(slider(lead, label)).to_be_visible()
    lead.command("node.update", {"id": ELEMENT, "patch": {"styles": {key: value for _, key, value in FIELDS}}})
    for label, key, value in FIELDS:
        expect(field(lead, key)).to_have_value(value)
        expect(slider(lead, label)).to_be_visible()


def test_a_pointer_drag_shows_the_pending_value_stores_once_on_release_changes_the_canvas_and_one_undo_restores(lead):
    page = lead.page
    sent = sent_commands(page)
    before = lead.site()
    start = computed(lead, "paddingLeft")
    x, y, width = track(lead, "Padding")
    pointer = lead.canvas_pointer()
    pointer.move(x + 4, y)
    pointer.down()
    pointer.move(x + width * 0.3, y, steps=6, held=True)
    early = field(lead, "padding").input_value()
    pointer.move(x + width * 0.6, y, steps=6, held=True)
    shown = field(lead, "padding").input_value()
    assert re.fullmatch(r"\d+px", early) and re.fullmatch(r"\d+px", shown) and early != shown, (early, shown)
    assert sent == []
    assert lead.site()["revision"] == before["revision"]
    assert stored(lead, "padding") is None
    pointer.up()
    lead.until(lambda site: stored(lead, "padding", site) == shown, f"padding {shown} to be stored")
    assert len(sent) == 1
    lead.eventually(lambda: computed(lead, "paddingLeft") == shown, f"the canvas paragraph to get padding {shown}")
    expect(slider(lead, "Padding")).to_be_focused()
    lead.undo()
    lead.restored_to(before["site"])
    expect(field(lead, "padding")).to_have_value("")
    lead.eventually(lambda: computed(lead, "paddingLeft") == start, f"the canvas paragraph padding to return to {start}")


def test_escape_during_a_drag_puts_the_value_back_and_stores_nothing(lead):
    page = lead.page
    type_value(lead, "padding", "20px")
    sent = sent_commands(page)
    before = lead.site()
    x, y, width = track(lead, "Padding")
    pointer = lead.canvas_pointer()
    pointer.move(x + width * 0.5, y)
    pointer.down()
    pointer.move(x + width * 0.8, y, steps=6, held=True)
    assert field(lead, "padding").input_value() != "20px"
    page.keyboard.press("Escape")
    expect(field(lead, "padding")).to_have_value("20px")
    pointer.up()
    type_value(lead, "gap", "6px")
    assert len(sent) == 1, sent
    site = lead.site()
    assert stored(lead, "padding", site["site"]) == "20px"
    assert site["revision"] == before["revision"] + 1
    expect(field(lead, "padding")).to_have_value("20px")


def test_the_opacity_slider_can_write_one_half(lead):
    x, y, width = track(lead, "Opacity")
    pointer = lead.canvas_pointer()
    pointer.move(x + width / 2, y)
    pointer.down()
    pointer.up()
    lead.until(lambda site: stored(lead, "opacity", site) == "0.5", "opacity 0.5 to be stored")
    expect(field(lead, "opacity")).to_have_value("0.5")
    lead.eventually(lambda: computed(lead, "opacity") == "0.5", "the canvas paragraph to be half transparent")


def test_arrow_keys_on_the_slider_step_the_value_and_a_held_key_is_one_undo_step(lead):
    page = lead.page
    type_value(lead, "opacity", "0.5")
    sent = sent_commands(page)
    slider(lead, "Opacity").focus()
    page.keyboard.press("ArrowLeft")
    lead.until(lambda site: stored(lead, "opacity", site) == "0.49", "one step down to 0.49")
    for _ in range(5):
        page.keyboard.down("ArrowLeft")
    page.keyboard.up("ArrowLeft")
    lead.until(lambda site: stored(lead, "opacity", site) == "0.44", "five held steps down to 0.44")
    assert len(sent) == 2, sent
    expect(field(lead, "opacity")).to_have_value("0.44")
    lead.undo()
    lead.until(lambda site: stored(lead, "opacity", site) == "0.49", "one undo back to 0.49")
    lead.undo()
    lead.until(lambda site: stored(lead, "opacity", site) == "0.5", "a second undo back to 0.5")
    expect(field(lead, "opacity")).to_have_value("0.5")


def test_delete_and_backspace_on_a_focused_slider_keep_the_selected_element(lead):
    page = lead.page
    sent = sent_commands(page)
    slider(lead, "Width").focus()
    page.keyboard.press("Delete")
    page.keyboard.press("Backspace")
    type_value(lead, "gap", "6px")
    assert len(sent) == 1, sent
    assert ELEMENT in lead.site()["site"]["nodes"]
    expect(lead.canvas.locator(f'[data-fw-id="{ELEMENT}"]')).to_be_visible()
    expect(page.locator(".inspector-name")).to_have_text("Hero p")


def test_arrow_up_and_down_in_the_input_step_one_number_and_keep_its_unit(lead):
    type_value(lead, "width", "12%")
    expect(slider(lead, "Width")).to_be_visible()
    field(lead, "width").press("ArrowUp")
    lead.until(lambda site: stored(lead, "width", site) == "13%", "width 13%")
    field(lead, "width").press("Shift+ArrowDown")
    lead.until(lambda site: stored(lead, "width", site) == "3%", "width 3%")
    type_value(lead, "letter-spacing", "0.1px")
    field(lead, "letter-spacing").press("ArrowUp")
    lead.until(lambda site: stored(lead, "letter-spacing", site) == "0.2px", "letter spacing 0.2px")
    field(lead, "letter-spacing").press("ArrowUp")
    lead.until(lambda site: stored(lead, "letter-spacing", site) == "0.3px", "letter spacing 0.3px, written without rounding noise")
    expect(field(lead, "letter-spacing")).to_have_value("0.3px")


def test_the_unit_chooser_changes_the_unit_and_keeps_the_number(lead):
    type_value(lead, "width", "12px")
    chooser = lead.page.get_by_role("combobox", name="Unit for Width")
    chooser.select_option("rem")
    lead.until(lambda site: stored(lead, "width", site) == "12rem", "width 12rem")
    expect(field(lead, "width")).to_have_value("12rem")
    chooser.select_option("%")
    lead.until(lambda site: stored(lead, "width", site) == "12%", "width 12%")
    expect(field(lead, "width")).to_have_value("12%")
    type_value(lead, "line-height", "1.5")
    lead.page.get_by_role("combobox", name="Unit for Line height").select_option("px")
    lead.until(lambda site: stored(lead, "line-height", site) == "1.5px", "line height 1.5px")


def thumb_at(editor, label):
    handle = slider(editor, label)
    box = handle.bounding_box()
    knob = handle.locator(".fw-slider-thumb").bounding_box()
    return (knob["x"] - box["x"]) / (box["width"] - knob["width"])


def test_a_value_beyond_the_range_is_left_as_typed_and_puts_the_thumb_at_the_end(lead):
    type_value(lead, "max-width", "3000px")
    type_value(lead, "top", "-500px")
    high, low = slider(lead, "Max width"), slider(lead, "Top")
    expect(high).to_be_visible()
    expect(low).to_be_visible()
    expect(high).to_have_attribute("aria-valuenow", high.get_attribute("aria-valuemax"))
    expect(low).to_have_attribute("aria-valuenow", low.get_attribute("aria-valuemin"))
    assert thumb_at(lead, "Max width") == pytest.approx(1, abs=0.01)
    assert thumb_at(lead, "Top") == pytest.approx(0, abs=0.01)
    revision = lead.site()["revision"]
    select(lead, "h-nav-fares", "H nav fares")
    select(lead, ELEMENT, "Hero p")
    expect(field(lead, "max-width")).to_have_value("3000px")
    expect(field(lead, "top")).to_have_value("-500px")
    site = lead.site()
    assert site["revision"] == revision
    assert (stored(lead, "max-width", site["site"]), stored(lead, "top", site["site"])) == ("3000px", "-500px")


@pytest.mark.parametrize("label, key, value", [
    ("Padding", "padding", "8px 16px"),
    ("Margin", "margin", "0 auto"),
    ("Width", "width", "calc(100% - 2rem)"),
    ("Gap", "gap", "var(--gap)"),
    ("Height", "height", "auto"),
    ("Line height", "line-height", "normal"),
    ("Top", "top", "10Q"),
    ("Opacity", "opacity", "0.5 !important"),
])
def test_a_value_the_slider_cannot_show_hides_it_and_is_never_rewritten(lead, label, key, value):
    expect(slider(lead, label)).to_be_visible()
    type_value(lead, key, value)
    expect(slider(lead, label)).to_be_hidden()
    expect(field(lead, key)).to_have_value(value)
    revision = lead.site()["revision"]
    field(lead, key).press("ArrowUp")
    select(lead, "h-nav-fares", "H nav fares")
    select(lead, ELEMENT, "Hero p")
    expect(field(lead, key)).to_have_value(value)
    expect(slider(lead, label)).to_be_hidden()
    site = lead.site()
    assert site["revision"] == revision
    assert stored(lead, key, site["site"]) == value


def test_the_range_and_step_of_a_slider_are_the_same_for_a_small_and_a_very_large_value(lead):
    page = lead.page
    width = slider(lead, "Width")
    seen = []
    for value, key, stepped in (("5px", "ArrowRight", "6px"), ("50000px", "ArrowLeft", "49999px")):
        type_value(lead, "width", value)
        expect(width).to_have_attribute("aria-valuetext", value)
        width.focus()
        page.keyboard.down(key)
        expect(field(lead, "width")).to_have_value(stepped)
        page.keyboard.press("Escape")
        page.keyboard.up(key)
        expect(field(lead, "width")).to_have_value(value)
        seen.append((width.get_attribute("aria-valuemin"), width.get_attribute("aria-valuemax")))
    assert seen[0] == seen[1], seen
    assert stored(lead, "width") == "50000px"


def band(value, bands):
    if value in ("", "1"):
        return 0
    n = float(value)
    for index, (low, high) in enumerate(bands, start=1):
        if low - 0.02 <= n <= high + 0.02:
            return index
    raise AssertionError(f"opacity {value} is from no drag")


def test_five_quick_drags_never_show_an_earlier_value_after_a_later_one_and_end_with_input_equal_to_state(lead):
    page = lead.page
    bands = ((0.10, 0.18), (0.80, 0.88), (0.30, 0.38), (0.60, 0.68), (0.45, 0.52))
    held = []
    page.route(OWN_CHANGE, lambda route: held.append(route))
    page.evaluate(RECORD)
    x, y, width = track(lead, "Opacity")
    pointer = lead.canvas_pointer()
    released = []
    for low, high in bands:
        pointer.move(x + width * low, y)
        pointer.down()
        pointer.move(x + width * high, y, steps=4, held=True)
        page.evaluate(TWO_FRAMES)
        released.append(field(lead, "opacity").input_value())
        pointer.up()
        page.evaluate(TWO_FRAMES)
    let_through = 0
    while let_through < len(bands):
        lead.eventually(lambda: held, f"command {let_through + 1} of {len(bands)} to be sent")
        held.pop(0).continue_()
        let_through += 1
    page.unroute(OWN_CHANGE)
    last = released[-1]
    lead.until(lambda site: stored(lead, "opacity", site) == last, f"opacity {last} to be stored")
    expect(field(lead, "opacity")).to_have_value(last)
    page.evaluate(TWO_FRAMES)
    seen = page.evaluate("window.__seen")
    order = [band(value, bands) for value in seen]
    assert order == sorted(order), f"the input stepped back to an earlier drag: {seen}"
    assert [band(value, bands) for value in released] == [1, 2, 3, 4, 5], released
    assert held == []


def test_a_drag_cut_off_by_a_selection_change_writes_nothing_on_either_element(lead):
    page = lead.page
    sent = sent_commands(page)
    before = lead.site()
    x, y, width = track(lead, "Opacity")
    pointer = lead.canvas_pointer()
    pointer.move(x + width * 0.5, y)
    pointer.down()
    pointer.move(x + width * 0.2, y, steps=4, held=True)
    assert field(lead, "opacity").input_value() not in ("", "1")
    page.evaluate("() => window.formweb.run('edit.select-parent')")
    expect(page.locator(".inspector-name")).to_have_text("Hero copy")
    pointer.up()
    expect(field(lead, "opacity")).to_have_value("")
    select(lead, ELEMENT, "Hero p")
    expect(field(lead, "opacity")).to_have_value("")
    type_value(lead, "gap", "6px")
    assert len(sent) == 1, sent
    nodes = lead.site()["site"]["nodes"]
    assert nodes[ELEMENT]["styles"].get("opacity") is None
    assert nodes["hero-copy"]["styles"].get("opacity") == before["site"]["nodes"]["hero-copy"]["styles"].get("opacity")


def test_the_exported_css_carries_the_value_set_with_the_slider(lead):
    earlier = exported_css(lead)
    x, y, width = track(lead, "Letter spacing")
    pointer = lead.canvas_pointer()
    pointer.move(x + width * 0.37, y)
    pointer.down()
    pointer.up()
    value = lead.until(lambda site: stored(lead, "letter-spacing", site), "a letter spacing to be stored")["nodes"][ELEMENT]["styles"]["letter-spacing"]
    expect(field(lead, "letter-spacing")).to_have_value(value)
    assert re.fullmatch(r"-?\d+(\.\d+)?px", value), value
    written = re.compile(rf"letter-spacing:\s*{re.escape(value)}\s*[;}}]")
    assert len(written.findall(exported_css(lead))) == len(written.findall(earlier)) + 1, f"letter-spacing:{value} is not added to the exported CSS"
