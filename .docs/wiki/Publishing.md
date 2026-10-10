# Export, runtime Preview and publication

FormWeb exports portable HTML/CSS/JavaScript, serves immutable local versions and compiles isolated editor previews. Studio exposes promotion/rollback, persisted form delivery and explicitly configured provider adapters. Each operation returns its actual files, version, URL or transport status.

| Surface | Behavior |
| --- | --- |
| `GET /api/export` | Download a ZIP of the active site's website files |
| `POST /api/publish` | Export and retain a version under a slug |
| `GET /api/publications` | List previous local publication versions |
| `/published/{slug}/{version}/` | Serve an immutable site version |
| `POST /api/releases/promote` | Activate an existing slug/version on its /sites/ route |
| `POST /api/releases/rollback` | Restore a prior active release or an explicit version |
| `/sites/{slug}/` | Serve the active locally promoted version |
| `POST /api/preview` | Compile a page/locale and return an immutable scoped preview URL |
| `/preview/{token}/` | Serve the isolated compiled runtime and its scoped assets |
| `POST /api/forms/{site_id}/{form_id}` | Store a local form submission |
| `GET /api/forms` | List locally stored submissions |
| `GET /api/forms.csv` | Download the persisted form inbox |
| `POST /api/forms/retention` | Delete submissions outside a chosen retention period |
| `GET/POST /api/delivery/config` | Read/store destinations and signing-secret environment names |
| `GET /api/delivery` | Inspect actual persisted delivery states |
| `POST /api/delivery/{id}/retry` | Retry a recorded signed delivery |
| `GET /api/providers/status` | Inspect adapter configuration and missing environment names |
| `POST /api/providers/deploy` | Submit output through a configured external adapter |
| `GET /api/providers/deployments/{id}` | Inspect a deployment's observed provider status |
| `GET/POST /api/providers/domains` | Inspect/request provider domain bindings |

The Rust exporter creates responsive page output, queried/templated CMS records, locale routes/alternates, metadata and runtime behavior. The Python service validates output paths, bundles stored raster assets, archives exports and hosts publications. Preview uses this compiled output in persistent opaque iframe slots; the old design/runtime remains visible until its replacement loads. Check warnings and desktop/mobile behavior before sharing output.

Local immutable /published/ URLs remain available while the service runs. Promotion changes only the active /sites/ route; rollback selects an earlier version. The seo.redirects map produces a portable manifest and the active local route consumes it. Protected member routes require backend authorization, and public static export of gated content is rejected.

Studio's inbox, CSV, retention and signed-delivery controls consume the persisted service. Form submission from a preview is scoped by its minted token; local publications use their own hosted endpoint. Retention removes stored records outside site undo. Delivery secrets are referenced by server environment name. A ZIP on another host needs an available backend/form endpoint and a redirect adapter for its host.

Provider status exposes configured adapters and missing environment names. Deployment and domain workflows return actual transport and verification status. A submitted/queued response or local fixture does not establish live vendor hosting, domain/TLS/CDN readiness or completed payment processing. Commerce uses the configured catalogue/hosted-checkout/signed-order adapter; independent vendor verification remains necessary. Credentials stay outside the site and static files.

The [advanced Studio map](Advanced-Studio.md), [frontend guide](../../frontend/ADVANCED_GUIDE.md) and [harness quick start](../../docs/harness/QUICKSTART.md) describe the consuming paths. [Verification](Verification.md) records observed behavior and its limits.

## Contract

Export filenames must stay beneath the chosen output root. Publication slugs are validated. Every publication receives a distinct version directory; an edit produces a new version instead of silently replacing an older preview. Any missing asset, unsupported behavior or deployment-dependent feature belongs in the export warning report.

Saving the editable project is required when a person expects to continue authoring. A website ZIP cannot replace the source project.
