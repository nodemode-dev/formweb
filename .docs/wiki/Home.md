# FormWeb

FormWeb is the form family's visual website authoring application. A Rust engine owns editable sites and exports browser-native HTML, CSS and JavaScript. A Python/FastAPI service supplies projects, local publications, forms and MCP. A vanilla TypeScript/Vite window displays and changes the same engine state.

Release version: 0.1.0. Author: nodemode-ai. The repository README and changelog record this release.

| Surface | Current boundary |
| --- | --- |
| Visual editor | Website documents, responsive styles, page/node editing |
| Rust engine | Authoritative model, atomic commands, history, export and audit |
| Python service | Local projects, preview/publication hosting and submissions |
| MCP | Official SDK tools over HTTP and stdio, same active site as the editor |
| Hosting | Versioned local publication; no external hosting account provisioned |
| Desktop | Browser application; no native desktop bundles claimed |
| Vendor parity | Audited separately in `docs/PARITY.md`; researched targets are not completed features |

Start with [[Getting-Started]], then [[Architecture]]. Subsystem contracts are in [[Engine]], [[Agents-and-MCP]], [[Project-Format]] and [[Publishing]]. Contributor operations are in [[Development-Workflow]], [[Verification]] and [[Releasing]].

The source of truth for the wiki is `.docs/wiki/` in this code repository. Edit these files in a reviewed change. A GitHub wiki is a separate publishing target and may not exist yet. Once the owner initializes it, the manual `wiki` workflow copies the reviewed Markdown, commits as nodemode-ai and pushes the wiki repository. The local build has not published this wiki.

Use full words, no emoji and no em dash in Markdown.
