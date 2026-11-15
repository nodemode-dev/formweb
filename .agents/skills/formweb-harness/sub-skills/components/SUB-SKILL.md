---
name: components
description: "Creates and maintains reusable FormWeb components, instances, props, variants, slots, pinned libraries, isolated code components and page components, including component_build_install and component_instance_set. Use when a request asks to reuse a design, parameterize it, share it across projects or add a typed code widget."
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
| Code component (build only) | `build_code_component` | POST /api/code/build | Website studio |
| Build and install a code component in one step (0.19.3) | `component_build_install` | older server: `build_code_component`, then merge the returned record into the `code` group with `apply_commands` (`extension.set` group `code`, keeping every existing component, instance and section) | Content tab, Code components |
| Place or change a code component instance (0.19.3) | `component_instance_set` | older server: `apply_commands` with `code.instance.set {node,value:{component,props}}` | Content tab, Component |
| Ready-made sections and page components | `library_list`, `library_insert` | see sibling `library` | Library panel |

## Preconditions

`get_site` supplied the revision, component IDs and the observed source root. Read pack root `references/advanced-authoring.md` before configuring props, variants, slots or libraries, and read formweb://commands for the live parameters. Code components need the dependencies installed by `./formweb install`, and the request must explicitly enable them.

## Procedure

1. Read the current component definition and any instances before editing. A source node ID and an inserted copy ID differ, so map them from the returned data instead of guessing from names.
2. Create with `component.create` from an observed root, then insert with `component.insert` under an observed parent. Source structure changes reach linked instances, so inspect two instances after any source edit.
3. Run `component.configure` with the whole intended definition and keep unrelated props, variants and slots. Then set values with `component.props` (null restores the default), switch with `component.variant`, and fill named slots with `component.slot` using independent content nodes, never page roots or linked source children.
4. Use `component.reset` for local overrides and `component.detach` only when the user wants independent copies. Verify the detached content stays unchanged when the source changes.
5. For libraries, call `list_libraries`, then `save_library` under a new dotted version. An existing pin must go through `review_library`; pass the returned digest as `reviewDigest` with `update` true in `import_library`. Stored versions are immutable, so never try to overwrite one.
6. For code components, call `build_code_component` with enabled true, the language, source and props. Fix every concrete compiler diagnostic. Supported prop types are string, number, boolean and json, and exports run in a sandboxed iframe.
   There are three kinds of component; pick before building. Linked components (steps 1 to 4) are design reuse made of nodes. Isolated code components run in a sandboxed iframe with no page access. Page components (mode `page`) run in the page with `ctx` and full access; they are for canvas, WebGL and scroll-driven work and belong to sibling `components-builder`. Before writing one, call `library_list` (sibling `library`): 21 first-party page components already ship, and a library section may already be the answer.
   On 0.19.3, `component_build_install` compiles through the same builder and merges the record into `code` in one undo step, then `component_instance_set` places it on a host node with props. On an older server do the two halves yourself as the Surfaces table says, and never overwrite a component whose `sourceDigest` differs without telling the user.
7. Send each batch through `apply_commands` or `edit_components` with the current `expected_revision`, then call `audit_site` and re-read the tree.

## Gate

Instances show the intended props, variant and slot content in the re-read state, no cyclic or duplicate-owned slot content remains, and any library update used a reviewed digest. Variant or source propagation is claimed only if two instances were inspected.

## Hands back

Component and instance IDs, library ID and version with digest, code component build result, final revision and audit findings.

## Owned resources

- Pack root `references/advanced-authoring.md`: linked component and pinned library rules; open before configure, reset or import.
- Pack root `references/architecture.md`: component ownership and tree constraints.
- Sibling `layout-builder`: responsive layout of the sections that contain instances.
