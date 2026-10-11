# Frontend context map

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
