---
name: formweb-editing
description: "Edit websites in FormWeb, the local visual website builder, by asking in plain language through its MCP server. Use whenever the person wants a page built or changed, copy rewritten, a section added, moved or removed, a layout fixed for mobile, colors or fonts changed, pages created from a spreadsheet, a page password-protected, a QR code made, or the site saved, exported or published, and the FormWeb tools (get_site, edit_nodes, apply_commands and the rest) are available or FormWeb is named. Also use when a FormWeb tool fails or waits and the next step is unclear. For long multi-part briefs use formweb-harness; not for changing FormWeb's own source code (use formweb-skillset)."
---

# Editing websites in FormWeb

FormWeb is a visual website builder running on this computer. Its MCP server (named `formweb`) edits the site that is open in the FormWeb editor, so every change you make appears in the person's window at once and is one step they can undo. These tools are the hands; this skill is how to use them well.

Work in small checked steps. The person may be watching and editing too, so read before you write, and keep each change to what they asked for.

## Before anything

1. Read `formweb://site/tree`: every page as an outline of element IDs, tags, names and a text excerpt. It is small; prefer it over the whole site.
2. If the person says "this", "here" or "the selected", read `formweb://selection`: the element they have selected in the editor.
3. Note the `revision` from what you read and pass it as `expected_revision` on your first edit.

`get_site` with `detail` "summary" gives pages and settings; with "full" it gives every style. The server's prompts (build_page, edit_copy, responsive_review, publish_site, recover_session) hold ready-made step lists; `formweb://commands` lists every command with its parameters.

## Workflow 1: change copy or one element

1. Find the element in `site/tree` (or `selection`).
2. `edit_nodes` with command `node.update`, params `{id, patch:{text}}`. For a style change put CSS properties in `patch.styles`; for mobile only, put them in `patch.breakpoints.mobile`.
3. The result is a short summary with the new revision. Report before and after.

## Workflow 2: build or extend a page

1. `edit_pages` `page.add` `{name, slug}` (or `page.duplicate` from a similar page), then read `site/tree` for the new root ID.
2. Add sections with `edit_nodes` `node.add` `{parent, node:{tag, name, text, attrs, styles, breakpoints, children:[]}}`, or several at once with `apply_commands` so they land as one undo step. Use semantic tags (header, section, h1, h2, p, a, img with alt).
3. Reuse the design system: read `formweb://tokens` and use `var(--token)` values rather than new hex codes.
4. `audit_site`, fix what it reports, then `compile_preview` if you need to look.

## Workflow 3: deliver

- Keep an editable copy: `save_project`.
- Files to host elsewhere: `export_site` (refused while a page password is set, because a static copy cannot protect pages).
- A local link: `publish_site`. If publish review is on, a reviewer approves before it goes live. A local publication is not hosting.

## Things that matter

- Many pages from data: `edit_pages` `page.bulk` with a template page containing `{{column}}` tokens and up to 300 rows.
- Video, music or a map: `node.add` a `div` with attribute `data-fw-embed` set to a YouTube, Vimeo, Loom, Spotify, Google Maps embed or OpenStreetMap embed link, or an X post link. Site setting `embedClickToLoad` `"true"` makes every embed wait for a visitor's click.
- On brand: `brand_check` lists off-brand colors, fonts and logos with ready fixes; apply them in one `apply_commands` batch.
- Team brand across sites: `list_team_libraries`, then `use_team_library` `{id}` to link; style with `var(--lib-...)`; `"sync"` when it shows an update.
- Site icon: upload an image, then `edit_site` `site.update` `{patch:{settings:{favicon:"/api/assets/[id].png"}}}`.
- Password: `set_page_password` `{route, password}`; never repeat the password back.
- QR code: `qr_code` `{url}` with the published address.
- Cut out a photo's background: `remove_background` `{node}` on an uploaded `img` (needs formvis running on their computer; `action: "restore"` undoes it). For brush touch-ups, point them to Edit > Remove background.
- Undo your own last step with `history` `{action:"undo"}`; check `formweb://activity` first if the person is also editing.

## When something fails

Every FormWeb error carries a `next` field. Read it, do that, retry once.

| What you see | What it means | What to do |
| --- | --- | --- |
| No formweb tools at all | The MCP server is not connected in this client | Ask the person to start FormWeb (`./formweb boot`) and approve the project's MCP server, then restart the client |
| "Agents are disabled" (403) | The person has not allowed agents | Ask them to turn Agents on in Agent Connect (the bolt icon on the left rail) |
| "revision conflict" (409) | Someone changed the site since you read it | Re-read `site/tree`, then apply only what is still needed with the new revision |
| "unknown node" | The ID is stale or invented | Re-read `site/tree`; IDs change after duplicate, bulk create and undo |
| "No one approved ..." (408) or "The person denied ..." (403) | The person asked to approve deletions | Say what you want to remove and why; retry once after they confirm, never in a loop |
| Export refused (409) mentioning passwords | A page is password-protected | Publish instead, or ask whether to remove the password |

## Going further

For a long brief with many parts (a whole site, CMS, translations, forms, branches, providers), load the `formweb-harness` skill and start at its director. Its specialists map every tool to the same action in the editor menus and the `./formweb run` CLI.
