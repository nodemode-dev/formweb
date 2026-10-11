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

The server exposes 62 tools and 13 resources. The original authoring tools now share the catalog with content portability, library review, form delivery, releases, branches, comments/access, code compilation and provider workflows. `backend/app/advanced_catalog.py` and `backend/app/providers/catalog.py` define the additions. The live `tools/list` and `resources/list` are authoritative; use the [agent quick start](../../docs/AGENT_QUICKSTART.md) and [advanced Studio guide](../../docs/ADVANCED_GUIDE.md) for the actual operation loop.

## Authoring loop

Read the site and command catalogue, plan the required pages and responsive structure, apply atomic batches, inspect the editor at desktop/tablet/mobile widths, audit, save and export. Use `expected_revision` when applying commands from an earlier site read. Refresh stale state before retrying a revision conflict.

Publishing returns a frozen versioned local URL; promotion and rollback select its active release. Remote deployment and domain status use separate configured provider tools and retain the provider's actual state. Export returns a file path and manifest; verify files before delivery. Form submissions persist locally before separately tracked signed delivery. Each MCP invocation derives its bearer identity from the SDK request headers and uses the same project roles as REST. Browser cookies do not authenticate MCP. Viewer reads and mutation denial were observed with an independent SDK client.

Agent access defaults off. `FORMWEB_AGENTS=1` enables it for an explicitly configured local session. `FORMWEB_AUTH_TOKEN` can require a bearer token for MCP/control requests. The loopback bind and exact allowed-origin configuration remain service boundaries.

After changing canonical skills, run `./formweb agents sync` followed by `./formweb agents sync --check`. Canonical instructions live only under `.claude/skills`; edit there, never in the mirror.
