"""HTTP routes for section library v2 (DEV_PLAN AD7, TURN_C_SPEC section 9). Every write is one engine batch, so one
undo step, sent through the same `studio.mutate` path as `/api/batch` with the revision it was computed against."""
import asyncio
import re
import secrets

from fastapi import APIRouter, Request
from starlette.responses import FileResponse

from . import library, outside_fetch, site_import
from .assets import ingest, own_asset
from .code_components import build_component
from .config import MAX_SITE_ARCHIVE_BYTES
from .engine import EngineError
from .service import studio

router = APIRouter()
SITE_ARCHIVE_PATHS = ('/api/library/import-site/review', '/api/library/import-site')

HTML_CAP = 512 * 1024
CSS_CAP = 256 * 1024
JS_CAP = 512 * 1024
KIT_IMPORT = re.compile(r'^[ \t]*import\s*\{([^{}]*)\}\s*from\s*["\'][^"\']*kit\.js["\']\s*;?[ \t]*$', re.M)
ANY_IMPORT = re.compile(r'^[ \t]*import[\s{*"\']', re.M)
SHIM = {
    'reduced': "const reduced = () => document.documentElement.classList.contains('fw-r') || matchMedia('(prefers-reduced-motion: reduce)').matches;",
    'onTheme': ("const onTheme = (fn) => { const html = document.documentElement; const read = () => html.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; "
                "let last = read(); new MutationObserver(() => { const next = read(); if (next !== last) { last = next; fn(next); } }).observe(html, { attributes: true, attributeFilter: ['data-theme'] }); };"),
    'token': "const token = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + String(name).replace(/^-+/, '')).trim();",
}


async def _body(request: Request) -> dict:
    try:
        body = await request.json() if (await request.body()) else {}
    except ValueError as error:
        raise EngineError('Request body requires valid JSON.') from error
    if not isinstance(body, dict):
        raise EngineError('Request body must be an object.')
    return body


async def _current() -> tuple[dict, int]:
    state = await studio.state()
    return state['site'], state['revision']


def _upload(path, mime: str) -> str:
    stored = ingest(path.read_bytes(), mime, path.name)
    own_asset(studio, stored['id'])
    return '/api/assets/' + stored['id']


async def _components(site: dict, ids: list[str], update: bool, warnings: list[str]) -> dict | None:
    present = (((site.get('extensions') or {}).get('code') or {}).get('components') or {})
    records = {}
    for cid in ids:
        manifest = library.component(cid)
        record = library.built_component(cid)
        if record is None:
            source, language = library.component_source(cid)
            record = (await build_component({'enabled': True, 'language': language, 'mode': 'page', 'source': source, 'props': manifest.get('props') or {}}))['component']
            warnings.append(f'Component {cid} had no prebuilt record and was compiled now.')
        if cid in present and present[cid].get('sourceDigest') != record.get('sourceDigest') and not update:
            warnings.append(f'Kept this site\'s own version of component {cid}; pass updateComponents to replace it with the library version.')
            continue
        poster = library.LIBRARY / 'components' / cid / (manifest.get('poster') or 'poster.webp')
        if poster.is_file():
            record = {**record, 'poster': _upload(poster, 'image/webp' if poster.suffix == '.webp' else 'image/png')}
        if manifest.get('posterLight'):
            light = library.LIBRARY / 'components' / cid / manifest['posterLight']
            if light.is_file():
                record = {**record, 'posterLight': _upload(light, 'image/webp' if light.suffix == '.webp' else 'image/png')}
        records[cid] = record
    return library.component_group(site, records)


def _fonts(site: dict, data: dict, mode: str) -> dict:
    have = ((site.get('extensions') or {}).get('design') or {}).get('fonts') or {}
    return {key: _upload(library.LIBRARY / 'presets' / face['file'], 'font/woff2') for key, face in (data.get('fonts') or {}).items() if mode == 'all' or key not in have}


def _page(site: dict, page_id: str | None) -> dict:
    pages = site.get('pages') or []
    found = next((p for p in pages if p['id'] == page_id), None) if page_id else (pages[0] if pages else None)
    if not found:
        raise EngineError('Page not found.', 404)
    return found


def _media(templates: list[dict], component_ids: list[str], warnings: list[str]) -> None:
    """Upload and own the bundled media a template or its components point at as /api/assets/<sha256>.<ext>."""
    names = library.referenced_media(*templates, *(library.component(cid) for cid in component_ids))
    if not names:
        return
    files = library.media_files()
    for name in sorted(names):
        path = files.get(name)
        if path is None:
            warnings.append(f'Bundled media {name} is not in the library.')
            continue
        stored = ingest(path.read_bytes(), 'application/octet-stream', path.name)
        own_asset(studio, stored['id'])


async def _preamble(site: dict, templates: list[dict], root: str, update: bool, warnings: list[str]) -> list[dict]:
    commands = []
    ids = sorted({cid for t in templates for cid in t.get('components') or []})
    _media(templates, ids, warnings)
    group = await _components(site, ids, update, warnings) if ids else None
    if group is not None:
        commands.append({'command': 'extension.set', 'params': {'group': 'code', 'value': group}})
    for preset_id in sorted({t['preset'] for t in templates if t.get('preset')}):
        data = library.preset(preset_id)
        empty = not ((site.get('nodes') or {}).get(root) or {}).get('children')
        fresh = 'all' if empty and len(site.get('pages') or []) == 1 else 'missing'
        commands += library.preset_commands(site, data, _fonts(site, data, fresh), fresh)
        commands += library.page_commands(site, data, root, 'all' if empty else 'missing')
    registered = library.properties_command(site, *templates)
    if registered:
        commands.append(registered)
    for template in templates:
        shared = library.shared_variables(site, template)
        if shared:
            warnings.append(f'This site already has the variables {", ".join(shared)}; every copy of {template.get("name")} on the site shares them.')
    return commands


@router.get('/api/library')
async def library_index():
    studio.access.authorize('read')
    return library.index()


@router.get('/api/library/thumbs/{section_id}.webp')
async def library_thumb(section_id: str):
    studio.access.authorize('read')
    library.section(section_id)
    path = library.LIBRARY / 'sections' / 'thumbs' / f'{section_id}.webp'
    if not path.is_file():
        raise EngineError('Thumbnail not found.', 404)
    return FileResponse(path, media_type='image/webp', headers={'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'})


@router.get('/api/library/components/{component_id}/poster.webp')
async def library_poster(component_id: str):
    studio.access.authorize('read')
    manifest = library.component(component_id)
    path = library.LIBRARY / 'components' / component_id / (manifest.get('poster') or 'poster.webp')
    if not path.is_file():
        raise EngineError('Poster not found.', 404)
    return FileResponse(path, media_type='image/webp' if path.suffix == '.webp' else 'image/png', headers={'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'})


@router.get('/api/library/components/{component_id}/poster-light.webp')
async def library_poster_light(component_id: str):
    studio.access.authorize('read')
    manifest = library.component(component_id)
    path = library.LIBRARY / 'components' / component_id / (manifest.get('posterLight') or 'poster-light.webp')
    if not path.is_file():
        raise EngineError('Light poster not found.', 404)
    return FileResponse(path, media_type='image/webp' if path.suffix == '.webp' else 'image/png', headers={'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'})


@router.post('/api/library/sections/{section_id}/insert')
async def library_insert(section_id: str, request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    template = library.section(section_id)
    site, revision = await _current()
    page = _page(site, body.get('page'))
    parent = body.get('parent') or page['root']
    if parent not in site['nodes']:
        raise EngineError('Parent node not found.', 404)
    warnings: list[str] = []
    commands = await _preamble(site, [template], page['root'], bool(body.get('updateComponents')), warnings)
    made, root, behaviors = library.expand(template, parent, body.get('values') or {}, demote=library.has_h1(site.get('nodes') or {}, page['root']))
    commands += made
    index = body.get('index')
    if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(site['nodes'][parent].get('children') or []):
        commands.append({'command': 'node.move', 'params': {'id': root, 'parent': parent, 'index': index}})
    merged = library.behaviors_command(site, behaviors)
    if merged:
        commands.append(merged)
    result = await studio.mutate('batch', {'commands': commands, 'expectedRevision': revision})
    studio.access.record('library.insert', {'section': section_id, 'root': root})
    return {**(result if isinstance(result, dict) else {}), 'root': root, 'warnings': warnings}


@router.post('/api/library/presets/{preset_id}/apply')
async def library_apply_preset(preset_id: str, request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    mode = body.get('mode', 'all')
    if mode not in ('all', 'missing'):
        raise EngineError('Mode must be all or missing.')
    data = library.preset(preset_id)
    site, revision = await _current()
    root = _page(site, body.get('page'))['root']
    commands = library.preset_commands(site, data, _fonts(site, data, mode), mode) + library.page_commands(site, data, root, mode)
    if not commands:
        return {'changed': False}
    result = await studio.mutate('batch', {'commands': commands, 'expectedRevision': revision})
    studio.access.record('library.preset', {'preset': preset_id, 'mode': mode})
    return {**(result if isinstance(result, dict) else {}), 'changed': True}


@router.post('/api/library/starters/{starter_id}/apply')
async def library_apply_starter(starter_id: str, request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    data = library.starter(starter_id)
    site, revision = await _current()
    values = body.get('values') or {}
    pages = data.get('pages') or []
    templates = {sid: library.section(sid) for page in pages for sid in page.get('sections') or []}
    first = (site.get('pages') or [None])[0]
    reuse = first is not None and len(site['pages']) == 1 and not site['nodes'][first['root']].get('children')
    warnings: list[str] = []
    commands = await _preamble(site, list(templates.values()), first['root'] if first else 'root', bool(body.get('updateComponents')), warnings)
    taken = {p['slug'].strip('/') for p in site.get('pages') or []}
    ids = {p['id'] for p in site.get('pages') or []}
    behaviors, made_pages = [], []
    for n, page in enumerate(pages):
        if n == 0 and reuse:
            page_id, root = first['id'], first['root']
        else:
            base = page.get('slug', '/').strip('/') or 'home'
            slug, k = base, 2
            while slug in taken:
                slug, k = f'{base}-{k}', k + 1
            taken.add(slug)
            stem = re.sub(r'[^A-Za-z0-9_-]', '-', base)[:60] or 'page'
            page_id, k = f'page-{stem}', 2
            while page_id in ids:
                page_id, k = f'page-{stem}-{k}', k + 1
            ids.add(page_id)
            root = f'{page_id}-root'
            commands.append({'command': 'page.add', 'params': {'name': page.get('name') or slug, 'slug': '/' + slug, 'id': page_id, 'root': root}})
            for preset_id in sorted({t['preset'] for t in templates.values() if t.get('preset')}):
                commands += library.page_commands(site, library.preset(preset_id), root, 'all')
        made_pages.append(page_id)
        if isinstance(page.get('description'), str) and page['description'].strip():
            commands.append({'command': 'page.update', 'params': {'id': page_id, 'patch': {'seo': {'description': page['description'].strip()}}}})
        headline = False
        for sid in page.get('sections') or []:
            template = templates[sid]
            own = {k: v for k, v in values.items() if k in (template.get('fields') or {})}
            made, _, extra = library.expand(template, root, own, demote=headline)
            headline = headline or library.has_h1({}, template['tree'])
            commands += made
            behaviors.append(extra)
    merged = library.behaviors_command(site, *behaviors)
    if merged:
        commands.append(merged)
    result = await studio.mutate('batch', {'commands': commands, 'expectedRevision': revision})
    studio.access.record('library.starter', {'starter': starter_id, 'pages': made_pages})
    return {**(result if isinstance(result, dict) else {}), 'pages': made_pages, 'warnings': warnings}


def kit_script(script: str) -> tuple[str, bool]:
    shim = []
    for found in KIT_IMPORT.finditer(script):
        for name in (n.strip().split(' as ')[0].strip() for n in found.group(1).split(',')):
            if name in SHIM and SHIM[name] not in shim:
                shim.append(SHIM[name])
            elif name and name not in SHIM:
                raise EngineError(f'The kit helper {name} has no FormWeb equivalent; only reduced, onTheme and token are provided.')
    script = KIT_IMPORT.sub('', script)
    if ANY_IMPORT.search(script):
        raise EngineError('Code sections cannot bring in other modules; only the formai kit helpers are replaced.')
    return (('\n'.join(shim) + '\n' + script).strip() if shim else script.strip()), bool(shim)


def _between(html: str, tag: str) -> str | None:
    opened = re.search(rf'<{tag}\b[^>]*>', html, re.I)
    if not opened:
        return None
    closed = html.lower().rfind(f'</{tag}>')
    return html[opened.end():closed] if closed > opened.end() else None


@router.post('/api/library/import-html')
async def library_import_html(request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    document = body.get('html')
    if not isinstance(document, str) or not document.strip():
        raise EngineError('Send the page as {"html": "..."}.')
    extra_css = body.get('css') or ''
    if not isinstance(extra_css, str):
        raise EngineError('css must be text.')
    styles = [m.group(1) for m in re.finditer(r'<style\b[^>]*>(.*?)</style>', document, re.I | re.S)]
    kinds = [(m, site_import.script_type('<script' + m.group(1) + '>')) for m in re.finditer(r'<script\b([^>]*)>(.*?)</script>', document, re.I | re.S)]
    foreign = [kind for _, kind in kinds if kind is not None]
    scripts = [m.group(2) for m, kind in kinds if kind is None and 'src=' not in m.group(1).lower() and m.group(2).strip()]
    module = any('type="module"' in m.group(1).lower() or "type='module'" in m.group(1).lower() for m in re.finditer(r'<script\b([^>]*)>(.*?)</script>', document, re.I | re.S) if m.group(2).strip())
    # The whole body, chrome included: page scripts often measure the header (the kit's filmstrip reads .bar).
    markup = _between(document, 'body') or document
    markup = re.sub(r'<script\b[^>]*>.*?</script>', '', markup, flags=re.I | re.S).strip()
    script, shim = kit_script(scripts[0] if scripts else '')
    css = (extra_css + '\n' + '\n'.join(styles)).strip()
    if len(markup.encode()) > HTML_CAP or len(css.encode()) > CSS_CAP or len(script.encode()) > JS_CAP:
        raise EngineError('The page is larger than a code section holds (512 KiB markup, 256 KiB styles, 512 KiB script).', 413)
    site, revision = await _current()
    page = _page(site, body.get('page'))
    parent = body.get('parent') or page['root']
    if parent not in site['nodes']:
        raise EngineError('Parent node not found.', 404)
    name = str(body.get('name') or (re.search(r'<title>(.*?)</title>', document, re.I | re.S).group(1).strip() if re.search(r'<title>(.*?)</title>', document, re.I | re.S) else 'Imported section'))[:120]
    host = 'imported-' + secrets.token_hex(4)
    commands = [{'command': 'node.add', 'params': {'parent': parent, 'node': {'id': host, 'tag': 'section', 'name': name, 'text': '', 'children': [], 'attrs': {}, 'styles': {'position': 'relative'}, 'breakpoints': {}}}}]
    index = body.get('index')
    if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(site['nodes'][parent].get('children') or []):
        commands.append({'command': 'node.move', 'params': {'id': host, 'parent': parent, 'index': index}})
    if (((site.get('extensions') or {}).get('code') or {}).get('allowSections')) is not True:
        commands.append({'command': 'code.sections.allow', 'params': {'enabled': True}})
    commands.append({'command': 'code.section.set', 'params': {'node': host, 'value': {'enabled': True, 'html': markup, 'css': css, 'js': script, 'module': module}}})
    result = await studio.mutate('batch', {'commands': commands, 'expectedRevision': revision})
    studio.access.record('library.import-html', {'node': host, 'bytes': len(document)})
    warnings = [] if shim or not module else ['The script ran as a module with no kit helpers.']
    outside, more = await asyncio.to_thread(site_import.outside_of, document)
    return {**(result if isinstance(result, dict) else {}), 'root': host, 'warnings': warnings + ([site_import.left_out_scripts(foreign)] if foreign else []),
            'outside': outside, 'outsideMore': more}


async def _archive(request: Request) -> bytes | dict | list:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_SITE_ARCHIVE_BYTES:
            raise EngineError('The upload is larger than 64 MiB, the most a site import takes. Zip only the folder that holds the finished site, leaving out large videos and files it does not use. Nothing was imported.', 413)
    if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
        return bytes(body)
    return site_import.loose(bytes(body))


def _read(data) -> dict:
    return site_import.read_archive(data) if isinstance(data, (bytes, bytearray)) else site_import.read_files(data)


async def review_site(data) -> dict:
    archive = await asyncio.to_thread(_read, data)
    site, revision = await _current()
    result = await asyncio.to_thread(site_import.plan, archive, site, kit_script)
    return {**site_import.review(result), 'revision': revision}


async def import_site(data, mode: str, revision: int | None, outside: str | None = None) -> dict:
    if mode not in ('new', 'replace'):
        raise EngineError('Mode must be new or replace.')
    archive = await asyncio.to_thread(_read, data)
    site, current = await _current()
    if revision is not None and revision != current:
        raise EngineError('The site changed after the review. Review the archive again before importing.', 409)
    fetched = outside_fetch.kept(outside) if outside else None
    result = await asyncio.to_thread(site_import.plan, archive, site, kit_script, fetched)
    commands, pages = await asyncio.to_thread(site_import.commands, result, site, mode, archive, kit_script, fetched)
    assets = site_import.store_assets(result, archive, studio)
    fonts = site_import.store_fonts(result, fetched or {}, studio)
    outcome = await studio.mutate('batch', {'commands': commands, 'expectedRevision': current})
    studio.access.record('library.import-site', {'pages': pages, 'assets': assets, 'mode': mode, 'bytes': len(data) if isinstance(data, (bytes, bytearray)) else sum(len(body) for _, body in archive['files'].values())})
    skipped = result['skipped']
    warnings = [f'{page["name"]}: {warning}' for page in result['pages'] for warning in page['warnings']]
    answer = {**(outcome if isinstance(outcome, dict) else {}), 'pages': pages, 'assets': assets, 'skipped': skipped, 'warnings': warnings,
              'message': site_import.summary(len(pages), assets, len(skipped))}
    if outside:
        files, seen = [], set()
        for page in result['pages']:
            for item in [*page.get('brought', []), *({'kind': 'font', 'host': fetched[url]['host'], 'url': url, 'bytes': len(fetched[url]['body'])} for url in page.get('fontsUsed', []))]:
                if item['url'] not in seen:
                    seen.add(item['url'])
                    files.append(item)
        if fetched is None:
            warnings.append('The files from the web ticked in the review were forgotten (more than 20 minutes passed or FormWeb restarted), so nothing from the web came along. Tick them again in a new review.')
        unused = [url for url in (fetched or {}) if url not in seen]
        if unused:
            warnings.append(f'{len(unused)} downloaded file{"s" if len(unused) != 1 else ""} {"was" if len(unused) == 1 else "were"} not used by any imported page: {", ".join(u[:120] for u in unused[:5])}{"..." if len(unused) > 5 else ""}.')
        answer['outside'] = {'files': files, 'fonts': fonts, 'pages': [page['file'] for page in result['pages'] if page.get('brought') or page.get('fontsUsed')]}
    return answer


@router.post('/api/library/outside/fetch')
async def library_outside_fetch(request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    return await asyncio.to_thread(outside_fetch.fetch, body.get('url'), body.get('kind'), body.get('token'))


@router.post('/api/library/outside/drop')
async def library_outside_drop(request: Request):
    studio.access.authorize('edit')
    body = await _body(request)
    return outside_fetch.drop(body.get('token'), body.get('url'))


@router.post('/api/library/import-site/review')
async def library_review_site(request: Request):
    studio.access.authorize('edit')
    return await review_site(await _archive(request))


@router.post('/api/library/import-site')
async def library_import_site(request: Request, mode: str = 'new', revision: int | None = None, outside: str | None = None):
    studio.access.authorize('edit')
    return await import_site(await _archive(request), mode, revision, outside)
