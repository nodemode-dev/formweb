from playwright.sync_api import expect

ZONES = {"upper": lambda box: 4, "lower": lambda box: box["height"] - 4, "middle": lambda box: box["height"] / 2}


def start_layer_drag(editor, source_key, target_key, zone):
    editor.layer_row(target_key).scroll_into_view_if_needed()
    editor.layer_row(source_key).scroll_into_view_if_needed()
    source = editor.layer_row(source_key).bounding_box()
    target = editor.layer_row(target_key).bounding_box()
    editor.page.mouse.move(source["x"] + 60, source["y"] + source["height"] / 2)
    editor.page.mouse.down()
    editor.page.mouse.move(target["x"] + 60, target["y"] + ZONES[zone](target), steps=10)


def children(site, key):
    return site["nodes"][key]["children"]


def test_dropping_a_layer_on_the_upper_third_of_a_row_puts_it_before_and_one_undo_restores(coldmere):
    start = coldmere.site()["site"]
    assert children(start, "hm-hero-copy")[:3] == ["hm-eyebrow", "hm-h1", "hm-lead"]
    start_layer_drag(coldmere, "hm-lead", "hm-eyebrow", "upper")
    expect(coldmere.page.locator(".fw-drop-line")).to_be_visible()
    coldmere.page.mouse.up()
    moved = coldmere.changed_from(start)
    assert children(moved, "hm-hero-copy")[:3] == ["hm-lead", "hm-eyebrow", "hm-h1"]
    coldmere.undo()
    coldmere.restored_to(start)


def test_dropping_a_layer_on_the_lower_third_of_a_row_puts_it_after(coldmere):
    start = coldmere.site()["site"]
    start_layer_drag(coldmere, "hm-eyebrow", "hm-h1", "lower")
    expect(coldmere.page.locator(".fw-drop-line")).to_be_visible()
    coldmere.page.mouse.up()
    moved = coldmere.changed_from(start)
    assert children(moved, "hm-hero-copy")[:3] == ["hm-h1", "hm-eyebrow", "hm-lead"]
    assert coldmere.layer_keys().index("hm-eyebrow") > coldmere.layer_keys().index("hm-h1")
    coldmere.undo()
    coldmere.restored_to(start)


def test_dropping_a_layer_on_the_middle_of_a_container_puts_it_inside_at_the_end(coldmere):
    start = coldmere.site()["site"]
    start_layer_drag(coldmere, "hm-lead", "hm-btns", "middle")
    expect(coldmere.layer_row("hm-btns")).to_have_class("list-row layer-row is-drop-into")
    coldmere.page.mouse.up()
    moved = coldmere.changed_from(start)
    assert children(moved, "hm-btns") == ["hm-call", "hm-see", "hm-lead"]
    assert "hm-lead" not in children(moved, "hm-hero-copy")
    expect(coldmere.status).to_have_text("Layer moved. One undo step puts it back.")
    coldmere.undo()
    coldmere.restored_to(start)


def test_the_page_root_cannot_be_dragged(coldmere):
    start = coldmere.site()["site"]
    start_layer_drag(coldmere, "root", "hd-in", "lower")
    expect(coldmere.page.locator(".fw-drop-line:visible")).to_have_count(0)
    expect(coldmere.page.locator(".is-drag-source")).to_have_count(0)
    coldmere.page.mouse.up()
    expect(coldmere.layer_row("root")).to_be_visible()
    assert coldmere.site()["site"] == start


def test_a_layer_cannot_be_dropped_into_its_own_child(coldmere):
    start = coldmere.site()["site"]
    start_layer_drag(coldmere, "hm-hero-copy", "hm-btns", "middle")
    expect(coldmere.page.locator(".is-drop-into")).to_have_count(0)
    coldmere.page.mouse.up()
    expect(coldmere.layer_row("hm-btns")).to_be_visible()
    assert coldmere.site()["site"] == start


def test_a_layer_is_never_dropped_inside_an_element_that_is_not_a_container(coldmere):
    start = coldmere.site()["site"]
    start_layer_drag(coldmere, "hm-eyebrow", "hm-lead", "middle")
    expect(coldmere.layer_row("hm-lead")).not_to_have_class("list-row layer-row is-drop-into")
    coldmere.page.mouse.up()
    expect(coldmere.layer_row("hm-lead")).to_be_visible()
    assert children(coldmere.site()["site"], "hm-lead") == children(start, "hm-lead") == []


def test_the_twisty_folds_and_unfolds_a_layer_without_moving_other_rows_text(coldmere):
    row = coldmere.layer_row("hm-btns")
    row.scroll_into_view_if_needed()
    sibling_label = coldmere.layer_row("hm-ticks").locator(".row-label")
    label_x = sibling_label.bounding_box()["x"]
    row.locator(".fw-twisty").click()
    expect(row).to_have_attribute("aria-expanded", "false")
    expect(coldmere.layer_row("hm-call")).to_have_count(0)
    expect(coldmere.layer_row("hm-see")).to_have_count(0)
    assert sibling_label.bounding_box()["x"] == label_x
    row.locator(".fw-twisty").click()
    expect(row).to_have_attribute("aria-expanded", "true")
    expect(coldmere.layer_row("hm-call")).to_be_visible()
    expect(coldmere.layer_row("hm-see")).to_be_visible()


def test_left_and_right_arrow_keys_fold_and_unfold_the_selected_layer(coldmere):
    row = coldmere.layer_row("hm-btns")
    row.click()
    coldmere.page.keyboard.press("ArrowLeft")
    expect(row).to_have_attribute("aria-expanded", "false")
    expect(coldmere.layer_row("hm-call")).to_have_count(0)
    coldmere.page.keyboard.press("ArrowRight")
    expect(row).to_have_attribute("aria-expanded", "true")
    expect(coldmere.layer_row("hm-call")).to_be_visible()


def descendants(site, key):
    found = []
    for kid in site["nodes"][key]["children"]:
        found.append(kid)
        found.extend(descendants(site, kid))
    return found


def test_collapse_all_leaves_the_top_level_parts_and_expand_all_shows_every_layer(coldmere):
    site = coldmere.site()["site"]
    top = ["root"] + children(site, "root")
    everything = ["root"] + descendants(site, "root")
    coldmere.layer_row("hm-strip").click(button="right")
    coldmere.menu().get_by_role("menuitem", name="Collapse all").click()
    expect(coldmere.page.locator("#fw-layers-list .layer-row")).to_have_count(len(top))
    assert coldmere.layer_keys() == top
    coldmere.layer_row("hd").click(button="right")
    coldmere.menu().get_by_role("menuitem", name="Expand all").click()
    expect(coldmere.page.locator("#fw-layers-list .layer-row")).to_have_count(len(everything))
    assert coldmere.layer_keys() == everything
