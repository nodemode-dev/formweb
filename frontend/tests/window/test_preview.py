from playwright.sync_api import expect


def eye(editor):
    return editor.page.locator('[data-cmd="view.preview-full"]')


def overlay(editor):
    return editor.page.get_by_role("dialog", name="Preview as published")


def shown_frame(editor):
    return overlay(editor).locator("iframe.fw-fp-frame:visible")


def test_the_eye_button_opens_the_published_site_over_the_whole_window(harbour):
    eye(harbour).click()
    expect(overlay(harbour)).to_be_visible()
    assert overlay(harbour).bounding_box() == {"x": 0, "y": 0, **harbour.page.viewport_size}
    expect(shown_frame(harbour)).to_have_count(1)
    assert shown_frame(harbour).first.get_attribute("src").startswith(f"{harbour.base}/preview/")


def test_there_is_one_width_button_per_breakpoint_plus_full_width_and_each_sets_the_width(harbour):
    names = [bp["name"] for bp in harbour.site()["site"]["breakpoints"]]
    eye(harbour).click()
    buttons = overlay(harbour).get_by_role("group", name="Preview width").get_by_role("button")
    expect(buttons).to_have_count(len(names) + 1)
    labels = buttons.all_inner_texts()
    assert labels[0] == "Full width"
    assert [label.split()[0] for label in labels[1:]] == names
    mobile = buttons.filter(has_text="Mobile")
    width = int(mobile.inner_text().split()[-1])
    mobile.click()
    expect(mobile).to_have_attribute("aria-pressed", "true")
    harbour.eventually(lambda: round(shown_frame(harbour).first.bounding_box()["width"]) == width, f"the preview to be {width} px wide")
    buttons.first.click()
    expect(buttons.first).to_have_attribute("aria-pressed", "true")
    harbour.eventually(lambda: shown_frame(harbour).first.bounding_box()["width"] > width, "the preview to be full width")


def test_close_shuts_the_preview_and_focus_returns_to_the_eye_button(harbour):
    eye(harbour).click()
    expect(overlay(harbour)).to_be_visible()
    overlay(harbour).get_by_role("button", name="Close").click()
    expect(overlay(harbour)).to_be_hidden()
    expect(eye(harbour)).to_be_focused()


def test_escape_shuts_the_preview_and_focus_returns_to_the_eye_button(harbour):
    eye(harbour).click()
    expect(overlay(harbour)).to_be_visible()
    harbour.page.keyboard.press("Escape")
    expect(overlay(harbour)).to_be_hidden()
    expect(eye(harbour)).to_be_focused()


def test_the_preview_shortcut_opens_and_closes_it(harbour):
    harbour.page.keyboard.press("Control+Shift+P")
    expect(overlay(harbour)).to_be_visible()
    harbour.page.keyboard.press("Control+Shift+P")
    expect(overlay(harbour)).to_be_hidden()
    expect(eye(harbour)).to_be_focused()


def test_editor_shortcuts_do_nothing_while_the_preview_is_open(harbour):
    harbour.layer_row("h-bar").click()
    start = harbour.site()["site"]
    eye(harbour).click()
    expect(overlay(harbour)).to_be_visible()
    for key in ("Delete", "Backspace", "Control+d", "Control+Shift+L", "Control+Alt+f"):
        harbour.page.keyboard.press(key)
    expect(harbour.page.locator('.fw-flyout[aria-label="Quick insert"]')).to_be_hidden()
    expect(overlay(harbour)).to_be_visible()
    assert harbour.site()["site"] == start
    harbour.page.keyboard.press("Escape")
    expect(overlay(harbour)).to_be_hidden()
    expect(harbour.layer_row("h-bar")).to_be_visible()
    assert harbour.site()["site"] == start
