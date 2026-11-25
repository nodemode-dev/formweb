# Testing FormWeb

FormWeb's tests drive the app the way a person or a calling program does and check what they would see. This page says how to run them, where each kind lives, and what a test has to do before it is accepted.

## Running the tests

```sh
./formweb test                    # every layer: native, engine, unit
./formweb test unit               # one layer: unit, engine or native
./formweb test unit panel/drop    # anything after the layer goes to that layer's runner
```

On Windows use `formweb.bat test`. Install first (`./formweb install`). The engine layer needs pytest in the backend's Python:

```sh
backend/venv/bin/python -m pip install -r backend/requirements-test.txt
```

The native layer needs `cargo`. A layer name the launcher does not know ends with exit code 2 and a sentence naming the three layers. The command exits non-zero when any layer it ran failed.

## The layers

| Layer | Tool | Where | What it runs against |
| --- | --- | --- | --- |
| native | cargo test | `native/crates/<crate>/tests/` | the Rust model, engine and exporter through their public functions and the core process protocol |
| engine | pytest | `backend/tests/` | the FastAPI service in process, its command line and its MCP server; `backend/tests/conftest.py` points the service at a sandbox data folder, never your real one |
| unit | vitest 5, happy-dom | `frontend/tests/unit/<area>/` | the editor's exported functions and the DOM they build, without a browser or a running service |

Tests are grouped by area: `backend/tests/<area>/test_*.py` and `frontend/tests/unit/<area>/*.test.ts`. `frontend/vitest.config.ts` runs every `tests/unit/**/*.test.ts` in happy-dom, restores mocks after each test and loads `tests/unit/setup.ts`, which only fills in browser features happy-dom lacks. Small shared builders live beside the tests (`frontend/tests/unit/site.ts` builds a site by hand and applies engine commands with an independent reference). The tests are not part of the built editor: `tsconfig.json` and the Vite build read `src/` only.

The window smoke test in `frontend/tests/window/` (pytest and Playwright against a built editor) is a separate check; see `CONTRIBUTING.md`.

## The five rules

1. A test runs the app through a public surface: an HTTP route, an engine command, an MCP tool, an exported interface function, or the visible interface.
2. It checks a result someone would notice: an order of pages or layers, a refusal and its reason, a saved or exported file, a count, something on screen.
3. Its expected value comes from outside the code under test: the test plan, the manual and the other documents in `docs/`, the rules of a file format read back by an independent reader, an invariant (do then undo, export then read back, two paths that must agree), or a fixture the test builds by hand.
4. It can fail. Change the expected value (or break the behaviour) once, watch the test fail, and put it back.
5. Its name says the behaviour in plain words, such as `a layer cannot be dropped inside one of its own descendants`.

Not accepted:

- reading source files to check their text;
- checking only that a file, function or route exists;
- a status code alone, with nothing checked in the answer;
- snapshot files made by running the code and saving what came out;
- replacing the thing under test with a stand-in and testing the stand-in;
- a skip or an expected failure without a written reason.

## When a test shows the app is wrong

Keep the test as it is and mark it as a strict expected failure: pytest `xfail(strict=True, reason=...)`, vitest `it.fails`, or cargo `#[ignore = "..."]` where there is no strict form. Start the reason with `DEFECT:` and say what the app does, what it should do and where that is written. `git grep -n "DEFECT:"` lists them. Once the app is fixed, the strict mark makes the test fail until the mark is removed, so a fix is never missed.

## Rules for test data

Tests build their data in the test or with a small helper in the tests folder. No binary fixture over 50 KB, nothing taken from another product, and no network. Hostile archives are built in memory. Every test is deterministic, uses its own temporary data, and never depends on how fast the machine is.

New tests are added when the owner asks for them. A change in behaviour updates its tests in the same change.

## CI

The `build` job runs the unit layer after the editor build (step `Editor tests (vitest)`), with the packages `./formweb install` put in place from the lockfile. The `test` job runs the native layer (`cargo test --release --locked`) and the engine layer (`python -m pytest tests` in `backend/`). The `window` job runs the window smoke test. CI runs on Linux only.
