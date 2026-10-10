# Provider verification · v0.2.0

Observed 2026-10-10 using isolated data folders. Forty-three consuming HTTP observations passed against the actual FastAPI application, Rust model/compiler and local vendor protocol fixtures. Six additional observations passed through the installed official MCP SDK and actual streamable HTTP transport. The local fixtures returned deliberately queued deployments, pending domains and pending hosted checkout responses; they did not contact real provider accounts.

## Observed scope

| Feature | Actual observation | Evidence boundary |
| --- | --- | --- |
| FW-041 | Translation HTTP request persisted a review queue without applying text. Acceptance wrote the locale dictionary through Rust. | LibreTranslate-compatible local protocol; real translation service quality and credentials unverified. |
| FW-050 | Generated compiler files were uploaded explicitly and a multipart manifest was transmitted. Deployment remained idle/queued and domain remained pending. | Local Cloudflare protocol fixture. Real account hash compatibility, public reachability, domain ownership, TLS handshake and CDN remain open. |
| FW-058 | Loading, ready and error endpoints; rejected unknown query names; allowed dotted fields; server-secret redaction; actual published runtime fetch. | Configured local HTTP transport. Source credentials stayed server-side. DNS-pinned connector implementation was reviewed; no public vendor request was credited. |
| FW-062 | Product catalog synchronized available, sold-out and unknown-inventory variants. Overselling was rejected against fresh availability. Malformed connections and repeated cursors returned 502. | Shopify-compatible local GraphQL fixture. Real store token/product/inventory permissions unverified. |
| FW-063 | Hosted checkout URL returned pending. Invalid webhook HMAC returned 401; a valid raw-body signed fixture moved the matched order to paid; repeated delivery was idempotent. Editor orders endpoint consumed the result. | Signed protocol fixture only. No vendor sandbox checkout or payment settlement occurred. |
| FW-064 | Anonymous private HTML returned 401; wrong group returned 403; authorized group received private HTML with private,no-store. Group edits revoked sessions. Public HTML omitted withheld text; native source was omitted; public static export rejected gated sites. Visitor cookies could not access editor APIs. | Actual local private publication and cookie requests. Shared media and localized/CMS alias coverage belong to the final publication audit. |
| FW-064 / FW-065 | Opaque preview preflight allowed the dedicated headers. Header sessions and consent persisted under one verified nonce; another nonce was denied; preview capability did not authorize editor APIs. | Actual Origin:null HTTP requests and immutable preview snapshots. Browser iframe behavior is assessed separately by the final browser verification. |
| FW-065 | Consent was required before assignment. Weighted assignment remained stable; forged conversion was rejected; collected metrics contained one exposure/converter; withdrawal erased that visitor's events and denied further collection. | Actual local consent/event/metric endpoints. No third-party analytics service claim. |
| MCP | Actual official SDK discovered 61 tools including all 16 provider tools, dispatched provider status, returned honest unconfigured errors and denied unauthenticated transport. | Actual streamable HTTP MCP. No descriptor-only claim. |

A final narrow schema check preserved valid unknown inventory and rejected four malformed variant-price shapes with 502. The provider modules compile with the installed backend interpreter. No new dependencies, vendor SDKs or testing suites were added to the product.

## Reproducible evidence

The canonical evidence is `research/provider-validation/provider-verification-final.json` in the build workspace. It records the individual HTTP and MCP observations, their source evidence paths and final provider source hashes. The earlier HTTP record retains its failed SDK setup attempt: all 43 HTTP checks passed, then the manual fixture used an obsolete SDK keyword. The separate corrected SDK invocation used its current http_client argument and two returned streams. The canonical record combines only the observed passing groups, without changing the failed attempt.

Earlier local adapter observations are retained separately. Their lowercased buyer-IP header check failed; the final transport preserves documented header spelling and the consuming HTTP rerun passed. Fixture errors are not represented as product failures or hidden as passes.

## Remaining provider acceptance

Production acceptance requires a real LibreTranslate endpoint, Cloudflare Pages credentials/project and an owned domain, and a Shopify store/private token plus installed signed order subscriptions. Credentials must be supplied only through server environment. Deployment submission is not completed hosting; provider domain fields are not a measured certificate; checkout creation is not a charge. Validate actual public fetch/deployment TLS and payment sandbox behavior before claiming those remote completions.

Published membership and analytics require a same-origin runtime service or reverse proxy. Static export cannot implement private member access, server secret fetches, analytics collection or checkout proxy by itself. Opaque preview tokens are closure-local and bound to the exact verified nonce; they do not substitute for published visitor cookies or editor credentials.

Official contracts and environment names are documented in [PROVIDER_RESEARCH_v0.2.0.md](PROVIDER_RESEARCH_v0.2.0.md). The independent parity and final browser reports determine complete feature grades; these provider transport observations alone do not establish full UI/runtime parity.
