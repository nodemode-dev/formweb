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

The process shell is `native/target/release/formweb-core` (`.exe` on Windows). `setup/install_core` compiles it. `backend/app/engine.py` serializes access to one process and retains the latest acknowledged state for restart recovery. An unacknowledged request is not reported as successful.

A change follows this sequence: the editor or agent submits commands; Python sends one JSON line to Rust; Rust validates and commits an atomic update; Python persists a history checkpoint and notifies authorized connected editors. The frontend patches existing controls and node representations. The design canvas renders authored data for editing. Preview loads the actual compiler output through a token-scoped opaque iframe, retaining the preceding frame until the replacement loads. Published top-level pages are the final place to verify visitor sessions and consent.

## Contract for new capabilities

Document behavior belongs in Rust. Backend code owns filesystem/network service boundaries. UI code submits operations and renders state; it must not silently repair an invalid document or implement a second command engine. Exported behavior must consume the same stored properties that the inspector edits.

Use stable ids, explicit revision checks for edits based on a read, and atomic batches when a group of changes must undo together. A rejected operation leaves the prior state, revision and history unchanged. Extend MCP using the same service path as the editor, and update the harness workflow if the tool contract changes.

New features are modules at the existing layer seams. Read `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` before editing those layers; for the Rust engine read [[Engine]] and the sidecar's native log. As in formvis and formlit, planning documents, the root log and evidence ship in the planning sidecar, and only the frontend and backend logs stay in the tree.
