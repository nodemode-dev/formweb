# Backend context

## Runtime boundary

`app/engine.py` supervises one Rust JSON-lines subprocess with one asyncio lock. Standard output carries protocol replies only. Core stderr is drained into the Python logger. Requests use increasing IDs and a 30-second acknowledgement timeout. Engine failures leave the last acknowledged site cached for restart recovery; an interrupted request fails visibly rather than being silently replayed. Revision conflict engine errors map to HTTP 409.

`app/service.py` serializes mutating operations and project/publication actions through an action lock. Rust owns the site and history. The Python service persists acknowledged autosaves in SQLite and restores the last site at startup. Undo history is process-local and is not serialized into `.fweb` files. New/imported sites clear the current saved-project identity. Existing projects are reopened by their stored site and subsequent save updates that project.

`app/store.py` uses the local ignored `backend/data` directory for SQLite, native files, export ZIPs and immutable publication snapshots. WAL is enabled. `.fweb` files carry `{format:"com.nodemode.formweb",version:1,site}`. Native saved files are atomically replaced; publication versions are new directories and never overwritten. Export paths reject absolute paths, traversal, backslashes, drive separators and null bytes.

## API and access

The service binds to loopback through the family launchers. `app/main.py` additionally accepts only exact loopback Host headers for the configured backend port and rejects any non-allowlisted Origin. The frontend development/preview ports are 5240 and 5241; API defaults to 8240. Optional `FORMWEB_AUTH_TOKEN` protects control APIs and MCP with bearer authentication. `/api/auth` exchanges a valid bearer token for a process-bound HttpOnly SameSite Strict cookie for browser control API/SSE requests. The cookie never authenticates MCP. Restart invalidates browser cookies; the connection settings can reconnect with the configured token. Public publication files and local form submission paths remain usable without a bearer token. Agents start disabled unless `FORMWEB_AGENTS=1` and can be toggled in the editor with `/api/agents`.

`FORMWEB_CORE_BIN`, `FORMWEB_DATA_DIR` and `FORMWEB_FRONTEND_DIST` accept absolute environment overrides. The default core executable includes `.exe` on Windows. `FORMWEB_PORT` changes the HTTP port; an overridden port must be matched by frontend proxy/origin settings. `/api/health` confirms a Rust handshake. `/api/events` emits state events and keepalive comments; it uses bounded queues to coalesce slow subscribers.

Local forms accept JSON and URL-encoded scalar fields. Required fields, email and number/range inputs are validated with field/body/count limits. Unknown field names are rejected. `_formweb_hp` is a honeypot. Per-address requests are limited to twelve per minute. Submissions are stored locally; there is no email delivery or external anti-spam service. Exported forms require this backend to remain available.

## Official MCP

`app/mcp_catalog.py` is the singular tool catalogue, including strict top-level schemas and tool annotations. `app/mcp_server.py` uses the official Python SDK `mcp==2.3.0` low-level `Server`, validates catalogue input schemas and returns structured JSON with text fallbacks. It exposes ten implemented tools and two resources at `/mcp` with stateless Streamable HTTP. The parent FastAPI lifespan enters `mcp.session_manager.run()` before serving requests. Tool and resource operations use the same service and Rust owner as the editor. Execution errors return `isError:true` with a status payload. The ASGI gate disables every MCP operation when Agents are off.

`setup/mcp_stdio.py` is an official SDK stdio server proxy using `ClientSession` and the Streamable HTTP client. It initializes the existing HTTP endpoint before accepting stdio requests, forwards tools/resources, validates a loopback endpoint and does not create a second engine or backend. It requires a running service and enabled Agents. Logs/errors use stderr; stdout is protocol only. A missing backend gives a concrete startup/Agents instruction.

SDK v2 API was inspected directly from the installed package. Its low-level handlers use `(context, params)` callbacks, Streamable HTTP client returns a pair of streams, and the host app owns the mounted manager lifespan. The SDK handles initialization, version negotiation, notifications, capabilities and protocol error responses.

## Scripts and dependencies

`backend/oc_install`, `oc_install.bat`, `boot_backend` and `boot_backend.bat` delegate to matching root setup tasks. Installation reuses `backend/venv` and selects unpinned macOS requirements or pinned requirements elsewhere. Backend boot imports `app.main:app` and uses loopback uvicorn. `formweb_engine.py` is the explicit process entrypoint for standalone/future packaging, with the same host and configured port.

Direct pinned dependencies are FastAPI 0.143.0 (MIT), uvicorn 0.54.0 (BSD-3-Clause), official MCP SDK 2.3.0 (MIT) and python-dotenv 1.2.4 (BSD-3-Clause). macOS package membership matches but lets pip resolve platform-compatible versions. SQLite, ZIP, JSON and path handling use the Python standard library. Native Rust compilation is independent of Python dependencies.

## Verification record

Python modules and stdio entrypoint compiled successfully. App import and SDK capability generation ran successfully: ten tools, two resource handlers, thirty initial routes. Full HTTP/MCP/project/publication paths are verified after the Rust core build in the release ledger; absence of that later evidence must not be interpreted as successful runtime validation.

## Post-build corrections and observed runtime verification

The Rust core recovery load now takes a supervisor-only `restoreRevision` parameter. The bridge passes the cached acknowledged revision on restart, so a recovered document remains compatible with the editor's expected revision. Undo/redo history is cleared during recovery; subsequent edits remain valid. HTTP project import forwards only the site and cannot choose a restored revision.

Owned raster images enter through raw `POST /api/assets` with PNG/JPEG/GIF/WebP content types and optional `X-Filename`. Intake checks file signatures, length and media-type agreement, stores files under SHA256 names and serves explicit image types with nosniff. SVG and file inputs are unsupported. `app/assets.py` bundles referenced image bytes into exported ZIPs/publications and rewrites page-relative image references. Remote image URLs remain references.

Native `.fweb` files now embed owned raster images in an `assets` list containing digest ID, media type, original display name, base64 encoding and content. Project files are bounded at 64 MiB, editable site JSON at 8 MiB, each image at 8 MiB and at most 500 image entries. Import checks digest, encoding, type and image signature before restoring the site. Older envelopes without an assets list remain valid. Saving returns the concrete `.fweb` path and an immutable project-ID download route for the saved site, distinct from `/api/project-file` which downloads the current site.

Portable exports preserve `site.settings.baseUrl`; an omitted locale uses `site.defaultLocale`. Explicit authored form actions and methods are preserved by Rust and use native form behavior. Default local forms get an explicit local endpoint warning. Publication forms use `/published/{slug}/{version}/api/forms/{site}/{form}` and validate against the exact saved publication schema, so later draft changes cannot alter old publication form validation. Published directory paths map to `index.html`, including nested routes. Required checkbox false/0/off values fail, malformed maxlength settings fall back to the bounded default, invalid email values and honeypot submissions fail without storing rows.

Manual runtime diagnostics used isolated scratch data and the actual compiled Rust release binary. Official SDK Streamable HTTP initialize, ten-tool discovery, two-resource discovery/read, get, atomic apply, expected-revision rejection, native save, ZIP export and shared editor state passed. Official SDK stdio initialize, tool/resource discovery, get and apply passed and changed the same HTTP-observed document. Disabled Agents returned 403, an external Origin returned 403, a non-loopback Host returned 421 and stale command revisions returned 409. A failing atomic batch preserved the prior site and revision.

Raster upload, exported binary equality, portable HTML image references, immutable publication root/image requests and directory routes returned the expected results. A published form remained valid after its draft field name changed. Required false checkbox, invalid email and honeypot cases returned 400; the successful submission remained in SQLite. Killing an isolated core process preserved revision and site on recovery, cleared history and permitted a new edit.

Native save/download/load/reopen passed. A native file containing an owned image imported into a fresh data directory and restored the image, which returned 200. Restarting the backend restored the exact autosaved site, saved projects, publication records and local submissions. Optional bearer-to-browser-cookie authentication and cookie-authenticated SSE passed; a browser API cookie did not authenticate MCP (401). The stdio HTTP client explicitly disables environmental proxies so loopback operation does not depend on unrelated SOCKS settings. SDK response objects use Python snake_case attributes while JSON wire aliases remain camelCase.

These were manual diagnostics, with no authored test suite or persistent test runner. Local snapshots, local submissions and local file paths do not establish cloud hosting, email delivery, cloud collaboration or cross-machine project synchronization.
