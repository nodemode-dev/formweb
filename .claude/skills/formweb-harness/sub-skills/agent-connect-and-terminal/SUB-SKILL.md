---
name: agent-connect-and-terminal
description: "Works alongside a person in FormWeb through Agent Connect, approvals, the activity feed, editor selection, the owner-only terminal and the ./formweb run CLI. Use when agents share the editor, a call waits for approval or is denied, or a change should be made from a shell."
---

# Agent Connect and Terminal

## Purpose

Keep an agent and a person safe in one running editor: know what the person selected, let them approve risky calls, attribute every change, and use the terminal or CLI when a shell is the right tool. Channel labels (human, agent, terminal) are attribution, not permission; roles still decide what an identity may do.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Open Agent Connect | none | none | Rail bolt icon, Window > Agent Connect, `window.agents` |
| Turn Agents on or off | none | `POST /api/agents`, `FORMWEB_AGENTS=1` | Window > "Allow agents (MCP and terminal)", `agents.toggle` |
| Client cards | none | `GET /api/agents/clients`, `POST /api/agents/clients/[id]` (ids `claude-code`, `codex`, `cursor`) | Agent Connect "Clients", buttons `agents.client.[id]`, `agents.launch.[id]` |
| Read approvals | none | `GET /api/approvals` | Agent Connect "Approvals" |
| Approval settings | none | `POST /api/approvals/settings` with `agentDestructive`, `publishReview` | Agent Connect checkboxes |
| Decide an approval | none | `POST /api/approvals/[approval-id]` with approve or deny | `approvals.approve`, `approvals.deny` |
| Activity | `get_activity`, resource `formweb://activity` | `GET /api/substrate/activity` | Agent Connect "Activity" |
| Selection | resource `formweb://selection` | none | canvas selection |
| Terminal | none | WebSocket `/api/terminal` | View > Terminal, `view.terminal` (Ctrl `); `terminal.new` |
| Run one command | `apply_commands` | `./formweb run [command] key=value`, `POST /api/substrate/run` | none |

## Preconditions

Agents is on; every MCP call fails with a 403 otherwise. Enable it only within the user's authorized scope. Read pack root `references/mcp-workflows.md` for connection setup and sibling `recovery-auditor` if a call fails for another reason.

## Procedure

1. Read `formweb://selection` before acting on "this" or "the selected one". It reports the element the person selected in an editor within the last minute, or null with a note. Then confirm the ID in `formweb://site/tree`.
2. Check Agent Connect settings with `GET /api/approvals`. With "Ask me before an agent deletes, replaces the open project or changes retention" on (`agentDestructive`), destructive tools and any `apply_commands` batch that removes something wait for a person's decision.
3. If a call waits, it holds up to 100 seconds. Tell the person to watch Agent Connect and wait for the result. If it ends with "No one approved", the approval expired: ask them to be ready and retry once. If it ends with "The person denied", stop, do not rephrase the request to slip past the denial, and offer a non-destructive alternative.
4. Never approve your own request. Decisions are the person's, or a reviewer's for releases (see sibling `branch-and-review`).
5. For a client card, `GET /api/agents/clients` reports each file as missing, ready or changed. `POST /api/agents/clients/[id]` writes that client's project file (`.mcp.json`, `.codex/config.toml` or `.cursor/mcp.json`) and needs manage rights; write only the card the person asked for.
6. The terminal is a shell in the FormWeb folder, owner-only and available only while Agents is on. Turning Agents off closes every session. It is for the person's own work; do not run commands that print tokens or provider secrets.
7. `./formweb run --list` lists engine commands. `./formweb run node.update id=headline 'patch={"text":"Hello"}'` applies one; values are parsed as JSON when possible. Add `--json` for machine output and `--revision N` to require a revision. The change is one undo step, appears live and is attributed to the terminal channel.
8. After changes, read `formweb://activity` to confirm who did what and under which channel.

## Gate

Each risky action either carried a person's recorded approval or was not performed. A claimed change appears in the activity feed with the right channel. A denial or expiry is reported as such, never as success.

## Hands back

Agents state, approval IDs with outcomes, settings observed, activity rows that confirm the work, and any step the person must still take.

## Owned resources

- Pack root `references/mcp-workflows.md`: connection and recovery workflow; open when Agents or the server is absent.
- Pack root `references/advanced-service.md`: roles, identities and branch context; consult when permission is rejected.
