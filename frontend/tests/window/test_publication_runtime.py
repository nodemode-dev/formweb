import json
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from conftest import _Engine, _open_editor

MEMBERS_WORD = "TIDEPOOL-ORCHID"
PASSWORD = "harbour-member-2026"
PRODUCT = {"id": "gid://shopify/Product/1", "title": "Season pass", "variants": [{"id": "gid://shopify/ProductVariant/11", "title": "Adult", "price": {"amount": "120.00", "currencyCode": "EUR"}, "availableForSale": True}]}
SITE_CODE = """<script>addEventListener('load', async () => {
  const prefix = JSON.parse(document.getElementById('fw-config').textContent).routePrefix || '';
  try { const r = await fetch(prefix + 'routes.json'); document.documentElement.dataset.routes = r.ok ? String((await r.json()).length) : 'status ' + r.status; } catch (e) { document.documentElement.dataset.routes = 'refused'; }
});</script>"""
FRAME = """<!doctype html><script>
(async () => {
  const { base, prefix, site, slug, version } = Object.fromEntries(new URLSearchParams(location.search));
  const context = `site=${site}&slug=${slug}&version=${version}`;
  const made = 'x'.repeat(43);
  const out = {};
  const probe = async (name, url, init) => { try { const r = await fetch(url, init); const body = await r.text(); out[name] = r.ok ? 'read' : 'refused'; if (body.includes('runtimeToken')) out[name] = 'token'; } catch (e) { out[name] = 'refused'; } };
  await probe('page', base + prefix);
  await probe('routes', base + prefix + 'routes.json');
  await probe('members', base + prefix + 'members/');
  await probe('page with a made-up token', base + prefix, { headers: { 'X-FormWeb-Runtime': made } });
  await probe('runtime without a token', `${base}/api/runtime/member/session?${context}`);
  await probe('runtime with a made-up token', `${base}/api/runtime/~${made}/member/session?${context}`);
  await probe('sign in with a made-up token', `${base}/api/runtime/~${made}/member/login?${context}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'grace@example.org', password: 'harbour-member-2026' }) });
  await probe('engine', base + '/api/state');
  await probe('window key', base + '/api/window/key', { method: 'POST' });
  parent.postMessage(out, '*');
})();
</script>"""
HOLDER = """<!doctype html><title>Another website</title><iframe id="held" sandbox="allow-scripts"></iframe>
<script>addEventListener('message', event => { document.documentElement.dataset.probe = JSON.stringify(event.data); });</script>"""


class Files(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        body, kind = {"/stops.json": (json.dumps({"title": "Twelve ferry stops today"}), "application/json"), "/holder.html": (HOLDER, "text/html"), "/frame.html": (FRAME, "text/html")}.get(path, ("", "text/plain"))
        self.send_response(200 if body else 404)
        self.send_header("content-type", kind)
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass


def node(identifier, tag, text="", **attrs):
    return {"id": identifier, "tag": tag, "name": identifier, "attrs": attrs, "styles": {}, "children": [], "text": text}


def add(parent, item):
    return {"command": "node.add", "params": {"parent": parent, "node": item}}


def call(editor, path, body):
    return editor.page.evaluate("""async ([path, body]) => {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FormWeb-Window-Key': sessionStorage.getItem('formweb_window_key') }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }""", [path, body])


@pytest.fixture(scope="module")
def club(chromium):
    files = ThreadingHTTPServer(("localhost", 0), Files)
    threading.Thread(target=files.serve_forever, daemon=True).start()
    elsewhere = f"http://localhost:{files.server_address[1]}"
    engine = _Engine({"FORMWEB_FETCH_SOURCES": json.dumps({"stops": {"url": f"http://127.0.0.1:{files.server_address[1]}/stops.json", "public": True, "fields": ["title"]}}), "FORMWEB_FETCH_HOSTS": "127.0.0.1", "FORMWEB_PROVIDER_ALLOW_LOOPBACK": "1"})
    base = engine.ready()
    context, editor = _open_editor(chromium, base)
    editor.page.wait_for_function("() => sessionStorage.getItem('formweb_window_key')")
    assert call(editor, "/api/new", {"name": "Harbour Club"})["status"] == 200
    site = editor.site()["site"]
    home = site["pages"][0]["root"]
    reply = call(editor, "/api/batch", {"commands": [
        add(home, node("club-login", "div")), add(home, node("club-gate", "div")), add(home, node("club-data", "div")), add(home, node("club-product", "div")),
        add(home, node("club-link", "a", "Members area", href="/members")),
        {"command": "page.add", "params": {"name": "Members", "slug": "/members", "id": "members", "root": "members-root"}},
        add("members-root", node("members-word", "p", f"Only members read the {MEMBERS_WORD} rota.")),
        add("members-root", node("members-gate", "div")),
        {"command": "extension.set", "params": {"group": "integrations", "value": {
            "endpointBase": base,
            "widgets": {"club-login": {"type": "member-login"}, "club-gate": {"type": "member-gate"}, "members-gate": {"type": "member-gate"}, "club-data": {"type": "fetch", "source": "stops", "field": "title"}, "club-product": {"type": "product", "product": PRODUCT["id"]}},
            "gates": [{"route": "/members", "groups": ["member"]}],
        }}},
        {"command": "extension.set", "params": {"group": "code", "value": {"siteCode": {"bodyEnd": SITE_CODE}}}},
    ]})
    assert reply["status"] == 200, reply
    with sqlite3.connect(engine.sandbox / "data" / "providers.sqlite3") as db:
        db.execute("CREATE TABLE IF NOT EXISTS records (namespace TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(namespace,id))")
        db.execute("INSERT OR REPLACE INTO records VALUES (?,?,?,?)", ("catalogs", site["id"], json.dumps({"provider": "Shopify", "status": "ready", "products": [PRODUCT]}), time.time()))
    published = call(editor, "/api/publish", {"slug": "club"})
    assert published["status"] == 200, published
    preview = call(editor, "/api/preview", {})
    assert preview["status"] == 200, preview
    yield {"editor": editor, "base": base, "site": site["id"], "published": published["body"], "preview": preview["body"]["url"], "elsewhere": elsewhere}
    context.close()
    engine.stop()
    files.shutdown()


def widget(page, owner, inner="[data-fw-output]"):
    return page.locator(f"[data-fw-owner={owner}] {inner}")


def sign_up_and_in(page, email):
    form = page.locator("[data-fw-owner=club-login]")
    status = form.locator(".fw-widget-status")
    form.locator("input[name=email]").fill(email)
    form.locator("input[name=password]").fill(PASSWORD)
    form.locator("[data-fw-register]").click()
    page.wait_for_function("() => document.querySelector('[data-fw-owner=club-login] .fw-widget-status').textContent")
    assert status.inner_text() == "Account created. You can sign in."
    form.locator("input[name=password]").fill(PASSWORD)
    form.get_by_role("button", name="Sign in").click()
    page.wait_for_function("() => document.querySelector('[data-fw-owner=club-login] .fw-widget-status').textContent === 'Signed in.'")


def open_widgets(club, address, email):
    page = club["editor"].page.context.new_page()
    page.goto(address)
    assert page.evaluate("() => self.origin") == "null"
    page.wait_for_function("() => document.querySelector('[data-fw-owner=club-data] [data-fw-output]').textContent")
    assert widget(page, "club-data").inner_text() == "Twelve ferry stops today"
    page.wait_for_function("() => document.querySelector('[data-fw-product-title]').textContent")
    assert page.locator("[data-fw-product-title]").inner_text() == "Season pass"
    assert page.locator("[data-fw-price]").inner_text() == "120.00 EUR"
    sign_up_and_in(page, email)
    page.wait_for_function("() => document.querySelector('[data-fw-owner=club-gate] [data-fw-output]').textContent === 'Authenticated member session.'")
    return page


@pytest.mark.parametrize("address", ["published", "active"])
def test_a_local_publication_signs_a_member_in_opens_the_members_page_and_shows_its_widgets(club, address):
    editor = club["editor"]
    if address == "active":
        assert call(editor, "/api/releases/promote", {"slug": "club", "version": club["published"]["version"]})["status"] == 200
    url = club["published"]["url"] if address == "published" else club["base"] + "/sites/club/"
    page = open_widgets(club, url, f"{address}@example.org")
    page.wait_for_function("() => document.documentElement.dataset.routes")
    assert page.evaluate("() => document.documentElement.dataset.routes") == "2"
    page.get_by_text("Members area").click()
    page.wait_for_function(f"() => document.body.innerText.includes('{MEMBERS_WORD}')")
    page.wait_for_function("() => document.querySelector('[data-fw-owner=members-gate] [data-fw-output]').textContent === 'Authenticated member session.'")
    assert page.evaluate("() => location.pathname").endswith("/members/")
    assert "fw-member" not in page.evaluate("() => location.href")
    page.reload()
    page.wait_for_load_state("load")
    assert MEMBERS_WORD not in page.content()
    page.close()


def test_preview_shows_the_same_widgets_and_signs_a_member_in(club):
    page = open_widgets(club, club["preview"], "preview@example.org")
    page.close()


def test_a_sandboxed_frame_on_another_website_cannot_use_the_publication_runtime_or_read_its_pages(club):
    editor = club["editor"]
    before = editor.site()
    published = club["published"]
    page = editor.page.context.new_page()
    page.goto(club["elsewhere"] + "/holder.html")
    page.evaluate("([base, prefix, site, version]) => { document.getElementById('held').src = 'frame.html?' + new URLSearchParams({ base, prefix, site, slug: 'club', version }); }", [club["base"], f"/published/club/{published['version']}/", club["site"], published["version"]])
    page.wait_for_function("() => document.documentElement.dataset.probe")
    probe = json.loads(page.evaluate("() => document.documentElement.dataset.probe"))
    assert probe == {name: "refused" for name in ("page", "routes", "members", "page with a made-up token", "runtime without a token", "runtime with a made-up token", "sign in with a made-up token", "engine", "window key")}
    after = editor.site()
    assert after["revision"] == before["revision"] and after["site"]["name"] == "Harbour Club"
    assert editor.page.evaluate("() => sessionStorage.getItem('formweb_window_key')")
    page.close()
