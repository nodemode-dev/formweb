import json
from pathlib import PurePosixPath
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from jsonschema import Draft202012Validator
from starlette.responses import FileResponse, RedirectResponse, Response

from .advanced_catalog import ADVANCED_BY_NAME
from .config import DATA_DIR, MAX_FORM_BYTES
from .engine import EngineError
from .providers.service import providers
from .service import safe_export_path, studio
from .workflows import dispatch

router = APIRouter()


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
        if len(content) > MAX_FORM_BYTES:
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


async def serve_release(slug, version, path, request, active=False):
    release = studio.releases.release(slug, version)
    root = (DATA_DIR / 'publications' / slug / version).resolve()
    if not root.is_relative_to((DATA_DIR / 'publications').resolve()) or version.startswith('.'):
        raise EngineError('Release not found.', 404)
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
    target = exported_file(root, path)
    gated = visitor_gate(request, root, release['site'], path)
    headers = {'Cache-Control': 'private, no-store' if gated or active else 'public, max-age=31536000, immutable'}
    if path.startswith('assets/components/') and path.endswith('.html'):
        headers['Content-Security-Policy'] = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"
    return FileResponse(target, headers=headers)


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
    target = exported_file(root, path)
    headers = {'Cache-Control': 'private, no-store', 'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups'}
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
