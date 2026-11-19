---
name: formweb-harness
description: "Builds and edits websites in FormWeb through its Rust-backed MCP server. Use when a request asks to create, edit, inspect, review or deliver a FormWeb site, including responsive landing pages, portfolios, blogs, CMS sites and forms. Covers page trees, layout, breakpoints, tokens, component props/variants/slots, CMS records, templates and queries, localization, interactions, SEO, accessibility, editable .fweb projects, static export and local publish. Coordinates content review, local releases, branches, comments, permissions, form inbox/delivery and configured data, translation, hosting, commerce, membership or analytics providers only when actual tools expose them. Reads current state, applies validated changes, inspects compiled/browser behavior and saves requested deliverables; separates configured, fixture, local and verified external results. Excludes source-code implementation, Framer/Webflow account administration and unsupported hosting or payment claims."
license: Apache-2.0
compatibility: "Project skill for Claude Code and other clients with the FormWeb MCP server connected. Requires a running local FormWeb FastAPI service and explicit Agents enablement."
metadata:
  author: "nodemode-ai"
  version: "0.23.0"
---

# FormWeb Harness

FormWeb's MCP server edits the same Rust-owned site that its editor displays. This pack supplies the sequence and checks needed to turn a brief into an editable website, instead of treating a successful tool call as a finished result.

## Pack map

```text
formweb-harness/
  SKILL.md
  references/
    architecture.md
    advanced-authoring.md
    advanced-content.md
    advanced-service.md
    mcp-workflows.md
    evaluations.md
    trigger-cases.md
  sub-skills/
    harness-director/SUB-SKILL.md            broad briefs, plans and routes
    platform-map/SUB-SKILL.md                how FormWeb is assembled
    site-and-pages/SUB-SKILL.md              pages, settings, icons, passwords, QR
    layout-builder/SUB-SKILL.md              page trees, grid and flex, breakpoints
    style-and-tokens/SUB-SKILL.md            tokens, text presets, breakpoint definitions
    components/SUB-SKILL.md                  components, libraries, code components
    cms-steward/SUB-SKILL.md                 collections, records, bindings, queries
    localization/SUB-SKILL.md                locales, translations, locale routes
    seo-a11y-auditor/SUB-SKILL.md            audit, metadata, alt text, headings
    forms-operator/SUB-SKILL.md              forms, inbox, retention, delivery
    interaction-builder/SUB-SKILL.md         interactions, variables, scripts, search
    components-builder/SUB-SKILL.md          page components, code sections, posters
    motion-director/SUB-SKILL.md             which motion mechanism, motion and variables tools
    library/SUB-SKILL.md                     ready-made sections, presets, starters, Import HTML
    release-operator/SUB-SKILL.md            save, export, publish, providers
    branch-and-review/SUB-SKILL.md           branches, merges, comments, release review
    agent-connect-and-terminal/SUB-SKILL.md  approvals, activity, selection, terminal, CLI
    recovery-auditor/SUB-SKILL.md            errors, conflicts, interrupted work
```

Every specialist opens with a Surfaces table that maps its MCP tools to the CLI or REST call and the editor menu command (with its `data-command` id), so the same action can be done, checked or explained from any of the three.

A specialist-local path resolves from that specialist's folder. A sibling path resolves to the named specialist shown in the map. All named pack-wide references resolve from the pack root. Use forward slashes and open references directly from the body that names them.

## Routing

| Request | Load |
| --- | --- |
| Build a site from a brief, complete several features, or continue broad work | `sub-skills/harness-director/SUB-SKILL.md` |
| Learn how FormWeb fits together, which port or file holds what, which transport to use | `sub-skills/platform-map/SUB-SKILL.md` |
| Add, rename, duplicate, bulk-create or remove pages; site name, icons, hidden scrollbars, page passwords, QR codes | `sub-skills/site-and-pages/SUB-SKILL.md` |
| Fix responsive layout, page structure, grid or flex, breakpoint overrides, embeds | `sub-skills/layout-builder/SUB-SKILL.md` |
| Change colors, type scale, spacing tokens, text presets or breakpoint definitions | `sub-skills/style-and-tokens/SUB-SKILL.md` |
| Reusable components, props, variants, slots, pinned libraries or code components | `sub-skills/components/SUB-SKILL.md` |
| Add CMS collections, records, queries, templates, bindings or CSV | `sub-skills/cms-steward/SUB-SKILL.md` |
| Add a language, translate copy or CMS items, locale routes | `sub-skills/localization/SUB-SKILL.md` |
| Audit or fix SEO and accessibility: titles, descriptions, alt text, headings, labels | `sub-skills/seo-a11y-auditor/SUB-SKILL.md` |
| Forms, submissions inbox, CSV, retention, signed webhook delivery | `sub-skills/forms-operator/SUB-SKILL.md` |
| Author interactions, variables and calculators, script player, site search, data widgets, commerce, membership or consent behavior | `sub-skills/interaction-builder/SUB-SKILL.md` |
| Page components that run in the page, code sections, posters, color and asset props, svg assets | `sub-skills/components-builder/SUB-SKILL.md` |
| Make something move or react and choose between native motion, scroll scenes, variables, scripts or a page component | `sub-skills/motion-director/SUB-SKILL.md` |
| Start from a ready-made hero, pricing, footer or scroll-story section, apply the design preset or starter site, import an HTML page, or author a library template | `sub-skills/library/SUB-SKILL.md` |
| Save/import a native project, export, publish locally or through configured providers | `sub-skills/release-operator/SUB-SKILL.md` |
| Branches, merge review, comments, presence, release approval by a reviewer | `sub-skills/branch-and-review/SUB-SKILL.md` |
| A person is in the editor too: approvals, activity, their selection, the terminal, `./formweb run` | `sub-skills/agent-connect-and-terminal/SUB-SKILL.md` |
| Diagnose authorization, stale revisions, merge conflicts, provider errors or interrupted work | `sub-skills/recovery-auditor/SUB-SKILL.md` |

For broad work, start with the director and let it load specialists. A narrow task may load its own specialist directly after observing the current site.

## Standing gates

- Discover actual tools before working. Use only names exposed by this FormWeb server; a skill cannot add missing tools.
- Call `get_site` before mutation (detail `summary` for the outline, `full` for styles), or read `formweb://site/tree` for element IDs and `formweb://selection` for what the person has selected. Use returned IDs and the current `revision`, because fabricated IDs and stale state can change the wrong object.
- Pass that revision as `expected_revision` to `apply_commands`. A batch is one atomic Rust undo step; a failed batch changes neither state nor revision.
- Preserve the user's existing site. A new brief does not authorize replacing an unrelated open project. Inspect and choose the smallest change before sending commands.
- Treat saved configuration, exported browser behavior, and hosted services as separate evidence. A stored form or interaction is not proof that its published behavior works.
- Use `audit_site` and inspect the rendered export at the requested widths before calling a visual change checked. State which widths and browser were observed; if unavailable, name the unverified portion.
- Save an editable project when the request produces a reusable site. Export or publish only to the scope the user requested.
- `publish_site` creates an immutable local publication. Report its returned URL as local and do not describe it as an external deployment or custom-domain launch.

## Workflow and recovery

The workflow combines sequential orchestration with context-aware routing: observe, plan, apply, inspect, save. Open `references/mcp-workflows.md` for three ordered workflows and connection setup. Open `references/architecture.md` before constructing commands that touch tree ownership, responsive styling, CMS, components, or localization.

If the server is absent, inspect the client's connection status and running backend. If Agents is disabled, enable it only within the user's authorized scope. If a tool name does not resolve, re-read `tools/list` instead of guessing names. For authentication or permission rejection, inspect the configured local identity and `get_access` without printing credentials. Open `references/advanced-service.md` for roles, branch context, delivery and configured providers; editor identities, visitor sessions and preview tokens have distinct authority. No OAuth refresh flow is supplied.

If a workflow stops after a successful command, re-read `get_site`, compare the committed changes, and resume only the missing steps. Do not replay earlier successful mutations. Call a failing tool directly without relying on this skill's sequence; if that still fails, diagnose the server through the recovery specialist.

## Verification bar

Report the saved project ID or tool-reported output path, the final revision, the audit issues left open, and the preview widths actually inspected. Name every requested capability that remains incomplete. Never claim an external host, collaboration session, or payment service exists from local data alone.

Open `references/evaluations.md` to review the six scenario specifications before changing this pack, and `references/trigger-cases.md` to check positive and adjacent negative phrasings. These are markdown evaluation plans, not executable application tests. Keep this pack's tool names synchronized with the live catalogue whenever server contracts change.
