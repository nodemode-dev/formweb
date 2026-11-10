---
name: interaction-builder
description: "Authors FormWeb navigation, interactions and configured runtime widgets for data, commerce, membership and consent (form inbox and delivery belong to forms-operator). Requires observed browser outcomes and distinguishes local capture, provider fixtures and verified external services."
---

# Interaction Builder

## Purpose

Create useful behavior that can be demonstrated in an exported page. Keep local submission capture separate from external email, CRM delivery or production abuse protection.

## Preconditions

`get_site` supplied the current revision, affected nodes and their attributes. The intended action and form fields are known. Read pack root `references/architecture.md` for the interaction model and form boundary. For authored states, timelines, overlays and typed form settings inspect the live extension schema; for runtime data, commerce, membership or consent read pack root `references/advanced-service.md`. A configured widget is not an observed browser consumer.

## Procedure

1. Identify the control, its intended action and the target. Prefer a real link for navigation and a button for an action. Ensure the user can discover and use the control with a keyboard.
2. Apply `node.update` through `apply_commands` with current `expected_revision`. Supported interaction triggers are `click`, `hover` and `scroll`; supported actions are `toggle-class`, `navigate` and `fade-in`. Use only the parameters the live model accepts.
   For scroll scenes, reveals, loops, counters, text motion, drag, tilt and follow, accordions, tabs, filters and the copy, scroll-to, media, lightbox and toggle-theme actions (0.19.0), send `motion.set {kind,node,value}` and `motion.remove {kind,node}` through `apply_commands`; themes, fonts and registered properties go through `design.set {key,value}`. The shapes are in `docs/ADVANCED_SCHEMA.md` under `motion` and `design`. Motion only runs in Live preview and exported pages, never on the canvas, and reduced motion shows each scene's settled state, so check both in the browser. For a single scene track use `motion.track {scene,list,index,track}`. Variables, formulas, the script player, site search and the `set-variable`, `search` and `play` actions (0.19.1) are in the recipes below.
3. Keep existing interactions when updating the array. A toggle needs a named class and styles that make its state meaningful; navigation needs a resolved URL or existing page slug. Inspect the export to confirm the runtime performs the configured action.
4. For a form, construct a semantic form tree with named controls, associated labels, appropriate input types, required flags where needed, and an explicit submit button. Use the backend's documented submission endpoint convention; do not guess endpoint attributes.
5. Export or locally publish, then perform the requested action in the browser. Check focus, the triggered state, navigation destination and a form's success or failure response. Read `list_submissions` only when the user authorized inspecting locally captured submissions.
6. Call `audit_site` and record accessibility or form issues. Name missing integrations or behavior checks so a configured record is not mistaken for an end-to-end service.

## Recipes

Each block is the `commands` array for `apply_commands` or one `./formweb run` call. Use observed node IDs. Shapes and limits: `docs/ADVANCED_SCHEMA.md`.

Variables and a live calculator. Set values, tables and formulas first, then bind inputs and outputs; an input needs an `input`, `select` or `textarea` node, and an output any node. Names are not reusable across values, tables and formulas.

```json
[
  {"command": "variables.set", "params": {"kind": "values", "name": "seats", "value": {"type": "number", "initial": 12, "min": 1, "max": 500, "step": 1}}},
  {"command": "variables.set", "params": {"kind": "values", "name": "plan", "value": {"type": "text", "initial": "team", "options": ["solo", "team", "studio"]}}},
  {"command": "variables.set", "params": {"kind": "tables", "name": "price", "value": {"solo": 12, "team": 29, "studio": 59}}},
  {"command": "variables.set", "params": {"kind": "formulas", "name": "monthly", "value": "seats * lookup(price, plan)"}},
  {"command": "variables.set", "params": {"kind": "inputs", "name": "seats-range", "value": {"variable": "seats"}}},
  {"command": "variables.set", "params": {"kind": "inputs", "name": "plan-select", "value": {"variable": "plan", "event": "change"}}},
  {"command": "variables.set", "params": {"kind": "outputs", "name": "monthly-out", "value": {"from": "monthly", "decimals": 0, "prefix": "$", "suffix": "/mo", "grouping": true, "reserve": 7}}}
]
```

Formulas use `+ - * / % ^`, comparisons, `&& || !`, and `min max round floor ceil abs clamp sum lookup if`. Exports pre-render the formatted initial value, so confirm the first paint and the changed value in the browser. Remove with `variables.remove {kind,name}`.

Button that sets a variable or a computed value:

```json
{"command": "motion.set", "params": {"kind": "actions", "node": "annual-btn", "value": [
  {"trigger": "click", "action": "set-variable", "variable": "annual", "value": true},
  {"trigger": "click", "action": "set-variable", "variable": "seats", "formula": "clamp(seats * 2, 1, 500)"}
]}}
```

Script player. A `submit` script needs a form node as its key, and `append` templates must carry the `hidden` attribute.

```json
{"command": "motion.set", "params": {"kind": "scripts", "node": "cast-form", "value": {
  "trigger": "submit", "reset": true, "steps": [
    {"type": "append", "template": "user-msg-tpl", "into": "thread", "as": "mine", "text": "{input:prompt-field}"},
    {"type": "clear", "target": "prompt-field"},
    {"type": "wait", "ms": 500},
    {"type": "append", "template": "bot-msg-tpl", "into": "thread", "as": "reply"},
    {"type": "stream", "target": "@reply", "text": "Casting the scene for {var:plan}.", "speed": 40, "by": "words"},
    {"type": "scroll", "target": "thread", "to": "end"}
  ]}}}
```

Autoplay demo with a fake cursor, started from the page load or any action:

```json
[
  {"command": "motion.set", "params": {"kind": "scripts", "node": "demo", "value": {"trigger": "view", "once": true, "steps": [
    {"type": "pointer", "target": "fake-cursor", "to": "send-btn", "duration": 700, "easing": "ease-in-out"},
    {"type": "type", "target": "prompt-field", "text": "Make it rain", "speed": 24},
    {"type": "press", "target": "send-btn"}
  ]}}},
  {"command": "motion.set", "params": {"kind": "actions", "node": "replay-btn", "value": [{"trigger": "click", "action": "play", "script": "demo"}]}}
]
```

Site search. `search-index.json` is written by export only when a `search` action exists, so check it in the export root. The template and the optional empty node carry `hidden`; template children use `data-fw-slot` of title, path, excerpt and link.

```json
{"command": "motion.set", "params": {"kind": "actions", "node": "q", "value": [
  {"trigger": "input", "action": "search", "input": "q", "results": "results-list", "template": "result-tpl", "limit": 8, "empty": "no-results", "fromParam": true}
]}}
```

Scene track edits without resending the scene (index equal to the list length appends, `track: null` removes):

```json
{"command": "motion.track", "params": {"scene": "wall", "list": "tracks", "index": 0, "track": {"node": "wall-grid", "keyframes": [{"at": 0, "styles": {"scale": "2.75"}}, {"at": 1, "styles": {"scale": "1"}}], "easing": "ease-out"}}}
```

Check variables, scripts and search in the exported page at reduced motion too: streams and typing complete at once, and pointer steps jump.

## Gate

Each claimed interaction was observed in the browser, controls are labeled and keyboard reachable, and a claimed form capture has an observed submission result. Email, CRM, webhooks and hosted security features remain unclaimed unless separately implemented and verified.

## Hands back

Affected node and form IDs, final revision, interaction checks, submission scope, audit issues and any behavior still unverified.

## Owned resources

- Pack root `references/architecture.md`: supported interactions and local form boundary; open before behavior work.
- Pack root `references/mcp-workflows.md`: publication and submission inspection sequence; open before an end-to-end check.
