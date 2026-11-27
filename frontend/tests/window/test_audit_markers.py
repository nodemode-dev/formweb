import hashlib
import io
import json
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

MARK = re.compile(r"^\d+ issues? on ")
AUDIT = re.compile(r"/api/audit$")
OWN_CHANGE = re.compile(r"/api/(command|batch)$")
SWITCH = "Show audit markers on the page"
ABOUT = "Puts a small marker on each element of this page that has an issue."
WHEN_CLOSED = "Markers show on the page when this dialog is closed."
ON = "Audit markers are on: each element of this page with an issue shows a marker."
OFF = "Audit markers are off."
FAILED = "The audit could not be run, so the audit markers are hidden."
CAP = 200
QUIET = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done))))"
ELEMENT_BOX = """(id) => {
  const frame = document.querySelector('iframe[title="Website canvas"]');
  const outer = frame.getBoundingClientRect();
  const scale = outer.width / frame.offsetWidth;
  const left = outer.left + frame.clientLeft * scale, top = outer.top + frame.clientTop * scale;
  for (const node of frame.contentDocument.querySelectorAll(`[data-fw-id="${CSS.escape(id)}"]`)) {
    const box = node.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    return { left: left + box.left * scale, top: top + box.top * scale, right: left + box.right * scale, bottom: top + box.bottom * scale };
  }
  return null;
}"""
SEEN_AREA = """() => {
  const frame = document.querySelector('iframe[title="Website canvas"]').getBoundingClientRect();
  const stage = document.querySelector('.stage').getBoundingClientRect();
  return { left: Math.max(frame.left, stage.left), top: Math.max(frame.top, stage.top), right: Math.min(frame.right, stage.right), bottom: Math.min(frame.bottom, stage.bottom) };
}"""
FIELD_BOXES = """() => [...document.querySelectorAll('.inspector .field, .toolbar button, .toolbar select, .toolbar input')].filter(node => node.getClientRects().length).map(node => {
  const box = node.getBoundingClientRect();
  return [box.x, box.y, box.width, box.height].map(Math.round).join(',');
})"""
CANVAS_DOCUMENT = """() => {
  const doc = document.querySelector('iframe[title="Website canvas"]').contentDocument;
  return [doc.querySelectorAll('*').length, doc.head.children.length, doc.documentElement.outerHTML];
}"""
AFTER_RESIZE = """(spots) => {
  const elementBox = """ + ELEMENT_BOX + """;
  window.__afterResize = [];
  const look = () => {
    let off = 0, shown = 0;
    for (const [label, id] of Object.entries(spots)) {
      const dot = [...document.querySelectorAll('button[aria-label]')].find(node => node.getAttribute('aria-label') === label);
      if (!dot || !dot.checkVisibility()) continue;
      const box = elementBox(id), at = dot.getBoundingClientRect();
      if (!box) continue;
      shown += 1;
      off = Math.max(off, Math.abs(at.left + at.width / 2 - box.right), Math.abs(at.top + at.height / 2 - box.top));
    }
    window.__afterResize.push({ width: innerWidth, shown, off: Math.round(off * 10) / 10 });
  };
  addEventListener('resize', () => requestAnimationFrame(() => setTimeout(look)));
}"""
RECORD_STATUS = """() => {
  window.__said = [];
  const line = document.querySelector('footer.statusbar .status-message');
  new MutationObserver(() => window.__said.push(line.textContent)).observe(line, { childList: true, characterData: true, subtree: true });
}"""
FOCUSED = "() => { const at = document.activeElement; return { body: at === document.body || at === null, shown: !!at && at.getClientRects().length > 0, label: at ? (at.getAttribute('aria-label') || at.textContent.trim()).slice(0, 60) : '' }; }"

ISSUES = [
    {"command": "node.update", "params": {"id": "hero-b1", "patch": {"attrs": {"href": "#", "src": "https://example.org/picture.png"}, "interactions": [{"trigger": "hover", "action": "toggle-class", "className": "lit"}]}}},
    {"command": "node.update", "params": {"id": "hero-b2", "patch": {"attrs": {"href": ""}}}},
    {"command": "node.update", "params": {"id": "board-link", "patch": {"attrs": {"href": "#"}}}},
    {"command": "page.update", "params": {"id": "home", "patch": {"seo": {"description": ""}}}},
]


class Requests:
    def __init__(self, editor, pattern):
        self.editor = editor
        self.sent = []
        self.done = []
        editor.page.on("request", lambda r: self.sent.append(r) if pattern.search(r.url) else None)
        editor.page.on("requestfinished", lambda r: self.done.append(r) if pattern.search(r.url) else None)
        editor.page.on("requestfailed", lambda r: self.done.append(r) if pattern.search(r.url) else None)

    def answered(self):
        self.editor.eventually(lambda: len(self.done) == len(self.sent), "every request the window sent to be answered")


def quiet(editor, audits):
    """Moves the window's clock past every wait the markers may make before asking again (600 ms at most), then waits until
    a request sent after that is seen, so every audit request the window made by then has been counted, and answered."""
    editor.page.clock.run_for(3000)
    seen = []
    editor.page.on("request", lambda r: seen.append(r) if "after-the-wait" in r.url else None)
    editor.page.evaluate("() => fetch('/api/health?after-the-wait')")
    editor.eventually(lambda: seen, "the request sent after the wait to be seen")
    audits.answered()


def audit_answer(editor):
    with urllib.request.urlopen(editor.base + "/api/audit", timeout=30) as reply:
        return json.loads(reply.read())


def subtree(site, page_id):
    page = next(p for p in site["pages"] if p["id"] == page_id)
    seen, stack = [], [page["root"]]
    while stack:
        node = stack.pop()
        if node in seen or node not in site["nodes"]:
            continue
        seen.append(node)
        stack.extend(reversed(site["nodes"][node]["children"]))
    return seen


def label_for(name, count):
    return f"1 issue on {name}" if count == 1 else f"{count} issues on {name}"


def expected_markers(editor, page_id="home"):
    """The marker names a person should see: one per element of the page named in the audit route's own answer."""
    site = editor.site()["site"]
    nodes = subtree(site, page_id)
    messages = {}
    for issue in audit_answer(editor)["issues"]:
        if issue.get("node") in nodes:
            messages.setdefault(issue["node"], []).append(issue["message"])
    return {label_for(site["nodes"][node]["name"], len(lines)): node for node, lines in messages.items()}, messages


def markers(editor):
    return editor.page.get_by_role("button", name=MARK)


def every_marker(editor):
    return editor.page.get_by_role("button", name=MARK, include_hidden=True)


def marker(editor, name):
    return editor.page.get_by_role("button", name=name, exact=True, include_hidden=True)


def names(locator):
    return sorted(locator.evaluate_all("nodes => nodes.map(node => node.getAttribute('aria-label'))"))


def audit_dialog(editor):
    return editor.page.get_by_role("dialog", name="SEO & accessibility audit")


def run_audit(editor):
    editor.page.locator('[data-cmd="page.audit"]').click()
    dialog = audit_dialog(editor)
    expect(dialog.locator(".empty-note:visible").first).to_contain_text("found")
    return dialog


def close_audit(editor):
    audit_dialog(editor).get_by_role("button", name="Close", exact=True).click()
    expect(audit_dialog(editor)).to_be_hidden()


def open_menu(editor, menu, command):
    editor.page.locator(f'[data-menu="{menu}"]').click()
    return editor.page.locator(f'[role="menu"]:visible [data-command="{command}"]')


def view_item(editor):
    return open_menu(editor, "View", "view.audit-markers")


def make_issues(editor, commands=ISSUES):
    before = editor.site()["site"]
    editor.command("", commands, batch=True)
    editor.changed_from(before)


def turn_on(editor):
    item = view_item(editor)
    expect(item).to_have_attribute("aria-checked", "false")
    item.click()
    expect(editor.status).to_have_text(ON)


def marked(editor):
    """Issues on three elements of Home (one of them far down the page) and one on the page itself, markers on."""
    make_issues(editor)
    turn_on(editor)
    shown, _ = expected_markers(editor)
    expect(marker(editor, "3 issues on Hero b1")).to_be_visible()
    expect(every_marker(editor)).to_have_count(len(shown))
    return shown


def in_view(editor, node):
    box, area = editor.page.evaluate(ELEMENT_BOX, node), editor.page.evaluate(SEEN_AREA)
    return box is not None and area["top"] <= box["top"] and box["top"] + 24 <= area["bottom"] and area["left"] <= box["left"] and box["right"] <= area["right"]


def misplaced(editor, shown):
    """Every visible marker whose centre is not on its element's top right corner within 1 px, whose corner is outside the
    visible canvas, or which reaches out of the stage."""
    area = editor.page.evaluate(SEEN_AREA)
    stage = editor.page.locator(".stage").bounding_box()
    wrong = []
    for name in names(markers(editor)):
        dot = marker(editor, name).bounding_box()
        box = editor.page.evaluate(ELEMENT_BOX, shown[name])
        if dot is None or box is None:
            wrong.append((name, dot, box))
            continue
        centre = (dot["x"] + dot["width"] / 2, dot["y"] + dot["height"] / 2)
        on_corner = abs(centre[0] - box["right"]) <= 1 and abs(centre[1] - box["top"]) <= 1
        corner_seen = area["left"] <= box["right"] <= area["right"] and area["top"] <= box["top"] <= area["bottom"]
        in_stage = stage["x"] <= dot["x"] and dot["x"] + dot["width"] <= stage["x"] + stage["width"] + 0.5 and stage["y"] <= dot["y"] and dot["y"] + dot["height"] <= stage["y"] + stage["height"] + 0.5
        if not (on_corner and corner_seen and in_stage):
            wrong.append({"marker": name, "centre": centre, "corner": (box["right"], box["top"]), "corner seen": corner_seen, "in stage": in_stage})
    return wrong


def placed_at_corners(editor, shown, what):
    try:
        editor.eventually(lambda: markers(editor).count() and not misplaced(editor, shown), f"every marker at its element's top right corner {what}")
    except AssertionError:
        raise AssertionError(f"not every marker is centred on its element's top right corner {what}: {misplaced(editor, shown)} (markers shown: {names(markers(editor))})") from None


def scroll_canvas(editor, until, what):
    frame = editor.page.locator('iframe[title="Website canvas"]').bounding_box()
    stage = editor.page.locator(".stage").bounding_box()
    editor.page.mouse.move(frame["x"] + frame["width"] / 2, max(frame["y"], stage["y"]) + 200)
    for _ in range(40):
        if until():
            return
        editor.page.mouse.wheel(0, 150)
        editor.page.evaluate(QUIET)
    assert until(), f"the canvas never scrolled {what}"


def select(editor, node):
    editor.layer_row(node).click()
    expect(editor.layer_row(node)).to_have_attribute("aria-selected", "true")


def deleting_from_layers_removes_only(editor, changes, node, start):
    """The ordering check behind every 'this key removed nothing': a Delete pressed on a Layers row afterwards must be the
    first and only change the window sends, and it removes the element."""
    select(editor, node)
    expect(editor.layer_row(node)).to_be_focused()
    editor.page.keyboard.press("Delete")
    editor.until(lambda site: node not in site["nodes"], f"{node} to be deleted from the Layers row")
    changes.answered()
    assert len(changes.sent) == 1, f"the window sent {len(changes.sent)} changes, so a key pressed earlier removed something: {[r.post_data for r in changes.sent]}"
    editor.undo()
    editor.restored_to(start)


def design_tab(editor):
    return editor.page.locator("aside.inspector").get_by_role("button", name="Design", exact=True).and_(editor.page.locator(":not([data-command])"))


def export_files(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return {name: hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}


def test_on_a_fresh_profile_no_marker_shows_before_or_after_an_audit_and_the_view_item_has_no_check(harbour):
    make_issues(harbour)
    expect(view_item(harbour)).to_have_attribute("aria-checked", "false")
    harbour.page.keyboard.press("Escape")
    assert markers(harbour).count() == 0
    dialog = run_audit(harbour)
    expect(dialog.get_by_role("checkbox", name=SWITCH)).not_to_be_checked()
    close_audit(harbour)
    harbour.page.evaluate(QUIET)
    assert markers(harbour).count() == 0, f"markers show on a fresh profile: {names(markers(harbour))}"
    shown, _ = expected_markers(harbour)
    turn_on(harbour)
    expect(every_marker(harbour)).to_have_count(len(shown))


def test_the_audit_dialog_switch_says_what_it_does_and_after_close_an_element_with_three_issues_has_one_marker_reading_3(harbour):
    make_issues(harbour)
    _, messages = expected_markers(harbour)
    assert len(messages["hero-b1"]) == 3
    dialog = run_audit(harbour)
    switch = dialog.get_by_role("checkbox", name=SWITCH)
    expect(switch).to_be_visible()
    expect(dialog).to_contain_text(ABOUT)
    expect(dialog).to_contain_text(WHEN_CLOSED)
    switch.check()
    expect(harbour.status).to_have_text(ON)
    assert markers(harbour).count() == 0, "markers show while the audit dialog covers the editor"
    close_audit(harbour)
    three = marker(harbour, "3 issues on Hero b1")
    expect(three).to_be_visible()
    expect(three).to_have_count(1)
    expect(three).to_have_text("3")
    expect(view_item(harbour)).to_have_attribute("aria-checked", "true")


def test_the_markers_of_a_page_are_exactly_the_elements_of_that_page_in_the_audit_answer_with_their_counts(harbour):
    shown = marked(harbour)
    assert len(shown) == 3, shown
    assert names(every_marker(harbour)) == sorted(shown)
    for name in names(markers(harbour)):
        count = int(name.split(" ")[0])
        expect(marker(harbour, name)).to_have_text(str(count))


def test_a_marker_sits_at_its_elements_top_right_corner_through_scroll_window_size_zoom_and_breakpoint(harbour):
    shown = marked(harbour)
    placed_at_corners(harbour, shown, "at first")
    scroll_canvas(harbour, lambda: harbour.page.evaluate(ELEMENT_BOX, "hero-b1")["top"] < harbour.page.evaluate(SEEN_AREA)["top"] + 300, "the hero up")
    placed_at_corners(harbour, shown, "after scrolling the canvas")
    harbour.page.set_viewport_size({"width": 900, "height": 800})
    placed_at_corners(harbour, shown, "in a 900 px window")
    harbour.page.set_viewport_size({"width": 1440, "height": 900})
    width = harbour.page.get_by_role("spinbutton", name="Canvas viewport width in pixels")
    width.fill("1920")
    width.press("Enter")
    harbour.eventually(lambda: harbour.page.locator('iframe[title="Website canvas"]').evaluate("f => f.getBoundingClientRect().width < f.offsetWidth - 1"), "the canvas to be drawn smaller than its width")
    placed_at_corners(harbour, shown, "at 1920 px drawn smaller")
    harbour.page.locator('[data-cmd="view.tablet"]').click()
    expect(harbour.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("tablet")
    placed_at_corners(harbour, shown, "under the tablet breakpoint")


def test_on_a_window_resize_the_first_frame_painted_after_it_already_shows_every_marker_on_its_corner(harbour):
    shown = marked(harbour)
    placed_at_corners(harbour, shown, "at first")
    harbour.page.evaluate(AFTER_RESIZE, shown)
    for width in [1300, 1100, 900, 1200, 1440]:
        count = len(harbour.page.evaluate("() => window.__afterResize"))
        harbour.page.set_viewport_size({"width": width, "height": 900})
        harbour.eventually(lambda: len(harbour.page.evaluate("() => window.__afterResize")) > count, f"a frame to be painted after the resize to {width} px")
        placed_at_corners(harbour, shown, f"at {width} px")
    frames = harbour.page.evaluate("() => window.__afterResize")
    assert any(frame["shown"] for frame in frames), "no marker was shown in any frame after a resize"
    off = [frame for frame in frames if frame["off"] > 1]
    assert off == [], f"in {len(off)} of {len(frames)} frames painted right after a resize a marker was away from its corner: {off[:5]}"


def test_a_marker_whose_element_is_scrolled_out_of_view_is_hidden_not_kept_at_the_edge(harbour):
    shown = marked(harbour)
    expect(marker(harbour, "1 issue on Board link")).to_be_hidden()
    scroll_canvas(harbour, lambda: in_view(harbour, "board-link") and harbour.page.evaluate(ELEMENT_BOX, "hero-b1")["bottom"] < harbour.page.evaluate(SEEN_AREA)["top"], "board-link into view and the hero out")
    expect(marker(harbour, "1 issue on Board link")).to_be_visible()
    expect(marker(harbour, "3 issues on Hero b1")).to_be_hidden()
    expect(marker(harbour, "1 issue on Hero b2")).to_be_hidden()
    placed_at_corners(harbour, shown, "after scrolling the hero away")


def test_turning_markers_on_and_off_moves_no_field_or_toolbar_item_and_adds_nothing_to_the_canvas_document(harbour):
    make_issues(harbour)
    select(harbour, "hero-k")
    harbour.page.evaluate(QUIET)
    fields, page = harbour.page.evaluate(FIELD_BOXES), harbour.page.evaluate(CANVAS_DOCUMENT)
    assert len(fields) > 20
    turn_on(harbour)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    harbour.page.evaluate(QUIET)
    assert harbour.page.evaluate(FIELD_BOXES) == fields, "a field or toolbar item moved when the markers came on"
    assert harbour.page.evaluate(CANVAS_DOCUMENT) == page, "the canvas document changed when the markers came on"
    view_item(harbour).click()
    expect(harbour.status).to_have_text(OFF)
    harbour.page.evaluate(QUIET)
    assert harbour.page.evaluate(FIELD_BOXES) == fields, "a field or toolbar item moved when the markers went off"
    assert harbour.page.evaluate(CANVAS_DOCUMENT) == page, "the canvas document changed when the markers went off"


def test_a_click_on_a_marker_selects_its_element_names_the_issue_and_lists_every_sentence_without_writing(harbour):
    marked(harbour)
    _, messages = expected_markers(harbour)
    select(harbour, "hero-k")
    before = harbour.site()
    marker(harbour, "3 issues on Hero b1").click()
    expect(harbour.layer_row("hero-b1")).to_have_attribute("aria-selected", "true")
    expect(harbour.status).to_contain_text(f"Selected Hero b1: {messages['hero-b1'][0]}")
    listing = harbour.page.get_by_role("group", name="Issues on Hero b1")
    expect(listing).to_be_visible()
    expect(listing.get_by_role("listitem")).to_have_text(messages["hero-b1"])
    expect(audit_dialog(harbour)).to_be_hidden()
    assert harbour.site() == before


def test_enter_and_space_on_a_focused_marker_select_its_element(harbour):
    marked(harbour)
    select(harbour, "hero-k")
    before = harbour.site()
    two = marker(harbour, "1 issue on Hero b2")
    two.focus()
    harbour.page.keyboard.press("Enter")
    expect(harbour.layer_row("hero-b2")).to_have_attribute("aria-selected", "true")
    three = marker(harbour, "3 issues on Hero b1")
    three.focus()
    harbour.page.keyboard.press(" ")
    expect(harbour.layer_row("hero-b1")).to_have_attribute("aria-selected", "true")
    expect(harbour.page.get_by_role("group", name="Issues on Hero b1")).to_be_visible()
    assert harbour.site() == before


def test_pointing_at_a_marker_shows_its_sentences_and_changes_neither_selection_nor_page_nor_revision(harbour):
    marked(harbour)
    _, messages = expected_markers(harbour)
    select(harbour, "hero-k")
    changes = Requests(harbour, OWN_CHANGE)
    before = harbour.site()
    three = marker(harbour, "3 issues on Hero b1")
    box = three.bounding_box()
    harbour.page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=8)
    tip = three.get_attribute("title")
    for line in messages["hero-b1"]:
        assert line in tip, f"the tooltip {tip!r} misses {line!r}"
    harbour.page.evaluate(QUIET)
    expect(harbour.layer_row("hero-k")).to_have_attribute("aria-selected", "true")
    expect(harbour.page_row("home")).to_have_attribute("aria-current", "page")
    expect(harbour.page.get_by_role("group", name="Issues on Hero b1")).to_be_hidden()
    assert changes.sent == [] and harbour.site() == before


def test_an_issue_fixed_from_outside_loses_its_marker_without_running_the_audit(harbour):
    marked(harbour)
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "hero-b2", "patch": {"attrs": {"href": "/routes"}}})
    harbour.changed_from(before)
    assert "hero-b2" not in [i.get("node") for i in audit_answer(harbour)["issues"]]
    expect(marker(harbour, "1 issue on Hero b2")).to_have_count(0)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    expect(audit_dialog(harbour)).to_be_hidden()


def test_a_new_issue_made_from_outside_brings_a_marker_without_running_the_audit(harbour):
    marked(harbour)
    expect(marker(harbour, "1 issue on H nav fares")).to_have_count(0)
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "h-nav-fares", "patch": {"attrs": {"href": "#"}}})
    harbour.changed_from(before)
    shown, _ = expected_markers(harbour)
    assert "1 issue on H nav fares" in shown
    expect(marker(harbour, "1 issue on H nav fares")).to_be_visible()
    expect(every_marker(harbour)).to_have_count(len(shown))
    expect(audit_dialog(harbour)).to_be_hidden()


def test_another_page_shows_only_its_own_markers_also_when_the_earlier_pages_answer_arrives_late(harbour):
    make_issues(harbour, ISSUES + [{"command": "node.update", "params": {"id": "f-nav-routes", "patch": {"attrs": {"href": "#"}}}}])
    turn_on(harbour)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    audits = Requests(harbour, AUDIT)
    held, holding = [], [True]
    harbour.page.route(AUDIT, lambda route: held.append(route) if holding else route.continue_())
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "hero-k", "patch": {"text": "Every crossing, every day"}})
    harbour.changed_from(before)
    harbour.eventually(lambda: held, "the markers to ask the audit again after the change")
    harbour.page_row("p-fares").click()
    expect(harbour.page_row("p-fares")).to_have_attribute("aria-current", "page")
    holding.clear()
    for route in held:
        route.continue_()
    harbour.eventually(lambda: len(audits.sent) >= 2, "the markers to ask again for the page now shown")
    audits.answered()
    shown, _ = expected_markers(harbour, "p-fares")
    assert sorted(shown) == ["1 issue on F nav routes"]
    expect(every_marker(harbour)).to_have_count(1)
    expect(marker(harbour, "1 issue on F nav routes")).to_be_visible()


def test_an_audit_answer_that_arrives_after_the_site_changed_leaves_no_stale_marker(harbour):
    marked(harbour)
    audits = Requests(harbour, AUDIT)
    held = []
    harbour.page.route(AUDIT, lambda route: held.append(route) if not held else route.continue_())
    harbour.page.locator('[data-cmd="page.audit"]').click()
    harbour.eventually(lambda: held, "the audit asked by the Audit button to be held")
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "hero-b2", "patch": {"attrs": {"href": "/routes"}}})
    harbour.changed_from(before)
    expect(marker(harbour, "1 issue on Hero b2")).to_have_count(0)
    held[0].continue_()
    expect(audit_dialog(harbour)).to_be_visible()
    harbour.page.evaluate(QUIET)
    audits.answered()
    close_audit(harbour)
    shown, _ = expected_markers(harbour)
    assert "1 issue on Hero b2" not in shown
    harbour.page.evaluate(QUIET)
    assert names(every_marker(harbour)) == sorted(shown), f"stale markers after the late answer: {names(every_marker(harbour))}"


def live_preview(editor):
    open_menu(editor, "View", "view.preview").click()
    expect(editor.page.get_by_role("button", name="Back to design")).to_be_visible()
    yield
    editor.page.get_by_role("button", name="Back to design").click()
    expect(editor.page.get_by_role("button", name="Back to design")).to_be_hidden()


def full_preview(editor):
    editor.page.locator('[data-cmd="view.preview-full"]').click()
    dialog = editor.page.get_by_role("dialog", name="Preview as published")
    expect(dialog).to_be_visible()
    yield
    dialog.get_by_role("button", name="Close").click()
    expect(dialog).to_be_hidden()


def preferences(editor):
    open_menu(editor, "Edit", "edit.settings").click()
    dialog = editor.page.get_by_role("dialog", name="Preferences")
    expect(dialog).to_be_visible()
    yield
    editor.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()


def trial(editor):
    select(editor, "hero-h")
    editor.page.get_by_role("group", name="Text alignment", exact=True).get_by_role("button", name="Center", exact=True).click()
    bar = editor.page.locator("[data-try-bar]")
    expect(bar).to_contain_text("Trying: Center")
    yield
    bar.get_by_role("button", name=re.compile(r"^Revert\b")).click()
    expect(bar).to_be_hidden()


def text_editing(editor):
    editor.canvas.locator('[data-fw-id="hero-h"]').dblclick()
    expect(editor.canvas.locator('[data-fw-text="hero-h"][contenteditable="true"]')).to_be_visible()
    yield
    editor.layer_row("hero-k").click()
    expect(editor.canvas.locator('[contenteditable="true"]')).to_have_count(0)


def canvas_drag(editor):
    editor.canvas.locator('[data-fw-id="hero-h"]').click()
    expect(editor.layer_row("hero-h")).to_have_attribute("aria-selected", "true")
    box = editor.canvas.locator('[data-fw-id="hero-h"]').bounding_box()
    below = editor.canvas.locator('[data-fw-id="hero-p"]').bounding_box()
    pointer = editor.canvas_pointer()
    pointer.move(box["x"] + 20, box["y"] + box["height"] / 2)
    pointer.down()
    pointer.move(box["x"] + 20, below["y"] + below["height"] - 3, steps=15, held=True)
    expect(editor.page.locator("body")).to_have_class(re.compile(r"\bfw-canvas-dragging\b"))
    yield
    editor.page.keyboard.press("Escape")
    pointer.up()
    expect(editor.status).to_have_text("Drag cancelled. Nothing moved.")


@pytest.mark.parametrize("state", [live_preview, full_preview, preferences, trial, text_editing, canvas_drag], ids=["live-preview", "full-preview", "dialog", "trial", "text-editing", "canvas-drag"])
def test_markers_hide_while_the_page_is_previewed_dragged_tried_edited_or_covered_and_come_back_after(harbour, state):
    marked(harbour)
    count = markers(harbour).count()
    assert count == 2
    steps = state(harbour)
    next(steps)
    expect(markers(harbour)).to_have_count(0)
    with pytest.raises(StopIteration):
        next(steps)
    expect(markers(harbour)).to_have_count(count)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()


def test_the_view_menu_turns_every_marker_off_at_once_and_back_on_and_the_status_line_says_each(harbour):
    marked(harbour)
    item = view_item(harbour)
    expect(item).to_have_attribute("aria-checked", "true")
    item.click()
    expect(harbour.status).to_have_text(OFF)
    expect(markers(harbour)).to_have_count(0)
    expect(view_item(harbour)).to_have_attribute("aria-checked", "false")
    harbour.page.keyboard.press("Escape")
    dialog = run_audit(harbour)
    expect(dialog.get_by_role("checkbox", name=SWITCH)).not_to_be_checked()
    close_audit(harbour)
    view_item(harbour).click()
    expect(harbour.status).to_have_text(ON)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()


def test_the_choice_survives_a_reload_and_is_kept_in_neither_the_site_nor_the_export(harbour):
    make_issues(harbour)
    before = harbour.site()
    files = export_files(harbour)
    turn_on(harbour)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    assert harbour.site() == before
    assert export_files(harbour) == files
    assert "audit-markers" not in json.dumps(before)
    harbour.page.reload()
    harbour.page.get_by_role("button", name="Back to Editor").click()
    harbour.page_row("home").wait_for()
    shown, _ = expected_markers(harbour)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    expect(every_marker(harbour)).to_have_count(len(shown))
    expect(view_item(harbour)).to_have_attribute("aria-checked", "true")


def test_reset_all_preferences_turns_the_markers_off(harbour):
    marked(harbour)
    open_menu(harbour, "Edit", "edit.settings").click()
    dialog = harbour.page.get_by_role("dialog", name="Preferences")
    dialog.get_by_role("tab", name="General").click()
    dialog.get_by_role("button", name="Reset All Preferences...").click()
    with harbour.page.expect_navigation():
        dialog.get_by_role("button", name="Reset", exact=True).click()
    harbour.page.get_by_role("button", name="Back to Editor").click()
    harbour.page_row("home").wait_for()
    harbour.canvas.locator('[data-fw-id="hero-b1"]').wait_for()
    expect(view_item(harbour)).to_have_attribute("aria-checked", "false")
    harbour.page.keyboard.press("Escape")
    dialog = run_audit(harbour)
    expect(dialog.get_by_role("checkbox", name=SWITCH)).not_to_be_checked()
    close_audit(harbour)
    harbour.page.evaluate(QUIET)
    assert markers(harbour).count() == 0, f"markers show after Reset All Preferences: {names(markers(harbour))}"


def test_with_markers_off_a_change_to_the_site_sends_no_audit_request(harbour):
    harbour.page.clock.install()
    marked(harbour)
    audits = Requests(harbour, AUDIT)
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "hero-b2", "patch": {"attrs": {"href": "/routes"}}})
    harbour.changed_from(before)
    quiet(harbour, audits)
    assert len(audits.sent) == 1, f"with markers on, one change sent {len(audits.sent)} audit requests"
    view_item(harbour).click()
    expect(harbour.status).to_have_text(OFF)
    before = harbour.site()["site"]
    harbour.command("node.update", {"id": "hero-b2", "patch": {"attrs": {"href": ""}}})
    harbour.changed_from(before)
    quiet(harbour, audits)
    assert len(audits.sent) == 1, f"with markers off, a change sent {len(audits.sent) - 1} audit requests"
    assert markers(harbour).count() == 0


def failing(editor):
    editor.page.route(AUDIT, lambda route: route.fulfill(status=500, content_type="application/json", body='{"detail": "the audit failed"}'))


def outside_rename(editor, name):
    before = editor.site()["site"]
    editor.command("node.update", {"id": "hero-k", "patch": {"name": name}})
    editor.changed_from(before)


def test_a_failed_audit_hides_the_markers_says_so_once_and_does_not_ask_in_a_loop(harbour):
    harbour.page.clock.install()
    marked(harbour)
    audits = Requests(harbour, AUDIT)
    harbour.page.evaluate(RECORD_STATUS)
    failing(harbour)
    outside_rename(harbour, "Kicker one")
    expect(markers(harbour)).to_have_count(0)
    expect(harbour.status).to_have_text(FAILED)
    quiet(harbour, audits)
    assert len(audits.sent) == 1
    open_menu(harbour, "View", "view.design-controls").click()
    expect(harbour.status).not_to_have_text(FAILED)
    open_menu(harbour, "View", "view.design-controls").click()
    outside_rename(harbour, "Kicker two")
    quiet(harbour, audits)
    assert len(audits.sent) == 2, f"two changes with a failing audit sent {len(audits.sent)} audit requests"
    assert harbour.page.evaluate("() => window.__said").count(FAILED) == 1, "the failure was said more than once"
    expect(markers(harbour)).to_have_count(0)
    select(harbour, "hero-p")
    harbour.page.unroute(AUDIT)
    outside_rename(harbour, "Kicker three")
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()


def test_after_a_failed_audit_selection_clicks_ask_nothing_and_the_next_site_change_asks_exactly_once(harbour):
    harbour.page.clock.install()
    marked(harbour)
    audits = Requests(harbour, AUDIT)
    failing(harbour)
    outside_rename(harbour, "Kicker one")
    expect(markers(harbour)).to_have_count(0)
    quiet(harbour, audits)
    assert len(audits.sent) == 1
    for node in ["hero-h", "hero-p", "hero-k", "hero-h", "hero-p", "status-line", "hero-k", "hero-h"]:
        harbour.canvas.locator(f'[data-fw-id="{node}"]').click()
        expect(harbour.layer_row(node)).to_have_attribute("aria-selected", "true")
    quiet(harbour, audits)
    assert len(audits.sent) == 1, f"selection clicks after a failure sent {len(audits.sent) - 1} audit requests"
    outside_rename(harbour, "Kicker two")
    quiet(harbour, audits)
    assert len(audits.sent) == 2, f"one site change after a failure sent {len(audits.sent) - 1} audit requests"


def test_an_element_removed_from_outside_while_its_marker_has_focus_loses_the_marker_and_focus_goes_to_the_inspector_tab(harbour):
    errors = []
    harbour.page.on("pageerror", lambda error: errors.append(str(error)))
    marked(harbour)
    two = marker(harbour, "1 issue on Hero b2")
    two.focus()
    expect(two).to_be_focused()
    before = harbour.site()["site"]
    harbour.command("node.remove", {"id": "hero-b2"})
    harbour.changed_from(before)
    expect(marker(harbour, "1 issue on Hero b2")).to_have_count(0)
    expect(design_tab(harbour)).to_be_focused()
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    assert errors == []


def test_when_the_element_of_a_clicked_marker_is_removed_from_outside_nothing_is_left_saying_it_is_selected(harbour):
    errors = []
    harbour.page.on("pageerror", lambda error: errors.append(str(error)))
    marked(harbour)
    marker(harbour, "1 issue on Hero b2").click()
    expect(harbour.status).to_contain_text("Selected Hero b2:")
    notice = harbour.page.locator(".fw-notice")
    expect(notice).to_contain_text("Selected Hero b2:")
    before = harbour.site()["site"]
    harbour.command("node.remove", {"id": "hero-b2"})
    harbour.changed_from(before)
    expect(marker(harbour, "1 issue on Hero b2")).to_have_count(0)
    expect(harbour.status).not_to_contain_text("Hero b2")
    expect(notice.filter(has_text="Hero b2")).to_be_hidden()
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    assert errors == []


def test_deleting_the_selected_element_removes_its_marker_and_undo_brings_it_back(harbour):
    marked(harbour)
    start = harbour.site()["site"]
    marker(harbour, "1 issue on Hero b2").click()
    select(harbour, "hero-b2")
    harbour.page.keyboard.press("Delete")
    harbour.until(lambda site: "hero-b2" not in site["nodes"], "hero-b2 to be deleted")
    expect(marker(harbour, "1 issue on Hero b2")).to_have_count(0)
    harbour.undo()
    harbour.restored_to(start)
    expect(marker(harbour, "1 issue on Hero b2")).to_be_visible()


def test_delete_and_backspace_on_a_focused_marker_remove_nothing(harbour):
    marked(harbour)
    start = harbour.site()["site"]
    three = marker(harbour, "3 issues on Hero b1")
    three.click()
    expect(harbour.layer_row("hero-b1")).to_have_attribute("aria-selected", "true")
    expect(three).to_be_focused()
    changes = Requests(harbour, OWN_CHANGE)
    harbour.page.keyboard.press("Delete")
    harbour.page.keyboard.press("Backspace")
    expect(three).to_be_visible()
    deleting_from_layers_removes_only(harbour, changes, "hero-b1", start)


@pytest.mark.parametrize("dock", ["open", "collapsed"])
@pytest.mark.parametrize("hide", ["scrolled-away", "fixed-from-outside"])
def test_when_a_focused_marker_hides_focus_lands_on_a_shown_control_and_backspace_removes_nothing(harbour, dock, hide):
    marked(harbour)
    design = design_tab(harbour)
    if dock == "collapsed":
        harbour.page.keyboard.press("Control+BracketRight")
        expect(design).to_be_hidden()
    select(harbour, "hero-k")
    start = harbour.site()["site"]
    three = marker(harbour, "3 issues on Hero b1")
    three.focus()
    expect(three).to_be_focused()
    changes = Requests(harbour, OWN_CHANGE)
    if hide == "scrolled-away":
        scroll_canvas(harbour, lambda: harbour.page.evaluate(ELEMENT_BOX, "hero-b1")["bottom"] < harbour.page.evaluate(SEEN_AREA)["top"], "the hero out of view")
        expect(three).to_be_hidden()
    else:
        harbour.command("node.update", {"id": "hero-b1", "patch": {"attrs": {"href": "/fares", "src": None}, "interactions": []}})
        start = harbour.changed_from(start)
        expect(three).to_have_count(0)
    focus = harbour.page.evaluate(FOCUSED)
    assert not focus["body"] and focus["shown"], f"focus went to {focus} when the focused marker hid"
    if dock == "open":
        expect(design).to_be_focused()
    harbour.page.keyboard.press("Backspace")
    harbour.page.keyboard.press("Delete")
    expect(harbour.layer_row("hero-k")).to_be_visible()
    deleting_from_layers_removes_only(harbour, changes, "hero-k", start)


def test_issues_without_an_element_are_counted_in_the_dialog_and_get_no_marker(harbour):
    make_issues(harbour, ISSUES + [{"command": "page.update", "params": {"id": "p-fares", "patch": {"seo": {"description": ""}}}}])
    loose = [i for i in audit_answer(harbour)["issues"] if not i.get("node")]
    assert len(loose) == 2, loose
    dialog = run_audit(harbour)
    dialog.get_by_role("checkbox", name=SWITCH).check()
    expect(dialog).to_contain_text("2 issues have no element, so they have no marker.")
    close_audit(harbour)
    shown, _ = expected_markers(harbour)
    expect(every_marker(harbour)).to_have_count(len(shown))
    expect(harbour.page.get_by_role("button", name=re.compile(r"issues? on Home$"), include_hidden=True)).to_have_count(0)


def test_with_more_than_200_elements_with_issues_200_markers_are_drawn_and_the_dialog_says_so(harbour):
    links = [{"command": "node.add", "params": {"parent": "root", "node": {"id": f"dead-{i}", "tag": "a", "name": f"Dead {i}", "text": "Dead link", "children": [], "attrs": {"href": "#"}, "styles": {}, "breakpoints": {}}}} for i in range(240)]
    make_issues(harbour, ISSUES + links)
    shown, _ = expected_markers(harbour)
    assert len(shown) > CAP
    turn_on(harbour)
    expect(marker(harbour, "3 issues on Hero b1")).to_be_visible()
    expect(every_marker(harbour)).to_have_count(CAP)
    dialog = run_audit(harbour)
    expect(dialog).to_contain_text(f"Markers are drawn on the first {CAP} of {len(shown)} elements with issues on this page.")


def test_an_element_repeated_by_a_collection_has_one_marker_on_its_first_copy(editor):
    editor.open_demo("wenlow-type-day", "speakers")
    make_issues(editor, [
        {"command": "node.update", "params": {"id": "hm-spk-card", "patch": {"binding": {"collection": "speakers"}}}},
        {"command": "node.update", "params": {"id": "hm-spk-img", "patch": {"attrs": {"alt": None}}}},
    ])
    copies = editor.canvas.locator('img[data-fw-id="hm-spk-img"]')
    expect(copies).not_to_have_count(0)
    assert copies.count() > 1
    shown, messages = expected_markers(editor)
    assert list(messages) == ["hm-spk-img"]
    turn_on(editor)
    one = marker(editor, "1 issue on Hm spk img")
    expect(one).to_have_count(1)
    scroll_canvas(editor, lambda: in_view(editor, "hm-spk-img"), "the first speaker picture into view")
    expect(one).to_be_visible()
    placed_at_corners(editor, shown, "on the first copy")


@pytest.mark.parametrize("command", ["view.tablet", "file.export"])
def test_after_a_click_on_a_toolbar_button_delete_and_backspace_remove_nothing(harbour, command):
    select(harbour, "hero-k")
    start = harbour.site()["site"]
    proof = Requests(harbour, OWN_CHANGE)
    deleting_from_layers_removes_only(harbour, proof, "hero-k", start)
    select(harbour, "hero-k")
    toolbar_button = harbour.page.locator(f'.toolbar [data-cmd="{command}"]')
    if command == "file.export":
        with harbour.page.expect_download():
            toolbar_button.click()
        expect(harbour.status).to_contain_text("Static site exported")
    else:
        toolbar_button.click()
        expect(harbour.page.get_by_role("combobox", name="Responsive breakpoint")).to_have_value("tablet")
    changes = Requests(harbour, OWN_CHANGE)
    harbour.page.keyboard.press("Backspace")
    harbour.page.keyboard.press("Delete")
    expect(harbour.layer_row("hero-k")).to_be_visible()
    deleting_from_layers_removes_only(harbour, changes, "hero-k", start)


def test_with_a_layers_row_focused_delete_removes_the_selected_element_in_one_undo_step(harbour):
    select(harbour, "hero-p")
    start = harbour.site()["site"]
    changes = Requests(harbour, OWN_CHANGE)
    deleting_from_layers_removes_only(harbour, changes, "hero-p", start)
    expect(harbour.layer_row("hero-p")).to_be_visible()


def test_after_select_in_the_audit_opened_from_the_page_menu_backspace_removes_nothing(harbour):
    make_issues(harbour)
    start = harbour.site()["site"]
    open_menu(harbour, "Page", "page.audit").click()
    dialog = audit_dialog(harbour)
    expect(dialog.locator(".empty-note:visible").first).to_contain_text("found")
    dialog.locator('.audit-row[data-node="hero-b2"]').get_by_role("button", name="Select").click()
    expect(dialog).to_be_hidden()
    expect(harbour.layer_row("hero-b2")).to_have_attribute("aria-selected", "true")
    changes = Requests(harbour, OWN_CHANGE)
    harbour.page.keyboard.press("Backspace")
    harbour.page.keyboard.press("Delete")
    expect(harbour.layer_row("hero-b2")).to_be_visible()
    deleting_from_layers_removes_only(harbour, changes, "hero-b2", start)
