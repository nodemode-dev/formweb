# Changelog

## 0.3.5 · 2026-10-11

Phase 5 of 9: inspector and canvas UX, and the zero-flash sweep.

- Display, Direction, Align, Justify, Wrap and Text alignment are one-click button groups. The breakpoint's own value is highlighted, a value inherited from desktop shows dashed, and clicking the highlighted value removes the override.
- Every style field shows Reset while it holds an override at the current breakpoint.
- The canvas header shows the path from the page to the selected element; click any step to select it.
- Saving Settings reconnects in place instead of reloading the page.
- The parity page records v0.3.4 and v0.3.5 in its release history (still 64 of 79); README and docs link the comparisons folder, so releases need no link edits.

## 0.3.4 · 2026-10-11

- One left rail: a collapsed left panel now disappears instead of becoming a second icon strip, the rail's Pages and layers and Insert buttons open and close it, and the panel's duplicate tab row became a title.
- The parity page now uses the form family format, with a "what changed since the last page" table and every release's score (v0.1.0 24.5 of 65 through v0.3.4 64 of 79). It is built from `docs/comparisons/data/formweb-parity.json` by the new `./formweb comparisons build` (`--check`, `--json`) and placed in the FormAI matrix with `embed`.
- Vendor scores now count an integration as half, as the family pages do: Framer 74.1, Webflow 84.8, Adobe Express 29.1 and Canva 46.2 percent; FormWeb is unchanged at 81.0.

## 0.3.3 · 2026-10-11

Phase 4 of 9: a left minirail and collapsible panels, as in formvis.

- New minirail on the far left: Pages and layers, Insert, Design system, CMS, Localization, Website studio, SEO and accessibility, Publish and Agents, with Settings at the bottom. The chevron at the top shows or hides labels.
- Both side panels collapse to a slim icon strip (chevron in the panel header, Window menu, Ctrl+[ and Ctrl+]); a strip icon reopens the panel on that tab.
- Inspector sections collapse from their titles.
- Workspace presets (Design, Content, Build, Focus) in the title bar and Window menu remember their own panel layout across reloads; Window > Reset this workspace restores the default.

## 0.3.2 · 2026-10-11

Phase 3 of 9 plus a repository cleanup: FormWeb's tree and title bar now match formvis and formlit.

- New family title bar: brand mark, File, Edit, Insert, Page, Arrange, CMS, View, Window and Help menus with keyboard navigation, then undo, redo, settings, theme and command search (Ctrl/Cmd+K).
- Every menu action has a stable command id; agents can list and run them through `window.formweb` in the editor window, and the agent quick start documents them.
- Planning, research, audit, verification and observation files moved to the planning sidecar. `docs/` now holds only user guides and the current comparison, and HASHOUT logs stay only in `frontend/` and `backend/`, as in the sibling apps.

## 0.3.1 · 2026-10-11

Phase 2 of 9: FormWeb now uses the form family's theme system, and scrollbars are hidden everywhere in the editor.

- The editor uses the family token set and the same fifteen appearance profiles as formvis and formlit (Settings > Editor theme), applied before first paint, with Inter and JetBrains Mono bundled.
- The window stays hidden until the first render is in place, so a hard reload shows no theme, font or layout flash.
- Every scrollbar in the editor is hidden while scrolling still works, including inside the canvas.
- New Page inspector toggle, Whole site > Hide scrollbars on the published site, for owners who want the same on their own site. Agents set it with `site.update` and `settings.hideScrollbars`.
- New `./formweb comparisons status|embed` release command (with `--check` and `--json`) puts the release comparison into the FormAI matrix; the matrix now carries the four-vendor v0.3.0 page.

## 0.3.0 · 2026-10-11

First release of the v0.3.x sprint (phase 1 of 9). The family comparison now measures FormWeb against Framer, Webflow, Adobe Express and Canva.

- Added Adobe Express and Canva lanes, tiles, table columns and CSV columns to docs/comparisons/FormWeb-Parity_v0.3.0.html, backed by official pages fetched on 2026-10-11.
- Added 14 requirements (FW-066 to FW-079) drawn from documented Express and Canva web features; they are FormWeb integration targets, several sourced from formvis and formlit, and are graded none until built.
- The original 65 rows, their Framer and Webflow evidence and FormWeb acceptance are unchanged; FormWeb reads 64 of 79 weighted.


## 0.2.1 · 2026-10-11

Restored the supplied Form family comparison style in both HTML deliverables: grouped color-coded capability lanes, the 65-row evidence table, warm light/dark themes and individual FormWeb, Framer and Webflow percentage tiles. Retained the original catalog, sibling comparisons and v0.2.0 acceptance; competitor documentation percentages are explicitly separate evidence measures.

- Fixed consolidated theme inheritance and added a stable parent theme control.
- Fixed capability links that navigated the embedded frame, and synchronized its height before scrolling from an empty filter.
- Bounded malformed provider URL errors and durably marked failed translation reviews instead of leaving them loading.
- Added comparison acceptance to the validated 14-file harness and mirrored reference.
- Corrected the stale root VERSION marker and aligned Rust, backend, frontend, MCP and harness versions at 0.2.1.

Locked builds and actual provider/SDK operations passed. All 12 security-enabled throttled Chromium comparison checks passed with zero page errors. Downloaded font glyphs, live hosting/domain/TLS/CDN, completed payments, platform launchers and automatic skill activation remain unverified. See docs/RELEASE_v0.2.1.md and the matching planning sidecar for observations and limits.

## 0.2.0 · 2026-10-10

Added consuming advanced workflows to the existing Rust, TypeScript/Vite and FastAPI architecture. The immutable 65-target audit now records 63 full and two partial requirements. Real managed hosting/domain/TLS and payment/shipping/tax outcomes remain operationally unverified.

- Added typed design systems, custom responsive layouts, component props/variants/slots/reset/detach and reviewed immutable library pins.
- Added CMS detail routes, typed filters and relations, selected bindings, pagination/empty states, exact CSV portability and localized content/media/routes.
- Added isolated compiled Preview, typed code-component builds, states/timelines/overlays, real constrained form submission and explicit tracking.
- Added durable native history/assets, project/branch checkpoints, conflict review, attributed roles/comments/presence, scoped deletion and frozen release promotion/rollback.
- Added typed redirect statuses and manifest-derived localized Preview/publication entries; private assets follow their owning page while public assets remain usable.
- Added durable signed delivery/retention and configured deployment, domain, translation, fetch and commerce adapters, plus independent visitor membership and consented experiment metrics.
- Expanded actual official-SDK MCP to 61 tools and 13 resources; the validated 14-file harness retains six roles with advanced references.

Locked release builds and consuming Linux API/SDK/security-enabled throttled Chromium observations passed. Final source hashes, diagnostics, independent acceptance plans and matching archives are recorded in the planning sidecar. Earlier audits and Git history are retained.

## 0.1.0 · 2026-10-10

Initial FormWeb release, researched against Framer and Webflow and structured from the read-only FormDesign v0.19.0 and FormPath v0.23.0 references.

- Added an authoritative four-crate Rust engine with 17 validated commands, revisions, atomic batches, session history, components, CMS, locales, audit and static compilation.
- Added the TypeScript/Vite editor with persistent keyed DOM, responsive authoring, content controls, raster intake and project/output workflows.
- Added FastAPI persistence, editable .fweb files with embedded owned media, immutable local publications and frozen-schema form collection.
- Added actual official-SDK MCP HTTP tools/resources and a stdio proxy operating the same engine, with access gating and conflict checks.
- Added the validated FormWeb harness, portable mirror, launchers, Windows twins, manuals, wiki and preserved dependency notices.
- Added the 65-target researched parity audit and comparison HTML. Strict coverage is 24.5/65: 11 full, 27 partial, 27 absent. Advanced infrastructure and workflow gaps remain explicit.

Locked Rust release compilation, TypeScript/Vite compilation and manual API/MCP/editor checks passed on Linux. Windows/macOS launchers, hosted CI, managed hosting, external providers and automatic skill activation were not executed.
