"""Agent programs FormWeb can start in a dock tab: Claude Code, Codex and Cursor's agent.

One status answer for all three (found or not, version, the install line, signed in when a file says so), and the
launch of Codex and Cursor in a terminal tab. Each tab gets an in-app token of its own in the child's environment
(FORMWEB_INAPP_TOKEN), never on a command line, and the token ends with the tab. The MCP entry is named formweb_tab
so it never shadows the `formweb` entry of a project file.
"""
import json
import os
import shlex
import shutil
import subprocess
import time
from pathlib import Path

from . import claude_code
from .engine import EngineError

PROGRAMS = {
    'claude': {'title': 'Claude Code', 'bin': 'claude', 'install': claude_code.INSTALL_LINE},
    'codex': {'title': 'Codex', 'bin': 'codex', 'install': 'npm install -g @openai/codex'},
    'cursor': {'title': 'Cursor', 'bin': 'cursor-agent', 'install': 'curl https://cursor.com/install -fsS | bash'},
}
TOKEN_ENV = 'FORMWEB_INAPP_TOKEN'
LOOK_EVERY = 60.0
_PATHS: dict[str, str] = {}
_LOOKED: dict[str, float] = {}
_VERSIONS: dict[str, tuple] = {}


def reset():
    _PATHS.clear()
    _LOOKED.clear()
    _VERSIONS.clear()


def _login_lookup(name):
    shell = os.environ.get('SHELL') or shutil.which('bash') or '/bin/sh'
    try:
        done = subprocess.run([shell, '-l', '-c', 'command -v ' + shlex.quote(name)], capture_output=True, text=True, timeout=6, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.SubprocessError):
        return None
    lines = [line.strip() for line in done.stdout.splitlines() if line.strip()]
    return lines[-1] if lines and Path(lines[-1]).is_file() else None


def find(kind):
    kept = _PATHS.get(kind)
    if kept and Path(kept).is_file():
        return kept
    name = PROGRAMS[kind]['bin']
    path = claude_code.known() if kind == 'claude' else shutil.which(name)
    if not path and os.name != 'nt' and time.monotonic() - _LOOKED.get(kind, -LOOK_EVERY) >= LOOK_EVERY:
        _LOOKED[kind] = time.monotonic()
        path = claude_code.cli() if kind == 'claude' else _login_lookup(name)
    if path:
        _PATHS[kind] = path
    else:
        _PATHS.pop(kind, None)
    return path


def version(path):
    try:
        stamp = os.stat(path).st_mtime
    except OSError:
        return None
    kept = _VERSIONS.get(path)
    if kept and kept[0] == stamp:
        return kept[1]
    text = None
    try:
        done = subprocess.run(claude_code._wrap([path, '--version']), capture_output=True, text=True, timeout=8, stdin=subprocess.DEVNULL, env=claude_code.child_env())
        lines = (done.stdout or done.stderr).strip().splitlines()
        text = lines[0][:80] if lines else None
    except (OSError, subprocess.SubprocessError):
        pass
    _VERSIONS[path] = (stamp, text)
    return text


def signed_in(kind):
    home = Path.home()
    if kind == 'claude':
        folder = Path(os.getenv('CLAUDE_CONFIG_DIR') or home / '.claude')
        return True if os.getenv('CLAUDE_CODE_OAUTH_TOKEN') or (folder / '.credentials.json').is_file() else None
    if kind == 'codex':
        return True if (Path(os.getenv('CODEX_HOME') or home / '.codex') / 'auth.json').is_file() else None
    return None


def status():
    found = {}
    for kind, spec in PROGRAMS.items():
        path = find(kind)
        found[kind] = {'installed': path is not None, 'version': version(path) if path else None, 'install': '' if path else spec['install'], 'signedIn': signed_in(kind) if path else None, 'path': path, 'title': spec['title']}
    return found


def cursor_config(folder):
    path = Path(folder) / '.cursor' / 'mcp.json'
    try:
        current = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
    except (OSError, ValueError):
        return None
    if not isinstance(current, dict) or not isinstance(current.get('mcpServers', {}), dict):
        return None
    entry = {'url': claude_code.mcp_url(), 'headers': {claude_code.INAPP_HEADER: '${env:' + TOKEN_ENV + '}'}}
    if current.get('mcpServers', {}).get(claude_code.ENTRY) != entry:
        current['mcpServers'] = {**current.get('mcpServers', {}), claude_code.ENTRY: entry}
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(handle, 'w', encoding='utf-8') as out:
            out.write(json.dumps(current, indent=2) + '\n')
    if os.name != 'nt':
        os.chmod(path, 0o600)
    return path


def launch(kind):
    spec = PROGRAMS[kind]
    path = find(kind)
    if not path:
        error = EngineError(f'{spec["title"]} is not installed on this computer. Install it with: {spec["install"]}', 424)
        error.details = {'code': claude_code.NOT_INSTALLED, 'install': spec['install']}
        raise error
    folder = claude_code.workdir()
    argv = [path]
    if kind == 'codex':
        argv += ['-c', f'mcp_servers.{claude_code.ENTRY}.url="{claude_code.mcp_url()}"', '-c', f'mcp_servers.{claude_code.ENTRY}.env_http_headers={{"{claude_code.INAPP_HEADER}"="{TOKEN_ENV}"}}']
    else:
        cursor_config(folder)
    token = claude_code.issue_env(spec['title'])
    return claude_code._wrap(argv), claude_code.child_env({TOKEN_ENV: token}), folder, token
