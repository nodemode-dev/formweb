# Provider module context · v0.2.0

## Org-navi-map

- app/providers/__init__.py · public provider and MCP exports
- app/providers/catalog.py · sixteen strict official-MCP tool descriptors
- app/providers/common.py · bounded configuration, redaction, transactional store and rate limits
- app/providers/transport.py · DNS-pinned HTTP(S) JSON transport
- app/providers/data.py · allowlisted fetch state and persisted translation review
- app/providers/deployment.py · explicit Cloudflare asset upload, deployment and domain state
- app/providers/commerce.py · Shopify catalog, live availability, hosted cart and signed orders
- app/providers/visitor.py · independent website visitor accounts, sessions and groups
- app/providers/insights.py · consent, weighted assignment, collected events and aggregate metrics
- app/providers/service.py · permission-aware provider dispatch shared by UI and MCP
- app/providers/routes.py · editor API and separate public runtime consumption
- app/providers/tokens.py · opaque preview visitor and consent nonce bindings

## Table of contents

[Catalogue](#catalogue) · [Storage and transport](#storage-and-transport) · [Data](#data) · [Deployment](#deployment) · [Commerce](#commerce) · [Visitor membership](#visitor-membership) · [Insights](#insights) · [Service and routes](#service-and-routes) · [Preview token bindings](#preview-token-bindings)

## Catalogue

### catalog.py · PROVIDER_TOOLS

- refers-to: catalog.py :: provider_tool and PROVIDER_TOOLS
- kind: explainer
- logged: v0.2.0 · 2026-10-10

Sixteen tools call the same service as the consuming editor routes. External calls set openWorldHint. Visitor passwords and provider credentials are absent from MCP authoring operations. Existing SDK code owns schema checking, dispatch and protocol negotiation.

## Storage and transport

### common.py · ProviderStore.connection

- refers-to: common.py :: ProviderStore and redact
- kind: rationale
- logged: v0.2.0 · 2026-10-10

Provider state is persisted separately from the Rust document in ignored providers.sqlite3. Connections commit or roll back and close. Site IDs scope catalogs, visitors, sessions and analytics. Only server environment holds provider secrets; returned fields are filtered/redacted. Request-local byte limits remain independent of global middleware limits.

### transport.py · pinned_json

- refers-to: transport.py :: pinned_json
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

Checking DNS and then letting a network client resolve again permits rebinding. The transport revalidates every resolved address and connects the selected address directly using the existing PinnedConnection, preserving the original Host and TLS server name. Redirects are rejected. httpx2 only encodes the request body, including multipart form data, and performs no network operation. Environmental proxies cannot affect this transport. Explicit loopback fixture opt-in is distinct from public HTTPS configuration.

## Data

### data.py · DataProviders.fetch, translate, review

- refers-to: data.py :: DataProviders
- kind: explainer
- logged: v0.2.0 · 2026-10-10

Sources are server-configured named entries with host, query and response-field allowlists. Loading/error states are visible, without raw provider bodies. Allowlisted dotted response paths are returned as exact flat keys. LibreTranslate responses are stored with originals and a review state. Acceptance merges translations into the current locale dictionary through the Rust command with revision protection; rejection never changes the document. A provider failure stays an error and cannot be accepted.

## Deployment

### deployment.py · CloudflarePages.deploy

- refers-to: deployment.py :: deploy, deployment, domains
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

The site and compiler file snapshot are captured under the document action lock before network activity. Direct upload obtains the short-lived upload JWT, checks missing hashes, uploads explicit bytes, registers hashes, then submits a multipart deployment manifest. Returned stages remain provider-reported stages. Domain authority/validation is not a measured TLS handshake. The API reference leaves hash algorithm choice unspecified; real-account compatibility remains an explicit remote-verification requirement. Visitor-gated documents reject static remote deployment.

## Commerce

### commerce.py · ShopifyCommerce

- refers-to: commerce.py :: sync, cart, webhook
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

Catalog synchronization uses private Storefront API requests with bounded pagination. Unknown quantity remains unknown. Each cart request rechecks remote variants and aggregated quantities before cartCreate. Hosted checkout creation records pending status and never marks a charge complete. Raw-body HMAC, configured shop and delivery ID are checked before order transitions; duplicate events are acknowledged without replay. Only matching cart tokens associate orders with site checkouts, and state ranks prevent paid orders reverting to pending.

## Visitor membership

### visitor.py · VisitorMembership

- refers-to: visitor.py :: register, login, session, authorize, manage
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

Website visitors use their own password-derived credentials and random session cookie, unrelated to editor bearer identities and sessions. Stored session tokens are SHA256 digests. Registration grants only member, not arbitrary client groups. Editor group changes revoke sessions. Publication handlers must call authorize before opening protected bytes and use private,no-store caching. Compiler public exports reject gates; local private compilation omits source JSON. Route-manifest aliases must map localized/CMS routes to canonical pages before authorization.

## Insights

### insights.py · ConsentedInsights

- refers-to: insights.py :: consent, assign, event, metrics
- kind: explainer
- logged: v0.2.0 · 2026-10-10

The server requires a persisted consent cookie before assignment or events. A stable weighted assignment records one exposure. Conversion events must match the server assignment and configured goal. Reports count collected exposures, unique converters and event totals. Consent withdrawal removes that pseudonymous visitor's events and assignments. Path query data is rejected; bounded events retain ninety days and cap site storage.

## Service and routes

### service.py, routes.py · dispatch and runtime_site

- refers-to: service.py :: dispatch_tool; routes.py :: runtime_site
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

Provider read/edit/publish/manage permissions apply independently of successful authentication. Runtime endpoints resolve exact immutable published snapshots or a verified immutable preview snapshot. Public fetch requires a matching published widget and the server's public-source flag. Public runtime and signed webhook routes must bypass editor credentials without granting editor access. The main app owns Origin checking and preview nonce verification. Runtime cookies are HttpOnly/SameSite Strict, with Secure on HTTPS. Deployed runtime workflows need an accessible same-origin FormWeb service; static files alone cannot process login, analytics, checkout proxy or private data.

## Preview token bindings

### tokens.py · token and bind

- refers-to: tokens.py :: token, bind; routes.py :: register, login, consent
- kind: warning-context
- logged: v0.2.0 · 2026-10-10

Opaque preview frames omit cookies. Visitor and consent tokens are returned only under a verified preview nonce, retained in the runtime closure and sent in separate headers. Persisted token digests bind to the hashed exact nonce for at most one hour. Middleware must first verify the nonce and its immutable preview snapshot. Another nonce and normal published cookie requests cannot reuse those preview tokens. Published HttpOnly cookie sessions remain separate from preview headers and editor credentials.

Final manual HTTP observations cover forty-three consuming behaviors, including malformed GraphQL connections/cursor progress, raw Shopify buyer-header spelling, private publication authorization, nonce continuity, signed fixture orders and collected metrics. Official MCP SDK discovery/dispatch supplies six additional observations. Both observation groups passed; vendor account completion and browser runtime acceptance remain separately scoped in docs/PROVIDER_VERIFICATION_v0.2.0.md.

