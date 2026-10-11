<p align="center"><img src="assets/formweb_icon.svg" width="96" alt="FormWeb"></p>
<h1 align="center">formweb</h1>
<p align="center"><b>Visual website authoring for people & their agents.</b></p>
<p align="center"><img src="https://img.shields.io/badge/version-0.4.1-f97316" alt="version 0.4.1"> <img src="https://img.shields.io/badge/TypeScript-7-3178c6" alt="TypeScript 7"> <img src="https://img.shields.io/badge/Python-3.12-3776ab" alt="Python 3.12"> <img src="https://img.shields.io/badge/Rust-stable-b7410e" alt="Rust stable"> <img src="https://img.shields.io/badge/license-Apache--2.0-lightgrey" alt="Apache 2.0"></p>

## What it is

FormWeb is the Form family's visual website builder, researched against Framer & Webflow. One Rust engine owns the editable site, validation, history & static compilation. The TypeScript editor & MCP clients operate that same document through FastAPI, w/o needing a browser to keep agent edits alive.

**Stack.** Vanilla TypeScript 7 + Vite 8 · Python 3.12 + FastAPI · Rust workspace · official Python MCP SDK. No desktop binary is included in this release.

## Highlights

- **Pages & layout.** Nested semantic elements, page duplication, flex/grid placement, custom breakpoints & compiled runtime preview.
- **Design systems.** Typed tokens, linked text presets, component properties/variants/slots, override reset, detachment & reviewed pinned libraries.
- **Content.** Typed relations, selected bindings, CMS detail routes, queries/pagination/empty states, exact CSV round trips & localized content/media/routes.
- **Output & behavior.** Portable HTML/CSS/runtime ZIPs, owned raster assets, reciprocal language links, JSON-LD, timelines, conditions, accessible overlays & isolated code components.
- **Projects & teams.** SQLite autosave, portable `.fweb` history/assets, isolated review branches, comments, roles, presence & attributed operations.
- **Publishing & forms.** Immutable local releases, promotion/rollback, redirects, inbox/retention, constraints, tracking & durable signed webhook delivery.
- **Connected services.** Configurable deployment/domain, translation, fetch & commerce adapters; separate visitor membership, consented analytics & experiments. Provider credentials stay on the server.
- **Agents & evidence.** Real official-SDK MCP, shared role checks & revision authority. Start w/ the [agent quick start](docs/AGENT_QUICKSTART.md), the [four-vendor comparison](docs/comparisons/) (`FormWeb-Parity_v[version].html`, with every release's score) & the [consolidated matrix](docs/comparisons/FormAI-Parity-Matrix-consolidated.html). Research, audits & verification records ship in the release's planning sidecar.

## Quick Start

Requirements: Node 22.12 or newer, Python 3.12 or newer, Rust stable/Cargo & git. The release zip already includes its real `.git`; extract `formweb/` before running.

### macOS & Linux

```bash
cd formweb
./formweb install
./formweb boot
```

Open http://localhost:5240. For the compiled editor:

```bash
./formweb build
./formweb serve
```

Then open http://127.0.0.1:8240. `./formweb help` lists commands; `./formweb doctor` checks the local setup.

### Windows

```bat
cd formweb
formweb.bat install
formweb.bat boot
```

Windows launchers are supplied but have not been run on Windows in this build. For MCP clients on Windows, use an absolute path to `formweb.bat` as described in the [agent guide](.docs/wiki/Agents-and-MCP.md).

| Service | URL | Purpose |
| --- | --- | --- |
| Editor dev | http://localhost:5240 | Vite, loopback only, strict port |
| API / compiled editor | http://127.0.0.1:8240 | FastAPI, authoritative engine service |
| Preview | http://localhost:5241 | Vite production preview |
| MCP HTTP | http://127.0.0.1:8240/mcp | Agents must be enabled |

## Configuration

Copy `backend/.env.example` to `backend/.env` when configuration is needed. Merge only the required provider names from `backend/.env.providers.example`; see [signed delivery](docs/SERVICE_DELIVERY.md) & [code builds](docs/CODE_COMPONENTS.md). Restart after changing server settings. Never commit credentials.

| Variable | Purpose |
| --- | --- |
| FORMWEB_DATA_DIR | Local SQLite, project/export & publication storage |
| FORMWEB_CORE_BIN | Path to compiled Rust executable |
| FORMWEB_AGENTS | Initial agent-access setting |
| FORMWEB_AUTH_TOKEN | Optional bearer protection for API/MCP |
| FORMWEB_PORT | Backend port; match proxy/client configuration when changing |
| FORMWEB_ORIGINS | Exact allowed local browser origins |
| VITE_API_BASE | Optional API base in frontend/.env; use the same-origin proxy when token auth is enabled |

## Architecture

| Path | Owns |
| --- | --- |
| native/crates/formweb-model | Document schema & whole-document validation |
| native/crates/formweb-engine | Atomic commands, revisions, component propagation & history |
| native/crates/formweb-export | Semantic HTML/CSS/runtime compiler & audit |
| native/crates/formweb-core | JSON-lines engine process |
| backend/app | Process bridge, persistence, forms, local releases, HTTP & MCP |
| frontend/src | Stable keyed editor DOM, canvas & workflow controls |
| setup | Installation, build, diagnostics, stdio proxy & skill mirroring |
| .claude/skills/formweb-harness | Application-operation skill pack |
| .agents/skills/formweb-harness | Byte-identical portable mirror |
| docs & .docs/wiki | Manual, research, parity, verification & subsystem contracts |

## Limits

The advanced Studio covers authoring, runtime, collaboration & service workflows described in the [Studio guide](docs/ADVANCED_GUIDE.md). Provider adapters require configured server credentials; fixture observations do not establish live domain/TLS/CDN operation or completed payments. Hosted checkout delegates payment, shipping & taxes to the configured provider. Gated content requires the authorizing backend & is rejected from public static exports. Exported forms require a reachable service. Windows, native desktop bundles & automatic skill activation remain unverified. Versioned parity records distinguish implemented workflows from these operational boundaries.

## Development

Work on `main` for this supplied build; use reviewed topic branches after publishing. See [.docs/BRANCHING.md](.docs/BRANCHING.md), [manual](docs/MANUAL.md) & [wiki](.docs/wiki/Home.md). Read the matching planning sidecar first when continuing. Route app-operation requests through the harness director; source development follows AGENTS.md.

The `.git` records real coherent commits authored & committed by `nodemode-ai <mackin@nodemode.ai>`. No sibling git history was imported. The version commit closes the release series.

## Contributors

| Contributor | Role |
| --- | --- |
| nodemode-ai | Owner & author |

## Licensing

Apache-2.0; see LICENSE, NOTICE.md & LICENSES.md. Vendor documentation was researched as primary evidence; proprietary vendor code/assets are not bundled.
