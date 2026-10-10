# Release verification

FormWeb v0.1.0 was compiled and exercised on Linux on 2026-10-10. Behavioral checks ran against development metadata 0.0.0. The final 0.1.0 build, core selfcheck, version agreement and root serve launcher passed; its API and editor connected. This record describes observed operations rather than an authored test suite.

## Build and repository checks

The root build invokes the locked Rust release build, strict TypeScript checking, Vite production bundling and Python syntax compilation. Shell syntax, doctor and byte-identical skill mirroring were checked. The final release checks also verify version agreement, Git integrity, author/committer identity, clean status, retained legal bytes and archive contents. Hosted GitHub CI and Windows/macOS launchers were not run here.

## Actual editor

Chromium 153.0.8010.0 ran at CPU 4x, 150 ms network latency, 750 kbps download, 250 kbps upload and disabled cache, at 1536x1024. Cold loads connected to Rust with no JavaScript page errors. The root owner observed these paths:

| Workflow | Observed result |
| --- | --- |
| Text and history | Inspector text persisted, existing H1 retained, undo and redo restored acknowledged content |
| Responsive design | 390/1280 widths, mobile color, font40px and display:none; exported767px media rule; reset removed overrides |
| Pages and hierarchy | About /about/team, heading, component and Section insertion; parent selector moved the instance |
| Content | Services schema and published item created; French text/page-title dictionary and CSS token saved |
| Shared state | Independent HTTP edit arrived over SSE; focused input, pending text and selection3..10 survived |
| Mounted DOM | Iframe, sidebar and inspector recorded zero removals during the checked update flow |
| Agents | UI switch off returned MCP403; on restored access |
| Owned image | Valid96x64PNG chooser upload, engine reference, successful canvas decode, exact ZIP image bytes |
| Native source | Download included one embedded owned image; new/import restored exactly equal site and decoded image |
| Publication | UI returned immutable local URL; root and nested page served200, edited text and image rendered |
| Workspace | Light theme persisted on reload, Dark restored; preview hid selection; audit displayed expected findings |

An initial1pxPNG fixture was rejected by Chromium decoding before upload; a newly generated valid96x64PNG passed. The serverless browser's single-process launch flag caused its own shutdown when an extra context was closed; the automation runtime was relaunched without it. These were not silently counted as application successes.

This is a sampled DOM-stability observation, not per-frame video evidence or a universal no-flicker guarantee. Additional controls use the same inspected handlers but were not each independently clicked.

## Rust and API

Real JSON-lines requests and isolated service runs observed atomic invalid-batch rollback, cycle rejection, stale409, valid movement, session undo/redo, component source propagation and override retention. The100-entry history bound was source-inspected. Component form IDs and scoped CMS labels, ARIA references, fragment links and interaction destinations were checked against emitted output. Fresh sites received different128-bit IDs; loading kept saved IDs.

Autosave, project save/open, native serialization, embedded-image restoration into an empty data directory and backend restart retained the canonical model. Killing the native process preserved its external revision on recovery, reset unavailable history and accepted the next mutation.

Published-only CMS output and selected-locale text/lang/fallback compiled. Canonical/sitemap used the configured public origin. Root/nested HTML, CSS, runtime and owned media also served on a generic static HTTP server. Immutable published bytes survived later draft edits.

Forms rejected missing required values, invalid email, false required checkbox, honeypot content, oversized bodies and excess requests. A valid submission persisted. A frozen publication accepted its original field after the draft changed; the current draft rejected that obsolete field. Explicit external form action/method survived export. Browser pending/success/error runtime remains source-inspected, not browser-submit certified.

## Real MCP and harness

Independent clients used the official Python SDK2.3.0, negotiated protocol2025-11-25, discovered ten tools and two resources, read both resources, edited the same Rust state exposed by REST, rejected a stale change and saved/exported/published concrete output. Actual stdio proxy discovery and mutation also passed. Agent-off403, bad Origin403, bad Host421, unauthenticated401 and authenticated browser cookie/SSE were observed. MCP deliberately accepts bearer authentication rather than the browser cookie.

The FormWeb harness and portable mirror match byte-for-byte. The god-tier strict validator and packager reported zero FAIL and zero WARN. The pack contains11 Markdown files,45,627 bytes, zero media, a747-character description and62-line master. Manual SDK scenarios cover atomic layout, stale-state reconciliation, locale export, project/asset restoration and frozen forms. Automatic skill activation and a no-skill performance baseline were not measured.

## Boundaries

See [PARITY.md](PARITY.md) for65 requirement grades and explicit gaps. The editor renderer differs from exported behavior for form submission, scroll effects, hover exit/focus and exact animation timing. Native import resets undo history. External media remain URL references and each export contains one selected locale. Authenticated editor access uses the same-origin proxy; cross-origin token-auth SSE is not supported by the supplied setup.

Local publications require this computer's FastAPI service. Public hosting/domains, collaboration roles, commerce, membership and external providers are not provisioned or claimed. No full accessibility certification, hosted CI execution or cross-platform runtime pass is claimed. Detailed source hashes, observation data and continuation plans are in the matching planning sidecar.
