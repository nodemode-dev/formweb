# Advanced FormWeb Content

## Contents

- Plan actual content consumers
- Records, references and selected bindings
- Queries, empty content and detail templates
- Locales and metadata
- CSV and portability

## Plan actual content consumers

Call `get_site`, read the live command resource and inspect `site.extensions` before changing advanced content. The written Rust schema owns exact fields. Use `apply_commands` with a fresh observed `expected_revision`; replacing a named extension group requires preserving its intended unrelated entries. Ask the content specialist to load the service workflow directly for provider translation and explicit review; an ordinary locale map does not prove a machine translation request.

Plan the reader-facing output first: which list, detail URL, selected record, language, metadata and empty result must appear. Record the collection/item/page/node IDs from current state. Separate stored records from published list/detail output and local service behavior from portable files.

## Records, references and selected bindings

Create schemas through `collection.create` only when an appropriate collection is absent. Use the actual supported scalar/reference types, including the target collection for reference fields. `cms.upsert` includes intended item identity, slug, values and draft/published/archived status. Preserve archived records as stored content; do not delete them to hide them from output.

`cms.binding` associates an observed node with a collection, field, target and optional selected item. Targets consume text, source or link content according to the live schema. An explicit item ID is deliberate selected-item binding; a first published item fallback is a different behavior. Repeated context supplies the current item only for its matching collection.

For relation paths, verify a published related item actually resolves. Removed/missing targets and forbidden cross-collection references need actionable errors. Check repeated label/fragment IDs and links after binding, because visible text alone does not prove safe cloned content.

## Queries, empty content and detail templates

1. `cms.query` receives the list node and query. Inspect the current filter/sort/offset/limit/page-size/empty-node configuration before replacing it. Use field-compatible predicates and a stable ordering; do not assume an accepted operator is consumed correctly until output agrees.
2. Check a nonempty result and a zero-item result. The authored empty subtree should appear only when no items match. Confirm draft/archived entries stay absent by default.
3. Traverse enough pages to collect all intended IDs. Verify no duplication or omission after filtering/sorting, stable equal-key ordering and defined empty/out-of-range behavior. Static filtering and visitor-driven controls are distinct claims.
4. The `cms` group's `templates` map identifies a page template, collection and item slug pattern. Retain unrelated bindings/lists/localized maps when setting it through `extension.set`.
5. Export at least two published items into distinct populated detail routes. Inspect item text, images, link fields and metadata at each exact path. Route collisions must fail rather than overwrite output.

Do not infer detail routing from a lone field binding. A stored template/query also does not establish route generation, paging controls or visitor filtering.

## Locales and metadata

`locale.set` replaces a locale translation map. Preserve intended existing keys; node keys are observed node IDs, and ordinary page metadata keys use the page ID plus `.title` or `.description`. Missing overrides fall back to base content.

`cms.localize` changes an observed collection/item/locale's field values and optional slug/status. Inspect locale publication state separately from the global item state. A locale draft must stay absent only from that locale's rendered list/detail routes.

The `localization` group carries all-locale output, per-page slugs and per-node asset overrides. The `seo` group carries page metadata templates, JSON-LD and robots controls. Read each current group before replacement. A metadata template may consume item fields; verify two detail pages have distinct actual titles, descriptions and Open Graph values.

Compile all configured locales when the request needs portable alternates. Inspect `lang`, canonical URLs, reciprocal alternates, localized slug uniqueness and actual served targets. Confirm localized owned images are bundled and fallback content remains correct. Parse emitted JSON-LD, including a value that could terminate a script if serialized unsafely. Inspect sitemap/robots using the configured public origin and published/noindex exclusions.

The `seo.redirects` map accepts a local source path to a local destination string, which means status 301, or an exact object with `to` and `status` set to 301, 302, 307 or 308. Read the live schema and preserve unrelated rules. Cycles, self redirects, duplicate normalized sources, unsafe paths and other statuses reject before mutation. Fetch the actual old path through the intended preview, frozen publication or active service and inspect status and scoped Location. A portable redirect manifest needs a host adapter; emitted data alone cannot redirect a generic static host.

## CSV and portability

Discover `export_cms_csv` with the observed collection and `import_cms_csv` with that collection, CSV text and deliberate upsert or replace mode. The content service exports every stored record including draft/archived data. Control columns preserve identity/status, missing/null fields and locale overrides; prefixed field columns avoid collisions with record metadata. Quoted comma/newline values must round trip through actual CSV parsing.

Choose upsert or replace deliberately. Review row/type/ID/slug conflicts before claiming import complete; replace intentionally removes omitted records and must retain valid relations. Inspect the returned report and fresh state. Do not retry a committed import as though it were a failed request.

Save native `.fweb` separately from static export. Reimport in clean data when portability matters and compare canonical content and owned bytes. Independently serve the portable folder and traverse root, nested, CMS and locale routes. Forms and provider widgets may still depend on configured backend endpoints; record that dependency instead of calling the whole site serverless.
