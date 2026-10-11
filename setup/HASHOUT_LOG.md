# Setup context

## Comparison release command · v0.3.1

setup/comparisons.py backs `./formweb comparisons status|embed` (and the Windows twin). It reads `docs/comparisons/FormWeb-Parity_v[VERSION].html`, computes the FormWeb weighted score and per-vendor documented counts from its `data` and `data-lanes` blocks, and compares the page with the newest `PAGES.web` string in the consolidated FormAI matrix. `embed` appends one override block after that line (SCORES.web, the META description, PAGES.web), the same additive pattern earlier releases used, so every prior declaration stays in place; it is a no-op when the matrix already carries the page. `--check` changes nothing and exits 1 when stale, and `--json` prints one object, so agents can gate a release and humans read plain lines. This is a shipped release tool, run like zipping a release; it never edits source files. Owner approved this route on 2026-10-11 over hand-pasting a 200 KB serialized page.

## Code component compiler · v0.2.0

setup/build_component.mjs reads one bounded build request, validates explicit enablement and prop descriptors, writes a temporary TypeScript source/contract, invokes the pinned frontend compiler without a shell, and returns emitted JavaScript with SHA256 source/build hashes. Temporary files are removed after success or failure. No authored component JavaScript executes on the server.

The compiler source is a shipping product script, not a source-edit script. A removed Classic resolution option failed the initial actual request; one configuration line changed to Bundler after reading the installed TypeScript 7.0.2 package and the live compiler diagnostic. The corrected compile and three rejected requests were observed. Node/TypeScript versions remain the existing pinned frontend dependencies and their retained licenses.
