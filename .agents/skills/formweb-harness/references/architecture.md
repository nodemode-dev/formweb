# FormWeb Model and Ownership

## Ownership

The Rust workspace under `native/` owns the site tree, document validation, command application, undo and redo, and static export. FastAPI under `backend/` supervises that engine, saves projects, packages exports, serves local publications, captures local form submissions and exposes MCP. The vanilla TypeScript/Vite frontend under `frontend/` presents the same state and sends commands. The stdio MCP transport proxies the running backend so agent and editor changes converge.

Use the live `formweb://commands` resource and `get_site` response as the working source of truth. When this reference and running code disagree, inspect the implementation and update the affected reference in the same change; do not invent a missing operation.

## Site shape

The site contains `schemaVersion`, `id`, `name`, `pages`, `nodes`, `tokens`, `breakpoints`, `components`, `collections`, `locales`, `defaultLocale` and `settings`. IDs are stable strings. A page contains `id`, `name`, `slug`, `root` and `seo`. The starter page is `home`; its root is `root`, but always observe the current site rather than assuming the starter is still open.

A node contains `id`, `tag`, `name`, `text`, `children`, `attrs`, `styles`, `breakpoints` and optional `componentId`, `componentSourceId`, `overrides`, `binding` and `interactions`. `children` lists node IDs in render order. Each page root and each component root must resolve to an existing node. Parent moves must not create cycles, duplicate ownership or disconnected content. `node.add` creates a single node with no children or instance metadata; add nested content in parent-first command order, using an explicit unique ID when a later command needs that new node.

## Commands and revisions

`apply_commands` accepts a list of entries with `command` and `params`. Its Python argument `expected_revision` becomes the Rust `expectedRevision` field. Obtain the revision from `get_site` immediately before the mutation. A revision rejection requires another read and deliberate reconciliation, because another user or agent may have edited the site.

The operation catalogue includes `node.add`, `node.update`, `node.remove`, `node.move`, `page.add`, `page.update`, `page.remove`, `token.set`, `component.create`, `component.insert`, `collection.create`, `cms.upsert`, `cms.remove`, `locale.set` and `site.update`. Use `history` for undo or redo rather than constructing deletion commands as recovery.

A successful batch is one undo step. A failed mutation leaves site, revision and history untouched. Several successful batches remain several committed steps even if a later one fails. Inspect returned state rather than assuming a nested map was merged or a component insertion retained the original IDs.

## Responsive styles

Styles use CSS property names and values. Breakpoint overrides are maps keyed by observed breakpoint IDs. The default catalogue supplies desktop with a broad maximum width, tablet at 991 CSS pixels and mobile at 767 CSS pixels. Inspect the live thresholds before choosing preview widths.

Choose normal flow, flex or grid before positioning offsets. Use min/max widths, wrap behavior, gaps and typography to express layout. Style and attribute patches merge keys, and breakpoint patches merge each breakpoint's property keys. A null property removes that key; a null breakpoint removes the override. Interaction arrays and locale translation maps are replacement values, so preserve their intended existing entries. Tokens are named values rather than proof of a global design-system feature; inspect the exported CSS to see how a token is consumed.

## Components and content

A component stores an ID, name and root. Inserted subtrees receive new IDs and `componentSourceId` links. Source text, attributes, styles, breakpoint maps, bindings and interactions propagate to linked nodes unless that property has an instance override. Editing an instance records whole-property overrides for text, attributes, styles, breakpoint maps and interactions. Structure is locked while linked instances exist; detach, nested linked sources, slots and variants are not available. Inspect actual propagation before reporting a synchronized edit as verified.

A collection stores named fields and items. An item carries `id`, `slug`, `values` and `status`. A binding without a field repeats that node's subtree for published items. Descendant field bindings use the repeated item's context; a standalone field binding uses the first published item. Text fields render as text, while a bound image node uses the value as its source URL. Draft and archived records do not repeat. Verify the exported records; dynamic detail routes, search, pagination and editorial approvals are not available from this binding model.

A locale is a translation map. Node text keys are node IDs; page SEO keys are `[page_id].title` and `[page_id].description`. Missing keys fall back to the original text or metadata. Export accepts an explicit locale and uses `defaultLocale` when omitted; it emits one locale per archive, so export requested locales separately. CMS field values are selected after node-text translation, so verify localized record content separately. Localized routing, browser-language detection and an automatic translation service are not provided by this map.

## Interactions and forms

Interaction triggers are `click`, `hover` and `scroll`; actions are `toggle-class`, `navigate` and `fade-in`. Optional fields include `className`, `url` and `duration`. Browser behavior must be observed after export, including keyboard behavior of the associated control.

Default draft forms submit to `POST /api/forms/[site_id]/[form_id]`. Default published forms submit through `/published/[slug]/[version]/api/forms/[site_id]/[form_id]` and validate against that immutable publication's schema. The exporter wires these default actions, adds post submission behavior and a live status message. An explicitly authored nonempty form action is preserved for native browser submission to that destination. Named controls and the semantic form tree determine allowed local fields. A captured local record does not establish delivery to email, CRM or a webhook, nor hosted spam filtering. `list_submissions` reads local captured records and should be used only within the user's authorized scope. Inspect the exported action before external deployment, because this release's default backend origin is loopback.

## Assets

The HTTP asset store accepts PNG, JPEG, GIF and WebP raster uploads through `POST /api/assets`; `GET /api/assets` lists stored metadata. Asset URLs contain a SHA-256 content name. The current MCP catalogue has no upload or asset-list tool, so do not invent one. Observe existing image `src` values from the site, or use the editor's authorized image import flow.

Static export and local publication copy referenced local raster assets into their `assets/` directory and rewrite page-relative paths. Remote media remains referenced and produces an export warning. Inspect the manifest to distinguish bundled bytes from an external URL. Native `.fweb` files embed referenced local raster bytes as base64 entries, each with an ID, MIME type, encoding and name. Loading checks the image digest, signature and type before restoring it. The native file limit is 64 MiB, with an 8 MiB site and 8 MiB per raster image; the importer accepts at most 500 images. Remote URLs and SVG files are not embedded raster assets.

## Persistence and publication

`save_project` persists a local database project and an editable `.fweb` file, returning its project ID, revision, file `path` and `downloadUrl`. The native file envelope contains `format` `com.nodemode.formweb`, `version` `1`, `site` and embedded `assets`. Existing envelopes without an assets list still load. Static export packages rendered files and an editable `site.formweb.json` source. A publication is an immutable snapshot at `/published/[slug]/[version]/`. A later edit changes the current site; it does not alter an already published snapshot. A subsequent publish operation creates another version.

Local publication depends on the running local service. External hosting, custom domains, DNS, collaboration, hosted analytics and commerce require separate implemented systems and independent evidence.
