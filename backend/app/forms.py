import base64
import binascii
import csv
import io
import json
import math
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import PurePosixPath
from urllib.parse import urlparse
from uuid import uuid4

from .config import DATA_DIR
from .engine import EngineError

UPLOAD_DIR = DATA_DIR / 'form-uploads'
UPLOAD_TYPES = {
    '.png': ('image/png', b'\x89PNG'), '.jpg': ('image/jpeg', b'\xff\xd8\xff'), '.jpeg': ('image/jpeg', b'\xff\xd8\xff'), '.gif': ('image/gif', b'GIF8'),
    '.webp': ('image/webp', b'RIFF'), '.pdf': ('application/pdf', b'%PDF'), '.txt': ('text/plain', b''), '.csv': ('text/csv', b''),
    '.docx': ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', b'PK'), '.xlsx': ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b'PK'), '.zip': ('application/zip', b'PK'),
}
UPLOAD_LIMIT = 2 * 1024 * 1024
UPLOAD_FILES = 5
PRESETS = {
    'phone': (r'\+?[0-9][0-9 .\-]{5,18}[0-9]', 'Enter a valid phone number.'),
    'postal': (r'[A-Za-z0-9][A-Za-z0-9 \-]{2,9}', 'Enter a valid postal code.'),
    'email': (r'[^\s@]+@[^\s@]+\.[^\s@]+', 'Enter a valid email address.'),
}


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

    def check_files(self, supplied, attrs, rule, required):
        files = supplied if isinstance(supplied, list) else [supplied]
        files = [item for item in files if item not in ('', None)]
        if not files:
            return ('This file is required.' if required else None), []
        limit = min(UPLOAD_LIMIT, int(rule.get('maxSize', UPLOAD_LIMIT))) if isinstance(rule.get('maxSize', UPLOAD_LIMIT), (int, float)) else UPLOAD_LIMIT
        if len(files) > (UPLOAD_FILES if 'multiple' in attrs else 1):
            return 'Attach fewer files.', []
        accept = [token.strip().lower() for token in str(rule.get('accept', attrs.get('accept', ''))).split(',') if token.strip()]
        accepted = []
        for item in files:
            if not isinstance(item, dict) or not isinstance(item.get('name'), str) or not isinstance(item.get('data'), str):
                return 'Attach a file using the form.', []
            name = PurePosixPath(item['name'].replace('\\', '/')).name[:120]
            extension = PurePosixPath(name).suffix.lower()
            if extension not in UPLOAD_TYPES:
                return 'This file type is not allowed.', []
            mime = UPLOAD_TYPES[extension][0]
            if accept and not any(token == extension or token == mime or (token.endswith('/*') and mime.startswith(token[:-1])) for token in accept):
                return 'This file type is not accepted here.', []
            try:
                content = base64.b64decode(item['data'], validate=True)
            except (binascii.Error, ValueError):
                return 'The file could not be read.', []
            if not content or len(content) > limit:
                return f'Files must be between 1 byte and {limit // 1024} KB.', []
            if not content.startswith(UPLOAD_TYPES[extension][1]):
                return 'The file content does not match its type.', []
            accepted.append((name, mime, content))
        return None, accepted

    def store_files(self, name, accepted):
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        stored = []
        for original, mime, content in accepted:
            path = UPLOAD_DIR / f'{uuid4().hex}{PurePosixPath(original).suffix.lower()}'
            path.write_bytes(content)
            stored.append({'name': original, 'type': mime, 'size': len(content), 'file': f'form-uploads/{path.name}'})
        return stored

    def remove_files(self, ids):
        for submission_id in ids:
            row = self.store.db.execute('SELECT values_json FROM submissions WHERE id=?', (submission_id,)).fetchone()
            for value in json.loads(row['values_json']).values() if row else []:
                for item in value if isinstance(value, list) else []:
                    name = item.get('file', '') if isinstance(item, dict) else ''
                    if re.fullmatch(r'form-uploads/[0-9a-f]{32}\.[a-z]{3,4}', name):
                        (UPLOAD_DIR / name.split('/', 1)[1]).unlink(missing_ok=True)

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
        output, errors, tracking, uploads = {}, {}, {}, {}
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
            if kind == 'file':
                failure, accepted = self.check_files(supplied, attrs, rule, bool(rule.get('required', any('required' in item.get('attrs', {}) for item in nodes))))
                if failure:
                    errors[name] = failure
                elif accepted:
                    uploads[name] = accepted
                else:
                    output[name] = []
                continue
            supplied_list = supplied if isinstance(supplied, list) else [supplied]
            if any(not isinstance(value, (str, int, float, bool)) for value in supplied_list) or len(supplied_list) > 64:
                errors[name] = 'Use text or scalar field values.'
                continue
            entries = [str(value).strip() for value in supplied_list if str(value).strip()]
            if len(entries) > 1 and kind != 'checkbox' and 'multiple' not in attrs:
                errors[name] = 'This field accepts a single value.'
            required = bool(rule.get('required', any('required' in item.get('attrs', {}) for item in nodes)))
            value = entries[0] if entries else ''
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
            preset = PRESETS.get(rule.get('preset'))
            if preset and any(re.fullmatch(preset[0], entry) is None for entry in entries):
                errors[name] = preset[1]
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
        for name, accepted in uploads.items():
            output[name] = self.store_files(name, accepted)
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
        self.remove_files(ids)
        self.studio.delivery.prune(ids)
        self.store.db.executemany('DELETE FROM submission_meta WHERE submission_id=?', [(value,) for value in ids])
        self.store.db.executemany('DELETE FROM submissions WHERE id=?', [(value,) for value in ids])
        self.store.db.commit()
        return len(ids)

    def apply_retention(self):
        for site, days in (self.store.get_meta('formRetentionPolicies') or {}).items():
            self.prune(days, None if site == '*' else site)
