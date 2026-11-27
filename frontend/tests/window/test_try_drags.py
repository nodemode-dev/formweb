import json
import re
import time

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
QUIET = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done))))"
FRAMES = "(n) => new Promise(done => { const next = left => left ? requestAnimationFrame(() => next(left - 1)) : done(); next(n); })"
NODE = "h-logo-word"
PARENT = "h-logo"
THREE = "linear-gradient(90deg, #ff0000 0%, #00ff00 50%, #0000ff 100%)"
WAIT_S = 15
CSS = """([key, value, read]) => {
  const probe = document.createElement('div');
  probe.style.setProperty(key, value);
  document.body.append(probe);
  const seen = getComputedStyle(probe).getPropertyValue(read);
  probe.remove();
  return seen;
}"""
SAMPLE = """([id, read]) => {
  window.__samples = [];
  window.__sampling = true;
  const look = () => {
    const frame = document.querySelector('iframe[title="Website canvas"]');
    const doc = frame && frame.contentDocument;
    const node = doc && doc.querySelector(`[data-fw-id="${id}"]`);
    const revision = document.querySelector('footer.statusbar .status-revision');
    window.__samples.push([node ? frame.contentWindow.getComputedStyle(node).getPropertyValue(read) : null, revision ? revision.textContent : '']);
    if (window.__sampling) requestAnimationFrame(look);
  };
  look();
}"""
STEP = """([id, key, previous]) => {
  const value = document.querySelector(`input[data-style="${key}"]`).value;
  if (!value || value === previous) return false;
  const frame = document.querySelector('iframe[title="Website canvas"]');
  const node = frame.contentDocument.querySelector(`[data-fw-id="${id}"]`);
  const probe = document.createElement('div');
  probe.style.setProperty(key, value);
  document.body.append(probe);
  const want = getComputedStyle(probe).getPropertyValue(key);
  probe.remove();
  return frame.contentWindow.getComputedStyle(node).getPropertyValue(key) === want ? value : false;
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


def sent(changes, count):
    bodies = [request.post_data for request in changes.sent]
    assert len(bodies) == count, f"the window sent {len(bodies)} changes where {count} belong: {bodies}"


def select(editor, node):
    editor.layer_row(node).click()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {re.escape(node)}$"))


def field(editor, key):
    return editor.page.locator(f'input[data-style="{key}"]')


def slider(editor, name):
    return editor.page.get_by_role("slider", name=name, exact=True)


def styles(site, node=NODE, breakpoint="desktop"):
    item = site["nodes"][node]
    return item["styles"] if breakpoint == "desktop" else item.get("breakpoints", {}).get(breakpoint, {})


def stored(editor, key, node=NODE, breakpoint="desktop"):
    return styles(editor.site()["site"], node, breakpoint).get(key)


def typed(editor, key, value):
    box = field(editor, key)
    box.fill(value)
    box.press("Enter")
    site = editor.until(lambda s: styles(s).get(key) == value, f"{key} {value} to be stored")
    box.blur()
    return site


def run(editor, command):
    editor.page.evaluate(f"window.formweb.run('{command}')")


def read_of(key):
    return "background-image" if key == "background" else key


def css(editor, key, value):
    return editor.page.evaluate(CSS, [key, value, read_of(key)])


def on_page(editor, key, node=NODE):
    return editor.canvas.locator(f'[data-fw-id="{node}"]').evaluate(f"el => getComputedStyle(el).getPropertyValue('{read_of(key)}')")


def page_shows(editor, key, want, what, node=NODE):
    deadline = time.monotonic() + WAIT_S
    while True:
        seen = on_page(editor, key, node)
        if seen == want:
            return
        if time.monotonic() > deadline:
            raise AssertionError(f"{what}: the page shows {read_of(key)} {seen!r} on {node}, not {want!r}")
        editor.page.wait_for_timeout(50)


def shown_live(editor, key, other_than):
    """Waits until the field shows a value the gesture made (none of other_than) and the page shows what CSS makes of it."""
    deadline = time.monotonic() + WAIT_S
    while True:
        value = field(editor, key).input_value()
        seen = on_page(editor, key)
        want = css(editor, key, value) if value else None
        if value and value not in other_than and seen == want:
            return value
        if time.monotonic() > deadline:
            raise AssertionError(f"the page does not show the dragged {key}: the field shows {value!r}, so the page should show {want!r}, but it shows {seen!r}")
        editor.page.wait_for_timeout(50)


def drag_from(editor, target, start):
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    pointer = editor.canvas_pointer()
    y = box["y"] + box["height"] / 2
    pointer.move(box["x"] + box["width"] * start, y)
    pointer.down()
    return pointer, lambda f: (box["x"] + box["width"] * f, y)


def swatch(editor, label):
    return editor.page.get_by_role("button", name=f"Choose {label}", exact=True)


def picker(editor, label):
    return editor.page.get_by_role("dialog", name=f"Color picker for {label}")


def open_picker(editor, label):
    swatch(editor, label).click()
    dialog = picker(editor, label)
    expect(dialog).to_be_visible()
    return dialog


def square(editor, label):
    return slider(editor, f"Saturation and brightness of {label}")


def drag_in(editor, target, start, to, steps=8):
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    pointer = editor.canvas_pointer()
    at = lambda x, y: (box["x"] + box["width"] * x, box["y"] + box["height"] * y)
    pointer.move(*at(*start))
    pointer.down()
    pointer.move(*at(*to), steps=steps, held=True)
    return pointer, at


def sample(editor, key, node=NODE):
    editor.page.evaluate(SAMPLE, [node, read_of(key)])


def samples(editor):
    editor.page.evaluate("window.__sampling = false")
    editor.page.evaluate(QUIET)
    return editor.page.evaluate("window.__samples")


def story(seen):
    """The frames with repeats folded: each change of the page or of the revision once."""
    return [frame for i, frame in enumerate(seen) if i == 0 or frame != seen[i - 1]]


def revisions(seen):
    return {int(m.group(1)) for _, text in seen if (m := re.search(r"\brev (\d+)\b", text))}


def step_shown(editor, previous):
    try:
        return editor.page.wait_for_function(STEP, arg=[NODE, "opacity", previous], timeout=WAIT_S * 1000).json_value()
    except Exception:
        raise AssertionError(f"the held key did not show a new opacity on the page: the field shows {field(editor, 'opacity').input_value()!r}, the page {on_page(editor, 'opacity')!r}") from None


def hold_changes(editor):
    held = []
    editor.page.route(OWN_CHANGE, lambda route: held.append(route))
    return held


def breakpoint_choice(editor):
    return editor.page.get_by_role("combobox", name="Responsive breakpoint")


@pytest.fixture
def word(harbour):
    select(harbour, NODE)
    return harbour


def test_dragging_the_opacity_slider_shows_each_value_on_the_page_keeps_the_revision_and_writes_once_on_release(word):
    changes = Changes(word)
    before = word.site()
    start = on_page(word, "opacity")
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.8)
    pointer.move(*x(0.6), steps=4, held=True)
    first = shown_live(word, "opacity", [""])
    pointer.move(*x(0.3), steps=4, held=True)
    second = shown_live(word, "opacity", ["", first])
    assert changes.sent == [], "a change was sent while the slider was still held"
    assert word.site() == before, "the stored site changed during the drag"
    pointer.up()
    word.until(lambda site: styles(site).get("opacity") == second, f"opacity {second} to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "opacity", css(word, "opacity", second), "after release")
    run(word, "edit.undo")
    word.restored_to(before["site"])
    page_shows(word, "opacity", start, "one undo after the drag")


def test_escape_during_a_slider_drag_puts_the_page_and_the_field_back_and_writes_nothing(word):
    typed(word, "opacity", "0.9")
    start = on_page(word, "opacity")
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.85)
    pointer.move(*x(0.25), steps=6, held=True)
    shown_live(word, "opacity", ["", "0.9"])
    word.page.keyboard.press("Escape")
    expect(field(word, "opacity")).to_have_value("0.9")
    page_shows(word, "opacity", start, "after Escape during the drag")
    pointer.move(*x(0.15), steps=3, held=True)
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    page_shows(word, "opacity", start, "after the release that followed Escape")


def test_a_drag_in_the_color_square_colors_the_element_on_the_page_before_release_and_release_writes_once(word):
    typed(word, "color", "#336699")
    changes = Changes(word)
    before = word.site()
    open_picker(word, "Color")
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.8, 0.25))
    first = shown_live(word, "color", ["", "#336699"])
    pointer.move(*at(0.9, 0.1), steps=4, held=True)
    second = shown_live(word, "color", ["", "#336699", first])
    assert changes.sent == [] and word.site() == before, "a change was stored during the drag"
    pointer.up()
    word.until(lambda site: styles(site).get("color") == second, f"color {second} to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "color", css(word, "color", second), "after release")


@pytest.mark.parametrize("bar", ["Hue", "Opacity"])
def test_a_drag_on_the_hue_or_opacity_bar_of_the_picker_colors_the_element_on_the_page_before_release_and_writes_once(word, bar):
    typed(word, "color", "#336699")
    changes = Changes(word)
    before = word.site()
    open_picker(word, "Color")
    pointer, x = drag_from(word, slider(word, f"{bar} of Color"), 0.9)
    pointer.move(*x(0.5), steps=4, held=True)
    first = shown_live(word, "color", ["", "#336699"])
    pointer.move(*x(0.2), steps=4, held=True)
    second = shown_live(word, "color", ["", "#336699", first])
    assert changes.sent == [] and word.site() == before, "a change was stored during the drag"
    pointer.up()
    word.until(lambda site: styles(site).get("color") == second, f"color {second} to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "color", css(word, "color", second), "after release")


def test_dragging_a_gradient_stop_changes_the_background_on_the_page_before_release_and_writes_once(word):
    typed(word, "background", THREE)
    changes = Changes(word)
    before = word.site()
    dialog = open_picker(word, "Background")
    expect(dialog.get_by_role("tab", name="Gradient", exact=True)).to_have_attribute("aria-selected", "true")
    bar = dialog.get_by_role("group", name="Gradient stops", exact=True).bounding_box()
    stop = dialog.get_by_role("slider", name="Gradient stop 2", exact=True).bounding_box()
    pointer = word.canvas_pointer()
    y = stop["y"] + stop["height"] / 2
    pointer.move(stop["x"] + stop["width"] / 2, y)
    pointer.down()
    pointer.move(bar["x"] + bar["width"] * 0.35, y, steps=6, held=True)
    first = shown_live(word, "background", ["", THREE])
    pointer.move(bar["x"] + bar["width"] * 0.2, y, steps=6, held=True)
    second = shown_live(word, "background", ["", THREE, first])
    assert changes.sent == [] and word.site() == before, "a change was stored during the drag"
    pointer.up()
    word.until(lambda site: styles(site).get("background") == second, "the dragged gradient to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "background", css(word, "background", second), "after release")


def test_a_held_arrow_key_on_a_slider_changes_the_page_at_each_step_and_writes_once_on_release(word):
    changes = Changes(word)
    before = word.site()
    slider(word, "Opacity").focus()
    values = []
    for _ in range(4):
        word.page.keyboard.down("ArrowLeft")
        values.append(step_shown(word, values[-1] if values else ""))
    assert [float(v) for v in values] == sorted((float(v) for v in values), reverse=True) and len(set(values)) == 4, values
    assert changes.sent == [], "a change was sent while the key was held"
    assert word.site()["revision"] == before["revision"]
    word.page.keyboard.up("ArrowLeft")
    word.until(lambda site: styles(site).get("opacity") == values[-1], f"opacity {values[-1]} to be stored on key release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "opacity", css(word, "opacity", values[-1]), "after the key release")


def test_with_a_slow_engine_the_page_keeps_the_released_slider_value_and_never_shows_the_old_one_before_the_answer(word):
    typed(word, "opacity", "0.9")
    old = on_page(word, "opacity")
    before = word.site()
    held = hold_changes(word)
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.85)
    pointer.move(*x(0.3), steps=6, held=True)
    value = shown_live(word, "opacity", ["", "0.9"])
    sample(word, "opacity")
    pointer.up()
    word.eventually(lambda: held, "the release to send its change")
    word.page.evaluate(FRAMES, 10)
    assert word.site()["revision"] == before["revision"]
    held.pop(0).continue_()
    word.page.unroute(OWN_CHANGE)
    word.until(lambda site: styles(site).get("opacity") == value, f"opacity {value} to be stored")
    seen = samples(word)
    assert seen and all(page != old for page, _ in seen), f"the page showed the old opacity {old} between release and answer: {story(seen)}"
    assert seen[0][0] == css(word, "opacity", value) and seen[-1][0] == css(word, "opacity", value), f"the page did not show the released opacity {value} from release to answer: {story(seen)}"
    assert revisions(seen) == {before["revision"], before["revision"] + 1}, f"the frames did not cover the release and the answer: {story(seen)}"


def test_with_a_slow_engine_the_page_keeps_the_released_square_color_and_never_shows_the_old_one_before_the_answer(word):
    typed(word, "color", "#336699")
    old = on_page(word, "color")
    before = word.site()
    open_picker(word, "Color")
    held = hold_changes(word)
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.85, 0.15))
    value = shown_live(word, "color", ["", "#336699"])
    sample(word, "color")
    pointer.up()
    word.eventually(lambda: held, "the release to send its change")
    word.page.evaluate(FRAMES, 10)
    assert word.site()["revision"] == before["revision"]
    held.pop(0).continue_()
    word.page.unroute(OWN_CHANGE)
    word.until(lambda site: styles(site).get("color") == value, f"color {value} to be stored")
    seen = samples(word)
    assert seen and all(page != old for page, _ in seen), f"the page showed the old color {old} between release and answer: {story(seen)}"
    assert seen[0][0] == css(word, "color", value) and seen[-1][0] == css(word, "color", value), f"the page did not show the released color {value} from release to answer: {story(seen)}"
    assert revisions(seen) == {before["revision"], before["revision"] + 1}, f"the frames did not cover the release and the answer: {story(seen)}"


def test_a_slider_drag_cut_off_by_select_parent_leaves_both_elements_on_the_page_as_stored_and_writes_nothing(word):
    start = on_page(word, "opacity")
    parent = on_page(word, "opacity", PARENT)
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(*x(0.3), steps=6, held=True)
    shown_live(word, "opacity", [""])
    run(word, "edit.select-parent")
    expect(word.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {PARENT}$"))
    page_shows(word, "opacity", start, "the element the drag began on, after Select parent")
    page_shows(word, "opacity", parent, "the parent, after Select parent", PARENT)
    pointer.move(*x(0.1), steps=4, held=True)
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    expect(field(word, "opacity")).to_have_value("")
    page_shows(word, "opacity", start, "the element the drag began on, after the release")
    page_shows(word, "opacity", parent, "the parent, after the release", PARENT)


def test_a_color_square_drag_cut_off_by_select_parent_leaves_both_elements_on_the_page_as_stored_and_writes_nothing(word):
    typed(word, "color", "#336699")
    start = on_page(word, "color")
    parent = on_page(word, "color", PARENT)
    changes = Changes(word)
    before = word.site()
    open_picker(word, "Color")
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.9, 0.1))
    shown_live(word, "color", ["", "#336699"])
    run(word, "edit.select-parent")
    expect(word.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {PARENT}$"))
    page_shows(word, "color", start, "the element the drag began on, after Select parent")
    page_shows(word, "color", parent, "the parent, after Select parent", PARENT)
    pointer.move(*at(0.7, 0.3), steps=3, held=True)
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    page_shows(word, "color", start, "the element the drag began on, after the release")
    page_shows(word, "color", parent, "the parent, after the release", PARENT)


def test_escape_during_a_drag_in_the_color_square_puts_the_stored_color_back_on_the_page_and_writes_nothing(word):
    typed(word, "color", "#336699")
    start = on_page(word, "color")
    changes = Changes(word)
    before = word.site()
    open_picker(word, "Color")
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.1, 0.9))
    shown_live(word, "color", ["", "#336699"])
    word.page.keyboard.press("Escape")
    expect(field(word, "color")).to_have_value("#336699")
    page_shows(word, "color", start, "after Escape during the drag")
    pointer.move(*at(0.2, 0.8), steps=3, held=True)
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    page_shows(word, "color", start, "after the release that followed Escape")


def test_a_slider_drag_cut_off_by_a_breakpoint_change_puts_the_page_back_and_writes_nothing(word):
    start = on_page(word, "opacity")
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(*x(0.3), steps=6, held=True)
    shown_live(word, "opacity", [""])
    run(word, "view.tablet")
    expect(breakpoint_choice(word)).to_have_value("tablet")
    page_shows(word, "opacity", start, "at tablet, after the breakpoint change during the drag")
    pointer.move(*x(0.1), steps=4, held=True)
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    page_shows(word, "opacity", start, "at tablet, after the release")
    run(word, "view.desktop")
    expect(breakpoint_choice(word)).to_have_value("desktop")
    page_shows(word, "opacity", start, "back at desktop")


def test_another_writer_during_a_slider_drag_is_drawn_while_the_page_keeps_the_dragged_value_and_release_stores_it(word):
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.75)
    pointer.move(*x(0.3), steps=6, held=True)
    value = shown_live(word, "opacity", [""])
    word.command("node.update", {"id": NODE, "patch": {"styles": {"opacity": "0.77", "background": "#00aa00"}}})
    word.until(lambda site: styles(site).get("background") == "#00aa00", "the other writer's change")
    page_shows(word, "background-color", "rgb(0, 170, 0)", "the other writer's background")
    page_shows(word, "opacity", css(word, "opacity", value), "the dragged opacity over the other writer's change")
    pointer.up()
    word.until(lambda site: styles(site).get("opacity") == value, f"the dragged opacity {value} to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 2
    page_shows(word, "opacity", css(word, "opacity", value), "after release")
    expect(field(word, "opacity")).to_have_value(value)


def test_a_slider_drag_that_ends_on_its_start_value_writes_nothing_and_the_page_shows_the_stored_value(word):
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.5)
    pointer.up()
    word.until(lambda site: styles(site).get("opacity") == "0.5", "opacity 0.5 from one click at the middle")
    stored_look = css(word, "opacity", "0.5")
    page_shows(word, "opacity", stored_look, "after the click")
    changes = Changes(word)
    before = word.site()
    pointer.down()
    pointer.move(*x(0.15), steps=6, held=True)
    shown_live(word, "opacity", ["", "0.5"])
    pointer.move(*x(0.5), steps=6, held=True)
    expect(field(word, "opacity")).to_have_value("0.5")
    pointer.up()
    changes.settled()
    sent(changes, 0)
    assert word.site() == before
    page_shows(word, "opacity", stored_look, "after the release on the start value")


def test_a_release_the_engine_refuses_puts_the_page_and_the_field_back_and_shows_the_reason(word):
    start = on_page(word, "opacity")
    before = word.site()
    refused = []

    def refuse(route):
        refused.append(route.request.post_data)
        route.fulfill(status=400, content_type="application/json", body=json.dumps({"detail": "Refused by the drag test."}))

    word.page.route(OWN_CHANGE, refuse)
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.8)
    pointer.move(*x(0.3), steps=6, held=True)
    shown_live(word, "opacity", [""])
    pointer.up()
    expect(word.status).to_contain_text("Refused by the drag test.")
    assert len(refused) == 1
    page_shows(word, "opacity", start, "after the refused release")
    expect(field(word, "opacity")).to_have_value("")
    assert word.site() == before


def test_the_brand_restriction_coming_on_during_a_square_drag_drops_it_and_the_page_shows_the_stored_color_never_black(word):
    typed(word, "color", "#405980")
    stored_look = css(word, "color", "#405980")
    black = css(word, "color", "#000000")
    page_shows(word, "color", stored_look, "the typed color")
    changes = Changes(word)
    before = word.site()
    open_picker(word, "Color")
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.85, 0.2))
    shown_live(word, "color", ["", "#405980"])
    sample(word, "color")
    word.command("site.update", {"patch": {"settings": {"brandRestrict": "true"}}})
    word.until(lambda site: site["settings"].get("brandRestrict") == "true", "the brand restriction")
    expect(square(word, "Color")).to_be_hidden()
    page_shows(word, "color", stored_look, "once the restriction is on, with the button still down")
    pointer.move(*at(0.6, 0.6), steps=6, held=True)
    pointer.move(*at(0.3, 0.8), steps=6, held=True)
    pointer.up()
    changes.settled()
    seen = samples(word)
    assert black not in [page for page, _ in seen], f"the page showed black during the dropped drag: {story(seen)}"
    sent(changes, 0)
    after = word.site()
    assert after["revision"] == before["revision"] + 1
    assert styles(after["site"]).get("color") == "#405980"
    page_shows(word, "color", stored_look, "after the release")
    expect(field(word, "color")).to_have_value("#405980")


def test_resting_the_pointer_on_the_slider_the_square_the_bars_and_the_swatches_changes_nothing_on_the_page(word):
    typed(word, "color", "#336699")
    changes = Changes(word)
    before = word.site()
    start = on_page(word, "opacity")
    sample(word, "opacity")
    pointer = word.canvas_pointer()
    rest = lambda box, fx, fy: pointer.move(box["x"] + box["width"] * fx, box["y"] + box["height"] * fy, steps=5)
    for fx in (0.1, 0.5, 0.9):
        rest(slider(word, "Opacity").bounding_box(), fx, 0.5)
        word.page.evaluate(FRAMES, 20)
    opacity_seen = samples(word)
    dialog = open_picker(word, "Color")
    color_start = on_page(word, "color")
    sample(word, "color")
    for name in ("Saturation and brightness of Color", "Hue of Color", "Opacity of Color"):
        for fx, fy in ((0.2, 0.3), (0.8, 0.7)):
            rest(slider(word, name).bounding_box(), fx, fy)
            word.page.evaluate(FRAMES, 20)
    for button in dialog.get_by_role("button").filter(visible=True).all()[:6]:
        rest(button.bounding_box(), 0.5, 0.5)
        word.page.evaluate(FRAMES, 20)
    color_seen = samples(word)
    assert {page for page, _ in opacity_seen} == {start}, f"resting on the slider changed the page: {story(opacity_seen)}"
    assert {page for page, _ in color_seen} == {color_start}, f"resting on the picker changed the page: {story(color_seen)}"
    sent(changes, 0)
    assert word.site() == before
    rest(square(word, "Color").bounding_box(), 0.5, 0.5)
    pointer.down()
    pointer.move(*(lambda b: (b["x"] + b["width"] * 0.9, b["y"] + b["height"] * 0.1))(square(word, "Color").bounding_box()), steps=4, held=True)
    shown_live(word, "color", ["", "#336699"])
    word.page.keyboard.press("Escape")
    pointer.up()
    page_shows(word, "color", color_start, "after Escape")


def test_with_trying_switched_off_a_slider_drag_still_shows_on_the_page_and_writes_once_on_release(word):
    word.page.locator('[data-menu="View"]').click()
    item = word.page.locator('[role="menu"]:visible [data-command="view.try-choices"]')
    expect(item).to_have_attribute("aria-checked", "true")
    item.click()
    word.page.locator('[data-menu="View"]').click()
    expect(item).to_have_attribute("aria-checked", "false")
    word.page.keyboard.press("Escape")
    expect(item).to_be_hidden()
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.8)
    pointer.move(*x(0.3), steps=6, held=True)
    value = shown_live(word, "opacity", [""])
    assert changes.sent == [] and word.site() == before, "a change was stored during the drag"
    pointer.up()
    word.until(lambda site: styles(site).get("opacity") == value, f"opacity {value} to be stored on release")
    changes.settled()
    sent(changes, 1)
    assert word.site()["revision"] == before["revision"] + 1
    page_shows(word, "opacity", css(word, "opacity", value), "after release")


def test_under_tablet_the_page_shows_the_dragged_value_and_release_writes_tablet_only(word):
    breakpoint_choice(word).select_option("tablet")
    expect(breakpoint_choice(word)).to_have_value("tablet")
    desktop_look = on_page(word, "opacity")
    changes = Changes(word)
    before = word.site()
    pointer, x = drag_from(word, slider(word, "Opacity"), 0.8)
    pointer.move(*x(0.35), steps=6, held=True)
    value = shown_live(word, "opacity", [""])
    assert changes.sent == [] and word.site() == before, "a change was stored during the drag"
    pointer.up()
    after = word.until(lambda site: styles(site, breakpoint="tablet").get("opacity") == value, f"tablet opacity {value}")
    changes.settled()
    sent(changes, 1)
    assert styles(after).get("opacity") == styles(before["site"]).get("opacity")
    page_shows(word, "opacity", css(word, "opacity", value), "at tablet after release")
    run(word, "view.desktop")
    expect(breakpoint_choice(word)).to_have_value("desktop")
    page_shows(word, "opacity", desktop_look, "back at desktop")


def test_a_value_being_typed_into_the_field_is_not_shown_on_the_page_until_enter_writes_it(word):
    start = on_page(word, "opacity")
    changes = Changes(word)
    before = word.site()
    box = field(word, "opacity")
    box.click()
    sample(word, "opacity")
    for text in ("0", "0.", "0.3"):
        box.fill(text)
        word.page.evaluate(FRAMES, 10)
    seen = samples(word)
    assert {page for page, _ in seen} == {start}, f"text being typed reached the page: {story(seen)}"
    assert changes.sent == [] and word.site() == before
    box.press("Enter")
    word.until(lambda site: styles(site).get("opacity") == "0.3", "opacity 0.3 on Enter")
    changes.settled()
    sent(changes, 1)
    page_shows(word, "opacity", css(word, "opacity", "0.3"), "after Enter")


def test_the_hover_outline_stays_off_while_a_held_key_shows_a_slider_value_and_comes_back_after(word):
    marked = word.canvas.locator("[data-fw-hover]")
    row = word.layer_row("h-tools")
    row.scroll_into_view_if_needed()
    box = row.bounding_box()
    footer = word.page.locator("footer.statusbar").bounding_box()
    pointer = word.canvas_pointer()
    point = lambda fx: pointer.move(box["x"] + box["width"] * fx, box["y"] + box["height"] / 2, steps=3)
    away = lambda: pointer.move(footer["x"] + footer["width"] / 2, footer["y"] + footer["height"] / 2, steps=3)
    point(0.4)
    expect(marked).to_have_count(1)
    away()
    expect(marked).to_have_count(0)
    changes = Changes(word)
    held = hold_changes(word)
    slider(word, "Opacity").focus()
    word.page.keyboard.down("ArrowLeft")
    shown_live(word, "opacity", [""])
    for fx in (0.3, 0.5, 0.7):
        word.page.keyboard.down("ArrowLeft")
        point(fx)
        word.page.evaluate(FRAMES, 3)
        assert marked.count() == 0, "a hover outline was drawn while the held key showed its value on the page"
    word.page.keyboard.up("ArrowLeft")
    word.eventually(lambda: held and len(held) == len(changes.sent), "the key release to send its change")
    point(0.4)
    word.page.evaluate(FRAMES, 3)
    assert marked.count() == 0, "a hover outline was drawn while the released value waited for its answer"
    word.eventually(lambda: len(held) == len(changes.sent), "every change of the held key to be held")
    for route in held:
        route.continue_()
    word.page.unroute(OWN_CHANGE)
    changes.settled()
    away()
    point(0.6)
    expect(marked).to_have_count(1)
