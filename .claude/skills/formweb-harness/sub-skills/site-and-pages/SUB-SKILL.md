---
name: site-and-pages
description: "Manages FormWeb pages and site-wide settings: adding, updating, duplicating, bulk-creating and removing pages, page SEO, site name, icons, hidden scrollbars, extension groups, page passwords and QR codes. Use when the request is about the page list or whole-site settings rather than page content."
---

# Site and Pages

## Purpose

Change the page list and whole-site settings safely. Pages own their root node and URL slug, so a wrong slug or removal changes routes, links and exports. Content inside a page belongs to sibling `layout-builder`.

## Surfaces

| Action | MCP (tool plus command) | CLI or REST | Editor |
| --- | --- | --- | --- |
| Add a page | `edit_pages` `page.add` | `./formweb run page.add '{"name":"About","slug":"/about"}'` | Page > Add page (`page.add`) |
| Rename, re-slug, set SEO | `edit_pages` `page.update` | `./formweb run page.update id=[page-id] 'patch={"name":"About us"}'` | Page > Page settings (`page.settings`) |
| Duplicate a page | `edit_pages` `page.duplicate` | `./formweb run page.duplicate '{"id":"[page-id]","slug":"/about-2"}'` | none |
| Reorder pages, choose the home page | `edit_pages` `page.move` `{id,index}` (0 is first; the first page is the home page) | `./formweb run page.move '{"id":"[page-id]","index":0}'` | none |
| Duplicate an element | `apply_commands` `node.duplicate` `{id,parent?,index?}` | `./formweb run node.duplicate '{"id":"[node-id]"}'` | Edit > Duplicate element (`Mod+D`, `Shift+Mod+D`), layers context menu (copies of copies keep short ids and a copy keeps its button actions; only an ending a copy made is swapped, so an author id like x-copy-5 is appended to) |
| Copy an element to another page or site | `copy_element` `{node, embed_assets?, clip?}` (set `embed_assets` to paste in another FormWeb, and `clip` with it to keep the result small: assets beyond 4 MiB wait behind the clip link, and `clip` without `embed_assets` is a 400; the fragment also carries design tokens, CMS collections with the collections they reference, the variables set-variable actions name and form configuration; large assets in the editor travel by a clip link (15 minutes by default, `FORMWEB_CLIP_SECONDS` changes it) on the same computer; a paste streams clip assets to disk and stores them only if it succeeds, and the next start removes staged files a killed paste left behind) then `paste_element` `{fragment,parent?,index?}`; `apply_commands` `node.paste` `{fragment,parent?,index?}` | none (fragment JSON comes from `copy_element` or `POST /api/fragment`, and carries optional `ancestors` ids, 0.20.3, so a pasted child of a copy swaps its id ending) | Edit > Copy, Cut, Paste element (`Mod+C`, `Mod+X`, `Mod+V`), layers context menu |
| Bulk create from data | `edit_pages` `page.bulk` | `./formweb run page.bulk '{"template":"[template-page]","rows":[{"slug":"[slug]","values":{}}]}'` | Page > Bulk create from CSV (`page.bulk`) |
| Remove a page | `edit_pages` `page.remove` | `./formweb run page.remove id=[page-id]` | Page > Delete page (`page.delete`) |
| Site name, scrollbars, icons | `edit_site` `site.update` | `./formweb run site.update 'patch={"settings":{"hideScrollbars":"true"}}'` | Page > Set site icon (`site.favicon`), Set dark mode icon (`site.favicon-dark`), Clear site icons (`site.favicon-clear`); Hide scrollbars checkbox in the Page inspector |
| Replace an extension group | `edit_site` `extension.set` | `./formweb run extension.set` with group and value | none |
| Protect a route | `set_page_password`, then `list_page_passwords` | `GET` and `POST /api/page-passwords` | Page > Password protect this page (`page.password`), Remove page password (`page.password-remove`) |
| QR code for a URL | `qr_code` | `GET /api/qr?url=[url]&format=png` | Page > QR code for this page (`page.qr`) |
| Draft pages from a description | `generate_site` `plan`, then `build` with the (reviewed) plan | `POST /api/ai/site/plan`, `POST /api/ai/site/build` | Page > Generate pages from a description (`page.generate`) |
| Use a PDF or image as a reference, or revise an outline | `generate_site` `reference` (`asset`, or `name` and base64 `data`), then `plan` with `references`; `plan` with `plan` and `instruction` revises | `POST /api/ai/site/reference`, `POST /api/ai/site/plan` | Add reference (`ai.site-reference`), Revise (`ai.site-revise`) in the same dialog |
| Suggest new text for an element | `write_copy` (suggestion only), then `edit_nodes` `node.update` | `POST /api/ai/copy` | Content inspector, Write with AI (`ai.suggest`, `ai.accept`) |

## Preconditions

`get_site` (detail `summary`) or `formweb://site/tree` supplied the current revision, page IDs and slugs. For duplication, bulk creation and extension groups, open pack root `references/advanced-authoring.md` and `docs/ADVANCED_SCHEMA.md`, and confirm the live command contract through `formweb://commands`.

## Procedure

1. List existing slugs first. Choose a slug that is unique and starts with `/`; a collision or an unplanned rename breaks links the person already has.
2. Add or change pages one command per `edit_pages` call, or group related commands in `apply_commands` with the current `expected_revision` so they undo as one step. Re-read the returned page and root IDs; do not derive them.
3. For `page.update`, send only the keys changing (`name`, `slug`, `seo`). Read the page first, because the editor writes `seo` as a whole object with its existing keys merged in; send title, description and noindex together to avoid dropping one.
4. For many similar pages, put `{{column}}` tokens in a template page, then run `page.bulk` with `template` and 1 to 300 `rows` of `{slug, name?, values}`. Spot-check two generated pages for filled values rather than leftover tokens.
5. To reorder pages, send `page.move` with the page `id` and its new `index` (0 is first). The first page is the home page in the editor, but the exported `index.html` is the page whose slug is `/`: to make another page the site's front page, move it to index 0 and, in the same `apply_commands` batch, give it slug `/` and the old home page another free slug, then say which routes changed.
6. For site settings use `site.update` with `patch.settings`. Icons take an uploaded asset URL (`/api/assets/[id]`), so upload first. Use `extension.set` only for a group whose shape you read in `docs/ADVANCED_SCHEMA.md`; it replaces the whole group, so carry over unrelated entries.
7. For a password, call `set_page_password` with a route (a page, a folder such as `/members`, or `/` for the site) and a password of at least 6 characters; `null` removes it. It needs publish permission, applies when FormWeb serves a published or active release, and `export_site` refuses a protected site. Never echo the password in a reply.
8. For a QR code, use the published local URL when printing. `qr_code` returns SVG text; the PNG comes from `GET /api/qr`. Decode it or compare the returned `url` before reporting it.
9. To draft a whole site or new pages from a description, check `generate_site` `{action: "status"}`. If no language model is set, tell the person to add one in formvis (Preferences > Plugins): a local one such as Ollama or LM Studio, or a hosted service with their key.
   - If the person gives a PDF of facts or an image to match, call `reference` for each and pass the results as `references`: PDF text becomes facts for the model, image colours the button colour (after any brand kit).
   - Call `plan` with what the site is for, who it is for and which pages it needs. Show the person the outline (page names, slugs, section kinds and headings). `mode: "guided"` means their model was too small to write an outline, so FormWeb laid it out and asked for each text; say so, because such text needs more checking.
   - To change the outline in words ("add a pricing section"), call `plan` again with the same `prompt`, the current `plan` and an `instruction`. If that fails the outline is unchanged; edit its text fields yourself instead.
   - Edit text fields in the returned plan if they ask, then call `build` with it. The build adds new pages in one undo step and never changes existing ones.
   - Afterwards, replace placeholders, especially testimonials, which are marked as placeholders. The model is told not to invent prices, statistics or reviews; check anyway.
10. To rewrite one element's text, call `write_copy` with `rewrite`, `shorten`, `lengthen`, `tone` (friendly, professional, confident, playful, calm) or `generate` with a brief. Show the suggestion, and apply it with its returned `apply` command only when the person agrees. `unchanged: true` means the model handed the text back; try another action rather than applying it.
11. Run `audit_site`, then confirm the page count and slugs with a fresh `get_site`.

## Gate

Page IDs and slugs match the request, no two pages share a slug, bulk output contains no raw tokens, protected routes appear in `list_page_passwords`, and the final revision is recorded. A password or QR code is described as local unless an external host was actually observed.

## Hands back

Page IDs and slugs added, changed or removed, settings patched, protected routes, QR output location, final revision and audit findings.

## Owned resources

- Pack root `references/advanced-authoring.md`: duplication, bulk pages and extension groups.
- Pack root `references/advanced-service.md`: roles needed for password and publish actions.
