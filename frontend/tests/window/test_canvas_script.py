import urllib.error

from playwright.sync_api import expect

RUN = "parent.document.title='pwned';top.localStorage.setItem('pwned','1');parent.formweb&&parent.formweb.run('page.duplicate');window.name='ran'"
HOSTILE_PAGE = f"""<!doctype html><html><head><title>Hostile</title>
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline'">
<meta http-equiv="refresh" content="0;url=https://example.com/">
<base href="https://example.com/">
<script>{RUN}</script></head>
<body onload="{RUN}"><p id="hostile-mark">Hostile page</p>
<img src="x" onerror="{RUN}">
<a href="javascript:{RUN}">javascript link</a>
<form action="javascript:{RUN}"><button>Go</button></form>
<iframe srcdoc="<script>{RUN}</script>"></iframe>
<svg><script>{RUN}</script><a><set attributeName="href" to="javascript:{RUN}"/><text y="10">svg</text></a></svg>
<script type="module">{RUN}</script>
</body></html>"""


def snapshot(editor):
    return {
        "title": editor.page.title(),
        "storage": editor.page.evaluate("JSON.stringify(Object.entries(localStorage).sort())"),
        "frame_url": editor.canvas.locator("html").evaluate("e => e.ownerDocument.defaultView.location.href"),
        "frame_name": editor.canvas.locator("html").evaluate("e => e.ownerDocument.defaultView.name"),
    }


def navigable_links(editor):
    return editor.page.locator('iframe[title="Website canvas"]').evaluate(
        """f => { let n = 0; const walk = d => { n += d.querySelectorAll('a[href], area[href]').length;
        for (const inner of d.querySelectorAll('iframe, frame')) { try { if (inner.contentDocument) walk(inner.contentDocument); } catch (e) {} } };
        walk(f.contentDocument); return n; }"""
    )


def accepted(editor, name, params):
    try:
        return editor.command(name, params)["revision"]
    except urllib.error.HTTPError:
        return None


def test_hostile_content_from_import_html_and_engine_commands_runs_nothing_on_the_canvas(coldmere):
    page = coldmere.page
    before = snapshot(coldmere)
    start = coldmere.site()["site"]
    page.locator('[data-menu="File"]').click()
    page.locator('[role="menu"]:visible [data-command="file.import-html"]').click()
    page.get_by_placeholder("<!doctype html>").fill(HOSTILE_PAGE)
    page.get_by_role("button", name="Import as section").click()
    imported = coldmere.changed_from(start)
    section = next(key for key in imported["nodes"] if key not in start["nodes"])
    expect(coldmere.canvas.locator(f'[data-fw-id="{section}"]')).to_be_attached()

    revisions = [
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-text", "tag": "p", "text": f'<img src=x onerror="{RUN}"><script>{RUN}</script>'}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-embed", "tag": "div", "attrs": {"data-fw-embed": f"javascript:{RUN}"}}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-top", "tag": "a", "text": "top", "attrs": {"href": "/services", "target": "_top"}}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-code", "tag": "div"}}),
        accepted(coldmere, "code.section.set", {"node": "ev-code", "value": {"html": f'<img src=x onerror="{RUN}"><script>{RUN}</script><a href="javascript:{RUN}">j</a><iframe srcdoc="<script>{RUN}</script>"></iframe>', "css": "", "js": RUN}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-script", "tag": "script", "text": RUN}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-js", "tag": "a", "text": "js", "attrs": {"href": f"javascript:{RUN}"}}}),
        accepted(coldmere, "node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-on", "tag": "p", "text": "on", "attrs": {"onmouseover": RUN}}}),
    ]
    last = max(r for r in revisions if r is not None)
    assert revisions[0] and revisions[4], "the text and the code section must reach the site for this check to mean anything"
    assert revisions[5] is None and revisions[6] is None and revisions[7] is None
    expect(page.locator("footer.statusbar .status-revision")).to_contain_text(f"rev {last}")
    for key in ("ev-text", "ev-embed", "ev-top", "ev-code"):
        expect(coldmere.canvas.locator(f'[data-fw-id="{key}"]')).to_be_attached()
    coldmere.canvas.locator('[data-fw-id="ev-text"]').click()
    expect(coldmere.layer_row("ev-text")).to_have_attribute("aria-selected", "true")
    coldmere.canvas.locator(f'[data-fw-id="{section}"]').click()
    expect(coldmere.layer_row(section)).to_have_attribute("aria-selected", "true")

    assert snapshot(coldmere) == before
    assert "pwned" not in page.title()
    assert coldmere.site()["revision"] == last
    assert navigable_links(coldmere) == 0
    assert len(page.context.pages) == 1


def test_clicking_middle_clicking_and_ctrl_clicking_a_canvas_link_opens_and_navigates_nothing(coldmere):
    page = coldmere.page
    revision = coldmere.command("node.add", {"parent": "hm-hero-copy", "node": {"id": "ev-out", "tag": "a", "text": "Outside", "attrs": {"href": "https://example.com/", "target": "_blank"}}})["revision"]
    expect(page.locator("footer.statusbar .status-revision")).to_contain_text(f"rev {revision}")
    opened = []
    page.context.on("page", lambda new: opened.append(new.url))
    before = snapshot(coldmere)
    editor_url = page.url
    for key in ("hd-nav-services", "ev-out"):
        link = coldmere.canvas.locator(f'[data-fw-id="{key}"]')
        link.click()
        expect(coldmere.layer_row(key)).to_have_attribute("aria-selected", "true")
        link.click(button="middle")
        link.click(modifiers=["Control"])
        coldmere.layer_row("hm-h1").scroll_into_view_if_needed()
        coldmere.canvas.locator('[data-fw-id="hm-h1"]').click()
        expect(coldmere.layer_row("hm-h1")).to_have_attribute("aria-selected", "true")
    assert opened == []
    assert len(page.context.pages) == 1
    assert page.url == editor_url
    assert snapshot(coldmere) == before
    assert navigable_links(coldmere) == 0
