import base64
import hashlib
import json
import re
from pathlib import PurePosixPath

from .config import DATA_DIR
from .engine import EngineError

ASSET_NAME = re.compile(r'^[0-9a-f]{64}\.(png|jpg|gif|webp)$')
ASSET_REF = re.compile(r'/api/assets/([0-9a-f]{64}\.(?:png|jpg|gif|webp))')
MIME_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp'}


def asset_path(name: str):
    if not ASSET_NAME.fullmatch(name):
        raise EngineError('Asset not found.', 404)
    target = DATA_DIR / 'assets' / name
    if not target.is_file():
        raise EngineError('Asset not found.', 404)
    return target


def ingest(data: bytes, declared_type: str, filename: str | None):
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
    metadata = {'id': name, 'url': '/api/assets/' + name, 'mime': mime, 'size': len(data), 'name': (filename or name).replace('\x00', '')[:160]}
    (folder / (name + '.json')).write_text(json.dumps(metadata), encoding='utf-8')
    return metadata


def list_assets():
    folder = DATA_DIR / 'assets'
    if not folder.exists():
        return {'assets': []}
    return {'assets': [json.loads(path.read_text(encoding='utf-8')) for path in sorted(folder.glob('*.json'))]}


def bundle_assets(result: dict):
    names = set()
    files = []
    for original in result['files']:
        file = dict(original)
        prefix = '../' * (len(PurePosixPath(file['path']).parts) - 1)
        for name in ASSET_REF.findall(file['content']):
            names.add(name)
            file['content'] = file['content'].replace('/api/assets/' + name, prefix + 'assets/' + name)
        files.append(file)
    for name in sorted(names):
        path = asset_path(name)
        files.append({'path': 'assets/' + name, 'content': base64.b64encode(path.read_bytes()).decode(), 'encoding': 'base64'})
    return {**result, 'files': files}


def file_bytes(file: dict):
    return base64.b64decode(file['content'], validate=True) if file.get('encoding') == 'base64' else file['content'].encode('utf-8')


def project_envelope(site: dict):
    assets = []
    for name in sorted(set(ASSET_REF.findall(json.dumps(site)))):
        path = asset_path(name)
        metadata_path = path.with_name(name + '.json')
        metadata = json.loads(metadata_path.read_text()) if metadata_path.is_file() else {}
        assets.append({'id': name, 'mime': MIME_TYPES[path.suffix[1:]], 'name': metadata.get('name', name), 'encoding': 'base64', 'content': base64.b64encode(path.read_bytes()).decode()})
    envelope = {'format': 'com.nodemode.formweb', 'version': 1, 'site': site, 'assets': assets}
    if len(json.dumps(envelope, ensure_ascii=False, indent=2).encode()) > 64 * 1024 * 1024:
        raise EngineError('The native file exceeds 64 MiB. Reduce embedded image sizes or save this project in the local database.', 413)
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
        stored = ingest(data, item['mime'], item.get('name'))
        if stored['id'] != item['id']:
            raise EngineError('Native project image extension does not match its content.')
