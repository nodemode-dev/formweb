"""Chat pane backend: headless Claude Code (`claude -p`, stream-json) streamed to the browser as Server-Sent Events.

One conversation at a time. The Claude session id from each run is kept so the next message continues it
(`--resume`), and the same id can be opened in the live terminal. The run uses the user's own Claude Code login.
"""
import asyncio
import json

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import StreamingResponse

from . import claude_code
from .engine import EngineError

router = APIRouter()
STATE = {'session': '', 'running': False, 'process': None, 'turns': []}
LINE_LIMIT = 32 * 1024 * 1024


class Send(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(min_length=1, max_length=20000)
    context: str | None = Field(default=None, max_length=4000)
    resume: str | None = Field(default=None, max_length=200)


def _studio():
    from .service import studio
    studio.access.authorize('manage')
    return studio


def _frame(name, data):
    return f'event: {name}\ndata: {json.dumps(data, separators=(",", ":"), ensure_ascii=False)}\n\n'


def _tool_text(value):
    try:
        return json.dumps(value, ensure_ascii=False)[:600]
    except (TypeError, ValueError):
        return ''


def _events(line, turn, seen):
    try:
        item = json.loads(line)
    except ValueError:
        return
    if not isinstance(item, dict) or item.get('parent_tool_use_id'):
        return
    kind = item.get('type')
    if kind == 'system' and item.get('subtype') == 'init' and item.get('session_id'):
        STATE['session'] = item['session_id']
        yield 'session', {'session': item['session_id']}
    elif kind == 'stream_event':
        event = item.get('event') or {}
        if event.get('type') == 'message_start':
            seen['streamed'] = False
            usage = (event.get('message') or {}).get('usage')
            if usage:
                yield 'usage', {'input': usage.get('input_tokens', 0), 'output': usage.get('output_tokens', 0)}
        elif event.get('type') == 'content_block_delta':
            delta = event.get('delta') or {}
            if delta.get('type') == 'text_delta' and delta.get('text'):
                seen['streamed'] = True
                turn['text'] += delta['text']
                yield 'delta', {'text': delta['text']}
        elif event.get('type') == 'message_delta' and event.get('usage'):
            yield 'usage', {'output': event['usage'].get('output_tokens', 0)}
    elif kind == 'assistant':
        for block in (item.get('message') or {}).get('content') or []:
            if block.get('type') == 'tool_use':
                tool = {'id': block.get('id', ''), 'name': str(block.get('name', '')).replace(f'mcp__{claude_code.ENTRY}__', ''), 'input': _tool_text(block.get('input')), 'done': False}
                turn['tools'].append(tool)
                yield 'tool', tool
            elif block.get('type') == 'text' and block.get('text') and not seen.get('streamed'):
                turn['text'] += block['text']
                yield 'delta', {'text': block['text']}
    elif kind == 'user':
        content = (item.get('message') or {}).get('content')
        for block in content if isinstance(content, list) else []:
            if isinstance(block, dict) and block.get('type') == 'tool_result':
                error = bool(block.get('is_error'))
                for tool in turn['tools']:
                    if tool['id'] == block.get('tool_use_id'):
                        tool['done'], tool['error'] = True, error
                yield 'toolDone', {'id': block.get('tool_use_id', ''), 'error': error}
    elif kind == 'result':
        if item.get('session_id'):
            STATE['session'] = item['session_id']
        yield 'result', {'error': bool(item.get('is_error')), 'message': item.get('result') if item.get('is_error') else '', 'session': STATE['session']}


async def _run(prompt, resume, turn):
    token, config = claude_code.issue('Chat')
    try:
        process = await asyncio.create_subprocess_exec(*claude_code.chat_argv(prompt, resume, config), cwd=str(claude_code.workdir()), env=claude_code.child_env(), stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=LINE_LIMIT)
    except BaseException:
        claude_code.revoke(token)
        raise
    STATE['process'] = process
    errors = []

    async def collect():
        async for chunk in process.stderr:
            errors.append(chunk.decode('utf-8', errors='replace'))

    drain = asyncio.ensure_future(collect())
    seen = {}
    failed = ''
    try:
        async for raw in process.stdout:
            for name, data in _events(raw.decode('utf-8', errors='replace').strip(), turn, seen):
                if name == 'result' and data['error']:
                    failed = data['message'] or 'Claude Code reported an error.'
                yield name, data
        code = await process.wait()
        await drain
        if code and not failed and not turn.get('cancelled'):
            failed = ''.join(errors).strip()[-800:] or f'Claude Code exited with code {code}.'
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
        drain.cancel()
        claude_code.revoke(token)
        STATE['process'] = None
    if failed:
        yield 'error', {'message': failed}


@router.post('/api/chat/send')
async def send(body: Send, request: Request):
    studio = _studio()
    await asyncio.to_thread(claude_code.require_cli)
    if STATE['running']:
        raise EngineError('Claude is still answering. Wait or press Stop.', 409)
    prompt = body.text if not body.context else f'{body.text}\n\n[Editor context: {body.context}]'
    resume = body.resume if body.resume is not None else STATE['session']
    turn = {'user': body.text, 'text': '', 'tools': []}
    STATE['turns'].append(turn)
    STATE['turns'] = STATE['turns'][-60:]
    STATE['running'] = True
    studio.access.record('chat.send', {'resume': bool(resume)})

    async def stream():
        try:
            yield _frame('start', {'session': resume or ''})
            async for name, data in _run(prompt, resume, turn):
                yield _frame(name, data)
                if await request.is_disconnected():
                    break
        except (OSError, EngineError) as error:
            yield _frame('error', {'message': str(error)})
        finally:
            STATE['running'] = False
        yield _frame('done', {'session': STATE['session']})

    return StreamingResponse(stream(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@router.post('/api/chat/cancel')
async def cancel():
    _studio()
    process = STATE['process']
    if STATE['turns']:
        STATE['turns'][-1]['cancelled'] = True
    if process is not None and process.returncode is None:
        process.terminate()
    return {'cancelled': process is not None}


@router.post('/api/chat/reset')
async def reset():
    _studio()
    if STATE['running']:
        raise EngineError('Stop the running answer before starting a new chat.', 409)
    STATE['session'], STATE['turns'] = '', []
    return {'session': ''}


@router.get('/api/chat/state')
async def state():
    _studio()
    return {'session': STATE['session'], 'running': STATE['running'], 'turns': STATE['turns']}


@router.get('/api/claude/status')
async def claude_status():
    _studio()
    return await asyncio.to_thread(claude_code.status)
