import re

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
TARGET = "hero-h"
STORED_OPACITY = "0.8"
KEYS = ("opacity", "translate", "scale", "rotate", "filter")
KINDS = ("reveals", "loops", "text", "counters", "pointer")
PLAYS_IN_PREVIEW = "This effect plays in Preview and on the published site."
REDUCED = "Your system asks for reduced motion, so nothing is played here."
NOT_SHOWN = ("Split words", "Split characters", "Typewriter", "Count up", "Marquee left", "Marquee right", "Tilt", "Follow pointer")
LONG = {"from": {"opacity": "0", "translate": "0 24px"}, "duration": 10000, "delay": 10000, "stagger": 0, "children": False, "easing": "linear", "trigger": "view"}
LOOK = """(ids, keys) => {
  const doc = document.querySelector('iframe[title="Website canvas"]').contentDocument;
  return ids.map(id => {
    const el = doc.querySelector(`[data-fw-id="${id}"]`);
    if (!el) return null;
    const shown = getComputedStyle(el);
    return [el.getAttribute('style') || '', ...keys.map(key => shown.getPropertyValue(key)), ...keys.map(key => el.style.getPropertyValue(key))];
  });
}"""
WATCH = f"""([ids, keys]) => {{
  const look = {LOOK};
  const frame = document.querySelector('iframe[title="Website canvas"]');
  const doc = frame.contentDocument;
  const generation = window.__motionWatch = (window.__motionWatch || 0) + 1;
  window.__looks = [];
  window.__canvas = [];
  const tick = () => {{
    if (generation !== window.__motionWatch) return;
    window.__looks.push(look(ids, keys));
    window.__canvas.push([doc.querySelectorAll('script').length, doc.querySelectorAll('style').length, doc.getAnimations().length, frame.getAttribute('sandbox'), doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')]);
    requestAnimationFrame(tick);
  }};
  requestAnimationFrame(tick);
}}"""
SETTLED_LOOK = f"""async ([ids, keys]) => {{
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  return ({LOOK})(ids, keys);
}}"""


def select(editor, node):
    editor.layer_row(node).click()
    expect(editor.page.locator(".inspector-tag")).to_have_text(re.compile(rf"· {re.escape(node)}$"))


def open_motion(editor):
    editor.page.locator(".inspector button.quiet", has_text="Motion").click()
    expect(presets(editor)).to_be_visible()


def presets(editor):
    return editor.page.get_by_role("group", name="Motion presets")


def preset(editor, name):
    return presets(editor).get_by_role("button", name=name, exact=True)


def play_again(editor):
    return editor.page.get_by_role("button", name="Play again", exact=True)


def note(editor):
    return play_again(editor).locator("xpath=following-sibling::*[@aria-live]")


def motion_of(site, node):
    group = site.get("extensions", {}).get("motion", {})
    return {kind: group[kind][node] for kind in KINDS if node in group.get(kind, {})}


def clear_motion(editor, nodes):
    site = editor.site()["site"]
    found = [{"command": "motion.remove", "params": {"kind": kind, "node": node}} for node in nodes for kind in motion_of(site, node)]
    if found:
        editor.command(None, found, batch=True)
    editor.until(lambda s: not any(motion_of(s, node) for node in nodes), f"the motion of {nodes} to be removed")


def revision(editor):
    return editor.site()["revision"]


def look(editor, ids=(TARGET,)):
    return editor.page.evaluate(SETTLED_LOOK, [list(ids), list(KEYS)])


def watch(editor, ids=(TARGET,)):
    editor.page.evaluate(WATCH, [list(ids), list(KEYS)])


def looks(editor):
    return editor.page.evaluate("window.__looks")


def shown(entry, key):
    return entry[1 + KEYS.index(key)]


def own(entry, key):
    return entry[1 + len(KEYS) + KEYS.index(key)]


def computed_and_own(entry):
    return entry[1:]


def fainter(entry):
    return entry is not None and float(shown(entry, "opacity")) < float(STORED_OPACITY)


def wait_for_play_and_rest(editor, rest, moved, what, ids=(TARGET,)):
    editor.eventually(lambda: any(moved(frame) for frame in looks(editor)), f"{what} to be seen moving on the canvas")
    editor.eventually(lambda: looks(editor)[-1] == rest, f"{what} to end at the stored look")
    assert look(editor, ids) == rest, f"{what} did not stay at the stored look"
    return looks(editor)


def open_view_menu_item(editor, command):
    editor.page.locator('[data-menu="View"]').click()
    editor.page.locator(f'[role="menu"]:visible [data-command="{command}"]').click()


@pytest.fixture
def heading(harbour):
    clear_motion(harbour, [TARGET])
    harbour.command("node.update", {"id": TARGET, "patch": {"styles": {"opacity": STORED_OPACITY}}})
    harbour.until(lambda site: site["nodes"][TARGET]["styles"].get("opacity") == STORED_OPACITY, "the heading to store an opacity of 0.8")
    select(harbour, TARGET)
    open_motion(harbour)
    return harbour


@pytest.fixture
def playing(heading):
    heading.command("motion.set", {"kind": "reveals", "node": TARGET, "value": LONG})
    heading.until(lambda site: motion_of(site, TARGET).get("reveals", {}).get("delay") == LONG["delay"], "the long reveal to be stored")
    expect(play_again(heading)).to_be_enabled()
    rest = look(heading)
    watch(heading)
    play_again(heading).click()
    heading.eventually(lambda: any(fainter(frame[0]) for frame in looks(heading)), "the long reveal to be playing")
    return heading, rest


def test_a_click_on_fade_up_sets_it_with_one_revision_and_plays_it_once_from_faint_and_lower_to_exactly_the_stored_look(heading):
    rest = look(heading)
    assert shown(rest[0], "opacity") == STORED_OPACITY and shown(rest[0], "translate") == "none"
    before = revision(heading)
    watch(heading)
    preset(heading, "Fade up").click()
    site = heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored")
    assert motion_of(site, TARGET)["reveals"]["from"] == {"opacity": "0", "translate": "0 24px"}
    assert revision(heading) == before + 1
    expect(preset(heading, "Fade up")).to_have_attribute("aria-pressed", "true")
    frames = wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]) and shown(frame[0], "translate") not in ("none", "0px", "0px 0px"), "Fade up")
    lower = [frame[0] for frame in frames if frame[0] != rest[0]]
    assert all(float(shown(entry, "translate").split()[-1].rstrip("px")) >= 0 for entry in lower if shown(entry, "translate") != "none"), "the element moved up instead of rising from below"
    assert revision(heading) == before + 1


def test_play_again_replays_the_motion_and_the_revision_does_not_change(heading):
    rest = look(heading)
    preset(heading, "Fade up").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored")
    expect(play_again(heading)).to_be_enabled()
    heading.eventually(lambda: look(heading) == rest, "the first playback to end")
    before = heading.until(lambda s: True, "the window to show the newest revision")
    count = revision(heading)
    watch(heading)
    play_again(heading).click()
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Play again")
    assert revision(heading) == count
    assert heading.site()["site"] == before
    expect(heading.page.locator("footer.statusbar .status-revision")).to_contain_text(re.compile(rf"\brev {count}\b"))


def test_each_reveal_preset_plays_its_own_movement_and_ends_at_the_stored_look(heading):
    rest = look(heading)
    moves = {
        "Fade in": lambda e: fainter(e),
        "Scale in": lambda e: fainter(e) and shown(e, "scale") not in ("none", "1"),
        "Blur in": lambda e: fainter(e) and "blur" in shown(e, "filter"),
        "Slide from left": lambda e: fainter(e) and shown(e, "translate").startswith("-"),
        "Slide from right": lambda e: fainter(e) and re.match(r"^[1-9]", shown(e, "translate")) is not None,
    }
    for name, moved in moves.items():
        before = revision(heading)
        watch(heading)
        preset(heading, name).click()
        expect(preset(heading, name)).to_have_attribute("aria-pressed", "true")
        assert revision(heading) == before + 1, name
        wait_for_play_and_rest(heading, rest, lambda frame: moved(frame[0]), name)


def test_stagger_children_plays_the_children_one_after_another_and_each_ends_at_its_stored_look(harbour):
    parent = "hero-copy"
    kids = harbour.site()["site"]["nodes"][parent]["children"]
    assert len(kids) >= 3
    clear_motion(harbour, [parent, *kids])
    select(harbour, parent)
    open_motion(harbour)
    rest = look(harbour, kids)
    watch(harbour, kids)
    preset(harbour, "Stagger children").click()
    harbour.until(lambda s: motion_of(s, parent).get("reveals", {}).get("children") is True, "Stagger children to be stored")
    harbour.eventually(lambda: any(all(fainter(entry) or float(shown(entry, "opacity")) < 1 for entry in frame) for frame in looks(harbour)), "the children to start faint")
    harbour.eventually(lambda: looks(harbour)[-1] == rest, "every child to end at its stored look")
    frames = looks(harbour)
    start = next(i for i, frame in enumerate(frames) if all(float(shown(entry, "opacity")) == 0 for entry in frame))
    first_move = [next((i for i in range(start, len(frames)) if float(shown(frames[i][k], "opacity")) > 0), None) for k in range(len(kids))]
    assert None not in first_move, f"a child never moved: {dict(zip(kids, first_move))}"
    assert first_move == sorted(first_move) and first_move[0] < first_move[-1], f"the children did not start one after another: {dict(zip(kids, first_move))}"
    assert look(harbour, kids) == rest


@pytest.mark.parametrize("name, key", [("Spin", "rotate"), ("Float", "translate")])
def test_a_spin_or_float_shows_its_movement_for_a_while_and_stops_where_it_began(heading, name, key):
    rest = look(heading)
    watch(heading)
    preset(heading, name).click()
    heading.until(lambda s: motion_of(s, TARGET).get("loops", {}).get("type") == name.lower(), f"{name} to be stored")
    frames = wait_for_play_and_rest(heading, rest, lambda frame: shown(frame[0], key) not in ("none", shown(rest[0], key)), name)
    assert len({shown(frame[0], key) for frame in frames}) > 2, f"{name} showed no movement"


def test_a_preset_that_cannot_be_shown_on_the_canvas_is_still_set_and_the_row_says_it_plays_in_preview(heading):
    rest = look(heading)
    expect(play_again(heading)).to_be_disabled()
    watch(heading)
    for name in NOT_SHOWN:
        before = revision(heading)
        preset(heading, name).click()
        expect(preset(heading, name)).to_have_attribute("aria-pressed", "true")
        assert revision(heading) == before + 1, name
        expect(note(heading)).to_have_text(PLAYS_IN_PREVIEW)
        expect(play_again(heading)).to_be_disabled()
        preset(heading, name).click()
        expect(preset(heading, name)).to_have_attribute("aria-pressed", "false")
    heading.until(lambda s: not motion_of(s, TARGET), "every effect to be removed again")
    assert all(frame == rest for frame in looks(heading)), "the canvas changed for an effect that only plays in Preview"
    preset(heading, "Fade in").click()
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Fade in")
    expect(note(heading)).to_have_text("")


def test_with_reduced_motion_a_click_sets_the_preset_nothing_plays_play_again_is_off_and_the_row_says_why(heading):
    rest = look(heading)
    watch(heading)
    preset(heading, "Fade in").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade in to be stored")
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Fade in without reduced motion")
    expect(play_again(heading)).to_be_enabled()
    preset(heading, "Fade in").click()
    heading.until(lambda s: not motion_of(s, TARGET), "Fade in to be removed")
    heading.page.emulate_media(reduced_motion="reduce")
    expect(note(heading)).to_have_text(REDUCED)
    watch(heading)
    before = revision(heading)
    preset(heading, "Fade up").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored under reduced motion")
    assert revision(heading) == before + 1
    expect(preset(heading, "Fade up")).to_have_attribute("aria-pressed", "true")
    expect(play_again(heading)).to_be_disabled()
    expect(note(heading)).to_have_text(REDUCED)
    heading.page.evaluate("() => new Promise(done => { let n = 0; const tick = () => ++n > 30 ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); })")
    frames = looks(heading)
    assert frames and all(frame[0] == rest[0] for frame in frames), "the canvas moved under reduced motion"


def test_turning_on_reduced_motion_during_playback_stops_it_at_once_and_focus_stays_off_the_page_body(playing):
    editor, rest = playing
    expect(play_again(editor)).to_be_focused()
    editor.page.emulate_media(reduced_motion="reduce")
    expect(note(editor)).to_have_text(REDUCED)
    assert look(editor) == rest
    expect(play_again(editor)).to_be_disabled()
    assert editor.page.evaluate("document.activeElement !== document.body")
    editor.page.emulate_media(reduced_motion="no-preference")
    expect(note(editor)).to_have_text("")
    expect(play_again(editor)).to_be_enabled()


def _select_other(editor):
    select(editor, "hero-p")


def _tablet(editor):
    editor.page.get_by_role("combobox", name="Responsive breakpoint").select_option("tablet")
    expect(editor.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("tablet")


def _live_preview(editor):
    open_view_menu_item(editor, "view.preview")


def _full_preview(editor):
    editor.page.keyboard.press("Control+Shift+P")
    expect(editor.page.get_by_role("dialog", name="Preview as published")).to_be_visible()


def _undo(editor):
    count = revision(editor)
    editor.undo()
    editor.until(lambda s: "reveals" not in motion_of(s, TARGET), "the undo to remove the long reveal")
    assert revision(editor) != count


def _outside_style(editor):
    editor.command("node.update", {"id": TARGET, "patch": {"styles": {"color": "rgb(200, 0, 0)"}}})
    editor.until(lambda s: s["nodes"][TARGET]["styles"].get("color") == "rgb(200, 0, 0)", "the outside change to be drawn")


def _outside_motion(editor):
    editor.command("motion.set", {"kind": "reveals", "node": TARGET, "value": dict(LONG, duration=9000)})
    editor.until(lambda s: motion_of(s, TARGET)["reveals"]["duration"] == 9000, "the outside motion change to be drawn")


def _page_and_back(editor):
    editor.page_row("p-fares").click()
    expect(editor.page_row("p-fares")).to_have_attribute("aria-current", "page")
    expect(editor.canvas.locator(f'[data-fw-id="{TARGET}"]')).to_be_hidden()
    editor.page_row("home").click()
    expect(editor.page_row("home")).to_have_attribute("aria-current", "page")
    expect(editor.canvas.locator(f'[data-fw-id="{TARGET}"]')).to_be_visible()


@pytest.mark.parametrize("interrupt", [_select_other, _tablet, _live_preview, _full_preview, _undo, _outside_style, _outside_motion, _page_and_back],
                         ids=["selection", "breakpoint", "live-preview", "full-preview", "undo", "outside-style", "outside-motion", "page"])
def test_a_playback_stops_at_once_and_the_page_shows_the_stored_look_when(playing, interrupt):
    editor, rest = playing
    interrupt(editor)
    now = look(editor)[0]
    assert now is not None
    assert computed_and_own(now)[:len(KEYS)] == computed_and_own(rest[0])[:len(KEYS)], f"after the interruption the canvas shows {dict(zip(KEYS, computed_and_own(now)))}"
    assert computed_and_own(now)[len(KEYS):] == computed_and_own(rest[0])[len(KEYS):], f"the play layer left inline values {dict(zip(KEYS, own_values(now)))}"
    editor.page.evaluate("() => new Promise(done => { let n = 0; const tick = () => ++n > 10 ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); })")
    later = look(editor)[0]
    assert computed_and_own(later) == computed_and_own(now), "the playback came back after the interruption"


def own_values(entry):
    return [own(entry, key) for key in KEYS]


def test_another_preset_click_during_playback_shows_the_stored_look_at_once_and_then_plays_the_new_one(playing):
    editor, rest = playing
    held = []
    editor.page.route(OWN_CHANGE, lambda route: held.append(route))
    preset(editor, "Fade in").click()
    editor.eventually(lambda: len(held) == 1, "the Fade in command to be sent")
    assert look(editor) == rest
    watch(editor)
    held.pop().continue_()
    editor.page.unroute(OWN_CHANGE)
    editor.until(lambda s: motion_of(s, TARGET)["reveals"]["from"] == {"opacity": "0"}, "Fade in to be stored")
    frames = wait_for_play_and_rest(editor, rest, lambda frame: fainter(frame[0]), "Fade in")
    assert all(shown(frame[0], "translate") == "none" for frame in frames), "Fade in moved the element"


def test_clicking_the_active_preset_removes_it_and_nothing_plays(heading):
    rest = look(heading)
    watch(heading)
    preset(heading, "Fade up").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored")
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Fade up")
    before = revision(heading)
    watch(heading)
    preset(heading, "Fade up").click()
    heading.until(lambda s: not motion_of(s, TARGET), "Fade up to be removed")
    assert revision(heading) == before + 1
    expect(preset(heading, "Fade up")).to_have_attribute("aria-pressed", "false")
    expect(play_again(heading)).to_be_disabled()
    heading.page.evaluate("() => new Promise(done => { let n = 0; const tick = () => ++n > 30 ? done() : requestAnimationFrame(tick); requestAnimationFrame(tick); })")
    assert all(frame == rest for frame in looks(heading)), "something played after the preset was removed"


def test_blur_in_shows_as_active_after_it_is_clicked(heading):
    preset(heading, "Blur in").click()
    heading.until(lambda s: motion_of(s, TARGET).get("reveals", {}).get("from") == {"filter": "blur(12px)", "opacity": "0"}, "Blur in to be stored")
    expect(preset(heading, "Blur in")).to_have_attribute("aria-pressed", "true")
    expect(presets(heading).locator('[aria-pressed="true"]')).to_have_count(1)


def test_the_canvas_holds_no_script_no_added_style_sheet_and_no_animation_and_keeps_its_policy_while_a_preset_plays(heading):
    rest = look(heading)
    watch(heading)
    heading.page.evaluate("() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))")
    idle = heading.page.evaluate("window.__canvas")[0]
    assert idle[0] == 0 and idle[2] == 0 and idle[3] and idle[4]
    preset(heading, "Fade up").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored")
    frames = wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Fade up")
    canvas = heading.page.evaluate("window.__canvas")
    during = [canvas[i] for i, frame in enumerate(frames[:len(canvas)]) if frame[0] != rest[0]]
    assert during, "no frame of the playback was seen"
    assert all(entry == idle for entry in canvas), f"the canvas document changed: {[entry for entry in canvas if entry != idle][:3]} against {idle}"


def test_nothing_else_in_the_window_moves_while_a_preset_plays_at_four_times_slower_cpu(heading):
    rest = look(heading)
    cdp = heading.page.context.new_cdp_session(heading.page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    heading.page.evaluate("""() => {
      const again = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Play again');
      const parts = [document.querySelector('[role="group"][aria-label="Motion presets"]'), ...document.querySelectorAll('[role="group"][aria-label="Motion presets"] button'),
        again, again.parentElement.querySelector('[aria-live]'), document.querySelector('iframe[title="Website canvas"]'), document.querySelector('.inspector-tag')];
      window.__boxes = [];
      const tick = () => { window.__boxes.push(JSON.stringify(parts.map(p => { const r = p.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }))); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }""")
    watch(heading)
    preset(heading, "Fade up").click()
    heading.until(lambda s: "reveals" in motion_of(s, TARGET), "Fade up to be stored")
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Fade up")
    watch(heading)
    play_again(heading).click()
    wait_for_play_and_rest(heading, rest, lambda frame: fainter(frame[0]), "Play again")
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    boxes = heading.page.evaluate("window.__boxes")
    assert len(boxes) > 5
    assert len(set(boxes)) == 1, f"the window took {len(set(boxes))} different layouts while the preset played"
