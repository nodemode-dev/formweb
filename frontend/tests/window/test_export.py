import json
import re
import zipfile

from playwright.sync_api import expect


def export_button(editor):
    return editor.page.locator('[data-cmd="file.export"]')


def notice(editor):
    return editor.page.locator(".fw-notice")


def test_export_shows_the_busy_state_then_names_the_downloaded_zip_which_holds_routes_json(harbour, tmp_path):
    held = []
    harbour.page.route("**/api/export?*", lambda route: held.append(route))
    button = export_button(harbour)
    size = button.bounding_box()
    with harbour.page.expect_download() as download:
        button.click()
        expect(button).to_have_attribute("aria-busy", "true")
        expect(button).to_be_disabled()
        harbour.eventually(lambda: bool(held), "the export request")
        assert button.bounding_box() == size
        held[0].continue_()
    name = download.value.suggested_filename
    assert name.endswith("-site.zip")
    saved = tmp_path / name
    download.value.save_as(saved)
    with zipfile.ZipFile(saved) as archive:
        assert archive.testzip() is None
        routes = json.loads(archive.read("routes.json"))
    assert routes
    expect(notice(harbour)).to_contain_text(f"Downloaded {name}")
    expect(button).to_be_enabled()
    expect(button).not_to_have_attribute("aria-busy", "true")


def test_a_failed_export_shows_a_red_notice_with_the_reason_and_the_button_works_again(harbour):
    harbour.page.route("**/api/export?*", lambda route: route.fulfill(status=500, json={"detail": "The disk is full."}))
    export_button(harbour).click()
    expect(notice(harbour)).to_be_visible()
    expect(notice(harbour).locator(".fw-notice-bad")).to_be_visible()
    expect(notice(harbour).locator(".fw-notice-ok")).to_be_hidden()
    expect(harbour.status).to_contain_text("The disk is full.")
    expect(export_button(harbour)).to_be_enabled()
    harbour.page.unroute("**/api/export?*")
    with harbour.page.expect_download() as download:
        export_button(harbour).click()
    assert re.fullmatch(r".+-site\.zip", download.value.suggested_filename)
