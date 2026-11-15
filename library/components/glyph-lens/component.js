// glyph-lens: a capture read back as text on a WebGL canvas, with a lens that opens the shaded view.
// Ported from formai-xmental-webspun v3.1.0 assets/sections/formsculpt-viewport. The host must be a direct child of the
// pinned stage node (the stage takes focus, keys and pointer input); progress comes from the stage's native scene.
export function mount(root, props, ctx) {
  const P = (k, d) => (props && props[k] != null && props[k] !== '' ? props[k] : d);
  const RM = !!ctx.reduced;
  const stage = ctx.host.closest('[data-glyph-stage]') || ctx.host.parentElement || ctx.host;
  const track = stage.parentElement || stage;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const phone = () => matchMedia('(max-width: 699px)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const app = '<span class="fwc-gl-form">' + esc(P('nameForm', 'Form')) + '</span><span class="fwc-gl-suffix">' + esc(P('nameSuffix', 'Sculpt')) + '</span>';
  const withApp = (s) => esc(s).replace('{app}', app);
  const sets = Array.isArray(props && props.sets) && props.sets.length === 3 ? props.sets.map(String) : ['Mesh', 'Voxel', 'Matcap'];

  const style = document.createElement('style');
  style.textContent = `
.fwc-glyph-lens { position: absolute; inset: 0; container-type: size; overflow: hidden; background: var(--ground); color: var(--ink); user-select: none; -webkit-user-select: none; }
.fwc-glyph-lens .fwc-gl-true { --fs-w: max(100cqw, 156.25cqh); position: absolute; inline-size: var(--fs-w); block-size: calc(var(--fs-w) / 1.5625); inset-inline-start: calc(50% - var(--fs-w) / 2); inset-block-start: calc(50% - var(--fs-w) / 3.125); max-inline-size: none; transform-origin: 44% 50%; will-change: transform; opacity: 0; pointer-events: none; }
.fwc-glyph-lens[data-ready] .fwc-gl-true, .fwc-glyph-lens[data-mode="off"] .fwc-gl-true { opacity: 1; }
.fwc-glyph-lens .fwc-gl-true[hidden] { display: none; }
.fwc-glyph-lens .fwc-gl-canvas { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; z-index: var(--z-raised, 100); opacity: 0; transition: opacity 1.4s var(--ease-out, ease-out); }
.fwc-glyph-lens .fwc-gl-canvas.on { opacity: 1; }
.fwc-glyph-lens .fwc-gl-probe { position: absolute; inline-size: 0; block-size: 0; overflow: hidden; visibility: hidden; transition: none !important; }
.fwc-glyph-lens .fwc-gl-loading { position: absolute; inset: 0; z-index: var(--z-raised, 100); display: grid; place-items: center; pointer-events: none; font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
.fwc-glyph-lens .fwc-gl-loading[hidden] { display: none; }
.fwc-glyph-lens .fwc-gl-form { color: var(--ink); }
.fwc-glyph-lens .fwc-gl-suffix { color: var(--hue); }
.fwc-glyph-lens .fwc-gl-hud { position: absolute; inset-inline: 0; inset-block-start: 0; z-index: var(--z-raised, 100); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--sp-4, 16px); padding: var(--sp-3, 12px) var(--fs-edge, clamp(16px, 2.4vw, 32px)); border-block-end: 1px solid var(--edge); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); pointer-events: none; }
.fwc-glyph-lens .fwc-gl-hud > * { opacity: 0; transform: translateY(-8px); transition: opacity 1s var(--ease-out, ease-out), transform 1s var(--ease-out, ease-out); transition-delay: calc(var(--d) * 1s); }
.fwc-glyph-lens.fwc-gl-in .fwc-gl-hud > * { opacity: 1; transform: none; }
.fwc-glyph-lens .fwc-gl-hud-name { color: var(--ink); font-weight: var(--weight-strong, 560); }
.fwc-glyph-lens .fwc-gl-hud-issue { text-align: center; }
.fwc-glyph-lens .fwc-gl-hud-issue b { font-weight: var(--weight-body, 420); color: var(--hue); }
.fwc-glyph-lens .fwc-gl-hud-state { justify-self: end; display: inline-flex; align-items: center; gap: var(--sp-2, 8px); }
.fwc-glyph-lens .fwc-gl-read { display: inline-block; min-inline-size: 12ch; text-align: end; }
.fwc-glyph-lens .fwc-gl-dot { inline-size: 8px; block-size: 8px; background: var(--hue); animation: fwc-gl-blink 1.6s steps(2, jump-none) infinite; }
@keyframes fwc-gl-blink { 50% { opacity: 0.25; } }
.fwc-glyph-lens .fwc-gl-log { position: absolute; inset-block-start: calc(var(--sp-9, 96px) - var(--sp-2, 8px)); inset-inline-start: var(--fs-edge, clamp(16px, 2.4vw, 32px)); z-index: var(--z-raised, 100); margin: 0; padding: 0; list-style: none; font-family: var(--font-mono, monospace); font-size: 0.6875rem; line-height: 1.5; color: var(--ink-faint); pointer-events: none; block-size: calc(14 * 1.5em); inline-size: 34ch; overflow: hidden; white-space: pre; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 60%); mask-image: linear-gradient(to bottom, transparent, #000 60%); }
.fwc-glyph-lens .fwc-gl-log li { block-size: 1.5em; }
.fwc-glyph-lens .fwc-gl-log li:last-child { color: var(--ink-soft); }
.fwc-glyph-lens .fwc-gl-fx { position: absolute; z-index: var(--z-raised, 100); pointer-events: none; will-change: opacity, transform; }
.fwc-glyph-lens .fwc-gl-aside-w { inset-inline-end: var(--fs-edge, clamp(16px, 2.4vw, 32px)); inset-block-end: clamp(88px, 9vw, 120px); inline-size: min(290px, 40vw); }
.fwc-glyph-lens .fwc-gl-aside-w p, .fwc-glyph-lens .fwc-gl-hint-w > *, .fwc-glyph-lens .fwc-gl-dock-w > * { opacity: 0; transition: opacity 1.2s var(--ease-out, ease-out); transition-delay: calc(var(--d) * 1s); }
.fwc-glyph-lens.fwc-gl-in .fwc-gl-aside-w p, .fwc-glyph-lens.fwc-gl-in .fwc-gl-hint-w > *, .fwc-glyph-lens.fwc-gl-in .fwc-gl-dock-w > * { opacity: 1; }
.fwc-glyph-lens .fwc-gl-aside-w p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-soft); display: none; }
.fwc-glyph-lens[data-mode="pointer"] .fwc-gl-m-pointer, .fwc-glyph-lens[data-mode="touch"] .fwc-gl-m-touch, .fwc-glyph-lens[data-mode="off"] .fwc-gl-m-off { display: block; }
.fwc-glyph-lens .fwc-gl-hint-w { inset-inline: 0; inset-block-start: calc(50% + min(34vh, 320px)); display: flex; justify-content: center; }
.fwc-glyph-lens .fwc-gl-hint { display: inline-flex; flex-direction: column; align-items: center; gap: var(--sp-1, 4px); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft); animation: fwc-gl-bob 2.2s var(--ease-out, ease-out) infinite alternate; }
.fwc-glyph-lens .fwc-gl-hint svg { inline-size: var(--icon-s, 16px); block-size: var(--icon-s, 16px); }
@keyframes fwc-gl-bob { to { transform: translateY(6px); } }
.fwc-glyph-lens .fwc-gl-dock-w { inset-inline-end: var(--fs-edge, clamp(16px, 2.4vw, 32px)); inset-block-end: var(--fs-bot, clamp(24px, 4vw, 56px)); pointer-events: auto; }
.fwc-glyph-lens .fwc-gl-dock { display: inline-flex; background: var(--pane); box-shadow: inset 0 0 0 1px var(--edge-strong); cursor: default; }
.fwc-glyph-lens .fwc-gl-dock button { block-size: var(--control-h, 40px); padding-inline: var(--sp-4, 16px); border: 0; border-radius: 0; background: transparent; color: var(--ink-soft); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease-out), color var(--dur-fast, 140ms) var(--ease-out, ease-out); }
.fwc-glyph-lens .fwc-gl-dock button + button { box-shadow: inset 1px 0 0 var(--edge); }
.fwc-glyph-lens .fwc-gl-dock button:hover { background: var(--control); color: var(--ink); }
.fwc-glyph-lens .fwc-gl-dock button[aria-checked="true"] { background: var(--hue-wash, color-mix(in srgb, var(--hue) 14%, transparent)); color: var(--hue); box-shadow: inset 0 0 0 1px var(--hue-line, color-mix(in srgb, var(--hue) 42%, transparent)); }
.fwc-glyph-lens .fwc-gl-dock button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.fwc-glyph-lens[data-mode="off"] .fwc-gl-dock-w { display: none; }
.fwc-glyph-lens .fwc-gl-close { position: absolute; inset: 0; z-index: var(--z-field, 150); display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; gap: var(--sp-3, 12px); padding: var(--fs-edge, clamp(16px, 2.4vw, 32px)) var(--fs-edge, clamp(16px, 2.4vw, 32px)) var(--fs-bot, clamp(24px, 4vw, 56px)); background: linear-gradient(to top, var(--ground) 0%, color-mix(in srgb, var(--ground) 72%, transparent) 40%, transparent 80%); opacity: 0; pointer-events: none; will-change: opacity, transform; }
.fwc-glyph-lens .fwc-gl-close.fwc-gl-live { pointer-events: auto; cursor: default; }
.fwc-glyph-lens .fwc-gl-meta { display: block; margin: var(--sp-1, 4px) 0 0; color: var(--ink-faint); font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-glyph-lens .fwc-gl-close h2 { margin: 0; font-size: clamp(72px, 15vw, 260px); font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); line-height: 0.82; color: var(--ink); }
.fwc-glyph-lens .fwc-gl-body { margin: 0; font-size: var(--fs-l, 1.125rem); color: var(--ink-soft); max-inline-size: var(--prose-max, 62ch); }
.fwc-glyph-lens .fwc-gl-actions { display: flex; flex-wrap: wrap; gap: var(--sp-3, 12px); margin: var(--sp-3, 12px) 0 0; }
.fwc-glyph-lens .fwc-gl-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2, 8px); block-size: 48px; padding-inline: var(--sp-5, 24px); border: 0; border-radius: 0; font-family: var(--font-mono, monospace); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; white-space: nowrap; cursor: pointer; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease-out), opacity var(--dur-fast, 140ms) var(--ease-out, ease-out); }
.fwc-glyph-lens .fwc-gl-btn svg { inline-size: var(--icon-s, 16px); block-size: var(--icon-s, 16px); }
.fwc-glyph-lens .fwc-gl-btn-ink { background: var(--ink); color: var(--on-ink); }
.fwc-glyph-lens .fwc-gl-btn-ink:hover { opacity: 0.88; }
.fwc-glyph-lens .fwc-gl-btn-quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong); color: var(--ink); }
.fwc-glyph-lens .fwc-gl-btn-quiet:hover { background: var(--control); }
.fwc-glyph-lens .fwc-gl-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.fwc-glyph-lens.fwc-gl-static .fwc-gl-hint-w { display: none; }
.fwc-glyph-lens.fwc-gl-tail { position: relative; inset: auto; container-type: normal; display: flex; flex-direction: column; isolation: isolate; user-select: text; -webkit-user-select: text; }
.fwc-glyph-lens.fwc-gl-tail .fwc-gl-tail-pic { position: absolute; inset: 0; container-type: size; overflow: hidden; }
.fwc-glyph-lens.fwc-gl-tail .fwc-gl-close { position: relative; inset: auto; flex: 1 1 auto; opacity: 1; pointer-events: auto; will-change: auto; cursor: auto; }
@media (max-width: 699px) {
  .fwc-glyph-lens .fwc-gl-hud { grid-template-columns: 1fr auto; padding-block: var(--sp-3, 12px); }
  .fwc-glyph-lens .fwc-gl-hud-issue { display: none; }
  .fwc-glyph-lens .fwc-gl-log { inset-block-start: 64px; font-size: 0.5625rem; max-block-size: 30vh; }
  .fwc-glyph-lens .fwc-gl-aside-w { inset-inline: 16px; inline-size: auto; inset-block-end: 72px; }
  .fwc-glyph-lens .fwc-gl-aside-w p { font-size: 12px; }
  .fwc-glyph-lens .fwc-gl-dock-w { inset-inline-start: 16px; inset-inline-end: auto; inset-block-end: 20px; }
  .fwc-glyph-lens .fwc-gl-dock button { padding-inline: var(--sp-3, 12px); block-size: var(--control-h-compact, 32px); }
  .fwc-glyph-lens .fwc-gl-hint-w { display: none; }
  .fwc-glyph-lens[data-mode="pointer"] .fwc-gl-m-pointer { display: none; }
  .fwc-glyph-lens[data-mode="pointer"] .fwc-gl-m-touch { display: block; }
  .fwc-glyph-lens .fwc-gl-close { padding-block-end: 20px; }
  .fwc-glyph-lens .fwc-gl-close h2 { font-size: clamp(64px, 20vw, 120px); }
}
@media (prefers-reduced-motion: reduce) {
  .fwc-glyph-lens .fwc-gl-dot, .fwc-glyph-lens .fwc-gl-hint { animation: none; }
  .fwc-glyph-lens .fwc-gl-hud > *, .fwc-glyph-lens .fwc-gl-aside-w p, .fwc-glyph-lens .fwc-gl-hint-w > *, .fwc-glyph-lens .fwc-gl-dock-w > *, .fwc-glyph-lens .fwc-gl-canvas { transition: none; }
}
`;

  const wrap = document.createElement('div');
  wrap.className = 'fwc-glyph-lens';
  wrap.dataset.mode = coarse ? 'touch' : 'pointer';
  const darkSrc = P('darkSrc', 'https://media.formai.studio/media/formsculpt/ui-hero-2/505967102e8a.w2400.webp');
  const lightSrc = P('lightSrc', 'https://media.formai.studio/media/formsculpt/ui-hero-light-2/e31b9005c8c0.w2400.webp');
  const small = (u) => (/\.w2400\.webp$/.test(u) ? u.replace(/\.w2400\.webp$/, '.w1024.webp') + ' 1024w, ' + u + ' 2400w' : '');
  const picture = (cls, src, alt) => '<img class="fwc-gl-true ' + cls + '" src="' + esc(ctx.asset(src)) + '"' + (small(src) ? ' srcset="' + esc(small(src)) + '" sizes="100vw"' : '') + ' width="2400" height="1500" alt="' + esc(alt) + '" decoding="async">';
  wrap.innerHTML =
    picture('fwc-gl-dark', darkSrc, P('darkAlt', 'The FormSculpt window with a sculpted head on the viewport, the brush palette on the right and the objects panel on the left')) +
    picture('fwc-gl-light', lightSrc, P('lightAlt', 'The FormSculpt window in its light theme with a sculpted head on the viewport, the brush palette on the right and the objects panel on the left')) +
    '<canvas class="fwc-gl-canvas" aria-hidden="true"></canvas>' +
    '<span class="fwc-gl-probe" aria-hidden="true"></span>' +
    '<div class="fwc-gl-loading">' + esc(P('loadingLabel', 'Loading capture')) + '</div>' +
    '<div class="fwc-gl-hud"><span class="fwc-gl-hud-name" style="--d:0">' + app + '</span>' +
    '<span class="fwc-gl-hud-issue" style="--d:0.08">' + esc(P('issueLabel', 'Viewport')) + ' <b>' + esc(P('issueNumber', '04')) + '</b></span>' +
    '<span class="fwc-gl-hud-state" style="--d:0.16"><i class="fwc-gl-dot"></i>' + esc(P('liveLabel', 'Live')) + ' <span class="fwc-gl-read">20px 60fps</span></span></div>' +
    '<ol class="fwc-gl-log" aria-hidden="true">' + '<li></li>'.repeat(14) + '</ol>' +
    '<div class="fwc-gl-fx fwc-gl-aside-w">' +
    '<p class="fwc-gl-m-pointer" style="--d:0.7">' + withApp(P('asidePointer', '{app} viewport, read back as text. Scroll to tune it in. Move to open the shaded view, drag to rotate the model, click for a ripple.')) + '</p>' +
    '<p class="fwc-gl-m-touch" style="--d:0.7">' + withApp(P('asideTouch', '{app} viewport, read back as text. Scroll to tune it in. Hold to open the shaded view, drag to rotate the model, tap for a ripple.')) + '</p>' +
    '<p class="fwc-gl-m-off" style="--d:0.7">' + withApp(P('asideOff', 'The viewport is off air. This browser has no WebGL, so the capture cannot be read as text. Scroll on for the end.')) + '</p></div>' +
    '<div class="fwc-gl-fx fwc-gl-hint-w"><span class="fwc-gl-hint" style="--d:0.86">' + esc(P('hintLabel', 'Scroll to tune')) +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg></span></div>' +
    '<div class="fwc-gl-fx fwc-gl-dock-w"><div class="fwc-gl-dock" role="radiogroup" aria-label="' + esc(P('dockLabel', 'Glyph set')) + '" style="--d:0.78">' +
    sets.map((n, i) => '<button type="button" role="radio" aria-checked="' + (i === 0) + '"' + (i === 0 ? '' : ' tabindex="-1"') + '>' + esc(n) + '</button>').join('') + '</div></div>' +
    '<div class="fwc-gl-close" inert><p class="fwc-gl-meta">' + esc(P('closeMeta', 'Shaded view')) + ' <span class="fwc-gl-pct">0</span>%</p>' +
    '<h2>' + esc(P('closeTitle', 'Shaded')) + '</h2><p class="fwc-gl-body">' + esc(P('closeBody', 'Hand the shaded mesh on through GoF.')) + '</p>' +
    '<p class="fwc-gl-actions"><a class="fwc-gl-btn fwc-gl-btn-ink" href="' + esc(P('ctaHref', 'https://formai.studio/formsculpt/')) + '"><span>' + esc(P('ctaLabel', 'About the app')) + '</span></a>' +
    '<button class="fwc-gl-btn fwc-gl-btn-quiet fwc-gl-replay" type="button"><span>' + esc(P('replayLabel', 'Replay sculpt')) + '</span>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></button></p></div>';
  root.append(style, wrap);

  const $ = (s) => wrap.querySelector(s);
  const canvas = $('.fwc-gl-canvas'), probe = $('.fwc-gl-probe'), loadingEl = $('.fwc-gl-loading');
  const trues = [...wrap.querySelectorAll('.fwc-gl-true')];
  const els = { asw: $('.fwc-gl-aside-w'), hintw: $('.fwc-gl-hint-w'), dockw: $('.fwc-gl-dock-w'), log: $('.fwc-gl-log'), close: $('.fwc-gl-close'), dock: $('.fwc-gl-dock') };
  const pctEl = $('.fwc-gl-pct'), readEl = $('.fwc-gl-read');
  let tail = null, tailTrues = [];
  const showTheme = () => {
    const light = ctx.theme() === 'light';
    trues[0].hidden = light; trues[1].hidden = !light;
    if (tailTrues.length) { tailTrues[0].hidden = light; tailTrues[1].hidden = !light; }
  };
  showTheme();
  const offTheme = ctx.onTheme(() => { showTheme(); readColors(); });

  if (RM) wrap.classList.add('fwc-gl-in');
  const inTimer = RM ? 0 : setTimeout(() => wrap.classList.add('fwc-gl-in'), 300);

  const SIG_W = 200, SIG_H = 128, IMG_AR = 1.5625, ORG_X = 0.44, ORG_Y = 0.5;
  const SIG = [
    'AAADAwADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwADAwMDAwADAwMAPUpJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlIJwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABxISUlJSUlJSUlJSUlJSUpQUFBQUE5JSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJSUlJS1FRUVFRTkpRUVBQUE0+AwBJSUhISEhISEhIRUhISEhISEVISEhISEhISEhISEhISEtISEhISEhISEhISEhIRkhJSUlJSUlJSUkzAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK0lJSUtGSEhISEhJSEhIVV1cXV1cXElISEhISEhISEhKRkhISEhGSUlISEhISEhGSEhSXFxdXFxdVl1dXF1dXUoGA0pISHdyWkhISEiOiFdGRkZFfIRQSEhISG+pZkhISEhlhlZISEhIcXxmSUlJSXGHYUlJSUlTVU1ISTQDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqSEhQh2JISEhISJlZSEhWXV2dc11cSUhJcF1ISEhITWVVSUhISFZcYUhISEhXdGFISFRcfpKNXF1WXHidnl5eSQYDSkhIdF5vRkhISGh8RkZGRkaEnWxJSEhIgbV0SEhISHiGY0hISEh5hG1JSUlJeHdpSElJSWJtV0hJNAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACpISFyKd0lISEhTuoNISFZdaa6VXVxJSFJqcUhISEheWmdISEhIWVxiSEhISFZ1e0lJVV6AgIVcXVZddZCSXl5JBgNKSEhQVklGSEhIS05ISEZGRk1MSEZGSEZJWkhISEhISVNISUlJSUlISUhISElIWUhJSUlJSEhISEk0AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKkhIRlJISEhISEhOSUZIVltdW1teXUpISElISUhISEhNSklISEhITUlISEhISEhOSElVXmF0bV1fV1xgbGxcXUkGA0pISGNuUEZISGFjaGxJSVtlZ2pnaUlIS25uaEZISE1lbmVGSElLbmdnSEhIZ2poYlpISEp5aGJGSTQGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqSEhaZWtISEhIeGhiVUhXkYWRhY1oSkhrZWlZSEhNU1VVUkhIRlJVVkpISFRtZmJmSlVwgomHhl5WhpGBipJfSgYDSkhISUpISEhIS0pKS0lJSkpNS01USElISktJRkhISEtSSkhISUhKSklJSUhKSkxJTEZISEpKSUhINAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACpISElKS0ZISEhKSUpJSVVgaV9gZlxKSUtKSUlISElJSEhISEhISkpJSEhISEtJS0lJVV9hZ2FgXVRfX15gX1xKBgM6RkZISEhISEhISEhISEhISEZISElJSUZGSEZGRkZGRkhISEhISEhISEhISEZGSEhG',
    'RkZGRkZGRkUnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHEZISUlJSEhISEhISElJSk5OTk5OTUlJSUhGRkZGSEZGRkZGRkVGSEhGRkZGSEZIRkZITExMTE1LSU5LTExLSzoGAAMGCAgICAgICAYICAYIBgYICAYICAYGAwMGAwMDAwMDBgYGBgYGBgMGBgMGAwMGBgMDAwMDAwMDAwMDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMDBgYDAwMDAwMDBgYDBgYGBggMIz5QLggGBggfHx8fHx8fHx8fHx8fHx8gHx8fHx8fHx8fHx8fHx8fHx8dEgMDOGhRbFpZVm1NWxlpW2Zfa1pJbnIIAwMAAAAAAwMAAAAAAwAAAAAAAAAAAAMAAAMDAAMAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAwMDAzB3jqKorKyjhkkKLklJSUpRRklJSEhISU5OSUlISElJSVRKSEhISEhIS1BJSEZEAwMKHxYgIx8cHRkXBhYdHT8gIBEcHQYDAwAAAAADAAAAAAADAwMAAAAAAwMAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEV9GAwMvJkwDSHuapaampKShmmgySUlXtr6RTElISEh3wrVwSUlJSUqv07JXSEhISF+6uYFJSEgGABQSPS4zJisvLCQzJCQgKyw8Cj05RBkDAAAAAwMAAAAAAAAAAwAAAAADAwAAAAMDAAAAAAMDAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvmWoAAywU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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjf/f368Pz//v///////P7///////7s8Pv5+fPr6ujg29XLwsC+s6mdm5qyopYoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMwSEhKTFdISUlISEhLWlVFRkhJSUhSX1NFSEhISUtVX0lISEgDA0hISElgSUlICElISEhISEhISEhISEhISEhISEhISEhISEhISEhISEkGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu3/3+/f7///z//////vz////////+/vv5+fb7+Pfr493V0ce9t7etoZmWlZWUliQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzBISGV7fYZJSUhISFVyflxGSElJSZqAjlRISEhJYHh/cElJRgMDSFFtZ2NxUUYGSUhISEhISEhISEhISEhISEhISEhISEhISEhISEhISQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEdr7/Pz////9//////31/P/++/z///7+/Pr49fr8+fjv3dbW0sW/ta6km5eTlpeXGgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMEhISEVNSElJSEhISElISEhISUlJRkhGRkhGS1BQUk5NTk5JBgNIUGZlamBSRQZJSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhJBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/7/b8///9///////78Pr//Pby+P///f358vb29P37+fn1383czsnIyb2vrbKpwo8GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMwSEhJf5ZqSkhISEhVoqBZSEhJSUluoIJJSEmFhoeeoYyGhlsD',
    'A0hIRkhISEhIBklISEhISEhISEhISEhISEhISEhISEhISEhISEhISEkGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKjg6vb9/f//////9eD2//z16uv8//79/PTh8vXk+/v5+ffv1MvHxcPDwbq0uMjceQMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzBISHzc3LVaSUhISMb17L9JSElJXuLry3ZIS4eGn8zEnIaGXgYGSEhIaWpISUkISUhISEhISEhISEhISEhISEhISEhISEhISEhISEhISQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAttvl6vX29PX18OLB9P/8+e3m9f7//fv46uD1+Nzz9vf38uvdt8bJycjIyMa/0NV7AwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMEhIkdvks2dJSEhI3/Lkzk5ISUl43fHUhkhKh4ai3veYhYZcAwNISEhmbklJSQhJSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhJAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADD3uHl6unn4uLTqeP//fzuy53l9vbz8fDq5fb76fT29vTs6d64s8vMy8vLzsjU0IQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMwSEhosbmYUklISEiq3dCmSEhJSVO4xbNmSEqIhoufm4iFhlwDA0hISF5eSUlJCElISEhISEhISEhISEhISEhISEhISEhISEhISEhISEkGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGdTh297e3OPjzqXR///45LuTqtXy8vHw7unn+Pz05/n59PHv5smpws3Ozc3T0MvEawAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzBIRUlbbFFISUhISEp4d0xJSUlJSVNxYElJTImGhoOCgoeHXQYDSEhvg3NqSEkISUhISEhISEhISEhISEhISEhISEhISEhISEhISEhISQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABy3Nza19fV19WiqPj89ua7mczkyvHw8O7t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'
  ].join('');

  const pcv = document.createElement('canvas');
  pcv.width = pcv.height = 1;
  const pcx = pcv.getContext('2d', { willReadFrequently: true });
  const rgb = (name) => {
    probe.style.color = 'var(' + name + ')';
    pcx.clearRect(0, 0, 1, 1);
    pcx.fillStyle = '#000';
    pcx.fillStyle = getComputedStyle(probe).color;
    pcx.fillRect(0, 0, 1, 1);
    const d = pcx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };

  const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const GLYPH = `#version 300 es
precision highp float;
uniform sampler2D uSig, uAtlas;
uniform vec2 uRes, uCell, uStage, uImg, uO, uT, uPtr, uPulse, uLens;
uniform float uK, uS, uN, uStep, uFlick, uGlow, uGlowR, uRing, uRingW, uStrength, uLensR, uSplit, uTime, uMode, uFlutter;
uniform vec3 uBg, uInk, uAcc, uInset;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sig(vec2 p){
  vec2 e = p - (uStage - uImg) * 0.5;
  vec2 uv = (uO + (e - uO - uT) / uS) / uImg;
  uv += uFlutter * 0.006 * vec2(sin(uTime * 26.0 + p.y * 0.05), cos(uTime * 23.0 + p.x * 0.05));
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture(uSig, uv).r * inside;
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(fc / uCell);
  vec2 cc = (cell + 0.5) * uCell;
  vec2 loc = fract(fc / uCell);
  vec2 sq = uCell * 0.28;
  float b = sig(cc / uK);
  b += sig((cc + vec2(sq.x, sq.y)) / uK);
  b += sig((cc + vec2(-sq.x, sq.y)) / uK);
  b += sig((cc + vec2(sq.x, -sq.y)) / uK);
  b += sig((cc + vec2(-sq.x, -sq.y)) / uK);
  b = pow(clamp(b / 5.0, 0.0, 1.0), 0.8);
  b += (hash(cell * 1.7) - 0.5) * 0.05;
  b = clamp(b, 0.0, 1.0);
  vec2 css = fc / uK;
  vec2 ccs = cc / uK;
  float dp = length(ccs - uPulse);
  float ring = uStrength * (1.0 - smoothstep(0.0, uRingW, abs(dp - uRing)));
  float chance = 0.06 * (0.3 + b) * uFlick;
  float rnd = hash(cell + uStep * 17.31);
  float idx = floor(clamp(b, 0.0, 0.999) * uN);
  if (rnd < chance || (ring > 0.05 && hash(cell + uStep * 3.7) < ring)) {
    idx = floor(hash(cell * 2.3 + uStep) * uN);
    if (b < 0.04) idx = min(idx, 3.0);
  }
  float cov = textureLod(uAtlas, vec2((idx + loc.x) / uN, loc.y), 0.0).r;
  float near = uGlow * (1.0 - smoothstep(0.0, uGlowR, length(ccs - uPtr)));
  float heat = clamp(ring + near * 0.8, 0.0, 1.0);
  vec3 gcol = mix(uInk, uAcc, clamp(0.12 + heat * 0.9, 0.0, 1.0));
  float al = cov * (0.22 + 0.78 * clamp(b * 1.35 + near * 0.4 + ring * 0.5, 0.0, 1.0));
  if (b < 0.05) al *= 0.5;
  vec3 col = mix(uBg, gcol, clamp(al, 0.0, 1.0));
  vec2 vv = fc / uRes - 0.5;
  col = mix(col, uInset, smoothstep(0.35, 0.95, length(vv * vec2(1.0, 1.1))) * 0.5);
  vec2 lp = css - uLens;
  float ld = length(lp);
  float m = 1.0 - smoothstep(uLensR - 1.5, uLensR + 1.5, ld);
  float a = 1.0 - m;
  vec3 pc = col * a;
  float live = step(0.5, uLensR) * (1.0 - uMode);
  float k = clamp(ld / max(uLensR, 1.0), 0.0, 1.0);
  float w = uSplit * (0.3 + 0.7 * k * k);
  float dIn = uLensR - ld;
  float dOut = ld - uLensR;
  float rr = smoothstep(0.0, 1.0, dIn) * (1.0 - smoothstep(w - 1.0, w, dIn)) * 0.55 * live;
  float rb = smoothstep(0.0, 1.0, dOut) * (1.0 - smoothstep(w - 1.0, w, dOut)) * 0.55 * live;
  pc = pc * (1.0 - rr) + vec3(1.0, 0.25, 0.25) * rr;
  a = a * (1.0 - rr) + rr;
  pc = pc * (1.0 - rb) + vec3(0.3, 0.45, 1.0) * rb;
  a = a * (1.0 - rb) + rb;
  float rg = (1.0 - smoothstep(0.0, 2.2, abs(dIn))) * live;
  pc = pc * (1.0 - rg * 0.9) + uAcc * rg * 0.9;
  a = a * (1.0 - rg * 0.9) + rg * 0.9;
  o = vec4(pc, a);
}`;

  const SETS = [
    [' ', '.', ',', ':', ';', 'i', 'l', 'r', 'c', 'x', 'n', 'u', 'z', 'Y', 'X', 'W', 'M', '#', '@'],
    [' ', '.', ':', "'", '1', '|', 'l', 'I', '0', 'O', '8', 'B'],
    [' ', 1, 2, 3, 4, 5, 6, 7]
  ];
  const AW = 48, AH = 78;

  const state = { set: 0, drag: 0, lensX: 0, lensY: 0, lensR: 0, glow: 0, ptrX: -1, ptrY: -1, ptrIn: false, pulse: null, frac: 0.6, fps: 60, ft: 0, fc: 0, ready: false, failed: false, dirty: true, decode: 0, bloom: 0.3, pitch: 0.28, ps: 0, cell: 20, S: 1.08, tx: 0, ty: 0 };

  let dead = false;
  const fail = () => {
    state.failed = true;
    wrap.dataset.mode = 'off';
    loadingEl.hidden = true;
    canvas.classList.remove('on');
    applyScroll(state.ps);
    ctx.ready();
  };

  let gl = null, prog, stex, atex;
  const locs = new Map();
  const loc = (n) => {
    if (!locs.has(n)) locs.set(n, gl.getUniformLocation(prog, n));
    return locs.get(n);
  };
  const f1 = (n, v) => gl.uniform1f(loc(n), v);
  const f2 = (n, x, y) => gl.uniform2f(loc(n), x, y);
  const f3 = (n, c) => gl.uniform3f(loc(n), c[0], c[1], c[2]);

  const mkProg = () => {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, GLYPH));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };

  const buildAtlas = () => {
    const set = SETS[state.set];
    const c = document.createElement('canvas');
    c.width = AW * set.length;
    c.height = AH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '600 62px ' + (ctx.token('font-mono') || 'monospace');
    set.forEach((g, i) => {
      if (typeof g === 'number') {
        x.globalAlpha = g / (set.length - 1);
        x.fillRect(i * AW + 5, 8, AW - 10, AH - 16);
        x.globalAlpha = 1;
      } else if (g !== ' ') {
        x.fillText(g, i * AW + AW / 2, AH / 2 + 3);
      }
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    state.dirty = true;
  };

  const buildSignal = () => {
    const bin = atob(SIG);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SIG_W, SIG_H, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const onLost = (e) => { e.preventDefault(); fail(); };
  const initGL = () => {
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    } catch (e) {
      gl = null;
    }
    if (!gl) return false;
    try {
      prog = mkProg();
      gl.useProgram(prog);
      gl.bindVertexArray(gl.createVertexArray());
      stex = gl.createTexture();
      atex = gl.createTexture();
      buildSignal();
      buildAtlas();
      gl.uniform1i(loc('uSig'), 0);
      gl.uniform1i(loc('uAtlas'), 1);
    } catch (e) {
      return false;
    }
    canvas.addEventListener('webglcontextlost', onLost);
    return true;
  };

  let W = 1, H = 1, K = 1;
  const maxFrac = () => (phone() ? 0.55 : 0.75);
  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const q = clamp(state.frac / 0.75, 0.45, 1);
    canvas.width = Math.max(16, Math.round(W * dpr * q));
    canvas.height = Math.max(16, Math.round(H * dpr * q));
    K = canvas.width / W;
    state.dirty = true;
  };

  let colors = { bg: [0, 0, 0], ink: [1, 1, 1], acc: [1, 1, 1], inset: [0, 0, 0] };
  function readColors() {
    colors = { bg: rgb('--ground'), ink: rgb('--ink'), acc: rgb('--hue'), inset: rgb('--inset') };
    state.dirty = true;
  }

  const geom = () => {
    const cw = Math.max(W, H * IMG_AR), ch = cw / IMG_AR;
    return { cw, ch, ox: ORG_X * cw, oy: ORG_Y * ch, l0: (W - cw) / 2, t0: (H - ch) / 2 };
  };
  let lastXf = '';
  const place = (t) => {
    const g = geom();
    const S = state.S;
    const bx = [W - g.l0 - g.ox - (g.cw - g.ox) * S, -(g.l0 + g.ox * (1 - S))];
    const by = [H - g.t0 - g.oy - (g.ch - g.oy) * S, -(g.t0 + g.oy * (1 - S))];
    const cl = (v, r) => (r[0] > r[1] ? (r[0] + r[1]) / 2 : clamp(v, r[0], r[1]));
    const pitchN = (state.pitch - 0.28) / 0.9;
    const dragPx = cl(state.drag * 125, bx);
    state.drag = dragPx / 125;
    const sway = RM ? 0 : Math.sin(t * 0.4) * 36;
    state.tx = cl(dragPx + sway, bx);
    state.ty = cl(-pitchN * 0.06 * H, by);
    const xf = 'translate(' + state.tx.toFixed(2) + 'px,' + state.ty.toFixed(2) + 'px) scale(' + S.toFixed(4) + ')';
    if (xf !== lastXf) {
      lastXf = xf;
      for (const im of trues) im.style.transform = xf;
    }
    return g;
  };

  let tStart = performance.now();
  const draw = (now, t) => {
    const g = place(t);
    let fl = 0, ringR = 0, ringS = 0, px = -1e4, py = -1e4;
    if (state.pulse) {
      const age = (now - state.pulse.t0) / 1000;
      if (age > 9) state.pulse = null;
      else {
        fl = Math.pow(0.12, age);
        ringS = Math.pow(0.3, age);
        ringR = age * 0.55 * Math.max(W, H);
        px = state.pulse.x; py = state.pulse.y;
      }
    }
    gl.useProgram(prog);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atex);
    f2('uRes', canvas.width, canvas.height);
    f1('uK', K);
    f2('uCell', state.cell * 0.62 * K, state.cell * K);
    f2('uStage', W, H);
    f2('uImg', g.cw, g.ch);
    f2('uO', g.ox, g.oy);
    f2('uT', state.tx, state.ty);
    f1('uS', state.S);
    f1('uN', SETS[state.set].length);
    f1('uStep', RM ? 0 : Math.floor(t * 14));
    f1('uFlick', RM ? 0 : 1);
    f1('uTime', t);
    f1('uFlutter', fl);
    const d = state.decode;
    const diag = Math.hypot(W, H);
    f2('uLens', lerp(state.lensX, W / 2, d), lerp(state.lensY, H / 2, d));
    f1('uLensR', lerp(state.lensR, 0.6 * diag, d));
    f1('uSplit', 6);
    f1('uMode', d > 0.98 ? 1 : 0);
    f2('uPtr', state.lensX, state.lensY);
    f1('uGlow', state.glow);
    f1('uGlowR', 2.2 * (phone() ? 88 : 128));
    f2('uPulse', px, py);
    f1('uRing', ringR);
    f1('uRingW', 46);
    f1('uStrength', ringS);
    f3('uBg', colors.bg);
    f3('uInk', colors.ink);
    f3('uAcc', colors.acc);
    f3('uInset', colors.inset);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const discrete = (p) => (p < 0.35 ? 0 : p < 0.8 ? 0.6 : 1);
  let target = 0;
  const rawScroll = () => {
    const r = track.getBoundingClientRect();
    const total = track.offsetHeight - stage.offsetHeight;
    if (total <= 0) return 0;
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    return clamp((top - r.top) / Math.max(total, 1));
  };

  const cache = new Map();
  const setFx = (el, o, y) => {
    const k = o.toFixed(3) + '|' + y.toFixed(1);
    if (cache.get(el) === k) return;
    cache.set(el, k);
    el.style.opacity = o.toFixed(3);
    el.style.transform = y === 0 ? '' : 'translateY(' + y.toFixed(1) + 'px)';
  };
  let liveClose = false, liveDock = true;
  function applyScroll(p) {
    const ph = phone();
    state.cell = lerp(ph ? 15 : 20, ph ? 8 : 9, ss(0, 0.34, p));
    state.bloom = lerp(0.3, 1, ss(0.12, 0.58, p));
    state.pitch = lerp(0.28, 1.18, ss(0.3, 0.72, p));
    state.S = 1.08 + 0.3 * (state.bloom - 0.3) / 0.7;
    state.decode = ss(0.66, 0.93, p);
    setFx(els.hintw, 1 - clamp(p / 0.05), 0);
    const f3v = ss(0.24, 0.34, p);
    setFx(els.asw, 1 - f3v, -24 * f3v);
    const lg = 1 - ss(0.8, 0.88, p);
    setFx(els.log, lg, 0);
    setFx(els.dockw, lg, 0);
    const dockLive = lg > 0.02 && !state.failed;
    if (dockLive !== liveDock) { liveDock = dockLive; els.dockw.toggleAttribute('inert', !dockLive); els.dockw.style.pointerEvents = dockLive ? '' : 'none'; }
    if (!tail) {
      const co = ss(0.92, 0.99, p);
      setFx(els.close, co, 30 * (1 - co));
      const live = p >= 0.92;
      if (live !== liveClose) { liveClose = live; els.close.classList.toggle('fwc-gl-live', live); els.close.toggleAttribute('inert', !live); }
      const pc = Math.round(state.decode * 100);
      if (pctEl.textContent !== String(pc)) pctEl.textContent = String(pc);
    }
    state.dirty = true;
  }

  const logEl = [...els.log.children];
  let logN = 0;
  const logLine = (now) => {
    const t = ((now - tStart) / 1000).toFixed(2).padStart(6, ' ');
    const k = logN++ % 4;
    let s;
    if (k === 0) s = t + ' cell ' + Math.round(state.cell) + 'px zoom ' + state.S.toFixed(2);
    else if (k === 1) s = t + ' pan x ' + state.tx.toFixed(1) + ' y ' + state.ty.toFixed(1) + ' px';
    else if (k === 2) s = t + ' scale ' + Math.round(clamp(state.frac / 0.75, 0.45, 1) * 100) + '% ' + Math.round(state.fps) + 'fps';
    else s = t + ' decode ' + String(Math.round(state.decode * 100)).padStart(3, '0') + '% lens ' + (state.lensR > 4 || state.decode > 0.02 ? 'open' : 'idle');
    for (let i = 0; i < 13; i++) logEl[i].textContent = logEl[i + 1].textContent;
    logEl[13].textContent = s;
  };
  const setRead = () => {
    const s = Math.round(state.cell) + 'px ' + Math.round(state.fps) + 'fps';
    if (readEl.textContent !== s) readEl.textContent = s;
  };

  const pointerOverUi = (t) => !!(t && t.closest && t.closest('.fwc-gl-dock, .fwc-gl-close.fwc-gl-live'));
  let down = null;
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      state.ptrIn = !pointerOverUi(e.target);
      state.ptrX = x; state.ptrY = y;
    } else if (down) {
      state.ptrX = x; state.ptrY = y;
    }
    if (down) {
      const dx = e.clientX - down.cx;
      down.moved += Math.abs(dx) + Math.abs(e.clientY - down.cy);
      if (!pointerOverUi(down.target)) state.drag += dx * 0.008;
      down.cx = e.clientX; down.cy = e.clientY;
    }
    state.dirty = true;
  };
  const onLeave = (e) => { if (e.pointerType !== 'touch') state.ptrIn = false; };
  const onDown = (e) => {
    if (pointerOverUi(e.target)) { down = null; return; }
    const r = stage.getBoundingClientRect();
    down = { cx: e.clientX, cy: e.clientY, moved: 0, x: e.clientX - r.left, y: e.clientY - r.top, target: e.target };
    state.ptrX = down.x; state.ptrY = down.y;
    if (e.pointerType === 'touch') { state.ptrIn = true; state.lensX = down.x; state.lensY = down.y; }
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
  };
  const pulse = (x, y) => { state.pulse = { x, y, t0: performance.now() }; state.dirty = true; };
  const endPtr = (e) => {
    if (down && down.moved < 8 && !pointerOverUi(down.target) && e.type === 'pointerup') pulse(down.x, down.y);
    down = null;
    if (e.pointerType === 'touch') state.ptrIn = false;
    state.dirty = true;
  };
  const onKey = (e) => {
    if (e.target !== stage) return;
    if (e.key === 'ArrowLeft') { state.drag -= 0.15; state.dirty = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { state.drag += 0.15; state.dirty = true; e.preventDefault(); }
    else if (e.key === 'Enter') { pulse(W / 2, H / 2); e.preventDefault(); }
  };
  const passive = { passive: true };
  stage.addEventListener('pointermove', onMove, passive);
  stage.addEventListener('pointerleave', onLeave, passive);
  stage.addEventListener('pointerdown', onDown, passive);
  stage.addEventListener('pointerup', endPtr, passive);
  stage.addEventListener('pointercancel', endPtr, passive);
  stage.addEventListener('keydown', onKey);

  const radios = [...els.dock.querySelectorAll('button')];
  const pick = (i, focus) => {
    radios.forEach((b, j) => { b.setAttribute('aria-checked', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
    state.set = i;
    if (gl) buildAtlas();
    if (focus) radios[i].focus();
  };
  radios.forEach((b, i) => {
    b.addEventListener('click', () => pick(i));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { pick((i + 1) % 3, true); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { pick((i + 2) % 3, true); e.preventDefault(); }
    });
  });

  let tween = null;
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  $('.fwc-gl-replay').addEventListener('click', () => {
    if (tail) { window.scrollTo(0, Math.max(0, window.scrollY + track.getBoundingClientRect().top - (parseFloat(getComputedStyle(stage).top) || 0))); return; }
    if (RM) { window.scrollTo(0, 0); return; }
    tween ={ y0: window.scrollY, t0: performance.now(), dur: 2000 };
  });

  let lastNow = 0, simT = 0, logTimer = 0, readTimer = 0, sigPrev = '';
  let started = false;
  const frame = (now) => {
    if (!started) return;
    const rawDt = lastNow ? now - lastNow : 16;
    const dt = Math.min(0.05, rawDt / 1000);
    lastNow = now;
    if (tween) {
      const k = clamp((now - tween.t0) / tween.dur);
      window.scrollTo(0, tween.y0 * (1 - easeIO(k)));
      if (k >= 1) tween = null;
    }
    if (RM) { target = rawScroll(); state.ps = discrete(target); }
    else state.ps = target;
    applyScroll(state.ps);

    const R0 = phone() ? 88 : 128;
    const wantR = state.ptrIn ? R0 : 0;
    if (RM) {
      state.lensR = wantR;
      if (state.ptrIn) { state.lensX = state.ptrX; state.lensY = state.ptrY; }
      state.glow = state.ptrIn ? 1 : 0;
    } else {
      if (state.ptrX < 0) { state.lensX = W / 2; state.lensY = H / 2; }
      else if (state.ptrIn || state.lensR > 2) {
        const a = 1 - Math.exp(-dt / 0.07);
        if (state.lensR < 2 && state.ptrIn) { state.lensX = state.ptrX; state.lensY = state.ptrY; }
        else { state.lensX += (state.ptrX - state.lensX) * a; state.lensY += (state.ptrY - state.lensY) * a; }
      }
      state.lensR += (wantR - state.lensR) * (1 - Math.exp(-dt / 0.17));
      if (Math.abs(state.lensR - wantR) < 0.05) state.lensR = wantR;
      state.glow += ((state.ptrIn ? 1 : 0) - state.glow) * (1 - Math.exp(-dt / 0.2));
    }

    if (now - logTimer > (RM ? 1000 : 180)) { logTimer = now; logLine(now); }
    if (now - readTimer > 250) { readTimer = now; setRead(); }

    if (!gl || state.failed || document.hidden || !ctx.visible()) return;
    const animated = !RM || state.pulse;
    if (!animated) {
      const sg = [state.ps, state.drag, state.lensR, state.lensX, state.lensY, state.set, state.frac, W, H, colors.bg.join()].join('|');
      if (sg === sigPrev && !state.dirty) return;
      sigPrev = sg;
    }
    state.dirty = false;
    if (!RM) simT += dt;
    draw(now, RM ? 0 : simT);
    if (!state.ready) {
      state.ready = true;
      wrap.dataset.ready = '';
      loadingEl.hidden = true;
      canvas.classList.add('on');
      ctx.ready();
    }
    if (!RM) {
      state.ft += rawDt; state.fc++;
      if (state.fc % 40 === 0) {
        const avg = state.ft / 40;
        state.fps = clamp(1000 / avg, 1, 60);
        state.ft = 0;
        if (avg > 21) state.frac = Math.max(0.34, state.frac - 0.08);
        else if (avg < 13.5) state.frac = Math.min(maxFrac(), state.frac + 0.04);
        sizeCanvas();
      }
    } else state.fps = 60;
  };

  const measure = () => {
    const s = ctx.size();
    W = s.width || ctx.host.clientWidth || 1;
    H = s.height || ctx.host.clientHeight || 1;
    sizeCanvas();
    if (tail) tail.style.minBlockSize = stage.offsetHeight + 'px';
    target = RM ? rawScroll() : ctx.progress();
    state.ps = RM ? discrete(target) : target;
    applyScroll(state.ps);
  };
  const offResize = ctx.onResize(() => { if (started) measure(); });
  const offVisible = ctx.onVisible(() => { state.dirty = true; });
  const offProgress = RM ? () => {} : ctx.onProgress((p) => { target = p; });
  const offFrame = ctx.onFrame(frame);

  const buildTail = () => {
    if (!RM || track === stage || !track.parentNode || track.offsetHeight - stage.offsetHeight > 1) return;
    tail = document.createElement('div');
    tail.className = 'fwc-glyph-lens fwc-gl-tail';
    tail.dataset.mode = 'off';
    tail.dataset.ready = '';
    tail.style.minBlockSize = stage.offsetHeight + 'px';
    const pic = document.createElement('div');
    pic.className = 'fwc-gl-tail-pic';
    pic.setAttribute('aria-hidden', 'true');
    pic.innerHTML = picture('fwc-gl-dark', darkSrc, '') + picture('fwc-gl-light', lightSrc, '');
    tailTrues = [...pic.querySelectorAll('.fwc-gl-true')];
    els.close.removeAttribute('inert');
    els.close.classList.add('fwc-gl-live');
    pctEl.textContent = '100';
    tail.append(pic, els.close);
    wrap.classList.add('fwc-gl-static');
    track.insertAdjacentElement('afterend', tail);
    showTheme();
  };

  const start = () => {
    if (dead) return;
    buildTail();
    readColors();
    const ok = initGL();
    W = ctx.host.clientWidth || 1; H = ctx.host.clientHeight || 1;
    if (phone()) state.frac = Math.min(state.frac, 0.55);
    started = true;
    measure();
    tStart = performance.now();
    if (!ok) fail();
  };
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2000))]).then(start);

  return () => {
    dead = true;
    clearTimeout(inTimer);
    offTheme(); offResize(); offVisible(); offProgress(); offFrame();
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerleave', onLeave);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', endPtr);
    stage.removeEventListener('pointercancel', endPtr);
    stage.removeEventListener('keydown', onKey);
    canvas.removeEventListener('webglcontextlost', onLost);
    if (tail) tail.remove();
    wrap.remove();
    style.remove();
  };
}
