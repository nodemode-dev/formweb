---
name: style-and-tokens
description: "Maintains the FormWeb design system: CSS tokens, typed tokens, text presets and breakpoint definitions. Use when colors, type scale, spacing values or breakpoint widths should change once and apply everywhere."
---

# Style and Tokens

## Purpose

Keep visual values in one place. Tokens are exported as CSS custom properties, so a node that references `var(--accent)` follows the token, while a copied hex value silently drifts. This skill owns the definitions; per-node breakpoint overrides belong to sibling `layout-builder`.

## Surfaces

| Action | MCP (tool plus command) | CLI or REST | Editor |
| --- | --- | --- | --- |
| Read tokens, presets, breakpoints | resource `formweb://tokens` | `GET /api/substrate` for the catalogue | Window > Design system (`window.tokens`) |
| Set a CSS token | `edit_styles` `token.set` | `./formweb run token.set name=accent value='#f97316'` | Design system dialog, Add token (`window.tokens`) |
| Define a typed token | `edit_styles` `token.define` | `./formweb run token.define '{"name":"space-m","type":"length","value":"16px"}'` | none |
| Define a text preset | `edit_styles` `textpreset.set` | `./formweb run textpreset.set` with name and styles | none |
| Apply a text preset | `edit_styles` `textpreset.apply` | `./formweb run textpreset.apply id=[node-id] name=body` | none |
| Create or update a breakpoint | `edit_styles` `breakpoint.set` | `./formweb run breakpoint.set` with id, name, maxWidth | none |
| Remove a breakpoint | `edit_styles` `breakpoint.remove` | `./formweb run breakpoint.remove id=[breakpoint-id]` | none |
| Switch the editing width | none | none | View > Desktop, Tablet, Mobile (`view.desktop`, `view.tablet`, `view.mobile`) |
| Read the brand kit | resource `formweb://tokens` (key `brand`) | none | Window > Brand kit (`window.brand`) |
| Add a brand color or font | `edit_styles` `token.define` with name `brand-[name]` (type color) or `brand-font-[name]` (type text) | `./formweb run token.define '{"name":"brand-primary","type":"color","value":"#f97316"}'` | Brand kit, Add color (`brand.add-color`), Add font (`brand.add-font`) |
| Set a brand logo | `edit_site` `site.update` with settings `brandLogo` or `brandLogoDark` set to an uploaded `/api/assets/[id]` URL | `./formweb run site.update` with that patch | Brand kit, Upload (`brand.logo`, `brand.logo-dark`), Insert (`brand.insert-logo`) |
| Find off-brand styling | `brand_check` `{page?}`; each issue has `fix`, a `node.update` command that swaps in the nearest brand token | `curl -s 127.0.0.1:8240/api/brand/check?page=home` | Brand kit, Check page (`brand.check`), Fix or Fix all (`brand.fix`, `brand.fix-all`) |
| Restrict editing to the brand | `edit_site` `site.update` with settings `brandRestrict` `"true"`; needs the manage permission, editors get 403 | `./formweb run site.update` with that patch | Brand kit, Only allow brand colors and fonts (`brand.restrict`) |
| Find shared team libraries | `list_team_libraries` (`{id}` for one: items, tokens, members, `usedBy`) | `curl -s 127.0.0.1:8240/api/team-libraries` | Window > Team libraries (`window.team`) |
| Use a team library in this site | `use_team_library` `{id, action:"link"}`; later `"sync"` when `updateAvailable` is true; `"unlink"` keeps the tokens | `POST /api/team-libraries/[id]/use` | Team libraries, Link, Sync, Unlink (`team.link`, `team.sync`, `team.unlink`) |
| Create or change a team library | `save_team_library` without `id` to create (`from_brand: true` copies this site's kit), with `id` and `expected_revision` to change; a list you pass replaces that list | `POST /api/team-libraries` or `/api/team-libraries/[id]` | Team libraries, From brand kit or Empty (`team.create-from-brand`, `team.create`), Add color, font or graphic |
| Share a team library | `share_team_library` `{id, identity_id, role}` with `view`, `edit` or `none`; owner only | `POST /api/team-libraries/[id]/share` | Team libraries, Sharing (`team.share`) |

The brand kit is not a separate store: it is the typed tokens named `brand-` plus two settings, so a brand color used as `var(--brand-[name])` updates everywhere when the token changes, and the Design inspector offers brand values in its color and font fields. When a person has a brand kit, prefer its tokens over new values. Before handing back a styled page, run `brand_check`; apply all returned `fix` commands in one `apply_commands` batch so they undo together, then check again and report zero issues. The restriction is enforced in the editor's fields, not on agent calls, so `brand_check` is how an agent proves it stayed on brand.

A team library is the brand shared across projects. It lives in the service, not in a site. Linking it adds its colors and fonts as typed tokens `lib-[library]-[name]` and `lib-[library]-font-[name]` in one undo step. Style with `var(--lib-...)` so a later Sync updates every element. The brand check and the restriction both count `var(--lib-...)` as on-brand. A view role can link and sync; edit can change the library; only the owner shares or deletes. If `save_team_library` fails because the library changed, read it again with `list_team_libraries` `{id}` and reapply only your change. Graphics are uploaded images; insert one by adding an `img` with `src` set to the graphic's `url`.

## Preconditions

`formweb://tokens` and `get_site` supplied the existing token names, text presets, breakpoint IDs and revision. Open pack root `references/advanced-authoring.md` for typed tokens, presets and custom breakpoints, and confirm parameters in `formweb://commands`.

## Procedure

1. Read `formweb://tokens` before inventing a name. Reuse an existing token or preset when its meaning matches; add a new one only when no existing value fits.
2. Choose the command. Use `token.set` for a plain CSS custom property. Use `token.define` when a type matters: `color`, `number`, `length` or `text` (number values must be finite numeric strings).
3. Change a token's value rather than editing each consumer. Then check that consumers reference `var(--[token-name])` and not a resolved literal; a literal copy will not follow the change. Fix those nodes with `edit_nodes` or hand them to sibling `layout-builder`.
4. Define a text preset with `textpreset.set` (`name`, `styles`), then attach it with `textpreset.apply` (node `id`, preset `name`). Direct style edits on a node later override the properties they touch, so re-inspect a node after changing a preset and do not assume propagation from the first appearance.
5. Manage breakpoints with `breakpoint.set` (`id`, `name`, integer `maxWidth`) and `breakpoint.remove` (`id`). Removing one deletes its node overrides and the last breakpoint cannot be removed, so confirm with the person first. A width chosen in the editor viewport is not a saved breakpoint.
6. Do not write node-level breakpoint overrides here. Hand the observed breakpoint IDs and widths to sibling `layout-builder`.
7. Send related changes in one `apply_commands` batch with the current `expected_revision`, then run `audit_site` and inspect the exported page at a width on each side of any changed threshold.

## Gate

Every new or changed visual value is a token or preset reference, `formweb://tokens` shows the intended definitions, no breakpoint was removed without approval, and the widths actually inspected are recorded. Preset or token propagation is claimed only where observed.

## Hands back

Tokens and presets created or changed, breakpoint IDs and widths, consumers still holding literals, final revision, audit findings and widths inspected.

## Owned resources

- Pack root `references/advanced-authoring.md`: typed tokens, presets and breakpoints.
- Pack root `references/architecture.md`: responsive styling rules.
