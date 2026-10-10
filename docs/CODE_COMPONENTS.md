# Isolated code components

POST /api/code/build compiles an explicitly enabled JavaScript or TypeScript component using the installed, pinned TypeScript compiler. The body carries enabled, language, source and a props object. The response returns the source, typed prop descriptors, emitted JavaScript and SHA256 digests. The editor stores that returned manifest under extensions.code.components and attaches instances under extensions.code.instances.

Author a mount function accepting an HTMLElement and the descriptor-shaped props object. For example, a title string descriptor corresponds to a string property in the mount function's second parameter. Required descriptor properties are required by the generated TypeScript contract. Supported prop types are string, number, boolean and json. Incorrect defaults, missing functions, syntax errors and TypeScript errors return a concrete 422 diagnostic. Compilation runs in a bounded temporary workspace and does not execute authored JavaScript on the server.

The compiler emits the checked function as formwebMountContract. Exported components run in an opaque-origin iframe with scripts enabled, same-origin access disabled and network-denying content policy. Props are passed as data. Component failures are displayed within the reserved component area. The exporter validates source and build digests before emitting assets, preventing stale or modified manifests from silently becoming output. This is an isolated DOM component interface; React DevLink package compatibility is not claimed.

Install Node and the frontend dependencies using ./formweb install before building code components. The feature does not add a separate dependency graph or execute package install scripts supplied by component source. Arbitrary remote imports are unavailable under the exported sandbox policy.

## Observed build behavior

The pinned TypeScript 7.0.2 compiler successfully built a typed heading component. A string assigned to a number produced a TypeScript diagnostic, a wrongly typed default was rejected, and an enabled:false request was rejected. The first compiler probe used a removed Classic module-resolution option; the build configuration was corrected to Bundler resolution and the successful run was observed afterward. Exported sandbox rendering is recorded separately in the release verification.

## Primary references

- [TypeScript noEmitOnError](https://www.typescriptlang.org/tsconfig/noEmitOnError.html), fetched 2026-10-10: output is withheld when compiler errors exist.
- [TypeScript isolatedModules](https://www.typescriptlang.org/tsconfig/isolatedModules.html), fetched 2026-10-10: isolated transforms have constraints beyond complete type checking. Both API claims are supported by the TypeScript project only.
- [HTML iframe specification](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox): authoritative sandbox contract; fetch provenance is recorded with the release research.
