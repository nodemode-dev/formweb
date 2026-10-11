---
name: localization
description: "Manages FormWeb locales, translation maps, localized CMS items, locale routes and alternates, and per-locale export. Use when a request adds a language, translates text or metadata, localizes records or checks hreflang output."
---

# Localization

## Purpose

Add a locale, supply translations and prove that each claimed language appears in the exported output with the right routes and alternates. Missing translations fall back to base content, so a registered locale is not the same as a translated one.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Add locale or set translations | `edit_locales` (locale.set) | `./formweb run locale.set '{"locale":"es","translations":{}}'` | CMS > Localization... (cms.locales) |
| Choose default locale or list locales | `edit_site` (site.update patch defaultLocale, locales) | `./formweb run site.update '{"patch":{"defaultLocale":"en"}}'` | Localization dialog, Make default locale |
| Localize a CMS item | `edit_cms` (cms.localize) | `./formweb run cms.localize '{"collection":"[id]","item":"[id]","locale":"es","values":{}}'` | Website studio (window.studio), Localize an item |
| Localized slugs and assets | `apply_commands` with `extension.set` group localization | `./formweb run extension.set '{"group":"localization","value":{}}'` | Website studio, localization category |
| Export one locale | `export_site` with locale | GET /api/export?locale=[code] | Export button in the toolbar |
| Preview a locale | `compile_preview` with locale | POST /api/preview | Canvas locale selector in the toolbar |

## Preconditions

`get_site` supplied the revision, `defaultLocale`, the existing locale keys, page IDs and collection IDs. Locale codes follow the editor rule: two or three lowercase letters, optionally a region such as en-US. Read pack root `references/advanced-content.md` before localized routes, assets or CMS items. Sibling `content-steward` owns base copy and CMS records.

## Procedure

1. Inventory existing locales and translation keys with `get_site` and formweb://site/tree. Node keys are observed node IDs; page metadata keys use the page ID plus `.title` or `.description` (per pack root `references/advanced-content.md`).
2. Call `locale.set` with the locale and the full translation map. It replaces the map for that locale, so merge in the existing keys you want to keep. Use `site.update` only to change `defaultLocale`.
3. For records, call `cms.localize` with collection, item, locale and field values, plus optional slug and status. A locale draft must stay out of only that locale's routes, so inspect publication state per locale.
4. For translated routes or media, read the current `localization` extension group, then write it back with `extension.set`: `allLocales`, `pageSlugs` per page and locale, and `assets` per node and locale. Preserve unrelated entries.
5. Export each requested locale with `export_site` and open the output. Check the `lang` attribute, translated text, canonical URLs and reciprocal `rel="alternate" hreflang` links, which the advanced exporter builds from the page's routes. Confirm localized slugs are unique.
6. Call `audit_site`, set a real `baseUrl` setting if the audit asks for one, and report untranslated keys rather than inventing copy.

## Gate

Every locale claimed complete shows its translated text in an inspected export, alternates are reciprocal where the localization group is configured, and no translation key points at a missing node or page. Anything not seen in the export is reported as unverified.

## Hands back

Locale codes, translation key counts, localized item IDs, export paths per locale, alternate and route evidence, final revision and audit findings.

## Owned resources

- Pack root `references/advanced-content.md`: locale, route and localized CMS rules; open before step 3.
- Pack root `references/architecture.md`: translation key behavior and fallback.
- Sibling `seo-a11y-auditor`: metadata, sitemap and robots checks on the exported locales.
