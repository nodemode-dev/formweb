import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import re
import time
from urllib.parse import quote, urlsplit

from ..assets import file_bytes
from ..engine import EngineError
from .common import key, redact, remote, required, store


class CloudflarePages:
    def __init__(self):
        self.lock = asyncio.Lock()

    def configuration(self):
        token, account, project = required('FORMWEB_CLOUDFLARE_TOKEN', 'FORMWEB_CLOUDFLARE_ACCOUNT', 'FORMWEB_CLOUDFLARE_PROJECT')
        if not re.fullmatch(r'[A-Za-z0-9]{1,32}', account) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', project):
            raise EngineError('Cloudflare account or project configuration is invalid.', 503)
        base = os.getenv('FORMWEB_CLOUDFLARE_API', 'https://api.cloudflare.com/client/v4').rstrip('/')
        if base != 'https://api.cloudflare.com/client/v4' and not (os.getenv('FORMWEB_PROVIDER_ALLOW_LOOPBACK') == '1' and urlsplit(base).hostname in ('127.0.0.1', 'localhost', '::1')):
            raise EngineError('Cloudflare API override is restricted to explicit loopback fixtures.', 503)
        return base, '/accounts/' + account + '/pages/projects/' + project, token

    async def call(self, method, path, token=None, **kwargs):
        base, _, configured = self.configuration()
        response = await remote(method, base + path, headers={'Authorization': 'Bearer ' + (token or configured)}, **kwargs)
        if not isinstance(response, dict) or response.get('success') is not True:
            raise EngineError('Cloudflare rejected the operation.', 502)
        return redact(response.get('result'), (configured, token))

    def deployment_result(self, result):
        if not isinstance(result, dict) or not isinstance(result.get('id'), str):
            raise EngineError('Cloudflare did not return a deployment identifier.', 502)
        return {name: result.get(name) for name in ('id', 'url', 'aliases', 'environment', 'created_on', 'latest_stage', 'stages')}

    async def deploy(self, studio, locale=None):
        _, project, _ = self.configuration()
        async with self.lock:
            async with studio.action_lock:
                state = await studio.state()
                if state['site'].get('extensions', {}).get('integrations', {}).get('gates'):
                    raise EngineError('Static remote deployment cannot enforce visitor gates. Deploy behind the FormWeb membership server.', 409)
                exported = await studio.export_files(locale)
            if len(exported['files']) > 20000:
                raise EngineError('Cloudflare direct upload supports at most 20000 files.')
            assets, manifest = {}, {}
            for file in exported['files']:
                content = file_bytes(file)
                if len(content) > 25 * 1024 * 1024:
                    raise EngineError('A deployment file exceeds 25 MiB.')
                content_type = mimetypes.guess_type(file['path'])[0] or 'application/octet-stream'
                digest = hashlib.sha256(content + b'\x00' + content_type.encode()).hexdigest()[:32]
                manifest['/' + file['path'].lstrip('/')] = digest
                assets[digest] = {'key': digest, 'value': base64.b64encode(content).decode(), 'base64': True, 'metadata': {'contentType': content_type}}
            upload = await self.call('GET', project + '/upload-token')
            if not isinstance(upload, dict) or not isinstance(upload.get('jwt'), str):
                raise EngineError('Cloudflare returned no upload token.', 502)
            missing = await self.call('POST', '/pages/assets/check-missing', upload['jwt'], json={'hashes': list(assets)})
            if not isinstance(missing, list) or any(item not in assets for item in missing):
                raise EngineError('Cloudflare returned an invalid missing-asset list.', 502)
            batch, size = [], 0
            for digest in missing:
                item = assets[digest]
                if batch and size + len(item['value']) > 10 * 1024 * 1024:
                    await self.call('POST', '/pages/assets/upload', upload['jwt'], json=batch)
                    batch, size = [], 0
                batch.append(item)
                size += len(item['value'])
            if batch:
                await self.call('POST', '/pages/assets/upload', upload['jwt'], json=batch)
            await self.call('POST', '/pages/assets/upsert-hashes', upload['jwt'], json={'hashes': list(assets)})
            fields = {'manifest': (None, json.dumps(manifest)), 'branch': (None, os.getenv('FORMWEB_CLOUDFLARE_BRANCH', 'main'))}
            result = self.deployment_result(await self.call('POST', project + '/deployments', files=fields))
            output = {'provider': 'Cloudflare Pages', 'status': result.get('latest_stage', {}).get('status', 'submitted') if isinstance(result.get('latest_stage'), dict) else 'submitted', 'site': state['site']['id'], 'revision': state['revision'], 'deployment': result, 'fileCount': len(manifest), 'warnings': exported.get('warnings', []), 'observed': time.time(), 'remoteVerified': os.getenv('FORMWEB_CLOUDFLARE_API', '').startswith('https://api.cloudflare.com') or not os.getenv('FORMWEB_CLOUDFLARE_API')}
            store.put('deployments', result['id'], output)
            return output

    async def deployment(self, deployment_id):
        _, project, _ = self.configuration()
        result = self.deployment_result(await self.call('GET', project + '/deployments/' + quote(key(deployment_id), safe='')))
        return {'provider': 'Cloudflare Pages', 'deployment': result, 'observed': time.time()}

    async def domains(self, name=None):
        _, project, _ = self.configuration()
        if name is not None and (not isinstance(name, str) or len(name) > 253 or not re.fullmatch(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}', name)):
            raise EngineError('Supply a valid fully qualified domain name.')
        result = await self.call('POST' if name else 'GET', project + '/domains', **({'json': {'name': name.lower()}} if name else {}))
        items = result if isinstance(result, list) else [result]
        domains = []
        for item in items:
            if not isinstance(item, dict):
                raise EngineError('Cloudflare returned invalid domain status.', 502)
            domains.append({name: item.get(name) for name in ('id', 'name', 'status', 'certificate_authority', 'validation_data', 'verification_data')})
        return {'provider': 'Cloudflare Pages', 'domains': domains, 'observed': time.time(), 'tls': 'Provider certificate authority and validation state; no live TLS handshake has been measured.'}
