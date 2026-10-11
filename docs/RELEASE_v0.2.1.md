# FormWeb v0.2.1 verification

This patch restores the supplied Form family comparison format in both the standalone FormWeb HTML and consolidated matrix. It also fixes malformed configured provider URLs that previously produced unhandled parser errors and left translation reviews loading.

## Delivered comparison

- [Standalone FormWeb comparison](comparisons/FormWeb-Parity_v0.2.1.html)
- [Consolidated family matrix](comparisons/FormAI-Parity-Matrix-consolidated.html)

Both contain the same FormWeb page: the warm light/dark family palette, declared family typography, a white research baseline followed by orange FormWeb, blue Framer and green Webflow capability lanes, one percentage tile per product, and the detailed evidence table. Each lane has 65 segments across 14 groups. The table retains all 65 capability rows and 62 source records. Historical comparisons and original sibling registrations remain intact.

| Product | Tile | Meaning |
| --- | --- | --- |
| FormWeb | 98.5%, 64/65 | Retained executed local acceptance, weighted: 63 full and two partial |
| Framer | 81.5%, 53/65 | Documented native coverage, lower bound; integrations, unknowns and not-native records stay separate |
| Webflow | 92.3%, 60/65 | Documented native coverage, lower bound; unknowns, not-native and retired records stay separate |

These are different evidence measures, not a product ranking or completed vendor audit. The white baseline represents researched requirements. [The v0.2.0 acceptance audit](PARITY_v0.2.0.md) and embedded research data are retained unchanged; the presentation release is v0.2.1.

## Actual checks

Security-enabled Chromium 153 ran with CPU 4x, 150 ms latency, 750/250 kbit/s and disabled cache. All 12 browser checks passed with zero page errors. Reference and repaired screenshots were inspected in dark/light themes and at 390 px. Filters preserve row identity, CSV reflects the selected rows, theme changes retain the frame, and capability links clear filters and scroll to the existing evidence row on the first click. The consolidated iframe remains about:srcdoc. Load-only CLS was 0.000323 for the parent and zero for the FormWeb frame; intentional filter and viewport movement is recorded separately.

The locked Rust release build, strict TypeScript/Vite build, Python compilation, root diagnostics and Rust selfcheck passed. The actual official MCP SDK reports FormWeb v0.2.1, 61 tools and 13 resources; its site state agrees with REST and the Rust authority. The Rust selfcheck reports 40 commands. The root VERSION marker was also corrected from its stale 0.1.0 value to 0.2.1.

Malformed nonnumeric, out-of-range, zero and unmatched-bracket provider URLs now produce bounded 503 errors. Actual HTTP and SDK operations confirmed durable error reviews and continued service usability. Valid configured local fetch and translation fixtures still succeed. No native revision changed during provider validation.

The 14-file formweb-harness and its portable mirror pass the god-tier validator with zero FAIL/WARN. Description length is 962 characters and lexical trigger coverage is 15/15. The existing six roles and measured SDK scenarios are retained. New family comparison acceptance lives in the existing advanced-service reference.

## Limits and provenance

Google Fonts requests failed in the browser environment. The reference and repaired pages used the same declared fallbacks; downloaded font glyphs remain unverified. No pixel-perfect or universal zero-shift claim is made. Competitor research was preserved, not re-audited in this patch. Live external hosting/domain/TLS/CDN, completed payments/shipping/tax, Windows/macOS launchers and automatic skill activation remain unverified.

The matching planning sidecar contains the pre-change plan, independent behavioral acceptance, raw browser/provider/SDK observations, harness validation and final source/archive manifests. Source archives include the real Git history, authored and committed by nodemode-ai <mackin@nodemode.ai>, and exclude installed dependencies, build products, runtime data and credentials.
