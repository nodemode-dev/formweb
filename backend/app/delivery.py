import asyncio
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
import re
import socket
import ssl
import time
from urllib.parse import urlsplit
from uuid import uuid4

from .engine import EngineError
from .store import now


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, secure):
        super().__init__(host, port, timeout=8)
        self.address = address
        self.secure = secure

    def connect(self):
        connection = socket.create_connection((self.address, self.port), self.timeout)
        if self.secure:
            context = ssl.create_default_context()
            context.set_alpn_protocols(['http/1.1'])
            try:
                connection = context.wrap_socket(connection, server_hostname=self.host)
            except BaseException:
                connection.close()
                raise
        self.sock = connection


def endpoint(value):
    if not isinstance(value, dict) or set(value) - {'id', 'url', 'secretEnv', 'formId', 'enabled'}:
        raise EngineError('Webhook endpoint has unsupported fields.')
    if not isinstance(value.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', value['id']):
        raise EngineError('Webhook endpoint needs a stable identifier.')
    secret_env = value.get('secretEnv', '')
    if not isinstance(secret_env, str) or not re.fullmatch(r'FORMWEB_[A-Z0-9_]{1,120}', secret_env):
        raise EngineError('Webhook secretEnv must name a FORMWEB_ environment variable.')
    url = value.get('url', '')
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 33 for c in url):
        raise EngineError('Webhook URL is invalid.')
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise EngineError('Webhook hostname or port is invalid.') from error
    if parsed.username or parsed.password or parsed.fragment or parsed.query or not parsed.hostname or parsed.scheme not in ('http', 'https'):
        raise EngineError('Webhook URL requires an HTTP(S) hostname without credentials, query or fragment.')
    host = parsed.hostname.lower()
    fixture = os.getenv('FORMWEB_ALLOW_LOCAL_WEBHOOKS') == '1' and host in ('127.0.0.1', 'localhost', '::1')
    hosts = {part.strip().lower() for part in os.getenv('FORMWEB_WEBHOOK_HOSTS', '').split(',') if part.strip()}
    if not fixture and (parsed.scheme != 'https' or host not in hosts or port not in (None, 443)):
        raise EngineError('Webhook requires an allowlisted HTTPS host on port 443. Loopback fixtures need explicit local opt-in.')
    form_id = value.get('formId')
    if form_id is not None and (not isinstance(form_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', form_id)):
        raise EngineError('Webhook formId is invalid.')
    if 'enabled' in value and not isinstance(value['enabled'], bool):
        raise EngineError('Webhook enabled must be a boolean.')
    return {**value, 'enabled': value.get('enabled', True)}


class DeliveryQueue:
    def __init__(self, store):
        self.store = store
        self.task = None
        self.wake = asyncio.Event()
        self.stopping = False
        store.db.executescript('''
        CREATE TABLE IF NOT EXISTS delivery_jobs (
            id TEXT PRIMARY KEY, site_id TEXT NOT NULL, form_id TEXT NOT NULL,
            submission_id TEXT NOT NULL, endpoint_id TEXT NOT NULL, endpoint_json TEXT NOT NULL,
            body TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL,
            due REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            last_status INTEGER, last_error TEXT,
            UNIQUE(submission_id,endpoint_id)
        );
        CREATE TABLE IF NOT EXISTS delivery_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, attempt INTEGER NOT NULL,
            created_at TEXT NOT NULL, status INTEGER, error TEXT
        );
        CREATE INDEX IF NOT EXISTS delivery_due ON delivery_jobs(state,due);
        ''')
        store.db.commit()

    def get_config(self, site_id=None):
        if site_id is None:
            rows = self.store.db.execute("SELECT key,value FROM meta WHERE key LIKE 'delivery:%'").fetchall()
            configs = [json.loads(row['value']) for row in rows]
        else:
            configs = [self.store.get_meta('delivery:' + site_id) or {'siteId': site_id, 'endpoints': []}]
        result = []
        for config in configs:
            result.append({**config, 'endpoints': [{**item, 'secretConfigured': len(os.getenv(item['secretEnv'], '')) >= 16} for item in config['endpoints']]})
        return {'configurations': result}

    def configure(self, config):
        if not isinstance(config, dict) or set(config) != {'siteId', 'endpoints'} or not isinstance(config['siteId'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,96}', config['siteId']):
            raise EngineError('Delivery configuration requires siteId and endpoints.')
        entries = config['endpoints']
        if not isinstance(entries, list) or len(entries) > 32:
            raise EngineError('At most 32 webhook endpoints may be configured per site.')
        checked = [endpoint(item) for item in entries]
        if len({item['id'] for item in checked}) != len(checked):
            raise EngineError('Webhook endpoint identifiers must be unique.')
        self.store.set_meta('delivery:' + config['siteId'], {'siteId': config['siteId'], 'endpoints': checked})
        return self.get_config(config['siteId'])

    async def enqueue(self, submission, webhook_id=None):
        site_id, form_id, submission_id = (submission.get(key) for key in ('siteId', 'formId', 'id'))
        if not all(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,96}', value) for value in (site_id, form_id, submission_id)):
            raise EngineError('Delivery submission identity is invalid.')
        config = self.store.get_meta('delivery:' + site_id) or {'endpoints': []}
        entries = [item for item in config['endpoints'] if item['enabled'] and (item.get('formId') in (None, form_id)) and (webhook_id is None or item['id'] == webhook_id)]
        if webhook_id is not None and not entries:
            return {'jobs': [], 'warning': 'Submission stored, but the selected webhook is unavailable.'}
        body = json.dumps({'event': 'form.submitted', 'submission': submission}, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        if len(body.encode()) > 131072:
            raise EngineError('Delivery payload is too large.')
        queued = []
        with self.store.db:
            count = self.store.db.execute('SELECT count(*) FROM delivery_jobs').fetchone()[0]
            if count + len(entries) > 100000:
                return {'jobs': [], 'warning': 'Submission stored, but the delivery queue retention limit has been reached.'}
            for item in entries:
                existing = self.store.db.execute('SELECT id FROM delivery_jobs WHERE submission_id=? AND endpoint_id=?', (submission_id, item['id'])).fetchone()
                if existing:
                    queued.append(existing['id'])
                    continue
                job_id = uuid4().hex
                available = len(os.getenv(item['secretEnv'], '')) >= 16
                self.store.db.execute('INSERT INTO delivery_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (job_id, site_id, form_id, submission_id, item['id'], json.dumps(item), body, 'queued' if available else 'blocked', 0, time.time(), now(), now(), None, None if available else 'Signing secret is not configured.'))
                queued.append(job_id)
        self.wake.set()
        return {'jobs': queued}

    def list_jobs(self, site_id=None):
        query = 'SELECT id,site_id,form_id,submission_id,endpoint_id,state,attempts,due,created_at,updated_at,last_status,last_error FROM delivery_jobs'
        args = ()
        if site_id is not None:
            query += ' WHERE site_id=?'
            args = (site_id,)
        rows = self.store.db.execute(query + ' ORDER BY created_at DESC LIMIT 500', args).fetchall()
        return {'jobs': [{
            'id': row['id'], 'siteId': row['site_id'], 'formId': row['form_id'], 'submissionId': row['submission_id'],
            'endpointId': row['endpoint_id'], 'state': row['state'], 'attempts': row['attempts'], 'nextAttemptAt': row['due'],
            'createdAt': row['created_at'], 'updatedAt': row['updated_at'], 'lastStatus': row['last_status'], 'lastError': row['last_error'],
            'history': [dict(attempt) for attempt in self.store.db.execute('SELECT attempt,created_at,status,error FROM delivery_attempts WHERE job_id=? ORDER BY id', (row['id'],))]
        } for row in rows]}

    def prune(self, submission_ids):
        removed = 0
        with self.store.db:
            for submission_id in submission_ids:
                self.store.db.execute('DELETE FROM delivery_attempts WHERE job_id IN (SELECT id FROM delivery_jobs WHERE submission_id=?)', (submission_id,))
                removed += self.store.db.execute('DELETE FROM delivery_jobs WHERE submission_id=?', (submission_id,)).rowcount
        self.wake.set()
        return {'removedJobs': removed}

    def retry(self, job_id):
        row = self.store.db.execute('SELECT state FROM delivery_jobs WHERE id=?', (job_id,)).fetchone()
        if row is None:
            raise EngineError('Delivery job not found.', 404)
        if row['state'] in ('inflight', 'delivered'):
            raise EngineError('Only failed, blocked or queued deliveries may be retried.', 409)
        self.store.db.execute("UPDATE delivery_jobs SET state='queued',due=?,updated_at=?,last_error=NULL WHERE id=?", (time.time(), now(), job_id))
        self.store.db.commit()
        self.wake.set()
        return {'id': job_id, 'state': 'queued'}

    async def start(self):
        self.store.db.execute("UPDATE delivery_jobs SET state='queued',due=? WHERE state='inflight'", (time.time(),))
        self.store.db.commit()
        self.stopping = False
        self.task = asyncio.create_task(self._worker())

    async def close(self):
        self.stopping = True
        self.wake.set()
        if self.task:
            try:
                await asyncio.wait_for(asyncio.shield(self.task), 12)
            except asyncio.TimeoutError:
                self.task.cancel()
                try:
                    await self.task
                except asyncio.CancelledError:
                    pass
            self.task = None

    async def _send(self, item, body, job_id):
        item = endpoint(item)
        secret = os.getenv(item['secretEnv'], '')
        if len(secret) < 16:
            return None, 'Signing secret is not configured.', True
        parsed = urlsplit(item['url'])
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        addresses = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM), 3)
        ips = sorted({record[4][0] for record in addresses})
        fixture = os.getenv('FORMWEB_ALLOW_LOCAL_WEBHOOKS') == '1' and parsed.hostname in ('127.0.0.1', 'localhost', '::1')
        if not ips or any(not (ipaddress.ip_address(address).is_global or (fixture and ipaddress.ip_address(address).is_loopback)) for address in ips):
            return None, 'Webhook destination address is not permitted.', True
        stamp = str(int(time.time()))
        payload = body.encode('utf-8')
        signature = hmac.new(secret.encode(), stamp.encode() + b'.' + job_id.encode() + b'.' + payload, hashlib.sha256).hexdigest()
        headers = {'Content-Type': 'application/json', 'User-Agent': 'FormWeb-Webhook/1', 'X-FormWeb-Delivery': job_id, 'X-FormWeb-Timestamp': stamp, 'X-FormWeb-Signature': 'sha256=' + signature}
        def send():
            connection = PinnedConnection(parsed.hostname, port, ips[0], parsed.scheme == 'https')
            try:
                connection.request('POST', parsed.path or '/', body=payload, headers=headers)
                response = connection.getresponse()
                response.read(65537)
                code = response.status
                return code, None if 200 <= code < 300 else 'Remote endpoint returned HTTP ' + str(code) + '.', 400 <= code < 500 and code not in (408, 429)
            finally:
                connection.close()
        return await asyncio.to_thread(send)

    async def _worker(self):
        while not self.stopping:
            row = self.store.db.execute("SELECT * FROM delivery_jobs WHERE state='queued' AND due<=? ORDER BY due,id LIMIT 1", (time.time(),)).fetchone()
            if row is None:
                self.wake.clear()
                try:
                    await asyncio.wait_for(self.wake.wait(), 1)
                except asyncio.TimeoutError:
                    pass
                continue
            attempt = row['attempts'] + 1
            self.store.db.execute("UPDATE delivery_jobs SET state='inflight',attempts=?,updated_at=? WHERE id=? AND state='queued'", (attempt, now(), row['id']))
            self.store.db.commit()
            try:
                status, error, permanent = await asyncio.wait_for(self._send(json.loads(row['endpoint_json']), row['body'], row['id']), 10)
            except EngineError:
                status, error, permanent = None, 'Webhook configuration is no longer permitted.', True
            except (OSError, ValueError, http.client.HTTPException, asyncio.TimeoutError):
                status, error, permanent = None, 'Webhook connection failed or timed out.', False
            if self.store.db.execute('SELECT 1 FROM delivery_jobs WHERE id=?', (row['id'],)).fetchone() is None:
                continue
            state = 'delivered' if error is None else ('blocked' if status is None and permanent else 'failed' if permanent or attempt >= 8 else 'queued')
            due = time.time() + min(3600, 2 ** min(attempt, 12))
            with self.store.db:
                self.store.db.execute('INSERT INTO delivery_attempts(job_id,attempt,created_at,status,error) VALUES(?,?,?,?,?)', (row['id'], attempt, now(), status, error))
                self.store.db.execute('UPDATE delivery_jobs SET state=?,due=?,updated_at=?,last_status=?,last_error=? WHERE id=?', (state, due, now(), status, error, row['id']))
