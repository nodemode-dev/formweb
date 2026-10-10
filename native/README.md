# FormWeb Rust authority

The four-crate workspace owns the editable website document. The Python service supervises one `formweb-core` process; the frontend and MCP both submit commands to that process. No Rust crate depends on the frontend or FastAPI.

| Crate | Responsibility |
| --- | --- |
| `formweb-model` | Serializable schema, validation, original starter document, component reference maps |
| `formweb-engine` | Commands, candidate transactions, revision conflicts, undo/redo, linked overrides, audit |
| `formweb-export` | Deterministic semantic HTML, responsive CSS, browser interactions, forms, SEO and static files |
| `formweb-core` | JSON-lines process boundary and CLI version/selfcheck |

Build with Rust 1.85 or newer and `cargo build --release --locked` in this directory. The executable is `target/release/formweb-core`; `--version` prints the release version and `--selfcheck` validates the starter document. Standard output in normal mode contains protocol replies only. Input and output are UTF-8 JSON, one object per line. Fresh engine sessions and new documents receive a 128-bit OS-random site identity. Loading a saved document preserves its identity.

## Protocol

A request is `{"id":1,"method":"state","params":{}}`. Replies include `id`, `ok`, `rev` and either `result` or `error`. Methods are `hello`, `state`, `new`, `load`, `exec`, `batch`, `export` and `audit`. `hello` returns the implemented command catalogue. `state` returns the site, revision and history availability.

`exec` takes `command`, object `params` and optional `expectedRevision`. `batch` takes an array of command/params objects and an optional expected revision. Commands run on a candidate document; validation and all commands must succeed before the candidate is committed. One successful nonempty batch creates one undo entry. Failed operations preserve the document, revision, undo and redo. Revisions increase monotonically on committed changes and history moves. No-op document commands do not create history.

Undo/redo are separate `history.undo` and `history.redo` commands and cannot appear inside batches. History holds at most 100 prior documents. `new` and `load` clear history. Supervised process recovery can use the protocol-only `load.restoreRevision` field to restore the last acknowledged revision; the public backend load API does not expose this field. Recovery preserves the editable site and revision, while clearing in-memory undo/redo.

## Document and commands

The camelCase schema is version 1. A site contains pages, a single node map, design tokens, breakpoints, components, typed CMS collections, locale translations and settings. Every node must belong to exactly one page tree. Cycles, missing references, duplicate parents, invalid IDs, duplicate page routes and nesting beyond 100 levels are rejected. Nodes are limited to safe semantic HTML tags and a bounded CSS property list. Event handler attributes, script/style elements, unsafe URL schemes, CSS escapes/comments and CSS URL/expression forms are rejected. Text, metadata and attributes are escaped during export.

Supported operations are node add/update/remove/move, page add/update/remove, token set, component create/insert, collection create, CMS upsert/remove, locale set, site update, and undo/redo. Node string-map patches merge keys; a null map value removes that key. Responsive map patches merge by breakpoint and CSS property; a null breakpoint removes its override. Page SEO patches merge title, description and noindex.

Components reference a source subtree. Insertion creates a linked instance. Optional `componentSourceId` links each cloned node to its source, `componentId` marks the instance root, and `overrides` records locally overridden field groups. Source text, tag, styles, attributes, responsive styles, bindings and interactions propagate to linked nodes. Local text/appearance/attribute/interaction overrides survive subsequent source changes. Instance HTML IDs are distinct and internal label, ARIA and fragment references are remapped. Structural source changes are guarded while instances exist; structural instance edits, nested linked component definitions and detach are outside this release.

CMS field types are text, number, boolean, URL, image and date. Required fields, unknown fields, calendar dates, item status, duplicate item IDs/routes and value types are validated. A binding without a field repeats its subtree for published collection items. A field binding uses the current repeated item or the first published item. Image-element bindings require URL/image fields and populate `src`; other bindings populate text. Draft and archived items are excluded from export. CMS item routes are identifiers, not generated dynamic detail pages.

Locale dictionaries use node IDs for text, and `page-id.title` / `page-id.description` for SEO. Missing translations fall back to source text. Each export contains one selected locale. Breakpoint CSS cascades from base and desktop into descending maximum widths, retaining styles not overridden at narrower widths.

## Export and limits

The exporter returns path/content pairs for pages, `assets/site.css`, `assets/runtime.js`, `sitemap.xml`, `robots.txt`, the editable `site.formweb.json` and a README. Known site-page links and interaction navigation URLs become relative directory routes, so exported and locally published sites work beneath a path prefix. Query strings and fragments are preserved. Page metadata includes title, description, canonical URL, Open Graph fields, language and optional noindex. Sitemap excludes noindex pages.

Interactions support click, hover/focus and scroll triggers for class toggle, navigation and fade-in. The runtime checks reduced motion and generated CSS disables motion under that preference. Default FormWeb forms use URL-encoded text fields and an accessible status line; file uploads are rejected and the configured FormWeb API must be available. Explicit custom form actions and methods are preserved for native browser submission. Remote and external assets remain references and are not copied into the archive. The editable source may therefore reference assets unavailable on a different host.

Audit reports missing headings, metadata, image alternatives, form labels, duplicate HTML IDs, placeholder links and the example base URL. It does not claim WCAG compliance, evaluate colour contrast, inspect remote assets or perform a full HTML conformance audit. The model does not validate every HTML parent/child content category.

## Observed verification

Release compilation and CLI selfcheck passed. Manual protocol requests confirmed node edits, cycle rejection, unsafe URL rejection, stale revision conflicts, atomic rollback, undo/redo, component inheritance and overrides, distinct reusable form IDs/labels, published CMS list expansion, nested page links, locale export and supervised revision restoration. Consecutive new documents received different identities; load preserved the original identity. Export retained an authored external action and GET method while qualifying the default form action. Browser runtime paths are verified separately through the application workflow; the native compile is not a browser interaction check.
