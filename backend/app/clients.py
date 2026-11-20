"""Agent Connect client cards: project MCP wiring for Claude Code, Codex and Cursor.

Each client reads a project file that starts `./formweb mcp` (stdio proxy into this running API).
Writing restores FormWeb's recommended file; it never touches user-level client settings. The Claude Code card's
Open button does not depend on that file: it starts Claude through POST /api/terminal/open with FormWeb's own MCP config.
"""
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


def card(client_id):
    spec = CLIENTS[client_id]
    path = ROOT / spec['path']
    current = path.read_text(encoding='utf-8') if path.is_file() else None
    status = 'missing' if current is None else 'ready' if current == spec['content'] else 'changed'
    found = claude_code.located('claude' if client_id == 'claude-code' else client_id).path is not None
    return {'id': client_id, 'name': spec['name'], 'file': spec['path'], 'status': status, 'cliFound': found, 'cli': spec['cli'], 'start': spec['start'], 'launch': '/api/terminal/open' if client_id == 'claude-code' else None}


def cards():
    return {'root': str(ROOT), 'clients': [card(client_id) for client_id in CLIENTS]}


def write(client_id):
    if client_id not in CLIENTS:
        raise EngineError('Unknown client. Use claude-code, codex or cursor.', 404)
    spec = CLIENTS[client_id]
    path = (ROOT / spec['path']).resolve()
    if not path.is_relative_to(ROOT.resolve()):
        raise EngineError('Client file must stay inside the FormWeb folder.', 400)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(spec['content'], encoding='utf-8')
    return card(client_id)
