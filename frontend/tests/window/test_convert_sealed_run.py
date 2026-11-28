"""The sealed run of a section's script during conversion (plan D2 to D7). The section is made by hand with
code.section.set and converted through library.convert-section; no service part is replaced."""
from urllib.parse import urlsplit

HTML = '<div class="wrap"><button class="go">Start</button></div>'
LOOK_SCRIPT = """
var sheet = document.createElement('style');
sheet.textContent = [
  '.wrap { background-image: linear-gradient(90deg, rgb(10, 20, 30), rgb(200, 100, 50)); padding: 20px; }',
  '.go { background-color: rgb(0, 128, 0); color: rgb(255, 255, 255); }'
].join('\\n');
document.head.appendChild(sheet);
"""
NETWORK = """
try { fetch('https://evil.example.org/f'); } catch (e) {}
try { var i = new Image(); i.src = 'https://evil.example.org/i.png'; document.body.appendChild(i); } catch (e) {}
try { new WebSocket('wss://evil.example.org/s'); } catch (e) {}
setTimeout(function () { location.href = 'https://evil.example.org/away'; }, 30);
"""
WATCH = """() => { window.__sealed = []; new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => {
  if (n.tagName === 'IFRAME' && n.classList.contains('fw-convert-frame')) window.__sealed.push(n.getAttribute('sandbox'));
}))).observe(document.body, { childList: true, subtree: true }); }"""


def element(key, name):
    return {"id": key, "tag": "div", "name": name, "text": "", "children": [], "attrs": {}, "styles": {}, "breakpoints": {}}


def made(editor, js):
    home = next(p for p in editor.site()["site"]["pages"] if p["slug"] == "/")
    editor.command(None, [
        {"command": "code.sections.allow", "params": {"enabled": True}},
        {"command": "node.add", "params": {"parent": home["root"], "node": element("sealed-host", "Sealed")}},
        {"command": "code.section.set", "params": {"node": "sealed-host", "value": {"enabled": True, "html": HTML, "css": "", "js": js}}},
    ], batch=True)
    editor.until(lambda s: "sealed-host" in ((s.get("extensions", {}).get("code") or {}).get("sections") or {}), "the hand-made code section")


def converted(editor, run):
    editor.page.evaluate(WATCH)
    answer = editor.page.evaluate("r => window.formweb.run('library.convert-section', {node: 'sealed-host', keepScript: true, run: r})", run)
    assert answer["ran"] is True, answer
    site = editor.until(lambda s: "sealed-host" not in ((s.get("extensions", {}).get("code") or {}).get("sections") or {}), "the section to become elements")
    frames, left = editor.page.evaluate("() => [window.__sealed, document.querySelectorAll('iframe.fw-convert-frame').length]")
    return site, ([f for f in frames if "allow-scripts" in (f or "")], left)


def styles_of(site, tag):
    return [node.get("styles") or {} for node in site["nodes"].values() if node.get("tag") == tag]


def gradient_on_a_div(site):
    return any("linear-gradient" in str(value) for styles in styles_of(site, "div") for value in styles.values())


def green_button(site):
    return any(str(styles.get("background-color", "")).replace(" ", "").lower() in ("rgb(0,128,0)", "#008000", "green") for styles in styles_of(site, "button"))


def test_with_run_the_scripts_stylesheet_reaches_the_stored_styles_through_one_frame_sandboxed_to_scripts_only(harbour):
    made(harbour, LOOK_SCRIPT)
    site, (frames, left) = converted(harbour, True)
    assert gradient_on_a_div(site), f"no wrapper carries the script's gradient: {styles_of(site, 'div')[-3:]}"
    assert green_button(site), f"the button has not the script's green: {styles_of(site, 'button')}"
    assert frames == ["allow-scripts"], f"sealed frames seen during the run: {frames}"
    assert left == 0, "the sealed frame is still in the window after the conversion"


def test_a_script_that_tries_the_network_reaches_no_outside_host_and_the_conversion_still_ends(harbour):
    hits, sockets = [], []
    harbour.page.route("**/*", lambda route: (hits.append(route.request.url), route.abort()) if urlsplit(route.request.url).hostname == "evil.example.org" else route.fallback())
    harbour.page.on("websocket", lambda ws: sockets.append(ws.url))
    made(harbour, LOOK_SCRIPT + NETWORK)
    site, (frames, left) = converted(harbour, True)
    assert frames == ["allow-scripts"] and left == 0, (frames, left)
    assert hits == [] and sockets == [], f"requests left for the outside host: {hits} {sockets}"


def test_without_run_the_same_section_converts_with_none_of_the_scripts_look(harbour):
    made(harbour, LOOK_SCRIPT)
    site, (frames, left) = converted(harbour, False)
    assert any(node.get("tag") == "button" for node in site["nodes"].values()), "the button did not arrive as an element"
    assert frames == [] and left == 0, f"a frame that runs scripts was made without run: {frames}"
    assert not gradient_on_a_div(site) and not green_button(site), "the script's look arrived without run"
