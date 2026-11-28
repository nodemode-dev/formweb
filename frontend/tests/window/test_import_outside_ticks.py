"""The review's ticks for files a page loads from the web (plan A1 to A7). The service's download routes are stubbed
with page.route, so nothing reaches a real host; the import itself goes to the real service."""
import json

from playwright.sync_api import expect

PAGE = """<!doctype html><html><head><title>Lap timer</title>
<link rel="stylesheet" href="https://cdn.example.net/look.css">
<script src="https://code.example.org/tick.js"></script>
</head><body><div class="face"><h1>Ready</h1></div></body></html>"""
OTHER = PAGE.replace("Lap timer", "Second timer").replace("look.css", "other.css")
CSS = "https://cdn.example.net/look.css"
FONT = "https://fonts.example.com/face.woff2"


def written(tmp_path, name, html):
    path = tmp_path / name
    path.write_text(html, "utf-8")
    return path


def pick(editor, path):
    with editor.page.expect_file_chooser() as chooser:
        editor.page.evaluate("window.formweb.run('file.import-site')")
    chooser.value.set_files([str(path)])
    view = editor.page.locator(".fw-lib-site")
    expect(view.locator(".fw-lib-out-row")).not_to_have_count(0)
    return view


def boxes(view):
    return view.locator(".fw-lib-out-row input[type=checkbox]")


def row_of(view, host):
    return view.locator(".fw-lib-out-row").filter(has=view.page.locator(".fw-lib-out-host", has_text=host))


class Service:
    """Answers the two download routes by hand and keeps every request the window sent to them."""

    def __init__(self, page, fonts=(), refuse=None, hold=False):
        self.fetches, self.drops, self.held, self.fonts, self.refuse, self.hold = [], [], [], list(fonts), refuse, hold
        page.route("**/api/library/outside/fetch", self.fetch)
        page.route("**/api/library/outside/drop", self.drop)

    def fetch(self, route):
        body = json.loads(route.request.post_data or "{}")
        self.fetches.append(body)
        if self.hold:
            self.held.append((route, body))
            return
        if self.refuse:
            route.fulfill(status=403, json={"detail": self.refuse})
            return
        self.answer(route, body)

    def answer(self, route, body, token="T-1"):
        fonts = [{"url": url, "host": url.split("/")[2]} for url in self.fonts] if body["kind"] == "stylesheet" else []
        route.fulfill(json={"token": token, "url": body["url"], "kind": body["kind"], "host": body["url"].split("/")[2], "bytes": 2048, "type": "text/css", "fonts": fonts, "fontsMore": 0})

    def drop(self, route):
        self.drops.append(json.loads(route.request.post_data or "{}"))
        route.fulfill(json={"ok": True})


def test_each_outside_file_gets_one_unticked_row_and_nothing_is_fetched_before_a_tick(editor, tmp_path):
    service = Service(editor.page)
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    expect(boxes(view)).to_have_count(2)
    expect(row_of(view, "cdn.example.net")).to_have_count(1)
    expect(row_of(view, "code.example.org")).to_have_count(1)
    for n in range(2):
        expect(boxes(view).nth(n)).not_to_be_checked()
    expect(view.locator(".fw-lib-insert:not([disabled])")).to_be_visible()
    assert service.fetches == [], f"a file was fetched before any tick: {service.fetches}"
    row_of(view, "code.example.org").locator("input").check()
    expect(row_of(view, "code.example.org").locator(".fw-lib-out-size")).not_to_be_empty()
    assert [f["url"] for f in service.fetches] == ["https://code.example.org/tick.js"], service.fetches


def test_a_tick_fetches_once_shows_the_size_and_a_stylesheets_font_gets_its_own_unticked_row(editor, tmp_path):
    service = Service(editor.page, fonts=[FONT])
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    first = boxes(view).first
    first.evaluate("el => { el.dataset.sameNode = 'yes'; }")
    row_of(view, "cdn.example.net").locator("input").check()
    expect(row_of(view, "cdn.example.net").locator(".fw-lib-out-size")).to_contain_text("2")
    font = row_of(view, "fonts.example.com")
    expect(font).to_have_count(1)
    expect(font.locator("input")).not_to_be_checked()
    expect(boxes(view)).to_have_count(3)
    assert boxes(view).first.get_attribute("data-same-node") == "yes", "the first checkbox was rebuilt by the answer"
    assert [(f["url"], f["kind"]) for f in service.fetches] == [(CSS, "stylesheet")], service.fetches


def test_unticking_a_stylesheet_sends_a_drop_and_its_font_row_goes(editor, tmp_path):
    service = Service(editor.page, fonts=[FONT])
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    sheet = row_of(view, "cdn.example.net").locator("input")
    sheet.check()
    expect(row_of(view, "fonts.example.com")).to_have_count(1)
    assert service.drops == []
    with editor.page.expect_request("**/api/library/outside/drop") as dropped:
        sheet.uncheck()
    expect(row_of(view, "fonts.example.com")).to_have_count(0)
    expect(sheet).not_to_be_checked()
    assert dropped.value.post_data_json == {"token": "T-1", "url": CSS}, dropped.value.post_data


def test_a_refused_fetch_unticks_the_row_and_shows_the_services_sentence_in_it(editor, tmp_path):
    sentence = "cdn.example.net points at an address on this computer or a private network, so nothing was downloaded from it."
    Service(editor.page, refuse=sentence)
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    row = row_of(view, "cdn.example.net")
    row.locator("input").check()
    expect(row.locator(".fw-lib-out-said")).to_have_text(sentence)
    expect(row.locator("input")).not_to_be_checked()


def test_a_new_file_pick_while_a_fetch_is_out_starts_unticked_and_the_late_answer_is_dropped(editor, tmp_path):
    service = Service(editor.page, hold=True)
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    with editor.page.expect_request("**/api/library/outside/fetch"):
        row_of(view, "cdn.example.net").locator("input").check()
    view = pick(editor, written(tmp_path, "second.html", OTHER))
    expect(view.locator(".fw-lib-site-item").filter(has_text="second.html")).to_have_count(1)
    expect(boxes(view)).to_have_count(2)
    for n in range(2):
        expect(boxes(view).nth(n)).not_to_be_checked()
    route, body = service.held.pop()
    with editor.page.expect_request("**/api/library/outside/drop") as dropped:
        service.answer(route, body, token="T-old")
    assert dropped.value.post_data_json == {"token": "T-old", "url": None}, dropped.value.post_data
    for n in range(2):
        expect(boxes(view).nth(n)).not_to_be_checked()


def test_import_carries_the_token_only_when_a_ticked_file_came_back(editor, tmp_path):
    Service(editor.page)
    sent = []
    editor.page.on("request", lambda r: sent.append(r.url) if "/api/library/import-site?" in r.url else None)
    view = pick(editor, written(tmp_path, "lap.html", PAGE))
    row_of(view, "cdn.example.net").locator("input").check()
    expect(row_of(view, "cdn.example.net").locator(".fw-lib-out-size")).not_to_be_empty()
    with editor.page.expect_response(lambda r: "/api/library/import-site?" in r.url):
        view.locator(".fw-lib-insert:not([disabled])").click()
    assert len(sent) == 1 and "outside=T-1" in sent[0], sent
    expect(editor.page.locator(".fw-lib-site")).to_contain_text("Imported 1 page")
    view = pick(editor, written(tmp_path, "second.html", OTHER))
    with editor.page.expect_response(lambda r: "/api/library/import-site?" in r.url and r.url != sent[0]):
        view.locator(".fw-lib-insert:not([disabled])").click()
    assert len(sent) == 2 and "outside" not in sent[1], sent
