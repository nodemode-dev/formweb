import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .access import actor
from .advanced_routes import router as advanced_router, form_gate, serve_release, submission_values
from .assets import MIME_TYPES, asset_path, ingest, list_assets, own_asset, project_envelope, visible_assets
from .config import AUTH_TOKEN, DATA_DIR, FRONTEND_DIST, MAX_DOCUMENT_BYTES, MAX_FORM_BYTES, MAX_PROJECT_FILE_BYTES, ORIGINS, PORT, VERSION
from .engine import EngineError
from .mcp_server import mcp, mcp_app
from .providers.routes import router as provider_router
from .service import safe_export_path, studio
from .workflows import load_native



class LocalAccess:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        import re
        from urllib.parse import parse_qs
        headers = {key.decode().lower(): value.decode() for key, value in scope.get('headers', [])}
        path = scope['path']
        origin = headers.get('origin')
        allowed_hosts = {f'localhost:{PORT}', f'127.0.0.1:{PORT}', f'[::1]:{PORT}'}
        preview_match = re.match(r'^/preview/([^/]+)(?:/|$)', path)
        runtime = path.startswith('/api/runtime/')
        query = parse_qs(scope.get('query_string', b'').decode(errors='replace'))
        preview_token = preview_match.group(1) if preview_match else headers.get('x-formweb-preview') or query.get('previewToken', [''])[0]
        verified_preview = bool((preview_match or runtime) and studio.releases.valid_preview(preview_token))
        if verified_preview:
            scope['formweb.preview'] = True
            scope['formweb.previewToken'] = preview_token
        public_form = bool(re.fullmatch(r'/api/forms/[^/]+/[^/]+', path))
        public = public_form or runtime or path == '/api/providers/commerce/webhook' or path.startswith(('/published/', '/sites/', '/preview/'))
        control = path == '/mcp' or path.startswith('/api/') and not public and path not in ('/api/health', '/api/system')
        identity = {'id': 'visitor', 'name': 'Website visitor', 'root': False}
        try:
            if headers.get('host', '') not in allowed_hosts:
                raise EngineError('This service accepts exact loopback hostnames only.', 421)
            if origin is not None and origin not in ORIGINS and not (origin == 'null' and verified_preview):
                raise EngineError('Origin is not allowed.', 403)
            if path == '/mcp' and not studio.agents_enabled:
                raise EngineError('Agents are disabled. Enable Agents in the editor or set FORMWEB_AGENTS=1.', 403)
            if control and scope['method'] != 'OPTIONS':
                identity = studio.access.authenticate(headers, mcp=path == '/mcp')
            maximum = MAX_PROJECT_FILE_BYTES if path in ('/api/load', '/mcp') else MAX_DOCUMENT_BYTES
            length = headers.get('content-length', '')
            if length and (not length.isdecimal() or int(length) > maximum):
                raise EngineError('Request body exceeds the configured size limit.', 413)
        except EngineError as error:
            return await JSONResponse({'detail': str(error)}, status_code=error.status)(scope, receive, send)
        if origin == 'null' and verified_preview and scope['method'] == 'OPTIONS':
            return await Response(status_code=204, headers={'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-FormWeb-Preview, X-FormWeb-Visitor, X-FormWeb-Consent', 'Vary': 'Origin'})(scope, receive, send)
        scope['formweb.identity'] = identity
        context_token = actor.set(identity)
        async def guarded_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message.get('headers', [])) + [(b'x-content-type-options', b'nosniff'), (b'referrer-policy', b'no-referrer')]
                if origin == 'null' and verified_preview:
                    message['headers'].extend([(b'access-control-allow-origin', b'null'), (b'vary', b'Origin')])
            await send(message)
        try:
            await self.app(scope, receive, guarded_send)
        finally:
            actor.reset(context_token)


@asynccontextmanager
async def lifespan(app):
    await studio.start()
    try:
        async with mcp.session_manager.run():
            yield
    finally:
        await studio.close()


app = FastAPI(title='FormWeb', version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(ORIGINS), allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'MCP-Protocol-Version', 'X-Filename'], expose_headers=['Content-Disposition'], allow_credentials=True)
app.add_middleware(LocalAccess)
app.include_router(advanced_router)
app.include_router(provider_router)


@app.exception_handler(EngineError)
async def engine_error(request, error):
    return JSONResponse({'detail': str(error), **getattr(error, 'details', {})}, status_code=error.status)


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
    studio.access.authorize('edit')
    body = await limited_body(request)
    result = ingest(body, request.headers.get('content-type', '').split(';', 1)[0], request.headers.get('x-filename'))
    own_asset(studio, result['id'])
    studio.access.record('asset.upload', {'id': result['id']})
    return result


@app.get('/api/assets')
async def assets():
    allowed = visible_assets(studio)
    return {'assets': [item for item in list_assets()['assets'] if item['id'] in allowed]}


@app.get('/api/assets/{asset_id}')
async def image_asset(asset_id: str):
    if asset_id not in visible_assets(studio):
        raise EngineError('Asset not found for this identity.', 404)
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
    studio.access.authorize('manage')
    studio.access.record('agents.configure', {'enabled': body.enabled})
    studio.agents_enabled = body.enabled
    return await system()

@app.post('/api/auth')
async def authenticate(request: Request):
    identity = studio.access.authenticate(request.headers, mcp=True)
    session = studio.access.browser_session(identity)
    response = JSONResponse({'authenticated': True, 'identity': identity})
    response.set_cookie('formweb_session', session, httponly=True, samesite='strict', path='/api', max_age=43200)
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
    return await load_native(body)


@app.get('/api/project-file')
@app.get('/api/project/download')
async def project_file():
    current = await studio.state()
    envelope = project_envelope(current['site'], await studio.engine.request('checkpoint'))
    return Response(json.dumps(envelope, ensure_ascii=False, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename="site.fweb"'})


@app.get('/api/projects')
async def projects():
    return studio.projects()


@app.post('/api/projects/save')
async def save(body: Name):
    return await studio.save_project(body.name)


@app.post('/api/projects/{project_id}/open')
async def open_project(project_id: str):
    return await studio.open_project(project_id)


@app.get('/api/projects/{project_id}/file')
async def saved_project_file(project_id: str):
    studio.access.authorize('read', project_id)
    site = studio.store.project(project_id)
    if site is None:
        raise EngineError('Project not found.', 404)
    envelope = project_envelope(site, studio.store.project_checkpoint(project_id))
    return Response(json.dumps(envelope, ensure_ascii=False, indent=2), media_type='application/json', headers={'Content-Disposition': 'attachment; filename="site.fweb"'})


@app.get('/api/audit')
async def audit():
    studio.access.authorize('read')
    return await studio.engine.request('audit')


@app.get('/api/export')
async def export(locale: str | None = None):
    data, manifest = await studio.export_zip(locale)
    return Response(data, media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="site-export.zip"'})


@app.get('/api/exports/{filename}')
async def download_export(filename: str):
    if not filename.startswith('site-') or not filename.endswith('.zip') or '/' in filename or '\\' in filename:
        raise EngineError('Export not found.', 404)
    project_id = studio.store.get_meta('export:' + filename)
    if project_id is None and not actor.get()['root']:
        raise EngineError('Legacy export is available only to the local owner.', 403)
    studio.access.authorize('read', project_id)
    path = DATA_DIR / 'exports' / filename
    if not path.is_file():
        raise EngineError('Export not found.', 404)
    return FileResponse(path, media_type='application/zip', filename=filename)


@app.post('/api/publish')
async def publish(body: Publish):
    return await studio.publish(body.slug)


@app.get('/api/publications')
async def publications():
    return {'publications': studio.releases.list()['releases']}


@app.get('/api/forms')
async def forms(siteId: str | None = None):
    return studio.forms.inbox(siteId)


@app.post('/api/forms/{site_id}/{form_id}')
@app.post('/published/{slug}/{version}/api/forms/{site_id}/{form_id}')
async def submit(site_id: str, form_id: str, request: Request, slug: str | None = None, version: str | None = None):
    form_gate(request, site_id, form_id, slug, version)
    return await studio.submit_form(site_id, form_id, await submission_values(request), request.client.host if request.client else 'local', slug, version)


@app.get('/api/events')
async def events(request: Request):
    studio.access.authorize('read')
    queue = asyncio.Queue(maxsize=8)
    studio.subscribers.add(queue)
    async def stream():
        try:
            yield 'event: state\ndata: ' + json.dumps(await studio.state(), separators=(',', ':')) + '\n\n'
            while not await request.is_disconnected():
                try:
                    try:
                        current, project_id = await asyncio.wait_for(queue.get(), timeout=15)
                    except asyncio.TimeoutError:
                        current, project_id = None, studio.access.project_key()
                    studio.access.authenticate(request.headers)
                    studio.access.authorize('read', project_id)
                    if current is None:
                        yield ': keepalive\n\n'
                    else:
                        yield 'event: state\ndata: ' + json.dumps(current, separators=(',', ':')) + '\n\n'
                except EngineError:
                    yield 'event: access\ndata: {"denied":true}\n\n'
                    return
        finally:
            studio.subscribers.discard(queue)
    return StreamingResponse(stream(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.get('/published/{slug}/{version}/{path:path}')
async def publication(slug: str, version: str, path: str, request: Request):
    return await serve_release(slug, version, path, request)


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
