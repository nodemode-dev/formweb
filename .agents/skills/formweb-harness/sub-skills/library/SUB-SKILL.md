---
name: library
description: "Finds and inserts FormWeb's bundled section library: 35 animated section templates, header and footer chrome, 21 page components, the formai-studio design preset and the product-site starter. Covers re-casting fields, applying presets and starters, Import HTML for pages from elsewhere, the %%name%% scoped-variable placeholder, and authoring a template or component checked with ./formweb library check. Tools: library_list, library_insert, library_apply_preset, library_apply_starter, library_import_html; REST routes on older servers. Use when asked for a ready-made hero, pricing, footer or scroll story."
---

# Library

## Purpose

Start a page from a finished, animated section instead of rebuilding it. An inserted section is ordinary nodes, tokens and motion data that the designer can edit like anything else, not a locked copy.

## Surfaces

| Action | MCP (0.19.3) | Older server: REST route | CLI | Editor |
| --- | --- | --- | --- | --- |
| List sections, components, presets, starters | `library_list` (read-only) | GET /api/library | `./formweb library list` | Library panel |
| Start from a blank page | `new_site` {name, blank?} (blank defaults to true; the sample site otherwise) | POST /api/new {name, blank} | none | File > New |
| Insert a section | `library_insert` {section, parent?, index?, values?, page?, update_components?} | POST /api/library/sections/[id]/insert (REST body uses updateComponents) | `./formweb library insert [id] key=value` | Library panel, Insert |
| Apply the design preset | `library_apply_preset` {preset, mode?, page?} | POST /api/library/presets/[id]/apply | `./formweb library preset [id] [--all]` | Library panel, Apply preset |
| Apply a starter site | `library_apply_starter` {starter, values?, update_components?} | POST /api/library/starters/[id]/apply | `./formweb library starter [id] key=value` | Library panel, Starters |
| Import a whole HTML document as one code section | `library_import_html` {html, css?, name?, parent?, index?, page?} | POST /api/library/import-html | none | Library panel, Import HTML |
| Validate and compile the library files | none | none | `./formweb library check`, `./formweb library build` | none |

The older-server routes are plain HTTP on the running backend (default port 8240) and send one `/api/batch` each, so they are also one undo step. `apply_commands` cannot do an insert, because the expansion of a template into commands happens in `backend/app/library.py`; use the route. Check `tools/list` for the tool names; `library_list` is the only read-only one, and the writes are undoable but not idempotent.

## Procedure

1. `get_site` for the revision, the page and the parent node. `library_list` for the catalogue: each section has `id`, `name`, `category`, `tags`, `product`, `description`, `components`, `preset` and `fields`. Search by name, product, tag or category (`product-site`, `scroll-story`, `portfolio-hero`, `prompt-hero`, `support`, `not-found`, `chrome`).
2. Choose sections for the brief. Read each one's `fields` and decide the values: `tint` (hex colour, the product hue), the product name (often two fields for the two-tone wordmark), copy, links and media. Field types are text (400 characters), longtext (4,000), color (hex), url (https, `/path`, `#anchor`, `mailto:` or empty), asset (an owned `/api/assets/` path or https) and number. A bad value is refused with the field named.
2a. For a page assembled from the library, start with `new_site` (blank) so no sample content sits above the sections. For a named app, prefer sections whose `product` is that app, because the other sections' pictures and frames show other apps; take the tint from `products` on the preset in `library_list` kind presets.
3. Insert with `library_insert`, passing `parent` (default: the page root), `index` to order siblings, and `values` to re-cast for the named app. The insert uploads bundled media, merges built page components, applies the preset in mode `missing` (a designer's own tokens are never overwritten), expands the tree and adds behaviors, all in one batch. Read `warnings` from the result: a component the site already has with a different `sourceDigest` is kept unless `updateComponents` is true, and a component with no built record is compiled on the spot.
4. The preset: insert already applies what the site lacks. Use `library_apply_preset` with mode `all` only when the user wants every token, text preset and font replaced by the preset, because it overwrites their choices. Say so first.
5. A whole site: `library_apply_starter` adds the `product-site` starter's six pages (Home, Product, About, Stories, Support, Not found), each opening with `formai-header` and ending with `formtray-footer`. One tint and product name recast every section. The first page replaces an empty home page.
6. Pages from elsewhere: `library_import_html` turns a whole HTML document into one code section on a new childless host. It takes styles, body markup and the first inline script, refuses unknown imports, does not bring relative assets or external scripts, and runs only in Preview. It turns on `code.allowSections`. Page-level code runs with full page access, so use it only for HTML the user trusts.
7. Check in Live preview at the requested widths and at reduced motion, then `audit_site`. Page components do not run on the canvas; the editor shows their poster.

## Scoped variables: %%name%%

Variables are site-wide, so a variable-driven section inserted twice would share its state. In a template, write each variable the section owns as `%%name%%`. At insert it becomes `name_[suffix]` with one random suffix per insert, everywhere it appears: `variables.set` names, formulas, `set-variable` actions, script `{var:...}` tokens, component props and `var(--fw-v-%%name%%)` styles. Two inserts then keep independent state. Use `%%name%%` for variables only; node ids use `@@key@@` and fields use `{{field}}`. Placeholders expand in the order `$parent`, `@@key@@`, `%%name%%`, `{{field}}`. On a server older than 0.19.3 the placeholder is not expanded; the insert warns that every copy shares the variable.

## Authoring a template or component

1. Template: add `library/sections/[id].json` (the file name is the id) with `format` `formweb-section`, `version` 1, `name`, `description`, `source`, `product`, `category`, `tags`, `components`, `fields` (three to eight, always a `tint`), `tree`, `commands`, `behaviors`, `properties`. Add a 640 by 400 `library/sections/thumbs/[id].webp`. Node keys are unique and at most 40 characters of letters, digits, `_` and `-`. Style with tokens (`var(--ground)`, `var(--sp-6)`, `var(--radius-m)`), not literals, except where the original used one. `extension.set` and `design.set` are refused in a template; use `behaviors` and `properties`. Code sections do not belong in templates.
2. Component: `library/components/[id]/manifest.json` (props may carry only `type`, `required`, `default`; labels and docs sit beside them), `component.js` exporting `mount(root, props, ctx)` with no dependencies, no `fetch`, no `eval`, at most 256 KiB, and the banned substrings `import `, `import(`, `require(`, `export *` kept out even in comments. Add `poster.webp`. Read sibling `components-builder` for the `ctx` API.
3. Run `./formweb library check` (exits 1 on any problem, one line each), then `./formweb library build` after `./formweb install`, then `./formweb library build --check` to confirm no drift. Do not claim a template works until check is clean and an insert was observed in a browser.
4. Record fidelity to the original in `docs/SECTION_PARITY.md`.

## Gate

The list or insert result was read, not assumed. Warnings were reported to the user. Each inserted section was seen in Live preview, a variable-driven section was inserted twice and its copies stayed independent, and any authored file passed `./formweb library check`.

## Hands back

Section, preset and starter ids, the values used, new root and page ids, warnings, final revision, preview widths inspected, and the check result for authored files.

## Owned resources

- `docs/LIBRARY.md`: template, manifest, preset, starter and route reference.
- `docs/SECTION_PARITY.md`: fidelity per section. `docs/CODE_COMPONENTS.md`: page mode build.
- Sibling `motion-director`: motion and variables the templates carry. Sibling `components-builder`: writing page components. Sibling `release-operator`: export after inserting.
