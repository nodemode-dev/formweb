import base64
import hashlib
import json
import re
from pathlib import Path, PurePosixPath

from .config import DATA_DIR
from .engine import EngineError

ASSET_NAME = re.compile(r'^[0-9a-f]{64}\.(png|jpg|gif|webp|svg)$')
ASSET_REF = re.compile(r'/api/assets/([0-9a-f]{64}\.(?:png|jpg|gif|webp|svg))')
MIME_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'}
# FW-073: SVG assets come only from the bundled icon set (and .fweb files carrying them), never from uploads, and are
# rebuilt from this allowlist so no script, link, style sheet or external reference can survive.
SVG_TAGS = {'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
            'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'symbol', 'use'}
SVG_ATTRS = {'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry',
             'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
             'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'clip-rule', 'vector-effect', 'preserveAspectRatio',
             'id', 'fx', 'fy', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod',
             'clipPathUnits', 'maskUnits', 'maskContentUnits', 'clip-path', 'mask', 'paint-order', 'dy', 'href'}
SVG_DEFINITIONS = {'linearGradient', 'radialGradient', 'clipPath', 'mask', 'symbol'}
SVG_REFERENCES = {'fill', 'stroke', 'clip-path', 'mask'}
SVG_REF = re.compile(r'^url\(#([A-Za-z0-9_-]{1,64})\)$')  # only a fragment inside the same document, never a link
VECTOR_MODEL = 'data-fw-vector'  # editable anchor model written by the vector editor; JSON only, checked structurally below
VECTOR_MODEL_LIMIT = 262144
SVG_VALUE = re.compile(r'^[A-Za-z0-9 .,#%()+\-/]*$')  # no colon: no scheme (javascript:, data:) can appear in any value


def asset_path(name: str):
    if not ASSET_NAME.fullmatch(name):
        raise EngineError('Asset not found.', 404)
    target = DATA_DIR / 'assets' / name
    if not target.is_file():
        raise EngineError('Asset not found.', 404)
    return target


def svg_value_ok(name: str, value: str, defined: set) -> bool:
    if not SVG_VALUE.fullmatch(value):
        return False
    if name == 'href':
        return bool(re.fullmatch(r'#[A-Za-z0-9_-]{1,64}', value)) and value[1:] in defined
    if 'url' not in value.lower():
        return True
    match = SVG_REF.fullmatch(value)
    return bool(match) and name in SVG_REFERENCES and match.group(1) in defined


def svg_definitions(root) -> set:
    return {node.attrib['id'] for node in root.iter()
            if isinstance(node.tag, str) and node.tag.split('}', 1)[-1] in SVG_DEFINITIONS and re.fullmatch(r'[A-Za-z0-9_-]{1,64}', node.attrib.get('id', ''))}


def vector_model_ok(value: str) -> bool:
    if len(value) > VECTOR_MODEL_LIMIT:
        return False
    try:
        model = json.loads(value)
    except ValueError:
        return False
    return isinstance(model, dict) and model.get('v') == 1 and isinstance(model.get('subs'), list)


def sanitize_svg(data: bytes) -> bytes:
    """Lenient import path for user SVG: drop what the vector element cannot hold, then run the strict cleaner over the result."""
    import xml.etree.ElementTree as ET

    if len(data) > 1024 * 1024:
        raise EngineError('SVG is too large.', 413)
    text = data.decode('utf-8', 'strict').strip()
    if re.search(r'<!(?!--)', text) or re.search(r'<\?(?!xml\s)', text):
        raise EngineError('SVG may not contain a DOCTYPE or entities.', 415)
    try:
        root = ET.fromstring(re.sub(r'<!--.*?-->', '', text, flags=re.S))
    except ET.ParseError as error:
        raise EngineError('SVG is not well formed.', 415) from error
    from html import escape as quote

    defined = svg_definitions(root)

    def declarations(node) -> dict:
        found = {}
        for part in node.attrib.get('style', '').split(';'):
            if ':' in part:
                name, value = part.split(':', 1)
                found[name.strip()] = value.strip()
        return found

    def build(node) -> str:
        tag = node.tag.split('}', 1)[-1] if isinstance(node.tag, str) else ''
        if tag not in SVG_TAGS:
            return ''
        merged = {key.split('}', 1)[-1]: value for key, value in node.attrib.items()}
        for name, value in declarations(node).items():
            merged.setdefault(name, value)
        attrs = []
        for name, value in merged.items():
            if name == VECTOR_MODEL:
                if vector_model_ok(value):
                    attrs.append(f' {name}="{quote(value, quote=True)}"')
                continue
            if name in SVG_ATTRS and name != 'xmlns' and svg_value_ok(name, value, defined):
                attrs.append(f' {name}="{quote(value, quote=True)}"')
        children = ''.join(build(child) for child in node)
        return f'<{tag}{"".join(attrs)}>{children}</{tag}>'

    if root.tag.split('}', 1)[-1] != 'svg':
        raise EngineError('Not an SVG document.', 415)
    return build(root).encode('utf-8')


def import_vector_svg(data: bytes) -> str:
    """User SVG for the vector editor: sanitized, then accepted only if the strict cleaner agrees."""
    return clean_svg(sanitize_svg(data)).decode('utf-8')


def clean_svg(data: bytes) -> bytes:
    """Rebuild an SVG from the allowlist; anything else is refused rather than stripped."""
    import xml.etree.ElementTree as ET

    if len(data) > 256 * 1024:
        raise EngineError('SVG is too large.', 413)
    text = data.decode('utf-8', 'strict').strip()
    if '<!' in text or re.search(r'<\?(?!xml\s)', text):
        raise EngineError('SVG may not contain a DOCTYPE, entities, comments or processing instructions.', 415)
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise EngineError('SVG is not well formed.', 415) from error
    from html import escape as quote

    defined = svg_definitions(root)

    def build(node) -> str:
        tag = node.tag.split('}', 1)[-1]
        if tag not in SVG_TAGS:
            raise EngineError(f'SVG element <{tag}> is not allowed.', 415)
        if (node.text or '').strip() or (node.tail or '').strip():
            raise EngineError('SVG text content is not allowed.', 415)
        attrs = []
        for key, value in node.attrib.items():
            name = key.split('}', 1)[-1]
            if name == VECTOR_MODEL:
                if not vector_model_ok(value):
                    raise EngineError('SVG vector model is not valid.', 415)
                attrs.append(f' {name}="{quote(value, quote=True)}"')
                continue
            if name not in SVG_ATTRS or not svg_value_ok(name, value, defined):
                raise EngineError(f'SVG attribute {name} is not allowed.', 415)
            if name != 'xmlns':
                attrs.append(f' {name}="{quote(value, quote=True)}"')
        if tag == 'svg':
            attrs.insert(0, ' xmlns="http://www.w3.org/2000/svg"')
        children = ''.join(build(child) for child in node)
        return f'<{tag}{"".join(attrs)}>{children}</{tag}>' if children else f'<{tag}{"".join(attrs)}/>'

    if root.tag.split('}', 1)[-1] != 'svg':
        raise EngineError('Not an SVG document.', 415)
    return build(root).encode('utf-8')


def write_metadata(name: str, mime: str, size: int, filename: str | None, license: dict | None = None) -> dict:
    metadata = {'id': name, 'url': '/api/assets/' + name, 'mime': mime, 'size': size, 'name': (filename or name).replace('\x00', '')[:160]}
    existing = DATA_DIR / 'assets' / (name + '.json')
    if not license and existing.is_file():  # the same bytes uploaded again keep the credit they arrived with
        license = json.loads(existing.read_text(encoding='utf-8')).get('license')
    if license:
        metadata['license'] = {key: str(value)[:500] for key, value in license.items() if value not in (None, '') and key in LICENSE_KEYS}
    (DATA_DIR / 'assets' / (name + '.json')).write_text(json.dumps(metadata), encoding='utf-8')
    return metadata


LICENSE_KEYS = ('source', 'title', 'creator', 'copyright', 'license', 'licenseUrl', 'usage', 'sourceUrl', 'attribution',
                'prompt', 'generator', 'created', 'editedIn')  # FW-071 provenance for generated and formvis-edited pictures


def ingest_svg(data: bytes, filename: str | None, license: dict | None = None) -> dict:
    clean = clean_svg(data)
    name = hashlib.sha256(clean).hexdigest() + '.svg'
    folder = DATA_DIR / 'assets'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    if not target.exists():
        target.write_bytes(clean)
    return write_metadata(name, 'image/svg+xml', len(clean), filename, license)


def ingest(data: bytes, declared_type: str, filename: str | None, license: dict | None = None):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        extension = 'png'
    elif data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9'):
        extension = 'jpg'
    elif data.startswith((b'GIF87a', b'GIF89a')):
        extension = 'gif'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        extension = 'webp'
    else:
        raise EngineError('Upload a PNG, JPEG, GIF or WebP raster image.', 415)
    mime = MIME_TYPES[extension]
    if declared_type not in (mime, 'application/octet-stream'):
        raise EngineError('Image content does not match its declared media type.', 415)
    if len(data) < 20:
        raise EngineError('Image is truncated.')
    name = hashlib.sha256(data).hexdigest() + '.' + extension
    folder = DATA_DIR / 'assets'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    if not target.exists():
        target.write_bytes(data)
    return write_metadata(name, mime, len(data), filename, license)


def list_assets():
    folder = DATA_DIR / 'assets'
    if not folder.exists():
        return {'assets': []}
    return {'assets': [json.loads(path.read_text(encoding='utf-8')) for path in sorted(folder.glob('*.json'))]}


def bundle_assets(result: dict):
    names = set()
    files = []
    original_files = {item['path']: item for item in result['files']}
    access_file = original_files.get('asset-access.json')
    access = json.loads(access_file['content']) if access_file else {'schemaVersion': 1, 'assets': {}}
    ownership = access.setdefault('assets', {})
    route_file = original_files.get('routes.json')
    route_manifest = json.loads(route_file['content']) if route_file else []
    routes = route_manifest.get('routes', []) if isinstance(route_manifest, dict) else route_manifest
    file_pages = {}
    for route in routes:
        for path in (route.get('path'), route.get('stylesheet')):
            if path and route.get('page'):
                file_pages.setdefault(path, set()).add(route['page'])
    for path, pages in ownership.items():
        file_pages.setdefault(path, set()).update(pages)
    for original in result['files']:
        if original['path'] == 'asset-access.json':
            continue
        file = dict(original)
        prefix = '../' * (len(PurePosixPath(file['path']).parts) - 1)
        for name in ASSET_REF.findall(file['content']):
            names.add(name)
            path = 'assets/' + name
            owners = set(ownership.get(path, [])) | file_pages.get(file['path'], set())
            ownership[path] = sorted(owners)
            file['content'] = file['content'].replace('/api/assets/' + name, prefix + path)
        files.append(file)
    credits = []
    for name in sorted(names):
        path = asset_path(name)
        files.append({'path': 'assets/' + name, 'content': base64.b64encode(path.read_bytes()).decode(), 'encoding': 'base64'})
        metadata_path = path.with_name(name + '.json')
        licence = (json.loads(metadata_path.read_text(encoding='utf-8')) if metadata_path.is_file() else {}).get('license')
        if licence:
            credits.append((name, licence))
    if credits:  # FW-073: every bundled stock asset is credited, and bundled icons carry their licence text
        lines = ['Credits for images in this site', '']
        for name, licence in credits:
            lines.append(f'assets/{name}')
            lines.extend(f'  {key}: {licence[key]}' for key in LICENSE_KEYS if licence.get(key))
            lines.append('')
        if any(licence.get('source') == 'Lucide' for _, licence in credits):
            notice = Path(__file__).resolve().parent / 'stock' / 'LICENSE-lucide.txt'
            lines.extend(['Lucide icons licence', '', notice.read_text(encoding='utf-8')])
        files.append({'path': 'CREDITS.txt', 'content': '\n'.join(lines)})
    files.append({'path': 'asset-access.json', 'content': json.dumps(access, sort_keys=True)})
    return {**result, 'files': files}


def file_bytes(file: dict):
    return base64.b64decode(file['content'], validate=True) if file.get('encoding') == 'base64' else file['content'].encode('utf-8')


def project_envelope(site: dict, checkpoint: dict | None = None):
    assets = []
    references = {'site': site, 'checkpoint': checkpoint} if checkpoint else site
    for name in sorted(set(ASSET_REF.findall(json.dumps(references)))):
        path = asset_path(name)
        metadata_path = path.with_name(name + '.json')
        metadata = json.loads(metadata_path.read_text()) if metadata_path.is_file() else {}
        entry = {'id': name, 'mime': MIME_TYPES[path.suffix[1:]], 'name': metadata.get('name', name), 'encoding': 'base64', 'content': base64.b64encode(path.read_bytes()).decode()}
        if metadata.get('license'):
            entry['license'] = metadata['license']
        assets.append(entry)
    envelope = {'format': 'com.nodemode.formweb', 'version': 1, 'site': site, 'assets': assets}
    if checkpoint is not None:
        envelope['checkpoint'] = checkpoint
    if len(json.dumps(envelope, ensure_ascii=False, indent=2).encode()) > 64 * 1024 * 1024:
        raise EngineError('The native file exceeds 64 MiB. Reduce image sizes or history before downloading.', 413)
    return envelope


def restore_project_assets(envelope: dict):
    items = envelope.get('assets', [])
    if not isinstance(items, list) or len(items) > 500:
        raise EngineError('Native project assets must be a list containing at most 500 images.')
    pending = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not ASSET_NAME.fullmatch(item['id']) or item.get('encoding') != 'base64' or not isinstance(item.get('content'), str) or ('name' in item and not isinstance(item['name'], str)):
            raise EngineError('Native project image entry is invalid.')
        if len(item['content']) > 12 * 1024 * 1024:
            raise EngineError('Native project image exceeds 8 MiB.', 413)
        try:
            data = base64.b64decode(item['content'], validate=True)
        except (ValueError, TypeError) as error:
            raise EngineError('Native project image is not valid base64.') from error
        if len(data) > 8 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != item['id'].split('.')[0]:
            raise EngineError('Native project image digest or size is invalid.')
        if item.get('mime') != MIME_TYPES[item['id'].split('.')[-1]]:
            raise EngineError('Native project image type is invalid.')
        pending.append((item, data))
    for item, data in pending:
        licence = item.get('license') if isinstance(item.get('license'), dict) else None
        stored = ingest_svg(data, item.get('name'), licence) if item['id'].endswith('.svg') else ingest(data, item['mime'], item.get('name'), licence)
        if stored['id'] != item['id']:
            raise EngineError('Native project image extension does not match its content.')


def asset_ownership(studio):
    studio.store.db.execute('CREATE TABLE IF NOT EXISTS asset_owners (asset_id TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(asset_id,project_id))')
    studio.store.db.commit()


def own_asset(studio, asset_id):
    asset_ownership(studio)
    studio.store.db.execute('INSERT OR IGNORE INTO asset_owners VALUES(?,?)', (asset_id, studio.access.project_key()))
    studio.store.db.commit()


def visible_assets(studio):
    studio.access.authorize('read')
    asset_ownership(studio)
    if studio.access.role() == 'owner' and studio.access.status()['identity']['root']:
        return {item['id'] for item in list_assets()['assets']}
    names = set(ASSET_REF.findall(json.dumps(studio.engine.cached_checkpoint or studio.engine.cached_state)))
    for row in studio.store.db.execute('SELECT asset_id,project_id FROM asset_owners'):
        if studio.access.role(row['project_id']):
            names.add(row['asset_id'])
    if getattr(studio, 'team_libraries', None):  # FW-075: graphics in a team library shared with this identity
        names |= studio.team_libraries.visible_asset_ids()
    return names
