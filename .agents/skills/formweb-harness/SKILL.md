---
name: formweb-harness
description: "Builds and edits websites in FormWeb through its Rust-backed MCP server. Use whenever a request asks to create, edit, inspect or deliver a FormWeb site, or make a responsive landing page, portfolio, blog, CMS site or contact form in the Form family editor. Covers page and layer trees, grid and flex layout, breakpoints, styles, reusable components, CMS collections and records, localization, interactions, forms, SEO, accessibility, editable .fweb projects and HTML/CSS/JS export. Inspects the current document, applies engine commands, checks audits and browser previews, and saves or exports requested files. Does not replace source-code development, operate Framer or Webflow accounts, or claim external hosting from a local publish operation."
license: Apache-2.0
compatibility: "Project skill for Claude Code and other clients with the FormWeb MCP server connected. Requires a running local FormWeb FastAPI service and explicit Agents enablement."
metadata:
  author: "nodemode-ai"
  version: "0.1.0"
---

# FormWeb Harness

FormWeb's MCP server edits the same Rust-owned site that its editor displays. This pack supplies the sequence and checks needed to turn a brief into an editable website, instead of treating a successful tool call as a finished result.

## Pack map

```text
formweb-harness/
  SKILL.md
  references/
    architecture.md
    mcp-workflows.md
    evaluations.md
    trigger-cases.md
  sub-skills/
    harness-director/SUB-SKILL.md
    layout-builder/SUB-SKILL.md
    content-steward/SUB-SKILL.md
    interaction-builder/SUB-SKILL.md
    release-operator/SUB-SKILL.md
    recovery-auditor/SUB-SKILL.md
```

A specialist-local path resolves from that specialist's folder. A sibling path resolves under `sub-skills/[name]/SUB-SKILL.md`. The four named pack-wide references resolve from the pack root. Use forward slashes and open references directly from the body that names them.

## Routing

| Request | Load |
| --- | --- |
| Build a site from a brief, complete several features, or continue broad work | `sub-skills/harness-director/SUB-SKILL.md` |
| Fix mobile layout, style a page, restructure layers, or reuse a component | `sub-skills/layout-builder/SUB-SKILL.md` |
| Add blog records, bind CMS fields, translate copy, or edit page metadata | `sub-skills/content-steward/SUB-SKILL.md` |
| Add a click or scroll effect, navigation, or a contact form | `sub-skills/interaction-builder/SUB-SKILL.md` |
| Save or open a project, export a website, or publish a local preview | `sub-skills/release-operator/SUB-SKILL.md` |
| Diagnose a stale revision, tool error, failed audit, or interrupted workflow | `sub-skills/recovery-auditor/SUB-SKILL.md` |

For broad work, start with the director and let it load specialists. A narrow task may load its own specialist directly after observing the current site.

## Standing gates

- Discover actual tools before working. Use only names exposed by this FormWeb server; a skill cannot add missing tools.
- Call `get_site` before mutation. Use returned IDs and the current `revision`, because fabricated IDs and stale state can change the wrong object.
- Pass that revision as `expected_revision` to `apply_commands`. A batch is one atomic Rust undo step; a failed batch changes neither state nor revision.
- Preserve the user's existing site. A new brief does not authorize replacing an unrelated open project. Inspect and choose the smallest change before sending commands.
- Treat saved configuration, exported browser behavior, and hosted services as separate evidence. A stored form or interaction is not proof that its published behavior works.
- Use `audit_site` and inspect the rendered export at the requested widths before calling a visual change checked. State which widths and browser were observed; if unavailable, name the unverified portion.
- Save an editable project when the request produces a reusable site. Export or publish only to the scope the user requested.
- `publish_site` creates an immutable local publication. Report its returned URL as local and do not describe it as an external deployment or custom-domain launch.

## Workflow and recovery

The workflow combines sequential orchestration with context-aware routing: observe, plan, apply, inspect, save. Open `references/mcp-workflows.md` for three ordered workflows and connection setup. Open `references/architecture.md` before constructing commands that touch tree ownership, responsive styling, CMS, components, or localization.

If the server is absent, inspect the client's connection status and running backend. If Agents is disabled, enable it only within the user's authorized scope. If a tool name does not resolve, re-read `tools/list` instead of guessing names. If authentication is rejected, check the local `FORMWEB_AUTH_TOKEN` configuration and any configured proxy credentials without printing secrets. This local release has no account login or permission scopes to refresh.

If a workflow stops after a successful command, re-read `get_site`, compare the committed changes, and resume only the missing steps. Do not replay earlier successful mutations. Call a failing tool directly without relying on this skill's sequence; if that still fails, diagnose the server through the recovery specialist.

## Verification bar

Report the saved project ID or tool-reported output path, the final revision, the audit issues left open, and the preview widths actually inspected. Name every requested capability that remains incomplete. Never claim an external host, collaboration session, or payment service exists from local data alone.

Open `references/evaluations.md` to review the three scenario specifications before changing this pack, and `references/trigger-cases.md` to check positive and adjacent negative phrasings. These are markdown evaluation plans, not executable application tests. Keep this pack's tool names synchronized with the live catalogue whenever server contracts change.
