import io
import re
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import pytest
from playwright.sync_api import expect

CONTRAST = """el => {
  const parse = s => s.match(/[\\d.]+/g).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  let bg = [255, 255, 255];
  for (let at = el; at; at = at.parentElement) { const c = parse(getComputedStyle(at).backgroundColor); if (c.length < 4 || c[3] > 0) { bg = c; break; } }
  const fg = parse(getComputedStyle(el).color);
  const [x, y] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (x + 0.05) / (y + 0.05);
}"""


@pytest.fixture
def blank(editor):
    editor.page.locator('[data-run="file.new"]').first.click()
    editor.page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    editor.until(lambda s: len(s["pages"]) == 1, "the new site")
    for name in ("Contact", "Hello"):
        add_page(editor, name)
    return editor


def add_page(editor, name, start=None):
    before = editor.site()["site"]
    editor.page.get_by_role("button", name="Add page").click()
    dialog = editor.page.get_by_role("dialog", name="Add page")
    dialog.get_by_role("textbox", name="Page name").fill(name)
    if start:
        dialog.get_by_role("combobox", name="Background").select_option(label=start)
    dialog.get_by_role("button", name="Add page").click()
    site = editor.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, f"the page {name}")
    return next(p for p in site["pages"] if p["name"] == name)


def group(editor):
    editor.page.locator('[data-menu="Page"]').click()
    editor.page.locator('[role="menu"]:visible [data-command="page.background"]').click()
    return editor.page.locator('.inspector-section[data-section="page-background"]')


def root_of(editor, site, name):
    return next(p for p in site["pages"] if p["name"] == name)


def test_the_first_site_background_color_shows_on_the_canvas_and_on_the_published_page(blank, chromium):
    shown = group(blank)
    expect(shown.get_by_role("radio", name="Site background")).to_be_checked()
    before = blank.site()["site"]
    color = blank.page.locator('[data-field="page.site-background"]')
    color.fill("#f3e9d2")
    color.press("Enter")
    site = blank.until(lambda s: s["tokens"].get("page-background") == "#f3e9d2", "the site background token")
    hello = root_of(blank, site, "Hello")
    assert site["nodes"][hello["root"]]["styles"]["background"] == "var(--page-background)"
    expect(blank.canvas.locator(f'[data-fw-id="{hello["root"]}"]')).to_have_css("background-color", "rgb(243, 233, 210)")
    expect(shown).to_contain_text("1 of 3 pages use the site background.")
    with urllib.request.urlopen(blank.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    folder = Path(tempfile.mkdtemp(prefix="formweb-published-"))
    archive.extractall(folder)
    published = chromium.new_page()
    published.goto((folder / "hello" / "index.html").as_uri())
    expect(published.locator(f'[data-fw-node="{hello["root"]}"]')).to_have_css("background-color", "rgb(243, 233, 210)")
    published.close()
    blank.page.locator('[data-cmd="edit.undo"]').first.click()
    blank.restored_to(before)


def test_use_the_site_background_on_all_pages_is_one_undo_step_and_new_pages_start_with_it(blank):
    shown = group(blank)
    color = blank.page.locator('[data-field="page.site-background"]')
    color.fill("#203040")
    color.press("Enter")
    blank.until(lambda s: "page-background" in s["tokens"], "the site background token")
    before = blank.site()["site"]
    shown.get_by_role("button", name="Use the site background on all pages").click()
    after = blank.changed_from(before)
    assert {after["nodes"][p["root"]]["styles"]["background"] for p in after["pages"]} == {"var(--page-background)"}
    blank.page.locator('[data-cmd="edit.undo"]').first.click()
    blank.restored_to(before)
    blank.page.get_by_role("button", name="Add page").click()
    dialog = blank.page.get_by_role("dialog", name="Add page")
    expect(dialog.get_by_role("combobox", name="Background").locator("option").first).to_have_text("Site background (#203040)")
    blank.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    later = add_page(blank, "Later")
    expect(blank.canvas.locator(f'[data-fw-id="{later["root"]}"]')).to_have_css("background-color", "rgb(32, 48, 64)")


@pytest.mark.parametrize("background", [None, "#14161b"], ids=["white page", "dark page"])
def test_text_put_in_a_new_section_is_readable(blank, background):
    site = blank.site()["site"]
    hello = root_of(blank, site, "Hello")
    if background:
        group(blank)
        blank.page.locator('.inspector-section[data-section="page-background"]').get_by_text("This page only", exact=True).click()
        field = blank.page.locator('[data-field="page.background"]')
        field.fill(background)
        field.press("Enter")
        blank.until(lambda s: s["nodes"][hello["root"]]["styles"].get("background") == background, "the dark background")
    blank.layer_row(hello["root"]).click()
    for label in ("Section", "Heading"):
        before = blank.site()["site"]
        blank.page.get_by_role("button", name="Insert element").click()
        blank.page.locator('.fw-flyout[aria-label="Quick insert"] .fw-flyout-row', has_text=re.compile(rf"^{label}$")).first.click()
        blank.changed_from(before)
    heading = blank.canvas.locator(f'[data-fw-id="{hello["root"]}"] section h2')
    expect(heading).to_have_text("A new perspective")
    assert heading.evaluate(CONTRAST) >= 4.5


def published_background(editor, chromium, slug, node):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    folder = Path(tempfile.mkdtemp(prefix="formweb-published-"))
    archive.extractall(folder)
    published = chromium.new_page()
    published.goto((folder / slug / "index.html").as_uri())
    shown = published.locator(f'[data-fw-node="{node}"]').evaluate("e => getComputedStyle(e).backgroundColor")
    published.close()
    return shown


def test_removing_the_site_background_token_while_a_page_uses_it_shows_the_same_white_on_the_canvas_as_on_the_published_page(blank, chromium):
    group(blank)
    color = blank.page.locator('[data-field="page.site-background"]')
    color.fill("#203040")
    color.press("Enter")
    site = blank.until(lambda s: s["tokens"].get("page-background") == "#203040", "the site background token")
    hello = root_of(blank, site, "Hello")
    root = blank.canvas.locator(f'[data-fw-id="{hello["root"]}"]')
    expect(root).to_have_css("background-color", "rgb(32, 48, 64)")
    blank.command("token.set", {"name": "page-background", "value": None})
    blank.until(lambda s: "page-background" not in s["tokens"], "the token to go")
    expect(root).to_have_css("background-color", "rgba(0, 0, 0, 0)")
    assert published_background(blank, chromium, "hello", hello["root"]) == "rgba(0, 0, 0, 0)"


def test_white_text_on_a_dark_page_is_shown_in_a_notice_whose_undo_keeps_the_background(blank):
    site = blank.site()["site"]
    hello = root_of(blank, site, "Hello")
    group(blank).get_by_text("This page only", exact=True).click()
    field = blank.page.locator('[data-field="page.background"]')
    field.fill("#14161b")
    field.press("Enter")
    blank.until(lambda s: s["nodes"][hello["root"]]["styles"].get("color") == "#ffffff", "the white text")
    notice = blank.page.locator(".fw-notice")
    expect(notice).to_contain_text("Background set. The page text is now #ffffff so it stays readable on it.")
    notice.get_by_role("button", name="Undo").click()
    site = blank.until(lambda s: "color" not in s["nodes"][hello["root"]]["styles"], "the text color to go back")
    assert site["nodes"][hello["root"]]["styles"]["background"] == "#14161b"
    expect(notice).to_be_hidden()


def test_a_new_page_that_starts_on_a_dark_site_background_has_readable_text(blank):
    group(blank)
    color = blank.page.locator('[data-field="page.site-background"]')
    color.fill("#14161b")
    color.press("Enter")
    blank.until(lambda s: "page-background" in s["tokens"], "the site background token")
    later = add_page(blank, "Later")
    blank.layer_row(later["root"]).click()
    blank.page.get_by_role("button", name="Insert element").click()
    blank.page.locator('.fw-flyout[aria-label="Quick insert"] .fw-flyout-row', has_text=re.compile(r"^Heading$")).first.click()
    heading = blank.canvas.locator(f'[data-fw-id="{later["root"]}"] h2')
    expect(heading).to_have_text("A new perspective")
    assert heading.evaluate(CONTRAST) >= 4.5
