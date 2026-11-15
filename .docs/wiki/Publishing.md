# Export, runtime Preview and publication

FormWeb exports portable HTML/CSS/JavaScript, serves immutable local versions and compiles isolated editor previews. Studio exposes promotion/rollback, persisted form delivery and explicitly configured provider adapters. Each operation returns its actual files, version, URL or transport status.

| Surface | Behavior |
| --- | --- |
| `GET /api/export` | Download a ZIP of the active site's website files |
| `POST /api/publish` | Export and retain a version under a slug |
| `POST /api/handoff/formpublisher` | Export the open site and send it to FormPublisher, live or into its inbox (0.19.3) |
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

Local immutable /published/ URLs remain available while the service runs. Promotion changes only the active /sites/ route; rollback selects an earlier version. The seo.redirects map produces a portable manifest and the active local route consumes it. Splat rules are allowed: a path `/x/*` (one star, last segment only, non-empty base) may redirect to a target that uses `/:splat` once. `:splat` needs a splat path. A splat into its own prefix (`/docs/*` to `/docs/:splat`), `/*`, `/a/*/b`, `/a*` and splat cycles are refused. Exact paths win over splats, then the longest splat prefix. `redirects.json` keeps its shape (a map of path to target or {to, status}). Published releases follow splats and never let a splat become a redirect off the site. A page routed at `/404` is also exported as a root `404.html` (its URLs start at the base URL's path, such as `/assets/...` or `/repo/assets/...`, so it works at any missing address; not in the sitemap or routes.json), so static hosts that look for `404.html` find it; sites without a 404 page export as before. A published release answers a missing path with that page and status 404, after the same visitor and password gates as the page itself, and an unpublished preview answers a missing path with it too when the export has one. The served copy sends fragment-only links (the skip link, in-content anchors) to the request's own path so they scroll on the same document. With a base URL unset or example.com, a site with a 404 page gets an export warning and the audit issue seo.base-url-404; the Base URL field's help says that leaving it empty keeps the https://example.com placeholder. Protected member routes require backend authorization, and public static export of gated content is rejected.

Studio's inbox, CSV, retention and signed-delivery controls consume the persisted service. Form submission from a preview is scoped by its minted token; local publications use their own hosted endpoint. Retention removes stored records outside site undo. Delivery secrets are referenced by server environment name. A ZIP on another host needs an available backend/form endpoint and a redirect adapter for its host.

Provider status exposes configured adapters and missing environment names. Deployment and domain workflows return actual transport and verification status. A submitted/queued response or local fixture does not establish live vendor hosting, domain/TLS/CDN readiness or completed payment processing. Commerce uses the configured catalogue/hosted-checkout/signed-order adapter; independent vendor verification remains necessary. Credentials stay outside the site and static files.

The [advanced Studio map](Advanced-Studio.md), [Studio guide](../../docs/ADVANCED_GUIDE.md) and [agent quick start](../../docs/AGENT_QUICKSTART.md) describe the consuming paths. [Verification](Verification.md) records observed behavior and its limits.

## Handing a site to FormPublisher (0.19.3)

File > Send to FormPublisher, the command `file.send-formpublisher` and the MCP tool `send_to_formpublisher` call `backend/app/handoff.py`. It builds the same ZIP as `GET /api/export` and posts it to `POST /api/receive/formweb`. The target is `FORMWEB_FORMPUBLISHER_URL` when set, otherwise the port in the `engine.json` that FormPublisher 0.1.4 writes in its data folder (`$FORMPUBLISHER_HOME` or `~/FormPublisher`), otherwise `http://127.0.0.1:8280`. The file's port counts only when it is an integer from 1 to 65535 and `GET /api/health` on 127.0.0.1 at that port answers within 1.5 s with app `formpublisher`; the host is always loopback. The post is sent as `application/zip` with `X-FormWeb-Version`, `X-FormWeb-Site-Name` and `X-FormWeb-Project`, from loopback with no `Origin` and an 8 second timeout. The project header keeps repeat sends of one site together as revisions. A refusal comes back as 502 with FormPublisher's message, which names its code in brackets, for example `FormPublisher refused this site [not-a-site]: ...`. If nothing answers, the ZIP is written atomically (temporary name, then rename) to `FORMPUBLISHER_HOME/inbox`, or `~/FormPublisher/inbox`, with a `.zip.json` beside it holding the site name, project and version, and FormPublisher imports it as a revision of the same site when it starts. The result is `{delivered: "live", site, revision, warnings, localForms}` or `{delivered: "inbox", path, warnings, localForms}`; since 0.19.9 `warnings` is the export's own warning list, as `GET /api/export` gives it, and since 0.21.1 `localForms` names the pages (at most 20) that have a form posting to this computer, the same list `GET /api/export` gives in its `X-FormWeb-Local-Forms` header when it is not empty. The status line shows the `forms.local-address` sentence for each name. The site itself does not change. The page inspector's Whole site section has a Base URL field (`site.settings.baseUrl`), and the 404 base URL warning on Export and on Send to FormPublisher carries a Set the base URL action in the status line that opens and focuses that field.

## Contract

Export filenames must stay beneath the chosen output root. Publication slugs are validated. Every publication receives a distinct version directory; an edit produces a new version instead of silently replacing an older preview. Any missing asset, unsupported behavior or deployment-dependent feature belongs in the export warning report.

Saving the editable project is required when a person expects to continue authoring. A website ZIP cannot replace the source project.
