# FormWeb MCP Workflows

## Connect and discover

From the repository root, install and build with the documented launcher before starting the backend on loopback port 8240. The project MCP configuration launches `./formweb mcp` on Unix; the Windows dispatcher is `formweb.bat mcp`. The stdio process forwards to the running backend and does not start a separate Rust document engine. Use the repository's current setup documentation if a command or path has changed.

The backend also exposes its SDK Streamable HTTP transport. Obtain the actual endpoint from project configuration and backend documentation. Agents is initially disabled; the authorized user enables it in the editor or starts the service with `FORMWEB_AGENTS=1`. Check actual connection status rather than assuming configuration means connection.

Discover through `tools/list`, then call `get_site` and read resources `formweb://site` and `formweb://commands` as needed. The server merges `backend/app/mcp_catalog.py`, `advanced_catalog.py` and `providers/catalog.py` in `mcp_server.py`; the live descriptions and schemas own the full parameter contract. This reference supplies sequence and dependencies.

The core tool names are `get_site`, `apply_commands`, `history`, `audit_site`, `save_project`, `list_projects`, `open_project`, `export_site`, `publish_site` and `list_submissions`. Route additional authoring, content and service work through the master map; the selected specialist loads its advanced reference directly. Check the live listing before every new capability; a delivered pack does not enable absent tools.

## Workflow 1: build and inspect a responsive page

Trigger: "Make a responsive FormWeb landing page with a hero, features and a contact section."

1. `get_site`: retain the returned revision, page IDs, root IDs and existing content that the brief keeps.
2. Plan the page hierarchy, normal-flow layout, styles, breakpoint overrides and content. Route to the layout, content or interaction specialist when that part needs its own checks.
3. `apply_commands`: pass `commands` as entries containing `command` and `params`, and `expected_revision` from step 1. Example operation: `node.update` with the observed node ID and a `patch` containing only the intended properties.
   For one command, the domain tools (`edit_nodes`, `edit_pages`, `edit_styles`, `edit_components`, `edit_cms`, `edit_locales`, `edit_site`, `edit_creative`) take `command`, `params` and `expected_revision` and list each command's parameters in their description. `edit_creative` covers `table.insert`, `table.row.add`, `table.row.remove`, `table.col.add`, `table.col.remove`, `slider.create`, `layout.convert`, `text.script` and `form.steps`; `edit_cms` also takes `cms.list`, `cms.reorder`, `cms.move` and `cms.folder`. To operate the editor window itself, use `list_ui_commands`, `describe_ui_command` and `run_ui_command` (the window must be open; a risky command waits for the person's Allow).
4. Edits return a compact summary (revision, undo state, pages with root IDs) unless you pass `detail: "site"`. For new element IDs read `formweb://site/tree`; for styles call `get_site` (detail `full`). Use the new revision for any next batch; old revisions are consumed evidence, not a reusable lock.
5. `audit_site`: inspect each issue's severity, code, node and message. Correct relevant issues with another observed-revision batch.
6. `export_site`: pass the requested `locale`; omitting it uses the observed site's `defaultLocale`. Inspect the returned ZIP path and manifest, then render exported pages at the planned widths.
7. `save_project`: pass a meaningful `name` if requested. Record the returned project identity and revision.

Result: an editable site plus an inspected export, with final revision, audit disposition and actual preview widths reported.

## Workflow 2: revise CMS content and a translated page

Trigger: "Update the FormWeb blog collection and export the Spanish page."

1. `get_site`: read the current collection ID, field names, existing record IDs, page node IDs, translations and revision.
2. `apply_commands`: use `cms.upsert` with the observed collection and intended item; use `locale.set` with locale `es` and the complete intended translation map. Keep existing keys that the update should preserve. Include `expected_revision` from step 1.
3. `get_site`: confirm values and the returned revision. Inspect bindings before claiming the page displays a record.
4. `audit_site`: resolve missing field and binding issues relevant to the request.
5. `export_site` with `locale` `es`: inspect the exported page text, metadata, links and record content.
6. `save_project`: persist the editable result and record its identity.

Result: a saved site and Spanish export whose actual content is observed. Report missing dynamic CMS routing or locale behavior if the request needs it.

## Workflow 3: save, publish locally and inspect a form

Trigger: "Save my FormWeb contact page and publish a local preview so I can check submissions."

1. `get_site`: inspect the site, intended form and current revision; verify that the request authorizes local capture and inspection.
2. `audit_site`: disposition any relevant form, accessibility or metadata issue before publication.
3. `save_project`: pass the requested `name`, retaining the returned project ID and revision.
4. `publish_site`: pass the requested `slug` if supplied. Retain the returned local URL, slug and immutable version. Do not synthesize a URL from an assumed path.
5. Open that local URL in a browser, inspect the intended content and submit the authorized example form data.
6. `list_submissions`: inspect only the authorized captured record. Match the site and form IDs, and report the observed submission result without exposing unrelated records.

Result: an editable saved project and verified local publication. This does not deploy to an external domain or configure email delivery.

## Workflow 4: assemble a page from the library and animate it

Trigger: "Build a product landing page for my app with an animated hero, a pricing calculator and a footer."

1. `get_site`: retain the revision, page and root IDs. `tools/list`: note whether `library_list`, `library_insert`, `motion_set` and `variables_set` exist (0.19.3). If not, use `apply_commands` for motion and variables and the REST library routes (load `sub-skills/library/SUB-SKILL.md`).
2. `library_list`: choose sections by category, product and tags. Read each section's `fields`.
3. `library_insert` once per section with `parent`, `index` and `values` (tint, product name, copy, links) for the named app. Each call is one undo step; read `warnings`. Optionally `library_apply_starter` for a whole multi-page site, or `library_apply_preset` with mode `all` only if the user wants the preset to replace their tokens.
4. Add what the library lacks with `motion_set`, `motion_track` and `variables_set` (older: `motion.set`, `motion.track`, `variables.set` in `apply_commands`), chosen by `sub-skills/motion-director/SUB-SKILL.md`. Related variable entries go in one `apply_commands` batch.
5. `component_build_install` and `component_instance_set` only for a page component no library entry covers (`sub-skills/components-builder/SUB-SKILL.md`).
6. `audit_site`, `export_site`, then open the export at the planned widths and at reduced motion. Motion and page components never run on the canvas.
7. `save_project`. Delivery to FormPublisher, where the server offers `send_to_formpublisher`, is a separate step the user must ask for; it sends the same export and reports `delivered` as `live` or `inbox` with the export's `warnings`.

Result: a saved site made of editable library sections, with warnings, final revision and observed preview evidence reported.

## Open and history operations

Use `list_projects` to find a requested project ID, then `open_project` with `project_id`. Preserve current work first when needed. Call `get_site` after opening to inspect the loaded result.

Use `history` with `action` `undo` or `redo` and optional `expected_revision` from a fresh `get_site` read. Inspect the result before continuing; undo changes which IDs and content exist.

## Recover without duplicate work

If `apply_commands` rejects its expected revision, call `get_site`, inspect the affected objects and send only the remaining intended change with the fresh revision. Do not blindly repeat the old batch. If the batch itself was rejected, it has no committed prefix; if an earlier batch succeeded, that earlier work remains.

For absent tools, inspect the connection and use `tools/list`. For disabled Agents, inspect its actual enablement state. For authentication rejection, check whether the backend sets `FORMWEB_AUTH_TOKEN` or uses an issued local identity token and whether the client sends its authorized bearer token. Inspect presence only, without printing values. For role rejection, inspect `get_access` under the authorized identity and use the actual project context; a visitor token or preview nonce cannot authorize editor calls. Follow a configured proxy's documented authentication when applicable. This release has no OAuth refresh flow.

Call a failing tool directly using its live schema. If that call fails too, the server, transport or permission is the problem. Return the observed error and preserved state instead of inventing a successful response.

## Keep the pair discoverable

The repository documentation should link to `.claude/skills/formweb-harness/SKILL.md` and its MCP setup. Project clients load this committed skill directory; a standalone `.skill` package must be installed or enabled separately on another supported surface.

First task to try: "In FormWeb, inspect the current site, change the hero headline, audit it, and save an editable project." Do not assume a package has been enabled just because it was delivered. Record recurring real workflow failures outside the skill as future evaluation inputs, then revise and revalidate this pack with the repository version.
