import io
import zipfile
from urllib.parse import urlsplit

from playwright.sync_api import expect

PAGE = """<!doctype html><html><head><title>Corner Bakery</title><style>
body { margin: 0; font-family: Georgia, serif; color: #2b2118; }
.top { background: #6b3e26; color: #fff; padding: 24px; }
.row { display: flex; gap: 16px; padding: 24px; }
.card { flex: 1 1 0; border: 1px solid #d8c3a5; padding: 16px; }
</style></head><body>
<header class="top"><h1 id="title">Fresh bread every morning</h1></header>
<div class="row"><div class="card"><h2>Loaves</h2><p>Baked at five.</p></div><div class="card"><h2>Cakes</h2><p>To order.</p></div></div>
<script>document.title = 'ran';</script>
</body></html>"""

HOSTILE = """<!doctype html><html><head><title>Hostile</title>
<link rel="stylesheet" href="https://evil.example/linked.css">
<style>@import url("https://evil.example/imported.css"); .card { background-image: url(https://evil.example/card.png); padding: 12px; }</style>
</head><body onload="fetch('https://evil.example/onload')">
<h1 onclick="fetch('https://evil.example/onclick')">Safe heading</h1>
<div class="card" onmouseover="fetch('https://evil.example/hover')" style="background: url('https://evil.example/inline.png')">Card text</div>
<a href="javascript:fetch('https://evil.example/js-link')">Script link</a>
<iframe src="https://evil.example/frame"></iframe>
<object data="https://evil.example/object"></object>
<svg width="10" height="10"><image href="https://evil.example/svg.png" width="10" height="10"/></svg>
<script>fetch('https://evil.example/inline-script')</script>
</body></html>"""


def site_zip(tmp_path):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr("index.html", PAGE)
    path = tmp_path / "bakery.zip"
    path.write_bytes(data.getvalue())
    return path


def nodes_with(site, tag, text):
    return [n for n in site["nodes"].values() if n["tag"] == tag and n["text"] == text]


def code_sections(site):
    return (site.get("extensions", {}).get("code") or {}).get("sections") or {}


def import_html_as_code(editor, html):
    with editor.page.expect_file_chooser():
        editor.page.evaluate("window.formweb.run('file.import-site')")
    editor.page.keyboard.press("Escape")
    editor.page.locator(".fw-lib-site-back").click()
    panel = editor.page.locator(".fw-lib-import:not(.fw-lib-site)")
    panel.locator("textarea.fw-lib-code").first.fill(html)
    panel.locator('[data-bring="code"]').click()
    panel.locator(".fw-lib-insert").click()
    site = editor.until(lambda s: len(code_sections(s)) == 1, "the page to arrive as one code section")
    return site, next(iter(code_sections(site)))


def test_a_page_too_large_for_one_conversion_is_imported_as_code_and_the_panel_says_why_in_words(editor):
    with editor.page.expect_file_chooser():
        editor.page.evaluate("window.formweb.run('file.import-site')")
    editor.page.keyboard.press("Escape")
    editor.page.locator(".fw-lib-site-back").click()
    panel = editor.page.locator(".fw-lib-import:not(.fw-lib-site)")
    panel.locator("textarea.fw-lib-code").first.fill("<main>" + "".join(f"<p>Line {i}</p>" for i in range(600)) + "</main>")
    expect(panel.locator('[data-bring="elements"]')).to_have_attribute("aria-checked", "true")
    panel.locator(".fw-lib-insert").click()
    expect(panel.locator(".fw-lib-note")).to_contain_text("The pages stayed code sections: This page has more than 480 elements, more than one conversion makes. Convert it one part at a time")
    assert len(code_sections(editor.site()["site"])) == 1


def test_a_zip_imported_as_editable_elements_gives_a_heading_layer_whose_text_is_edited_on_the_canvas(editor, tmp_path):
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate("window.formweb.run('file.import-site')")
    chooser.value.set_files(str(site_zip(tmp_path)))
    review = editor.page.locator(".fw-lib-site")
    expect(review.locator('[data-bring="elements"]')).to_have_attribute("aria-checked", "true")
    review.locator(".fw-lib-insert:not([disabled])").click()
    expect(review.locator(".fw-lib-note")).to_contain_text("Converted")
    expect(review.locator(".fw-lib-note")).to_contain_text("1 part stayed as code: a script.")
    site = editor.until(lambda s: nodes_with(s, "h1", "Fresh bread every morning"), "the heading to become an element")
    heading = nodes_with(site, "h1", "Fresh bread every morning")[0]
    assert heading["attrs"].get("id") == "title"
    assert len(nodes_with(site, "h2", "Loaves")) == 1
    editor.page.evaluate("window.formweb.run('window.layers')")
    editor.layer_row(heading["id"]).click()
    expect(editor.canvas.locator(f'[data-fw-id="{heading["id"]}"]')).to_have_attribute("data-fw-selected", "")
    editor.canvas.locator(f'[data-fw-id="{heading["id"]}"]').dblclick()
    editor.page.keyboard.type("Warm bread all day")
    editor.page.keyboard.press("Tab")
    edited = editor.until(lambda s: nodes_with(s, "h1", "Warm bread all day"), "the heading text to change")
    editor.undo()
    editor.restored_to(site)
    assert nodes_with(edited, "h1", "Warm bread all day")[0]["id"] == heading["id"]


def test_converting_a_code_section_from_the_canvas_menu_makes_elements_and_one_undo_brings_the_code_back(editor):
    before, host = import_html_as_code(editor, PAGE)
    editor.canvas.locator(f'[data-fw-id="{host}"]').click(button="right")
    editor.menu().get_by_role("menuitem", name="Convert to editable elements...").click()
    dialog = editor.page.locator(".fw-convert")
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="Convert", exact=True).click()
    expect(editor.page.locator(".fw-notice-text")).to_contain_text("Converted")
    after = editor.until(lambda s: host not in code_sections(s), "the code section to become elements")
    assert after["nodes"][host]["children"]
    assert len(nodes_with(after, "h2", "Cakes")) == 1
    cards = [n for n in after["nodes"].values() if n["name"] == "Container card"]
    assert [c["styles"].get("flex-grow") for c in cards] == ["1", "1"]
    editor.undo()
    editor.restored_to(before)


def test_hostile_html_converts_to_nothing_that_runs_and_no_request_leaves_for_an_outside_host(editor):
    outside = []
    editor.page.context.on("request", lambda request: outside.append(request.url) if urlsplit(request.url).hostname not in (None, "127.0.0.1") and urlsplit(request.url).scheme in ("http", "https") else None)
    _, host = import_html_as_code(editor, HOSTILE)
    answer = editor.page.evaluate("h => window.formweb.run('library.convert-section', {node: h, keepScript: false})", host)
    assert answer["ran"] is True
    assert "Converted" in answer["result"]["message"]
    site = editor.until(lambda s: host not in code_sections(s), "the code section to become elements")
    kept = code_sections(site)
    assert not any(record.get("js") or "<script" in record.get("html", "").lower() for record in kept.values())
    assert not any(name.startswith("on") for node in site["nodes"].values() for name in node["attrs"])
    assert not any(value.lower().startswith("javascript:") for node in site["nodes"].values() for value in node["attrs"].values())
    expect(editor.canvas.locator(f'[data-fw-id="{host}"] h1')).to_have_text("Safe heading")
    assert editor.canvas.locator(f'[data-fw-id="{host}"] script').count() == 0
    assert editor.canvas.locator(f'[data-fw-id="{host}"] [onclick], [data-fw-id="{host}"] [onmouseover]').count() == 0
    editor.page.wait_for_timeout(500)
    assert outside == []
