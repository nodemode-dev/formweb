import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from urllib.parse import unquote

from ..engine import EngineError
from .common import key, rate_limit, store

from .tokens import token as request_token

HANDOFF_LIFE = 120

class VisitorMembership:
    def credentials(self, payload):
        email, password = payload.get('email'), payload.get('password')
        if not isinstance(email, str) or len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise EngineError('Enter a valid email address.')
        if not isinstance(password, str) or not 12 <= len(password) <= 256:
            raise EngineError('Visitor passwords require 12 to 256 characters.')
        return email.lower().strip(), password

    def digest(self, password, salt):
        return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()

    def register(self, site_id, payload, address):
        rate_limit.check('register:' + address, 6)
        if os.getenv('FORMWEB_MEMBER_SIGNUP', '1') != '1':
            raise EngineError('Visitor registration is disabled.', 403)
        email, password = self.credentials(payload)
        salt = secrets.token_hex(32)
        digest = self.digest(password, salt)
        try:
            with store.connection() as db:
                db.execute('INSERT INTO visitors(site,email,salt,digest,groups_json) VALUES(?,?,?,?,?)', (site_id, email, salt, digest, json.dumps(['member'])))
        except sqlite3.IntegrityError as error:
            raise EngineError('This visitor account already exists.', 409) from error
        return {'registered': True, 'email': email, 'groups': ['member']}

    def login(self, site_id, payload, address):
        rate_limit.check('login:' + address, 10)
        email, password = self.credentials(payload)
        with store.connection() as db:
            row = db.execute('SELECT * FROM visitors WHERE site=? AND email=?', (site_id, email)).fetchone()
            salt = row['salt'] if row else '0' * 64
            calculated = self.digest(password, salt)
            if not row or not hmac.compare_digest(calculated, row['digest']) or row['disabled']:
                raise EngineError('Visitor credentials are invalid.', 401)
            token = self.open_session(db, site_id, email)
        return token, {'authenticated': True, 'email': email, 'groups': json.loads(row['groups_json'])}

    @staticmethod
    def open_session(db, site_id, email):
        token = secrets.token_urlsafe(48)
        digest = hashlib.sha256(token.encode()).hexdigest()
        db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES(?,?,?,?)', (digest, site_id, email, time.time() + 43200))
        return token

    def handoff(self, request, site_id, release):
        """A single-use ticket, valid two minutes, that carries a signed-in member to another page of the same publication."""
        current = self.session(request, site_id)
        if not current['authenticated']:
            raise EngineError('Sign in before following a members link.', 401)
        ticket = secrets.token_urlsafe(32)
        store.put('member-handoff', hashlib.sha256(ticket.encode()).hexdigest(), {'site': site_id, 'email': current['email'], 'slug': release['slug'], 'version': release['version'], 'expires': time.time() + HANDOFF_LIFE, 'used': False})
        return {'ticket': ticket, 'expiresIn': HANDOFF_LIFE}

    def ticket_member(self, ticket, site_id, slug, version):
        if not isinstance(ticket, str) or not 20 <= len(ticket) <= 64:
            return None
        record = store.get('member-handoff', hashlib.sha256(ticket.encode()).hexdigest())
        if not record or record['used'] or record['expires'] <= time.time() or (record['site'], record['slug'], record['version']) != (site_id, slug, version):
            return None
        return record

    def resume(self, site_id, release, ticket):
        record = self.ticket_member(ticket, site_id, release['slug'], release['version'])
        if not record:
            raise EngineError('This members link has expired. Sign in again.', 401)
        store.put('member-handoff', hashlib.sha256(ticket.encode()).hexdigest(), {**record, 'used': True})
        with store.connection() as db:
            row = db.execute('SELECT groups_json FROM visitors WHERE site=? AND email=? AND disabled=0', (site_id, record['email'])).fetchone()
            if not row:
                raise EngineError('Visitor credentials are invalid.', 401)
            token = self.open_session(db, site_id, record['email'])
        return token, {'authenticated': True, 'email': record['email'], 'groups': json.loads(row['groups_json'])}

    def session(self, request, site_id):
        member = request.scope.get('formweb.member')
        if member and member['site'] == site_id:
            with store.connection() as db:
                row = db.execute('SELECT email,groups_json FROM visitors WHERE site=? AND email=? AND disabled=0', (site_id, member['email'])).fetchone()
            return {'authenticated': True, 'email': row['email'], 'groups': json.loads(row['groups_json'])} if row else {'authenticated': False, 'groups': []}
        token = request_token(request, 'Visitor', 'formweb_visitor')
        if not token:
            return {'authenticated': False, 'groups': []}
        digest = hashlib.sha256(token.encode()).hexdigest()
        with store.connection() as db:
            row = db.execute('SELECT v.email,v.groups_json FROM sessions s JOIN visitors v ON s.site=v.site AND s.email=v.email WHERE s.digest=? AND s.site=? AND s.expires>? AND v.disabled=0', (digest, site_id, time.time())).fetchone()
        if not row:
            return {'authenticated': False, 'groups': []}
        return {'authenticated': True, 'email': row['email'], 'groups': json.loads(row['groups_json'])}

    def logout(self, request):
        digest = hashlib.sha256(request_token(request, 'Visitor', 'formweb_visitor').encode()).hexdigest()
        with store.connection() as db:
            db.execute('DELETE FROM sessions WHERE digest=?', (digest,))
        return {'authenticated': False}

    def authorize(self, request, site, route):
        route = unquote(route).replace('\\', '/')
        segments = route.split('/')
        if any(segment in ('.', '..') for segment in segments):
            raise EngineError('Membership route is invalid.', 400)
        route = '/' + '/'.join(segment for segment in segments if segment)
        if route.endswith('/index.html'):
            route = route[:-11] or '/'
        gates = site.get('extensions', {}).get('integrations', {}).get('gates', [])
        matching = [gate for gate in gates if route == gate['route'].rstrip('/') or route.startswith(gate['route'].rstrip('/') + '/')]
        if not matching:
            return False
        current = self.session(request, site['id'])
        if not current['authenticated']:
            raise EngineError('Visitor login is required for this route.', 401)
        if any(not set(gate['groups']).intersection(current['groups']) for gate in matching):
            raise EngineError('Visitor membership does not permit this route.', 403)
        return True

    def members(self, site_id):
        with store.connection() as db:
            rows = db.execute('SELECT email,groups_json,disabled FROM visitors WHERE site=? ORDER BY email LIMIT 1000', (site_id,)).fetchall()
        return [{'email': row['email'], 'groups': json.loads(row['groups_json']), 'disabled': bool(row['disabled'])} for row in rows]

    def manage(self, site_id, email, payload):
        groups = payload.get('groups')
        disabled = payload.get('disabled', False)
        if not isinstance(groups, list) or not 1 <= len(groups) <= 16 or any(not isinstance(group, str) or len(group) > 64 or not re.fullmatch(r'[A-Za-z0-9_.-]+', group) for group in groups) or not isinstance(disabled, bool):
            raise EngineError('Membership groups or disabled setting is invalid.')
        with store.connection() as db:
            result = db.execute('UPDATE visitors SET groups_json=?,disabled=? WHERE site=? AND email=?', (json.dumps(sorted(set(groups))), int(disabled), site_id, email.lower()))
            if result.rowcount != 1:
                raise EngineError('Visitor was not found.', 404)
            db.execute('DELETE FROM sessions WHERE site=? AND email=?', (site_id, email.lower()))
        return {'email': email.lower(), 'groups': sorted(set(groups)), 'disabled': disabled, 'sessionsRevoked': True}
