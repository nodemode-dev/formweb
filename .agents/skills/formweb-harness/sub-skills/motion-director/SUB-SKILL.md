---
name: motion-director
description: "Chooses how to make a FormWeb element move or react: native motion (reveals, scroll scenes, loops, counters, text effects, drag, pointer, disclosure), design behaviors, variables and formulas, the script player, or a page component, then applies it with motion_set, motion_track, motion_remove, variables_set, variables_remove and component_instance_set (apply_commands on older servers). Use for scroll stories, pinned sections, marquees, count-ups, typewriters, tilt, accordions, calculators, scripted demos and canvas effects. Requires checking Live preview and reduced motion."
---

# Motion Director

## Purpose

Pick the cheapest mechanism that can say what the designer wants, apply it as data, and prove it in the exported page. Data that the engine validates beats a script, and a script beats code. Code is the last resort.

## Surfaces

| Action | MCP (0.19.3) | Older server: `apply_commands` | CLI |
| --- | --- | --- | --- |
| Set a motion entry | `motion_set` {kind, node, value} | `motion.set` | `./formweb run motion.set '{...}'` |
| Remove a motion entry | `motion_remove` {kind, node} | `motion.remove` | `./formweb run motion.remove '{...}'` |
| Edit one scene track | `motion_track` {scene, list, index, track} | `motion.track` | `./formweb run motion.track '{...}'` |
| Set or remove a variable entry | `variables_set` {kind, name, value}, `variables_remove` {kind, name} | `variables.set`, `variables.remove` | `./formweb run variables.set '{...}'` |
| Place a page component | `component_instance_set` | `code.instance.set` | `./formweb run code.instance.set '{...}'` |
| Themes, fonts, registered properties | `apply_commands` | `design.set {key,value}` | `./formweb run design.set '{...}'` |
| Find a finished animated section | `library_list`, `library_insert` | none; use the REST routes in sibling `library` | `./formweb library list` |

Use the dedicated tools when `tools/list` shows them. Each is one undo step. Several related entries go through one `apply_commands` batch so they validate and undo together.

## Decide

Work down this list and stop at the first row that fits.

| The designer wants | Use | Kind or tool |
| --- | --- | --- |
| Fade, slide or scale in when scrolled to, or on load | native reveal | `motion_set` kind `reveals` |
| A scroll-linked story: pinned stage, tracks of keyframes, markers | native scene | kind `scenes`, edit one track with `motion_track` |
| Endless marquee, spin, float, custom keyframes | native loop | kind `loops` |
| A number that counts up | native counter | kind `counters` |
| Split text, typewriter, ghost text | native text | kind `text` |
| Draggable cards, tilt, follow-cursor, proximity | native drag or pointer | kinds `drag`, `pointer` |
| Accordion, tabs, filter, copy button, scroll-to, lightbox, theme toggle | native disclosure and actions | kinds `disclosure`, `actions` |
| Hover, focus, press and chosen (`selected`, for tabs and filter chips) looks | design behaviors | `extension.set` group `behaviors` via `apply_commands` |
| A value the visitor changes that drives numbers or CSS (price calculator, toggle, slider) | variables, formulas, inputs, outputs | `variables_set` |
| A button that sets a variable or computed value | action `set-variable` | `motion_set` kind `actions` |
| A scripted sequence: chat that streams a reply, fake cursor demo, typing into a field | script player | `motion_set` kind `scripts` |
| Search the site | `search` action | `motion_set` kind `actions` |
| Canvas, WebGL, physics, anything per-frame that data cannot express | page component | `component_instance_set` after building (sibling `components-builder`) |

Before building any of the last row, call `library_list`: 21 first-party page components (noise band, starfield, physics deck, filmstrip, orbit constellation, forecast chart and others) and 35 finished sections already exist, and `library_insert` places them with their motion and variables included.

## Procedure

1. `get_site` for the revision and the node IDs. Every motion key is an existing node ID, so create the nodes first.
2. Choose the row above. State it in one line before sending commands.
3. Apply. Shapes and limits are in `docs/ADVANCED_SCHEMA.md` (motion, variables, scripts). Recipes for calculators, set-variable buttons, scripts, autoplay demos, search and track edits are in sibling `interaction-builder`.
4. Variables are site-wide. Names are unique across values, tables and formulas. If this work will become a library section that can be inserted twice, write the names as `%%name%%` (sibling `library`).
5. Scene `offset` accepts a length; on 0.19.3 also `var(--token)` and `calc()` of those, which is right when a sticky bar covers the stage.
6. Export or open Live preview. Motion never runs on the canvas, so the editor view proves nothing. Check the first paint, the changed state, and the reduced-motion state, where each scene shows its settled end state, streams and typing complete at once, and pointer steps jump.
7. `audit_site`, then re-read the site.

## Gate

Each effect was observed in the exported or Live page, reduced motion was checked, there is no layout shift while it loads, and no console errors. A page component was described as running with full page access.

## Hands back

The mechanism chosen per effect and why, node IDs and entry kinds, final revision, browser evidence at the widths inspected, and anything not observed.

## Owned resources

- `docs/ADVANCED_SCHEMA.md`: motion entries, scripts, variables grammar, page components.
- Sibling `interaction-builder`: copyable recipes. Sibling `components-builder`: writing a page component. Sibling `library`: ready-made sections and scoped variables.
