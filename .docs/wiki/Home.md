# FormWeb

FormWeb is the form family's visual website authoring application. A Rust engine owns editable sites and exports browser-native HTML, CSS and JavaScript. A Python/FastAPI service supplies projects, local publications, forms and MCP. A vanilla TypeScript/Vite window displays and changes the same engine state.

Release version: 0.2.0. Author: nodemode-ai. The repository README and changelog record this release.

| Surface | Current boundary |
| --- | --- |
| Visual editor | 93 Studio workflows, stable design canvas and isolated compiled Preview |
| Rust engine | Validated advanced groups, 40 atomic commands, persistent history, compiler and audit |
| Python service | Scoped projects/branches, releases/forms/delivery, visitor services and configured adapters |
| MCP | 61 official SDK tools and 13 resources over HTTP and stdio, with attributed project roles |
| Hosting | Versioned local publication; no external hosting account provisioned |
| Desktop | Browser application; no native desktop bundles claimed |
| Vendor parity | Current acceptance is in `docs/PARITY_v0.2.0.md`; the original audit is retained as history |

Start with [[Getting-Started]], then [[Architecture]]. Subsystem contracts are in [[Engine]], [[Advanced-Studio]], [[Agents-and-MCP]], [[Project-Format]] and [[Publishing]]. Contributor operations are in [[Development-Workflow]], [[Verification]] and [[Releasing]]. The [harness quickstart](../../docs/harness/QUICKSTART.md) connects the operating skill with real MCP; the [Studio guide](../../frontend/ADVANCED_GUIDE.md) describes the consuming editor workflows.

The source of truth for the wiki is `.docs/wiki/` in this code repository. Edit these files in a reviewed change. A GitHub wiki is a separate publishing target and may not exist yet. Once the owner initializes it, the manual `wiki` workflow copies the reviewed Markdown, commits as nodemode-ai and pushes the wiki repository. The local build has not published this wiki.

Use full words, no emoji and no em dash in Markdown.
