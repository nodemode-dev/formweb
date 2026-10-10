import json
import re
import secrets
import time
from pathlib import PurePosixPath

from .assets import bundle_assets, file_bytes
from .config import DATA_DIR, PUBLIC_BASE
from .engine import EngineError
from .store import now


class Releases:
    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store
        self.store.db.executescript('''
        CREATE TABLE IF NOT EXISTS release_projects (slug TEXT NOT NULL,version TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(slug,version));
        CREATE TABLE IF NOT EXISTS active_releases (slug TEXT PRIMARY KEY,version TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS release_history (seq INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL,old_version TEXT,new_version TEXT NOT NULL,operation TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS previews (token TEXT PRIMARY KEY,site TEXT NOT NULL,revision INTEGER NOT NULL,expires REAL NOT NULL);
        ''')
        self.store.db.commit()

    def remember(self, slug, version):
        self.store.db.execute('INSERT INTO release_projects VALUES(?,?,?)', (slug, version, self.studio.access.project_key()))
        self.store.db.commit()

    def release(self, slug, version):
        row = self.store.db.execute('SELECT p.site,r.project_id FROM publications p LEFT JOIN release_projects r ON r.slug=p.slug AND r.version=p.version WHERE p.slug=? AND p.version=?', (slug, version)).fetchone()
        if not row:
            raise EngineError('Release not found.', 404)
        return {'site': json.loads(row['site']), 'projectId': row['project_id'] or json.loads(row['site'])['id']}

    def entry_path(self, site, root):
        from .service import safe_export_path
        manifest_path = root / 'routes.json'
        if not manifest_path.is_file():
            if (root / 'index.html').is_file():
                return ''
            raise EngineError('Compiled release entry bytes are unavailable.', 409)
        manifest = json.loads(manifest_path.read_text())
        rows = manifest.get('routes', []) if isinstance(manifest, dict) else manifest
        candidates = [row for row in rows if row.get('locale') == site['defaultLocale']]
        candidates.sort(key=lambda row: (row.get('page') != site['pages'][0]['id'], bool(row.get('item'))))
        for row in candidates:
            path = str(row.get('path', ''))
            target = root.joinpath(*safe_export_path(path).parts).resolve()
            if target.is_relative_to(root.resolve()) and target.is_file() and target.suffix == '.html':
                return path[:-10] if path.endswith('index.html') else path
        raise EngineError('Compiled release has no available route for its default locale.', 409)

    def promote(self, slug, version, operation='promote'):
        release = self.release(slug, version)
        self.studio.access.authorize('publish', release['projectId'])
        root = DATA_DIR / 'publications' / slug / version
        self.entry_path(release['site'], root)
        row = self.store.db.execute('SELECT version FROM active_releases WHERE slug=?', (slug,)).fetchone()
        old = row['version'] if row else None
        if old == version:
            return {'slug': slug, 'version': version, 'url': f'{PUBLIC_BASE}/sites/{slug}/', 'changed': False}
        self.store.db.execute('INSERT INTO active_releases VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET version=excluded.version', (slug, version))
        self.store.db.execute('INSERT INTO release_history(slug,old_version,new_version,operation,created_at) VALUES(?,?,?,?,?)', (slug, old, version, operation, now()))
        self.store.db.commit()
        self.studio.access.record('release.' + operation, {'slug': slug, 'version': version, 'previousVersion': old}, release['projectId'])
        return {'slug': slug, 'version': version, 'previousVersion': old, 'url': f'{PUBLIC_BASE}/sites/{slug}/', 'changed': True, 'bytesReused': True}

    def rollback(self, slug, version=None):
        current = self.active(slug)
        if version is None:
            row = self.store.db.execute('SELECT old_version FROM release_history WHERE slug=? AND old_version IS NOT NULL AND old_version<>? ORDER BY seq DESC LIMIT 1', (slug, current)).fetchone()
            if not row:
                raise EngineError('There is no prior active release.', 409)
            version = row['old_version']
        return self.promote(slug, version, 'rollback')

    def active(self, slug):
        row = self.store.db.execute('SELECT version FROM active_releases WHERE slug=?', (slug,)).fetchone()
        if not row:
            raise EngineError('No active release has been promoted.', 404)
        return row['version']

    def list(self):
        self.studio.access.authorize('read')
        active = []
        releases = []
        allowed = set()
        for row in self.store.db.execute('SELECT slug,version,created_at FROM publications ORDER BY created_at DESC'):
            release = self.release(row['slug'], row['version'])
            if self.studio.access.role(release['projectId']):
                allowed.add((row['slug'], row['version']))
                releases.append({**dict(row), 'siteId': release['site']['id'], 'url': f'{PUBLIC_BASE}/published/{row["slug"]}/{row["version"]}/'})
        for row in self.store.db.execute('SELECT * FROM active_releases ORDER BY slug'):
            if (row['slug'], row['version']) in allowed:
                active.append({'slug': row['slug'], 'version': row['version'], 'url': f'{PUBLIC_BASE}/sites/{row["slug"]}/'})
        history = [dict(row) for row in self.store.db.execute('SELECT * FROM release_history ORDER BY seq DESC LIMIT 100') if (row['slug'], row['new_version']) in allowed]
        return {'active': active, 'releases': releases, 'history': history}

    async def preview(self, page=None, locale=None):
        self.studio.access.authorize('read')
        async with self.studio.action_lock:
            state = await self.studio.state()
            token = secrets.token_urlsafe(24)
            params = {'formsEndpoint': f'{PUBLIC_BASE}/preview/{token}', 'preview': True, 'previewToken': token, 'privateMembers': True}
            if locale:
                params['locale'] = locale
            result = bundle_assets(await self.studio.engine.request('export', params))
            folder = DATA_DIR / 'previews' / token
            folder.mkdir(parents=True)
            try:
                for file in result['files']:
                    from .service import safe_export_path
                    relative = safe_export_path(file['path'])
                    path = folder.joinpath(*relative.parts)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(file_bytes(file))
                self.store.db.execute('INSERT INTO previews VALUES(?,?,?,?)', (token, json.dumps(state['site']), state['revision'], time.time() + 3600))
                self.store.db.commit()
            except Exception:
                import shutil
                shutil.rmtree(folder, ignore_errors=True)
                raise
            pages = state['site']['pages']
            selected = next((item for item in pages if item['id'] == page), None) if page else pages[0]
            if selected is None:
                raise EngineError('Preview page is not part of this site.', 404)
            manifest = next((file for file in result['files'] if file['path'] == 'routes.json'), None)
            rows = json.loads(manifest['content']) if manifest else []
            rows = rows.get('routes', []) if isinstance(rows, dict) else rows
            selected_locale = locale or state['site']['defaultLocale']
            route = next((row for row in rows if row.get('page') == selected['id'] and row.get('locale') == selected_locale), None)
            if route is None:
                raise EngineError('The selected page and locale have no compiled route. Detail templates require a published CMS item.', 422)
            path = str(route.get('path', ''))
            target = folder.joinpath(*safe_export_path(path).parts).resolve()
            if not target.is_relative_to(folder.resolve()) or not target.is_file():
                raise EngineError('The compiler manifest references unavailable preview bytes.', 409)
            path = path[:-10] if path.endswith('index.html') else path
            return {'url': f'{PUBLIC_BASE}/preview/{token}/{path}', 'revision': state['revision'], 'token': token, 'expiresIn': 3600, 'warnings': result.get('warnings', [])}

    def preview_site(self, token):
        row = self.store.db.execute('SELECT site,revision,expires FROM previews WHERE token=?', (token,)).fetchone()
        if not row or row['expires'] < time.time():
            raise EngineError('Preview expired or unavailable.', 404)
        return json.loads(row['site'])

    def valid_preview(self, token):
        if not isinstance(token, str) or len(token) > 64:
            return False
        row = self.store.db.execute('SELECT expires FROM previews WHERE token=?', (token,)).fetchone()
        return bool(row and row['expires'] > time.time())

    def redirect(self, slug, version, path, preview_token=None):
        site = self.preview_site(preview_token) if preview_token else self.release(slug, version)['site']
        root = DATA_DIR / 'previews' / preview_token if preview_token else DATA_DIR / 'publications' / slug / version
        manifest_path = root / 'redirects.json'
        if manifest_path.is_file():
            manifest = json.loads(manifest_path.read_text())
            rows = manifest.get('redirects', manifest) if isinstance(manifest, dict) else manifest
        else:
            rows = site.get('extensions', {}).get('seo', {}).get('redirects', [])
        if isinstance(rows, dict):
            rows = [{'from': source, 'to': target.get('to'), 'status': target.get('status', 301)} if isinstance(target, dict) else {'from': source, 'to': target, 'status': 301} for source, target in rows.items()]
        if not isinstance(rows, list):
            raise EngineError('Release redirect manifest is invalid.', 409)
        mapping = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            source = row.get('from', row.get('source'))
            target = row.get('to', row.get('target'))
            status = row.get('status', 301)
            if isinstance(source, str) and isinstance(target, str) and status in (301, 302, 307, 308):
                mapping[source.rstrip('/') or '/'] = (target, status)
        source = ('/' + path.lstrip('/')).rstrip('/') or '/'
        seen = set()
        while source in mapping:
            if source in seen:
                raise EngineError('Release redirects contain a cycle.', 409)
            seen.add(source)
            target, status = mapping[source]
            if source == ('/' + path.lstrip('/')).rstrip('/') or source == '/' and not path:
                first = (target, status)
            if target.startswith(('https://', 'http://')):
                return first
            source = target.rstrip('/') or '/'
        return first if seen else None
