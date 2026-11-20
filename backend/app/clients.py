"""Agent Connect client cards: MCP wiring for Claude Code, Codex, Cursor and Antigravity.

Claude Code, Codex and Cursor each read a project file that starts `./formweb mcp` (stdio proxy into this running API).
Writing restores FormWeb's recommended file; for these three it never touches user-level client settings. Antigravity
reads one file for the whole account, ~/.gemini/config/mcp_config.json: its card adds the one entry named formweb there
when the person asks, keeps every other entry and key, and leaves alone an entry of that name it did not write. The
Claude Code card's Open button does not depend on its file: it starts Claude through POST /api/terminal/open with
FormWeb's own MCP config.
"""
import json
import os
from pathlib import Path

from . import claude_code
from .config import ROOT
from .engine import EngineError

CLIENTS = {
    'claude-code': {
        'name': 'Claude Code',
        'path': '.mcp.json',
        'cli': 'claude',
        'start': 'claude',
        'content': '{\n  "mcpServers": {\n    "formweb": {\n      "type": "stdio",\n      "command": "${CLAUDE_PROJECT_DIR:-.}/formweb",\n      "args": ["mcp"]\n    }\n  }\n}\n',
    },
    'codex': {
        'name': 'Codex',
        'path': '.codex/config.toml',
        'cli': 'codex',
        'start': 'codex',
        'content': '[mcp_servers.formweb]\ncommand = "sh"\nargs = ["-c", "exec \\"$(git rev-parse --show-toplevel 2>/dev/null || pwd)/formweb\\" mcp"]\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n',
    },
    'cursor': {
        'name': 'Cursor',
        'path': '.cursor/mcp.json',
        'cli': 'cursor-agent',
        'start': 'cursor-agent',
        'content': '{\n  "mcpServers": {\n    "formweb": {\n      "command": "${workspaceFolder}/formweb",\n      "args": ["mcp"]\n    }\n  }\n}\n',
    },
}


ANTIGRAVITY = {'name': 'Antigravity', 'path': '~/.gemini/config/mcp_config.json', 'cli': 'agy', 'start': 'agy'}
ANTIGRAVITY_ENTRY = 'formweb'
OLDER_FILE = '~/.gemini/antigravity-cli/mcp_config.json'


def antigravity_file():
    return Path.home() / '.gemini' / 'config' / 'mcp_config.json'


def antigravity_entry():
    return {'command': str(ROOT / ('formweb.bat' if os.name == 'nt' else 'formweb')), 'args': ['mcp']}


def antigravity_read():
    path = antigravity_file()
    try:
        data = json.loads(path.read_text(encoding='utf-8') or '{}') if path.is_file() else {}
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get('mcpServers', {}), dict) else None


def antigravity_card():
    data = antigravity_read()
    entry = None if data is None else data.get('mcpServers', {}).get(ANTIGRAVITY_ENTRY)
    status = 'changed' if data is None else 'missing' if entry is None else 'ready' if entry == antigravity_entry() else 'changed'
    notes = []
    if data is None:
        notes.append(f'{ANTIGRAVITY["path"]} is not an MCP servers file FormWeb can read, so it was left alone.')
    elif status == 'changed':
        notes.append(f'{ANTIGRAVITY["path"]} has an entry named {ANTIGRAVITY_ENTRY} that FormWeb did not write, so it was left alone.')
    if (Path.home() / '.gemini' / 'antigravity-cli' / 'mcp_config.json').is_file():
        notes.append(f'An older file, {OLDER_FILE}, was seen and left alone.')
    found = claude_code.located('antigravity').path is not None
    return {'id': 'antigravity', 'name': ANTIGRAVITY['name'], 'file': ANTIGRAVITY['path'], 'status': status, 'cliFound': found, 'cli': ANTIGRAVITY['cli'], 'start': ANTIGRAVITY['start'], 'launch': None, 'note': ' '.join(notes)}


def antigravity_write():
    data = antigravity_read()
    if data is not None and data.get('mcpServers', {}).get(ANTIGRAVITY_ENTRY) is None:
        path = antigravity_file()
        data.setdefault('mcpServers', {})[ANTIGRAVITY_ENTRY] = antigravity_entry()
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_name(path.name + f'.part-{os.getpid()}')
        with os.fdopen(os.open(part, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w', encoding='utf-8') as out:
            out.write(json.dumps(data, indent=2) + '\n')
        os.replace(part, path)
    return antigravity_card()


def card(client_id):
    spec = CLIENTS[client_id]
    path = ROOT / spec['path']
    current = path.read_text(encoding='utf-8') if path.is_file() else None
    status = 'missing' if current is None else 'ready' if current == spec['content'] else 'changed'
    found = claude_code.located('claude' if client_id == 'claude-code' else client_id).path is not None
    return {'id': client_id, 'name': spec['name'], 'file': spec['path'], 'status': status, 'cliFound': found, 'cli': spec['cli'], 'start': spec['start'], 'launch': '/api/terminal/open' if client_id == 'claude-code' else None}


def cards():
    return {'root': str(ROOT), 'clients': [card(client_id) for client_id in CLIENTS] + [antigravity_card()]}


def write(client_id):
    if client_id == 'antigravity':
        return antigravity_write()
    if client_id not in CLIENTS:
        raise EngineError('Unknown client. Use claude-code, codex, cursor or antigravity.', 404)
    spec = CLIENTS[client_id]
    path = (ROOT / spec['path']).resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise EngineError('Client file must stay inside the FormWeb folder.', 400)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(spec['content'], encoding='utf-8')
    return card(client_id)
