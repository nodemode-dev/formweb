import base64
import hashlib
import json
import logging
import os
import re
import stat
import tempfile
import time
import zipfile
import zlib
from pathlib import Path, PurePosixPath

from .config import DATA_DIR, MAX_FONT_BYTES, MAX_IMAGE_BYTES, MAX_PROJECT_ARCHIVE_BYTES, MAX_SVG_BYTES, MAX_VIDEO_BYTES
from .engine import EngineError

ASSET_NAME = re.compile(r'^[0-9a-f]{64}\.(png|jpg|gif|webp|svg|mp4|webm|woff2)$')
ASSET_REF = re.compile(r'/api/assets/([0-9a-f]{64}\.(?:png|jpg|gif|webp|svg|mp4|webm|woff2))')
ROOT_404_PREFIX = re.compile(r'<script src="(/[^"]*)assets/runtime\.js" defer>')
MIME_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
              'mp4': 'video/mp4', 'webm': 'video/webm', 'woff2': 'font/woff2'}
SIZE_LIMITS = {'mp4': MAX_VIDEO_BYTES, 'webm': MAX_VIDEO_BYTES, 'woff2': MAX_FONT_BYTES, 'svg': MAX_SVG_BYTES}
UPLOAD_SVG_BLOCKED_TAGS = {'script', 'foreignobject', 'iframe', 'embed', 'object'}
UPLOAD_SVG_MARKERS = re.compile(r'<!doctype|<!entity|<\?xml-stylesheet', re.I)
UPLOAD_SVG_URL = re.compile(r'url\((?!#)', re.I)
# FW-073: SVG assets come only from the bundled icon set (and .fweb files carrying them), never from uploads, and are
# rebuilt from this allowlist so no script, link, style sheet or external reference can survive.
SVG_TAGS = {'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
            'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'symbol', 'use', 'pattern', 'tspan'}
SVG_ATTRS = {'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry',
             'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity',
             'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'clip-rule', 'vector-effect', 'preserveAspectRatio',
             'id', 'fx', 'fy', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod',
             'clipPathUnits', 'maskUnits', 'maskContentUnits', 'clip-path', 'mask', 'paint-order', 'dy', 'dx', 'href', 'patternUnits', 'patternTransform'}
SVG_DEFINITIONS = {'linearGradient', 'radialGradient', 'clipPath', 'mask', 'symbol', 'pattern'}
SVG_REFERENCES = {'fill', 'stroke', 'clip-path', 'mask'}
SVG_REF = re.compile(r'^url\(#([A-Za-z0-9_-]{1,64})\)$')  # only a fragment inside the same document, never a link
VECTOR_MODEL = 'data-fw-vector'  # editable anchor model written by the vector editor; JSON only, checked structurally below
VECTOR_MODEL_LIMIT = 262144
VECTOR_GUIDES = 'data-fw-guides'  # ruler guides kept on the svg element by the vector editor; numbers only, at most 200
SVG_VALUE = re.compile(r'^[A-Za-z0-9 .,#%()+\-/]*$')  # no colon: no scheme (javascript:, data:) can appear in any value


STALE_TEMPORARY_SECONDS = 600
# Each temporary file the backend itself creates in the data folder: (folder, exact name pattern). A crash can leave these behind.
TEMPORARY_PATTERNS = (
    ('assets', re.compile(r'^\.stage-[A-Za-z0-9_]{8}\.part$')),
    ('tmp', re.compile(r'^project-[A-Za-z0-9_]{8}\.fweb$')),
    ('tmp', re.compile(r'^load-[A-Za-z0-9_]{8}\.fweb$')),
    ('projects', re.compile(r'^\.pending-[0-9a-f]{32}$')),
)


def sweep_stale_temporaries(now: float | None = None) -> int:
    """Remove regular files matching TEMPORARY_PATTERNS, each in its own folder, last changed more than 10 minutes ago; symlinks and directories are never touched or followed. Returns how many were removed."""
    moment = time.time() if now is None else now
    removed = 0
    for folder, pattern in TEMPORARY_PATTERNS:
        try:
            names = os.listdir(DATA_DIR / folder)
        except OSError:
            continue
        for name in names:
            if not pattern.fullmatch(name):
                continue
            path = DATA_DIR / folder / name
            try:
                info = path.lstat()
                if not stat.S_ISREG(info.st_mode) or moment - info.st_mtime <= STALE_TEMPORARY_SECONDS:
                    continue
                path.unlink()
                removed += 1
            except OSError:
                continue
    if removed:
        logging.getLogger('uvicorn.error').info('Removed %d stale temporary file%s from the data folder.', removed, '' if removed == 1 else 's')
    return removed


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


def vector_guides_ok(value: str) -> bool:
    if len(value) > VECTOR_MODEL_LIMIT:
        return False
    try:
        guides = json.loads(value)
    except ValueError:
        return False

    def number(v) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) <= 1e6

    def path(p) -> bool:
        return (isinstance(p, dict) and set(p) == {'c', 'n'} and p['c'] in (0, 1) and isinstance(p['n'], list) and 0 < len(p['n']) <= 500
                and all(isinstance(n, list) and len(n) == 6 and all(number(v) for v in n) for n in p['n']))

    return (isinstance(guides, dict) and set(guides) == {'v', 'locked', 'x', 'y', 'paths'} and guides['v'] == 1 and guides['locked'] in (0, 1)
            and isinstance(guides['x'], list) and isinstance(guides['y'], list) and isinstance(guides['paths'], list)
            and all(number(v) for v in guides['x'] + guides['y'])
            and len(guides['x']) + len(guides['y']) + len(guides['paths']) <= 200 and all(path(p) for p in guides['paths']))


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
            if name == VECTOR_GUIDES:
                if tag == 'svg' and vector_guides_ok(value):
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
            if name == VECTOR_GUIDES:
                if tag != 'svg' or not vector_guides_ok(value):
                    raise EngineError('SVG guides are not valid.', 415)
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


def check_upload_svg(data: bytes):
    import xml.etree.ElementTree as ET

    try:
        text = data.decode('utf-8-sig', 'strict')
    except UnicodeDecodeError as error:
        raise EngineError('SVG must be UTF-8 text.', 415) from error
    if UPLOAD_SVG_MARKERS.search(text):
        raise EngineError('SVG may not contain a DOCTYPE, entities or style sheet instructions.', 415)
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        raise EngineError('SVG is not well formed.', 415) from error
    if root.tag.split('}', 1)[-1].lower() != 'svg':
        raise EngineError('Not an SVG document.', 415)

    def unsafe(value: str) -> bool:
        lowered = value.lower()
        return 'javascript:' in lowered or '@import' in lowered or bool(UPLOAD_SVG_URL.search(value))

    for node in root.iter():
        if not isinstance(node.tag, str):
            continue
        tag = node.tag.split('}', 1)[-1].lower()
        if tag in UPLOAD_SVG_BLOCKED_TAGS:
            raise EngineError(f'SVG element <{tag}> is not allowed.', 415)
        if unsafe(node.text or '') or unsafe(node.tail or ''):
            raise EngineError('SVG contains a script URL, an import or an external reference.', 415)
        for key, value in node.attrib.items():
            name = key.split('}', 1)[-1].lower()
            if name.startswith('on'):
                raise EngineError(f'SVG attribute {name} is not allowed.', 415)
            if name == 'href' and not value.strip().startswith('#'):
                raise EngineError('SVG links may only point inside the document.', 415)
            if unsafe(value):
                raise EngineError('SVG contains a script URL, an import or an external reference.', 415)


def sniff_extension(data: bytes, declared_type: str) -> str:
    """The extension the magic bytes give; data may be the first bytes only for mp4, webm and woff2."""
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        extension = 'png'
    elif data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9'):
        extension = 'jpg'
    elif data.startswith((b'GIF87a', b'GIF89a')):
        extension = 'gif'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        extension = 'webp'
    elif data[4:8] == b'ftyp' and data[8:12] in (b'isom', b'iso2', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1', b'M4V ', b'dash', b'mmp4'):
        extension = 'mp4'
    elif data.startswith(b'\x1a\x45\xdf\xa3'):
        extension = 'webm'
    elif data.startswith(b'wOF2'):
        extension = 'woff2'
    elif declared_type == 'image/svg+xml' or data.lstrip(b'\xef\xbb\xbf \t\r\n').startswith((b'<svg', b'<?xml', b'<!')):
        extension = 'svg'
    else:
        raise EngineError('Upload a PNG, JPEG, GIF, WebP or SVG image, an MP4 or WebM video, or a WOFF2 font.', 415)
    return extension


def ingest(data: bytes, declared_type: str, filename: str | None, license: dict | None = None):
    extension = sniff_extension(data, declared_type)
    mime = MIME_TYPES[extension]
    if declared_type not in (mime, 'application/octet-stream'):
        raise EngineError('Asset content does not match its declared media type.', 415)
    if len(data) > SIZE_LIMITS.get(extension, MAX_IMAGE_BYTES):
        raise EngineError('Asset is too large.', 413)
    if extension == 'svg':
        check_upload_svg(data)
    if len(data) < 20:
        raise EngineError('Image is truncated.')
    name = hashlib.sha256(data).hexdigest() + '.' + extension
    folder = DATA_DIR / 'assets'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    if not target.exists():
        target.write_bytes(data)
    return write_metadata(name, mime, len(data), filename, license)


def check_declared(name: str, data: bytes) -> str:
    """Prove bytes belong to the asset id `name` with the upload checks and no store write; returns the mime type."""
    if not ASSET_NAME.fullmatch(name):
        raise EngineError('Asset id is not valid: ' + name[:80], 400)
    if hashlib.sha256(data).hexdigest() != name.split('.', 1)[0]:
        raise EngineError('Embedded bytes do not match the asset id ' + name + '.', 400)
    extension = sniff_extension(data, MIME_TYPES[name.rsplit('.', 1)[1]])
    if extension != name.rsplit('.', 1)[1]:
        raise EngineError('Embedded bytes do not match the type of ' + name + '.', 415)
    if len(data) > SIZE_LIMITS.get(extension, MAX_IMAGE_BYTES):
        raise EngineError('Embedded asset is too large: ' + name + '.', 413)
    if extension == 'svg':
        check_upload_svg(data)
    if len(data) < 20:
        raise EngineError('Embedded image is truncated: ' + name + '.', 400)
    return MIME_TYPES[extension]


def check_declared_file(name: str, staged: Path, size: int, digest: str) -> str:
    """check_declared for a staged file whose size and sha256 were counted while it was written; files up to MAX_IMAGE_BYTES are read whole, larger ones are judged from their first bytes."""
    if not ASSET_NAME.fullmatch(name):
        raise EngineError('Asset id is not valid: ' + name[:80], 400)
    if digest != name.split('.', 1)[0]:
        raise EngineError('Embedded bytes do not match the asset id ' + name + '.', 400)
    if size <= MAX_IMAGE_BYTES:
        return check_declared(name, staged.read_bytes())
    with staged.open('rb') as stream:
        head = stream.read(64)
    wanted = name.rsplit('.', 1)[1]
    extension = sniff_extension(head, MIME_TYPES[wanted])
    if extension != wanted:
        raise EngineError('Embedded bytes do not match the type of ' + name + '.', 415)
    if size > SIZE_LIMITS.get(extension, MAX_IMAGE_BYTES):
        raise EngineError('Embedded asset is too large: ' + name + '.', 413)
    return MIME_TYPES[extension]


def ingest_declared(name: str, data: bytes) -> dict:
    """Store bytes under the id they declare, after check_declared; the stored id always equals `name`."""
    stored = ingest(data, check_declared(name, data), name)
    if stored['id'] != name:
        raise EngineError('Embedded bytes do not match the asset id ' + name + '.', 400)
    return stored


def ingest_file(staged: Path, digest: str, declared_type: str, filename: str | None, license: dict | None = None):
    """Store a verified file from the asset folder: small ones through ingest, large ones by rename after a magic-byte check on the first bytes. The file is consumed."""
    try:
        size = staged.stat().st_size
        if size <= MAX_IMAGE_BYTES:
            return ingest(staged.read_bytes(), declared_type, filename, license)
        with staged.open('rb') as stream:
            head = stream.read(64)
        extension = sniff_extension(head, declared_type)
        if extension not in ('mp4', 'webm', 'woff2'):
            raise EngineError('Asset is too large.', 413)
        mime = MIME_TYPES[extension]
        if declared_type not in (mime, 'application/octet-stream'):
            raise EngineError('Asset content does not match its declared media type.', 415)
        if size > SIZE_LIMITS.get(extension, MAX_IMAGE_BYTES):
            raise EngineError('Asset is too large.', 413)
        target = DATA_DIR / 'assets' / (digest + '.' + extension)
        if not target.exists():
            os.replace(staged, target)
        return write_metadata(target.name, mime, size, filename, license)
    finally:
        staged.unlink(missing_ok=True)


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
        if file['path'] == '404.html':
            rooted = ROOT_404_PREFIX.search(file['content'])
            prefix = rooted.group(1) if rooted else prefix
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


class ProjectTooLarge(EngineError):
    """A version 1 envelope would pass 64 MiB; the download routes then write a version 2 archive instead."""


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
        raise ProjectTooLarge('The native file exceeds 64 MiB. Reduce image sizes or history before downloading.', 413)
    return envelope


def write_project_archive(site: dict, checkpoint: dict | None = None) -> Path:
    """Write a version 2 .fweb (zip: project.json first, then assets/<id> stored uncompressed) to a temporary file and return its path; the caller deletes it."""
    references = {'site': site, 'checkpoint': checkpoint} if checkpoint else site
    names = sorted(set(ASSET_REF.findall(json.dumps(references))))
    if len(names) > 500:
        raise EngineError('A native project holds at most 500 assets.', 413)
    listing = []
    for name in names:
        path = asset_path(name)
        metadata_path = path.with_name(name + '.json')
        metadata = json.loads(metadata_path.read_text()) if metadata_path.is_file() else {}
        entry = {'id': name, 'mime': MIME_TYPES[path.suffix[1:]], 'name': metadata.get('name', name)}
        if metadata.get('license'):
            entry['license'] = metadata['license']
        listing.append(entry)
    envelope = {'format': 'com.nodemode.formweb', 'version': 2, 'site': site, 'assets': listing}
    if checkpoint is not None:
        envelope['checkpoint'] = checkpoint
    folder = DATA_DIR / 'tmp'
    folder.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='project-', suffix='.fweb', dir=folder)
    target = Path(temporary)
    try:
        with os.fdopen(handle, 'wb') as raw, zipfile.ZipFile(raw, 'w', zipfile.ZIP_STORED, allowZip64=True) as archive:
            archive.writestr('project.json', json.dumps(envelope, ensure_ascii=False, indent=2), compress_type=zipfile.ZIP_DEFLATED)
            for name in names:
                archive.write(asset_path(name), 'assets/' + name, compress_type=zipfile.ZIP_STORED)
        if target.stat().st_size > MAX_PROJECT_ARCHIVE_BYTES:
            raise EngineError('The native archive exceeds 512 MiB. Reduce media sizes before downloading.', 413)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return target


def check_archive_asset(entry: dict, data_size: int, digest: str):
    """The checks restore_project_assets applies to a version 1 asset, for one archive asset already hashed."""
    limit = SIZE_LIMITS.get(entry['id'].split('.')[-1], MAX_IMAGE_BYTES)
    if data_size > limit or digest != entry['id'].split('.')[0]:
        raise EngineError('Native project image digest or size is invalid.')
    if entry.get('mime') != MIME_TYPES[entry['id'].split('.')[-1]]:
        raise EngineError('Native project image type is invalid.')


def read_project_archive(path: Path, staged: dict | None = None) -> dict:
    """Validate a version 2 archive on disk without loading assets into memory; return its project.json object.
    With a staged dict each asset is also copied, in the same single read, to a temporary file in the asset folder (id -> path); the caller removes what is left."""
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            if not infos or infos[0].filename != 'project.json':
                raise EngineError('Native archive must start with project.json.')
            if infos[0].file_size > 64 * 1024 * 1024:
                raise EngineError('Native archive project.json exceeds 64 MiB.', 413)
            try:
                native = json.loads(archive.read(infos[0]).decode('utf-8'))
            except (ValueError, UnicodeDecodeError) as error:
                raise EngineError('Native archive project.json is not valid JSON.') from error
            if not isinstance(native, dict) or native.get('format') != 'com.nodemode.formweb' or native.get('version') != 2:
                raise EngineError('Native archive project.json is not a FormWeb version 2 project.')
            if not isinstance(native.get('site'), dict):
                raise EngineError('Native project requires a site object.')
            listed = native.get('assets')
            if not isinstance(listed, list) or len(listed) > 500:
                raise EngineError('Native project assets must be a list containing at most 500 images.')
            ids = []
            for entry in listed:
                if not isinstance(entry, dict) or not isinstance(entry.get('id'), str) or not ASSET_NAME.fullmatch(entry['id']) or not isinstance(entry.get('mime'), str) or ('name' in entry and not isinstance(entry['name'], str)):
                    raise EngineError('Native project image entry is invalid.')
                ids.append(entry['id'])
            if len(set(ids)) != len(ids):
                raise EngineError('Native project lists an asset more than once.')
            names = [info.filename for info in infos[1:]]
            if len(set(names)) != len(names):
                raise EngineError('Native archive contains duplicate entries.')
            for name in names:
                if not name.startswith('assets/') or name[7:] not in ids:
                    raise EngineError('Native archive contains an entry not listed in project.json: ' + name[:80], 400)
            if len(names) != len(ids):
                raise EngineError('Native archive is missing a listed asset.')
            sizes = {info.filename[7:]: info for info in infos[1:]}
            for entry in listed:
                info = sizes[entry['id']]
                if info.file_size > SIZE_LIMITS.get(entry['id'].split('.')[-1], MAX_IMAGE_BYTES):
                    raise EngineError('Native project asset is too large.', 413)
                digest, counted = hashlib.sha256(), 0
                if staged is None:
                    with archive.open(info) as stream:
                        while chunk := stream.read(1024 * 1024):
                            counted += len(chunk)
                            digest.update(chunk)
                else:
                    folder = DATA_DIR / 'assets'
                    folder.mkdir(parents=True, exist_ok=True)
                    handle, temporary = tempfile.mkstemp(prefix='.stage-', suffix='.part', dir=folder)
                    staged[entry['id']] = Path(temporary)
                    with archive.open(info) as stream, os.fdopen(handle, 'wb') as out:
                        while chunk := stream.read(1024 * 1024):
                            counted += len(chunk)
                            if counted > SIZE_LIMITS.get(entry['id'].split('.')[-1], MAX_IMAGE_BYTES):
                                break
                            digest.update(chunk)
                            out.write(chunk)
                check_archive_asset(entry, counted, digest.hexdigest())
            return native
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError) as error:
        raise EngineError('Native archive is not a valid, readable zip file.') from error


def restore_archive_assets(path: Path, native: dict, staged: dict | None = None):
    """Store the assets of an archive already accepted by read_project_archive, one at a time (from the staged files when given)."""
    if staged is not None:
        try:
            for entry in native['assets']:
                licence = entry.get('license') if isinstance(entry.get('license'), dict) else None
                digest = entry['id'].split('.')[0]
                stored = ingest_file(staged.pop(entry['id']), digest, entry['mime'], entry.get('name'), licence)
                if stored['id'] != entry['id']:
                    raise EngineError('Native project image extension does not match its content.')
        finally:
            for left in staged.values():
                left.unlink(missing_ok=True)
            staged.clear()
        return
    with zipfile.ZipFile(path) as archive:
        for entry in native['assets']:
            licence = entry.get('license') if isinstance(entry.get('license'), dict) else None
            stored = ingest(archive.read('assets/' + entry['id']), entry['mime'], entry.get('name'), licence)
            if stored['id'] != entry['id']:
                raise EngineError('Native project image extension does not match its content.')


def restore_project_assets(envelope: dict):
    items = envelope.get('assets', [])
    if not isinstance(items, list) or len(items) > 500:
        raise EngineError('Native project assets must be a list containing at most 500 images.')
    pending = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not ASSET_NAME.fullmatch(item['id']) or item.get('encoding') != 'base64' or not isinstance(item.get('content'), str) or ('name' in item and not isinstance(item['name'], str)):
            raise EngineError('Native project image entry is invalid.')
        limit = SIZE_LIMITS.get(item['id'].split('.')[-1], MAX_IMAGE_BYTES)
        if len(item['content']) > limit * 4 // 3 + 4:
            raise EngineError('Native project asset is too large.', 413)
        try:
            data = base64.b64decode(item['content'], validate=True)
        except (ValueError, TypeError) as error:
            raise EngineError('Native project image is not valid base64.') from error
        if len(data) > limit or hashlib.sha256(data).hexdigest() != item['id'].split('.')[0]:
            raise EngineError('Native project image digest or size is invalid.')
        if item.get('mime') != MIME_TYPES[item['id'].split('.')[-1]]:
            raise EngineError('Native project image type is invalid.')
        pending.append((item, data))
    for item, data in pending:
        licence = item.get('license') if isinstance(item.get('license'), dict) else None
        stored = ingest(data, item['mime'], item.get('name'), licence)
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
