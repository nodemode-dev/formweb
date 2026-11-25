# Verification

Verify the browser-visible behavior, persisted project and exported output independently. Compilers catch syntax/type defects; they do not establish responsive layout quality, complete accessibility or Framer/Webflow parity.

| Check | Required observation |
| --- | --- |
| Native compilation | Rust release engine builds from the committed lockfile |
| Frontend build | TypeScript typecheck and Vite bundling succeed |
| Backend syntax | Python source compiles |
| Runtime | API reports a Rust engine and the editor connects |
| Shared state | An MCP command updates the same site shown in the editor |
| Atomic failure | Invalid batch leaves document/revision/history unchanged |
| History | Undo and redo restore observable document changes |
| Persistence | Save, reopen and native JSON import preserve structure |
| Responsive output | Desktop, tablet and phone preview match exported CSS |
| Publication | Returned local URL loads its versioned files |
| Tests | `./formweb test` passes every layer (native, engine, unit); the layers and the rules for a test are in [docs/TESTING.md](../../docs/TESTING.md) |
| Skill mirrors | `./formweb agents sync --check` reports no drift |
| Interface languages | `./formweb i18n check` reports every language with one entry per English key (`--json` for machine output); switch language in a browser and confirm menus change live with no reload |
| Shortcuts | In a browser, press Mod+K, Mod+Z and Delete from the body and again after clicking the canvas; typing in a field or editing text in place must trigger none of them |
| Desktop app | `./build_app` (`build_app.bat` on Windows) runs start to finish and the frozen engine passes `--selfcheck`; a build that was not launched is reported as built only |
| Desktop downloads and links | On each system, the steps in [docs/DESKTOP_TESTING.md](../../docs/DESKTOP_TESTING.md): the export notice names the file and folder, a second export is named " (1)", Show in folder opens the file manager (and says so when the file is gone), and Open in browser reaches the system browser; record the run in that page's table |

UI changes need hard reloads with CPU throttled at least 4x and network throttling. Watch the transition itself. Check focus, partial input, selection, scroll, delayed content, overlays and breakpoint switches. Record the result as verified under throttling, verified without throttling with a reason, or not verified.

Website output needs real links, meaningful titles and descriptions, appropriate headings, image alternatives, named controls and keyboard behavior. The built-in audit reports common model issues; a clean report does not prove every accessibility criterion.

A parity row is full only when the relevant requirement works through its intended interface and exported/runtime result. Partial means a useful but limited subset. None means absent. Unknown means evidence is insufficient and must not be counted as success.

Record the actual executed verification in the planning sidecar BUILD_NOTES. Windows scripts and operating-system-specific behavior remain unverified unless run on those systems. A desktop bundle is verified only by launching it; a build that produced a package but was never opened is reported as built, not verified.

Verification records (VERIFICATION_v0.2.0 and later), the parity audits and the raw observation files live in the planning sidecar for each release, not in this tree. The current comparison in [docs/comparisons](../../docs/comparisons/) carries the 79 researched requirements and separates local acceptance from external operational completion.
