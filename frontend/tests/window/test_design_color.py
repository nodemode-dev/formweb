import colorsys
import io
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
QUIET = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done))))"
NODE = "h-logo-word"
HEX = re.compile(r"^#[0-9a-f]{6}(?:[0-9a-f]{2})?$")
COMPUTED = """([value, key]) => {
  const probe = document.createElement('span');
  probe.style.setProperty(key, value);
  document.body.append(probe);
  const seen = getComputedStyle(probe).getPropertyValue(key);
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


def field(editor, key):
    return editor.page.locator(f'input[data-style="{key}"]')


def styles(site, node=NODE):
    return site["nodes"][node]["styles"]


def stored(editor, key, node=NODE):
    return styles(editor.site()["site"], node).get(key)


def type_value(editor, key, value):
    box = field(editor, key)
    box.fill(value)
    box.press("Enter")


def typed(editor, key, value, node=NODE):
    type_value(editor, key, value)
    site = editor.until(lambda s: styles(s, node).get(key) == value, f"{key} {value} to be stored")
    field(editor, key).blur()
    return site


def run(editor, command):
    editor.page.evaluate(f"window.formweb.run('{command}')")


def swatch(editor, label):
    return editor.page.get_by_role("button", name=f"Choose {label}", exact=True)


def chip_paint(editor, label):
    return swatch(editor, label).locator(":scope > span").evaluate("chip => getComputedStyle(chip).backgroundColor")


def picker(editor, label):
    return editor.page.get_by_role("dialog", name=f"Color picker for {label}")


def part(editor, role, name):
    return editor.page.get_by_role(role, name=name, exact=True)


def square(editor, label):
    return part(editor, "slider", f"Saturation and brightness of {label}")


def entry(editor, label):
    return part(editor, "textbox", f"Hex or rgb() value of {label}")


def open_picker(editor, label):
    swatch(editor, label).click()
    dialog = picker(editor, label)
    expect(dialog).to_be_visible()
    return dialog


def canvas_style(editor, key, node=NODE):
    return editor.canvas.locator(f'[data-fw-id="{node}"]').evaluate(f"el => getComputedStyle(el).getPropertyValue('{key}')")


def browser_reads(editor, value, key="color"):
    return editor.page.evaluate(COMPUTED, [value, key])


def hsv_of(hex_text):
    r, g, b = (int(hex_text[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hsv(r, g, b)


def focus_inside(dialog):
    return dialog.evaluate("(box) => box.contains(document.activeElement)")


def node_count(editor):
    return len(editor.site()["site"]["nodes"])


def drag_in(editor, target, start, to, steps=8):
    target.scroll_into_view_if_needed()
    box = target.bounding_box()
    pointer = editor.canvas_pointer()
    at = lambda x, y: (box["x"] + box["width"] * x, box["y"] + box["height"] * y)
    pointer.move(*at(*start))
    pointer.down()
    pointer.move(*at(*to), steps=steps, held=True)
    return pointer, at


def export_css(editor):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    return "\n".join(archive.read(name).decode("utf-8") for name in archive.namelist() if name.endswith(".css"))


def fields_show_state(editor, node):
    site = editor.until(lambda s: True, "the window to show the newest revision")
    own = styles(site, node)
    for key in ("color", "background"):
        expect(field(editor, key)).to_have_value(own.get(key, ""))


def hold_first_change(editor):
    held = []
    editor.page.route(OWN_CHANGE, lambda route: route.continue_() if held else held.append((route, route.fetch())))
    return held


@pytest.fixture
def word(harbour):
    select(harbour, NODE)
    return harbour


def test_color_and_background_each_show_a_swatch_painted_with_the_explicit_color(word):
    typed(word, "color", "#3366cc")
    typed(word, "background", "rgb(10, 20, 30)")
    expect(swatch(word, "Color")).to_be_visible()
    expect(swatch(word, "Background")).to_be_visible()
    word.eventually(lambda: chip_paint(word, "Color") == "rgb(51, 102, 204)", "the Color swatch to show #3366cc")
    word.eventually(lambda: chip_paint(word, "Background") == "rgb(10, 20, 30)", "the Background swatch to show rgb(10, 20, 30)")


@pytest.mark.parametrize("label, other", [("Background", "Color"), ("Color", "Background")])
def test_the_swatch_opens_one_picker_named_for_its_field_and_every_part_carries_that_name(word, label, other):
    dialog = open_picker(word, label)
    expect(word.page.get_by_role("dialog", name=re.compile(r"^Color picker for "))).to_have_count(1)
    expect(swatch(word, label)).to_have_attribute("aria-expanded", "true")
    for role, name in (("slider", "Saturation and brightness of {}"), ("slider", "Hue of {}"), ("slider", "Opacity of {}"), ("textbox", "Hex or rgb() value of {}")):
        expect(dialog.get_by_role(role, name=name.format(label), exact=True)).to_be_visible()
        expect(dialog.get_by_role(role, name=name.format(other), exact=True)).to_have_count(0)
    expect(dialog.get_by_role("button", name="No color", exact=True)).to_be_visible()


def test_a_drag_in_the_square_shows_the_pending_color_stores_one_lowercase_hex_on_release_and_one_undo_restores(word):
    before = word.site()
    changes = Changes(word)
    open_picker(word, "Color")
    pointer, at = drag_in(word, square(word, "Color"), (0.5, 0.5), (0.8, 0.25))
    word.eventually(lambda: HEX.match(field(word, "color").input_value() or ""), "the input to show the pending color")
    pending = field(word, "color").input_value()
    pointer.move(*at(0.85, 0.2), steps=3, held=True)
    word.eventually(lambda: field(word, "color").input_value() != pending, "the input to follow the drag")
    pending = field(word, "color").input_value()
    assert changes.sent == [], "a change was sent while the drag was still going on"
    assert word.site() == before
    pointer.up()
    after = word.changed_from(before["site"])
    changes.settled()
    value = styles(after).get("color")
    assert HEX.match(value), f"the stored color {value!r} is not lowercase #rrggbb or #rrggbbaa"
    assert value == pending
    assert len(changes.sent) == 1
    assert word.site()["revision"] == before["revision"] + 1
    expect(field(word, "color")).to_have_value(value)
    word.eventually(lambda: canvas_style(word, "color") == browser_reads(word, value), f"the canvas element to take the color {value}")
    run(word, "edit.undo")
    word.restored_to(before["site"])
    expect(field(word, "color")).to_have_value("")


def test_escape_during_a_drag_in_the_square_puts_the_stored_value_back_and_stores_nothing(word):
    typed(word, "background", "#336699")
    before = word.site()
    changes = Changes(word)
    dialog = open_picker(word, "Background")
    pointer, at = drag_in(word, square(word, "Background"), (0.5, 0.5), (0.1, 0.9))
    expect(field(word, "background")).not_to_have_value("#336699")
    word.page.keyboard.press("Escape")
    expect(field(word, "background")).to_have_value("#336699")
    pointer.move(*at(0.2, 0.8), steps=3, held=True)
    pointer.up()
    changes.settled()
    assert changes.sent == []
    assert word.site() == before
    expect(field(word, "background")).to_have_value("#336699")
    word.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()


def test_a_hex_or_rgb_value_typed_in_the_picker_entry_stores_the_lowercase_hex_and_text_that_is_no_color_stores_nothing(word):
    open_picker(word, "Color")
    box = entry(word, "Color")
    for text, value in (("#FF8800", "#ff8800"), ("rgb(0, 128, 255)", "#0080ff"), ("rgba(255, 0, 0, 0.5)", "#ff000080"), ("5b4636", "#5b4636")):
        box.fill(text)
        box.press("Enter")
        word.until(lambda site: styles(site).get("color") == value, f"{text} typed in the entry to store {value}")
        expect(field(word, "color")).to_have_value(value)
    changes = Changes(word)
    before = word.site()
    box.fill("nonsense")
    box.press("Enter")
    changes.settled()
    assert changes.sent == []
    assert word.site() == before


def test_choosing_a_site_color_stores_its_token_and_the_export_carries_it_unchanged(word):
    dialog = open_picker(word, "Color")
    dialog.get_by_role("button", name="sea", exact=True).click()
    word.until(lambda site: styles(site).get("color") == "var(--sea)", "the site color sea to be stored as its token")
    expect(field(word, "color")).to_have_value("var(--sea)")
    word.eventually(lambda: canvas_style(word, "color") == "rgb(11, 111, 121)", "the canvas element to take the color of --sea, #0b6f79")
    assert re.search(r"(?<![-\w])color:\s*var\(--sea\)", export_css(word)), "the exported CSS does not carry color: var(--sea)"


def test_a_token_whose_value_uses_another_token_shows_its_real_color_and_stays_stored_as_the_token(word):
    word.command("token.set", {"name": "tw-base", "value": "#2a6f4e"})
    word.command("token.set", {"name": "tw-alias", "value": "var(--tw-base)"})
    word.until(lambda site: site["tokens"].get("tw-alias") == "var(--tw-base)", "the two tokens")
    typed(word, "background", "var(--tw-alias)")
    word.eventually(lambda: chip_paint(word, "Background") == "rgb(42, 111, 78)", "the swatch to show the color the alias stands for, #2a6f4e")
    dialog = open_picker(word, "Background")
    expect(entry(word, "Background")).to_have_value("#2a6f4e")
    word.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    assert stored(word, "background") == "var(--tw-alias)"
    expect(field(word, "background")).to_have_value("var(--tw-alias)")


def test_no_color_empties_the_field_closes_the_picker_and_returns_focus_to_the_swatch(word):
    typed(word, "color", "#123456")
    dialog = open_picker(word, "Color")
    dialog.get_by_role("button", name="No color", exact=True).click()
    word.until(lambda site: "color" not in styles(site), "the color to be emptied")
    expect(dialog).to_be_hidden()
    expect(field(word, "color")).to_have_value("")
    expect(swatch(word, "Color")).to_be_focused()


@pytest.mark.parametrize("how", ["escape", "click-outside", "raw-switch"])
def test_the_picker_closes_on_escape_a_click_outside_and_the_raw_switch(word, how):
    typed(word, "background", "#336699")
    before = word.site()
    dialog = open_picker(word, "Background")
    if how == "escape":
        square(word, "Background").focus()
        word.page.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
        expect(swatch(word, "Background")).to_be_focused()
    elif how == "click-outside":
        word.page.locator("footer.statusbar").click()
        expect(dialog).to_be_hidden()
    else:
        part(word, "button", "Type Background by hand").click()
        expect(dialog).to_be_hidden()
        expect(swatch(word, "Background")).to_be_hidden()
        part(word, "button", "Type Background by hand").click()
    expect(swatch(word, "Background")).to_have_attribute("aria-expanded", "false")
    assert word.site() == before


def test_with_the_brand_restriction_on_only_brand_and_team_colors_and_no_color_are_offered_and_a_free_color_is_refused(word):
    word.command("token.define", {"name": "brand-tw-ink", "type": "color", "value": "#202a44"})
    word.command("token.define", {"name": "lib-tw-mint", "type": "color", "value": "#7fd1b9"})
    word.command("site.update", {"patch": {"settings": {"brandRestrict": "true"}}})
    word.until(lambda site: site["settings"].get("brandRestrict") == "true", "the brand restriction")
    dialog = open_picker(word, "Color")
    offered = dialog.get_by_role("button").filter(visible=True)
    names = [name.strip() for name in offered.evaluate_all("nodes => nodes.map(n => n.getAttribute('aria-label') || n.textContent)")]
    assert names[-1] == "No color"
    assert len(names) == 3, f"the restricted picker offers {names}"
    assert dialog.get_by_role("tab").filter(visible=True).count() == 0
    expect(square(word, "Color")).to_be_hidden()
    expect(dialog.get_by_role("button", name="sea", exact=True)).to_be_hidden()
    expect(dialog).to_contain_text("A project manager restricted colors to the brand kit")
    for button in offered.all()[:2]:
        before = word.site()["site"]
        button.click()
        site = word.changed_from(before)
        assert styles(site).get("color") in ("var(--brand-tw-ink)", "var(--lib-tw-mint)")
    word.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    before = word.site()
    changes = Changes(word)
    type_value(word, "color", "#ff0000")
    expect(word.status).to_contain_text("Brand restriction is on")
    changes.settled()
    assert word.site()["site"] == before["site"]
    expect(field(word, "color")).to_have_value(styles(before["site"]).get("color"))


def test_one_click_on_the_hue_bar_of_an_unset_color_gives_a_color_of_that_hue(word):
    assert stored(word, "color") is None
    open_picker(word, "Color")
    hue = part(word, "slider", "Hue of Color")
    box = hue.bounding_box()
    pointer = word.canvas_pointer()
    pointer.move(box["x"] + box["width"] / 3, box["y"] + box["height"] / 2)
    pointer.down()
    pointer.up()
    site = word.until(lambda s: "color" in styles(s), "the hue click to store a color")
    value = styles(site)["color"]
    h, s, v = hsv_of(value)
    assert abs(h * 360 - 120) <= 3, f"{value} has hue {h * 360:.0f}, not the 120 at a third of the bar"
    assert s >= 0.3 and v >= 0.3, f"{value} is black or gray (saturation {s:.2f}, brightness {v:.2f})"


def test_the_picker_works_by_keyboard_alone(word):
    page = word.page
    field(word, "color").focus()
    page.keyboard.type("#336699")
    page.keyboard.press("Enter")
    word.until(lambda s: styles(s).get("color") == "#336699", "the color typed by keyboard")
    part(word, "button", "Type Color by hand").focus()
    page.keyboard.press("Tab")
    expect(swatch(word, "Color")).to_be_focused()
    page.keyboard.press("Enter")
    dialog = picker(word, "Color")
    expect(dialog).to_be_visible()
    expect(square(word, "Color")).to_be_focused()
    before = word.site()["site"]
    page.keyboard.press("ArrowRight")
    site = word.changed_from(before)
    assert HEX.match(styles(site)["color"])
    expect(field(word, "color")).to_have_value(styles(site)["color"])
    page.keyboard.press("ArrowUp")
    page.keyboard.press("ArrowLeft")
    seen = []
    for _ in range(12):
        page.keyboard.press("Tab")
        assert focus_inside(dialog), "Tab left the open picker"
        name = page.evaluate("document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()")
        seen.append(name)
        if name == "Hex or rgb() value of Color":
            page.keyboard.press("Control+a")
            page.keyboard.type("#225588")
            page.keyboard.press("Enter")
            word.until(lambda s: styles(s).get("color") == "#225588", "the hex typed in the entry by keyboard")
        if name == "accent":
            page.keyboard.press("ArrowRight")
            expect(dialog.get_by_role("button", name="alert", exact=True)).to_be_focused()
            page.keyboard.press("Enter")
            word.until(lambda s: styles(s).get("color") == "var(--alert)", "the site color chosen by keyboard")
        if name == "No color":
            break
    order = [name for name in seen if name in ("Hue of Color", "Opacity of Color", "Hex or rgb() value of Color", "accent", "No color")]
    assert order == ["Hue of Color", "Opacity of Color", "Hex or rgb() value of Color", "accent", "No color"], f"Tab went through {seen}"
    page.keyboard.press("Enter")
    word.until(lambda s: "color" not in styles(s), "No color chosen by keyboard")
    expect(dialog).to_be_hidden()
    expect(swatch(word, "Color")).to_be_focused()


@pytest.mark.parametrize("label", ["Color", "Background"])
def test_delete_and_backspace_on_every_part_of_the_open_picker_never_remove_an_element(word, label):
    typed(word, label.lower(), "#336699")
    count = node_count(word)
    changes = Changes(word)
    swatch(word, label).focus()
    word.page.keyboard.press("Enter")
    dialog = picker(word, label)
    expect(dialog).to_be_visible()
    first = word.page.evaluate("document.activeElement.getAttribute('aria-label')")
    pressed = []
    for _ in range(20):
        assert focus_inside(dialog), f"focus left the open picker after {pressed}"
        name = word.page.evaluate("document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()")
        if pressed and name == first:
            break
        word.page.keyboard.press("Delete")
        word.page.keyboard.press("Backspace")
        expect(dialog).to_be_visible()
        pressed.append(name)
        word.page.keyboard.press("Tab")
    assert {f"Saturation and brightness of {label}", f"Hue of {label}", f"Opacity of {label}", "No color"} <= set(pressed), f"only reached {pressed}"
    changes.settled()
    assert node_count(word) == count
    expect(word.layer_row(NODE)).to_be_visible()


def test_ctrl_z_with_focus_inside_the_picker_undoes_the_last_commit_and_the_picker_stays_open(word):
    typed(word, "color", "#336699")
    before = word.site()["site"]
    dialog = open_picker(word, "Color")
    box = entry(word, "Color")
    box.fill("#ff8800")
    box.press("Enter")
    word.until(lambda site: styles(site).get("color") == "#ff8800", "the typed hex")
    part(word, "slider", "Hue of Color").focus()
    word.page.keyboard.press("Control+z")
    word.restored_to(before)
    expect(dialog).to_be_visible()
    assert focus_inside(dialog)
    expect(field(word, "color")).to_have_value("#336699")
    expect(box).to_have_value("#336699")


def test_a_drag_cut_off_by_select_parent_closes_the_picker_writes_nothing_and_both_elements_show_what_is_stored(word):
    typed(word, "background", "#336699")
    before = word.site()
    changes = Changes(word)
    dialog = open_picker(word, "Background")
    pointer, at = drag_in(word, square(word, "Background"), (0.5, 0.5), (0.9, 0.1))
    expect(field(word, "background")).not_to_have_value("#336699")
    run(word, "edit.select-parent")
    expect(word.page.locator(".inspector-tag")).to_have_text(re.compile(r"· h-logo$"))
    expect(dialog).to_be_hidden()
    pointer.move(*at(0.7, 0.3), steps=3, held=True)
    pointer.up()
    changes.settled()
    assert changes.sent == []
    assert word.site() == before
    fields_show_state(word, "h-logo")
    select(word, NODE)
    fields_show_state(word, NODE)
    word.eventually(lambda: chip_paint(word, "Background") == "rgb(51, 102, 153)", "the swatch to show the stored #336699")


def test_the_picker_opened_while_a_typed_color_is_on_its_way_starts_from_the_typed_color(word):
    held = hold_first_change(word)
    type_value(word, "color", "#ff8800")
    word.eventually(lambda: held, "the typed color to reach the engine")
    swatch(word, "Color").click()
    dialog = picker(word, "Color")
    expect(dialog).to_be_visible()
    expect(entry(word, "Color")).to_have_value("#ff8800")
    expect(part(word, "slider", "Hue of Color")).to_have_attribute("aria-valuenow", "32")
    route, answer = held[0]
    route.fulfill(response=answer)
    word.until(lambda site: styles(site).get("color") == "#ff8800", "the typed color")
    expect(entry(word, "Color")).to_have_value("#ff8800")
    expect(field(word, "color")).to_have_value("#ff8800")
