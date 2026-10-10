# FormWeb manual

FormWeb is a visual website authoring application with editable pages, a node hierarchy, responsive styles, reusable components, CMS data, translations and static website export. The Rust engine owns the document; the editor and agents change that same document.

## Start the editor

Install Node 22, Python 3.12 and Rust stable. From the repository:

```bash
./formweb install
./formweb boot
```

On Windows use `formweb.bat install` and `formweb.bat boot`. Open http://localhost:5240. The API runs on http://127.0.0.1:8240. `./formweb doctor` lists missing tools or builds. To serve a built editor with one process, run `./formweb build`, then `./formweb serve`, and open the API address.

The default data folder is `backend/data`. Configure `FORMWEB_DATA_DIR` in `backend/.env` before launch to choose a persistent location. Keep a saved editable project or downloaded native document before replacing the checkout.

## Pages and elements

Use the Pages list to select a route or add a page. Page settings edit its name, slug, title, description and indexing preference. The Layers list describes its node hierarchy. Select a layer or click an element on the canvas to edit it. Double-click text on the canvas to edit its content.

Insert adds primitives such as a section, text, grid, image or form into the selected structure. Image insert opens a file picker for PNG, JPEG, WebP or GIF up to 8 MiB; Content > Upload image replaces the selected image. Uploaded raster files are validated, stored locally and bundled into website export. Layers supports ordering and moving elements under a parent. The inspector's Design and Content surfaces change styles, attributes and text; the Page surface changes route metadata.

A website layout uses normal browser flow, flex and grid styles. Use meaningful element names and a clear hierarchy. A stored value becomes part of the site only after the engine acknowledges it. Invalid changes are reported; they do not replace the previous document.

## Responsive design

Desktop, Tablet and Mobile select the preview width and responsive profile. Default tablet and mobile maximum widths are 991 px and 767 px. Inspect each profile after changing spacing, type, flex or grid. Use Preview mode to check website behavior without editor selection controls.

The exported CSS consumes the site's responsive styles. The editor's preview is a check of the actual document rather than a separate mockup. Narrow-screen layout still requires author judgment; setting a breakpoint alone does not guarantee usable typography or content ordering.

## Components and tokens

Capture a selected subtree as a component, then insert that component elsewhere through the Components surface. Components retain a named reusable structure. Edit the site's design tokens to coordinate shared color, spacing or type values where the layout uses them.

## CMS and translations

Create a collection, define its field schema and add items through the CMS surface. Item values are JSON matching that schema. Bind a node to the desired collection and field through its content controls. Check the exported page using real content lengths and published data.

Locales store translation maps. Add the target locale and translations, then select the export locale. Missing translations need review; do not deliver a translated site solely from a locale label.

## Interactions

The interaction inspector supports the implemented click, hover and scroll triggers and toggle-class, navigation and fade-in actions. Supply the action's class, destination or duration as appropriate. Preview checks click and hover actions. Check keyboard use, scroll-triggered animations, reduced-motion behavior and live form submission in the exported or locally published page.

## Save, reopen and import

Save writes the active editable project to the local project library. Projects lists saved records and opens one back into the engine. Download creates an editable `.fweb` JSON envelope containing the site's model and uploaded raster assets for portable editing. Import accepts this envelope or a bare site JSON document and validates the document before replacing the active site. Native downloads are limited to 64 MiB; individual images are limited to 8 MiB. New creates another starter document with a distinct site identity.

Undo and redo operate on engine changes. An agent command batch is one atomic undo step. Save before starting a separate project if the current work must be retained.

## Audit and export

Run Audit to inspect the site's reported model issues, then check hierarchy, links, media alternatives, forms, headings and narrow widths visually. The built-in audit is an aid; it does not certify all accessibility requirements.

Export downloads a ZIP of static HTML, CSS and JavaScript. Review reported warnings and open the exported pages. Keep the editable project as well as the website ZIP. The ZIP can be deployed by the owner to a chosen static host.

Publish creates a versioned local URL served by the running API. Previous versions remain separate. The URL is local to this computer; this release does not provision public hosting or custom domains. Locally published forms write submissions into the local database. A site deployed elsewhere needs an appropriate external form endpoint.

## Author with an agent

Start the editor/service and enable Agents. The repository includes project MCP configurations for Claude, Codex and Cursor. Use `./formweb agents install` to see paths and commands without changing global configuration. On Windows configure an absolute `formweb.bat` path with the `mcp` argument.

The `formweb-harness` skill guides an agent through reading, planning, atomic commands, responsive inspection, audit, save and export. MCP exposes the same active document as the editor. An agent should obtain live ids and command schemas before changes and refresh state after a revision conflict.

Agent access defaults off. `FORMWEB_AGENTS=1` is available for a deliberately configured local session; `FORMWEB_AUTH_TOKEN` can restrict control requests further. `./formweb mcp` requires the running HTTP service and does not start an isolated engine.

## Current boundaries

This initial browser application does not provide external hosting, domain registration, multiplayer editing, production analytics, ecommerce/payment processing or native desktop bundles. The researched Framer/Webflow requirements and actual implementation grades are recorded in `docs/PARITY.md`.
