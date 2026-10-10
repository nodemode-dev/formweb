import csv
import io
import json
import math
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

from .engine import EngineError


class FormValidationError(EngineError):
    def __init__(self, errors):
        super().__init__('Correct the highlighted fields.', 422)
        self.details = {'errors': errors}


class Forms:
    def __init__(self, studio):
        self.studio = studio
        self.store = studio.store
        self.store.db.execute('CREATE TABLE IF NOT EXISTS submission_meta (submission_id TEXT PRIMARY KEY,tracking TEXT NOT NULL,source TEXT,publication TEXT)')
        self.store.db.commit()

    def validate(self, site, form_id, values):
        form = site['nodes'].get(form_id)
        if not form or form['tag'] != 'form':
            raise EngineError('Form not found.', 404)
        config = site.get('extensions', {}).get('forms', {}).get('forms', {}).get(form_id, {})
        constraints = config.get('constraints', {})
        tracking_config = config.get('tracking', {})
        fields = {}
        pending = list(form.get('children', []))
        while pending:
            node = site['nodes'][pending.pop()]
            pending.extend(node.get('children', []))
            attrs = node.get('attrs', {})
            if node['tag'] in ('input', 'select', 'textarea') and attrs.get('name') and attrs.get('type') not in ('submit', 'button', 'reset') and 'disabled' not in attrs:
                fields.setdefault(attrs['name'], []).append(node)
        unknown = set(values) - set(fields) - set(tracking_config) - {'_formweb_hp'}
        if len(values) > 128 or unknown:
            raise FormValidationError({name: 'Unrecognized field.' for name in unknown} or {'form': 'Too many fields.'})
        output, errors, tracking = {}, {}, {}
        for name in tracking_config:
            value = values.get(name, '')
            if not isinstance(value, str) or len(value) > 1024:
                errors[name] = 'Tracking value is too long or invalid.'
            else:
                tracking[name] = value
        for name, nodes in fields.items():
            node, attrs = nodes[0], nodes[0].get('attrs', {})
            rule = constraints.get(name, {})
            kind = attrs.get('type', 'text') if node['tag'] == 'input' else node['tag']
            supplied = values.get(name, '')
            supplied_list = supplied if isinstance(supplied, list) else [supplied]
            if any(not isinstance(value, (str, int, float, bool)) for value in supplied_list) or len(supplied_list) > 64:
                errors[name] = 'Use text or scalar field values.'
                continue
            entries = [str(value).strip() for value in supplied_list if str(value).strip()]
            if len(entries) > 1 and kind != 'checkbox' and 'multiple' not in attrs:
                errors[name] = 'This field accepts a single value.'
            required = bool(rule.get('required', any('required' in item.get('attrs', {}) for item in nodes)))
            value = entries[0] if entries else ''
            if kind == 'file':
                errors[name] = 'File uploads are unavailable.'
                continue
            if kind == 'checkbox':
                checked = [entry for entry in entries if entry.lower() not in ('false', '0', 'off')]
                if required and not checked:
                    errors[name] = 'Check this field to continue.'
                if len(nodes) > 1:
                    choices = {item.get('attrs', {}).get('value', 'on') for item in nodes}
                    if any(entry not in choices for entry in checked):
                        errors[name] = 'Choose one of the available options.'
                    output[name] = checked
                else:
                    allowed = {attrs.get('value', 'on'), 'true', 'True', '1', 'on'}
                    if len(checked) > 1 or any(entry not in allowed for entry in checked):
                        errors[name] = 'Use the configured checkbox value.'
                    output[name] = bool(checked)
                continue
            if required and not value:
                errors[name] = 'This field is required.'
            if not value:
                output[name] = [] if 'multiple' in attrs else ''
                continue
            if kind == 'radio':
                choices = {item.get('attrs', {}).get('value', 'on') for item in nodes}
                if len(entries) != 1 or value not in choices:
                    errors[name] = 'Choose one of the available options.'
            elif node['tag'] == 'select':
                choices = set()
                todo = list(node.get('children', []))
                while todo:
                    option = site['nodes'][todo.pop()]
                    todo.extend(option.get('children', []))
                    if option['tag'] == 'option' and 'disabled' not in option.get('attrs', {}):
                        choices.add(option.get('attrs', {}).get('value', option.get('text', '')))
                if any(entry not in choices for entry in entries) or ('multiple' not in attrs and len(entries) > 1):
                    errors[name] = 'Choose one of the available options.'
            try:
                maximum = min(4096, int(rule.get('maxLength', attrs.get('maxlength', 4096))))
                minimum = max(0, int(rule.get('minLength', attrs.get('minlength', 0))))
            except (ValueError, TypeError):
                maximum, minimum = 4096, 0
            if any(len(entry) > maximum or len(entry) < minimum for entry in entries):
                errors[name] = f'Use between {minimum} and {maximum} characters.'
            pattern = rule.get('pattern', attrs.get('pattern'))
            if pattern:
                if not isinstance(pattern, str) or len(pattern) > 256 or re.search(r'[()|]|\\[1-9]', pattern) or pattern.count('*') + pattern.count('+') + len(re.findall(r'\{\d+,', pattern)) > 1:
                    errors[name] = 'This field pattern is unsupported.'
                else:
                    try:
                        if any(re.fullmatch(pattern, entry) is None for entry in entries):
                            errors[name] = 'Match the requested field format.'
                    except (re.error, OverflowError):
                        errors[name] = 'This field pattern is invalid.'
            if kind == 'email' and any(not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', entry) for entry in entries):
                errors[name] = 'Enter a valid email address.'
            if kind == 'url':
                parsed = urlparse(value)
                if parsed.scheme not in ('http', 'https') or not parsed.hostname:
                    errors[name] = 'Enter an HTTP or HTTPS URL.'
            if kind == 'date':
                try:
                    date.fromisoformat(value)
                    for limit, direction in (('min', -1), ('max', 1)):
                        bound = rule.get(limit, attrs.get(limit))
                        if bound and (value < bound if direction < 0 else value > bound):
                            errors[name] = 'Date is outside the allowed range.'
                except (TypeError, ValueError):
                    errors[name] = 'Enter a valid ISO date.'
            if kind in ('number', 'range'):
                try:
                    number = float(value)
                    if len(entries) != 1 or not math.isfinite(number):
                        raise ValueError()
                    lower, upper = rule.get('min', attrs.get('min')), rule.get('max', attrs.get('max'))
                    if lower is not None and number < float(lower) or upper is not None and number > float(upper):
                        raise ValueError()
                    step = attrs.get('step', '1')
                    if step != 'any':
                        delta = (number - float(lower or 0)) / float(step)
                        if not math.isfinite(delta) or abs(delta - round(delta)) > 1e-8:
                            raise ValueError()
                    output[name] = number
                except (ValueError, TypeError, ZeroDivisionError):
                    errors[name] = 'Number is outside the allowed range or step.'
                continue
            output[name] = entries if 'multiple' in attrs else value
        if errors:
            raise FormValidationError(errors)
        return output, tracking, config

    def record_tracking(self, submission_id, tracking, source, publication):
        self.store.db.execute('INSERT INTO submission_meta VALUES(?,?,?,?)', (submission_id, json.dumps(tracking), source, publication))
        self.store.db.commit()

    def inbox(self, site_id=None):
        self.studio.access.authorize('read')
        if site_id:
            self.studio.access.authorize_site(site_id)
        allowed = self.studio.access.accessible_sites()
        rows = self.store.db.execute('SELECT s.*,m.tracking,m.source,m.publication FROM submissions s LEFT JOIN submission_meta m ON m.submission_id=s.id WHERE (? IS NULL OR s.site_id=?) ORDER BY s.created_at DESC LIMIT 1000', (site_id, site_id))
        return {'submissions': [{'id': row['id'], 'siteId': row['site_id'], 'formId': row['form_id'], 'values': json.loads(row['values_json']), 'tracking': json.loads(row['tracking'] or '{}'), 'source': row['source'], 'publication': row['publication'], 'createdAt': row['created_at']} for row in rows if allowed is None or row['site_id'] in allowed]}

    def csv(self, site_id=None):
        rows = self.inbox(site_id)['submissions']
        names = sorted({name for row in rows for name in row['values']})
        tracking = sorted({name for row in rows for name in row['tracking']})
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        writer.writerow(['id', 'siteId', 'formId', 'createdAt', *names, *('tracking.' + name for name in tracking)])
        def cell(value):
            value = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
            return "'" + value if value.startswith(('=', '+', '-', '@')) else value
        for row in rows:
            writer.writerow([row['id'], row['siteId'], row['formId'], row['createdAt'], *(cell(row['values'].get(name, '')) for name in names), *(cell(row['tracking'].get(name, '')) for name in tracking)])
        return output.getvalue()

    def retention(self, days, site_id=None):
        identity = self.studio.access.authorize('manage')
        if not isinstance(days, int) or isinstance(days, bool) or not 0 <= days <= 36500:
            raise EngineError('Retention days must be between 0 and 36500.')
        if site_id:
            self.studio.access.authorize_site(site_id, 'manage')
        elif not identity['root']:
            site_id = self.store.get_meta('autosave')['site']['id']
        policies = self.store.get_meta('formRetentionPolicies') or {}
        policies[site_id or '*'] = days
        self.store.set_meta('formRetentionPolicies', policies)
        deleted = self.prune(days, site_id)
        self.studio.access.record('forms.retention', {'days': days, 'siteId': site_id, 'deleted': deleted})
        return {'days': days, 'siteId': site_id, 'deleted': deleted}

    def prune(self, days, site_id=None):
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        ids = [row['id'] for row in self.store.db.execute('SELECT id FROM submissions WHERE created_at<? AND (? IS NULL OR site_id=?)', (cutoff, site_id, site_id))]
        self.studio.delivery.prune(ids)
        self.store.db.executemany('DELETE FROM submission_meta WHERE submission_id=?', [(value,) for value in ids])
        self.store.db.executemany('DELETE FROM submissions WHERE id=?', [(value,) for value in ids])
        self.store.db.commit()
        return len(ids)

    def apply_retention(self):
        for site, days in (self.store.get_meta('formRetentionPolicies') or {}).items():
            self.prune(days, None if site == '*' else site)
