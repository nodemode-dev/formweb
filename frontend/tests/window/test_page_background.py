import io
import re
import urllib.request
import zipfile

import pytest
from playwright.sync_api import expect

EFFECTIVE_BACKGROUND = """root => {
  for (const el of [root, root.ownerDocument.body, root.ownerDocument.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  }
  return 'rgb(255, 255, 255)';
}"""


@pytest.fixture
def new_page(harbour):
    before = harbour.site()["site"]
    harbour.page.get_by_role("button", name="Add page").click()
    dialog = harbour.page.get_by_role("dialog", name="Add page")
    dialog.get_by_role("textbox", name="Page name").fill("Plain")
    dialog.get_by_role("textbox", name="URL slug").fill("/plain")
    dialog.get_by_role("button", name="Add page").click()
    site = harbour.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "the new page")
    page = next(p for p in site["pages"] if p["name"] == "Plain")
    expect(harbour.page_row(page["id"])).to_have_attribute("aria-current", "page")
    root = harbour.canvas.locator(f'[data-fw-id="{page["root"]}"]')
    expect(root).to_be_visible()
    return harbour, page, root


def open_page_background(editor):
    editor.page.locator('[data-menu="Page"]').click()
    editor.page.locator('[role="menu"]:visible [data-command="page.background"]').click()
    field = editor.page.locator('[data-field="page.background"]')
    expect(field).to_be_focused()
    return field


def rules(css):
    return re.findall(r"([^{}]+)\{([^{}]*)\}", css)


def test_a_new_page_is_white_with_dark_text_on_the_canvas(new_page):
    editor, page, root = new_page
    assert root.evaluate(EFFECTIVE_BACKGROUND) == "rgb(255, 255, 255)"
    red, green, blue = map(int, re.findall(r"\d+", root.evaluate("e => getComputedStyle(e).color"))[:3])
    assert max(red, green, blue) < 80


def test_a_new_page_exports_with_no_background_of_its_own(new_page):
    editor, page, root = new_page
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        archive = zipfile.ZipFile(io.BytesIO(reply.read()))
    html = archive.read("plain/index.html").decode("utf-8")
    assert not re.search(r"<(html|body)[^>]*\sstyle=", html)
    sheets = re.findall(r'<link rel="stylesheet" href="\.\./([^"]+)"', html)
    assert sheets
    targets = {"html", "body", ":root", f'[data-fw-node="{page["root"]}"]'}
    for sheet in sheets:
        for chosen, body in rules(archive.read(sheet).decode("utf-8")):
            if any(part.split()[-1] in targets for part in chosen.split(",") if part.split()):
                assert "background" not in body, f"{sheet}: {chosen.strip()} {{{body}}}"


def test_setting_a_page_background_colour_changes_the_canvas(new_page):
    editor, page, root = new_page
    field = open_page_background(editor)
    field.fill("#0a141e")
    field.press("Enter")
    expect(root).to_have_css("background-color", "rgb(10, 20, 30)")
    editor.until(lambda s: s["nodes"][page["root"]]["styles"].get("background") == "#0a141e", "the stored background")


def test_a_value_that_is_not_a_css_background_is_refused_and_the_field_restored(coldmere):
    start = coldmere.site()["site"]
    field = open_page_background(coldmere)
    expect(field).to_have_value("var(--paper)")
    field.fill("var(--bg)#f3efe6")
    field.press("Enter")
    expect(coldmere.status).to_contain_text('"var(--bg)#f3efe6" is not a background the browser can read.')
    expect(field).to_have_value("var(--paper)")
    assert coldmere.site()["site"] == start


def test_apply_to_all_pages_gives_every_page_the_background_in_one_undo_step(new_page):
    editor, page, root = new_page
    field = open_page_background(editor)
    field.fill("#0a141e")
    field.press("Enter")
    before = editor.until(lambda s: s["nodes"][page["root"]]["styles"].get("background") == "#0a141e", "the stored background")
    editor.page.locator('.inspector-section[data-section="page-background"]').get_by_role("button", name="Apply to all pages").click()
    after = editor.changed_from(before)
    assert {after["nodes"][p["root"]]["styles"].get("background") for p in after["pages"]} == {"#0a141e"}
    expect(editor.status).to_contain_text(f"applied to all {len(after['pages'])} pages")
    editor.page_row("home").click()
    expect(editor.canvas.locator('[data-fw-id="root"]')).to_have_css("background-color", "rgb(10, 20, 30)")
    editor.undo()
    editor.restored_to(before)


HARBOUR_BG = "rgb(243, 246, 247)"


def test_a_new_page_can_start_with_the_home_page_background_and_one_undo_takes_the_page_away(harbour):
    harbour.page_row("p-fares").click()
    before = harbour.site()["site"]
    harbour.page.get_by_role("button", name="Add page").click()
    dialog = harbour.page.get_by_role("dialog", name="Add page")
    dialog.get_by_role("textbox", name="Page name").fill("Plain")
    start = dialog.get_by_role("combobox", name="Background")
    expect(start.locator("option")).to_have_text(["Site background (white)", "Same as Home (home page)", "Same as Timetable and fares, the page open now"])
    start.select_option(label="Same as Home (home page)")
    dialog.get_by_role("button", name="Add page").click()
    site = harbour.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "the new page")
    page = next(p for p in site["pages"] if p["name"] == "Plain")
    assert site["nodes"][page["root"]]["styles"].get("background") == "var(--bg)"
    expect(harbour.canvas.locator(f'[data-fw-id="{page["root"]}"]')).to_have_css("background-color", HARBOUR_BG)
    harbour.undo()
    harbour.restored_to(before)


def test_match_another_page_gives_the_open_page_the_home_page_background_in_one_undo_step(new_page):
    editor, page, root = new_page
    open_page_background(editor)
    before = editor.site()["site"]
    editor.page.get_by_role("combobox", name="Match another page").select_option(label="Home (home page)")
    editor.until(lambda s: s["nodes"][page["root"]]["styles"].get("background") == "var(--bg)", "the copied background")
    expect(root).to_have_css("background-color", HARBOUR_BG)
    expect(editor.status).to_have_text('The background and text color of "Home" are now used on "Plain".')
    editor.page.locator('[data-cmd="edit.undo"]').first.click()
    editor.restored_to(before)
