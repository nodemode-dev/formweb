import hashlib
import secrets
import time
from contextvars import ContextVar
from uuid import uuid4

from .config import AUTH_TOKEN
from .engine import EngineError
from .store import now

LOCAL_OWNER = {'id': 'local-owner', 'name': 'Local owner', 'root': True}
actor = ContextVar('formweb_actor', default=LOCAL_OWNER)
PERMISSIONS = {
    'viewer': {'read'},
    'reviewer': {'read', 'comment', 'review'},
    'editor': {'read', 'comment', 'review', 'edit'},
    'publisher': {'read', 'comment', 'review', 'edit', 'publish'},
    'owner': {'read', 'comment', 'review', 'edit', 'publish', 'manage'},
}


class AccessControl:
    def __init__(self, store):
        self.store = store
        self.sessions = {}
        self.store.db.executescript('''
        CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,disabled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS members (project_id TEXT NOT NULL,identity_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(project_id,identity_id));
        CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,identity_id TEXT NOT NULL,identity_name TEXT NOT NULL,operation TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS presence (project_id TEXT NOT NULL,identity_id TEXT NOT NULL,identity_name TEXT NOT NULL,node_id TEXT,seen REAL NOT NULL,PRIMARY KEY(project_id,identity_id));
        ''')
        self.store.db.commit()

    def project_key(self, project_id=None):
        if project_id:
            return project_id
        autosave = self.store.get_meta('autosave')
        return self.store.get_meta('currentProject') or (autosave['site']['id'] if autosave else 'workspace')

    def authenticate(self, headers, mcp=False):
        authorization = headers.get('authorization', '')
        if authorization:
            if not authorization.startswith('Bearer '):
                raise EngineError('Use bearer authentication.', 401)
            token = authorization[7:]
            if AUTH_TOKEN and secrets.compare_digest(token.encode(), AUTH_TOKEN.encode()):
                return LOCAL_OWNER
            digest = hashlib.sha256(token.encode()).hexdigest()
            row = self.store.db.execute('SELECT id,name,disabled FROM identities WHERE token_hash=?', (digest,)).fetchone()
            if not row or row['disabled']:
                raise EngineError('Unknown or disabled bearer identity.', 401)
            return {'id': row['id'], 'name': row['name'], 'root': False}
        if not mcp:
            cookies = dict(piece.strip().split('=', 1) for piece in headers.get('cookie', '').split(';') if '=' in piece)
            session = self.sessions.get(cookies.get('formweb_session', ''))
            if session and session['expires'] > time.time():
                identity = session['identity']
                if not identity['root']:
                    row = self.store.db.execute('SELECT disabled FROM identities WHERE id=?', (identity['id'],)).fetchone()
                    if not row or row['disabled']:
                        raise EngineError('This identity is disabled.', 401)
                return identity
        if not AUTH_TOKEN:
            if self.store.db.execute('SELECT 1 FROM identities LIMIT 1').fetchone():
                raise EngineError('Project identities exist. Restore FORMWEB_AUTH_TOKEN and restart to use protected collaboration.', 401)
            return LOCAL_OWNER
        raise EngineError('A valid bearer token or browser session is required.', 401)

    def browser_session(self, identity):
        token = secrets.token_urlsafe(32)
        self.sessions = {key: value for key, value in self.sessions.items() if value['expires'] > time.time()}
        self.sessions[token] = {'identity': identity, 'expires': time.time() + 43200}
        return token

    def role(self, project_id=None, identity=None):
        identity = identity or actor.get()
        if identity['root']:
            return 'owner'
        row = self.store.db.execute('SELECT role FROM members WHERE project_id=? AND identity_id=?', (self.project_key(project_id), identity['id'])).fetchone()
        return row['role'] if row else None

    def authorize(self, permission='read', project_id=None):
        role = self.role(project_id)
        if role is None or permission not in PERMISSIONS[role]:
            raise EngineError(f'The current identity is not allowed to {permission} this project.', 403)
        return actor.get()

    def record(self, operation, details=None, project_id=None):
        import json
        identity = actor.get()
        self.store.db.execute('INSERT INTO activity VALUES(?,?,?,?,?,?,?)', (str(uuid4()), self.project_key(project_id), identity['id'], identity['name'], operation, json.dumps(details or {}), now()))
        self.store.db.commit()

    def create_identity(self, name):
        self.authorize('manage')
        if not AUTH_TOKEN:
            raise EngineError('Set FORMWEB_AUTH_TOKEN and restart before creating bearer identities or enabling project roles.', 409)
        if not isinstance(name, str) or not name.strip() or len(name) > 160:
            raise EngineError('Identity name must contain 1 to 160 characters.')
        identity_id = str(uuid4())
        token = secrets.token_urlsafe(32)
        self.store.db.execute('INSERT INTO identities(id,name,token_hash) VALUES(?,?,?)', (identity_id, name.strip(), hashlib.sha256(token.encode()).hexdigest()))
        self.store.db.commit()
        self.record('identity.create', {'identityId': identity_id})
        return {'id': identity_id, 'name': name.strip(), 'token': token, 'tokenShownOnce': True}

    def grant(self, identity_id, role, project_id=None):
        self.authorize('manage', project_id)
        if role not in PERMISSIONS:
            raise EngineError('Role must be viewer, reviewer, editor, publisher or owner.')
        if not self.store.db.execute('SELECT id FROM identities WHERE id=?', (identity_id,)).fetchone():
            raise EngineError('Identity not found.', 404)
        key = self.project_key(project_id)
        self.store.db.execute('INSERT INTO members VALUES(?,?,?) ON CONFLICT(project_id,identity_id) DO UPDATE SET role=excluded.role', (key, identity_id, role))
        self.store.db.commit()
        self.record('access.grant', {'identityId': identity_id, 'role': role}, key)
        return self.status(key)

    def status(self, project_id=None):
        key = self.project_key(project_id)
        members = [{'identityId': row['id'], 'name': row['name'], 'role': row['role']} for row in self.store.db.execute('SELECT i.id,i.name,m.role FROM members m JOIN identities i ON i.id=m.identity_id WHERE m.project_id=?', (key,))]
        return {'identity': actor.get(), 'role': self.role(key), 'projectId': key, 'activeBranch': self.store.get_meta('activeBranch') if key == self.project_key() else None, 'members': members, 'permissions': sorted(PERMISSIONS.get(self.role(key), set()))}

    def set_presence(self, node_id=None):
        identity = self.authorize('read')
        if node_id is not None and (not isinstance(node_id, str) or len(node_id) > 160):
            raise EngineError('Invalid presence node.')
        key = self.project_key()
        self.store.db.execute('INSERT INTO presence VALUES(?,?,?,?,?) ON CONFLICT(project_id,identity_id) DO UPDATE SET identity_name=excluded.identity_name,node_id=excluded.node_id,seen=excluded.seen', (key, identity['id'], identity['name'], node_id, time.time()))
        self.store.db.commit()
        return self.presence()

    def presence(self):
        self.authorize('read')
        cutoff = time.time() - 60
        return {'presence': [{'identityId': row['identity_id'], 'name': row['identity_name'], 'nodeId': row['node_id'], 'lastSeen': row['seen']} for row in self.store.db.execute('SELECT * FROM presence WHERE project_id=? AND seen>?', (self.project_key(), cutoff))]}

    def activity(self):
        import json
        self.authorize('read')
        return {'activity': [{'id': row['id'], 'identityId': row['identity_id'], 'name': row['identity_name'], 'operation': row['operation'], 'details': json.loads(row['details']), 'createdAt': row['created_at']} for row in self.store.db.execute('SELECT * FROM activity WHERE project_id=? ORDER BY created_at DESC LIMIT 200', (self.project_key(),))]}

    def accessible_sites(self, permission='read'):
        if actor.get()['root']:
            return None
        import json
        sites = set()
        for row in self.store.db.execute('SELECT id,site FROM projects'):
            if permission in PERMISSIONS.get(self.role(row['id']), set()):
                sites.add(json.loads(row['site'])['id'])
        autosave = self.store.get_meta('autosave')
        if autosave and permission in PERMISSIONS.get(self.role(), set()):
            sites.add(autosave['site']['id'])
        for row in self.store.db.execute('SELECT project_id,role FROM members WHERE identity_id=?', (actor.get()['id'],)):
            if permission in PERMISSIONS[row['role']]:
                sites.add(row['project_id'])
        return sites

    def authorize_site(self, site_id, permission='read'):
        allowed = self.accessible_sites(permission)
        if allowed is not None and site_id not in allowed:
            raise EngineError(f'This identity cannot {permission} the requested site.', 403)
        return actor.get()
