---
name: interaction-builder
description: "Authors FormWeb navigation, interactions, forms and configured runtime widgets for data, commerce, membership and consent. Requires observed browser outcomes and distinguishes local capture, provider fixtures and verified external services."
---

# Interaction Builder

## Purpose

Create useful behavior that can be demonstrated in an exported page. Keep local submission capture separate from external email, CRM delivery or production abuse protection.

## Preconditions

`get_site` supplied the current revision, affected nodes and their attributes. The intended action and form fields are known. Read pack root `references/architecture.md` for the interaction model and form boundary. For authored states, timelines, overlays and typed form settings inspect the live extension schema; for runtime data, commerce, membership or consent read pack root `references/advanced-service.md`. A configured widget is not an observed browser consumer.

## Procedure

1. Identify the control, its intended action and the target. Prefer a real link for navigation and a button for an action. Ensure the user can discover and use the control with a keyboard.
2. Apply `node.update` through `apply_commands` with current `expected_revision`. Supported interaction triggers are `click`, `hover` and `scroll`; supported actions are `toggle-class`, `navigate` and `fade-in`. Use only the parameters the live model accepts.
3. Keep existing interactions when updating the array. A toggle needs a named class and styles that make its state meaningful; navigation needs a resolved URL or existing page slug. Inspect the export to confirm the runtime performs the configured action.
4. For a form, construct a semantic form tree with named controls, associated labels, appropriate input types, required flags where needed, and an explicit submit button. Use the backend's documented submission endpoint convention; do not guess endpoint attributes.
5. Export or locally publish, then perform the requested action in the browser. Check focus, the triggered state, navigation destination and a form's success or failure response. Read `list_submissions` only when the user authorized inspecting locally captured submissions.
6. Call `audit_site` and record accessibility or form issues. Name missing integrations or behavior checks so a configured record is not mistaken for an end-to-end service.

## Gate

Each claimed interaction was observed in the browser, controls are labeled and keyboard reachable, and a claimed form capture has an observed submission result. Email, CRM, webhooks and hosted security features remain unclaimed unless separately implemented and verified.

## Hands back

Affected node and form IDs, final revision, interaction checks, submission scope, audit issues and any behavior still unverified.

## Owned resources

- Pack root `references/architecture.md`: supported interactions and local form boundary; open before behavior work.
- Pack root `references/mcp-workflows.md`: publication and submission inspection sequence; open before an end-to-end check.
