import re

import pytest
from playwright.sync_api import expect

DRAGGING = re.compile(r"\bfw-canvas-dragging\b")
DRAG_WATCH = """() => {
  window.__dragSeen = false;
  new MutationObserver(() => { if (document.body.classList.contains('fw-canvas-dragging')) window.__dragSeen = true; })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
}"""


def menu_entries(editor):
    return {item.inner_text().split("\n")[0]: item.is_disabled() for item in editor.menu().locator('[role="menuitem"]').all()}


def centre(box):
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def test_right_clicking_an_element_on_a_scrolled_zoomed_canvas_opens_the_menu_at_the_pointer_and_selects_it(coldmere):
    page = coldmere.page
    zoom = int(page.locator(".stage").inner_text().split("%")[0].split()[-1])
    assert zoom < 100
    frame = page.locator('iframe[title="Website canvas"]').bounding_box()
    scrolled = lambda: coldmere.canvas.locator("html").evaluate("e => e.ownerDocument.scrollingElement.scrollTop")
    page.mouse.move(*centre(frame))
    page.mouse.wheel(0, 600)
    coldmere.eventually(lambda: scrolled() > 0, "the canvas to scroll")
    x, y = frame["x"] + frame["width"] * 0.3, frame["y"] + 60
    page.mouse.click(x, y, button="right")
    menu = coldmere.menu()
    expect(menu).to_be_visible()
    box = menu.bounding_box()
    assert abs(box["x"] - x) <= 2 and abs(box["y"] - y) <= 2, f"menu {box} is not at the pointer {x}, {y}"
    picked = coldmere.page.locator('#fw-layers-list .layer-row[aria-selected="true"]')
    expect(picked).to_have_count(1)
    key = picked.get_attribute("data-key")
    assert key != "root"
    hit = coldmere.canvas.locator(f'[data-fw-id="{key}"]').bounding_box()
    assert hit["x"] <= x <= hit["x"] + hit["width"] and hit["y"] <= y <= hit["y"] + hit["height"]


def test_the_canvas_menu_offers_only_the_entries_that_apply(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click(button="right")
    text = menu_entries(coldmere)
    assert coldmere.menu().locator('[data-command="style.paste"]').get_attribute("title") == "Copy the styles of an element first"
    coldmere.page.keyboard.press("Escape")
    assert {"Edit text", "Text style", "Wrap in container", "Copy styles"} <= set(text)
    assert "Image source and alt text" not in text and "Link" not in text
    assert text["Paste styles"] is True

    coldmere.canvas.locator('[data-fw-id="hm-hero-img"]').click(button="right")
    image = menu_entries(coldmere)
    coldmere.page.keyboard.press("Escape")
    assert "Image source and alt text" in image
    assert "Edit text" not in image and "Text style" not in image

    coldmere.canvas.locator('[data-fw-id="hm-call"]').click(button="right")
    link = menu_entries(coldmere)
    coldmere.page.keyboard.press("Escape")
    assert "Link" in link and "Edit text" in link


def test_wrap_in_container_puts_the_element_in_a_new_div_and_undo_restores(coldmere):
    start = coldmere.site()["site"]
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click(button="right")
    coldmere.menu().get_by_role("menuitem", name="Wrap in container").click()
    after = coldmere.changed_from(start)
    kids = after["nodes"]["hm-hero-copy"]["children"]
    wrapper = kids[start["nodes"]["hm-hero-copy"]["children"].index("hm-lead")]
    assert after["nodes"][wrapper]["tag"] == "div"
    assert after["nodes"][wrapper]["children"] == ["hm-lead"]
    expect(coldmere.status).to_have_text("Wrapped in a container. The operation is one undo step.")
    expect(coldmere.canvas.locator(f'[data-fw-id="{wrapper}"] > [data-fw-id="hm-lead"]')).to_have_count(1)
    coldmere.undo()
    coldmere.restored_to(start)


def test_copy_styles_then_paste_styles_gives_the_target_exactly_those_styles_and_undo_restores(coldmere):
    start = coldmere.site()["site"]
    source = start["nodes"]["hm-h1"]["styles"]
    assert start["nodes"]["hm-sv-h"]["styles"] != source
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').click(button="right")
    coldmere.menu().get_by_role("menuitem", name="Copy styles").click()
    expect(coldmere.status).to_have_text(f"Copied {len(source)} styles from Hm h1 (Desktop).")
    coldmere.canvas.locator('[data-fw-id="hm-sv-h"]').click(button="right")
    coldmere.menu().get_by_role("menuitem", name="Paste styles").click()
    after = coldmere.changed_from(start)
    assert after["nodes"]["hm-sv-h"]["styles"] == source
    expect(coldmere.status).to_have_text("Pasted the styles of Hm h1 (Desktop). The operation is one undo step.")
    coldmere.undo()
    coldmere.restored_to(start)


@pytest.fixture
def section_with_two_headings(editor):
    editor.page.locator('[data-run="file.new"]').first.click()
    editor.page.get_by_role("dialog", name="New website").get_by_role("button", name="Create site").click()
    expect(editor.page.locator("#fw-layers-list .layer-row")).to_have_count(1)
    for count, name in enumerate(["Section", "Heading", "Heading"], start=2):
        editor.page.get_by_role("button", name="Insert element").click()
        editor.page.keyboard.type(name)
        editor.page.keyboard.press("Enter")
        expect(editor.page.locator("#fw-layers-list .layer-row")).to_have_count(count)
    site = editor.site()["site"]
    section = site["nodes"]["root"]["children"][0]
    first, second = site["nodes"][section]["children"]
    editor.canvas.locator(f'[data-fw-id="{first}"]').click()
    expect(editor.layer_row(first)).to_have_attribute("aria-selected", "true")
    return editor, section, first, second


def test_the_ticket_example_drag_the_first_heading_below_the_second_then_one_undo_restores(section_with_two_headings):
    editor, section, first, second = section_with_two_headings
    start = editor.site()["site"]
    a = editor.canvas.locator(f'[data-fw-id="{first}"]').bounding_box()
    b = editor.canvas.locator(f'[data-fw-id="{second}"]').bounding_box()
    pointer = editor.canvas_pointer()
    pointer.move(a["x"] + 20, a["y"] + a["height"] / 2)
    pointer.down()
    pointer.move(a["x"] + 20, b["y"] + b["height"] - 3, steps=15, held=True)
    expect(editor.page.locator("body")).to_have_class(DRAGGING)
    pointer.up()
    after = editor.changed_from(start)
    assert after["nodes"][section]["children"] == [second, first]
    expect(editor.page.locator(f"#fw-layers-list .layer-row")).to_have_count(4)
    assert editor.layer_keys() == ["root", section, second, first]
    assert editor.canvas.locator(f'[data-fw-id="{section}"] > *').evaluate_all("els => els.map(e => e.dataset.fwId)") == [second, first]
    expect(editor.layer_row(first)).to_have_attribute("aria-selected", "true")
    editor.undo()
    editor.restored_to(start)
    expect(editor.page.locator("#fw-layers-list .layer-row").nth(2)).to_have_attribute("data-key", first)


def test_escape_during_a_canvas_drag_cancels_it_and_nothing_moves(section_with_two_headings):
    editor, section, first, second = section_with_two_headings
    start = editor.site()["site"]
    a = editor.canvas.locator(f'[data-fw-id="{first}"]').bounding_box()
    b = editor.canvas.locator(f'[data-fw-id="{second}"]').bounding_box()
    pointer = editor.canvas_pointer()
    pointer.move(a["x"] + 20, a["y"] + a["height"] / 2)
    pointer.down()
    pointer.move(a["x"] + 20, b["y"] + b["height"] - 3, steps=15, held=True)
    expect(editor.page.locator("body")).to_have_class(DRAGGING)
    editor.page.keyboard.press("Escape")
    pointer.up()
    expect(editor.status).to_have_text("Drag cancelled. Nothing moved.")
    assert editor.site()["site"] == start


def test_a_click_a_double_click_and_a_ctrl_click_never_start_a_drag(coldmere):
    start = coldmere.site()["site"]
    coldmere.page.evaluate(DRAG_WATCH)
    coldmere.canvas.locator('[data-fw-id="hm-eyebrow"]').click()
    expect(coldmere.layer_row("hm-eyebrow")).to_have_attribute("aria-selected", "true")
    coldmere.canvas.locator('[data-fw-id="hm-lead"]').click(modifiers=["Control"])
    expect(coldmere.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    expect(coldmere.layer_row("hm-eyebrow")).to_have_attribute("aria-selected", "true")
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').dblclick()
    expect(coldmere.canvas.locator('[data-fw-text="hm-h1"][contenteditable="true"]')).to_be_visible()
    assert coldmere.page.evaluate("window.__dragSeen") is False
    assert coldmere.site()["site"] == start
