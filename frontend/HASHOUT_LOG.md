# Frontend context map

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
| `src/styles/tokens.css` | Themes, spacing and sole stacking registry |
| `src/styles/app.css` | Studio layout and reserved panels |

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
