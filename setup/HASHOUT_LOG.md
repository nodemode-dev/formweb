# Setup context

## Code component compiler · v0.2.0

setup/build_component.mjs reads one bounded build request, validates explicit enablement and prop descriptors, writes a temporary TypeScript source/contract, invokes the pinned frontend compiler without a shell, and returns emitted JavaScript with SHA256 source/build hashes. Temporary files are removed after success or failure. No authored component JavaScript executes on the server.

The compiler source is a shipping product script, not a source-edit script. A removed Classic resolution option failed the initial actual request; one configuration line changed to Bundler after reading the installed TypeScript 7.0.2 package and the live compiler diagnostic. The corrected compile and three rejected requests were observed. Node/TypeScript versions remain the existing pinned frontend dependencies and their retained licenses.
