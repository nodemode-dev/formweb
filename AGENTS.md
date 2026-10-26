# FormWeb development contract

Read CLAUDE.md, the matching planning sidecar and local HASHOUT logs before editing. Skills: `formweb-skillset` for source changes, `formweb-editing` for single site edits through MCP, `formweb-harness` for multi-part site briefs (all under `.agents/skills`, mirrored from `.claude/skills`). Keep Rust authoritative for mutations, history, validation and exported sites. All UI and MCP commands call the same engine.

Edit existing source one region at a time against current reads. Preserve stable mounted DOM nodes, focus, scroll and reserved async space. Dark theme is applied before first paint. Use inline currentColor SVG icons, named style and z-index tokens, and loopback-only local servers.

Tests live in `tests/` folders (`backend/tests`, `native/crates/*/tests`) and run in CI. Write only the tests FAMILY_TEST_PLAN (formai_dev sidecar) or its successor names. Run real product paths and record exact observations; TEST_PLAN.md describes independent validation. No emojis or em dash in Markdown.

New commits use nodemode-ai [mackin@nodemode.ai], with separate coherent changes and the version commit last. Ship .git in formweb_vX.Y.Z.zip plus a matching planning sidecar. Never rewrite sibling history, store secrets, or claim cloud publication from a local URL.

## Breakpoints and the canvas (declined for patent risk, 2026-10-23)

Do not add back: breakpoint styles chosen from the editing canvas's own width (the canvas draws only the breakpoint picked from the list; a typed width sizes the frame); width-driven switching anywhere but the Live responsive preview, where the browser's media queries do it; breakpoints drawn as markers at locations on the canvas.
