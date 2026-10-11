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
| Embed media | `node.add` a `div` with attribute `data-fw-embed` set to a YouTube, Vimeo, Loom, Spotify, Google Maps embed or OpenStreetMap embed URL | Preview or export shows `iframe[data-fw-embed-frame]`; an unsupported URL renders a visible `fw-embed-error` note |
| QR code | `qr_code` `{url, dark?, light?}` returns SVG text; `GET /api/qr?url=...&format=png` returns a PNG | Decode it, or compare the returned `url` |

## Reading and editing efficiently

Read `formweb://site/tree` first: every page as an outline of element IDs, tags, names and text, a few KB instead of the whole document. `formweb://selection` is what the person has selected in the editor ("make this bigger"). `get_site` with `detail: "summary"` returns pages, components, collections and settings; `detail: "full"` (the default) returns every style. Make single changes with the `edit_*` domain tools, which list their commands' parameters, and multi-command changes with `apply_commands`. Both return a compact summary; pass `detail: "site"` only when you need the whole document. Failed calls include a `next` field saying what to do. In Claude Code, `@formweb:formweb://site/tree` attaches the outline to a prompt.

| Goal | Tool | Notes |
| --- | --- | --- |
| Use or extend the brand kit | `formweb://tokens` key `brand`; `edit_styles` `token.define` `brand-[name]` (color) or `brand-font-[name]` (text); logos in settings `brandLogo`, `brandLogoDark` | Style with `var(--brand-[name])` so changes follow the kit |
| Password-protect a page or folder | `set_page_password` `{route, password}`; `null` removes | Enforced when FormWeb serves the published site; export is refused while set; never echo the password |

## Terminal and CLI

Inside the editor's terminal (or any shell in the FormWeb folder) `./formweb run --list` lists engine commands and `./formweb run COMMAND key=value ...` applies one, for example `./formweb run node.update id=headline 'patch={"text":"Hello"}'`. Values are parsed as JSON when they can be; add `--json` for machine output and `--revision N` to require a revision. The change appears on the open canvas at once, is one undo step, and shows as `terminal` in Agent Connect's activity feed. The terminal's preset menu starts `claude`, `codex` or `cursor-agent` in the same folder, so those clients pick up the project MCP files.

If a call waits and then reports that no one approved it, the owner has turned on approvals in Agent Connect; ask them to watch the panel and retry once.

Editor ids for the same actions: `site.favicon`, `site.favicon-dark`, `site.favicon-clear`, `page.bulk`, `insert.embed`, `page.qr`.

## Recover a stopped workflow

For missing tools, rediscover instead of guessing names. For permission rejection, inspect actual identity/role and Agents state. For a stale revision, read current state, preserve acknowledged changes and apply only the remaining change with a fresh revision. Do not replay successful steps.

Call a failed tool directly using its actual schema to separate server/transport/access failures from sequencing mistakes. Keep credentials on the server and report presence or missing environment names only. Preserve unsaved work before opening a different project or branch.

The pack's [scenario evaluations](../.claude/skills/formweb-harness/references/evaluations.md) and [trigger cases](../.claude/skills/formweb-harness/references/trigger-cases.md) are specifications. The release audit records actual executions. Their existence does not prove automatic skill activation, browser coverage or a reduction in calls.

## Driving the editor window

Every menu action has a stable command id (`file.save`, `edit.undo`, `insert.heading`, `view.mobile`, `window.studio` and so on). In the browser, `window.formweb.commands()` lists them with label, menu, shortcut and whether each is enabled right now, and `window.formweb.run(id)` runs one exactly as the menu would, returning false when it is disabled. Menu rows and command-search results carry the id in `data-command`. People reach the same actions from the menubar or with Ctrl/Cmd+K. Prefer MCP for site changes; use these ids when an agent has to operate the window itself (switching breakpoint, opening a panel or dialog). Agent ids: `window.agents` (Agent Connect panel), `agents.toggle` (MCP and terminal on or off), `view.terminal` (Ctrl+`), `terminal.new`; panel buttons carry `agents.client.<id>`, `agents.launch.<id>`, `approvals.approve` and `approvals.deny`. Layout ids: `window.toggle-left`, `window.toggle-right`, `window.toggle-rail` and the presets `workspace.design`, `workspace.content`, `workspace.build`, `workspace.focus`; rail buttons and collapsed-panel strip buttons carry the same `data-command` ids.
