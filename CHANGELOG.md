# Changelog

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
