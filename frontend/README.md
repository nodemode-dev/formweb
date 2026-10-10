# FormWeb frontend

Vanilla TypeScript and Vite editor for the Rust-owned FormWeb site document. Start from the repository root with `./formweb install` and `./formweb boot`.

| Service | Address |
| --- | --- |
| Vite editor | `http://localhost:5240` |
| FastAPI and production editor | `http://127.0.0.1:8240` |
| Vite preview | `http://localhost:5241` |

Both Vite modes bind locally with `host: false` and require their exact ports. Node 22.12.0 or later is required. Dependencies are pinned. `npm run build` performs strict TypeScript checking and production bundling; the backend serves the resulting `dist` directory.

Click a layer or canvas element to select it. Design edits layout, typography, appearance and breakpoint-specific CSS. Content edits text, attributes, CMS bindings, interactions and hierarchy. Page edits routes and SEO. Double-click unbound text to edit the default locale. Insert adds real elements and uploads raster images. Component capture and insertion use engine commands.

Project actions create, save, open, import and download editable `.fweb` source. Export downloads static site files; Publish creates an immutable local version. CMS and Locales edit their stored data. Design system tokens export as CSS variables. Agents toggles the backend's MCP access, which shares the editor's Rust state and undo history.

The shell and inspector controls stay mounted. Lists and website nodes update by stable IDs, with individual attributes/styles patched in place. The canvas iframe has one initial document, disables scripts and form navigation, and preserves inactive page nodes. Published CMS collections repeat with scoped fields in both canvas and export.

Preview now loads the actual compiled runtime for the selected page and locale in persistent isolated iframe slots. The preceding design or runtime remains visible until the replacement loads. Forms, advanced CMS output, states, timelines, overlays and integrations use their exported implementation. The design canvas remains the script-free selection surface; advanced runtime effects are reviewed in Preview. The interaction inspector edits its first legacy action while Studio exposes the advanced behavior group.

Studio adds validated workflows for responsive design, linked component properties/variants/slots and pinned libraries, collection schema/relations/query/templates/CSV, localization/SEO, form delivery, release promotion/rollback, branch review/conflict resolution, comments/roles/presence and configurable provider adapters. Exact examples and service result panels expose their real consuming operations. Providers require server environment configuration; their returned status is displayed without claiming unobserved external completion. See [ADVANCED_GUIDE.md](ADVANCED_GUIDE.md) for workflow steps, schemas and runtime boundaries.

For an API configured with `FORMWEB_AUTH_TOKEN`, open Settings, enter the token and save. The editor stores it for the current browser tab and establishes the local HttpOnly session needed by live events. Themes are applied before paint.

See `HASHOUT_LOG.md` for the source map, DOM stability rules, stacking tokens and verification record. No self-authored test files are included.
