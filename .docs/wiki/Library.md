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
| `frontend/src/features/library/` | The Library panel |

## One path for every client

The panel, the routes and the command line all call `library.py`, which turns a template into engine commands and never talks to the engine itself. A route reads the current site and revision, builds the commands (uploads and owns bundled media, merges missing built components, applies the preset in mode `missing`, expands the tree and its commands, merges behaviors) and sends them as one `/api/batch`. One insert is one undo step, and inserting twice gives two copies with different node id suffixes.

Placeholders in a template are `$parent`, `@@key@@` for a node id and `{{field}}` for a field value. `extension.set` and `design.set` are refused in a template because they replace whole groups; `behaviors` and `properties` are the merged alternatives.

## Routes

`GET /api/library`, `GET /api/library/thumbs/{id}.webp`, `GET /api/library/components/{id}/poster.webp`, `GET /api/library/components/{id}/poster-light.webp` (404 when a component has none), `POST /api/library/sections/{id}/insert`, `POST /api/library/presets/{id}/apply`, `POST /api/library/starters/{id}/apply` and `POST /api/library/import-html`. Request and response shapes are in `docs/LIBRARY.md` and `docs/ADVANCED_SCHEMA.md`.

## Page components

A component is one JavaScript file that exports `mount(root, props, ctx)`. It may not bring in other modules (the model refuses the substrings `import `, `import(`, `require(`, `export *` and ` from '`) and is capped at 256 KiB. It styles itself with token variables, draws the settled state under reduced motion, falls back from WebGL to a 2D canvas, and calls `ctx.ready()` to hide its poster. A manifest may name `"posterLight": "poster-light.webp"`, the component at rest in the light theme at the dark poster's size; library check requires the file, and a component without one (`fog-wipe-monitor`) draws the same in both themes. The runtime is `native/crates/formweb-export/src/components.js`; it mounts a component when its host comes within one viewport.

## Verification

`./formweb library check` validates every manifest, template, preset and starter and exits 1 on any problem. `./formweb library build --check` rebuilds the component records in memory and fails on drift. Both run in the CI build job. Parity runs shoot every template and its original at 8 steps in four runs (1440 dark, 1440 light, 390 dark, 1440 dark under a 4x slower CPU and network); the bar is no console or page errors, layout shift under 0.001, no overflow and matching frames.

## Known limits

Variables are site-wide, so two copies of a variable-driven section share state. A scene offset takes a literal length. Page components mount lazily, so their first frame can lag. The style model refuses logical properties, `background-clip`, `writing-mode`, `scrollbar-width`, `text-underline-offset`, `overflow-wrap`, `appearance` and the `rect` svg tag, which templates approximate.
