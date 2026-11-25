import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import expect

WINDOW_DIR = Path(__file__).resolve().parent
REPO = WINDOW_DIR.parents[2]
CORE_BIN = os.environ.get("FORMWEB_CORE_BIN") or str(REPO / "native" / "target" / "release" / "formweb-core")
DIST = REPO / "frontend" / "dist"
ENGINE_CMD = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "{port}"]
ENGINE_ENV = {"FORMWEB_DATA_DIR": "{data}", "FORMWEB_PORT": "{port}", "FORMWEB_FRONTEND_DIST": "{dist}", "FORMWEB_AGENT_DIR": "{agent}", "FORMWEB_CORE_BIN": CORE_BIN}
VIEWPORT = {"width": 1440, "height": 900}
WAIT_MS = 15_000
expect.set_options(timeout=WAIT_MS)


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def chromium():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        yield browser
        browser.close()


class _Engine:
    def __init__(self, extra_env=None):
        self.port = _free_port()
        self.sandbox = Path(tempfile.mkdtemp(prefix="formweb-window-"))
        for name in ("data", "home", "agent"):
            (self.sandbox / name).mkdir()
        values = {"port": str(self.port), "data": str(self.sandbox / "data"), "dist": str(DIST), "agent": str(self.sandbox / "agent")}
        env = {k: v for k, v in os.environ.items() if not k.startswith("FORMWEB_")}
        env.update({k: v.format(**values) for k, v in ENGINE_ENV.items()})
        env["HOME"] = str(self.sandbox / "home")
        env.update(extra_env or {})
        self.log = open(self.sandbox / "engine.log", "wb")
        self.proc = subprocess.Popen([a.format(**values) for a in ENGINE_CMD], cwd=REPO / "backend", env=env, stdout=self.log, stderr=subprocess.STDOUT)
        self.base = f"http://127.0.0.1:{self.port}"

    def ready(self):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline and self.proc.poll() is None:
            try:
                with urllib.request.urlopen(self.base + "/api/health", timeout=2) as r:
                    if r.status == 200:
                        return self.base
            except OSError:
                time.sleep(0.02)
        self.stop()
        raise RuntimeError(f"engine did not answer /api/health:\n{(self.sandbox / 'engine.log').read_text('utf-8', 'replace')[-4000:]}")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.log.close()
        shutil.rmtree(self.sandbox, ignore_errors=True)


@pytest.fixture(scope="session")
def _spare_engine():
    spare = []
    yield spare
    for engine in spare:
        engine.stop()


@pytest.fixture
def fresh_engine(_spare_engine):
    assert (DIST / "index.html").is_file(), f"build the window first: {DIST} has no index.html (npm run build)"
    engine = _spare_engine.pop() if _spare_engine else _Engine()
    _spare_engine.append(_Engine())
    yield engine.ready()
    engine.stop()


class Editor:
    def __init__(self, page, base):
        self.page = page
        self.base = base
        self.window_key = None
        page.on("request", self._learn_key)

    def _learn_key(self, request):
        key = request.headers.get("x-formweb-window-key")
        if key and not self.window_key:
            self.window_key = key

    def command(self, name, params, batch=False):
        assert self.window_key, "the window has not sent a change yet"
        body = {"commands": params} if batch else {"command": name, "params": params}
        request = urllib.request.Request(self.base + ("/api/batch" if batch else "/api/command"), data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json", "X-FormWeb-Window-Key": self.window_key})
        with urllib.request.urlopen(request, timeout=30) as r:
            return json.loads(r.read())

    @property
    def canvas(self):
        return self.page.frame_locator('iframe[title="Website canvas"]')

    @property
    def status(self):
        return self.page.locator("footer.statusbar .status-message")

    def site(self):
        with urllib.request.urlopen(self.base + "/api/state", timeout=10) as r:
            return json.loads(r.read())

    def until(self, check, what="the expected site"):
        deadline = time.monotonic() + WAIT_MS / 1000
        while True:
            reply = self.site()
            site = reply["site"]
            if check(site):
                expect(self.page.locator("footer.statusbar .status-revision")).to_contain_text(re.compile(rf"\brev {reply['revision']}\b"))
                return site
            if time.monotonic() > deadline:
                raise AssertionError(f"timed out waiting for {what}")
            self.page.wait_for_timeout(50)

    def eventually(self, check, what):
        deadline = time.monotonic() + WAIT_MS / 1000
        while not check():
            if time.monotonic() > deadline:
                raise AssertionError(f"timed out waiting for {what}")
            self.page.wait_for_timeout(50)

    def changed_from(self, before):
        return self.until(lambda site: site != before, "the site to change")

    def restored_to(self, before):
        try:
            return self.until(lambda site: site == before, "the site to return to its earlier state")
        except AssertionError:
            site = self.site()["site"]
            nodes = sorted(k for k in set(site["nodes"]) | set(before["nodes"]) if site["nodes"].get(k) != before["nodes"].get(k))
            parts = sorted(k for k in set(site) | set(before) if site.get(k) != before.get(k))
            raise AssertionError(f"the site did not return to its earlier state: parts {parts}, nodes {nodes[:10]}") from None

    def page_names(self, site=None):
        return [p["name"] for p in (site or self.site()["site"])["pages"]]

    def page_rows(self):
        return self.page.locator("#fw-pages-list .list-row .row-label")

    def page_row(self, key):
        return self.page.locator(f'#fw-pages-list .list-row[data-key="{key}"]')

    def layer_row(self, key):
        return self.page.locator(f'#fw-layers-list .layer-row[data-key="{key}"]')

    def layer_keys(self):
        return self.page.locator("#fw-layers-list .layer-row").evaluate_all("rows => rows.map(r => r.dataset.key)")

    def menu(self):
        return self.page.locator('[role="menu"]:visible').last

    def open_demo(self, demo_id, ready_page_key):
        self.page.locator(f'[data-demo="{demo_id}"]').click()
        self.page_row(ready_page_key).wait_for()
        self.page.locator(".canvas-frame[title='Website canvas']").wait_for()
        self.canvas.locator('[data-fw-id="root"]').wait_for()

    def undo(self):
        self.page.keyboard.press("Control+z")

    def canvas_pointer(self):
        return CanvasPointer(self.page)

    def finger(self):
        return Finger(self.page)

    def pen(self, barrel=False):
        return Pen(self.page, barrel)


class CanvasPointer:
    """Trusted mouse input sent straight to Chromium through the DevTools protocol, without Playwright's drag detection."""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)
        self.at = (0.0, 0.0)

    def _send(self, kind, x, y, buttons, button="none", count=0):
        self.cdp.send("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "buttons": buttons, "button": button, "clickCount": count})
        self.at = (x, y)

    def move(self, x, y, steps=1, held=False):
        x0, y0 = self.at
        for i in range(1, steps + 1):
            self._send("mouseMoved", x0 + (x - x0) * i / steps, y0 + (y - y0) * i / steps, 1 if held else 0, "left" if held else "none")

    def down(self):
        self._send("mousePressed", *self.at, 1, "left", 1)

    def up(self):
        self._send("mouseReleased", *self.at, 0, "left", 1)


class Finger:
    """Touch input sent straight to Chromium through the DevTools protocol, one or two fingers."""

    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page)
        self.points = []

    def _send(self, kind):
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(self.points)]})

    def down(self, x, y):
        self.points.append((x, y))
        self._send("touchStart")

    def move(self, x, y, steps=1):
        x0, y0 = self.points[0]
        for i in range(1, steps + 1):
            self.points[0] = (x0 + (x - x0) * i / steps, y0 + (y - y0) * i / steps)
            self._send("touchMove")

    def up(self):
        self.points = []
        self._send("touchEnd")


class Pen(CanvasPointer):
    """Pen input through the DevTools protocol. The barrel button reaches the browser as the right button, pressed
    before the tip touches, so a press with it held starts as button 2 and moves with the tip as buttons 3."""

    def __init__(self, page, barrel=False):
        super().__init__(page)
        self.barrel = barrel

    def _send(self, kind, x, y, buttons, button="none", count=0):
        if self.barrel and buttons:
            buttons, button = (2 if kind == "mousePressed" else 3), ("right" if button != "none" else button)
        elif self.barrel and kind == "mouseReleased":
            button = "right"
        self.cdp.send("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "buttons": buttons, "button": button, "clickCount": count, "pointerType": "pen"})
        self.at = (x, y)


def _open_editor(chromium, base, **options):
    context = chromium.new_context(viewport=VIEWPORT, accept_downloads=True, **options)
    context.set_default_timeout(WAIT_MS)
    page = context.new_page()
    editor = Editor(page, base)
    page.goto(base + "/", wait_until="domcontentloaded")
    page.locator('[data-demo="harbour-ferries"]').wait_for()
    return context, editor


@pytest.fixture
def editor(chromium, fresh_engine):
    context, editor = _open_editor(chromium, fresh_engine)
    yield editor
    context.close()


@pytest.fixture
def touch_editor(chromium, fresh_engine):
    context, editor = _open_editor(chromium, fresh_engine, has_touch=True)
    yield editor
    context.close()


@pytest.fixture
def harbour(editor):
    editor.open_demo("harbour-ferries", "p-fares")
    return editor


@pytest.fixture
def coldmere(editor):
    editor.open_demo("coldmere-plumbing", "services")
    return editor
