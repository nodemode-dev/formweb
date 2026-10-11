---
name: components
description: "Creates and maintains reusable FormWeb components, instances, props, variants, slots, pinned libraries and isolated code components. Use when a request asks to reuse a design, parameterize it, share it across projects or add a typed code widget."
---

# Components

## Purpose

Turn a repeated design into a deliberate component, and keep instances, pinned library versions and code components honest about what they actually propagate. Reuse that was not observed in the engine is not reported as reuse.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Create from an element | `edit_components` (component.create) | `./formweb run component.create '{"name":"Card","root":"[node-id]"}'` | Insert > Elements and components (insert.panel), Capture selection |
| Insert an instance | `edit_components` (component.insert) | `./formweb run component.insert '{"component":"[component-id]","parent":"[node-id]"}'` | Insert panel, click a component row |
| Props, variant, slot, reset, detach | `edit_components` (component.configure, component.props, component.variant, component.slot, component.reset, component.detach) | `./formweb run component.props '{"id":"[instance-id]","props":{}}'` | Window > Website studio (window.studio) |
| List, save, review, import libraries | `list_libraries`, `save_library`, `review_library`, `import_library` | GET /api/libraries, POST /api/libraries, GET /api/libraries/[id]/review, POST /api/libraries/[id]/import | Website studio, components category |
| Apply or detach a pin | `edit_components` (library.import, library.update, library.detach) | `./formweb run library.detach '{"id":"[library-id]"}'` | Website studio |
| Code component | `build_code_component` | POST /api/code/build | Website studio |

## Preconditions

`get_site` supplied the revision, component IDs and the observed source root. Read pack root `references/advanced-authoring.md` before configuring props, variants, slots or libraries, and read formweb://commands for the live parameters. Code components need the dependencies installed by `./formweb install`, and the request must explicitly enable them.

## Procedure

1. Read the current component definition and any instances before editing. A source node ID and an inserted copy ID differ, so map them from the returned data instead of guessing from names.
2. Create with `component.create` from an observed root, then insert with `component.insert` under an observed parent. Source structure changes reach linked instances, so inspect two instances after any source edit.
3. Run `component.configure` with the whole intended definition and keep unrelated props, variants and slots. Then set values with `component.props` (null restores the default), switch with `component.variant`, and fill named slots with `component.slot` using independent content nodes, never page roots or linked source children.
4. Use `component.reset` for local overrides and `component.detach` only when the user wants independent copies. Verify the detached content stays unchanged when the source changes.
5. For libraries, call `list_libraries`, then `save_library` under a new dotted version. An existing pin must go through `review_library`; pass the returned digest as `reviewDigest` with `update` true in `import_library`. Stored versions are immutable, so never try to overwrite one.
6. For code components, call `build_code_component` with enabled true, the language, source and props. Fix every concrete compiler diagnostic. Supported prop types are string, number, boolean and json, and exports run in a sandboxed iframe.
7. Send each batch through `apply_commands` or `edit_components` with the current `expected_revision`, then call `audit_site` and re-read the tree.

## Gate

Instances show the intended props, variant and slot content in the re-read state, no cyclic or duplicate-owned slot content remains, and any library update used a reviewed digest. Variant or source propagation is claimed only if two instances were inspected.

## Hands back

Component and instance IDs, library ID and version with digest, code component build result, final revision and audit findings.

## Owned resources

- Pack root `references/advanced-authoring.md`: linked component and pinned library rules; open before configure, reset or import.
- Pack root `references/architecture.md`: component ownership and tree constraints.
- Sibling `layout-builder`: responsive layout of the sections that contain instances.
