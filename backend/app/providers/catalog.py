def schema(properties=None, required=None):
    return {'type': 'object', 'properties': properties or {}, 'required': required or [], 'additionalProperties': False}


def provider_tool(name, description, properties=None, required=None, read_only=False, external=False):
    return {'name': name, 'description': description, 'inputSchema': schema(properties, required), 'annotations': {'readOnlyHint': read_only, 'destructiveHint': False, 'idempotentHint': read_only, 'openWorldHint': external}}


TEXT = {'type': 'string', 'minLength': 1, 'maxLength': 128}
PROVIDER_TOOLS = [
    provider_tool('provider_status', 'Read explicit configured or unavailable provider states without revealing server credentials.', read_only=True),
    provider_tool('request_translation', 'Call configured LibreTranslate and persist returned text for explicit human review, without applying it.', {'target': TEXT, 'source': TEXT, 'entries': {'type': 'object', 'minProperties': 1, 'maxProperties': 100, 'additionalProperties': {'type': 'string', 'maxLength': 8192}}}, ['target', 'entries'], external=True),
    provider_tool('list_translation_reviews', 'Read persisted translation requests for the active site.', read_only=True),
    provider_tool('review_translation', 'Accept or reject a pending translation. Acceptance applies locale.set through Rust with revision protection.', {'id': TEXT, 'accept': {'type': 'boolean'}, 'expectedRevision': {'type': 'integer', 'minimum': 0}}, ['id', 'accept']),
    provider_tool('deploy_remote', 'Upload actual compiler files to configured Cloudflare Pages and return observed provider deployment state. Requires server credentials and rejects visitor-gated static sites.', {'locale': TEXT}, external=True),
    provider_tool('list_provider_deployments', 'Read deployment records for the active site.', read_only=True),
    provider_tool('get_provider_deployment', 'Refresh a known Cloudflare deployment from the actual configured provider API.', {'id': TEXT}, ['id'], read_only=True, external=True),
    provider_tool('attach_domain', 'Request Cloudflare Pages custom-domain attachment. Returned validation state is not proof of a completed TLS handshake.', {'name': {'type': 'string', 'minLength': 1, 'maxLength': 253}}, ['name'], external=True),
    provider_tool('get_domain_status', 'Read Cloudflare domain, certificate authority, validation and verification status.', read_only=True, external=True),
    provider_tool('fetch_external_data', 'Fetch an allowlisted server source using server-only headers. Returns only configured response fields with secrets redacted.', {'source': TEXT, 'params': {'type': 'object', 'maxProperties': 16, 'additionalProperties': {'type': ['string', 'number', 'boolean']}}}, ['source'], external=True),
    provider_tool('sync_commerce_catalog', 'Synchronize Shopify products, variants, prices and sellable inventory into the active site provider store.', external=True),
    provider_tool('get_commerce_catalog', 'Read the synchronized Shopify catalog, preserving unknown inventory as unknown.', read_only=True),
    provider_tool('get_commerce_orders', 'Read pending checkouts and order transitions accepted only from signed Shopify webhooks.', read_only=True),
    provider_tool('list_visitor_members', 'Read separately scoped website visitor memberships, excluding password hashes and session credentials.', read_only=True),
    provider_tool('manage_visitor_member', 'Change visitor groups or disable a visitor and revoke its sessions. This does not grant editor access.', {'email': {'type': 'string', 'maxLength': 254}, 'groups': {'type': 'array', 'minItems': 1, 'maxItems': 16, 'items': {'type': 'string', 'minLength': 1, 'maxLength': 64}}, 'disabled': {'type': 'boolean'}}, ['email', 'groups']),
    provider_tool('get_insights', 'Read collected consented page events, server experiment exposures and conversions for the active site.', read_only=True),
]
PROVIDER_BY_NAME = {item['name']: item for item in PROVIDER_TOOLS}
