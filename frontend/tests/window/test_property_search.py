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
    groups = image_selected.page.locator("#inspector-results-list .inspector-results-group")
    for query, wanted in EXAMPLES.items():
        search(image_selected).fill(query)
        expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
        names = set(result_names(image_selected))
        assert wanted <= names, f"{query!r} gave {sorted(names)}"
        assert all(re.fullmatch(r"(Design|Motion|Content|Page) > .+", g) for g in groups.all_inner_texts()), query
    search(image_selected).fill("PADDING")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    upper = result_names(image_selected)
    search(image_selected).fill("padding")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    assert result_names(image_selected) == upper


@pytest.mark.xfail(strict=True, reason="TEST_PLAN 6 says no result's name contains a button's text; with an image selected, bg lists a result named 'Remove background...', the text of the button in the Content tab")
def test_no_search_result_is_named_after_a_button(image_selected):
    tab(image_selected, "Content").click()
    buttons = {text.strip() for text in image_selected.page.locator(".inspector-scroll button:visible").all_inner_texts() if text.strip()}
    tab(image_selected, "Design").click()
    search(image_selected).fill("bg")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_be_visible()
    assert not [name for name in result_names(image_selected) if any(button in name for button in buttons)]


def test_enter_switches_to_the_tab_of_the_field_and_focuses_it(image_selected):
    tab(image_selected, "Content").click()
    expect(tab(image_selected, "Content")).to_have_class(re.compile(r"\bactive\b"))
    search(image_selected).fill("rounded")
    expect(image_selected.page.locator("#inspector-results-list .inspector-result").first).to_contain_text("Radius")
    search(image_selected).press("Enter")
    expect(tab(image_selected, "Design")).to_have_class(re.compile(r"\bactive\b"))
    focused = image_selected.page.evaluate("document.activeElement.closest('.field')?.querySelector('.field-label')?.firstChild?.textContent.trim()")
    assert focused == "Radius"


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
