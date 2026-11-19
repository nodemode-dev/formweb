import importlib
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

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent

APP_ID = "formweb"
APP_MODULE = "app.main:app"
ENV_PREFIX = "FORMWEB"
DATA_ENV = "FORMWEB_DATA_DIR"
PORT_ENV = "FORMWEB_PORT"
ENGINE_PORT = 8240
HEALTH_PATH = "/api/health"
VERSION_PATH = "/api/system"
VERSION_KEY = "version"
WINDOW_ORIGINS = [
    "http://localhost:5240",
    "http://127.0.0.1:5240",
    "http://localhost:5241",
    "http://127.0.0.1:5241",
    "http://localhost:8240",
    "http://127.0.0.1:8240",
]
WS_PATH = "/api/terminal"
MCP_PATH = "/mcp"
STDIO_CMD = [sys.executable, str(REPO / "setup" / "mcp_stdio.py")]
INAPP_HEADER = "x-formweb-inapp"
CORE_BIN = os.environ.get("FORMWEB_CORE_BIN") or str(REPO / "native" / "target" / "release" / ("formweb-core.exe" if os.name == "nt" else "formweb-core"))
VERSION_SITES = [
    ("VERSION", r"^(\S+)\s*$"),
    ("README.md", r"badge/version-([0-9.]+)-"),
    (".docs/wiki/Home.md", r"^Release version: ([0-9.]+)\."),
    (".claude/skills/formweb-harness/SKILL.md", r'^  version: "([^"]+)"'),
    (".agents/skills/formweb-harness/SKILL.md", r'^  version: "([^"]+)"'),
    ("CHANGELOG.md", r"^## ([0-9.]+) "),
    ("backend/app/config.py", r"^VERSION = '([^']+)'"),
    ("frontend/package.json", r'^  "version": "([^"]+)"'),
    ("native/Cargo.toml", r'^version = "([^"]+)"'),
    ("src-tauri/Cargo.toml", r'^version = "([^"]+)"'),
    ("src-tauri/tauri.conf.json", r'^  "version": "([^"]+)"'),
]
STRIP_EXEMPT = []

_SANDBOX = Path(tempfile.mkdtemp(prefix=f"{APP_ID}-tests-"))
for _name in ("data", "home", "agent"):
    (_SANDBOX / _name).mkdir()
_KEEP = {DATA_ENV, PORT_ENV, "FORMWEB_CORE_BIN"}
for _key in [k for k in os.environ if k.startswith(f"{ENV_PREFIX}_") and k not in _KEEP]:
    os.environ.pop(_key)
os.environ[DATA_ENV] = str(_SANDBOX / "data")
os.environ[PORT_ENV] = str(ENGINE_PORT)
os.environ["FORMWEB_CORE_BIN"] = CORE_BIN
os.environ["FORMWEB_AGENT_DIR"] = str(_SANDBOX / "agent")
os.environ["HOME"] = str(_SANDBOX / "home")
os.environ["USERPROFILE"] = str(_SANDBOX / "home")
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))

LOOPBACK = {"host": f"127.0.0.1:{ENGINE_PORT}"}


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_SANDBOX, ignore_errors=True)


def own_origin():
    return f"http://127.0.0.1:{ENGINE_PORT}"


@pytest.fixture(scope="session", autouse=True)
def rust_engine_present():
    if not Path(CORE_BIN).is_file():
        pytest.exit(f"the Rust engine is not built: {CORE_BIN} (run cargo build --release -p formweb-core in native/)", 2)


@pytest.fixture(scope="session")
def app():
    module, _, attr = APP_MODULE.partition(":")
    return getattr(importlib.import_module(module), attr)


@pytest.fixture(scope="session")
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app, base_url=own_origin(), headers=window_headers()) as c:
        yield c


def window_headers():
    key = importlib.import_module("app.window_key")
    return {key.HEADER: key.KEY}


@pytest.fixture()
def fresh(client):
    r = client.post("/api/new", json={"name": "Fixture"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def repo_versions():
    found = {}
    for rel, pattern in VERSION_SITES:
        text = (REPO / rel).read_text(encoding="utf-8")
        match = re.search(pattern, text, re.MULTILINE)
        found[rel] = match.group(1) if match else None
    return found


@pytest.fixture(scope="session")
def repo_version(repo_versions):
    return next(iter(repo_versions.values()))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url, timeout=2.0, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8") or "null")


def boot_engine(name, extra_env=None):
    port = free_port()
    data = _SANDBOX / f"engine-{name}"
    data.mkdir()
    env = dict(os.environ, **{DATA_ENV: str(data), PORT_ENV: str(port)}, **(extra_env or {}))
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", APP_MODULE, "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 90
    ready = False
    while time.monotonic() < deadline and proc.poll() is None:
        try:
            status, _ = get_json(base + HEALTH_PATH)
            ready = status == 200
        except OSError:
            ready = False
        if ready:
            break
        time.sleep(0.25)
    if not ready:
        proc.kill()
        out = proc.communicate(timeout=5)[0].decode("utf-8", "replace")
        raise RuntimeError(f"engine did not answer {HEALTH_PATH} within 90 s:\n{out[-4000:]}")
    return {"base": base, "port": port, "data": data, "env": env, "proc": proc}


def stop_engine(engine):
    engine["proc"].terminate()
    try:
        engine["proc"].wait(timeout=10)
    except subprocess.TimeoutExpired:
        engine["proc"].kill()


@pytest.fixture(scope="session")
def engine():
    e = boot_engine("plain")
    yield e
    stop_engine(e)


@pytest.fixture(scope="session")
def secured_engine():
    e = boot_engine("secured", {"FORMWEB_AUTH_TOKEN": "t" * 32, "FORMWEB_AGENTS": "1"})
    e["token"] = "t" * 32
    yield e
    stop_engine(e)
