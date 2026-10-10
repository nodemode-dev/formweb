def schema(properties=None, required=None):
    return {'type': 'object', 'properties': properties or {}, 'required': required or [], 'additionalProperties': False}


def tool(name, description, properties=None, required=None, read_only=False, destructive=False, idempotent=False):
    return {'name': name, 'description': description, 'inputSchema': schema(properties, required), 'annotations': {'readOnlyHint': read_only, 'destructiveHint': destructive, 'idempotentHint': idempotent, 'openWorldHint': False}}


REVISION = {'type': 'integer', 'minimum': 0, 'description': 'Require the current engine revision. A stale revision fails without modifying the site.'}
OPTIONAL_NAME = {'type': 'string', 'minLength': 1, 'maxLength': 160}
TOOLS = [
    tool('get_site', 'Read the authoritative Rust site, revision and undo/redo availability.', read_only=True, idempotent=True),
    tool('apply_commands', 'Apply an atomic command batch to the same document shown by the editor. Read formweb://commands for supported commands.', {'commands': {'type': 'array', 'minItems': 1, 'maxItems': 200, 'items': schema({'command': {'type': 'string'}, 'params': {'type': 'object'}}, ['command', 'params'])}, 'expected_revision': REVISION}, ['commands']),
    tool('history', 'Undo or redo one engine history entry.', {'action': {'type': 'string', 'enum': ['undo', 'redo']}, 'expected_revision': REVISION}, ['action']),
    tool('audit_site', 'Run the engine accessibility and site integrity audit.', read_only=True, idempotent=True),
    tool('save_project', 'Persist the editable site in the local project store.', {'name': OPTIONAL_NAME}, idempotent=True),
    tool('list_projects', 'List locally saved projects.', read_only=True, idempotent=True),
    tool('open_project', 'Replace the open site with a saved local project. Autosave preserves the last acknowledged current site until replacement.', {'project_id': {'type': 'string', 'minLength': 1, 'maxLength': 160}}, ['project_id'], destructive=True, idempotent=True),
    tool('export_site', 'Write a portable HTML/CSS/JS ZIP to the local data exports directory and return its path, manifest and download URL.', {'locale': {'type': 'string', 'maxLength': 40}}),
    tool('publish_site', 'Create an immutable snapshot served by this local backend. This does not deploy to external hosting.', {'slug': {'type': 'string', 'pattern': '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'}}),
    tool('list_submissions', 'Read up to 500 locally stored form submissions. No email delivery is performed.', read_only=True, idempotent=True),
]
BY_NAME = {item['name']: item for item in TOOLS}
