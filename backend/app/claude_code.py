"""Claude Code launcher shared by the live terminal and the Chat pane.

Finds the user's own `claude` binary, builds a clean child environment, and hands the child an HTTP MCP config
file that points at this engine's /mcp endpoint with an in-app token of its own. Each tab and each Chat run gets
its own token and its own owner-only config file; both end when that tab or run ends.
"""
import hmac
import json
import os
import secrets
import shlex
import shutil
import subprocess
from pathlib import Path

from .config import DATA_DIR, PORT
from .engine import EngineError

TOKENS: dict[str, Path] = {}
INAPP_HEADER = 'X-FormWeb-Inapp'
KEEP_ENV = {'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CONFIG_DIR'}
INSTALL = 'Claude Code was not found. Install it with "npm install -g @anthropic-ai/claude-code" (or follow https://docs.claude.com/en/docs/claude-code/setup), run "claude" once to sign in, then try again. Set FORMWEB_CLAUDE to the full path if it lives somewhere unusual.'
NOTE = ('You are running inside FormWeb, a visual website builder. The editor is open next to you and shows every change live. '
        'Use the formweb MCP tools: call get_site first to see the current site, change it with apply_commands or edit_nodes, '
        'and use the preview and audit tools to check the result. Undo is available through history commands. '
        'Do not edit FormWeb source files; work on the site through the tools.')


def valid_token(value):
    return isinstance(value, str) and bool(value) and any(hmac.compare_digest(value.encode(), token.encode()) for token in tuple(TOKENS))


def issue():
    token = secrets.token_urlsafe(24)
    folder = DATA_DIR / 'agent-mcp'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{secrets.token_hex(8)}.json'
    handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(handle, 'w', encoding='utf-8') as out:
        out.write(mcp_config(token))
    TOKENS[token] = path
    return token, path


def revoke(token):
    path = TOKENS.pop(token, None) if token else None
    if path is not None:
        path.unlink(missing_ok=True)


def mcp_url():
    return f'http://127.0.0.1:{PORT}/mcp'


def workdir():
    folder = Path(os.getenv('FORMWEB_AGENT_DIR') or Path.home() / 'FormWeb' / 'Agent')
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _names():
    return ('claude.exe', 'claude.cmd', 'claude') if os.name == 'nt' else ('claude',)


def _dirs():
    home = Path.home()
    found = [home / '.claude' / 'local', home / '.local' / 'bin', home / '.npm-global' / 'bin', home / '.bun' / 'bin', home / '.volta' / 'bin']
    if os.name == 'nt':
        for key in ('APPDATA', 'LOCALAPPDATA'):
            base = os.getenv(key)
            if base:
                found += [Path(base) / 'npm', Path(base) / 'Programs' / 'claude']
    else:
        found += [Path('/opt/homebrew/bin'), Path('/usr/local/bin'), Path('/usr/bin')]
    return found


_found = []


def cli():
    if _found and Path(_found[0]).is_file():
        return _found[0]
    path = _locate()
    _found[:] = [path] if path else []
    return path


def known():
    return _found[0] if _found and Path(_found[0]).is_file() else _locate(False)


def _locate(login_shell=True):
    wanted = os.getenv('FORMWEB_CLAUDE', '').strip()
    if wanted and Path(wanted).is_file():
        return wanted
    path = shutil.which('claude')
    if path:
        return path
    for folder in _dirs():
        for name in _names():
            candidate = folder / name
            if candidate.is_file() and (os.name == 'nt' or os.access(candidate, os.X_OK)):
                return str(candidate)
    if login_shell and os.name != 'nt':
        shell = os.environ.get('SHELL') or shutil.which('bash') or '/bin/sh'
        try:
            done = subprocess.run([shell, '-l', '-c', 'command -v claude'], capture_output=True, text=True, timeout=6, stdin=subprocess.DEVNULL)
            lines = [line.strip() for line in done.stdout.splitlines() if line.strip()]
            if lines and Path(lines[-1]).is_file():
                return lines[-1]
        except (OSError, subprocess.SubprocessError):
            pass
    return None


def require_cli():
    path = cli()
    if not path:
        raise EngineError(INSTALL, 424)
    return path


def child_env(extra=None):
    env = {key: value for key, value in os.environ.items() if not (key.startswith('CLAUDE') and key not in KEEP_ENV)}
    env.pop('CLAUDECODE', None)
    env.update({'TERM': 'xterm-256color', 'COLORTERM': 'truecolor', 'FORMWEB_API': f'http://127.0.0.1:{PORT}', 'FORMWEB_MCP_URL': mcp_url(), 'FORMWEB_TERMINAL': '1'})
    env.update(extra or {})
    return env


def mcp_config(token):
    return json.dumps({'mcpServers': {'formweb': {'type': 'http', 'url': mcp_url(), 'headers': {INAPP_HEADER: token}}}}, separators=(',', ':'))


def _base(binary, prompt, resume, headless, config):
    argv = [binary]
    if headless:
        argv += ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    argv += ['--mcp-config', str(config), '--allowedTools', 'mcp__formweb', '--append-system-prompt', NOTE]
    if resume:
        argv += ['--resume', resume]
    if prompt:
        argv += ['--', prompt[:100000]]
    return argv


def _wrap(argv):
    if os.name == 'nt':
        return ['cmd.exe', '/c', *argv] if argv[0].lower().endswith(('.cmd', '.bat')) else argv
    shell = os.environ.get('SHELL') or shutil.which('bash') or '/bin/sh'
    return [shell, '-l', '-c', 'exec ' + shlex.join(argv)]


def argv(prompt, resume, config):
    return _wrap(_base(require_cli(), prompt, resume, False, config))


def chat_argv(prompt, resume, config):
    return _wrap(_base(require_cli(), prompt, resume, True, config))


def status():
    path = cli()
    version = None
    if path:
        try:
            done = subprocess.run(_wrap([path, '--version']), capture_output=True, text=True, timeout=8, stdin=subprocess.DEVNULL, env=child_env())
            version = (done.stdout or done.stderr).strip().splitlines()[0] if (done.stdout or done.stderr).strip() else None
        except (OSError, subprocess.SubprocessError):
            pass
    return {'installed': path is not None, 'path': path, 'version': version, 'workdir': str(workdir()), 'install': None if path else INSTALL}
