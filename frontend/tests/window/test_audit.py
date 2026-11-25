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


def test_with_one_issue_the_summary_reads_1_issue_found(harbour):
    harbour.page_row("p-routes").click()
    expect(harbour.page_row("p-routes")).to_have_attribute("aria-current", "page")
    search = harbour.page.get_by_placeholder("Search properties")
    search.fill("description")
    search.press("Enter")
    field = harbour.page.locator("*:focus")
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
