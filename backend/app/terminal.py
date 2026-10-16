"""Live terminal: a loopback WebSocket bridged to a pseudo-terminal in the FormWeb folder.

Owner-only. Sessions the editor opens itself (POST /api/terminal/open: a shell or Claude Code) work without the Agents
switch; a socket that creates its own session still needs Agents on. Uses the standard library `pty` on macOS and Linux and
`pywinpty` on Windows. A session outlives its socket so the editor can collapse the dock or reconnect and
get the same shell back, with the last 64 KiB of output replayed.

Wire protocol (text frames): client -> {"type":"input","data":str} | {"type":"resize","cols":int,"rows":int}
server -> {"type":"output","data":str} | {"type":"ready","session":str,"replay":bool} | {"type":"exit","code":int|null} | {"type":"error","message":str}
"""
import asyncio
import json
import os
import secrets
import shutil
from collections import deque

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from . import claude_code
from .access import actor, channel
from .config import ORIGINS, PORT, ROOT
from .engine import EngineError

router = APIRouter()
SCROLLBACK = 64 * 1024
MAX_SESSIONS = 4
PRESETS = [
    {'id': 'shell', 'label': 'Shell', 'command': ''},
    {'id': 'claude', 'label': 'Claude Code', 'command': 'claude'},
    {'id': 'codex', 'label': 'Codex', 'command': 'codex'},
    {'id': 'cursor', 'label': 'Cursor agent', 'command': 'cursor-agent'},
    {'id': 'doctor', 'label': 'formweb doctor', 'command': './formweb doctor' if os.name != 'nt' else 'formweb.bat doctor'},
    {'id': 'run', 'label': 'formweb run (list commands)', 'command': './formweb run --list' if os.name != 'nt' else 'formweb.bat run --list'},
]


class Session:
    def __init__(self, cols, rows, kind='shell', title='Terminal', argv=None, env=None, cwd=None, app=False):
        self.id = secrets.token_urlsafe(12)
        self.kind, self.title, self.app = kind, title, app
        self.buffer: deque[str] = deque()
        self.size = 0
        self.sockets: set[WebSocket] = set()
        self.exit_code = None
        self.closed = False
        env = {**(os.environ if env is None else env), 'TERM': 'xterm-256color', 'FORMWEB_API': f'http://127.0.0.1:{PORT}', 'FORMWEB_TERMINAL': '1', 'FORMWEB_CHANNEL': 'terminal'}
        folder = str(cwd or ROOT)
        self.loop = asyncio.get_running_loop()
        if os.name == 'nt':
            from winpty import PtyProcess  # pywinpty, Windows only
            shell = os.environ.get('COMSPEC', 'cmd.exe')
            self.process = PtyProcess.spawn(argv or shell, cwd=folder, env=env, dimensions=(rows, cols))
            self.reader = asyncio.ensure_future(self._read_windows())
        else:
            import fcntl
            import pty
            import struct
            import termios
            shell = os.environ.get('SHELL') or shutil.which('bash') or '/bin/sh'
            pid, fd = pty.fork()
            if pid == 0:  # child: become the shell, or the given command, inside the working folder
                try:
                    os.chdir(folder)
                    command = argv or [shell, '-l']
                    os.execvpe(command[0], command, env)
                except OSError:
                    os._exit(127)
            self.pid, self.fd = pid, fd
            fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
            os.set_blocking(fd, False)
            self.loop.add_reader(fd, self._read_unix)

    # output ---------------------------------------------------------------
    def _emit(self, text):
        self.buffer.append(text)
        self.size += len(text)
        while self.size > SCROLLBACK and len(self.buffer) > 1:
            self.size -= len(self.buffer.popleft())
        message = json.dumps({'type': 'output', 'data': text})
        for socket in tuple(self.sockets):
            asyncio.ensure_future(self._send(socket, message))

    async def _send(self, socket, message):
        try:
            await socket.send_text(message)
        except Exception:
            self.sockets.discard(socket)

    def _read_unix(self):
        try:
            data = os.read(self.fd, 65536)
        except BlockingIOError:
            return
        except OSError:
            data = b''
        if not data:
            self._finish()
            return
        self._emit(data.decode('utf-8', errors='replace'))

    async def _read_windows(self):
        while self.process.isalive():
            try:
                data = await asyncio.to_thread(self.process.read, 65536)
            except EOFError:
                break
            if data:
                self._emit(data)
        self._finish()

    def _finish(self):
        if self.closed:
            return
        self.closed = True
        if os.name != 'nt':
            self.loop.remove_reader(self.fd)
            try:
                _, status = os.waitpid(self.pid, os.WNOHANG)
                self.exit_code = os.waitstatus_to_exitcode(status) if status else None
            except ChildProcessError:
                pass
            os.close(self.fd)
        message = json.dumps({'type': 'exit', 'code': self.exit_code})
        for socket in tuple(self.sockets):
            asyncio.ensure_future(self._send(socket, message))
        SESSIONS.pop(self.id, None)

    # input ----------------------------------------------------------------
    def write(self, text):
        if self.closed:
            return
        if os.name == 'nt':
            self.process.write(text)
        else:
            os.write(self.fd, text.encode('utf-8'))

    def resize(self, cols, rows):
        cols, rows = max(20, min(int(cols), 500)), max(5, min(int(rows), 200))
        if self.closed:
            return
        if os.name == 'nt':
            self.process.setwinsize(rows, cols)
        else:
            import fcntl
            import struct
            import termios
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

    def close(self):
        if self.closed:
            return
        if os.name == 'nt':
            self.process.terminate(force=True)
        else:
            import signal
            try:
                os.killpg(os.getpgid(self.pid), signal.SIGHUP)
            except (ProcessLookupError, PermissionError):
                pass
        self._finish()


SESSIONS: dict[str, Session] = {}


def close_all(external_only=False):
    for session in tuple(SESSIONS.values()):
        if not (external_only and session.app):
            session.close()


def listing():
    return [{'id': item.id, 'title': item.title, 'kind': item.kind, 'app': item.app} for item in SESSIONS.values()]


def status():
    return {'supported': os.name != 'nt' or _winpty_available(), 'sessions': len(SESSIONS), 'presets': PRESETS, 'cwd': str(ROOT)}


def _winpty_available():
    try:
        import winpty  # noqa: F401
        return True
    except ImportError:
        return False


class Open(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: str = Field(default='shell', pattern='^(shell|claude)$')
    prompt: str | None = Field(default=None, max_length=20000)
    resume: str | None = Field(default=None, max_length=200)
    preset: str | None = Field(default=None, max_length=16)
    cols: int = Field(default=100, ge=20, le=500)
    rows: int = Field(default=24, ge=5, le=200)


@router.get('/api/terminal/sessions')
async def sessions():
    from .service import studio
    studio.access.authorize('manage')
    return {'sessions': listing()}


@router.post('/api/terminal/open')
async def open_session(body: Open):
    from .service import studio
    studio.access.authorize('manage')
    types = {'shell': 'Shell', 'claude': 'Claude Code'}
    prompt = (body.prompt or '').strip()
    if body.kind == 'claude' and not body.resume:
        live = next((item for item in SESSIONS.values() if item.kind == 'claude' and item.app), None)
        if live:
            if prompt:
                live.write(prompt + ('\r\n' if os.name == 'nt' else '\r'))
            return {'id': live.id, 'title': live.title, 'kind': live.kind, 'reused': True}
    if len(SESSIONS) >= MAX_SESSIONS:
        raise EngineError(f'At most {MAX_SESSIONS} terminal sessions can run at once. Close one first.', 429)
    argv = env = cwd = None
    if body.kind == 'claude':
        await asyncio.to_thread(claude_code.require_cli)
        argv, env, cwd = claude_code.argv(prompt, body.resume or ''), claude_code.child_env(), claude_code.workdir()
    try:
        session = Session(body.cols, body.rows, body.kind, types[body.kind], argv, env, cwd, True)
    except Exception as error:
        raise EngineError(f'Could not start {types[body.kind]}: {error}', 500) from error
    SESSIONS[session.id] = session
    studio.access.record('terminal.open', {'session': session.id, 'kind': body.kind})
    command = next((item['command'] for item in PRESETS if item['id'] == body.preset), '') if body.kind == 'shell' else ''
    if command:
        session.write(command + ('\r\n' if os.name == 'nt' else '\n'))
    return {'id': session.id, 'title': session.title, 'kind': session.kind, 'reused': False}


def _gate(websocket: WebSocket, app_session=False):
    """WebSockets skip the HTTP middleware, so repeat its host, origin and identity checks here."""
    from .service import studio
    headers = {key.lower(): value for key, value in websocket.headers.items()}
    if headers.get('host', '') not in {f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'}:
        raise EngineError('The terminal accepts exact loopback hostnames only.', 421)
    origin = headers.get('origin')
    if origin is not None and origin not in ORIGINS:
        raise EngineError('Origin is not allowed.', 403)
    if not (app_session or studio.agents_enabled):
        raise EngineError('Turn Agents on to use the terminal.', 403)
    token = websocket.query_params.get('token', '')
    if token:
        headers['authorization'] = 'Bearer ' + token
    identity = studio.access.authenticate(headers)
    actor.set(identity)
    channel.set('terminal')
    studio.access.authorize('manage')
    return studio


@router.websocket('/api/terminal')
async def terminal(websocket: WebSocket):
    await websocket.accept()
    wanted = websocket.query_params.get('session', '')
    opened = SESSIONS.get(wanted)
    try:
        studio = _gate(websocket, bool(opened and opened.app))
    except EngineError as error:
        await websocket.send_text(json.dumps({'type': 'error', 'message': str(error)}))
        await websocket.close(code=4403)
        return
    session = SESSIONS.get(wanted)
    replay = session is not None
    if session is None:
        if len(SESSIONS) >= MAX_SESSIONS:
            await websocket.send_text(json.dumps({'type': 'error', 'message': f'At most {MAX_SESSIONS} terminal sessions can run at once.'}))
            await websocket.close(code=4429)
            return
        try:
            cols = int(websocket.query_params.get('cols', 100))
            rows = int(websocket.query_params.get('rows', 24))
            session = Session(max(20, min(cols, 500)), max(5, min(rows, 200)))
        except Exception as error:
            await websocket.send_text(json.dumps({'type': 'error', 'message': f'Could not start a shell: {error}'}))
            await websocket.close(code=4500)
            return
        SESSIONS[session.id] = session
        studio.access.record('terminal.open', {'session': session.id})
    await websocket.send_text(json.dumps({'type': 'ready', 'session': session.id, 'replay': replay}))
    if replay and session.buffer:
        await websocket.send_text(json.dumps({'type': 'output', 'data': ''.join(session.buffer)}))
    session.sockets.add(websocket)
    preset = websocket.query_params.get('preset', '')
    if not replay and preset:
        command = next((item['command'] for item in PRESETS if item['id'] == preset), '')
        if command:
            session.write(command + ('\r\n' if os.name == 'nt' else '\n'))
    try:
        while True:
            message = json.loads(await websocket.receive_text())
            if not (session.app or studio.agents_enabled):
                await websocket.send_text(json.dumps({'type': 'error', 'message': 'Agents were turned off; the terminal closed.'}))
                session.close()
                break
            if message.get('type') == 'input' and isinstance(message.get('data'), str):
                session.write(message['data'][:65536])
            elif message.get('type') == 'resize':
                session.resize(message.get('cols', 100), message.get('rows', 24))
            elif message.get('type') == 'close':
                session.close()
                break
    except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
        pass
    finally:
        session.sockets.discard(websocket)
