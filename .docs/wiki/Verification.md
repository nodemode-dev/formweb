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
| Skill mirrors | `./formweb agents sync --check` reports no drift |

UI changes need hard reloads with CPU throttled at least 4x and network throttling. Watch the transition itself. Check focus, partial input, selection, scroll, delayed content, overlays and breakpoint switches. Record the result as verified under throttling, verified without throttling with a reason, or not verified.

Website output needs real links, meaningful titles and descriptions, appropriate headings, image alternatives, named controls and keyboard behavior. The built-in audit reports common model issues; a clean report does not prove every accessibility criterion.

A parity row is full only when the relevant requirement works through its intended interface and exported/runtime result. Partial means a useful but limited subset. None means absent. Unknown means evidence is insufficient and must not be counted as success.

Record the actual executed verification in the planning sidecar BUILD_NOTES. Windows scripts and operating-system-specific behavior remain unverified unless run on those systems. This browser build does not claim desktop bundle verification.

The [v0.2.0 verification record](../../docs/VERIFICATION_v0.2.0.md) connects the advanced editor, compiler, durable services, providers and actual MCP observations. The [current parity audit](../../docs/PARITY_v0.2.0.md) preserves all 65 researched requirements and separates local acceptance from external operational completion. Earlier records remain historical.
