---
name: components-builder
description: "Builds FormWeb page components that run in the page, isolated code components, posters, typed color and asset props, and code sections with their own HTML, CSS and JavaScript. Use for canvas or WebGL widgets, scroll-driven code, trusted embeds and imported HTML. Requires an observed export and treats page-mode code as trusted code."
---

# Components Builder

## Purpose

Add code-driven parts to a site without breaking its layout or its safety bar. A page component draws inside a host the site already sized; a code section owns a childless node's markup. Neither is reported as working until the exported page was observed.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Build a component | `build_code_component` | POST /api/code/build | Content tab, Code components, Build new |
| Place or edit an instance | `apply_commands` (code.instance.set, code.instance.remove) | `./formweb run code.instance.set '{"node":"[node-id]","value":{}}'` | Content tab, Component |
| Opt in and edit a section | `apply_commands` (code.sections.allow, code.section.set, code.section.remove) | `./formweb run code.section.set '{"node":"[node-id]","value":{}}'` | Content tab, Code section |
| Upload poster or svg | upload through the asset route | POST /api/assets | Poster upload in either section |

## Preconditions

`get_site` supplied the revision and the host node. Read `docs/ADVANCED_SCHEMA.md` (Page components and code sections) for the mount contract. The user asked for code in the page. Page mode and sections run with full access to the page, so say so and use them only for code the user trusts. Prefer isolated mode when the code needs no access to the page.

## Procedure

1. Create the host first. A page component host is any node that already has its final size (for example a `div` with width 100 percent and `aspect-ratio` 16 / 9). A section host must have no children.
2. Build the component with `build_code_component`: `mode` `"page"` or `"isolated"`, language, source and props. Page mode allows 256 KiB source and 512 KiB javascript; isolated 128 and 256 KiB; imports are refused in both. Fix every compiler diagnostic. Prop types: string, number, boolean, json, color (hex, `rgb(`, `rgba(`, `hsl(`, `hsla(` or `var(--name)`) and asset (an owned `/api/assets/<sha>.<ext>` path).
3. Upload a poster through the asset route and keep its `/api/assets/<sha>.<ext>` path. The poster is the first paint and the canvas picture, so it must match the component's first frame closely; svg posters must pass the svg safety rules.
4. Place the instance:

```json
{"command": "code.instance.set", "params": {"node": "hero-canvas", "value": {"component": "aurora", "props": {"tint": "#4466ff", "speed": 0.6, "image": "/api/assets/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.webp"}}}}
```

5. Page component contract. Export `mount(root, props, ctx)`; return nothing, a cleanup function, or `{update(props), destroy()}`. `root` is an absolutely positioned layer inside the host, so never size the host from inside. Use the context, not globals:
   - `ctx.reduced`, `ctx.theme()` and `ctx.onTheme(fn)` for motion and colour preferences.
   - `ctx.token(name)` for design tokens, `ctx.asset(path)` to turn an asset prop into its exported URL.
   - `ctx.progress(scene?)` and `ctx.onProgress(fn, scene?)` for scroll scenes (0 without the motion group).
   - `ctx.onFrame(fn)` for the shared animation loop, `ctx.visible()` and `ctx.onVisible(fn)` to pause work offscreen, `ctx.size()` and `ctx.onResize(fn)` for canvas sizing.
   - `ctx.variable(name)` and `ctx.onVariable(name, fn)` for the `variables` group.
   - `ctx.ready()` once the first frame is drawn; the poster then hides without moving anything. Every `on*` returns an unsubscribe function; call them in cleanup.
6. Code section. Opt in once, then set the section on a childless node:

```json
[
  {"command": "code.sections.allow", "params": {"enabled": true}},
  {"command": "code.section.set", "params": {"node": "embed-host", "value": {"enabled": true, "html": "<canvas id=\"c\"></canvas>", "css": "[data-fw-node=\"embed-host\"] canvas{display:block;width:100%;height:100%}", "js": "const c = host.querySelector('canvas');", "module": false, "poster": "/api/assets/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.png"}}}
]
```

   `host` is the section node inside the script. `html` 512 KiB, `css` 256 KiB, `js` 512 KiB. Section code never runs on the canvas; the editor shows the poster or a placeholder. Remove with `code.section.remove`, `code.instance.remove`.
7. Export and open the page. Check: component or section works, no console errors, no page errors, no layout shift while it loads, no horizontal overflow, reduced motion respected, theme change followed. A failed component keeps its poster and sets `data-fw-error` on the host; read that attribute when the poster stays.
8. Call `audit_site` and re-read the tree.

## Gate

The host kept its size before and after mount, the exported page has zero console and page errors, and the claimed behavior was observed in the browser at the requested widths. A page-mode or section build is described as running with full page access.

## Hands back

Host node IDs, component IDs and modes, poster paths, section opt-in state, final revision, browser evidence and audit findings.

## Owned resources

- `docs/ADVANCED_SCHEMA.md`: mount contract, ComponentContext and section export rules.
- Sibling `components`: linked components, props, variants, slots and libraries.
- Sibling `interaction-builder`: scenes, variables and scripts that drive `ctx.progress` and `ctx.variable`.
- Sibling `release-operator`: export and publish of the verified page.
