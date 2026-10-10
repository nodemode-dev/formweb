import hashlib
import json
import math
import secrets
import time

from ..engine import EngineError
from .common import key, rate_limit, store
from .tokens import token as request_token


class ConsentedInsights:
    def consent(self, request, site_id, enabled):
        if not isinstance(enabled, bool):
            raise EngineError('Consent requires an analytics boolean.')
        old = request_token(request, 'Consent', 'formweb_consent')
        digest = hashlib.sha256(old.encode()).hexdigest()
        if not enabled:
            with store.connection() as db:
                db.execute('DELETE FROM records WHERE namespace=? AND id=?', ('consents', digest))
                db.execute('DELETE FROM records WHERE namespace=? AND id LIKE ?', ('assignments', digest + ':%'))
                db.execute('DELETE FROM events WHERE site=? AND visitor=?', (site_id, digest))
            return None, {'analytics': False, 'withdrawn': True}
        existing = store.get('consents', digest)
        token = old if existing and existing.get('site') == site_id and existing.get('expires', 0) > time.time() else secrets.token_urlsafe(48)
        digest = hashlib.sha256(token.encode()).hexdigest()
        store.put('consents', digest, {'site': site_id, 'analytics': True, 'expires': time.time() + 90 * 86400})
        return token, {'analytics': True}

    def identity(self, request, site_id):
        token = request_token(request, 'Consent', 'formweb_consent')
        digest = hashlib.sha256(token.encode()).hexdigest()
        consent = store.get('consents', digest)
        if not token or not consent or consent.get('site') != site_id or not consent.get('analytics') or consent.get('expires', 0) <= time.time():
            raise EngineError('Explicit analytics consent is required.', 403)
        return digest

    def experiment(self, site, name):
        key(name, 'experiment')
        experiment = site.get('extensions', {}).get('integrations', {}).get('experiments', {}).get(name)
        if not isinstance(experiment, dict) or not isinstance(experiment.get('variants'), list) or not 2 <= len(experiment['variants']) <= 8:
            raise EngineError('Experiment is not configured.', 404)
        if any(not isinstance(item, dict) or not isinstance(item.get('id'), str) or not isinstance(item.get('weight'), (float, int)) or not math.isfinite(item['weight']) or item['weight'] <= 0 for item in experiment['variants']):
            raise EngineError('Experiment variants are invalid.')
        key(experiment.get('event'), 'conversion event')
        return experiment

    def assign(self, request, site, name):
        visitor = self.identity(request, site['id'])
        experiment = self.experiment(site, name)
        record_id = visitor + ':' + name
        record = store.get('assignments', record_id)
        if record and any(item['id'] == record['variant'] for item in experiment['variants']):
            return record
        total = sum(item['weight'] for item in experiment['variants'])
        point = int(hashlib.sha256((site['id'] + ':' + name + ':' + visitor).encode()).hexdigest(), 16) / 2 ** 256 * total
        variant = experiment['variants'][-1]['id']
        for item in experiment['variants']:
            point -= item['weight']
            if point < 0:
                variant = item['id']
                break
        record = {'experiment': name, 'variant': variant, 'assigned': time.time()}
        store.put('assignments', record_id, record)
        self.insert(site['id'], visitor, 'experiment_exposure', '/', name, variant, 0)
        return record

    def insert(self, site, visitor, name, path, experiment, variant, value):
        with store.connection() as db:
            db.execute('DELETE FROM events WHERE created<?', (time.time() - 90 * 86400,))
            count = db.execute('SELECT count(*) FROM events WHERE site=?', (site,)).fetchone()[0]
            if count >= 100000:
                raise EngineError('Analytics retention capacity is reached.', 429)
            db.execute('INSERT INTO events(site,visitor,name,path,experiment,variant,value,created) VALUES(?,?,?,?,?,?,?,?)', (site, visitor, name, path, experiment, variant, value, time.time()))

    def event(self, request, site, payload, address):
        rate_limit.check('event:' + address, 120)
        visitor = self.identity(request, site['id'])
        name = key(payload.get('name'), 'event')
        path = payload.get('path', '/')
        if not isinstance(path, str) or len(path) > 512 or not path.startswith('/') or '?' in path or '#' in path or any(ord(character) < 32 for character in path):
            raise EngineError('Analytics path must be a bounded pathname without query data.')
        experiment, variant = payload.get('experiment', ''), payload.get('variant', '')
        if experiment:
            config = self.experiment(site, experiment)
            assignment = store.get('assignments', visitor + ':' + experiment)
            if not assignment or assignment['variant'] != variant or name != config['event']:
                raise EngineError('Conversion does not match the server experiment assignment.', 403)
        elif variant:
            raise EngineError('Variant requires an experiment.')
        value = payload.get('value', 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 1000000:
            raise EngineError('Event value is outside the supported range.')
        self.insert(site['id'], visitor, name, path, experiment, variant, value)
        return {'accepted': True, 'collected': time.time()}

    def metrics(self, site):
        with store.connection() as db:
            events = [dict(row) for row in db.execute('SELECT name,path,count(*) AS events,count(DISTINCT visitor) AS visitors,sum(value) AS value FROM events WHERE site=? GROUP BY name,path ORDER BY events DESC LIMIT 500', (site['id'],))]
            results = []
            for name, experiment in site.get('extensions', {}).get('integrations', {}).get('experiments', {}).items():
                for item in experiment['variants']:
                    row = db.execute('SELECT count(DISTINCT CASE WHEN name=? THEN visitor END) AS exposures,count(DISTINCT CASE WHEN name=? THEN visitor END) AS converters,count(CASE WHEN name=? THEN 1 END) AS conversions FROM events WHERE site=? AND experiment=? AND variant=?', ('experiment_exposure', experiment['event'], experiment['event'], site['id'], name, item['id'])).fetchone()
                    results.append({'experiment': name, 'variant': item['id'], **dict(row), 'conversionRate': row['converters'] / row['exposures'] if row['exposures'] else None})
        return {'events': events, 'experiments': results, 'retentionDays': 90, 'privacy': 'Only consented pseudonymous events; withdrawal removes this visitor data.'}
