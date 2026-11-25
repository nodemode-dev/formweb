import pytest
from playwright.sync_api import expect

WHOLE_SITE_STARTERS = ["coldmere-plumbing", "northfold-studio", "slow-allotment", "wenlow-type-day", "fernhollow-pottery"]


@pytest.mark.parametrize("demo", WHOLE_SITE_STARTERS)
def test_opening_the_second_page_of_a_whole_site_starter_shows_only_that_page_on_the_canvas(editor, demo):
    editor.page.locator(f'[data-demo="{demo}"]').click()
    expect(editor.page_rows()).not_to_have_count(0)
    editor.page_rows().nth(1).wait_for()
    site = editor.site()["site"]
    home, second = site["pages"][0], site["pages"][1]
    expect(editor.page_row(second["id"])).to_be_visible()
    expect(editor.canvas.locator(f'[data-fw-id="{home["root"]}"]')).to_be_visible()
    editor.page_row(second["id"]).click()
    expect(editor.page_row(second["id"])).to_have_attribute("aria-current", "page")
    expect(editor.canvas.locator(f'[data-fw-id="{second["root"]}"]')).to_be_visible()
    roots = {p["root"] for p in site["pages"]}
    shown = editor.canvas.locator("body > [data-fw-id]:visible").evaluate_all("els => els.map(e => e.dataset.fwId)")
    assert [key for key in shown if key in roots] == [second["root"]]
    expect(editor.canvas.locator(f'[data-fw-id="{home["root"]}"]')).to_be_hidden()


def test_a_new_site_started_from_blank_has_one_empty_page(editor):
    editor.page.locator('[data-run="file.new"]').first.click()
    dialog = editor.page.get_by_role("dialog", name="New website")
    dialog.get_by_placeholder("My website").fill("Mill Lane Pottery")
    expect(dialog.locator('[data-field="new.starter"] option:checked')).to_have_text("Blank")
    dialog.get_by_role("button", name="Create site").click()
    site = editor.until(lambda s: s["name"] == "Mill Lane Pottery", "the new site")
    assert len(site["pages"]) == 1
    assert site["nodes"][site["pages"][0]["root"]]["children"] == []
    expect(editor.status).to_have_text("New site created.")
    expect(editor.page_rows()).to_have_count(1)
    expect(editor.page.locator("#fw-layers-list .layer-row")).to_have_count(1)
    expect(editor.canvas.locator(f'[data-fw-id="{site["pages"][0]["root"]}"] > *')).to_have_count(0)


def test_the_start_screen_points_a_newcomer_to_the_user_guide(editor):
    link = editor.page.get_by_role("link", name="New to FormWeb? Read the guide")
    expect(link).to_be_visible()
    expect(link).to_have_attribute("href", "https://github.com/nodemode-dev/formweb/tree/main/docs/guide")
    expect(link).to_have_attribute("target", "_blank")
