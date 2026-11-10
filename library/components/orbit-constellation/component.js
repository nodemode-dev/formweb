// Orbit constellation: twenty-eight cropped captures ride a spinning quaternion ring, then fly into a constellation web
// as the host's scroll scene advances. Ported from the webspun formvfx-orbit section script.
// Pin and scroll progress come from a native scene on the section; the filter and shuffle controls are native nodes that
// set the two variables named by the filterVariable and shuffleVariable props.

const DEFAULT_SERIES = ["Composition", "Timeline", "Graph Editor", "Effects", "Flowchart", "Project", "Text", "Preview"];

const DEFAULT_SOURCES = {
  c: { dark: ["https://media.formai.studio/media/formvfx/ui-comp/57ae465091f3.w1024.webp", "https://media.formai.studio/media/formvfx/ui-comp/57ae465091f3.w2400.webp"], light: ["https://media.formai.studio/media/formvfx/ui-comp-light/8c7b898a3f0d.w1024.webp", "https://media.formai.studio/media/formvfx/ui-comp-light/8c7b898a3f0d.w2400.webp"], w: 2400, h: 1500, name: "ui-comp", alt: "The FormVFX composition view with the Graph Editor under it" },
  f: { dark: ["https://media.formai.studio/media/formvfx/ui-flow/1d864093c368.w1024.webp", "https://media.formai.studio/media/formvfx/ui-flow/1d864093c368.w2400.webp"], light: ["https://media.formai.studio/media/formvfx/ui-flow-light/46170694abda.w1024.webp", "https://media.formai.studio/media/formvfx/ui-flow-light/46170694abda.w2400.webp"], w: 2400, h: 1500, name: "ui-flow", alt: "The FormVFX Flowchart under the composition view" },
  h: { dark: ["https://media.formai.studio/media/formvfx/ui-hero-2/f7a598c5e1b6.w1024.webp", "https://media.formai.studio/media/formvfx/ui-hero-2/f7a598c5e1b6.w2400.webp"], light: ["https://media.formai.studio/media/formvfx/ui-hero-light-2/c3da93778da2.w1024.webp", "https://media.formai.studio/media/formvfx/ui-hero-light-2/c3da93778da2.w2400.webp"], w: 2400, h: 1350, name: "ui-hero-2", alt: "FormVFX with the Launch Week title comp and the Bounce In Characters preset" }
};

const DEFAULT_FRAMES = [
  { title: "Orb and ring", series: 0, source: "c", x: 0.38, y: 0.12, w: 0.24 },
  { title: "Title text", series: 0, source: "c", x: 0.38, y: 0.36, w: 0.24 },
  { title: "Viewer controls", series: 0, source: "c", x: 0.2, y: 0.5, w: 0.24 },
  { title: "Composition tab", series: 0, source: "c", x: 0.2, y: 0.08, w: 0.22 },
  { title: "Launch Week", series: 0, source: "h", x: 0.32, y: 0.2, w: 0.26 },
  { title: "Layer stack", series: 1, source: "c", x: 0, y: 0.5, w: 0.25 },
  { title: "Time ruler", series: 1, source: "c", x: 0.35, y: 0.4, w: 0.3 },
  { title: "Headline layer", series: 1, source: "h", x: 0.4, y: 0.45, w: 0.3 },
  { title: "Ease curve", series: 2, source: "c", x: 0.35, y: 0.55, w: 0.18 },
  { title: "Interpolation", series: 2, source: "c", x: 0.38, y: 0.5, w: 0.25 },
  { title: "Orb layer", series: 2, source: "c", x: 0.05, y: 0.6, w: 0.2 },
  { title: "Scale value", series: 2, source: "c", x: 0.28, y: 0.6, w: 0.2 },
  { title: "Keyframes", series: 2, source: "c", x: 0.34, y: 0.62, w: 0.15 },
  { title: "Effects list", series: 3, source: "c", x: 0.8, y: 0.08, w: 0.2 },
  { title: "Bounce presets", series: 3, source: "h", x: 0.78, y: 0.08, w: 0.22 },
  { title: "Effect groups", series: 3, source: "c", x: 0.8, y: 0.22, w: 0.2 },
  { title: "Backdrop and Glow", series: 4, source: "f", x: 0, y: 0.5, w: 0.25 },
  { title: "Layer nodes", series: 4, source: "f", x: 0.3, y: 0.5, w: 0.25 },
  { title: "Composition node", series: 4, source: "f", x: 0.45, y: 0.5, w: 0.2 },
  { title: "Project panel", series: 5, source: "c", x: 0, y: 0.07, w: 0.22 },
  { title: "Effect controls", series: 5, source: "h", x: 0, y: 0.05, w: 0.25 },
  { title: "Menus and tools", series: 5, source: "c", x: 0, y: 0, w: 0.3 },
  { title: "Agent button", series: 5, source: "c", x: 0.7, y: 0, w: 0.3 },
  { title: "Launch Week type", series: 6, source: "h", x: 0.4, y: 0.3, w: 0.15 },
  { title: "Animate In", series: 6, source: "h", x: 0.8, y: 0.18, w: 0.2 },
  { title: "Scale Bounce Loop", series: 6, source: "h", x: 0.8, y: 0.3, w: 0.2 },
  { title: "Preview panel", series: 7, source: "c", x: 0.8, y: 0.45, w: 0.2 },
  { title: "RAM preview", series: 7, source: "c", x: 0.8, y: 0.55, w: 0.2 }
];

const DEFAULT_LABELS = {
  frame: "Frame",
  panelOrbit: "Panel orbit",
  frames: "frames",
  loading: "Loading",
  allFrames: "All frames",
  viewer: "Frame viewer",
  close: "Close",
  previous: "Previous",
  next: "Next",
  series: "Series",
  capture: "Capture",
  source: "Source",
  by: "by",
  showing: "showing",
  failed: "The full capture did not load. The card preview stays."
};

export function mount(root, props, ctx) {
  const P = props || {};
  const SERIES = Array.isArray(P.series) && P.series.length ? P.series.map(String) : DEFAULT_SERIES;
  const SRC = P.sources && typeof P.sources === "object" && Object.keys(P.sources).length ? P.sources : DEFAULT_SOURCES;
  const LB = { ...DEFAULT_LABELS, ...(P.labels && typeof P.labels === "object" ? P.labels : {}) };
  const FRAMES = Array.isArray(P.frames) && P.frames.length ? P.frames : DEFAULT_FRAMES;
  const BRAND_FORM = typeof P.brandForm === "string" ? P.brandForm : "Form";
  const BRAND_SUFFIX = typeof P.brandSuffix === "string" ? P.brandSuffix : "VFX";
  const FILTER_VAR = typeof P.filterVariable === "string" && P.filterVariable ? P.filterVariable : "orbitFilter";
  const SHUFFLE_VAR = typeof P.shuffleVariable === "string" && P.shuffleVariable ? P.shuffleVariable : "orbitShuffle";

  const CARDS = FRAMES.filter((f) => f && SRC[f.source]).map((c, i) => ({
    i,
    id: String(i + 1).padStart(2, "0"),
    title: String(c.title),
    ser: Math.max(0, Math.min(SERIES.length - 1, Number(c.series) || 0)),
    s: c.source,
    x: Number(c.x) || 0,
    y: Number(c.y) || 0,
    w: Math.max(0.05, Number(c.w) || 0.2)
  }));
  const N = CARDS.length;
  const calm = !!ctx.reduced;
  const host = ctx.host;
  const stageEl = host.parentElement;
  const trackEl = stageEl ? stageEl.parentElement : null;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rng = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const eoq = (t) => 1 - Math.pow(1 - t, 4);
  const hash = (i, k) => {
    const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const css = `
.fwc-orbit { position: absolute; inset: 0; overflow: hidden; color: inherit; }
.fwc-orbit * { box-sizing: border-box; }
.fwc-orbit-dots { position: absolute; inset: 0; background-image: radial-gradient(circle, color-mix(in oklab, var(--or-fg, currentColor) 26%, transparent) 1px, transparent 1.6px); background-size: 22px 22px; -webkit-mask-image: radial-gradient(ellipse 80% 75% at 50% 50%, #000 40%, transparent 100%); mask-image: radial-gradient(ellipse 80% 75% at 50% 50%, #000 40%, transparent 100%); pointer-events: none; }
.fwc-orbit-world { position: absolute; inset: 0; perspective: 1147px; }
.fwc-orbit-scene { position: absolute; inset: 0; transform-style: preserve-3d; }
.fwc-orbit-card { position: absolute; inset-inline-start: 50%; inset-block-start: 50%; inline-size: 80px; block-size: 100px; margin: -50px 0 0 -40px; transform-style: preserve-3d; will-change: transform; pointer-events: none; }
.fwc-orbit-card.is-pick { pointer-events: auto; cursor: pointer; }
.fwc-orbit-pic { position: absolute; inset: 0; overflow: hidden; border-radius: 2.2px; background: repeating-linear-gradient(45deg, var(--pane, #1b1e25) 0 6px, var(--inset, #101216) 6px 12px); opacity: var(--o, 0); }
.fwc-orbit-pic img { position: absolute; max-inline-size: none; block-size: auto; opacity: 0; filter: brightness(var(--br, 1)) saturate(var(--sa, 1)); scale: var(--zm, 1); transition: opacity 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-orbit-card.is-loaded .fwc-orbit-pic img { opacity: 1; }
.fwc-orbit-veil { position: absolute; inset: 0; border-radius: 2.2px; background: color-mix(in oklab, var(--ground, #14161b) 60%, transparent); transform: rotateY(180deg) translateZ(1px); backface-visibility: hidden; opacity: var(--o, 0); }
.fwc-orbit .shot-light { display: none; }
.fwc-orbit.is-light .shot-dark { display: none; }
.fwc-orbit.is-light .shot-light { display: block; }
.fwc-orbit-threads { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; pointer-events: none; }
.fwc-orbit-tags { position: absolute; inset: 0; pointer-events: none; }
.fwc-orbit-mk { position: absolute; inset-inline-start: 0; inset-block-start: 0; inline-size: 8px; block-size: 8px; margin: -4px 0 0 -4px; border: 1px solid var(--or-fg, currentColor); opacity: 0; will-change: transform; }
.fwc-orbit-mk span { position: absolute; inset-inline-start: 12px; inset-block-start: -2px; font-family: var(--font-mono, ui-monospace, monospace); font-size: 10px; letter-spacing: 0.08em; line-height: 1; white-space: nowrap; opacity: 0.7; }
.fwc-orbit-mk b { position: absolute; inset-inline-start: 12px; inset-block-start: 12px; padding: 3px 6px; background: var(--hue, currentColor); color: var(--on-ink, #14161b); font-family: var(--font-mono, ui-monospace, monospace); font-size: 10px; font-weight: 560; letter-spacing: 0.1em; line-height: 1; text-transform: uppercase; white-space: nowrap; opacity: 0; transition: opacity 0.25s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-orbit-mk.is-hover b { opacity: 1; }
.fwc-orbit-node { position: absolute; inset-inline-start: 0; inset-block-start: 0; opacity: 0; pointer-events: none; will-change: transform; }
.fwc-orbit-node i { position: absolute; inset-inline-start: -5px; inset-block-start: -5px; inline-size: 10px; block-size: 10px; background: var(--hue, currentColor); box-shadow: 0 0 0 8px color-mix(in oklab, var(--hue, currentColor) 22%, transparent); }
.fwc-orbit-node p { position: absolute; inset-inline-start: 18px; inset-block-start: -10px; margin: 0; font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; letter-spacing: 0.12em; line-height: 1.5; text-transform: uppercase; white-space: nowrap; }
.fwc-orbit-node .fwc-orbit-form { color: var(--or-fg, var(--ink, currentColor)); }
.fwc-orbit-node .fwc-orbit-suffix { color: var(--hue, currentColor); }
.fwc-orbit-read { position: absolute; inset-block-start: 12px; inset-inline-end: var(--or-g, 24px); display: flex; align-items: center; block-size: var(--control-h-compact, 32px); inline-size: 34ch; margin: 0; overflow: hidden; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; pointer-events: none; }
.fwc-orbit-read > span { overflow: hidden; }
.fwc-orbit-read b { font-weight: 560; font-variant-numeric: tabular-nums; }
.fwc-orbit-loader { position: absolute; inset-inline: 0; inset-block-start: calc(50% + 70px); margin-inline: auto; inline-size: 200px; text-align: start; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; opacity: 0; animation: fwc-orbit-fade 0.4s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) 1.4s forwards; transition: opacity 0.8s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) 0.3s; pointer-events: none; }
.fwc-orbit-loader p { margin: 0 0 var(--sp-2, 8px); }
.fwc-orbit-loader i { display: block; block-size: 1px; background: var(--hue, currentColor); transform: scaleX(0); transform-origin: 0 50%; }
.fwc-orbit.is-ready .fwc-orbit-loader { animation: none; opacity: 0; }
.fwc-orbit-sr { position: absolute; inset-inline-start: var(--or-g, 24px); inset-block-start: 56px; inline-size: 1px; block-size: 1px; overflow: hidden; margin: 0; padding: 0; list-style: none; clip-path: inset(50%); }
.fwc-orbit-sr:focus-within { inline-size: min(320px, calc(100% - var(--or-g, 24px) * 2)); block-size: auto; max-block-size: 60%; overflow: auto; clip-path: none; z-index: 3; background: var(--pane, #1b1e25); color: var(--ink, #eef0f4); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); }
.fwc-orbit-sr button { display: block; inline-size: 100%; padding: var(--sp-2, 8px) var(--sp-3, 12px); border: 0; background: transparent; color: inherit; font: inherit; font-size: var(--fs-s, 0.875rem); text-align: start; cursor: pointer; }
.fwc-orbit-sr button:focus-visible { background: var(--control, #2b303c); }
.fwc-orbit-fb { display: none; }
.fwc-orbit.is-flat { overflow: auto; }
.fwc-orbit.is-flat .fwc-orbit-world, .fwc-orbit.is-flat .fwc-orbit-threads, .fwc-orbit.is-flat .fwc-orbit-tags, .fwc-orbit.is-flat .fwc-orbit-node, .fwc-orbit.is-flat .fwc-orbit-dots, .fwc-orbit.is-flat .fwc-orbit-loader { display: none; }
.fwc-orbit.is-flat .fwc-orbit-fb { display: block; padding: 72px var(--or-g, 24px) var(--sp-7, 48px); }
.fwc-orbit-fb ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--sp-3, 12px); margin: 0; padding: 0; list-style: none; }
.fwc-orbit-fb button { position: relative; inline-size: 100%; aspect-ratio: 4 / 5; overflow: hidden; padding: 0; border: 0; background: var(--pane, #1b1e25); cursor: pointer; }
.fwc-orbit-fb img { position: absolute; max-inline-size: none; block-size: auto; }
.fwc-orbit-lb { inline-size: 100%; max-inline-size: none; block-size: 100%; max-block-size: none; margin: 0; padding: 0; border: 0; background: transparent; color: var(--ink, #eef0f4); }
.fwc-orbit-lb::backdrop { background: color-mix(in oklab, var(--ground, #14161b) 92%, transparent); }
.fwc-orbit-lb[open] { display: grid; grid-template-rows: auto 1fr auto; animation: fwc-orbit-fade 0.45s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both; }
.fwc-orbit-lb-bar { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3, 12px) var(--or-g, 24px); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-orbit-lb-x { inline-size: var(--control-h, 40px); block-size: var(--control-h, 40px); display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-pill, 999px); background: transparent; color: var(--ink-soft, #a4aab8); cursor: pointer; }
.fwc-orbit-lb-x:hover { color: var(--ink, #eef0f4); background: var(--control, #2b303c); }
.fwc-orbit-lb figure { display: flex; align-items: center; justify-content: center; gap: var(--sp-5, 24px); margin: 0; padding: 0 var(--or-g, 24px); min-block-size: 0; animation: fwc-orbit-rise 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both; }
.fwc-orbit-lb-pic { position: relative; block-size: min(100%, 720px); max-inline-size: 100%; aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--radius-m, 10px); background: var(--pane, #1b1e25); box-shadow: var(--shadow-window, 0 30px 80px -40px rgb(0 0 0 / 0.55)); }
.fwc-orbit-lb-pic img { position: absolute; max-inline-size: none; block-size: auto; }
.fwc-orbit-lb-pic img.fwc-orbit-prev { filter: blur(8px); transition: filter 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-orbit-lb-pic img.fwc-orbit-full { opacity: 0; transition: opacity 0.5s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-orbit-lb-pic.is-full img.fwc-orbit-full { opacity: 1; }
.fwc-orbit-lb-pic.is-full img.fwc-orbit-prev { filter: blur(0); }
.fwc-orbit-lb-note { position: absolute; inset-inline: 8px; inset-block-end: 8px; margin: 0; padding: 4px 8px; background: var(--pane, #1b1e25); font-size: var(--fs-xs, 0.8125rem); }
.fwc-orbit-lb figcaption { inline-size: 220px; flex: none; }
.fwc-orbit-lb figcaption h2 { margin: 0 0 var(--sp-3, 12px); font-size: var(--fs-xl, 1.5rem); font-weight: var(--weight-display, 640); letter-spacing: var(--track-tight, -0.015em); }
.fwc-orbit-lb dl { display: grid; gap: var(--sp-2, 8px); margin: 0; }
.fwc-orbit-lb dt { color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-orbit-lb dd { margin: 0; color: var(--ink-soft, #a4aab8); font-size: var(--fs-s, 0.875rem); }
.fwc-orbit-lb-foot { display: flex; justify-content: center; gap: var(--sp-3, 12px); padding: var(--sp-3, 12px) var(--or-g, 24px) var(--sp-5, 24px); }
.fwc-orbit-lb-foot button { display: inline-flex; align-items: center; justify-content: center; block-size: 48px; padding-inline: var(--sp-5, 24px); border: 0; border-radius: 0; background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); color: var(--ink, #eef0f4); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; }
.fwc-orbit-lb-foot button:hover { background: var(--control, #2b303c); }
@keyframes fwc-orbit-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes fwc-orbit-rise { from { opacity: 0; translate: 0 24px; scale: 0.98; } to { opacity: 1; translate: 0 0; scale: 1; } }
.fwc-orbit-chips li:has(button[aria-pressed="true"]) { border-color: var(--hue, currentColor); background: color-mix(in oklab, var(--hue, currentColor) 18%, transparent); }
.fwc-orbit-chap[aria-current="true"] { color: var(--hue, currentColor); background: color-mix(in oklab, var(--hue, currentColor) 16%, transparent); opacity: 1; }
@media (max-width: 767px) {
  .fwc-orbit-read { inline-size: 16ch; }
  .fwc-orbit-read .fwc-orbit-title { display: none; }
  .fwc-orbit-lb figure { flex-direction: column; gap: var(--sp-3, 12px); }
  .fwc-orbit-lb figcaption { inline-size: 100%; }
}
@media (max-width: 560px) {
  .fwc-orbit-mk span { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .fwc-orbit-lb[open], .fwc-orbit-lb figure { animation: none; }
  .fwc-orbit-pic img, .fwc-orbit-lb-pic img { transition: none !important; }
}
`;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const style = el("style");
  style.textContent = css;
  const wrap = el("div", "fwc-orbit");
  root.append(style, wrap);

  const dots = el("div", "fwc-orbit-dots");
  dots.setAttribute("aria-hidden", "true");
  const world = el("div", "fwc-orbit-world");
  world.setAttribute("aria-hidden", "true");
  const scene = el("div", "fwc-orbit-scene");
  world.appendChild(scene);
  const cvs = el("canvas", "fwc-orbit-threads");
  cvs.setAttribute("aria-hidden", "true");
  const g2 = cvs.getContext("2d");
  const tags = el("div", "fwc-orbit-tags");
  tags.setAttribute("aria-hidden", "true");
  const node = el("div", "fwc-orbit-node");
  node.setAttribute("aria-hidden", "true");
  node.appendChild(el("i"));
  const nodeP = el("p");
  nodeP.append(el("span", "fwc-orbit-form", BRAND_FORM), el("span", "fwc-orbit-suffix", BRAND_SUFFIX), document.createElement("br"), document.createTextNode(N + " " + LB.frames));
  node.appendChild(nodeP);

  const read = el("p", "fwc-orbit-read");
  read.setAttribute("aria-live", "polite");
  const readIn = el("span");
  const num = el("b", "", "01");
  const ttl = el("span", "", LB.panelOrbit);
  const ttlWrap = el("span", "fwc-orbit-title");
  ttlWrap.append(document.createTextNode(" "), ttl);
  readIn.append(document.createTextNode(LB.frame + " "), num, document.createTextNode(" / " + N), ttlWrap);
  read.appendChild(readIn);

  const loader = el("div", "fwc-orbit-loader");
  loader.setAttribute("role", "status");
  const loaderP = el("p");
  const done = el("span", "", "0");
  loaderP.append(document.createTextNode(LB.loading + " "), done, document.createTextNode(" / " + N));
  const bar = el("i");
  loader.append(loaderP, bar);

  const sr = el("ul", "fwc-orbit-sr");
  sr.setAttribute("aria-label", LB.allFrames + " (" + N + ")");
  const fb = el("div", "fwc-orbit-fb");
  const fbl = el("ul");
  fb.appendChild(fbl);

  const lb = el("dialog", "fwc-orbit-lb");
  lb.setAttribute("aria-label", LB.viewer);
  const lbBar = el("div", "fwc-orbit-lb-bar");
  const lbc = el("span", "", "01 / " + N);
  const lbx = el("button", "fwc-orbit-lb-x");
  lbx.type = "button";
  lbx.setAttribute("aria-label", LB.close);
  lbx.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';
  lbBar.append(lbc, lbx);
  const fig = el("figure");
  const lbp = el("div", "fwc-orbit-lb-pic");
  const cap = el("figcaption");
  const lbt = el("h2");
  const dl = el("dl");
  const lbs = el("dd");
  const lbn = el("dd");
  const lbz = el("dd");
  dl.append(el("dt", "", LB.series), lbs, el("dt", "", LB.capture), lbn, el("dt", "", LB.source), lbz);
  cap.append(lbt, dl);
  fig.append(lbp, cap);
  const lbFoot = el("div", "fwc-orbit-lb-foot");
  const lbPrev = el("button", "", LB.previous);
  lbPrev.type = "button";
  const lbNext = el("button", "", LB.next);
  lbNext.type = "button";
  lbFoot.append(lbPrev, lbNext);
  lb.append(lbBar, fig, lbFoot);

  wrap.append(dots, world, cvs, tags, node, read, loader, sr, fb, lb);

  let light = ctx.theme() === "light";
  wrap.classList.toggle("is-light", light);

  const crop = (hostEl, card, big, cls) => {
    const s = SRC[card.s];
    const ar = s.w / s.h;
    const hf = (card.w * ar) / 0.8;
    const x = clamp(card.x, 0, 1 - card.w);
    const y = clamp(card.y, 0, 1 - hf);
    const out = [];
    const mk = (url, c, isLight) => {
      const im = document.createElement("img");
      im.width = s.w;
      im.height = s.h;
      im.alt = String(s.alt || "") + ", " + LB.showing + " " + card.title.toLowerCase();
      im.decoding = "async";
      im.className = c + (cls ? " " + cls : "");
      im.style.width = 100 / card.w + "%";
      im.style.left = (-x / card.w) * 100 + "%";
      im.style.top = (-y / card.w) * (0.8 / ar) * 100 + "%";
      im.style.transformOrigin = (x + card.w / 2) * 100 + "% " + (y + hf / 2) * 100 + "%";
      im.dataset.url = url[big ? 1 : 0];
      // Load the active theme at once and the other one when the theme flips.
      if (isLight === light || big) im.src = im.dataset.url;
      hostEl.appendChild(im);
      out.push(im);
    };
    mk(s.dark, "shot-dark", false);
    mk(s.light, "shot-light", true);
    return out;
  };

  const cards = CARDS.map((c) => {
    const e = el("div", "fwc-orbit-card");
    const pic = el("div", "fwc-orbit-pic");
    const veil = el("div", "fwc-orbit-veil");
    e.append(pic, veil);
    const imgs = crop(pic, c, false, "");
    scene.appendChild(e);
    return { c, el: e, pic, imgs, loaded: false, hov: 0, flt: 1, op: -1, br: -1, sa: -1, zm: -1, pick: false, pos: [0, 0, 0], dep: 0, vis: 0, pose: null, b: 0, dimA: 0, M: null };
  });

  const markers = CARDS.map((c) => {
    const m = el("div", "fwc-orbit-mk");
    const t = el("span");
    const b = el("b", "", c.id + " " + c.title);
    m.append(t, b);
    tags.appendChild(m);
    return { el: m, txt: t, v: -1 };
  });

  let openLb = () => {};
  CARDS.forEach((c) => {
    const li = document.createElement("li");
    const b = el("button", "", c.id + " " + c.title + ", " + SERIES[c.ser]);
    b.type = "button";
    b.addEventListener("click", () => openLb(c.i));
    li.appendChild(b);
    sr.appendChild(li);
  });

  const offs = [];
  let last = performance.now();
  let idle = 0;
  let stopFrame = null;
  let started = false;
  let posterGone = false;
  const on =(target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  };

  // Native controls outside the stage: filter chips, chapter links and the index overlay.
  const outside = (sel) => (trackEl ? [...trackEl.querySelectorAll(sel)] : []);
  let filter = -1;
  const readFilter = (v) => {
    const s = String(v === undefined || v === null ? "all" : v);
    const n = Number(s);
    return s === "all" || !Number.isFinite(n) ? -1 : n;
  };
  const markChips = () => {
    for (const b of outside("[data-or-chip]")) {
      const v = b.getAttribute("data-or-chip");
      b.setAttribute("aria-pressed", String(readFilter(v) === filter));
    }
  };
  filter = readFilter(ctx.variable(FILTER_VAR));
  markChips();
  offs.push(ctx.onVariable(FILTER_VAR, (v) => {
    filter = readFilter(v);
    markChips();
    wake();
  }));

  const st = {
    p: 0, spin: 0, yawC: 0, vel: 0, t0: -1, ready: false, seed: 0, seedFrom: 0, shuf: 1,
    px: 0, py: 0, tpx: 0, tpy: 0, hover: -1, down: null, loaded: 0,
    rstate: 0, rfade: 1, fading: false, fadeT: 0, want: 0, dark: 0, frame: 0
  };
  let lastShuffle = ctx.variable(SHUFFLE_VAR);
  offs.push(ctx.onVariable(SHUFFLE_VAR, (v) => {
    if (v === lastShuffle) return;
    lastShuffle = v;
    st.seedFrom = st.seed;
    st.seed += 1;
    st.shuf = 0;
    wake();
  }));

  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (coarse) {
    for (const n of outside("[data-or-t]")) {
      const parts = (n.getAttribute("data-or-t") || "").split("|");
      if (parts[1]) n.textContent = parts[1];
    }
  }

  const mat = {
    mul(a, b) {
      const o = new Array(16);
      for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    S: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]
  };
  const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qax = (ax, a) => {
    const s = Math.sin(a / 2);
    return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)];
  };
  const qx = (a) => qax([1, 0, 0], a);
  const qy = (a) => qax([0, 1, 0], a);
  const qz = (a) => qax([0, 0, 1], a);
  const qrot = (q, v) => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
  };
  const qslerp = (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) {
      d = -d;
      bb = [-b[0], -b[1], -b[2], -b[3]];
    }
    if (d > 0.9995) {
      const r = a.map((v, k) => v + (bb[k] - v) * t);
      const l = Math.hypot(...r);
      return r.map((v) => v / l);
    }
    const th = Math.acos(d);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return a.map((v, k) => v * wa + bb[k] * wb);
  };
  const qmat = (q, s, p) => {
    const [x, y, z, w] = q;
    return [
      s * (1 - 2 * (y * y + z * z)), s * 2 * (x * y + z * w), s * 2 * (x * z - y * w), 0,
      s * 2 * (x * y - z * w), s * (1 - 2 * (x * x + z * z)), s * 2 * (y * z + x * w), 0,
      s * 2 * (x * z + y * w), s * 2 * (y * z - x * w), s * (1 - 2 * (x * x + y * y)), 0,
      p[0], p[1], p[2], 1
    ];
  };

  let W = 1440;
  let H = 835;
  let asp = 1.6;
  let phone = false;
  let dpr = 1;
  const layout = () => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    H = r.height;
    asp = W / H;
    phone = asp < 0.9;
    dpr = Math.min(window.devicePixelRatio || 1, W < 760 ? 1.75 : 2);
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    if (started) wake();
  };
  layout();
  offs.push(ctx.onResize(layout));

  const MORPH = [0.1, 0.6];

  const constPose = (i, seed) => {
    const r0 = 0.3 + 0.7 * Math.sqrt((i + 0.5) / N);
    const jit = (hash(i, 3 + seed) - 0.5) * 0.3;
    const a = i * 2.39996 + 1.7 * seed;
    const ex = (phone ? 6.3 : 5.4) * clamp(asp / 1.5, 0.42, 1);
    const ey = phone ? 3 * 1.45 : 3.5;
    const rad = r0 + jit;
    const pv = phone ? [0, 1.1, 0] : [Math.min(1.9, (asp - 1) * 2.2), 0.25, 0];
    let pos = [pv[0] + Math.cos(a) * rad * ex, pv[1] + Math.sin(a) * rad * ey, lerp(-3.2, 1.4, hash(i, 7 + seed))];
    const rel = [pos[0] - pv[0], pos[1] - pv[1], pos[2]];
    const t = performance.now() / 1000;
    const sway = calm ? 0 : 0.06 * Math.sin(t * 0.13 * 2.2);
    const qc = qm(qy(0.24 * st.px + st.yawC + sway), qx(0.14 * st.py + sway * 0.6));
    const rr = qrot(qc, rel);
    pos = [pv[0] + rr[0], pv[1] + rr[1], rr[2]];
    const sc = lerp(0.5, 1.05, hash(i, 11 + seed)) * (phone ? 0.78 : 1);
    return { p: pos, q: qz((hash(i, 13 + seed) - 0.5) * 0.14), s: sc, o: 1 };
  };

  const pose = (i, p) => {
    const sd = st.seed;
    const R = phone ? 3.2 * Math.min(1, asp / 0.62) : 5 * clamp(asp / 1.45, 0.55, 1);
    const rs = phone ? 0.98 * Math.min(1, asp / 0.5) : 1.18 * Math.max(0.7, clamp(asp / 1.45, 0.55, 1));
    const tilt = qm(qy(phone ? 0.62 : 0.1 * st.px), qm(qz(phone ? 1.42 : -0.08), qx(phone ? 0.12 : 0.36 + 0.07 * st.py)));
    const intro = !st.ready ? 0 : clamp((performance.now() / 1000 - st.t0) / 2.6, 0, 1);
    const qi = calm ? 1 : eoq(clamp((intro - 0.25 * (i / N)) / 0.75, 0, 1));
    const ang = (i / N) * Math.PI * 2 + st.spin - 2.2 * (1 - qi);
    const rr = R * (0.3 + 0.7 * qi);
    const rp = qrot(tilt, [rr * Math.sin(ang), 0, rr * Math.cos(ang)]);
    rp[1] += phone ? 1.1 : 0;
    const ring = { p: rp, q: qm(tilt, qy(ang)), s: rs, o: qi };

    const mp = rng(p, MORPH[0], MORPH[1]);
    const b = eio(clamp(1.6 * mp - (0.6 * i) / N, 0, 1));
    cards[i].b = b;
    let out = ring;

    if (b > 0) {
      const con = constPose(i, sd);
      let c2 = con;
      if (st.shuf < 1) {
        const u = eio(clamp(1.5 * st.shuf - (0.5 * i) / N, 0, 1));
        const old = constPose(i, st.seedFrom);
        c2 = { p: lerp3(old.p, con.p, u), q: qslerp(old.q, con.q, u), s: lerp(old.s, con.s, u), o: 1 };
        c2.p[2] += 1.6 * Math.sin(Math.PI * u);
      }
      const bul = Math.sin(Math.PI * b);
      const pp = lerp3(ring.p, c2.p, b);
      pp[0] *= 1 + 0.12 * bul;
      pp[1] *= 1 + 0.12 * bul;
      pp[2] += 2.2 * bul;
      out = { p: pp, q: qslerp(ring.q, c2.q, b), s: lerp(ring.s, c2.s, b), o: lerp(ring.o, 1, b) };
    }
    return out;
  };

  const proj = (M, lx, ly, d) => {
    const x = M[0] * lx + M[4] * ly + M[12];
    const y = M[1] * lx + M[5] * ly + M[13];
    const z = M[2] * lx + M[6] * ly + M[14];
    const k = d / (d - z);
    return [W / 2 + x * k, H / 2 + y * k];
  };

  // Colours for the 2D thread canvas, read from the stage's resolved custom properties.
  const colors = { fg: "", hue: "" };
  const probe = document.createElement("i");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  wrap.appendChild(probe);
  const setStageTheme = () => {
    if (!stageEl) return;
    stageEl.style.setProperty("--or-ondark", light ? "var(--ground)" : "var(--ink)");
    stageEl.style.setProperty("--or-from", light ? "var(--ground)" : "var(--pane)");
  };
  const readColors = () => {
    probe.style.color = "var(--or-ondark, var(--ink))";
    colors.fg = getComputedStyle(probe).color;
    probe.style.color = "var(--hue)";
    colors.hue = getComputedStyle(probe).color;
  };
  setStageTheme();
  readColors();

  let imgDone = 0;
  const markReady = () => {
    if (st.ready) return;
    st.ready = true;
    // A dark wide stage shows the poster's settled ring first, so the intro is skipped to hand over without a jump.
    const settled = !light && asp >= 1.3 && !!host.querySelector(":scope > [data-fw-poster]");
    st.t0 = performance.now() / 1000 - (settled ? 3 : 0);
    wrap.classList.add("is-ready");
    wake();
  };
  const sync = (card) => {
    const im = card.imgs.find((x) => x.classList.contains("shot-light") === light);
    const ok = im && im.complete && im.naturalWidth > 0;
    card.el.classList.toggle("is-loaded", !!ok);
    if (ok && !card.loaded) {
      card.loaded = true;
      imgDone++;
      done.textContent = String(imgDone);
      bar.style.transform = "scaleX(" + imgDone / N + ")";
      if (imgDone >= 20) markReady();
    }
  };
  cards.forEach((c) => {
    c.imgs.forEach((im) => im.addEventListener("load", () => sync(c)));
    sync(c);
  });
  const readyTimer = setTimeout(markReady, 2200);

  offs.push(ctx.onTheme((mode) => {
    light = mode === "light";
    wrap.classList.toggle("is-light", light);
    setStageTheme();
    readColors();
    cards.forEach((c) => {
      c.imgs.forEach((im) => {
        if (!im.src && im.classList.contains("shot-light") === light) im.src = im.dataset.url;
      });
      sync(c);
    });
    wake();
  }));

  // Pointer: spin, hover and open.
  const nudge = (dx) => {
    const w = wts();
    st.spin += dx * 0.0062 * w.r;
    st.yawC = clamp(st.yawC + dx * 0.0024 * w.k, -0.9, 0.9);
  };
  const wts = () => ({ r: 1 - eio(rng(st.p, 0.1, 0.5)), k: eio(rng(st.p, 0.3, 0.6)) });
  const pickable = (e) => !e.target.closest("button, a, .fwc-orbit-sr, dialog");
  on(host, "pointermove", (e) => {
    if (lb.open) return;
    const r = host.getBoundingClientRect();
    st.tpx = ((e.clientX - r.left) / r.width) * 2 - 1;
    st.tpy = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (st.down) {
      const d = st.down;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.travel += Math.abs(dx) + Math.abs(dy);
      d.tot += Math.abs(dx);
      if (d.travel > 5 && !d.on) {
        const touch = e.pointerType === "touch";
        if (touch && Math.abs(dx) < 0.8 * Math.abs(e.clientY - d.y0)) {
          st.down = null;
        } else {
          d.on = true;
          host.style.cursor = "grabbing";
          try { host.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        }
      }
      if (st.down && d.on) {
        const now = performance.now();
        const mult = e.pointerType === "touch" ? 1.3 : 1;
        nudge(dx * mult);
        const dtm = Math.max(now - d.t, 8) / 1000;
        d.v = 0.6 * ((dx * mult) / dtm) + 0.4 * d.v;
        d.t = now;
      }
      d.x = e.clientX;
      d.y = e.clientY;
    }
    wake();
  });
  on(host, "pointerdown", (e) => {
    if (e.button > 0 || !pickable(e) || lb.open) return;
    st.vel = 0;
    st.down = { x: e.clientX, y: e.clientY, y0: e.clientY, travel: 0, tot: 0, on: false, v: 0, t: performance.now(), tgt: e.target };
    wake();
  });
  const endDrag = () => {
    host.style.cursor = "";
  };
  on(host, "pointerup", () => {
    const d = st.down;
    st.down = null;
    endDrag();
    if (!d) return;
    if (d.on) {
      if (performance.now() - d.t < 90) st.vel = d.v;
      wake();
      return;
    }
    if (d.travel <= 5) {
      const card = d.tgt && d.tgt.closest && d.tgt.closest(".fwc-orbit-card");
      if (card) openLb(+card.dataset.i);
    }
  });
  on(host, "pointercancel", () => {
    st.down = null;
    endDrag();
  });
  on(host, "pointerleave", () => {
    st.tpx = 0;
    st.tpy = 0;
    st.hover = -1;
    wake();
  });
  cards.forEach((c, i) => {
    c.el.dataset.i = String(i);
    c.el.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && !st.down) {
        st.hover = i;
        wake();
      }
    });
    c.el.addEventListener("pointerleave", () => {
      if (st.hover === i) st.hover = -1;
      wake();
    });
  });

  // Lightbox.
  let lbIdx = 0;
  openLb = (i) => {
    lbIdx = ((i % N) + N) % N;
    const c = CARDS[lbIdx];
    const s = SRC[c.s];
    lbc.textContent = c.id + " / " + N;
    lbt.textContent = c.title;
    lbs.textContent = SERIES[c.ser];
    lbn.textContent = String(s.name || "");
    lbz.textContent = s.w + " " + LB.by + " " + s.h;
    lbp.classList.remove("is-full");
    lbp.replaceChildren();
    const prev = crop(lbp, c, false, "fwc-orbit-prev");
    const full = crop(lbp, c, true, "fwc-orbit-full");
    prev.forEach((im) => { if (!im.src) im.src = im.dataset.url; });
    let bad = 0;
    full.forEach((im) => {
      im.addEventListener("load", () => lbp.classList.add("is-full"));
      im.addEventListener("error", () => {
        bad++;
        if (bad === full.length) lbp.appendChild(el("p", "fwc-orbit-lb-note", LB.failed));
      });
    });
    if (!lb.open) lb.showModal();
    wake();
  };
  on(lbx, "click", () => lb.close());
  on(lbPrev, "click", () => openLb(lbIdx - 1));
  on(lbNext, "click", () => openLb(lbIdx + 1));
  on(lb, "click", (e) => {
    if (e.target === lb) lb.close();
  });
  on(lb, "close", () => wake());
  on(lb, "keydown", (e) => {
    if (e.key === "ArrowLeft") openLb(lbIdx - 1);
    if (e.key === "ArrowRight") openLb(lbIdx + 1);
  });
  ["wheel", "touchmove"].forEach((ev) => on(lb, ev, (e) => e.preventDefault(), { passive: false }));
  let sx = null;
  on(lb, "touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  on(lb, "touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) openLb(lbIdx + (dx < 0 ? 1 : -1));
  });

  // Without 3D transforms the stage swaps to a plain grid of the same frames.
  if (!(window.CSS && CSS.supports && CSS.supports("transform-style", "preserve-3d"))) {
    wrap.classList.add("is-flat");
    CARDS.forEach((c) => {
      const li = document.createElement("li");
      const b = el("button");
      b.type = "button";
      b.setAttribute("aria-label", c.id + " " + c.title);
      crop(b, c, false, "");
      b.addEventListener("click", () => openLb(c.i));
      li.appendChild(b);
      fbl.appendChild(li);
    });
  }

  const heroEls = outside("[data-or-hero]");
  const hintEls = outside("[data-or-hints]");
  const indexEls = outside("[data-or-index]");
  const chapEls = outside("[data-or-chap]");

  let lastFront = -2;
  let lastChap = -1;
  const setFront = (i) => {
    if (i === lastFront) return;
    lastFront = i;
    if (i < 0) {
      num.textContent = "01";
      ttl.textContent = LB.panelOrbit;
      return;
    }
    num.textContent = CARDS[i].id;
    ttl.textContent = CARDS[i].title;
  };

  const rawGeo = () => {
    if (!stageEl || !trackEl) return 0;
    const r = trackEl.getBoundingClientRect();
    const off = parseFloat(getComputedStyle(stageEl).top) || 0;
    const total = trackEl.offsetHeight - stageEl.offsetHeight;
    return total > 0 ? clamp((off - r.top) / total, 0, 1) : 0;
  };

  const tick = (now) => {
    if (!ctx.visible() && st.ready) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    st.frame++;
    let busy = false;
    // The poster shows the settled ring until the intro has finished underneath it.
    if (!posterGone && st.ready) {
      posterGone = true;
      ctx.ready();
    }
    let p;
    if (calm) {
      const raw = rawGeo();
      const want = raw < 0.3 ? 0 : 1;
      if (want !== st.rstate && !st.fading) {
        st.fading = true;
        st.fadeT = 0;
        st.want = want;
      }
      if (st.fading) {
        busy = true;
        st.fadeT += dt / 0.15;
        if (st.fadeT < 1) st.rfade = 1 - st.fadeT;
        else if (st.fadeT < 2) {
          st.rstate = st.want;
          st.rfade = st.fadeT - 1;
        } else {
          st.fading = false;
          st.rfade = 1;
        }
      }
      st.p = st.rstate;
      p = st.p;
    } else {
      p = ctx.progress();
      st.p = p;
    }

    const pk = calm ? 30 : 4;
    st.px += (st.tpx - st.px) * (1 - Math.exp(-pk * dt));
    st.py += (st.tpy - st.py) * (1 - Math.exp(-pk * dt));
    if (Math.abs(st.tpx - st.px) > 0.001 || Math.abs(st.tpy - st.py) > 0.001) busy = true;

    const w = wts();
    if (!calm && st.ready && now / 1000 - st.t0 > 2.6) st.spin += 0.07 * dt * w.r;
    if (st.vel) {
      busy = true;
      nudge(st.vel * dt);
      st.vel *= Math.exp(-2.4 * dt);
      if (Math.abs(st.vel) < 1) st.vel = 0;
    }
    st.yawC *= Math.exp(-0.6 * dt);
    if (Math.abs(st.yawC) > 0.001) busy = true;
    if (st.shuf < 1) {
      busy = true;
      st.shuf = Math.min(1, st.shuf + dt / 1.6);
    }
    if (st.ready && now / 1000 - st.t0 < 2.8) busy = true;
    if (st.down || st.hover >= 0) busy = true;

    const d = H / 2 / Math.tan((40 * Math.PI) / 360);
    world.style.perspective = d.toFixed(1) + "px";
    const cx = 0.35 * st.px;
    const cy = -0.25 * st.py;
    const pre = mat.mul(mat.T(0, 0, d), mat.mul(mat.S(100, -100, 100), mat.T(-cx, -cy, -12)));

    st.dark = rng(p, 0.3, 0.58);

    const thr = rng(p, 0.3, 0.5);
    let bestRing = -1e9;
    let ringI = -1;

    cards.forEach((card, i) => {
      const ps = pose(i, p);
      card.pose = ps;
      let pos = ps.p.slice();
      let sc = ps.s;
      const tgt = st.hover === i && !st.down ? 1 : 0;
      const hb = card.hov;
      card.hov += (tgt - card.hov) * (1 - Math.exp(-7 * dt));
      if (Math.abs(card.hov - tgt) > 0.002 || hb !== card.hov) busy = busy || Math.abs(card.hov - tgt) > 0.002;
      const conW = w.k;
      if (card.hov > 0.001) {
        const slide = lerp(0.45, 0.7, conW) * card.hov;
        const f = qrot(ps.q, [0, 0, 1]);
        pos = [pos[0] + f[0] * slide * (1 - conW), pos[1] + f[1] * slide * (1 - conW), pos[2] + f[2] * slide * (1 - conW) + slide * conW];
        sc *= 1 + lerp(0.08, 0.32, conW) * card.hov;
      }
      const target = filter < 0 || CARDS[i].ser === filter ? 1 : 0;
      card.flt += (target - card.flt) * (1 - Math.exp(-6 * dt));
      if (Math.abs(target - card.flt) > 0.002) busy = true;
      const Mw = qmat(ps.q, sc, pos);
      const Mp = [Mw[0] * 0.01, Mw[1] * -0.01, Mw[2] * 0.01, 0, Mw[4] * 0.01, Mw[5] * -0.01, Mw[6] * 0.01, 0, Mw[8] * 0.01, Mw[9] * -0.01, Mw[10] * 0.01, 0, Mw[12], Mw[13], Mw[14], 1];
      const M = mat.mul(pre, Mp);
      card.M = M;
      card.dep = 12 - pos[2];
      card.pos = pos;
      const op = ps.o * (calm ? st.rfade : 1);
      card.vis = op;
      const opq = Math.round(op * 200) / 200;
      if (opq !== card.op) {
        card.op = opq;
        card.pic.style.setProperty("--o", String(opq));
        card.el.style.visibility = opq <= 0 ? "hidden" : "visible";
      }
      card.el.style.transform = "matrix3d(" + M.map((v) => v.toFixed(4)).join(",") + ")";
      const dimOther = st.hover >= 0 && st.hover !== i ? conW : 0;
      card.dimA += (dimOther - card.dimA) * (1 - Math.exp(-7 * dt));
      if (Math.abs(dimOther - card.dimA) > 0.002) busy = true;
      const br = (1 - 0.55 * card.dimA) * lerp(0.15, 1, card.flt);
      const sa = (1 - 0.6 * card.dimA) * lerp(0.1, 1, card.flt);
      const zm = 1 + 0.07 * card.hov * (1 - conW);
      const brq = Math.round(br * 100) / 100;
      const saq = Math.round(sa * 100) / 100;
      const zmq = Math.round(zm * 1000) / 1000;
      if (brq !== card.br) {
        card.br = brq;
        card.pic.style.setProperty("--br", String(brq));
      }
      if (saq !== card.sa) {
        card.sa = saq;
        card.pic.style.setProperty("--sa", String(saq));
      }
      if (zmq !== card.zm) {
        card.zm = zmq;
        card.pic.style.setProperty("--zm", String(zmq));
      }
      const pickOk = opq > 0.35 && card.flt > 0.5 && st.ready && !lb.open;
      if (pickOk !== card.pick) {
        card.pick = pickOk;
        card.el.classList.toggle("is-pick", pickOk);
      }
      if (w.r > 0.5 && op > 0.5 && pos[2] > bestRing) {
        bestRing = pos[2];
        ringI = i;
      }
    });

    setFront(w.k > 0.5 ? st.hover : ringI);

    const chap = p < 0.3 ? 0 : 1;
    if (chap !== lastChap) {
      lastChap = chap;
      for (const a of chapEls) a.setAttribute("aria-current", String(Number(a.getAttribute("data-or-chap")) === chap));
    }

    const iIn = rng(p, 0.68, 0.84);
    for (const n of indexEls) n.style.pointerEvents = iIn > 0.5 ? "auto" : "none";
    if (calm) {
      // The native scene shows its end state under reduced motion; show the state that matches the settled ring or web.
      const hOp = 1 - rng(p, 0.03, 0.1);
      for (const n of heroEls) n.style.opacity = hOp.toFixed(3);
      for (const n of hintEls) n.style.opacity = (1 - rng(p, 0.02, 0.06)).toFixed(3);
      for (const n of indexEls) n.style.opacity = iIn.toFixed(3);
    }

    const pv = phone ? [0, 1.1, 0] : [Math.min(1.9, (asp - 1) * 2.2), 0.25, 0];
    const nM = mat.mul(pre, mat.T(pv[0], pv[1], pv[2]));
    const nk = d / (d - nM[14]);
    const nodeXY = [W / 2 + nM[12] * nk, H / 2 + nM[13] * nk];
    node.style.opacity = clamp(st.dark * 1.4 - 0.4, 0, 1).toFixed(3);
    node.style.transform = "translate(" + nodeXY[0].toFixed(1) + "px," + nodeXY[1].toFixed(1) + "px)";

    const tagOp = rng(p, 0.5, 0.62);
    cvs.style.opacity = String(clamp(thr * 0.7, 0, 0.7));
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);
    if (thr > 0) {
      g2.globalCompositeOperation = "lighter";
      g2.lineWidth = 1;
      cards.forEach((card, i) => {
        const prog = eoq(rng(card.b || 0, 0.45, 1));
        const m = markers[i];
        if (prog <= 0 || !card.M) {
          if (m.v !== 0) {
            m.v = 0;
            m.el.style.opacity = "0";
          }
          return;
        }
        const c0 = proj(card.M, -40, 50, d);
        const a = nodeXY;
        const mx = (a[0] + c0[0]) / 2;
        const my = (a[1] + c0[1]) / 2;
        const dx = c0[0] - a[0];
        const dy = c0[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const qx2 = mx + (-dy / len) * len * 0.3;
        const qy2 = my + (dx / len) * len * 0.3;
        const hov = st.hover === i;
        const onF = card.flt > 0.5;
        const base = (i % 3 === 0 ? 0.7 : 0.5) * (onF ? 1 : 0.15);
        g2.strokeStyle = hov ? colors.hue : colors.fg;
        g2.globalAlpha = hov ? 1 : base * (st.hover >= 0 ? 0.5 : 1);
        g2.beginPath();
        const segs = Math.max(1, Math.round(26 * prog));
        for (let s = 0; s <= segs; s++) {
          const t = s / 26;
          const u = 1 - t;
          const x = u * u * a[0] + 2 * u * t * qx2 + t * t * c0[0];
          const y = u * u * a[1] + 2 * u * t * qy2 + t * t * c0[1];
          if (s === 0) g2.moveTo(x, y);
          else g2.lineTo(x, y);
        }
        g2.stroke();
        const off = c0[0] < -20 || c0[0] > W + 20 || c0[1] < -20 || c0[1] > H + 20;
        const show = prog >= 1 && !off && onF && card.vis > 0.5 ? tagOp : 0;
        m.v = show;
        m.el.style.opacity = show.toFixed(2);
        m.el.style.transform = "translate(" + c0[0].toFixed(1) + "px," + c0[1].toFixed(1) + "px)";
        m.el.classList.toggle("is-hover", hov);
        if (st.frame % 5 === 0) m.txt.textContent = Math.round(c0[0] * 2) + " " + Math.round(c0[1] * 2);
      });
      g2.globalAlpha = 1;
      g2.globalCompositeOperation = "source-over";
    } else {
      markers.forEach((m) => {
        if (m.v !== 0) {
          m.v = 0;
          m.el.style.opacity = "0";
        }
      });
    }

    if (calm) {
      idle = busy ? 0 : idle + 1;
      if (idle > 20 && stopFrame) {
        stopFrame();
        stopFrame = null;
      }
    }
  };

  // Reduced motion runs frames only while something moves; scroll or any control wakes the loop again.
  function wake() {
    if (!started) return;
    idle = 0;
    if (!stopFrame) {
      last = performance.now();
      stopFrame = ctx.onFrame(tick);
    }
  }
  started = true;
  wake();
  if (calm) on(window, "scroll", wake, { passive: true });

  return () => {
    clearTimeout(readyTimer);
    if (stopFrame) stopFrame();
    stopFrame = null;
    offs.forEach((off) => { if (typeof off === "function") off(); });
    if (lb.open) lb.close();
    root.replaceChildren();
  };
}
