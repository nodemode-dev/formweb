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

A page names its root node and carries `seo.title`, `seo.description` and optional `seo.noindex`. A node carries `styles` plus breakpoint overrides, optional component identity, optional CMS binding and interactions. Child references use stable ids; a node is not an arbitrary nested DOM string.

Default breakpoints are desktop, tablet (991 px) and mobile (767 px). The responsive preview uses these same profiles. Stored overrides must be consumed by exported CSS.

Collections contain typed fields and items with id, slug, values and status. Locales map strings to translated values. Interactions store a trigger (`click`, `hover` or `scroll`) and one implemented action (`toggle-class`, `navigate` or `fade-in`) with its parameters.

## Persistence contract

The backend's `backend/app/store.py` stores projects, current-session metadata, immutable publication records and form submissions in `backend/data/formweb.sqlite3` by default. Set `FORMWEB_DATA_DIR` before launch to use a different location. Database and export output are local data and are not committed into source archives.

Imported JSON is untrusted input. Validate schema, node structure, routes, references, style values and size before replacing the active document. A refused import must preserve the previous editable site and history. Do not infer editable source from an exported HTML file.
