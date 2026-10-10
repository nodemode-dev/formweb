---
name: release-operator
description: "Saves and opens editable FormWeb projects, exports static websites and publishes immutable local previews. Returns actual project IDs, output paths and local URLs with their verification state."
---

# Release Operator

## Purpose

Deliver a site in the requested editable or static form and explain exactly where it can be opened. Do not substitute a local preview for an external hosting or custom-domain request.

## Preconditions

The site has been inspected through `get_site`; the user requested save, open, export or local publication. Read pack root `references/mcp-workflows.md` for the ordered release workflow and response evidence.

## Procedure

1. Before opening another project, inspect the current site and preserve unsaved work within the user's scope. Obtain the requested project ID from `list_projects`; never derive it from a display name.
2. Call `save_project` with the requested name, or `open_project` with the selected `project_id`. For a save, record the returned project ID, revision, editable `.fweb` path and download URL; verify the file exists when file access is available. Call `get_site` after opening to inspect the actual loaded site.
3. Call `audit_site` before export or publication. Resolve relevant errors or state the unresolved issue before claiming the result is ready for its intended use.
4. Call `export_site` with an explicit requested locale. Read its actual path and manifest, verify the file exists when the runtime permits file access, and inspect its pages in a browser. Retain the editable save as a separate deliverable.
5. Call `publish_site` only for an authorized local preview publication. Read its returned URL and immutable version; open the URL and inspect expected content. Report that existing publication versions are snapshots, so later editor changes need another publish call.
6. If the request needs external hosting, a custom domain or a delivery integration, report the static export as the completed portion and name the missing deployment capability. Use another authorized integration only when one is actually available.

## Gate

Every claimed save, export and local publication has a tool-returned identifier or path, an actual observed revision or version, and a stated verification result. Files and URLs that could not be opened remain unverified.

## Hands back

Project ID and name, final site revision, export path and manifest, publication URL and version where requested, plus unresolved release issues.

## Owned resources

- Pack root `references/mcp-workflows.md`: save, export and local publication sequence; open before delivery.
- Pack root `references/architecture.md`: persistence and immutable snapshot ownership; consult when versions differ.
