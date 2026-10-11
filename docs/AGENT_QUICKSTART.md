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
| Responsive tree and components | Layout builder | Instance/layout changes consumed in compiled preview/export |
| CMS, locales and metadata | Content steward | Rendered records, correct routes/alternates and preserved content |
| Motion, forms and runtime widgets | Interaction builder | Actual browser/service consequences, accessible controls |
| Native/static/release/provider delivery | Release operator | Returned files/IDs/URLs, concrete scope and observed status |
| Conflicts, access and interrupted calls | Recovery auditor | Preserved acknowledged state, actual error and safe resume |

Advanced commands and provider operations are available only when the live server exposes them. Read its schemas before use. Rust batches use the current `expected_revision` supplied by a fresh `get_site` read. Service/provider tools may name revision arguments differently; preserve their exact discovered spelling.

A saved extension is configuration evidence. A browser interaction needs observed behavior. A local publication needs a returned local URL/version. A provider fixture proves transport, while actual hosting, domain/TLS/CDN or vendor sandbox checkout requires its own output and independent observations.

## Recover a stopped workflow

For missing tools, rediscover instead of guessing names. For permission rejection, inspect actual identity/role and Agents state. For a stale revision, read current state, preserve acknowledged changes and apply only the remaining change with a fresh revision. Do not replay successful steps.

Call a failed tool directly using its actual schema to separate server/transport/access failures from sequencing mistakes. Keep credentials on the server and report presence or missing environment names only. Preserve unsaved work before opening a different project or branch.

The pack's [scenario evaluations](../.claude/skills/formweb-harness/references/evaluations.md) and [trigger cases](../.claude/skills/formweb-harness/references/trigger-cases.md) are specifications. The release audit records actual executions. Their existence does not prove automatic skill activation, browser coverage or a reduction in calls.

## Driving the editor window

Every menu action has a stable command id (`file.save`, `edit.undo`, `insert.heading`, `view.mobile`, `window.studio` and so on). In the browser, `window.formweb.commands()` lists them with label, menu, shortcut and whether each is enabled right now, and `window.formweb.run(id)` runs one exactly as the menu would, returning false when it is disabled. Menu rows and command-search results carry the id in `data-command`. People reach the same actions from the menubar or with Ctrl/Cmd+K. Prefer MCP for site changes; use these ids when an agent has to operate the window itself (switching breakpoint, opening a panel or dialog). Layout ids: `window.toggle-left`, `window.toggle-right`, `window.toggle-rail` and the presets `workspace.design`, `workspace.content`, `workspace.build`, `workspace.focus`; rail buttons and collapsed-panel strip buttons carry the same `data-command` ids.
