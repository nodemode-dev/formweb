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

The tools are `get_site`, `apply_commands`, `history`, `audit_site`, `save_project`, `list_projects`, `open_project`, `export_site`, `publish_site` and `list_submissions`. The resources are `formweb://site` and `formweb://commands`. The live `tools/list` schema is authoritative for parameters.

## Authoring loop

Read the site and command catalogue, plan the required pages and responsive structure, apply atomic batches, inspect the editor at desktop/tablet/mobile widths, audit, save and export. Use `expected_revision` when applying commands from an earlier site read. Refresh stale state before retrying a revision conflict.

Publishing returns a versioned local URL. It does not deploy an external domain. Export returns a file path and manifest; verify the files exist before delivery. Form submissions stay in the local service.

Agent access defaults off. `FORMWEB_AGENTS=1` enables it for an explicitly configured local session. `FORMWEB_AUTH_TOKEN` can require a bearer token for MCP/control requests. The loopback bind and exact allowed-origin configuration remain service boundaries.

After changing canonical skills, run `./formweb agents sync` followed by `./formweb agents sync --check`. Canonical instructions live only under `.claude/skills`; edit there, never in the mirror.
