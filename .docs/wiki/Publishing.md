# Export and local publication

FormWeb exports static HTML, CSS and JavaScript and can serve an immutable exported version from the local API. These are separate actions: an export is portable output; a publication is a local preview URL.

| Surface | Behavior |
| --- | --- |
| `GET /api/export` | Download a ZIP of the active site's website files |
| `POST /api/publish` | Export and retain a version under a slug |
| `GET /api/publications` | List previous local publication versions |
| `/published/{slug}/{version}/` | Serve an immutable site version |
| `POST /api/forms/{site_id}/{form_id}` | Store a local form submission |
| `GET /api/forms` | List locally stored submissions |

The Rust exporter creates page output, responsive styles and supported interaction behavior. The Python service validates output paths, writes files, archives exports and hosts publications. Check the returned warnings and the final desktop/mobile browser result before sharing output.

A local publication URL is reachable on this computer while the service runs. There is no built-in external deployment, custom-domain provisioning, CDN, production analytics, remote collaboration or payment integration in this initial build. A ZIP can be taken to a chosen static host by the owner.

Forms in locally published pages can submit to the running local service. A ZIP placed on another host needs a suitable configured form endpoint; the local collector is not a deployed production backend. Form data is kept in the local SQLite database.

## Contract

Export filenames must stay beneath the chosen output root. Publication slugs are validated. Every publication receives a distinct version directory; an edit produces a new version instead of silently replacing an older preview. Any missing asset, unsupported behavior or deployment-dependent feature belongs in the export warning report.

Saving the editable project is required when a person expects to continue authoring. A website ZIP cannot replace the source project.
