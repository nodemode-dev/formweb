"""Shared team asset library (FW-075).

A team library is a named set of colors, fonts and graphics kept in the service database, outside any one site, so
several projects can use it. Access is per library: whoever creates it owns it and can share it with other
identities as view (use it in their sites) or edit (change it). The local owner can do everything.

A site uses a library by linking it. Linking writes each color and font into the site as a typed design token named
lib-[library]-[name] or lib-[library]-font-[name], in one engine batch (one undo step), and records the linked
revision in the site setting teamLibraries. Elements style with var(--lib-...), so when the library changes, Sync
brings the new values into the site and every element follows. Graphics are uploaded assets; the editor inserts
them as images. Unlinking or deleting a library never removes tokens from a site, because elements may still use
them.
"""
import json
import re
from uuid import uuid4

from .access import actor
from .assets import ASSET_NAME, asset_path, visible_assets
from .engine import EngineError
from .store import now

SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
COLOR = re.compile(r'^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|(?:rgb|rgba|hsl|hsla|oklch)\([0-9a-zA-Z.,%/ +-]{1,60}\))$')
FONT = re.compile(r'^[A-Za-z0-9 ,\'"._-]{1,200}$')
LIMIT = 200
ROLES = ('view', 'edit')


def slugify(raw: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', raw.strip().lower()).strip('-')[:32].strip('-')


def linked(site: dict) -> dict:
    try:
        value = json.loads((site.get('settings') or {}).get('teamLibraries') or '{}')
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


class TeamLibraries:
    def __init__(self, studio):
        self.studio = studio
        self.db = studio.store.db
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS team_libraries (id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,owner_id TEXT NOT NULL,owner_name TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS team_library_members (library_id TEXT NOT NULL,identity_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(library_id,identity_id));
        ''')
        self.db.commit()

    # access ------------------------------------------------------------------
    def role(self, row) -> str | None:
        identity = actor.get()
        if identity['root'] or row['owner_id'] == identity['id']:
            return 'owner'
        member = self.db.execute('SELECT role FROM team_library_members WHERE library_id=? AND identity_id=?', (row['id'], identity['id'])).fetchone()
        return member['role'] if member else None

    def row(self, library_id: str, need: str = 'view'):
        if not isinstance(library_id, str) or len(library_id) > 64:
            raise EngineError('Team library not found.', 404)
        row = self.db.execute('SELECT * FROM team_libraries WHERE id=?', (library_id,)).fetchone()
        role = self.role(row) if row else None
        if not role:
            raise EngineError('Team library not found, or it has not been shared with you.', 404)
        order = {'view': 0, 'edit': 1, 'owner': 2}
        if order[role] < order[need]:
            raise EngineError(f'You can {"use" if role == "view" else "edit"} this library but not {"edit" if need == "edit" else "share or delete"} it. Ask its owner, {row["owner_name"]}.', 403)
        return row, role

    def visible_asset_ids(self) -> set[str]:
        names = set()
        for row in self.db.execute('SELECT * FROM team_libraries'):
            if self.role(row):
                names.update(item['asset'] for item in json.loads(row['data'])['graphics'])
        return names

    # reading -----------------------------------------------------------------
    def describe(self, row, role, site=None, detail=True):
        data = json.loads(row['data'])
        link = linked(site).get(row['id']) if site else None
        result = {
            'id': row['id'], 'slug': row['slug'], 'name': row['name'], 'owner': row['owner_name'], 'role': role, 'revision': row['revision'],
            'counts': {kind: len(data[kind]) for kind in ('colors', 'fonts', 'graphics')}, 'updatedAt': row['updated_at'],
            'linked': bool(link), 'linkedRevision': link.get('revision') if isinstance(link, dict) else None,
        }
        result['updateAvailable'] = bool(link) and result['linkedRevision'] != row['revision']
        if detail:
            result.update({
                'colors': [{**item, 'token': f'lib-{row["slug"]}-{item["name"]}'} for item in data['colors']],
                'fonts': [{**item, 'token': f'lib-{row["slug"]}-font-{item["name"]}'} for item in data['fonts']],
                'graphics': [{**item, 'url': '/api/assets/' + item['asset']} for item in data['graphics']],
                'members': [dict(member) for member in self.db.execute('SELECT m.identity_id AS identityId,COALESCE(i.name,m.identity_id) AS name,m.role FROM team_library_members m LEFT JOIN identities i ON i.id=m.identity_id WHERE m.library_id=? ORDER BY name', (row['id'],))] if role == 'owner' else [],
                'usedBy': self.used_by(row['id']),
            })
        return result

    def used_by(self, library_id: str) -> int:
        sites = set()
        for project in self.db.execute('SELECT site FROM projects'):
            site = json.loads(project['site'])
            if library_id in linked(site):
                sites.add(site.get('id'))
        current = (self.studio.engine.cached_state or {}).get('site')
        if current and library_id in linked(current):
            sites.add(current.get('id'))
        return len(sites)

    async def list(self):
        self.studio.access.authorize('read')
        site = (await self.studio.state())['site']
        rows = [(row, self.role(row)) for row in self.db.execute('SELECT * FROM team_libraries ORDER BY name COLLATE NOCASE')]
        return {'libraries': [self.describe(row, role, site, detail=False) for row, role in rows if role],
                'note': 'Link a library to use its colors and fonts as var(--lib-[library]-[name]) tokens; Sync when it shows an update.'}

    async def get(self, library_id: str):
        self.studio.access.authorize('read')
        row, role = self.row(library_id)
        return self.describe(row, role, (await self.studio.state())['site'])

    # writing -----------------------------------------------------------------
    def clean(self, data: dict) -> dict:
        allowed_assets = None
        result = {}
        for kind, pattern in (('colors', COLOR), ('fonts', FONT), ('graphics', None)):
            items = data.get(kind, [])
            if not isinstance(items, list) or len(items) > LIMIT:
                raise EngineError(f'{kind.capitalize()} must be a list of at most {LIMIT} entries.')
            seen, cleaned = set(), []
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get('name'), str):
                    raise EngineError(f'Each {kind[:-1]} needs a name.')
                name = slugify(item['name'])
                if not name or name in seen:
                    raise EngineError(f'{kind.capitalize()[:-1]} names must be unique short names using letters and numbers ("{item["name"]}").')
                seen.add(name)
                if kind == 'graphics':
                    asset = item.get('asset') or str(item.get('url', '')).rsplit('/', 1)[-1]
                    if not isinstance(asset, str) or not ASSET_NAME.fullmatch(asset):
                        raise EngineError(f'Graphic "{name}" must be an uploaded image (/api/assets/[id]).')
                    if allowed_assets is None:
                        allowed_assets = visible_assets(self.studio) | self.visible_asset_ids()
                    if asset not in allowed_assets:
                        raise EngineError(f'Graphic "{name}" is not an image you can see. Upload it first.', 404)
                    asset_path(asset)
                    cleaned.append({'name': name, 'asset': asset})
                else:
                    value = item.get('value')
                    if not isinstance(value, str) or not pattern.fullmatch(value.strip()):
                        raise EngineError(f'{kind.capitalize()[:-1]} "{name}" has an invalid value. Use {"a hex, rgb() or hsl() color" if kind == "colors" else "a font stack such as Inter, sans-serif"}.')
                    cleaned.append({'name': name, 'value': value.strip()})
            result[kind] = cleaned
        return result

    async def create(self, name, from_brand=False, data=None):
        identity = self.studio.access.authorize('edit')
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise EngineError('Give the library a name of 1 to 80 characters.')
        base = slugify(name) or 'library'
        slug, suffix = base, 2
        while self.db.execute('SELECT 1 FROM team_libraries WHERE slug=?', (slug,)).fetchone():
            slug, suffix = f'{base}-{suffix}', suffix + 1
        if from_brand:
            from .brand import kit
            brand = kit((await self.studio.state())['site'])
            data = {
                'colors': [{'name': token[6:], 'value': value} for token, value in brand['colors'].items()],
                'fonts': [{'name': token[11:], 'value': value} for token, value in brand['fonts'].items()],
                'graphics': [{'name': 'logo' if index == 0 else 'logo-dark', 'asset': url.rsplit('/', 1)[-1]} for index, url in enumerate(brand['logos'])],
            }
        cleaned = self.clean(data or {})
        if self.db.execute('SELECT count(*) FROM team_libraries').fetchone()[0] >= 200:
            raise EngineError('This service already holds 200 team libraries. Delete one first.', 409)
        library_id = uuid4().hex
        stamp = now()
        self.db.execute('INSERT INTO team_libraries VALUES(?,?,?,?,?,?,?,?,?)', (library_id, slug, name.strip(), identity['id'], identity['name'], 1, json.dumps(cleaned), stamp, stamp))
        self.db.commit()
        self.studio.access.record('library.team.create', {'id': library_id, 'name': name.strip()})
        return await self.get(library_id)

    async def save(self, library_id, name=None, data=None, expected_revision=None):
        self.studio.access.authorize('read')
        row, _ = self.row(library_id, 'edit')
        if expected_revision is not None and expected_revision != row['revision']:
            raise EngineError(f'The library changed (revision {row["revision"]}, you sent {expected_revision}). Read it again and reapply your change.', 409)
        current = json.loads(row['data'])
        merged = self.clean({kind: (data or {}).get(kind, current[kind]) for kind in ('colors', 'fonts', 'graphics')})
        new_name = row['name'] if name is None else name
        if not isinstance(new_name, str) or not 1 <= len(new_name.strip()) <= 80:
            raise EngineError('Give the library a name of 1 to 80 characters.')
        self.db.execute('UPDATE team_libraries SET name=?,data=?,revision=revision+1,updated_at=? WHERE id=?', (new_name.strip(), json.dumps(merged), now(), library_id))
        self.db.commit()
        self.studio.access.record('library.team.update', {'id': library_id, 'revision': row['revision'] + 1})
        return await self.get(library_id)

    async def share(self, library_id, identity_id, role):
        self.studio.access.authorize('read')
        row, _ = self.row(library_id, 'owner')
        if role not in (*ROLES, None, 'none'):
            raise EngineError('Role must be view, edit or none.')
        if not isinstance(identity_id, str) or not self.db.execute('SELECT 1 FROM identities WHERE id=?', (identity_id,)).fetchone():
            raise EngineError('Identity not found. Create it under project access first.', 404)
        if identity_id == row['owner_id']:
            raise EngineError('The owner always has full access.')
        if role in (None, 'none'):
            self.db.execute('DELETE FROM team_library_members WHERE library_id=? AND identity_id=?', (library_id, identity_id))
        else:
            self.db.execute('INSERT INTO team_library_members VALUES(?,?,?) ON CONFLICT(library_id,identity_id) DO UPDATE SET role=excluded.role', (library_id, identity_id, role))
        self.db.commit()
        self.studio.access.record('library.team.share', {'id': library_id, 'identityId': identity_id, 'role': role or 'none'})
        return await self.get(library_id)

    async def delete(self, library_id):
        self.studio.access.authorize('read')
        row, _ = self.row(library_id, 'owner')
        self.db.execute('DELETE FROM team_library_members WHERE library_id=?', (library_id,))
        self.db.execute('DELETE FROM team_libraries WHERE id=?', (library_id,))
        self.db.commit()
        self.studio.access.record('library.team.delete', {'id': library_id})
        return {'id': library_id, 'deleted': True, 'note': f'Sites that linked "{row["name"]}" keep its tokens; their link is shown as missing.'}

    async def use(self, library_id, action='link'):
        """Link, sync or unlink a library in the open site. Link and sync are one undo step."""
        self.studio.access.authorize('edit')
        if action not in ('link', 'sync', 'unlink'):
            raise EngineError('Action must be link, sync or unlink.')
        site = (await self.studio.state())['site']
        links = linked(site)
        if action == 'unlink':
            if library_id not in links:
                raise EngineError('This library is not linked to the open site.', 404)
            links.pop(library_id)
            commands = []
            row = None
        else:
            row, _ = self.row(library_id)
            if action == 'sync' and library_id not in links:
                raise EngineError('Link the library before syncing it.', 409)
            data = json.loads(row['data'])
            commands = [{'command': 'token.define', 'params': {'name': f'lib-{row["slug"]}-{item["name"]}', 'type': 'color', 'value': item['value']}} for item in data['colors']]
            commands += [{'command': 'token.define', 'params': {'name': f'lib-{row["slug"]}-font-{item["name"]}', 'type': 'text', 'value': item['value']}} for item in data['fonts']]
            links[library_id] = {'revision': row['revision'], 'slug': row['slug'], 'name': row['name']}
        commands.append({'command': 'site.update', 'params': {'patch': {'settings': {'teamLibraries': json.dumps(links, separators=(',', ':'))}}}})
        defined = {item['params']['name'] for item in commands[:-1]}
        kept = sorted(name for name in (site.get('tokens') or {}) if row and name.startswith(f'lib-{row["slug"]}-') and name not in defined)
        state = await self.studio.mutate('batch', {'commands': commands})
        tokens = len(commands) - 1
        noun = 'token' if tokens == 1 else 'tokens'
        message = {'link': f'Linked "{row["name"] if row else ""}": {tokens} {noun} added as one undo step.', 'sync': f'Synced "{row["name"] if row else ""}" to revision {row["revision"] if row else ""}: {tokens} {noun} updated.', 'unlink': 'Unlinked. Its tokens stay in the site so nothing that uses them changes.'}[action]
        if kept:
            message += f' Kept {len(kept)} token{"s" if len(kept) != 1 else ""} no longer in the library, because elements may use {"them" if len(kept) != 1 else "it"}: {", ".join(kept[:6])}.'
        return {'action': action, 'tokens': tokens, 'kept': kept, 'message': message, 'state': state}
