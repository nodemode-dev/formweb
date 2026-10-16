# Architecture

The Rust engine is the single owner of site state. The editor, MCP tools and HTTP clients send operations through one locked Python bridge. They do not keep independent editable copies of the site.

| Layer | Source | Responsibility |
| --- | --- | --- |
| Document model | `native/crates/formweb-model/` | Pages, nodes, styles, components, collections, locales and invariants |
| Commands and history | `native/crates/formweb-engine/` | Atomic changes, revisions, undo and redo |
| Website output | `native/crates/formweb-export/` | Deterministic HTML/CSS/JS output and site checks |
| Process shell | `native/crates/formweb-core/` | JSON-lines request and response transport |
| Service | `backend/app/` | Core supervision, HTTP, project persistence, publication and MCP |
| Editor | `frontend/src/` | Stable DOM shell, selection, inspectors and browser preview |
| Agent skills | `.claude/skills/formweb-harness/` | Ordered website authoring workflows through MCP |
| Agent substrate | `backend/app/substrate.py` | One command surface (catalogue, dispatch, attributed events) behind REST, MCP, `./formweb run` and the terminal; approvals; the external-substrate adapter |
| Live terminal | `backend/app/terminal.py`, `frontend/src/features/terminal.ts` | Owner-only pseudo-terminal in the FormWeb folder over a loopback WebSocket, while Agents is on |
| GPU renderer | `native/crates/formweb-render/` | Family wgpu renderer (own workspace and lockfile): area-averaged thumbnails, minimap with a viewport outline, release pixel diffs, a CPU path with identical results, `./formweb render` |
| Desktop shell | `src-tauri/` | Tauri 2 window around the editor on 127.0.0.1:8240; starts `./formweb serve` when nothing answers and stops it on exit; exposes the renderer as `render_probe`, `render_thumbnail` and `render_diff`; `./formweb desktop` |
| Agent Connect | `frontend/src/features/agent-connect.ts`, `backend/app/clients.py` | MCP switch, client cards, approvals, identity and the attributed activity feed |
| Agent dock | `frontend/src/features/terminal.ts`, `chat-pane.ts`, `backend/app/claude_code.py`, `chat.py` | Session tabs, in-app Claude Code and streamed Chat, both launched with an in-app MCP token |
| Command registry | `frontend/src/commands/`, `backend/app/commands_mirror.py` | One list of commands behind menus, buttons, shortcuts, search and agents |
| Interface languages | `frontend/src/i18n/`, `setup/i18n_check.py` | 26 languages, live switching, lazy tables |
| Vector module | `frontend/src/vector/`, `native/crates/formweb-model/src/vector.rs`, `backend/app/vector_routes.py` | Paths, Live Corners and Illustrator-style tools stored as `svg` and `path` nodes |
| Wishlist | `frontend/src/features/wishlist/`, `native/crates/*/src/wishlist.rs`, export `wishlist.js` | CMS filters, slider, tables, steps, fields and publish checks |
| Frozen desktop engine | `backend/formweb_engine.py`, `setup/freeze_backend`, `./build_app` | PyInstaller bundle of the service, editor and Rust core for the desktop app |

The process shell is `native/target/release/formweb-core` (`.exe` on Windows). `setup/install_core` compiles it. `backend/app/engine.py` serializes access to one process and retains the latest acknowledged state for restart recovery. An unacknowledged request is not reported as successful.

A change follows this sequence: the editor or agent submits commands; Python sends one JSON line to Rust; Rust validates and commits an atomic update; Python persists a history checkpoint and notifies authorized connected editors. The frontend patches existing controls and node representations. The design canvas renders authored data for editing. Preview loads the actual compiler output through a token-scoped opaque iframe, retaining the preceding frame until the replacement loads. Published top-level pages are the final place to verify visitor sessions and consent.

## Contract for new capabilities

Document behavior belongs in Rust. Backend code owns filesystem/network service boundaries. UI code submits operations and renders state; it must not silently repair an invalid document or implement a second command engine. Exported behavior must consume the same stored properties that the inspector edits.

Use stable ids, explicit revision checks for edits based on a read, and atomic batches when a group of changes must undo together. A rejected operation leaves the prior state, revision and history unchanged. Extend MCP using the same service path as the editor, and update the harness workflow if the tool contract changes.

New features are modules at the existing layer seams. Read `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` before editing those layers; for the Rust engine read [[Engine]] and the sidecar's native log. As in formvis and formlit, planning documents, the root log and evidence ship in the planning sidecar, and only the frontend and backend logs stay in the tree.

## Editor layers (v0.6 and v0.7)

**Commands registry.** `frontend/src/commands/registry.ts` holds one `Commands` singleton: each command has an id, label, key bindings (`Mod+Shift+S` form, read from `event.code` so they are layout independent), enabled and checked state, menu, group, description, parameters, and `mutates` and `risky` flags. A duplicate id throws and a duplicate key is dropped from the later command. `keymap.ts` installs one capture listener on the top document; it ignores inputs, textareas, selects, contenteditable and the terminal, so single keys never fire while typing, except commands marked `global` on a Mod combo. Keys pressed while focus is inside the canvas iframe are forwarded by `ui/canvas.ts` to the top document (not from editable targets), so shortcuts work after clicking the canvas. `catalogue.ts` posts the list to the backend, and `backend/app/commands_mirror.py` long-polls the window so MCP `list_ui_commands`, `describe_ui_command` and `run_ui_command` run commands in the open page, with an Allow or Deny prompt for risky ones. User rebinding is stored in `localStorage` only.

**Interface languages.** `frontend/src/i18n/` holds the translator, `langs.ts` (26 codes, English the source), `keys.ts` (the ordered English strings) and `locales/*`, plus the formvis family tables in `family/` copied unchanged. Later layers win: family tables, then FormWeb's own locale. A MutationObserver translates text nodes and title, aria-label and placeholder by exact English match before paint, remembering the English so switching never needs a reload. Content, layer and page names, the terminal, the chat log and the canvas iframes are never translated. Each language loads lazily; see [[Languages]].

**Vector module.** `frontend/src/vector/` draws and edits on an overlay above the canvas. The model is plain engine data: an `svg` node holding `path` nodes, with `d` always the rendered result and `data-fw-vector` the anchor model (including Live Corners, which stay non-destructive). One gesture is one engine batch, so undo, revision and MCP behave as for any edit. The tag and attribute allowlist, the `d` grammar and same-svg `url(#id)` references are enforced independently in `formweb-model/src/vector.rs`, `ui/canvas.ts` and `backend/app/assets.py`, which must stay in step. `POST /api/vector/import-svg` cleans imported SVG with the same rules. Tool letters are handled by the vector editor's own capture listener, which runs before the keymap.

**Wishlist runtime.** The creative features live in the model, engine and export crates as `wishlist.rs`, with a small `wishlist.js` runtime in exports for published-list filters, sorting, sliders and multi-step forms. The editor side is `frontend/src/features/wishlist/` (one panel, nine tabs, every edit an ordinary engine batch). Form file uploads and validation presets are checked in `backend/app/forms.py`.

**Frozen desktop engine.** `./build_app` builds the editor and Rust core, freezes `backend/formweb_engine.py` with PyInstaller (`setup/freeze_backend`, `requirements_desktop.txt`) and runs the Tauri build. Inside the bundle (`config.FROZEN`) the core binary and editor come from the bundle and data lives in `~/FormWeb` (or `FORMWEB_HOME`); `formweb_engine.py --selfcheck` names anything missing, and the Tauri shell spawns the frozen engine as a sidecar.

## Family services

Some capabilities belong to a sibling app, and FormWeb calls it rather than copying it. Background removal (`backend/app/background.py`) sends an uploaded picture to formvis's engine (`FORMWEB_FORMVIS_URL`, default `http://127.0.0.1:8190`, `POST /api/ops/remove-background`) and gets a soft mask back. Everything else stays in FormWeb: the editor's brush refinement, compositing with Pillow, the new asset and the one-step `node.update`. When formvis is not running, the feature reports how to start it and nothing else is affected.

Stock photos (`backend/app/stock.py`) work the same way with formlit. FormWeb searches formlit's catalog with its `library.query` and `photo.get` commands (`FORMWEB_FORMLIT_URL`, default `http://127.0.0.1:8390`). It proxies thumbnails so the browser never talks to formlit, and on insert saves formlit's developed preview as an asset carrying the photo's IPTC rights. Bundled icons need no sibling. SVG assets exist only for them: `assets.clean_svg` rebuilds every SVG from an element and attribute allowlist (no colon allowed in any value), uploads stay raster-only, and SVG responses carry a sandboxing CSP. Asset metadata may hold a `license`, which `.fweb` files carry and exports list in `CREDITS.txt`.

Image generation (`backend/app/imagegen.py`) also belongs to formvis. FormWeb lists formvis's generators (`GET /api/generate`): local models need no key, and cloud ones use the person's keys, kept in formvis. It starts a job (`POST /api/generate`) and follows it (`GET /api/jobs/{id}`). When the job finishes, it copies each picture into its assets with provenance (prompt, generator, licence, time) and asks formvis to forget its copy. Editing goes the other way through formvis's MCP endpoint. `open_file` puts the picture in the formvis window, which asks the person once to allow outside agents, and `export_image` returns the edited document as the element's new picture in one `node.update`.

Writing (`backend/app/writer.py`) uses the family's one language-model setting, kept in formvis. That is any OpenAI-compatible chat service: Ollama or LM Studio on the computer, or a hosted one with the person's key. FormWeb posts to formvis's `POST /api/llm/chat` with no tools; the key stays in formvis.
- **Copy:** returns suggestions only. The editor applies a suggestion after review with one `node.update`.
- **Site outline:** a site plan is JSON that `validate()` clamps to at most 4 pages, 6 sections per page and 4 items per section, with section kinds from a fixed list, links limited to `/`, `#` or http(s), and text lengths capped. Slugs are resolved against the existing pages before the person sees the outline.
- **Small models (v0.5.7):** when a model cannot write the outline as JSON, `plan()` drafts in guided mode: FormWeb lays out the pages and asks one short question per text ("About the website: ... Task: ..."), cleaning each answer and falling back to plain text when the model echoes the description. Copy marks a suggestion `unchanged` when the model hands the text or the request back. Every model call runs in a worker thread, so the editor stays responsive while a local model writes; access checks stay on the event loop.
- **References and revision (v0.5.7):** `reference()` reads a PDF's text with pypdf (at most 20 pages, 6,000 characters) or an image's main colours with Pillow, and keeps no copy. Text goes to the model as facts; colours go into the outline's `palette`, used for the accent when the site has no readable brand or library colour. Revising sends the current outline and the person's instruction; a failed revision leaves the outline as it was.
- **Build:** `build_commands()` turns the plan into one engine batch. `page.add` takes caller-chosen `id` and `root` so the same batch can fill the root, and the batch is capped at the engine's 500-command limit. Each page gets exactly one `h1`, with the first section heading promoted when there is no hero. The button accent is the most saturated brand or library colour that reaches 3:1 contrast on the section, else orange, with text colour chosen from its luminance.
