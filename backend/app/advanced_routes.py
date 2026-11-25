import json
from html import escape
from pathlib import PurePosixPath
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from jsonschema import Draft202012Validator
from starlette.responses import FileResponse, RedirectResponse, Response

from .advanced_catalog import ADVANCED_BY_NAME
from .config import DATA_DIR, MAX_FORM_BYTES, MAX_FORM_UPLOAD_BYTES
from .engine import EngineError
from .passwords import FORM_PATH as PASSWORD_FORM
from .providers.service import providers
from .service import safe_export_path, studio
from .workflows import dispatch

router = APIRouter()
GATE_HEADERS = {'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", 'Referrer-Policy': 'same-origin'}


async def read_body(request, limit=8 * 1024 * 1024):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > limit:
            raise EngineError('Request body is too large.', 413)
    try:
        result = json.loads(content or b'{}')
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError('Request body requires valid JSON.') from error
    if not isinstance(result, dict):
        raise EngineError('Request body must be an object.')
    return result


def endpoint_for(name, mappings):
    async def endpoint(request: Request):
        args = dict(request.query_params) if request.method == 'GET' else await read_body(request)
        for path_key, argument_key in mappings.items():
            args[argument_key] = request.path_params[path_key]
        errors = list(Draft202012Validator(ADVANCED_BY_NAME[name]['inputSchema']).iter_errors(args))
        if errors:
            raise EngineError('Invalid workflow request: ' + errors[0].message[:400], 422)
        result = await dispatch(name, args)
        if name in ('export_submissions_csv', 'export_cms_csv'):
            return Response(result['csv'], media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="formweb.csv"', 'Cache-Control': 'private, no-store'})
        return result
    endpoint.__name__ = name
    return endpoint


ROUTES = [
    ('GET', '/api/checkpoint', 'get_checkpoint', {}),
    ('DELETE', '/api/projects/{project_id}', 'delete_project', {'project_id': 'project_id'}),
    ('POST', '/api/preview', 'compile_preview', {}),
    ('GET', '/api/releases', 'list_releases', {}),
    ('POST', '/api/releases/promote', 'promote_release', {}),
    ('POST', '/api/releases/rollback', 'rollback_release', {}),
    ('GET', '/api/branches', 'list_branches', {}),
    ('POST', '/api/branches', 'create_branch', {}),
    ('POST', '/api/branches/{id}/capture', 'capture_branch', {'id': 'id'}),
    ('POST', '/api/branches/{id}/open', 'open_branch', {'id': 'id'}),
    ('GET', '/api/branches/{id}/review', 'review_branch', {'id': 'id'}),
    ('POST', '/api/branches/{id}/merge', 'merge_branch', {'id': 'id'}),
    ('GET', '/api/comments', 'list_comments', {}),
    ('POST', '/api/comments', 'add_comment', {}),
    ('POST', '/api/comments/{id}/resolve', 'resolve_comment', {'id': 'id'}),
    ('GET', '/api/access', 'get_access', {}),
    ('POST', '/api/identities', 'create_identity', {}),
    ('POST', '/api/access/grant', 'grant_access', {}),
    ('GET', '/api/presence', 'get_presence', {}),
    ('POST', '/api/presence', 'update_presence', {}),
    ('GET', '/api/activity', 'get_activity', {}),
    ('GET', '/api/forms.csv', 'export_submissions_csv', {}),
    ('POST', '/api/forms/retention', 'set_form_retention', {}),
    ('GET', '/api/delivery/config', 'get_delivery_config', {}),
    ('POST', '/api/delivery/config', 'configure_delivery', {}),
    ('GET', '/api/delivery', 'list_deliveries', {}),
    ('POST', '/api/delivery/{id}/retry', 'retry_delivery', {'id': 'id'}),
    ('GET', '/api/cms/{collection}.csv', 'export_cms_csv', {'collection': 'collection'}),
    ('POST', '/api/cms/{collection}/import', 'import_cms_csv', {'collection': 'collection'}),
    ('GET', '/api/libraries', 'list_libraries', {}),
    ('POST', '/api/libraries', 'save_library', {}),
    ('GET', '/api/libraries/{id}/review', 'review_library', {'id': 'id'}),
    ('POST', '/api/libraries/{id}/import', 'import_library', {'id': 'id'}),
    ('POST', '/api/code/build', 'build_code_component', {}),
]
for method, path, name, mappings in ROUTES:
    router.add_api_route(path, endpoint_for(name, mappings), methods=[method])


@router.get('/api/catalog')
async def catalogue():
    from .mcp_catalog import TOOLS
    from .providers.catalog import PROVIDER_TOOLS
    studio.access.authorize('read')
    return {'tools': TOOLS + list(ADVANCED_BY_NAME.values()) + PROVIDER_TOOLS, 'routes': [{'method': method, 'path': path, 'tool': name} for method, path, name, mappings in ROUTES]}


async def submission_values(request):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > (MAX_FORM_UPLOAD_BYTES if request.headers.get('content-type', '').split(';', 1)[0] == 'application/json' else MAX_FORM_BYTES):
            raise EngineError('Submission body is too large.', 413)
    media = request.headers.get('content-type', '').split(';', 1)[0]
    try:
        if media == 'application/json':
            values = json.loads(content)
        elif media == 'application/x-www-form-urlencoded':
            values = {name: entries[0] if len(entries) == 1 else entries for name, entries in parse_qs(content.decode(), keep_blank_values=True, max_num_fields=128).items()}
        else:
            raise EngineError('Use JSON or URL-encoded form fields.', 415)
    except (ValueError, UnicodeDecodeError) as error:
        raise EngineError('Submission fields are invalid.') from error
    if not isinstance(values, dict):
        raise EngineError('Submission fields must be an object.')
    return values


@router.post('/preview/{token}/api/forms/{site_id}/{form_id}')
async def preview_form(token: str, site_id: str, form_id: str, request: Request):
    return await studio.submit_form(site_id, form_id, await submission_values(request), request.client.host if request.client else 'local', preview_token=token)


def canonical_route(root, site, path):
    route = '/' + path.lstrip('/')
    if route.endswith('/index.html'):
        route = route[:-10]
    route = route.rstrip('/') or '/'
    manifest_path = root / 'routes.json'
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text())
        rows = manifest.get('routes', []) if isinstance(manifest, dict) else manifest
        for row in rows:
            alias = '/' + row.get('path', '').lstrip('/')
            if alias.endswith('/index.html'):
                alias = alias[:-10]
            if row.get('stylesheet') == path or (alias.rstrip('/') or '/') == route:
                page = next((item for item in site['pages'] if item['id'] == row.get('page')), None)
                if page:
                    return page['slug']
    return route


def visitor_gate(request, root, site, path):
    gates = site.get('extensions', {}).get('integrations', {}).get('gates', [])
    if path in ('assets/runtime.js', 'assets/site.css'):
        return False
    if gates and path.startswith('assets/'):
        manifest_path = root / 'asset-access.json'
        manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
        owners = set(manifest.get('assets', {}).get(path, []))
        pages = [page for page in site['pages'] if page['id'] in owners]
        last_error = None
        authorized = False
        for page in pages:
            try:
                gated = providers.visitor.authorize(request, site, page['slug'])
                if not gated:
                    return False
                authorized = True
            except EngineError as error:
                last_error = error
        if authorized:
            return True
        if last_error:
            raise last_error
        session = providers.visitor.session(request, site['id'])
        raise EngineError('This private asset has no published page ownership.', 403 if session['authenticated'] else 401)
    return providers.visitor.authorize(request, site, canonical_route(root, site, path))


def exported_file(root, path):
    relative = safe_export_path(path + 'index.html' if path.endswith('/') else path or 'index.html')
    target = root.joinpath(*relative.parts).resolve()
    if target.is_dir():
        target = target / 'index.html'
    if not target.is_relative_to(root.resolve()) or not target.is_file():
        raise EngineError('Compiled file not found.', 404)
    return target


def missing_page(page, base, request):
    """The served copy of a site's 404 page: a base tag at its folder so relative URLs work from any missing path, and
    fragment-only links pointed at the request's own address so they scroll instead of leaving for the 404 folder."""
    raw = request.scope.get('raw_path')
    own = raw.decode('latin-1') if raw else quote(request.url.path)
    own = own.split('?', 1)[0].split('#', 1)[0]
    if request.scope.get('query_string'):
        own += '?' + request.scope['query_string'].decode('latin-1')
    own = escape(own, quote=True)
    html = page.read_text(encoding='utf-8').replace('href="#', 'href="' + own + '#')
    return html.replace('<head>', '<head><base href="' + escape(base, quote=True) + '">', 1)


async def serve_release(slug, version, path, request, active=False):
    release = studio.releases.release(slug, version)
    root = (DATA_DIR / 'publications' / slug / version).resolve()
    if not root.is_relative_to((DATA_DIR / 'publications').resolve()) or version.startswith('.'):
        raise EngineError('Release not found.', 404)
    ticket = request.query_params.get('fw-member')
    member = providers.visitor.ticket_member(ticket, release['site']['id'], slug, version) if ticket else None
    if member:
        request.scope['formweb.member'] = {'site': member['site'], 'email': member['email']}
    redirect = studio.releases.redirect(slug, version, path)
    if redirect:
        target, status = redirect
        if target.startswith('/'):
            target = ('/sites/' + slug if active else '/published/' + slug + '/' + version) + target
        return RedirectResponse(target, status_code=status)
    if path in ('', '/', 'index.html') and not (root / 'index.html').is_file():
        entry = studio.releases.entry_path(release['site'], root)
        prefix = '/sites/' + slug if active else '/published/' + slug + '/' + version
        return RedirectResponse(prefix + '/' + entry, status_code=302, headers={'Cache-Control': 'private, no-store'})
    try:
        target = exported_file(root, path)
    except EngineError as error:
        page = root / '404' / 'index.html'
        if error.status != 404 or not (root / '404.html').is_file() or not page.is_file():
            raise
        # The 404 page is site content: it passes the same visitor and password gates as its own page, else the plain 404 stands.
        try:
            visitor_gate(request, root, release['site'], '404/index.html')
            gate = studio.passwords.gate_for(release['site']['id'], canonical_route(root, release['site'], '404/index.html'))
        except EngineError:
            raise error
        if gate and not studio.passwords.unlocked(request, gate):
            raise error
        # The root 404.html is written for a host at the base URL's path, not this release prefix, so the release serves the
        # page's own 404/index.html, whose relative URLs work from any missing path through a base tag at its folder.
        base = ('/sites/' + slug if active else '/published/' + slug + '/' + version) + '/404/'
        return Response(missing_page(page, base, request), status_code=404, media_type='text/html', headers={'Cache-Control': 'private, no-store'})
    gated = visitor_gate(request, root, release['site'], path)
    if path in ('site.formweb.json', 'search-index.json') and studio.passwords.routes(release['site']['id']):
        # A release made before a password was set still holds the page's text in these two files.
        if path == 'site.formweb.json':
            raise EngineError('Compiled file not found.', 404)
        entries = json.loads(target.read_text(encoding='utf-8'))
        kept = [entry for entry in entries if not studio.passwords.gate_for(release['site']['id'], canonical_route(root, release['site'], (entry.get('path') or '') + 'index.html'))]
        return Response(json.dumps(kept, ensure_ascii=False), media_type='application/json', headers={'Cache-Control': 'private, no-store'})
    if target.suffix == '.html' and not path.startswith('assets/'):
        # FW-078: password gates are checked here, in the serving adapter, before any page bytes leave.
        gate = studio.passwords.gate_for(release['site']['id'], canonical_route(root, release['site'], path))
        if gate:
            gated = True
            if not studio.passwords.unlocked(request, gate):
                prefix = '/sites/' + slug if active else '/published/' + slug + '/' + version
                page = studio.passwords.form(f'{prefix}/{PASSWORD_FORM}', '/' + path.strip('/'), release['site'].get('name', 'Protected page'))
                return Response(page, status_code=401, media_type='text/html', headers=GATE_HEADERS)
    headers = {'Cache-Control': 'private, no-store' if gated or active else 'public, max-age=31536000, immutable'}
    if path.startswith('assets/components/') and path.endswith('.html'):
        headers['Content-Security-Policy'] = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"
    return FileResponse(target, headers=headers)


async def unlock(request, slug, version, prefix):
    release = studio.releases.release(slug, version)
    form = parse_qs((await request.body())[:4096].decode(errors='replace'))
    route = form.get('route', ['/'])[0]
    password = form.get('password', [''])[0]
    root = (DATA_DIR / 'publications' / slug / version).resolve()
    gate = studio.passwords.gate_for(release['site']['id'], canonical_route(root, release['site'], route.lstrip('/')))
    safe_route = '/' + '/'.join(part for part in route.split('/') if part and part not in ('.', '..'))
    if not gate:
        return RedirectResponse(prefix + safe_route, status_code=303)
    client = request.client.host if request.client else 'local'
    if not password or not studio.passwords.check(gate, password, client):
        page = studio.passwords.form(f'{prefix}/{PASSWORD_FORM}', safe_route, release['site'].get('name', 'Protected page'), 'That password is not right.')
        return Response(page, status_code=401, media_type='text/html', headers=GATE_HEADERS)
    response = RedirectResponse(prefix + safe_route + ('' if safe_route.endswith('/') else '/'), status_code=303, headers={'Cache-Control': 'private, no-store'})
    response.set_cookie(studio.passwords.cookie_name(gate), studio.passwords.token(gate), httponly=True, samesite='lax', path=prefix, max_age=7 * 86400)
    return response


@router.post('/sites/{slug}/' + PASSWORD_FORM)
async def unlock_active(slug: str, request: Request):
    return await unlock(request, slug, studio.releases.active(slug), '/sites/' + slug)


@router.post('/published/{slug}/{version}/' + PASSWORD_FORM)
async def unlock_published(slug: str, version: str, request: Request):
    return await unlock(request, slug, version, '/published/' + slug + '/' + version)


@router.get('/sites/{slug}/{path:path}')
async def active_site(slug: str, path: str, request: Request):
    return await serve_release(slug, studio.releases.active(slug), path, request, True)


@router.get('/preview/{token}/{path:path}')
async def preview_file(token: str, path: str, request: Request):
    studio.releases.preview_site(token)
    root = (DATA_DIR / 'previews' / token).resolve()
    redirect = studio.releases.redirect(None, None, path, token)
    if redirect:
        target, status = redirect
        if target.startswith('/'):
            target = '/preview/' + token + target
        return RedirectResponse(target, status_code=status, headers={'Cache-Control': 'private, no-store'})
    headers = {'Cache-Control': 'private, no-store', 'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups'}
    try:
        target = exported_file(root, path)
    except EngineError as error:
        page = root / '404' / 'index.html'
        if error.status != 404 or not (root / '404.html').is_file() or not page.is_file():
            raise
        return Response(missing_page(page, '/preview/' + token + '/404/', request), status_code=404, media_type='text/html', headers=headers)
    if path.startswith('assets/components/') and path.endswith('.html'):
        headers['Content-Security-Policy'] = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'"
    return FileResponse(target, headers=headers)


def form_gate(request, site_id, form_id, slug=None, version=None):
    site = studio.store.publication_site(site_id, slug, version) if slug and version else studio.store.published_site(site_id)
    if site is None and not slug and studio.engine.cached_state and studio.engine.cached_state['site']['id'] == site_id:
        site = studio.engine.cached_state['site']
    if site is None:
        raise EngineError('Form site not found.', 404)
    pages = []
    for page in site['pages']:
        pending, visited = [page['root']], set()
        while pending:
            node_id = pending.pop()
            if node_id in visited:
                continue
            visited.add(node_id)
            if node_id == form_id:
                pages.append(page['slug'])
                break
            node = site['nodes'].get(node_id, {})
            pending.extend(node.get('children', []))
            component = site.get('components', {}).get(node.get('componentRef'))
            if component:
                pending.append(component['root'])
    if not pages:
        raise EngineError('Form is not part of a published page.', 404)
    gates = site.get('extensions', {}).get('integrations', {}).get('gates', [])
    for page in pages:
        if not any(page.rstrip('/') == gate['route'].rstrip('/') or page.startswith(gate['route'].rstrip('/') + '/') for gate in gates):
            return
    last_error = None
    for page in pages:
        try:
            providers.visitor.authorize(request, site, page)
            return
        except EngineError as error:
            last_error = error
    if last_error:
        raise last_error
