# Agents and MCP

FormWeb's MCP server uses the official Python SDK. Streamable HTTP and stdio reach the same running FastAPI service and Rust-owned active site as the editor. An agent's acknowledged change therefore appears in connected editor windows.

| Source | Purpose |
| --- | --- |
| `backend/app/mcp_catalog.py` | Tool descriptions and schemas |
| `backend/app/` | SDK server and shared service calls |
| `setup/mcp_stdio.py` | stdio proxy into the running HTTP server |
| `setup/agents.py` | Exact skill mirror and project wiring guidance |
| `.mcp.json` | Claude project configuration |
| `.codex/config.toml` | Codex project configuration |
| `.cursor/mcp.json` | Cursor project configuration |
| `.claude/skills/formweb-harness/` | Authoring workflow pack |
| `.agents/skills/formweb-harness/` | Byte-identical mirror for other clients |

Run `./formweb boot` or `./formweb serve`, enable Agents in the editor, and trust this project in the client. `./formweb agents install` prints the included project configuration paths and launch commands; it does not change user-level configuration. Windows clients should use an absolute `formweb.bat` path and `mcp` argument.

The server exposes 81 tools, 17 resources and 5 prompts (v0.5.5; `generate_image` and `edit_in_formvis`, both through formvis, are the newest; v0.5.4 added `search_stock` and `insert_stock`, v0.5.3 `remove_background`, v0.5.2 the team library tools). `generate_image` waits up to 90 seconds, below the stdio proxy's 130, and otherwise returns a job to pass back. Seven domain tools (`edit_nodes`, `edit_pages`, `edit_styles`, `edit_components`, `edit_cms`, `edit_locales`, `edit_site`) are generated from the engine catalogue in `backend/app/mcp_domains.py` and list each command's parameters; edits return a compact summary unless `detail: "site"` is passed. Every tool has a title; `get_site`, `apply_commands` and `edit_nodes` carry `_meta["anthropic/alwaysLoad"]` so Claude Code loads them without a tool search. Errors carry a `next` sentence the agent can act on. Resources include `formweb://site/tree` (outline with IDs), `formweb://selection` (the editor's selection, reported while Agents is on), `formweb://tokens` and `formweb://audit`. Prompts: build_page, edit_copy, responsive_review, publish_site, recover_session. The stdio proxy forwards the server's instructions and prompts and waits up to 130 seconds per call so approval waits finish. The original authoring tools now share the catalog with content portability, library review, form delivery, releases, branches, comments/access, code compilation and provider workflows. `backend/app/advanced_catalog.py` and `backend/app/providers/catalog.py` define the additions. The live `tools/list` and `resources/list` are authoritative; use the [agent quick start](../../docs/AGENT_QUICKSTART.md) and [advanced Studio guide](../../docs/ADVANCED_GUIDE.md) for the actual operation loop.

## Authoring loop

Read the site and command catalogue, plan the required pages and responsive structure, apply atomic batches, inspect the editor at desktop/tablet/mobile widths, audit, save and export. Use `expected_revision` when applying commands from an earlier site read. Refresh stale state before retrying a revision conflict.

Publishing returns a frozen versioned local URL; promotion and rollback select its active release. Remote deployment and domain status use separate configured provider tools and retain the provider's actual state. Export returns a file path and manifest; verify files before delivery. Form submissions persist locally before separately tracked signed delivery. Each MCP invocation derives its bearer identity from the SDK request headers and uses the same project roles as REST. Browser cookies do not authenticate MCP. Viewer reads and mutation denial were observed with an independent SDK client.

Agent access defaults off. `FORMWEB_AGENTS=1` enables it for an explicitly configured local session. `FORMWEB_AUTH_TOKEN` can require a bearer token for MCP/control requests. The loopback bind and exact allowed-origin configuration remain service boundaries.

## Substrate, Agent Connect and the terminal (v0.4.0)

Every caller reaches the engine through one substrate (`backend/app/substrate.py`): the editor's REST calls, MCP, `./formweb run` and the embedded terminal. `GET /api/substrate` lists the active substrate and its command catalogue; `POST /api/substrate/run` applies one command. Each request carries a channel (`human`, `agent` for `/mcp`, `terminal` when the `X-FormWeb-Channel: terminal` header is sent, as `./formweb run` does), stored with every activity row and shown in Agent Connect. The channel is attribution, not permission: roles still decide what an identity may do.

The external-substrate shim: set `FORMWEB_EXTERNAL_SUBSTRATE=package.module:factory`, where `factory(studio)` returns an object with `name`, `describe()`, `dispatch(command, params, expected_revision)` and `subscribe(listener)`. `FORMWEB_SUBSTRATE=<name>` makes it active. If loading fails, the editor starts on the built-in substrate and `GET /api/substrate` reports the error.

Agent Connect (the Agents rail button) holds the MCP switch, client cards that check and rewrite `.mcp.json`, `.codex/config.toml` and `.cursor/mcp.json`, approvals, the current identity and a live activity feed. With "Ask me before an agent deletes..." on, destructive MCP tools and `apply_commands` batches that remove something wait up to 100 seconds for a person's decision. With "A reviewer must approve a release..." on, `promote_release` returns `pendingApproval` until a different identity with review rights approves it (FW-068); the local owner may approve their own.

The terminal (View > Terminal, Ctrl+`) is a shell in the FormWeb folder over a loopback WebSocket at `/api/terminal`, owner-only and available only while Agents is on; turning Agents off ends every session. Sessions survive collapsing the dock and reconnects (the last 64 KiB is replayed). It uses the standard library `pty` on macOS and Linux and pywinpty on Windows.

After changing canonical skills, run `./formweb agents sync` followed by `./formweb agents sync --check`. Canonical instructions live only under `.claude/skills`; edit there, never in the mirror.
