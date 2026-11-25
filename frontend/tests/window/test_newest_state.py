import re

from playwright.sync_api import expect

OWN_CHANGE = re.compile(r"/api/(command|batch)$")
TWO_FRAMES = "() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))"


def test_a_late_answer_to_the_windows_own_change_does_not_replace_a_newer_site(editor):
    page = editor.page
    revision_shown = page.locator("footer.statusbar .status-revision")
    page.locator('[data-run="file.new"]').first.click()
    page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    expect(page.locator("#fw-layers-list .layer-row")).to_have_count(1)
    start = editor.site()["site"]
    root = start["pages"][0]["root"]
    held = []
    page.route(OWN_CHANGE, lambda route: route.continue_() if held else held.append((route, route.fetch())))
    page.get_by_role("button", name="Insert element").click()
    page.keyboard.type("Paragraph")
    page.keyboard.press("Enter")
    editor.eventually(lambda: held, "the window's own change to reach the engine")
    route, answer = held[0]
    own = answer.json()["revision"]
    outside = editor.command("node.update", {"id": root, "patch": {"styles": {"color": "#123456"}}})["revision"]
    assert outside > own
    expect(revision_shown).to_contain_text(re.compile(rf"\brev {outside}\b"))
    with page.expect_event("requestfinished", lambda request: OWN_CHANGE.search(request.url)):
        route.fulfill(response=answer)
    page.evaluate(TWO_FRAMES)
    expect(revision_shown).to_contain_text(re.compile(rf"\brev {outside}\b"))
    expect(editor.canvas.locator(f'[data-fw-id="{root}"]')).to_have_attribute("style", re.compile("color"))
    site = editor.site()
    assert site["revision"] == outside
    assert len(site["site"]["nodes"][root]["children"]) == 1
    expect(page.locator("#fw-layers-list .layer-row")).to_have_count(2)
