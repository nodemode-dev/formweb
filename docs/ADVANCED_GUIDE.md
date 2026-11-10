# Advanced website studio

Open **Studio** in the application menu. Choose a category and workflow. The selected element, locale and revision appear at the top. Each workflow has persistent controls, a concrete example and a result panel. Examples use the current selection only when first opened or when **Use selection & example** is clicked. They never overwrite a field during a live engine update.

Review IDs and values before saving. IDs appear in the Content/Design inspector and service list responses. JSON editors parse locally, then Rust or the selected service validates the whole operation. A validation or transport error is shown verbatim. Service output is displayed as returned; a configured field or submitted deployment is not labeled as verified completion.

**Load current configuration** reads the persisted extension group into a group editor. Saving a group replaces that group; load it before editing when preserving all existing entries is intended. The dedicated state, timeline, overlay, locale, widget and experiment workflows merge their entry into the current group.

| Category | Real workflows |
| --- | --- |
| Layout & design | Page duplication, custom breakpoints, typed tokens, reusable text presets, flex wrapping and grid placement |
| Components & libraries | Properties, variants, slots, override reset, detach, immutable library save/review/import/update, isolated code compilation |
| CMS & content | Create/update schemas and relations, selected bindings, list query/pagination/empty state, item templates, localized/archive items, exact CSV export/import |
| Motion & forms | Pointer/keyboard states, conditional actions, timelines, overlays, browser field constraints, tracking, submit success/error/redirect states |
| Localization & SEO | All-locale output, translated page routes/media, base URL (Base URL and SEO settings), metadata templates, JSON-LD, robots rules |
| Publishing & delivery | Inbox/CSV/retention, signed delivery destinations/outbox/retry, immutable releases/promote/rollback, redirect manifest |
| Review & access | Branch capture/open/review/merge conflicts, comments/resolution, presence, identities/roles, attributed activity, saved-project deletion |
| Connected providers | Adapter configuration/status, deployment/domain/fetch transport, translation proposal review, commerce synchronization, runtime widget bindings and member gates |
| Visitors & insights | Member registry/group access, consented event metrics, weighted experiments, authored conversion goals |

## Live responsive preview

**Preview** (the Live responsive preview) compiles the selected page and locale through `/api/preview` and loads the returned isolated runtime. The design canvas remains visible until the new runtime document has loaded. Subsequent compilations retain the preceding runtime until the replacement is ready. Both iframe slots remain mounted. The refresh icon next to Preview explicitly recompiles the current selection; clicking Preview again returns to design.

The preview frame is sized to the width typed in the toolbar and is not recompiled when only the width changes, so the exported media queries are evaluated by the browser at that width. This is where a design visibly switches between breakpoints; the design canvas always shows the one breakpoint picked from the list.

The runtime uses the actual exported CSS, CMS queries, templates, form code, interactions and integrations. The design canvas is for selection and editing and does not execute scripts or submit forms. It still renders the original node/binding data for authoring; advanced query/template/widget effects are reviewed in the compiled runtime. The runtime sandbox permits scripts and forms but has an opaque origin, no editor-origin access and no editor credentials. Backend preview tokens authorize only their scoped runtime routes. Visitor cookie behavior may differ from a normal published top-level page; exercise membership and consent in a local publication for final session verification.

## Schema and list examples

Create Authors first, then add this relation to another collection using **Edit schema & reference fields**. Include the collection's other field descriptors in the replacement fields array:

```json
{
  "fields": [
    {"name":"title","type":"text","required":true},
    {"name":"author","type":"reference","collection":"authors","required":false},
    {"name":"related","type":"references","collection":"projects","required":false}
  ]
}
```

A reference stores one target item ID; references stores an array of IDs. The target records must exist. A binding field such as `author.title` follows the relation. Image sources and link destinations require URL/image fields and compatible elements:

```json
{"collection":"projects","field":"website","target":"href","item":"project-item-id"}
```

**Collection list query** accepts these query fields:

```json
{
  "collection":"projects",
  "filter":[{"field":"category","op":"eq","value":"design"}],
  "sort":[{"field":"title","direction":"asc"}],
  "offset":0,
  "limit":100,
  "pageSize":12,
  "emptyNode":"empty-message-node"
}
```

Only use schema fields that exist. Operators are `eq`, `ne`, `contains`, `gt`, `lt`, `gte`, `lte` and `in`; the operand must match the field type. The empty node is an existing authored subtree. Page size generates runtime pagination. Draft and archived records are excluded from output. **CMS page templates** maps an existing page ID to its collection and route pattern:

```json
{
  "templates": {
    "detail-page": {
      "collection":"projects",
      "slug":"/projects/{item.slug}",
      "title":"{item.title}",
      "description":"{item.summary}"
    }
  }
}
```

For CSV, export the real collection first. The exported `_present`, `_nulls` and `_locales` columns preserve missing, null, empty and translated values. Upload the edited file with **Import collection CSV**. Upsert retains other records; replace removes records absent from the file. Invalid fields, types, duplicate IDs or slugs reject the entire import. The result reports created, updated and removed counts.

## Component configuration and libraries

Capture a subtree using the existing component control, then use **Configure component** with the source component ID. Property and variant targets are source element IDs, while instance operations address the instance root. A slot target must be a non-void container:

```json
{
  "props": {
    "label":{"type":"text","default":"Contact us","target":"source-button","field":"text"}
  },
  "variants": {
    "quiet":{"nodes":{"source-button":{"styles":{"opacity":"0.7"}}}}
  },
  "slots": {
    "content":{"target":"source-container"}
  }
}
```

Insert the linked component through the existing component list. Set instance properties, apply a configured variant, fill slots with existing element IDs, reset inherited field groups or detach while retaining its materialized subtree.

Save a library with a stable ID and semantic version, then list its immutable versions. Initial import requires a parent node. For an existing pin, **Review library version** reports added/removed/changed sources and a digest. **Import or update pinned library** requires the explicit update checkbox plus that reviewed digest. A new save uses a new version; a nested pinned library cannot be published until detached. Detach keeps local copies.

## Motion and forms

**Actions & visibility conditions** edits one element's behavior while retaining its existing state styles. For example, a query condition and timeline trigger:

```json
[
  {"trigger":"click","action":"timeline","timeline":"entrance","conditions":[{"source":"query","key":"campaign","op":"eq","value":"launch"}]}
]
```

Set the element's visibility condition list separately in the same workflow. Query/session conditions support `eq`, `ne`, `exists` and `contains`. A variant action uses `target` (linked instance root) and `variant`. Overlay actions use a defined `overlay` ID. Timeline tracks use existing node IDs, at least two CSS keyframes, duration, optional delay/at and easing. Define the referenced timeline or overlay before saving its action.

**Form constraints & states** targets a real form node. `tracking` maps hidden field names to query parameter keys. `constraints` maps named controls to required/pattern/min/max/minLength/maxLength. `successMessage`, `errorMessage` and an optional safe `successRedirect` control runtime response states. **Complete field attributes** applies actual name/type/autocomplete/ARIA and browser constraint attributes; a null attribute removes it. Preview and local publication submit to their real scoped form endpoints.

## Services, review and provider boundaries

Read the inbox, delivery outbox, publication history and branch lists before entering their returned IDs. Retention and saved-project deletion change persisted service records and are outside site undo. Create a branch, open it, edit and save/capture its work. Then use **Saved main projects** and **Return to main project** before reviewing or merging that isolated branch. Branch review returns JSON-pointer conflicts and the main revision. Enter that reviewed revision in Merge so changes after review require another review. Merge accepts a map such as:

```json
{"/nodes/hero/text":"branch","/settings/baseUrl":"current"}
```

Choose every conflicting pointer explicitly; Rust validates the merged document. Comments and presence are attributed to the current identity. The collaborator identity workflow returns its token once. Assign one of viewer, reviewer, editor, publisher or owner using the role workflow. Visitor membership is separate from editor roles.

Provider configuration lives in server environment variables. **Provider configuration & status** shows available adapters and missing environment names without exposing credentials. Deployment, domains, data sources, translations and commerce use actual adapter calls. An unconfigured provider returns an explicit error. Submitted/queued/deployed status remains the adapter's actual response. Translation proposals do not mutate the site until explicitly accepted at the expected revision. Local fixture transport evidence does not establish a live vendor production or sandbox deployment.

Bind runtime widgets through **Bind one runtime widget**. Fetch uses source and field; product uses product ID; member-gate uses group; cart, checkout, member-login and analytics-consent create their runtime controls. A protected route must be served by the authorizing backend: public static exports of gated sites are rejected to avoid exposing their content. Optional endpointBase is a bare HTTPS or loopback origin. No browser secret belongs in the site.

Weighted experiments require explicit analytics consent and two to eight positive-weight variants. Configure an event name, then bind that matching goal through **Bind conversion goal action**. Assignment or an unrelated click is not counted as a conversion. The insights service reports actual recorded events and consent state.

## Opt-in code components

**Build isolated code component** requires an explicit enable checkbox. Its source must export `mount(root, props)`. Typed properties declare string/number/boolean/json with optional required/default. The server runs the pinned TypeScript compiler and returns diagnostics plus source/build digests. Only a successful build is submitted to Rust as a definition and host binding. The result shows the installed revision and manifests. Component scripts run in an opaque iframe with parent access and external network blocked; no dependency imports are permitted. Use **Code component bindings** to inspect or detach an existing host entry.

## Validation record

Strict TypeScript checking and production bundling are executed during this build. Root owns the independent throttled browser and service verification records in the planning sidecar. No authored tests or persistent test runner are included. This guide describes consuming UI paths; it does not claim every external provider or platform was verified.
