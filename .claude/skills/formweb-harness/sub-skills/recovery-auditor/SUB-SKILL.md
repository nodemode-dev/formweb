---
name: recovery-auditor
description: "Diagnoses FormWeb MCP connection errors, disabled Agents, stale revisions, invalid commands and interrupted workflows. Separates server failures from workflow mistakes and returns a safe resume plan."
---

# Recovery Auditor

## Purpose

Establish the actual current state before recovering a failed workflow. Preserve committed work and avoid retries that duplicate earlier successful edits.

## Preconditions

A call failed, a state revision is uncertain, or the user requested an audit. If the server is disconnected, the connection check is the first action. Read pack root `references/mcp-workflows.md` for startup and tool discovery.

## Procedure

1. For a missing server, inspect the client's MCP status, the configured command or URL, and backend availability. The skill does not create a connection by declaring one. The stdio server proxies the running backend rather than opening an isolated site.
2. For disabled Agents, check the running application's Agents switch or `FORMWEB_AGENTS` startup setting. Enable only when authorized; do not disguise permission rejection as an empty result.
3. For authentication errors, check whether the endpoint is the intended local server or a configured proxy. Inspect the root token or issued local identity credential without printing it. For permission errors, inspect `get_access`, the acting identity and project context; read pack root `references/advanced-service.md` for roles and their boundaries. Visitor tokens and preview nonces cannot grant editor access. Do not invent OAuth refresh steps; follow actual proxy documentation if one is used.
4. For an unresolved name, call `tools/list` and compare the exact tool name and schema. Do not try plausible alternate spellings.
5. Call the failing tool directly using the observed schema to isolate the problem from this skill's sequence. A direct failure is server evidence; a direct success points toward incorrect ordering or arguments.
6. On revision conflict, call `get_site`, compare the current affected objects with the intended change, and construct only the still-needed commands with the fresh `expected_revision`. An atomic failed batch has no committed prefix; successful earlier batches do.
7. For invalid commands or audit findings, inspect the reported issue and relevant node, collection, page or locale. Apply the smallest correction; do not replace the site to hide an error.
8. A call that waits and then fails with "No one approved ... within 100 seconds" (status 408) or "The person denied ..." (status 403, `approvalId` in the result) came from Agent Connect approvals: the owner asked to approve destructive agent calls. Do not retry in a loop. Tell the person what you need approved and why, then retry once after they say they are watching. A promotion that returns `pendingApproval: true` is not live; a different reviewer must approve it in Agent Connect.
9. Use `history` with `action` `undo` or `redo` only when it reverses the intended step. Inspect the undo boundary first and pass the current revision. Re-read `get_site` after history changes before using old IDs.

## Gate

The report identifies whether failure came from connection, authorization, catalogue, revision, command validation or workflow sequencing. The current state and successful earlier mutations are known, and any retry uses observed IDs and a fresh revision.

## Hands back

Failure category, observed error, current revision, preserved changes, smallest recovery action and whether the direct call succeeded.

## Owned resources

- Pack root `references/mcp-workflows.md`: startup, discovery and recovery examples; open at intake.
- Pack root `references/architecture.md`: atomicity and state ownership; use for mutation failures.
- Pack root `references/evaluations.md`: interrupted-workflow scenario; consult when revising recovery instructions.
