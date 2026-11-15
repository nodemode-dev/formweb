# Contributing to FormWeb

Thank you for helping. FormWeb aims to be a free, local-first website builder that you
or your agents can drive, with a CMS, a section library and static export, and it
gets there through real use and real contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give.
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.
- **Translations** are welcome: FormWeb ships in English and 25 more languages, made
  by language models and not yet reviewed by native speakers. The tables are in
  `frontend/src/i18n`, `./formweb i18n check` finds gaps, and the Languages page of
  the wiki says how they work.

## Setting up

Clone the repository and run `./formweb install`, then `./formweb boot` (or
`formweb.bat install` and `formweb.bat boot` on Windows). The first builds the Rust
engine, creates the service's Python environment and installs the editor's packages;
the second starts the service on 127.0.0.1:8240 and the editor on
http://localhost:5240. `./formweb help` lists every command, `./formweb doctor` checks
your setup, and the README's "Run it from source" has the details and the
requirements.

The code lives in:

| Folder | What is there |
| --- | --- |
| `native/crates` | the Rust engine: model, engine, exporter, core process and renderer, with their tests |
| `backend/app` | the service (Python, FastAPI): persistence, forms, local releases, hand-offs, the MCP server |
| `backend/tests` | the service tests |
| `frontend/src` | the editor (TypeScript, Vite): canvas, layers, inspector and commands |
| `frontend/tests/window` | the window smoke test |
| `library` | the section library: components, sections, presets and starters |
| `src-tauri` | the desktop shell (Rust, Tauri) |
| `setup` | install, build, doctor, stdio proxy and skill mirroring scripts |
| `docs` | the manual and the guides |
| `.docs/wiki` | the wiki's source |

## Before you open a pull request

Run the same checks CI runs:

```sh
./formweb install
(cd frontend && npm audit --audit-level=low)
./formweb build
backend/venv/bin/python -m compileall -q backend/app setup
./formweb agents sync --check
./formweb library check && ./formweb library build --check
(cd native && cargo test --release --locked && cargo build --release --locked -p formweb-core)
pip install -r backend/requirements.txt -r backend/requirements-test.txt
(cd backend && python -m pytest tests -q -p no:cacheprovider)
python -m pytest frontend/tests/window -q -p no:cacheprovider
```

The window smoke tests need `pytest` and `playwright` with Chromium installed, and a
built editor. CI also checks the shell scripts with `bash -n`.

- Keep each pull request to one change, with tests for what it adds or fixes.
- Write commit subjects the way the history does, in Conventional Commits with the
  version in the summary: `feat(engine): ... (0.21.0)`, `fix(backend): ...`,
  `docs(...)`, with the areas listed in [.docs/BRANCHING.md](.docs/BRANCHING.md).
  Leave the version alone; a maintainer bumps it when releasing.
- Interface text goes through the translation tables: add each new English string to
  `keys.ts` and to every language, and `./formweb i18n check` reports any language
  with a missing or extra entry.
- The engine is the one place a site changes: every menu, button, shortcut and MCP
  tool calls the same engine commands. After changing the skills in `.claude/skills`,
  run `./formweb agents sync`; `./formweb agents sync --check` fails while the
  mirror in `.agents/skills` drifts.
- After changing the section library, run `./formweb library check` and
  `./formweb library build`.
- Icons are inline `currentColor` SVG in `frontend/src/ui/icons.ts`, and `z-index`
  comes only from `frontend/src/styles/tokens.css`.
- Other vendors' product names appear only to name a file format or compatibility.
  Never copy vendor help text, icons, sample files or presets.
- Every new dependency, binary, model, font or data file gets a row in `LICENSES.md`
  before it is used.

## Maintainers

FormWeb is maintained by:

- the [nodemode-dev](https://github.com/nodemode-dev) organisation on GitHub
- [@nodemode-ai](https://github.com/nodemode-ai)
- [@gbarnai](https://github.com/gbarnai)

Reach them through issues and pull requests.

## How changes land

Only a maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all three checks pass on an up-to-date branch and a maintainer has approved it after its last push.

## Releases

A release is a version, and only a maintainer makes one: after the version is bumped on
`main`, a maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. See [.docs/BRANCHING.md](.docs/BRANCHING.md).

## Licensing

FormWeb is licensed under the Apache License 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under the
same terms. Only add code you have the right to contribute, and name any third-party
code and its licence in the pull request.

## Patents and other people's IP

Some features are deliberately not built, or were taken out, because they come too close to someone else's patent, trademark, copyright or design. The maintainers hold that line with counsel; contributors do not decide it, and nobody here redesigns a feature on their own reading of a patent. This is engineering diligence, not legal advice.

### Features this project will not implement

- Breakpoint styles chosen from the editing canvas's own width. The canvas draws and edits only the breakpoint the person picked from the list; a typed width or a resize sizes the frame, not the breakpoint, and picking a breakpoint sets the frame to its width, never the reverse. The canvas's render takes the picked breakpoint and never derives it from a width.
- A design that switches between breakpoints as the canvas resizes. Width-driven switching happens only in the Live responsive preview, through the browser's media queries on the exported CSS.
- Breakpoints drawn as markers, handles or guides at positions on the canvas. Breakpoints stay a list of width thresholds.

A pull request that adds one of these, under any name, through any dependency, plug-in, model, template, agent tool or plain code, is closed with a link to this section. Lifting a decline needs the maintainers' written decision after a review, recorded here first.

### Rules for every contribution

- Patents: do not add a feature, or a dependency that provides one, that reproduces a method you know to be patented. If you are unsure, open an issue that describes what the feature does, not which patent it resembles. Patent numbers stay out of code, commits, comments, logs and changelogs.
- Trademarks: other vendors' product and feature names appear only to name a file format or compatibility ("opens <format> files", "for use with"). No command, menu, panel, tool, preset, template, theme or agent tool takes another product's feature name, and no text says "like X" or "the way X does it". Describe what the feature does.
- Copyright: never copy another product's help, tooltip, dialog or documentation text (link to it instead); never trace or import vendor icons; never bundle vendor templates, themes, presets, brushes, swatches, LUTs, materials, sample files, sound libraries, stock media or fonts; colour-book names only when reading a person's file. Compatibility layers carry names and signatures only. Test fixtures come from this repository's own scripts.
- Licences: every new dependency, binary, model, font, profile or data file gets a row in `LICENSES.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited. CC BY credited, CC BY-SA only unmodified, CC NC and ND never. Models with gated or non-commercial terms are optional downloads, never bundled.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
