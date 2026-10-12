"""Stock library (FW-073): bundled open-licence icons and photos from a configurable source, each saved with its credit.

Icons are the Lucide set (ISC, with the Feather-derived icons MIT), bundled as drawing nodes in stock/lucide.json by
setup/stock_icons.py. An inserted icon becomes a sanitized SVG asset drawn in the chosen colour, stroke and size.

Photos come from a provider. The first is formlit, the family's photo library, on the same computer
(FORMWEB_FORMLIT_URL, default http://127.0.0.1:8390). FormWeb searches its catalog, proxies thumbnails so the browser
never talks to formlit, and on insert saves formlit's developed preview as an asset. formlit's IPTC rights (creator,
copyright, status, usage terms, rights URL) are recorded with the asset, and its title and alt text are offered for the
element. Every exported site lists these credits in CREDITS.txt.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from html import escape
from pathlib import Path

from .assets import ingest, ingest_svg, own_asset
from .engine import EngineError

ICONS = Path(__file__).resolve().parent / 'stock' / 'lucide.json'
FORMLIT_URL = os.getenv('FORMWEB_FORMLIT_URL', 'http://127.0.0.1:8390').rstrip('/')
FORMLIT_HINT = 'Start formlit on this computer (in the formlit folder: ./formlit backend), or set FORMWEB_FORMLIT_URL to where it runs.'


@lru_cache(maxsize=1)
def bundle() -> dict:
    return json.loads(ICONS.read_text(encoding='utf-8'))


def icon_licence(name: str, item: dict) -> dict:
    data = bundle()
    mit = item['l'] == 'MIT'
    return {'source': 'Lucide', 'title': f'{name} icon', 'creator': 'Lucide Icons and Contributors' + (' (derived from Feather by Cole Bemis)' if mit else ''),
            'license': 'MIT' if mit else 'ISC', 'licenseUrl': 'https://lucide.dev/license', 'sourceUrl': f'https://lucide.dev/icons/{name}',
            'attribution': f'Lucide {data["version"]}, {"MIT" if mit else "ISC"} licence'}


def search_icons(query: str = '', limit: int = 120) -> dict:
    words = [word for word in query.lower().replace('-', ' ').split() if word]
    icons = bundle()['icons']
    scored = []
    for name, item in icons.items():
        if not words:
            scored.append((1, name))
            continue
        haystack = name.replace('-', ' ')
        tags = ' '.join(item['t']).lower()
        if all(word in haystack or word in tags for word in words):
            exact = haystack == ' '.join(words)
            scored.append((0 if exact else 1 if all(word in haystack.split() for word in words) else 2 if all(word in haystack for word in words) else 3, len(name), name))
    scored.sort()
    scored = [(rank, name) for rank, _, name in scored] if words else scored
    limit = max(1, min(int(limit), 400))
    return {'total': len(scored), 'icons': [{'name': name, 'tags': icons[name]['t'][:8], 'nodes': icons[name]['n'], 'license': icons[name]['l']} for _, name in scored[:limit]],
            'source': {'name': 'Lucide', 'version': bundle()['version'], 'count': len(icons), 'license': 'ISC (Feather-derived icons MIT)', 'licenseUrl': 'https://lucide.dev/license'}}


def icon_svg(name: str, color: str = '#111111', stroke: float = 2, size: int = 96) -> bytes:
    item = bundle()['icons'].get(name)
    if not item:
        raise EngineError(f'No icon named {name}. Search the stock library for icon names.', 404)
    if not (isinstance(color, str) and len(color) in (4, 7) and color.startswith('#') and all(c in '0123456789abcdefABCDEF' for c in color[1:])):
        raise EngineError('Icon colour must be a hex colour such as #1d3557.')
    if not 0.5 <= float(stroke) <= 4 or not 8 <= int(size) <= 1024:
        raise EngineError('Stroke must be 0.5 to 4 and size 8 to 1024 pixels.')
    def shape(tag: str, attrs: dict) -> str:
        pairs = ''.join(' {}="{}"'.format(key, escape(str(value), quote=True)) for key, value in attrs.items() if key != 'key')
        return f'<{tag}{pairs}/>'
    shapes = ''.join(shape(tag, attrs) for tag, attrs in item['n'])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(size)}" height="{int(size)}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{float(stroke):g}" stroke-linecap="round" stroke-linejoin="round">{shapes}</svg>').encode('utf-8')


def icon_asset(studio, name: str, color: str = '#111111', stroke: float = 2, size: int = 96) -> dict:
    studio.access.authorize('edit')
    item = bundle()['icons'].get(name) or {}
    stored = ingest_svg(icon_svg(name, color, stroke, size), f'{name}.svg', icon_licence(name, item))
    own_asset(studio, stored['id'])
    studio.access.record('stock.icon', {'name': name, 'asset': stored['id']})
    return {'asset': stored, 'alt': '', 'name': name.replace('-', ' ').capitalize() + ' icon', 'width': int(size), 'height': int(size),
            'note': 'Icons are decorative by default (empty alt); give the element alt text if the icon carries meaning.'}


# formlit -----------------------------------------------------------------------------------------------------------
def _formlit(path: str, body: dict | None = None, timeout: float = 6.0) -> tuple[bytes, dict]:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(FORMLIT_URL + path, data=data, headers={'Content-Type': 'application/json'} if data else {}, method='POST' if data else 'GET')
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read(), {key.lower(): value for key, value in response.headers.items()}
    except urllib.error.HTTPError as error:
        raise EngineError(f'formlit could not answer: {error.read().decode("utf-8", "replace")[:200]}', 404 if error.code == 404 else 502) from error
    except (urllib.error.URLError, OSError) as error:
        raise EngineError(f'formlit is not reachable at {FORMLIT_URL}. {FORMLIT_HINT}', 503) from error


def _command(command: str, params: dict) -> dict:
    body, _ = _formlit('/api/commands/' + urllib.parse.quote(command), params)
    payload = json.loads(body)
    if not payload.get('ok'):
        raise EngineError(f'formlit: {payload.get("error", "the command failed")}', 502)
    return payload['result']


def formlit_status() -> dict:
    try:
        body, _ = _formlit('/api/health', timeout=2.0)
        info = json.loads(body)
        return {'available': bool(info.get('ok')), 'url': FORMLIT_URL, 'version': info.get('version'), 'note': f'Photos from your formlit {info.get("version")} library on this computer.'}
    except (EngineError, ValueError) as error:
        return {'available': False, 'url': FORMLIT_URL, 'note': str(error) if isinstance(error, EngineError) else f'formlit at {FORMLIT_URL} did not answer as expected.'}


def credit(meta: dict) -> dict:
    return {'source': 'formlit', 'title': meta.get('title') or meta.get('headline') or '', 'creator': meta.get('creator') or '', 'copyright': meta.get('copyright') or '',
            'license': meta.get('copyrightStatus') or ('Copyrighted' if meta.get('copyright') else ''), 'usage': meta.get('rightsUsage') or '',
            'licenseUrl': meta.get('copyrightUrl') or '', 'attribution': meta.get('credit') or meta.get('creator') or ''}


def search_photos(studio, query: str = '', limit: int = 48) -> dict:
    studio.access.authorize('read')
    limit = max(1, min(int(limit), 200))
    result = _command('library.query', {'filter': {'text': query[:200]} if query.strip() else {}, 'sort': {'by': 'captureTime', 'desc': True}})
    photos = result.get('photos') or {}
    ids = [pid for pid in result.get('ids', []) if str(pid) in photos or pid in photos][:limit]
    items = []
    for pid in ids:
        summary = photos.get(str(pid)) or photos.get(pid) or {}
        if summary.get('kind') in ('video', 'other'):  # formlit kinds are formats (jpeg, raw, heic, tiff...); videos are not stills
            continue
        meta = _command('photo.get', {'id': int(pid)}).get('meta') or {}
        items.append({'id': int(pid), 'file': summary.get('file'), 'width': summary.get('w'), 'height': summary.get('h'), 'thumb': f'/api/stock/formlit/{int(pid)}/thumb',
                      'title': meta.get('title') or '', 'alt': meta.get('altText') or meta.get('caption') or '', 'credit': credit(meta)})
    return {'total': result.get('total', len(ids)), 'photos': items, 'source': formlit_status()}


def photo_thumb(studio, pid: int) -> bytes:
    studio.access.authorize('read')
    body, _ = _formlit(f'/api/photos/{int(pid)}/thumb', timeout=10.0)
    return body


def photo_asset(studio, pid: int) -> dict:
    studio.access.authorize('edit')
    detail = _command('photo.get', {'id': int(pid)})
    meta = detail.get('meta') or {}
    body, headers = _formlit(f'/api/photos/{int(pid)}/preview?wait=20', timeout=40.0)
    if not headers.get('content-type', '').startswith('image/jpeg'):
        raise EngineError('formlit is still building this photo\'s preview; try again in a moment.', 409)
    stored = ingest(body, 'image/jpeg', detail.get('fileName') or f'formlit-{pid}.jpg', credit(meta))
    own_asset(studio, stored['id'])
    studio.access.record('stock.photo', {'formlit': int(pid), 'asset': stored['id']})
    return {'asset': stored, 'alt': meta.get('altText') or meta.get('caption') or meta.get('title') or '', 'name': meta.get('title') or detail.get('fileName') or 'Photo',
            'width': detail.get('w'), 'height': detail.get('h'),
            'note': 'Credit saved with the image and listed in CREDITS.txt on export.' + (f' Usage terms: {meta["rightsUsage"]}' if meta.get('rightsUsage') else '')
                    + ('' if meta.get('altText') or meta.get('caption') or meta.get('title') else ' formlit has no alt text for this photo; add one that describes it.')}


async def insert(studio, source: str, item: str, parent: str | None = None, options: dict | None = None) -> dict:
    """For agents: make the asset and add an img element to `parent` (the current page root by default), one undo step."""
    options = options or {}
    if source == 'icons':
        made = icon_asset(studio, item, options.get('color', '#111111'), options.get('stroke', 2), options.get('size', 96))
    elif source == 'formlit':
        made = photo_asset(studio, int(item))
    else:
        raise EngineError('Source must be icons or formlit.')
    state = await studio.state()
    target = parent or state['site']['pages'][0]['root']
    if target not in state['site']['nodes']:
        raise EngineError('Unknown parent element. Read formweb://site/tree for element IDs.', 404)
    width, height = made.get('width') or 0, made.get('height') or 0
    styles = {'display': 'block', 'max-width': '100%', 'height': 'auto'}
    if source == 'icons':
        styles.update({'width': f'{width}px', 'height': f'{height}px'})
    node = {'tag': 'img', 'name': made['name'][:80], 'attrs': {'src': made['asset']['url'], 'alt': made['alt']}, 'styles': styles}
    if width and height:
        node['attrs'].update({'width': str(width), 'height': str(height)})
    result = await studio.mutate('exec', {'command': 'node.add', 'params': {'parent': target, 'node': node}})
    added = next((nid for nid in result['site']['nodes'][target]['children'][::-1]), None)
    return {**made, 'node': added, 'state': result}
