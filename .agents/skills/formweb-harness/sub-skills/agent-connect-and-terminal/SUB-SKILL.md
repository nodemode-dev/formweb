---
name: agent-connect-and-terminal
description: "Works alongside a person in FormWeb through Agent Connect, approvals, the activity feed, editor selection, the window-only terminal and the ./formweb run CLI. Use when agents share the editor, a call waits for approval or is denied, or a change should be made from a shell."
---

# Agent Connect and Terminal

## Purpose

Keep an agent and a person safe in one running editor: know what the person selected, let them approve risky calls, attribute every change, and use the terminal or CLI when a shell is the right tool. Channel labels (human, agent, terminal) are attribution, not permission; roles still decide what an identity may do.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Open Agent Connect | none | none | Rail bolt icon, Window > Agent Connect, `window.agents` |
| Turn Agents on or off | none | none; only the person can, a person starting the engine can set `FORMWEB_AGENTS=1` | Window > "Allow agents (MCP and terminal)", `agents.toggle` |
| Client cards | none | `GET /api/agents/clients` reads them; writing a card is refused outside the window | Agent Connect "Clients", buttons `agents.client.[id]`, `agents.launch.[id]` (ids `claude-code`, `codex`, `cursor`) |
| Read approvals | none | none; the call's own result says when it waited | Agent Connect "Approvals" |
| Approval settings | none | none; only the window changes them | Agent Connect checkboxes (`agentDestructive`, `publishReview`) |
| Decide an approval | none | none; only a person in the window decides | `approvals.approve`, `approvals.deny` |
| Activity | `get_activity`, resource `formweb://activity` | `GET /api/substrate/activity` | Agent Connect "Activity" |
| Selection | resource `formweb://selection` | none | canvas selection |
| Terminal | none | none; only the window opens one | View > Terminal, `view.terminal` (Ctrl `); `terminal.new` |
| Run one command | `apply_commands` | `./formweb run [command] key=value`, which calls the MCP endpoint as an outside agent | none |

## Preconditions

Agents is on; every MCP call fails with a 403 otherwise. An outside agent cannot turn it on or change any approval choice: ask the person to switch it on in the FormWeb window (Window > "Allow agents (MCP and terminal)"), then retry. Read pack root `references/mcp-workflows.md` for connection setup and sibling `recovery-auditor` if a call fails for another reason.

## Procedure

1. Read `formweb://selection` before acting on "this" or "the selected one". It reports the element the person selected in an editor within the last minute, or null with a note. Then confirm the ID in `formweb://site/tree`.
2. The approval settings are readable only in the window, so plan for a wait. With "Ask me before an agent deletes, replaces the open project or changes retention" on (`agentDestructive`), destructive tools and any `apply_commands` batch that removes something wait for a person's decision; only the person can change that choice.
3. If a call waits, it holds up to 100 seconds. Tell the person to watch Agent Connect and wait for the result. If it ends with "No one approved", the approval expired: ask them to be ready and retry once. If it ends with "The person denied", stop, do not rephrase the request to slip past the denial, and offer a non-destructive alternative.
4. Never approve your own request. Decisions are the person's, or a reviewer's for releases (see sibling `branch-and-review`).
5. For a client card, `GET /api/agents/clients` reports each file as missing, ready or changed. Writing that client's project file (`.mcp.json`, `.codex/config.toml` or `.cursor/mcp.json`) is done by the person from the card in Agent Connect; a request from outside the window is refused with "Only the FormWeb window can do this." Ask for the one card the person wants.
6. The terminal is a shell in the FormWeb folder that only the FormWeb window can open; an outside agent cannot, and should not look for another way in. It is for the person's own work; do not run commands that print tokens or provider secrets.
7. `./formweb run --list` lists engine commands. `./formweb run node.update id=headline 'patch={"text":"Hello"}'` applies one; values are parsed as JSON when possible. Add `--json` for machine output and `--revision N` to require a revision. The command line is an outside agent too: it calls the MCP endpoint, so Agents must be on and the approval settings apply. The change is one undo step, appears live and is attributed to the agent channel.
8. After changes, read `formweb://activity` to confirm who did what and under which channel.

## Gate

Each risky action either carried a person's recorded approval or was not performed. A claimed change appears in the activity feed with the right channel. A denial or expiry is reported as such, never as success.

## Hands back

Agents state, approval IDs with outcomes, settings observed, activity rows that confirm the work, and any step the person must still take.

## Owned resources

- Pack root `references/mcp-workflows.md`: connection and recovery workflow; open when Agents or the server is absent.
- Pack root `references/advanced-service.md`: roles, identities and branch context; consult when permission is rejected.
