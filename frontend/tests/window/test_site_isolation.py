import json

import pytest

PROBE = r"""<script>
(async () => {
  const r = {};
  let key = '';
  try { localStorage.setItem('fw-probe', '1'); r.storage = 'open'; } catch (e) { r.storage = 'refused'; }
  try { key = sessionStorage.getItem('formweb_window_key') || ''; } catch (e) {}
  for (const w of [window.opener, window.parent, window.top]) {
    if (!w || w === window) continue;
    try { key = key || w.sessionStorage.getItem('formweb_window_key') || ''; } catch (e) {}
    try { w.document.title = 'Changed by page'; } catch (e) {}
  }
  r.key = key ? 'found' : 'none';
  try { const s = await fetch('/api/state'); r.state = (await s.json()).site ? 'read' : 'refused'; } catch (e) { r.state = 'refused'; }
  try { const s = await fetch('/api/window/key', { method: 'POST' }); r.claim = (await s.json()).key ? 'given' : 'refused'; } catch (e) { r.claim = 'refused'; }
  try {
    const s = await fetch('/api/batch', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-FormWeb-Window-Key': key } : {}) }, body: JSON.stringify({ commands: [{ command: 'site.update', params: { patch: { name: 'Changed by page' } } }] }) });
    r.batch = s.ok ? 'applied' : 'refused';
  } catch (e) { r.batch = 'refused'; }
  document.documentElement.dataset.probe = JSON.stringify(r);
})();
</script>"""

REFUSED = {"storage": "refused", "key": "none", "state": "refused", "claim": "refused", "batch": "refused"}


def call(editor, path, body):
    return editor.page.evaluate("""async ([path, body]) => {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FormWeb-Window-Key': sessionStorage.getItem('formweb_window_key') }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }""", [path, body])


@pytest.fixture
def published(editor):
    editor.page.wait_for_function("() => sessionStorage.getItem('formweb_window_key')")
    assert call(editor, "/api/new", {"name": "Probe site"})["status"] == 200
    assert call(editor, "/api/command", {"command": "extension.set", "params": {"group": "code", "value": {"siteCode": {"head": PROBE}}}})["status"] == 200
    reply = call(editor, "/api/publish", {"slug": "probe"})
    assert reply["status"] == 200
    assert call(editor, "/api/releases/promote", {"slug": "probe", "version": reply["body"]["version"]})["status"] == 200
    return {"published": reply["body"]["url"], "active": editor.base + "/sites/probe/"}


def outcome(frame):
    frame.wait_for_function("() => document.documentElement.dataset.probe", polling=50)
    return json.loads(frame.evaluate("() => document.documentElement.dataset.probe"))


def unchanged(editor, before, title):
    after = editor.site()
    assert after["revision"] == before["revision"]
    assert after["site"]["name"] == "Probe site"
    assert editor.page.title() == title
    assert editor.page.evaluate("() => sessionStorage.getItem('formweb_window_key')")


@pytest.mark.parametrize("address", ["published", "active"])
def test_a_published_page_opened_from_the_editor_cannot_reach_or_change_the_editor(editor, published, address):
    before, title = editor.site(), editor.page.title()
    with editor.page.context.expect_page() as opened:
        editor.page.evaluate("url => { window.open(url); }", published[address])
    assert outcome(opened.value) == REFUSED
    unchanged(editor, before, title)


@pytest.mark.parametrize("address", ["published", "active"])
def test_a_published_page_in_its_own_tab_cannot_reach_or_change_the_editor(editor, published, address):
    before, title = editor.site(), editor.page.title()
    tab = editor.page.context.new_page()
    tab.goto(published[address])
    assert outcome(tab) == REFUSED
    unchanged(editor, before, title)


@pytest.mark.parametrize("address", ["published", "active"])
def test_a_published_page_framed_in_the_editor_cannot_reach_or_change_the_editor(editor, published, address):
    before, title = editor.site(), editor.page.title()
    editor.page.evaluate("url => { const f = document.createElement('iframe'); f.id = 'probe-frame'; f.src = url; document.body.append(f); }", published[address])
    frame = editor.page.locator("#probe-frame").element_handle().content_frame()
    assert outcome(frame) == REFUSED
    unchanged(editor, before, title)
