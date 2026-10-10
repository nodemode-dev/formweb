# Native engine decisions

## Authority and dependency boundary

Rust owns the document, command history, validation and deterministic exports. Python owns process supervision, persistence, ZIP packaging, local publication and MCP. Both UI and agents operate on the same core. Four crates keep the process shell thin and the model independent. Direct dependencies are serde, serde_json and getrandom, with exact resolved versions and transitive dependencies retained in Cargo.lock. getrandom 0.4.3 supplies cross-platform OS entropy and is MIT OR Apache-2.0 ([official documentation](https://docs.rs/getrandom/0.4.3/getrandom/)). Workspace code uses Apache-2.0.

## Transaction and failure semantics

Commands apply to a cloned candidate, followed by whole-document validation. The candidate is committed once after all batch commands succeed. Undo/redo remain outside batches. History is bounded to 100 entries. No-ops preserve revision and redo. Failed validation cannot leave a changed document or partial history. The final page cannot be removed. Component source nodes cannot be deleted while referenced.

## Safe stored content

Semantic tags and attributes are allowlisted. URL schemes, bounded CSS property names and unsafe CSS forms are checked before state enters the authority. The export escapes user content and serializes interaction records as JSON with script-sensitive characters escaped. Image bindings require typed image/URL fields. CMS date validation checks real calendar ranges, including leap years. These guards do not substitute for a complete browser conformance or accessibility audit.

## Component identity and overrides

Linked instances carry explicit source IDs and override field groups. Source updates propagate to unoverridden field groups; instance-local text and appearance remain independent after an override. Stored instance trees and inherited fields are validated against their source. HTML IDs are remapped to stable instance-specific IDs. Labels, ARIA references and local fragments reuse the same map, preventing cloned forms from targeting source controls. Structure changes are guarded while linked instances exist; detach, variants and nested linked definitions remain future work.

## Portable output

Known page links, including navigation interaction URLs, resolve relative to each exported directory depth. This prevents links from escaping a local publication prefix. Metadata still uses the selected public base URL. Each archive is one selected locale; missing strings fall back. CMS list expansion excludes unpublished items and has a rendered-node budget. Repeated subtrees carry an explicit HTML ID map: IDs, label targets, ARIA references, local fragments and interaction fragment destinations resolve within the same item. References to targets outside the repeated subtree stay unchanged. Nested repeats compose identity suffixes. Remote assets remain remote references.

## Forms and recovery

Every engine startup and new website receives a fresh 128-bit OS-random site identity, preventing independent sites from sharing a submission namespace. Entropy failure aborts startup or the new command without a predictable fallback. Load and supervised recovery preserve the stored identity. The runtime submits URLSearchParams text fields for default FormWeb forms, matching the backend's supported URL-encoded intake. File values are explicitly rejected. Explicit custom form actions and methods remain authored and use native browser submission. Status space is reserved in exported markup. Protocol-only restoreRevision lets the supervisor restore its last acknowledged revision after a core restart. The restored document is validated before mutation; in-memory history is reset and its unavailable state is returned honestly.

## Verification record

Observed: release compilation and CLI selfcheck passed. Manual JSON requests confirmed tree cycle rejection, unsafe URL rejection, stale revision rejection, atomic rollback, undo/redo, linked source updates and local overrides, reusable form label/ID remapping, three published CMS cards, French text/SEO export, nested portable links and exact recovery revision restoration. Two consecutive new commands produced different site IDs; loading the first document preserved its original ID. Export with a configured forms API retained an explicit external form action and GET method while qualifying the default FormWeb action. A two-item CMS list produced matching per-item IDs, label targets, ARIA labels/descriptions, fragment links and interaction destinations; outside contact references remained unchanged. No test suite or source-edit script was written. Existing-file edits were limited to named regions read in this session. Native files were authored fresh from the build contract; supplied sibling sources remain read-only.
