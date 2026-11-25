from playwright.sync_api import expect


def test_backspace_deletes_the_selected_element_as_one_undo_step(coldmere):
    coldmere.layer_row("hm-lead").click()
    start = coldmere.site()["site"]
    coldmere.page.keyboard.press("Backspace")
    after = coldmere.changed_from(start)
    assert "hm-lead" not in after["nodes"]["hm-hero-copy"]["children"]
    expect(coldmere.layer_row("hm-lead")).to_have_count(0)
    coldmere.undo()
    coldmere.restored_to(start)


def test_backspace_in_the_rename_field_edits_the_name_and_deletes_nothing(coldmere):
    coldmere.layer_row("hm-lead").click()
    start = coldmere.site()["site"]
    coldmere.page.keyboard.press("F2")
    field = coldmere.page.locator(".fw-rename-input")
    expect(field).to_be_focused()
    field.press("End")
    field.press("Backspace")
    expect(field).to_have_value("Hm lea")
    field.press("Escape")
    expect(coldmere.layer_row("hm-lead")).to_be_visible()
    assert coldmere.site()["site"] == start


def test_backspace_in_the_property_search_box_deletes_nothing(coldmere):
    coldmere.layer_row("hm-lead").click()
    start = coldmere.site()["site"]
    search = coldmere.page.get_by_placeholder("Search properties")
    search.click()
    coldmere.page.keyboard.type("fonts")
    coldmere.page.keyboard.press("Backspace")
    expect(search).to_have_value("font")
    expect(coldmere.layer_row("hm-lead")).to_be_visible()
    assert coldmere.site()["site"] == start


def test_backspace_while_editing_canvas_text_edits_the_text_and_keeps_the_element(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').dblclick()
    text = coldmere.canvas.locator('[data-fw-text="hm-h1"][contenteditable="true"]')
    expect(text).to_be_visible()
    coldmere.page.keyboard.press("End")
    coldmere.page.keyboard.press("Backspace")
    expect(text).to_have_text("Warm rooms, working taps, no fuss")
    coldmere.page.keyboard.press("Backspace")
    expect(text).to_have_text("Warm rooms, working taps, no fus")
    coldmere.layer_row("hm-eyebrow").click()
    site = coldmere.until(lambda s: s["nodes"]["hm-h1"]["text"] == "Warm rooms, working taps, no fus", "the edited text to be kept")
    assert "hm-h1" in site["nodes"]["hm-hero-copy"]["children"]
    expect(coldmere.layer_row("hm-h1")).to_be_visible()
