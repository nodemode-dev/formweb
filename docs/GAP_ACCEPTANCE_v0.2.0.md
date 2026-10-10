# FormWeb gap acceptance · v0.2.0

This is a behavior specification for an independent reviewer or a later test author. It does not certify an implementation and contains no executable tests. The immutable 65 requirements in `feature-catalog.json` govern the denominator. The historical v0.1.0 grades remain in their release audit; the new release must earn its grades from observed consuming paths.

## Evidence rule

For each row, record the input, actual engine command or service/tool call, returned revision and identifiers, editor path exercised, compiled/runtime output, negative outcome, and artifact path. Keep an observed pass separate from a source trace, a planned behavior, an unavailable provider and an unexecuted platform. A field accepted by `extension.set` is document evidence only. It earns no runtime credit until an editor workflow and the appropriate compiler, browser or service consumer use it.

The reviewer should begin with a fresh project, retain an unrelated existing node, use fresh observed revisions, and repeat critical round trips in a clean data directory. Inspect default and overridden values, empty data, malformed data and partially completed flows. Do not turn successful primitive calls into a grade for a larger missing workflow. Where several requirements share a path, identify which observable consequence proves each row.

## Authoring and components

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-001 | Create, rename, duplicate and delete pages through the editor. Two normalized routes serve different content at exact root and nested paths. A duplicate has fresh owned node IDs. | Reject route collisions and unsafe paths without mutation. Deleting a page does not orphan another page or shared definition. Verify native round trip. |
| FW-002 | Select a nested parent and child using tree and canvas. Update one property while selection, focused input, pending text and unaffected mounted nodes retain identity. | Inspect the moment of change under CPU 4x, slow network and disabled cache. End-state screenshots alone do not prove stability. |
| FW-003 | Move a node between valid parents and reorder siblings in the editor; exported order agrees. | Reject a parent moved into its descendant, cross-owner misuse and disconnected content atomically. Preserve acknowledged state/revision on rejection. |
| FW-004 | Edit horizontal/vertical flex direction, alignment, gaps and wrapping. Render the exported page at desktop and phone widths. | Children wrap only where authored; invalid styles produce actionable errors. Verify inspector values and compiled CSS after reopening. |
| FW-005 | Edit column and row tracks, row/column gaps, child placement and narrow overrides. Export a two-column grid with a phone alternative. | Check computed placement, not only stored CSS. Reset a narrow override and observe inheritance. |
| FW-006 | The preview consumes the compiled site runtime in an isolated iframe. Links, forms and interactions act as exported behavior without selection affordances. | Compare the same behavior in independently served export. A separate simplified canvas renderer does not establish preview parity. |
| FW-007 | Edit, undo, redo, save a native project, reimport and repeat undo/redo with canonical content checks. | Native project round trip must preserve bounded history if persistent history is claimed. Process crash recovery alone is insufficient. Corrupt checkpoints leave current state intact. |
| FW-008 | Create and edit a custom saved breakpoint, override one value, change the base, then reset the local override. | Observe deterministic cascade and actual viewport behavior around the threshold. Preview width alone is not a breakpoint definition. |
| FW-009 | Change font size, leading and tracking at base and narrow widths; computed typography agrees with the export. | Retain unoverridden base values and restore them after reset. Confirm units survive native import. |
| FW-010 | Author desktop/phone visibility and inspect exported computed display at both widths. | Hidden nodes do not reappear through a preview-only path or lose intended accessible behavior. |
| FW-011 | Define typed color and dimension tokens; reference one token from multiple nodes, then update the token. Every consumer changes through CSS custom properties. | Reject incompatible token type/value or unknown references. Native round trip preserves references rather than duplicating resolved values. |
| FW-012 | Apply one named text preset to two text nodes with independent semantic tags, then update that preset. Both render consistently. | Instance visual overrides remain explicit. Preset deletion/missing references yield diagnostics or a defined fallback. |
| FW-013 | Capture a definition, insert multiple linked instances, update its content and appearance, then detach one instance. | Linked instances update; detached content remains independent. Structure/ownership errors fail atomically and persisted detach survives reopening. |
| FW-014 | Expose typed component props, supply different labels in two instances, apply an override and reset it to inheritance. | Reject wrong prop types/unknown props. A reset changes the actual rendered consumer and retains unrelated instance values. |
| FW-015 | Configure default and secondary named variants with inherited style overrides, switch an instance and reset it. | Verify distinct compiled appearance and base fallback. Merely saving a variant map is insufficient. |
| FW-016 | Fill two typed named slots using independent content without modifying the definition or another instance. | Reject invalid slot types, duplicate ownership and cyclic content. Slot content survives export and native round trip. |
| FW-017 | Import a pinned cross-project library version, insert its content, inspect an update before applying it and detach locally. | Unreviewed update cannot silently replace the pinned version. Conflicting local edits and invalid manifests produce a report, not unrelated mutation. |

## CMS and portable content

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-018 | Create a typed collection and valid records through the editor; save/reopen and render them. | Reject wrong scalar/reference types before persistence. Report the offending field and item. |
| FW-019 | Configure a CMS template and two published items with distinct slugs. Export populated detail routes for both. | Draft/archived records have no public detail route. Reject duplicate item/route slugs without overwriting files. |
| FW-020 | Bind text, image and URL attributes to a deliberately selected record. Repeated context and selected-item context render the intended values. | Removed item/field or wrong target yields a diagnostic/defined fallback. First-item accidental success is not selected-item proof. |
| FW-021 | A zero-item query renders only its empty-state subtree; a nonempty result repeats the template with stable IDs. | Empty content is not a blank repeated template or duplicated empty subtree. Verify labels and links within repeated content. |
| FW-022 | Author typed text, number and date predicates and inspect filtered compiled output with stable order. Exercise any advertised visitor control. | Invalid field/operator/type fails visibly; missing values have defined behavior. A stored query without filtered output is incomplete. |
| FW-023 | Filter, sort and paginate enough records to require at least two pages; traverse every page and collect IDs. | No duplicate/missing records or stale page state after filtering. Equal sort keys have stable tie ordering and out-of-range pages are defined. |
| FW-024 | Import mapped CSV containing quoted commas, quotes and embedded newlines; review slug/type conflicts; export complete CSV. | Parse exported bytes independently and compare records. Malformed or conflicting input does not silently truncate or overwrite unrelated records. |
| FW-025 | Resolve a related author and a multireference in compiled content. | Removed/missing target and forbidden cross-collection reference produce exact diagnostics. References remain IDs after native round trip. |
| FW-026 | Set draft, published and archived in the editor. Only published records appear in lists and detail routes by default. | Archived data remains editable/persisted; it is not deleted as an implementation shortcut. |
| FW-060 | One portable export materializes published CMS detail/list pages across configured locales with working alternates. | Serve it on an independent static HTTP server. Check every route and owned asset without the FormWeb editor process. Service-dependent forms/providers remain disclosed. |
| FW-061 | Export native `.fweb`, import into an empty data directory and compare canonical site, assets/references and advertised persistent history. | Digest/type/size violations reject before replacing the open site. Exact image bytes and history semantics must be compared separately. |

## Interactions and forms

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-027 | Author hover, keyboard focus and press states. Exercise pointer enter/leave, focus and pointer/key press in preview and export. | Reduced motion is respected. A click-only class toggle is not press state. |
| FW-028 | Configure reveal timing and easing; scroll a target into view and observe it reveal once using the compiled runtime. | Reduced-motion output remains visible; observer absence has a defined fallback. Verify duration/easing behavior, not only JSON. |
| FW-029 | Bind a component menu's click/keyboard action to open and closed variants and switch both directions. | Rendered instance changes without mutating its definition or another instance. Unknown target/variant has a useful diagnostic. |
| FW-030 | Configure two target tracks with delay, overlap and easing, then observe their relative start/end timing. | Unavailable targets and invalid timing reject or diagnose. A sequential generic animation does not prove overlap. |
| FW-031 | A query predicate opens an overlay with persisted session behavior. Tab focus is managed; Escape/dismissal restores focus. | False condition does not open it. Unsafe navigation/storage values reject; overlay remains accessible with reduced motion. |
| FW-032 | Author accessible required/email/numeric fields and schema constraints; submit valid and invalid payloads through compiled preview. | Server rejects invalid values before storing, including payloads that bypass browser constraints. Labels and field diagnostics match the actual form. |
| FW-033 | Submit a live form, view only authorized records in the editor inbox, export CSV, apply retention and verify resulting records. | Retention is explicit and durable. CSV quoting preserves content; unrelated site/form records are not exposed. |
| FW-034 | Configure an authorized fixture destination, submit a form, verify the exact signed body received, force delivery failure and inspect durable retry state. | Retry survives restart, respects schedule and does not create an unaccounted duplicate. Secret/signature metadata stays server-side. A webhook URL alone is no evidence. |
| FW-035 | A real submit shows pending then success; an invalid/error submit shows error and keeps entered values. Exercise authored safe success redirect. | Redirect to an unsafe/unallowed destination rejects. Preview and independently served export match status behavior. |
| FW-036 | Exercise bounded payload, honeypot and rate limiting alongside valid submissions. | Abuse is rejected before persistence and does not prevent valid requests after the defined limit window. Any external spam provider needs separate configured evidence. |
| FW-037 | Enable one named hidden query-attribution field and submit a matching URL; disable it and submit again. | Captured data contains the value only when explicitly enabled. It cannot override another named field or silently capture arbitrary query data. |

## Localization, SEO and accessibility

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-038 | Export two locales with distinct text and owned image overrides; missing overrides fall back to original content. | Locale asset bytes/routes are bundled correctly. Replacing a translation map must preserve intended unrelated keys. |
| FW-039 | Translate item fields/slug and give one locale a distinct publication state. Inspect its detail/list output in both locales. | A locale draft is absent only from that locale; global status is not used to fake localized publication. |
| FW-040 | Locale routes emit valid `lang`, canonical and reciprocal `hreflang` URLs with unique localized slugs. | Every alternate actually serves. Colliding locale routes reject rather than overwrite. |
| FW-041 | A configured translation provider returns translated values into a review queue; review/apply uses a fresh revision. | Unconfigured provider is unavailable, rejected output is not applied, and existing user translations survive stale/conflicting review. Fixture transport is not vendor certification. |
| FW-042 | Two CMS detail pages compile different title/description/Open Graph values from metadata templates and localized fields. | Missing fields/unsafe values are diagnosed or safely escaped. Template persistence alone is incomplete. |
| FW-043 | Sitemap uses configured public origin and all published localized/detail routes; robots and exclusions agree. | Draft/noindex routes are excluded, XML escapes are correct and every listed route serves. Local preview URL must not masquerade as public origin. |
| FW-044 | An old route returns the authored HTTP status and `Location` through the release/service adapter. | Reject cycles, unsafe destinations and invalid statuses. Static manifests without a consuming host adapter remain explicitly limited. |
| FW-045 | Compile semantic elements, decorative empty alt, meaningful image alt and explicit label associations. Inspect keyboard/accessibility behavior. | Cloned/repeated content retains unique accessible targets. Do not claim full accessibility certification from these samples. |
| FW-046 | Missing image alt and page metadata produce deterministic severity/code and exact node/page IDs; editor navigation selects the offender. | Resolved findings disappear after an acknowledged edit. A generic message without an actionable anchor does not close the target. |
| FW-047 | Author valid JSON-LD, parse the emitted script independently and inspect a value containing a script-closing sequence. | Serialization cannot terminate the enclosing script. Invalid structures reject with useful feedback. |

## Releases, collaboration and access

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-048 | Publish an immutable preview, edit the draft and fetch the earlier version again. | Earlier content/assets/form schema retain exact bytes/behavior. Release identity is returned rather than fabricated. |
| FW-049 | Promote a selected built version to an active route, publish/promote another version, then roll back. | Active bytes return exactly to the earlier version. Promotion is atomic and rejects nonexistent releases. |
| FW-050 | Configure a deploy adapter, observe its output/status and any domain proof operation. Separately establish real remote route, DNS/TLS/CDN evidence when claimed. | Unconfigured operations are unavailable. Local publication and fixture adapter transport do not count as managed infrastructure or vendor sandbox completion. |
| FW-051 | Create an isolated branch, edit it, compare to base, review and apply a nonconflicting branch. | Overlapping edits produce actionable conflicts and preserve both states. Unreviewed or stale merge cannot overwrite current work. |
| FW-052 | Add a node comment, reorder the node and inspect its anchor. Exercise at least viewer and editor roles against the server. | Viewer mutation is denied through REST and MCP; shared bearer presence alone is not a role system. |
| FW-053 | Two identities/sessions join presence and attempt concurrent expected-revision edits. Observe safe conflict or an explicitly defined merge. | Stale presence expires, identities are not invented, no acknowledged edit disappears. SSE alone is not person presence. |
| FW-054 | Create/read/update/delete a saved project using authenticated typed endpoints and editor controls; update uses the Rust authority. | Stale update conflicts; unauthorized requests fail; delete removes the selected project/file and preserves unrelated work. |
| FW-055 | An independent official SDK client initializes, discovers actual tools/resources, reads resources and mutates the editor-visible project. | Saved output matches returned state. Streamable HTTP and stdio both reach the same service; disabled Agents/auth gates are enforced. |
| FW-056 | Exercise role-denied MCP mutation and role-allowed REST/MCP mutation with a real actor identity. Read attributed operation records. | Identity/role cannot be spoofed by client-supplied attribution. Read-only discovery/resources are protected according to documented policy. |

## Providers and runtime integrations

| ID | Required consuming behavior | Failure and persistence obligation |
| --- | --- | --- |
| FW-057 | Opt into an isolated code-component import/build, edit typed props and observe rendered preview/export output. Surface a build/runtime error. | No arbitrary server execution or secret access; unsafe output is isolated. Descriptor persistence or raw iframe text alone is insufficient. |
| FW-058 | Configure a server-side data fixture, change its response and observe bound runtime content including loading/error behavior. | Private credentials never enter site/native/export/frontend state. Disallowed origins and failed responses are handled explicitly. |
| FW-059 | Serve the emitted static folder independently and traverse root/nested/CMS/locale routes, runtime, styles and owned assets. | Manifest and output bytes agree; broken local assets/routes prevent completion. External media/service dependencies are identified. |
| FW-062 | Sync a configured commerce provider's products, variants and inventory; show truthful available/unavailable values in the authored runtime. | Unconfigured/stale sync is not presented as current inventory. A copied static catalog is not provider sync. |
| FW-063 | Use provider-hosted sandbox checkout and process a verified signed webhook into an actual order transition. Observe shipping/tax scope from the provider. | Invalid signature/replayed event cannot create an order or duplicate transition. Local fixtures prove transport only; no fabricated payment success. |
| FW-064 | A separate visitor membership service authenticates an allowed visitor and controls gated published content. Inspect anonymous and denied behavior. | Editor identity must not grant visitor membership. Sensitive gated content cannot be present in a public static file merely hidden by CSS/JavaScript. |
| FW-065 | Explicit consent/config controls event collection; deterministic experiment assignment changes a real consumer; dashboard uses collected metrics. | No-consent request records nothing. Duplicate/invalid events are defined and metrics cannot be fabricated from saved configuration. |

## Recording and independent handoff

Keep one result entry per ID with status `observed`, `source-only`, `pending`, `unavailable` or `failed`, rather than defaulting every new field to complete. For partial coverage, list the exact missing consuming requirement. Attach browser/version/viewport/throttling, service/core build identity and provider mode when relevant. A single shared observation may support multiple rows only when each row's consequence was independently inspected.

Skill evaluations must separately report automatic activation, manually routed workflow success, direct-tool success, expected rejections and no-skill baseline. Manual SDK success does not establish automatic skill activation or prove that the skill reduces calls. At least three observed SDK scenarios are required for this increment; record literal outputs and preserved state after failures in `research/harness-audit-v0.2.0.md` outside the shipped skill pack.

The independent author can turn these behaviors into tests in a later authorized conversation. Until then this document remains an observable acceptance plan, without scripts, runners or a suite tailored to the implementation.
