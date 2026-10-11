"""Page password protection (FW-078), enforced by FormWeb's publish adapter.

A gate protects one route and everything under it (/ protects the whole site). Hashes live in the
service database, never in the site document, so they do not travel in .fweb files or exports.
A static export cannot protect anything, so exporting a site that has gates is refused with a reason.
Visitors unlock a gate with a form; the cookie is an HMAC over the gate's own hash, so changing or
removing the password signs everyone out of that gate.
"""
import hashlib
import hmac
import html
import re
import secrets
import time
from collections import defaultdict, deque

from .engine import EngineError
from .store import now

ITERATIONS = 310_000  # PBKDF2-HMAC-SHA256
ROUTE = re.compile(r'^/(?:[A-Za-z0-9._~-]+(?:/[A-Za-z0-9._~-]+)*)?$')
FORM_PATH = '__formweb_password'


class PagePasswords:
    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store
        self.attempts: dict[str, deque] = defaultdict(deque)
        self.store.db.executescript('''
        CREATE TABLE IF NOT EXISTS page_passwords (site_id TEXT NOT NULL,route TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(site_id,route));
        ''')
        self.store.db.commit()
        secret = self.store.get_meta('pagePasswordSecret')
        if not secret:
            secret = secrets.token_hex(32)
            self.store.set_meta('pagePasswordSecret', secret)
        self.secret = bytes.fromhex(secret)

    # management (editor, REST, MCP) ------------------------------------------
    @staticmethod
    def normalize(route):
        if not isinstance(route, str):
            raise EngineError('Route must be text such as /members or /.')
        route = '/' + route.strip().strip('/')
        if not ROUTE.fullmatch(route) or len(route) > 200:
            raise EngineError('Route must look like /members or / (letters, numbers, dot, dash, underscore).')
        return route

    async def site_id(self):
        return (await self.studio.state())['site']['id']

    async def list(self):
        self.studio.access.authorize('read')
        site_id = await self.site_id()
        rows = self.store.db.execute('SELECT route,created_at FROM page_passwords WHERE site_id=? ORDER BY route', (site_id,)).fetchall()
        return {'siteId': site_id, 'gates': [{'route': row['route'], 'createdAt': row['created_at']} for row in rows]}

    async def set(self, route, password):
        self.studio.access.authorize('publish')
        route = self.normalize(route)
        site_id = await self.site_id()
        if password is None:
            self.store.db.execute('DELETE FROM page_passwords WHERE site_id=? AND route=?', (site_id, route))
            self.store.db.commit()
            self.studio.access.record('password.remove', {'route': route})
            return await self.list()
        if not isinstance(password, str) or not 6 <= len(password) <= 200:
            raise EngineError('Use a password of 6 to 200 characters.')
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
        self.store.db.execute('INSERT INTO page_passwords VALUES(?,?,?,?,?,?) ON CONFLICT(site_id,route) DO UPDATE SET salt=excluded.salt,hash=excluded.hash,iterations=excluded.iterations,created_at=excluded.created_at', (site_id, route, salt, digest, ITERATIONS, now()))
        self.store.db.commit()
        self.studio.access.record('password.set', {'route': route})
        return await self.list()

    def guard_export(self, site_id):
        rows = self.store.db.execute('SELECT route FROM page_passwords WHERE site_id=?', (site_id,)).fetchall()
        if rows:
            routes = ', '.join(row['route'] for row in rows)
            raise EngineError(f'This site has password-protected routes ({routes}). A static export cannot protect pages; publish with FormWeb instead, or remove the passwords first.', 409)

    # serving -----------------------------------------------------------------
    def gate_for(self, site_id, route):
        """The most specific gate covering route, or None."""
        route = '/' + route.strip('/')
        best = None
        for row in self.store.db.execute('SELECT * FROM page_passwords WHERE site_id=?', (site_id,)):
            gate = row['route']
            if gate == '/' or route == gate or route.startswith(gate + '/'):
                if best is None or len(gate) > len(best['route']):
                    best = dict(row)
        return best

    def cookie_name(self, gate):
        return 'fw_pw_' + hashlib.sha256((gate['site_id'] + gate['route']).encode()).hexdigest()[:16]

    def token(self, gate):
        return hmac.new(self.secret, (gate['site_id'] + '\0' + gate['route'] + '\0' + gate['hash']).encode(), 'sha256').hexdigest()

    def unlocked(self, request, gate):
        value = request.cookies.get(self.cookie_name(gate), '')
        return bool(value) and hmac.compare_digest(value, self.token(gate))

    def check(self, gate, password, client):
        window = self.attempts[client + gate['route']]
        current = time.time()
        while window and window[0] < current - 60:
            window.popleft()
        if len(window) >= 8:
            raise EngineError('Too many attempts. Wait a minute and try again.', 429)
        window.append(current)
        candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(gate['salt']), gate['iterations']).hex()
        return hmac.compare_digest(candidate, gate['hash'])

    @staticmethod
    def form(action, route, site_name, error=''):
        message = f'<p class="err" role="alert">{html.escape(error)}</p>' if error else ''
        return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Password required</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#111;color:#eee}}form{{width:min(360px,90vw);display:grid;gap:12px}}h1{{font-size:20px;margin:0}}p{{margin:0;color:#aaa;font-size:14px}}input,button{{font:inherit;padding:12px;border-radius:8px;border:1px solid #444;background:#1b1b1b;color:#eee}}button{{background:#f97316;border-color:#f97316;color:#111;font-weight:600}}.err{{color:#f87171}}</style></head><body><form method="post" action="{html.escape(action)}"><h1>{html.escape(site_name)}</h1><p>This page is protected. Enter the password to continue.</p>{message}<input type="hidden" name="route" value="{html.escape(route)}"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Continue</button></form></body></html>'''
