---
name: harness-director
description: "Directs broad FormWeb website requests, from observing the open site through a layout plan, engine commands, browser checks and saved deliverables. Loads only the specialists needed for the requested result."
---

# Harness Director

## Purpose

Complete a FormWeb website brief while retaining a reviewable record of what changed and what was checked. Own the workflow and return the requested editable and exported deliverables.

## Preconditions

The FormWeb server is connected and its live tool list is known. Load `sub-skills/recovery-auditor/SUB-SKILL.md` when connection or state inspection fails.

## Procedure

1. Read `references/mcp-workflows.md` at the pack root. Capture the site purpose, audience, page list, required content, target widths, and deliverables from the user's request. Infer routine choices from the current document; ask only for missing information that changes the result materially.
2. Call `get_site`. Record its site ID, revision, page roots and any content that must be kept. Read `references/architecture.md` at the pack root before choosing command parameters.
3. Write a compact plan naming pages, their slugs, node hierarchy, grid or flex choices, styles, breakpoints, content sources and output scope. New IDs in a command must be unique; existing IDs must come from the observed document.
4. Route each part to its specialist using the routing table in the pack root SKILL.md: pages and site settings to `sub-skills/site-and-pages/SUB-SKILL.md`, layout to `sub-skills/layout-builder/SUB-SKILL.md`, tokens and breakpoints to `sub-skills/style-and-tokens/SUB-SKILL.md`, reusable parts to `sub-skills/components/SUB-SKILL.md`, structured content to `sub-skills/cms-steward/SUB-SKILL.md`, translations to `sub-skills/localization/SUB-SKILL.md`, forms to `sub-skills/forms-operator/SUB-SKILL.md`, and behavior to `sub-skills/interaction-builder/SUB-SKILL.md`. Unfamiliar with the platform: read `sub-skills/platform-map/SUB-SKILL.md` first. A person working in the editor at the same time: follow `sub-skills/agent-connect-and-terminal/SUB-SKILL.md` and use `formweb://selection` for "this". Give each specialist the latest observed revision. For branch review, roles, form delivery or configured providers, open pack root `references/advanced-service.md` and assign delivery to the release operator or diagnosis to the recovery auditor. Record the required consuming outcome and evidence boundary before changing configuration.
5. After each coherent batch, inspect the returned state or call `get_site`; record the revision and affected IDs. On error, stop mutations and route to the recovery auditor before choosing a retry.
6. Route the audit to `sub-skills/seo-a11y-auditor/SUB-SKILL.md` (it calls `audit_site` and fixes relevant issues), and branch work to `sub-skills/branch-and-review/SUB-SKILL.md`. Export a browser preview. Inspect the requested widths, keyboard access, working links and any authored behavior. Record observed results separately from checks still pending.
7. Route delivery to `sub-skills/release-operator/SUB-SKILL.md`. Report the saved ID, exported path or local publication URL with limitations that affect the requested use.

## Gate

The final observed document matches the requested page and content scope, each command's outcome is accounted for, the audit disposition is recorded, and each requested deliverable is returned by a tool. Visual or behavior checks that could not run are explicitly named.

## Hands back

A session record: brief, plan, initial and final revisions, command groups applied, audit issues, preview checks, deliverable identifiers and remaining work.

## Owned resources

- Pack root `references/mcp-workflows.md`: connection setup and ordered site workflows; open before the first call.
- Pack root `references/architecture.md`: model ownership and command conventions; open before planning structure.
- Pack root `references/evaluations.md`: scenario specifications; consult when revising this workflow.
