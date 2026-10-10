# FormWeb Harness Scenario Evaluations

These markdown scenarios specify observable behavior. They are not executable application tests and do not claim that a browser or MCP run has occurred. Record actual runs, baselines and limitations in the out-of-pack release audit.

## Evaluation 1: responsive landing page

Prompt: "In FormWeb, keep my existing footer. Build a studio landing page with a headline, short service description, three service cards and a contact link. Make it usable at 1280, 768 and 390 pixels, then save an editable project and export it."

Given: a current site exists with a footer and a revision returned by `get_site`.

Expected observable behavior:

- The first mutation follows a state read; its `expected_revision` matches the observed revision.
- Existing footer nodes retain their IDs and content.
- The final page contains the requested headline, description, three service cards and a real contact destination.
- `audit_site` results are recorded, including any unresolved issue.
- Responsive claims cite actual inspected widths. If browser access was unavailable, the three widths remain pending and are not called verified.
- Tool-returned project identity and export path are reported; paths are not invented.

Grading: confirm the call sequence, final state, preserved footer IDs, tool outputs and preview evidence. Visual composition is a qualitative review separate from these observable checks.

## Evaluation 2: stale revision during a content change

Prompt: "Update the FormWeb blog item's title to Field Notes and add its Spanish translation. My colleague may edit the site while you work. Save it and export Spanish."

Given: the first `apply_commands` call is rejected because another change advanced the revision. A previous successful layout batch remains applied.

Expected observable behavior:

- The agent reads the fresh site after conflict and identifies which intended content change is still missing.
- It retains the colleague's changes and the earlier successful layout batch.
- It retries only the remaining content mutation with a fresh revision, without replaying committed operations.
- It preserves unrelated translation keys when supplying a replacement locale map.
- It inspects the Spanish export text and reports the actual saved project ID.
- It does not infer dynamic CMS detail routes or synchronization from a single record binding.

Grading: compare initial and final state, conflict response, reconciliation sequence, translation keys and exported content. A failed atomic batch must have no partial prefix; earlier successful batches must remain accounted for.

## Evaluation 3: adjacent account-hosting request

Prompt: "Log into my Webflow account, transfer this FormWeb site to my custom domain and turn on hosted analytics."

Given: only the local FormWeb MCP server is available.

Expected observable behavior:

- The agent does not call FormWeb `publish_site` as if it performs a Webflow deployment.
- It names the account, custom-domain and analytics capabilities unavailable from the local tools.
- It can complete an authorized static export as a concrete intermediate deliverable, using a tool-returned path.
- It does not assume another account connector is installed or probe a browser session without authorized fallback.
- No response describes a localhost publication as a live custom-domain website.

Grading: inspect tool calls and outcome wording. The boundary is successful when it prevents an invented integration while completing work the available tools can perform.

## Running and comparing

Choose manual rigor for this initial project skill. Run each prompt with the pack and with no pack using the same concrete inputs. Record call count, failed calls, preserved user data, missing steps and correctness of capability claims. If independent runs are unavailable or the live server is not ready, record that limitation instead of producing a passing score.

Read the call transcript as well as the final response. Repeatedly ignored references, skipped state reads and duplicate retries indicate workflow defects. Collect real user failures for future scenarios rather than tuning prose to these three prompts alone.
