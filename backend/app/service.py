import asyncio
import io
import json
import os
import re
import shutil
import time
import zipfile
from collections import defaultdict, deque
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import uuid4

from .access import AccessControl, actor
from .assets import bundle_assets, file_bytes, project_envelope
from .collaboration import Collaboration
from .config import DATA_DIR, PUBLIC_BASE
from .delivery import DeliveryQueue
from .engine import EngineError, RustEngine
from .forms import Forms
from .releases import Releases
from .passwords import PagePasswords
from .team_library import TeamLibraries
from .substrate import Approvals, Registry
from .store import Store, now


def safe_export_path(value: str) -> PurePosixPath:
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        raise EngineError('Invalid export path.')
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ('.', '..', '') for part in value.split('/')) or ':' in value:
        raise EngineError('Unsafe export path.')
    return path


class Studio:
    def __init__(self):
        self.engine = RustEngine()
        self.store: Store | None = None
        self.action_lock = asyncio.Lock()
        self.subscribers: set[asyncio.Queue] = set()
        self.agents_enabled = os.getenv('FORMWEB_AGENTS', '0') == '1'
        self.rate_limits: dict[str, deque] = defaultdict(deque)

    async def start(self):
        self.store = Store()
        self.access = AccessControl(self.store)
        self.collaboration = Collaboration(self)
        self.forms = Forms(self)
        self.releases = Releases(self)
        self.approvals = Approvals(self)
        self.passwords = PagePasswords(self)
        self.team_libraries = TeamLibraries(self)
        self.substrates = Registry(self)
        self.delivery = DeliveryQueue(self.store)
        await self.engine.start()
        checkpoint = self.store.get_meta('autosaveCheckpoint')
        autosave = self.store.get_meta('autosave')
        if checkpoint:
            await self.engine.request('restore', {'checkpoint': checkpoint, 'restoreRevision': checkpoint['revision']})
        elif autosave:
            await self.engine.request('load', {'site': autosave['site'], 'restoreRevision': autosave['revision']})
        await self.persist(await self.state())
        self.forms.apply_retention()
        await self.delivery.start()
        self.retention_task = asyncio.create_task(self.retention_loop())

    async def retention_loop(self):
        while True:
            await asyncio.sleep(60)
            async with self.action_lock:
                self.forms.apply_retention()

    async def close(self):
        if getattr(self, 'retention_task', None):
            self.retention_task.cancel()
            try:
                await self.retention_task
            except asyncio.CancelledError:
                pass
            self.retention_task = None
        if hasattr(self, 'delivery'):
            await self.delivery.close()
        await self.engine.close()
        if self.store:
            self.store.close()
            self.store = None

    async def state(self):
        self.access.authorize('read')
        return await self.engine.request('state')

    async def persist(self, state: dict[str, Any]):
        checkpoint = await self.engine.request('checkpoint')
        metadata = {'autosave': state, 'autosaveCheckpoint': checkpoint}
        branch_id = self.store.get_meta('activeBranch')
        project_id = self.store.get_meta('currentProject')
        if branch_id:
            self.store.db.execute('UPDATE branches SET site=?,updated_at=? WHERE id=?', (json.dumps(state['site']), now(), branch_id))
            metadata['branchCheckpoint:' + branch_id] = checkpoint
        elif project_id:
            self.store.db.execute('UPDATE projects SET site=?,revision=?,updated_at=? WHERE id=?', (json.dumps(state['site']), state['revision'], now(), project_id))
            self.store.db.execute('INSERT INTO project_checkpoints VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET checkpoint=excluded.checkpoint', (project_id, json.dumps(checkpoint)))
        self.store.set_metas(metadata)
        for queue in tuple(self.subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait((state, self.access.project_key()))
        return state

    async def mutate(self, method: str, params: dict[str, Any]):
        identity = self.access.authorize('edit')
        # FW-067: only someone who can manage the project may turn brand restrictions on or off.
        batch = params.get('commands') if method == 'batch' else [params]
        if any(isinstance(item, dict) and item.get('command') == 'site.update' and 'brandRestrict' in (((item.get('params') or {}).get('patch') or {}).get('settings') or {}) for item in batch or []):
            self.access.authorize('manage')
        previous_role = self.access.role()
        async with self.action_lock:
            result = await self.engine.request(method, params)
            state = result if isinstance(result, dict) and 'site' in result else await self.engine.request('state')
            if method in ('new', 'load', 'restore'):
                self.store.set_metas({'currentProject': None, 'activeBranch': None})
                if not identity['root']:
                    self.store.db.execute('INSERT OR REPLACE INTO members VALUES(?,?,?)', (state['site']['id'], identity['id'], previous_role))
                    self.store.db.commit()
            self.access.record('engine.' + method, {'command': params.get('command'), 'revision': state['revision']})
            return await self.persist(state)

    async def save_project(self, name: str | None = None):
        self.access.authorize('edit')
        async with self.action_lock:
            state = await self.state()
            checkpoint = await self.engine.request('checkpoint')
            active_branch = self.store.get_meta('activeBranch')
            if active_branch:
                result = await self.collaboration.capture(active_branch)
                self.store.set_meta('branchCheckpoint:' + active_branch, checkpoint)
                return {**result, 'branch': True, 'name': self.collaboration.branch(active_branch)['name'], 'downloadUrl': '/api/project-file'}
            previous_key = self.access.project_key()
            envelope = project_envelope(state['site'], checkpoint)
            result = self.store.save_project(state, name, self.store.get_meta('currentProject'), checkpoint)
            if previous_key != result['id']:
                self.store.db.execute('INSERT OR IGNORE INTO members SELECT ?,identity_id,role FROM members WHERE project_id=?', (result['id'], previous_key))
                for table in ('library_versions', 'asset_owners', 'comments', 'presence', 'activity', 'release_projects'):
                    if self.store.db.execute('SELECT 1 FROM sqlite_master WHERE type=? AND name=?', ('table', table)).fetchone():
                        self.store.db.execute(f'UPDATE {table} SET project_id=? WHERE project_id=?', (result['id'], previous_key))
                self.store.db.commit()
            folder = DATA_DIR / 'projects'
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / (result['id'] + '.fweb')
            pending = folder / ('.pending-' + uuid4().hex)
            pending.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding='utf-8')
            pending.replace(target)
            self.access.record('project.save', {'id': result['id'], 'revision': state['revision']})
            return {**result, 'path': str(target), 'downloadUrl': '/api/projects/' + result['id'] + '/file'}

    async def open_project(self, project_id: str):
        self.access.authorize('edit', project_id)
        async with self.action_lock:
            site = self.store.project(project_id)
            if site is None:
                raise EngineError('Project not found.', 404)
            checkpoint = self.store.project_checkpoint(project_id)
            state = await self.engine.request('restore', {'checkpoint': checkpoint}) if checkpoint else await self.engine.request('load', {'site': site})
            self.store.set_metas({'currentProject': project_id, 'activeBranch': None})
            self.access.record('project.open', {'id': project_id}, project_id)
            return await self.persist(state)

    def projects(self):
        self.access.authorize('read')
        return {'projects': [row for row in self.store.projects()['projects'] if self.access.role(row['id']) in ('viewer', 'reviewer', 'editor', 'publisher', 'owner')]}

    async def delete_project(self, project_id):
        self.access.authorize('manage', project_id)
        if self.store.project(project_id) is None:
            raise EngineError('Project not found.', 404)
        async with self.action_lock:
            self.access.record('project.delete', {'id': project_id}, project_id)
            branch_ids = [row['id'] for row in self.store.db.execute('SELECT id FROM branches WHERE project_id=?', (project_id,))]
            self.store.db.executemany('DELETE FROM meta WHERE key=?', [('branchCheckpoint:' + branch_id,) for branch_id in branch_ids])
            for table, column in (('projects', 'id'), ('project_checkpoints', 'project_id'), ('members', 'project_id'), ('branches', 'project_id'), ('comments', 'project_id'), ('presence', 'project_id')):
                self.store.db.execute(f'DELETE FROM {table} WHERE {column}=?', (project_id,))
            self.store.db.commit()
            (DATA_DIR / 'projects' / (project_id + '.fweb')).unlink(missing_ok=True)
            if self.store.get_meta('currentProject') == project_id:
                state = await self.engine.request('new', {})
                self.store.set_metas({'currentProject': None, 'activeBranch': None})
                identity = actor.get()
                if not identity['root']:
                    self.store.db.execute('INSERT OR REPLACE INTO members VALUES(?,?,?)', (state['site']['id'], identity['id'], 'owner'))
                    self.store.db.commit()
                await self.persist(state)
            return {'id': project_id, 'deleted': True}

    async def export_files(self, locale: str | None = None):
        self.access.authorize('read')
        if locale is not None and len(locale) > 40:
            raise EngineError('Locale is too long.')
        params = {'formsEndpoint': PUBLIC_BASE}
        if locale is not None:
            params['locale'] = locale
        result = await self.engine.request('export', params)
        if any('data-fw-form="true"' in file['content'] for file in result['files']):
            result['warnings'] = list(result.get('warnings', [])) + ['Form submissions use the local FormWeb backend; keep it running or replace form actions before external deployment.']
        for file in result['files']:
            safe_export_path(file['path'])
        return bundle_assets(result)

    async def export_zip(self, locale: str | None = None):
        self.passwords.guard_export((await self.state())['site']['id'])
        result = await self.export_files(locale)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in result['files']:
                info = zipfile.ZipInfo(file['path'], date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, file_bytes(file))
        return output.getvalue(), result

    async def export_to_path(self, locale: str | None = None):
        data, manifest = await self.export_zip(locale)
        folder = DATA_DIR / 'exports'
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f'site-{uuid4().hex[:12]}.zip'
        target.write_bytes(data)
        self.store.set_meta('export:' + target.name, self.access.project_key())
        self.access.record('site.export', {'file': target.name})
        return {'path': str(target), 'files': [file['path'] for file in manifest['files']], 'warnings': manifest.get('warnings', []), 'downloadUrl': f'/api/exports/{target.name}'}

    async def publish(self, slug: str | None = None):
        self.access.authorize('publish')
        if self.store.get_meta('activeBranch'):
            raise EngineError('Review and merge this branch into its main project before publishing.', 409)
        async with self.action_lock:
            state = await self.state()
            slug = slug or re.sub(r'[^a-z0-9]+', '-', state['site']['name'].lower()).strip('-')[:60] or 'site'
            if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?', slug):
                raise EngineError('Publication slug must contain 1 to 64 lowercase letters, numbers or hyphens.')
            version = now().replace('-', '').replace(':', '').replace('.', '').replace('+', '-') + '-' + uuid4().hex[:6]
            root = DATA_DIR / 'publications' / slug
            root.mkdir(parents=True, exist_ok=True)
            temp = root / ('.pending-' + uuid4().hex)
            target = root / version
            result = bundle_assets(await self.engine.request('export', {'locale': state['site'].get('defaultLocale', 'en'), 'formsEndpoint': f'{PUBLIC_BASE}/published/{slug}/{version}', 'baseUrl': f'{PUBLIC_BASE}/published/{slug}/{version}/', 'privateMembers': True}))
            try:
                temp.mkdir()
                for file in result['files']:
                    relative = safe_export_path(file['path'])
                    path = temp.joinpath(*relative.parts)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(file_bytes(file))
                entry_path = self.releases.entry_path(state['site'], temp)
                temp.rename(target)
                self.store.add_publication(slug, version, state['site'])
                self.releases.remember(slug, version)
                self.access.record('release.create', {'slug': slug, 'version': version})
            except Exception:
                shutil.rmtree(temp, ignore_errors=True)
                shutil.rmtree(target, ignore_errors=True)
                raise
            return {'url': f'{PUBLIC_BASE}/published/{slug}/{version}/{entry_path}', 'version': version, 'slug': slug, 'local': True, 'warnings': result.get('warnings', [])}

    def allow_form_request(self, address: str):
        stamp = time.monotonic()
        queue = self.rate_limits[address]
        while queue and queue[0] < stamp - 60:
            queue.popleft()
        if len(queue) >= 12:
            raise EngineError('Too many submissions. Wait one minute.', 429)
        queue.append(stamp)
        if len(self.rate_limits) > 4096:
            for key in tuple(self.rate_limits):
                if not self.rate_limits[key] or self.rate_limits[key][-1] < stamp - 60:
                    del self.rate_limits[key]

    async def submit_form(self, site_id: str, form_id: str, values: dict[str, Any], address: str, slug: str | None = None, version: str | None = None, preview_token: str | None = None):
        self.allow_form_request(address)
        if values.get('_formweb_hp'):
            raise EngineError('Submission rejected.', 400)
        if preview_token:
            site = self.releases.preview_site(preview_token)
            if site['id'] != site_id:
                raise EngineError('Preview site does not match this form.', 404)
            source = 'preview'
        elif slug is not None or version is not None:
            if not slug or not version:
                raise EngineError('Publication slug and version must both be supplied.')
            site = self.store.publication_site(site_id, slug, version)
            source = 'published'
        else:
            site = self.store.published_site(site_id)
            if site is None:
                current = await self.engine.request('state')
                site = current['site'] if current['site']['id'] == site_id else None
            source = 'local-export'
        if not site:
            raise EngineError('Site not found.', 404)
        output, tracking, config = self.forms.validate(site, form_id, values)
        result = self.store.add_submission(site_id, form_id, output)
        publication = f'{slug}/{version}' if slug and version else None
        self.forms.record_tracking(result['id'], tracking, source, publication)
        submission = {**result, 'siteId': site_id, 'formId': form_id, 'values': output, 'tracking': tracking, 'source': source, 'publication': publication}
        delivery = await self.delivery.enqueue(submission)
        return {**result, 'successMessage': config.get('successMessage', 'Your submission was stored.'), 'successRedirect': config.get('successRedirect'), 'delivery': delivery}


studio = Studio()
