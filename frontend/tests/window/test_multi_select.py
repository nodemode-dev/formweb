from playwright.sync_api import expect

THREE = ["hm-eyebrow", "hm-lead", "hm-btns"]


def selected_rows(editor):
    return editor.page.locator('#fw-layers-list .layer-row[aria-selected="true"]')


def select_three(editor):
    editor.layer_row(THREE[0]).click()
    for key in THREE[1:]:
        editor.layer_row(key).click(modifiers=["Control"])
    expect(selected_rows(editor)).to_have_count(3)


def test_ctrl_click_adds_rows_and_the_right_panel_counts_them(coldmere):
    select_three(coldmere)
    assert selected_rows(coldmere).evaluate_all("rows => rows.map(r => r.dataset.key)") == THREE
    expect(coldmere.page.locator(".inspector-name")).to_have_text("3 elements selected")
    coldmere.layer_row("hm-lead").click(modifiers=["Control"])
    expect(selected_rows(coldmere)).to_have_count(2)
    expect(coldmere.layer_row("hm-lead")).to_have_attribute("aria-selected", "false")


def test_shift_click_selects_every_row_from_the_last_clicked_one(coldmere):
    coldmere.layer_row("hm-eyebrow").click()
    coldmere.layer_row("hm-btns").click(modifiers=["Shift"])
    expect(selected_rows(coldmere)).to_have_count(4)
    assert selected_rows(coldmere).evaluate_all("rows => rows.map(r => r.dataset.key)") == ["hm-eyebrow", "hm-h1", "hm-lead", "hm-btns"]


def test_escape_goes_back_to_one_selected_layer(coldmere):
    select_three(coldmere)
    coldmere.page.keyboard.press("Escape")
    expect(selected_rows(coldmere)).to_have_count(1)
    expect(coldmere.page.locator(".inspector-name")).not_to_have_text("3 elements selected")


def test_select_all_once_picks_the_siblings_and_twice_picks_every_element(coldmere):
    site = coldmere.site()["site"]
    coldmere.layer_row("hm-h1").click()
    coldmere.page.keyboard.press("Control+a")
    siblings = site["nodes"]["hm-hero-copy"]["children"]
    expect(selected_rows(coldmere)).to_have_count(len(siblings))
    assert selected_rows(coldmere).evaluate_all("rows => rows.map(r => r.dataset.key)") == siblings
    coldmere.page.keyboard.press("Control+a")
    every = [key for key in coldmere.layer_keys() if key != "root"]
    expect(selected_rows(coldmere)).to_have_count(len(every))


def test_duplicate_acts_on_the_whole_selection_as_one_undo_step(coldmere):
    start = coldmere.site()["site"]
    select_three(coldmere)
    coldmere.page.keyboard.press("Control+d")
    after = coldmere.changed_from(start)
    kids = after["nodes"]["hm-hero-copy"]["children"]
    assert len(kids) == len(start["nodes"]["hm-hero-copy"]["children"]) + 3
    copies = [k for k in kids if k not in start["nodes"]]
    assert sorted(after["nodes"][k]["tag"] for k in copies) == sorted(start["nodes"][k]["tag"] for k in THREE)
    coldmere.undo()
    coldmere.restored_to(start)


def test_delete_acts_on_the_whole_selection_as_one_undo_step(coldmere):
    start = coldmere.site()["site"]
    select_three(coldmere)
    coldmere.page.keyboard.press("Delete")
    after = coldmere.changed_from(start)
    assert not set(THREE) & set(after["nodes"]["hm-hero-copy"]["children"])
    for key in THREE:
        expect(coldmere.layer_row(key)).to_have_count(0)
    coldmere.undo()
    coldmere.restored_to(start)
    expect(coldmere.layer_row("hm-btns")).to_be_visible()
