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
