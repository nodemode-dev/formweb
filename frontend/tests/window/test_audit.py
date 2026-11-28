import re

from playwright.sync_api import expect


def audit_dialog(editor):
    return editor.page.get_by_role("dialog", name="SEO & accessibility audit")


def run_audit(editor):
    editor.page.locator('[data-cmd="page.audit"]').click()
    dialog = audit_dialog(editor)
    expect(dialog.locator(".empty-note:visible").first).to_contain_text("found")
    return dialog


def in_view(editor, locator):
    frame = editor.page.locator('iframe[title="Website canvas"]').bounding_box()
    stage = editor.page.locator(".stage").bounding_box()
    top, bottom = max(frame["y"], stage["y"]), min(frame["y"] + frame["height"], stage["y"] + stage["height"])
    box = locator.bounding_box()
    return box is not None and box["height"] > 0 and top <= box["y"] and box["y"] + box["height"] <= bottom


def test_select_on_an_element_issue_brings_the_element_into_view_and_names_the_issue(harbour):
    harbour.layer_row("root").click()
    start = harbour.site()["site"]
    harbour.page.get_by_role("button", name="Insert element").click()
    harbour.page.keyboard.type("Link")
    harbour.page.keyboard.press("Enter")
    site = harbour.changed_from(start)
    link = site["nodes"]["root"]["children"][-1]
    harbour.layer_row("h-bar").click()
    element = harbour.canvas.locator(f'[data-fw-id="{link}"]')
    assert not in_view(harbour, element)
    dialog = run_audit(harbour)
    row = dialog.locator(f'.audit-row[data-node="{link}"]', has_text="Link needs a destination")
    row.get_by_role("button", name="Select").click()
    expect(dialog).to_be_hidden()
    expect(harbour.layer_row(link)).to_have_attribute("aria-selected", "true")
    harbour.eventually(lambda: in_view(harbour, element), "the element to scroll into view")
    expect(harbour.layer_row(link)).to_be_in_viewport()
    expect(harbour.status).to_contain_text(site["nodes"][link]["name"])
    expect(harbour.status).to_contain_text("Link needs a destination")


def test_after_select_a_notice_keeps_the_issue_in_view_and_show_again_goes_back_to_it(harbour):
    harbour.layer_row("root").click()
    start = harbour.site()["site"]
    harbour.page.get_by_role("button", name="Insert element").click()
    harbour.page.keyboard.type("Link")
    harbour.page.keyboard.press("Enter")
    site = harbour.changed_from(start)
    link = site["nodes"]["root"]["children"][-1]
    dialog = run_audit(harbour)
    dialog.locator(f'.audit-row[data-node="{link}"]', has_text="Link needs a destination").get_by_role("button", name="Select").click()
    notice = harbour.page.locator(".fw-notice")
    expect(notice).to_be_visible()
    expect(notice).to_contain_text(f"Selected {site['nodes'][link]['name']}: Link needs a destination")
    harbour.page_row("p-fares").click()
    expect(harbour.page_row("p-fares")).to_have_attribute("aria-current", "page")
    notice.get_by_role("button", name="Show again").click()
    expect(harbour.page_row("home")).to_have_attribute("aria-current", "page")
    expect(harbour.layer_row(link)).to_have_attribute("aria-selected", "true")
    expect(dialog).to_be_hidden()


def test_with_one_issue_the_summary_reads_1_issue_found(harbour):
    harbour.page_row("p-routes").click()
    expect(harbour.page_row("p-routes")).to_have_attribute("aria-current", "page")
    harbour.page.locator(".inspector button.quiet", has_text="Page").click()
    field = harbour.page.locator('[data-field="seo.description"]')
    expect(field).to_be_editable()
    field.fill("")
    field.press("Tab")
    harbour.until(lambda s: next(p for p in s["pages"] if p["id"] == "p-routes")["seo"]["description"] == "", "the empty description")
    dialog = run_audit(harbour)
    expect(dialog.locator(".empty-note:visible").first).to_have_text(re.compile(r"^1 issue found\.(\s|$)"))
    expect(dialog.locator(".audit-row")).to_have_count(1)


def test_an_older_site_with_two_addresses_in_different_capitals_opens_and_select_on_the_audit_issue_shows_the_address(harbour):
    harbour.page_row("p-routes").click()
    site = harbour.site()["site"]
    routes = next(p for p in site["pages"] if p["id"] == "p-routes")
    other = next(p for p in site["pages"] if p["id"] not in ("p-routes",) and p["slug"].strip("/"))
    shouted = "/" + other["slug"].strip("/").upper()
    site["pages"] = [dict(p, slug=shouted) if p["id"] == "p-routes" else p for p in site["pages"]]
    harbour.command("site.replace", {"site": site})
    harbour.until(lambda s: next(p for p in s["pages"] if p["id"] == "p-routes")["slug"] == shouted, "the older site")
    harbour.page_row("home").click()
    dialog = run_audit(harbour)
    row = dialog.locator('.audit-row[data-page="p-routes"]', has_text="capital letters")
    expect(row).to_contain_text(other["name"])
    expect(row).to_contain_text(routes["name"])
    row.get_by_role("button", name="Select").click()
    expect(dialog).to_be_hidden()
    expect(harbour.page_row("p-routes")).to_have_attribute("aria-current", "page")
    field = harbour.page.locator('[data-field="page.slug"]')
    expect(field).to_have_value(shouted)
    expect(field).to_be_in_viewport()
    expect(field).to_have_class(re.compile(r"\bfw-flash\b"))


def test_the_notice_after_select_never_covers_the_field_it_points_to(editor):
    editor.page.locator('[data-run="file.new"]').first.click()
    editor.page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    editor.until(lambda s: len(s["pages"]) == 1, "the new site")
    editor.page.get_by_role("button", name="Add page").click()
    adding = editor.page.get_by_role("dialog", name="Add page")
    adding.get_by_role("textbox", name="Page name").fill("Classes")
    adding.get_by_role("button", name="Add page").click()
    site = editor.until(lambda s: len(s["pages"]) == 2, "the Classes page")
    classes = next(p for p in site["pages"] if p["name"] == "Classes")
    dialog = run_audit(editor)
    dialog.locator(f'.audit-row[data-code="seo.description"][data-page="{classes["id"]}"]').get_by_role("button", name="Select").click()
    field = editor.page.locator('[data-field="seo.description"]')
    notice = editor.page.locator(".fw-notice")
    expect(field).to_be_focused()
    expect(notice).to_be_visible()
    expect(field).to_be_in_viewport()
    a, b = field.bounding_box(), notice.bounding_box()
    apart = a["y"] + a["height"] <= b["y"] or b["y"] + b["height"] <= a["y"] or a["x"] + a["width"] <= b["x"] or b["x"] + b["width"] <= a["x"]
    assert apart, f"the notice {b} covers the field {a}"
