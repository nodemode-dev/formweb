# FormWeb licenses and dependency inventory

FormWeb's original source and repository art are licensed under Apache-2.0. Copyright 2026 NodeAgentc, Inc. The root LICENSE applies to this original work. Third-party packages retain their own licenses, copyright notices and terms; they are not relicensed by FormWeb.

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

The frontend's runtime dependencies are two font packages shared with formvis and formlit, @fontsource/inter 5.3.0 and @fontsource/jetbrains-mono 5.3.0, both SIL Open Font License 1.1 (fonts bundled unmodified, license files kept in the packages), and the terminal emulator for the live terminal dock, @xterm/xterm 6.0.0 and @xterm/addon-fit 0.11.0, both MIT (texts in `legal/third-party/npm/@xterm__*`). The Windows backend adds pywinpty 3.0.5 (MIT, Spyder IDE; installed only on Windows through an environment marker; its wheel bundles native pseudo-console binaries described by the wheel's own SBOM). TypeScript and Vite are development dependencies; their installed build toolchain is listed below. Exact package resolution, integrity hashes and optional platform packages are in `frontend/package-lock.json`.

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

Direct pinned requirements are FastAPI, Uvicorn with its standard extras, the official MCP Python SDK, python-dotenv, segno (local QR code generation, no dependencies of its own) Pillow (compositing background-removal cut-outs, v0.5.3; reference-image colours, v0.5.7) and pypdf (reading reference PDFs for page generation, v0.5.7; no dependencies of its own). The table records the distributions actually installed in the backend virtual environment. Transitive versions may change during a future installation unless constrained; re-audit after dependency updates or before a frozen-binary distribution.

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
| pillow | 12.3.0 | MIT-CMU |
| pycparser | 3.11 | BSD-3-Clause |
| pydantic | 2.14.0 | MIT |
| pydantic_core | 2.50.0 | MIT |
| PyJWT | 2.15.1 | MIT |
| pypdf | 6.20.0 | BSD-3-Clause |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| python-multipart | 0.0.32 | Apache-2.0 |
| PyYAML | 6.0.3 | MIT |
| referencing | 0.37.0 | MIT |
| rpds-py | 2026.9.1 | MIT |
| segno | 1.6.6 | BSD-3-Clause |
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

Backend texts live under `legal/third-party/python/<distribution>-<version>/`. httptools includes vendor HTTP parser and llhttp notices, retained in their supplied nested paths. cryptography supplies Apache and BSD texts, both retained. typing_extensions supplies the PSF license text. uvloop's supplied Apache and MIT texts are both retained.

### Frozen engine in the desktop app

`./build_app` freezes the backend with PyInstaller (`setup/freeze_backend`, one file, `formweb-engine`) and ships it as the app's sidecar, so everything below is distributed inside the installers and AppImage. A fresh install of `backend/requirements.txt` on 2026-10-23 resolved the same distributions as the table above, under the same licences (a few transitive versions moved: httpx2 and httpcore2 2.16.0, pydantic 2.14.1, pydantic_core 2.50.1, pycparser 3.12, starlette 1.9.0, truststore 0.10.5, websockets 17.3). pyinstaller itself is build tooling and is not frozen in.

| Component | Licence | Notes |
| --- | --- | --- |
| CPython runtime and standard library | PSF-2.0 | frozen by PyInstaller |
| PyInstaller bootloader | GPL-2.0-or-later with the PyInstaller bootloader exception | the exception permits distributing the bootloader with a frozen program under any licence |
| Libraries inside the Pillow wheel | libjpeg, libpng, libtiff, libwebp, libavif, OpenJPEG, Little CMS, HarfBuzz, Brotli, zstd, xz, libxcb: permissive (see the wheel's LICENSE); FreeType 2.14.3 used under the FreeType License | Portions of this software are copyright (c) 2026 The FreeType Project (www.freetype.org). All rights reserved. |
| OpenSSL 3 inside the cryptography wheel | Apache-2.0 | bundled by the wheel |
| libuv inside the uvloop wheel | MIT | bundled by the wheel |
| libffi inside the cffi wheel | MIT | bundled by the wheel |
| llhttp inside the httptools wheel | MIT | texts retained under `legal/third-party/python/httptools-0.9.0/` |

## GPU renderer and desktop shell

`native/crates/formweb-render` and `src-tauri` are not part of `./formweb install` and ship no binary in the source archive, but the release build (`./build_app`, the installers and AppImage) compiles and ships the desktop shell, and the shell links the renderer (`formweb-render` is a path dependency of `src-tauri`). Both are therefore distributed and covered by the distributed-build rules. Each has its own `Cargo.lock`. Direct dependencies, read from `cargo metadata` on 2026-10-11:

| Package | Version | License expression | Used by |
| --- | --- | --- | --- |
| wgpu | 30.0.1 | MIT OR Apache-2.0 | renderer |
| pollster | 1.0.1 | Apache-2.0/MIT | renderer |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT | renderer |
| sysinfo | 0.39.6 | MIT | renderer |
| png | 0.18.1 | MIT OR Apache-2.0 | renderer |
| tauri | 2.12.3 | Apache-2.0 OR MIT | desktop shell |
| tauri-build | 2.7.2 | Apache-2.0 OR MIT | desktop shell (build) |
| tauri-plugin-shell | 2.5.0 | Apache-2.0 OR MIT | desktop shell |
| tauri-plugin-dialog | 2.8.2 | Apache-2.0 OR MIT | desktop shell |
| serde, serde_json | 1.0.229, 1.0.154 | MIT OR Apache-2.0 | desktop shell |

The shell's full resolution is 483 registry packages, overwhelmingly MIT and/or Apache-2.0 (also Zlib, Unlicense OR MIT, and Unicode-3.0 for the ICU data crates). Five are MPL-2.0 (cssparser, cssparser-macros, dtoa-short, option-ext and selectors, pulled in by Tauri's tooling); cssparser-macros is a proc-macro that runs only at build time, and the other four are linked unmodified (see the table below). The Linux AppImage carries the build machine's WebKitGTK, GTK and GLib (LGPL-2.1-or-later) as separate shared libraries, taken unmodified from the build system's distribution packages; they are linked dynamically and can be replaced, and their source is available from that distribution (for Ubuntu, the webkit2gtk, gtk+3.0 and glib2.0 source packages). The .deb and .rpm use the system's own copies.

### Desktop shell: crates under other licences

Tauri links these crates unedited (no `[patch]` and no vendored copy):

| Crate | Licence | Why it is there |
| --- | --- | --- |
| cssparser, selectors, dtoa-short, option-ext | MPL-2.0 | Tauri's HTML handling (tauri-utils); used unmodified, source at crates.io |
| r-efi | MIT OR Apache-2.0 OR LGPL-2.1-or-later | used under MIT |

The shell's lock contains neither `ring` nor `webpki-roots` (no updater), so they are not listed. The installers carry this file, NOTICE.md and `legal/third-party/` as bundled resources.

## Bundled content: stock icons

`backend/app/stock/lucide.json` holds the drawing data and tags of 1,877 icons from lucide-static 1.55.0 (npm). Licence: ISC (Copyright (c) 2026 Lucide Icons and Contributors). The 88 icons listed as derived from the Feather project are MIT (Copyright (c) 2013-present Cole Bemis). This was checked against the package's own LICENSE file and https://lucide.dev/license on 12 October 2026. The full text is kept beside the data as `backend/app/stock/LICENSE-lucide.txt`, copied byte-for-byte. Every exported site that uses an icon includes that text in its `CREDITS.txt`. `setup/stock_icons.py` regenerates both files from the npm package. Photos inserted from formlit carry whatever rights their owner recorded there; FormWeb stores them with the asset and does not grant any licence of its own.

## License text integrity

The preserved legal texts were copied byte-for-byte from installed upstream packages. The planning sidecar's dependency audit records SHA-256 hashes and source provenance for the inspected texts. Do not remove notices while shrinking archives, and do not modify upstream MPL files. Future package changes need an updated inventory and matching legal texts.
