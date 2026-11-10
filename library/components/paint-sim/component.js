export function mount(root, props, ctx) {
  const P = props || {};
  const str = (k, d) => (typeof P[k] === 'string' ? P[k] : d);
  const list = (k, d) => (Array.isArray(P[k]) && P[k].length ? P[k] : d);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const inOut2 = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));

  const brandForm = str('brandForm', 'Form');
  const brandSuffix = str('brandSuffix', 'Surface');
  const headline = str('headline', 'Paint the\nmodel, not UVs');
  const accent = str('accent', 'model,');
  const title = str('title', 'A finished swatch');
  const idLabel = str('idLabel', 'Material ID');
  const pigments = list('pigments', ['Tint', 'Ink', 'Pale tint']);
  const chapters = list('chapters', [{ label: 'Brush', at: 0 }, { label: 'Swatch', at: 0.4 }, { label: 'Card', at: 1 }]);
  const presetList = list('presets', [{ name: 'orange', hex: '#e8602c' }]);
  const saveLabel = str('saveLabel', 'Save swatch');
  const renderLabel = str('renderLabel', 'Rendering');
  const fileName = str('fileName', 'swatch');
  const copyFallback = str('copyFallback', 'A printed proof of the surface is shown while WebGL is off.');

  const series = 1000 + Math.floor(Math.random() * 9000);
  const born = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const stamp = `${pad(born.getDate())} ${MON[born.getMonth()]} ${born.getFullYear()}, ${pad(born.getHours())}:${pad(born.getMinutes())}`;

  const style = document.createElement('style');
  style.textContent = `
.fwc-paint { position: absolute; inset: 0; overflow: clip; container-type: size; background: var(--inset, #101216); color: var(--ink, #eef0f4); font-family: var(--font-ui, system-ui, sans-serif);
  --fs-sheet: var(--pane, #1b1e25);
  --fs-d0-core: var(--hue, #eef0f4);
  --fs-d0-edge: color-mix(in oklab, var(--hue, #eef0f4) 60%, var(--fs-sheet));
  --fs-d1-core: var(--ink, #eef0f4);
  --fs-d1-edge: color-mix(in oklab, var(--ink, #eef0f4) 52%, var(--fs-sheet));
  --fs-d2-core: color-mix(in oklab, var(--hue, #eef0f4) 42%, var(--ink, #eef0f4));
  --fs-d2-edge: color-mix(in oklab, var(--hue, #eef0f4) 24%, var(--fs-sheet));
  --fs-pg0-core: var(--fs-d0-core); --fs-pg0-edge: var(--fs-d0-edge);
  --fs-pg1-core: var(--fs-d1-core); --fs-pg1-edge: var(--fs-d1-edge);
  --fs-pg2-core: var(--fs-d2-core); --fs-pg2-edge: var(--fs-d2-edge); }
.fwc-paint *, .fwc-paint *::before, .fwc-paint *::after { box-sizing: border-box; }
.fwc-paint p { margin: 0; }
:where(.fwc-paint) button { font: inherit; color: inherit; }
.fwc-paint-shadow, .fwc-paint-sheet { position: absolute; inset: 0; transform-origin: 50% 50%; will-change: transform; }
.fwc-paint-shadow { z-index: var(--z-behind, -1); box-shadow: var(--shadow-frame, 0 40px 100px -50px rgb(0 0 0 / 0.9)); opacity: 0; }
.fwc-paint-sheet { z-index: var(--z-base, 0); overflow: hidden; background: var(--fs-sheet); box-shadow: inset 0 0 0 1px var(--edge, rgb(255 255 255 / 0.09)); touch-action: pan-y; cursor: crosshair; user-select: none; -webkit-user-select: none; }
.fwc-paint-gl { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
.fwc-paint-fb { position: absolute; inset: 0; display: none; background:
  radial-gradient(34cqw 34cqh at 6% 52%, color-mix(in srgb, var(--fs-pg0-core) 55%, transparent), transparent 70%),
  radial-gradient(30cqw 30cqh at 92% 24%, color-mix(in srgb, var(--fs-pg0-core) 40%, transparent), transparent 70%),
  radial-gradient(26cqw 26cqh at 70% 96%, color-mix(in srgb, var(--fs-pg0-core) 32%, transparent), transparent 70%); filter: blur(14px); }
.fwc-paint-sheet.fwc-paint-nogl .fwc-paint-fb { display: block; }
.fwc-paint-sheet.fwc-paint-nogl .fwc-paint-gl { display: none; }
.fwc-paint-wm { position: absolute; inset-inline-start: 44px; inset-block-start: 40px; margin: 0; font-size: 20px; font-weight: var(--weight-display, 640); letter-spacing: 0.04em; pointer-events: none; }
.fwc-paint-wm i { font-style: normal; display: inline-block; animation: fwc-paint-rise 1.2s var(--ease-out, ease-out) backwards; animation-delay: calc(var(--n) * 0.08s); }
.fwc-paint-f { color: var(--ink, #eef0f4); }
.fwc-paint-s { color: var(--hue, #eef0f4); }
.fwc-paint-meta { position: absolute; inset-inline-end: 44px; inset-block-start: 40px; text-align: end; display: grid; justify-items: end; gap: var(--sp-1, 4px); pointer-events: none; animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.5s backwards; }
.fwc-paint-meta span { font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; color: var(--ink-faint, #6b7283); }
.fwc-paint-meta b { font-size: 28px; font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); line-height: 1.1; color: var(--ink, #eef0f4); }
.fwc-paint-hl { position: absolute; inset-inline: 0; inset-block-start: 46%; transform: translateY(-50%); margin: 0 auto; inline-size: 94cqw; text-align: center; font-size: 11.4cqw; font-weight: 700; line-height: 0.92; letter-spacing: -0.04em; text-wrap: balance; pointer-events: none; }
.fwc-paint-ln { display: block; }
.fwc-paint-hw { display: inline-block; will-change: transform, opacity, filter; }
.fwc-paint-hi { display: inline-block; animation: fwc-paint-wordin 1.8s var(--ease-out, ease-out) var(--d) backwards; }
.fwc-paint-hue { color: var(--fs-pg0-core); }
.fwc-paint-ttl { position: absolute; inset-inline: 0; inset-block-start: 50%; transform: translateY(-50%); text-align: center; font-size: clamp(22px, 3.2cqw, 44px); font-weight: 700; letter-spacing: -0.03em; opacity: 0; pointer-events: none; white-space: nowrap; }
.fwc-paint-copy { position: absolute; inset-inline-start: 44px; inset-block-end: 100px; inline-size: 270px; font-size: 12.5px; line-height: 1.5; pointer-events: none; animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.55s backwards; }
.fwc-paint-copy p + p { margin-block-start: var(--sp-2, 8px); color: var(--ink-soft, #a4aab8); }
.fwc-paint-touch { display: none; }
@media (pointer: coarse) { .fwc-paint-mouse { display: none; } .fwc-paint-touch { display: inline; } }
.fwc-paint-series { position: absolute; inset-inline-end: 44px; inset-block-end: 100px; display: flex; align-items: baseline; gap: var(--sp-3, 12px); pointer-events: none; animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.6s backwards; }
.fwc-paint-series b { font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft, #a4aab8); }
.fwc-paint-series strong { font-size: 30px; font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); font-variant-numeric: tabular-nums; border-block-end: 1.5px solid var(--ink, #eef0f4); line-height: 1.1; }
.fwc-paint-nav { position: absolute; inset-inline: 0; inset-block-start: 30px; margin-inline: auto; inline-size: max-content; z-index: var(--z-raised, 100); display: flex; border: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); background: var(--bar-veil, rgb(20 22 27 / 0.92)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.65s backwards; }
.fwc-paint-nv { position: relative; display: inline-flex; align-items: baseline; gap: var(--sp-2, 8px); padding: var(--sp-3, 12px) 16px; border: 0; background: transparent; font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-soft, #a4aab8); cursor: pointer; transition: background-color var(--dur, 240ms) var(--ease-out, ease-out), color var(--dur, 240ms) var(--ease-out, ease-out); }
.fwc-paint-nv:hover { background: var(--control, #2b303c); color: var(--ink, #eef0f4); }
.fwc-paint-nv i { font-style: normal; font-size: 10px; color: var(--ink-faint, #6b7283); }
.fwc-paint-nv[aria-current="true"] { color: var(--ink, #eef0f4); }
.fwc-paint-nv::before, .fwc-paint-nv::after { content: ""; position: absolute; inline-size: 7px; block-size: 7px; opacity: 0; transition: opacity 0.35s var(--ease-out, ease-out), transform 0.35s var(--ease-out, ease-out); pointer-events: none; }
.fwc-paint-nv::before { inset-block-start: 3px; inset-inline-start: 3px; border-block-start: 1px solid var(--hue); border-inline-start: 1px solid var(--hue); transform: translate(4px, 4px); }
.fwc-paint-nv::after { inset-block-end: 3px; inset-inline-end: 3px; border-block-end: 1px solid var(--hue); border-inline-end: 1px solid var(--hue); transform: translate(-4px, -4px); }
.fwc-paint-nv[aria-current="true"]::before, .fwc-paint-nv[aria-current="true"]::after { opacity: 1; transform: none; }
.fwc-paint-nv:focus-visible { outline: 1px solid var(--focus, #eef0f4); outline-offset: 2px; }
.fwc-paint-hint, .fwc-paint-cap { position: absolute; inset-inline: 0; margin-inline: auto; inline-size: max-content; max-inline-size: 92%; z-index: var(--z-raised, 100); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; pointer-events: none; text-align: center; text-wrap: balance; }
.fwc-paint-hint { inset-block-end: 98px; display: flex; align-items: center; gap: var(--sp-3, 12px); color: var(--ink-faint, #6b7283); animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.7s backwards; }
.fwc-paint-hint u { display: block; inline-size: 36px; block-size: 1px; background: currentColor; text-decoration: none; transform-origin: 0 50%; animation: fwc-paint-rule 2.4s var(--ease-out, ease-out) infinite; }
.fwc-paint-cap { inset-block-end: 98px; color: var(--ink-soft, #a4aab8); opacity: 0; }
.fwc-paint-cap b { color: var(--hue); font-weight: 500; }
.fwc-paint-dock { position: absolute; inset-inline: 0; inset-block-end: 26px; margin-inline: auto; inline-size: max-content; max-inline-size: calc(100% - 24px); z-index: var(--z-raised, 100); display: flex; align-items: center; gap: var(--sp-3, 12px); padding: var(--sp-2, 8px) var(--sp-3, 12px); border: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); background: var(--bar-veil, rgb(20 22 27 / 0.92)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.75s backwards; }
.fwc-paint-sws { display: flex; gap: var(--sp-3, 12px); }
.fwc-paint-sw { inline-size: 24px; block-size: 24px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background: radial-gradient(circle at 50% 50%, var(--c) 0 38%, var(--e) 100%); transition: transform var(--dur, 240ms) var(--ease-out, ease-out), box-shadow var(--dur, 240ms) var(--ease-out, ease-out); }
.fwc-paint-sw:hover { transform: scale(1.08); }
.fwc-paint-sw[aria-checked="true"] { box-shadow: 0 0 0 2px var(--pane, #1b1e25), 0 0 0 3.5px var(--c); }
.fwc-paint-sw:focus-visible { outline: 1px solid var(--focus, #eef0f4); outline-offset: 3px; }
.fwc-paint-sep { inline-size: 1px; block-size: 20px; background: var(--edge-strong, rgb(255 255 255 / 0.18)); }
.fwc-paint-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2, 8px); block-size: 40px; padding-inline: var(--sp-4, 16px); border: 0; border-radius: 0; font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; white-space: nowrap; cursor: pointer; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease-out), opacity var(--dur-fast, 140ms) var(--ease-out, ease-out); }
.fwc-paint-ink { background: var(--ink, #eef0f4); color: var(--on-ink, #14161b); }
.fwc-paint-ink:hover { opacity: 0.88; }
.fwc-paint-quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); color: var(--ink, #eef0f4); }
.fwc-paint-quiet:hover { background: var(--control, #2b303c); }
.fwc-paint-btn:focus-visible { outline: 2px solid var(--focus, #eef0f4); outline-offset: 2px; }
.fwc-paint-note { font-size: var(--fs-xs, 0.8125rem); color: var(--ink-soft, #a4aab8); padding-inline: var(--sp-2, 8px); display: none; }
.fwc-paint-dock.fwc-paint-nogl .fwc-paint-sws, .fwc-paint-dock.fwc-paint-nogl .fwc-paint-sep, .fwc-paint-dock.fwc-paint-nogl .fwc-paint-btn { display: none; }
.fwc-paint-dock.fwc-paint-nogl .fwc-paint-note { display: block; }
.fwc-paint-dock .fwc-paint-btn[disabled] { opacity: 0.6; cursor: progress; }
.fwc-paint-dock .fwc-paint-btn { block-size: 40px; padding-inline: var(--sp-4, 16px); }
.fwc-paint-pal { position: absolute; inset-inline-end: 44px; inset-block-start: 104px; z-index: var(--z-raised, 100); display: grid; gap: var(--sp-3, 12px); padding: var(--sp-3, 12px); border: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); background: var(--bar-veil, rgb(20 22 27 / 0.92)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); animation: fwc-paint-fade 1.2s var(--ease-out, ease-out) 0.8s backwards; }
.fwc-paint-phead { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3, 12px); }
.fwc-paint-phead b { font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft, #a4aab8); }
.fwc-paint-pal .fwc-paint-btn { block-size: 28px; padding-inline: var(--sp-3, 12px); font-size: 11px; letter-spacing: 0.1em; }
.fwc-paint-pcols { display: flex; gap: var(--sp-4, 16px); }
.fwc-paint-pcol { display: grid; gap: var(--sp-2, 8px); justify-items: start; }
.fwc-paint-pk { position: relative; display: flex; align-items: center; gap: var(--sp-2, 8px); font-family: var(--font-mono, monospace); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft, #a4aab8); cursor: pointer; }
.fwc-paint-pk i { display: block; inline-size: 28px; block-size: 28px; background: var(--c); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); transition: transform var(--dur, 240ms) var(--ease-out, ease-out); }
.fwc-paint-pk:hover i { transform: scale(1.06); }
.fwc-paint-pk input { position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: 28px; block-size: 28px; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
.fwc-paint-pk:has(input:focus-visible) i { outline: 1px solid var(--focus, #eef0f4); outline-offset: 2px; }
.fwc-paint-pre { display: flex; gap: 3px; }
.fwc-paint-ps { inline-size: 14px; block-size: 14px; padding: 0; border: 0; background: var(--p); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); cursor: pointer; transition: transform var(--dur, 240ms) var(--ease-out, ease-out); }
.fwc-paint-ps:hover { transform: scale(1.18); }
.fwc-paint-ps[aria-pressed="true"] { box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)), 0 0 0 1.5px var(--pane, #1b1e25), 0 0 0 2.5px var(--ink, #eef0f4); }
.fwc-paint-ps:focus-visible { outline: 1px solid var(--focus, #eef0f4); outline-offset: 2px; }
.fwc-paint-pal.fwc-paint-nogl { display: none; }
@keyframes fwc-paint-fade { from { opacity: 0; } }
@keyframes fwc-paint-rise { from { opacity: 0; transform: translateY(12px); } }
@keyframes fwc-paint-wordin { from { opacity: 0; filter: blur(18px); transform: translateY(30px); } }
@keyframes fwc-paint-rule { 0% { transform: scaleX(0); transform-origin: 0 50%; } 50% { transform: scaleX(1); transform-origin: 0 50%; } 50.01% { transform: scaleX(1); transform-origin: 100% 50%; } 100% { transform: scaleX(0); transform-origin: 100% 50%; } }
@media (max-width: 1100px) { .fwc-paint-copy { inline-size: 240px; font-size: 12px; } }
@media (max-width: 700px) {
  .fwc-paint-nv i { display: none; } .fwc-paint-nv { padding-inline: 12px; letter-spacing: 0.1em; font-size: 12px; }
  .fwc-paint-wm { inset-block-start: 74px; inset-inline-start: 24px; font-size: 16px; }
  .fwc-paint-meta { inset-block-start: 70px; inset-inline-end: 24px; } .fwc-paint-meta b { font-size: 22px; }
  .fwc-paint-hl { inset-block-start: 38%; font-size: clamp(54px, 17cqw, 96px); }
  .fwc-paint-hl .fwc-paint-ln { display: inline; }
  .fwc-paint-copy { inset-inline-start: 24px; inset-block-end: 164px; inline-size: 62cqw; }
  .fwc-paint-copy p:first-child { display: none; } .fwc-paint-copy p + p { margin-block-start: 0; }
  .fwc-paint-series { inset-inline-start: 24px; inset-inline-end: auto; inset-block-end: 126px; }
  .fwc-paint-series strong { font-size: 24px; }
  .fwc-paint-sw { inline-size: 22px; block-size: 22px; } .fwc-paint-sws { gap: var(--sp-2, 8px); }
  .fwc-paint-pal { inset-inline-end: 24px; inset-block-start: auto; inset-block-end: 240px; padding: var(--sp-2, 8px); gap: var(--sp-2, 8px); }
  .fwc-paint-pcols { gap: var(--sp-3, 12px); }
  .fwc-paint-pk { font-size: 10px; letter-spacing: 0.06em; }
  .fwc-paint-ps { inline-size: 13px; block-size: 13px; } .fwc-paint-pre { gap: 2px; }
  .fwc-paint-dock { gap: var(--sp-2, 8px); padding-inline: var(--sp-2, 8px); }
  .fwc-paint-dock .fwc-paint-btn { padding-inline: var(--sp-3, 12px); block-size: 36px; letter-spacing: 0.08em; }
  .fwc-paint-hint { inset-block-end: 98px; }
  .fwc-paint-cap { font-size: 11px; letter-spacing: 0.1em; }
}
.fwc-paint-reduced .fwc-paint-wm i, .fwc-paint-reduced .fwc-paint-meta, .fwc-paint-reduced .fwc-paint-hi, .fwc-paint-reduced .fwc-paint-copy, .fwc-paint-reduced .fwc-paint-series, .fwc-paint-reduced .fwc-paint-nav, .fwc-paint-reduced .fwc-paint-hint, .fwc-paint-reduced .fwc-paint-hint u, .fwc-paint-reduced .fwc-paint-dock, .fwc-paint-reduced .fwc-paint-pal { animation: none; }
.fwc-paint-reduced .fwc-paint-pk i, .fwc-paint-reduced .fwc-paint-ps { transition: none; }
`;

  const letters = (txt, cls, from) => [...txt].map((ch, i) => `<i class="${cls}" style="--n:${from + i}">${esc(ch)}</i>`).join('');
  const lines = headline.split('\n');
  let wi = 0;
  const hlHtml = lines.map((ln) => '<span class="fwc-paint-ln" aria-hidden="true">' + ln.split(' ').filter(Boolean).map((w) => {
    const d = (0.1 + 0.09 * wi).toFixed(2); wi += 1;
    return `<span class="fwc-paint-hw"><span class="fwc-paint-hi${w === accent ? ' fwc-paint-hue' : ''}" style="--d:${d}s">${esc(w)}</span></span>`;
  }).join(' ') + '</span>').join('\n');

  const swHtml = pigments.map((n, i) => `<button class="fwc-paint-sw" type="button" role="radio" aria-checked="${i === 0}" aria-label="${esc(n)}" data-i="${i}" style="--c: var(--fs-pg${i}-core); --e: var(--fs-pg${i}-edge)"${i ? ' tabindex="-1"' : ''}></button>`).join('');
  const palHtml = pigments.map((n, i) => `<div class="fwc-paint-pcol" data-i="${i}">
    <label class="fwc-paint-pk" style="--c: var(--fs-pg${i}-core)"><i></i><input type="color" value="#000000" aria-label="${esc(fill(str('colourLabel', '{name} colour'), { name: n }))}"><span aria-hidden="true">${esc(n)}</span></label>
    <div class="fwc-paint-pre" role="group" aria-label="${esc(fill(str('presetsLabel', '{name} presets'), { name: n }))}">${presetList.map((pr) => `<button class="fwc-paint-ps" type="button" aria-pressed="false" aria-label="${esc(fill(str('presetLabel', '{name}: {preset}'), { name: n, preset: pr.name }))}" data-c="${esc(pr.hex)}" style="--p:${esc(pr.hex)}"></button>`).join('')}</div>
  </div>`).join('');
  const navHtml = chapters.map((c, i) => `<button class="fwc-paint-nv" type="button" data-p="${Number(c.at) || 0}"${i === 0 ? ' aria-current="true"' : ''}><i>${pad(i + 1)}</i>${esc(c.label)}</button>`).join('');

  const wrap = document.createElement('div');
  wrap.className = 'fwc-paint' + (ctx.reduced ? ' fwc-paint-reduced' : '');
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', str('stageLabel', 'A material surface you paint with pigment'));
  wrap.innerHTML = `
  <div class="fwc-paint-shadow"></div>
  <div class="fwc-paint-sheet">
    <canvas class="fwc-paint-gl" aria-hidden="true"></canvas>
    <div class="fwc-paint-fb" aria-hidden="true"></div>
    <p class="fwc-paint-wm" aria-label="${esc(brandForm + brandSuffix)}">${letters(brandForm, 'fwc-paint-f', 0)}${letters(brandSuffix, 'fwc-paint-s', [...brandForm].length)}</p>
    <div class="fwc-paint-meta" aria-hidden="true"><span>${esc(str('metaIndex', '[01]'))}</span><b>${esc(str('metaLabel', 'Roughness'))}</b></div>
    <h1 class="fwc-paint-hl" aria-label="${esc(lines.join(' '))}" style="margin-block:0">${hlHtml}</h1>
    <p class="fwc-paint-ttl" aria-hidden="true">${esc(title)}</p>
    <div class="fwc-paint-copy">
      <p><span class="fwc-paint-mouse">${esc(str('copyMouse', 'Move across the surface to spray grain.'))}</span><span class="fwc-paint-touch">${esc(str('copyTouch', 'Tap and hold to spray, drag sideways to draw.'))}</span></p>
      <p class="fwc-paint-copy2">${esc(str('copy', ''))}</p>
    </div>
    <div class="fwc-paint-series"><b>${esc(idLabel)}</b><strong>${series}</strong></div>
  </div>
  <nav class="fwc-paint-nav" aria-label="${esc(str('chaptersLabel', 'Chapters'))}">${navHtml}</nav>
  <p class="fwc-paint-hint" aria-hidden="true"><u></u>${esc(str('hint', 'Paint, then scroll'))}</p>
  <p class="fwc-paint-cap" aria-hidden="true"><b>${esc(str('sealed', 'Sealed on this machine'))}</b> / <span>${esc(stamp)}</span></p>
  <div class="fwc-paint-dock">
    <div class="fwc-paint-sws" role="radiogroup" aria-label="${esc(str('pigmentLabel', 'Pigment'))}">${swHtml}</div>
    <span class="fwc-paint-sep"></span>
    <button class="fwc-paint-btn fwc-paint-quiet fwc-paint-clear" type="button">${esc(str('clearLabel', 'Clear'))}</button>
    <button class="fwc-paint-btn fwc-paint-ink fwc-paint-save" type="button">${esc(saveLabel)}</button>
    <span class="fwc-paint-note">${esc(str('fallbackNote', 'WebGL is off here, so a printed proof is shown.'))}</span>
  </div>
  <div class="fwc-paint-pal" role="group" aria-label="${esc(str('paletteGroupLabel', 'Pigment colours'))}">
    <div class="fwc-paint-phead"><b>${esc(str('paletteLabel', 'Colours'))}</b><button class="fwc-paint-btn fwc-paint-quiet fwc-paint-reset" type="button">${esc(str('resetLabel', 'Reset'))}</button></div>
    <div class="fwc-paint-pcols">${palHtml}</div>
  </div>`;
  root.appendChild(style);
  root.appendChild(wrap);

  const $ = (s) => wrap.querySelector(s);
  const $$ = (s) => [...wrap.querySelectorAll(s)];
  const sheet = $('.fwc-paint-sheet'), glc = $('.fwc-paint-gl'), shadow = $('.fwc-paint-shadow');
  const dock = $('.fwc-paint-dock'), pal = $('.fwc-paint-pal');
  const RM = () => ctx.reduced;
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };

  const probe = document.createElement('i');
  probe.style.display = 'none';
  wrap.appendChild(probe);
  const lin2s = (x) => { x = clamp(x, 0, 1); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
  const toRgb = (s) => {
    probe.style.color = '#000'; probe.style.color = s;
    const cs = getComputedStyle(probe).color;
    const m = (cs.match(/-?[\d.]+(?:e-?\d+)?/g) || ['0', '0', '0']).map(Number);
    if (cs.startsWith('oklab(')) {
      const [L, A, B] = m;
      const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), mm = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s2 = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
      return [lin2s(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s2), lin2s(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s2), lin2s(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s2)];
    }
    return cs.startsWith('color(') ? [m[0], m[1], m[2]] : [m[0] / 255, m[1] / 255, m[2] / 255];
  };
  const css = (v) => toRgb(`var(${v})`);

  const VS = `#version 300 es
in vec2 a; out vec2 v;
void main(){ v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;
  const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  const FS_UPDATE = `#version 300 es
precision highp float;
uniform sampler2D uPrev; uniform vec2 uRes; uniform float uDecay, uDrift, uTime, uSeed; uniform int uN;
uniform vec4 uS[24]; uniform float uC[24];
in vec2 v; out vec4 o;
${NOISE}
void main(){
  float asp = uRes.x / uRes.y;
  vec2 q = v * vec2(asp, 1.0) * 3.0 + uTime * 0.03;
  float e = 0.02;
  float dx = vn(q + vec2(e, 0.0)) - vn(q - vec2(e, 0.0));
  float dy = vn(q + vec2(0.0, e)) - vn(q - vec2(0.0, e));
  vec2 off = vec2(dy, -dx) / (2.0 * e) * uDrift;
  vec3 c = texture(uPrev, v - off).rgb * (1.0 - uDecay);
  for (int i = 0; i < 24; i++) {
    if (i >= uN) break;
    vec2 d = (v - uS[i].xy) * vec2(asp, 1.0);
    float r = uS[i].z, s = uS[i].w;
    float n = 0.55 + 0.9 * vn(v * vec2(asp, 1.0) * 90.0 + float(i) * 3.1 + uSeed);
    float dd = dot(d, d);
    float g = exp(-dd / (r * r)) * n * s;
    float pr = s * 0.12 * exp(-dd / (r * r * 5.0)) * step(dd, r * r * 12.0);
    float m = h21(gl_FragCoord.xy + uSeed * 17.0 + float(i) * 5.3) < pr ? 0.6 : 0.0;
    c[int(uC[i] + 0.5)] += g + m;
  }
  float t = c.r + c.g + c.b;
  if (t > 1.6) c *= 1.6 / t;
  o = vec4(c, 1.0);
}`;
  const FS_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uCell, uTime, uBloom;
uniform vec3 uPaper, uCore[3], uEdge[3], uAmbCore, uAmbEdge; uniform vec4 uCl[6];
in vec2 v; out vec4 o;
${NOISE}
void main(){
  float asp = uRes.x / uRes.y;
  vec3 c = texture(uTex, v).rgb;
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  float r1 = h21(cell + 0.5), r2 = h21(cell + 17.3);
  float tooth = (h21(gl_FragCoord.xy * 0.37 + 7.0) - 0.5) * 0.05;
  vec3 col = uPaper * (1.0 + tooth);
  vec2 p = v * vec2(asp, 1.0);
  float warp = (vn(p * 5.0 + uTime * 0.12) - 0.5) * 0.035 + (vn(p * 14.0 - uTime * 0.2) - 0.5) * 0.012;
  float amb = 0.0;
  for (int i = 0; i < 6; i++) {
    float d = length(p - uCl[i].xy * vec2(asp, 1.0)) + warp;
    float rad = uCl[i].z * (0.5 + 1.2 * uBloom) * clamp(asp, 0.4, 1.0);
    amb += uCl[i].w * exp(-d * d / (rad * rad));
  }
  amb *= 0.88 * min(1.0, 1.6 * uBloom);
  if (r1 < amb) col = mix(uAmbEdge, uAmbCore, smoothstep(0.3, 1.0, amb));
  float tot = c.r + c.g + c.b;
  if (tot > 0.0005) {
    vec3 w = c / tot;
    vec3 core = w.r * uCore[0] + w.g * uCore[1] + w.b * uCore[2];
    vec3 edge = w.r * uEdge[0] + w.g * uEdge[1] + w.b * uEdge[2];
    col = mix(col, core, clamp(tot, 0.0, 1.0) * 0.07);
    if (r2 < tot) col = mix(edge, core, smoothstep(0.25, 1.0, tot));
  }
  o = vec4(col, 1.0);
}`;
  const FS_COPY = `#version 300 es
precision highp float;
uniform sampler2D uPrev; in vec2 v; out vec4 o;
void main(){ o = texture(uPrev, v); }`;

  let gl = null, ok = false, dirty = true, destroyed = false;
  const R = { prog: {}, tex: [null, null], fbo: [null, null], cur: 0, w: 0, h: 0, dpr: 1 };
  const fallback = () => {
    ok = false;
    sheet.classList.add('fwc-paint-nogl'); dock.classList.add('fwc-paint-nogl'); pal.classList.add('fwc-paint-nogl');
    const c2 = $('.fwc-paint-copy2'); if (c2) c2.textContent = copyFallback;
  };

  const compile = (fs) => {
    const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, gl.getActiveUniform(p, i).name); }
    return { p, u };
  };
  const mkTarget = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, f };
  };

  const sizeGL = () => {
    if (!ok) return;
    const w = Math.max(2, Math.round(wrap.clientWidth)), h = Math.max(2, Math.round(wrap.clientHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === R.w && h === R.h && dpr === R.dpr) return;
    const old = R.tex[R.cur] ? { t: R.tex[R.cur] } : null;
    const nt = [mkTarget(w, h), mkTarget(w, h)];
    if (old) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, nt[0].f); gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, old.t);
      gl.useProgram(R.prog.cpy.p); gl.uniform1i(R.prog.cpy.u.uPrev, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.deleteTexture(old.t); gl.deleteTexture(R.tex[1 - R.cur]);
      gl.deleteFramebuffer(R.fbo[0]); gl.deleteFramebuffer(R.fbo[1]);
    }
    R.tex = [nt[0].t, nt[1].t]; R.fbo = [nt[0].f, nt[1].f]; R.cur = 0;
    R.w = w; R.h = h; R.dpr = dpr;
    glc.width = Math.round(w * dpr); glc.height = Math.round(h * dpr);
    dirty = true;
  };

  const setup = () => {
    try {
      gl = glc.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false });
      if (!gl) throw new Error('no gl');
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('no float');
      R.prog.upd = compile(FS_UPDATE); R.prog.dsp = compile(FS_DISPLAY); R.prog.cpy = compile(FS_COPY);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      on(glc, 'webglcontextlost', (e) => { e.preventDefault(); fallback(); });
      ok = true;
      sizeGL();
    } catch (e) { fallback(); }
  };

  const cur = [0, 1, 2].map(() => ({ c: [0, 0, 0], e: [0, 0, 0] }));
  const tgt = [0, 1, 2].map(() => ({ c: [0, 0, 0], e: [0, 0, 0] }));
  const custom = [null, null, null];
  const PG = { core: cur.map((x) => x.c), edge: cur.map((x) => x.e), paper: [0.93, 0.91, 0.87] };
  let pgMoving = false, touched = false;
  const inputs = $$('.fwc-paint-pk input');
  const presets = $$('.fwc-paint-pcol').map((col) => [...col.querySelectorAll('.fwc-paint-ps')]);
  const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const rgbHex = (a) => '#' + a.map((x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  const rgbCss = (a) => `rgb(${a.map((x) => Math.round(clamp(x, 0, 1) * 255)).join(' ')})`;
  const writePG = () => {
    for (let i = 0; i < 3; i++) {
      wrap.style.setProperty(`--fs-pg${i}-core`, rgbCss(cur[i].c));
      wrap.style.setProperty(`--fs-pg${i}-edge`, rgbCss(cur[i].e));
    }
    touched = true;
  };
  const setTargets = (snap) => {
    PG.paper = css('--fs-sheet');
    for (let i = 0; i < 3; i++) {
      const c = custom[i] ? hexRgb(custom[i]) : css(`--fs-d${i}-core`);
      const e = custom[i] ? c.map((x, j) => lerp(PG.paper[j], x, 0.58)) : css(`--fs-d${i}-edge`);
      tgt[i].c = c; tgt[i].e = e;
      if (snap) { cur[i].c.splice(0, 3, ...c); cur[i].e.splice(0, 3, ...e); }
      if (inputs[i]) inputs[i].value = rgbHex(c);
      (presets[i] || []).forEach((b) => b.setAttribute('aria-pressed', String(!!custom[i] && b.dataset.c === custom[i])));
    }
    if (snap && touched) writePG();
    pgMoving = !snap;
    dirty = true;
  };
  const readColors = () => {
    if (touched) { for (let i = 0; i < 3; i++) { wrap.style.removeProperty(`--fs-pg${i}-core`); wrap.style.removeProperty(`--fs-pg${i}-edge`); } touched = false; }
    setTargets(true);
  };
  const pgStep = (dt) => {
    const k = RM() ? 1 : 1 - Math.exp(-dt * 9);
    let moving = false;
    for (let i = 0; i < 3; i++) for (const key of ['c', 'e']) {
      const a = cur[i][key], b = tgt[i][key];
      for (let j = 0; j < 3; j++) {
        const d = b[j] - a[j];
        if (Math.abs(d) < 0.0015) a[j] = b[j]; else { a[j] += d * k; moving = true; }
      }
    }
    writePG();
    pgMoving = moving;
    dirty = true;
  };
  offs.push(ctx.onTheme(() => readColors()));

  const CL = [
    { x: 0.04, y: 0.5, r: 0.14, s: 1.0, ax: 0.03, ay: 0.025, w: 0.1, ph: 0.3 },
    { x: 0.08, y: 0.9, r: 0.06, s: 0.5, ax: 0.02, ay: 0.03, w: 0.12, ph: 1.7 },
    { x: 0.78, y: 0.88, r: 0.12, s: 0.9, ax: 0.04, ay: 0.02, w: 0.09, ph: 2.9 },
    { x: 0.97, y: 0.55, r: 0.15, s: 1.15, ax: 0.03, ay: 0.04, w: 0.08, ph: 4.1 },
    { x: 0.94, y: 0.28, r: 0.1, s: 0.8, ax: 0.01, ay: 0.03, w: 0.13, ph: 5.2 },
    { x: 0.36, y: 0.03, r: 0.05, s: 0.35, ax: 0.04, ay: 0.01, w: 0.11, ph: 0.9 }
  ];

  const queue = [];
  let color = 0;
  const splat = (x, y, r, s) => { queue.push([x, y, r, s, color]); if (queue.length > 200) queue.shift(); dirty = true; };
  const uniS = new Float32Array(96), uniC = new Float32Array(24);
  let T = 0, intro = RM() ? 1 : 0, drive = 0;

  const pass = (n, decay, drift) => {
    const nxt = 1 - R.cur, u = R.prog.upd.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo[nxt]); gl.viewport(0, 0, R.w, R.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex[R.cur]);
    gl.useProgram(R.prog.upd.p);
    gl.uniform1i(u.uPrev, 0); gl.uniform2f(u.uRes, R.w, R.h);
    gl.uniform1f(u.uDecay, decay); gl.uniform1f(u.uDrift, drift); gl.uniform1f(u.uTime, T); gl.uniform1f(u.uSeed, Math.random() * 100);
    gl.uniform1i(u.uN, n);
    for (let i = 0; i < n; i++) { const q = queue.shift(); uniS[i * 4] = q[0]; uniS[i * 4 + 1] = q[1]; uniS[i * 4 + 2] = q[2]; uniS[i * 4 + 3] = q[3]; uniC[i] = q[4]; }
    gl.uniform4fv(u.uS, uniS); gl.uniform1fv(u.uC, uniC);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    R.cur = nxt;
  };
  const display = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, glc.width, glc.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex[R.cur]);
    const u = R.prog.dsp.u;
    gl.useProgram(R.prog.dsp.p);
    gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uRes, R.w, R.h);
    gl.uniform1f(u.uCell, 0.85 * R.dpr); gl.uniform1f(u.uTime, RM() ? 0 : T);
    gl.uniform1f(u.uBloom, intro * (0.35 + 0.65 * drive));
    gl.uniform3fv(u.uPaper, PG.paper);
    gl.uniform3fv(u.uCore, PG.core.flat()); gl.uniform3fv(u.uEdge, PG.edge.flat());
    gl.uniform3fv(u.uAmbCore, PG.core[0]); gl.uniform3fv(u.uAmbEdge, PG.edge[0]);
    const cl = new Float32Array(24);
    CL.forEach((c, i) => {
      const t = RM() ? 0 : T;
      cl[i * 4] = c.x + Math.cos(t * c.w + c.ph) * c.ax; cl[i * 4 + 1] = c.y + Math.sin(t * c.w * 1.3 + c.ph) * c.ay;
      cl[i * 4 + 2] = c.r; cl[i * 4 + 3] = c.s;
    });
    gl.uniform4fv(u.uCl, cl);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let down = false, last = null, hold = null;
  const aspect = () => (R.w || wrap.clientWidth) / (R.h || wrap.clientHeight);
  const uv = (e) => { const r = sheet.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
  const stroke = (a, b, r, s) => {
    const dx = (b[0] - a[0]) * aspect(), dy = b[1] - a[1], d = Math.hypot(dx, dy);
    if (d > 0.3) { splat(b[0], b[1], r, s); return; }
    const n = Math.min(10, Math.max(1, Math.ceil(d / (0.35 * r))));
    for (let i = 1; i <= n; i++) splat(lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n), r, s);
  };
  on(sheet, 'pointerdown', (e) => {
    if (!ok || e.target.closest('button')) return;
    const p = uv(e); down = true; last = p; hold = p;
    splat(p[0], p[1], 0.06, 0.9);
  });
  on(sheet, 'pointermove', (e) => {
    if (!ok) return;
    if (e.pointerType === 'touch' && !down) return;
    const p = uv(e);
    if (down) { hold = p; if (last) stroke(last, p, 0.05, 0.55); }
    else if (last) stroke(last, p, 0.032, 0.22);
    else splat(p[0], p[1], 0.032, 0.22);
    last = p;
  }, { passive: true });
  const end = () => { down = false; hold = null; };
  on(window, 'pointerup', end);
  on(window, 'pointercancel', () => { end(); last = null; });
  on(sheet, 'pointerleave', () => { end(); last = null; });

  const demo = (t) => {
    const u = clamp((t - 0.9) / 1.8, 0, 1);
    return [lerp(0.56, 0.86, u), 0.26 + 0.12 * u + 0.09 * Math.sin(u * Math.PI * 1.4 * 2 / 2 * 2)];
  };
  if (RM()) for (let i = 0; i <= 40; i++) { const u = 0.9 + 1.8 * (i / 40), p = demo(u); queue.push([p[0], p[1], 0.028, 0.3, 0]); }

  const hw = $$('.fwc-paint-hw'), hintEl = $('.fwc-paint-hint'), ttlEl = $('.fwc-paint-ttl'), capEl = $('.fwc-paint-cap');
  const navs = $$('.fwc-paint-nv');
  const track = ctx.host.parentElement;
  const mqPhone = matchMedia('(max-width: 700px)');
  let p = 0, chapter = -1, kk = 0.64, lastQ = -1;
  const calcK = () => { const vh = window.innerHeight; return mqPhone.matches ? clamp((vh - 230) / vh, 0.42, 0.78) : clamp((vh - 210) / vh, 0.42, 0.64); };
  const topOffset = () => parseFloat(getComputedStyle(ctx.host).top) || 0;
  const range = () => (track ? track.offsetHeight - ctx.host.offsetHeight : 0);
  const rawScroll = () => {
    const r = range();
    if (!track || r <= 0) return 0;
    return clamp((topOffset() - track.getBoundingClientRect().top) / r, 0, 1);
  };

  const timeline = (q) => {
    drive = clamp(q / 0.5, 0, 1);
    hintEl.style.opacity = (1 - ss(0, 0.08, q)).toFixed(3);
    const pv = 1 - ss(0.08, 0.3, q);
    pal.style.opacity = pv.toFixed(3);
    pal.inert = pv < 0.02;
    hw.forEach((w, i) => {
      const u = ss(0.26 + 0.025 * i, 0.26 + 0.025 * i + 0.2, q);
      w.style.opacity = (1 - u).toFixed(3);
      w.style.filter = u > 0 ? `blur(${(14 * u).toFixed(1)}px)` : 'none';
      w.style.transform = u > 0 ? `translateY(${(-35 * u).toFixed(1)}%)` : 'none';
    });
    const e = inOut2(clamp((q - 0.44) / 0.4, 0, 1));
    const sc = lerp(1, kk, e);
    const tf = `translateY(${(-0.03 * wrap.clientHeight * e).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    sheet.style.transform = tf; shadow.style.transform = tf;
    const rad = (16 * e) / sc;
    sheet.style.borderRadius = rad.toFixed(2) + 'px'; shadow.style.borderRadius = rad.toFixed(2) + 'px';
    shadow.style.opacity = e.toFixed(3);
    const t = ss(0.66, 0.81, q);
    ttlEl.style.opacity = t.toFixed(3);
    ttlEl.style.filter = t < 1 ? `blur(${(10 * (1 - t)).toFixed(1)}px)` : 'none';
    const c = ss(0.78, 0.9, q);
    capEl.style.opacity = c.toFixed(3);
    capEl.style.transform = `translateY(${(16 * (1 - c)).toFixed(1)}px)`;
  };
  const setChapter = (raw) => {
    const c = raw < 0.25 ? 0 : raw < 0.8 ? 1 : 2;
    if (c === chapter) return;
    chapter = c;
    navs.forEach((b, i) => b.setAttribute('aria-current', String(i === c)));
    if (c === 2) { ttlEl.removeAttribute('aria-hidden'); capEl.removeAttribute('aria-hidden'); }
    else { ttlEl.setAttribute('aria-hidden', 'true'); capEl.setAttribute('aria-hidden', 'true'); }
  };

  let anim = 0, modal = null;
  const t0 = performance.now();
  let lastT = t0;
  const goTo = (frac, secs) => {
    if (modal || !track) return;
    const to = window.scrollY + track.getBoundingClientRect().top - topOffset() + frac * range();
    cancelAnimationFrame(anim);
    if (RM()) { window.scrollTo({ top: to, behavior: 'instant' }); return; }
    const from = window.scrollY, s = performance.now();
    const step = (n) => {
      const u = clamp((n - s) / (secs * 1000), 0, 1);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      window.scrollTo({ top: from + (to - from) * e, behavior: 'instant' });
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  navs.forEach((b) => on(b, 'click', () => goTo(parseFloat(b.dataset.p) || 0, 1.6)));
  on(window, 'wheel', () => cancelAnimationFrame(anim), { passive: true });
  on(window, 'scroll', () => { if (RM()) dirty = true; }, { passive: true });

  let readied = false;
  const frame = (now) => {
    if (destroyed) return;
    const dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
    if (document.hidden || !ctx.visible()) return;
    const reduced = RM();
    wrap.classList.toggle('fwc-paint-reduced', reduced);
    let target;
    if (reduced) target = rawScroll() < 0.55 ? 0 : 1;
    else target = ctx.progress();
    p = target;
    setChapter(reduced ? rawScroll() : p);
    if (Math.abs(p - lastQ) > 1e-5) { timeline(p); lastQ = p; dirty = true; }
    if (pgMoving) pgStep(dt);
    if (!ok) { if (!readied) { readied = true; ctx.ready(); } return; }
    if (!reduced) {
      T += dt;
      const el = (now - t0) / 1000;
      const iu = clamp(el / 2.6, 0, 1);
      intro = 1 - (1 - iu) * (1 - iu);
      if (el > 0.9 && el < 2.7) { const d = demo(el); queue.push([d[0], d[1], 0.028, 0.3, 0]); }
      if (down && hold) queue.push([hold[0], hold[1], 0.055, 0.35, color]);
      if (queue.length > 200) queue.splice(0, queue.length - 200);
    } else if (down && hold) { queue.push([hold[0], hold[1], 0.055, 0.35, color]); dirty = true; }
    if (reduced && !dirty) return;
    const k = dt * 60;
    const decay = reduced ? 0 : 1 - Math.pow(1 - 0.0007, k), drift = reduced ? 0 : 0.00035 * k;
    let passes = 0;
    do { const n = Math.min(24, queue.length); pass(n, passes === 0 ? decay : 0, passes === 0 ? drift : 0); passes++; } while (queue.length && passes < 3);
    display();
    dirty = false;
    if (!readied) { readied = true; ctx.ready(); }
  };

  const swatches = $$('.fwc-paint-sw');
  const pick = (i) => {
    color = i;
    swatches.forEach((s, j) => { s.setAttribute('aria-checked', String(j === i)); s.tabIndex = j === i ? 0 : -1; });
  };
  swatches.forEach((s, i) => {
    on(s, 'click', () => pick(i));
    on(s, 'keydown', (e) => {
      const n = swatches.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick((i + 1) % n); swatches[(i + 1) % n].focus(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick((i + n - 1) % n); swatches[(i + n - 1) % n].focus(); }
    });
  });
  const setColor = (i, hex) => { custom[i] = hex.toLowerCase(); setTargets(false); if (RM()) pgStep(1); };
  inputs.forEach((inp, i) => on(inp, 'input', () => setColor(i, inp.value)));
  presets.forEach((row, i) => row.forEach((b) => on(b, 'click', () => setColor(i, b.dataset.c))));
  on($('.fwc-paint-reset'), 'click', () => { custom.fill(null); setTargets(false); if (RM()) pgStep(1); });
  on(pal, 'pointerdown', (e) => e.stopPropagation());
  on($('.fwc-paint-clear'), 'click', () => {
    if (!ok) return;
    queue.length = 0;
    for (const f of R.fbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    dirty = true;
  });

  const fontsReady = () => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
  const bSave = $('.fwc-paint-save');
  on(bSave, 'click', async () => {
    if (!ok || bSave.disabled) return;
    const label = bSave.textContent;
    bSave.disabled = true; bSave.textContent = renderLabel;
    await fontsReady();
    display();
    const w = glc.width, h = glc.height;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const c = out.getContext('2d');
    c.drawImage(glc, 0, 0);
    const k = w / wrap.clientWidth;
    const rgbs = (n) => `rgb(${css(n).map((x) => Math.round(clamp(x, 0, 1) * 255)).join(',')})`;
    const inkc = rgbs('--ink'), huec = rgbs('--hue');
    const ff = getComputedStyle(wrap).fontFamily || ctx.token('font-ui') || 'sans-serif';
    const mono = ctx.token('font-mono') || 'monospace';
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.font = `640 ${18 * k}px ${ff}`; c.letterSpacing = `${0.04 * 18 * k}px`;
    c.fillStyle = inkc; c.fillText(brandForm, 32 * k, 32 * k + 18 * k);
    const fw = c.measureText(brandForm).width;
    c.fillStyle = huec; c.fillText(brandSuffix, 32 * k + fw, 32 * k + 18 * k);
    c.letterSpacing = '0px'; c.fillStyle = inkc; c.textAlign = 'right';
    c.font = `640 ${30 * k}px ${ff}`;
    const nw = c.measureText(String(series)).width;
    c.fillText(String(series), w - 32 * k, h - 40 * k);
    c.fillRect(w - 32 * k - nw, h - 40 * k + 6 * k, nw, 1.5 * k);
    c.font = `560 ${14 * k}px ${mono}`;
    c.fillText(idLabel.toUpperCase(), w - 32 * k - nw - 12 * k, h - 40 * k);
    const ts = clamp(wrap.clientWidth * 0.032, 22, 40) * k;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${ts}px ${ff}`; c.letterSpacing = `${-0.03 * ts}px`;
    c.fillText(title, w / 2, h / 2);
    c.letterSpacing = '0px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = `420 ${12 * k}px ${ff}`;
    const lns = list('pngLines', ['Sprayed by hand in FormSurface.', '{stamp}', 'Nothing left this machine.']).map((l) => fill(l, { stamp }));
    lns.forEach((l, i) => c.fillText(l, 32 * k, h - 32 * k - (lns.length - 1 - i) * 17 * k));
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    bSave.disabled = false; bSave.textContent = label;
    if (blob && !destroyed) openModal(URL.createObjectURL(blob));
  });

  const openModal = (url) => {
    cancelAnimationFrame(anim);
    const m = document.createElement('div');
    m.className = 'fwc-paint-scrim'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', str('modalLabel', 'Exported swatch'));
    const alt = fill(str('modalAlt', 'The exported swatch, titled {title}, material {id}'), { title, id: series });
    m.innerHTML = `<style>
.fwc-paint-scrim { position: fixed; inset: 0; z-index: var(--z-overlay, 600); display: grid; place-items: center; padding: var(--sp-5, 24px); background: var(--veil, rgb(8 9 12 / 0.6)); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); overscroll-behavior: contain; animation: fwc-paint-fadeto 0.4s var(--ease-out, ease-out) both; color: var(--ink, #eef0f4); font-family: var(--font-ui, system-ui, sans-serif); }
.fwc-paint-scrim * { box-sizing: border-box; }
.fwc-paint-card { inline-size: min(100%, 880px); display: grid; gap: var(--sp-4, 16px); padding: var(--sp-4, 16px); border-radius: var(--radius-l, 16px); background: var(--pane, #1b1e25); box-shadow: var(--shadow-frame, 0 40px 100px -50px rgb(0 0 0 / 0.9)), inset 0 0 0 1px var(--edge, rgb(255 255 255 / 0.09)); animation: fwc-paint-cardin 0.6s var(--ease-out, ease-out) both; }
.fwc-paint-card img { inline-size: 100%; block-size: auto; max-block-size: 72vh; object-fit: contain; border-radius: 12px; box-shadow: var(--shadow-window, 0 20px 50px -20px rgb(0 0 0 / 0.7)); }
.fwc-paint-crow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3, 12px); flex-wrap: wrap; }
.fwc-paint-crow code { color: var(--ink-soft, #a4aab8); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.08em; }
.fwc-paint-cbtn { display: flex; gap: var(--sp-2, 8px); }
.fwc-paint-scrim .fwc-paint-btn { display: inline-flex; align-items: center; justify-content: center; block-size: 40px; padding-inline: var(--sp-4, 16px); border: 0; border-radius: 0; font: inherit; font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; white-space: nowrap; cursor: pointer; }
.fwc-paint-scrim .fwc-paint-ink { background: var(--ink, #eef0f4); color: var(--on-ink, #14161b); }
.fwc-paint-scrim .fwc-paint-quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); color: var(--ink, #eef0f4); }
@keyframes fwc-paint-fadeto { from { opacity: 0; } to { opacity: 1; } }
@keyframes fwc-paint-cardin { from { opacity: 0; transform: translateY(24px) scale(0.98); } to { opacity: 1; transform: none; } }
</style><div class="fwc-paint-card"><img alt="${esc(alt)}" src="${url}" width="${glc.width}" height="${glc.height}"><div class="fwc-paint-crow"><code>${esc(idLabel)} ${series} / ${esc(fileName)}-${series}.png</code><div class="fwc-paint-cbtn"><a class="fwc-paint-btn fwc-paint-ink" download="${esc(fileName)}-${series}.png" href="${url}">${esc(str('downloadLabel', 'Download'))}</a><button class="fwc-paint-btn fwc-paint-quiet" type="button">${esc(str('closeLabel', 'Close'))}</button></div></div></div>`;
    document.body.appendChild(m);
    modal = m;
    const close = m.querySelector('button');
    const onKey = (e) => {
      if (e.key === 'Escape') shut();
      else if (e.key === 'Tab') { const f = [m.querySelector('a'), close]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + 2) % 2].focus(); }
    };
    const shut = () => { m.remove(); modal = null; URL.revokeObjectURL(url); removeEventListener('keydown', onKey); bSave.focus(); };
    addEventListener('keydown', onKey);
    close.addEventListener('click', shut);
    m.addEventListener('click', (e) => { if (e.target === m) shut(); });
    m.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    m.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    close.focus();
    offs.push(() => { if (modal === m) shut(); });
  };

  kk = calcK();
  readColors();
  setup();
  offs.push(ctx.onResize(() => { kk = calcK(); sizeGL(); lastQ = -1; }));
  on(window, 'resize', () => { kk = calcK(); lastQ = -1; });
  offs.push(ctx.onFrame(frame));

  return () => {
    destroyed = true;
    cancelAnimationFrame(anim);
    for (const off of offs.splice(0)) { try { off(); } catch (e) { /* already gone */ } }
    if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    wrap.remove(); style.remove();
  };
}
