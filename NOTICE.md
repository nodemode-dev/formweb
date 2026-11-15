# Notices

FormWeb · Copyright 2026 NodeAgentc, Inc. Licensed under Apache-2.0, see LICENSE.

FormDesign v0.19.0 and FormPath v0.23.0, supplied by the owner, were studied as read-only family architecture references. Their documents, source trees and git histories are not included in this new repository. The Apache license text is preserved from the supplied family repository. New identity SVG and starter website content are original to this build.

The section library in `library/` (page components, section templates, the formai.studio preset and the product-site starter) is ported from formai-xmental-webspun v3.1.0, NodeAgentc, Inc.'s own section pack, and is distributed here under Apache-2.0 with the owner's clearance of 2026-11-09. It bundles the Inter typeface (SIL Open Font License 1.1, Copyright (c) 2016 The Inter Project Authors), whose licence text sits beside the font in `library/presets/fonts/`.

Direct dependencies are registered in LICENSES.md. Build outputs and installed dependencies are omitted from source archives; installers use locked Rust/frontend versions and pinned direct Python requirements. Python transitive versions may change. Dependency notices must accompany any later compiled distribution.

## Trademarks

Framer is a trademark of Framer B.V. Webflow is a trademark of Webflow, Inc. Adobe and Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries. Other names are the property of their owners. They are used only to describe research, compatibility and file formats; FormWeb is not affiliated with or endorsed by them. FormWeb's tools carry its own names (Shape Crafter, Fill Regions, Trace Image, Pin Warp) and no other product's sample files, presets or icons are bundled.

## Development-only tools

| Package | License | Notes |
| --- | --- | --- |
| pytest 9.1.1 (with iniconfig, packaging, pluggy, pygments) | MIT (pytest, iniconfig, pluggy), Apache-2.0 OR BSD-2-Clause (packaging), BSD-2-Clause (pygments) | runs `backend/tests` in CI (`backend/requirements-test.txt`); never installed in the app |
| Playwright for Python 1.63.0 | Apache-2.0 | runs `frontend/tests/window` (the window smoke) in CI; never installed in the app |
