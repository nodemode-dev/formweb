# Section library

The library is data that ships with FormWeb: 35 section templates from the formai.studio family sites plus a header and a footer, 21 first-party page components, the `formai-studio` design-system preset and a `product-site` starter. Templates are restyled by tokens and text presets, so they are starting points for builds, not frozen copies. The full guide is `docs/LIBRARY.md`; measured fidelity to the originals is in `docs/SECTION_PARITY.md`.

## Where it lives

| Path | Role |
| --- | --- |
| `library/sections/<id>.json` | Section template: fields, node tree, commands, behaviors |
| `library/sections/thumbs/<id>.webp` | 640 by 400 thumbnail for the panel |
| `library/components/<id>/` | Manifest, `component.js`, poster and optional media |
| `library/presets/` | Preset JSON and the bundled Inter font |
| `library/starters/` | Starter sites |
| `library/media/` | Bundled pictures and video, named by their SHA-256 |
| `library/build/components/<id>.json` | Compiled component records written by the tool |
| `backend/app/library.py` | The one implementation of template expansion, preset commands and component merging |
| `backend/app/library_routes.py` | HTTP routes |
| `setup/library_tool.py` | `./formweb library check` and `build` |
| `frontend/src/features/library/` | The Library panel; `showTab(id)` on the panel switches between `sections`, `kits` and `import`. The Import HTML tab (`importer.ts`) has three parts: HTML files, A whole site in a .zip and Paste HTML code (`POST /api/library/import-html`, through the exported `importSection()`). The editor command `file.import-html` (File > Import HTML files...) calls `importHtml()`, which shows that tab and opens the file picker of `site-import.ts` in the same click |

## One path for every client

The panel, the routes and the command line all call `library.py`, which turns a template into engine commands and never talks to the engine itself. A route reads the current site and revision, builds the commands (uploads and owns bundled media, merges missing built components, applies the preset in mode `missing`, expands the tree and its commands, merges behaviors) and sends them as one `/api/batch`. One insert is one undo step, and inserting twice gives two copies with different node id suffixes.

Placeholders in a template are `$parent`, `@@key@@` for a node id and `{{field}}` for a field value. `extension.set` and `design.set` are refused in a template because they replace whole groups; `behaviors` and `properties` are the merged alternatives.

## Routes

`GET /api/library`, `GET /api/library/thumbs/{id}.webp`, `GET /api/library/components/{id}/poster.webp`, `GET /api/library/components/{id}/poster-light.webp` (404 when a component has none), `POST /api/library/sections/{id}/insert`, `POST /api/library/presets/{id}/apply`, `POST /api/library/starters/{id}/apply`, `POST /api/library/import-html`, `POST /api/library/import-site/review` and `POST /api/library/import-site`. Request and response shapes are in `docs/LIBRARY.md` and `docs/ADVANCED_SCHEMA.md`.

## Import site from zip

`backend/app/site_import.py` reads a static site zip in memory with `zipfile` under hard caps (64 MiB; 40,000 entries and a 2 MiB file list checked from the end record before parsing; then 1,000 entries and 12 levels counted only outside the ignored `__MACOSX`, `node_modules` and dot folders; 128 MiB unpacked, an expansion limit, per-type file caps) and refuses traversal, absolute and drive-letter names, links and passwords outright. A project's source (a `package.json` at the top or one folder down, plus one of: no HTML page; `.ts`, `.tsx`, `.jsx`, `.vue` or `.svelte` files under that project's `src` folder; a page loading such a script, holding `%PUBLIC_URL%`, or loading a module script that imports a package by name while no page has an import map) is refused with a sentence that says to build it and import the output folder (`_project`; `_peek` reads names from the file list of an archive refused before it is opened, only to choose that sentence). Both routes also take loose pages as JSON, `{"files": [{"name", "html"}]}`, which `read_files` turns into the same structure as a zip holding them at its top level. The review route plans without changing anything; the import route re-reads the same bytes, refuses a changed revision, stores assets through `ingest` and sends one batch of `page.add`, `page.update`, `node.add` and `code.section.set` (and `node.remove` in replace mode, offered only when no extension entry or component source points into the page). Each page is one code section built with Import HTML's `kit_script`, so the script policy is the same; both paths use `site_import.script_type` to leave out script elements that are not JavaScript (JSON-LD among them) with the same warning. The editor view is `features/library/site-import.ts` (File > Import site from zip..., `file.import-site`, and the review of File > Import HTML files..., `file.import-html`); both commands share its one hidden `multiple` file input, whose `accept` `choose(kind)` sets just before `click()`, after `reset()` has cleared any earlier import, so the picker opens inside the person's click over a clean view. The view has one Bring ... in as choice for pages and a section, its result note at the end of the scroller and work in progress on the import button. Since 0.35.0 the review gives each page `outside` and `outsideMore`: the stylesheets and scripts it loads from other hosts as `{kind, host, url}`, read by `outside_file` the way a browser reads a link (no regular expression, bounded), in document order, at most 20; nothing is fetched. `outsideWarnings` holds the indexes of the older outside-script and head-stylesheet warnings that `outside` names in full (every counted reference parsed and `outsideMore` 0), and the view leaves those warnings out of the row. The view names those hosts per page in plain text and starts the Bring choice on Code sections, with the reason, when any page has them (set once when the review arrives). Agents use `library_import_site`.

## Convert to editable elements

`frontend/src/features/convert/` turns a code section into ordinary elements: `rules.ts` (pure: tag and attribute mapping, style reduction against a bare twin, text runs, selector scoping, the result sentence), `measure.ts` (two hidden `sandbox="allow-same-origin"` frames with a `default-src 'none'` policy, one with the section's sanitized HTML and CSS at 1440 px, one with the export's base styles and a bare twin per new element) and `index.ts` (the `library.convert-section` command, its dialog, the canvas and layer menu entry, and one `/api/batch` of `node.add` with chosen ids, retried without any value the engine refuses). Import HTML and Import site from zip offer Editable elements or Code sections (`features/library/bring.ts`); with elements they call the converter through the library hook `convert` after the import. The MCP import tools reach it through the window command bridge with `bring_in: "elements"`. An own-asset background picture sized cover or contain becomes an `img` behind the content (`rules.ts` `backdropLayers`). Since 0.35.0, with the script kept, `measure.ts` `keepRules` stores the rules no converted element uses (and the class rules the script names) in the script's code section CSS, scoped to the converted root and guarded with `:where(:not([data-fw-node]))`, at most 3,000 rules and 192 KiB, with a 2 s matching bound; `fillWindow` writes heights that followed the window in vh, so a page that filled the window fills the canvas and Preview. Limits, losses and the security of the measuring frame: `docs/LIBRARY.md`, Convert to editable elements.

## Page components

A component is one JavaScript file that exports `mount(root, props, ctx)`. It may not bring in other modules (the model refuses the substrings `import `, `import(`, `require(`, `export *` and ` from '`) and is capped at 256 KiB. It styles itself with token variables, draws the settled state under reduced motion, falls back from WebGL to a 2D canvas, and calls `ctx.ready()` to hide its poster. A manifest may name `"posterLight": "poster-light.webp"`, the component at rest in the light theme at the dark poster's size; library check requires the file, and a component without one (`fog-wipe-monitor`) draws the same in both themes. The runtime is `native/crates/formweb-export/src/components.js`; it mounts a component when its host comes within one viewport.

## Verification

`./formweb library check` validates every manifest, template, preset and starter and exits 1 on any problem. `./formweb library build --check` rebuilds the component records in memory and fails on drift. Both run in the CI build job. Parity runs shoot every template and its original at 8 steps in four runs (1440 dark, 1440 light, 390 dark, 1440 dark under a 4x slower CPU and network); the bar is no console or page errors, layout shift under 0.001, no overflow and matching frames.

## Known limits

Variables are site-wide, so two copies of a variable-driven section share state. A scene offset takes a literal length. Page components mount lazily, so their first frame can lag. The style model refuses logical properties, `background-clip`, `writing-mode`, `scrollbar-width`, `text-underline-offset`, `overflow-wrap`, `appearance` and the `rect` svg tag, which templates approximate.
