# Rust engine

The engine owns the website document independently of the browser. It accepts a line-oriented request protocol through the core executable and returns one response per request. Logs belong on stderr; stdout contains protocol responses only.

| Source | Role |
| --- | --- |
| `native/Cargo.toml` | Workspace and shared release metadata |
| `native/crates/formweb-model/` | Typed document data and validation |
| `native/crates/formweb-engine/` | Command application, revision and history |
| `native/crates/formweb-export/` | Website files and audit |
| `native/crates/formweb-core/` | stdin/stdout bridge |
| `backend/app/engine.py` | Serialized subprocess client |

A request is `{id, method, params}`. A reply carries `{id, ok, result, rev}` or an error. Methods are `hello`, `state`, `new`, `load`, `validate`, `checkpoint`, `restore`, `exec`, `batch`, `export` and `audit`. `state` contains `site`, `revision`, `canUndo` and `canRedo`; `hello` supplies the actual command list. Checkpoints preserve bounded undo/redo snapshots; restore validates every document and restores acknowledged history. `validate` checks a candidate without mutating the active site.

Commands cover node and page editing, tokens, component creation/insertion, collection creation and item changes, locales, site settings and history. Obtain the live command list from `formweb://commands` or the core's `hello` response before extending clients.

## Creative commands (v0.7.0)

| Command | Effect |
| --- | --- |
| `cms.list` | `{node, patch}` merges `facets`, `sortOptions`, `slider`, `pageSize` and the older query keys into `extensions.cms.lists[node]`; null removes a key |
| `slider.create` | `{parent, collection, perView?}` inserts a bound slide card and its slider config |
| `cms.reorder`, `cms.move` | manual item order; the stored order is the default list order |
| `cms.folder` | collection folders in `extensions.cms.folders`, one folder per collection |
| `table.insert`, `table.row.add`, `table.row.remove`, `table.col.add`, `table.col.remove` | semantic tables (caption, thead with th, tbody, td) |
| `layout.convert` | flex or grid using site settings `layoutGap`, `layoutPadding`, `layoutColumns` |
| `text.script` | span to `sup` or `sub`, signed baseline shift |
| `form.steps` | group form children into validated steps |

Facets and sort options are validated against field paths (reference paths such as `author.name` included). The exporter renders them as a labelled form plus per-item data, and `runtime` filters, sorts and keeps state in the URL. Collection list nesting is capped at 6 levels and a page may render 250000 nodes. `audit` adds `a11y.link-empty`, `a11y.button-empty`, `a11y.heading-order`, `a11y.contrast`, `a11y.svg-title`, `a11y.svg-decorative`, `a11y.table-header` and `a11y.table-caption`. A site that uses form steps or file inputs always takes the extension export path, which carries the runtime for them.

## Mutation contract

`exec` applies one command. `batch` validates and applies several commands as one undoable transaction. Include `expectedRevision` when acting on state read earlier. A revision conflict requires another state read before retrying. Invalid parentage, broken references, unsupported data or unsafe export values must fail before history is committed.

Undo and redo change the authoritative document and revision. They must remain usable through the UI and through MCP. Failed operations must not consume an undo step.

`export` returns a manifest of path/content pairs and warnings. Output paths are relative to the site root and must never traverse outside that root. Rust emits the website behavior; Python persists the files or packages them into a ZIP.

`audit` reports observable issues and counts. It is an authoring aid, not a claim of complete browser accessibility or vendor parity. Visual and keyboard checks remain part of [[Verification]].
