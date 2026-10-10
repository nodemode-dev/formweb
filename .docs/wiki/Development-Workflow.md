# Development workflow

Read the planning sidecar first when continuing a build. Then read `CLAUDE.md`, `AGENTS.md`, the relevant subsystem's HASHOUT_LOG and [[Architecture]]. This identifies the owning layer before source changes begin.

Keep edits to one named region at a time. Do not regenerate working files, apply source patches or perform unrelated formatting sweeps. New files are appropriate at existing feature boundaries. Rust owns document behavior; backend code owns services; frontend code owns display and input.

```bash
./formweb build
./formweb agents sync --check
./formweb doctor
```

The build compiles the release Rust core, typechecks/bundles the Vite editor and checks Python syntax. Skill sync verifies canonical and mirrored instructions are identical. Doctor reports local prerequisites and services; it is diagnostic, not a comprehensive test runner.

After a DOM change, verify a cold reload with CPU/network throttling and exercise the actual changed action. Existing controls, focus, typed input, selection and scroll must survive updates. Reserve asynchronous layout space and retain the old preview until its replacement is ready.

Update the manual, wiki contract, subsystem log and parity evidence in the same coherent change as behavior. Research establishes target requirements; implemented behavior determines grades. Do not raise a parity grade merely because a field or button exists.

New test code requires the owner's explicit request. Intended independent checks live in the planning sidecar's TEST_PLAN.md. Manual exercises and compiler checks may be run without inventing a matching test suite.

Use the branch and release conventions in `.docs/BRANCHING.md`. Do not push, tag remotely, publish a wiki or change global client settings as a side effect of local authoring.
