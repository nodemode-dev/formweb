import pytest
from playwright.sync_api import expect

WIDTHS = (900, 1024, 1280, 1440, 1920)
PAGE_NAME = "Harbour ferries winter timetable and crossing notices for island residents"
PAGE_SLUG = "winter-2026/island-residents/ferry-timetable-and-crossing-notices-for-the-outer-isles"
DEEP = "h-lm-c"
DEEP_NAME = "Lighthouse beam circle of the harbour logo"
OTHERS = ("hero-b1", "h-nav-fares", "hero-h", "hero-k")
TWO_FRAMES = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))"

NAME = """nav => {
  const bar = nav.parentElement;
  const crumb = nav.querySelector('[aria-current="true"]');
  if (!crumb) return null;
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
  const inner = el => { const r = el.getBoundingClientRect(); return { left: r.left + el.clientLeft, right: r.left + el.clientLeft + el.clientWidth }; };
  const label = el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
  const walker = document.createTreeWalker(crumb, NodeFilter.SHOW_TEXT);
  let text = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim()) { text = node; break; }
  if (!text) return { crumb: box(crumb), text: null };
  const range = document.createRange();
  range.selectNodeContents(text);
  const holder = text.parentElement;
  const style = getComputedStyle(holder);
  const clippers = [];
  for (let el = holder; el && el !== bar.parentElement; el = el.parentElement) {
    if (getComputedStyle(el).overflowX !== 'visible') clippers.push({ name: label(el), self: el === holder, box: box(el), inner: inner(el) });
  }
  return { crumb: box(crumb), text: text.textContent, glyphs: box(range), holder: { name: label(holder), tag: holder.tagName, box: box(holder), display: style.display, overflow: style.overflowX, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace }, clippers };
}"""

BAR = """nav => {
  const bar = nav.parentElement;
  const shown = el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const label = el => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : '');
  const box = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const children = [...bar.children].map((el, i) => ({ name: i + ' ' + label(el), shown: shown(el), box: box(el) }));
  const crumbs = [...nav.children].filter(shown).map(el => ({ name: el.textContent.trim() || el.getAttribute('aria-label'), box: box(el) }));
  return { bar: box(bar), scroll: bar.scrollWidth, client: bar.clientWidth, nav: box(nav), children, crumbs };
}"""


def nav(editor):
    return editor.page.locator('nav[aria-label="Selection path"]')


def current_crumb(editor):
    return nav(editor).locator('[aria-current="true"]')


def set_panels(editor, state):
    workspace = editor.page.locator("[data-left][data-right]").first
    for side, key in (("left", "Control+["), ("right", "Control+]")):
        if workspace.get_attribute(f"data-{side}") != state:
            editor.page.keyboard.press(key)
            expect(workspace).to_have_attribute(f"data-{side}", state)


def select_on_canvas(editor, key, clicked=None):
    editor.canvas.locator(f'[data-fw-id="{clicked or key}"]').click()
    expect(current_crumb(editor)).to_have_attribute("data-key", key)


def select_deep(editor):
    select_on_canvas(editor, DEEP, clicked="h-logo-mark")
    expect(current_crumb(editor)).to_contain_text(DEEP_NAME)


def heads(editor):
    for width in WIDTHS:
        for panels in ("open", "collapsed"):
            editor.page.set_viewport_size({"width": width, "height": 900})
            set_panels(editor, panels)
            editor.page.evaluate(TWO_FRAMES)
            yield f"{width} px wide, both panels {panels}"


def overlap(a, b):
    return min(a[2], b[2]) - max(a[0], b[0]) > 0.5 and min(a[3], b[3]) - max(a[1], b[1]) > 0.5


@pytest.fixture
def long_page(harbour):
    site = harbour.site()["site"]
    home = next(p for p in site["pages"] if p["root"] == "root")
    harbour.command("page.update", {"id": home["id"], "patch": {"name": PAGE_NAME, "slug": PAGE_SLUG}})
    harbour.command("node.update", {"id": DEEP, "patch": {"name": DEEP_NAME}})
    harbour.until(lambda s: next(p for p in s["pages"] if p["root"] == "root")["name"] == PAGE_NAME and s["nodes"][DEEP]["name"] == DEEP_NAME, "the long page name, address and element name")
    select_deep(harbour)
    return harbour


def test_the_selected_name_in_the_path_starts_at_its_first_letter_and_is_whole_or_ends_in_a_drawn_ellipsis_at_every_width(long_page):
    for head in heads(long_page):
        seen = nav(long_page).evaluate(NAME)
        assert seen, f"{head}: the path has no current crumb"
        assert seen["crumb"]["width"] > 0 and seen["crumb"]["height"] > 0, f"{head}: the selected element's crumb is not displayed: {seen['crumb']}"
        assert seen["text"] and seen["text"].strip() == DEEP_NAME, f"{head}: the crumb reads {seen['text']!r}"
        glyphs = seen["glyphs"]
        assert glyphs["width"] > 0, f"{head}: the selected name has no box"
        for clip in seen["clippers"]:
            assert glyphs["left"] >= clip["inner"]["left"] - 0.5, f"{head}: the start of {DEEP_NAME!r} is cut off by {clip['name']} (text starts at {glyphs['left']:.1f}, the box at {clip['inner']['left']:.1f})"
        cut = [clip for clip in seen["clippers"] if glyphs["right"] > clip["inner"]["right"] + 0.5]
        if not cut:
            continue
        holder = seen["holder"]
        assert holder["tag"] != "BUTTON", f"{head}: the name is a button's own text, cut by {[c['name'] for c in cut]}; Chromium draws no ellipsis there"
        assert (holder["overflow"], holder["textOverflow"], holder["whiteSpace"]) == ("hidden", "ellipsis", "nowrap"), f"{head}: {holder['name']} cuts the name without an ellipsis: {holder}"
        assert holder["display"] != "inline", f"{head}: {holder['name']} is inline, where no ellipsis is drawn"
        for clip in seen["clippers"]:
            if not clip["self"]:
                assert holder["box"]["left"] >= clip["inner"]["left"] - 0.5 and holder["box"]["right"] <= clip["inner"]["right"] + 0.5, f"{head}: {clip['name']} cuts the name box itself, so its ellipsis is not seen: {holder['box']} in {clip['inner']}"


def test_nothing_in_the_bar_above_the_canvas_overflows_it_or_overlaps_a_neighbour_at_every_width(long_page):
    for head in heads(long_page):
        seen = nav(long_page).evaluate(BAR)
        bar = seen["bar"]
        assert seen["scroll"] <= seen["client"], f"{head}: the bar's content is {seen['scroll']} px wide in {seen['client']} px"
        shown = [c for c in seen["children"] if c["shown"]]
        for child in shown:
            box = child["box"]
            assert box[0] >= bar[0] - 0.5 and box[2] <= bar[2] + 0.5, f"{head}: {child['name']} {box} sticks out of the bar {bar}"
        for i, a in enumerate(shown):
            for b in shown[i + 1:]:
                assert not overlap(a["box"], b["box"]), f"{head}: {a['name']} {a['box']} overlaps {b['name']} {b['box']}"
        for i, a in enumerate(seen["crumbs"]):
            assert a["box"][0] >= seen["nav"][0] - 0.5 and a["box"][2] <= seen["nav"][2] + 0.5, f"{head}: crumb {a['name']!r} {a['box']} sticks out of the path {seen['nav']}"
            for b in seen["crumbs"][i + 1:]:
                assert not overlap(a["box"], b["box"]), f"{head}: crumb {a['name']!r} overlaps {b['name']!r}"


def test_nothing_in_the_bar_above_the_canvas_moves_when_the_selection_changes(long_page):
    for head in heads(long_page):
        select_deep(long_page)
        first = nav(long_page).evaluate(BAR)
        for key in OTHERS:
            select_on_canvas(long_page, key)
            long_page.page.evaluate(TWO_FRAMES)
            now = nav(long_page).evaluate(BAR)
            assert now["bar"] == first["bar"], f"{head}: the bar moved after selecting {key}"
            for before, after in zip(first["children"], now["children"]):
                assert (after["shown"], after["box"]) == (before["shown"], before["box"]), f"{head}: {before['name']} moved after selecting {key}: {before['box']} then {after['box']}"


def test_a_click_on_a_middle_crumb_selects_that_ancestor(long_page):
    long_page.page.set_viewport_size({"width": 1920, "height": 900})
    set_panels(long_page, "collapsed")
    select_on_canvas(long_page, "h-nav-fares")
    middle = nav(long_page).locator("[data-key]:visible").evaluate_all("cs => cs.map(c => c.dataset.key)")
    middle = [key for key in middle[1:] if key.strip() != "more" and key != "h-nav-fares"]
    assert middle, "no middle crumb is shown at 1920 px with both panels closed"
    target = middle[-1]
    crumb = nav(long_page).locator(f'[data-key="{target}"]')
    name = crumb.inner_text().strip()
    crumb.click()
    expect(current_crumb(long_page)).to_have_attribute("data-key", target)
    set_panels(long_page, "open")
    expect(long_page.page.locator(".inspector-name")).to_have_text(name)
