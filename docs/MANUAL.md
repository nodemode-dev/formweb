# FormWeb manual

FormWeb is a visual website authoring application with editable pages, a node hierarchy, responsive styles, reusable components, CMS data, translations and static website export. The Rust engine owns the document; the editor and agents change that same document.

## Start the editor

Install Node 22.12 or later, Python 3.12 and Rust stable. From the repository:

```bash
./formweb install
./formweb boot
```

On Windows use `formweb.bat install` and `formweb.bat boot`. Open http://localhost:5240. The API runs on http://127.0.0.1:8240. `./formweb doctor` lists missing tools or builds. To serve a built editor with one process, run `./formweb build`, then `./formweb serve`, and open the API address.

The default data folder is `backend/data`. Configure `FORMWEB_DATA_DIR` in `backend/.env` before launch to choose a persistent location. Keep a saved editable project or downloaded native document before replacing the checkout. Since 0.20.2, at start the backend removes its own temporary files in the data folder that are more than 10 minutes old (leftovers of a killed paste, load or save: `assets/.stage-*.part`, `tmp/project-*.fweb`, `tmp/load-*.fweb` and `projects/.pending-*`) and logs "Removed N stale temporary file(s) from the data folder." when any went. Only regular files with those exact names are removed; symlinks, directories, younger files, publication `.pending` folders and FormPublisher's inbox are left alone.

## Desktop shell on Linux

The Tauri shell in `src-tauri/` builds and runs on Linux (checked on Ubuntu 24.04 with WebKitGTK 2.52.6). Install the packages first:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

Add `xvfb` for a headless check. Build with `cd src-tauri` and `cargo build --release` (about 6 minutes); the binary is `src-tauri/target/release/formweb`. The shell uses the fixed port 8240 and reuses a healthy FormWeb service already running there. Run it with `FORMWEB_ROOT` set to the repository. Under Xvfb also set `WEBKIT_DISABLE_DMABUF_RENDERER=1`. Closing the window shuts the shell down and leaves no process behind.

At 1440 x 900 the top bar, Team libraries, the Library panel, Preferences, Remove background, the brand kit, the stock dialogs and the Projects dialog match Chrome. Since 0.20.5 every select draws its own chevron, so selects look the same and show their whole value in both engines (the Desktop select reads in full in every language). Three small differences remain in WebKitGTK: range sliders fill their track with the accent colour, an unchecked checkbox is a plain white square, and number inputs show their spin buttons without hovering.

## Advanced studio

Open **Studio** in the menu for advanced authoring and service workflows. Choose a category, review its example using the current element/locale, then run the operation. The result panel shows the actual engine revision or service response. JSON editors are parsed locally and validated by Rust or the service. Pending Studio input remains mounted during live updates.

**Load current configuration** reads a persisted extension group before editing it; saving that group replaces it. Dedicated state, timeline, overlay, media, route, widget and experiment workflows merge their own entry into current configuration. Use IDs from the inspector or returned service lists. [The advanced guide](ADVANCED_GUIDE.md) provides exact schemas and worked examples.

## Pages and elements

Use the Pages list to select a route or add a page. Page settings edit its name, slug, title, description and indexing preference. The Layers list describes its node hierarchy. Select a layer or click an element on the canvas to edit it. Double-click text on the canvas to edit its content.

Insert adds primitives such as a section, text, grid, image or form into the selected structure. Image insert opens a file picker for PNG, JPEG, WebP or GIF up to 8 MiB; Content > Upload image replaces the selected image. Uploaded raster files are validated, stored locally and bundled into website export. Layers supports ordering and moving elements under a parent. Edit > Duplicate element (`Mod+D`) and the Duplicate item in the layers context menu copy the selected element with everything attached to it (motion, code sections, variables) and select the copy, which lands right after the original; one undo removes it. Both are disabled for a page root (use the page's own duplicate) and inside a linked component instance, and the item's title says why. `Shift+Mod+D` always duplicates, including while a vector transform is repeatable and `Mod+D` runs Transform again. Edit > Copy element (`Mod+C`), Cut element (`Mod+X`) and Paste element (`Mod+V`), also in the layers context menu, move an element through the system clipboard as fragment JSON that carries its motion, code, variables, page components and picture references. Paste inserts after the selected element under its parent, or last in the page root, with fresh ids, and selects the pasted element; it works on the same page, another page and another site on this FormWeb. Copy and Cut also embed the pictures (up to 16 MiB), so the copy pastes in another FormWeb installation too; the status says how many pictures were too large to embed, and a refused paste shows the reason in the status. Cut is a copy followed by a remove, and each paste or cut is one undo step. While text is selected outside the canvas, `Mod+C` and `Mod+X` stay with the browser so you can copy that text, and `Mod+V` uses the browser's paste event, so it needs no clipboard permission; the menu items read the clipboard and tell you how to allow it if the browser refuses. Clipboard text that is not a fragment does nothing. A paste keeps the site's own code component or variable when its name already exists with a different definition, and says so; the fragment also carries the design tokens, text presets and themes the element uses and the CMS collections it is bound to and any collections those refer to, the variables its set-variable actions name, and its form configuration (past 500 items a collection travels as its first 500 plus every item a binding, list filter or reference names, with a warning counting the rest), and a paste adds what the site lacks and keeps the site's own on a name clash with a different value, with a warning for each clash; code sections need the site to allow them; pasted pictures must exist on this FormWeb; and a page root, an element inside a linked component instance and more than 2,000 elements cannot be copied. Copy and Cut keep large pictures and videos behind a 15-minute clip link on this FormWeb, so the element also pastes in another FormWeb on the same computer while this one is running; the status says how many assets will only paste on this computer. Images are limited to 8 MiB and videos to 64 MiB. A paste streams each clip asset to disk and checks it as it arrives, so a very large video does not fill memory, and nothing is stored if the paste is refused. A copy of a copy keeps a short element id (the earlier -copy-N or -page-N ending is replaced rather than extended), and labels, aria-labelledby, #links and button actions inside the copy point at the copy's own elements; ids you wrote yourself, such as step-copy, are never shortened. Since 0.20.3 a copy also carries the ids of the element's ancestors at the source, so a child you copied out of an earlier copy and paste into another site swaps its ending at once (label-copy-1 becomes label-copy-2, not label-copy-1-copy-2). A copied element keeps its behavior actions. The inspector's Design and Content surfaces change styles, attributes and text; the Page surface changes route metadata.

A website layout uses normal browser flow, flex and grid styles. Use meaningful element names and a clear hierarchy. A stored value becomes part of the site only after the engine acknowledges it. Invalid changes are reported; they do not replace the previous document.

## Responsive design

Desktop, Tablet and Mobile select the responsive profile and set the frame to that profile's width. Default tablet and mobile maximum widths are 991 px and 767 px. Studio > Layout & design creates custom breakpoints; the toolbar dropdown selects any stored profile, and the stage header names the profile being edited. Typing a width only resizes the frame: the canvas keeps drawing and editing the picked profile's styles, and a quiet hint appears when the width falls outside that profile's range. To watch the design switch as the width changes, turn on the Live responsive preview (the Preview button): it shows the exported site at the typed width, so the browser's own media queries do the switching. Design includes flex wrapping/order, grid rows/placement/spans and self alignment. Inspect each profile after changing layout or type.

Preview compiles the selected page and locale through the backend and loads the actual exported runtime in an isolated iframe. The preceding design/runtime stays visible until the new preview loads. The adjacent refresh icon recompiles it; clicking Preview again returns to design. The design canvas remains a script-free selection surface, while advanced CMS queries, templates and widgets are reviewed in compiled Preview. Narrow-screen layout still requires author judgment.

## Components and tokens

Capture a subtree as a source component, then insert a linked instance through the Components list. Studio > Components & libraries defines typed properties, variants and slots using source element IDs. Instance operations address the instance root: set properties, apply a variant, fill slots with existing elements, reset inherited fields or detach while keeping its materialized content.

Save an immutable component library with a stable ID and semantic version. Initial import needs a parent element. For an existing pin, review the target version, inspect added/removed/changed sources, then explicitly acknowledge its returned digest when updating. Detach retains local copies. Studio > Layout & design defines typed CSS tokens and reusable text presets; apply a preset to an element and inspect its resulting styles.

Build isolated code component requires an explicit source-enable checkbox. It compiles a self-contained module exporting mount(root, props) with typed property descriptors. Diagnostics block installation. Successful source/build digests and the installed revision appear in the result. Component code runs in an opaque iframe with parent access and external network blocked.

A component can have a light poster as well as a poster. In the components inspector, Light theme poster holds its path, Upload light poster sets it and Clear light poster removes it. When the site has themes, the export shows the dark poster in the dark theme and the light poster in the light theme until the component draws its first frame, and the canvas shows the light poster while the Design system dialog previews the light theme. A component without a light poster shows its one poster in both themes.

## CMS and translations

Create a collection and add typed items through CMS. Studio > CMS & content edits existing schemas, including reference/reference-array fields targeting other collections. Selected text, image source or link bindings can use related fields such as author.title. List queries filter, sort, limit and paginate published items, with an optional authored empty-state node. Templates compile detail pages using item slugs and metadata. Draft and archived records remain editable and are excluded from output.

Export collection CSV, edit its typed values, then upload it through Import collection CSV. Upsert retains other records; replace removes records absent from the file. Presence/null/locale metadata preserves missing, empty, null and translated values. Invalid rows reject the entire import; the result reports created, updated and removed counts.

Locales stores node text and page metadata dictionaries. Studio > Localization & SEO adds translated page routes/media, all-locale output, the base URL (Base URL and SEO settings), metadata templates, JSON-LD and robots rules. CMS items can have translated values, slug and status. Connected providers can propose translations for explicit review at an expected revision. Missing translations still need editorial review.

## Library

The Library tab in the left rail holds finished sections, design presets and starter sites. It has three views: Sections, Kits and Import HTML.

Sections shows category chips (Product site, Scroll story, Portfolio hero, Prompt hero, Support, Not found, Chrome; the 7 bundled categories paint at first paint, so the row's height follows the sidebar width and does not change when the index loads, though a category the bundled list does not know adds a chip when the index arrives), a search field that matches name, tags, product and description, and a grid of cards with a thumbnail, the name and a badge when the section uses a page component. Select a card to open its detail in place: a larger thumbnail, a description, the fields you can re-cast before inserting (a colour field with a swatch for the tint, text, links, pictures) and Insert section. Insert places the section after the selected top-level section, or at the end of the page, as one undo step, and selects its root. Inserting the same section twice gives two independent copies. A note under the button warns when a section shares variables with one already on the site.

An inserted section is built from your site's tokens and text presets, so changing a token restyles it. Inserting also adds only what the site is missing from the section's preset (tokens, light values, the font, text presets, root styles) and never overwrites your own values.

Kits lists presets and starters. Apply preset sets every value the preset defines, including ones you changed, and is one undo step. Use starter asks for a product name and a tint, then adds the starter's pages and sections in one step; the first page replaces an empty home page.

Import HTML turns a pasted page, or an `.html` file you pick, plus optional CSS into one code section on the page. Code sections must be allowed for the site, which Import HTML turns on. Relative pictures and scripts in the pasted page are not brought along, and the section does not run on the canvas, so open Preview to see it. [The library guide](LIBRARY.md) describes the template format, components, routes and limits.

## Interactions

The Content inspector edits the first legacy click/hover/scroll interaction while preserving other actions. Studio > Motion & forms adds hover/focus/press styles, query/session visibility conditions, reveal/easing, linked-instance variants, ordered timeline tracks and labeled overlays. Define a referenced timeline or overlay before binding its action. Compiled Preview consumes these same runtime behaviors.

Form settings target a real form node and named controls. Configure required/pattern/length/numeric constraints, autocomplete/accessibility attributes, hidden query-tracking fields, success/error messages and an optional redirect. Exercise real submission in Preview or a local publication and inspect the persisted inbox. The opaque Preview intentionally has no editor-origin access; final visitor-cookie behavior should be checked in a top-level publication.

## Save, reopen and import

Save writes the active editable project to the local project library. While an isolated branch is open, Save captures that branch. Projects lists main snapshots and opens one back into the engine. Download creates an editable `.fweb` envelope containing the model, checkpoint/history and uploaded raster assets. Import validates and restores the full envelope; a bare site JSON remains accepted. A project that fits in 64 MiB downloads as a single JSON `.fweb`. A larger one, such as a project with several videos, downloads as a version 2 `.fweb`, a zip with `project.json` and the assets stored uncompressed; Import reads both kinds, up to 512 MiB, and rejects a damaged or inconsistent zip before storing anything. A large load reads each file once and runs without blocking the server, so a 74 MiB project with two videos opens in a fraction of a second. Individual images are limited to 8 MiB. New creates a starter document with a distinct identity.

File > Import .fweb or .fpub file... (and the project importer) also opens a `.fpub`. A `.fpub` is the single-file package FormPublisher saves for a build: a zip that holds exactly `fpub.json`, `publish.json`, `site.zip` and, when signed, `site.zip.sig`, in that order. FormWeb checks the format (`formpublisher-package`, version 1), the package record, and that `site.zip` matches the size and sha256 recorded in both `fpub.json` and `publish.json`. It then loads the site from `site.formweb.json` inside `site.zip`, with the images and other assets the site uses, which keep the same sha256 ids. Nothing is stored until every check passes; a refused file leaves the open document unchanged and its staged files are removed. FormWeb does not check the signature (`site.zip.sig`): FormPublisher does when it opens the same file, so open a signed package there to verify it. A `.fpub` built from a site FormWeb did not make has no `site.formweb.json`, and FormWeb refuses it with a message pointing to FormPublisher.

Undo and redo operate on engine changes. An agent command batch is one atomic undo step. Save before starting a separate project if the current work must be retained.

## Audit and export

Run Audit to inspect model issues. Select an issue to focus its element or page SEO inspector, then check hierarchy, links, media alternatives, forms, headings and narrow widths visually. The audit is an aid and does not certify all accessibility requirements.

Export downloads static HTML/CSS/JavaScript, uploaded assets, route metadata and configured runtime behavior. All-locale output includes translated routes and alternate-language metadata. Review warnings and open the exported pages. Keep editable source as well as the ZIP. Gated member content requires the authorizing backend; public static export is rejected rather than exposing it.

File > Send to FormPublisher (also in the command palette) exports the open site and hands it to FormPublisher on the same computer (a refusal names its code in brackets, for example `[not-a-site]`), the app that checks, builds and publishes a finished site. When FormPublisher is running the site arrives live and the status line shows the site and its revision, followed by any export warnings; if the 404 page has no real base URL, the warning carries a Set the base URL action that opens the Base URL field in the page inspector's Whole site section (a warning raised while a dialog is open shows the same action in the dialog's footer, and clicking it closes the dialog first); sending the same site again files a new revision of it, not a second site. When FormPublisher is not running, the ZIP is written to its inbox folder instead (`inbox` inside `FORMPUBLISHER_HOME`, by default `~/FormPublisher/inbox`) and the status line gives the path; FormPublisher imports it the next time it starts. FormWeb finds FormPublisher in this order: `FORMWEB_FORMPUBLISHER_URL` if you set it; then the `engine.json` that FormPublisher writes in its data folder (`FORMPUBLISHER_HOME`, by default `~/FormPublisher`), whose port is used only if `/api/health` on this computer answers as FormPublisher; then `http://127.0.0.1:8280`. A FormPublisher on another port is therefore found without any setting. Sending does not change your site or leave the editable project: keep saving the `.fweb` file.

Publish creates an immutable local version served by the running API. Studio > Publishing & delivery lists releases and promotes or rolls back the active /sites/ route; previous version URLs remain separate. Portable redirects map old routes to destinations, with cycles rejected. A rule may end in one star, such as `/old/*` to `/new/:splat`, to move a whole section. A page routed at `/404` is also exported as a root `404.html`, and a published release answers a missing path with that page and status 404 (an unpublished preview does too). Set the base URL to the site's public address before deploying under a path: with it unset or example.com, export warns and the audit reports seo.base-url-404. Emptying the Base URL field removes the setting, and the site is treated as on the https://example.com placeholder (the field's help ends with "Leave it empty to keep the https://example.com placeholder."). Provider deployment/domain workflows are separate configured adapter calls: inspect their returned status and verification requirements before treating them as usable public output.

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

The browser application defaults to local authoring and persisted services. External adapters require server configuration and independent transport/vendor verification; a fixture response or saved binding does not prove public hosting, domain/TLS/CDN readiness or completed payment processing. Collaboration uses branches, review, roles and presence rather than simultaneous character-level co-editing. Native desktop bundles are outside this delivery. See the comparison in [comparisons](comparisons/) for evidence grades and every release's score and the [agent quick start](AGENT_QUICKSTART.md) for agent workflows; verification records ship in the planning sidecar.
