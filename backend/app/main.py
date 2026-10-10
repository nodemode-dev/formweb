import asyncio
import json
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .assets import MIME_TYPES, asset_path, ingest, list_assets, project_envelope, restore_project_assets
from .config import AUTH_TOKEN, DATA_DIR, FRONTEND_DIST, MAX_DOCUMENT_BYTES, MAX_FORM_BYTES, MAX_PROJECT_FILE_BYTES, ORIGINS, PORT, VERSION
from .engine import EngineError
from .mcp_server import mcp, mcp_app
from .service import safe_export_path, studio


AUTH_SESSION = secrets.token_urlsafe(32)

class LocalAccess:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {key.decode().lower(): value.decode() for key, value in scope.get('headers', [])}
        path = scope['path']
        origin = headers.get('origin')
        host = headers.get('host', '')
        allowed_hosts = {f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'}
        error = None
        status = 403
        if host not in allowed_hosts:
            error, status = 'This service accepts exact loopback hostnames only.', 421
        elif origin is not None and origin not in ORIGINS:
            error = 'Origin is not allowed.'
        elif path == '/mcp' and not studio.agents_enabled:
            error = 'Agents are disabled. Enable Agents in the editor or set FORMWEB_AGENTS=1.'
        elif AUTH_TOKEN and (path == '/mcp' or path.startswith('/api/')) and not path.startswith('/api/forms/') and scope['method'] != 'OPTIONS':
            supplied = headers.get('authorization', '')
            cookies = dict(piece.strip().split('=', 1) for piece in headers.get('cookie', '').split(';') if '=' in piece)
            bearer_ok = secrets.compare_digest(supplied.encode(), ('Bearer ' + AUTH_TOKEN).encode())
            cookie_ok = path != '/mcp' and secrets.compare_digest(cookies.get('formweb_session', '').encode(), AUTH_SESSION.encode())
            if not bearer_ok and not cookie_ok:
                error, status = 'A valid FORMWEB_AUTH_TOKEN bearer token is required.', 401
        length = headers.get('content-length', '')
        maximum = MAX_PROJECT_FILE_BYTES if path == '/api/load' else MAX_DOCUMENT_BYTES
        if length and (not length.isdecimal() or int(length) > maximum):
            error, status = 'Request body exceeds the configured size limit.', 413
        if error:
            return await JSONResponse({'detail': error}, status_code=status)(scope, receive, send)
        async def guarded_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message.get('headers', [])) + [(b'x-content-type-options', b'nosniff'), (b'referrer-policy', b'strict-origin-when-cross-origin')]
            await send(message)
        await self.app(scope, receive, guarded_send)


@asynccontextmanager
async def lifespan(app):
    await studio.start()
    try:
        async with mcp.session_manager.run():
            yield
    finally:
        await studio.close()


app = FastAPI(title='FormWeb', version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(ORIGINS), allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'MCP-Protocol-Version', 'X-Filename'], expose_headers=['Content-Disposition'], allow_credentials=True)
app.add_middleware(LocalAccess)


@app.exception_handler(EngineError)
async def engine_error(request, error):
    return JSONResponse({'detail': str(error)}, status_code=error.status)


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command: str = Field(min_length=1, max_length=160)
    params: dict[str, Any] = Field(default_factory=dict)
    expectedRevision: int | None = Field(default=None, ge=0)


class Batch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    commands: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    expectedRevision: int | None = Field(default=None, ge=0)


class Name(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=160)


class Agents(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool


class Publish(BaseModel):
    model_config = ConfigDict(extra='forbid')
    slug: str | None = Field(default=None, max_length=64)


async def limited_body(request: Request, maximum=MAX_DOCUMENT_BYTES):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > maximum:
            raise EngineError('Request body is too large.', 413)
    return bytes(body)


@app.post('/api/assets')
async def upload_asset(request: Request):
    body = await limited_body(request)
    return ingest(body, request.headers.get('content-type', '').split(';', 1)[0], request.headers.get('x-filename'))


@app.get('/api/assets')
async def assets():
    return list_assets()


@app.get('/api/assets/{asset_id}')
async def image_asset(asset_id: str):
    target = asset_path(asset_id)
    return FileResponse(target, media_type=MIME_TYPES[target.suffix[1:]], headers={'Cache-Control': 'private, max-age=31536000, immutable'})


@app.get('/api/health')
async def health():
    await studio.engine.request('hello')
    return {'status': 'ok', 'engine': 'rust'}


@app.get('/api/system')
async def system():
    return {'version': VERSION, 'engine': 'rust', 'agentsEnabled': studio.agents_enabled, 'authRequired': bool(AUTH_TOKEN)}


@app.post('/api/agents')
async def agents(body: Agents):
    studio.agents_enabled = body.enabled
    return await system()

@app.post('/api/auth')
async def authenticate(request: Request):
    if AUTH_TOKEN and not secrets.compare_digest(request.headers.get('authorization', '').encode(), ('Bearer ' + AUTH_TOKEN).encode()):
        raise EngineError('Invalid bearer token.', 401)
    response = JSONResponse({'authenticated': True})
    response.set_cookie('formweb_session', AUTH_SESSION, httponly=True, samesite='strict', path='/api', max_age=43200)
    return response



@app.get('/api/state')
async def state():
    return await studio.state()


@app.post('/api/command')
async def command(body: Command):
    return await studio.mutate('exec', body.model_dump(exclude_none=True))


@app.post('/api/batch')
async def batch(body: Batch):
    return await studio.mutate('batch', body.model_dump(exclude_none=True))


@app.post('/api/new')
async def new(body: Name):
    return await studio.mutate('new', body.model_dump(exclude_none=True))


@app.post('/api/load')
async def load(request: Request):
    try:
        body = json.loads(await limited_body(request, MAX_PROJECT_FILE_BYTES))
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError('Project file is not valid JSON.') from error
    if not isinstance(body, dict) or not isinstance(body.get('site'), dict):
        raise EngineError('Expected an object containing site.')
    if 'format' in body and (body['format'] != 'com.nodemode.formweb' or body.get('version') != 1):
        raise EngineError('Unsupported FormWeb project file format or version.')
    if len(json.dumps(body['site']).encode()) > MAX_DOCUMENT_BYTES:
        raise EngineError('Editable site content exceeds 8 MiB.', 413)
    restore_project_assets(body)
    return await studio.mutate('load', {'site': body['site']})


@app.get('/api/project-file')
@app.get('/api/project/download')
async def project_file():
    current = await studio.state()
    envelope = project_envelope(current['site'])
    return Response(json.dumps(envelope, ensure_ascii=False, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename="site.fweb"'})


@app.get('/api/projects')
async def projects():
    return studio.store.projects()


@app.post('/api/projects/save')
async def save(body: Name):
    return await studio.save_project(body.name)


@app.post('/api/projects/{project_id}/open')
async def open_project(project_id: str):
    return await studio.open_project(project_id)


@app.get('/api/projects/{project_id}/file')
async def saved_project_file(project_id: str):
    site = studio.store.project(project_id)
    if site is None:
        raise EngineError('Project not found.', 404)
    envelope = project_envelope(site)
    return Response(json.dumps(envelope, ensure_ascii=False, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename="site.fweb"'})


@app.get('/api/audit')
async def audit():
    return await studio.engine.request('audit')


@app.get('/api/export')
async def export(locale: str | None = None):
    data, manifest = await studio.export_zip(locale)
    return Response(data, media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="site-export.zip"'})


@app.get('/api/exports/{filename}')
async def download_export(filename: str):
    if not filename.startswith('site-') or not filename.endswith('.zip') or '/' in filename or '\\' in filename:
        raise EngineError('Export not found.', 404)
    path = DATA_DIR / 'exports' / filename
    if not path.is_file():
        raise EngineError('Export not found.', 404)
    return FileResponse(path, media_type='application/zip', filename=filename)


@app.post('/api/publish')
async def publish(body: Publish):
    return await studio.publish(body.slug)


@app.get('/api/publications')
async def publications():
    return studio.store.publications()


@app.get('/api/forms')
async def forms():
    return studio.store.submissions()


@app.post('/api/forms/{site_id}/{form_id}')
@app.post('/published/{slug}/{version}/api/forms/{site_id}/{form_id}')
async def submit(site_id: str, form_id: str, request: Request, slug: str | None = None, version: str | None = None):
    body = await limited_body(request, MAX_FORM_BYTES)
    content_type = request.headers.get('content-type', '').split(';', 1)[0]
    if content_type == 'application/json':
        try:
            values = json.loads(body)
        except (ValueError, UnicodeDecodeError) as error:
            raise EngineError('Submission must be valid JSON.') from error
    elif content_type == 'application/x-www-form-urlencoded':
        from urllib.parse import parse_qs
        try:
            values = {name: entries[-1] for name, entries in parse_qs(body.decode('utf-8'), keep_blank_values=True, max_num_fields=65).items()}
        except (ValueError, UnicodeDecodeError) as error:
            raise EngineError('Submission could not be decoded.') from error
    else:
        raise EngineError('Use JSON or URL-encoded form fields.', 415)
    if not isinstance(values, dict):
        raise EngineError('Submission fields must be an object.')
    return await studio.submit_form(site_id, form_id, values, request.client.host if request.client else 'local', slug, version)


@app.get('/api/events')
async def events(request: Request):
    queue = asyncio.Queue(maxsize=8)
    studio.subscribers.add(queue)
    async def stream():
        try:
            yield 'event: state\ndata: ' + json.dumps(await studio.state(), separators=(',', ':')) + '\n\n'
            while not await request.is_disconnected():
                try:
                    current = await asyncio.wait_for(queue.get(), timeout=15)
                    yield 'event: state\ndata: ' + json.dumps(current, separators=(',', ':')) + '\n\n'
                except asyncio.TimeoutError:
                    yield ': keepalive\n\n'
        finally:
            studio.subscribers.discard(queue)
    return StreamingResponse(stream(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.get('/published/{slug}/{version}/{path:path}')
async def publication(slug: str, version: str, path: str):
    relative = safe_export_path(path + 'index.html' if path.endswith('/') else path or 'index.html')
    root = (DATA_DIR / 'publications' / slug / version).resolve()
    if not root.is_relative_to((DATA_DIR / 'publications').resolve()):
        raise EngineError('Publication not found.', 404)
    target = root.joinpath(*relative.parts).resolve()
    if target.is_dir():
        target = (target / 'index.html').resolve()
    if not target.is_relative_to(root) or not target.is_file() or version.startswith('.'):
        raise EngineError('Publication file not found.', 404)
    return FileResponse(target, headers={'Cache-Control': 'public, max-age=31536000, immutable'})


app.router.routes.extend(mcp_app.routes)


@app.get('/{path:path}')
async def frontend(path: str):
    if path.startswith(('api/', 'mcp', 'published/')):
        raise EngineError('Endpoint not found.', 404)
    if not FRONTEND_DIST.is_dir():
        return JSONResponse({'detail': 'Frontend is not built. Run ./formweb build or use Vite on port 5240.'}, status_code=503)
    relative = safe_export_path(path or 'index.html')
    target = FRONTEND_DIST.joinpath(*relative.parts).resolve()
    if not target.is_relative_to(FRONTEND_DIST):
        raise EngineError('File not found.', 404)
    if target.is_file():
        return FileResponse(target)
    if '.' not in Path(path).name:
        return FileResponse(FRONTEND_DIST / 'index.html')
    raise EngineError('File not found.', 404)
