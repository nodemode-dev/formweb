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

from .assets import bundle_assets, file_bytes, project_envelope
from .config import DATA_DIR, PUBLIC_BASE
from .engine import EngineError, RustEngine
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
        await self.engine.start()
        autosave = self.store.get_meta('autosave')
        if autosave:
            await self.engine.request('load', {'site': autosave['site']})
        await self.persist(await self.state())

    async def close(self):
        await self.engine.close()
        if self.store:
            self.store.close()
            self.store = None

    async def state(self):
        return await self.engine.request('state')

    async def persist(self, state: dict[str, Any]):
        self.store.set_meta('autosave', state)
        for queue in tuple(self.subscribers):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(state)
        return state

    async def mutate(self, method: str, params: dict[str, Any]):
        async with self.action_lock:
            result = await self.engine.request(method, params)
            state = result if isinstance(result, dict) and 'site' in result else await self.state()
            if method in ('new', 'load'):
                self.store.set_meta('currentProject', None)
            return await self.persist(state)

    async def save_project(self, name: str | None = None):
        async with self.action_lock:
            state = await self.state()
            result = self.store.save_project(state, name, self.store.get_meta('currentProject'))
            folder = DATA_DIR / 'projects'
            folder.mkdir(parents=True, exist_ok=True)
            target = folder / (result['id'] + '.fweb')
            pending = folder / ('.pending-' + uuid4().hex)
            envelope = project_envelope(state['site'])
            pending.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding='utf-8')
            pending.replace(target)
            return {**result, 'path': str(target), 'downloadUrl': '/api/projects/' + result['id'] + '/file'}

    async def open_project(self, project_id: str):
        async with self.action_lock:
            site = self.store.project(project_id)
            if site is None:
                raise EngineError('Project not found.', 404)
            state = await self.engine.request('load', {'site': site})
            self.store.set_meta('currentProject', project_id)
            return await self.persist(state)

    async def export_files(self, locale: str | None = None):
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
        return {'path': str(target), 'files': [file['path'] for file in manifest['files']], 'warnings': manifest.get('warnings', []), 'downloadUrl': f'/api/exports/{target.name}'}

    async def publish(self, slug: str | None = None):
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
            result = bundle_assets(await self.engine.request('export', {'locale': state['site'].get('defaultLocale', 'en'), 'formsEndpoint': f'{PUBLIC_BASE}/published/{slug}/{version}', 'baseUrl': f'{PUBLIC_BASE}/published/{slug}/{version}/'}))
            try:
                temp.mkdir()
                for file in result['files']:
                    relative = safe_export_path(file['path'])
                    path = temp.joinpath(*relative.parts)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(file_bytes(file))
                temp.rename(target)
                self.store.add_publication(slug, version, state['site'])
            except Exception:
                shutil.rmtree(temp, ignore_errors=True)
                shutil.rmtree(target, ignore_errors=True)
                raise
            return {'url': f'{PUBLIC_BASE}/published/{slug}/{version}/', 'version': version, 'slug': slug, 'local': True, 'warnings': result.get('warnings', [])}

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

    async def submit_form(self, site_id: str, form_id: str, values: dict[str, Any], address: str, slug: str | None = None, version: str | None = None):
        self.allow_form_request(address)
        if values.get('_formweb_hp'):
            raise EngineError('Submission rejected.', 400)
        if slug is not None or version is not None:
            if not slug or not version:
                raise EngineError('Publication slug and version must both be supplied.')
            site = self.store.publication_site(site_id, slug, version)
        else:
            state = await self.state()
            site = state['site'] if state['site']['id'] == site_id else self.store.published_site(site_id)
        if not site:
            raise EngineError('Site not found.', 404)
        form = site['nodes'].get(form_id)
        if not form or form['tag'] != 'form':
            raise EngineError('Form not found.', 404)
        fields: dict[str, dict] = {}
        pending = list(form.get('children', []))
        while pending:
            node = site['nodes'][pending.pop()]
            pending.extend(node.get('children', []))
            attrs = node.get('attrs', {})
            if node['tag'] in ('input', 'select', 'textarea') and attrs.get('name') and attrs.get('type') != 'submit':
                fields[attrs['name']] = node
        if len(values) > 64 or set(values) - set(fields) - {'_formweb_hp'}:
            raise EngineError('Submission contains unrecognized fields.')
        output = {}
        for name, field in fields.items():
            attrs = field.get('attrs', {})
            value = values.get(name, '')
            if not isinstance(value, (str, int, float, bool)):
                raise EngineError(f'{name}: value must be scalar.')
            value = str(value).strip()
            try:
                maximum = max(0, min(int(attrs.get('maxlength', '4096')), 4096))
            except (TypeError, ValueError):
                maximum = 4096
            if len(value) > maximum:
                raise EngineError(f'{name}: value is too long.')
            kind = attrs.get('type', 'text')
            if kind == 'file':
                raise EngineError(f'{name}: file uploads are not supported.')
            if kind == 'checkbox':
                checked = bool(value) and value.lower() not in ('false', '0', 'off')
                if 'required' in attrs and not checked:
                    raise EngineError(f'{name}: checkbox must be checked.')
                output[name] = checked
                continue
            if 'required' in attrs and not value:
                raise EngineError(f'{name}: value is required.')
            if value and kind == 'email' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
                raise EngineError(f'{name}: enter a valid email address.')
            if value and kind in ('number', 'range'):
                try:
                    number = float(value)
                    if not float('-inf') < number < float('inf'):
                        raise ValueError()
                    if 'min' in attrs and number < float(attrs['min']):
                        raise ValueError()
                    if 'max' in attrs and number > float(attrs['max']):
                        raise ValueError()
                except ValueError as error:
                    raise EngineError(f'{name}: number is outside the valid range.') from error
                output[name] = number
            else:
                output[name] = value
        return self.store.add_submission(site_id, form_id, output)


studio = Studio()
