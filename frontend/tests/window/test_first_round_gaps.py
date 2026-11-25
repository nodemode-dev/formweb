import json
import re
import urllib.request

from playwright.sync_api import expect

THREE = ["hm-eyebrow", "hm-h1", "hm-lead"]


def page_ids(site):
    return [p["id"] for p in site["pages"]]


def children(site, key):
    return site["nodes"][key]["children"]


def selected_layers(editor):
    return editor.page.locator('#fw-layers-list .layer-row[aria-selected="true"]')


def test_alt_up_and_alt_down_on_a_focused_page_row_move_the_page_like_the_menu_items(harbour):
    start = harbour.site()["site"]
    order = page_ids(start)
    at = order.index("p-routes")
    harbour.page_row("p-routes").click()
    harbour.page_row("p-routes").focus()
    harbour.page.keyboard.press("Alt+ArrowUp")
    up = harbour.changed_from(start)
    expected = order[:at - 1] + ["p-routes", order[at - 1]] + order[at + 1:]
    assert page_ids(up) == expected
    expect(harbour.page_rows().nth(at - 1)).to_have_text("Routes")
    harbour.page.keyboard.press("Alt+ArrowDown")
    harbour.restored_to(start)
    harbour.page_row("p-routes").click(button="right")
    harbour.menu().get_by_role("menuitem", name="Move up").click()
    assert page_ids(harbour.changed_from(start)) == expected


def test_alt_up_and_alt_down_on_a_focused_layer_row_move_the_layer_one_place(coldmere):
    start = coldmere.site()["site"]
    kids = children(start, "hm-hero-copy")
    at = kids.index("hm-lead")
    coldmere.layer_row("hm-lead").click()
    coldmere.layer_row("hm-lead").focus()
    coldmere.page.keyboard.press("Alt+ArrowUp")
    up = coldmere.changed_from(start)
    assert children(up, "hm-hero-copy") == kids[:at - 1] + ["hm-lead", kids[at - 1]] + kids[at + 1:]
    assert coldmere.layer_keys().index("hm-lead") < coldmere.layer_keys().index(kids[at - 1])
    coldmere.page.keyboard.press("Alt+ArrowDown")
    coldmere.restored_to(start)


def test_set_as_home_page_is_refused_for_a_cms_template_page_and_nothing_changes(harbour):
    start = harbour.site()["site"]
    assert "p-route" in start["extensions"]["cms"]["templates"]
    harbour.page_row("p-route").click(button="right")
    harbour.menu().get_by_role("menuitem", name="Set as home page").click()
    expect(harbour.status).to_contain_text("CMS template page")
    expect(harbour.status).to_contain_text('"Route"')
    assert harbour.site()["site"] == start
    expect(harbour.page_rows().first).to_have_text("Home")


def test_set_as_home_page_is_refused_for_a_page_with_its_own_password_and_nothing_changes(harbour):
    request = urllib.request.Request(harbour.base + "/api/page-passwords", data=json.dumps({"route": "/fares", "password": "harbour-gate-7"}).encode(), method="POST", headers={"Content-Type": "application/json", "X-FormWeb-Window-Key": harbour.window_key})
    with urllib.request.urlopen(request, timeout=10) as reply:
        assert [gate["route"] for gate in json.loads(reply.read())["gates"]] == ["/fares"]
    start = harbour.site()["site"]
    harbour.page_row("p-fares").click(button="right")
    harbour.menu().get_by_role("menuitem", name="Set as home page").click()
    expect(harbour.status).to_contain_text("password protected through /fares")
    assert harbour.site()["site"] == start
    expect(harbour.page_rows().first).to_have_text("Home")


def delete_selected_pages(editor, count):
    editor.menu().get_by_role("menuitem", name=f"Delete {count} pages...").click()
    dialog = editor.page.get_by_role("dialog", name="Delete page")
    expect(dialog).to_contain_text(f"Delete {count} pages")
    dialog.get_by_role("button", name="Delete page").click()
    expect(dialog).to_be_hidden()


def test_deleting_three_pages_asks_once_and_one_undo_brings_them_back(harbour):
    start = harbour.site()["site"]
    harbour.page_row("p-routes").click()
    for key in ("p-updates", "p-search"):
        harbour.page_row(key).click(modifiers=["Control"])
    harbour.page_row("p-search").click(button="right")
    delete_selected_pages(harbour, 3)
    after = harbour.changed_from(start)
    assert page_ids(after) == [key for key in page_ids(start) if key not in {"p-routes", "p-updates", "p-search"}]
    expect(harbour.page.get_by_role("dialog", name="Delete page")).to_be_hidden()
    harbour.undo()
    harbour.restored_to(start)


def test_deleting_every_page_is_not_offered_because_a_site_keeps_one(harbour):
    start = harbour.site()["site"]
    total = len(start["pages"])
    harbour.page_row("home").focus()
    harbour.page.keyboard.press("Control+a")
    expect(harbour.page.locator('#fw-pages-list .list-row[aria-selected="true"]')).to_have_count(total)
    harbour.page_row("p-404").click(button="right")
    item = harbour.menu().get_by_role("menuitem", name=f"Delete {total} pages...")
    expect(item).to_be_disabled()
    expect(item).to_have_attribute("title", "A site keeps at least one page")
    harbour.page.keyboard.press("Escape")
    expect(harbour.page.locator('[role="menu"]:visible')).to_have_count(0)
    expect(harbour.page_rows()).to_have_count(total)
    assert harbour.site()["site"] == start


def test_folding_the_pages_heading_hides_the_list_and_survives_a_reload(harbour):
    head = harbour.page.locator('.fw-fold-head[aria-controls="fw-pages-list"]')
    head.click()
    expect(head).to_have_attribute("aria-expanded", "false")
    expect(harbour.page.locator("#fw-pages-list")).to_be_hidden()
    harbour.page.reload(wait_until="domcontentloaded")
    harbour.page.locator('[data-demo="harbour-ferries"]').wait_for()
    expect(head).to_have_attribute("aria-expanded", "false")
    expect(head).to_have_attribute("title", "Show pages")
    expect(harbour.page.locator("#fw-pages-list")).to_be_hidden()


def drag_row(editor, source, target, fraction):
    editor.layer_row(target).scroll_into_view_if_needed()
    a = editor.layer_row(source).bounding_box()
    b = editor.layer_row(target).bounding_box()
    editor.page.mouse.move(a["x"] + 60, a["y"] + a["height"] / 2)
    editor.page.mouse.down()
    editor.page.mouse.move(b["x"] + 60, b["y"] + b["height"] * fraction, steps=10)


def test_a_drop_into_a_folded_container_unfolds_it_and_shows_the_layer(coldmere):
    row = coldmere.layer_row("hm-btns")
    row.scroll_into_view_if_needed()
    row.locator(".fw-twisty").click()
    expect(row).to_have_attribute("aria-expanded", "false")
    expect(coldmere.layer_row("hm-call")).to_have_count(0)
    start = coldmere.site()["site"]
    drag_row(coldmere, "hm-lead", "hm-btns", 0.5)
    expect(row).to_have_class(re.compile(r"\bis-drop-into\b"))
    coldmere.page.mouse.up()
    after = coldmere.changed_from(start)
    assert children(after, "hm-btns")[-1] == "hm-lead"
    expect(row).to_have_attribute("aria-expanded", "true")
    expect(coldmere.layer_row("hm-lead")).to_be_visible()
    expect(coldmere.layer_row("hm-call")).to_be_visible()
    keys = coldmere.layer_keys()
    assert keys.index("hm-btns") < keys.index("hm-lead")


def test_dragging_one_of_three_selected_layers_moves_all_three_and_keeps_them_selected(coldmere):
    start = coldmere.site()["site"]
    kids = children(start, "hm-hero-copy")
    assert kids[:3] == THREE
    coldmere.layer_row(THREE[0]).click()
    for key in THREE[1:]:
        coldmere.layer_row(key).click(modifiers=["Control"])
    expect(selected_layers(coldmere)).to_have_count(3)
    last = kids[-1]
    drag_row(coldmere, "hm-h1", last, 0.1)
    expect(coldmere.page.locator(".fw-drop-line")).to_be_visible()
    coldmere.page.mouse.up()
    after = coldmere.changed_from(start)
    rest = [key for key in kids if key not in THREE]
    assert children(after, "hm-hero-copy") == rest[:-1] + THREE + rest[-1:]
    expect(selected_layers(coldmere)).to_have_count(3)
    assert sorted(selected_layers(coldmere).evaluate_all("rows => rows.map(r => r.dataset.key)")) == sorted(THREE)
    coldmere.undo()
    coldmere.restored_to(start)


def preview(editor):
    return editor.page.get_by_role("dialog", name="Preview as published")


def test_preview_as_published_offers_rotate_and_device_frame_on_a_phone_width(harbour):
    harbour.page.locator('[data-cmd="view.preview-full"]').click()
    overlay = preview(harbour)
    frame = overlay.locator("iframe.fw-fp-frame:visible").first
    expect(frame).to_be_visible()
    rotate = overlay.get_by_role("button", name="Rotate the device")
    device = overlay.get_by_role("button", name="Device frame")
    expect(rotate).to_be_disabled()
    expect(device).to_be_disabled()
    mobile = overlay.get_by_role("group", name="Preview width").get_by_role("button").filter(has_text="Mobile")
    mobile.click()
    expect(rotate).to_be_enabled()
    expect(device).to_be_enabled()
    harbour.eventually(lambda: frame.bounding_box()["height"] > frame.bounding_box()["width"], "the phone preview to stand upright")
    rotate.click()
    expect(rotate).to_have_attribute("aria-pressed", "true")
    harbour.eventually(lambda: frame.bounding_box()["width"] > frame.bounding_box()["height"], "the preview to turn landscape")
    pressed = device.get_attribute("aria-pressed")
    device.click()
    expect(device).to_have_attribute("aria-pressed", "false" if pressed == "true" else "true")


def test_the_live_responsive_preview_shows_back_to_design_and_a_pressed_refresh_icon(harbour):
    page = harbour.page
    back = page.get_by_role("button", name="Back to design")
    expect(back).to_be_hidden()
    page.locator('[data-menu="View"]').click()
    page.locator('[role="menu"]:visible [data-command="view.preview"]').click()
    expect(back).to_be_visible()
    expect(page.locator('[data-cmd="view.refresh"]')).to_have_attribute("aria-pressed", "true")
    back.click()
    expect(back).to_be_hidden()
    expect(page.locator('[data-cmd="view.refresh"]')).not_to_have_attribute("aria-pressed", "true")


def test_select_on_a_page_issue_in_the_audit_opens_the_page_tab_and_flashes_the_field(harbour):
    harbour.page_row("p-routes").click()
    expect(harbour.page_row("p-routes")).to_have_attribute("aria-current", "page")
    search = harbour.page.get_by_placeholder("Search properties")
    search.fill("description")
    search.press("Enter")
    field = harbour.page.locator('[data-field="seo.description"]')
    expect(field).to_be_focused()
    field.fill("")
    field.press("Tab")
    harbour.until(lambda s: next(p for p in s["pages"] if p["id"] == "p-routes")["seo"]["description"] == "", "the empty description")
    search.fill("")
    harbour.page.locator(".inspector button.quiet", has_text="Design").click()
    expect(field).to_be_hidden()
    harbour.page_row("home").click()
    harbour.page.locator('[data-cmd="page.audit"]').click()
    dialog = harbour.page.get_by_role("dialog", name="SEO & accessibility audit")
    row = dialog.locator('.audit-row[data-page="p-routes"]', has_text="needs a meta description")
    row.get_by_role("button", name="Select").click()
    expect(dialog).to_be_hidden()
    expect(harbour.page_row("p-routes")).to_have_attribute("aria-current", "page")
    expect(harbour.page.locator(".inspector button.quiet", has_text="Page")).to_have_class(re.compile(r"\bactive\b"))
    expect(field).to_be_in_viewport()
    expect(field).to_have_class(re.compile(r"\bfw-flash\b"))
    expect(harbour.status).to_contain_text("Routes needs a meta description")
