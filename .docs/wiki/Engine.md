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

## Duplicating (0.19.4)

`node.duplicate {id, parent?, index?}` copies an element and its subtree, by default right after the original, in one undo step. `page.duplicate` and `node.duplicate` share `duplicate_node_entries`, which copies every node-keyed extension entry, now including `motion.scripts` (remapped, since steps target nodes), `code.sections`, `variables.inputs` and `variables.outputs` (copied as they are). It refuses a page root, a node or destination inside a linked component instance, more than 2,000 nodes and an index outside the children. The editor's Edit > Duplicate element (`Mod+D`, and `Shift+Mod+D`, which always duplicates) and the layers context menu run it.

The read-only core method `fragment {id}` returns an element fragment (`com.nodemode.formweb.fragment`, version 1: `root`, `nodes`, `entries`, `codeComponents`, `variables`, `locales`, `assets`, `source`; since 0.19.6 also `design: {tokens, textPresets, themes}` and `collections`, with the collections that carried collections reference, the variables `set-variable` actions name and the form configuration; past 500 items a collection keeps its first 500 plus every item a binding, list filter or reference names; paste adds when the site lacks them and keeps the site's own on a clash, with a warning). Its entries come from the one `NODE_KEYED` list that `duplicate`, page copy, `fragment` and paste share. It refuses a page root, a node in or holding a linked component instance, and more than 2,000 nodes. `node.paste {fragment, parent?, index?}` checks format, version, size, tree and entries, inserts under fresh ids (last under `parent`, the first page root by default, or at `index`) with suffixed html ids, adds missing code component definitions and variables, keeps the site's own when they differ and reports that in a `warnings` list on the batch state, refuses code sections into a site that has not allowed them, validates, and is one undo step. `remap_json` remaps values only and never renames object keys, so a node called `stage` inside a scene survives a copy; `remap_definition` does the one real key rename (variant node maps in component definitions) for library import and update.

## Mutation contract

`exec` applies one command. `batch` validates and applies several commands as one undoable transaction. Include `expectedRevision` when acting on state read earlier. A revision conflict requires another state read before retrying. Invalid parentage, broken references, unsupported data or unsafe export values must fail before history is committed.

Since 0.19.3 a batch defers the extension-group checks to one validate at its end and synchronizes text presets, linked components and pruning once at its end, except when it contains a `component.*` command, whose instances must materialize between steps. The document it leaves is byte-identical to the per-command path, failures are still atomic with the same messages, and a whole starter site now fits inside the backend's 30 second engine limit.

Undo and redo change the authoritative document and revision. They must remain usable through the UI and through MCP. Failed operations must not consume an undo step.

`export` returns a manifest of path/content pairs and warnings. Output paths are relative to the site root and must never traverse outside that root. Rust emits the website behavior; Python persists the files or packages them into a ZIP.

`audit` reports observable issues and counts. It is an authoring aid, not a claim of complete browser accessibility or vendor parity. Visual and keyboard checks remain part of [[Verification]].

## Wider vocabulary (0.19.3)

`native/crates/formweb-model/src/css.rs` holds the value checks for the properties added in 0.19.3: logical margins, paddings, insets, sizes and borders, `background-clip` (text included) with `-webkit-text-fill-color`, `writing-mode`, `text-orientation`, the scrollbar properties, text underline and decoration properties, `overflow-wrap`, `hyphens`, `appearance`, `resize`, `text-rendering`, `-webkit-user-select`, `fill`, `stroke` and `stroke-width`. Each runs after the shared safety check and accepts only its keywords, lengths, colours, `var(--ident)` and, where lengths are allowed, `calc()`, `min()`, `max()` and `clamp()`. `lib.rs` adds the attributes `enterkeyhint`, `inputmode`, `spellcheck`, `autocomplete` and svg `focusable`; `vector.rs` adds the svg tags `rect`, `circle`, `ellipse`, `line`, `polyline` and `polygon` with numeric geometry. A scene `offset` may be `var(--token)` or a `calc()` of lengths and tokens; `motion.js` reads the stage's computed `top`. The exact rules are in [ADVANCED_SCHEMA.md](../../docs/ADVANCED_SCHEMA.md).
