import asyncio
import json
import mimetypes
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.background import BackgroundTask
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .access import CHANNELS, actor, channel
from .advanced_routes import router as advanced_router, form_gate, serve_release, submission_values
from . import claude_code, window_key
from .assets import MIME_TYPES, ProjectTooLarge, asset_path, ingest, list_assets, own_asset, project_envelope, read_project_archive, sweep_stale_temporaries, visible_assets, write_project_archive
from .chat import router as chat_router
from .clips import router as clips_router
from .commands_mirror import router as commands_router
from .config import AUTH_TOKEN, DATA_DIR, FRONTEND_DIST, MAX_DOCUMENT_BYTES, MAX_FORM_BYTES, MAX_PROJECT_ARCHIVE_BYTES, MAX_PROJECT_FILE_BYTES, MAX_SITE_ARCHIVE_BYTES, MAX_VIDEO_BYTES, ORIGINS, PORT, VERSION
from .engine import EngineError
from .fpub import is_fpub, read_fpub
from .fragment_routes import MAX_PASTE_BYTES, router as fragment_router
from .handoff import router as handoff_router
from .library_routes import SITE_ARCHIVE_PATHS, router as library_router
from .mcp_server import mcp, mcp_app
from .providers.routes import router as provider_router
from .service import ACCESS_META, BLOCKED, DOCK_CONTRACT, Notice, safe_export_path, studio
from .terminal import router as terminal_router
from .vector_routes import router as vector_router
from .workflows import load_native

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")

SITE_SANDBOX = b'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'
SITE_SPACE = ('/published/', '/sites/')


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
        site_space = path.startswith(SITE_SPACE)
        site_form = bool(re.fullmatch(r'/published/[^/]+/[^/]+/api/forms/[^/]+/[^/]+', path))
        site_page = site_space and origin == 'null' and (scope['method'] in ('GET', 'HEAD', 'OPTIONS') or site_form)
        query = parse_qs(scope.get('query_string', b'').decode(errors='replace'))
        preview_token = preview_match.group(1) if preview_match else headers.get('x-formweb-preview') or query.get('previewToken', [''])[0]
        verified_preview = bool((preview_match or runtime) and studio.releases.valid_preview(preview_token))
        if verified_preview:
            scope['formweb.preview'] = True
            scope['formweb.previewToken'] = preview_token
        public_form = bool(re.fullmatch(r'/api/forms/[^/]+/[^/]+', path))
        clip_fetch = bool(re.fullmatch(r'/api/clips/[0-9a-f]{64}/[0-9a-f]{64}\.(?:png|jpg|gif|webp|svg|mp4|webm|woff2)', path)) and scope['method'] == 'GET'
        public = public_form or runtime or clip_fetch or path == '/api/providers/commerce/webhook' or site_space or path.startswith('/preview/')
        control = path == '/mcp' or path.startswith('/api/') and not public and path not in ('/api/health', '/api/system')
        identity = {'id': 'visitor', 'name': 'Website visitor', 'root': False}
        try:
            if headers.get('host', '') not in allowed_hosts:
                raise EngineError('This service accepts exact loopback hostnames only.', 421)
            if origin == 'null' and not verified_preview and (path == '/mcp' or path.startswith('/api/')):
                raise EngineError('Opaque origins may only use a verified preview.', 403)
            if origin is not None and origin not in ORIGINS and not (origin == 'null' and (verified_preview or site_page)):
                raise EngineError('Origin is not allowed.', 403)
            if origin in (None, 'null') and not public and headers.get('sec-fetch-site', '').strip().lower() == 'cross-site':
                raise EngineError('Cross-site requests are not allowed.', 403)
            if path == '/mcp' and studio.agents_blocked:
                raise EngineError(BLOCKED, 403)
            if path == '/mcp' and not (studio.agents_enabled or claude_code.valid_token(headers.get(claude_code.INAPP_HEADER.lower(), ''))):
                raise EngineError('Agents are disabled. Enable Agents in the editor or set FORMWEB_AGENTS=1.', 403)
            if control and scope['method'] != 'OPTIONS':
                identity = studio.access.authenticate(headers, mcp=path == '/mcp')
            holds_key = window_key.valid(headers.get(window_key.HEADER))
            if control and window_key.needs_key(scope['method'], path, identity['root']) and not holds_key:
                raise EngineError(window_key.REFUSED, 403)
            archive_load = path == '/api/load' and headers.get('content-type', '').split(';', 1)[0].strip().lower() == 'application/zip'
            maximum = MAX_PROJECT_ARCHIVE_BYTES if archive_load else MAX_PROJECT_FILE_BYTES if path in ('/api/load', '/mcp') else MAX_VIDEO_BYTES if path == '/api/assets' and scope['method'] == 'POST' else MAX_PASTE_BYTES if path == '/api/paste' else MAX_SITE_ARCHIVE_BYTES if path in SITE_ARCHIVE_PATHS else MAX_DOCUMENT_BYTES
            length = headers.get('content-length', '')
            if length and (not length.isdecimal() or int(length) > maximum):
                raise EngineError('Request body exceeds the configured size limit.', 413)
        except EngineError as error:
            cors = {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'vary': 'Origin'} if origin in ORIGINS else None
            return await JSONResponse({'detail': str(error)}, status_code=error.status, headers=cors)(scope, receive, send)
        if origin == 'null' and (verified_preview or site_page) and scope['method'] == 'OPTIONS':
            return await Response(status_code=204, headers={'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-FormWeb-Preview, X-FormWeb-Visitor, X-FormWeb-Consent', 'Vary': 'Origin'})(scope, receive, send)
        scope['formweb.identity'] = identity
        context_token = actor.set(identity)
        async def guarded_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message.get('headers', [])) + [(b'x-content-type-options', b'nosniff')]
                if not any(key.lower() == b'referrer-policy' for key, _ in message['headers']):
                    message['headers'].append((b'referrer-policy', b'no-referrer'))
                if origin == 'null' and (verified_preview or site_page):
                    message['headers'].extend([(b'access-control-allow-origin', b'null'), (b'vary', b'Origin')])
                elif site_space:
                    message['headers'].append((b'vary', b'Origin'))
                if preview_match and not any(key.lower() == b'content-security-policy' for key, _ in message['headers']):
                    message['headers'].append((b'content-security-policy', b'sandbox allow-scripts allow-forms allow-popups'))
                if site_space and not any(key.lower() == b'content-security-policy' for key, _ in message['headers']):
                    message['headers'].append((b'content-security-policy', SITE_SANDBOX))
            await send(message)
        requested_channel = headers.get('x-formweb-channel', '')
        channel_token = channel.set('agent' if path == '/mcp' else requested_channel if requested_channel in CHANNELS else 'human')
        window_token = window_key.window.set(holds_key and path != '/mcp')
        try:
            await self.app(scope, receive, guarded_send)
        finally:
            window_key.window.reset(window_token)
            channel.reset(channel_token)
            actor.reset(context_token)


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(sweep_stale_temporaries)
    await studio.start()
    try:
        async with mcp.session_manager.run():
            yield
    finally:
        await studio.close()


app = FastAPI(title='FormWeb', version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(ORIGINS), allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'MCP-Protocol-Version', 'X-Filename', 'X-FormWeb-Channel', 'X-FormWeb-Window-Key'], expose_headers=['Content-Disposition', 'X-FormWeb-Method', 'X-FormWeb-Asset', 'X-FormWeb-Local-Forms'], allow_credentials=True)
app.add_middleware(LocalAccess)
app.include_router(advanced_router)
app.include_router(provider_router)
app.include_router(terminal_router)
app.include_router(chat_router)
app.include_router(commands_router)
app.include_router(vector_router)
app.include_router(library_router)
app.include_router(handoff_router)
app.include_router(fragment_router)
app.include_router(clips_router)


@app.get('/api/terminal/status')
async def terminal_status():
    from .terminal import status
    studio.access.authorize('read')
    return {**status(), 'agentsEnabled': studio.agents_enabled}


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
    commands: list[dict[str, Any]] = Field(min_length=1, max_length=4000)
    expectedRevision: int | None = Field(default=None, ge=0)


class Name(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=160)


class NewSite(Name):
    # blank: start without the sample content (starter sites fill it in one batch).
    blank: bool | None = None


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
    body = await limited_body(request, MAX_VIDEO_BYTES)
    result = ingest(body, request.headers.get('content-type', '').split(';', 1)[0], request.headers.get('x-filename'))
    own_asset(studio, result['id'])
    studio.access.record('asset.upload', {'id': result['id']})
    return result


@app.get('/api/assets')
async def assets():
    allowed = visible_assets(studio)
    return {'assets': [item for item in list_assets()['assets'] if item['id'] in allowed]}


@app.get('/api/qr')
async def qr_code(url: str, format: str = 'svg', dark: str = '#000000', light: str = '#ffffff', scale: int = 8):
    from .qr import qr_image
    studio.access.authorize('read')
    data, media, filename = qr_image(url, format, dark, light, scale)
    return Response(data, media_type=media, headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Cache-Control': 'no-store'})


@app.get('/api/assets/{asset_id}')
async def image_asset(asset_id: str):
    if asset_id not in visible_assets(studio):
        raise EngineError('Asset not found for this identity.', 404)
    target = asset_path(asset_id)
    headers = {'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff'}
    if target.suffix == '.svg':  # sanitized on the way in; opened directly it still may not run or load anything
        headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    return FileResponse(target, media_type=MIME_TYPES[target.suffix[1:]], headers=headers)


@app.get('/api/health')
async def health():
    await studio.engine.request('hello')
    return {'status': 'ok', 'app': 'formweb', 'version': VERSION, 'engine': 'rust'}


@app.get('/api/system')
async def system():
    return {'version': VERSION, 'engine': 'rust', 'agentsEnabled': studio.agents_enabled, 'authRequired': bool(AUTH_TOKEN)}


@app.post('/api/agents')
async def agents(body: Agents):
    studio.access.authorize('manage')
    studio.access.record('agents.configure', {'enabled': body.enabled})
    if body.enabled and studio.agents_blocked:
        studio.agents_blocked = False
        studio.store.set_meta(ACCESS_META, None)
    studio.agents_enabled = body.enabled
    if not body.enabled:
        from .terminal import close_all
        close_all(external_only=True)
    return await system()


class AgentAccess(BaseModel):
    model_config = ConfigDict(extra='forbid')
    choice: str = Field(pattern='^(blocked|ask|allowed)$')


@app.get('/api/agents/access')
async def agent_access():
    studio.access.authorize('read')
    return studio.agent_access()


@app.post('/api/agents/access')
async def agent_access_set(body: AgentAccess):
    result = studio.set_agent_access(body.choice)
    if body.choice == 'blocked':
        from .terminal import close_all
        close_all(external_only=True)
    return result


@app.get('/api/agents/status')
async def agent_status(fresh: bool = False):
    from . import agent_programs
    from .terminal import status
    studio.access.authorize('read')
    offered = 'manage' in studio.access.status()['permissions'] and status()['supported']
    programs = await asyncio.to_thread(agent_programs.status, fresh) if offered else {}
    return {**programs, 'tabs': ['shell', 'claude', 'chat', 'codex', 'cursor', 'antigravity'] if offered else [], 'contract': DOCK_CONTRACT}


@app.post(window_key.BOOTSTRAP)
async def window_key_claim():
    if window_key.stdout_mode():
        raise EngineError('Endpoint not found.', 404)
    key = window_key.claim()
    if key is None:
        raise EngineError('The window key was already given to a window.', 409)
    return {'key': key}


@app.post('/api/window/ticket')
async def window_ticket():
    return {'ticket': window_key.ticket(), 'secondClaim': window_key.STATE['secondClaim']}

class SubstrateRun(BaseModel):
    model_config = ConfigDict(extra='forbid')
    command: str = Field(min_length=1, max_length=160)
    params: dict[str, Any] = Field(default_factory=dict)
    expectedRevision: int | None = Field(default=None, ge=0)


class Decision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision: str = Field(pattern='^(approve|deny)$')
    note: str | None = Field(default=None, max_length=500)


@app.get('/api/substrate')
async def substrate_summary():
    studio.access.authorize('read')
    return await studio.substrates.summary()


@app.post('/api/substrate/run')
async def substrate_run(body: SubstrateRun):
    return await studio.substrates.active.dispatch(body.command, body.params, body.expectedRevision)


@app.get('/api/substrate/activity')
async def substrate_activity(limit: int = 50, after: str | None = None):
    from .substrate import activity
    return activity(studio, limit, after)


@app.get('/api/approvals')
async def approvals(status: str | None = None):
    return studio.approvals.list(status if status in ('pending', 'approved', 'denied', 'expired', 'applied') else None)


@app.post('/api/approvals/settings')
async def approval_settings(body: dict[str, bool]):
    return studio.approvals.update_settings(body)


@app.post('/api/approvals/{approval_id}')
async def approval_decide(approval_id: str, body: Decision):
    return studio.approvals.decide(approval_id, body.decision, body.note)


class PagePassword(BaseModel):
    model_config = ConfigDict(extra='forbid')
    route: str = Field(min_length=1, max_length=200)
    password: str | None = Field(default=None, max_length=200)


class TeamLibraryBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, max_length=80)
    fromBrand: bool = False
    colors: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    fonts: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    graphics: list[dict[str, Any]] | None = Field(default=None, max_length=200)
    expectedRevision: int | None = Field(default=None, ge=0)

    def data(self):
        return {kind: value for kind in ('colors', 'fonts', 'graphics') if (value := getattr(self, kind)) is not None}


class TeamLibraryShare(BaseModel):
    model_config = ConfigDict(extra='forbid')
    identityId: str = Field(min_length=1, max_length=64)
    role: str | None = Field(default=None, max_length=8)


class TeamLibraryUse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: str = Field(default='link', max_length=8)


@app.get('/api/team-libraries')
async def team_libraries():
    return await studio.team_libraries.list()


@app.post('/api/team-libraries')
async def team_library_create(body: TeamLibraryBody):
    return await studio.team_libraries.create(body.name, body.fromBrand, body.data())


@app.get('/api/team-libraries/{library_id}')
async def team_library(library_id: str):
    return await studio.team_libraries.get(library_id)


@app.post('/api/team-libraries/{library_id}')
async def team_library_save(library_id: str, body: TeamLibraryBody):
    return await studio.team_libraries.save(library_id, body.name, body.data(), body.expectedRevision)


@app.post('/api/team-libraries/{library_id}/share')
async def team_library_share(library_id: str, body: TeamLibraryShare):
    return await studio.team_libraries.share(library_id, body.identityId, body.role)


@app.post('/api/team-libraries/{library_id}/use')
async def team_library_use(library_id: str, body: TeamLibraryUse):
    return await studio.team_libraries.use(library_id, body.action)


@app.delete('/api/team-libraries/{library_id}')
async def team_library_delete(library_id: str):
    return await studio.team_libraries.delete(library_id)


class StockIcon(BaseModel):
    model_config = ConfigDict(extra='forbid')
    color: str = Field(default='#111111', max_length=7)
    stroke: float = Field(default=2, ge=0.5, le=4)
    size: int = Field(default=96, ge=8, le=1024)


@app.get('/api/stock/status')
async def stock_status():
    from . import stock
    studio.access.authorize('read')
    data = stock.bundle()
    return {'icons': {'count': len(data['icons']), 'source': 'Lucide', 'version': data['version'], 'license': 'ISC (Feather-derived icons MIT)'}, 'formlit': stock.formlit_status()}


@app.get('/api/stock/icons')
async def stock_icons(q: str = '', limit: int = 120):
    from . import stock
    studio.access.authorize('read')
    return stock.search_icons(q[:120], limit)


@app.post('/api/stock/icons/{name}')
async def stock_icon_asset(name: str, body: StockIcon):
    from . import stock
    return stock.icon_asset(studio, name, body.color, body.stroke, body.size)


@app.get('/api/stock/formlit')
async def stock_photos(q: str = '', limit: int = 48):
    from . import stock
    return stock.search_photos(studio, q, limit)


@app.get('/api/stock/formlit/{photo_id}/thumb')
async def stock_photo_thumb(photo_id: int):
    from . import stock
    return Response(stock.photo_thumb(studio, photo_id), media_type='image/jpeg', headers={'Cache-Control': 'private, max-age=300'})


@app.post('/api/stock/formlit/{photo_id}')
async def stock_photo_asset(photo_id: int):
    from . import stock
    return stock.photo_asset(studio, photo_id)


class GenerateBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    prompt: str = Field(min_length=1, max_length=2000)
    generator: str | None = Field(default=None, max_length=120)
    size: str | None = Field(default=None, max_length=16)
    count: int = Field(default=1, ge=1, le=4)


class NodeRef(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node: str = Field(min_length=1, max_length=160)


class CopyBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node: str = Field(min_length=1, max_length=160)
    action: str = Field(max_length=12)
    tone: str | None = Field(default=None, max_length=16)
    brief: str | None = Field(default=None, max_length=1500)


class SitePlanBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    prompt: str = Field(min_length=1, max_length=4000)
    pages: int = Field(default=3, ge=1, le=4)
    references: list[dict[str, Any]] | None = Field(default=None, max_length=6)
    previous: dict[str, Any] | None = None
    instruction: str | None = Field(default=None, max_length=1000)


class SiteBuildBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    plan: dict[str, Any]


@app.get('/api/ai/status')
async def ai_status():
    from . import writer
    return await writer.status(studio)


@app.post('/api/ai/site/reference')
async def ai_site_reference(request: Request):
    from . import writer
    studio.access.authorize('edit')
    body = await limited_body(request, writer.REFERENCE_LIMIT)
    from urllib.parse import unquote
    return await asyncio.to_thread(writer.reference, unquote(request.headers.get('x-filename') or 'reference'), body)


@app.post('/api/ai/copy')
async def ai_copy(body: CopyBody):
    from . import writer
    return await writer.copy(studio, body.node, body.action, body.tone, body.brief)


@app.post('/api/ai/site/plan')
async def ai_site_plan(body: SitePlanBody):
    from . import writer
    return await writer.plan(studio, body.prompt, body.pages, body.references, body.previous, body.instruction)


@app.post('/api/ai/site/build')
async def ai_site_build(body: SiteBuildBody):
    from . import writer
    return await writer.build(studio, body.plan)


@app.get('/api/generate/generators')
async def generate_generators():
    from . import imagegen
    return imagegen.generators(studio)


@app.post('/api/generate')
async def generate_start(body: GenerateBody):
    from . import imagegen
    return imagegen.start(studio, body.prompt, body.generator, body.size, body.count)


@app.get('/api/generate/{job}')
async def generate_poll(job: str):
    from . import imagegen
    return imagegen.poll(studio, job)


@app.post('/api/formvis/send')
async def formvis_send(body: NodeRef):
    from . import imagegen
    return await imagegen.send_to_formvis(studio, body.node)


@app.post('/api/formvis/update')
async def formvis_update(body: NodeRef):
    from . import imagegen
    return await imagegen.update_from_formvis(studio, body.node)


class BackgroundMask(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node: str = Field(min_length=1, max_length=160)
    method: str = Field(default='auto', max_length=8)


class BackgroundApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    node: str = Field(min_length=1, max_length=160)
    mask: str | None = Field(default=None, max_length=17_000_000)
    method: str = Field(default='auto', max_length=8)
    feather: float = Field(default=0, ge=0, le=40)


@app.get('/api/background/status')
async def background_status():
    from . import background
    studio.access.authorize('read')
    return background.status()


@app.post('/api/background/mask')
async def background_mask(body: BackgroundMask):
    """The subject mask from formvis for an image node's original picture (greyscale PNG; white keeps)."""
    from . import background
    _, asset = background.node_asset(studio, await studio.state(), body.node)
    data, used = background.mask(studio, asset, body.method)
    return Response(data, media_type='image/png', headers={'X-FormWeb-Method': used, 'X-FormWeb-Asset': asset, 'Cache-Control': 'no-store'})


@app.post('/api/background/apply')
async def background_apply(body: BackgroundApply):
    from . import background
    return await background.apply(studio, body.node, body.mask, body.method, body.feather)


@app.post('/api/background/restore')
async def background_restore(body: BackgroundMask):
    from . import background
    return await background.restore(studio, body.node)


@app.get('/api/brand/check')
async def brand_check(page: str | None = None):
    from .brand import check
    studio.access.authorize('read')
    try:
        return check(await studio.state(), page)
    except ValueError as error:
        raise EngineError(str(error), 404)


@app.get('/api/page-passwords')
async def page_passwords():
    return await studio.passwords.list()


@app.post('/api/page-passwords')
async def page_password_set(body: PagePassword):
    return await studio.passwords.set(body.route, body.password)


@app.get('/api/agents/clients')
async def agent_clients():
    from .clients import cards
    studio.access.authorize('read')
    return {**cards(), 'agentsEnabled': studio.agents_enabled, 'access': studio.access.status()}


@app.post('/api/agents/clients/{client_id}')
async def agent_client_write(client_id: str):
    from .clients import write
    studio.access.authorize('manage')
    result = write(client_id)
    studio.access.record('agents.client', {'client': client_id, 'file': result['file']})
    return result


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
async def new(body: NewSite):
    return await studio.mutate('new', body.model_dump(exclude_none=True))


@app.post('/api/load')
async def load(request: Request):
    chunks = request.stream().__aiter__()
    first = b''
    async for chunk in chunks:
        first += chunk
        if len(first) >= 4:
            break
    if first.startswith(b'PK\x03\x04') or request.headers.get('content-type', '').split(';', 1)[0].strip().lower() == 'application/zip':
        return await load_archive(first, chunks)
    body = bytearray(first)
    async for chunk in chunks:
        body.extend(chunk)
        if len(body) > MAX_PROJECT_FILE_BYTES:
            raise EngineError('Request body is too large.', 413)
    if len(body) > MAX_PROJECT_FILE_BYTES:
        raise EngineError('Request body is too large.', 413)
    try:
        native = json.loads(bytes(body))
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError('Project file is not valid JSON.') from error
    return await load_native(native)


async def load_archive(first: bytes, chunks):
    """Version 2 .fweb: spool the body to disk while counting bytes, validate it with zipfile, then load through load_native."""
    studio.access.authorize('edit')
    folder = DATA_DIR / 'tmp'
    folder.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='load-', suffix='.fweb', dir=folder)
    target = Path(temporary)
    staged = {}
    try:
        total = 0
        with os.fdopen(handle, 'wb') as spool:
            for chunk in (first,):
                total += len(chunk)
                spool.write(chunk)
            async for chunk in chunks:
                total += len(chunk)
                if total > MAX_PROJECT_ARCHIVE_BYTES:
                    raise EngineError('Project archive exceeds the 512 MiB limit.', 413)
                spool.write(chunk)
        if total > MAX_PROJECT_ARCHIVE_BYTES:
            raise EngineError('Project archive exceeds the 512 MiB limit.', 413)
        reader = read_fpub if await asyncio.to_thread(is_fpub, target) else read_project_archive
        native = await asyncio.to_thread(reader, target, staged)
        return await load_native(native, target, staged)
    finally:
        target.unlink(missing_ok=True)
        for left in list(staged.values()):
            left.unlink(missing_ok=True)


@app.get('/api/project-file')
@app.get('/api/project/download')
async def project_file():
    current = await studio.state()
    return project_download(current['site'], await studio.engine.request('checkpoint'))


def project_download(site, checkpoint):
    try:
        envelope = project_envelope(site, checkpoint)
    except ProjectTooLarge:
        archive = write_project_archive(site, checkpoint)
        return FileResponse(archive, media_type='application/zip', headers={'Content-Disposition': 'attachment; filename="site.fweb"'}, background=BackgroundTask(archive.unlink, missing_ok=True))
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
    return project_download(site, studio.store.project_checkpoint(project_id))


@app.get('/api/audit')
async def audit():
    return await studio.audit()


@app.get('/api/export')
async def export(locale: str | None = None):
    data, manifest = await studio.export_zip(locale)
    headers = {'Content-Disposition': 'attachment; filename="site-export.zip"'}
    if manifest.get('localForms'):
        headers['X-FormWeb-Local-Forms'] = quote(json.dumps(manifest['localForms'][:20]), safe='')
    return Response(data, media_type='application/zip', headers=headers)


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
                    elif isinstance(current, Notice):
                        yield f'event: {current.name}\ndata: ' + json.dumps(current.data, separators=(',', ':')) + '\n\n'
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
        return FileResponse(target, headers={'Cache-Control': 'no-cache'} if target.suffix == '.html' else None)
    if '.' not in Path(path).name:
        return FileResponse(FRONTEND_DIST / 'index.html', headers={'Cache-Control': 'no-cache'})
    raise EngineError('File not found.', 404)
