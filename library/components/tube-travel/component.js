// tube-travel: shots line the inside of a long CSS 3D tube. Scroll (through the enclosing scene) travels along it,
// a click flies one shot out beside its details. Ported from formai-xmental-webspun v3.1.0
// assets/sections/formvfx-vortex. Open, index and share state are page variables so native buttons can bind.

const SHEET = `
.fwc-tt { position: absolute; inset: 0; overflow: hidden; isolation: isolate; cursor: grab; touch-action: pan-y; user-select: none; -webkit-user-select: none; container-type: inline-size; color: var(--ink, #eef0f4); font-family: var(--font-ui, system-ui, sans-serif); font-weight: var(--weight-body, 420); line-height: 1.55; text-align: start; --vx-g: clamp(16px, 3vw, 40px);
  & *, & *::before, & *::after { box-sizing: border-box; }
  & p, & h2, & dl, & dd, & ol { margin: 0; }
  & button { font: inherit; color: inherit; }
  &[data-fwc-theme="light"] .shot-dark, &:not([data-fwc-theme="light"]) .shot-light { display: none !important; }
  &.is-press { cursor: grabbing; }
  &.is-hover { cursor: pointer; }
  &:focus { outline: none; }
  &:focus-visible::after { content: ""; position: absolute; inset: 10px; border: 2px solid var(--hue, #eef0f4); pointer-events: none; z-index: var(--z-toast, 800); }
  .vx-world { position: absolute; inset: 0; perspective: 1400px; transition: filter .6s var(--ease-out, ease-out); }
  .vx-scene { position: absolute; inset: 0; transform-style: preserve-3d; transform-origin: 0 0; }
  &.is-open .vx-world { filter: blur(6px) brightness(.5); }
  &[data-fwc-theme="light"].is-open .vx-world { filter: blur(6px) brightness(.7); }
  .vx-cap, .vx-meter { z-index: var(--z-raised, 100); }
  .vx-cap { position: absolute; inset-inline-start: var(--vx-g); inset-block-end: clamp(22px, 4.5vh, 44px); inline-size: min(760px, 66vw); display: grid; gap: var(--sp-3, 12px); transition: opacity .3s var(--ease-out, ease-out), translate .3s var(--ease-out, ease-out); }
  &.is-open .vx-cap, &.is-index .vx-cap { opacity: 0; translate: 0 8px; pointer-events: none; }
  .vx-count, .vx-m, .vx-tick span, .vx-pill, .vx-k, .vx-nextcap, .vx-hint, .vx-tip { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: .14em; text-transform: uppercase; }
  .vx-count { display: flex; gap: .6em; color: var(--ink-soft, #a4aab8); align-items: baseline; transition: opacity .4s var(--ease-out, ease-out); }
  .vx-digits { display: block; block-size: 1.3em; overflow: hidden; color: var(--ink, #eef0f4); }
  .vx-strip { display: grid; transition: transform .55s cubic-bezier(.16, 1, .3, 1); }
  .vx-strip span { block-size: 1.3em; line-height: 1.3em; font-variant-numeric: tabular-nums; }
  .vx-titles { --vx-ts: clamp(44px, 6.6vw, 96px); display: grid; overflow: hidden; padding-block: .06em; block-size: calc(var(--vx-ts) * 1.1 + 40px); }
  .vx-ent { grid-area: 1 / 1; align-self: end; transition: transform .6s cubic-bezier(.16, 1, .3, 1), opacity .3s var(--ease-out, ease-out); opacity: 0; translate: 0 42%; pointer-events: none; }
  .vx-ent.is-now { opacity: 1; translate: 0; transition-delay: .06s; }
  .vx-ent.is-past { translate: 0 -42%; }
  .vx-t { font-size: clamp(44px, 6.6vw, 96px); font-weight: var(--weight-display, 640); letter-spacing: -.04em; line-height: 1.02; white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .vx-m { margin: var(--sp-2, 8px) 0 0; display: flex; flex-wrap: wrap; gap: 0 .8em; color: var(--ink-soft, #a4aab8); align-items: center; }
  .vx-m span + span::before { content: ""; display: inline-block; inline-size: 3px; block-size: 3px; background: currentColor; margin-inline-end: .8em; vertical-align: middle; }
  .vx-sw { display: inline-block; inline-size: 9px; block-size: 9px; background: var(--hue, #eef0f4); margin-inline-end: .8em; }
  .vx-hint { color: var(--ink-faint, #6b7283); display: flex; align-items: center; gap: var(--sp-3, 12px); transition: opacity .5s var(--ease-out, ease-out); }
  .vx-dash { position: relative; display: block; inline-size: 48px; block-size: 1px; background: var(--edge-strong, rgb(255 255 255 / 0.18)); overflow: hidden; }
  .vx-dash::after { content: ""; position: absolute; inset: 0 auto 0 0; inline-size: 20px; background: var(--ink, #eef0f4); animation: fwc-tt-scan 1.8s var(--ease-out, ease-out) infinite; }
  &.is-gone .vx-hint { opacity: 0; }
  .vx-pill { position: absolute; inset: 0 auto auto 0; z-index: var(--z-popover, 700); pointer-events: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--pane, #1b1e25); color: var(--ink, #eef0f4); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); transform-origin: 0 0; opacity: 0; scale: .8; transition: opacity .16s var(--ease-out, ease-out), scale .24s var(--ease-out, ease-out); white-space: nowrap; }
  .vx-pill.is-on { opacity: 1; scale: 1; }
  .vx-pill i { inline-size: 8px; block-size: 8px; background: var(--hue, #eef0f4); }
  .vx-heldwrap { position: absolute; inset: 0; z-index: var(--z-sticky, 200); pointer-events: none; }
  .vx-held { position: absolute; inset: 0 auto auto 0; transform-origin: 50% 50%; will-change: transform; }
  .vx-detail { position: absolute; inset: 0; z-index: var(--z-overlay, 600); opacity: 0; visibility: hidden; transition: opacity .22s var(--ease-out, ease-out), visibility 0s .22s; }
  .vx-detail.is-open { opacity: 1; visibility: visible; transition-delay: 0s; }
  .vx-slot { position: absolute; inset-block: 104px 80px; inset-inline: clamp(16px, 4vw, 72px) calc(var(--vx-g) + min(420px, 34vw) + 32px); cursor: pointer; }
  .vx-slothint { position: absolute; inset-inline: 0; inset-block-end: -36px; text-align: center; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: .14em; text-transform: uppercase; opacity: 0; transition: opacity .6s var(--ease-out, ease-out) 1s; }
  .vx-detail.is-open .vx-slothint { opacity: 1; }
  .vx-panel { position: absolute; inset-block: 104px 80px; inset-inline-end: var(--vx-g); inline-size: min(420px, 34vw); display: flex; flex-direction: column; justify-content: center; overflow: auto; overscroll-behavior: contain; padding-inline-end: 2px; scrollbar-width: none; }
  .vx-panel > div { display: grid; gap: var(--sp-4, 16px); margin-block: auto; }
  .vx-r { opacity: 0; translate: 0 16px; }
  .vx-panel.is-in .vx-r { opacity: 1; translate: 0; transition: opacity .75s var(--ease-out, ease-out) calc(.42s + var(--k, 0) * 55ms), translate .75s var(--ease-out, ease-out) calc(.42s + var(--k, 0) * 55ms); }
  .vx-k { display: flex; align-items: center; gap: var(--sp-2, 8px); color: var(--hue, #eef0f4); }
  .vx-k i { inline-size: 9px; block-size: 9px; background: var(--hue, #eef0f4); }
  .vx-pt { font-size: clamp(40px, 4.4vw, 70px); font-weight: var(--weight-display, 640); letter-spacing: -.04em; line-height: 1.02; text-wrap: balance; }
  .vx-pl { font-size: 20px; color: var(--ink, #eef0f4); }
  .vx-pp { max-inline-size: 38ch; font-size: 15px; line-height: 1.55; color: var(--ink-soft, #a4aab8); }
  .vx-dl { display: grid; }
  .vx-dl div { display: flex; justify-content: space-between; gap: var(--sp-4, 16px); padding-block: 10px; border-block-start: 1px solid var(--edge, rgb(255 255 255 / 0.09)); font-size: var(--fs-s, 0.875rem); }
  .vx-dl div:last-child { border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09)); }
  .vx-dl dt { color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: .14em; text-transform: uppercase; align-self: center; }
  .vx-dl dd { text-align: end; }
  .vx-act { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4, 16px); flex-wrap: wrap; }
  .vx-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2, 8px); block-size: var(--control-h, 40px); padding-inline: var(--sp-4, 16px); border-radius: var(--radius-m, 10px); font-size: var(--fs-s, 0.875rem); font-weight: var(--weight-strong, 560); text-decoration: none; white-space: nowrap; background: var(--ink, #eef0f4); color: var(--on-ink, #14161b); transition: opacity var(--dur-fast, 140ms) var(--ease-out, ease-out); }
  .vx-btn:hover { opacity: .88; }
  .vx-btn svg { inline-size: var(--icon-m, 20px); block-size: var(--icon-m, 20px); transition: translate var(--dur, 240ms) var(--ease-out, ease-out); }
  .vx-btn:hover svg { translate: 2px -2px; }
  .vx-pager { display: flex; gap: var(--sp-2, 8px); }
  .vx-ibtn { inline-size: 46px; block-size: 46px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-pill, 999px); background: transparent; color: var(--ink-soft, #a4aab8); cursor: pointer; transition: color var(--dur-fast, 140ms) var(--ease-out, ease-out), background-color var(--dur-fast, 140ms) var(--ease-out, ease-out); }
  .vx-ibtn:hover { color: var(--ink, #eef0f4); background: var(--control, #2b303c); }
  .vx-ibtn svg { inline-size: var(--icon-m, 20px); block-size: var(--icon-m, 20px); }
  .vx-close { position: absolute; inset-block-start: 18px; inset-inline-end: var(--vx-g); inline-size: 42px; block-size: 42px; scale: .8; rotate: -45deg; opacity: 0; }
  .vx-detail.is-open .vx-close { opacity: 1; scale: 1; rotate: 0; transition: opacity .2s var(--ease-out, ease-out) .3s, scale .35s var(--ease-out, ease-out) .3s, rotate .35s var(--ease-out, ease-out) .3s, color var(--dur-fast, 140ms), background-color var(--dur-fast, 140ms); }
  .vx-pop { position: absolute; z-index: var(--z-popover, 700); opacity: 0; visibility: hidden; pointer-events: none; }
  .vx-pop.is-open { opacity: 1; visibility: visible; pointer-events: auto; }
  .vx-index { inset-block: 96px clamp(22px, 4.5vh, 44px); inset-inline-start: var(--vx-g); inline-size: min(480px, calc(100% - var(--vx-g) * 2)); display: flex; flex-direction: column; justify-content: flex-end; pointer-events: none; transition: opacity .2s var(--ease-out, ease-out), visibility 0s .2s; }
  .vx-index.is-open { transition-delay: 0s; }
  .vx-index > ol { padding: 0; list-style: none; max-block-size: 100%; overflow: auto; overscroll-behavior: contain; background: var(--pane, #1b1e25); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); border-radius: var(--radius-m, 10px); transform-origin: 0 100%; translate: 0 10px; scale: .97; transition: translate .35s var(--ease-out, ease-out), scale .35s var(--ease-out, ease-out); scrollbar-width: none; }
  .vx-index.is-open > ol { translate: 0; scale: 1; pointer-events: auto; }
  .vx-row { display: grid; grid-template-columns: 28px 12px minmax(0, 1fr) minmax(0, 130px) minmax(0, 90px); align-items: center; gap: var(--sp-3, 12px); inline-size: 100%; padding: 10px var(--sp-4, 16px); border: 0; border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09)); background: none; color: var(--ink, #eef0f4); text-align: start; cursor: pointer; font: inherit; font-size: var(--fs-s, 0.875rem); opacity: 0; translate: 0 8px; }
  .vx-index.is-open .vx-row { opacity: 1; translate: 0; transition: opacity .4s var(--ease-out, ease-out) calc(60ms + var(--k, 0) * 18ms), translate .4s var(--ease-out, ease-out) calc(60ms + var(--k, 0) * 18ms), background-color var(--dur-fast, 140ms); }
  .vx-row:hover, .vx-row:focus-visible { background: var(--control, #2b303c); }
  .vx-row:focus-visible { outline: 2px solid var(--hue, #eef0f4); outline-offset: -2px; }
  .vx-row .n { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--ink-faint, #6b7283); }
  .vx-row .d { inline-size: 9px; block-size: 9px; background: var(--hue, #eef0f4); transition: scale var(--dur, 240ms) var(--ease-out, ease-out); }
  .vx-row:hover .d, .vx-row[aria-current="true"] .d { scale: 1.35; }
  .vx-row b { font-weight: var(--weight-strong, 560); color: var(--ink, #eef0f4); transition: translate var(--dur, 240ms) var(--ease-out, ease-out); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vx-row:hover b { translate: 4px 0; }
  .vx-row .ty, .vx-row .yr { color: var(--ink-soft, #a4aab8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vx-flat { display: none; }
  &.is-flat .vx-world { display: none; }
  &.is-flat .vx-flat { display: flex; flex-wrap: wrap; gap: var(--sp-3, 12px); position: absolute; inset: 80px var(--vx-g) 120px; overflow: auto; align-content: flex-start; z-index: var(--z-raised, 100); }
  .vx-flat button { inline-size: min(160px, 40%); padding: 0; border: 0; border-block-start: 2px solid var(--hue, #eef0f4); background: var(--pane, #1b1e25); color: var(--ink, #eef0f4); cursor: pointer; text-align: start; font-size: var(--fs-s, 0.875rem); }
  .vx-flat span { display: block; padding: var(--sp-2, 8px) var(--sp-3, 12px); }
  .vx-face { position: relative; overflow: hidden; background: var(--inset, #101216); box-shadow: var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); }
  .vx-face img { position: absolute; max-inline-size: none; block-size: auto; }
  &.vx-pre .vx-count, &.vx-pre .vx-titles, &.vx-pre .vx-hint, &.vx-pre .vx-meter { opacity: 0; translate: 0 12px; }
  &.vx-ready .vx-count, &.vx-ready .vx-titles, &.vx-ready .vx-hint, &.vx-ready .vx-meter { opacity: 1; translate: 0; transition: opacity .9s var(--ease-out, ease-out) var(--dl, 0s), translate .9s var(--ease-out, ease-out) var(--dl, 0s); }
  &.vx-ready .vx-count { --dl: 1.5s; }
  &.vx-ready .vx-titles { --dl: 1.58s; }
  &.vx-ready .vx-hint { --dl: 1.9s; }
  &.vx-ready .vx-meter { --dl: 1.7s; }
  .vx-card { position: absolute; overflow: hidden; border-radius: 8px; background: var(--inset, #101216); box-shadow: var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); pointer-events: none; will-change: transform, opacity; }
  .vx-card img { position: absolute; max-inline-size: none; block-size: auto; }
  .vx-card.is-pick { pointer-events: auto; }
  .vx-meter { position: absolute; inset-inline-end: var(--vx-g); inset-block-end: clamp(22px, 4.5vh, 44px); display: grid; gap: var(--sp-2, 8px); justify-items: end; transition: opacity .3s var(--ease-out, ease-out); }
  &.is-open .vx-meter, &.is-index .vx-meter { opacity: 0; pointer-events: none; }
  .vx-ticks { display: flex; }
  .vx-mt { position: relative; inline-size: 14px; block-size: 30px; padding: 0; border: 0; background: none; color: var(--ink-faint, #6b7283); cursor: pointer; display: flex; align-items: flex-end; }
  .vx-mt i { display: block; inline-size: 2px; block-size: 12px; margin-inline: auto; background: currentColor; transform-origin: 50% 100%; opacity: .6; transition: transform var(--dur, 240ms) var(--ease-out, ease-out), opacity var(--dur, 240ms) var(--ease-out, ease-out), color var(--dur, 240ms) var(--ease-out, ease-out); }
  .vx-mt:hover i, .vx-mt:focus-visible i { transform: scaleY(1.45); opacity: 1; }
  .vx-mt[aria-current="true"] i { transform: scaleY(2.2); opacity: 1; color: var(--hue, #eef0f4); }
  .vx-mt:focus-visible { outline: 2px solid var(--hue, #eef0f4); outline-offset: -2px; }
  .vx-tip { position: absolute; inset-block-end: 100%; inset-inline-end: 0; padding: 6px 10px; background: var(--pane, #1b1e25); color: var(--ink, #eef0f4); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); white-space: nowrap; opacity: 0; translate: 0 4px; pointer-events: none; transition: opacity .2s var(--ease-out, ease-out), translate .2s var(--ease-out, ease-out); }
  .vx-mt:hover .vx-tip, .vx-mt:focus-visible .vx-tip { opacity: 1; translate: 0; }
  .vx-bar { display: block; inline-size: 196px; block-size: 1px; background: var(--edge-strong, rgb(255 255 255 / 0.18)); overflow: hidden; }
  .vx-bar i { display: block; inline-size: 100%; block-size: 100%; background: var(--ink, #eef0f4); transform-origin: 0 50%; transform: scaleX(0); }
  .vx-stats { display: grid; grid-template-columns: 1fr 1fr; border-block-start: 1px solid var(--edge, rgb(255 255 255 / 0.09)); padding-block-start: var(--sp-3, 12px); }
  .vx-stats div { display: grid; gap: 4px; }
  .vx-stats dt { order: 2; font-size: var(--fs-xs, 0.8125rem); color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); letter-spacing: .14em; text-transform: uppercase; }
  .vx-stats dd { font-size: clamp(40px, 4vw, 64px); font-weight: var(--weight-display, 640); letter-spacing: -.04em; line-height: 1; color: var(--hue, #eef0f4); font-variant-numeric: tabular-nums; }
  .vx-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  &[data-fwc-reduced] { & *, & *::before, & *::after { transition-duration: 1ms !important; transition-delay: 0s !important; animation-duration: 1ms !important; } .vx-dash::after { animation: none; } }
  @container (max-width: 760px) {
    .vx-titles { --vx-ts: clamp(38px, 11.5vw, 56px); block-size: calc(var(--vx-ts) * 2.2 + 56px); }
    .vx-t { white-space: normal; }
    .vx-m { margin-top: var(--sp-1, 4px); }
    .vx-cap { inset-inline-end: var(--vx-g); inline-size: auto; inset-block-end: 46px; }
    .vx-hint { display: none; }
    .vx-slot { inset-block: 72px auto; inset-inline: var(--vx-g); block-size: calc((100cqw - var(--vx-g) * 2) * .8); }
    .vx-panel { inset-block: calc(72px + (100cqw - var(--vx-g) * 2) * .8 + 18px) 0; inset-inline: var(--vx-g); inline-size: auto; justify-content: flex-start; }
    .vx-pt { font-size: 44px; }
    .vx-row { grid-template-columns: 28px 12px minmax(0, 1fr) minmax(0, 90px); }
    .vx-row .ty { display: none; }
    .vx-close { inset-block-start: 12px; }
    .vx-meter { inset-inline: var(--vx-g); inset-block-end: 22px; justify-items: stretch; }
    .vx-ticks { display: none; }
    .vx-bar { inline-size: 100%; }
  }
}
@keyframes fwc-tt-scan { from { translate: -20px; } to { translate: 48px; } }
`;

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
const CHL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.5 6l-6 6 6 6"/></svg>';
const CHR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad2 = (n) => String(n + 1).padStart(2, '0');

export function mount(root, props, ctx) {
  const p = props || {};
  const CAPS = p.captures && typeof p.captures === 'object' ? p.captures : {};
  const DATA = Array.isArray(p.shots) ? p.shots.filter((d) => d && d.face && CAPS[d.face.c]) : [];
  const N = DATA.length;
  if (!N) { ctx.ready(); return () => {}; }
  const kind = p.kind ?? 'Composition';
  const ofWord = p.ofWord ?? '/';
  const hintText = p.hint ?? 'Scroll to travel the tube';
  const openWord = p.openWord ?? 'Open';
  const groupLabel = p.groupLabel ?? 'Shots along a tube';
  const detailLabel = p.detailLabel ?? 'Detail';
  const indexLabel = p.indexLabel ?? 'Index';
  const closeLabel = p.closeLabel ?? 'Close';
  const prevLabel = p.prevLabel ?? 'Previous composition';
  const nextLabel = p.nextLabel ?? 'Next composition';
  const ctaText = p.ctaText ?? 'Every feature';
  const ctaHref = p.ctaHref ?? '#';
  const openVar = p.openVariable ?? 'tubeOpen';
  const indexVar = p.indexVariable ?? 'tubeIndex';
  const shareVar = p.shareVariable ?? 'tubeShare';
  const vars = globalThis.__formwebVariables;
  const setVar = (name, v) => { if (name && vars && typeof vars.set === 'function') { try { vars.set(name, v); } catch (e) { /* variable missing on this page */ } } };
  const motion = () => globalThis.__formwebMotion;
  const offs = [];
  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push(() => target.removeEventListener(type, fn, opts)); };

  const style = document.createElement('style');
  style.textContent = SHEET;
  root.appendChild(style);
  const stage = document.createElement('div');
  stage.className = 'fwc-tt';
  stage.tabIndex = 0;
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-roledescription', 'carousel');
  stage.setAttribute('aria-label', groupLabel);
  stage.setAttribute('data-fwc-theme', ctx.theme());
  if (ctx.reduced) stage.setAttribute('data-fwc-reduced', '');
  stage.innerHTML = '<div class="vx-world" aria-hidden="true"><div class="vx-scene"></div></div>'
    + '<div class="vx-cap"><p class="vx-count" aria-hidden="true"><span class="vx-digits"><span class="vx-strip"></span></span><span></span></p><div class="vx-titles"></div><p class="vx-hint"><span class="vx-dash"></span><span class="vx-hinttext"></span></p></div>'
    + '<div class="vx-meter"><div class="vx-ticks" role="group"></div><span class="vx-bar" aria-hidden="true"><i></i></span></div>'
    + '<div class="vx-pill" aria-hidden="true"><i></i><span></span><b></b></div>'
    + '<div class="vx-heldwrap" aria-hidden="true"></div>'
    + '<div class="vx-detail" role="dialog" aria-modal="true"><div class="vx-slot"><p class="vx-slothint"></p></div><div class="vx-panel"></div><button class="vx-ibtn vx-close" type="button">' + CLOSE + '</button></div>'
    + '<div class="vx-pop vx-index" role="dialog"><ol class="vx-ol"></ol></div>'
    + '<p class="vx-live vx-sr" aria-live="polite"></p><div class="vx-flat"></div>';
  root.appendChild(stage);
  const $ = (s) => stage.querySelector(s);
  const sceneEl = $('.vx-scene');
  const worldEl = $('.vx-world');
  const detail = $('.vx-detail');
  const slot = $('.vx-slot');
  const panel = $('.vx-panel');
  const heldWrap = $('.vx-heldwrap');
  const pill = $('.vx-pill');
  const live = $('.vx-live');
  const idxPop = $('.vx-index');
  $('.vx-count > span:last-child').textContent = ofWord + ' ' + N;
  $('.vx-hinttext').textContent = hintText;
  $('.vx-pill > span').textContent = openWord;
  $('.vx-ticks').setAttribute('aria-label', p.shotsLabel ?? 'Compositions');
  detail.setAttribute('aria-label', detailLabel);
  idxPop.setAttribute('aria-label', indexLabel);
  $('.vx-close').setAttribute('aria-label', closeLabel);

  // ---- picture helpers ----------------------------------------------------------
  const capUrl = (n, w) => ctx.asset(CAPS[n].u[w] || CAPS[n].u[1024]);
  const cropBox = (c, W, H) => {
    const ca = CAPS[c.c].w / CAPS[c.c].h;
    const iw = Math.max(W / c.w, H * ca);
    const ih = iw / ca;
    const l = Math.min(0, Math.max(W - iw, W / 2 - c.x * iw));
    const t = Math.min(0, Math.max(H - ih, H / 2 - c.y * ih));
    return { iw, ih, l, t };
  };
  const imgTag = (name, cls, W, H, c, size, alt) => {
    const b = cropBox(c, W, H);
    return '<img class="' + cls + '" src="' + esc(capUrl(name, size)) + '" width="' + CAPS[name].w + '" height="' + CAPS[name].h + '" alt="' + esc(alt) + '" decoding="async" draggable="false" data-iw="' + b.iw.toFixed(1) + '" data-il="' + b.l.toFixed(1) + '" data-it="' + b.t.toFixed(1) + '">';
  };
  const placeImgs = (el) => {
    el.querySelectorAll('img[data-iw]').forEach((im) => {
      im.style.setProperty('inline-size', im.dataset.iw + 'px');
      im.style.setProperty('inset-inline-start', im.dataset.il + 'px');
      im.style.setProperty('inset-block-start', im.dataset.it + 'px');
    });
  };
  const faceImgs = (c, W, H, size, alt) => {
    let h = imgTag(c.c, c.l ? 'shot-dark' : '', W, H, c, size, alt);
    if (c.l && CAPS[c.l]) h += imgTag(c.l, 'shot-light', W, H, c, size, alt);
    return h;
  };
  const rectIn = (el) => {
    const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  };
  const fitRect = (r, a, k = 0.94) => {
    let w = r.w * k, h = w / a;
    if (h > r.h * k) { h = r.h * k; w = h * a; }
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
  };

  // ---- configuration (the original's constants) -----------------------------------
  const CFG = {
    dispStart: -1.6, omega: 5, omegaRed: 60, vmax: 3.2, ptrRate: 3, pillLerp: 0.22, openDur: 0.95,
    pOf: (t) => t * (N - 1), tOf: (q) => q / (N - 1),
    active: (q) => Math.max(0, Math.min(N - 1, Math.round(q))),
    drag: (dx, dy) => -(2.2 * dy + 1.4 * dx)
  };
  const S = { disp: ctx.reduced ? 0 : CFG.dispStart, mid: ctx.reduced ? 0 : CFG.dispStart, vel: 0, time: 0, hover: -1, open: -1, held: [], ptr: { x: 0, y: 0, sx: 0, sy: 0 }, reduced: ctx.reduced, active: -2, locked: null, ready: false, index: false, dt: 0.016 };
  const E = {};
  const flat = !(window.CSS && CSS.supports('transform-style', 'preserve-3d'));
  if (flat) stage.classList.add('is-flat');

  // ---- scroll geometry through the enclosing scene --------------------------------------
  let trackEl = null, stickyEl = null;
  const geometry = () => {
    if (!trackEl || !trackEl.isConnected) {
      const m = motion();
      const key = m && m.sceneOf ? m.sceneOf(ctx.host) : null;
      trackEl = key ? document.querySelector('[data-fw-node="' + CSS.escape(key) + '"]') : null;
      stickyEl = null;
      for (let n = ctx.host; n && n !== trackEl; n = n.parentElement) { if (getComputedStyle(n).position === 'sticky') { stickyEl = n; break; } }
    }
    return trackEl;
  };
  const pOf = () => CFG.pOf(ctx.progress());
  const scrollP = (q, instant) => {
    const tr = geometry();
    if (!tr) return;
    const st = stickyEl || stage;
    const r = tr.getBoundingClientRect();
    const span = Math.max(1, r.height - st.offsetHeight);
    const top = parseFloat(getComputedStyle(st).top) || 0;
    const y = window.scrollY + r.top - top + CFG.tOf(q) * span;
    window.scrollTo({ top: Math.round(y), behavior: instant || S.reduced ? 'instant' : 'smooth' });
  };

  // ---- caption, ticks, index ------------------------------------------------------------
  const strip = $('.vx-strip');
  strip.innerHTML = DATA.map((d, i) => '<span>' + pad2(i) + '</span>').join('');
  $('.vx-titles').innerHTML = DATA.map((d, i) => '<div class="vx-ent" data-ent="' + i + '" aria-hidden="true"><p class="vx-t">' + esc(d.title) + '</p><p class="vx-m"><i class="vx-sw"></i>' + (d.meta || []).map((m) => '<span>' + esc(m) + '</span>').join('') + '</p></div>').join('');
  $('.vx-ticks').innerHTML = DATA.map((d, i) => '<button class="vx-mt" type="button" data-go="' + i + '" aria-label="' + esc(d.title) + '"><i></i><span class="vx-tip" role="tooltip">' + esc(d.title) + '</span></button>').join('');
  $('.vx-ol').innerHTML = DATA.map((d, i) => '<li><button class="vx-row" type="button" data-row="' + i + '" style="--k:' + i + '"><span class="n">' + pad2(i) + '</span><span class="d"></span><b>' + esc(d.title) + '</b><span class="ty">' + esc((d.meta || [])[0]) + '</span><span class="yr">' + esc((d.meta || [])[2]) + '</span></button></li>').join('');
  $('.vx-flat').innerHTML = DATA.map((d, i) => '<button type="button" data-flat="' + i + '"><span>' + esc(d.title) + '</span></button>').join('');
  const ents = [...stage.querySelectorAll('.vx-ent')];
  const ticks = [...stage.querySelectorAll('[data-go]')];
  const rows = [...stage.querySelectorAll('.vx-row')];
  const barFill = $('.vx-bar i');

  const setActive = (a) => {
    if (a === S.active) return;
    S.active = a;
    strip.style.transform = 'translateY(' + (-1.3 * Math.max(0, a)) + 'em)';
    $('.vx-count').style.opacity = a < 0 ? '0' : '';
    for (const e of ents) {
      const i = +e.dataset.ent;
      e.classList.toggle('is-now', i === a);
      e.classList.toggle('is-past', i < a);
      e.setAttribute('aria-hidden', String(i !== a));
    }
    for (const t of ticks) t.setAttribute('aria-current', String(+t.dataset.go === a));
    for (const r of rows) r.setAttribute('aria-current', String(+r.dataset.row === a));
    live.textContent = kind + ' ' + (a + 1) + ' ' + (p.ofLongWord ?? 'of') + ' ' + N + ': ' + DATA[a].title + ', ' + (DATA[a].meta || [])[0];
  };
  const stopIdx = (q) => {
    let b = 0;
    for (let i = 1; i < N; i++) if (Math.abs(i - q) < Math.abs(b - q)) b = i;
    return b;
  };
  const goStop = (i) => scrollP(clamp(i, 0, N - 1));

  // ---- the 3D scene (the original's SCENE) ------------------------------------------------
  const CW = 700, CH = CW / 1.6;
  const SPK = 0.5;
  let W = 1, H = 1, F = 900, D0 = 1000, SP = 500, RX = 300, RY = 120;
  const cards = DATA.map((d, i) => ({ i, el: null, img: null, hv: 0, on: true, op: 1, ang: 0.35 + i * 2.5133 }));
  const faceSrc = (d, light) => capUrl(light && d.face.l && CAPS[d.face.l] ? d.face.l : d.face.c, d.face.w < 0.6 ? 2400 : 1024);
  const isLight = () => ctx.theme() === 'light';
  cards.forEach((c) => {
    const d = DATA[c.i];
    const el = document.createElement('div');
    el.className = 'vx-card';
    el.dataset.i = c.i;
    el.style.cssText = 'inline-size:' + CW + 'px;block-size:' + CH + 'px;inset-inline-start:' + (-CW / 2) + 'px;inset-block-start:' + (-CH / 2) + 'px';
    el.innerHTML = imgTag(d.face.c, '', CW, CH, d.face, 1024, d.alt);
    placeImgs(el);
    sceneEl.appendChild(el);
    c.el = el;
    c.img = el.querySelector('img');
    c.img.src = faceSrc(d, isLight());
  });
  offs.push(ctx.onTheme((mode) => {
    stage.setAttribute('data-fwc-theme', mode);
    cards.forEach((c) => { c.img.src = faceSrc(DATA[c.i], mode === 'light'); });
  }));
  let roll = 0;
  const scene = {
    resize() {
      const r = stage.getBoundingClientRect();
      W = r.width; H = r.height;
      const mobile = W / H < 0.85;
      F = H / 2 / Math.tan(((mobile ? 64 : 60) * Math.PI) / 360);
      D0 = (2 * F * CW) / W;
      SP = D0 * SPK;
      const k = D0 / F;
      const sw = (F * CW) / D0 / 2;
      const sh = sw / 1.6;
      RX = Math.max(0, W / 2 - sw - 14) * k;
      RY = Math.max(0, H / 2 - sh - 96) * k;
      worldEl.style.perspective = F + 'px';
    },
    frame(dt) {
      const zc = S.disp * SP, red = S.reduced;
      const openAmt = Math.max(0, ...S.held.map((h) => h.a));
      if (!red) roll += 0.05 * dt * (1 - 0.7 * openAmt);
      for (const c of cards) {
        const held = S.held.some((h) => h.i === c.i);
        const Dist = D0 + c.i * SP - zc;
        const op = smooth(D0 - 0.34 * SP, D0 - 0.02 * SP, Dist) * (1 - smooth(D0 + 1.6 * SP, D0 + 3.6 * SP, Dist));
        c.op = op;
        if (op < 0.002 && !held) { if (c.on) { c.el.style.display = 'none'; c.on = false; } continue; }
        if (!c.on) { c.el.style.display = ''; c.on = true; }
        c.el.style.visibility = held ? 'hidden' : 'visible';
        c.hv += ((S.hover === c.i ? 1 : 0) - c.hv) * (1 - Math.exp(-9 * dt));
        if (c.hv < 0.002) c.hv = 0;
        const a = c.ang + roll;
        const dd = Math.max(Dist, 60) - c.hv * 0.08 * D0;
        c.el.style.transform = 'translate3d(' + (RX * Math.cos(a)).toFixed(2) + 'px,' + (RY * Math.sin(a)).toFixed(2) + 'px,' + (-dd).toFixed(2) + 'px)';
        c.el.style.opacity = (op * (1 - openAmt * 0.64)).toFixed(3);
        const pe = op > 0.35 && !held;
        if (pe !== c.pe) { c.pe = pe; c.el.classList.toggle('is-pick', pe); }
      }
      sceneEl.style.transform = 'translate3d(' + (W / 2) + 'px,' + (H / 2) + 'px,' + F + 'px)';
    },
    heldFor(i, holder) {
      const d = DATA[i];
      const r = fitRect(slotRect(), 1.6, 0.96);
      const Wf = Math.round(r.w), Hf = Math.round(Wf / 1.6);
      holder.style.width = Wf + 'px';
      holder.style.height = Hf + 'px';
      holder.innerHTML = '<div class="vx-face">' + faceImgs(d.face, Wf, Hf, 2400, d.alt) + '</div>';
      const faceEl = holder.firstElementChild;
      faceEl.style.setProperty('inline-size', Wf + 'px');
      faceEl.style.setProperty('block-size', Hf + 'px');
      faceEl.style.setProperty('border-radius', '8px');
      placeImgs(holder);
      const fly = cards[i].op > 0.25;
      return {
        update(a) {
          const e = smooth(0, 1, S.reduced ? 1 : a);
          const s1 = fitRect(slotRect(), 1.6, 0.96);
          let x = s1.x + s1.w / 2, y = s1.y + s1.h / 2, w = s1.w, o = 1;
          if (fly) {
            const s0 = rectIn(cards[i].el);
            x = lerp(s0.x + s0.w / 2, x, e); y = lerp(s0.y + s0.h / 2, y, e); w = lerp(s0.w, w, e);
            if (S.reduced) o = clamp(a * 2, 0, 1);
          } else {
            w = lerp(s1.w * 0.88, s1.w, e);
            o = clamp(a * 2.5, 0, 1);
          }
          holder.style.opacity = o;
          holder.style.transform = 'translate(' + (x - Wf / 2) + 'px,' + (y - Hf / 2) + 'px) scale(' + (w / Wf) + ')';
        }
      };
    }
  };
  const slotRect = () => {
    const s = stage.getBoundingClientRect(), r = slot.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  };

  // ---- pointer ------------------------------------------------------------------------------------
  const hit = (el) => { const n = el && el.closest ? el.closest('.vx-card[data-i]') : null; return n && stage.contains(n) ? +n.dataset.i : -1; };
  const hoverApply = (i) => {
    if (i === S.hover) return;
    S.hover = i;
    stage.classList.toggle('is-hover', i >= 0);
    pill.classList.toggle('is-on', i >= 0 && S.open < 0);
    if (i >= 0) pill.querySelector('b').textContent = DATA[i].title;
  };
  let drag = null;
  const pillPos = { x: -99, y: -99, tx: -99, ty: -99 };
  on(stage, 'pointerdown', (e) => {
    if (S.open >= 0 || e.target.closest('button,a,.vx-pop')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, type: e.pointerType };
    if (e.pointerType === 'mouse') stage.classList.add('is-press');
  });
  on(window, 'pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const r = stage.getBoundingClientRect();
      S.ptr.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      S.ptr.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      pillPos.tx = e.clientX - r.left + 18;
      pillPos.ty = e.clientY - r.top + 18;
      if (!drag && S.open < 0 && e.pointerType === 'mouse') {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        hoverApply(stage.contains(el) ? hit(el) : -1);
      }
    }
    if (drag && drag.type === 'mouse') {
      const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) { drag.moved = true; hoverApply(-1); }
      if (drag.moved) {
        drag.lx = e.clientX; drag.ly = e.clientY;
        window.scrollBy({ top: CFG.drag(dx, dy), behavior: 'instant' });
      }
    }
  });
  on(window, 'pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('is-press');
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const i = stage.contains(el) ? hit(el) : -1;
      if (i >= 0) openItem(i);
    }
  });
  on(window, 'pointercancel', () => { drag = null; stage.classList.remove('is-press'); });
  on(stage, 'pointerleave', () => hoverApply(-1));

  // ---- detail panel ---------------------------------------------------------------------------------------
  const panelHtml = (d, i, nx) => '<p class="vx-k vx-r"><i></i>' + esc(kind) + ' ' + (i + 1) + ' ' + esc(ofWord) + ' ' + N + '</p><h2 class="vx-pt vx-r">' + esc(d.title) + '</h2><p class="vx-pl vx-r">' + esc(d.line) + '</p><p class="vx-pp vx-r">' + esc(d.desc) + '</p>'
    + '<dl class="vx-stats vx-r">' + (d.stats || []).map((s) => '<div><dt>' + esc(s[1]) + '</dt><dd data-count="' + esc(s[0]) + '">' + esc(s[0]) + '</dd></div>').join('') + '</dl>'
    + '<dl class="vx-dl vx-r">' + (d.dl || []).map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>'
    + '<div class="vx-act vx-r"><a class="vx-btn" href="' + esc(ctaHref) + '"><span>' + esc(ctaText) + '</span>' + ARROW + '</a><div class="vx-pager"><button class="vx-ibtn" type="button" data-prev aria-label="' + esc(prevLabel) + '">' + CHL + '</button><button class="vx-ibtn" type="button" data-next aria-label="' + esc(nextLabel) + ': ' + esc(nx.title) + '">' + CHR + '</button></div></div>';
  const renderPanel = (i) => {
    const d = DATA[i];
    panel.classList.remove('is-in');
    panel.innerHTML = '<div>' + panelHtml(d, i, DATA[(i + 1) % N]) + '</div>';
    panel.querySelectorAll('.vx-r').forEach((el, k) => el.style.setProperty('--k', k));
    panel.scrollTop = 0;
    void panel.offsetWidth;
    requestAnimationFrame(() => panel.classList.add('is-in'));
    panel.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => stepOpen(-1)));
    const nb = panel.querySelector('[data-next]');
    if (nb) nb.addEventListener('click', () => stepOpen(1));
    panel.querySelectorAll('[data-count]').forEach((el) => {
      const m = /^(\D*)([\d.,]+)(.*)$/.exec(el.dataset.count);
      if (!m || S.reduced) { el.textContent = el.dataset.count; return; }
      const target = parseFloat(m[2].replace(/,/g, ''));
      const dec = (m[2].split('.')[1] || '').length;
      const t0 = performance.now() + 420;
      const run = (now) => {
        if (!el.isConnected) return;
        const t = clamp((now - t0) / 900, 0, 1);
        const v = target * (1 - Math.pow(1 - t, 3));
        el.textContent = m[1] + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
        if (t < 1) requestAnimationFrame(run);
      };
      el.textContent = m[1] + '0' + m[3];
      requestAnimationFrame(run);
    });
  };
  const makeHeld = (i) => {
    const h = { i, a: 0, target: 1, el: document.createElement('div'), obj: null };
    h.el.className = 'vx-held';
    heldWrap.appendChild(h.el);
    h.obj = scene.heldFor(i, h.el);
    S.held.push(h);
    return h;
  };
  function openItem(i) {
    if (i < 0 || i >= N) return;
    hoverApply(-1);
    S.open = i;
    closeIndex();
    setVar(shareVar, false);
    setVar(openVar, true);
    stage.classList.add('is-open');
    detail.classList.add('is-open');
    detail.inert = false;
    S.locked = i;
    scrollP(i, true);
    scene.frame(0.016);
    for (const h of S.held) if (h.i !== i) h.target = 0;
    const ex = S.held.find((h) => h.i === i);
    if (ex) ex.target = 1; else makeHeld(i);
    renderPanel(i);
    $('.vx-close').focus({ preventScroll: true });
  }
  function closeItem() {
    if (S.open < 0) return;
    S.open = -1;
    S.locked = null;
    setVar(openVar, false);
    stage.classList.remove('is-open');
    detail.classList.remove('is-open');
    detail.inert = true;
    for (const h of S.held) h.target = 0;
    stage.focus({ preventScroll: true });
  }
  function stepOpen(d) { if (S.open >= 0) openItem((S.open + d + N) % N); }
  detail.inert = true;
  on($('.vx-close'), 'click', closeItem);
  on(slot, 'click', closeItem);
  on(detail, 'click', (e) => { if (e.target === detail) closeItem(); });

  function openIndex() {
    setVar(shareVar, false);
    S.index = true;
    idxPop.classList.add('is-open');
    stage.classList.add('is-index');
    idxPop.inert = false;
  }
  function closeIndex() {
    if (!S.index) return;
    S.index = false;
    idxPop.classList.remove('is-open');
    stage.classList.remove('is-index');
    idxPop.inert = true;
    setVar(indexVar, false);
  }
  idxPop.inert = true;
  offs.push(ctx.onVariable(indexVar, (v) => { if (v && !S.index && S.open < 0) openIndex(); else if (!v && S.index) closeIndex(); else if (v && S.open >= 0) setVar(indexVar, false); }));
  offs.push(ctx.onVariable(shareVar, (v) => { if (v && S.index) closeIndex(); if (v && S.open >= 0) setVar(shareVar, false); }));
  rows.forEach((r) => {
    const i = +r.dataset.row;
    const prev = () => { if (S.open < 0) scrollP(i); };
    r.addEventListener('mouseenter', prev);
    r.addEventListener('focus', prev);
    r.addEventListener('click', () => openItem(i));
  });
  on(document, 'pointerdown', (e) => {
    if (!e.target.closest || e.target.closest('[data-vx-keep]')) return;
    if (vars && vars.get && vars.get(shareVar)) setVar(shareVar, false);
  });
  ticks.forEach((t) => t.addEventListener('click', () => scrollP(+t.dataset.go)));
  stage.querySelectorAll('[data-flat]').forEach((b) => b.addEventListener('click', () => openItem(+b.dataset.flat)));

  on(stage, 'keydown', (e) => {
    if (S.open >= 0) return;
    const k = e.key;
    const cur = stopIdx(pOf());
    let used = true;
    if (k === 'ArrowDown' || k === 'ArrowRight') goStop(cur + 1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') goStop(cur - 1);
    else if (k === 'PageDown') goStop(cur + 1);
    else if (k === 'PageUp') goStop(cur - 1);
    else if (k === 'Home') goStop(0);
    else if (k === 'End') goStop(N - 1);
    else if (k === 'Enter' || k === ' ') openItem(Math.max(0, S.active));
    else used = false;
    if (used) e.preventDefault();
  });
  on(window, 'keydown', (e) => {
    if (e.key === 'Escape') {
      if (S.open >= 0) closeItem();
      else if (S.index) closeIndex();
      else if (vars && vars.get && vars.get(shareVar)) setVar(shareVar, false);
      return;
    }
    if (S.open >= 0) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stepOpen(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stepOpen(-1); e.preventDefault(); }
      if ([' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && !(e.target.closest && e.target.closest('button,a'))) e.preventDefault();
    }
  });
  const lockWheel = (e) => {
    if (S.open < 0 && !S.index) return;
    if (e.target.closest && e.target.closest('.vx-panel,.vx-index > ol')) return;
    e.preventDefault();
  };
  on(window, 'wheel', lockWheel, { passive: false });
  on(window, 'touchmove', lockWheel, { passive: false });

  // ---- frame loop -------------------------------------------------------------------------------------------------
  let last = 0;
  offs.push(ctx.onFrame((now) => {
    if (!ctx.visible()) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    S.dt = dt;
    S.time += dt;
    S.reduced = ctx.reduced;
    const tgt = S.locked != null ? S.locked : pOf();
    const w = S.reduced ? CFG.omegaRed : CFG.omega;
    const lim = (S.reduced ? 1e3 : CFG.vmax) * dt;
    S.mid += clamp((tgt - S.mid) * (1 - Math.exp(-w * dt)), -lim, lim);
    const ex = Math.exp(-w * dt), dl = S.disp - S.mid, tm = (S.vel + w * dl) * dt;
    S.vel = (S.vel - w * tm) * ex;
    S.disp = S.mid + (dl + tm) * ex;
    const ps = S.reduced ? 0 : 1 - Math.exp(-CFG.ptrRate * dt);
    S.ptr.sx += (S.ptr.x - S.ptr.sx) * ps;
    S.ptr.sy += (S.ptr.y - S.ptr.sy) * ps;
    setActive(CFG.active(S.disp));
    if (S.disp > 0.05) stage.classList.add('is-gone');
    const pl = S.reduced ? 1 : CFG.pillLerp;
    pillPos.x += (pillPos.tx - pillPos.x) * pl;
    pillPos.y += (pillPos.ty - pillPos.y) * pl;
    pill.style.translate = pillPos.x + 'px ' + pillPos.y + 'px';
    for (const h of S.held) {
      const dur = S.reduced ? 0.2 : CFG.openDur;
      h.a = clamp(h.a + Math.sign(h.target - h.a) * dt / dur, 0, 1);
      if (h.target === 0 && h.a === 0) h.dead = true;
    }
    scene.frame(dt);
    for (const h of S.held) h.obj.update(h.a);
    for (const h of S.held) if (h.dead) h.el.remove();
    S.held = S.held.filter((h) => !h.dead);
    barFill.style.transform = 'scaleX(' + clamp(S.disp / (N - 1), 0, 1).toFixed(4) + ')';
  }));
  offs.push(ctx.onResize(() => scene.resize()));

  scene.resize();
  if (!flat) scene.frame(0.016);
  stage.classList.add('vx-pre');
  const imgs = [...stage.querySelectorAll('img')];
  const waits = imgs.slice(0, 24).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  let dead = false;
  Promise.race([Promise.all([...waits, fonts]), new Promise((r) => setTimeout(r, 1200))]).then(() => {
    if (dead) return;
    S.ready = true;
    stage.classList.remove('vx-pre');
    stage.classList.add('vx-ready');
    ctx.ready();
  });

  return () => {
    dead = true;
    for (const off of offs) { try { off(); } catch (e) { /* already removed */ } }
    for (const off of listeners) off();
    root.replaceChildren();
  };
}
