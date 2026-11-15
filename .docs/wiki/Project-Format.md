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

The backend's `backend/app/store.py` stores projects, current-session metadata, immutable publication records and form submissions in `backend/data/formweb.sqlite3` by default. Downloaded `.fweb` envelopes use format `com.nodemode.formweb`, version 1, editable `site`, bounded `checkpoint` history and embedded raster `assets`. Assets include the union referenced by the current document and retained history, each with SHA-256 identity, MIME type and base64 bytes. Import validates every snapshot and asset before replacing authority. Legacy document-only imports remain supported and have no saved history. Version 1 files are limited to 64 MiB and individual images to 8 MiB. Since 0.19.4 a project whose version 1 envelope would pass 64 MiB downloads as a version 2 `.fweb`, a zip with `project.json` first (format, version 2, site, checkpoint, the asset list) and then `assets/<id>` stored uncompressed, built in `DATA_DIR/tmp` and streamed. `POST /api/load` takes it as `application/zip` up to 512 MiB, spooled to disk, and checks it in `backend/app/assets.py` before storing anything: at most 500 assets listed once, every member exactly `assets/<listed id>`, digest, per-type size and mime. Since 0.19.5 a version 2 load streams each asset into a staged file once while hashing it and renames that file into place (larger assets get the same checks on their first 64 bytes), off the event loop, so the 74 MiB two-video project loads in about 0.15 s and health answers within a few milliseconds. Projects that fit still save as version 1, and MCP stays on version 1. Set `FORMWEB_DATA_DIR` before launch to choose another location. Runtime databases and generated output are omitted from source archives.

Since 0.20.4 the same importers open a `.fpub`, the single-file package FormPublisher saves for a build. `backend/app/fpub.py` recognises it by its first zip entry, `fpub.json` (no `.fweb` archive starts with that name), and requires exactly `fpub.json`, `publish.json`, `site.zip` and, when signed, `site.zip.sig`, in that order. It checks format `formpublisher-package` version 1, the package record, that `publish.json` repeats the record, and that `site.zip` matches the recorded size and sha256 (streamed, within the 512 MiB archive limit). It then reads `site.formweb.json` from `site.zip` and stages the assets the site references (each given the usual size, digest and magic-byte checks, at most 500), returning a version 2 project object that `POST /api/load` restores like a `.fweb` archive. Nothing is stored until all checks pass and staged files are removed on any refusal. A `.fpub` with no `site.formweb.json` is refused with a message pointing to FormPublisher. FormWeb does not verify `site.zip.sig`; FormPublisher does when it opens the same file.

Imported JSON is untrusted input. Validate schema, node structure, routes, references, style values and size before replacing the active document. A refused import must preserve the previous editable site and history. Do not infer editable source from an exported HTML file.
