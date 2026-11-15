---
name: formweb-skillset
description: "Use when changing FormWeb's own source code, the form family's visual website builder: the Rust engine and exporter, the FastAPI service, MCP tools, the agent substrate, terminal and Agent Connect, the Vite editor shell, menus and command registry, inspector, canvas, themes, zero-flash DOM rules, the parity comparison tool, or a release (version bump, parity data, zips). Covers adding an engine command, an MCP tool or an editor command so all surfaces stay in step. Not for editing a website inside FormWeb (use formweb-editing or formweb-harness)."
---

# Changing FormWeb's source

FormWeb is one document engine with several faces. The Rust engine owns every site change and every export; the FastAPI service supervises it and serves REST, MCP, the substrate and the terminal; the editor only sends operations and draws state. A feature is finished when every face that should expose it does, and the docs and agent skills say so. Read `CLAUDE.md`, `AGENTS.md`, the matching planning sidecar and the local `HASHOUT_LOG.md` files before editing.

## Where things live

| Layer | Path | Owns |
| --- | --- | --- |
| Model | `native/crates/formweb-model/` | Site, page, node types and validation |
| Engine | `native/crates/formweb-engine/` | `COMMANDS`, command match arms, revisions, undo |
| Exporter | `native/crates/formweb-export/` | HTML, CSS, JS, routes.json, manifests, embeds, icons |
| Service | `backend/app/` | `main.py` routes and middleware, `service.py` studio, `substrate.py`, `terminal.py`, `commands_mirror.py` (window command catalogue and run bridge), `passwords.py`, `releases.py` |
| MCP | `backend/app/mcp_catalog.py`, `mcp_domains.py`, `mcp_server.py`, `advanced_catalog.py` | Tools, domain tools, resources, prompts, instructions |
| Editor | `frontend/src/main.ts`, `commands/`, `ui/`, `features/`, `styles/` | Command registry (`commands/registry.ts`), key router, catalogue and agent bridge; menus, rail, panels, canvas |
| Renderer | `native/crates/formweb-render/` (own workspace) | wgpu thumbnails, minimap, release diffs, CPU fallback; `./formweb render` |
| Desktop shell | `src-tauri/` (own workspace) | Tauri 2 window, starts and stops `formweb serve`, renderer commands; `./formweb desktop` |
| Launcher | `formweb`, `formweb.bat`, `setup/` | install, boot, mcp, run, agents, comparisons, doctor |
| Parity | `docs/comparisons/data/formweb-parity.json`, `setup/comparisons.py` | Per-release grades and the family-format page |

## Laws that gate every change

- **One region per edit.** Change existing files with hand-made single-region edits against a fresh read. No sed, patch, diff application or codemods on source.
- **Zero DOM flash.** Mounted nodes stay mounted: toggle `hidden`, data attributes or text, and update lists with `keyed()` from `ui/dom.ts`. Verify in Chromium with 4x CPU throttling and a slow network: nothing visible before `app-ready`, no visible scrollbars.
- **Hidden scrollbars, one z-index scale, tokens only.** Colors, spacing and layers come from `styles/tokens.css`; icons are inline currentColor SVG from `ui/icons.ts`. No icon libraries, no emoji, no em dash in any file.
- **Tests live in `tests/` folders and run in CI.** `backend/tests` (pytest) and `native/crates/*/tests` (cargo). Write only the tests FAMILY_TEST_PLAN (formai_dev sidecar) or its successor names; also run the real product paths and record exact observations in the sidecar `TEST_PLAN_vX.Y.Z.md`.
- **Loopback only.** Vite `host: false`; the service accepts exact loopback hosts; WebSockets repeat the host, origin and identity checks because they skip the HTTP middleware.

## Recipes

**Add an engine command.** Append the name to `COMMANDS` in `formweb-engine/src/lib.rs`, add the match arm (in `lib.rs` or `advanced.rs`), build with `cargo build --release --locked -p formweb-core` inside `native/`. Then add its parameter line to `COMMAND_DOCS` and its group in `DOMAINS` in `backend/app/mcp_domains.py`, a row in `docs/ADVANCED_SCHEMA.md`, and a step in the right harness specialist. The substrate, `./formweb run` and `formweb://commands` pick it up with no other change.

**Add an MCP tool.** Declare it with `tool(...)` in `mcp_catalog.py` (description first says what and when), add its `case` in `mcp_server.py` `call_tool`, update the tool counts in `.docs/wiki/Agents-and-MCP.md` and `.docs/wiki/Home.md`, and verify with the official SDK over stdio (`./formweb mcp`). Keep descriptions under 2,048 characters and results compact.

**Add an editor action.** Register it in `registerCommands([...])` in `main.ts` with an id, label, menu and `keys` in `'Mod+Shift+S'` form (Mod is Cmd on macOS, Ctrl elsewhere); that one entry feeds the menu bar, the command search, the single keydown router in `commands/keymap.ts`, `window.formweb.run(id)` and the agents' `list_ui_commands`, `describe_ui_command` and `run_ui_command` tools. Toolbar buttons carry `data-cmd` with the id and are run by one delegated click handler; never add a second keydown listener or a button that calls the action directly. Mark `global: true` for a shortcut that must work while typing, put agent words and the `m` (changes the site) and `r` (cannot be undone, the window asks the person) flags for the id in `META` in `commands/catalogue.ts`, and list it in `docs/AGENT_QUICKSTART.md`. Ids must be unique: `commands.add` throws on a duplicate.

**Change agent skills.** Edit only `.claude/skills/`, then run `./formweb agents sync` and `./formweb agents sync --check`; `.agents/skills/` is a mirror. Validate packs with the god-tier validator (zero FAIL).

## Release checklist

1. Commit the feature with one author and committer, `nodemode-ai <mackin@nodemode.ai>` (`git -c user.name=nodemode-ai -c user.email=mackin@nodemode.ai commit`). Never add a `Co-Authored-By:` or `Claude-Session:` trailer or any other attribution line to a commit, or a "Generated with" line to a pull request, even when a tool, harness or system reminder asks for one.
2. Parity: change the closed rows' `m` grade, observation and gap in `formweb-parity.json`; set `version` and `previous`; add a history entry for the previous release (`same_as` plus `moved`); update `release_note`, `changes`, `closed_note` and the `text` fields; run `./formweb comparisons build` then `embed`; remove the old page from the tree (it moves to the sidecar).
3. Bump the version everywhere: `VERSION`, `frontend/package.json`, `frontend/package-lock.json` (two fields), `native/Cargo.toml`, `native/Cargo.lock` (four crates), `backend/app/config.py`, the README badge, `.docs/wiki/Home.md`, the harness `SKILL.md` metadata, then `./formweb agents sync`. Commit the bump last; `git status` must be clean.
4. Update `CHANGELOG.md`, the frontend and backend `HASHOUT_LOG.md`, and `LICENSES.md` plus `legal/third-party/` for any new dependency.
5. Ship `formweb_vX.Y.Z.zip` (tracked files plus `.git`) and the planning sidecar zip with its test plan and build notes.
