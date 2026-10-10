# Private publication audit · v0.2.0

An independent manual HTTP audit passed 109 checks on 2026-10-10 with no observed private content leak. It used the actual FastAPI service and Rust model/compiler in a fresh isolated data folder. The existing native CMS/localization fixture carried privately authored text, component prop defaults/variants, compiled code and owned PNG media imported through the real editor API. A separate public PNG was uploaded and bound to the public home page. The final page-owned asset manifest was exercised through actual publication requests. The provider source remained frozen throughout this audit.

| Surface | Anonymous visitor | Wrong group | Allowed group |
| --- | --- | --- | --- |
| English CMS details articles/a, articles/b, articles/c | 401 | 403 | 200, private,no-store |
| French CMS details fr/articles/alpha-fr, fr/articles/c | 401 | 403 | 200, private,no-store |
| Each detail as a directory, directory without slash and direct index.html | 401 | 403 | 200, private,no-store |
| Private component HTML, owned PNG and route-specific CSS | 401 | 403 | 200, private,no-store |
| Public counter component HTML and separate public PNG | 200 | 200 | Not separately probed |

After release promotion and visitor logout, the active /sites aliases also returned 401 for all five detail routes and their three URL forms. Public English/French home HTML and config contained none of the five private text, prop-default, variant, code-source or code-prop markers. Public README, route manifest, base CSS and runtime JavaScript contained none of those markers. Editable native JSON was omitted (404); editor project downloads and original editor asset URLs required editor authentication (401). Public static export of the gated site was rejected (400).

The final asset-access.json manifest records actual owning page IDs for code frames, route CSS and bundled media. Public owning pages permit anonymous access; private-only owners require a permitted visitor group. The separate public counter HTML and PNG returned 200 anonymously, including the active release alias, while private-only assets retained their access checks. Unknown asset ownership is denied when gates exist. The audit does not claim arbitrary cross-site deployment, complete coverage of all media formats, browser iframe runtime behavior or real provider deployment.

Canonical final evidence is research/gated-audit/observations-owner-final.json: 109 checks, concrete status by path and an empty leaks array. The earlier 88-check alias audit remains at observations-alias-final.json and was superseded after its blanket shared-asset restriction was refined into page ownership. The first draft fixture stopped before publication after a manual build-result lookup error and contains no passing publication observations. A separate security-enabled browser run verifies published member login/logout/group revocation and consent/conversion/dashboard flows in [RUNTIME_PROVIDER_BROWSER_v0.2.0.md](RUNTIME_PROVIDER_BROWSER_v0.2.0.md).

