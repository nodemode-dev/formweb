# Advanced FormWeb Authoring

## Contents

- Observe the available contract
- Design and page changes
- Linked component changes
- Pinned libraries
- Consumer and recovery checks

## Observe the available contract

Read `get_site` and the live `formweb://commands` resource before an advanced mutation. `apply_commands` supplies the actual document path; the operation names below come from the written Rust advanced engine module, and must also be present in the connected build. If an older server lacks an operation, report that portion incomplete rather than inventing a substitute tool.

Advanced state is carried by `site.extensions`. Rust validates named groups transactionally. `extension.set` replaces one entire group's value; `extension.remove` removes one group. Preserve unrelated entries in a replacement. Provider credentials do not belong in extensions or token values. A successful batch is configuration evidence until its intended consumer is inspected.

## Design and page changes

1. Inventory affected pages/nodes, tokens, breakpoints and design presets. Preserve unrelated page roots and content. Use a fresh observed `expected_revision` for each batch.
2. Use `page.duplicate` with the observed page `id` and intended unique `slug`; read the new page and root IDs from the returned summary and descendant IDs from `formweb://site/tree` rather than deriving them. Check cloned labels, fragments and extension consumers independently.
   For many similar pages, write `{{column}}` tokens into a template page (text, attributes such as `src`/`href`, SEO fields), then run `page.bulk` with `template` and up to 300 `rows` of `{slug, name?, values}`. One undo step reverts the whole batch. Inspect a sample of created pages for unreplaced tokens.
3. Use `breakpoint.set` with `id`, `name` and integer `maxWidth`, or `breakpoint.remove` with `id`. Set node overrides only against saved breakpoint IDs. Render around the actual threshold and use null property overrides to restore inheritance.
4. Use `token.define` with `name`, `type` and `value` for a typed design token. References must consume the resulting CSS custom property. Changing a token should update every intended consumer without copying its resolved value into each node.
5. Use `textpreset.set` with `name` and `styles`, then `textpreset.apply` with node `id` and preset `name`. Inspect subsequent preset changes on all applied nodes; do not infer live propagation from the first copied appearance. Keep semantic tags deliberate and local overrides explicit.
6. Export and inspect grid/flex row tracks, gaps, child placement, wrapping and responsive typography. A preview width input does not establish a saved custom breakpoint.

## Linked component changes

Start with the observed definition and linked instance roots. A source node ID and its inserted copy ID are different. Use the returned `componentSourceId` mapping when identifying a configured target; do not infer the ID mapping from names.

1. `component.configure` receives a component ID and its intended definition. Read the current definition first and retain unrelated props, variants and slots. Typed props target a source node and an allowed property; variants target source-node patches; named slots identify a source container.
2. `component.props` changes the observed instance root's exposed values. Verify the declared type and target, and inspect two instances with distinct values. A null prop value removes the explicit prop value so its default can be consumed.
3. `component.variant` selects an instance variant or clears it according to the actual schema. Verify inherited base values after switching/resetting, not only the first variant's appearance.
4. `component.slot` uses an instance root, observed slot name and independent content-node IDs. Plan ownership before moving content into a slot. Do not use page roots, linked source children, duplicate node ownership or a cyclic subtree as slot content.
5. `component.reset` uses the observed instance and optional category fields. Read its live reset semantics before use; inspect preservation of unrelated props/variant/slot content as well as the restored category.
6. `component.detach` removes the observed instance's links. Inspect the independent content after detach and verify it stays unchanged when the source changes.

Do not promise nested linked-source support, arbitrary prop targets or a slot type that the live schema does not expose. Structural synchronization, prop overrides and slot insertion need separate rendered checks. A definition saved in an extension does not establish instance behavior.

## Pinned libraries

The repository content service supports immutable dotted library versions, snapshot digests, review and import. Discover `list_libraries`, `save_library`, `review_library` and `import_library`. Use the returned version and digest with the live import schema; an update uses its explicit update flag and reviewed digest. Do not guess an MCP name from a REST endpoint.

Select known components from an observed source snapshot. Preserve its owned assets. Initial import needs an independent parent. An existing pin must be reviewed against the intended version; retain the returned digest and acknowledge exactly that reviewed version before an update. Inspect added, removed and changed definitions, including props/variants/slots rather than source-node text alone.

Rust `library.import`, `library.update` and `library.detach` consume the pin. Inspect linked consumers after an update and local content after detach. An immutable stored version cannot be overwritten to simulate an update. Nested library snapshots require the documented detach boundary. This is FormWeb's local sharing workflow, with no claim of a vendor cloud-library service.

## Consumer and recovery checks

Keep the unchanged footer/other user content as a preservation check. Confirm distinct instance values, source propagation, inherited reset, filled slots, detached isolation, custom-width CSS and token/preset references in actual output. Native save/import should preserve the advertised content, owned bytes and bounded history.

For stale revisions, read current state and reconcile only the still-needed change. A failed atomic batch has no partial prefix; an earlier successful batch remains applied. If a rendered consumer disagrees with accepted state, report that concrete boundary through the recovery auditor instead of adding duplicate source/instance edits that conceal the defect.
