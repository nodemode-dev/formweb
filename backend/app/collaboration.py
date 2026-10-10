import copy
import json
from uuid import uuid4

from .access import actor
from .engine import EngineError
from .store import now

MISSING = object()


def merge_sites(base, current, branch, resolutions=None):
    conflicts = []
    changes = []
    resolutions = resolutions or {}
    def walk(before, ours, theirs, path):
        if theirs == before or ours == theirs:
            return ours
        if ours == before:
            changes.append({'path': path or '/', 'kind': 'remove' if theirs is MISSING else 'add' if before is MISSING else 'change'})
            return theirs
        if isinstance(before, dict) and isinstance(ours, dict) and isinstance(theirs, dict):
            result = {}
            for key in sorted(set(before) | set(ours) | set(theirs)):
                child_path = path + '/' + key.replace('~', '~0').replace('/', '~1')
                value = walk(before.get(key, MISSING), ours.get(key, MISSING), theirs.get(key, MISSING), child_path)
                if value is not MISSING:
                    result[key] = value
            return result
        choice = resolutions.get(path or '/')
        if choice not in ('current', 'branch'):
            def visible(value):
                return {'missing': True} if value is MISSING else copy.deepcopy(value)
            conflicts.append({'path': path or '/', 'base': visible(before), 'current': visible(ours), 'branch': visible(theirs)})
            return ours
        changes.append({'path': path or '/', 'kind': 'resolved', 'choice': choice})
        return theirs if choice == 'branch' else ours
    merged = walk(base, current, branch, '')
    return copy.deepcopy(merged), changes, conflicts


class Collaboration:
    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store
        self.store.db.executescript('''
        CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,name TEXT NOT NULL,base TEXT NOT NULL,site TEXT NOT NULL,creator TEXT NOT NULL,updated_at TEXT NOT NULL,status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,node_id TEXT,identity_id TEXT NOT NULL,identity_name TEXT NOT NULL,text TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
        ''')
        self.store.db.commit()

    def branch(self, branch_id):
        row = self.store.db.execute('SELECT * FROM branches WHERE id=?', (branch_id,)).fetchone()
        if not row:
            raise EngineError('Branch not found.', 404)
        self.studio.access.authorize('read', row['project_id'])
        return dict(row)

    def list_branches(self):
        self.studio.access.authorize('read')
        return {'branches': [{'id': row['id'], 'name': row['name'], 'creator': row['creator'], 'updatedAt': row['updated_at'], 'status': row['status']} for row in self.store.db.execute('SELECT * FROM branches WHERE project_id=? ORDER BY updated_at DESC', (self.studio.access.project_key(),))]}

    async def create_branch(self, name):
        identity = self.studio.access.authorize('edit')
        if not isinstance(name, str) or not name.strip() or len(name) > 160:
            raise EngineError('Branch name must contain 1 to 160 characters.')
        if self.store.get_meta('activeBranch'):
            raise EngineError('Open the main project before creating another branch.', 409)
        if not self.store.get_meta('currentProject'):
            await self.studio.save_project()
        state = await self.studio.state()
        key = self.studio.access.project_key()
        branch_id = str(uuid4())
        encoded = json.dumps(state['site'])
        self.store.db.execute('INSERT INTO branches VALUES(?,?,?,?,?,?,?,?)', (branch_id, key, name.strip(), encoded, encoded, identity['name'], now(), 'draft'))
        self.store.db.commit()
        self.studio.access.record('branch.create', {'id': branch_id})
        return {'id': branch_id, 'name': name.strip(), 'revision': state['revision']}

    async def capture(self, branch_id):
        row = self.branch(branch_id)
        self.studio.access.authorize('edit', row['project_id'])
        state = await self.studio.state()
        if state['site']['id'] != json.loads(row['base'])['id']:
            raise EngineError('Open the branch project before capturing changes.', 409)
        self.store.db.execute('UPDATE branches SET site=?,updated_at=?,status=? WHERE id=?', (json.dumps(state['site']), now(), 'review', branch_id))
        self.store.db.commit()
        self.studio.access.record('branch.capture', {'id': branch_id}, row['project_id'])
        return {'id': branch_id, 'revision': state['revision'], 'status': 'review'}

    async def open_branch(self, branch_id):
        row = self.branch(branch_id)
        self.studio.access.authorize('edit', row['project_id'])
        if not self.store.get_meta('activeBranch') and self.store.get_meta('currentProject') == row['project_id']:
            await self.studio.save_project()
        async with self.studio.action_lock:
            checkpoint = self.store.get_meta('branchCheckpoint:' + branch_id)
            state = await self.studio.engine.request('restore', {'checkpoint': checkpoint}) if checkpoint else await self.studio.engine.request('exec', {'command': 'site.replace', 'params': {'site': json.loads(row['site'])}})
            self.store.set_metas({'currentProject': row['project_id'], 'activeBranch': branch_id})
            self.studio.access.record('branch.open', {'id': branch_id}, row['project_id'])
            return await self.studio.persist(state)

    async def review(self, branch_id, resolutions=None):
        row = self.branch(branch_id)
        self.studio.access.authorize('review', row['project_id'])
        if self.store.get_meta('activeBranch'):
            raise EngineError('Open the main project to review or merge an isolated branch.', 409)
        current = await self.studio.state()
        base = json.loads(row['base'])
        if current['site']['id'] != base['id']:
            raise EngineError('Open the branch project before reviewing changes.', 409)
        merged, changes, conflicts = merge_sites(base, current['site'], json.loads(row['site']), resolutions)
        return {'id': branch_id, 'revision': current['revision'], 'changes': changes, 'conflicts': conflicts, 'mergedSite': merged}

    async def merge(self, branch_id, resolutions=None, expected_revision=None):
        row = self.branch(branch_id)
        self.studio.access.authorize('edit', row['project_id'])
        if resolutions is not None and (not isinstance(resolutions, dict) or len(resolutions) > 1000 or any(value not in ('current', 'branch') for value in resolutions.values())):
            raise EngineError('Conflict resolutions must map JSON pointers to current or branch.')
        async with self.studio.action_lock:
            review = await self.review(branch_id, resolutions)
            if expected_revision is not None and expected_revision != review['revision']:
                raise EngineError('Branch review revision is stale.', 409)
            if review['conflicts']:
                error = EngineError('Resolve every conflicting JSON pointer before merging.', 409)
                error.details = {'conflicts': review['conflicts'], 'revision': review['revision']}
                raise error
            state = await self.studio.engine.request('exec', {'command': 'site.replace', 'params': {'site': review['mergedSite']}, 'expectedRevision': review['revision']})
            self.store.db.execute('UPDATE branches SET status=?,updated_at=? WHERE id=?', ('merged', now(), branch_id))
            self.store.db.commit()
            self.studio.access.record('branch.merge', {'id': branch_id, 'changes': len(review['changes'])}, row['project_id'])
            return await self.studio.persist(state)

    def comments(self):
        self.studio.access.authorize('read')
        return {'comments': [{'id': row['id'], 'nodeId': row['node_id'], 'identityId': row['identity_id'], 'name': row['identity_name'], 'text': row['text'], 'resolved': bool(row['resolved']), 'createdAt': row['created_at']} for row in self.store.db.execute('SELECT * FROM comments WHERE project_id=? ORDER BY created_at', (self.studio.access.project_key(),))]}

    async def comment(self, text, node_id=None):
        identity = self.studio.access.authorize('comment')
        if not isinstance(text, str) or not text.strip() or len(text) > 4000:
            raise EngineError('Comment must contain 1 to 4000 characters.')
        if node_id is not None and node_id not in (await self.studio.state())['site']['nodes']:
            raise EngineError('Comment node not found.', 404)
        comment_id = str(uuid4())
        self.store.db.execute('INSERT INTO comments VALUES(?,?,?,?,?,?,?,?)', (comment_id, self.studio.access.project_key(), node_id, identity['id'], identity['name'], text.strip(), 0, now()))
        self.store.db.commit()
        self.studio.access.record('comment.add', {'id': comment_id, 'nodeId': node_id})
        return {'id': comment_id, 'comments': self.comments()['comments']}

    def resolve(self, comment_id, resolved):
        self.studio.access.authorize('comment')
        row = self.store.db.execute('SELECT project_id FROM comments WHERE id=?', (comment_id,)).fetchone()
        if not row:
            raise EngineError('Comment not found.', 404)
        self.studio.access.authorize('comment', row['project_id'])
        self.store.db.execute('UPDATE comments SET resolved=? WHERE id=?', (int(bool(resolved)), comment_id))
        self.store.db.commit()
        self.studio.access.record('comment.resolve', {'id': comment_id, 'resolved': bool(resolved)}, row['project_id'])
        return self.comments()
