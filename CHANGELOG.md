# Changelog

## 0.19.9 · 2026-11-10

- The page inspector's Whole site section has a Base URL field for the site's public address, which canonical links, the sitemap and the root `404.html` use.
- The 404 base URL warning on Export and on Send to FormPublisher now carries Set the base URL, which opens that field.
- Send to FormPublisher answers with the export's warnings, through the API, the agent tool and the editor's status line, so agents see the same warnings as people.
- The audit's base URL warning now also catches `https://example.com/` and a site whose base URL was removed.
- A large copy's link serves every paste while it lives, into this FormWeb or another one on the same computer.
- Every new string is in all 26 languages.

## 0.19.8 · 2026-11-10

- The not-found page of a published site keeps its links on the page: Skip to content and links to a section of the page scroll where they should instead of opening the 404 folder.
- Previews of a site that is not published yet show the site's own not-found page at a missing address, the same way published releases do.
- Export, the audit and the Export and Send to FormPublisher status lines warn when a site with a 404 page still has the example.com base URL, because its root `404.html` then links from `/` and loses its styles when the site is served under a path.
- Agents can copy large elements by link: `copy_element` takes `clip` (with `embed_assets`) and `paste_element` takes `clip`, the same 15-minute link on this computer that Copy element uses in the editor.
- Every new string is in all 26 languages.

## 0.19.7 · 2026-11-10

- Redirects can cover a whole folder: `/blog/*` to `/docs/:splat` sends every old blog address to its new place. Exact redirects still win, then the longest folder rule, and a rule that would loop or point into itself is refused.
- A site with a page at `/404` also exports a root `404.html`, so static hosts that look for that file show your own not-found page. Published releases answer missing addresses with it, behind the same password as the page.
- Copies miss nothing: collections that the copied collections refer to come along, items a list or binding names come along even past 500, and variables set by actions come along. Form settings always travelled with a copied form.
- Large copies stay light: Copy element keeps up to 4 MiB of images and videos in the clipboard and links the rest to this FormWeb for 15 minutes, so a paste into another FormWeb on the same computer brings them along while the first one is running.
- Send to FormPublisher names FormPublisher's error code when it refuses a site.
- Every new string is in all 26 languages.

## 0.19.6 · 2026-11-10

- A copied element keeps its look and content in another site: the copy carries the design tokens its styles and motion use (with their light and dark theme values), the text presets applied to it, and the CMS collections its lists and bindings read, with up to 500 items each. Pasting adds what the site lacks; where the site already has a different token, preset, theme value or collection under the same name, the site's own is kept and the paste says so.
- Copy and paste between two FormWeb installations: Edit > Copy element and Cut element now carry the images and other files the element uses (up to 16 MiB), so a paste in another FormWeb brings them along, checked like an upload. The status says when some were too large to carry. A paste that cannot bring a file names it and changes nothing.
- Agents: `copy_element` takes `embed_assets` and `paste_element` takes `embedded`; `POST /api/fragment` takes `embed`, and `POST /api/paste` accepts bodies up to 32 MiB.
- Every new string is in all 26 languages.

## 0.19.5 · 2026-11-10

- Copy, cut and paste elements: Edit > Copy element, Cut element and Paste element (Mod+C, Mod+X, Mod+V) and the layers context menu move an element with its motion, scripts, code sections, page components, variables and translations through the system clipboard, within a page, to another page or into another site on the same FormWeb. Text copy and paste in fields and panels keep working as before. Agents get `copy_element` and `paste_element` (103 MCP tools) and the `node.paste` command.
- Pasting into a site that lacks a page component or variable adds it; where the site already has a different one under the same name, the site's own is kept and the paste says so. Assets must already be on this FormWeb and visible to the person pasting.
- Copies no longer lose an entry when an element's id matches a field name (for example an element called `stage` inside a scroll scene).
- Duplicate element also takes Shift+Mod+D, which always duplicates, so the vector editor (where Mod+D repeats the last transform) has a key for it.
- Large `.fweb` projects load faster (0.15 s instead of 0.26 to 0.73 s for a 74 MiB project), with each asset read once and lower peak memory, and FormWeb keeps answering while they load.
- Every new string is in all 26 languages.

## 0.19.4 · 2026-11-10

- Edit > Duplicate element (Mod+D) and a Duplicate item in the layers context menu copy an element with everything attached to it: motion, scripts, code sections, page components, variable bindings and translations, under new ids, in one undo step. Agents get the same through the new `node.duplicate` command.
- Duplicating a page now also copies its scripts, code sections and variable inputs and outputs, which were dropped before.
- Page components can have a light-theme poster. Exported sites show the poster that matches the visitor's theme on the first frame with no layout shift, the canvas shows it while the Design system dialog previews the light theme, and the components inspector can set or clear it. 20 of the 21 library components now have one; scripted-desktop and physics-deck also have corrected dark posters.
- Projects with large videos can be saved: a project too big for the 64 MiB `.fweb` file is saved as a zip `.fweb` (version 2) of up to 512 MiB, and File > Import opens both kinds. Smaller projects still save as before, so earlier FormWeb and FormPublisher releases open them.
- Send to FormPublisher finds FormPublisher on whatever port its desktop app started, through the `engine.json` file FormPublisher 0.1.4 writes in its data folder.
- Every new string is in all 26 languages.

## 0.19.3 · 2026-11-10

- File > Send to FormPublisher exports the open site and hands it to FormPublisher: live when it is running (the status line names the new revision), or into its inbox folder when it is not, with the site name beside the zip so it arrives as a revision of the same site. `FORMWEB_FORMPUBLISHER_URL` points it elsewhere.
- 14 new MCP tools (101 in all) let an agent set and remove motion, edit scene tracks, set variables, build and place page components, list and insert library sections, apply presets and starters, import HTML, start a new site and send it to FormPublisher. `./formweb library list|insert|preset|starter` does the same from a terminal, and the skills gain motion-director and library guides.
- Templates scope their variables per insert with `%%name%%`, so two copies of a calculator or a counter on one page keep their own values.
- The model accepts a wider vocabulary, each property with its own value check: logical margins, paddings, insets, sizes and borders, background-clip text, writing-mode, scrollbar styling, underline offset and decoration colour, overflow-wrap, hyphens, appearance, resize, fill and stroke; the `enterkeyhint`, `inputmode`, `spellcheck`, `autocomplete` and `focusable` attributes; and the svg `rect`, `circle`, `ellipse`, `line`, `polyline` and `polygon` tags.
- A scroll scene's offset can be `var()` or `calc()`, and presets can set page values per breakpoint: formai-studio pins scenes at `--bar-h`, 64 px on desktop and 97 px on phones, just under the header.
- The library templates now use these properties directly instead of their physical stand-ins; the header, the footer and the 25 sections that changed were shot again in all four runs (`docs/SECTION_PARITY.md`).
- Batches check extensions and synchronize once at their end: the product-site starter applies in 0.7 s instead of timing out, and the resulting documents are byte-identical.

## 0.19.2 · 2026-11-10

- A Library tab holds the 35 animated sections of the formai.studio sites as templates, plus their header and footer. Pick one, re-cast its tint, product name, copy and links, and insert it as one undo step; two copies stay independent. Each keeps the original's motion and interaction and binds its look to your tokens and text presets, so another preset or a theme change restyles it.
- 21 first-party page components (noise band, specks, starfield, physics deck, filmstrip, tile cut, knockout artboard, fog-wipe monitor, glyph lens, paint sim, orbit constellation, infinite board, page turn, tube travel, fold plan, forecast chart, scripted desktop, develop frame, token prompt, receipt printer, ruler slider) run the effects data alone cannot describe, each with a poster on the canvas, a reduced-motion end state and a fallback without WebGL.
- The formai.studio design system ships as a preset (tokens with light values, Inter, 16 text presets, product tints), and a product-site starter adds six pages built from the library. Inserting a section adds only what the site lacks; Apply preset sets everything.
- Import HTML turns a whole page into one code section, keeping its markup, styles and script and standing in for the formai kit's helpers.
- `./formweb library check` and `./formweb library build` validate the library and compile its components, so the server needs no Node to insert them; CI runs both. New routes under `/api/library` do everything the panel does.
- Exports keep tokens that only a page component or code section reads, page components receive their declared defaults, and a site whose only search runs from a motion action now ships the script that runs it.
- Every template was compared with its original in four runs at 8 steps; `docs/SECTION_PARITY.md` lists the results, with no console errors and layout shift under 0.001 throughout. The Library panel is in all 26 languages.

## 0.19.1 · 2026-11-10

- A Motion tab edits every kind of motion for the selected element: one-click presets (including the classic effects), reveals, scroll scenes, loops, counters, text motion, drag, pointer effects, accordions, tabs and filters, actions and scripts.
- Scroll scenes get a track editor with keyframes you drag on a rail, and a scrubber in the stage head that shows any point of a scene on the canvas without running it.
- Pages can calculate: variables, lookup tables and formulas bound to sliders, selects, checkboxes and text, with formatted outputs that show their final numbers on first paint.
- Scripts play conversations and demos from data: append from templates, stream and type text, move a stand-in pointer, press, scroll, focus and run any action, on submit, click, load or view.
- Site search: exported sites carry a search index, and a search input lists matching pages as you type and can start from the words of a `?from=` path.
- Page components run code in the page with typed props, a poster, scene progress, the theme and variables; code sections bring whole HTML, CSS and JavaScript pages in, opt-in per site. Live preview can no longer reach the editor's API, and svg images upload with strict checks.
- Every new string is in all 26 languages, and exported pages built with every new feature still report no console errors and no layout shift in dark and light, at 390 px, and under a 4x slower CPU and network.

## 0.19.0 · 2026-11-09

- Pages can move: scroll scenes pin a stage while the visitor scrolls and drive any element's opacity, transforms, filters, clip path and colours through keyframes, with smoothing, staggered children and markers that fire actions. Reveals, marquees, spins and keyframe loops, counters, split-text and typewriter reveals, and ghost-typed placeholders join them, all authored as data with `motion.set` and run by one small runtime in exported pages only. Reduced motion shows each scene's settled state.
- Visitors can drag and throw cards with inertia, flip them, tilt panels and follow a preview under the pointer; accordions, tabs with a sliding indicator and filter chips work from the keyboard; buttons can copy text, scroll to a point in a scene, play and pause video, open a picture in a lightbox and switch the theme.
- Sites get light and dark themes: a second value for any token, a theme the visitor picks or the system's, and elements shown in one theme only. The theme is set before the first frame, so nothing flashes.
- Video (MP4 and WebM up to 64 MiB) and WOFF2 fonts (up to 4 MiB) upload, preview, save in `.fweb` files and bundle into exports. Fonts are preloaded and use `font-display: optional` by default.
- The editor gains Transform 3D, Effects (blend modes, clip paths, gradient masks, filters), Media (video options, srcset, sizes, decoding, fetch priority), Themes and Fonts, a Video card in Insert, and a Dark and Light switch for the canvas. Every new string is in all 26 languages.
- Exported pages built with every new feature report no console errors and no layout shift in dark and light, at 390 px, and under a 4x slower CPU and network.

## 0.18.9 · 2026-11-04

- The README is rewritten to the Form family layout with real screenshots of the editor, and the old README icon svg is removed.

## 0.18.8 · 2026-11-03

- The unified v3 app icon replaces the old one in the desktop app, the splash and the README.
- The compiled app is named FormWeb: the bundle product name and the window title.
- The repo is now co-owned by gbarnai in CODEOWNERS.

## 0.18.7 · 2026-11-02

- On Linux and Windows the window no longer shifts a few pixels a moment after it opens: it now appears once its bundled Inter font has loaded, instead of opening in a fallback font and resizing every label when Inter arrives. macOS was never affected, since it uses its own system font.

## 0.18.6 · 2026-10-31

- The Windows desktop app no longer opens to a blank window on PCs where an installer set the `.js` file type to `text/plain` in the registry: the engine now serves scripts and stylesheets with their real types.

## 0.18.5 · 2026-10-26

- The built window now has a smoke test in CI: it loads under a slow CPU and network with no console error, no failed or refused request and no layout shift. It found one shift, on the splash screen: the logo jumped when the rest of the splash arrived, and it is now fixed in place.

## 0.18.4 · 2026-10-26

- The repository now has a test suite that runs in CI: the local guard (hosts, origins, cross-site requests, websocket), the MCP contract and its token, the `.fweb` round trip and the release profiles in `backend/tests`, and the document engine (validation, undo and redo, static compile and its links, breakpoint cascade, the JSON-lines protocol) in `native/crates/*/tests`. The CI frontend job also audits the packages.

## 0.18.3 · 2026-10-26

- The desktop app and the GPU renderer are built with their symbols kept, since macOS builds fail on a stripped binary.

## 0.18.2 · 2026-10-25

- A web page can no longer reach the engine through an image or a link: a request that carries no Origin is refused when the browser labels it Sec-Fetch-Site cross-site. Published sites, previews, the runtime, public form submits and the commerce webhook stay reachable from other sites, as before.

## 0.18.1 · 2026-10-24

- The copyright holder in LICENSE, NOTICE.md, LICENSES.md and the README is NodeAgentc, Inc.
- The Home screen credit and the title bar brand's tooltip read "by nodemode.ai".

## 0.18.0 · 2026-10-23

- Breakpoints keep working as before (per-breakpoint styles, editing per breakpoint, `breakpoint.set` and `breakpoint.remove`), but the editing canvas now always draws and edits the breakpoint picked from the list. Typing a width only resizes the frame, and a quiet hint appears when the width is outside the picked breakpoint's range. The stage header names the profile being edited.
- Preview is now the Live responsive preview: it shows the exported HTML and CSS at the typed width in a sandboxed frame, so the browser's own media queries switch the breakpoints as you change the width. It updates in place without flashing. Command ids are unchanged.
- Six labels added in every language.

## 0.17.3 · 2026-10-23

- The desktop app carries FormWeb's licence, LICENSES.md, NOTICE.md and the third-party licence texts. LICENSES.md now covers what the desktop build ships: the frozen engine (Python runtime, PyInstaller bootloader and the libraries inside its wheels), the shell's crates under other licences and the Linux AppImage's LGPL libraries.
- The macOS backend requirements are pinned to the same versions as the other platforms.

## 0.17.2 · 2026-10-23

- The vector tools carry FormWeb's own names in every language: Shape Crafter, Trace Image, Pin Warp, and the Fill Regions Bucket with Make, Expand and Release Fill Regions. Command ids and saved sites are unchanged.
- NOTICE.md and the README carry a trademark notice for the products FormWeb was researched against.

## 0.17.1 · 2026-10-22

- Releases are built by formcompiler (`nodemode-ai/formcompiler`), the release pipeline for every form* app. FormWeb's own GitHub Actions only run the checks, now also on `compile_vX.Y.Z` branches, and a desktop release, when FormWeb ships one, starts when such a branch is pushed and is published on formcompiler's release page as `formweb-vX.Y.Z`. No change to the app itself.

## 0.17.0 · 2026-10-22

- Settings opens the Form family's Preferences dialog: a floating rail of sections (General, Interface, Plugins) that folds to icons, foldable section cards in one scrolling pane, and Reset All Preferences in General.

## 0.16.0 · 2026-10-22

- A Home screen like the rest of the Form family: navigation (Start, Recent, Projects), a greeting, a start card for websites, the starter sites as tiles, and your projects with filter, sort and grid or list view. It shows at launch (Settings can turn that off) and the brand mark returns to it.

## 0.15.0 · 2026-10-22

- macOS: the editor window uses the overlay title bar with the traffic lights centred in a 38 px row, and the top bar leaves them room and drags the window.
- macOS: the menus also live in the system menu bar (About, Settings on Cmd+comma, Hide, Quit, then File to Help); View > Menus in Window keeps them in the window instead. Undo and Redo work inside text fields from the menu bar.
- All 28 Form family themes, so a theme picked in another form app shows the same here.

## 0.14.0 · 2026-10-22

- The desktop app starts like the rest of the Form family: a rounded splash card with the FormWeb icon, Starting FormWeb and a loading bar while the service starts; the editor window stays hidden until its page has painted and then appears whole, at least 2.6 s after launch.
- The owner's icon is used everywhere: the master render is kept as `assets/formweb_icon_macos.png`, and the editor's title-bar mark is now that icon instead of a simplified drawing.

## 0.13.3 · 2026-10-20

- New app icon in the Form family style: a page being edited on the dark family tile, with a hero block and two cards in the family spectrum, the hero selected with corner handles and a floating pointer. The title bar mark matches.

## 0.13.2 · 2026-10-17

- Scroll and pointer effects, like Figma Sites and Webflow: pick an element and, in the Content panel, choose Parallax, Scroll transform, Mouse parallax, Marquee or Cursor follow, with a strength. They play in Preview and on your published site; visitors who ask their device for reduced motion see the page without movement.

## 0.13.1 · 2026-10-17

- Start a whole site from a template: New site now has a Start from choice with a Business site, a Product launch and a Portfolio. Each arrives with its pages and sections already linked in the navigation, ready to edit, and one undo takes you back to an empty site.

## 0.13.0 · 2026-10-17

- Build pages faster with ready-made sections, like Framer, Webflow and Figma offer: the Insert panel now has a navigation bar, hero, feature grid, testimonial, pricing, FAQ, call to action, contact form and footer. Each goes in after the section you have selected, and you edit it like anything else.
- Starter pages add a whole landing, pricing or contact page with its sections in one click. Every insert can be undone in one step.

## 0.12.9 · 2026-10-17

- Add your own code to the page head and body, the way Framer and Webflow do: Page settings has a new Custom code section for the whole site or just the open page, with slots for the head, the start of the body and the end of the body. Use it for analytics tags, fonts or a chat widget. The code goes into exported and published pages exactly as typed and does not run on the canvas.

## 0.12.8 · 2026-10-17

- The comparison page has ten new rows drawn from Framer's, Figma's, Webflow's and Canva's own documentation: custom head and body code, site search, page transitions, light and dark modes that follow the device, editor plugins, fixed and sticky positioning, scheduled publishing, scroll and pointer effects, prebuilt sections and templates, and importing designs from another tool.
- FormWeb is Full on fixed and sticky positioning and Partial on design import (SVG, with frame clipping lost); the other eight are not built yet and are now listed as targets. 121 of 144.

## 0.12.7 · 2026-10-17

- Variable-width strokes now work on closed shapes such as rectangles and ellipses, from the width presets and with the Width tool.
- Clicking a variable-width stroke now selects its path rather than the generated outline.

## 0.12.6 · 2026-10-17

- Symbols now work across your whole site, like components in Figma: place an instance of a symbol from any page, edit the master, and every instance updates, both in the editor and on the exported site.

## 0.12.5 · 2026-10-17

- Symbols can now be reused across all the drawings on a page. Place an instance of a symbol from any drawing on the page, and it follows edits to the master like any other instance.
- A drawing whose symbol is still used elsewhere can't be deleted until those instances are detached, so nothing breaks silently.

## 0.12.4 · 2026-10-17

- Export a drawing as a vector PDF: tick PDF in Export for Screens to get a one-page PDF with the shapes, masks, transparency and text as editable vectors. Text is set in Helvetica, gradients use their first colour, and images and filters are left out.
- Older comparison pages now live in the planning sidecar; the repository keeps only the current one.

## 0.12.3 · 2026-10-17

- Snapping matches Figma: shapes now snap to the corners and edge middles of other objects as well as their centres and points.
- Hold Control while drawing or dragging to turn snapping off for that moment.
- New Snap to pixel grid setting (off by default) puts shapes on whole pixels.

## 0.12.2 · 2026-10-17

- Use as mask, the way Figma does it: select two or more paths and the bottom one masks the paths above it. Run it again on masked content to remove the mask.
- Clipping masks and Shape Builder now count as Full against Figma. Shape Builder's Alt-click to remove a region was checked in the browser, alongside drag to merge.

## 0.12.1 · 2026-10-17

- The comparison page now measures FormWeb against Framer, Figma, Webflow and Canva only. Figma was graded on all 134 rows from official Figma pages (38 Full, 60 Partial, 36 None, with the pages cited), and Adobe Express was removed. FormWeb's own grades are unchanged.

## 0.12.0 · 2026-10-17

- Type straight into area type on the canvas: double-click area type with the Selection or Direct Selection tool to open a text box over its shape. Press Esc or click elsewhere and the words are laid out in the shape again, as one undo step. The text box wraps to the shape's bounding box while you type; the words follow the shape's outline once they are laid out.

## 0.11.9 · 2026-10-17

- Holding Shift with the Live Paint Bucket over a Live Paint group now highlights the edge a click would stroke.
- Expand Live Paint on a group with painted edges now leaves just the filled faces and stroked edges, without the original paths hiding underneath.
- The "Click a closed shape to continue the text" notice for threaded text now goes away once you link a shape or press Esc.

## 0.11.8 · 2026-10-17

- Live Paint edges: with a Live Paint group selected, Shift-click with the Live Paint Bucket strokes just the edge you click (the part of a path between two crossings) with the current stroke colour and weight, and painting with no stroke removes that edge. Edge colours stay put when you move or reshape the paths, and Release Live Paint gives the paths their own strokes back.

## 0.11.7 · 2026-10-17

- Release selection from thread takes the selected shapes out of a text thread. The shapes stay, their text goes, and the words carry on into the next shape. Releasing the first shape makes the next one the start of the thread.

## 0.11.6 · 2026-10-17

- Threaded text has in and out ports: select area type to see a port at the top left and bottom right of each of its shapes, joined by thread lines, with a red plus on the last out port when words are left over. Click an out port, then click a closed shape to continue the text in it, or an empty spot to add a copy of the shape there; Esc cancels. Double-click a port to break the thread there.
- Remove Threading ends a thread without moving any words: each shape keeps the text it shows as its own area type, and the last one keeps any overflow.

## 0.11.5 · 2026-10-17

- Live Paint is now live: Make Live Paint (or a click with the Live Paint Bucket on selected paths) turns overlapping paths into a Live Paint group. Each area keeps its color when you move or reshape the paths; an area that disappears loses its color. Expand Live Paint turns the areas into ordinary shapes, and Release Live Paint gives the paths their original fills back.

## 0.11.4 · 2026-10-17

- Threaded text: select area type and one or more other closed shapes, then choose Thread text. Words that do not fit flow on into the next shape, and everything reflows when a shape changes. A small boxed plus marks text that still does not fit. Release threaded text pulls all the words back into the first shape.

## 0.11.3 · 2026-10-17

- Edit area type: select area type (or the shape holding it) and choose Edit area type to change the words, font, size, alignment or columns. The text is laid out again in the same shape, and one undo puts it back.

## 0.11.2 · 2026-10-17

- Area type now reflows: move or reshape the shape that holds the text and the lines are laid out again to fit, in the same undo step. Area type placed before this version stays as it was placed.

## 0.11.1 · 2026-10-17

- Patterns: Pattern Options now offers Hex by Column and Hex by Row, which stagger the tiles in a honeycomb layout.
- Edit pattern: select a shape filled with a pattern and choose Edit pattern to change its tile type, spacing or size; every shape using that pattern updates.
- Fix: patterns and gradients no longer appear as rows in the Layers list, so making a pattern no longer nudges the list.

## 0.11.0 · 2026-10-17

- Artboards panel: Move up and Move down change the order of artboards, which is also the order used when exporting all artboards.
- Rearrange All Artboards: lay out the artboards on the page as a grid by row or by column, or in a single row or column, with the spacing you choose, left to right or right to left. One undo puts them back.

## 0.10.9 · 2026-10-17

- Artboards: with the Artboard tool, hold Shift and drag a box on empty canvas to select every artboard it touches. Arrow keys move the selected artboards by 1 px, or 10 px with Shift; a burst of key presses is one undo step.

## 0.10.8 · 2026-10-17

- Move several artboards at once: with the Artboard tool, Shift-click artboards to select more than one (Shift-click a selected one to drop it), then drag any of them to move them all together. One undo puts them all back.

## 0.10.7 · 2026-10-17

- Freeform gradients, Lines mode: in the Gradient panel set Freeform draw to Lines, then click inside the shape to place stops joined by a line. The colors flow along the line. Press Escape to finish a line; the next click starts a new one. Points mode places single stops as before.

## 0.10.6 · 2026-10-17

- Freeform gradients: choose Freeform in the Gradient panel to color a shape with stops you place anywhere inside it. With the Gradient tool (G), drag a stop to move it, drag its ring to change how far its color spreads, click inside the shape to add a stop, and drag a stop outside or press Backspace to remove it. Double-click a stop to change its color and spread. Lines mode is not available yet.
- Fix: making a live object that creates its group in the same step is now a single undo step.

## 0.10.5 · 2026-10-17

- Artboard handles: hold Shift to keep the artboard's proportions and Alt (Option on Mac) to resize it from its center. The artwork still stays where it is.

## 0.10.4 · 2026-10-17

- Resize artboards on the canvas: with the Artboard tool, the selected artboard shows eight handles; drag any of them to resize from that edge or corner. The artwork inside stays exactly where it is.

## 0.10.3 · 2026-10-16

- Artboard tool (Shift+O): drag on an empty part of the page to draw a new artboard exactly there, or drag an artboard to move it. Click an artboard to select it. Resize it from Window > Artboards.

## 0.10.2 · 2026-10-16

- Export for Screens can export every artboard on the page in one go: each one is saved under its own name, with an optional prefix, in every format and scale you picked.
- All new labels are translated into the 26 interface languages.

## 0.10.1 · 2026-10-16

- Artboards (Window > Artboards): every vector drawing on every page is listed as an artboard. Rename it, select it, duplicate it with everything inside, fit it to its artwork, resize it to a preset or your own size, delete it, or add a new one.
- All new labels are translated into the 26 interface languages.
- Version note: the previous release should have been 0.10.0 (a minor bump after 0.9.9) but shipped as 0.9.10; numbering continues here at 0.10.1.

## 0.9.10 · 2026-10-16

- Layers stays calm: the lines of area type, the tiles of a pattern and the stops of a gradient sit under one row instead of filling the list, so placing text or a pattern no longer pushes the rows you are looking at.

## 0.9.9 · 2026-10-16

- Area type (Vector > Area type...): pour text into any closed shape. Lines follow the shape's outline, paragraphs follow your line breaks, text can run in several columns, and you are told how many words did not fit. The text is laid out once; run it again after changing the shape.
- All new labels are translated into the 26 interface languages.

## 0.9.8 · 2026-10-16

- Security: inside a vector drawing, only symbol instances and text on a path may link to another element. Gradients, patterns, paths and drawings can no longer carry a link to an outside file, even when added by an agent through the API.

## 0.9.7 · 2026-10-16

- Make pattern (Vector > Make pattern...): select the artwork for one tile, then the shape to fill, and pick Grid, Brick by Row or Brick by Column, the brick offset, and either Size Tile to Art with spacing or an exact tile size. The shape fills with the repeating pattern in the canvas and in exported sites; the original artwork stays.
- All new labels are translated into the 26 interface languages.

## 0.9.6 · 2026-10-16

- Typography gains OpenType features: Capitals (small caps, petite caps, titling caps), Kerning, Ligatures and Numbers (old-style or lining, tabular or proportional, fractions, ordinals, slashed zero). They show in the canvas and in exported sites, per breakpoint like any other style.
- All new labels are translated into the 26 interface languages.

## 0.9.5 · 2026-10-16

- Live Paint Bucket: select two or more overlapping shapes, then click any area where they overlap (or any part of one) to fill just that area with the current fill color; Shift-click colors a shape's outline. Painted areas are separate shapes placed under the originals and do not follow later edits to them.
- All new labels are translated into the 26 interface languages.

## 0.9.4 · 2026-10-16

- Blob Brush (Shift+B): paint filled shapes that merge into overlapping shapes of the same color with no outline. Double-click the canvas for Size, Fidelity, Keep Selected and Merge Only with Selection; [ and ] change the size.
- All new labels are translated into the 26 interface languages.

## 0.9.3 · 2026-10-16

- Tweak (Vector > Tweak...): randomly push anchor points and their control points inward and outward, by a relative or absolute amount, with a seed and a live preview.
- Attach objects to path: select some shapes, then a path last, and they line up along it from start to end, evenly spaced and turned to follow its direction. The placement is applied once and does not follow later path edits.
- All new labels are translated into the 26 interface languages.

## 0.9.2 · 2026-10-16

- Export for Screens (Ctrl+Alt+E): export the drawing, or only the selected shapes, as PNG, JPG, WebP and clean SVG at 0.5x to 4x, with a suffix per scale and background choices.
- Recolor Artwork: change every color in the selection at once, with harmony rules, Reduce colors, Randomize and a live preview.
- Graphic Styles: save a shape's look as a named style and apply it to others; styles are saved with the site.
- Puppet Warp, the Reshape tool and Global Edit (edit one shape and every identical copy follows).
- Guides are now saved with the drawing, survive a reload and can be undone.
- All new labels are translated into the 26 interface languages.

## 0.9.1 · 2026-10-16

- New selection tools for vector editing: Lasso (Q), Magic Wand (Y) with tolerances, Select Same (fill, stroke, weight, opacity) and Select Inverse, Eyedropper (I), and Transform Again (Ctrl+D) to repeat the last move, rotate, scale, reflect or shear.
- New path commands: Add Anchor Points, Remove Anchor Points, Divide Objects Below, Split Into Grid and Clean Up. New drawing tools: Pencil (N), which can continue an open path, and the Rectangular Grid and Polar Grid tools; the Arc tool now honors Shift.
- Rulers (Ctrl+R) with guides you drag out of them, guide snapping, Make and Release Guides, a document grid with Snap to Grid, and Outline mode (Ctrl+Y). Guides are not yet saved with the project. Ctrl+Y no longer means Redo while vector editing; Ctrl+Shift+Z still does.
- All new labels are translated into the 26 interface languages.

## 0.9.0 · 2026-10-16

- The editor is translated nearly everywhere: the stock and team libraries, brand kit, Agent Connect, the AI writer, Studio, multi-step forms, the inspector's reset and style tooltips, and the long explanations in the main dialogs. Names, links, sample content and CSS values stay as they are.

## 0.8.9 · 2026-10-16

- Fixed: pressing again right after drawing a shape could start a stray browser drag that made the page stop responding to the mouse.
- Labels with numbers ("2 anchors selected", "All 6 corners of the selection") are translated, with the right singular or plural, and tooltips and labels now switch language immediately instead of after a reload.

## 0.8.8 · 2026-10-16

- Make with Mesh: an envelope with a grid of points you drag to bend the shapes inside; a warp envelope can be turned into a mesh.
- Alt-click Divide or Outline to keep them live, and apply any Pathfinder operation to a group as a live effect that you can remove or expand.
- Fixed: the hidden source shapes of live compound shapes were still visible in the editor.
- More of the vector panels are translated: tool tooltips with shortcuts, Pathfinder tooltips, width notes and several missed labels.

## 0.8.7 · 2026-10-16

- Pathfinder Options: precision, removing redundant points, and dropping unpainted pieces after Divide and Outline. Alt-click a shape mode to keep a live compound shape you can still edit, then Expand or Release it.
- Envelopes: 15 warp styles (arc, arch, bulge, shell, flag, wave, fish, rise, fisheye, inflate, squeeze, twist and more) with bend and distortion, kept live; or fit shapes inside a top shape.
- Clipping masks: Edit Contents and Edit Clipping Path.
- The desktop app now has Windows and macOS icons; without them the Windows build could not finish.

## 0.8.6 · 2026-10-16

- Dashed and arrowed strokes follow the stroke's inside or outside alignment, variable-width strokes can be dashed, and a dash that crosses a corner is one continuous dash with the line's corner join.
- Fixed: the Brush Options dialog could freeze the page when turning Preview off or closing it after making no change.
- Steadier panels: Symbols and Brushes lists no longer blink after Break link, the Image Trace source list no longer refills, and Chat updates its streaming text in place.

## 0.8.5 · 2026-10-16

- Stroke options: dashed lines with up to three dash and gap pairs, either at exact lengths or adjusted so a dash sits on every corner and path end; arrowheads at either end (arrow, triangles, circle, square, bar) with scale and a choice of tip beyond or at the end of the path. They follow the path as you edit it and can be removed or expanded.
- Average: choose Horizontal, Vertical or Both; Join always draws a straight segment between two end points.
- Quick changes in the stroke options no longer cancel each other out.
- The repository download is smaller (the git history is packed).

## 0.8.4 · 2026-10-16

- Bristle brush: painterly strokes made of many soft bristles, with shape, size, length, density, thickness, opacity and stiffness.
- Brush Options: each brush opens a settings dialog with a live preview; OK updates every path that uses the brush at once, Cancel puts everything back.
- Steadier editor: checked on a slowed-down machine and network, seven places where the layout shifted are fixed (the terminal status, field labels, two dialog notes, Agent Connect on first open, the viewport readout and the compiled preview).
- Agents can send up to 4000 changes in one apply_commands call, the same as the editor.

## 0.8.3 · 2026-10-16

- Paintbrush (B): draw freehand with your brush; a Fidelity setting controls how smooth the line is. Without a brush it draws a plain stroke.
- Blends that follow a path now put their first and last shapes on the path's ends, and removing the path puts them back.
- Dense brushes and long blends are no longer cut off at 150 shapes.
- The brush, symbol and blend messages from 0.8.2 are now translated in every language.

## 0.8.2 · 2026-10-16

- Image Trace: turn an uploaded picture into vector shapes, in black and white, grayscale or color, with controls for detail, corners and noise (Mod+Alt+Shift+T).
- Brushes: calligraphic, scatter, art and pattern brushes made from your own shapes, applied to a path and kept live as you edit it; remove or expand them at any time.
- Symbols can be scaled and rotated on the canvas or by number, and blends take up to 16 shapes and can follow a path.
- CMS: a New item button, and saving no longer overwrites the previous item.
- Multi-step forms: each step can have its own title.
- The vector messages from 0.8.1 are now translated in every language.

## 0.8.1 · 2026-10-16

- Claude Code and Chat were driven end to end against a real Claude Code install: Chat streamed answers, called formweb's tools, changed the page and remembered the conversation; the Claude button started Claude Code with formweb's tools and made an edit.
- The desktop app was launched from its package with no source folder present, and closing it now stops its engine (closing the window used to leave it running).
- Every Creative tools tab was used in the real editor and checked in the published site. Fixes: duplicated collection pages get a working address, superscript, subscript and baseline shift work on words inside a paragraph, form fields can set a custom pattern and Required, and nested collection lists can show only the items that belong to their parent.
- Vector: blends and repeats stay live and update when their sources change, Free Transform adds shear, perspective and free distort, and a Symbols panel defines, places and edits reusable symbols.

## 0.8.0 · 2026-10-16

Illustrator behaviors checked against Adobe sources, then built and driven in the editor. Parity: 99 of 112 (rows regraded from browser verification at 0.7.1; four rows added for the agent dock, desktop build, command registry and languages).

- Corners: Relative rounding now follows the corner angle (the value is the radius a right angle gets), and Alt-click on a corner widget cycles Round, Inverted Round and Chamfer.
- Pathfinder: the tenth operation, Outline, and every result now takes Illustrator's paint (front object for Unite, Intersect and Exclude, rear for Minus Front; Trim, Merge and Crop drop strokes; Merge joins same-fill pieces).
- Shape Builder: the merged shape takes the style of the object where you start dragging, Alt-drag subtracts every region it crosses, gap detection (3, 6, 12 pt or custom) treats nearly closed open paths as closed, and Click stroke splits the path. Shift+M picks the tool.
- Width tool: each width point has two sides (Alt-drag changes one), double-click opens Side 1, Side 2 and Total, and profiles can be saved, reused and flipped.
- Type on a path: Rainbow, Skew, 3D Ribbon, Stair Step and Gravity, align to ascender, descender, center or baseline, spacing, and flip by dragging the bracket across the path.
- Opacity masks: Clip and Invert Mask, switchable after the mask is made.
- Join and average in one step with Mod+Alt+Shift+K; Average works across paths; the Pen snaps handles to 45 degrees with Shift and Alt-click retracts an anchor's handles.

## 0.7.1 · 2026-10-16

- Gradients, clipping and opacity masks, inside strokes and type on a path now show in the editor canvas (their SVG tags were being rendered as plain boxes).
- Shortcuts work after clicking the canvas: undo, delete, search and the vector tool keys no longer need focus moved out of the page first. Typing inside inline text editing is unaffected.
- Vector fixes from a full pass over every tool: width presets apply, straight lines honour every width point, Free Transform scales once, and Join works across two paths. Join is Mod+Alt+Shift+J and Average Mod+Alt+Shift+A.
- Docs: README highlights, the agent quick start (new commands and window tools), wiki pages and a Languages page.

## 0.7.0 · 2026-10-16

- The editor speaks 26 languages, English by default: Settings > Editor language switches the whole interface live, with no reload, and remembers the choice. Your content, layer names and page names are never translated.
- One command registry: every menu item, toolbar button and shortcut runs through it, shortcuts are real bindings (Mod+K search, Mod+Z, Mod+Shift+Z, Mod+S and more), typing in fields never triggers one, and agents can list and run editor commands (MCP `list_ui_commands`, `run_ui_command`) with an Allow or Deny prompt for risky ones.
- Vector: gradients on fill and stroke, clipping and opacity masks, stroke align, knife and eraser, groups with isolation mode, Shape Builder, the width tool, align and distribute, smart guides and snapping, transform tools, blend, repeat, warp and distort effects, and type on a path.
- Creative tools: published-site filters and sorting for collection lists, a collection slider, tables, collection folders and ordering, real superscript and subscript with baseline shift, default layout gap and padding, multi-step forms with file uploads and validation, and eight new pre-publish accessibility checks.
- Fixes: the agent dock reconnects its sessions after a reload, and the tag field shows svg and path elements read-only.

## 0.6.0 · 2026-10-16

- Live agent dock: real terminal sessions in tabs, a Claude button that starts your Claude Code already connected to this editor's MCP tools, and a Chat pane that streams Claude's answers and tool calls. Mod+J toggles the dock, Shift+Mod+J opens Claude Code, Alt+Mod+J opens Chat. Works without first turning on Agents; outside MCP clients still need the switch.
- Vector editing: a Vector menu, tool palette and panel. Draw with Pen and Curvature or the rectangle, ellipse, polygon, star, line, arc and spiral tools; edit anchors with Direct Selection; round any single anchor with its corner widget (round, inverted round or chamfer, absolute or relative, clamped to the neighbours); combine shapes with all nine Pathfinder operations; set stroke caps, joins, miter and dashes; join, average, simplify, offset, outline stroke and compound paths; import and export SVG.
- `./build_app` (and `build_app.bat`) builds the desktop app in one command. The app now carries its own frozen engine and runs without the FormWeb folder; user data lives in `~/FormWeb`.

## 0.5.8 · 2026-10-13

- `./formweb desktop build` packages the desktop shell from the repo root (`setup/desktop_build`: `./formweb build`, then the Tauri build). The packaged app still runs the FormWeb folder it finds, so the folder stays on the machine.

## 0.5.7 · 2026-10-12

Gap closing: FW-069 prompt-to-site and FW-070 AI copy, both Partial to Full (76.5 to 77.5 of 79). A real local model ran through formvis's language-model setting: SmolLM2-135M-Instruct, served by llama.cpp's OpenAI-compatible server on the build machine. It is the smallest instruct model there is, so its writing is weak; the point is that the whole path works with a real model, and FormWeb now copes with small ones.

- Works with small local models: when a model cannot write a whole outline, Generate pages switches to guided drafting. FormWeb lays out the pages and asks the model one short question per text, and says so above the outline, with a reminder to check names, prices and facts.
- Write with AI tells you when the model gave the text (or the request) back unchanged, keeps headings and labels to one line, drops preambles such as "Here is a version:", and stops paragraphs near the length asked for.
- References: Add reference in Generate pages takes a PDF (its text is given to the model as facts) or an image (its main colours are offered for the buttons, after any brand kit). Files are read, not stored.
- Revise: after drafting, ask for a change in words ("add a pricing section"). If the model cannot do it, the outline stays as it was.
- Buttons in a generated outline follow a page whose address had to change, and never point at a page that does not exist.
- Faster editor while a model writes: model calls no longer hold up other requests (measured at about 80 ms for a site read during a guided draft).
- Agents: `generate_site` gains `reference` (an image asset, or a PDF or image as base64) and revising through `plan` with `plan` and `instruction`. `write_copy` returns `unchanged`.
- Fixed before release, from an independent review: odd colour values from agents no longer cause a server error, very large images are refused before reading, `/contact#form` style links follow a moved page, removing a reference image also removes its colours from a revision, and adding the same file twice no longer leaves a Remove button that does nothing.
- Dependencies: pypdf 6.20.0 (BSD-3-Clause, no dependencies) for reading PDFs. The macOS requirements now include Pillow, which background removal has needed since 0.5.3, and pypdf.
- Not yet: AI image generation (FW-071) still needs a real image generator run. Hosting and payments (FW-050, FW-063) still need live accounts.

## 0.5.6 · 2026-10-12

Gap work: FW-069 prompt-to-site and FW-070 AI copy, both None to Partial (75.5 to 76.5 of 79). Both rows are Partial, not Full, because no real language model could be run from the build machine: see "Not yet".

- One model setting for the family: FormWeb writes with the language model set in formvis (any OpenAI-compatible service: Ollama or LM Studio on your computer, or a hosted one with your key). FormWeb never sees the key.
- Content > Write with AI, under an element's text: rewrite, shorten, lengthen, change tone (friendly, professional, confident, playful, calm) or write new text from a short brief. The suggestion appears beside the current text and can be edited; nothing changes until Accept, which is one undo step. Changing the selection drops the suggestion.
- Page > Generate pages from a description: describe the site and choose 1 to 4 pages. FormWeb drafts an outline (pages, sections, items) for you to review, then builds it in one undo step: a header with navigation, hero, features, about, testimonials, FAQ, call to action and contact form sections, one `h1` per page, mobile layouts, SEO titles and descriptions, and button colours taken from your brand kit or team library when they are readable. Existing pages are never changed and slugs never collide.
- Engine: `page.add` accepts an optional `id` and `root`, so one batch can create a page and fill it.
- Agents: `write_copy` (returns a suggestion and the command to apply it) and `generate_site` (`plan`, then `build`) (83 tools).
- Model output is never trusted: outlines are clamped to the limits above, unknown section kinds become text, links other than `/`, `#` or http(s) become `#`, and text stays text in the export.
- Not yet: no real model ran on the build machine, which cannot reach model downloads or hosted APIs. formvis's real chat endpoint and the whole FormWeb side ran, with a stand-in model answering. Reference images or PDFs as input and chat-based edits of a generated site are not done. One run with a real model on your computer is what moves these rows to Full.

## 0.5.5 · 2026-10-12

Gap work: FW-071 AI image generation, None to Partial (75.0 to 75.5 of 79). The row is Partial, not Full, because no real image model or provider could be run from the build machine: see "Not yet".

- Insert > Stock icons and photos > Generate with formvis. Describe the picture, then choose the generator, size and number of pictures (1 to 4). formvis runs whatever generator you have set up there: its local models (Krea 2, FLUX.2 [klein], ONNX diffusion; no key) or a cloud provider with your own key (fal, OpenAI, Google, Black Forest Labs, Ideogram). FormWeb never sees the key.
- Results are saved to the project with their provenance: prompt, generator, licence note and time. They appear in the export's `CREDITS.txt`. Inserting uses the prompt as starting alt text and the picture's real size.
- Edit > Edit in formvis opens an image in the formvis window (formvis asks once to allow outside agents). Edit > Update from formvis brings the edited picture back as one undo step and keeps its credit, stamped "edited in formvis".
- Agents: `generate_image` (waits up to 90 s, else returns a job to collect later) and `edit_in_formvis` (81 tools).
- Fixed while testing: the Generate tab and the Generate button shared one command id, so clicking the button was routed to the tab.
- Not yet: no real model ran on the build machine, which cannot reach model downloads or provider APIs. formvis's job pipeline, the FormWeb side and the formvis round trip all ran for real, with a stand-in provider drawing the pictures. One generation with a real generator on your computer is what moves this row to Full.

## 0.5.4 · 2026-10-12

Gap closing: FW-073 built-in stock library, None to Full (74.0 to 75.0 of 79).

- Insert > Stock icons and photos opens the stock library.
- Icons: 1,877 Lucide icons are bundled, searchable by name and tag. Pick a colour, stroke and size, and the icon is inserted as a crisp SVG image. Icons are ISC licensed (88 derived from Feather are MIT). Double-click inserts.
- Photos from formlit: search your own formlit library on this computer by name, keyword or creator. Each photo shows its creator and copyright status, plus usage terms when you select it. Inserting saves formlit's developed preview with that credit and uses formlit's alt text.
- Credits: every stock asset keeps its credit (source, creator, copyright, licence, usage terms, links). `.fweb` files carry the credits, and each export now includes `CREDITS.txt` (with the Lucide licence text when icons are used). Uploading the same picture again keeps its credit.
- SVG safety: SVG images can only come from the bundled icons or `.fweb` files. Each one is rebuilt from an allowlist (no scripts, styles, links, external references or schemes) and served with a sandboxing policy. Uploads remain raster only.
- Agents: `search_stock`, `insert_stock` (79 tools). `FORMWEB_FORMLIT_URL` points at formlit if it is not on its default port.
- Not yet: an internet stock photo service (none is configured; only formlit photos are available today).

## 0.5.3 · 2026-10-11

Gap closing: FW-072 background removal and image cleanup, None to Full (73.0 to 74.0 of 79).

- Edit > Remove background (also a button under the image's HTML attributes): formvis, the family's image editor running on your computer, finds the subject. U2-Net is used when installed, otherwise GrabCut. You see the cut-out over a checkerboard with the removed part faintly visible.
- Erase and Restore brushes touch up the result (E and R switch modes, [ and ] change the brush size). Soft edge feathers the outline.
- Apply cut-out saves a new transparent PNG and points the image at it as one undo step. The original picture is kept, so Undo or Restore original brings it back at any time. Exported pages show only the cut-out; the original travels only with the editable site file in the export.
- When formvis is not running, the dialog says how to start it and the rest of the editor is unaffected. Its address can be changed with `FORMWEB_FORMVIS_URL`.
- Agents: `remove_background` `{node, method?, feather?}`, with `action: "restore"` or `"status"` (77 tools).
- New dependency: Pillow 12.3.0 (MIT-CMU), the same version formvis uses, for compositing.
- Not yet: the brushes are in the editor only, not available to agents. Removal needs formvis on the same computer, and FormWeb has no engine of its own.

## 0.5.2 · 2026-10-11

Gap closing: FW-075 shared team asset library, None to Full (72.0 to 73.0 of 79).

- Window > Team libraries (rail folder icon): named libraries of colors, fonts and graphics kept by the FormWeb service, outside any one site, so all your projects can share them. Start one from this site's brand kit or empty; add, change or remove colors, fonts and graphics.
- Link a library to a site to add its colors and fonts as `var(--lib-[library]-[name])` tokens in one undo step. When the library changes, the site shows "Update available"; Sync brings the new values in and every element using them follows. Unlink and delete never remove tokens from a site, so nothing that uses them changes. Graphics insert as images.
- Sharing: whoever creates a library owns it and can share it with people who have a project role, as "Can use" (link and sync) or "Can edit" (change it). Only the owner shares or deletes. Shared graphics become visible to the people they are shared with.
- Brand check and the brand restriction count team library tokens as on-brand, and the Design inspector's color and font suggestions list them as Team color and Team font.
- Agents: `list_team_libraries`, `save_team_library`, `share_team_library`, `use_team_library` (76 tools); a stale library revision returns a `next` step to re-read it. REST: `/api/team-libraries`.
- Not yet: filling a library from a formlit export, and deleting a library item does not remove its token from linked sites.

## 0.5.1 · 2026-10-11

Gap closing: FW-067 brand restrictions and brand check, None to Full, and FW-076 embeds, Partial to Full (70.5 to 72.0 of 79).

- Brand check (Window > Brand kit): Check page lists off-brand colors, fonts and logos on the current page, each with the nearest brand token or logo. Fix changes one; Fix all changes every issue as one undo step. Click an issue to select the element.
- Only allow brand colors and fonts: color, background, border and font fields accept only brand tokens or neutral values (inherit, transparent and the like) and say why when they refuse. Only someone who can manage the project may turn it on or off. Agents: `brand_check` (72 tools) returns the same issues with ready fixes.
- Embeds: "Load embeds only when visitors click" (Site settings) shows a placeholder with a Load button and an "Open on YouTube" (or Vimeo, Loom and so on) link, so nothing is requested from the other site until a visitor asks. One embed can opt in alone with `data-fw-embed-load="click"`.
- X posts: paste an x.com or twitter.com post link into Insert > Embed media. It always loads on click, through X's own widget script.
- Not yet: Instagram and TikTok posts; agent and CLI edits are checked by `brand_check` rather than blocked by the restriction.

## 0.5.0 · 2026-10-11

Phase 9 of 9: the family GPU renderer and the desktop shell. No parity row moved this release (70.5 of 79).

- `native/crates/formweb-render` (wgpu 30, own workspace): area-averaged thumbnails of page captures, a minimap with the viewport outlined, and pixel diffs between two release captures (heatmap plus changed share). A memory budget and the adapter's texture limit decide GPU or CPU; the CPU path gives the same pixels. `./formweb render probe | thumb | diff` prints JSON.
- `src-tauri`: a Tauri 2 desktop window around the editor, matching formvis and formlit. It opens the running service or starts `./formweb serve` itself, stops it when the window closes, and exposes the renderer to the page. `./formweb desktop` runs it from the FormWeb folder.
- Not yet: a frozen backend sidecar for packaged installers, platform icons (.icns, .ico), and editor panels that use thumbnails and release diffs.

## 0.4.2 · 2026-10-11

Phase 8 of 9: agent skills. Plus FW-066 brand kit, None to Full (69.5 to 70.5 of 79).

- `formweb-harness` now has fifteen specialists: new platform map, site and pages, style and tokens, components, localization, SEO and accessibility auditor, forms operator, branch and review, and Agent Connect and terminal; content steward became the CMS steward. Every specialist opens with a table mapping each MCP tool to the same action through `./formweb run` or REST and in the editor menus (with command ids). Three new evaluations: acting on the editor selection, a protected members area, and a deletion waiting for approval.
- New `formweb-editing` skill for plain-language single edits through MCP, and `formweb-skillset` for changing FormWeb's source, matching formvis and formlit. CLAUDE.md and AGENTS.md route to all three.
- Brand kit (Window > Brand kit, rail): brand colors and fonts saved as design tokens in the site, a logo and a dark-background logo you can insert anywhere, and the Design inspector's color and font fields now suggest brand values. Agents read it from `formweb://tokens`.

## 0.4.1 · 2026-10-11

Phase 7 of 9: MCP that reads cleanly for Claude Code, Codex and Cursor. Plus FW-078 page passwords, None to Full (68.5 to 69.5 of 79).

- Seven domain tools (`edit_nodes`, `edit_pages`, `edit_styles`, `edit_components`, `edit_cms`, `edit_locales`, `edit_site`) generated from the engine catalogue, each listing its commands' parameters. Every tool has a title and a description that starts with what it does and when to use it.
- Edits return a compact summary (about 0.6 KB instead of about 18 KB for the sample site); `detail: "site"` or `get_site` `detail: "full"` when the whole document is needed. Errors include a `next` step.
- New resources: `formweb://site/tree`, `formweb://selection` (what you have selected in the editor), `formweb://tokens`, `formweb://audit`. Five prompts: build_page, edit_copy, responsive_review, publish_site, recover_session.
- Server instructions rewritten to fit Claude Code's 2,048-character limit; the stdio proxy used by all three clients now forwards them and the prompts, and waits long enough for approvals. Client config formats re-checked against each client's current documentation (no change needed).
- Page passwords: Page settings > Password protects a page and the pages under its path (the home page protects the whole site) when FormWeb serves the published site. Visitors see a password form; the password is stored as a one-way hash outside the site file; export is refused while a password is set, because a static export cannot protect pages. Agents: `set_page_password`, `list_page_passwords` (71 tools).

## 0.4.0 · 2026-10-11

Phase 6 of 9: one agent substrate, Agent Connect and a live terminal. Plus one parity row: FW-068 publish approval, None to Full (67.5 to 68.5 of 79).

- Agent Connect (the Agents rail button, Window > Agent Connect) replaces the title bar's Agents pill. It has the MCP and terminal switch, cards for Claude Code, Codex and Cursor that check and rewrite the project config and open the client in the terminal, approvals, who you are and what you may do, and a live activity feed that marks every change as human, agent or terminal.
- Approvals: "Ask me before an agent deletes..." makes destructive MCP calls wait for your Approve or Deny. "A reviewer must approve a release before it goes live" holds release promotion until a different reviewer approves; approving promotes it (FW-068).
- Live terminal (View > Terminal, Ctrl+`): a shell in the FormWeb folder in a dock under the canvas, with presets for Claude Code, Codex, Cursor, `formweb doctor` and `formweb run`. It runs only while Agents is on, survives collapsing, and its edits appear on the canvas at once.
- `./formweb run COMMAND key=value` applies one engine command to the open site (`--list`, `--json`, `--revision`).
- The substrate behind all of this has a documented adapter for plugging in an external NodeMode substrate later (`FORMWEB_EXTERNAL_SUBSTRATE`).
- New dependencies: @xterm/xterm 6.0.0 and @xterm/addon-fit 0.11.0 (MIT); pywinpty 3.0.5 (MIT, Windows only).

## 0.3.6 · 2026-10-11

Gap closing: four parity rows moved, 64 to 67.5 of 79.

- Site icons (FW-077, Full): Page > Set site icon and Set dark mode icon, or the Whole site section of the Page inspector. Exports add icon, dark-scheme icon, apple-touch-icon and manifest links plus `site.webmanifest`.
- Bulk create from CSV (FW-074, Full): Page > Bulk create from CSV duplicates a template page per row and fills `{{column}}` tokens in text, attributes and SEO. Engine command `page.bulk`, up to 300 rows, one undo step.
- Embed media (FW-076, Partial): Insert > Embed takes a YouTube, Vimeo, Loom, Spotify, Google Maps or OpenStreetMap link, or pasted embed HTML, and renders an allowlisted lazy iframe in Preview and export. Social posts and click-to-load are still open.
- QR codes (FW-079, Full): Page > QR code downloads a PNG or SVG with your colors for the page's published or local address. Also `GET /api/qr` and the new MCP tool `qr_code` (62 tools). Uses segno 1.6.6, BSD-3-Clause.
- Fix: Preview of a brand-new site failed with "no compiled route"; plain exports now write `routes.json`.

## 0.3.5 · 2026-10-11

Phase 5 of 9: inspector and canvas UX, and the zero-flash sweep.

- Display, Direction, Align, Justify, Wrap and Text alignment are one-click button groups. The breakpoint's own value is highlighted, a value inherited from desktop shows dashed, and clicking the highlighted value removes the override.
- Every style field shows Reset while it holds an override at the current breakpoint.
- The canvas header shows the path from the page to the selected element; click any step to select it.
- Saving Settings reconnects in place instead of reloading the page.
- The parity page records v0.3.4 and v0.3.5 in its release history (still 64 of 79); README and docs link the comparisons folder, so releases need no link edits.

## 0.3.4 · 2026-10-11

- One left rail: a collapsed left panel now disappears instead of becoming a second icon strip, the rail's Pages and layers and Insert buttons open and close it, and the panel's duplicate tab row became a title.
- The parity page now uses the form family format, with a "what changed since the last page" table and every release's score (v0.1.0 24.5 of 65 through v0.3.4 64 of 79). It is built from `docs/comparisons/data/formweb-parity.json` by the new `./formweb comparisons build` (`--check`, `--json`) and placed in the FormAI matrix with `embed`.
- Vendor scores now count an integration as half, as the family pages do: Framer 74.1, Webflow 84.8, Adobe Express 29.1 and Canva 46.2 percent; FormWeb is unchanged at 81.0.

## 0.3.3 · 2026-10-11

Phase 4 of 9: a left minirail and collapsible panels, as in formvis.

- New minirail on the far left: Pages and layers, Insert, Design system, CMS, Localization, Website studio, SEO and accessibility, Publish and Agents, with Settings at the bottom. The chevron at the top shows or hides labels.
- Both side panels collapse to a slim icon strip (chevron in the panel header, Window menu, Ctrl+[ and Ctrl+]); a strip icon reopens the panel on that tab.
- Inspector sections collapse from their titles.
- Workspace presets (Design, Content, Build, Focus) in the title bar and Window menu remember their own panel layout across reloads; Window > Reset this workspace restores the default.

## 0.3.2 · 2026-10-11

Phase 3 of 9 plus a repository cleanup: FormWeb's tree and title bar now match formvis and formlit.

- New family title bar: brand mark, File, Edit, Insert, Page, Arrange, CMS, View, Window and Help menus with keyboard navigation, then undo, redo, settings, theme and command search (Ctrl/Cmd+K).
- Every menu action has a stable command id; agents can list and run them through `window.formweb` in the editor window, and the agent quick start documents them.
- Planning, research, audit, verification and observation files moved to the planning sidecar. `docs/` now holds only user guides and the current comparison, and HASHOUT logs stay only in `frontend/` and `backend/`, as in the sibling apps.

## 0.3.1 · 2026-10-11

Phase 2 of 9: FormWeb now uses the form family's theme system, and scrollbars are hidden everywhere in the editor.

- The editor uses the family token set and the same fifteen appearance profiles as formvis and formlit (Settings > Editor theme), applied before first paint, with Inter and JetBrains Mono bundled.
- The window stays hidden until the first render is in place, so a hard reload shows no theme, font or layout flash.
- Every scrollbar in the editor is hidden while scrolling still works, including inside the canvas.
- New Page inspector toggle, Whole site > Hide scrollbars on the published site, for owners who want the same on their own site. Agents set it with `site.update` and `settings.hideScrollbars`.
- New `./formweb comparisons status|embed` release command (with `--check` and `--json`) puts the release comparison into the FormAI matrix; the matrix now carries the four-vendor v0.3.0 page.

## 0.3.0 · 2026-10-11

First release of the v0.3.x sprint (phase 1 of 9). The family comparison now measures FormWeb against Framer, Webflow, Adobe Express and Canva.

- Added Adobe Express and Canva lanes, tiles, table columns and CSV columns to docs/comparisons/FormWeb-Parity_v0.3.0.html, backed by official pages fetched on 2026-10-11.
- Added 14 requirements (FW-066 to FW-079) drawn from documented Express and Canva web features; they are FormWeb integration targets, several sourced from formvis and formlit, and are graded none until built.
- The original 65 rows, their Framer and Webflow evidence and FormWeb acceptance are unchanged; FormWeb reads 64 of 79 weighted.


## 0.2.1 · 2026-10-11

Restored the supplied Form family comparison style in both HTML deliverables: grouped color-coded capability lanes, the 65-row evidence table, warm light/dark themes and individual FormWeb, Framer and Webflow percentage tiles. Retained the original catalog, sibling comparisons and v0.2.0 acceptance; competitor documentation percentages are explicitly separate evidence measures.

- Fixed consolidated theme inheritance and added a stable parent theme control.
- Fixed capability links that navigated the embedded frame, and synchronized its height before scrolling from an empty filter.
- Bounded malformed provider URL errors and durably marked failed translation reviews instead of leaving them loading.
- Added comparison acceptance to the validated 14-file harness and mirrored reference.
- Corrected the stale root VERSION marker and aligned Rust, backend, frontend, MCP and harness versions at 0.2.1.

Locked builds and actual provider/SDK operations passed. All 12 security-enabled throttled Chromium comparison checks passed with zero page errors. Downloaded font glyphs, live hosting/domain/TLS/CDN, completed payments, platform launchers and automatic skill activation remain unverified. See docs/RELEASE_v0.2.1.md and the matching planning sidecar for observations and limits.

## 0.2.0 · 2026-10-10

Added consuming advanced workflows to the existing Rust, TypeScript/Vite and FastAPI architecture. The immutable 65-target audit now records 63 full and two partial requirements. Real managed hosting/domain/TLS and payment/shipping/tax outcomes remain operationally unverified.

- Added typed design systems, custom responsive layouts, component props/variants/slots/reset/detach and reviewed immutable library pins.
- Added CMS detail routes, typed filters and relations, selected bindings, pagination/empty states, exact CSV portability and localized content/media/routes.
- Added isolated compiled Preview, typed code-component builds, states/timelines/overlays, real constrained form submission and explicit tracking.
- Added durable native history/assets, project/branch checkpoints, conflict review, attributed roles/comments/presence, scoped deletion and frozen release promotion/rollback.
- Added typed redirect statuses and manifest-derived localized Preview/publication entries; private assets follow their owning page while public assets remain usable.
- Added durable signed delivery/retention and configured deployment, domain, translation, fetch and commerce adapters, plus independent visitor membership and consented experiment metrics.
- Expanded actual official-SDK MCP to 61 tools and 13 resources; the validated 14-file harness retains six roles with advanced references.

Locked release builds and consuming Linux API/SDK/security-enabled throttled Chromium observations passed. Final source hashes, diagnostics, independent acceptance plans and matching archives are recorded in the planning sidecar. Earlier audits and Git history are retained.

## 0.1.0 · 2026-10-10

Initial FormWeb release, researched against Framer and Webflow and structured from the read-only FormDesign v0.19.0 and FormPath v0.23.0 references.

- Added an authoritative four-crate Rust engine with 17 validated commands, revisions, atomic batches, session history, components, CMS, locales, audit and static compilation.
- Added the TypeScript/Vite editor with persistent keyed DOM, responsive authoring, content controls, raster intake and project/output workflows.
- Added FastAPI persistence, editable .fweb files with embedded owned media, immutable local publications and frozen-schema form collection.
- Added actual official-SDK MCP HTTP tools/resources and a stdio proxy operating the same engine, with access gating and conflict checks.
- Added the validated FormWeb harness, portable mirror, launchers, Windows twins, manuals, wiki and preserved dependency notices.
- Added the 65-target researched parity audit and comparison HTML. Strict coverage is 24.5/65: 11 full, 27 partial, 27 absent. Advanced infrastructure and workflow gaps remain explicit.

Locked Rust release compilation, TypeScript/Vite compilation and manual API/MCP/editor checks passed on Linux. Windows/macOS launchers, hosted CI, managed hosting, external providers and automatic skill activation were not executed.
