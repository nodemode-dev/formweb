# FormWeb parity audit

Audited on 2026-10-10 against 65 researched targets: **11 full, 27 partial, 27 absent**. Weighted target attainment is **24.5/65 (37.69%)**. This release is a working local authoring baseline; complete Framer/Webflow parity remains unfinished.

## Grading and evidence

Full earns 1, partial earns 0.5, and absent earns 0. A full row needs the researched target through the document model, validated command, editor workflow and compiled/exported runtime where relevant, with actual execution. A significant missing subfeature, or a workflow available only through an engine/API/MCP path, keeps a row partial. Successful primitive calls do not erase missing variants, slots, templates, providers or other target requirements.

The denominator is the selected capability union and includes portability targets that neither competitor natively offers. It does not measure the complete products. Vendor-specific documentation is vendor-authored and not independently corroborated; two separate vendors corroborate shared categories only. Unknown capability evidence is not absence. The immutable researched requirements and exact official URLs are in [FRAMER_WEBFLOW_RESEARCH.md](FRAMER_WEBFLOW_RESEARCH.md) and [feature-catalog.json](feature-catalog.json).

[parity-audit.json](parity-audit.json) holds every acceptance criterion, source-code evidence path, observed result, scope caveat and implementation hash. Boundary rows are explicitly source-only. Runtime observations use isolated data, while the root owner observed the actual editor under throttling; see [VERIFICATION.md](VERIFICATION.md). Individual inspector controls beyond the shared-handler UI sample were inspected in source and exercised through the same authoritative command path, rather than each clicked independently.

## Executed functional evidence

- Actual FastAPI/Rust execution rejected stale revisions (409), ancestor cycles (400) and an invalid atomic batch without changing acknowledged content or revision. Valid cross-parent movement passed.
- Typed CMS data rejected a mismatched numeric field; two published entries rendered while the draft stayed out of export. Component source text propagated to inserted instances.
- Real form requests rejected missing/invalid email and a populated honeypot; a valid submission persisted. Rate limiting returned 429 and oversized input returned 413. Pending/success/error browser status behavior remains source-inspected.
- An independent official MCP SDK client negotiated 2025-11-25, discovered ten tools and two resources, mutated the live site and saved it; REST exposed the same state. The backend owner separately verified actual stdio proxy discovery and mutation. Agent-off, auth, Host and Origin gates were observed.
- Native .fweb import restored the canonical site and an owned PNG into an initially empty data directory with exact image bytes. Exported root/nested routes, CSS, runtime and the owned PNG served successfully on a generic static HTTP server.
- Versioned local publication preserved exact page bytes after later document edits; the fixed nested directory route returned 200. Public-origin canonical/sitemap configuration passed through the API. French text and lang compiled with fallback, without hreflang routes.
- The actual production editor ran at CPU 4x and latency 150 ms / 750 kbps with no page errors. Headline DOM identity survived edits, and a pending focused input retained text and selection 3..10 across an independent SSE update; persistent iframe/sidebar/inspector removals stayed zero. Controls demonstrated undo/redo/save, page creation, parent movement, typed CMS items, French translations and Agents gates. Mobile font 40px/display:none matched computed canvas values and exported CSS; reset cleared overrides. Actual chooser upload decoded a valid 96x64 PNG, native import restored canonical equality and its image, ZIP export contained exact raster bytes, and local publication served nested routes. Theme persisted reload, preview hid selection, and audit displayed actual findings.

## Coverage by priority

| Priority | Targets | Full | Partial | Absent | Weighted points |
| --- | ---: | ---: | ---: | ---: | ---: |
| P0 | 46 | 11 | 25 | 10 | 23.5 |
| P1 | 11 | 0 | 1 | 10 | 0.5 |
| P2 | 8 | 0 | 1 | 7 | 0.5 |

## Capability audit

| ID | Capability | Grade | Implementation boundary |
| --- | --- | --- | --- |
| FW-001 | Pages and routes | partial | Pages add, rename, delete and export routes. No page duplication command or control. |
| FW-002 | Nested scene tree and selection | full | Nested ids and selection, keyed inspector and iframe updates are implemented. |
| FW-003 | Reparent and reorder | full | Reparent and sibling ordering are validated; descendant-cycle changes are rejected. |
| FW-004 | Stack/flex layout | partial | Direction, gap and alignment edit flex layout; inspector does not expose wrapping. |
| FW-005 | Grid layout | partial | Columns and gaps plus narrow overrides are editable. Row tracks and child placement lack controls. |
| FW-006 | Preview without editor affordances | partial | Preview hides selection and routes links, but uses a separate TypeScript renderer instead of the compiled runtime; forms and scroll behavior diverge. |
| FW-007 | Undo and redo | partial | Atomic undo/redo snapshots work during a session. Loading a serialized site clears history. |
| FW-008 | Breakpoint inheritance | partial | Base, tablet and mobile cascade and reset exist. Custom preview width does not create or edit a saved breakpoint definition. |
| FW-009 | Responsive typography | full | Font size, line height and letter spacing support narrower breakpoint overrides. |
| FW-010 | Responsive visibility | full | Breakpoint display:none is editable and compiles to media queries. |
| FW-011 | Named color and size tokens | partial | Shared CSS custom properties update references. Tokens are untyped strings. |
| FW-012 | Text styles | none | No named text-preset model, command or editor workflow. |
| FW-013 | Reusable component definitions | partial | Capture and insert linked definitions propagate content/style edits. No detachment; source structure locks after insertion. |
| FW-014 | Instance properties and overrides | partial | Category-level instance overrides preserve local edits. No typed exposed properties or reset operation. |
| FW-015 | Component variants | none | No component variant/state model or switching controls. |
| FW-016 | Component slots | none | No named component-slot descriptors or slot insertion workflow. |
| FW-017 | Cross-project shared libraries | none | No pinned cross-project library manifests or update review. |
| FW-018 | Collections and typed fields | full | Six scalar field types are validated and saved in SQLite-backed project documents; CMS UI creates schemas and items. |
| FW-019 | Dynamic template pages | none | No CMS template-page model or per-item route generation. |
| FW-020 | Field bindings | partial | Text and image bindings render both editor and export. No URL-attribute or explicit selected-item binding descriptor. |
| FW-021 | Collection list and empty state | partial | Published items repeat in editor and export. No empty-state subtree or filter model. |
| FW-022 | Filtering | none | No collection predicate/query model or visitor filter controls. |
| FW-023 | Sorting and pagination | none | No collection sort or pagination descriptors/runtime. |
| FW-024 | CSV import and export | none | No CMS CSV mapping, import or export operation. |
| FW-025 | Relations | none | No reference or multi-reference field type/resolution. |
| FW-026 | Draft and publication state | partial | Model validates draft/published/archived and compiler omits non-published items. Editor exposes only draft/published. |
| FW-027 | Hover and press states | partial | Hover runtime includes focus and reduced motion; no declarative press state and editor preview lacks runtime parity. |
| FW-028 | Appear and scroll reveal | partial | Export reveals on IntersectionObserver with reduced-motion fallback and saved duration. No authorable easing; preview lacks scroll execution. |
| FW-029 | Variant switching | none | Generic toggle-class is implemented, but no component states or event-to-variant transition. |
| FW-030 | Multi-step timeline | none | No timeline tracks, overlap, delay/easing editor or multi-target sequencer. |
| FW-031 | Behavior conditions and overlays | none | No behavior predicates, persisted overlay sessions or accessible site-overlay runtime. |
| FW-032 | Native fields and required validation | partial | Preset contact form and required/email/numeric server checks work. General field types and constraints are incompletely exposed/validated. |
| FW-033 | Submission inbox and CSV | partial | Submissions persist and are listable through API/MCP. No editor inbox, CSV export or retention controls. |
| FW-034 | Webhook delivery | none | No durable signed webhook delivery jobs or retry pipeline. |
| FW-035 | Success and error states | partial | Export runtime renders pending/success/error and preserves error values. No configured success redirect; editor preview blocks submission. |
| FW-036 | Spam controls | full | Server rate limit, bounded request parsing and honeypot rejection are implemented for live exported forms. |
| FW-037 | Hidden tracking fields | partial | Generic hidden input fields can be represented and submitted. No explicit query-attribution binding/control. |
| FW-038 | Locale content overrides | partial | Locale text dictionaries and metadata overrides fall back. No localized asset overrides. |
| FW-039 | Localized CMS | none | CMS item values and publication status are global, not locale-specific. |
| FW-040 | Language and hreflang | partial | Selected locale sets lang and canonical. No reciprocal hreflang, locale routes or slug overrides. |
| FW-041 | Machine translation workflow | none | No configured translation provider, review state or translation queue. |
| FW-042 | Metadata and CMS title templates | partial | Page title/description/canonical/Open Graph compile. No per-item SEO binding/templates. |
| FW-043 | Sitemap and robots | partial | Sitemap excludes noindex pages, robots is emitted and the configured public origin now compiles. No public-origin editor control. |
| FW-044 | Redirect rules | none | No redirect rules, response adapter or cycle detection. |
| FW-045 | Semantics, alt text, labels | full | Semantic tags, decorative empty-alt and explicit aria-label names are editable and compile; label-for also works through the model. |
| FW-046 | Audit findings | partial | Deterministic severity/node diagnostics exist. Missing page title/description issues do not expose exact page ids. |
| FW-047 | JSON-LD structured data | none | No JSON-LD editor/model or compiler emission. |
| FW-048 | Immutable preview releases | full | Publish writes versioned immutable local snapshots and exposes a preview link. |
| FW-049 | Production promotion and rollback | none | No active production release pointer, promotion or rollback. |
| FW-050 | Custom domain and managed hosting | none | Local publishing only; no remote deploy/domain/TLS/CDN adapter. |
| FW-051 | Project branches and review | none | No isolated branch model, review workflow or revision-aware branch merge. |
| FW-052 | Comments and roles | none | No node comments or project role system; optional shared token is not a role. |
| FW-053 | Presence and simultaneous work | partial | SSE updates and expectedRevision conflicts exist. No person/session presence or multiplayer merge policy. |
| FW-054 | Authenticated project CRUD API | partial | Typed REST schemas, optional bearer/cookie auth and revision-aware Rust mutation/persistence are implemented. No saved-project delete API, store operation or editor control; complete project CRUD remains partial. |
| FW-055 | Real MCP tools and resources | full | Official MCP SDK implements lifecycle, tools/resources and the same document authority; Agents UI controls access. |
| FW-056 | Agent permissions and audit trail | partial | Agent on/off and optional shared token restrict REST/MCP. No role scopes or attributed operation audit trail. |
| FW-057 | Code component import and export | none | No isolated code-component build/import or typed code-component props/export. |
| FW-058 | External API data binding | none | No external fetch descriptors, loading/error states or credential proxy. |
| FW-059 | Static site export | full | Owned raster assets, HTML/CSS/runtime, route files and source JSON export portably; the MCP response includes the emitted file manifest. Remote media remain declared external references. |
| FW-060 | CMS/locales in portable export | partial | Published CMS lists and one selected locale materialize. No per-item detail pages or locale alternate routes in a single archive. |
| FW-061 | Project archive round trip | full | Versioned .fweb archives embed referenced owned raster images with hashes and restore the canonical model and exact image bytes into clean data. |
| FW-062 | Catalog, variants and inventory | none | No commerce provider/catalog/variant/inventory adapter. |
| FW-063 | Cart, payments, shipping and taxes | none | No live cart, checkout provider, shipping/tax/order webhook pipeline. |
| FW-064 | Site membership/gated content | none | No visitor account/gated-content provider. Editor access tokens are unrelated. |
| FW-065 | Analytics and experimentation | none | No analytics event collection, consent schema, experiment assignment or metrics dashboard. |

## Remaining work

P0 gaps include page duplication, complete responsive/grid controls, typed design tokens and text presets, component detachment/props/variants, CMS detail templates/querying/pagination/CSV, fuller form authoring and submission inbox, durable webhooks, locale content/routes/hreflang, CMS metadata templates, redirects, page-linked diagnostics, saved-project deletion, production promotion/rollback and attributed agent permissions. Preview still uses a separate editor renderer and does not execute the complete exported runtime.

P1/P2 gaps include component slots, shared libraries, CMS relations and locale-aware CMS, hidden tracking bindings, timelines, conditional overlays, translation providers, JSON-LD, project review branches, comments/roles/presence, code components, external data binding, remote hosting/domains, commerce, visitor memberships, analytics and experimentation. These are implementation gaps. Product-specific competitor unknowns, integrations, native-export exclusions and retired Webflow User Accounts remain evidence labels rather than scoring assumptions.

Owned PNG/JPEG/GIF/WebP files are packaged; remote media remain external references. Forms need the local FastAPI service or a separately configured external endpoint. Local publish URLs do not provision public domains, TLS or a CDN. Native import resets engine undo history. No certification of accessibility, all browser combinations or third-party infrastructure is claimed.

