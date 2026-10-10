# FormWeb provider research · v0.2.0

Research accessed 2026-10-10. These are fetched official API documents, not search snippets or recalled product behavior. Each vendor's implementation statements have one organizational origin and are not independently corroborated. Local protocol fixtures can verify FormWeb transport and state transitions; they cannot establish vendor sandbox payment, deployed reachability, domain ownership, certificate issuance or CDN performance.

## Provider decisions and primary sources

| ID | Official source and title | Observed contract | FormWeb use |
| --- | --- | --- | --- |
| PR01 | [LibreTranslate API Usage](https://docs.libretranslate.com/guides/api_usage/) | POST translation with source, target and text returns translatedText; configured instances may require an API key. | Server-only endpoint and optional key; persisted review queue precedes Rust locale application. |
| PR02 | [Cloudflare Get upload token](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get_upload_token/) | A Pages Write token obtains a short-lived asset-operation JWT. | JWT stays inside the server deployment operation. |
| PR03 | [Cloudflare Check missing assets](https://developers.cloudflare.com/api/resources/pages/subresources/assets/methods/check_missing/) | The asset API accepts content-hash keys and returns missing keys. | Compiler files are hashed and only missing bytes are uploaded. |
| PR04 | [Cloudflare Upload asset](https://developers.cloudflare.com/api/resources/pages/subresources/assets/methods/upload/) | The asset body contains key, base64 value and content-type metadata. | Explicit generated HTML, CSS, runtime and owned raster bytes are sent as documented JSON assets. |
| PR05 | [Cloudflare Upsert asset hashes](https://developers.cloudflare.com/api/resources/pages/subresources/assets/methods/upsert_hashes/) | Hash registration refreshes the provider's asset record before reuse. | Registers uploaded manifest keys before deployment creation. |
| PR06 | [Cloudflare Create a Pages deployment](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/) | Direct upload uses multipart form data containing a JSON manifest; the response has a deployment identifier and stages. | Records only returned state. Submission does not imply completed hosting. |
| PR07 | [Cloudflare List Pages custom domains](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/list/) | Domain output exposes status, certificate authority, validation and verification fields. | Shows provider-reported fields, with an explicit unmeasured TLS-handshake boundary. |
| PR08 | [Cloudflare Add a Pages custom domain](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/create/) | Domain attachment accepts a fully qualified domain name. | Actual configured API call; pending/error state remains pending/error. |
| PR09 | [Shopify GraphQL Storefront API](https://shopify.dev/docs/api/storefront/latest) | The fetched latest API was 2026-10. Private access uses a server token; buyer traffic also supplies buyer IP. | Pinned version configurable on the server. Private token never enters exported files or client state. |
| PR10 | [Shopify ProductVariant](https://shopify.dev/docs/api/storefront/latest/objects/ProductVariant) | Variants expose selected options, price, sale availability and sellable quantity; quantity access requires token permissions. | Paginated product/variant synchronization preserves unknown quantity and rechecks availability before cart creation. |
| PR11 | [Shopify cartCreate](https://shopify.dev/docs/api/storefront/latest/mutations/cartCreate) | The mutation accepts merchandise quantities and discount codes and returns a cart or user errors. | Real cart creation returns its hosted checkout URL, with payment still pending. |
| PR12 | [Shopify Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries) | Shopify signs the raw delivery body with base64 HMAC-SHA256 and provides a delivery identifier for duplicate detection. | Signature and shop are checked before order processing. Delivery IDs are persisted; order regressions are rejected by state ordering. |
| PR13 | [Python hashlib](https://docs.python.org/3/library/hashlib.html) | The standard library provides PBKDF2-HMAC and SHA256. | Independently scoped visitor password derivation, random sessions and hashed stored session identifiers. |
| PR14 | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) | HttpOnly prevents script access; Secure restricts transport; SameSite affects cross-site cookie sending. | Visitor and consent cookies have separate names, HttpOnly and SameSite Strict. HTTPS responses add Secure. |

The Cloudflare asset reference defines hash strings rather than a mandatory digest algorithm. FormWeb chooses a deterministic 128-bit key derived from SHA256 over bytes and MIME type. Compatibility with a real account must be observed before crediting remote deployment completion. No Cloudflare SDK, Shopify SDK or LibreTranslate implementation is bundled. The adapters use Python's standard library and the already-installed permissive HTTP request encoder dependency.

## Configuration contract

Credentials are process environment/configuration, never Site.extensions, native projects, frontend settings, exported runtime, API status or MCP replies. Restart the backend after changing environment configuration. Configuration status returns missing environment variable names only.

| Workflow | Server environment |
| --- | --- |
| Translation | FORMWEB_TRANSLATE_URL, optional FORMWEB_TRANSLATE_KEY |
| Cloudflare | FORMWEB_CLOUDFLARE_TOKEN, FORMWEB_CLOUDFLARE_ACCOUNT, FORMWEB_CLOUDFLARE_PROJECT; optional FORMWEB_CLOUDFLARE_BRANCH |
| Shopify | FORMWEB_SHOPIFY_SHOP, FORMWEB_SHOPIFY_PRIVATE_TOKEN, FORMWEB_SHOPIFY_WEBHOOK_SECRET; optional FORMWEB_SHOPIFY_VERSION (default 2026-10) |
| External data | FORMWEB_FETCH_HOSTS and FORMWEB_FETCH_SOURCES JSON |
| Visitor signup | FORMWEB_MEMBER_SIGNUP (default 1; set 0 to disable public registration) |
| Local protocol fixture | FORMWEB_PROVIDER_ALLOW_LOOPBACK=1 permits explicit loopback endpoints. Cloudflare and Shopify API overrides remain restricted to loopback fixture hosts. |

An external data source is a server JSON object keyed by a stable source ID. Each entry has url, public boolean, params (allowed query names), fields (allowed dotted response paths), and headers mapping HTTP header names to environment variable names. For example, a public source may expose only title and author.name, while Authorization refers to a server variable containing the complete header value. The returned data object uses the exact allowlisted dotted paths as keys. Raw provider bodies and secret-bearing response fields are never forwarded.

## Consuming workflows

The provider editor API lives at /api/providers. Status, translation request/list/review, remote deploy/list/refresh, domain attachment/status, source fetch/state, Shopify synchronization/catalog/orders, visitor group management and insights each have a consuming endpoint and an MCP operation. Sixteen provider tools use strict top-level schemas and existing read/edit/publish/manage permissions. Remote operations expose their external nature through MCP annotations.

Public compiled runtime endpoints live at /api/runtime and require a published site query identifier, optionally exact slug/version context. Verified owner-preview tokens select their immutable preview snapshot. Public source fetch additionally requires a corresponding published fetch widget and a server public-source flag. Registration, login, logout and session belong to visitor membership, not editor identity. Group changes revoke visitor sessions. Static exports of gated sites must reject rather than expose protected content; local private publication uses server authorization before serving bytes.

Analytics is a local service. It records no events or assignments before explicit server consent. Consented assignments are persisted and weighted deterministically. Exposure and conversion metrics derive from collected events. A conversion must match both the stored assignment and the authored goal event. Withdrawal revokes consent and removes that visitor's events and assignments. Paths exclude query strings; events have bounded values and 90-day retention.

## Verification boundary

Local manual transport observations are recorded separately after execution. Real-provider verification still requires configured credentials and a deliberate remote run: a supported LibreTranslate instance, a Cloudflare Pages project and domain ownership, a Shopify store/private token with product/inventory permissions, and installed signed order webhook subscriptions. A hosted checkout URL is not a completed charge. Provider domain status is not a measured TLS handshake or CDN performance result. Visitor and analytics services are observed local operations and require appropriate same-origin server hosting for deployed use.

Opaque owner previews send credentials:omit. Their register/login and consent responses supply separate visitorToken and consentToken values retained only in the runtime closure. X-FormWeb-Visitor and X-FormWeb-Consent headers must match the exact verified preview nonce; tokens from one nonce cannot authenticate another preview, a normal published cookie session or an editor API. Published visitors continue to use HttpOnly cookies. External static hosting requires an accessible same-origin reverse proxy for runtime service endpoints; arbitrary cross-site cookie deployment is not claimed.

The final observed HTTP and MCP evidence is documented in [PROVIDER_VERIFICATION_v0.2.0.md](PROVIDER_VERIFICATION_v0.2.0.md). Credentials-required remote checks remain open regardless of local transport success.

The exact optional environment template is [backend/.env.providers.example](../backend/.env.providers.example). Copy the needed names into backend/.env and fill credentials locally, then restart the service. Empty credential fields keep remote providers unconfigured. The fixed Cloudflare/Shopify production API origins are selected by the adapters; the example does not enable test endpoint overrides. Keep FORMWEB_PROVIDER_ALLOW_LOOPBACK=0 for production. For external data, replace {} with the server-only JSON source configuration and supply a comma-separated exact hostname allowlist. The example contains no provider secrets.

