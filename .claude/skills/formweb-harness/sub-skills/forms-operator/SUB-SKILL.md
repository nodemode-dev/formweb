---
name: forms-operator
description: "Runs FormWeb forms end to end: adds a form element, reads the local submission inbox, exports CSV, sets retention and configures signed webhook delivery with retries. Use for form capture, inbox and delivery requests; returns observed records and delivery status."
---

# Forms Operator

## Purpose

Take a form from an empty page to a captured, retained and optionally delivered submission, and report which of those steps was actually observed. Published forms post to the local FormWeb backend, so capture depends on that service staying up.

## Surfaces

| Action | MCP | CLI or REST | Editor |
| --- | --- | --- | --- |
| Add a form | `apply_commands` with `node.add`, or `edit_nodes` | `./formweb run node.add` with a node parameter | Insert > Form, `insert.form` |
| Read the inbox | `list_submissions`, resource `formweb://inbox` | `GET /api/forms` (optional `siteId`) | Window > Website studio (`window.studio`), "Form inbox" |
| Export CSV | `export_submissions_csv` | `GET /api/forms.csv` | Website studio, "Export submission CSV" |
| Set retention | `set_form_retention` (destructive) | `POST /api/forms/retention` | Website studio, "Apply submission retention" |
| Read delivery setup | `get_delivery_config` | `GET /api/delivery/config` | Website studio, "Delivery configuration" |
| Configure delivery | `configure_delivery` | `POST /api/delivery/config` | Website studio, "Configure signed delivery" |
| List deliveries | `list_deliveries`, resource `formweb://deliveries` | `GET /api/delivery` | Website studio, "Delivery outbox" |
| Retry a delivery | `retry_delivery` | `POST /api/delivery/[id]/retry` | none |
| Submit as a visitor | none | `POST /api/forms/[site-id]/[form-id]` | none |

## Preconditions

`get_site` supplied the revision and the parent node for the form. Agents is on. Read pack root `references/advanced-service.md` (section on forms and local releases) before touching retention or delivery. For field markup and browser checks, use sibling `interaction-builder`. Know the site ID before any inbox call; `list_projects` and `get_site` supply it.

## Procedure

1. Add the form. In the editor, Insert > Form (`insert.form`) creates a form named "contact" with labeled inputs and a submit button, as one undo step. Through MCP, send `node.add` for the form and each control in one `apply_commands` batch with `expected_revision`. Use labels, input types and `required` so the form is usable and the audit passes.
2. Save, then publish locally (`publish_site`, see sibling `release-operator`). A form needs a published or preview page to post; the editor canvas does not submit.
3. Submit once in a browser and then read `formweb://inbox` or call `list_submissions` (up to 500 rows, newest first). Match the values you typed to a stored record. Only read submissions when the person authorized it, because they hold visitors' data.
4. For a spreadsheet, call `export_submissions_csv`. The CSV is formula-safe; do not paste its rows into the reply beyond what was requested.
5. Retention is destructive: `set_form_retention` with `days` stores the policy and deletes older submissions, and site undo cannot restore them. State the cutoff to the person first. With Agent Connect approvals on, the call waits for a person (see sibling `agent-connect-and-terminal`).
6. For webhooks, call `get_delivery_config` first. `configure_delivery` takes `siteId` and `endpoints`; signing secrets are named server environment variables, never values, so set the environment on the server and do not print it. Deliveries are signed with an `X-FormWeb-Signature` header and carry `X-FormWeb-Delivery`.
7. After a submission, read `formweb://deliveries` or `list_deliveries` and record the status and response. Call `retry_delivery` with the observed delivery ID only for a failed, blocked or queued job. Retries are at least once, so the receiver must tolerate a repeated delivery ID.

## Gate

A claimed capture has a stored submission whose values match the browser input. A claimed delivery has a delivery record with an observed response. Configuration alone, a queued job or a missing environment secret is reported as exactly that, not as working delivery. A published form on another host needs the local backend or a replaced form action.

## Hands back

Form node IDs, final revision, the submission ID observed, CSV or retention results with the cutoff used, delivery IDs with status, and anything left unverified.

## Owned resources

- Pack root `references/advanced-service.md`: inbox, retention and delivery rules; open before steps 5 to 7.
- Pack root `references/architecture.md`: the local form boundary; consult when capture fails.
