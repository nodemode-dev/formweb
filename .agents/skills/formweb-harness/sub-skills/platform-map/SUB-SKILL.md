---
name: platform-map
description: "Orients an agent to how FormWeb is assembled: Rust engine, FastAPI backend, editor, MCP transports, agent substrate, channels, terminal and file locations. Use before operating FormWeb when you need to know where a thing lives or which port or endpoint to call."
---

# Platform Map

## Purpose

Give an operating agent a correct mental model of FormWeb so it picks the right surface and finds the right file. This is orientation only. Route actual work to the sibling that owns it.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Connect an agent client | `/mcp` Streamable HTTP, or stdio proxy | `./formweb mcp`; `./formweb agents install` prints wiring | Agent Connect, Window menu (`window.agents`) |
| Turn agent access on or off | none | `FORMWEB_AGENTS=1` at launch | Agent Connect switch (`agents.toggle`) |
| List engine commands | resource `formweb://commands` | `./formweb run --list`; `GET /api/substrate` | none |
| Apply one engine command | `apply_commands` or an `edit_*` domain tool | `./formweb run [command] [key=value]`; `POST /api/substrate/run` | menu actions, listed by `window.formweb.commands()` |
| See who changed what | resource `formweb://activity`, tool `get_activity` | `GET /api/substrate/activity` | Agent Connect activity feed |
| Open a shell in the project | none | `GET /api/terminal/status`; WebSocket `/api/terminal` | View > Terminal (`view.terminal`), `terminal.new` |
| Check the install | none | `./formweb doctor` | none |

## Preconditions

The backend is running (`./formweb boot` for dev, `./formweb serve` for the built editor) and Agents is enabled by the person. Without Agents, `/mcp` is refused. Read pack root `references/architecture.md` for the document model and pack root `references/mcp-workflows.md` for connection setup.

## Procedure

1. Learn the layers. The Rust engine owns all site state: `native/crates/formweb-model` (pages, nodes, invariants), `formweb-engine` (atomic commands, revisions, undo), `formweb-export` (HTML, CSS, JS output) and `formweb-core` (JSON-lines process shell). The FastAPI service in `backend/app/` supervises that process, persists projects and serves REST and MCP. The Vite editor in `frontend/src/` only submits operations and renders state. Why it matters: a second copy of the site never exists, so a fresh `get_site` is always the truth.
2. Pick a transport. HTTP clients use `/mcp`; stdio clients run `./formweb mcp`, which proxies into the same running service. Project wiring files are `.mcp.json` (Claude), `.cursor/mcp.json` (Cursor) and `.codex/config.toml` (Codex). Agent Connect can check and rewrite them.
3. Understand channels. Every request is tagged `human` (editor), `agent` (`/mcp`) or `terminal` (`./formweb run`, via the `X-FormWeb-Channel` header). The channel is attribution in the activity feed, not permission; roles decide what an identity may do.
4. Know the discovery surfaces. Resources: `formweb://site/tree`, `selection`, `tokens`, `audit`, `commands`, `site`, `activity`. Prompts: build_page, edit_copy, responsive_review, publish_site, recover_session. Prefer the live `tools/list` and `resources/list` over any list written here.
5. Route the work. Layout and components go to sibling `layout-builder`; pages and site settings to sibling `site-and-pages`; tokens and breakpoints to sibling `style-and-tokens`; components to sibling `components`; CMS to sibling `cms-steward`; translations to sibling `localization`; SEO and accessibility to sibling `seo-a11y-auditor`; forms to sibling `forms-operator`; motion and widgets to sibling `interaction-builder`; branches and review to sibling `branch-and-review`; approvals, activity and the terminal to sibling `agent-connect-and-terminal`; save, export and publish to `release-operator`; failures to `recovery-auditor`.

## Where each thing lives

| Thing | Location |
| --- | --- |
| Site state and history | Rust process `native/target/release/formweb-core`, mirrored to the editor |
| Saved projects, sessions, submissions | `backend/data/formweb.sqlite3` (override with `FORMWEB_DATA_DIR`) |
| Portable project | `.fweb` file (download or `save_project`); the editor and `POST /api/load` also open a `.fpub` package made from a FormWeb site (FormWeb does not check its signature, FormPublisher does) |
| Uploaded assets | `backend/data/assets` |
| Static exports | `backend/data/exports` |
| Local publications | `backend/data/publications/[slug]/[version]` |
| Compiled previews | `backend/data/previews` |
| Page passwords | hashes in the service database, never in the site or `.fweb` |
| Agent skills | `.claude/skills/formweb-harness` (canonical), `.agents/skills` (mirror) |

## Ports and endpoints

| Endpoint | Purpose |
| --- | --- |
| `127.0.0.1:8240` | FastAPI backend, built editor via `./formweb serve`, port set by `FORMWEB_PORT` |
| `localhost:5240` | Vite dev editor from `./formweb boot` or `./formweb frontend` |
| `/mcp` | MCP over Streamable HTTP |
| `./formweb mcp` | MCP over stdio, proxied to the backend |
| `GET /api/substrate`, `POST /api/substrate/run`, `GET /api/substrate/activity` | Command catalogue, run, activity |
| `/api/terminal` | Owner-only terminal WebSocket, only while Agents is on |
| `GET /api/qr`, `/api/page-passwords`, `/api/assets` | QR images, route passwords, uploads |

## Gate

The agent can state which layer owns the thing it is about to change, which transport it will use, and which sibling takes the work. Nothing was mutated from this skill.

## Hands back

The chosen transport, the confirmed backend port, whether Agents is enabled, and the sibling that receives the task.

## Owned resources

- Pack root `references/architecture.md`: layer and document rules.
- Pack root `references/mcp-workflows.md`: connection setup and ordered workflows.
- Pack root `references/advanced-service.md`: roles, branches, delivery and providers.
