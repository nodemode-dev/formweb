# FormWeb manual

FormWeb is a visual website authoring application with editable pages, a node hierarchy, responsive styles, reusable components, CMS data, translations and static website export. The Rust engine owns the document; the editor and agents change that same document.

## Start the editor

Install Node 22.12 or later, Python 3.12 and Rust stable. From the repository:

```bash
./formweb install
./formweb boot
```

On Windows use `formweb.bat install` and `formweb.bat boot`. Open http://localhost:5240. The API runs on http://127.0.0.1:8240. `./formweb doctor` lists missing tools or builds. To serve a built editor with one process, run `./formweb build`, then `./formweb serve`, and open the API address.

The default data folder is `backend/data`. Configure `FORMWEB_DATA_DIR` in `backend/.env` before launch to choose a persistent location. Keep a saved editable project or downloaded native document before replacing the checkout.

## Advanced studio

Open **Studio** in the menu for advanced authoring and service workflows. Choose a category, review its example using the current element/locale, then run the operation. The result panel shows the actual engine revision or service response. JSON editors are parsed locally and validated by Rust or the service. Pending Studio input remains mounted during live updates.

**Load current configuration** reads a persisted extension group before editing it; saving that group replaces it. Dedicated state, timeline, overlay, media, route, widget and experiment workflows merge their own entry into current configuration. Use IDs from the inspector or returned service lists. [The advanced guide](ADVANCED_GUIDE.md) provides exact schemas and worked examples.

## Pages and elements

Use the Pages list to select a route or add a page. Page settings edit its name, slug, title, description and indexing preference. The Layers list describes its node hierarchy. Select a layer or click an element on the canvas to edit it. Double-click text on the canvas to edit its content.

Insert adds primitives such as a section, text, grid, image or form into the selected structure. Image insert opens a file picker for PNG, JPEG, WebP or GIF up to 8 MiB; Content > Upload image replaces the selected image. Uploaded raster files are validated, stored locally and bundled into website export. Layers supports ordering and moving elements under a parent. The inspector's Design and Content surfaces change styles, attributes and text; the Page surface changes route metadata.

A website layout uses normal browser flow, flex and grid styles. Use meaningful element names and a clear hierarchy. A stored value becomes part of the site only after the engine acknowledges it. Invalid changes are reported; they do not replace the previous document.

## Responsive design

Desktop, Tablet and Mobile select the viewport and responsive profile. Default tablet and mobile maximum widths are 991 px and 767 px. Studio > Layout & design creates custom breakpoints; the toolbar dropdown selects any stored profile. Design includes flex wrapping/order, grid rows/placement/spans and self alignment. Inspect each profile after changing layout or type.

Preview compiles the selected page and locale through the backend and loads the actual exported runtime in an isolated iframe. The preceding design/runtime stays visible until the new preview loads. The adjacent refresh icon recompiles it; clicking Preview again returns to design. The design canvas remains a script-free selection surface, while advanced CMS queries, templates and widgets are reviewed in compiled Preview. Narrow-screen layout still requires author judgment.

## Components and tokens

Capture a subtree as a source component, then insert a linked instance through the Components list. Studio > Components & libraries defines typed properties, variants and slots using source element IDs. Instance operations address the instance root: set properties, apply a variant, fill slots with existing elements, reset inherited fields or detach while keeping its materialized content.

Save an immutable component library with a stable ID and semantic version. Initial import needs a parent element. For an existing pin, review the target version, inspect added/removed/changed sources, then explicitly acknowledge its returned digest when updating. Detach retains local copies. Studio > Layout & design defines typed CSS tokens and reusable text presets; apply a preset to an element and inspect its resulting styles.

Build isolated code component requires an explicit source-enable checkbox. It compiles a self-contained module exporting mount(root, props) with typed property descriptors. Diagnostics block installation. Successful source/build digests and the installed revision appear in the result. Component code runs in an opaque iframe with parent access and external network blocked.

## CMS and translations

Create a collection and add typed items through CMS. Studio > CMS & content edits existing schemas, including reference/reference-array fields targeting other collections. Selected text, image source or link bindings can use related fields such as author.title. List queries filter, sort, limit and paginate published items, with an optional authored empty-state node. Templates compile detail pages using item slugs and metadata. Draft and archived records remain editable and are excluded from output.

Export collection CSV, edit its typed values, then upload it through Import collection CSV. Upsert retains other records; replace removes records absent from the file. Presence/null/locale metadata preserves missing, empty, null and translated values. Invalid rows reject the entire import; the result reports created, updated and removed counts.

Locales stores node text and page metadata dictionaries. Studio > Localization & SEO adds translated page routes/media, all-locale output, site origin, metadata templates, JSON-LD and robots rules. CMS items can have translated values, slug and status. Connected providers can propose translations for explicit review at an expected revision. Missing translations still need editorial review.

## Interactions

The Content inspector edits the first legacy click/hover/scroll interaction while preserving other actions. Studio > Motion & forms adds hover/focus/press styles, query/session visibility conditions, reveal/easing, linked-instance variants, ordered timeline tracks and labeled overlays. Define a referenced timeline or overlay before binding its action. Compiled Preview consumes these same runtime behaviors.

Form settings target a real form node and named controls. Configure required/pattern/length/numeric constraints, autocomplete/accessibility attributes, hidden query-tracking fields, success/error messages and an optional redirect. Exercise real submission in Preview or a local publication and inspect the persisted inbox. The opaque Preview intentionally has no editor-origin access; final visitor-cookie behavior should be checked in a top-level publication.

## Save, reopen and import

Save writes the active editable project to the local project library. While an isolated branch is open, Save captures that branch. Projects lists main snapshots and opens one back into the engine. Download creates an editable `.fweb` envelope containing the model, checkpoint/history and uploaded raster assets. Import validates and restores the full envelope; a bare site JSON remains accepted. Native downloads are limited to 64 MiB; individual images are limited to 8 MiB. New creates a starter document with a distinct identity.

Undo and redo operate on engine changes. An agent command batch is one atomic undo step. Save before starting a separate project if the current work must be retained.

## Audit and export

Run Audit to inspect model issues. Select an issue to focus its element or page SEO inspector, then check hierarchy, links, media alternatives, forms, headings and narrow widths visually. The audit is an aid and does not certify all accessibility requirements.

Export downloads static HTML/CSS/JavaScript, uploaded assets, route metadata and configured runtime behavior. All-locale output includes translated routes and alternate-language metadata. Review warnings and open the exported pages. Keep editable source as well as the ZIP. Gated member content requires the authorizing backend; public static export is rejected rather than exposing it.

Publish creates an immutable local version served by the running API. Studio > Publishing & delivery lists releases and promotes or rolls back the active /sites/ route; previous version URLs remain separate. Portable redirects map old routes to destinations, with cycles rejected. Provider deployment/domain workflows are separate configured adapter calls: inspect their returned status and verification requirements before treating them as usable public output.

Local forms write to the persisted inbox. Studio reads/export CSV, applies retention, configures signed delivery destinations by server secret-environment name and inspects/retries the outbox. Retention deletes persisted submissions outside site undo. A site on another host needs an available backend/form endpoint; credentials remain on the server.

## Review, members and providers

Studio > Review & access creates and opens an isolated branch. Edit, then Save/capture branch work. Read Saved main projects and Return to main project before review or merge. Review reports changed JSON pointers and conflicts; merge chooses current/branch for every conflict at the reviewed revision. Comments, resolution, presence and activity are persisted and attributed. Saved-project deletion is outside site undo.

Editor identities require a configured FORMWEB_AUTH_TOKEN. Create an identity, securely retain its once-returned token and grant viewer/reviewer/editor/publisher/owner access. Visitor membership is a separate runtime service: member-login/member-gate widgets and the visitor registry use their own groups and sessions.

Connected providers reports available adapters and missing server environment names without exposing secrets. Deployment, domain, translation, data fetch and commerce workflows show actual transport/status results. Translation proposals require explicit review. Runtime widgets consume configured sources, products/cart/hosted checkout, membership and analytics consent. Weighted experiments wait for consent, and an explicit authored conversion goal is distinct from assignment. Independent provider/domain/payment verification is still required before production claims.

## Author with an agent

Start the editor/service and enable Agents. The repository includes project MCP configurations for Claude, Codex and Cursor. Use `./formweb agents install` to see paths and commands without changing global configuration. On Windows configure an absolute `formweb.bat` path with the `mcp` argument.

The `formweb-harness` skill guides an agent through reading, planning, atomic commands, responsive inspection, audit, save and export. MCP exposes the same active document as the editor. An agent should obtain live ids and command schemas before changes and refresh state after a revision conflict.

Agent access defaults off. `FORMWEB_AGENTS=1` is available for a deliberately configured local session; `FORMWEB_AUTH_TOKEN` can restrict control requests further. `./formweb mcp` requires the running HTTP service and does not start an isolated engine.

## Current boundaries

The browser application defaults to local authoring and persisted services. External adapters require server configuration and independent transport/vendor verification; a fixture response or saved binding does not prove public hosting, domain/TLS/CDN readiness or completed payment processing. Collaboration uses branches, review, roles and presence rather than simultaneous character-level co-editing. Native desktop bundles are outside this delivery. See the [comparison](comparisons/FormWeb-Parity_v0.3.4.html) for evidence grades and every release's score and the [agent quick start](AGENT_QUICKSTART.md) for agent workflows; verification records ship in the planning sidecar.
