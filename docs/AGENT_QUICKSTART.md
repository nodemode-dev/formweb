# FormWeb harness quick start

The [FormWeb harness](../.claude/skills/formweb-harness/SKILL.md) teaches a connected agent how to inspect the open website, apply validated changes, verify its consuming behavior and return editable/exported deliverables. The MCP server supplies actual operations; the skill supplies sequencing and recovery.

## Connect the pair

1. Install/build FormWeb using the repository launcher's current instructions, then start the backend. Keep the service running while the stdio proxy is connected.
2. Enable Agents within your authorized project scope, using the editor switch or the documented `FORMWEB_AGENTS` setting. Configuration alone does not prove the server is connected.
3. Use the committed project MCP configuration. Unix clients run `./formweb mcp`; Windows clients use `formweb.bat mcp`. The proxy reaches the same Rust document as the editor. A client may instead use the documented SDK Streamable HTTP endpoint.
4. Install or enable the project skill in the intended client. The repository's `.agents/skills` mirror carries the same pack bytes; a standalone package must be installed separately on another surface. Run `./formweb agents sync --check` to compare project copies.
5. Inspect the client's connected status and live tool discovery. Authenticate using the configured server/identity policy without printing bearer tokens or provider secrets.

## First tasks

Start with: "In FormWeb, inspect the current site, change the hero headline, audit it, and save an editable project."

For a complete site: "In FormWeb, keep my existing footer. Build a responsive studio landing page, inspect it at 1280 and 390 pixels, save `.fweb`, and export the site."

For advanced work: "In FormWeb, inspect the available authoring and service tools. Review my CMS/component changes, retain approved content across conflicts, and report only the runtime and provider behavior you actually observe."

## Roles and evidence

| Work | Harness role | Evidence required |
| --- | --- | --- |
| Broad brief or coordinated review | Harness director | Initial/final state, deliberate plan, completed outputs |
| Orientation: engine, API, MCP, editor, files, ports | Platform map | Correct transport and endpoint before the first call |
| Pages, site settings, icons, passwords, QR | Site and pages | Returned pages and settings, observed export or served page |
| Responsive tree and embeds | Layout builder | Layout changes consumed in compiled preview/export |
| Tokens, text presets, breakpoint definitions | Style and tokens | Token consumers updated without copied values |
| Components and libraries | Components | Instance changes consumed in compiled preview/export |
| CMS collections, records, bindings | CMS steward | Rendered records and preserved content |
| Locales and translations | Localization | Correct routes, alternates and per-locale export |
| SEO and accessibility | SEO and accessibility auditor | Audit before and after, fixed issues named |
| Forms, inbox, delivery | Forms operator | Stored submission, CSV, observed delivery status |
| Motion and runtime widgets | Interaction builder | Actual browser/service consequences, accessible controls |
| Native/static/release/provider delivery | Release operator | Returned files/IDs/URLs, concrete scope and observed status |
| Branches, comments, release review | Branch and review | Reviewed merge, resolved comments, approval state |
| Working beside a person: approvals, selection, terminal | Agent Connect and terminal | Selection read, approval outcome, attributed activity |
| Conflicts, access and interrupted calls | Recovery auditor | Preserved acknowledged state, actual error and safe resume |

Advanced commands and provider operations are available only when the live server exposes them. Read its schemas before use. Rust batches use the current `expected_revision` supplied by a fresh `get_site` read. Service/provider tools may name revision arguments differently; preserve their exact discovered spelling.

A saved extension is configuration evidence. A browser interaction needs observed behavior. A local publication needs a returned local URL/version. A provider fixture proves transport, while actual hosting, domain/TLS/CDN or vendor sandbox checkout requires its own output and independent observations.

## Site-wide recipes

| Goal | MCP call | Check |
| --- | --- | --- |
| Site icon | Upload the square PNG (editor or `POST /api/assets`), then `apply_commands` with `site.update` `{patch:{settings:{favicon:"/api/assets/<id>"}}}`; `faviconDark` adds a dark-scheme icon | Exported `index.html` has `rel="icon"`, `apple-touch-icon` and `rel="manifest"`; the ZIP holds `site.webmanifest` and the icon |
| Many pages from data | Put `{{column}}` tokens in a template page, then `page.bulk` `{template, rows:[{slug, name?, values}]}` (1 to 300 rows, one undo step) | Page count grew by the row count; sample pages show values, not tokens |
| Embed media | `node.add` a `div` with attribute `data-fw-embed` set to a YouTube, Vimeo, Loom, Spotify, Google Maps embed or OpenStreetMap embed URL, or an X post (`https://x.com/[user]/status/[id]`) | Preview or export shows `iframe[data-fw-embed-frame]`; an unsupported URL renders a visible `fw-embed-error` note |
| Load embeds on click | Site-wide: `site.update` `{patch:{settings:{embedClickToLoad:"true"}}}`; one embed: attribute `data-fw-embed-load` set to `click`. X posts are always click-to-load | Export shows `[data-fw-embed-gate]` with a Load button and an "Open on ..." link and no iframe until the visitor presses Load |
| QR code | `qr_code` `{url, dark?, light?}` returns SVG text; `GET /api/qr?url=...&format=png` returns a PNG | Decode it, or compare the returned `url` |
| Remove a photo's background | `remove_background` `{node, method?, feather?}` on an `img` with an uploaded picture; `action: "status"` checks formvis, `"restore"` returns the original | The image `src` is a new PNG and `data-fw-original-src` holds the original; the export shows only the cut-out |
| Add an icon or a stock photo | `search_stock` `{source: "icons"\|"formlit", query}`, then `insert_stock` `{source, id, parent?}`; icons take `color`, `stroke`, `size` | A new `img` under `parent`; the asset's credit is listed in the export's `CREDITS.txt`; respect any `usage` terms returned for a photo |
| Generate a picture | `generate_image` `{action: "generators"}` to see what formvis has set up, then `{prompt, generator?, size?, count?, insert?, alt?, parent?}`; waits up to 90 s, else returns `job` to pass back | Assets carry `prompt`, `generator`, licence and time in their credit; give `alt` that describes the picture, not the prompt |
| Edit a picture in formvis | `edit_in_formvis` `{node, action: "send"}`, the person (or formvis's own tools) edits, then `{node, action: "update"}` | The element's `src` changes to the edited PNG in one undo step; the credit gains `editedIn` |
| Rewrite an element's text | `write_copy` `{node, action: rewrite\|shorten\|lengthen\|tone\|generate, tone?, brief?}` returns `suggestion` and `apply` | Nothing changes until you run `apply` (one `node.update`); show the suggestion first |
| Draft pages from a description | `generate_site` `{action: "plan", prompt, pages?, references?}`, show the outline, then `{action: "build", plan}` | New pages with headers, sections, cards, buttons and contact forms in one undo step; slugs never collide; existing pages are untouched |
| Use a reference or revise the outline | `generate_site` `{action: "reference", asset}` or `{action: "reference", name, data}` (base64 PDF or image); `{action: "plan", prompt, plan, instruction}` revises | A PDF returns `text` (facts for the model), an image `colors` (button colour after any brand kit); a revised plan has `mode: "revised"`, a failed one leaves the outline as it was |

## Reading and editing efficiently

Read `formweb://site/tree` first: every page as an outline of element IDs, tags, names and text, a few KB instead of the whole document. `formweb://selection` is what the person has selected in the editor ("make this bigger"). `get_site` with `detail: "summary"` returns pages, components, collections and settings; `detail: "full"` (the default) returns every style. Make single changes with the `edit_*` domain tools, which list their commands' parameters, and multi-command changes with `apply_commands`. Both return a compact summary; pass `detail: "site"` only when you need the whole document. Failed calls include a `next` field saying what to do. In Claude Code, `@formweb:formweb://site/tree` attaches the outline to a prompt.

| Goal | Tool | Notes |
| --- | --- | --- |
| Use or extend the brand kit | `formweb://tokens` key `brand`; `edit_styles` `token.define` `brand-[name]` (color) or `brand-font-[name]` (text); logos in settings `brandLogo`, `brandLogoDark` | Style with `var(--brand-[name])` so changes follow the kit |
| Check a page against the brand | `brand_check` `{page?}` returns off-brand colors, fonts and logos, each with a ready `fix` command | Pass the `fix` values to `apply_commands` as one batch; a second `brand_check` returns no issues |
| Restrict styling to the brand | `site.update` `{patch:{settings:{brandRestrict:"true"}}}` (needs the manage permission) | The editor then accepts only `var(--brand-...)`, `var(--lib-...)` or neutral values in color and font fields; `brand_check` still reports agent edits |
| Use the team's shared library | `list_team_libraries`, then `use_team_library` `{id, action:"link"}`; `"sync"` when `updateAvailable` is true | The site gains `lib-[library]-[name]` tokens; style with `var(--lib-...)` |
| Change or share a team library | `save_team_library` (no `id` creates; `from_brand: true` copies this site's kit; pass `expected_revision` when changing), `share_team_library` `{id, identity_id, role}` | `list_team_libraries` `{id}` shows the new revision and members |
| Password-protect a page or folder | `set_page_password` `{route, password}`; `null` removes | Enforced when FormWeb serves the published site; export is refused while set; never echo the password |

## Terminal and CLI

Inside the editor's terminal (or any shell in the FormWeb folder) `./formweb run --list` lists engine commands and `./formweb run COMMAND key=value ...` applies one, for example `./formweb run node.update id=headline 'patch={"text":"Hello"}'`. Values are parsed as JSON when they can be; add `--json` for machine output and `--revision N` to require a revision. The change appears on the open canvas at once, is one undo step, and shows as `terminal` in Agent Connect's activity feed. The terminal's preset menu starts `claude`, `codex` or `cursor-agent` in the same folder, so those clients pick up the project MCP files.

If a call waits and then reports that no one approved it, the owner has turned on approvals in Agent Connect; ask them to watch the panel and retry once.

Editor ids for the same actions: `site.favicon`, `site.favicon-dark`, `site.favicon-clear`, `page.bulk`, `insert.embed`, `page.qr`, `brand.check`, `brand.fix-all`, `brand.restrict`, `window.team`, `image.remove-background`, `insert.stock`, `image.edit-in-formvis`, `image.update-from-formvis`, `page.generate`, `ai.suggest`, `ai.accept`, `ai.site-reference`, `ai.site-revise`.

## Creative, CMS and vector commands (v0.7)

These engine commands go through `apply_commands` or the `edit_cms` and `edit_creative` domain tools, which print each command's parameters. `./formweb run --list` shows the same catalogue.

| Goal | Command | Arguments | Check |
| --- | --- | --- | --- |
| Filters, sorting or a slider on a collection list | `cms.list` | `{node, patch:{facets?, sortOptions?, slider?, pageSize?, filter?, sort?, limit?}}`; `facets` `[{key, field, kind: checkbox\|select\|search\|range, label}]`, `sortOptions` `[{key, field, direction, label}]`, `slider` `{perView, arrows, dots, autoplay, interval, loop, label, gap}` (not combinable with facets); null removes a key | The published list shows live controls and keeps their state in the URL |
| Slider of collection cards | `slider.create` | `{parent, collection, perView?, index?}` | A slide card bound to the collection plus its slider list config |
| Table | `table.insert` | `{parent, rows?, cols?, header?, caption?, index?}` | Semantic table with caption, `thead` with `th scope="col"` and `tbody` |
| Table rows and columns | `table.row.add`, `table.row.remove`, `table.col.add`, `table.col.remove` | `{table, index?}` to add (before that index, else at the end), `{table, index}` to remove; columns need a regular table without merged cells | Row and cell counts match |
| Collection folders | `cms.folder` | `{id, name?, collections?:[collectionId], remove?}`; a collection lives in one folder | Folder lists its collections |
| Manual item order | `cms.reorder`, `cms.move` | `{collection, ids:[itemId]}` (every item once), `{collection, id, index}` | List order follows the new order |
| Superscript and subscript | `text.script` | `{id, mode?: super\|sub\|none\|keep, shift?: "-0.2em"\|null, trueGlyphs?}` | The span is a real `sup` or `sub` with a baseline shift |
| Multi-step form | `form.steps` | `{form, steps:[{title, nodes:[childId]}]}` groups direct children of the form; `steps: []` removes them | Export has Back, Next and per-step validation |
| Layout with site defaults | `layout.convert` | `{id, mode: flex\|grid, direction?, columns?, gap?, padding?}`; omitted values come from the site settings `layoutGap`, `layoutPadding` and `layoutColumns` | The element's display, gap and padding follow the defaults |

Vector authoring uses ordinary `node.add` and `node.update` with svg tags. An inline vector is an `svg` node (attrs `viewBox`, optional `preserveAspectRatio`, `width`, `height`; styles position absolute, left, top, overflow visible) holding `path` nodes with `d` and the paint attributes (`fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `fill-rule`, `opacity`, `transform` and the rest the engine allows). An agent can write `d` alone: the editor re-reads the shape from `d` when it disagrees with its own anchor model (`data-fw-vector`, which export drops). Beyond `svg` and `path`, the engine accepts `g`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `text` and `textPath`. Gradient, clip and mask references are only `url(#id)` on `fill`, `stroke`, `clip-path` and `mask`, and only to an id defined in the same `svg`; anything else (scripts, other `url(` values, event attributes) is rejected and leaves the document unchanged. The inspector's tag field shows `svg` and `path` read-only. Check that the exported HTML holds the `svg` and, for gradients, the `linearGradient` or `radialGradient` definition. `POST /api/vector/import-svg` cleans an SVG with the same allowlist.

Vector selection commands run through `run_ui_command` while the vector editor is open: tools `vector.lasso` (Q), `vector.wand` (Y) and `vector.eyedropper` (I) are pointer tools, and `vector.select.same-fill`, `vector.select.same-stroke`, `vector.select.same-weight`, `vector.select.same-opacity`, `vector.select.same-fill-stroke` and `vector.select.inverse` change the selection by the first selected shape's look. `vector.transform-again` (Ctrl+D) repeats the last transform and is the only one of these that edits the site; it is available while a vector tool is active.

Warp and global editing (v0.9.2), run with `window.formweb.run(id)` while a shape is selected: `vector.puppet` (Puppet Warp tool: pins, moving-least-squares bend of the selected paths), `vector.reshape` (Reshape tool: drag a selected anchor to move the other selected anchors in proportion, or drag a segment to add and pull an anchor) and `vector.global-edit` (Start or Stop Global Edit: shapes whose geometry matches the selected one up to translation are highlighted and receive the same paint and geometry edits in one undo step; Escape stops). None has a default shortcut.

Tweak and objects on a path (v0.9.3): `vector.effect.tweak` opens Tweak (random horizontal and vertical moves, relative to the path size or absolute, for anchor points and the "In" and "Out" control points, with a seed and Preview; OK is one undo step). `vector.path.objects-on-path` places the selected shapes along the shape selected last: first at the start, last at the end of an open path (evenly around a closed one), each centered on the path and rotated to its direction, in one undo step; it is not live.

Blob Brush (v0.9.4): `vector.blob-brush` (Shift+B) selects the tool. Each drag paints a filled, unstroked shape the width of the brush in the stroke color (the fill color when stroke is none) and unites it with overlapping unstroked paths of the same fill in the edited SVG, one undo step per stroke. Double-click the canvas with the tool active for Size, Fidelity, Keep Selected and Merge Only with Selection; `[` and `]` change the size.

Path commands and drawing tools (v0.9.1), run with `window.formweb.run(id)`: `vector.path.add-anchors` (midpoint of every segment of the selected paths), `vector.path.remove-anchors` (selected anchors), `vector.path.divide-below` (selected path cuts the filled shapes beneath it), `vector.path.split-grid` and `vector.path.clean-up` (dialogs), and the tools `vector.pencil` (N), `vector.arc`, `vector.rect-grid` and `vector.polar-grid` (the last three have no default shortcut).

## Editor window commands (v0.7)

Three MCP tools reach the open editor window, which must be open in a browser or the desktop app: `list_ui_commands` `{query?}` lists the window's commands (id, label, keys, group, `mutates`, `risky`, availability; words in `query` must all appear in the id, label, group or description), `describe_ui_command` `{id}` returns the description, shortcut, parameters and current availability, and `run_ui_command` `{id, params?}` runs one as if the person used its menu item or shortcut and returns what it returned or why it did not run. They are window actions: change the site with `edit_*` and `apply_commands`. A risky command waits for the person to press Allow in the window (Deny, or no answer in 45 seconds, refuses). An unknown id returns 404 and no open window returns 409. The same list is on `GET /api/commands?q=` and a command runs on `POST /api/commands/run {id, params}`.

Vector view aids (run with `run_ui_command` while vector editing): `vector.rulers` (Mod+R), `vector.guides.toggle` (Mod+;), `vector.guides.lock` (Mod+Alt+;), `vector.guides.make` (Mod+5), `vector.guides.release` (Mod+Alt+5), `vector.guides.clear`, `vector.grid.show` (Mod+'), `vector.grid.snap` (Mod+Shift+'), `vector.grid.prefs` and `vector.outline` (Mod+Y). Guides are saved on the SVG as `data-fw-guides` (numbers only, up to 200, plus a locked flag); creating, moving, deleting, making, releasing, clearing and locking guides is one undo step each, and the attribute is dropped from exports. Outline mode only restyles the canvas. `vector.export-screens` (Mod+Alt+E) opens Export for Screens: PNG, JPG, WebP and clean SVG of the edited SVG or the selection at 0.5x to 4x, downloaded from the browser.

Recolor and styles (v0.9.2), run with `window.formweb.run(id)`: `vector.recolor` (Edit menu, no shortcut) opens the Recolor Artwork dialog for the selected shapes or the whole edited SVG, with live preview and one undo step on OK; `vector.graphic-styles` (Window menu, no shortcut) opens the Graphic Styles window. The style library is the site setting `vectorGraphicStyles` (a JSON list, validated by the engine, shared by all SVGs, not exported).

## Recover a stopped workflow

For missing tools, rediscover instead of guessing names. For permission rejection, inspect actual identity/role and Agents state. For a stale revision, read current state, preserve acknowledged changes and apply only the remaining change with a fresh revision. Do not replay successful steps.

Call a failed tool directly using its actual schema to separate server/transport/access failures from sequencing mistakes. Keep credentials on the server and report presence or missing environment names only. Preserve unsaved work before opening a different project or branch.

The pack's [scenario evaluations](../.claude/skills/formweb-harness/references/evaluations.md) and [trigger cases](../.claude/skills/formweb-harness/references/trigger-cases.md) are specifications. The release audit records actual executions. Their existence does not prove automatic skill activation, browser coverage or a reduction in calls.

## Driving the editor window

Every menu action has a stable command id (`file.save`, `edit.undo`, `insert.heading`, `view.mobile`, `window.studio` and so on). In the browser, `window.formweb.commands()` lists them with label, menu, shortcut and whether each is enabled right now, and `window.formweb.run(id)` runs one exactly as the menu would, returning false when it is disabled. Menu rows and command-search results carry the id in `data-command`. People reach the same actions from the menubar or with Ctrl/Cmd+K. Prefer MCP for site changes; use these ids (or `list_ui_commands` and `run_ui_command`) when an agent has to operate the window itself (switching breakpoint, opening a panel or dialog). Agent ids: `window.agents` (Agent Connect panel), `agents.toggle` (MCP and terminal on or off), `view.terminal` (Ctrl+`), `terminal.new`; panel buttons carry `agents.client.<id>`, `agents.launch.<id>`, `approvals.approve` and `approvals.deny`. Layout ids: `window.toggle-left`, `window.toggle-right`, `window.toggle-rail` and the presets `workspace.design`, `workspace.content`, `workspace.build`, `workspace.focus`; rail buttons and collapsed-panel strip buttons carry the same `data-command` ids.
