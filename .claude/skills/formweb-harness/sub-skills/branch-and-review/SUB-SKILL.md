---
name: branch-and-review
description: "Manages FormWeb draft branches, three-way merge review, comments, presence and approval-gated release promotion. Use when work should be isolated, reviewed, discussed or approved before it reaches main or goes live; returns branch IDs, conflicts resolved and approval state."
---

# Branch and Review

## Purpose

Let edits happen in isolation, be compared against main, discussed in comments and merged deliberately. Comments and presence show who is looking at what; they do not prove two people edited the canvas at once.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| List branches | `list_branches`, resource `formweb://branches` | `GET /api/branches` | Window > Website studio (`window.studio`), "Project branches" |
| Create a branch | `create_branch` | `POST /api/branches` | Website studio, "Create branch" |
| Capture branch work | `capture_branch` | `POST /api/branches/[id]/capture` | Website studio, "Capture branch work" |
| Open a branch | `open_branch` | `POST /api/branches/[id]/open` | Website studio, "Open branch" |
| Review differences | `review_branch` | `GET /api/branches/[id]/review` | Website studio, "Review branch changes" |
| Merge | `merge_branch` | `POST /api/branches/[id]/merge` | Website studio, "Merge reviewed branch" |
| Read comments | `list_comments`, resource `formweb://comments` | `GET /api/comments` | Website studio, "Review comments" |
| Add or resolve a comment | `add_comment`, `resolve_comment` | `POST /api/comments`, `POST /api/comments/[id]/resolve` | Website studio, "Add review comment" and "Resolve comment" |
| Presence | `get_presence`, `update_presence`, resource `formweb://presence` | `GET /api/presence`, `POST /api/presence` | none |
| Release approval | `promote_release` | `GET /api/approvals`, `POST /api/approvals/[id]` | Window > Agent Connect (`window.agents`), buttons `approvals.approve` and `approvals.deny` |

## Preconditions

`get_site` supplied the revision and unsaved work is saved, because `create_branch` saves an unsaved main project first. Read pack root `references/advanced-service.md` (section "Review a branch under the right identity"). `get_access` shows the identity's role; deciding an approval needs reviewer, publisher or owner rights.

## Procedure

1. Read `formweb://branches` to see what exists, then `create_branch` with a name, or `open_branch` for an existing one. Confirm the active context before editing. Project saves on an open branch capture that branch and leave the main file alone.
2. Edit with fresh `expected_revision` values. Call `capture_branch` to store the work without overwriting main.
3. Open main before review. `review_branch` compares base, current main and the branch with recursive three-way conflict detection. Read each conflicting path. A resolution is `current` or `branch`, chosen only where the person's intent decides it.
4. Call `merge_branch` with the branch ID, explicit `resolutions` for every conflict and `expectedRevision` (this tool spells it in camel case). The merge is one undo entry. Read `get_site` afterward and save main.
5. Use `add_comment` with `text` and an optional `nodeId` to leave feedback, and `resolve_comment` with `resolved` true or false to close or reopen. Read `formweb://comments` before replying so you do not duplicate a thread.
6. Call `update_presence` with an optional `nodeId` as a heartbeat only when the task needs it. `get_presence` lists entries seen in the last minute.
7. Release approval: when the owner turned on "A reviewer must approve a release before it goes live" in Agent Connect (the `publishReview` setting), `promote_release` returns `pendingApproval` with an approval record instead of going live. A different reviewer then approves through `POST /api/approvals/[approval-id]` with a decision of approve or deny, or with the panel buttons. The local owner may approve their own request. Do not retry the promotion in a loop; read `GET /api/approvals` and report the pending ID.
8. Publishing an active branch is rejected. Merge or return to main before `publish_site`.

## Gate

The merged site was re-read and every conflict has a recorded resolution. A promotion is called live only when the response shows `changed` true or the active URL was opened; `pendingApproval` is reported as waiting for a named reviewer.

## Hands back

Branch IDs and the context left active, conflict paths with chosen resolutions, final revision, comment IDs added or resolved, and approval IDs with their status.

## Owned resources

- Pack root `references/advanced-service.md`: branch, comment and identity rules; open before steps 3 and 4.
- Sibling `recovery-auditor`: stale revisions and merge conflicts that will not resolve.
