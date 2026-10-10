# Releasing

A release contains the complete source repository, actual Git history, a separate planning sidecar and the harness instructions. Version numbers use three dot-separated integers with a lowercase `v` in tags and archive names.

| Deliverable | Root |
| --- | --- |
| `formweb_vX.Y.Z.zip` | `formweb/` including `.git/` |
| `formweb_planning_docs_sidecar_vX.Y.Z.zip` | `formweb_planning_docs_sidecar/` |
| Standalone harness when supplied | `formweb-harness/` |

The planning sidecar contains DEV_PLAN, BUILD_NOTES, TEST_PLAN, root HASHOUT_LOG, dev-wise and research/comparison evidence. Subsystem HASHOUT_LOG files and `docs/PARITY.md` stay in the source repository. The full source archive excludes `venv`, `node_modules`, `target`, `dist`, `.env`, databases, cache and generated project output.

Before the final version commit, build all three layers, inspect actual editor behavior and run skill mirror checks. Update the release manual, README, changelog, parity and wiki status. Then change the Rust workspace version, backend version, frontend package/lockfile/version module and other explicit version references by hand. Make the version bump the last coherent commit.

Verify clean Git status, commit identity `nodemode-ai <mackin@nodemode.ai>`, branch and tag, and `git fsck`. Re-extract the source archive into a temporary folder and confirm `.git`, executable launchers, all source/config files and the sidecar's document inventory.

The local release process does not push a Git remote, create a GitHub release or deploy a website. GitHub CI builds source when the owner publishes the repository. The manual wiki workflow is separate and requires an initialized wiki target.

Native macOS, Windows and Linux desktop packages are not part of this browser release. Adding a desktop shell later requires its own build and distribution verification.
