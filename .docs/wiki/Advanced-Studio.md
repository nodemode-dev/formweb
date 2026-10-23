# Advanced Studio

Studio is the menu entry for persistent advanced authoring, service and provider workflows. Select a category, review the example against the current element/locale and run its consuming operation. JSON editors parse locally; Rust or the service validates the full change. Result panels preserve the actual returned status and error.

## Frontend map

| Module | Responsibility |
| --- | --- |
| `frontend/src/features/contracts.ts` | Typed workflow parameters, categories and selection context |
| `frontend/src/features/studio.ts` | Once-mounted panes/controls, focus trap, JSON/file validation, operation dispatch and result rendering |
| `frontend/src/features/authoring.ts` | Page/breakpoint/token/preset/component/CMS/locale/SEO/form commands and group editors |
| `frontend/src/features/advanced.ts` | Entry-preserving states/actions/timelines/overlays, locale media/routes, widgets/gates/experiments/goals and redirects |
| `frontend/src/features/services.ts` | Form delivery, release activation, branch review, roles/comments/presence, libraries and CSV consumers |
| `frontend/src/features/providers.ts` | Adapter status/transport, translation review, commerce, visitor registry and insights |
| `frontend/src/features/code.ts` | Explicit compiler opt-in, diagnostics/digests and validated definition/host installation |
| `frontend/src/features/runtime-preview.ts` | Double-buffered persistent compiled-runtime iframe slots |
| `frontend/src/styles/features.css` | Reserved modal columns, result space and preview viewport |
| `frontend/src/main.ts` | Minimal registrations plus custom breakpoint/layout controls and scoped audit navigation |

## Native contracts

The browser renders the latest camelCase Rust state; it does not reconstruct a second engine. Single commands use `POST /api/command` with command, params and expectedRevision. Atomic multi-command changes use `/api/batch`; history undo/redo remains a single-command operation. SSE updates the mounted editor and retains focused input. A stale revision refreshes state and requires explicit review/retry; semantic HTTP 409 reasons stay visible.

| Area | Consuming commands or groups |
| --- | --- |
| Responsive design | page.duplicate, breakpoint.set/remove, token.define, textpreset.set/apply and node.update CSS patches |
| Linked components | component.configure/props/reset/variant/slot/detach; library import/update/detach through reviewed service snapshots |
| CMS | collection.create/update, cms.binding/query/localize/upsert; cms templates/localized group |
| Localization/SEO | localization pageSlugs/assets/allLocales; seo pages/robots/redirects; site.update baseUrl |
| Runtime | behaviors nodes/states/conditions/actions/timelines/overlays; forms constraints/tracking/messages/redirect |
| Integrations/code | Public integrations widgets/gates/experiments; digest-validated code definitions/instances |

Site.extensions uses validated namespaced groups. extension.set replaces one group transactionally. **Load current configuration** preserves the existing group before editing; dedicated entry workflows merge their own entry into current state. Source targets and instance IDs are distinct. Reference fields require a target collection and valid item IDs. The authoritative [native schema](../../docs/ADVANCED_SCHEMA.md) and [Studio guide](../../docs/ADVANCED_GUIDE.md) provide exact examples.

## Service contracts and workflow order

- Live responsive preview (the Preview button, command `view.preview`): the only place a design switches breakpoints as the width changes, by the browser's own media queries on the compiled output. The design canvas draws only the breakpoint picked from the list; a typed width resizes frames and never selects styles. POST /api/preview {page,locale} returns url/revision/token; /preview/{token}/ serves the immutable scoped output. The opaque sandbox allows scripts/forms and has no editor-origin access. Previous design/runtime remains until replacement load; viewport changes fit the existing slot.
- Libraries: list/save immutable versions; review reports changed sources and digest; an existing pin update requires explicit update:true plus reviewDigest. Initial import needs parent. CSV export/import preserves typed values and locale/presence metadata and commits only after complete validation.
- Releases/forms: list publications, promote/rollback active /sites/ routes, inspect/export inbox, apply retention, configure signing-secret environment names, inspect outbox and retry actual deliveries. Service deletion/retention is outside site undo.
- Branches: create/open, edit then save/capture; return to the saved main project before review/merge. Resolve each JSON-pointer conflict using current/branch and submit the reviewed expectedRevision. Comments, roles, presence and activity are attributed and persisted.
- Identities: role workflows require configured server authentication. A newly created editor identity returns its token once. Visitor membership has its own runtime groups and sessions.
- Providers: status exposes missing environment names; deployment/domain/fetch/translation/commerce operations use configured server adapters. Translation proposals require explicit acceptance. No secret belongs in extension data or browser inputs.
- Code: POST /api/code/build receives explicit enabled:true, language, source and typed props. Diagnostics block installation; source/build digests and installed revision are displayed. mount(root, props) runs in an opaque network-denied component iframe.

## Evidence boundaries

A stored extension establishes configuration. Compiled Preview/export establishes consuming output. Browser actions and service consequences need their own observations. Provider fixtures establish transport and do not prove live vendor hosting, domain/TLS/CDN readiness or completed payment processing.

The design canvas remains a script-free editing surface. Advanced CMS templates/queries/widgets are inspected in compiled Preview. Final visitor-cookie behavior should be exercised in a top-level local publication. Protected member content requires an authorizing backend; public gated export is rejected.

See the [manual](../../docs/MANUAL.md), [agent quick start](../../docs/AGENT_QUICKSTART.md), [publishing contracts](Publishing.md) and [verification record](Verification.md). Workflow examples are specifications; root records actual executions and their limits separately.
