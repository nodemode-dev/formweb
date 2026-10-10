import asyncio
import json
import math
import os
import time
from uuid import uuid4

from ..engine import EngineError
from .common import bounded_text, checked_url, json_environment, key, redact, remote, required, store


class DataProviders:
    def __init__(self):
        self.fetch_states = {}
        self.locks = {}
        self.review_lock = asyncio.Lock()

    def sources(self):
        config = json_environment('FORMWEB_FETCH_SOURCES')
        return [{'id': name, 'status': self.fetch_states.get(name, {}).get('status', 'idle'), 'public': value.get('public') is True} for name, value in config.items() if isinstance(value, dict)]

    async def fetch(self, source, params=None, public=False):
        source = key(source, 'source')
        config = json_environment('FORMWEB_FETCH_SOURCES').get(source)
        if not isinstance(config, dict):
            raise EngineError('Data source is unconfigured on the server.', 503)
        if public and config.get('public') is not True:
            raise EngineError('Data source is not enabled for visitors.', 403)
        allowed_params, fields, configured_headers = config.get('params', []), config.get('fields'), config.get('headers', {})
        if not isinstance(allowed_params, list) or len(allowed_params) > 16 or any(not isinstance(name, str) or not 1 <= len(name) <= 128 for name in allowed_params):
            raise EngineError('Server source parameter configuration is invalid.', 503)
        if not isinstance(fields, list) or not fields or len(fields) > 64 or any(not isinstance(field, str) or not 1 <= len(field) <= 256 or any(not part for part in field.split('.')) for field in fields):
            raise EngineError('Data sources require bounded response field allowlists.', 503)
        if not isinstance(configured_headers, dict) or len(configured_headers) > 16:
            raise EngineError('Server source header configuration is invalid.', 503)
        params = {} if params is None else params
        if not isinstance(params, dict) or len(params) > 16 or any(not isinstance(name, str) or not isinstance(value, (str, int, float, bool)) or isinstance(value, float) and not math.isfinite(value) or len(str(value)) > 256 for name, value in params.items()):
            raise EngineError('Data source query parameters must be bounded scalar fields.')
        if set(params) - set(allowed_params):
            raise EngineError('Data source query parameters are not allowlisted.', 403)
        allowed = os.getenv('FORMWEB_FETCH_HOSTS', '').split(',')
        await checked_url(config.get('url'), [host.strip() for host in allowed if host.strip()])
        headers, secret_values = {}, []
        for name, environment in configured_headers.items():
            if not isinstance(name, str) or not 1 <= len(name) <= 128 or any(not character.isascii() or not (character.isalnum() or character in "!#$%&'*+-.^_`|~") for character in name) or name.lower() in ('host', 'content-length', 'transfer-encoding', 'connection') or not isinstance(environment, str) or not 1 <= len(environment) <= 128:
                raise EngineError('Server source header configuration is invalid.', 503)
            value = required(environment)[0]
            if '\n' in value or '\r' in value:
                raise EngineError('Server source header value is invalid.', 503)
            headers[name] = value
            secret_values.extend((value, value.removeprefix('Bearer ')))
        lock = self.locks.setdefault(source, asyncio.Lock())
        async with lock:
            self.fetch_states[source] = {'status': 'loading', 'started': time.time()}
            try:
                response = await remote('GET', config['url'], headers=headers, params=params)
                result = {}
                for field in fields:
                    current = response
                    for part in field.split('.'):
                        if not isinstance(current, dict) or part not in current:
                            current = None
                            break
                        current = current[part]
                    result[field] = redact(current, secret_values)
                output = {'source': source, 'status': 'ready', 'data': result, 'received': time.time()}
                self.fetch_states[source] = output
                return output
            except EngineError as error:
                self.fetch_states[source] = {'source': source, 'status': 'error', 'error': str(error), 'received': time.time()}
                raise

    async def translate(self, studio, payload):
        endpoint = required('FORMWEB_TRANSLATE_URL')[0].rstrip('/') + '/translate'
        target = key(payload.get('target'), 'target')
        state = await studio.state()
        source = payload.get('source') or state['site'].get('defaultLocale', 'en')
        key(source, 'source')
        entries = payload.get('entries')
        if not isinstance(entries, dict) or not entries or len(entries) > 100:
            raise EngineError('Supply 1 to 100 translation entries.')
        if any(not isinstance(name, str) or len(name) > 200 or not isinstance(value, str) or len(value) > 8192 for name, value in entries.items()):
            raise EngineError('Translation entries must contain bounded text.')
        queue_id = uuid4().hex
        record = {'id': queue_id, 'site': state['site']['id'], 'source': source, 'target': target, 'originals': entries, 'translations': {}, 'status': 'loading', 'created': time.time(), 'provider': 'LibreTranslate', 'baseRevision': state['revision']}
        store.put('translations', queue_id, record)
        try:
            for name, value in entries.items():
                body = {'q': value, 'source': source, 'target': target, 'format': 'text'}
                secret = os.getenv('FORMWEB_TRANSLATE_KEY')
                if secret:
                    body['api_key'] = secret
                result = await remote('POST', endpoint, json=body)
                text = result.get('translatedText') if isinstance(result, dict) else None
                if not isinstance(text, str) or len(text) > 16384:
                    raise EngineError('Translation provider returned no bounded translated text.', 502)
                record['translations'][name] = redact(text, (secret,))
            record['status'] = 'review'
            store.put('translations', queue_id, record)
            return record
        except EngineError as error:
            record['status'], record['error'] = 'error', str(error)
            store.put('translations', queue_id, record)
            raise

    async def review(self, studio, queue_id, payload):
        async with self.review_lock:
            record = store.get('translations', key(queue_id))
            if not record:
                raise EngineError('Translation request was not found.', 404)
            state = await studio.state()
            if record['site'] != state['site']['id'] or record['status'] != 'review':
                raise EngineError('Only pending translations for the active site can be reviewed.', 409)
            if not isinstance(payload.get('accept'), bool):
                raise EngineError('Review requires an accept boolean.')
            if payload['accept']:
                translations = dict(state['site'].get('locales', {}).get(record['target'], {}))
                translations.update(record['translations'])
                await studio.mutate('exec', {'command': 'locale.set', 'params': {'locale': record['target'], 'translations': translations}, 'expectedRevision': payload.get('expectedRevision', state['revision'])})
            record['status'], record['reviewed'] = ('accepted' if payload['accept'] else 'rejected'), time.time()
            store.put('translations', queue_id, record)
            return record
