# FormWeb

The Form family's visual website builder. Rust owns site documents and export; FastAPI owns persistence and transports; TypeScript/Vite renders the editor.

## Layout

`native/` is the authoritative engine, never replaced by frontend state. `backend/` owns its JSON-lines process. `assets/` is repository identity art, not app runtime media. Planning docs live in the matching release sidecar. Runtime user data stays outside source archives.

## Skills

`.claude/skills/formweb-harness` operates the running app through MCP. Start at `sub-skills/harness-director/SUB-SKILL.md`; its workflow specialists cover layout, content, interactions, publishing and recovery. `.agents/skills` mirrors the same pack.

Route app-operation work through the harness director. For source changes, read `.docs/wiki/Architecture.md` and the release sidecar first; the harness does not authorize source edits. Keep the engine/API/tool catalogue and their documentation consistent.
