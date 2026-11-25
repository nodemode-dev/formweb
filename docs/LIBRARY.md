# Section library

The library is a set of ready-made sections, page components, a design-system preset and a starter site that ship inside FormWeb. It exists so a designer can start a page from a finished, animated section and then change it like anything else on the canvas. A section from the library is a template, not a frozen copy: its colours, type, spacing and radii come from design tokens and text presets, so applying a different preset or changing a token restyles it, and every element it creates is an ordinary node you can select and edit.

This release carries 35 section templates from the formai.studio family sites, two chrome templates (the header and the footer), 21 first-party page components for the effects that cannot be written as data, one preset (`formai-studio`) and one starter (`product-site`). How closely each template matches its original is recorded in [SECTION_PARITY.md](SECTION_PARITY.md). The page component mechanism itself is described in [ADVANCED_SCHEMA.md](ADVANCED_SCHEMA.md) and, for components you write yourself, in [CODE_COMPONENTS.md](CODE_COMPONENTS.md).

Everything here is plain data under `library/` plus one Python module, `backend/app/library.py`, which expands a template into ordinary engine commands. The Library panel, the HTTP routes and the command line all call that module, so an insert behaves the same from each.

## Layout of library/

```
library/
  presets/formai-studio.json             design-system preset
  presets/fonts/inter-4-var-latin.woff2  Inter 4 variable, latin subset (SIL OFL 1.1, licence file beside it)
  components/<id>/manifest.json          component manifest
  components/<id>/component.js           the component source
  components/<id>/poster.webp            static rest frame shown on the canvas
  components/<id>/poster-light.webp      optional rest frame in the light theme
  components/<id>/media/                 media only that component uses (optional)
  sections/<id>.json                     section template
  sections/thumbs/<id>.webp              640 by 400 thumbnail for the Library panel
  starters/product-site.json             starter site
  media/                                 bundled pictures, video and fonts, content addressed
  build/components/<id>.json             compiled component records, written by ./formweb library build
```

When the desktop app is frozen the whole folder travels inside the bundle. Set `FORMWEB_LIBRARY_DIR` to point the tool and the routes at another copy, which is how the tool is tested against a fixture.

## Section templates

A template is one JSON file, `library/sections/<id>.json`. The file name is the id.

```json
{
  "format": "formweb-section", "version": 1,
  "id": "formmorpheus-filmstrip",
  "name": "FormMorpheus filmstrip",
  "category": "scroll-story",
  "tags": ["filmstrip", "scrub", "video"],
  "product": "formmorpheus",
  "description": "One sentence a designer understands.",
  "source": "formai-xmental-webspun v3.1.0 assets/sections/formmorpheus-filmstrip",
  "preset": "formai-studio",
  "components": ["filmstrip"],
  "fields": { "tint": { "label": "Tint", "type": "color", "default": "#ff9a3c" } },
  "tree": { "key": "section", "tag": "section", "name": "Filmstrip", "children": [] },
  "commands": [],
  "behaviors": {},
  "properties": {}
}
```

Keys, all at the top level:

| Key | Meaning |
| --- | --- |
| `format`, `version` | Always `formweb-section` and `1`. |
| `id` | The file name without `.json`. Letters, digits, `_` and `-`. |
| `name`, `description`, `source`, `product` | Required text. `product` is the product slug, for example `formmcp`; the panel searches it. |
| `category` | One of `product-site`, `scroll-story`, `portfolio-hero`, `prompt-hero`, `support`, `not-found`, `chrome`. |
| `tags` | Words the panel's search matches besides the name, product and description. |
| `preset` | The id of a preset the section expects. Optional. |
| `components` | The page component ids the section uses. Every `code.instance.set` in `commands` must name one of them, and the check fails if a listed component is unused. |
| `fields` | The re-cast fields the panel shows before insert. See below. |
| `tree` | The node tree. See below. |
| `commands` | Engine commands that run after the tree in the same batch. |
| `behaviors` | Optional map from `@@key@@` to `{ "states": { "hover": {...}, "focus": {...}, "press": {...}, "selected": {...} } }` (actions and conditions are accepted too). Merged into the site's `behaviors` group once per insert. |
| `properties` | Optional map from a custom property name to `{ "syntax", "inherits", "initial" }`. Merged into the site's registered properties (`@property`) once per insert; a property the site already registers is kept. |

### The tree

Each node has a `key` (unique in the template, `[A-Za-z0-9_-]`, at most 40 characters), a `tag`, and optionally `name` (the layer name a designer reads), `text`, `attrs`, `styles`, `breakpoints` and `children`. No other keys are accepted. `breakpoints` holds style maps named `tablet` (991 px) and `mobile` (767 px). A node's id becomes `<key>-<suffix>`, where the suffix is random per insert.

Styles take values from tokens as the originals do: `var(--ground)`, `var(--ink-soft)`, `var(--sp-6)`, `var(--fs-2xl)`, `var(--radius-m)`, `var(--ease-out)`. A literal appears only where the original used one, such as a fixed `42vh` or a `clamp()`. The product tint is carried by the section root as `--hue` (a `color-mix` of the `tint` field and the preset's hue depth) and descendants read `var(--hue)`. Text roles use the preset's text presets through `textpreset.apply`. A FormWeb export has no global stylesheet, so each node carries what the kit's global rules gave it, such as `margin: 0` on headings.

### Placeholders

Three placeholders work in any string of `tree`, `commands` and `behaviors`, expanded in this order:

- `$parent`, when it is the whole string, is the node the section is inserted under.
- `@@key@@` is the id of the node with that key. It also works inside a longer string and as an object key. A string field value that contains `@@key@@` has it expanded too.
- `{{field}}` is the value of that field. When the whole string is just `{{field}}` the raw value is used, so a number field stays a number; inside a longer string it is converted to text.

An unknown `@@key@@` or `{{field}}` fails the check.

A fourth placeholder scopes variables to one insert:

- `%%name%%` expands to `name_<suffix>`, with the same suffix as the node ids of that insert (`name` starts with a letter or `_` and has at most 41 characters). It works in variable names, formulas, actions, scripts, component props and `var(--fw-v-%%name%%)` styles alike, so a template writes every variable it declares as `%%name%%` and two copies of a calculator, a prompt hero or a FAQ on one page keep their own state. A component that reads a variable receives the scoped name as a prop, for example `filterVariable`.

`./formweb library check` fails a `%%name%%` that no `variables.set` in the template declares. Keep names short: the scoped name is still a variable name and must stay within 64 characters.

### Commands

`commands` are ordinary engine commands: `motion.set`, `motion.track`, `variables.set`, `code.instance.set`, `textpreset.apply`, `node.update` and so on (see [ADVANCED_SCHEMA.md](ADVANCED_SCHEMA.md)). Two are refused in a template: `extension.set` replaces a whole group and would wipe a designer's own entries (use `behaviors` instead), and `design.set` replaces a whole design map (use `properties` or the preset). Code sections (`code.section.set`) are not used in templates; they belong to Import HTML.

### Fields

A field is `{ "label", "type", "default" }`. Types and limits:

| Type | Value |
| --- | --- |
| `text` | Up to 400 characters. |
| `longtext` | Up to 4,000 characters. |
| `color` | A hex colour, `#rgb` or `#rrggbb`. |
| `url` | An `https://` address, a relative path starting with `/`, an anchor starting with `#`, a `mailto:` link, or empty. |
| `asset` | An uploaded asset path starting with `/api/assets/`, or an `https://` address. |
| `number` | A JSON number. |

Every template has a `tint` colour field (the product hue from the preset's `products` map) and the product name, usually as two fields so the two-tone wordmark can be restyled, plus the copy, links and media a designer would change first. The aim is three to eight fields; everything else is edited on the canvas after insert. Field names are letters, digits and `_`, at most 40 characters. Every default must pass its own type's check.

### Behaviors and one undo step

Hover, focus, press and selected (the chosen tab or filter chip) states live in `behaviors`. The insert collects the behaviors of every template in the batch and sends one `extension.set` for the `behaviors` group at the end, merged into the group the site already has. The whole insert is one `/api/batch`, so one undo step, and inserting a template twice gives two independent copies.

## Page components

The 21 components are the algorithms the native motion model cannot express: the noise band, specks, starfield, physics deck, filmstrip, tile cut, knockout artboard, fog wipe monitor, glyph lens, paint sim, orbit constellation, infinite board, page turn, tube travel, fold plan, forecast chart, scripted desktop, develop frame, token prompt, receipt printer and ruler slider. Reveals, scroll scenes, loops, counters, text motion, drag, pointer effects, disclosure, actions, scripts and variables are native and stay in the template's `motion` and `variables` data; a component is used only for what data cannot say.

### The manifest

`library/components/<id>/manifest.json`:

```json
{
  "format": "formweb-component", "version": 1,
  "id": "filmstrip", "code": "C5", "name": "Filmstrip scrub",
  "description": "One sentence a designer understands.",
  "props": { "frames": { "type": "json", "required": true }, "accent": { "type": "color", "default": "var(--hue)" } },
  "labels": { "frames": "Frames", "accent": "Accent" },
  "propDocs": { "frames": "Array of {src, alt, title, loc, frame, w, h, fx, fy} in plate order." },
  "poster": "poster.webp",
  "posterLight": "poster-light.webp",
  "sections": ["formmorpheus-filmstrip"],
  "fallback": "What shows without WebGL, or with reduced motion.",
  "source": "Where the component was ported from and its clearance."
}
```

`id` matches the folder name. `code`, `name`, `description` and `source` are required text. `props` descriptors may carry only `type`, `required` and `default`; the model rejects anything else. Types are `string`, `number`, `boolean`, `json`, `color` and `asset`. A `color` default is a hex value or `var(--token)`. Labels and docs sit beside the descriptors, not inside, and a label for an unknown prop fails the check. The exporter merges declared defaults into every instance, and the components still read `props.x ?? fallback` as a second line of defence. Every text a designer would change (labels, captions, button text, prompts, replies) arrives as a prop with the original's English as its default.

### component.js

One plain modern JavaScript file that exports `mount(root, props, ctx)` and returns a destroy function. (A `component.ts` is accepted instead, but exactly one of the two must exist.) The rules, which the model and `./formweb library check` enforce:

- No dependencies. The source must not contain the substrings `import `, `import(`, `require(`, `export *` or ` from '` anywhere, comments and strings included. Write "bring in" in a comment instead of the verb.
- At most 256 KiB of source.
- Network only through props: `ctx.asset()` for uploaded assets, `https` for remote pictures. No `fetch`, no workers from blob URLs, no `eval`, no `new Function`.

`root` is an absolutely positioned layer (`inset: 0`) inside the host node. Build the DOM in it and never change the host's or the page's layout from the component, so layout shift stays at 0. Create one `<style>` element inside `root` and prefix every selector with a class unique to the component, such as `.fwc-filmstrip`. Colours, fonts, spacing, radii, shadows and easings come from tokens as `var(--token, fallback)` so a preset restyles the component; never hard-code the formai palette.

### The ctx API

`ctx` comes from the exported runtime (`formweb-export/src/components.js`):

| Member | Use |
| --- | --- |
| `host`, `id` | The host element and the component id. |
| `theme()`, `onTheme(fn)` | The current theme, `dark` or `light`, and changes to it. Re-read tokens here when drawing canvas or WebGL colours. |
| `token(name)` | The computed value of `--name` on the root, for example `ctx.token('hue')`. |
| `asset(path)` | Maps an `/api/assets/<file>` prop value to its exported URL. |
| `progress(scene?)`, `onProgress(fn, scene?)` | Scroll scene progress from 0 to 1. With no argument they follow the nearest enclosing scene; they return 0 when the site has no motion group. |
| `onFrame(fn)` | One shared animation frame loop. Use it for every frame; it pauses when the page is hidden. |
| `visible()`, `onVisible(fn)` | Whether the host is on screen. Idle when it is not. |
| `size()`, `onResize(fn)` | The host's size and changes to it. |
| `variable(name)`, `onVariable(name, fn)` | Read and follow a site variable. |
| `ready()` | Call once when the first real frame is drawn. It hides the poster. |
| `reduced` | A getter, true when the visitor prefers reduced motion. |

Every subscription returns an off function and is cleaned up when the component is destroyed. An error thrown inside a callback marks the host with `data-fw-component-error` and logs one console error that names the component id, the host node and the error; the visitor still sees the poster.

### Scroll stories

Pin and progress come from a native motion scene on the template: a `motion.set` of kind `scenes` with the stage pinned and a `length` in `svh` matching the original track height. The scene `offset` may be a length, `var(--token)` or a `calc()` of lengths and tokens, so the shipped stories pin at `var(--bar-h)` and follow the header's height. The component reads `ctx.progress()` or `ctx.onProgress`. A component does not re-implement sticky positioning or scroll maths.

### Reduced motion, WebGL and posters

Under `ctx.reduced` a component draws the settled end state the original shows under `prefers-reduced-motion: reduce`, runs no loop, and keeps every control usable. The three WebGL components (noise band, glyph lens, paint sim) create their context with `failIfMajorPerformanceCaveat: false`, fall back to a small 2D canvas, and then to a plain gradient that keeps the look. The manifest's `fallback` sentence says what a person sees in each case. Keyboard and accessibility behaviour follows the original: focusable controls, `aria-*` labels, arrow keys and `aria-live` text where the original has them.

`poster.webp` is the component at rest in the dark theme, at most 1600 px wide. The editor draws the poster on the canvas, because page components never run there, and the export shows it until `ctx.ready()` hides it, so its box and the page's layout do not change. On insert the route uploads the poster as an asset the site owns.

A manifest may also name `"posterLight": "poster-light.webp"`. It is the same component at rest in the light theme, captured at the dark poster's size, so swapping them moves nothing. When the site has themes, the export shows each poster in its own theme, and the canvas shows the light one while the Design system dialog previews the light theme. Insert uploads it and the site owns it like the poster, and a changed light poster counts as a component update. A component without one, such as `fog-wipe-monitor`, draws the same in both themes and keeps its single poster.

### Props and defaults in a template

A template installs a component with `code.instance.set` on a host node, naming the component and its props: `{ "node": "@@host@@", "value": { "component": "filmstrip", "props": { "frames": [...] } } }`. The check fails when the template names a prop the manifest does not declare or omits a required prop that has no default.

## Bundled media

Pictures, video and fonts a template needs live in `library/media/` or in a component's own `media/` folder. They are content addressed: a file is referenced as `/api/assets/<sha256>.<ext>`, which is the name the site's asset store gives the same bytes. On insert the route uploads every bundled file that a template, its components' manifests or a starter mentions, and gives the site ownership of it, so the section renders offline and travels inside the `.fweb` file and the export. `./formweb library check` fails when a referenced name is not in the library. Remote pictures on `media.formai.studio` are kept as real `https` addresses with their `width` and `height`.

## The preset

`library/presets/formai-studio.json` carries `tokens` (114 values in the dark theme), `themes` (dark by default, `followSystem` off, and the light overrides), `fonts` (the bundled Inter file, `font-display: optional`), `textPresets` (`display`, `heading`, `title`, `body`, `lead`, `small`, `eyebrow`, `mono`, and the chrome ones `app-form`, `app-suffix`, `button`, `button-quiet`, `chip`, `brand-word`, `nav-link` and `foot-heading`), `page` (root styles), `pageBreakpoints` (root styles per breakpoint, for example `{"mobile": {"--bar-h": "97px"}}` for the taller two-row header on phones), `products` (36 product hues) and `hueDepth` (the dark and light mix depths for `--hue`). `pageBreakpoints` is applied to the page root together with `page`, merging with what the designer set; in mode `missing` it never overwrites a value the site already has.

A preset applies in one of two modes, and both are one batch:

- Inserting a section applies the preset in mode `missing`: only what the site lacks. New tokens, light values for new tokens, the font if absent, new text presets, and root styles not already set. A designer's own choices are never overwritten.
- The panel's Apply preset action applies in mode `all`: every value the preset defines replaces the site's own, including the font.

## Starters

`library/starters/<id>.json` names a preset and a list of pages, each with a `name`, a `slug` and an ordered list of section ids. The `product-site` starter has six pages: Home, Product, About, Stories, Support and Not found. Each page opens with `formai-header` and ends with `formtray-footer`. Applying a starter adds its pages and their sections in one batch, with one tint and product name that the person picks for the whole site. The first page replaces an empty home page; the rest get unique slugs and ids. A starter that names an unknown section fails the check.

## The command line

```
./formweb library check [--json] [--root DIR]
./formweb library build [--check] [--json] [--root DIR]
```

`check` validates everything under `library/` and prints one line per problem, then a summary. It exits 1 on any problem. It verifies that every manifest, template, preset and starter parses and has the right `format`; that ids match file names; that categories are known; that thumbnails and posters exist, including a `posterLight` file when a manifest names one; that component sources pass the substring and size rules; that every `@@key@@` and `{{field}}` resolves; that field defaults are valid; that `components` and `code.instance.set` agree with the manifests; that bundled media exists; that every template expands; and that starters name existing sections.

`build` compiles every component with `setup/build_component.mjs` in `page` mode and writes `library/build/components/<id>.json` with the keys `enabled`, `language`, `mode`, `source`, `sourceDigest`, `builtDigest`, `javascript` and `props`, sorted, with a trailing newline. These records are what the routes install, so a running server needs no Node. `build --check` rebuilds in memory and exits 1 if any file is missing, differs or has no component. Run `./formweb install` first; the build needs Node and the pinned compiler. CI runs `./formweb library check && ./formweb library build --check`.

The other four actions go through the running server's API (`FORMWEB_PORT` or `FORMWEB_API` picks it, default 8240), so each write is one undo step in the open editor:

```
./formweb library list [sections|components|presets|starters] [WORD ...] [--category ID] [--json]
./formweb library insert SECTION [field=value ...] [--parent ID] [--page ID] [--index N] [--update-components] [--json]
./formweb library preset PRESET [--all] [--json]
./formweb library starter STARTER [field=value ...] [--update-components] [--json]
```

`list` filters by kind, category and words and prints each id with its fields. `insert` re-casts fields given as `name=value`. `preset` applies in mode `missing` unless `--all` asks for every value. `starter` builds the starter's pages.

## MCP tools

The same operations are MCP tools for agents (`./formweb mcp`), part of the 17 authoring tools described in [ADVANCED_SCHEMA.md](ADVANCED_SCHEMA.md): `library_list` (read-only; sections with their fields and page components, presets with their product tints, starters), `library_insert`, `library_apply_preset`, `library_apply_starter`, `library_import_html` and `library_import_site` (`data` is the zip as base64; `action` `review` changes nothing, `import` with `mode` and the review's `revision` imports), each one undo step, plus `new_site` to start from a blank home page before assembling sections (it replaces the open site and is approval-gated for agents). Errors point back at `library_list`. The `library` sub-skill of the agent harness describes the workflow.

## HTTP routes

All routes live in `backend/app/library_routes.py`. Reads authorize `read`, writes authorize `edit`, every write records an access entry, and engine errors are returned unchanged. Each write is one `/api/batch` sent with the revision it was computed against, so a concurrent edit is refused, not overwritten.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/library` | none | `{categories, sections, components, presets, starters}`. Each section carries `id, name, category, tags, product, description, components, preset, fields, thumb` (`thumb` is true when a thumbnail exists), in category order then by name. A component carries `id, code, name, description, props, labels, sections`; a preset `id, name, description`; a starter `id, name, description, pages, preset`. |
| `GET /api/library/thumbs/{id}.webp` | none | The thumbnail, `Cache-Control: no-cache`. 404 when missing. |
| `GET /api/library/components/{id}/poster.webp` | none | The component poster, `no-cache`. |
| `GET /api/library/components/{id}/poster-light.webp` | none | The light-theme poster, `no-cache`. 404 when the component has none. |
| `POST /api/library/sections/{id}/insert` | `{parent?, index?, values?, page?, updateComponents?}` | The batch result plus `{root, warnings}`. `parent` defaults to the page's root, `page` to the first page, `index` moves the new root among its siblings, `values` re-cast fields. |
| `POST /api/library/presets/{id}/apply` | `{mode?, page?}` where `mode` is `all` (default) or `missing` | The batch result plus `{changed}`; `{changed: false}` when there is nothing to do. |
| `POST /api/library/starters/{id}/apply` | `{values?, updateComponents?}` | The batch result plus `{pages, warnings}`. `values` re-casts fields shared by the sections, such as tint and name. |
| `POST /api/library/import-html` | `{html, css?, name?, parent?, index?, page?}` | The batch result plus `{root, warnings}`. |
| `POST /api/library/import-site/review` | the `.zip` bytes as the body | `{pages, assets: {count, bytes}, supportFiles, skipped, ignored, canReplace, replaceNote, notes, revision}`. Changes nothing. |
| `POST /api/library/import-site?mode=new\|replace&revision=N` | the same `.zip` bytes | The batch result plus `{pages, assets, skipped, warnings, message}`. 409 when the site's revision is no longer `revision`. |

An insert uploads and owns the bundled media, merges the missing built components into the site's `code` group, applies the preset in mode `missing`, expands the template under `parent`, moves it to `index` if given, and appends the behaviors command, all in the one batch. A component the site already has with a different `sourceDigest` is kept, with a warning, unless the request sets `updateComponents`; a component with no built record is compiled on the spot, with a warning. If the template sets an unscoped variable (a name written without `%%`) that the site already has, the insert warns that every copy shares it; the shipped templates scope all of theirs.

## Import HTML

`POST /api/library/import-html` turns a whole HTML document into one code section, for pages that come from elsewhere. The section needs `code.allowSections`, which the route turns on if it is off. It does the following in one batch:

- Takes every `<style>` block of the document plus the optional `css` into the section's `css`.
- Takes the whole `<body>` content into `html`, with its scripts removed. The chrome stays, because page scripts often measure the header.
- Takes the first inline script into `js`, and sets `module` when any inline script is a module.
- Replaces an import of the formai kit's `reduced`, `onTheme` and `token` helpers with a small inline shim that provides them. Any other kit helper, or any other import, is refused with a message.
- Adds a childless host `section` node at `parent` (or the page root), named from `name`, the document `<title>`, or "Imported section", and sets `code.section.set` on it.

Caps: 512 KiB of markup, 256 KiB of styles and 512 KiB of script; larger input is refused with status 413. External scripts, stylesheets and relative assets (pictures, fonts and files referenced by a relative path) are not brought along: the markup keeps its references, and they will not resolve in the exported site. Section code never runs on the canvas, so check an imported section in Preview.

## Import site from zip

`backend/app/site_import.py` turns a zip of a static site into pages; the two `import-site` routes in `library_routes.py` call it, and the editor's site import view (`frontend/src/features/library/site-import.ts`, opened by `file.import-site` or from the Import HTML view) shows the review and sends the same bytes twice. Both routes authorize `edit`, sit behind the same loopback, origin, identity and window-key middleware as every library route, and the request guard in `main.py` caps their bodies at 64 MiB (`MAX_SITE_ARCHIVE_BYTES`, listed in `SITE_ARCHIVE_PATHS`); the editor's review call waits for queued edits like `/api/audit` does.

Reading the archive, all in memory with the standard library's `zipfile`; nothing is written to disk under an entry's name:

- Before `zipfile` parses anything, the end record must claim at most 1,000 entries and a file list of at most 2 MiB.
- Refused whole, with a plain sentence: a name that is absolute, has a drive letter, a NUL or a `..` part; a symbolic link entry; an encrypted entry; a path deeper than 12 folders; a name that appears twice ignoring case; an entry over 1 MiB that expands more than 100 times; more than 128 MiB unpacked (declared or read).
- Ignored and counted: `__MACOSX`, any dotfile or dot folder, anything under `node_modules`. A single top folder shared by every kept entry is stripped.
- Kept by extension: `html`/`htm` pages (1 MiB each), `css` (256 KiB), `js`/`mjs` (512 KiB) and assets `png`, `jpg`/`jpeg`, `gif`, `webp`, `svg`, `mp4`, `webm`, `woff2` within the asset store's size for that type. Assets must sniff as their extension and pass the upload SVG checks. Everything else is skipped with a reason (WOFF, TTF, OTF and EOT name WOFF2; ICO names the favicon setting).

Each page becomes one code section built by Import HTML's rules: the body (scripts and styles taken out) as `html`; `<style>` blocks and local `<link rel="stylesheet">` files, with local `@import` inlined and `media` kept, as `css`; the first JavaScript script, inline or a local `src`, as `js`, through the same `kit_script` shim and import refusal, with `module` set when any of its scripts is a module. External scripts and stylesheets in the head are not carried. Local `src`, `href`, `poster`, `srcset`, `data-src`, inline `style` and CSS `url()` references become `/api/assets/<sha256>.<ext>` for assets and the new route for pages (`page.html`, `page`, `folder/` and `folder/index.html` all resolve), keeping a `#fragment`; external and `data:` references stay. `<title>` and `<meta name="description">` fill `seo`. Routes come from the path (`index.html` is `/`, `blog/index.html` is `/blog`). At most 100 pages; a page over the code section caps, or one that would take the site past the 4 MiB extension limit, is skipped with a reason.

The import is one `/api/batch` at the reviewed revision: `code.sections.allow` if needed, then per page `page.add` with caller-chosen ids and a free slug (mode `new`) or `node.remove` of the matching page's children (mode `replace`), `page.update` for SEO, `node.add` of a childless `section` host and `code.section.set`. Replace is allowed only when every matching page's content is not a component source and no extension entry names any of its elements. Assets are stored with the asset store's `ingest` and owned by the project before the batch runs.

## Known limits

- Variables written without `%%` are still site-wide: two copies of a section that declares an unscoped variable share its state, and the insert warns when the site already has it. Scope every variable a template owns.
- A document has hard limits (at most 2,000 motion entries and 4 MiB of extension data), so many copies of the variable-heavy formslot-support template (141 variables and formulas each) can fill them; the insert is refused with the limit's message and nothing changes. Batches check and synchronize once at their end, so each insert takes about a second.
- Page components mount lazily, when the host comes within one viewport, and a component may start from its poster. The first frame of a component section can lag the original, and the parity table records this per section.
- The style model still refuses properties the originals might use. `::placeholder` and other pseudo-element styling is not available, so a placeholder keeps the browser's colour, and a property outside the allow-list (see [ADVANCED_SCHEMA.md](ADVANCED_SCHEMA.md)) must be approximated.
- A section keeps its effects and logic, not the source page's whole stylesheet. The kit's global rules are not part of a FormWeb export; each node carries its own resets.
