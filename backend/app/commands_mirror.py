"""Mirror of the editor window's command registry, and the bridge that lets agents run those commands in the open window.

The window posts its catalogue (menus, toolbar, shortcuts and the command search all resolve through one registry),
long-polls GET /api/commands/bridge for run requests, and answers each with POST /api/commands/bridge/result.
"""
import asyncio
import time
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from .engine import EngineError

router = APIRouter()
STATE = {'commands': [], 'updated': 0.0, 'seen': 0.0}
QUEUE: asyncio.Queue = asyncio.Queue()
WAITING: dict[str, asyncio.Future] = {}
WINDOW_FRESH = 45.0
RUN_TIMEOUT = 30.0
RISKY_TIMEOUT = 60.0
MAX_COMMANDS = 2000


class Catalogue(BaseModel):
    model_config = ConfigDict(extra='forbid')
    commands: list[dict] = Field(max_length=MAX_COMMANDS)


class Run(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=160)
    params: dict = Field(default_factory=dict)


class Result(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rid: str = Field(min_length=1, max_length=64)
    ok: bool
    result: object = None
    error: str = Field(default='', max_length=2000)


def _studio():
    from .service import studio
    return studio


def window_open():
    return time.time() - STATE['seen'] < WINDOW_FRESH


def listing(query=''):
    words = [word for word in (query or '').lower().split() if word]
    items = STATE['commands']
    if words:
        items = [item for item in items if all(word in f"{item.get('id', '')} {item.get('label', '')} {item.get('group', '')} {item.get('description', '')}".lower() for word in words)]
    return {'count': len(items), 'total': len(STATE['commands']), 'windowOpen': window_open(), 'updated': STATE['updated'], 'commands': items}


def describe(command_id):
    for item in STATE['commands']:
        if item.get('id') == command_id:
            return item
    raise EngineError(f'No UI command "{command_id}". Call list_ui_commands to see the ids.', 404)


async def run(command_id, params=None):
    studio = _studio()
    item = describe(command_id)
    studio.access.authorize('edit' if item.get('mutates') else 'read')
    if not window_open():
        raise EngineError('No FormWeb editor window is open. Ask the person to open FormWeb in their browser or the desktop app, then retry.', 409)
    request_id = uuid4().hex
    future = asyncio.get_running_loop().create_future()
    WAITING[request_id] = future
    await QUEUE.put({'rid': request_id, 'id': command_id, 'params': params or {}})
    risky = bool(item.get('risky'))
    try:
        reply = await asyncio.wait_for(future, RISKY_TIMEOUT if risky else RUN_TIMEOUT)
    except asyncio.TimeoutError:
        raise EngineError(f'The editor window did not answer within {int(RISKY_TIMEOUT if risky else RUN_TIMEOUT)} seconds' + (' (a risky command waits for the person to allow it in the window).' if risky else '.'), 408)
    finally:
        WAITING.pop(request_id, None)
    if not reply.get('ok'):
        error = EngineError(reply.get('error') or f'"{command_id}" did not run.', 403 if 'denied' in (reply.get('error') or '') else 409)
        raise error
    if item.get('mutates'):
        studio.access.record('ui.command', {'command': command_id})
    return {'id': command_id, 'label': item.get('label'), 'ran': True, 'result': reply.get('result')}


@router.post('/api/commands/catalogue')
async def post_catalogue(body: Catalogue):
    _studio().access.authorize('read')
    STATE['commands'] = [item for item in body.commands if isinstance(item.get('id'), str)]
    STATE['updated'] = time.time()
    STATE['seen'] = time.time()
    return {'size': len(STATE['commands'])}


@router.get('/api/commands')
async def get_commands(q: str = ''):
    _studio().access.authorize('read')
    return listing(q)


@router.get('/api/commands/bridge')
async def bridge(request: Request, wait: float = 25.0):
    _studio().access.authorize('read')
    deadline = time.time() + max(0.0, min(wait, 30.0))
    item = None
    while item is None and time.time() < deadline:
        STATE['seen'] = time.time()
        if await request.is_disconnected():
            return {}
        try:
            item = await asyncio.wait_for(QUEUE.get(), min(1.0, max(0.05, deadline - time.time())))
        except asyncio.TimeoutError:
            continue
    STATE['seen'] = time.time()
    if item is None or item['rid'] not in WAITING:
        return {}
    if await request.is_disconnected():
        QUEUE.put_nowait(item)
        return {}
    return {'request': item}


@router.post('/api/commands/bridge/result')
async def bridge_result(body: Result):
    _studio().access.authorize('read')
    STATE['seen'] = time.time()
    future = WAITING.get(body.rid)
    if future and not future.done():
        future.set_result({'ok': body.ok, 'result': body.result, 'error': body.error})
    return {'accepted': bool(future)}


@router.post('/api/commands/run')
async def post_run(body: Run):
    return await run(body.id, body.params)
