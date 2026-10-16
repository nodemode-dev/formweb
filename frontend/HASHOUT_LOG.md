# Frontend context map

## Live agent workspace · v0.6.0 (2026-10-16)

`features/terminal.ts`, `features/chat-pane.ts`, `styles/chat.css`; small edits in `api.ts`, `agent-connect.ts` and `main.ts`.
- **Dock:** the terminal dock is now an agent dock with session tabs (`fw-term-tab`, keyed in a Map, nodes created once). Each shell or Claude Code session has its own xterm in its own pane, switched with `hidden`, so no pane is rebuilt. Fit runs on the active pane through addon-fit and a ResizeObserver; resize frames go to the server only when xterm reports a new size.
- **Sessions:** buttons call `POST /api/terminal/open` (kind shell or claude, optional prompt, resume, preset). On first open the dock re-mounts live sessions from `GET /api/terminal/sessions`, so a reload keeps every tab and the server replays recent output (the terminal is reset first, so a reconnect never doubles the text). A claude request reuses the live Claude tab. Failures (for example `claude` missing) show the server's install text in the note area, which swaps with the stack at the same fixed body height.
- **Agents switch:** the dock no longer waits for it. Agent Connect's Open button is always enabled; the switch now means outside MCP clients only, and the card text says so.
- **Keys:** Mod+J toggles the dock, Shift+Mod+J opens Claude Code, Alt+Mod+J opens Chat (document capture listener on `event.code === 'KeyJ'`, so Alt works on macOS). Keydown inside the dock stops at the dock, so editor shortcuts (undo, delete, save) do not fire while typing; Mod+J and Ctrl+backtick are let through, and xterm is told to ignore them.
- **Chat:** `ChatPane` posts to `/api/chat/send` through the new `stream()` helper in `api.ts` (fetch plus Server-Sent Events, same auth and errors as `request()`). Markdown is parsed to blocks and reconciled by index, so a streaming delta touches only the block that changed. Tool calls are pills with running, done or failed state. Enter sends, Stop calls `/api/chat/cancel`, New chat calls `/api/chat/reset`, and Continue in Claude Code opens the terminal with `--resume` on the same session. State returns from `/api/chat/state` when the tab is reopened. The page and selected element id are sent as context with each message.
- **Title bar and commands:** three `fw-tt-btn` buttons (Terminal, Claude Code, Chat) built by `dockTitleButtons()` and prepended to the title tools; commands `terminal.toggle`, `claude.open`, `chat.open` in `registerCommands`. The buttons show `is-on` for the open dock or the active tab kind.
- **Icons:** `glyph()` in `chat-pane.ts` draws claude, chat, terminal, send and stop as inline SVG with currentColor, in the same wrapper as `icon()`. `ui/icons.ts` was outside this change.

## Vector editing · v0.6.0 (2026-10-16)

`vector/` (new), `styles/vector.css`, small edits in `ui/canvas.ts`; model, export and backend allowlists in the same change.
- **Element model:** an inline vector is an `svg` node (viewBox, width, height; styles position absolute, left, top, overflow visible) holding `path` nodes. Each path has `d` plus `data-fw-vector`, a JSON anchor model `{"v":1,"subs":[{"closed","nodes":[{x,y,in,out,kind,corner}]}]}`. `d` is always the rendered result, so Live Corners are non-destructive: the model keeps the sharp anchors and a per-anchor `corner {type round|inverted|chamfer, radius, mode absolute|relative}`. If an agent edits `d` alone, `readShape()` sees the two disagree and re-reads `d`. The allowlist lives in three places that must stay in step: `formweb-model/src/vector.rs` (tags, per-tag attributes, value grammar, d parser, parent and child rules), `ui/canvas.ts` (`vectorTags`, `vectorAttributes`, svg created with `createElementNS`) and `backend/app/assets.py` (`SVG_ATTRS`, `sanitize_svg`, `import_vector_svg`). Export drops `data-fw-vector` and marks an svg without role or label `aria-hidden`.
- **Geometry:** `geometry.ts` (anchors, d parse and format, split, kind conversion, shape generators, model encode and decode), `corners.ts` (tangent distance d = r / tan(theta / 2), clamped per segment by arc length and by neighbouring corners; cubic arc with k = 4/3 tan(phi / 4); inverted reflects the arc across the chord; chamfer is a line; curved neighbours are split at arc length d and use their own tangents), `edit.ts` (delete, add, scissors, join, average, simplify, offset, outline stroke with caps, joins and dashes), `fit.ts` (curve fitting, from formdeck), `boolean.ts` (flatten, arrange, link loops, from formdeck; the nine Pathfinder operations).
- **Gestures:** one batch per gesture. During a drag only the iframe `d` attribute and the overlay change; pointer-up sends `node.update` or `node.add` commands through `api.commands`, so undo, revision and MCP behave as for any edit.
- **Overlay:** `Overlay` appends one svg to `canvas.shell` (so it scales with the canvas) and keeps pooled elements per kind, updated by attribute only; hidden items use `data-off`. Handle sizes use `--fw-vo-px` so they stay constant on screen. The capture rect is only hit-testable while a tool is active.
- **Panel:** `VectorPanel` builds the tool strip and the Appearance, Corners, Shapes, Pathfinder, Path and SVG sections once; `update()` writes values in place and never rebuilds.
- **Open items:** gradients, clipping masks, stroke align inside and outside, knife, width tool, group nodes in the UI (imported groups are flattened), a backend route for `import_vector_svg` (the import currently parses in the browser with the same allowlist).

## References and Revise in Generate pages · v0.5.7

`features/ai-writer.ts`.
- **References:** Add reference (`ai.site-reference`) opens a hidden file input (PDF and the four raster types). `api.readReference()` posts the bytes to `/api/ai/site/reference`; the result is kept in the dialog only and listed with `keyed()` keyed by a per-reference id from a WeakMap, so the same file added twice gives two removable rows (name, page count or colour swatches, Remove as `ai.site-reference-remove`). At most six. Building clears them.
- **Outline:** `show()` renders the outline, the server's note (`data-mode` guided is shown in `--warn`) and the reference colours, and reveals the Revise row.
- **Revise:** the instruction field (`ai.site-instruction`, Enter submits) and Revise (`ai.site-revise`) call the same plan hook with the current plan and the instruction. A failure keeps the outline on screen.
- **Write with AI:** a suggestion flagged `unchanged` shows the server's note in the status bar.

## Write with AI and Generate pages · v0.5.6

`features/ai-writer.ts`, styles in `styles/ai-writer.css`.
- **AiWriter:** lives in the Content section under the text field. Action, tone (only for tone) and brief (only for generate) controls, then Suggest (`ai.suggest`). The review shows the current text struck through and an editable suggestion with Discard, Try again and Accept (`ai.discard`, `ai.again`, `ai.accept`). `update(nodeId)` is called where attribute fields refresh; a pending ticket drops late answers and the review when the selection changes.
- **SiteGenerator:** the `generate-site` dialog pane (Page > Generate pages, `page.generate`). Prompt (`ai.site-prompt`), page count, Draft outline (`ai.site-draft`) rendering the outline as a keyed list, Build pages (`ai.site-build`) through `mutateVia` so Undo removes every new page; the first new page opens.

## Generate tab and formvis round trip · v0.5.5

The stock library gained a third tab, Generate with formvis.
- **Prompt:** the search box becomes the prompt (its own per-tab text, Enter generates), so all three tabs share one layout and the dialog does not move (measured: the same top and height on each tab).
- **Options:** generators are listed as options, with not-ready ones disabled and their reason as the title. Sizes follow the chosen generator, and the count is 1 to 4. The list is re-read each time the dialog opens.
- **Progress:** generation polls once a second, showing progress and formvis's message. Results go into a keyed grid of at most 24 per session, newest first.
- **Insert:** measures the picture before inserting (the generator gives no size), and uses the prompt as starting alt text.
- **Command ids:** the Generate button's id is `stock.run-generate`, because `stock.generate` is the tab; a click test caught the clash.
- **Image commands:** `image.edit-in-formvis` and `image.update-from-formvis` are in the Edit menu, with buttons under the image's HTML attributes (images only). Update goes through `mutateVia`, so Undo restores the earlier picture.

## Stock library · v0.5.4

`features/stock-library.ts` (with `styles/stock-library.css`) is the `stock` dialog, opened by `insert.stock`.
- **Tabs:** Icons and Photos from formlit are a `fw-seg` pair, and each tab keeps its own query; a shared query was the first bug found.
- **Icons:** tiles are drawn from the bundled path data with `createElementNS`, so there is no request per icon. The colour and stroke controls restyle the grid in place.
- **Photos:** thumbnails come through the service's proxy.
- **Grids:** both are keyed. Typing "hear" after "heart" kept the same heart tile and added only the six new matches. A search is debounced 160 ms, and a token drops late answers.
- **Stable size:** both panes have the same fixed height, so the dialog keeps its position when switching tabs or when a search returns nothing (measured: same top and height in all three states). Before this fix it moved by 17 px.
- **Insert:** goes through `insertElement('image', {..., alt, styles})`, which now accepts alt text and styles. Icons insert at their pixel size; photos keep the default image styles and use formlit's alt text.

## Remove background · v0.5.3

`features/background-remover.ts` (with `styles/background-remover.css`) is the `background` dialog, opened by `image.remove-background` from the Edit menu or the inspector button (shown for `img` only).
- **Canvases:** four, created once: the original, the matte (alpha means keep), a scratch canvas and the visible view. They are sized at the picture's resolution capped at 2048 px.
- **Opening:** `open()` loads the status and the original picture (`data-fw-original-src` first) through `api.requestBlob`, so there is no tainted canvas across origins. It then asks for the mask; a token discards a late answer after reopening.
- **Brushes:** erase is `destination-out`, restore is `source-over`. Width is in screen pixels, converted to canvas pixels. A single requestAnimationFrame redraw shows the original at 15% (so the removed part can be restored), the cut-out, and the brush ring (red for erase, green for restore).
- **Apply:** the matte goes back to the service as a greyscale PNG through `mutateVia`, so the state lands in the same queue as other edits.
- **Command ids:** `background.find`, `background.erase`, `background.restore` (brush mode), `background.restore-original`, `background.apply`. The brush and the button first shared one id, which test selectors caught; they are now distinct.

## Team libraries · v0.5.2

`features/team-library.ts` is the Team libraries dialog (`window.team`, rail folder icon), built like the brand kit: keyed rows, so Link, Sync and Unlink change text and button visibility without remounting (checked: the same row nodes before and after Link). The detail view shows colors, fonts and graphic tiles. Edit rows are shown only for edit and owner roles, and the sharing section only for the owner. The share picker lists people with a role in this project (`/api/access`); with none, it explains how to add them. Changes call `/api/team-libraries/...`. Link and sync go through `api.mutateVia`, which queues like `commands()` and accepts the returned state, so the canvas updates and Undo reverts a sync in one step. `insertImageAsset()` in `main.ts` is shared by brand logos and library graphics. `readBrand` returns `teamColors` and `teamFonts` (`lib-` tokens). The inspector datalists list them after the brand kit as Team color and Team font, and the restriction regex accepts `var(--lib-...)`. Styles are in `brand-kit.css` (`.fw-team-*`).

## Brand check, restriction and embed gates · v0.5.1

`features/brand-kit.ts` gains a Brand check section with the restriction checkbox (`brand.restrict`), Check page (`brand.check`), Fix all (`brand.fix-all`) and a keyed issue list. Rows are reused by issue id, so a re-check after a fix does not remount the list. Each row has Fix (`brand.fix`), and clicking its name selects the element. Fixes go through `hooks.commands` as one batch, then the check re-runs. `main.ts` wires `check` to `/api/brand/check` and enforces the restriction in `setStyle` for color, background, background-color, border-color and font-family: a refused value resets the field to its current value and shows the reason. The exporter's gates live in `native/crates/formweb-export/src/embed.rs` (`gate()`, `social()`, `GATE_RUNTIME`, which is appended to both runtimes). `embedKind` accepts X post links, and Whole site has "Load embeds only when visitors click" (`site.embedClickToLoad`). On Load, the runtime focuses the new iframe with `preventScroll`, so the page does not jump.

## Desktop shell · v0.5.0

No editor change. In the Tauri shell the same built editor runs in WebKitGTK, WebKit or WebView2; `withGlobalTauri` exposes `window.__TAURI__.core.invoke('render_probe' | 'render_thumbnail' | 'render_diff', ...)` for pages that want the GPU renderer, and `capabilities/default.json` grants it only to `http://127.0.0.1:8240/*`. The browser build ignores it.

## Brand kit · v0.4.2

`features/brand-kit.ts` (dialog `brand`, command `window.brand`, rail item) reads the kit from the document itself: typed color tokens named `brand-[name]`, typed text tokens named `brand-font-[name]`, and settings `brandLogo` and `brandLogoDark`. Adding uses `token.define`; removing sends `token.set` null plus `extension.set` of the design group without that token, as one batch and one undo. Rows are `keyed()` (a removal changed one node in the mutation check). The brand picker is two body-level datalists (`fw-brand-colors`, `fw-brand-fonts`) wired to the color, background, border-color and font-family style inputs through `list`; their options are keyed and refreshed from `update()`. Logo uploads reuse `mediaInput` with modes `brandLogo` and `brandLogoDark`; Insert closes the dialog and inserts an image at its natural size. An empty logo slot keeps its grid cell with `data-empty` rather than `hidden`.

## Selection for agents, page password · v0.4.1

`reportSelection()` posts the selected node to `/api/presence` from `update()` when the selection changes and every 30 s, only while Agents is on, so MCP's `formweb://selection` matches the editor (presence expires after 60 s). The Page inspector gains a Password section (`page.password`, `page.password-remove`, field `page.password`): gates load once per site from `/api/page-passwords`, `gateFor()` mirrors the server's most-specific-route rule, and the home page is labelled as protecting the whole site because `/` covers every route.

## Agent Connect and the terminal dock · v0.4.0

`features/agent-connect.ts` is a third left-panel pane (`activeSidebar === 'agents'`, rail button `window.agents`). It replaces the title bar's Agents pill: `toggleAgents()` in main.ts is now a named function used by the panel switch and the `agents.toggle` command (the old button object is kept, unmounted, as its command target). The panel polls `/api/agents/clients`, `/api/approvals?status=pending` and `/api/substrate/activity` every 2 s only while it is visible (`setVisible` is idempotent because `update()` calls `setSidebar` on every state change); client cards, approvals and the feed are `keyed()` rows whose text and data attributes update in place. `features/terminal.ts` (`TerminalDock`) is the stage panel's third grid row (`.stage-panel` rows `40px 1fr auto`); `data-state` open or collapsed toggles the body with CSS, the xterm instance is created on first open, and the backend session id is kept so collapse and socket drops reattach to the same shell. Its state persists under `formweb_terminal` and is restored before reveal. xterm's own scrollbar element is hidden by `styles/terminal.css`. Vite proxies `/api` with `ws: true` so the WebSocket reaches 8240 from 5240.

## Parity rows: icons, bulk pages, embeds, QR · v0.3.6

Four parity rows got editor controls, each a registered command with a `data-command` or `data-field` hook. Site icons (`site.favicon`, `site.favicon-dark`, `site.favicon-clear`) reuse the hidden `mediaInput` with `dataset.mode` set to `favicon` or `faviconDark`, upload, then `site.update` the setting; the Page inspector's Whole site section shows a 24px preview whose `src` changes only when the setting changes. Bulk create (`page.bulk`, dialog `bulk`) parses CSV in `parseCsv()` (quoted cells, doubled quotes, CRLF, a required `slug` column, 300 rows max) and sends one `page.bulk` engine command, so one undo reverts it. Embed media (`insert.embed`, dialog `embed`) accepts a share link or pasted provider iframe HTML (the paste handler keeps only `src`), checks the provider in `embedKind()` and inserts a labelled `div` with `data-fw-embed`; the canvas shows the label, Preview and export show the player. QR (`page.qr`, dialog `qr`) prefills `pageAddress()` (published address when one exists in this session, else the local one) and downloads `/api/qr` with format and colors.

## Inspector segments, reset, selection path, reconnect · v0.3.5

`addSegments()` in main.ts builds one-click groups (`.fw-seg`, `data-style`, buttons with `data-value`) for display, flex-direction, align-items, justify-content, flex-wrap and text-align; `update()` only toggles `is-on` (override at the current breakpoint), `is-inherited` (desktop base value seen from tablet or mobile) and `aria-pressed`, so a click never adds or removes inspector nodes. Clicking the active value writes an empty style, which clears the override. `resetButton()` adds a Reset control to every style field label (`data-reset`), shown only while that field has an override. The stage header gains `.fw-crumbs`, a keyed path from the page root to the selection. `api.reconnect()` replaces the old `location.reload()` after saving Settings: it re-authenticates, reloads state and reopens the SSE stream, keeping selection and layout.

## One left rail · v0.3.4

The owner saw two minirails: a collapsed left panel turned into an icon strip beside the minirail. The left panel now collapses to nothing (`--left-w: 0px`, sidebar `display: none`), and the rail's Pages and layers and Insert buttons toggle it (`toggleLeft` in main.ts: open on that pane, close if it is already showing). The panel's tab row duplicated those two buttons and became a plain `.fw-panel-title`. The four workspace children carry explicit grid columns, because a `display: none` sidebar otherwise lets auto-placement slide the stage into its column. The right panel keeps its strip, which formvis also has.

## Minirail, collapsible docks and workspaces · v0.3.3

`ui/layout.ts` adds the left minirail (`Rail`: nine modes plus Settings, each a registered command, icon-only or labelled), dock strips shown when a side panel collapses, the collapse buttons, and `WorkspaceLayout`, which keeps rail, left and right state per preset (Design, Content, Build, Focus) under `formweb_workspace` in localStorage, read before the app is revealed. Layout lives only in `.workspace` data attributes and CSS variables (`--rail-w`, `--left-w`, `--right-w`); collapsing never adds or removes panel nodes, it toggles `display` through `[data-left]` and `[data-right]` (with `!important`, because the pages pane uses an inline `display: contents`). Inspector and dialog sections built by `section()` now collapse from their title (button role, Enter or Space). The sidebar footer with CMS and Locales moved into the rail. New commands: window.toggle-left (Ctrl+[), window.toggle-right (Ctrl+]), window.toggle-rail, workspace.design, workspace.content, workspace.build, workspace.focus, workspace.reset.

## Family shell · v0.3.2

`ui/shell.ts` holds the command registry (`registerCommands`, `runCommand`), the `Menubar` (nine family menus whose popups are built once into the overlay root and only toggle hidden, disabled and checked state on open) and `CommandSearch` (Ctrl/Cmd+K, keyed result rows). `exposeToAgents()` publishes `window.formweb.commands()` and `run(id)`. main.ts registers 43 commands after its functions exist; the menubar replaced the Project, Design system, Settings and Help launchers and the toolbar's file and history buttons, which now live in File and Edit with undo and redo also in the title tools. `styles/shell.css` owns the title bar, menus, title tools and search; the old `.topbar`, brand and menubar rules left app.css. Below 1280 px the Agents and Preview buttons turn icon-only with titles and aria labels.

## Family theme, first paint and hidden scrollbars · v0.3.1

`styles/tokens.css` now carries the form family token set (surfaces, surface and line ladders, accent derivations, fs, ctl, radius and space scales, font stacks) with formweb's older names kept as aliases until the shell phase stops using them; formweb's own z-index scale is unchanged. `ui/themes.ts` holds the fifteen family profiles under the shared `nodemode_ui_settings` key (appearance 3) and migrates the old `formweb_theme` value once. `index.html` applies the saved profile to the root before any stylesheet loads and hides `#app` until `revealApp()` (in `ui/dom.ts`) flips `body.app-ready` two frames after the first state render, or after boot settles if the engine is unreachable. Scrollbars are hidden for every element by the global rule in tokens.css and inside the canvas srcdoc; the old visible 6 px rule in app.css was removed. The Page inspector's Whole site section writes `settings.hideScrollbars` through `site.update`. Theme changes write only root custom properties and the root data-theme attribute, never #app children.

## Org navigation map

| Path | Role |
| --- | --- |
| `index.html` | Theme before paint, reserved shell, import input |
| `README.md` | Frontend operation and release limitations |
| `package.json`, `package-lock.json` | Pinned Vite and TypeScript, reproducible install |
| `tsconfig.json` | Strict browser TypeScript compilation |
| `vite.config.ts` | Loopback dev and preview, API proxy |
| `.env.example` | Optional same-origin API override |
| `oc_install`, `oc_install.bat` | Delegate frontend installation to root setup |
| `boot_frontend`, `boot_frontend.bat` | Delegate frontend launch to root setup |
| `src/types.ts` | Shared Rust document wire types |
| `src/api.ts` | Serialized commands, SSE, native export and image intake |
| `src/main.ts` | Persistent editor shell, controls, dialogs and engine dispatch |
| `src/ui/dom.ts` | Guarded text/value and keyed list updates |
| `src/ui/icons.ts` | Original inline currentColor SVG icons |
| `src/ui/canvas.ts` | Sandboxed keyed website DOM, responsive and CMS rendering |
| `src/features/contracts.ts` | Typed persistent workflow descriptors and context |
| `src/features/studio.ts` | Mounted advanced panels, input validation and real result viewer |
| `src/features/authoring.ts` | Native design/component/CMS/locale/form workflows |
| `src/features/advanced.ts` | Scoped state/timeline/overlay/locale/widget/experiment operations |
| `src/features/services.ts` | Inbox, delivery, release, review, library and CSV API consumers |
| `src/features/providers.ts` | Configured adapter transport, proposals, commerce and membership |
| `src/features/code.ts` | Explicit code compilation, digest manifest and host installation |
| `src/features/runtime-preview.ts` | Persistent isolated compiled-runtime iframe slots |
| `../docs/ADVANCED_GUIDE.md` | Exact advanced UI flows and schemas (moved from frontend/ in v0.3.2) |
| `src/styles/tokens.css` | Themes, spacing and sole stacking registry |
| `src/styles/app.css` | Studio layout and reserved panels |
| `src/styles/features.css` | Reserved advanced Studio panes and compiled preview |

## Contents

- [index.html](#indexhtml)
- [package.json](#packagejson)
- [vite.config.ts](#viteconfigts)
- [Frontend launch wrappers](#frontend-launch-wrappers)
- [src/api.ts](#srcapits)
- [src/main.ts](#srcmaints)
- [src/types.ts](#srctypests)
- [src/ui/canvas.ts](#srcuicanvasts)
- [src/ui/dom.ts](#srcuidomts)
- [src/ui/icons.ts](#srcuiiconsts)
- [Styles](#styles)

## index.html

### index.html · initialization

- refers-to: `index.html` :: head and shell
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Persisted theme is applied before first paint. Tokens and layout are linked in the head. The shell grid reserves header, toolbar, left sidebar, stage, inspector and status dimensions before asynchronous engine state arrives. Platform fonts avoid network font dependencies. Native project import accepts `.fweb` envelopes and JSON documents.

## package.json

### package.json · dependency choices

- refers-to: `package.json` :: devDependencies and engines
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Vite 8.3.4 is MIT; TypeScript 7.0.2 is Apache-2.0. License, version and runtime engine metadata were inspected through npm before installation. Node 24.19.0 was used here. Required Node minimum is 22.12.0. `npm run build` performs strict TypeScript checking followed by production bundling. No framework or icon dependency is installed. The lockfile pins the install graph.

## vite.config.ts

### vite.config.ts · server boundary

- refers-to: `vite.config.ts` :: server and preview
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Dev uses port 5240; preview uses 5241. Both use `host: false` and `strictPort: true`. API requests and local publications proxy to 127.0.0.1:8240 during development. Production is served by FastAPI.

## Frontend launch wrappers

### oc_install / boot_frontend · thin root delegates

- refers-to: `oc_install`, `oc_install.bat`, `boot_frontend`, `boot_frontend.bat` :: launcher delegation
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Installation delegates to `setup/install_frontend`, which uses `npm ci` against the pinned lockfile. Boot delegates to `setup/boot_frontend`, which runs `npm run dev` with Vite's declared binding and port. Windows twins preserve the family launcher convention.

## src/api.ts

### src/api.ts · authoritative state and concurrency

- refers-to: `src/api.ts` :: command, commands, replace, connect
- kind: rationale
- logged: v0.1.0 · 2026-10-10

The frontend has no second document engine. It renders Rust state returned through FastAPI. Mutations and document replacements are serialized; command mutations include `expectedRevision`. Single commands, including undo and redo, use `/api/command`; atomic multi-node insertions use `/api/batch`. Save, audit, publish and downloads wait for pending edits before taking their snapshot. SSE forwards agent modifications into the same mounted view. Revision conflicts fetch current state, retain a focused input and show an explicit retry message.

### src/api.ts · token and asset transport

- refers-to: `src/api.ts` :: authHeaders, connect, download, upload
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Optional server tokens live in sessionStorage, become Bearer headers and establish a local HttpOnly session cookie through `/api/auth` for EventSource. Tokens are not placed in URLs. Raw image intake accepts PNG, JPEG, WebP and GIF up to 8 MiB; the backend validates and stores bytes. Editable downloads use `/api/project-file`, while static export uses `/api/export`.

## src/main.ts

### src/main.ts · mounted controls and commands

- refers-to: `src/main.ts` :: shell construction and update
- kind: rationale
- logged: v0.1.0 · 2026-10-10

The shell, inspector forms and each dialog pane are created once. Pages, layers, components, collections, projects, locales, tokens and audit rows are keyed. Tab changes toggle existing panes. Inspector value updates skip the focused control. Node text, attributes, layout, typography, appearance, breakpoints, hierarchy, CMS bindings, interactions, page SEO, tokens and locale dictionaries submit real engine commands. Styles and attributes clear with explicit null values because Rust applies merge patches. Breakpoint reset sends the selected breakpoint as null. Reparent omits an index to append; up/down send valid sibling indexes.

### src/main.ts · content workflows and scope

- refers-to: `src/main.ts` :: dialogs and insertion
- kind: explainer
- logged: v0.1.0 · 2026-10-10

New/open/save/import/download/export/local-publish are actual API workflows. Image insertion chooses a raster file, decodes its dimensions, uploads it and creates the image after readiness using the returned asset URL, filename and dimensions. The image branch was corrected after review found a retained inline SVG placeholder that Rust URL validation rejected; the actual source was re-read and production compilation passed after correction. Existing sources can be replaced through Content > Upload image. Components capture the selected subtree and insert linked instances. CMS collection definitions use name:type lines and item values use JSON; required fields, slugs and types are validated by Rust. Locale translations use node IDs and page metadata keys. The interaction inspector edits its first action while preserving other stored actions.

### src/main.ts · preview limitations

- refers-to: `src/main.ts` :: Preview button and interaction inspector
- kind: warning-context
- logged: v0.1.0 · 2026-10-10

Editor preview supports internal navigation and simple click/hover-entry actions. Form submissions are prevented in the editor canvas; exported and locally published forms use the service. Scroll-triggered actions, hover exit/focus behavior and exact animation durations belong to the exported runtime in this release. The UI states this limit. Local publishing does not configure a custom domain or cloud deployment.

## src/types.ts

### src/types.ts · schema boundary

- refers-to: `src/types.ts` :: Site, SiteNode, EditorState
- kind: explainer
- logged: v0.1.0 · 2026-10-10

Types follow the camelCase Rust wire document. Nodes refer to children by stable ID. The browser stores only the latest received state and ephemeral page/selection/viewport/panel choices. Linked-component metadata not needed by the inspector is retained by Rust rather than reconstructed in the UI.

## src/ui/canvas.ts

### src/ui/canvas.ts · persistent iframe and keyed document

- refers-to: `src/ui/canvas.ts` :: constructor, render, patch
- kind: rationale
- logged: v0.1.0 · 2026-10-10

The iframe is initialized with `srcdoc` once. It permits same-origin access but no scripts, and its CSP rejects script and form execution. Subsequent state changes update cached nodes, individual attributes/styles and text spans. No live body innerHTML or srcdoc rebuild occurs. A tag change replaces only that one element, transferring its already mounted children. Inactive page roots are kept mounted and hidden. Canvas viewport space is reserved before the engine responds, and fitting changes one frame transform.

### src/ui/canvas.ts · responsive, locale and CMS parity

- refers-to: `src/ui/canvas.ts` :: patch
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Base styles merge maxWidth 100000 desktop overrides, then matching narrower breakpoint overrides in descending order. Text uses node-ID locale keys. Published collection lists repeat keyed instances and descendant fields use the current item. Draft items are omitted. Image fields bind src. Repeated DOM identities include collection and item IDs, while selection resolves to the original engine node. Nested collections compose suffixes and inherit a subtree HTML-ID map: matching id, for, ARIA references, fragment hrefs and interaction URLs stay in the correct item, while references outside the repeated scope remain unchanged. Fragment navigation resolves inside the iframe. Allowed HTML tags and attributes match the Rust model, excluding active form action/method in the editor sandbox. Image changes decode offscreen before swapping the source, with a latest-source guard and cache reset on removal.

## src/ui/dom.ts

### src/ui/dom.ts · stable updates

- refers-to: `src/ui/dom.ts` :: text, value, keyed, options
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Text and value writes are guarded. Keyed lists update existing rows and only insert/remove/reorder rows whose IDs require it. Form controls retain focus and in-progress input. List regions and dialogs have reserved dimensions. There are no transient spinners.

## src/ui/icons.ts

### src/ui/icons.ts · original SVGs

- refers-to: `src/ui/icons.ts` :: icon
- kind: rationale
- logged: v0.1.0 · 2026-10-10

Icons are original hand-authored inline SVG paths using a 24-unit viewBox, currentColor, one stroke scale and canonical 16/20 pixel boxes. SVG markup initializes only a newly created detached icon span. It never rewrites a live container.

## Styles

### styles · theme, stacking and alignment

- refers-to: `src/styles/tokens.css`, `src/styles/app.css` :: all tokens and layout
- kind: rationale
- logged: v0.1.0 · 2026-10-10

The Studio Dark default follows the Form family surfaces and orange accent. Studio Light overrides semantic tokens. Spacing and indentation use shared tokens; icons and labels align in consistent grid columns. Dialogs live in a body-child overlay root.

| Layer token | Value | Purpose |
| --- | --- | --- |
| `--z-base` | 0 | Normal content |
| `--z-raised` | 100 | Raised content |
| `--z-sticky` | 200 | Sticky chrome |
| `--z-chrome` | 300 | Application chrome |
| `--z-dropdown` | 400 | Menus |
| `--z-scrim` | 500 | Overlay backdrops |
| `--z-overlay` | 600 | Root dialogs |
| `--z-popover` | 700 | Overlay popovers |
| `--z-toast` | 800 | Notifications |
| `--z-tooltip` | 900 | Tooltips |
| `--z-debug` | 1000 | Reserved development diagnostics |

### styles · verification ledger

- refers-to: frontend production build and root browser verification
- kind: explainer
- logged: v0.1.0 · 2026-10-10

Strict TypeScript checking and Vite production bundling passed after the final asset/CMS fixes on Node 24.19.0. Root observed the production editor in Chromium 153 with CPU 4x, 150 ms latency, 750 kbps download and disabled cache. Text edits retained the H1 node; a shared-engine update retained the focused inspector input, pending text and selection. The mounted iframe, sidebar and inspector had zero removals during the checked flow. Undo/redo, responsive styles, page/tree editing, CMS, locales, agent gating, raster upload, native import/export, local publication, audit and persistent theme controls were exercised. The planning sidecar and docs/VERIFICATION.md record the boundaries. No self-authored tests or test harness files were created.

## v0.2.0 continuation

The v0.1.0 entries above are historical. Its preview limitations are superseded by the separately compiled runtime below. The version marker here records the requested continuation; root performs the final package version bump and release verification.

### src/main.ts · advanced seams and audit targeting

- refers-to: `src/main.ts` :: feature imports, toolbar, layout inspector, update, keyboard guard, audit rows, final registration
- kind: rationale
- logged: v0.2.0 · 2026-10-10

Handmade source regions add the Studio and RuntimePreview registrations without rebuilding the live editor shell. The toolbar selects any stored breakpoint and retains explicit viewport width. Flex wrap/order, grid rows/column/row placement, self alignment and flex are ordinary persistent inspector controls. Preview and its refresh icon consume the compiled preview route. The design iframe receives editing mode only. Audit rows retain page IDs as well as node IDs, and a page metadata issue opens that page's SEO inspector. Global delete/undo shortcuts are guarded while Studio is open. The interaction hint and Help paragraphs now explain advanced Studio and compiled Preview.

### src/features/studio.ts · persistent authoring and service panels

- refers-to: `src/features/studio.ts`, `src/features/contracts.ts` :: all descriptor mounting and execution
- kind: rationale
- logged: v0.2.0 · 2026-10-10

Each workflow pane and its controls are mounted once. Category/action navigation toggles panes; list rows are keyed. Examples are loaded once or explicitly, so SSE updates never replace pending Studio input. The modal traps focus and restores the previous control on close. JSON, finite numbers, required fields and CSV size are checked locally; authoritative engine/service errors are displayed. Only the run button is disabled during a request, with fixed result space and no loading spinner. Native results are summarized; service envelopes retain their report/library details while immediately applying nested state. Provider statuses remain the actual response, with no inferred success claim. Path parameters are excluded from request bodies. File controls read an actual selected CSV. Code compilation is labeled Build & install and requires explicit source opt-in.

### src/features · native and service consumers

- refers-to: `src/features/authoring.ts`, `src/features/advanced.ts`, `src/features/services.ts`, `src/features/providers.ts`, `src/features/code.ts` :: workflow descriptors and exact operations
- kind: explainer
- logged: v0.2.0 · 2026-10-10

Native workflows submit agreed page/breakpoint/token/preset/component/CMS commands or validated extension groups. Dedicated entry editors merge into current configuration for states, actions, timelines, overlays, translated media/routes, widgets, gates, experiments, conversion goals and redirects. Collection schema updates use collection.update with typed reference descriptors. JSON group editors expose Load current configuration because extension.set replaces that group. Services consume actual inbox/CSV/retention/delivery/release/branch/review/comment/presence/identity/access/activity/delete endpoints. Pinned library update requires an explicit update checkbox and reviewed digest; CSV import preserves type, presence and locale metadata. Provider panels inspect missing server environment names, deployment/domain/data-source states, pending translation review, synchronized products, signed orders, visitor groups and consented metrics. Secrets have no site/editor configuration field. The code panel uses the actual compiler response and preserves its digests before installing the validated definition and host binding.

### src/features/runtime-preview.ts · compiled runtime with reserved continuity

- refers-to: `src/features/runtime-preview.ts` :: constructor, update, compile, fit
- kind: rationale
- logged: v0.2.0 · 2026-10-10

The design iframe and two compiled-runtime iframe slots remain mounted. A POST to /api/preview selects page and locale; the result URL loads into the inactive slot. The preceding view remains visible through load and two animation frames, then visibility switches once. Responsive size changes fit the existing frame without recompilation. Revision/page/locale changes request a new immutable preview. Each runtime frame allows scripts/forms/popups but omits same-origin access and sends no referrer. A failed/slow request reports its error and retains the previous view. Its compiled runtime owns forms, CMS queries, motion and integration behavior; the design surface does not execute them. Visitor-cookie semantics need final verification in a top-level publication.

### src/api.ts, types and Vite · integration regions

- refers-to: `src/api.ts` :: request; `src/types.ts` :: optional metadata/extensions/audit scope; `vite.config.ts` :: proxy
- kind: rationale
- logged: v0.2.0 · 2026-10-10

The request helper accepts an explicit HTTP method for DELETE. Preview and snapshot-consuming advanced service/provider workflows wait for queued native edits. Native commands retain their existing serialized expectedRevision path. Types preserve optional extension and component metadata and audit page scope. Vite proxies compiled preview and active /sites routes through the existing loopback backend; host:false/strictPort remain unchanged.

### src/styles/features.css · mounted panel dimensions

- refers-to: `src/styles/features.css` :: all layout
- kind: rationale
- logged: v0.2.0 · 2026-10-10

Studio reserves a fixed modal workspace with category/action/content columns and independent scrolling. Result panels reserve height. Feature styles consume existing theme/spacing/stacking tokens. Runtime frame slots share one reserved outer viewport and are absolutely positioned inside it. No new competing z-index registry is introduced.

### Advanced continuation · verification boundary

- refers-to: production build and independent root verification
- kind: explainer
- logged: v0.2.0 · 2026-10-10

Strict TypeScript/Vite compilation passed during implementation. Root owns final throttled browser, provider fixture, MCP and release evidence. ADVANCED_GUIDE.md describes the consuming UI paths and exact schemas without claiming every external adapter was verified. No authored tests or persistent test runner were added. All new modules were authored directly; each existing-file change followed a current-region read and a direct single-region editor call, with no code-edit script, patch file, bundle or transformation tool.

### Final source review · specific control corrections

- refers-to: `src/api.ts` :: HTTP 409 handling; `src/main.ts` :: CMS binding readout; `src/features/services.ts` :: branch return/review/merge
- kind: fix
- logged: v0.2.0 · 2026-10-10

Semantic HTTP 409 errors now preserve the service reason; only an explicit stale/revision conflict refreshes engine state and requests a reviewed retry. This keeps library digest acknowledgement and branch/translation-state failures actionable. The inspector recognizes an advanced CMS binding or list, shows its actual collection/field and reserves its legacy controls while providing a Studio edit action. A dedicated saved-main list/open workflow completes branch review and merge from Studio; merge includes the reviewed revision. These are direct edits of read regions, followed by strict production compilation. Final asset names are communicated to root for browser verification.
