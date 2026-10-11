# Project format

A FormWeb site is a versioned JSON document, not generated HTML. The Rust model validates it and the exporter turns it into a website. Save preserves editable structure; export preserves browser output.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Format version, currently 1 |
| `id`, `name` | Site identity and display name |
| `pages` | Named routes with slug, root node id and SEO data |
| `nodes` | Stable-id node map with tag, text, children, attributes and styles |
| `tokens` | Named design values consumed by CSS |
| `breakpoints` | Responsive profiles with maximum widths |
| `components` | Named reusable roots |
| `collections` | CMS fields and items |
| `locales`, `defaultLocale` | Translation maps and default language |
| `settings` | Site-wide settings |
| `extensions` | Rust-validated design, components, libraries, CMS, localization, SEO, behaviors, forms, integrations and code groups |

A page names its root node and carries `seo.title`, `seo.description` and optional `seo.noindex`. A node carries `styles` plus breakpoint overrides, optional component identity, optional CMS binding and interactions. Child references use stable ids; a node is not an arbitrary nested DOM string.

Default breakpoints are desktop, tablet (991 px) and mobile (767 px). The responsive preview uses these same profiles. Stored overrides must be consumed by exported CSS.

Collections contain typed scalar and relation fields and items with id, slug, values and status. CMS extensions hold selected bindings, list queries, templates and localized item overrides. Locales and localization extensions supply translated strings, media and routes. Behavior extensions add pointer/focus states, actions, conditions, multi-target timelines and accessible overlays. The [Studio guide](../../docs/ADVANCED_GUIDE.md) contains the actual contracts; unsupported fields fail whole-document validation rather than silently becoming inert metadata.

## Persistence contract

The backend's `backend/app/store.py` stores projects, current-session metadata, immutable publication records and form submissions in `backend/data/formweb.sqlite3` by default. Downloaded `.fweb` envelopes use format `com.nodemode.formweb`, version 1, editable `site`, bounded `checkpoint` history and embedded raster `assets`. Assets include the union referenced by the current document and retained history, each with SHA-256 identity, MIME type and base64 bytes. Import validates every snapshot and asset before replacing authority. Legacy document-only imports remain supported and have no saved history. Native files are limited to 64 MiB and individual images to 8 MiB. Set `FORMWEB_DATA_DIR` before launch to choose another location. Runtime databases and generated output are omitted from source archives.

Imported JSON is untrusted input. Validate schema, node structure, routes, references, style values and size before replacing the active document. A refused import must preserve the previous editable site and history. Do not infer editable source from an exported HTML file.
