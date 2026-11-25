import re

from playwright.sync_api import expect

PAGE_MENU = ["Open", "Rename", "Duplicate", "Set as home page", "Move up", "Move down", "Page settings", "Delete..."]


def menu_labels(editor):
    return [label.strip() for label in editor.menu().locator('[role="menuitem"] .fw-menu-label').all_inner_texts()]


def focused_label(editor):
    return editor.page.evaluate("document.activeElement.querySelector('.fw-menu-label')?.textContent.trim() || ''")


def test_right_clicking_a_page_row_opens_the_page_menu(harbour):
    harbour.page_row("p-fares").click(button="right")
    expect(harbour.menu()).to_be_visible()
    assert menu_labels(harbour) == PAGE_MENU


def test_the_page_menu_opens_from_the_keyboard_and_its_keys_move_and_close(harbour):
    page = harbour.page
    harbour.page_row("p-fares").focus()
    page.keyboard.press("Shift+F10")
    expect(harbour.menu()).to_be_visible()
    assert menu_labels(harbour) == PAGE_MENU
    assert focused_label(harbour) == "Open"
    page.keyboard.press("ArrowDown")
    assert focused_label(harbour) == "Rename"
    page.keyboard.press("End")
    assert focused_label(harbour) == "Delete..."
    page.keyboard.press("Home")
    assert focused_label(harbour) == "Open"
    page.keyboard.press("Escape")
    expect(page.locator('[role="menu"]:visible')).to_have_count(0)

    harbour.page_row("p-fares").focus()
    page.keyboard.press("ContextMenu")
    expect(harbour.menu()).to_be_visible()
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    assert focused_label(harbour) == "Duplicate"
    page.keyboard.press("Enter")
    expect(harbour.page_rows()).to_contain_text(["Timetable and fares copy"])


def test_duplicating_fares_twice_names_the_copies_and_each_is_one_undo_step(harbour):
    def duplicate_fares():
        harbour.page_row("p-fares").click(button="right")
        harbour.menu().get_by_role("menuitem", name="Duplicate").click()

    start = harbour.site()["site"]
    duplicate_fares()
    once = harbour.until(lambda s: len(s["pages"]) == len(start["pages"]) + 1, "one copy")
    copy = next(p for p in once["pages"] if p["id"] not in {q["id"] for q in start["pages"]})
    assert copy["slug"] == "/fares-copy"
    assert copy["name"] == "Timetable and fares copy"
    expect(harbour.page_row(copy["id"])).to_have_attribute("aria-current", "page")

    duplicate_fares()
    twice = harbour.until(lambda s: len(s["pages"]) == len(start["pages"]) + 2, "a second copy")
    second = next(p for p in twice["pages"] if p["id"] not in {q["id"] for q in once["pages"]})
    assert second["slug"].endswith("-2")
    expect(harbour.page_row(second["id"])).to_have_attribute("aria-current", "page")

    harbour.undo()
    harbour.restored_to(once)
    harbour.undo()
    harbour.restored_to(start)


def test_a_single_click_on_a_page_row_selects_it_at_once(harbour):
    row = harbour.page_row("p-routes")
    box = row.bounding_box()
    harbour.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    assert row.get_attribute("aria-selected") == "true"
    assert harbour.page.locator(".fw-rename-input:visible").count() == 0


def test_double_clicking_a_page_row_renames_it_in_place_and_enter_keeps_the_name(harbour):
    row = harbour.page_row("p-routes")
    row.dblclick()
    field = harbour.page.locator(".fw-rename-input")
    expect(field).to_be_focused()
    assert abs(field.bounding_box()["height"] - row.bounding_box()["height"]) <= 1
    field.fill("Ferry routes")
    field.press("Enter")
    harbour.until(lambda s: "Ferry routes" in harbour.page_names(s), "the new page name")
    expect(row.locator(".row-label")).to_have_text("Ferry routes")
    expect(field).to_be_hidden()


def test_f2_rename_escape_keeps_the_old_name_and_an_empty_name_is_refused(harbour):
    before = harbour.site()["site"]
    row = harbour.page_row("p-routes")
    row.click()
    harbour.page.keyboard.press("F2")
    field = harbour.page.locator(".fw-rename-input")
    expect(field).to_be_focused()
    field.fill("Something else")
    field.press("Escape")
    expect(field).to_be_hidden()
    expect(row.locator(".row-label")).to_have_text("Routes")

    row.click()
    harbour.page.keyboard.press("F2")
    expect(field).to_be_focused()
    field.fill("")
    field.press("Enter")
    expect(harbour.status).to_have_text("A page needs a name.")
    assert harbour.site()["site"] == before


def test_clicking_away_from_the_rename_field_keeps_the_new_name(harbour):
    harbour.page_row("p-routes").dblclick()
    field = harbour.page.locator(".fw-rename-input")
    field.fill("All routes")
    harbour.page.locator("#fw-layers-list").click(position={"x": 5, "y": 5})
    harbour.until(lambda s: "All routes" in harbour.page_names(s), "the name kept on blur")


def drag_page(editor, source_key, target_key, upper=True):
    target = editor.page_row(target_key).bounding_box()
    y = target["y"] + (4 if upper else target["height"] - 4)
    source = editor.page_row(source_key).bounding_box()
    editor.page.mouse.move(source["x"] + 40, source["y"] + source["height"] / 2)
    editor.page.mouse.down()
    editor.page.mouse.move(target["x"] + 40, y, steps=10)


def test_dragging_a_page_between_two_others_shows_a_line_moves_it_and_one_undo_restores(harbour):
    start = harbour.site()["site"]
    drag_page(harbour, "p-route", "p-fares")
    expect(harbour.page.locator(".fw-drop-line")).to_be_visible()
    harbour.page.mouse.up()
    moved = harbour.changed_from(start)
    assert harbour.page_names(moved)[:3] == ["Home", "Route", "Timetable and fares"]
    expect(harbour.page_rows()).to_have_text(harbour.page_names(moved))
    harbour.undo()
    harbour.restored_to(start)
    expect(harbour.page_rows()).to_have_text(harbour.page_names(start))


def test_escape_while_dragging_a_page_cancels_the_move(harbour):
    start = harbour.site()["site"]
    drag_page(harbour, "p-route", "p-fares")
    expect(harbour.page.locator(".fw-drop-line")).to_be_visible()
    harbour.page.keyboard.press("Escape")
    harbour.page.mouse.up()
    expect(harbour.page.locator(".fw-drop-line")).to_be_hidden()
    expect(harbour.page_rows()).to_have_text(harbour.page_names(start))
    assert harbour.site()["site"] == start


def test_set_as_home_page_moves_the_page_to_slash_renames_the_old_address_and_relinks(harbour):
    start = harbour.site()["site"]
    assert start["nodes"]["h-nav-fares"]["attrs"]["href"] == "/fares"
    harbour.page_row("p-fares").click(button="right")
    harbour.menu().get_by_role("menuitem", name="Set as home page").click()
    after = harbour.changed_from(start)
    pages = {p["id"]: p for p in after["pages"]}
    assert after["pages"][0]["id"] == "p-fares"
    assert pages["p-fares"]["slug"] == "/"
    assert pages["home"]["slug"] == "/home"
    assert after["nodes"]["h-nav-fares"]["attrs"]["href"] == "/"
    expect(harbour.page_rows().first).to_have_text("Timetable and fares")
    expect(harbour.status).to_contain_text('"Timetable and fares" is now the home page at /')
    harbour.page_row("home").click()
    expect(harbour.canvas.locator('[data-fw-id="h-nav-fares"]')).to_have_attribute("data-fw-href", "/")
    expect(harbour.canvas.locator('[data-fw-id="h-nav-fares"]')).not_to_have_attribute("href", re.compile(r".*"))
    harbour.undo()
    harbour.restored_to(start)
