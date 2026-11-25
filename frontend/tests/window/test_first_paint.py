import json
import re

from playwright.sync_api import expect

HIDDEN_UNTIL_OPENED = {
    "quick insert flyout": ".fw-flyout",
    "menus": '[role="menu"]',
    "rename field": ".fw-rename-input",
    "property search results": "#inspector-results-list .inspector-result",
    "preview overlay": ".fw-fp",
}

WATCH = """(selectors) => {
  window.__seen = [];
  window.__frames = 0;
  const look = () => {
    window.__frames += 1;
    for (const [name, selector] of Object.entries(selectors)) {
      for (const el of document.querySelectorAll(selector)) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !window.__seen.includes(name)) window.__seen.push(name);
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}"""


def test_on_a_cold_load_no_flyout_menu_rename_field_search_result_or_preview_overlay_is_ever_visible(chromium, fresh_engine):
    context = chromium.new_context(viewport={"width": 1440, "height": 900})
    try:
        page = context.new_page()
        page.add_init_script(f"({WATCH})({json.dumps(HIDDEN_UNTIL_OPENED)})")
        cdp = context.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        page.goto(fresh_engine + "/", wait_until="load")
        expect(page.locator("body")).to_have_class(re.compile(r"\bapp-ready\b"), timeout=60_000)
        page.locator('[data-demo="harbour-ferries"]').click()
        expect(page.locator('#fw-pages-list .list-row[data-key="p-fares"]')).to_be_visible()
        frames = page.evaluate("window.__frames")
        page.wait_for_function("n => window.__frames > n + 30", arg=frames)
        assert page.evaluate("window.__seen") == []
    finally:
        context.close()
