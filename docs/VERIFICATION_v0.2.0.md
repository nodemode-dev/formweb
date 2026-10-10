# FormWeb v0.2.0 verification

This continuation implements the researched advanced workflows in the Rust authority, TypeScript/Vite editor and Python/FastAPI service. Observations were collected on Linux on 2026-10-10 through actual product operations. Development observations retain their original 0.1.0 metadata and binary hashes. The final release build and archive checks are recorded in the matching sidecar.

## Editor and compiler consumers

Chromium 153 ran with origin security enabled, CPU 4x, 150 ms latency, 750 kbit/s download, 250 kbit/s upload and disabled cache. All 93 Studio panes opened. That count describes discovery; acceptance comes from the consuming operations below.

| Area | Observed behavior | Retained evidence |
| --- | --- | --- |
| Design system | Two token consumers, linked preset updates, retained local override and removed obsolete property | research/design-browser-observations-v0.2.0.json |
| Responsive layout | Custom 601/600 threshold, desktop/phone flex wrapping, grid rows and child placement | research/design-browser-observations-v0.2.0.json |
| Components | Independent two-instance props/variants, fragment remapping, two slots, reset and detach | research/design-browser-observations-v0.2.0.json; native/VARIANT_OBSERVATIONS_v0.2.0.json |
| Portable source | Toolbar native download and file-picker reopen retained props, slots, variants and 19 undo entries | research/design-browser-observations-v0.2.0.json |
| Pinned libraries | Definition-only change appeared in review; acknowledged update preserved source IDs and rendered the new default | research/library-definition-observations-v0.2.0.json; research/design-browser-observations-v0.2.0.json |
| DOM stability | Pending textarea JSON, focused node and selection 3..10 survived an independent REST/SSE update; checked mounted panes had zero removals | research/browser-observations-v0.2.0.json |
| CMS and locales | Seven independently served English/French root/detail routes, selected bindings, relation text, typed filtering, sorting, pagination, empty output and localized draft omission | research/portable-routing-browser-v0.2.0.json; research/compiler-browser-observations-v020.json |
| Metadata | Distinct item titles, descriptions and Open Graph, absolute canonical/sitemap, reciprocal alternates and parsed hostile-input JSON-LD | research/portable-routing-browser-v0.2.0.json |
| Motion | Hover/press/focus, inverse variant baseline, overlapping timeline tracks, CSS keyframe interpolation, once reveal and reduced-motion final styles | research/compiler-browser-observations-v020.json; research/compiler-final-browser-observations-v020.json |
| Code components | Pinned TypeScript compiler diagnostics and SHA-256 source/output checks; actual counter click; parent/top access and external fetch blocked | research/code-build-observations-v0.2.0.json; research/sandbox-security-observations-v0.2.0.json |
| Compiled Preview | Studio prop edit rendered identically in Preview and independent static export; delayed compilation retained the old mounted frame | research/compiled-preview-observations-v0.2.0.json |
| Owned localized media | English and French PNGs decoded with distinct dimensions and hashes; emitted bytes exactly matched both uploaded assets | research/compiled-preview-observations-v0.2.0.json |

Design observations include 13 consuming checks and 33 actual UI actions with zero page errors. An actual exported ZIP was unpacked and served independently of Preview; computed token, preset, grid and library values agreed. Browser observations are sampled evidence, not a universal no-flicker or accessibility certification.

## Durable service workflows

Actual REST and official-SDK operations exercised viewer/editor/owner roles, attribution, anchored comments after reorder/restart, two concurrent writers with a 409 and fresh retry preserving both changes, isolated branches, conflict review, merge as one undo and scoped project deletion. Named project and branch checkpoints survived switching and restart. Clean native import restored owned assets held only in history; undo/redo and checkpoint recovery survived restart and native-process termination.

Typed CSV round trips preserved quoted commas/newlines, field names that collide with control columns, numbers, booleans, missing/null/empty values and locale overrides. Malformed duplicate/type input failed atomically. Local library snapshots are immutable and scoped by project ownership; updates require a reviewed digest and revision.

Form intake uses the frozen published schema. Retained service checks include six validation errors, accepted typed payload, CSV download, retention deletion, gate enforcement and exact rollback bytes. Actual browser submissions showed server 422 with inline errors and preserved inputs, two successful resets retaining declared query attribution, and redirects inside the immutable publication or opaque Preview prefix. Removing the generated tracking declaration removed the named hidden control, submitted field and stored tracking. See research/compiler-forms-browser-observations-v020.json and compiler-tracking-browser-observations-v020.json.

Signed delivery uses a persisted queue, bounded retry, timestamp/job/body HMAC and resolved-IP TLS checks. A real fixture returned 500 then 204 with valid signatures. Retention removed queued/in-flight records and attempts without recreating orphan data. An already initiated remote request cannot be recalled.

Retained records: research/role-lifecycle-observations-v0.2.0.json, branch-durability-observations-v0.2.0.json, history-observations-v0.2.0.json, crash-observations-v0.2.0.json, content-observations-v0.2.0.json, forms-release-observations-v0.2.0.json, form-gate-observations-v0.2.0.json, delivery-observations-v0.2.0.json and delivery-retention-observations-v0.2.0.json.

## Real MCP and harness

The official Python SDK 2.3.0 discovered 61 tools and 13 resources. HTTP and stdio operate the same revisioned Rust state as REST. Four harness scenarios recorded 62 tool calls and eight expected rejections. Owner/viewer authentication, tool attribution, conflict handling and an 8,884,869-byte native request were observed. The native command catalog contains 40 commands.

The canonical .claude/skills/formweb-harness and .agents mirror contain 14 Markdown files, six routed roles and three advanced references. Strict god-tier validation reported zero FAIL and zero WARN. The 962-character description passed 15 positive lexical cases and 10 negative cases; the recorded description quality score is 13/14. These are format and lexical results. Automatic model activation and a no-skill performance baseline remain unmeasured.

See docs/harness/QUICKSTART.md and the sidecar research/harness-audit-v0.2.0.md for actual SDK workflows and diagnostic corrections.

## Providers and publication privacy

Provider verification records 43 consuming HTTP operations and six official SDK operations against declared protocol fixtures. Server credentials stay outside Site, native files, frontend state and public output. Public fetch fields are allowlisted; actual compiled widgets consumed dotted data fields. Product widgets rendered inventory/price and variant choice, changed cart quantities, cleared the cart and navigated the returned HTTPS checkout URL under local fulfillment. Checkout rechecked availability through the actual adapter. This is transport and runtime proof; it is not a paid order or an external account completion.

A separate 109-check publication audit found no leaks. English/French detail aliases, private CSS/code/raster and active releases returned anonymous 401, wrong-group 403 and authorized 200 with private no-store. Public code and owned images on the same site remained anonymous 200 with exact bytes. Native/editor files stayed inaccessible and static export of gated pages was rejected. Asset access follows actual owning pages.

Actual browser membership and consent checks covered registration, HttpOnly Strict sessions, logout/revocation, independent editor authorization, consent before assignment, an authored conversion goal, collected Studio metrics and withdrawal erasing/stopping events. Provider browser and widget observations reported zero page errors.

See docs/PROVIDER_VERIFICATION_v0.2.0.md, docs/PRIVATE_PUBLICATION_AUDIT_v0.2.0.md and retained research/provider-validation, research/provider-browser, research/provider-widgets and research/gated-audit observations.

## Corrections and limits

An initial serverless-browser launch inherited disabled web-security flags. Its parent/top/CSP conclusions were withdrawn. Separate origin-security-enabled runs proved opaque origins, SecurityError boundaries and blocked external fetches. Earlier diagnostic mistakes, including wrong endpoint guesses and SDK header arguments, remain in the observation record. They are not silently counted as application passes.

The parity denominator remains the original 65 targets with 62 fetched primary source records. The v0.1.0 audit remains historical. See PARITY_v0.2.0.md and parity-audit-v0.2.0.json for acceptance-specific grades and limitations.

Real Cloudflare deployment completion, public DNS/TLS/CDN, LibreTranslate account quality, Shopify store permissions, hosted checkout settlement and genuine provider webhook delivery require external configuration and independent completion. Windows/macOS launchers, hosted CI, full accessibility certification and automatic skill activation were not executed here. Nested linked component definitions require detachment before portability; unsupported library dependencies fail explicitly. Broad third-party marketplace equivalence is not claimed.
