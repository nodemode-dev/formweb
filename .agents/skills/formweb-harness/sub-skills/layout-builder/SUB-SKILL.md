---
name: layout-builder
description: "Builds responsive FormWeb page trees, grid or flex layouts, breakpoint style overrides and media embeds. Owns layout changes (component definitions belong to the components specialist) and returns an inspected tree and the widths verified."
---

# Layout Builder

## Purpose

Make a page's hierarchy and responsive layout express the requested design. Keep component definitions and inserted instances deliberate rather than assuming changes propagate where the engine does not implement them.

## Preconditions

`get_site` supplied the current revision, page roots and target node IDs. The brief identifies the intended content and widths. Read pack root `references/architecture.md` for model and layout rules. For page duplication, custom breakpoints, typed tokens, text presets, props/variants/slots, detach/reset or pinned-library review, open pack root `references/advanced-authoring.md` and confirm the live command contract before constructing the batch.

## Procedure

1. Inspect each affected node's parent, children, tag, styles and breakpoint overrides. Check that the page root already contains user content before adding or moving anything.
2. Choose grid for two-dimensional placement and flex for a single axis. Use explicit gaps, padding, width constraints, typography and wrapping; do not compensate for structural mistakes with arbitrary positioning.
3. Build one coherent `apply_commands` batch using `node.add`, `node.update`, `node.move` or `token.set`. Supply the current `expected_revision`. Add a new page with `page.add` only when the request needs one, then re-read its returned root ID.
4. Use `component.create` with an observed root when the user requests a reusable design. Use `component.insert` with the resulting component ID and an observed parent. Inspect the inserted structure, then report only the reuse behavior the engine actually demonstrated.
   For video, audio or a map, add a `div` with attribute `data-fw-embed` holding a YouTube, Vimeo, Loom, Spotify, Google Maps embed or OpenStreetMap embed URL; give it a readable `text` label for the canvas. The exporter swaps it for a lazy iframe. Confirm `iframe[data-fw-embed-frame]` in Preview; a rejected URL shows a visible error note instead. An X post URL (`https://x.com/[user]/status/[id]`) is also accepted and always renders as a click-to-load placeholder. When the person wants nothing third-party loaded until a visitor asks, set site setting `embedClickToLoad` to `"true"` (or attribute `data-fw-embed-load` `click` on one embed) and confirm `[data-fw-embed-gate]` with its "Open on ..." link in the export.
   For a product shot or portrait that should sit on the page without its photo background, call `remove_background` `{node}` on the `img` (its picture must be uploaded). formvis on the person's computer finds the subject. U2-Net is the default; `method: "lite"` uses GrabCut, which is faster and rougher, and `feather` softens the edge. The image becomes a new transparent PNG in one undo step, the original is kept, and `action: "restore"` brings it back. Check first with `action: "status"`; if formvis is not reachable, tell the person to start it rather than retrying. For hand refinement (erase or restore parts), point the person to Edit > Remove background in the editor, which has brushes.
5. For mobile changes, update the node's breakpoint style map using the observed breakpoint IDs. Style, attribute and breakpoint property patches merge keys; a null value removes a property, and a null breakpoint removes its entire override. Send only intended changes and inspect the result to preserve unrelated layout behavior.
6. Call `audit_site` and inspect the exported page at desktop, tablet and mobile widths appropriate to the brief. Confirm reading order, wrapping, overflow and visible interactive controls. Re-read state after undo or tree restructuring before reusing IDs.

## Gate

The final page has the intended parent-child structure, no orphan or cyclic node issue remains, and responsive claims are supported by recorded browser widths. Any component feature not observed, such as synchronized editing or variant propagation, remains unclaimed.

## Hands back

Affected page and node IDs, applied layout choices, final revision, audit findings and the responsive widths actually inspected.

## Owned resources

- Pack root `references/architecture.md`: tree, style and component constraints; open before constructing a batch.
- Pack root `references/mcp-workflows.md`: revision handling and the build-and-check sequence; consult when a mutation fails.
