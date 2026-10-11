---
name: seo-a11y-auditor
description: "Audits and fixes FormWeb SEO and accessibility: page titles, descriptions, noindex, alt text, heading order, form labels, sitemap.xml and robots.txt. Use when a request asks to audit, improve search metadata or make a site accessible before export."
---

# SEO and Accessibility Auditor

## Purpose

Find the problems the engine audit can see, fix them through validated commands, and confirm the exported sitemap, robots file and page metadata match. A clean audit shows only the checks the engine runs, so it is not a full accessibility conformance claim.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Run the audit | `audit_site`, resource formweb://audit | GET /api/audit | Page > Run SEO and accessibility audit (page.audit) |
| Page title, description, noindex | `edit_pages` (page.update with patch.seo) | `./formweb run page.update '{"id":"[page-id]","patch":{"seo":{"title":"T","description":"D","noindex":false}}}'` | Page > Page settings (page.settings), Search and metadata |
| Alt text, labels, heading tags | `edit_nodes` (node.update) | `./formweb run node.update '{"id":"[node-id]","patch":{"attrs":{"alt":"..."}}}'` | Design and Content inspector tabs |
| Base URL | `edit_site` (site.update patch settings baseUrl) | `./formweb run site.update '{"patch":{"settings":{"baseUrl":"https://[domain]"}}}'` | Website studio (window.studio), Site origin and SEO settings |
| Templates, JSON-LD, robots rules | `apply_commands` with `extension.set` group seo | `./formweb run extension.set '{"group":"seo","value":{}}'` | Website studio, Structured metadata and robots |
| Sitemap and robots output | `export_site` | GET /api/export | Export button in the toolbar |

## Preconditions

`get_site` supplied the revision and page IDs. Read formweb://audit or call `audit_site` first to get a baseline, because findings carry codes, page IDs and node IDs. Read pack root `references/advanced-content.md` before editing the seo group. Sibling `content-steward` owns the copy itself.

## Procedure

1. Record the baseline findings. The engine reports these codes: seo.title, seo.description, seo.base-url, a11y.h1, a11y.alt, a11y.duplicate-id, a11y.form-label, link.placeholder, asset.remote and interaction.hover.
2. Fix metadata with `page.update`. Send a complete seo object (title, description, noindex) because the editor patches it whole, and keep existing values you are not changing. Use noindex only when asked, since noindex pages are left out of sitemap.xml and get a robots meta tag.
3. Fix images with `node.update` setting `attrs.alt`. Describe meaningful images in a phrase; an empty alt is valid for decoration. Ask rather than invent facts about a photo.
4. Fix heading order by changing `tag` with `node.update` so each page has exactly one h1 and levels do not skip. Add a label element or `aria-label` to form controls, and replace placeholder links with real page slugs.
5. For site-wide rules, set `baseUrl` so canonical URLs and sitemap entries are real, and write seo templates, JSON-LD or robots allow and disallow paths through the seo extension group after reading it.
6. Re-run `audit_site`, then `export_site` and open `sitemap.xml` and `robots.txt`. Confirm noindex pages are absent from the sitemap and the Sitemap line uses the real base URL. Keyboard and screen reader behavior still needs a browser check.

## Gate

Every remaining finding is fixed or listed with its code and reason, the exported sitemap and robots output were opened, and no fix was applied to an ID that the audit did not return or you did not observe.

## Hands back

Baseline and final audit counts by code, changed page and node IDs, base URL state, sitemap and robots evidence, final revision and unverified accessibility areas.

## Owned resources

- Pack root `references/advanced-content.md`: seo and localization extension groups; open before step 5.
- Pack root `references/mcp-workflows.md`: audit-then-export sequence.
- Sibling `localization`: alternates and per-locale metadata keys.
