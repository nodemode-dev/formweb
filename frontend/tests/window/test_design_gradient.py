import io
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
QUIET = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done))))"
NODE = "h-logo-word"
THREE = "linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)"
TWO = "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)"
STOP = re.compile(r"(#[0-9a-f]{3,8}|var\(--[\w-]+\)|rgba?\([^)]*\)|[a-z]+) (\d+(?:\.\d+)?)%(?=,|\)$)")
PAINTED = """(value) => {
  const probe = document.createElement('div');
  probe.style.background = value;
  document.body.append(probe);
  const seen = getComputedStyle(probe).backgroundImage;
  probe.remove();
  return seen;
}"""


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


def field(editor):
    return editor.page.locator('input[data-style="background"]')


def background(site):
    return site["nodes"][NODE]["styles"].get("background")


def stored(editor):
    return background(editor.site()["site"])


def type_value(editor, value):
    field(editor).fill(value)
    field(editor).press("Enter")


def typed(editor, value):
    type_value(editor, value)
    site = editor.until(lambda s: background(s) == value, f"background {value} to be stored")
    field(editor).blur()
    return site


def run(editor, command):
    editor.page.evaluate(f"window.formweb.run('{command}')")


def part(editor, role, name):
    return picker(editor).get_by_role(role, name=name, exact=True)


def swatch(editor, label="Background"):
    return editor.page.get_by_role("button", name=f"Choose {label}", exact=True)


def picker(editor, label="Background"):
    return editor.page.get_by_role("dialog", name=f"Color picker for {label}")


def tab(editor, name):
    return picker(editor).get_by_role("tab", name=name, exact=True)


def handle(editor, n):
    return part(editor, "slider", f"Gradient stop {n}")


def handles(editor):
    return picker(editor).get_by_role("slider", name=re.compile(r"^Gradient stop \d+$"))


def open_picker(editor):
    swatch(editor).click()
    expect(picker(editor)).to_be_visible()
    return picker(editor)


def open_gradient(editor):
    dialog = open_picker(editor)
    if tab(editor, "Gradient").get_attribute("aria-selected") != "true":
        tab(editor, "Gradient").click()
    expect(tab(editor, "Gradient")).to_have_attribute("aria-selected", "true")
    return dialog


def stops(value):
    return [(color, float(at)) for color, at in STOP.findall(value)]


def positions(value):
    return [at for _, at in stops(value)]


def canvas_paint(editor):
    return editor.canvas.locator(f'[data-fw-id="{NODE}"]').evaluate("el => getComputedStyle(el).backgroundImage")


def paints_as_stored(editor, value):
    want = editor.page.evaluate(PAINTED, value)
    assert want not in ("", "none"), f"the browser does not read {value!r} as a background image"
    editor.eventually(lambda: canvas_paint(editor) == want, f"the canvas element to paint {value}")


def export_css(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return "\n".join(archive.read(name).decode("utf-8") for name in archive.namelist() if name.endswith(".css"))


def focus_inside(dialog):
    return dialog.evaluate("(box) => box.contains(document.activeElement)")


def node_count(editor):
    return len(editor.site()["site"]["nodes"])


def one_gesture(editor, action, what):
    before = editor.site()
    changes = Changes(editor)
    action()
    site = editor.changed_from(before["site"])
    changes.settled()
    assert len(changes.sent) == 1, f"{what} sent {len(changes.sent)} changes"
    assert editor.site()["revision"] == before["revision"] + 1, f"{what} was not one step"
    return background(site)


def hold_first_change(editor):
    held = []
    editor.page.route(OWN_CHANGE, lambda route: route.continue_() if held else held.append((route, route.fetch())))
    return held


@pytest.fixture
def word(harbour):
    select(harbour, NODE)
    return harbour


def test_the_background_picker_has_a_gradient_tab_and_the_color_picker_does_not(word):
    open_picker(word)
    expect(tab(word, "Solid")).to_be_visible()
    expect(tab(word, "Gradient")).to_be_visible()
    word.page.keyboard.press("Escape")
    expect(picker(word)).to_be_hidden()
    swatch(word, "Color").click()
    dialog = picker(word, "Color")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role("tab")).to_have_count(0)
    expect(dialog.get_by_role("tab", name="Gradient")).to_have_count(0)


def test_on_a_plain_color_the_tab_offers_a_starter_and_stores_nothing_until_use_gradient(word):
    typed(word, "#336699")
    before = word.site()
    changes = Changes(word)
    open_gradient(word)
    expect(handle(word, 1)).to_be_visible()
    expect(handle(word, 2)).to_be_visible()
    expect(part(word, "button", "Use gradient")).to_be_visible()
    changes.settled()
    assert changes.sent == []
    assert word.site() == before
    expect(field(word)).to_have_value("#336699")


def test_use_gradient_stores_one_plain_gradient_that_the_canvas_paints_and_the_export_carries_and_one_undo_removes_it(word):
    typed(word, "#336699")
    before = word.site()["site"]
    open_gradient(word)
    value = one_gesture(word, lambda: part(word, "button", "Use gradient").click(), "Use gradient")
    assert re.fullmatch(r"(?:linear|radial)-gradient\([^;]*\)", value), f"{value!r} is not one plain CSS gradient"
    assert len(stops(value)) >= 2
    expect(field(word)).to_have_value(value)
    paints_as_stored(word, value)
    assert value in export_css(word), f"the exported CSS does not carry {value} unchanged"
    run(word, "edit.undo")
    word.restored_to(before)
    expect(field(word)).to_have_value("#336699")


def test_a_stop_is_added_by_a_click_on_the_bar_dragged_recolored_and_removed_but_never_below_two(word):
    typed(word, TWO)
    dialog = open_picker(word)
    expect(tab(word, "Gradient")).to_have_attribute("aria-selected", "true")
    bar = part(word, "group", "Gradient stops")
    box = bar.bounding_box()
    value = one_gesture(word, lambda: bar.click(position={"x": box["width"] * 0.5, "y": box["height"] / 2}), "a click on the bar")
    assert len(stops(value)) == 3 and abs(positions(value)[1] - 50) <= 3, f"the click at the middle of the bar gave {value}"
    expect(handles(word)).to_have_count(3)
    middle = dialog.get_by_role("slider", name=re.compile(r"^Gradient stop \d+$")).and_(dialog.locator('[aria-valuenow]:not([aria-valuenow="0"]):not([aria-valuenow="100"])'))
    hbox = middle.bounding_box()
    pointer = word.canvas_pointer()
    pointer.move(hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2)
    changes = Changes(word)
    before = word.site()
    pointer.down()
    pointer.move(box["x"] + box["width"] * 0.25, hbox["y"] + hbox["height"] / 2, steps=8, held=True)
    word.eventually(lambda: field(word).input_value() != value, "the input to show the pending stop")
    pending = field(word).input_value()
    assert abs(positions(pending)[1] - 25) <= 3, f"the dragged stop shows {pending}"
    assert changes.sent == [] and word.site() == before, "a change was sent during the drag"
    pointer.up()
    value = background(word.changed_from(before["site"]))
    changes.settled()
    assert len(changes.sent) == 1
    assert value == pending
    colour = part(word, "textbox", "Hex or rgb() value of Stop color")
    value = one_gesture(word, lambda: (colour.fill("#123456"), colour.press("Enter")), "a stop recolored")
    assert ("#123456", positions(pending)[1]) in stops(value), f"the recolored stop is not in {value}"
    middle.focus()
    value = one_gesture(word, lambda: word.page.keyboard.press("Delete"), "Delete on a stop")
    assert len(stops(value)) == 2
    remove = part(word, "button", "Remove stop")
    expect(remove).to_be_disabled()
    count = node_count(word)
    changes = Changes(word)
    handle(word, 1).focus()
    word.page.keyboard.press("Delete")
    word.page.keyboard.press("Backspace")
    changes.settled()
    assert changes.sent == []
    assert stored(word) == value
    assert node_count(word) == count


def test_each_gesture_stores_what_css_means_by_it_and_n_gestures_then_n_undos_return_to_the_start(word):
    typed(word, TWO)
    start = word.site()["site"]
    open_picker(word)
    expect(tab(word, "Gradient")).to_have_attribute("aria-selected", "true")
    angle = part(word, "spinbutton", "Angle in degrees")
    steps = [
        ("Radial", lambda: part(word, "button", "Radial").click(), lambda v: v.startswith("radial-gradient(")),
        ("Circle", lambda: part(word, "button", "Circle").click(), lambda v: re.match(r"radial-gradient\(circle\b", v)),
        ("Ellipse", lambda: part(word, "button", "Ellipse").click(), lambda v: v.startswith("radial-gradient(") and "circle" not in v),
        ("Linear", lambda: part(word, "button", "Linear").click(), lambda v: v.startswith("linear-gradient(")),
        ("an angle", lambda: (angle.fill("200"), angle.press("Enter")), lambda v: v.startswith("linear-gradient(200deg,")),
        ("Right", lambda: part(word, "button", "Right").click(), lambda v: re.match(r"linear-gradient\((?:90deg|to right),", v)),
        ("Down", lambda: part(word, "button", "Down").click(), lambda v: re.match(r"linear-gradient\((?:(?:180deg|to bottom), )?#", v)),
        ("Reverse", lambda: part(word, "button", "Reverse").click(), lambda v: stops(v) == [("#0000ff", 0.0), ("#ff0000", 100.0)]),
    ]
    values = [background(start)]
    for name, action, means in steps:
        value = one_gesture(word, action, name)
        assert means(value), f"{name} stored {value!r}"
        if name != "Reverse":
            assert stops(value) == stops(TWO), f"{name} changed the stops: {value}"
        paints_as_stored(word, value)
        values.append(value)
    for value in reversed(values[:-1]):
        run(word, "edit.undo")
        word.until(lambda site: background(site) == value, f"an undo back to {value}")
        expect(picker(word)).to_be_visible()
    word.restored_to(start)


def test_a_gradient_typed_by_hand_opens_on_the_gradient_tab_with_its_stops(word):
    typed(word, "linear-gradient(to right, #ff0000 20%, #00ff00, #0000ff 80%)")
    open_picker(word)
    expect(tab(word, "Gradient")).to_have_attribute("aria-selected", "true")
    expect(handles(word)).to_have_count(3)
    assert sorted(float(n) for n in handles(word).evaluate_all("nodes => nodes.map(n => n.getAttribute('aria-valuenow'))")) == [20, 50, 80]
    assert stored(word) == "linear-gradient(to right, #ff0000 20%, #00ff00, #0000ff 80%)"


@pytest.mark.parametrize("value, swatch_shown", [
    ("conic-gradient(from 90deg, #ff0000, #0000ff)", True),
    ("repeating-linear-gradient(90deg, #ff0000 0%, #0000ff 20%)", True),
    ("linear-gradient(#ff0000, #0000ff), linear-gradient(90deg, #ffffff, #000000)", False),
], ids=["conic", "repeating", "two-layers"])
def test_a_gradient_the_tab_cannot_show_is_left_exactly_as_typed(word, value, swatch_shown):
    typed(word, "#336699")
    expect(swatch(word)).to_be_visible()
    typed(word, value)
    before = word.site()
    changes = Changes(word)
    if swatch_shown:
        open_picker(word)
        expect(tab(word, "Solid")).to_have_attribute("aria-selected", "true")
        expect(tab(word, "Gradient")).to_have_attribute("aria-selected", "false")
        word.page.keyboard.press("Escape")
        expect(picker(word)).to_be_hidden()
    else:
        expect(swatch(word)).to_be_hidden()
    changes.settled()
    assert changes.sent == []
    assert word.site() == before
    assert stored(word) == value
    expect(field(word)).to_have_value(value)


def test_arrow_keys_move_a_stop_by_1_shift_by_10_home_and_end_go_to_the_ends_and_a_held_key_is_one_step(word):
    typed(word, THREE)
    open_picker(word)
    handle(word, 2).focus()
    keys = word.page.keyboard
    assert positions(one_gesture(word, lambda: keys.press("ArrowRight"), "ArrowRight")) == [0, 51, 100]
    assert positions(one_gesture(word, lambda: keys.press("Shift+ArrowRight"), "Shift+ArrowRight")) == [0, 61, 100]
    assert positions(one_gesture(word, lambda: keys.press("Shift+ArrowLeft"), "Shift+ArrowLeft")) == [0, 51, 100]

    def held():
        for _ in range(5):
            keys.down("ArrowLeft")
        keys.up("ArrowLeft")

    assert positions(one_gesture(word, held, "a held ArrowLeft")) == [0, 46, 100]
    assert sorted(positions(one_gesture(word, lambda: keys.press("Home"), "Home"))) == [0, 0, 100]
    handle(word, 2).focus()
    value = one_gesture(word, lambda: keys.press("End"), "End")
    assert sorted(positions(value)) == [0, 100, 100]
    assert ("#00ff00", 100.0) in stops(value)


def test_delete_on_a_stop_removes_the_stop_and_never_an_element_of_the_page(word):
    typed(word, THREE)
    count = node_count(word)
    dialog = open_picker(word)
    handle(word, 2).focus()
    value = one_gesture(word, lambda: word.page.keyboard.press("Delete"), "Delete on a stop")
    assert stops(value) == [("#ff0000", 0.0), ("#0000ff", 100.0)]
    assert node_count(word) == count
    assert focus_inside(dialog)
    expect(word.layer_row(NODE)).to_be_visible()


def test_ctrl_z_with_focus_on_a_stop_handle_undoes_and_focus_stays_inside_the_picker(word):
    before = typed(word, THREE)
    dialog = open_picker(word)
    handle(word, 2).focus()
    word.page.keyboard.press("ArrowRight")
    word.until(lambda site: positions(background(site)) == [0, 51, 100], "the stop moved to 51%")
    expect(handle(word, 2)).to_be_focused()
    word.page.keyboard.press("Control+z")
    word.restored_to(before)
    expect(dialog).to_be_visible()
    assert focus_inside(dialog)
    expect(field(word)).to_have_value(THREE)


def test_ctrl_z_back_to_the_plain_color_from_a_stop_handle_keeps_focus_in_the_picker_and_backspace_removes_nothing(word):
    before = typed(word, "#336699")
    count = len(before["nodes"])
    dialog = open_gradient(word)
    one_gesture(word, lambda: part(word, "button", "Use gradient").click(), "Use gradient")
    handle(word, 1).focus()
    word.page.keyboard.press("Control+z")
    word.restored_to(before)
    word.page.evaluate(QUIET)
    expect(dialog).to_be_visible()
    assert focus_inside(dialog), f"focus fell to {word.page.evaluate('document.activeElement.tagName')}"
    changes = Changes(word)
    word.page.keyboard.press("Backspace")
    word.page.keyboard.press("Delete")
    changes.settled()
    assert node_count(word) == count
    assert stored(word) == "#336699"
    expect(word.layer_row(NODE)).to_be_visible()


def test_an_arrow_key_in_the_tab_opened_while_a_typed_gradient_is_on_its_way_moves_a_stop_and_keeps_the_gradient(word):
    held = hold_first_change(word)
    type_value(word, THREE)
    word.eventually(lambda: held, "the typed gradient to reach the engine")
    swatch(word).click()
    expect(picker(word)).to_be_visible()
    expect(tab(word, "Gradient")).to_have_attribute("aria-selected", "true")
    expect(handles(word)).to_have_count(3)
    handle(word, 2).focus()
    word.page.keyboard.press("ArrowRight")
    route, answer = held[0]
    route.fulfill(response=answer)
    site = word.until(lambda s: background(s) not in (None, THREE), "the arrow key to be stored after the typed gradient")
    value = background(site)
    assert stops(value) == [("#ff0000", 0.0), ("#00ff00", 51.0), ("#0000ff", 100.0)], f"the arrow key stored {value!r}"
    expect(field(word)).to_have_value(value)
