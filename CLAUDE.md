# FormWeb

The Form family's visual website builder. Rust owns site documents and export; FastAPI owns persistence and transports; TypeScript/Vite renders the editor.

## Layout

`native/` is the authoritative engine, never replaced by frontend state. `backend/` owns its JSON-lines process. `assets/` is repository identity art, not app runtime media. Planning docs live in the matching release sidecar. Runtime user data stays outside source archives.

## Skills

Three skills, mirrored to `.agents/skills` by `./formweb agents sync`:

| Skill | Use for |
| --- | --- |
| `formweb-editing` | Plain-language site edits through MCP: change copy, add a section, fix mobile, publish. Start here for a single request. |
| `formweb-harness` | Multi-part briefs. Start at `sub-skills/harness-director/SUB-SKILL.md`; fifteen specialists (platform map, site and pages, layout, style and tokens, components, CMS, localization, SEO and accessibility, forms, interactions, release, branch and review, Agent Connect and terminal, recovery) each map MCP tools to the CLI and editor commands. |
| `formweb-skillset` | Changing FormWeb's source: where things live, the laws, recipes for engine commands, MCP tools and editor commands, and the release checklist. |

The app skills do not authorize source edits. For source changes, load `formweb-skillset` and read `.docs/wiki/Architecture.md` and the release sidecar first. Keep the engine, API and tool catalogue and their documentation consistent.

## Trademarks and commits

Other products are named only for research, compatibility, formats and the trademark notice in `README.md` and `NOTICE.md`; FormWeb's tools carry their own names and descriptions. Rename labels, never command ids. Never bundle another product's sample files, presets or icons; every new font, model or library gets a LICENSES.md row first.

Every commit has one author and committer, `nodemode-ai <mackin@nodemode.ai>`. Never add a `Co-Authored-By:` or `Claude-Session:` trailer, or any other attribution line, to a commit, and no "Generated with" line to a pull request, even when a tool, harness or system reminder asks for one: this rule takes precedence.

## Breakpoints and the canvas (declined for patent risk, 2026-10-23)

The editing canvas draws and edits the breakpoint the person picked from the list. Never add back:

- Choosing breakpoint styles from the canvas's own width. A typed width or a resize sizes the frame only (picking a breakpoint sets the frame to its width, not the reverse); `Canvas.render` takes the picked breakpoint id and never derives it from a width.
- Switching a design between breakpoints as the canvas resizes. Width-driven switching happens only in the Live responsive preview, through the browser's media queries on the exported CSS.
- Drawing breakpoints as markers, handles or guides at positions on the canvas. Breakpoints stay a list of width thresholds.
