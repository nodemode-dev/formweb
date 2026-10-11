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
    for name in sorted(names):
        path = asset_path(name)
        files.append({'path': 'assets/' + name, 'content': base64.b64encode(path.read_bytes()).decode(), 'encoding': 'base64'})
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
        assets.append({'id': name, 'mime': MIME_TYPES[path.suffix[1:]], 'name': metadata.get('name', name), 'encoding': 'base64', 'content': base64.b64encode(path.read_bytes()).decode()})
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
        stored = ingest(data, item['mime'], item.get('name'))
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
