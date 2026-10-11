import asyncio
import ipaddress
import json
import os
import re
import socket
import sqlite3
import time
from contextlib import contextmanager
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urlsplit

import httpx2

from ..config import DATA_DIR
from ..engine import EngineError


def required(*names):
    missing = [name for name in names if not os.getenv(name)]
    if missing:
        raise EngineError('Provider is unconfigured. Set server environment: ' + ', '.join(missing), 503)
    return [os.environ[name] for name in names]


def status(*names):
    missing = [name for name in names if not os.getenv(name)]
    return {'status': 'unconfigured' if missing else 'configured', 'missing': missing, 'remoteVerified': False}


def bounded_text(value, name, maximum=128):
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise EngineError(name + ' must be a nonempty bounded string.')
    return value


def key(value, name='key'):
    value = bounded_text(value, name)
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', value):
        raise EngineError(name + ' has invalid characters.')
    return value


def json_environment(name):
    try:
        result = json.loads(os.getenv(name, '{}'))
    except ValueError as error:
        raise EngineError(name + ' must be a JSON object on the server.', 503) from error
    if not isinstance(result, dict):
        raise EngineError(name + ' must be a JSON object on the server.', 503)
    return result


async def checked_url(url, allowed_hosts=None):
    if not isinstance(url, str) or len(url) > 2048:
        raise EngineError('Provider endpoint is invalid.', 503)
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        port = parsed.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError('Invalid endpoint port.')
    except ValueError as error:
        raise EngineError('Provider endpoint URL or port is invalid.', 503) from error
    local = host in ('127.0.0.1', 'localhost', '::1') and os.getenv('FORMWEB_PROVIDER_ALLOW_LOOPBACK') == '1'
    if not host or parsed.username or parsed.password or parsed.fragment or parsed.scheme != 'https' and not (local and parsed.scheme == 'http'):
        raise EngineError('Provider endpoints require HTTPS without credentials or fragments.', 503)
    if allowed_hosts is not None and host not in allowed_hosts:
        raise EngineError('Provider endpoint host is not allowlisted.', 403)
    if not local:
        try:
            addresses = await asyncio.get_running_loop().run_in_executor(None, lambda: socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM))
        except OSError as error:
            raise EngineError('Provider host could not be resolved.', 502) from error
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise EngineError('Provider endpoint resolved to a non-public address.', 403)
    return url


async def remote(method, url, maximum=4 * 1024 * 1024, **kwargs):
    from .transport import pinned_json
    await checked_url(url)
    return await pinned_json(method, url, maximum=maximum, **kwargs)


def redact(value, secrets=()):
    if isinstance(value, dict):
        return {name: redact(item, secrets) for name, item in value.items() if name.lower().replace('-', '').replace('_', '') not in ('authorization', 'apikey', 'token', 'password', 'secret', 'accesstoken', 'privatekey', 'envvars', 'buildconfig')}
    if isinstance(value, list):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if isinstance(secret, str) and len(secret) >= 4:
                value = value.replace(secret, '[redacted]')
    return value


class ProviderStore:
    @contextmanager
    def connection(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = DATA_DIR / 'providers.sqlite3'
        connection = sqlite3.connect(path)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('CREATE TABLE IF NOT EXISTS records (namespace TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(namespace,id))')
        connection.execute('CREATE TABLE IF NOT EXISTS visitors (site TEXT NOT NULL, email TEXT NOT NULL, salt TEXT NOT NULL, digest TEXT NOT NULL, groups_json TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(site,email))')
        connection.execute('CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, site TEXT NOT NULL, email TEXT NOT NULL, expires REAL NOT NULL)')
        connection.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, site TEXT NOT NULL, visitor TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, experiment TEXT NOT NULL, variant TEXT NOT NULL, value REAL NOT NULL, created REAL NOT NULL)')
        connection.commit()
        try:
            path.chmod(0o600)
        except OSError:
            pass
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def put(self, namespace, record_id, value):
        with self.connection() as db:
            db.execute('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET value=excluded.value,updated=excluded.updated', (namespace, record_id, json.dumps(value, ensure_ascii=False), time.time()))
        return value

    def get(self, namespace, record_id, default=None):
        with self.connection() as db:
            row = db.execute('SELECT value FROM records WHERE namespace=? AND id=?', (namespace, record_id)).fetchone()
        return json.loads(row['value']) if row else default

    def list(self, namespace, limit=200):
        with self.connection() as db:
            rows = db.execute('SELECT value FROM records WHERE namespace=? ORDER BY updated DESC LIMIT ?', (namespace, limit)).fetchall()
        return [json.loads(row['value']) for row in rows]


class RateLimit:
    def __init__(self):
        self.entries = defaultdict(deque)

    def check(self, address, limit=20):
        stamp = time.monotonic()
        queue = self.entries[address]
        while queue and queue[0] < stamp - 60:
            queue.popleft()
        if len(queue) >= limit:
            raise EngineError('Too many runtime requests. Wait one minute.', 429)
        queue.append(stamp)
        if len(self.entries) > 4096:
            for name in tuple(self.entries):
                if not self.entries[name] or self.entries[name][-1] < stamp - 60:
                    del self.entries[name]


store = ProviderStore()
rate_limit = RateLimit()
