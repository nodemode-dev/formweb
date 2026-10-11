def schema(properties=None, required=None):
    return {'type': 'object', 'properties': properties or {}, 'required': required or [], 'additionalProperties': False}


def tool(name, description, properties=None, required=None, read_only=False, destructive=False, idempotent=False):
    return {'name': name, 'description': description, 'inputSchema': schema(properties, required), 'annotations': {'readOnlyHint': read_only, 'destructiveHint': destructive, 'idempotentHint': idempotent, 'openWorldHint': False}}


REVISION = {'type': 'integer', 'minimum': 0, 'description': 'Require the current engine revision. A stale revision fails without modifying the site.'}
OPTIONAL_NAME = {'type': 'string', 'minLength': 1, 'maxLength': 160}
TOOLS = [
    tool('get_site', 'Read the site open in the editor and its revision. Call first, and again after a conflict. detail "summary" returns pages, components, collections and settings in a few hundred bytes; "full" (default) returns every element with styles and attributes. For element IDs alone, read formweb://site/tree.', {'detail': {'type': 'string', 'enum': ['summary', 'full'], 'default': 'full'}}, read_only=True, idempotent=True),
    tool('apply_commands', 'Apply several engine commands as one atomic undo step, for changes that must land together (for example add a section and its children). For a single change prefer the edit_* domain tools, which list each command\'s parameters. Commands and parameters: formweb://commands. Returns a compact summary; pass detail "site" for the whole document.', {'commands': {'type': 'array', 'minItems': 1, 'maxItems': 200, 'items': schema({'command': {'type': 'string'}, 'params': {'type': 'object'}}, ['command', 'params'])}, 'expected_revision': REVISION, 'detail': {'type': 'string', 'enum': ['summary', 'site'], 'default': 'summary'}}, ['commands']),
    tool('history', 'Undo or redo one step, exactly like Ctrl+Z in the editor. Use to reverse your own last change; check formweb://activity first if others are editing.', {'action': {'type': 'string', 'enum': ['undo', 'redo']}, 'expected_revision': REVISION, 'detail': {'type': 'string', 'enum': ['summary', 'site'], 'default': 'summary'}}, ['action']),
    tool('audit_site', 'Check accessibility, SEO and site integrity (missing alt text, heading order, broken links, metadata). Run before export or publish and fix what it reports.', read_only=True, idempotent=True),
    tool('save_project', 'Persist the editable site in the local project store.', {'name': OPTIONAL_NAME}, idempotent=True),
    tool('list_projects', 'List locally saved projects.', read_only=True, idempotent=True),
    tool('open_project', 'Replace the open site with a saved local project. Autosave preserves the last acknowledged current site until replacement.', {'project_id': {'type': 'string', 'minLength': 1, 'maxLength': 160}}, ['project_id'], destructive=True, idempotent=True),
    tool('export_site', 'Write a portable HTML/CSS/JS ZIP to the local data exports directory and return its path, manifest and download URL.', {'locale': {'type': 'string', 'maxLength': 40}}),
    tool('publish_site', 'Create an immutable snapshot served by this local backend. This does not deploy to external hosting.', {'slug': {'type': 'string', 'pattern': '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'}}),
    tool('list_submissions', 'Read up to 500 locally stored form submissions. No email delivery is performed.', read_only=True, idempotent=True),
    tool('set_page_password', 'Protect a route (one page, a folder such as /members, or / for the whole site) with a shared password, or remove protection with password null. Enforced when FormWeb serves a published or active release; a static export of a protected site is refused. Requires publish permission. Never echo the password back to the person.', {'route': {'type': 'string', 'minLength': 1, 'maxLength': 200}, 'password': {'type': ['string', 'null'], 'minLength': 6, 'maxLength': 200}}, ['route', 'password']),
    tool('brand_check', 'List off-brand colors, fonts and logos on a page (or the whole site) against the brand kit, each with a ready node.update fix that uses the nearest brand token. Use before delivery when the site has a brand kit; apply chosen fixes with apply_commands as one undo step.', {'page': {'type': 'string', 'maxLength': 200, 'description': 'Page ID or slug; omit for every page.'}}, read_only=True, idempotent=True),
    tool('list_page_passwords', 'List the routes protected by a password on the open site (routes only; passwords are stored as one-way hashes).', read_only=True, idempotent=True),
    tool('qr_code', 'Return an SVG QR code that encodes a page URL (use the published URL for print). PNG downloads: GET /api/qr?url=...&format=png.', {'url': {'type': 'string', 'maxLength': 2048, 'pattern': '^https?://'}, 'dark': {'type': 'string', 'pattern': '^#[0-9a-fA-F]{6}$'}, 'light': {'type': 'string', 'pattern': '^#[0-9a-fA-F]{6}$'}}, ['url'], read_only=True, idempotent=True),
]
BY_NAME = {item['name']: item for item in TOOLS}
