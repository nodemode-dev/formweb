import re

import pytest
from playwright.sync_api import expect

EXAMPLES = {
    "bg": {"Background", "Page background"},
    "rounded": {"Radius"},
    "shadow": {"Shadow"},
    "spacing": {"Letter spacing", "Gap", "Padding", "Margin"},
    "font": {"Font size"},
    "href": {"Link URL", "URL slug", "Base URL"},
    "alt": {"Alternative text", "Accessible label"},
    "seo": {"Title", "Description", "Hide this page from search engines"},
    "padding": {"Padding"},
}


def search(editor):
    return editor.page.get_by_placeholder("Search properties")


def result_names(editor):
    return editor.page.locator("#inspector-results-list .inspector-result-name").all_inner_texts()


def tab(editor, name):
    return editor.page.locator(".inspector button.quiet", has_text=name)


@pytest.fixture
def image_selected(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-hero-img"]').click()
    expect(coldmere.page.locator(".inspector-name")).to_have_text("Hm hero img")
    return coldmere


def test_the_search_shortcut_focuses_the_search_field(image_selected):
    image_selected.page.keyboard.press("Control+Alt+f")
    expect(search(image_selected)).to_be_focused()


def test_the_shortcut_opens_a_closed_right_panel_and_focuses_the_search_field(image_selected):
    image_selected.page.keyboard.press("Control+]")
    expect(search(image_selected)).to_be_hidden()
    image_selected.page.keyboard.press("Control+Alt+f")
    expect(search(image_selected)).to_be_visible()
    expect(search(image_selected)).to_be_focused()


def test_the_plan_example_queries_give_results_grouped_by_tab_and_section(image_selected):
    groups = image_selected.page.locator("#inspector-results-list .inspector-result-place")
    for query, wanted in EXAMPLES.items():
        search(image_selected).fill(query)
        expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
        names = set(result_names(image_selected))
        assert wanted <= names, f"{query!r} gave {sorted(names)}"
        places = groups.all_inner_texts()
        assert places and all(re.fullmatch(r"(Design|Motion|Content|Page) > .+", g) for g in places), query
    search(image_selected).fill("PADDING")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    upper = result_names(image_selected)
    search(image_selected).fill("padding")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    assert result_names(image_selected) == upper


def grouped_results(editor):
    return editor.page.locator("#inspector-results-list").evaluate(
        """list => Array.from(list.querySelectorAll('.inspector-result')).map(node =>
            [node.querySelector('.inspector-result-place').textContent.trim(), node.querySelector('.inspector-result-name').textContent.trim()])"""
    )


def test_the_page_background_field_result_reads_background_without_its_clear_button(coldmere):
    coldmere.canvas.locator('[data-fw-id="hm-h1"]').click()
    expect(coldmere.page.locator(".inspector-name")).to_have_text("Hm h1")
    search(coldmere).fill("bg")
    expect(coldmere.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    page_background = [name for group, name in grouped_results(coldmere) if group == "Page > Page background"]
    assert "Background" in page_background, page_background
    assert not [name for name in result_names(coldmere) if "Clear" in name]


def test_no_field_result_name_ends_with_the_text_of_a_button_for_an_image(image_selected):
    buttons = set()
    for name in ("Design", "Motion", "Content", "Page"):
        tab(image_selected, name).click()
        expect(tab(image_selected, name)).to_have_class(re.compile(r"\bactive\b"))
        buttons |= {text.strip() for text in image_selected.page.locator(".inspector-scroll button").evaluate_all("bs => bs.map(b => b.textContent)") if text.strip()}
    assert "Clear" in buttons
    tab(image_selected, "Design").click()
    for query in ("bg", "background", "alt", "image"):
        search(image_selected).fill(query)
        expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
        joined = [name for name in result_names(image_selected) if name not in buttons and any(name.endswith(button) for button in buttons)]
        assert not joined, f"{query!r}: {joined}"


def test_a_result_shows_its_place_as_text_and_enter_or_a_click_on_it_goes_nowhere(image_selected):
    tab(image_selected, "Content").click()
    expect(tab(image_selected, "Content")).to_have_class(re.compile(r"\bactive\b"))
    search(image_selected).fill("rounded")
    row = image_selected.page.locator("#inspector-results-list .inspector-result").filter(has_text="Radius").first
    expect(row).to_be_visible()
    expect(row.locator(".inspector-result-place")).to_have_text(re.compile(r"^Design > .+"))
    search(image_selected).press("Enter")
    search(image_selected).press("ArrowDown")
    search(image_selected).press("Enter")
    row.click()
    expect(row).to_be_visible()
    expect(tab(image_selected, "Content")).to_have_class(re.compile(r"\bactive\b"))
    expect(tab(image_selected, "Design")).not_to_have_class(re.compile(r"\bactive\b"))
    expect(search(image_selected)).to_be_focused()
    expect(search(image_selected)).to_have_value("rounded")


def test_a_motion_preset_is_found_and_listed_with_its_place(image_selected):
    search(image_selected).fill("fade up")
    rows = image_selected.page.locator("#inspector-results-list .inspector-result")
    expect(rows.first).to_be_visible()
    assert ["Motion > Presets", "Fade up"] in grouped_results(image_selected)


def test_a_query_with_no_match_says_no_matching_properties(image_selected):
    search(image_selected).fill("qqzzxxw")
    expect(image_selected.page.locator(".inspector")).to_contain_text("No matching properties")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result")).to_have_count(0)


def test_escape_clears_the_search_and_restores_the_tab_and_scroll_position(image_selected):
    tab(image_selected, "Content").click()
    scroller = image_selected.page.locator(".inspector-scroll")
    scroller.hover()
    image_selected.page.mouse.wheel(0, 120)
    image_selected.eventually(lambda: scroller.evaluate("e => e.scrollTop") > 0, "the panel to scroll")
    top = scroller.evaluate("e => e.scrollTop")
    search(image_selected).fill("shadow")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    search(image_selected).press("Escape")
    expect(search(image_selected)).to_have_value("")
    expect(tab(image_selected, "Content")).to_have_class(re.compile(r"\bactive\b"))
    expect(image_selected.page.locator("#inspector-results-list .inspector-result:visible")).to_have_count(0)
    assert scroller.evaluate("e => e.scrollTop") == top
