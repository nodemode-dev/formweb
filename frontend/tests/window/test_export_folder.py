import io
import json
import re
import urllib.request
import zipfile

from playwright.sync_api import expect

KEY = "formweb.export-folder"
SHELL = """(() => {
  const replies = JSON.parse(sessionStorage.getItem('fw-shell-replies') || '{}');
  const held = [];
  const log = args => {
    const calls = JSON.parse(sessionStorage.getItem('fw-shell-calls') || '[]');
    calls.push(args);
    sessionStorage.setItem('fw-shell-calls', JSON.stringify(calls));
  };
  window.__shell = {
    replies,
    held,
    answer(command, value, failed) {
      const index = held.findIndex(entry => entry.command === command);
      if (index < 0) return false;
      const entry = held.splice(index, 1)[0];
      if (failed) entry.reject(value); else entry.resolve(value);
      return true;
    },
  };
  window.__TAURI__ = { core: { invoke(command, args) {
    log([command, args === undefined ? null : args]);
    const reply = replies[command];
    if (reply === 'hold') return new Promise((resolve, reject) => held.push({ command, resolve, reject }));
    if (reply && typeof reply === 'object' && 'error' in reply) return Promise.reject(reply.error);
    if (reply && typeof reply === 'object' && 'value' in reply) return Promise.resolve(reply.value);
    if (command === 'set_export_place') return Promise.resolve({ mode: args.mode, folder: args.path });
    return Promise.resolve(null);
  } } };
})()"""


def desktop(editor, replies=None, stored=None):
    page = editor.page
    page.evaluate("([replies, key, stored]) => { sessionStorage.setItem('fw-shell-replies', JSON.stringify(replies)); sessionStorage.removeItem('fw-shell-calls'); if (stored === null) localStorage.removeItem(key); else localStorage.setItem(key, stored); }", [replies or {}, KEY, stored])
    page.context.add_init_script(SHELL)
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-demo="harbour-ferries"]').wait_for()
    return editor


def calls(editor, command=None):
    made = editor.page.evaluate("JSON.parse(sessionStorage.getItem('fw-shell-calls') || '[]')")
    return [args for name, args in made if name == command] if command else made


def place_calls(editor):
    return [call for call in calls(editor) if call[0] in ("set_export_place", "choose_export_folder", "ask_export_place")]


def answer(editor, command, value, failed=False):
    editor.eventually(lambda: editor.page.evaluate("command => window.__shell.held.some(entry => entry.command === command)", command), f"the page to ask the shell {command}")
    assert editor.page.evaluate("([command, value, failed]) => window.__shell.answer(command, value, failed)", [command, value, failed])


def held(editor, command):
    return editor.page.evaluate("command => window.__shell.held.filter(entry => entry.command === command).length", command)


def tell(editor, detail):
    editor.page.evaluate("detail => window.dispatchEvent(new CustomEvent('formweb-download', { detail }))", detail)


def stored(editor):
    return editor.page.evaluate("key => localStorage.getItem(key)", KEY)


def watch(editor, part):
    seen = []
    editor.page.on("request", lambda request: seen.append(request.url) if part in request.url else None)
    return seen


def downloads(editor):
    seen = []
    editor.page.on("download", lambda download: seen.append(download))
    return seen


def open_menu(editor, menu, command):
    editor.page.locator(f'[data-menu="{menu}"]').click()
    return editor.page.locator(f'[role="menu"]:visible [data-command="{command}"]')


def open_general(editor):
    open_menu(editor, "Edit", "edit.settings").click()
    dialog = editor.page.get_by_role("dialog", name="Preferences")
    dialog.get_by_role("tab", name="General").click()
    return dialog


def radio(dialog, name):
    return dialog.get_by_role("radio", name=name, exact=True)


def export_button(editor):
    return editor.page.locator('[data-cmd="file.export"]')


def notice(editor):
    return editor.page.locator(".fw-notice .fw-notice-text")


def harbour_in(editor):
    editor.open_demo("harbour-ferries", "p-fares")
    return editor


def back_to_editor(editor):
    editor.page.get_by_role("button", name="Back to Editor").click()
    editor.page.locator(".canvas-frame[title='Website canvas']").wait_for()


def test_in_a_browser_preferences_says_the_browser_decides_and_export_static_site_downloads_as_before(editor):
    harbour_in(editor)
    dialog = open_general(editor)
    expect(dialog.get_by_text("In a browser, the browser decides where downloads go.")).to_be_visible()
    expect(dialog.get_by_role("radio")).to_have_count(0)
    editor.page.keyboard.press("Escape")
    with editor.page.expect_download() as download:
        export_button(editor).click()
    name = download.value.suggested_filename
    assert re.fullmatch(r"harbour-ferries.*-site\.zip", name), name
    expect(notice(editor)).to_have_text(f"Downloaded {name}. Your browser lists it with its downloads.")


def test_when_the_shell_is_there_the_page_offers_three_places_with_downloads_chosen_at_first(editor):
    harbour_in(desktop(editor))
    dialog = open_general(editor)
    for name in ("The Downloads folder", "A folder you choose", "Ask each time"):
        expect(radio(dialog, name)).to_be_visible()
    expect(dialog.get_by_role("radio")).to_have_count(3)
    expect(radio(dialog, "The Downloads folder")).to_be_checked()
    expect(dialog.get_by_text("No folder chosen yet.")).to_be_visible()
    expect(dialog.get_by_text("In a browser, the browser decides where downloads go.")).to_have_count(0)
    assert calls(editor, "set_export_place") == [{"mode": "downloads", "path": "", "forget": False}]


def test_choosing_a_folder_asks_the_shell_for_its_dialog_and_shows_the_path_the_shell_returns(editor):
    harbour_in(desktop(editor, {"choose_export_folder": "hold"}))
    dialog = open_general(editor)
    radio(dialog, "A folder you choose").click()
    answer(editor, "choose_export_folder", "/home/me/Exports/café sites/")
    assert calls(editor, "choose_export_folder") == [None], "the page sent a folder of its own to the folder dialog"
    shown = dialog.get_by_text("/home/me/Exports/café sites/", exact=True)
    expect(shown).to_be_visible()
    expect(shown).to_have_attribute("title", "/home/me/Exports/café sites/")
    expect(dialog.get_by_text("No folder chosen yet.")).to_be_hidden()
    expect(radio(dialog, "A folder you choose")).to_be_checked()
    assert json.loads(stored(editor)) == {"mode": "folder", "path": "/home/me/Exports/café sites/"}
    assert calls(editor, "set_export_place")[-1] == {"mode": "folder", "path": "/home/me/Exports/café sites/", "forget": False}


def test_a_long_folder_path_from_the_shell_is_cut_on_one_line_and_its_full_text_stays_available(editor):
    long = "/home/me/" + "/".join(f"nested folder {i:02d} été" for i in range(20))
    harbour_in(desktop(editor, {"choose_export_folder": {"value": long}}))
    dialog = open_general(editor)
    radio(dialog, "A folder you choose").click()
    shown = dialog.get_by_text(long, exact=True)
    expect(shown).to_be_visible()
    expect(shown).to_have_attribute("title", long)
    cut = shown.evaluate("node => { const range = document.createRange(); range.selectNodeContents(node); return { cut: node.scrollWidth > node.clientWidth, lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size }; }")
    assert cut == {"cut": True, "lines": 1}, cut


def test_cancel_in_the_folder_dialog_puts_the_choice_back_to_downloads(editor):
    harbour_in(desktop(editor, {"choose_export_folder": "hold"}))
    dialog = open_general(editor)
    radio(dialog, "A folder you choose").click()
    expect(radio(dialog, "A folder you choose")).to_be_checked()
    answer(editor, "choose_export_folder", None)
    expect(radio(dialog, "The Downloads folder")).to_be_checked()
    expect(dialog.get_by_text("No folder chosen yet.")).to_be_visible()
    assert stored(editor) is None
    assert calls(editor, "set_export_place") == [{"mode": "downloads", "path": "", "forget": False}]


def test_a_stored_folder_the_shell_has_no_record_of_gives_no_folder_chosen_yet_with_downloads_chosen(editor):
    tampered = json.dumps({"mode": "folder", "path": "C:\\Users\\me\\Startup"})
    harbour_in(desktop(editor, {"set_export_place": {"value": {"mode": "downloads", "folder": ""}}}, stored=tampered))
    dialog = open_general(editor)
    expect(radio(dialog, "The Downloads folder")).to_be_checked()
    expect(dialog.get_by_text("No folder chosen yet.")).to_be_visible()
    expect(dialog.get_by_text("C:\\Users\\me\\Startup")).to_have_count(0)
    assert stored(editor) is None
    assert place_calls(editor) == [["set_export_place", {"mode": "folder", "path": "C:\\Users\\me\\Startup", "forget": False}]]


def test_a_stored_folder_that_differs_from_the_shells_record_shows_the_folder_the_shell_answers(editor):
    tampered = json.dumps({"mode": "folder", "path": "C:\\Users\\me\\Startup"})
    harbour_in(desktop(editor, {"set_export_place": {"value": {"mode": "folder", "folder": "D:\\Exports"}}}, stored=tampered))
    dialog = open_general(editor)
    expect(radio(dialog, "A folder you choose")).to_be_checked()
    expect(dialog.get_by_text("D:\\Exports", exact=True)).to_be_visible()
    expect(dialog.get_by_text("C:\\Users\\me\\Startup")).to_have_count(0)
    assert json.loads(stored(editor)) == {"mode": "folder", "path": "D:\\Exports"}
    assert place_calls(editor) == [["set_export_place", {"mode": "folder", "path": "C:\\Users\\me\\Startup", "forget": False}]]


def test_in_ask_mode_the_page_asks_the_shell_before_any_export_request_and_a_no_saves_nothing(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    exports = watch(editor, "/api/export")
    files = downloads(editor)
    export_button(editor).click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the page to ask the shell where to save")
    assert exports == [], "the export was requested before the shell was asked"
    answer(editor, "ask_export_place", False)
    expect(editor.status).to_have_text("Nothing was saved.")
    assert exports == [] and files == []
    with editor.page.expect_download() as download:
        export_button(editor).click()
        answer(editor, "ask_export_place", True)
    assert len(exports) == 1, exports
    asked = calls(editor, "ask_export_place")
    assert asked == [{"name": download.value.suggested_filename}] * 2, asked


def test_in_ask_mode_a_yes_from_the_shell_is_followed_by_exactly_one_export(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    exports = watch(editor, "/api/export")
    files = downloads(editor)
    export_button(editor).click()
    answer(editor, "ask_export_place", True)
    expect(editor.status).to_contain_text("Static site exported")
    editor.eventually(lambda: len(files) == 1, "the download")
    assert len(exports) == 1, exports
    assert files[0].suggested_filename.endswith("-site.zip")


def test_two_exports_in_a_row_in_ask_mode_ask_twice_in_order(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    asked_routes = watch(editor, "/api/")
    files = downloads(editor)
    export_button(editor).click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the first question")
    open_menu(editor, "File", "file.download").click()
    assert held(editor, "ask_export_place") == 1, "the second download asked before the first was answered"
    answer(editor, "ask_export_place", True)
    editor.eventually(lambda: len(files) == 1, "the first download")
    answer(editor, "ask_export_place", True)
    editor.eventually(lambda: len(files) == 2, "the second download")
    names = [f.suggested_filename for f in files]
    assert names[0].endswith("-site.zip") and names[1].endswith(".fweb"), names
    assert calls(editor, "ask_export_place") == [{"name": names[0]}, {"name": names[1]}]
    fetched = [url for url in asked_routes if "/api/export" in url or "/api/project-file" in url]
    assert [("export" if "/api/export" in url else "project") for url in fetched] == ["export", "project"], fetched


def test_when_the_shell_reports_the_chosen_folder_could_not_be_used_the_notice_names_both_folders(editor):
    harbour_in(desktop(editor, stored='{"mode":"folder","path":"/home/me/Exports"}'))
    with editor.page.expect_download() as download:
        export_button(editor).click()
    name = download.value.suggested_filename
    expect(notice(editor)).to_have_text(f"Saving {name}...")
    tell(editor, {"url": download.value.url, "ok": True, "file": name, "folder": "/home/me/Downloads", "unusable": "/home/me/Exports"})
    expect(notice(editor)).to_contain_text("/home/me/Exports")
    expect(notice(editor)).to_contain_text(f"so {name} was saved to /home/me/Downloads.")
    expect(editor.page.locator(".fw-notice")).to_have_class(re.compile(r"\bis-error\b"))
    expect(editor.page.locator(".fw-notice").get_by_role("button", name="Show in folder")).to_be_visible()


def test_after_a_save_the_notice_names_the_folder_the_shell_reported_and_show_in_folder_asks_the_shell(editor):
    harbour_in(desktop(editor, stored='{"mode":"folder","path":"/home/me/Exports/café sites"}'))
    with editor.page.expect_download() as download:
        export_button(editor).click()
    name = download.value.suggested_filename
    expect(notice(editor)).to_have_text(f"Saving {name}...")
    tell(editor, {"url": download.value.url, "ok": True, "file": name, "folder": "/home/me/Exports/café sites", "unusable": ""})
    expect(notice(editor)).to_have_text(f"Exported {name} to /home/me/Exports/café sites.")
    expect(editor.page.locator(".fw-notice")).not_to_have_class(re.compile(r"\bis-error\b"))
    assert calls(editor, "reveal_download") == []
    editor.page.locator(".fw-notice").get_by_role("button", name="Show in folder").click()
    editor.eventually(lambda: calls(editor, "reveal_download") == [None], "Show in folder to ask the shell")


def test_when_the_shell_refuses_a_download_it_was_not_asked_for_the_notice_says_nothing_was_saved(editor):
    harbour_in(desktop(editor, {"ask_export_place": {"value": True}}, stored='{"mode":"ask","path":""}'))
    with editor.page.expect_download() as download:
        export_button(editor).click()
    name = download.value.suggested_filename
    expect(notice(editor)).to_have_text(f"Saving {name}...")
    tell(editor, {"url": download.value.url, "ok": False, "reason": "not-asked", "file": name, "folder": "", "unusable": ""})
    expect(notice(editor)).to_have_text("Nothing was saved.")
    expect(editor.page.locator(".fw-notice")).not_to_have_class(re.compile(r"\bis-error\b"))


def test_in_ask_mode_an_error_from_the_shell_saves_nothing(editor):
    harbour_in(desktop(editor, {"ask_export_place": {"error": "the dialog could not open"}}, stored='{"mode":"ask","path":""}'))
    exports = watch(editor, "/api/export")
    files = downloads(editor)
    export_button(editor).click()
    expect(editor.status).to_have_text("Nothing was saved.")
    assert calls(editor, "ask_export_place") != []
    assert exports == [] and files == []


def test_download_project_in_ask_mode_asks_the_shell_first_and_a_no_saves_nothing(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    fetched = watch(editor, "/api/project-file")
    files = downloads(editor)
    open_menu(editor, "File", "file.download").click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the page to ask the shell")
    assert fetched == []
    answer(editor, "ask_export_place", False)
    expect(editor.status).to_have_text("Nothing was saved.")
    assert fetched == [] and files == []
    with editor.page.expect_download() as download:
        open_menu(editor, "File", "file.download").click()
        answer(editor, "ask_export_place", True)
    assert download.value.suggested_filename.endswith(".fweb"), download.value.suggested_filename
    assert len(fetched) == 1
    assert calls(editor, "ask_export_place") == [{"name": download.value.suggested_filename}] * 2


def test_the_qr_code_download_in_ask_mode_asks_the_shell_first_and_a_no_saves_nothing(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    fetched = watch(editor, "/api/qr")
    files = downloads(editor)
    open_menu(editor, "Page", "page.qr").click()
    dialog = editor.page.get_by_role("dialog", name="QR code")
    dialog.get_by_role("button", name="Download", exact=True).click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the page to ask the shell")
    assert fetched == []
    answer(editor, "ask_export_place", False)
    expect(editor.status).to_have_text("Nothing was saved.")
    assert fetched == [] and files == []
    open_menu(editor, "Page", "page.qr").click()
    with editor.page.expect_download() as download:
        dialog.get_by_role("button", name="Download", exact=True).click()
        answer(editor, "ask_export_place", True)
    assert re.fullmatch(r"qr-.+\.png", download.value.suggested_filename), download.value.suggested_filename
    assert len(fetched) == 1
    assert calls(editor, "ask_export_place") == [{"name": download.value.suggested_filename}] * 2


def test_the_choice_survives_a_reload_and_is_handed_to_the_shell_again_at_start(editor):
    harbour_in(desktop(editor, {"choose_export_folder": {"value": "/home/me/Exports"}}))
    dialog = open_general(editor)
    radio(dialog, "A folder you choose").click()
    expect(dialog.get_by_text("/home/me/Exports", exact=True)).to_be_visible()
    before = len(place_calls(editor))
    editor.page.reload(wait_until="domcontentloaded")
    back_to_editor(editor)
    started = place_calls(editor)[before:]
    assert started == [["set_export_place", {"mode": "folder", "path": "/home/me/Exports", "forget": False}]], started
    dialog = open_general(editor)
    expect(radio(dialog, "A folder you choose")).to_be_checked()
    expect(dialog.get_by_text("/home/me/Exports", exact=True)).to_be_visible()


def test_the_choice_is_in_neither_the_site_state_nor_the_export(editor):
    marker = "/home/me/fw-marker-folder-9147"
    harbour_in(desktop(editor, {"choose_export_folder": {"value": marker}}))
    dialog = open_general(editor)
    radio(dialog, "A folder you choose").click()
    expect(dialog.get_by_text(marker, exact=True)).to_be_visible()
    assert marker in stored(editor)
    with urllib.request.urlopen(editor.base + "/api/state", timeout=30) as r:
        state = r.read().decode("utf-8")
    assert "harbour" in state.lower()
    assert marker not in state and KEY not in state
    with urllib.request.urlopen(editor.base + "/api/export", timeout=60) as r:
        archive = zipfile.ZipFile(io.BytesIO(r.read()))
    assert archive.namelist()
    for name in archive.namelist():
        body = archive.read(name)
        assert marker.encode() not in body and KEY.encode() not in body, name


def test_reset_all_preferences_puts_the_choice_back_to_downloads_and_tells_the_shell_to_forget(editor):
    harbour_in(desktop(editor, stored='{"mode":"folder","path":"/home/me/Exports"}'))
    dialog = open_general(editor)
    expect(radio(dialog, "A folder you choose")).to_be_checked()
    dialog.get_by_role("button", name="Reset All Preferences...").click()
    with editor.page.expect_navigation():
        dialog.get_by_role("button", name="Reset", exact=True).click()
    back_to_editor(editor)
    assert {"mode": "downloads", "path": "", "forget": True} in calls(editor, "set_export_place")
    assert calls(editor, "set_export_place")[-1] == {"mode": "downloads", "path": "", "forget": False}
    assert stored(editor) is None
    dialog = open_general(editor)
    expect(radio(dialog, "The Downloads folder")).to_be_checked()
    expect(dialog.get_by_text("No folder chosen yet.")).to_be_visible()


def test_a_malformed_stored_value_means_downloads(editor):
    harbour_in(desktop(editor, stored='{"mode":"ask","path":""}'))
    dialog = open_general(editor)
    expect(radio(dialog, "Ask each time")).to_be_checked()
    for bad in ('{not json', '{"mode":"folder"}', '{"mode":"elsewhere","path":"/home/me/Exports"}', '"ask"'):
        editor.page.evaluate("([key, value]) => { localStorage.setItem(key, value); sessionStorage.removeItem('fw-shell-calls'); }", [KEY, bad])
        editor.page.reload(wait_until="domcontentloaded")
        back_to_editor(editor)
        assert calls(editor, "set_export_place") == [{"mode": "downloads", "path": "", "forget": False}], bad
        dialog = open_general(editor)
        expect(radio(dialog, "The Downloads folder"), bad).to_be_checked()
        editor.page.keyboard.press("Escape")


def test_the_busy_export_button_keeps_the_focus_while_the_shell_is_asked_and_a_second_click_or_enter_starts_no_second_export(editor):
    harbour_in(desktop(editor, {"ask_export_place": "hold"}, stored='{"mode":"ask","path":""}'))
    exports = watch(editor, "/api/export")
    files = downloads(editor)
    button = export_button(editor)
    button.click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the page to ask the shell")
    expect(button).to_have_attribute("aria-busy", "true")
    expect(button).to_be_focused()
    button.click(force=True)
    editor.page.keyboard.press("Enter")
    expect(button).to_be_focused()
    answer(editor, "ask_export_place", True)
    editor.eventually(lambda: len(files) == 1, "the download")
    expect(button).not_to_have_attribute("aria-busy", "true")
    expect(button).to_be_focused()
    open_menu(editor, "File", "file.download").click()
    editor.eventually(lambda: held(editor, "ask_export_place") == 1, "the next question")
    asked = [entry["name"] for entry in calls(editor, "ask_export_place")]
    assert asked == [files[0].suggested_filename, asked[1]] and asked[1].endswith(".fweb"), f"a press while busy queued another export: {asked}"
    answer(editor, "ask_export_place", False)
    expect(editor.status).to_have_text("Nothing was saved.")
    assert len(exports) == 1 and len(files) == 1


def test_delete_and_backspace_on_the_rows_controls_remove_nothing(editor):
    desktop(editor, {"choose_export_folder": {"value": "/home/me/Exports"}})
    editor.open_demo("coldmere-plumbing", "services")
    editor.layer_row("hm-lead").click()
    expect(editor.layer_row("hm-lead")).to_have_attribute("aria-selected", "true")
    start = editor.site()["site"]
    dialog = open_general(editor)
    downloads_radio = radio(dialog, "The Downloads folder")
    downloads_radio.focus()
    expect(downloads_radio).to_be_focused()
    for key in ("Delete", "Backspace"):
        editor.page.keyboard.press(key)
    radio(dialog, "A folder you choose").click()
    choose = dialog.get_by_role("button", name="Choose folder...")
    choose.focus()
    expect(choose).to_be_focused()
    for key in ("Delete", "Backspace"):
        editor.page.keyboard.press(key)
    expect(dialog.get_by_text("/home/me/Exports", exact=True)).to_be_visible()
    assert editor.site()["site"] == start, "Delete or Backspace on the row's controls changed the site"
    editor.page.keyboard.press("Escape")
    expect(dialog).to_be_hidden()
    editor.layer_row("hm-lead").click()
    editor.page.keyboard.press("Delete")
    after = editor.changed_from(start)
    assert "hm-lead" not in after["nodes"]["hm-hero-copy"]["children"]
