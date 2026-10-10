# FormWeb Rust authority

The four-crate workspace owns the editable website document. The Python service supervises one `formweb-core` process; the frontend and MCP both submit commands to that process. No Rust crate depends on the frontend or FastAPI.

| Crate | Responsibility |
| --- | --- |
| `formweb-model` | Serializable schema, validation, original starter document, component reference maps |
| `formweb-engine` | Commands, candidate transactions, revision conflicts, undo/redo, linked overrides, audit |
| `formweb-export` | Deterministic semantic HTML, responsive CSS, browser interactions, forms, SEO and static files |
| `formweb-core` | JSON-lines process boundary and CLI version/selfcheck |

Build with stable Rust and `cargo build --release --locked` in this directory. The executable is `target/release/formweb-core`; `--version` prints the release version and `--selfcheck` validates the starter document. Standard output in normal mode contains protocol replies only. Input and output are UTF-8 JSON, one object per line. Fresh engine sessions and new documents receive a 128-bit OS-random site identity. Loading a saved document preserves its identity.

## Protocol

A request is `{"id":1,"method":"state","params":{}}`. Replies include `id`, `ok`, `rev` and either `result` or `error`. Methods are `hello`, `state`, `new`, `load`, `exec`, `batch`, `export`, `audit`, `validate`, `checkpoint` and `restore`. `hello` returns the implemented command catalogue. `state` returns the site, revision and history availability. The complete advanced command and extension contract is [ADVANCED_SCHEMA.md](ADVANCED_SCHEMA.md).

`exec` takes `command`, object `params` and optional `expectedRevision`. `batch` takes an array of command/params objects and an optional expected revision. Commands run on a candidate document; validation and all commands must succeed before the candidate is committed. One successful nonempty batch creates one undo entry. Failed operations preserve the document, revision, undo and redo. Revisions increase monotonically on committed changes and history moves. No-op document commands do not create history.

Undo/redo are separate `history.undo` and `history.redo` commands and cannot appear inside batches. History holds at most 100 prior documents and trims oldest entries to a 31 MiB document budget. `checkpoint` includes the current site and both history arrays; `restore` validates them atomically before switching authority. The backend uses this boundary for persistent save/open and exact supervised crash recovery. `new` and legacy `load` clear history. The public API does not expose the supervisor's revision override.

## Document and commands

The camelCase schema is version 1. A site contains pages, a single node map, design tokens, breakpoints, components, typed CMS collections, locale translations and settings. Every node must belong to exactly one page tree. Cycles, missing references, duplicate parents, invalid IDs, duplicate page routes and nesting beyond 100 levels are rejected. Nodes are limited to safe semantic HTML tags and a bounded CSS property list. Event handler attributes, script/style elements, unsafe URL schemes, CSS escapes/comments and CSS URL/expression forms are rejected. Text, metadata and attributes are escaped during export.

The 40-command catalogue includes node and page CRUD, full page duplication, custom breakpoint CRUD, typed tokens and referenced text presets, component definitions/props/variants/slots/reset/detach, pinned library import/update/detach, CMS schema/items/query/binding/localization, extension groups, site replacement and undo/redo. Node string-map patches merge keys; a null map value removes that key. Responsive map patches merge by breakpoint and CSS property; a null breakpoint removes its override. Page SEO patches merge title, description and noindex.

Components reference a source subtree. Insertion creates a linked instance. Optional `componentSourceId` links each cloned node to its source, `componentId` marks the instance root, and `overrides` records locally overridden field groups. Source text, tag, styles, attributes, responsive styles, bindings, interactions and structural changes propagate to linked nodes while surviving nodes retain identity. Local overrides survive source changes. Typed props and variants materialize into that same instance; typed slots preserve independent supplied content. Instance HTML IDs and internal label, ARIA and fragment references share one map. Detach keeps the current subtree. Structural edits directly inside linked content and nested linked source definitions require detach.

CMS fields include text, number, boolean, URL, image, date, reference and references. Required values, unknown fields, calendar dates, statuses, item identities/slugs and actual relation targets are validated, including merged localized records. A binding without a field repeats its subtree for published collection items. Typed extension queries support filters, sorting, offset/limit, pagination and empty states. Explicit bindings select text, href or src, with singular URL/image guards for URL targets. CMS templates generate item detail routes. Repeated subtrees retain distinct and internally consistent HTML references. Draft and archived items are excluded from export.

Locale dictionaries use node IDs for text, and `page-id.title` / `page-id.description` for SEO. Missing translations fall back to source text. Advanced localization emits configured locales, localized page routes and media, alongside localized CMS item routes. Breakpoint CSS cascades from base into descending maximum widths, retaining styles not overridden at narrower widths.

## Export and limits

The exporter returns path/content pairs for pages, `assets/site.css`, `assets/runtime.js`, `sitemap.xml`, `robots.txt`, the editable `site.formweb.json` and a README. Known site-page links and interaction navigation URLs become relative directory routes, so exported and locally published sites work beneath a path prefix. Query strings and fragments are preserved. Page metadata includes title, description, canonical URL, Open Graph fields, language and optional noindex. Sitemap excludes noindex pages.

Interactions support click, hover/focus and scroll triggers for class toggle, navigation and fade-in. The runtime checks reduced motion and generated CSS disables motion under that preference. Default FormWeb forms use URL-encoded text fields and an accessible status line; file uploads are rejected and the configured FormWeb API must be available. Explicit custom form actions and methods are preserved for native browser submission. Remote and external assets remain references and are not copied into the archive. The editable source may therefore reference assets unavailable on a different host.

Audit reports missing headings, metadata, image alternatives, form labels, duplicate HTML IDs, placeholder links and the example base URL. It does not claim WCAG compliance, evaluate colour contrast, inspect remote assets or perform a full HTML conformance audit. The model does not validate every HTML parent/child content category.

## Observed verification

Release compilation and CLI selfcheck passed. Manual protocol requests confirmed node edits, cycle rejection, unsafe URL rejection, stale revision conflicts, atomic rollback, undo/redo, component inheritance and overrides, distinct reusable form IDs/labels, published CMS list expansion, nested page links, locale export and supervised revision restoration. Consecutive new documents received different identities; load preserved the original identity. Export retained an authored external action and GET method while qualifying the default form action. Browser runtime paths are verified separately through the application workflow; the native compile is not a browser interaction check.

The v0.2 authority observations are retained in [OBSERVATIONS_v0.2.0.json](OBSERVATIONS_v0.2.0.json), including actual request records, failure messages and the observed executable digest. They cover 26 advanced consumers and rejection paths: persistent history, linked page duplication, presets and local overrides, typed relations/localization/queries, slots, library version updates and conflicts, form field constraints and byte limits. The final release version and browser/runtime evidence are recorded by the release owner.
