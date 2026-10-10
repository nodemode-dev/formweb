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

Editor Preview supports internal links and simple click/hover-entry actions. Use the exported or locally published site for real form submissions, scroll triggers, hover exit/focus and exact animation durations. The interaction inspector edits its first action while retaining other stored actions. Cloud hosting, collaboration, custom domains, analytics and commerce are outside this initial release.

For an API configured with `FORMWEB_AUTH_TOKEN`, open Settings, enter the token and save. The editor stores it for the current browser tab and establishes the local HttpOnly session needed by live events. Themes are applied before paint.

See `HASHOUT_LOG.md` for the source map, DOM stability rules, stacking tokens and verification record. No self-authored test files are included.
