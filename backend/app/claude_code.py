"""Claude Code launcher shared by the live terminal and the Chat pane.

Finds the user's own `claude` binary, builds a clean child environment, and hands the child an HTTP MCP config
file that points at this engine's /mcp endpoint with an in-app token of its own. Each tab and each Chat run gets
its own token and its own owner-only config file; both end when that tab or run ends.
"""
import hmac
import json
import os
import secrets
from pathlib import Path

from . import agent_lookup
from .config import DATA_DIR, PORT
from .engine import EngineError

TOKENS: dict[str, Path] = {}
NAMES: dict[str, str] = {}
INAPP_HEADER = 'X-FormWeb-Inapp'
ENTRY = 'formweb_tab'
NOT_INSTALLED = 'notInstalled'
INSTALL_LINE = agent_lookup.install('claude')
KEEP_ENV = agent_lookup.KEEP_ENV
OVERRIDES = {'claude': ('FORMWEB_CLAUDE_BIN', 'FORMWEB_CLAUDE'), 'codex': ('FORMWEB_CODEX_BIN',), 'cursor': ('FORMWEB_CURSOR_BIN',), 'antigravity': ('FORMWEB_ANTIGRAVITY_BIN',)}
OTHERWISE = 'set {var} to its full path'
NOTE = ('You are running inside FormWeb, a visual website builder. The editor is open next to you and shows every change live. '
        'Use the formweb MCP tools: call get_site first to see the current site, change it with apply_commands or edit_nodes, '
        'and use the preview and audit tools to check the result. Undo is available through history commands. '
        'Do not edit FormWeb source files; work on the site through the tools.')


def valid_token(value):
    return isinstance(value, str) and bool(value) and any(hmac.compare_digest(value.encode(), token.encode()) for token in tuple(TOKENS))


def tab_name(value):
    return next((name for token, name in tuple(NAMES.items()) if isinstance(value, str) and hmac.compare_digest(value.encode(), token.encode())), '')


def issue(name='Claude Code'):
    token = secrets.token_urlsafe(24)
    folder = DATA_DIR / 'agent-mcp'
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f'{secrets.token_hex(8)}.json'
    handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(handle, 'w', encoding='utf-8') as out:
        out.write(mcp_config(token))
    TOKENS[token] = path
    NAMES[token] = name
    return token, path


def issue_env(name):
    token = secrets.token_urlsafe(24)
    TOKENS[token] = None
    NAMES[token] = name
    return token


def revoke(token):
    path = TOKENS.pop(token, None) if token else None
    NAMES.pop(token, None)
    if path is not None:
        path.unlink(missing_ok=True)


def mcp_url():
    return f'http://127.0.0.1:{PORT}/mcp'


def workdir():
    folder = Path(os.getenv('FORMWEB_AGENT_DIR') or Path.home() / 'FormWeb' / 'Agent')
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def located(kind, fresh=False):
    found = agent_lookup.find(kind, setting=None, override_vars=OVERRIDES.get(kind, ()), shell_timeout=10.0, fresh=fresh)
    return agent_lookup.check(found, child_env(path=found.path), 15.0, fresh)


def usable(kind):
    found = located(kind)
    return found if found.state == 'runs' else located(kind, True)


def said(found):
    return agent_lookup.sentence(found, agent_lookup.install(found.program), OTHERWISE.format(var=OVERRIDES[found.program][0]))


def refuse(found):
    error = EngineError(said(found), 424)
    error.details = {'code': NOT_INSTALLED, 'install': agent_lookup.install(found.program)}
    return error


def cli():
    found = located('claude')
    return found.path if found.state == 'runs' else None


def known():
    return located('claude').path


def require_cli():
    found = usable('claude')
    if found.state != 'runs':
        raise refuse(found)
    return found.path


def child_env(extra=None, path=None):
    own = {'TERM': 'xterm-256color', 'COLORTERM': 'truecolor', 'FORMWEB_API': f'http://127.0.0.1:{PORT}', 'FORMWEB_MCP_URL': mcp_url(), 'FORMWEB_TERMINAL': '1'}
    return agent_lookup.child_env(path, extra={**own, **(extra or {})}, shell_timeout=10.0, keep=KEEP_ENV)


def mcp_config(token):
    return json.dumps({'mcpServers': {ENTRY: {'type': 'http', 'url': mcp_url(), 'headers': {INAPP_HEADER: token}}}}, separators=(',', ':'))


def _base(binary, prompt, resume, headless, config):
    argv = [binary]
    if headless:
        argv += ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
    argv += ['--mcp-config', str(config), '--allowedTools', 'mcp__' + ENTRY, '--append-system-prompt', NOTE]
    if resume:
        argv += ['--resume', resume]
    if prompt:
        argv += ['--', prompt[:100000]]
    return argv


def _wrap(argv):
    return agent_lookup.start_argv(argv)


def argv(prompt, resume, config):
    return _wrap(_base(require_cli(), prompt, resume, False, config))


def chat_argv(prompt, resume, config):
    return _wrap(_base(require_cli(), prompt, resume, True, config))


def status(fresh=False):
    found = located('claude', fresh)
    return {**agent_lookup.answer(found, agent_lookup.install('claude'), OTHERWISE.format(var=OVERRIDES['claude'][0])), 'workdir': str(workdir()), 'install': None if found.state == 'runs' else said(found)}
