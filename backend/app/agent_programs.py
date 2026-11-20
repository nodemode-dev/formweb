"""Agent programs FormWeb can start in a dock tab: Claude Code, Codex, Cursor's agent and Antigravity.

One status answer for all four (runs, found but does not start, or not found, with the version, the install line and where
FormWeb looked; signed in when a file says so), and the launch of Codex, Cursor and Antigravity in a terminal tab. Every
lookup and every start goes through the family's finder (agent_lookup). Each tab gets an in-app token of its own in the
child's environment (FORMWEB_INAPP_TOKEN), never on a command line, and the token ends with the tab. The MCP entry is
named formweb_tab so it never shadows the `formweb` entry of a project file.
"""
import json
import os
import secrets
from pathlib import Path

from . import agent_lookup, claude_code
from .config import DATA_DIR
from .engine import EngineError

PROGRAMS = {
    'claude': {'title': 'Claude Code', 'bin': 'claude', 'install': agent_lookup.install('claude')},
    'codex': {'title': 'Codex', 'bin': 'codex', 'install': agent_lookup.install('codex')},
    'cursor': {'title': 'Cursor', 'bin': 'cursor-agent', 'install': agent_lookup.install('cursor')},
    'antigravity': {'title': 'Antigravity', 'bin': 'agy', 'install': agent_lookup.install('antigravity')},
}
TOKEN_ENV = 'FORMWEB_INAPP_TOKEN'
TAB_FOLDERS: dict[str, Path] = {}


def reset():
    agent_lookup.forget()


def find(kind):
    return claude_code.located(kind).path


def signed_in(kind):
    home = Path.home()
    if kind == 'claude':
        folder = Path(os.getenv('CLAUDE_CONFIG_DIR') or home / '.claude')
        return True if os.getenv('CLAUDE_CODE_OAUTH_TOKEN') or (folder / '.credentials.json').is_file() else None
    if kind == 'codex':
        return True if (Path(os.getenv('CODEX_HOME') or home / '.codex') / 'auth.json').is_file() else None
    return None


def status(fresh=False):
    answers = {}
    for kind, spec in PROGRAMS.items():
        found = claude_code.located(kind, fresh)
        runs = found.state == 'runs'
        answers[kind] = {**agent_lookup.answer(found), 'said': claude_code.said(found), 'install': '' if runs else spec['install'], 'signedIn': signed_in(kind) if runs else None, 'title': spec['title']}
    return answers


def _tab_file(folder):
    return Path(folder) / '.agents' / 'mcp_config.json'


def tab_folder(kind):
    folder = DATA_DIR / 'agent-tabs' / kind / secrets.token_hex(6)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _servers(path):
    try:
        data = json.loads(path.read_text(encoding='utf-8') or '{}') if path.exists() else {}
    except ValueError:
        data = None
    if not isinstance(data, dict) or not isinstance(data.get('mcpServers', {}), dict):
        raise OSError(f'{path} is not an MCP servers file FormWeb can read, so it was left alone')
    return data


def _replace(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + f'.part-{os.getpid()}')
    with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w', encoding='utf-8') as out:
        out.write(json.dumps(data, indent=2) + '\n')
    os.replace(part, path)


def write_tab_entry(folder, token):
    path = _tab_file(folder)
    data = _servers(path)
    data.setdefault('mcpServers', {})[claude_code.ENTRY] = {'serverUrl': claude_code.mcp_url(), 'headers': {claude_code.INAPP_HEADER: token}}
    _replace(path, data)
    return path


def remove_tab_entry(folder, token):
    path = _tab_file(folder)
    try:
        data = _servers(path)
        entry = data.get('mcpServers', {}).get(claude_code.ENTRY)
        if not token or not isinstance(entry, dict) or (entry.get('headers') or {}).get(claude_code.INAPP_HEADER) != token:
            return
        del data['mcpServers'][claude_code.ENTRY]
        _replace(path, data)
    except (OSError, ValueError):
        return


def leave_tab_folder(folder, token):
    remove_tab_entry(folder, token)
    path = _tab_file(folder)
    try:
        if path.exists() and _servers(path) == {'mcpServers': {}}:
            path.unlink()
        path.parent.rmdir()
        Path(folder).rmdir()
    except OSError:
        return


def ended(kind, token):
    claude_code.revoke(token)
    folder = TAB_FOLDERS.pop(token, None)
    if folder is not None:
        leave_tab_folder(folder, token)


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
    found = claude_code.usable(kind)
    if found.state != 'runs':
        raise claude_code.refuse(found)
    path = found.path
    folder = claude_code.workdir()
    argv = [path]
    if kind == 'codex':
        argv += ['-c', f'mcp_servers.{claude_code.ENTRY}.url="{claude_code.mcp_url()}"', '-c', f'mcp_servers.{claude_code.ENTRY}.env_http_headers={{"{claude_code.INAPP_HEADER}"="{TOKEN_ENV}"}}']
    elif kind == 'cursor':
        cursor_config(folder)
    token = claude_code.issue_env(spec['title'])
    if kind == 'antigravity':
        try:
            folder = tab_folder(kind)
            write_tab_entry(folder, token)
        except (OSError, ValueError) as error:
            claude_code.revoke(token)
            raise EngineError(f'Antigravity was not started: {error}.', 409) from error
        TAB_FOLDERS[token] = folder
    return claude_code._wrap(argv), claude_code.child_env({TOKEN_ENV: token}, path), folder, token
