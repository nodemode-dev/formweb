import io
import re
import zipfile
from urllib.parse import urlsplit

from playwright.sync_api import expect

LOOKS = """<!doctype html><html><head><title>Lap timer</title>
<link rel="stylesheet" href="https://cdn.example.net/look.css">
<script src="https://code.example.org/tick.js"></script>
<style>.face { padding: 24px; font-family: Georgia, serif; }</style>
</head><body><div class="face"><h1 id="clock">Ready</h1><p>Press start to time a lap.</p></div>
<script>document.getElementById('clock').textContent = 'The page script ran';</script>
</body></html>"""

PLAIN = """<!doctype html><html><head><title>Opening hours</title>
<style>.notice { padding: 32px; background: #fff4d6; font-family: Georgia, serif; }</style>
</head><body><div class="notice"><h2>Open daily</h2><p>From nine until five.</p></div></body></html>"""


def page_with(title, head):
    return f"<!doctype html><html><head><title>{title}</title>{head}</head><body><h1>{title}</h1><p>Some words.</p></body></html>"


def html_file(tmp_path, name, html):
    path = tmp_path / name
    path.write_text(html, "utf-8")
    return path


def zip_file(tmp_path, name, entries):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        for entry, body in entries.items():
            archive.writestr(entry, body)
    path = tmp_path / name
    path.write_bytes(data.getvalue())
    return path


def pick(editor, *paths, command="file.import-site"):
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate(f"window.formweb.run('{command}')")
    chooser.value.set_files([str(p) for p in paths])
    return editor.page.locator(".fw-lib-site")


def rows(view):
    return view.locator(".fw-lib-site-review .fw-lib-site-item")


def web_sentence(row):
    return row.get_by_text("loads files from the web")


def option(view, value):
    return view.locator(f'[data-bring="{value}"]')


def expect_chosen(view, value):
    other = "elements" if value == "code" else "code"
    expect(option(view, value)).to_have_attribute("aria-checked", "true")
    expect(option(view, other)).to_have_attribute("aria-checked", "false")


def choice(view):
    return view.get_by_role("radiogroup").filter(has=view.page.locator("[data-bring]"))


def reason(view):
    group = choice(view)
    expect(group).to_have_attribute("aria-describedby", re.compile(r"\S"))
    line = view.locator(f'[id="{group.get_attribute("aria-describedby")}"]')
    expect(line).to_be_visible()
    return line


def expect_no_reason(view):
    expect(choice(view)).not_to_have_attribute("aria-describedby", re.compile(r"\S"))
    for words in ("Kept as code", "As elements, "):
        expect(view.get_by_text(words)).to_have_count(0)


def import_now(view):
    view.locator(".fw-lib-insert:not([disabled])").click()


def code_sections(site):
    return (site.get("extensions", {}).get("code") or {}).get("sections") or {}


PLACES = """view => {
  const scrollerOf = el => { for (let at = el.parentElement; at; at = at.parentElement) { const y = getComputedStyle(at).overflowY; if (y === 'auto' || y === 'scroll') return at; } return document.documentElement; };
  const place = el => { if (!el || !el.getClientRects().length) return null; const scroller = scrollerOf(el), r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); return [r.left - s.left, r.top - s.top + scroller.scrollTop, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); };
  const group = view.querySelector('[data-bring]')?.closest('[role="radiogroup"]');
  const line = group && group.getAttribute('aria-describedby') ? document.getElementById(group.getAttribute('aria-describedby')) : null;
  return { rows: [...view.querySelectorAll('.fw-lib-site-review .fw-lib-site-item')].map(place), code: place(view.querySelector('[data-bring="code"]')), elements: place(view.querySelector('[data-bring="elements"]')), reason: place(line && line.parentElement), button: place(view.querySelector('.fw-lib-insert')) };
}"""


def outside_host(url, base):
    parts = urlsplit(url)
    return parts.scheme in ("http", "https", "ws", "wss") and not url.startswith(base)


def test_the_review_row_names_both_hosts_as_plain_text_with_how_many_files_each_and_holds_no_link(editor, tmp_path):
    view = pick(editor, html_file(tmp_path, "lap-timer.html", LOOKS))
    row = rows(view).filter(has_text="lap-timer.html")
    sentence = web_sentence(row)
    expect(sentence).to_be_visible()
    expect(sentence).to_contain_text("1 stylesheet from cdn.example.net")
    expect(sentence).to_contain_text("1 script from code.example.org")
    expect(sentence).to_contain_text("not brought along")
    assert sentence.evaluate("e => [e.children.length, !!e.closest('a, [href], [role=link]')]") == [0, False]
    assert view.locator('a, [href*="example."], [src*="example."], [role="link"]').count() == 0


def test_a_page_that_loads_files_from_the_web_starts_on_code_sections_with_a_reason_and_as_code_its_script_runs_in_preview(editor, tmp_path):
    before = editor.site()["site"]
    view = pick(editor, html_file(tmp_path, "lap-timer.html", LOOKS))
    expect(web_sentence(rows(view).first)).to_be_visible()
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("Kept as code")
    import_now(view)
    expect(view.locator(".fw-lib-note")).to_contain_text("Imported 1 page")
    site = editor.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1 and len(code_sections(s)) == len(code_sections(before)) + 1, "one more page held as code")
    added = [record for key, record in code_sections(site).items() if key not in code_sections(before)]
    assert "The page script ran" in added[0]["js"]
    editor.page.locator('[data-cmd="view.preview-full"]').click()
    overlay = editor.page.get_by_role("dialog", name="Preview as published")
    expect(overlay).to_be_visible()
    expect(overlay.frame_locator("iframe.fw-fp-frame:visible").locator("#clock")).to_have_text("The page script ran")


def test_picking_editable_elements_says_what_will_be_missing_and_the_result_names_the_hosts(editor, tmp_path):
    before = editor.site()["site"]
    view = pick(editor, html_file(tmp_path, "lap-timer.html", LOOKS))
    expect_chosen(view, "code")
    option(view, "elements").click()
    expect_chosen(view, "elements")
    line = reason(view)
    expect(line).to_contain_text("As elements")
    expect(line).to_contain_text("cdn.example.net")
    expect(line).to_contain_text("code.example.org")
    expect(line).to_contain_text("missing")
    import_now(view)
    note = view.locator(".fw-lib-note")
    expect(note).to_contain_text("Converted")
    expect(note).to_contain_text(re.compile(r"Files from (cdn\.example\.net and code\.example\.org|code\.example\.org and cdn\.example\.net) were not brought along"))
    site = editor.until(lambda s: any(n["tag"] == "h1" and n["text"] == "Ready" for n in s["nodes"].values()), "the heading as an element")
    assert len(site["pages"]) == len(before["pages"]) + 1


def test_after_a_page_that_loads_files_from_the_web_a_page_with_none_starts_on_editable_elements_with_no_such_sentence(editor, tmp_path):
    view = pick(editor, html_file(tmp_path, "lap-timer.html", LOOKS))
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("Kept as code")
    view = pick(editor, html_file(tmp_path, "opening-hours.html", PLAIN))
    expect(rows(view)).to_have_count(1)
    expect(rows(view)).to_contain_text("opening-hours.html")
    expect_chosen(view, "elements")
    expect_no_reason(view)
    expect(web_sentence(rows(view).first)).to_have_count(0)
    expect(view.get_by_text("from the web")).to_have_count(0)


def test_in_a_zip_of_three_pages_where_one_loads_files_from_the_web_the_review_names_that_page_and_starts_on_code_saying_1_of_3_pages(editor, tmp_path):
    archive = zip_file(tmp_path, "three.zip", {
        "index.html": page_with("Home", '<link rel="stylesheet" href="css/site.css">'),
        "about.html": page_with("About", '<link rel="stylesheet" href="https://cdn.example.net/look.css"><script src="https://code.example.org/tick.js"></script>'),
        "contact.html": page_with("Contact", ""),
        "css/site.css": "h1 { color: #123456; }",
    })
    view = pick(editor, archive)
    expect(rows(view)).to_have_count(3)
    about = rows(view).filter(has_text="about.html")
    expect(web_sentence(about)).to_contain_text("cdn.example.net")
    expect(web_sentence(about)).to_contain_text("code.example.org")
    for name in ("index.html", "contact.html"):
        expect(web_sentence(rows(view).filter(has_text=name))).to_have_count(0)
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("1 of 3 pages")


def test_a_choice_the_person_made_survives_the_use_toggle_a_theme_and_a_language_switch_and_only_a_new_pick_decides_again(harbour, tmp_path):
    page = harbour.page
    looks = html_file(tmp_path, "lap-timer.html", LOOKS)
    view = pick(harbour, looks)
    expect_chosen(view, "code")
    option(view, "elements").click()
    expect_chosen(view, "elements")
    view.get_by_role("radio", name="As a section of this page").click()
    expect(view.get_by_role("radio", name="As a section of this page")).to_have_attribute("aria-checked", "true")
    expect_chosen(view, "elements")
    view.get_by_role("radio", name="As new pages", exact=True).click()
    expect(view.get_by_role("radio", name="As new pages", exact=True)).to_have_attribute("aria-checked", "true")
    expect_chosen(view, "elements")
    theme = page.locator("html").get_attribute("data-theme")
    page.evaluate("window.formweb.run('view.theme')")
    expect(page.locator("html")).not_to_have_attribute("data-theme", theme or "")
    expect_chosen(view, "elements")
    page.evaluate("window.formweb.run('view.theme')")
    expect_chosen(view, "elements")
    page.keyboard.press("Control+,")
    languages = page.get_by_label("Editor language")
    expect(languages).to_be_visible()
    languages.select_option("de")
    expect(page.locator("html")).to_have_attribute("lang", "de")
    expect_chosen(view, "elements")
    page.locator('select:has(option[value="de"]):visible').select_option("en")
    expect(page.locator("html")).to_have_attribute("lang", "en")
    page.keyboard.press("Escape")
    expect(languages).to_be_hidden()
    expect_chosen(view, "elements")
    expect(reason(view)).to_contain_text("As elements")
    view = pick(harbour, looks)
    expect(web_sentence(rows(view).first)).to_be_visible()
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("Kept as code")


def test_no_request_leaves_for_an_outside_host_during_the_review_both_imports_preview_and_export(editor, tmp_path):
    context = editor.page.context
    stopped, seen = [], []

    def stop(route):
        stopped.append(route.request.url)
        route.abort()

    context.route(lambda url: outside_host(url, editor.base), stop)
    context.on("request", lambda request: seen.append(request.url) if outside_host(request.url, editor.base) else None)
    blank = context.new_page()
    assert blank.evaluate("() => fetch('https://probe.example.net/ping').then(() => 'answered', () => 'refused')") == "refused"
    blank.close()
    assert stopped == seen == ["https://probe.example.net/ping"], f"the recorders did not both see the deliberate outside request: routed {stopped}, seen {seen}"
    stopped.clear()
    seen.clear()

    before = editor.site()["site"]
    looks = html_file(tmp_path, "lap-timer.html", LOOKS)
    view = pick(editor, looks)
    expect(web_sentence(rows(view).first)).to_contain_text("cdn.example.net")
    expect_chosen(view, "code")
    import_now(view)
    editor.until(lambda s: len(s["pages"]) == len(before["pages"]) + 1, "the page as code")
    view = pick(editor, html_file(tmp_path, "lap-timer-two.html", LOOKS.replace("Lap timer", "Lap timer two")))
    expect(web_sentence(rows(view).first)).to_contain_text("code.example.org")
    option(view, "elements").click()
    import_now(view)
    expect(view.locator(".fw-lib-note")).to_contain_text("Converted")
    editor.until(lambda s: len(s["pages"]) == len(before["pages"]) + 2, "the page as elements")
    editor.page.locator('[data-cmd="view.preview-full"]').click()
    overlay = editor.page.get_by_role("dialog", name="Preview as published")
    expect(overlay.frame_locator("iframe.fw-fp-frame:visible").locator("h1").first).to_be_visible()
    editor.page.keyboard.press("Escape")
    expect(overlay).to_be_hidden()
    with editor.page.expect_download() as download:
        editor.page.locator('[data-cmd="file.export"]').click()
    assert download.value.suggested_filename.endswith(".zip")
    download.value.path()
    assert stopped == [] and seen == [], f"requests went to outside hosts: routed {stopped}, seen {seen}"


def test_a_malformed_or_very_long_host_is_never_named_and_a_good_host_is_shown_as_text(editor, tmp_path):
    long_host = "a" * 300 + ".example.net"
    head = (f'<script src="https://{long_host}/x.js"></script><script src="https://under_score.example.net/y.js"></script>'
            '<script src="https://[::1]/z.js"></script><link rel="stylesheet" href="https://cdn.example.net/look.css">')
    view = pick(editor, html_file(tmp_path, "odd-hosts.html", page_with("Odd hosts", head)))
    sentence = web_sentence(rows(view).first)
    expect(sentence).to_contain_text("1 stylesheet from cdn.example.net")
    words = sentence.inner_text()
    assert "aaaa" not in words and "under_score" not in words and "::1" not in words and "script" not in words, words
    assert sentence.evaluate("e => e.children.length") == 0
    assert view.locator('a, [href*="example."], [src*="example."], [role="link"]').count() == 0


def test_a_row_whose_outside_files_are_all_named_says_so_once_and_not_again_in_the_older_warning_words(editor, tmp_path):
    view = pick(editor, html_file(tmp_path, "lap-timer.html", LOOKS))
    row = rows(view).first
    expect(web_sentence(row)).to_contain_text("1 script from code.example.org")
    words = row.inner_text()
    assert words.count("not brought along") == 1, words
    assert "external script" not in words and "external stylesheet" not in words, words
    assert "https://" not in words, words


def test_a_warning_that_says_more_than_the_named_hosts_still_shows_in_the_row(editor, tmp_path):
    head = ('<style>@import url(https://style.example.org/block.css); h1 { color: #123456; }</style>'
            '<script src="https://under_score.example.net/x.js"></script><script src="https://code.example.org/tick.js"></script>')
    view = pick(editor, html_file(tmp_path, "partly.html", page_with("Partly named", head)))
    row = rows(view).first
    sentence = web_sentence(row)
    expect(sentence).to_contain_text("1 script from code.example.org")
    expect(sentence).to_contain_text("style.example.org")
    expect(row).to_contain_text("https://style.example.org/block.css")
    expect(row).to_contain_text("https://under_score.example.net/x.js")
    assert "under_score" not in sentence.inner_text()


def test_five_files_from_one_host_name_the_host_once_with_the_count_five(editor, tmp_path):
    head = "".join(f'<script src="https://five.example.net/s{i}.js"></script>' for i in range(5))
    view = pick(editor, html_file(tmp_path, "five.html", page_with("Five", head)))
    sentence = web_sentence(rows(view).first)
    expect(sentence).to_contain_text("5 scripts from five.example.net")
    assert sentence.inner_text().count("five.example.net") == 1


def test_the_rows_and_the_choice_do_not_move_when_the_review_and_its_reason_line_appear(editor, tmp_path):
    held = []
    editor.page.route("**/api/library/import-site/review", lambda route: held.append(route))
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate("window.formweb.run('file.import-site')")
    chooser.value.set_files(str(zip_file(tmp_path, "two.zip", {"index.html": LOOKS, "hours.html": PLAIN})))
    editor.eventually(lambda: bool(held), "the review request")
    editor.page.evaluate(f"""() => {{
      const read = {PLACES};
      const view = document.querySelector('.fw-lib-site');
      window.__places = [];
      const sample = () => {{
        window.__places.push(read(view));
        if (window.__places.length < 4000) requestAnimationFrame(sample);
      }};
      requestAnimationFrame(sample);
    }}""")
    held[0].continue_()
    view = editor.page.locator(".fw-lib-site")
    expect(rows(view)).to_have_count(2)
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("Kept as code")
    editor.page.evaluate("() => new Promise(done => { let n = 0; const tick = () => (++n > 30 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); })")
    samples = editor.page.evaluate("() => { const all = window.__places; window.__places = []; return all; }")
    final = samples[-1]
    assert len(final["rows"]) == 2 and all(final["rows"]) and final["code"] and final["reason"], final
    for name in ("code", "elements", "reason", "button"):
        seen = [s[name] for s in samples if s[name] and s["rows"]]
        assert set(seen) == {final[name]}, f"the {name} box moved after the review appeared: {sorted(set(seen))}"
    for i in range(2):
        seen = [s["rows"][i] for s in samples if len(s["rows"]) == 2 and s["rows"][i]]
        assert set(seen) == {final["rows"][i]}, f"review row {i + 1} moved after it appeared: {sorted(set(seen))}"


def test_switching_the_choice_moves_no_row_no_option_the_reason_box_or_the_import_button(editor, tmp_path):
    view = pick(editor, zip_file(tmp_path, "two.zip", {"index.html": LOOKS, "hours.html": PLAIN}))
    expect(rows(view)).to_have_count(2)
    expect_chosen(view, "code")
    line = reason(view)
    expect(line).to_contain_text("Kept as code")
    places = lambda: view.evaluate(PLACES)
    start = places()
    assert len(start["rows"]) == 2 and all(start["rows"]) and start["reason"] and start["button"], start
    option(view, "elements").click()
    expect_chosen(view, "elements")
    expect(reason(view)).to_contain_text("As elements")
    assert places() == start, "something moved when Editable elements was picked"
    option(view, "code").click()
    expect_chosen(view, "code")
    expect(reason(view)).to_contain_text("Kept as code")
    assert places() == start, "something moved when Code sections was picked again"
