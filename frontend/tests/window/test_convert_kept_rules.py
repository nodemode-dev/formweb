import io
import json
import re
import urllib.error
import urllib.request
import zipfile
from urllib.parse import urlsplit

from playwright.sync_api import expect

OUTSIDE = "styles.outside.example"

CARD = {
    "background-color": "rgb(24, 32, 48)",
    "border-top-width": "3px",
    "border-top-style": "solid",
    "border-top-color": "rgb(200, 100, 50)",
    "padding-top": "14px",
    "padding-left": "14px",
    "border-top-left-radius": "9px",
    "font-size": "19px",
    "font-weight": "700",
    "color": "rgb(255, 255, 255)",
    "letter-spacing": "2px",
}

BOARD = """<!doctype html><html><head><title>Card board</title><style>
@import url("https://styles.outside.example/theme.css");
@font-face { font-family: "Neverface"; src: local("Georgia"); }
@font-face { font-family: "Boardface"; src: local("Georgia"); }
@keyframes cardspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes neverspin { from { opacity: 0; } to { opacity: 1; } }
body { margin: 0; font-family: Georgia, serif; color: rgb(20, 30, 40); }
h1 { font-size: 40px; font-weight: 600; color: rgb(120, 30, 30); }
#board { display: flex; gap: 12px; padding: 20px; background-color: rgb(230, 235, 240); }
.card { background-color: rgb(24, 32, 48); border: 3px solid rgb(200, 100, 50); padding: 14px; border-radius: 9px; font-size: 19px; font-weight: 700; color: rgb(255, 255, 255); font-family: Boardface, Georgia, serif; }
.spinner { display: inline-block; width: 8px; height: 8px; animation: cardspin 3s linear infinite; }
#status.ready { color: rgb(0, 128, 0); }
[data-fw-node] { outline: 5px solid rgb(255, 0, 0); }
@media (min-width: 1px) { .card { letter-spacing: 2px; } h1 { letter-spacing: 5px; } }
</style></head><body>
<h1 id="title">Card board</h1>
<p id="status">Waiting</p>
<div id="board"></div>
<script>
var board = document.getElementById('board');
for (var i = 0; i < 3; i++) {
  var card = document.createElement('article');
  card.className = 'card';
  card.textContent = 'Card ' + (i + 1);
  var spin = document.createElement('span');
  spin.className = 'spinner';
  card.appendChild(spin);
  board.appendChild(card);
}
var status = document.getElementById('status');
status.classList.add('ready');
status.textContent = 'Ready';
</script>
</body></html>"""

STYLE_RULES = 9
FOR_BUILT_CONTENT = 4
AIMED_AT_CONVERTED_ELEMENTS = 1

LOOK = "(e, names) => { const s = getComputedStyle(e); return Object.fromEntries(names.map(n => [n, s.getPropertyValue(n)])); }"
MEASURED = ["color", "font-size", "font-weight", "letter-spacing", "margin-top", "outline-style", "background-color", "padding-top", "display", "column-gap", "border-top-style"]


def code_sections(site):
    return (site.get("extensions", {}).get("code") or {}).get("sections") or {}


def nodes_with(site, tag, text):
    return [n for n in site["nodes"].values() if n["tag"] == tag and n["text"] == text]


def by_attr_id(site, value):
    return next(n for n in site["nodes"].values() if n["attrs"].get("id") == value)


def written(tmp_path, name, html):
    path = tmp_path / name
    path.write_text(html, "utf-8")
    return path


def pick(editor, *paths, command="file.import-html"):
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate(f"window.formweb.run('{command}')")
    chooser.value.set_files([str(p) for p in paths])
    view = editor.page.locator(".fw-lib-site")
    expect(view.locator(".fw-lib-site-review .fw-lib-site-item")).to_have_count(len(paths))
    return view


def import_as_elements(editor, path, section=False, wait=60_000):
    view = pick(editor, path)
    if section:
        view.get_by_role("radio", name="As a section of this page").click()
    view.locator('[data-bring="elements"]').click()
    expect(view.locator('[data-bring="elements"]')).to_have_attribute("aria-checked", "true")
    view.locator(".fw-lib-insert:not([disabled])").click()
    note = view.locator(".fw-lib-note")
    expect(note).to_contain_text("Converted", timeout=wait)
    return note.inner_text()


def import_as_code(editor, *paths):
    before = code_sections(editor.site()["site"])
    view = pick(editor, *paths)
    view.locator('[data-bring="code"]').click()
    view.locator(".fw-lib-insert:not([disabled])").click()
    site = editor.until(lambda s: len(code_sections(s)) == len(before) + len(paths), "the pages to arrive as code sections")
    return site, [key for key in code_sections(site) if key not in before]


def kept_count(sentence):
    found = re.search(r"Kept (\d+) style rules? for the content the page's script builds\.", sentence)
    assert found, f"the result sentence does not say how many style rules were kept: {sentence!r}"
    return int(found.group(1))


def preview(editor):
    editor.page.locator('[data-cmd="view.preview-full"]').click()
    overlay = editor.page.get_by_role("dialog", name="Preview as published")
    expect(overlay.locator("iframe.fw-fp-frame:visible")).to_have_count(1)
    return overlay.frame_locator("iframe.fw-fp-frame:visible")


def close_preview(editor):
    editor.page.keyboard.press("Escape")
    expect(editor.page.get_by_role("dialog", name="Preview as published")).to_be_hidden()


def exported(editor, folder):
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as reply:
        zipfile.ZipFile(io.BytesIO(reply.read())).extractall(folder)
    return folder


def published(chromium, file, scripts=True):
    context = chromium.new_context(viewport={"width": 1440, "height": 900}, java_script_enabled=scripts)
    page = context.new_page()
    page.goto(file.as_uri())
    return context, page


def look(locator, names):
    return locator.evaluate(LOOK, names)


def expect_styled_cards(frame, where):
    cards = frame.locator("article.card")
    expect(cards).to_have_count(3)
    for index in range(3):
        shown = look(cards.nth(index), list(CARD))
        assert shown == CARD, f"{where}, script-built card {index + 1} does not have the page stylesheet's look: {shown}"


def outside_requests(context):
    seen = []
    context.on("request", lambda request: seen.append(request.url) if urlsplit(request.url).hostname == OUTSIDE else None)
    return seen


def test_cards_the_kept_script_builds_are_styled_in_preview_as_the_page_stylesheet_says(editor, tmp_path):
    asked = outside_requests(editor.page.context)
    import_as_elements(editor, written(tmp_path, "board.html", BOARD))
    frame = preview(editor)
    expect_styled_cards(frame, "in Preview")
    expect(frame.locator("#status")).to_have_text("Ready")
    expect(frame.locator("#status")).to_have_css("color", "rgb(0, 128, 0)")
    expect(frame.locator(".spinner").first).to_have_css("animation-name", "cardspin")
    assert asked == [], f"a request went to the host of the page's @import: {asked}"


def test_cards_the_kept_script_builds_are_styled_in_the_exported_site(editor, chromium, tmp_path):
    import_as_elements(editor, written(tmp_path, "board.html", BOARD))
    folder = exported(editor, tmp_path / "export")
    context, page = published(chromium, folder / "board" / "index.html")
    asked = outside_requests(context)
    try:
        expect(page.locator("#status")).to_have_text("Ready")
        expect_styled_cards(page, "in the export")
        expect(page.locator("#status")).to_have_css("color", "rgb(0, 128, 0)")
        expect(page.locator(".spinner").first).to_have_css("animation-name", "cardspin")
        families = page.evaluate("() => document.fonts.ready.then(() => [...document.fonts].map(f => f.family.replace(/[\"']/g, '')))")
        assert "Boardface" in families, f"the font face a kept rule uses is missing from the export: {families}"
        assert "Neverface" not in families, f"the font face no kept rule uses came along: {families}"
        assert asked == [], f"the exported page asked the host of the page's @import: {asked}"
    finally:
        context.close()


def test_the_result_sentence_says_how_many_style_rules_were_kept_for_the_script(editor, tmp_path):
    sentence = import_as_elements(editor, written(tmp_path, "board.html", BOARD))
    count = kept_count(sentence)
    low, high = FOR_BUILT_CONTENT, FOR_BUILT_CONTENT + AIMED_AT_CONVERTED_ELEMENTS
    assert low <= count <= high < STYLE_RULES, f"of the page's {STYLE_RULES} style rules {low} match only what the script builds and {AIMED_AT_CONVERTED_ELEMENTS} only the converted elements' own attribute, but the sentence says {count} were kept: {sentence!r}"


def test_the_kept_css_holds_no_import_only_the_keyframes_and_faces_kept_rules_use_and_a_media_block_with_only_its_kept_rule(editor, tmp_path):
    import_as_elements(editor, written(tmp_path, "board.html", BOARD))
    site = editor.site()["site"]
    kept = [record["css"] for record in code_sections(site).values() if record.get("js") and record.get("css")]
    assert len(kept) == 1, f"expected the kept script's code section to carry the kept rules: {code_sections(site)}"
    rules = editor.page.evaluate("""css => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
      return [...sheet.cssRules].map(r => ({type: r.constructor.name, name: r.name || '', family: r.style ? r.style.getPropertyValue('font-family').replace(/["']/g, '') : '',
        inner: r.cssRules && r.constructor.name === 'CSSMediaRule' ? [...r.cssRules].map(x => x.selectorText) : []})); }""", kept[0])
    assert OUTSIDE not in kept[0] and "@import" not in kept[0], f"the outside @import was kept: {kept[0][:400]!r}"
    assert {r["name"] for r in rules if r["type"] == "CSSKeyframesRule"} == {"cardspin"}, f"kept keyframes: {rules}"
    assert {r["family"] for r in rules if r["type"] == "CSSFontFaceRule"} == {"Boardface"}, f"kept font faces: {rules}"
    media = [r["inner"] for r in rules if r["type"] == "CSSMediaRule"]
    assert len(media) == 1 and len(media[0]) == 1 and media[0][0].split(":where")[0].rstrip().endswith(".card") and "h1" not in media[0][0], f"the @media block should keep only its .card rule: {media}"


def test_converted_heading_and_container_look_as_on_the_original_page_on_the_canvas_and_in_the_export_with_scripts_off(editor, chromium, tmp_path):
    source = written(tmp_path, "board.html", BOARD)
    context, original = published(chromium, source, scripts=False)
    want = {name: look(original.locator(selector), MEASURED) for name, selector in (("heading", "#title"), ("container", "#board"))}
    context.close()
    assert want["heading"]["outline-style"] == "none" and want["container"]["background-color"] == "rgb(230, 235, 240)"
    import_as_elements(editor, source)
    site = editor.site()["site"]
    keys = {"heading": by_attr_id(site, "title")["id"], "container": by_attr_id(site, "board")["id"]}
    for name, key in keys.items():
        on_canvas = look(editor.canvas.locator(f'[data-fw-id="{key}"]'), MEASURED)
        assert on_canvas == want[name], f"on the canvas the converted {name} differs from the original page: {on_canvas} against {want[name]}"
    folder = exported(editor, tmp_path / "export")
    context, page = published(chromium, folder / "board" / "index.html", scripts=False)
    try:
        for name, key in keys.items():
            shown = look(page.locator(f'[data-fw-node="{key}"]'), MEASURED)
            assert shown == want[name], f"in the export with scripts off the converted {name} differs from the original page: {shown} against {want[name]}"
    finally:
        context.close()
    context, page = published(chromium, folder / "board" / "index.html")
    try:
        expect_styled_cards(page, "in the same export with scripts on")
    finally:
        context.close()


def convert_in_dialog(editor, host, keep):
    editor.canvas.locator(f'[data-fw-id="{host}"]').click(button="right")
    editor.menu().get_by_role("menuitem", name="Convert to editable elements...").click()
    dialog = editor.page.locator(".fw-convert")
    expect(dialog).to_be_visible()
    box = dialog.get_by_role("checkbox", name="Keep the page's script as a code section")
    if box.is_checked() != keep:
        box.click()
    expect(box).to_be_checked(checked=keep)
    dialog.get_by_role("button", name="Convert", exact=True).click()
    notice = editor.page.locator(".fw-notice-text")
    expect(notice).to_contain_text("Converted", timeout=60_000)
    editor.until(lambda s: host not in code_sections(s), "the code section to become elements")
    return notice.inner_text()


def test_converting_with_the_script_not_kept_keeps_no_rules_and_says_nothing_of_them(editor, tmp_path):
    before, (host,) = import_as_code(editor, written(tmp_path, "board.html", BOARD))
    editor.page.evaluate("window.formweb.run('window.layers')")
    page = next(p for p in before["pages"] if p["name"] == "Card board")
    editor.page_row(page["id"]).click()
    sentence = convert_in_dialog(editor, host, keep=False)
    after = editor.site()["site"]
    assert "style rule" not in sentence, f"a sentence about kept rules appeared without the script: {sentence!r}"
    assert not any(record.get("css") for record in code_sections(after).values()), f"CSS was kept without the script: {code_sections(after)}"
    assert not any(record.get("js") for record in code_sections(after).values())
    editor.undo()
    editor.restored_to(before)
    expect(editor.page.locator(".fw-convert")).to_be_hidden()
    again = convert_in_dialog(editor, host, keep=True)
    assert kept_count(again) >= 1, "the same page with its script kept was expected to keep rules"


FILL = {
    "a page whose html and body are 100% high": """<!doctype html><html><head><title>Tall page</title><style>
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; font-family: Georgia, serif; }
.grow { flex: 1 1 auto; background-color: rgb(240, 240, 200); }
#foot { background-color: rgb(40, 40, 40); color: rgb(255, 255, 255); padding: 10px; }
</style></head><body><div class="grow"><h1>Tall page</h1></div><footer id="foot">Foot of the page</footer></body></html>""",
    "a page whose body is at least 100vh high": """<!doctype html><html><head><title>Tall page</title><style>
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; font-family: Georgia, serif; }
.grow { flex: 1 1 auto; background-color: rgb(240, 240, 200); }
#foot { background-color: rgb(40, 40, 40); color: rgb(255, 255, 255); padding: 10px; }
</style></head><body><div class="grow"><h1>Tall page</h1></div><footer id="foot">Foot of the page</footer></body></html>""",
}

HEIGHTS = """(e, foot) => ({ view: innerHeight, top: e.getBoundingClientRect().top + scrollY, height: e.getBoundingClientRect().height,
  foot: document.querySelector(foot).getBoundingClientRect().bottom + scrollY })"""


def converted_tall_page(editor, chromium, tmp_path, layout):
    n = list(FILL).index(layout) + 1
    html = FILL[layout].replace("Tall page", f"Tall page {n}").replace('id="foot"', f'id="foot-{n}"').replace("#foot", f"#foot-{n}")
    source = written(tmp_path, f"tall-{n}.html", html)
    context, original = published(chromium, source, scripts=False)
    filled = original.evaluate(f"() => document.getElementById('foot-{n}').getBoundingClientRect().bottom - innerHeight")
    context.close()
    assert abs(filled) <= 1, f"the test page itself should end at the bottom of the window, it ends {filled} px from it"
    import_as_elements(editor, source)
    site = editor.site()["site"]
    page = next(p for p in site["pages"] if p["name"] == f"Tall page {n}")
    host = site["nodes"][page["root"]]["children"][0]
    return site, page, host, by_attr_id(site, f"foot-{n}")["id"]


def test_a_converted_page_that_filled_the_window_is_as_tall_as_the_canvas_viewport(editor, chromium, tmp_path):
    for layout in FILL:
        site, page, host, foot = converted_tall_page(editor, chromium, tmp_path, layout)
        editor.page.evaluate("window.formweb.run('window.layers')")
        editor.page_row(page["id"]).click()
        expect(editor.page_row(page["id"])).to_have_attribute("aria-current", "page")
        root = editor.canvas.locator(f'[data-fw-id="{host}"]')
        expect(root).to_be_visible()
        shown = root.evaluate(HEIGHTS, f'[data-fw-id="{foot}"]')
        assert shown["top"] + shown["height"] >= shown["view"] - 1, f"{layout}: on the canvas the converted page ends at {shown['top'] + shown['height']} px in a {shown['view']} px viewport"
        assert abs(shown["foot"] - shown["view"]) <= 2, f"{layout}: on the canvas the footer ends at {shown['foot']} px, the original ends at the bottom of the {shown['view']} px viewport"


def test_a_converted_page_that_filled_the_window_is_as_tall_as_the_preview(editor, chromium, tmp_path):
    for layout in FILL:
        site, page, host, foot = converted_tall_page(editor, chromium, tmp_path, layout)
        editor.page.evaluate("window.formweb.run('window.layers')")
        editor.page_row(page["id"]).click()
        expect(editor.page_row(page["id"])).to_have_attribute("aria-current", "page")
        frame = preview(editor)
        root = frame.locator(f'[data-fw-node="{host}"]')
        expect(root).to_be_visible()
        shown = root.evaluate(HEIGHTS, f'[data-fw-node="{foot}"]')
        assert shown["top"] + shown["height"] >= shown["view"] - 1, f"{layout}: in Preview the converted page ends at {shown['top'] + shown['height']} px in a {shown['view']} px viewport"
        assert abs(shown["foot"] - shown["view"]) <= 2, f"{layout}: in Preview the footer ends at {shown['foot']} px, the original ends at the bottom of the {shown['view']} px viewport"
        close_preview(editor)


def test_one_undo_takes_the_conversion_back_another_the_import_and_redo_brings_both_back_with_the_cards_styled(editor, tmp_path):
    before = editor.site()["site"]
    import_as_elements(editor, written(tmp_path, "board.html", BOARD))
    converted = editor.until(lambda s: nodes_with(s, "h1", "Card board"), "the heading to become an element")
    editor.page.evaluate("window.formweb.run('edit.undo')")
    as_code = editor.until(lambda s: s != converted and code_sections(s), "one undo to bring the page back as code")
    assert not nodes_with(as_code, "h1", "Card board")
    assert any("Card board" in record.get("html", "") for record in code_sections(as_code).values())
    editor.page.evaluate("window.formweb.run('edit.undo')")
    editor.restored_to(before)
    editor.page.evaluate("window.formweb.run('edit.redo')")
    editor.until(lambda s: s == as_code, "one redo to bring the page back as code")
    editor.page.evaluate("window.formweb.run('edit.redo')")
    editor.until(lambda s: s == converted, "a second redo to bring the conversion back with its kept rules")
    page = next(p for p in converted["pages"] if p["name"] == "Card board")
    editor.page.evaluate("window.formweb.run('window.layers')")
    editor.page_row(page["id"]).click()
    expect(editor.page_row(page["id"])).to_have_attribute("aria-current", "page")
    expect_styled_cards(preview(editor), "in Preview after undo and redo")


def base36(n):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


def test_a_stylesheet_of_20000_rules_converts_without_hanging_the_window_and_the_sentence_says_rules_were_left_out(editor, tmp_path):
    rules = "".join(f".a{base36(i)}{{top:0}}" for i in range(20_000))
    html = f"""<!doctype html><html><head><title>Many rules</title><style>{rules}</style></head><body><div id="host">Host</div>
<script>var made = document.createElement('p'); made.className = 'a0'; document.getElementById('host').appendChild(made);</script></body></html>"""
    sentence = import_as_elements(editor, written(tmp_path, "many.html", html), wait=180_000)
    kept = kept_count(sentence)
    left = re.search(r"(\d+) more style rules? (?:was|were) left out", sentence)
    assert left, f"the sentence does not say that rules were left out: {sentence!r}"
    assert kept >= 1 and int(left.group(1)) >= 1 and kept + int(left.group(1)) <= 20_000, sentence
    editor.page.evaluate("window.formweb.run('window.layers')")
    editor.page_row("home").click()
    expect(editor.page_row("home")).to_have_attribute("aria-current", "page")


def test_with_the_batch_route_faking_the_engines_too_large_refusal_once_the_conversion_still_succeeds_without_the_kept_rules(editor, tmp_path):
    before, (host,) = import_as_code(editor, written(tmp_path, "board.html", BOARD))
    try:
        editor.command("code.section.set", {"node": host, "value": {"enabled": True, "html": "<p>x</p>", "css": "p{top:0}" * 40_000}})
        raise AssertionError("the engine took a code section CSS over 256 KiB")
    except urllib.error.HTTPError as error:
        refusal = json.loads(error.read())["detail"]
    assert editor.site()["site"] == before
    answered = []

    def refuse_once(route):
        if answered:
            route.continue_()
            return
        answered.append(route.request.post_data)
        route.fulfill(status=400, json={"detail": refusal})

    editor.page.route("**/api/batch", refuse_once)
    answer = editor.page.evaluate("h => window.formweb.run('library.convert-section', {node: h, keepScript: true})", host)
    assert answered, "the conversion never reached the batch route"
    assert answer["ran"] is True, answer
    sentence = answer["result"]["message"]
    assert "Converted" in sentence and "left out because the page's code would be too large" in sentence, sentence
    site = editor.until(lambda s: host not in code_sections(s), "the code section to become elements")
    assert nodes_with(site, "h1", "Card board")
    assert not any(record.get("css") for record in code_sections(site).values()), f"the refused rules were stored: {code_sections(site)}"
    assert any(record.get("js") for record in code_sections(site).values()), "the script itself was lost with its rules"


SITE_CSS = """@keyframes sitepulse { from, to { letter-spacing: 3px; } }
.site-banner { --site-gap: 6px; padding-left: var(--site-gap); animation: sitepulse 10s linear paused; }"""

CLASH = """<!doctype html><html><head><title>Clash</title><style>
@property --site-gap { syntax: '<color>'; inherits: true; initial-value: rgb(255, 0, 0); }
@keyframes sitepulse { from, to { letter-spacing: 17px; } }
h1 { color: rgb(255, 0, 255); text-transform: uppercase; }
main h1, header h1 { font-size: 7px; }
[data-fw-node] { outline: 5px solid rgb(255, 0, 0); }
.card { animation: sitepulse 10s linear paused; outline-color: var(--site-gap); background-color: rgb(1, 2, 3); }
</style></head><body><h1>Imported heading</h1><div id="deck"></div>
<script>var card = document.createElement('div'); card.className = 'card'; card.textContent = 'Built'; document.getElementById('deck').appendChild(card);</script>
</body></html>"""

SITE_LOOK = ["color", "text-transform", "font-size", "letter-spacing", "outline-style", "padding-left", "animation-name"]


def site_look(page):
    return {key: look(page.locator(f'[data-fw-node="{key}"]'), SITE_LOOK) for key in ("site-heading", "site-banner-host")} | {"banner": look(page.locator(".site-banner"), SITE_LOOK)}


def test_kept_rules_with_names_the_site_already_uses_do_not_restyle_the_sites_own_heading_in_the_export(harbour, chromium, tmp_path):
    editor = harbour
    home = next(p for p in editor.site()["site"]["pages"] if p["slug"] == "/")
    blank = lambda key, tag, name, text, styles: {"id": key, "tag": tag, "name": name, "text": text, "children": [], "attrs": {}, "styles": styles, "breakpoints": {}}
    editor.page_row(home["id"]).click()
    expect(editor.page_row(home["id"])).to_have_attribute("aria-current", "page")
    editor.command(None, [
        {"command": "code.sections.allow", "params": {"enabled": True}},
        {"command": "node.add", "params": {"parent": home["root"], "node": blank("site-heading", "h1", "Site heading", "Our own heading", {"color": "rgb(10, 90, 10)", "font-size": "30px", "letter-spacing": "1px"})}},
        {"command": "node.add", "params": {"parent": home["root"], "node": blank("site-banner-host", "div", "Site banner", "", {})}},
        {"command": "code.section.set", "params": {"node": "site-banner-host", "value": {"enabled": True, "html": '<p class="site-banner">Our banner</p>', "css": SITE_CSS}}},
    ], batch=True)
    editor.until(lambda s: "site-banner-host" in s["nodes"], "the site's own heading and banner")
    first = exported(editor, tmp_path / "before")
    context, page = published(chromium, first / "index.html")
    try:
        start = site_look(page)
        assert start["banner"]["padding-left"] == "6px" and start["banner"]["letter-spacing"] == "3px", start
        page.add_style_tag(content=CLASH.split("<style>")[1].split("</style>")[0])
        hit = site_look(page)
        assert hit["site-heading"] != start["site-heading"] and hit["banner"] != start["banner"], f"the page's stylesheet, applied as it is, was expected to restyle the site's heading and banner: {hit}"
    finally:
        context.close()
    sentence = import_as_elements(editor, written(tmp_path, "clash.html", CLASH), section=True)
    assert kept_count(sentence) >= 1, sentence
    second = exported(editor, tmp_path / "after")
    for scripts in (False, True):
        context, page = published(chromium, second / "index.html", scripts=scripts)
        try:
            if scripts:
                expect(page.locator(".card")).to_have_css("background-color", "rgb(1, 2, 3)")
                expect(page.locator(".card")).to_have_css("letter-spacing", "17px")
            assert site_look(page) == start, f"with scripts {'on' if scripts else 'off'} the kept rules restyled the site's own elements: {site_look(page)} against {start}"
        finally:
            context.close()


SECTION_A = """<!doctype html><html><head><title>Red deck</title><style>
.card { background-color: rgb(200, 0, 0); padding: 11px; }
</style></head><body><div id="deck-a">Red</div>
<script>var c = document.createElement('div'); c.className = 'card'; c.textContent = 'A'; document.getElementById('deck-a').appendChild(c);</script></body></html>"""

SECTION_B = """<!doctype html><html><head><title>Blue deck</title><style>
.card { background-color: rgb(0, 0, 200); padding: 22px; }
</style></head><body><div id="deck-b">Blue</div>
<script>var c = document.createElement('div'); c.className = 'card'; c.textContent = 'B'; document.getElementById('deck-b').appendChild(c);</script></body></html>"""


def test_two_pages_converted_in_one_go_each_keep_their_own_rules_and_neither_page_gets_the_others(editor, chromium, tmp_path):
    site, hosts = import_as_code(editor, written(tmp_path, "red.html", SECTION_A), written(tmp_path, "blue.html", SECTION_B))
    assert len(hosts) == 2
    answer = editor.page.evaluate("h => window.formweb.run('library.convert-section', {nodes: h, keepScript: true})", hosts)
    assert answer["ran"] is True, answer
    assert kept_count(answer["result"]["message"]) >= 2, answer["result"]["message"]
    editor.until(lambda s: not any(h in code_sections(s) for h in hosts), "both code sections to become elements")
    folder = exported(editor, tmp_path / "export")
    for slug, letter, own in (("red", "A", ("rgb(200, 0, 0)", "11px")), ("blue", "B", ("rgb(0, 0, 200)", "22px"))):
        context, page = published(chromium, folder / slug / "index.html")
        try:
            card = page.locator(".card")
            expect(card).to_have_count(1)
            expect(card).to_have_text(letter)
            shown = look(card, ["background-color", "padding-top"])
            assert (shown["background-color"], shown["padding-top"]) == own, f"on the {slug} page the built card shows {shown}, its own page's rule says {own}"
        finally:
            context.close()


def test_backspace_while_the_convert_dialog_works_removes_nothing_and_the_conversion_still_lands(editor, tmp_path):
    before, (host,) = import_as_code(editor, written(tmp_path, "board.html", BOARD))
    editor.page.evaluate("window.formweb.run('window.layers')")
    page = next(p for p in before["pages"] if p["name"] == "Card board")
    editor.page_row(page["id"]).click()
    editor.canvas.locator(f'[data-fw-id="{host}"]').click(button="right")
    editor.menu().get_by_role("menuitem", name="Convert to editable elements...").click()
    expect(editor.canvas.locator(f'[data-fw-id="{host}"]')).to_have_attribute("data-fw-selected", "")
    held = []
    editor.page.route("**/api/batch", lambda route: route.continue_() if held else held.append(route))
    start = editor.site()
    dialog = editor.page.locator(".fw-convert")
    dialog.get_by_role("button", name="Convert", exact=True).click()
    editor.eventually(lambda: bool(held), "the conversion's batch")
    expect(dialog).to_have_attribute("aria-busy", "true")
    assert editor.page.evaluate("document.activeElement !== document.body"), "focus fell to the page body while the conversion worked"
    editor.page.keyboard.press("Backspace")
    editor.page.keyboard.press("Delete")
    assert editor.site() == start, "a key pressed while the conversion worked changed the site"
    held[0].continue_()
    after = editor.until(lambda s: host not in code_sections(s), "the code section to become elements")
    assert host in after["nodes"] and nodes_with(after, "h1", "Card board"), "the converted section was removed"
    expect(editor.page.locator(".fw-notice-text")).to_contain_text("Converted")
    assert editor.page.evaluate("document.activeElement !== document.body"), "focus fell to the page body when the dialog closed"
