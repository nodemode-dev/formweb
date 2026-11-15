# Releasing

A release contains the complete source repository, actual Git history, a separate planning sidecar and the harness instructions. Version numbers use three dot-separated integers with a lowercase `v` in tags and archive names.

| Deliverable | Root |
| --- | --- |
| `formweb_vX.Y.Z.zip` | `formweb/` including `.git/` |
| `formweb_planning_docs_sidecar_vX.Y.Z.zip` | `formweb_planning_docs_sidecar/` |
| Standalone harness when supplied | `formweb-harness/` |

The planning sidecar contains DEV_PLAN, BUILD_NOTES, TEST_PLAN, the root HASHOUT_LOG, dev-wise, research, parity audits, verification records and observation data. As in formvis and formlit, the source repository keeps only `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md`, user guides in `docs/`, and the current comparison in `docs/comparisons/` (refreshed with `./formweb comparisons embed`). The full source archive excludes `venv`, `node_modules`, `target`, `dist`, `.env`, databases, cache and generated project output.

Before the final version commit, build all three layers, inspect actual editor behavior and run skill mirror checks. Update the release manual, README, changelog, parity and wiki status. Then change the Rust workspace version, backend version, frontend package/lockfile/version module and other explicit version references by hand. Make the version bump the last coherent commit.

Verify clean Git status, commit identity `nodemode-ai <mackin@nodemode.ai>`, branch and tag, and `git fsck`. Re-extract the source archive into a temporary folder and confirm `.git`, executable launchers, all source/config files and the sidecar's document inventory.

The local release process does not push a Git remote, create a GitHub release or deploy a website. FormWeb's own GitHub Actions only run the checks, on main, on pull requests and on `compile_vX.Y.Z` branches; they never build installable packages or create releases. The manual wiki workflow is separate and requires an initialized wiki target.

The native macOS, Windows and Linux desktop packages are built and released by formcompiler (`nodemode-dev/formcompiler`), the release pipeline for every form* app; the README's Download table links them. The owner pushes a branch `compile_vX.Y.Z` cut from the version bump commit on main, and formcompiler picks it up on its next 8-hourly watch run (or at once when its watch is run by hand), builds once CI has passed on that commit, signs the macOS build and drafts `formweb-vX.Y.Z` on its own release page for the owner to publish. Signing secrets live only in formcompiler. `./build_app` builds the same desktop app locally for a check; this repository never builds or signs a release package, and its checks do not launch one, so each package's distribution still needs its own verification.
