# Branching and releases

FormWeb uses `main` with short-lived work branches. The archive contains the actual repository history; branch creation and remote pushes remain explicit owner actions.

| Branch | Purpose | Rule |
| --- | --- | --- |
| `main` | Reviewed application source | Keep Rust, backend, frontend and harness usable together |
| `feat/<area>-<purpose>` | New capability | Merge after build checks and observable verification |
| `fix/<area>-<purpose>` | Narrow repair | Keep unrelated code untouched |
| `docs/<purpose>` | Manual, wiki, parity or skill guidance | Update contracts alongside code |

Areas are `engine`, `backend`, `ui`, `mcp`, `cms`, `export` and `skills`. Coherent changes use Conventional Commits, for example `feat(engine): add responsive node styles`. Commits identify `nodemode-ai <mackin@nodemode.ai>` as author and committer.

A release uses one shared version across the Rust workspace, backend version and frontend package/lockfile/version module. The last commit in the release series bumps the version. Tags use lowercase `v` and three dot-separated integers, for example `v0.1.0`. A desktop release is a `compile_v0.1.0` branch cut from the bump commit; formcompiler (`nodemode-ai/formcompiler`) builds it and drafts `formweb-v0.1.0` on its own release page, and this repository never builds release packages. Release archives use `formweb_v0.1.0.zip` and `formweb_planning_docs_sidecar_v0.1.0.zip`.

Before packaging, the working tree must be clean and `git fsck` must succeed. The source archive includes `.git` and excludes local dependencies, build output, credentials, databases and cache. The planning sidecar carries DEV_PLAN, BUILD_NOTES, TEST_PLAN, root HASHOUT_LOG and dev-wise. The repository retains each subsystem's living HASHOUT_LOG beside its code.

Suggested remote protections for the owner: require reviewed pull requests, the `ci` build job and an up-to-date branch before merging; prohibit force pushes on `main`. These settings are not applied by the local build.
