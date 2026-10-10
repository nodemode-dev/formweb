import json
import sqlite3
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .config import DATA_DIR


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(DATA_DIR / 'formweb.sqlite3')
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, site TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS publications (slug TEXT NOT NULL, version TEXT NOT NULL, site_id TEXT NOT NULL, site TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(slug,version));
        CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, form_id TEXT NOT NULL, values_json TEXT NOT NULL, created_at TEXT NOT NULL);
        ''')
        self.db.commit()

    def get_meta(self, key: str):
        row = self.db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return json.loads(row['value']) if row else None

    def set_meta(self, key: str, value: Any):
        self.db.execute('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, json.dumps(value)))
        self.db.commit()

    def save_project(self, state: dict[str, Any], name: str | None, project_id: str | None):
        project_id = project_id or str(uuid4())
        title = (name or state['site']['name']).strip()[:160] or 'Untitled site'
        self.db.execute('INSERT INTO projects VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,site=excluded.site,revision=excluded.revision,updated_at=excluded.updated_at', (project_id, title, json.dumps(state['site']), state['revision'], now()))
        self.db.commit()
        self.set_meta('currentProject', project_id)
        return {'id': project_id, 'name': title, 'revision': state['revision']}

    def projects(self):
        return {'projects': [{'id': row['id'], 'name': row['name'], 'updatedAt': row['updated_at']} for row in self.db.execute('SELECT id,name,updated_at FROM projects ORDER BY updated_at DESC')]}

    def project(self, project_id: str):
        row = self.db.execute('SELECT site FROM projects WHERE id=?', (project_id,)).fetchone()
        return json.loads(row['site']) if row else None

    def add_publication(self, slug: str, version: str, site: dict[str, Any]):
        self.db.execute('INSERT INTO publications VALUES(?,?,?,?,?)', (slug, version, site['id'], json.dumps(site), now()))
        self.db.commit()

    def publications(self):
        return {'publications': [{'slug': row['slug'], 'version': row['version'], 'siteId': row['site_id'], 'createdAt': row['created_at'], 'url': f"/published/{row['slug']}/{row['version']}/"} for row in self.db.execute('SELECT slug,version,site_id,created_at FROM publications ORDER BY created_at DESC')]}

    def published_site(self, site_id: str):
        row = self.db.execute('SELECT site FROM publications WHERE site_id=? ORDER BY created_at DESC LIMIT 1', (site_id,)).fetchone()
        return json.loads(row['site']) if row else None

    def publication_site(self, site_id: str, slug: str, version: str):
        row = self.db.execute('SELECT site FROM publications WHERE site_id=? AND slug=? AND version=?', (site_id, slug, version)).fetchone()
        return json.loads(row['site']) if row else None

    def add_submission(self, site_id: str, form_id: str, values: dict[str, Any]):
        submission_id = str(uuid4())
        created_at = now()
        self.db.execute('INSERT INTO submissions VALUES(?,?,?,?,?)', (submission_id, site_id, form_id, json.dumps(values), created_at))
        self.db.commit()
        return {'id': submission_id, 'createdAt': created_at, 'storedLocally': True}

    def submissions(self):
        return {'submissions': [{'id': row['id'], 'siteId': row['site_id'], 'formId': row['form_id'], 'values': json.loads(row['values_json']), 'createdAt': row['created_at']} for row in self.db.execute('SELECT * FROM submissions ORDER BY created_at DESC LIMIT 500')]}

    def close(self):
        self.db.close()
