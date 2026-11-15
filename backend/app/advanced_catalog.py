from .mcp_catalog import OPTIONAL_NAME, REVISION, tool

ID = {'type': 'string', 'minLength': 1, 'maxLength': 160}
SITE = {'type': 'string', 'minLength': 1, 'maxLength': 96}
VERSION = {'type': 'string', 'minLength': 1, 'maxLength': 160}
LOCALE = {'type': 'string', 'maxLength': 40}
ADVANCED_TOOLS = [
    tool('get_checkpoint', 'Read the validated native site and complete undo/redo checkpoint.', read_only=True),
    tool('load_project_file', 'Import a native FormWeb envelope, embedded raster assets and validated native undo/redo history atomically into the shared editor.', {'native': {'type': 'object'}}, ['native'], destructive=True),
    tool('delete_project', 'Delete a local project and its saved checkpoint. Requires project management permission.', {'project_id': ID}, ['project_id'], destructive=True),
    tool('compile_preview', 'Compile immutable preview files for an opaque sandbox iframe with a one-hour scoped nonce.', {'page': ID, 'locale': LOCALE}),
    tool('list_releases', 'Read permitted frozen releases, active pointers and promotion history.', read_only=True),
    tool('promote_release', 'Change the active local site pointer to exact frozen release bytes without rebuilding.', {'slug': ID, 'version': VERSION}, ['slug', 'version']),
    tool('rollback_release', 'Move the active pointer to a selected or previous frozen release without rebuilding.', {'slug': ID, 'version': VERSION}, ['slug']),
    tool('list_branches', 'Read isolated draft branch snapshots for this project.', read_only=True),
    tool('create_branch', 'Capture a base and isolated branch snapshot, saving an unsaved main project first.', {'name': OPTIONAL_NAME}, ['name']),
    tool('capture_branch', 'Save the active document into an isolated branch snapshot without overwriting main.', {'id': ID}, ['id']),
    tool('open_branch', 'Open an isolated branch draft. Project saves capture this branch; main remains preserved.', {'id': ID}, ['id']),
    tool('review_branch', 'Compare base, current main and branch with recursive three-way conflict detection. Open main first.', {'id': ID}, ['id'], read_only=True),
    tool('merge_branch', 'Apply a reviewed three-way merge as one Rust undo entry. All conflicts require explicit choices.', {'id': ID, 'resolutions': {'type': 'object', 'maxProperties': 1000, 'additionalProperties': {'type': 'string', 'enum': ['current', 'branch']}}, 'expectedRevision': REVISION}, ['id']),
    tool('list_comments', 'Read attributed project comments and resolved state.', read_only=True),
    tool('add_comment', 'Add an attributed project or node comment.', {'text': {'type': 'string', 'minLength': 1, 'maxLength': 4000}, 'nodeId': ID}, ['text']),
    tool('resolve_comment', 'Resolve or reopen an existing attributed comment.', {'id': ID, 'resolved': {'type': 'boolean'}}, ['id', 'resolved']),
    tool('get_access', 'Read current bearer identity, project role, members and enforced permissions.', {'projectId': ID}, read_only=True),
    tool('create_identity', 'Create a local editor bearer identity and reveal its token once. Requires configured root authentication.', {'name': OPTIONAL_NAME}, ['name']),
    tool('grant_access', 'Grant an existing bearer identity a scoped project role.', {'identityId': ID, 'role': {'type': 'string', 'enum': ['viewer', 'reviewer', 'editor', 'publisher', 'owner']}, 'projectId': ID}, ['identityId', 'role']),
    tool('get_presence', 'Read project presence entries active within the last minute.', read_only=True),
    tool('update_presence', 'Publish an attributed project presence heartbeat and optional selected node.', {'nodeId': ID}),
    tool('get_activity', 'Read attributed REST and MCP project operations.', read_only=True),
    tool('export_submissions_csv', 'Return formula-safe CSV for permitted form submissions and tracking values.', {'siteId': SITE}, read_only=True),
    tool('set_form_retention', 'Persist form retention policy and remove old permitted submissions.', {'days': {'type': 'integer', 'minimum': 0, 'maximum': 36500}, 'siteId': SITE}, ['days'], destructive=True),
    tool('get_delivery_config', 'Read permitted webhook environment references and configuration state, excluding secret values.', {'siteId': SITE}, read_only=True),
    tool('configure_delivery', 'Configure durable signed webhook delivery using environment-only signing secrets and approved hosts.', {'siteId': SITE, 'endpoints': {'type': 'array', 'maxItems': 32, 'items': {'type': 'object'}}}, ['siteId', 'endpoints']),
    tool('list_deliveries', 'Read permitted durable jobs, observed responses and retry attempts.', {'siteId': SITE}, read_only=True),
    tool('retry_delivery', 'Requeue a permitted failed, blocked or queued delivery.', {'id': ID}, ['id']),
    tool('export_cms_csv', 'Return typed CMS CSV preserving absent, null, empty and localized values.', {'collection': ID}, ['collection'], read_only=True),
    tool('import_cms_csv', 'Validate and atomically import typed CMS CSV through Rust with upsert or replace semantics.', {'collection': ID, 'csv': {'type': 'string', 'maxLength': 8388608}, 'mode': {'type': 'string', 'enum': ['upsert', 'replace']}}, ['collection', 'csv']),
    tool('list_libraries', 'Read permitted immutable local component-library versions and digests.', read_only=True),
    tool('save_library', 'Snapshot a component library and its owned raster assets under an immutable semantic version.', {'id': ID, 'name': OPTIONAL_NAME, 'version': VERSION, 'site': {'type': 'object'}, 'native': {'type': 'object'}, 'components': {'type': 'array', 'items': ID}}, ['name']),
    tool('review_library', 'Compare a pinned component library with a selected immutable version and return the required review digest.', {'id': ID, 'version': VERSION}, ['id'], read_only=True),
    tool('import_library', 'Import a version-pinned component library; updates require an acknowledged review digest.', {'id': ID, 'version': VERSION, 'parent': ID, 'components': {'type': 'array', 'items': ID}, 'update': {'type': 'boolean'}, 'reviewDigest': {'type': 'string', 'maxLength': 64}}, ['id']),
    tool('build_code_component', 'Compile an explicitly enabled JavaScript or TypeScript component with actual compiler diagnostics: isolated mode exports mount(root,props) and runs in a sandboxed frame; page mode exports mount(root,props,ctx) and runs in the page.', {'enabled': {'type': 'boolean', 'const': True}, 'language': {'type': 'string', 'enum': ['typescript', 'javascript']}, 'source': {'type': 'string', 'maxLength': 262144}, 'props': {'type': 'object'}, 'mode': {'type': 'string', 'enum': ['isolated', 'page']}, 'poster': {'type': 'string', 'maxLength': 200}}, ['enabled', 'language', 'source']),
]
ADVANCED_BY_NAME = {item['name']: item for item in ADVANCED_TOOLS}
