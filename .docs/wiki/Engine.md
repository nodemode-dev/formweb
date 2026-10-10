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

A request is `{id, method, params}`. A reply carries `{id, ok, result, rev}` or an error. Methods are `hello`, `state`, `new`, `load`, `exec`, `batch`, `export` and `audit`. `state` contains `site`, `revision`, `canUndo` and `canRedo`; `hello` supplies the actual command list.

Commands cover node and page editing, tokens, component creation/insertion, collection creation and item changes, locales, site settings and history. Obtain the live command list from `formweb://commands` or the core's `hello` response before extending clients.

## Mutation contract

`exec` applies one command. `batch` validates and applies several commands as one undoable transaction. Include `expectedRevision` when acting on state read earlier. A revision conflict requires another state read before retrying. Invalid parentage, broken references, unsupported data or unsafe export values must fail before history is committed.

Undo and redo change the authoritative document and revision. They must remain usable through the UI and through MCP. Failed operations must not consume an undo step.

`export` returns a manifest of path/content pairs and warnings. Output paths are relative to the site root and must never traverse outside that root. Rust emits the website behavior; Python persists the files or packages them into a ZIP.

`audit` reports observable issues and counts. It is an authoring aid, not a claim of complete browser accessibility or vendor parity. Visual and keyboard checks remain part of [[Verification]].
