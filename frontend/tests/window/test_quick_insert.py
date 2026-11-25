from playwright.sync_api import expect

from test_second_round import one_pixel_png


def insert_button(editor):
    return editor.page.get_by_role("button", name="Insert element")


def flyout(editor):
    return editor.page.locator('.fw-flyout[aria-label="Quick insert"]')


def test_the_layers_plus_opens_quick_insert_with_focus_in_its_filter(coldmere):
    insert_button(coldmere).click()
    expect(flyout(coldmere)).to_be_visible()
    expect(coldmere.page.locator(".fw-flyout-filter")).to_be_focused()
    labels = flyout(coldmere).locator(".fw-flyout-label").all_inner_texts()
    assert {"Section", "Heading", "Paragraph", "Navigation bar", "Footer"} <= set(labels)


def test_typing_in_the_filter_narrows_the_list_and_enter_inserts_into_the_selected_container_as_one_undo_step(coldmere):
    coldmere.layer_row("hm-btns").click()
    start = coldmere.site()["site"]
    insert_button(coldmere).click()
    coldmere.page.keyboard.type("parag")
    rows = flyout(coldmere).locator(".fw-flyout-row:visible")
    expect(rows).to_have_text(["Paragraph", "All elements and components..."])
    coldmere.page.keyboard.press("Enter")
    after = coldmere.changed_from(start)
    added = [k for k in after["nodes"]["hm-btns"]["children"] if k not in start["nodes"]["hm-btns"]["children"]]
    assert len(added) == 1 and after["nodes"]["hm-btns"]["children"][-1] == added[0]
    assert after["nodes"][added[0]]["tag"] == "p"
    expect(flyout(coldmere)).to_be_hidden()
    coldmere.undo()
    coldmere.restored_to(start)


def test_the_quick_insert_shortcut_opens_it_and_escape_returns_focus_to_the_plus_button(coldmere):
    coldmere.layer_row("hm-strip").click()
    coldmere.page.keyboard.press("Control+Shift+L")
    expect(flyout(coldmere)).to_be_visible()
    expect(coldmere.page.locator(".fw-flyout-filter")).to_be_focused()
    coldmere.page.keyboard.press("Escape")
    expect(flyout(coldmere)).to_be_hidden()
    expect(insert_button(coldmere)).to_be_focused()


def test_tab_closes_quick_insert_and_returns_focus_to_the_plus_button(coldmere):
    insert_button(coldmere).click()
    expect(flyout(coldmere)).to_be_visible()
    coldmere.page.keyboard.press("Tab")
    expect(flyout(coldmere)).to_be_hidden()
    expect(insert_button(coldmere)).to_be_focused()


def test_a_filter_with_no_match_says_so_and_keeps_the_flyout_size(coldmere):
    insert_button(coldmere).click()
    expect(flyout(coldmere)).to_be_visible()
    before = flyout(coldmere).bounding_box()
    coldmere.page.keyboard.type("zzqqxx")
    expect(flyout(coldmere)).to_contain_text("Nothing matches this filter.")
    assert flyout(coldmere).bounding_box() == before


def test_the_last_row_opens_the_full_insert_panel(coldmere):
    insert_button(coldmere).click()
    last = flyout(coldmere).locator(".fw-flyout-row").last
    expect(last).to_have_text("All elements and components...")
    last.click()
    expect(flyout(coldmere)).to_be_hidden()
    expect(coldmere.page.locator(".sidebar .fw-panel-title")).to_have_text("Insert")


def test_the_image_row_opens_a_file_picker_and_the_chosen_picture_becomes_an_image_layer(coldmere):
    page = coldmere.page
    coldmere.layer_row("hm-btns").click()
    start = coldmere.site()["site"]
    insert_button(coldmere).click()
    with page.expect_file_chooser(timeout=5_000) as chooser:
        flyout(coldmere).locator(".fw-flyout-row", has_text="Image").click()
    chooser.value.set_files(files=[{"name": "dot.png", "mimeType": "image/png", "buffer": one_pixel_png()}])
    site = coldmere.changed_from(start)
    added = [k for k in site["nodes"]["hm-btns"]["children"] if k not in start["nodes"]["hm-btns"]["children"]]
    assert len(added) == 1 and site["nodes"][added[0]]["tag"] == "img"


def test_the_image_row_chosen_with_enter_opens_a_file_picker(coldmere):
    page = coldmere.page
    insert_button(coldmere).click()
    page.keyboard.type("image")
    with page.expect_file_chooser(timeout=5_000):
        page.keyboard.press("Enter")


def test_the_video_row_opens_a_file_picker(coldmere):
    page = coldmere.page
    coldmere.layer_row("hm-btns").click()
    insert_button(coldmere).click()
    with page.expect_file_chooser(timeout=5_000) as chooser:
        flyout(coldmere).locator(".fw-flyout-row", has_text="Video").click()
    assert "video/mp4" in chooser.value.element.get_attribute("accept")


def test_the_pages_plus_still_opens_add_page(coldmere):
    coldmere.page.get_by_role("button", name="Add page").click()
    dialog = coldmere.page.get_by_role("dialog", name="Add page")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role("textbox", name="Page name")).to_be_visible()
    expect(flyout(coldmere)).to_be_hidden()
