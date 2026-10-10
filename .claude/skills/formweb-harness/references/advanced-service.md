# FormWeb Service and Provider Workflows

## Contents

- Discover and classify evidence
- Review a branch under the right identity
- Deliver forms and local releases
- Use configured providers
- Recover without changing the wrong project

## Discover and classify evidence

Read the live tool schemas before any call. The server combines its base, advanced and provider catalogues; the exact arguments remain authoritative. `apply_commands` and `history` use `expected_revision`, while `merge_branch` and `review_translation` use `expectedRevision`. Resource discovery exposes current state, commands, checkpoints, branches, releases, comments, access, activity, presence, deliveries, inbox, providers and catalogue information. Resources are observations, not permission grants.

Classify each result as local, configured, fixture-observed or verified external. A provider's SET credential status proves configuration presence. An API receipt proves the operation returned that receipt. A local fixture proves the adapter's observed request and response behavior. Claim a live domain, TLS certificate, checkout or payment only after observing that actual service outcome.

Read `get_access` and `get_activity` when a task depends on permissions or attribution. Local editor identities and visitor members are separate systems. `create_identity` returns a credential once; keep it secret. `grant_access` requires sufficient existing authority and supports viewer, reviewer, editor, publisher and owner roles. A preview nonce or visitor token cannot authorize editor tools. No OAuth refresh flow is supplied by this pack.

## Review a branch under the right identity

1. Call `get_site`, retain the revision, and save main work before changing context. Discover `list_branches`, `create_branch`, `capture_branch`, `open_branch`, `review_branch` and `merge_branch` rather than inferring branch state from a name.
2. Create or open the intended branch and verify its active context. Apply only the requested edits using fresh revisions. `save_project` on an active branch captures that branch and its history; its response differs from an ordinary project save. Do not claim the main project file was replaced.
3. Open main before review or merge. `review_branch` reports differences and conflicts. Inspect the affected JSON paths; choose each resolution from current or branch only when the user's intent supplies that choice. Preserve unrelated main edits.
4. Call `merge_branch` with the observed branch ID, explicit resolutions when needed and the current `expectedRevision`. Inspect the merged site and checkpoint. An unresolved conflict requires review, not a blind replay.
5. Use `add_comment`, `resolve_comment`, `get_presence` and `update_presence` only for the requested review activity. Comments and presence records do not prove simultaneous canvas editing. Verify `get_activity` attribution under the acting identity, then save main.

## Deliver forms and local releases

1. Inspect authored form fields, validation, success/error behavior and the intended destination against the live typed forms schema. Never infer delivery from stored form configuration.
2. For the local inbox, use `list_submissions`, `export_submissions_csv` and `set_form_retention` only for the authorized site. Confirm the captured record, CSV escaping and requested retention disposition without exposing unrelated submissions.
3. For webhook delivery, discover `get_delivery_config`, `configure_delivery`, `list_deliveries` and `retry_delivery`. Configuration is per site. Credentials remain server-side environment references. Observe the pending or delivered record and endpoint response; retries are bounded, durable and at least once, so a consumer must tolerate a repeated delivery ID.
4. Audit and save main, then call `publish_site` for an immutable local snapshot. `list_releases` returns actual versions; `promote_release` and `rollback_release` change the active local pointer without editing frozen snapshots. Verify the active URL and the version URL separately, including the frozen form schema.
5. Publishing an active branch is rejected. Close the review and merge/open main before release. Report the returned local URL, version and observed response. Configured delivery and local release do not imply external hosting.

## Use configured providers

Start with `provider_status`. Read only the providers relevant to the request. Missing configuration is a concrete operational boundary; do not invent credentials, substitute a fixture silently or print secrets.

- Translation: use `request_translation`, inspect `list_translation_reviews`, then `review_translation` with explicit acceptance and the fresh expected revision. Compare the queue's original values and target locale with the current site. Preserve unrelated translations. A conflict requires another review of current content.
- External data: `fetch_external_data` uses a configured allowlisted source and bounded parameters. Inspect loading, ready, empty and error states, allowed field projection and redaction. A public widget may consume only a source configured for public runtime use. Saved source metadata alone is not a working fetch.
- Hosting: `deploy_remote`, `list_provider_deployments`, `get_provider_deployment`, `attach_domain` and `get_domain_status` operate through the configured provider. Inspect the actual build/upload receipt, deployment state, domain state and live URL. Static deployment must reject content requiring the local membership authorizer rather than disclose it.
- Commerce: use `sync_commerce_catalog`, `get_commerce_catalog` and `get_commerce_orders` for the configured commerce provider. Browser product selection and cart actions use runtime endpoints, not an invented checkout MCP tool. Verify variant availability and the provider checkout URL. An order requires a valid signed provider callback; a cart URL alone is not payment evidence.
- Membership: `list_visitor_members` and `manage_visitor_member` administer authorized visitor membership. Registration, login, logout and session checks occur through the compiled runtime. Verify protection on the server for HTML, routes and sensitive assets against the emitted page ownership manifest. Public code/raster assets must remain usable while privately owned assets require the intended visitor group; inspect both on a mixed site. A hidden browser node is not access control. Preview continuity uses scoped visitor/consent tokens because its sandbox has an opaque origin; those tokens grant no editor authority.
- Analytics: `get_insights` reads actual recorded events. Verify explicit consent, stable weighted assignment, authored conversion goals and withdrawal/retention behavior through runtime actions. Configuration and assignment alone are not conversions. An unavailable browser leaves this consumer check pending.

For code components, `build_code_component` compiles an explicitly enabled TypeScript or JavaScript source under the supported contract. Inspect compilation errors, manifest and props before attaching the component. Its browser execution is isolated; do not describe it as arbitrary server code execution or assume imports are supported.

## Recover without changing the wrong project

Read the actual error and current context before retrying. Refresh main/branch identity and revision after every open, merge, history operation or accepted translation. A permission rejection must be resolved under the authorized identity, not by changing the document or treating it as empty. A provider error should remain visible with any successfully committed local edits preserved.

`get_checkpoint` observes validated undo/redo state. `load_project_file` imports a native envelope, its validated embedded raster assets and checkpoint; it changes the open project. Confirm the intended project before importing and inspect `get_site` and history afterward. Use the tool-reported native format and size limits rather than wrapping arbitrary JSON as a successful portable file. Never replay an entire prior workflow after a partial failure.
