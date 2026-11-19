"""Agent substrate: one command surface for the editor, MCP, the CLI and the embedded terminal.

Callers (REST routes, MCP, `./formweb run`, the terminal) talk to the active `Substrate`, never to the
engine directly. FormWeb ships `BuiltinSubstrate`; an external NodeMode substrate can be attached later by
naming a factory in FORMWEB_EXTERNAL_SUBSTRATE (``package.module:factory``) without changing any caller.

The module also owns approvals: one queue for agent calls that need a person's yes (destructive MCP tools
when the owner asks for it) and for release promotion when the project requires a reviewer (FW-068).
"""
import asyncio
import importlib
import json
import os
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable
from uuid import uuid4

from . import seal, window_key
from .access import PERMISSIONS, actor, channel
from .engine import EngineError
from .store import now

Listener = Callable[[dict[str, Any]], None]
APPROVAL_TIMEOUT = 100.0  # below Codex's 120 s tool_timeout_sec so the agent sees the reason, not a transport timeout


@runtime_checkable
class Substrate(Protocol):
    """The adapter contract. Every method must be safe to call from any channel."""

    name: str

    async def describe(self) -> list[dict[str, Any]]:
        """Return the command catalogue: [{id, owner, channels}]."""

    async def dispatch(self, command: str, params: dict[str, Any], expected_revision: int | None = None) -> dict[str, Any]:
        """Run one command as the current actor and channel; return the new editor state."""

    def subscribe(self, listener: Listener) -> Callable[[], None]:
        """Call listener(event) for every attributed activity event; return an unsubscribe function."""


class BuiltinSubstrate:
    name = 'builtin'

    def __init__(self, studio):
        self.studio = studio

    async def describe(self):
        return [{'id': command, 'owner': 'rust', 'channels': ['human', 'agent', 'terminal']} for command in self.studio.engine.commands]

    async def dispatch(self, command, params, expected_revision=None):
        if command not in self.studio.engine.commands and not command.startswith('history.'):
            raise EngineError(f'Unknown command {command}. GET /api/substrate lists the catalogue.', 404)
        payload = {'command': command, 'params': params or {}}
        if expected_revision is not None:
            payload['expectedRevision'] = expected_revision
        return await self.studio.mutate('exec', payload)

    def subscribe(self, listener):
        self.studio.access.listeners.add(listener)
        return lambda: self.studio.access.listeners.discard(listener)


def load_external(spec: str, studio) -> Substrate:
    module_name, _, factory_name = spec.partition(':')
    if not module_name or not factory_name:
        raise EngineError('FORMWEB_EXTERNAL_SUBSTRATE must look like package.module:factory.', 500)
    substrate = getattr(importlib.import_module(module_name), factory_name)(studio)
    if not isinstance(substrate, Substrate):
        raise EngineError(f'{spec} did not return a Substrate (name, describe, dispatch, subscribe).', 500)
    return substrate


class Registry:
    def __init__(self, studio):
        self.studio = studio
        self.available: dict[str, Substrate] = {'builtin': BuiltinSubstrate(studio)}
        self.error: str | None = None
        spec = os.getenv('FORMWEB_EXTERNAL_SUBSTRATE', '').strip()
        if spec:
            try:
                external = load_external(spec, studio)
                self.available[external.name] = external
            except Exception as error:  # the editor must still start; the error is reported by GET /api/substrate
                self.error = f'{spec}: {error}'
        wanted = os.getenv('FORMWEB_SUBSTRATE', 'builtin')
        self.active_name = wanted if wanted in self.available else 'builtin'

    @property
    def active(self) -> Substrate:
        return self.available[self.active_name]

    async def summary(self):
        return {'active': self.active_name, 'available': sorted(self.available), 'error': self.error, 'channels': ['human', 'agent', 'terminal'], 'commands': await self.active.describe()}


class Approvals:
    """Pending decisions shown in Agent Connect. Rows persist; waiting agent calls hold an in-memory future."""

    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store
        self.waiting: dict[str, asyncio.Future] = {}
        self.store.db.executescript('''
        CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,requested_by TEXT NOT NULL,requested_name TEXT NOT NULL,channel TEXT NOT NULL,status TEXT NOT NULL,decided_by TEXT,decided_name TEXT,note TEXT,created_at TEXT NOT NULL,decided_at TEXT);
        ''')
        # An agent call waiting at shutdown is gone; release reviews stay pending across restarts.
        self.store.db.execute("UPDATE approvals SET status='expired',decided_at=? WHERE kind='agent.tool' AND status='pending'", (now(),))
        self.store.db.commit()

    # settings -------------------------------------------------------------
    def settings(self, project_id=None):
        key = self.studio.access.project_key(project_id)
        stored = self.store.get_meta('approvalSettings:' + key) or {}
        return {'projectId': key, **seal.effective(key, stored)}

    def update_settings(self, patch):
        self.studio.access.authorize('manage')
        current = self.settings()
        for name in ('agentDestructive', 'publishReview'):
            if name in patch:
                if not isinstance(patch[name], bool):
                    raise EngineError(f'{name} must be true or false.')
                current[name] = patch[name]
        self.store.set_meta('approvalSettings:' + current['projectId'], seal.sign(current['projectId'], current))
        current.update(seal.effective(current['projectId'], self.store.get_meta('approvalSettings:' + current['projectId']) or {}))
        self.studio.access.record('approval.settings', {'agentDestructive': current['agentDestructive'], 'publishReview': current['publishReview']})
        return current

    # queue ----------------------------------------------------------------
    def _row(self, row):
        item = dict(row)
        item['subject'] = json.loads(item['subject'])
        return {'id': item['id'], 'projectId': item['project_id'], 'kind': item['kind'], 'subject': item['subject'], 'requestedBy': {'id': item['requested_by'], 'name': item['requested_name'], 'channel': item['channel']}, 'status': item['status'], 'decidedBy': item['decided_name'], 'note': item['note'], 'createdAt': item['created_at'], 'decidedAt': item['decided_at']}

    def create(self, kind, subject, project_id=None):
        identity = actor.get()
        approval_id = str(uuid4())
        key = self.studio.access.project_key(project_id)
        self.store.db.execute('INSERT INTO approvals(id,project_id,kind,subject,requested_by,requested_name,channel,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)', (approval_id, key, kind, json.dumps(subject), identity['id'], identity['name'], channel.get(), 'pending', now()))
        self.store.db.commit()
        self.studio.access.record('approval.request', {'approvalId': approval_id, 'kind': kind, **subject}, key)
        return self.get(approval_id)

    def get(self, approval_id):
        row = self.store.db.execute('SELECT * FROM approvals WHERE id=?', (approval_id,)).fetchone()
        if not row:
            raise EngineError('Approval request not found.', 404)
        return self._row(row)

    def list(self, status=None, limit=50):
        self.studio.access.authorize('read')
        key = self.studio.access.project_key()
        sql = 'SELECT * FROM approvals WHERE project_id=?' + (' AND status=?' if status else '') + ' ORDER BY created_at DESC LIMIT ?'
        args = (key, status, limit) if status else (key, limit)
        return {'settings': self.settings(), 'approvals': [self._row(row) for row in self.store.db.execute(sql, args)]}

    def mark(self, approval_id, status):
        self.store.db.execute('UPDATE approvals SET status=? WHERE id=?', (status, approval_id))
        self.store.db.commit()

    def find(self, kind, subject, status, project_id=None):
        for row in self.store.db.execute('SELECT * FROM approvals WHERE project_id=? AND kind=? AND status=? ORDER BY created_at DESC', (self.studio.access.project_key(project_id), kind, status)):
            item = self._row(row)
            if item['subject'] == subject:
                return item
        return None

    def decide(self, approval_id, decision, note=None):
        item = self.get(approval_id)
        identity = actor.get()
        role = self.studio.access.role(item['projectId'])
        if role is None or 'review' not in PERMISSIONS[role]:
            raise EngineError('Only a reviewer, publisher or owner can decide approvals.', 403)
        if channel.get() in ('agent', 'terminal') or (identity['root'] and not window_key.window.get()):
            raise EngineError('Approvals are decided by a person in the FormWeb window.', 403)
        if item['kind'] != 'release.promote' and item['requestedBy']['id'] == identity['id'] and item['requestedBy']['channel'] == channel.get():
            raise EngineError('A request cannot be decided by the one who asked for it.', 403)
        if item['status'] != 'pending':
            raise EngineError(f'This request is already {item["status"]}.', 409)
        if decision not in ('approve', 'deny'):
            raise EngineError('Decision must be approve or deny.')
        if item['kind'] == 'release.promote' and item['requestedBy']['id'] == identity['id'] and not identity['root']:
            raise EngineError('A release needs a different reviewer than the person who requested it.', 403)
        status = 'approved' if decision == 'approve' else 'denied'
        self.store.db.execute('UPDATE approvals SET status=?,decided_by=?,decided_name=?,note=?,decided_at=? WHERE id=?', (status, identity['id'], identity['name'], (note or '')[:500] or None, now(), approval_id))
        self.store.db.commit()
        self.studio.access.record('approval.' + status, {'approvalId': approval_id, 'kind': item['kind']}, item['projectId'])
        future = self.waiting.pop(approval_id, None)
        if future and not future.done():
            future.set_result(status)
        result = self.get(approval_id)
        if item['kind'] == 'release.promote' and status == 'approved':
            # The reviewer's approval performs the promotion the requester asked for.
            result['release'] = self.studio.releases.promote(item['subject']['slug'], item['subject']['version'], reviewed=True)
        return result

    async def wait(self, kind, subject, timeout=APPROVAL_TIMEOUT):
        """Block an agent call until a person approves or denies it in Agent Connect."""
        item = self.create(kind, subject)
        future = asyncio.get_running_loop().create_future()
        self.waiting[item['id']] = future
        try:
            status = await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError:
            self.store.db.execute("UPDATE approvals SET status='expired',decided_at=? WHERE id=? AND status='pending'", (now(), item['id']))
            self.store.db.commit()
            error = EngineError(f'No one approved {subject.get("tool", kind)} within {int(timeout)} seconds. Ask the person to watch Agent Connect, then retry.', 408)
            error.details = {'approvalId': item['id']}
            raise error
        finally:
            self.waiting.pop(item['id'], None)
        if status != 'approved':
            error = EngineError(f'The person denied {subject.get("tool", kind)}.', 403)
            error.details = {'approvalId': item['id']}
            raise error
        return item['id']


def activity(studio, limit=50, after=None):
    studio.access.authorize('read')
    key = studio.access.project_key()
    rows = studio.store.db.execute('SELECT * FROM activity WHERE project_id=? ORDER BY created_at DESC LIMIT ?', (key, max(1, min(int(limit), 200)))).fetchall()
    items = []
    for row in rows:
        details = json.loads(row['details'])
        if after and row['created_at'] <= after:
            continue
        items.append({'id': row['id'], 'operation': row['operation'], 'identity': row['identity_name'], 'channel': details.pop('channel', 'human'), 'details': details, 'createdAt': row['created_at']})
    return {'activity': items}
