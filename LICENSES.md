# FormWeb licenses and dependency inventory

FormWeb's original source and repository art are licensed under Apache-2.0. Copyright 2026 nodemode-ai. The root LICENSE applies to this original work. Third-party packages retain their own licenses, copyright notices and terms; they are not relicensed by FormWeb.

This inventory was read from the actual installed package metadata and lockfiles on 2026-10-10. Unmodified upstream license and notice texts are retained in `legal/third-party/`. Installation obtains dependency implementations from their registries; the source archive excludes `node_modules`, `venv`, native build output and generated frontend output.

## Rust engine

Exact resolution and registry checksums are in `native/Cargo.lock`. Source package manifests in the inspected Cargo registry declare the following expressions. The Rust engine directly uses serde, serde_json, getrandom and sha2; the remaining rows are their resolved dependencies. getrandom supplies operating-system entropy for fresh site identifiers. sha2 verifies source and emitted code-component digests. r-efi is resolved for UEFI targets and is not used by the inspected Linux build.

| Package | Version | License expression | Upstream source |
| --- | --- | --- | --- |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_json | 1.0.152 | MIT OR Apache-2.0 | https://github.com/serde-rs/json |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/cfg-if |
| libc | 0.2.190 | MIT OR Apache-2.0 | https://github.com/rust-lang/libc |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | https://github.com/r-efi/r-efi |
| itoa | 1.0.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/itoa |
| memchr | 2.8.3 | Unlicense OR MIT | https://github.com/BurntSushi/memchr |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | https://github.com/dtolnay/proc-macro2 |
| quote | 1.0.47 | MIT OR Apache-2.0 | https://github.com/dtolnay/quote |
| syn | 3.0.7 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| unicode-ident | 1.0.26 | (MIT OR Apache-2.0) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident |
| zmij | 1.0.23 | MIT | https://github.com/dtolnay/zmij |
| sha2 | 0.11.0 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| block-buffer | 0.12.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| const-oid | 0.10.2 | Apache-2.0 OR MIT | https://github.com/RustCrypto/formats |
| cpufeatures | 0.3.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| crypto-common | 0.2.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| digest | 0.11.3 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| hybrid-array | 0.4.15 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hybrid-array |
| typenum | 1.20.1 | MIT OR Apache-2.0 | https://github.com/paholg/typenum |

Retained texts live under `legal/third-party/cargo/<package>-<version>/`. Dual-license files are preserved together; downstream users may choose an allowed alternative. FormWeb selects the MIT alternative for r-efi and retains its upstream AUTHORS file containing the MIT grant and copyright notices. The Unicode notice is additional to the MIT/Apache alternative and is retained. A distribution containing compiled native engine code must include the applicable notices.

## Frontend build toolchain

The frontend's only runtime dependencies are two font packages shared with formvis and formlit: @fontsource/inter 5.3.0 and @fontsource/jetbrains-mono 5.3.0, both SIL Open Font License 1.1 (fonts bundled unmodified, license files kept in the packages). TypeScript and Vite are development dependencies; their installed build toolchain is listed below. Exact package resolution, integrity hashes and optional platform packages are in `frontend/package-lock.json`.

| Package or platform family | Version | License | Role |
| --- | --- | --- | --- |
| typescript; @typescript/typescript-* | 7.0.2 | Apache-2.0 | Typechecker and platform compiler |
| vite | 8.3.4 | MIT | Development server and production bundler |
| @oxc-project/types | 0.153.0 | MIT | Bundler types |
| rolldown; @rolldown/binding-* | 1.2.13 | MIT | Bundler and optional platform binaries |
| @rolldown/pluginutils | 1.0.1 | MIT | Bundler helpers |
| detect-libc | 2.1.2 | Apache-2.0 | Platform detection |
| fdir | 6.5.0 | MIT | File traversal |
| fsevents | 2.3.3 | MIT | Optional macOS filesystem watcher |
| lightningcss; lightningcss-* | 1.33.0 | MPL-2.0 | CSS build transformation and optional platform binaries |
| nanoid | 3.3.20 | MIT | Build-tool ids |
| picocolors | 1.1.1 | ISC | Terminal formatting |
| picomatch | 4.0.7 | MIT | File glob matching |
| postcss | 8.5.29 | MIT | CSS processing |
| source-map-js | 1.2.2 | BSD-3-Clause | Source map implementation |
| tinyglobby | 0.2.17 | MIT | File glob traversal |
| vscode-jsonrpc | 9.0.0 | MIT | Dependency bundled with the installed TypeScript platform compiler |

Lightning CSS is an unmodified MPL-2.0 build dependency. FormWeb does not edit or embed its source in the application's runtime source. Its MPL text is retained under `legal/third-party/npm/`; obtain its implementation from the upstream package referenced by the lockfile. Optional platform packages were recorded from lock metadata; only Linux x64 packages were unpacked and inspected in this environment.

The full TypeScript NOTICE.txt, Vite LICENSE.md and Rolldown THIRD-PARTY-LICENSE are retained because their bundled dependencies require more than a top-level SPDX label. The Rolldown Linux binding supplies no separate installed license file; parent Rolldown license and third-party notices are retained. The original generated website runtime is FormWeb code.

## Python backend

Direct pinned requirements are FastAPI, Uvicorn with its standard extras, the official MCP Python SDK, and python-dotenv. The table records the distributions actually installed in the backend virtual environment. Transitive versions may change during a future installation unless constrained; re-audit after dependency updates or before a frozen-binary distribution.

| Distribution | Observed version | Declared license |
| --- | --- | --- |
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.15.1 | MIT |
| attrs | 26.1.0 | MIT |
| cffi | 2.1.1 | MIT-0 |
| click | 8.5.0 | BSD-3-Clause |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause |
| fastapi | 0.143.0 | MIT |
| h11 | 0.16.0 | MIT |
| httpcore2 | 2.13.1 | BSD-3-Clause |
| httptools | 0.9.0 | MIT |
| httpx2 | 2.13.1 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| mcp | 2.3.0 | MIT |
| mcp-types | 2.3.0 | MIT |
| opentelemetry-api | 1.45.1 | Apache-2.0 |
| pycparser | 3.11 | BSD-3-Clause |
| pydantic | 2.14.0 | MIT |
| pydantic_core | 2.50.0 | MIT |
| PyJWT | 2.15.1 | MIT |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| PyYAML | 6.0.3 | MIT |
| referencing | 0.37.0 | MIT |
| rpds-py | 2026.9.1 | MIT |
| sse-starlette | 3.5.0 | BSD-3-Clause |
| starlette | 1.7.0 | BSD-3-Clause |
| truststore | 0.10.4 | MIT |
| typing-inspection | 0.4.4 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| uvicorn | 0.54.0 | BSD-3-Clause |
| uvloop | 0.23.0 | MIT metadata; MIT and Apache texts supplied |
| watchfiles | 1.3.0 | MIT |
| websockets | 17.2 | BSD-3-Clause |

Pip 25.0.1 is installer tooling under MIT, not an application runtime dependency. Its top-level license was retained, but the virtual environment and pip implementation are not shipped in the source archive.

Backend texts live under `legal/third-party/python/<distribution>-<version>/`. httptools includes vendor HTTP parser and llhttp notices, retained in their supplied nested paths. cryptography supplies Apache and BSD texts, both retained. typing_extensions supplies the PSF license text. uvloop's supplied Apache and MIT texts are both retained. The full set of native libraries embedded inside Python wheels was not separately reverse-engineered; a later frozen sidecar or binary release requires another packaging audit.

## License text integrity

The preserved legal texts were copied byte-for-byte from installed upstream packages. The planning sidecar's dependency audit records SHA-256 hashes and source provenance for the inspected texts. Do not remove notices while shrinking archives, and do not modify upstream MPL files. Future package changes need an updated inventory and matching legal texts.
