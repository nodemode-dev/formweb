import csv
import hashlib
import io
import json
import math
import re
from uuid import uuid4

from .assets import project_envelope, restore_project_assets
from .engine import EngineError
from .store import now


async def export_csv(studio, collection_id):
    site = (await studio.state())['site']
    collection = site['collections'].get(collection_id)
    if collection is None:
        raise EngineError('Collection not found.', 404)
    fields = collection['fields']
    localized = site.get('extensions', {}).get('cms', {}).get('localized', {}).get(collection_id, {})
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\r\n')
    writer.writerow(['id', 'slug', 'status', '_present', '_nulls', '_locales', *('field:' + field['name'] for field in fields)])
    for item in collection['items']:
        values = item['values']
        cells = []
        for field in fields:
            value = values.get(field['name'])
            if value is None:
                cells.append('')
            elif field['type'] in ('number', 'boolean', 'references'):
                cells.append(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
            else:
                cells.append(str(value))
        writer.writerow([item['id'], item['slug'], item['status'], json.dumps(sorted(values)), json.dumps(sorted(name for name, value in values.items() if value is None)), json.dumps(localized.get(item['id'], {}), ensure_ascii=False, separators=(',', ':')), *cells])
    return stream.getvalue()


def csv_value(raw, kind, field, row):
    if kind in ('number', 'boolean', 'references'):
        try:
            value = json.loads(raw)
        except ValueError as error:
            raise EngineError(f'CSV row {row}, {field}: invalid {kind} value.', 422) from error
        try:
            valid = (kind == 'number' and isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)) or (kind == 'boolean' and isinstance(value, bool)) or (kind == 'references' and isinstance(value, list) and all(isinstance(item, str) for item in value))
        except OverflowError:
            valid = False
        if not valid:
            raise EngineError(f'CSV row {row}, {field}: wrong {kind} type.', 422)
        return value
    return raw


async def import_csv(studio, collection_id, text, mode='upsert'):
    if mode not in ('upsert', 'replace') or not isinstance(text, str) or len(text.encode('utf-8')) > 8 * 1024 * 1024:
        raise EngineError('CSV requires upsert/replace mode and at most 8 MiB of text.', 422)
    state = await studio.state()
    site = state['site']
    collection = site['collections'].get(collection_id)
    if collection is None:
        raise EngineError('Collection not found.', 404)
    fields = {field['name']: field for field in collection['fields']}
    try:
        reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff'), newline=''), strict=True)
        headers = reader.fieldnames
        if not headers or len(headers) != len(set(headers)) or 'slug' not in headers:
            raise EngineError('CSV requires unique column headers and a slug column.', 422)
        controls = {'id', 'slug', 'status', '_present', '_nulls', '_locales'}
        mapped = {}
        for header in headers:
            if header in controls:
                continue
            name = header[6:] if header.startswith('field:') else header
            if name not in fields or name in mapped:
                raise EngineError('CSV column is unknown or mapped twice: ' + header, 422)
            mapped[name] = header
        imported = []
        localizations = {}
        ids, slugs = set(), set()
        for number, row in enumerate(reader, start=2):
            if len(imported) >= 10000 or None in row or any(value is None for value in row.values()):
                raise EngineError(f'CSV row {number}: wrong column count or item limit exceeded.', 422)
            item_id = row.get('id') or uuid4().hex
            slug = row['slug']
            if item_id in ids or slug in slugs:
                raise EngineError(f'CSV row {number}: duplicate item ID or slug.', 409)
            ids.add(item_id); slugs.add(slug)
            present = json.loads(row['_present']) if row.get('_present') else list(mapped)
            nulls = json.loads(row['_nulls']) if row.get('_nulls') else []
            if not isinstance(present, list) or not all(isinstance(name, str) and name in mapped for name in present) or len(set(present)) != len(present) or not isinstance(nulls, list) or not all(isinstance(name, str) and name in present for name in nulls):
                raise EngineError(f'CSV row {number}: presence/null metadata is invalid.', 422)
            values = {name: None if name in nulls else csv_value(row[mapped[name]], fields[name]['type'], name, number) for name in present}
            imported.append({'id': item_id, 'slug': slug, 'status': row.get('status') or 'draft', 'values': values})
            if '_locales' in headers:
                translated = json.loads(row['_locales'] or '{}')
                if not isinstance(translated, dict):
                    raise EngineError(f'CSV row {number}: locale overrides must be a JSON object.', 422)
                localizations[item_id] = translated
    except (csv.Error, ValueError, TypeError) as error:
        raise EngineError('CSV cannot be parsed: ' + str(error)[:500], 422) from error
    existing = {item['id']: item for item in collection['items']}
    incoming = {item['id']: item for item in imported}
    items = list(incoming.values()) if mode == 'replace' else [incoming.get(item['id'], item) for item in collection['items']] + [item for item in imported if item['id'] not in existing]
    all_slugs = [item['slug'] for item in items]
    if len(all_slugs) != len(set(all_slugs)):
        collisions = sorted(slug for slug in set(all_slugs) if all_slugs.count(slug) > 1)
        raise EngineError('CSV slug conflicts with stored items: ' + ', '.join(collisions[:20]), 409)
    commands = [{'command': 'cms.replace', 'params': {'collection': collection_id, 'items': items}}]
    if '_locales' in headers or mode == 'replace':
        group = json.loads(json.dumps(site.get('extensions', {}).get('cms', {})))
        current = group.setdefault('localized', {}).setdefault(collection_id, {})
        if mode == 'replace':
            group['localized'][collection_id] = {key: value for key, value in localizations.items() if value}
        else:
            for key, value in localizations.items():
                if value:
                    current[key] = value
                else:
                    current.pop(key, None)
        commands.append({'command': 'extension.set', 'params': {'group': 'cms', 'value': group}})
    result = await studio.mutate('batch', {'commands': commands, 'expectedRevision': state['revision']})
    return {'state': result, 'report': {'rows': len(imported), 'created': len(set(incoming) - set(existing)), 'updated': len(set(incoming) & set(existing)), 'removed': len(set(existing) - set(incoming)) if mode == 'replace' else 0}}


def library_table(studio):
    studio.store.db.execute("CREATE TABLE IF NOT EXISTS library_versions (id TEXT NOT NULL,version TEXT NOT NULL,name TEXT NOT NULL,digest TEXT NOT NULL,envelope TEXT NOT NULL,components TEXT NOT NULL,created_at TEXT NOT NULL,project_id TEXT NOT NULL DEFAULT '',PRIMARY KEY(id,version))")
    if 'project_id' not in {row['name'] for row in studio.store.db.execute('PRAGMA table_info(library_versions)')}:
        studio.store.db.execute("ALTER TABLE library_versions ADD COLUMN project_id TEXT NOT NULL DEFAULT ''")
    studio.store.db.commit()


def library_metadata(row):
    envelope = json.loads(row['envelope'])
    return {'id': row['id'], 'version': row['version'], 'name': row['name'], 'digest': row['digest'], 'components': json.loads(row['components']), 'createdAt': row['created_at'], 'assetCount': len(envelope.get('assets', [])), 'projectId': row['project_id'], 'siteId': envelope['site']['id']}


def authorize_library(studio, row):
    from .access import actor
    if not row['project_id'] and not actor.get()['root']:
        raise EngineError('This legacy library has no attributable project owner.', 403)
    studio.access.authorize('read', row['project_id'] or None)


async def list_libraries(studio):
    from .access import actor
    library_table(studio)
    rows = studio.store.db.execute('SELECT * FROM library_versions ORDER BY created_at DESC,id,version')
    return {'libraries': [library_metadata(row) for row in rows if actor.get()['root'] or (row['project_id'] and studio.access.role(row['project_id']) is not None)]}


async def save_library(studio, request):
    studio.access.authorize('edit')
    if not isinstance(request, dict) or set(request) - {'id', 'name', 'version', 'site', 'native', 'components'}:
        raise EngineError('Library request has unsupported fields.')
    library_id = request.get('id') or uuid4().hex
    version = request.get('version', '1.0.0')
    name = request.get('name', '')
    if not isinstance(library_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', library_id) or not isinstance(version, str) or not re.fullmatch(r'\d{1,8}\.\d{1,8}\.\d{1,8}', version) or not isinstance(name, str) or not 1 <= len(name.strip()) <= 160:
        raise EngineError('Library requires a name, stable ID and dotted semantic version.')
    if 'native' in request and 'site' in request:
        raise EngineError('Supply either site or native, not both.')
    native = request.get('native')
    if 'native' in request and not isinstance(native, dict):
        raise EngineError('Library native envelope must be an object.')
    site = request.get('site') if native is None else native.get('site') if isinstance(native, dict) else None
    if site is None:
        site = (await studio.state())['site']
    if not isinstance(site, dict) or len(json.dumps(site).encode()) > 4 * 1024 * 1024:
        raise EngineError('Library snapshot must be a Site smaller than 4 MiB.')
    await studio.engine.request('validate', {'site': site})
    if site.get('extensions', {}).get('libraries', {}).get('packages'):
        raise EngineError('Library snapshots cannot contain nested pins. Detach imported libraries first.')
    components = request.get('components', sorted(site['components']))
    if not isinstance(components, list) or not 1 <= len(components) <= 100 or any(not isinstance(key, str) or key not in site['components'] for key in components) or len(set(components)) != len(components):
        raise EngineError('Library must select one to 100 known component IDs.')
    if native is not None:
        if native.get('format') != 'com.nodemode.formweb' or native.get('version') != 1:
            raise EngineError('Library native envelope is not a FormWeb version 1 project.')
        restore_project_assets(native)
    envelope = project_envelope(site)
    digest = hashlib.sha256(json.dumps(envelope, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    library_table(studio)
    studio.access.authorize('edit')
    previous = studio.store.db.execute('SELECT project_id FROM library_versions WHERE id=? LIMIT 1', (library_id,)).fetchone()
    project_id = previous['project_id'] if previous else studio.access.project_key()
    if previous:
        authorize_library(studio, previous)
        studio.access.authorize('edit', project_id or None)
    if studio.store.db.execute('SELECT 1 FROM library_versions WHERE id=? AND version=?', (library_id, version)).fetchone():
        raise EngineError('This pinned library version already exists. Save a new version.', 409)
    if studio.store.db.execute('SELECT count(*) FROM library_versions').fetchone()[0] >= 500:
        raise EngineError('Library version limit reached.', 413)
    studio.store.db.execute('INSERT INTO library_versions(id,version,name,digest,envelope,components,created_at,project_id) VALUES(?,?,?,?,?,?,?,?)', (library_id, version, name.strip(), digest, json.dumps(envelope), json.dumps(components), now(), project_id))
    studio.store.db.commit()
    row = studio.store.db.execute('SELECT * FROM library_versions WHERE id=? AND version=?', (library_id, version)).fetchone()
    return library_metadata(row)


def library_version(studio, library_id, version):
    library_table(studio)
    if version is None:
        row = studio.store.db.execute('SELECT * FROM library_versions WHERE id=? ORDER BY created_at DESC LIMIT 1', (library_id,)).fetchone()
    else:
        row = studio.store.db.execute('SELECT * FROM library_versions WHERE id=? AND version=?', (library_id, version)).fetchone()
    if row is None:
        raise EngineError('Library version not found.', 404)
    authorize_library(studio, row)
    return row


def component_digest(site, component_id):
    pending = [site['components'][component_id]['root']]
    nodes = {}
    while pending:
        node_id = pending.pop()
        node = site['nodes'][node_id]
        nodes[node_id] = node
        pending.extend(node.get('children', []))
    extensions = site.get('extensions', {})
    payload = {'component': site['components'][component_id], 'nodes': nodes, 'definition': extensions.get('components', {}).get('definitions', {}).get(component_id), 'tokens': site.get('tokens', {}), 'breakpoints': site.get('breakpoints', []), 'locales': site.get('locales', {}), 'forms': {key: value for key, value in extensions.get('forms', {}).get('forms', {}).items() if key in nodes}}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


async def review_library(studio, library_id, version=None):
    row = library_version(studio, library_id, version)
    site = (await studio.state())['site']
    pin = site.get('extensions', {}).get('libraries', {}).get('packages', {}).get(library_id)
    target = json.loads(row['envelope'])['site']
    new_components = set(json.loads(row['components']))
    old_components = set(pin.get('components', [])) if pin else set()
    previous = pin.get('site', {}) if pin else {}
    changed = [key for key in sorted(old_components & new_components) if component_digest(previous, key) != component_digest(target, key)]
    return {**library_metadata(row), 'currentVersion': pin.get('version') if pin else None, 'review': {'added': sorted(new_components - old_components), 'removed': sorted(old_components - new_components), 'changed': changed}, 'requiresAcknowledgement': pin is not None}


async def import_library(studio, library_id, request):
    if not isinstance(request, dict) or set(request) - {'version', 'parent', 'components', 'update', 'reviewDigest'}:
        raise EngineError('Library import has unsupported fields.')
    row = library_version(studio, library_id, request.get('version'))
    state = await studio.state()
    existing = state['site'].get('extensions', {}).get('libraries', {}).get('packages', {}).get(library_id)
    native = json.loads(row['envelope'])
    params = {'id': library_id, 'version': row['version'], 'site': native['site']}
    if existing:
        if request.get('update') is not True or request.get('reviewDigest') != row['digest']:
            raise EngineError('Review the selected library version and acknowledge its digest before updating.', 409)
        command = 'library.update'
    else:
        if request.get('update'):
            raise EngineError('This library has no current pin to update.', 409)
        parent = request.get('parent')
        if not isinstance(parent, str):
            raise EngineError('Initial library import needs a parent node.')
        command = 'library.import'
        params.update({'name': row['name'], 'parent': parent})
    selected = request.get('components', json.loads(row['components']))
    if not isinstance(selected, list) or not selected or any(key not in json.loads(row['components']) for key in selected):
        raise EngineError('Select only components published in this library version.')
    params['components'] = selected
    await studio.engine.request('validate', {'site': native['site']})
    restore_project_assets(native)
    result = await studio.mutate('exec', {'command': command, 'params': params, 'expectedRevision': state['revision']})
    return {'state': result, 'library': library_metadata(row)}
