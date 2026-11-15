// page-turn: a publication turned page by page in 3D, with drag, keys, arrows and a swipe deck on narrow screens.
// Ported from formai-xmental-webspun v3.1.0 assets/sections/formdesign-spreads. Spread state is shared through
// the page variable named by props.spreadVariable so native dots and labels can bind to it.

const CSS = `
.fwc-pt { position: absolute; inset: 0; container: fwcpt / inline-size; color: var(--ink, #eef0f4); font-family: var(--font-ui, system-ui, sans-serif); font-weight: var(--weight-body, 420); line-height: 1.55; text-align: start;
  --fd-pw: min(29vw, calc((100svh - var(--bar-h, 64px) - 230px) * 0.75), 460px); --fd-ph: calc(var(--fd-pw) * 1.33); --fd-shift: -0.5; --fd-t: 4px;
  --fd-edge: color-mix(in srgb, var(--pane, #1b1e25) 74%, var(--black, #000)); --fd-edge-line: color-mix(in srgb, var(--pane, #1b1e25) 82%, var(--ink, #eef0f4));
  & *, & *::before, & *::after { box-sizing: border-box; }
  & p, & h2, & figure { margin: 0; }
  & button { font: inherit; color: inherit; }
  & a { color: inherit; }
  & :focus-visible { outline: 2px solid var(--focus, #eef0f4); outline-offset: 2px; }
  &[data-fwc-theme="light"] .shot-dark, &:not([data-fwc-theme="light"]) .shot-light { display: none !important; }
  .fd-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .fd-rise { position: absolute; inset: 0; }
  .fd-book { position: absolute; inset-inline-start: 50%; inset-block-start: 50%; inline-size: calc(var(--fd-pw) * 2); block-size: var(--fd-ph); margin-inline-start: calc(var(--fd-pw) * -1); margin-block-start: calc(var(--fd-ph) / -2); transform: translateX(calc(var(--fd-shift) * 50%)); cursor: grab; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .fd-book.fd-drag { cursor: grabbing; }
  .fd-slab { position: absolute; inset-block: 1.2% -1.2%; inline-size: 50%; background: var(--pane, #1b1e25); box-shadow: inset 0 0 0 1px var(--edge, rgb(255 255 255 / 0.09)), 0 24px 60px -12px color-mix(in srgb, var(--black, #000) 55%, transparent); opacity: 0; }
  .fd-slab-l { inset-inline-start: 0; border-radius: 3px 0 0 3px; }
  .fd-slab-r { inset-inline-start: 50%; border-radius: 0 3px 3px 0; opacity: 1; }
  .fd-cast { position: absolute; inset-block: 0; opacity: 0; pointer-events: none; }
  .fd-cast-r { inset-inline-start: 50%; background: linear-gradient(90deg, color-mix(in srgb, var(--black, #000) 38%, transparent), transparent); }
  .fd-cast-l { inset-inline-end: 50%; background: linear-gradient(270deg, color-mix(in srgb, var(--black, #000) 38%, transparent), transparent); }
  .fd-leaf { position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 50%; transform-origin: left center; transform-style: preserve-3d; }
  .fd-blk { position: absolute; inset-block: 0; inline-size: 50%; pointer-events: none; opacity: 0; }
  .fd-blk-r { inset-inline-start: 50%; }
  .fd-blk-l { inset-inline-start: 0; }
  .fd-blk::before, .fd-blk::after { content: ""; position: absolute; background-color: var(--fd-edge); }
  .fd-blk::before { inset-block: 2px calc(var(--n, 0) * var(--fd-t) * -0.35); inline-size: calc(var(--n, 0) * var(--fd-t)); background-image: repeating-linear-gradient(90deg, transparent 0 calc(var(--fd-t) - 1px), var(--fd-edge-line) calc(var(--fd-t) - 1px) var(--fd-t)); }
  .fd-blk-r::before { inset-inline-start: 100%; }
  .fd-blk-l::before { inset-inline-end: 100%; }
  .fd-blk::after { inset-block-start: 100%; block-size: calc(var(--n, 0) * var(--fd-t) * 0.35); background-image: repeating-linear-gradient(0deg, transparent 0 calc(var(--fd-t) * 0.35 - 1px), var(--fd-edge-line) calc(var(--fd-t) * 0.35 - 1px) calc(var(--fd-t) * 0.35)); }
  .fd-blk-r::after { inset-inline: 0 calc(var(--n, 0) * var(--fd-t) * -1); }
  .fd-blk-l::after { inset-inline: calc(var(--n, 0) * var(--fd-t) * -1) 0; }
  .fd-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .fd-face-f { transform: translateZ(0.5px); }
  .fd-face-b { transform: translateZ(-0.5px) rotateY(180deg); }
  .fd-leaf.fd-turning .fd-face { visibility: hidden; }
  .fd-sheet { position: absolute; inset: 0; display: none; transform-style: preserve-3d; }
  .fd-leaf.fd-turning .fd-sheet { display: block; }
  .fd-strip { position: absolute; inset-block: 0; inset-inline-start: 100%; inline-size: 100%; transform-origin: left center; transform-style: preserve-3d; }
  .fd-strip-0 { inset-inline-start: 0; inline-size: 16.6667%; }
  .fd-sf, .fd-sb { position: absolute; inset-block: 0; inset-inline: 0 -1.2px; overflow: hidden; background: var(--pane, #1b1e25); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .fd-sf { transform: translateZ(calc(var(--fd-t) / 2)); }
  .fd-sb { transform: translateZ(calc(var(--fd-t) / -2)) rotateY(180deg); }
  .fd-se { position: absolute; inset-block: 0; inset-inline-start: calc(100% - var(--fd-t) / 2); inline-size: var(--fd-t); transform: rotateY(90deg); background: var(--fd-edge); box-shadow: inset 0 0 0 0.5px var(--fd-edge-line); }
  .fd-strip-0::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: calc(var(--fd-t) / -2); inline-size: var(--fd-t); transform: rotateY(-90deg); background: var(--fd-edge); }
  .fd-sf .fd-page, .fd-sb .fd-page { position: absolute; inset-block: 0; inline-size: 600%; block-size: 100%; }
  .fd-sf .fd-page *, .fd-sb .fd-page * { box-shadow: none; transition: none; }
  .fd-sh { position: absolute; inset: 0; pointer-events: none; }
  .fd-corner { position: absolute; inset-inline-end: 0; inset-block-end: 0; inline-size: 28px; block-size: 28px; clip-path: polygon(100% 0, 100% 100%, 0 100%); background: color-mix(in oklab, var(--hue, #eef0f4) 60%, transparent); pointer-events: none; transition: inline-size 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), block-size 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity var(--dur, 240ms); }
  .fd-book:hover .fd-corner { inline-size: 46px; block-size: 46px; }
  .fd-book[data-end] .fd-corner { opacity: 0; }
  .fd-arrow { position: absolute; inset-block-start: 50%; margin-block-start: -27px; inline-size: 54px; block-size: 54px; display: grid; place-items: center; padding: 0; border: 0; background: none; color: var(--ink, #eef0f4); cursor: pointer; transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity var(--dur, 240ms); z-index: var(--z-raised, 100); }
  .fd-arrow svg { inline-size: 30px; block-size: 30px; }
  .fd-prev { inset-inline-start: 0; }
  .fd-next { inset-inline-end: 0; }
  .fd-prev:hover:not(:disabled) { transform: translateX(-6px); }
  .fd-next:hover:not(:disabled) { transform: translateX(6px); }
  .fd-arrow:disabled { opacity: 0.25; cursor: default; }
  .fd-deck { display: none; }

  .fd-page { container-type: inline-size; position: relative; inline-size: 100%; block-size: 100%; overflow: hidden; background: var(--pane, #1b1e25); box-shadow: inset 0 0 0 1px var(--edge, rgb(255 255 255 / 0.09)); color: var(--ink, #eef0f4); }
  .fd-face-f .fd-page { border-radius: 0 3px 3px 0; }
  .fd-face-b .fd-page, .fd-sb .fd-page { border-radius: 3px 0 0 3px; }
  .fd-page::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, color-mix(in srgb, var(--black, #000) 26%, transparent), transparent 12%); }
  .fd-face-b .fd-page::after, .fd-sb .fd-page::after { background: linear-gradient(270deg, color-mix(in srgb, var(--black, #000) 34%, transparent), transparent 12%); }
  .fd-in { position: relative; display: flex; flex-direction: column; block-size: 100%; padding: 9cqw 8cqw 10cqw; font-size: 3.4cqw; line-height: 1.4; }
  .fd-in > * { margin: 0; }
  .fd-k { color: var(--hue, #eef0f4); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-mono { display: flex; justify-content: space-between; gap: 1em; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-hd { margin-block-start: 0.5em; font-size: 2em; font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); line-height: 1.05; text-wrap: balance; }
  .fd-p { margin-block-start: 0.8em; color: var(--ink-soft, #a4aab8); }
  .fd-num { margin-block-start: auto; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; }
  .fd-mast { margin-block-start: 0.6em; font-size: 4em; font-weight: 700; letter-spacing: -0.045em; line-height: 1; white-space: nowrap; }
  .fd-mast .fd-form { color: var(--ink, #eef0f4); }
  .fd-mast .fd-suffix { color: var(--hue, #eef0f4); }
  .fd-cshot { margin: 1.4em 0 0; overflow: hidden; border-radius: 1.6cqw; box-shadow: var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); }
  .fd-cshot img, .fd-fig img, .fd-thumb img { display: block; inline-size: 100%; block-size: auto; }
  .fd-cline { margin-block-start: auto; font-size: 1.4em; font-weight: var(--weight-strong, 560); letter-spacing: var(--track-tight, -0.015em); line-height: 1.2; }
  .fd-by { margin-block-start: 0.8em; }
  .fd-chip { margin-block-start: 1em; display: inline-flex; align-items: center; gap: 0.7em; align-self: flex-start; padding: 0.4em 0.9em; box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hue, #eef0f4) 42%, transparent); color: var(--hue, #eef0f4); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-chip i { inline-size: 0.6em; block-size: 0.6em; border-radius: 50%; background: var(--hue, #eef0f4); animation: fwc-pt-blink 1.6s ease-in-out infinite; }
  .fd-sig { margin-block-start: 1em; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-list { display: flex; flex-direction: column; margin-block-start: 1.2em; border-block-start: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); }
  .fd-row { display: grid; grid-template-columns: 2.4em 1fr auto; align-items: baseline; gap: 1em; padding: 1em 0; border: 0; border-block-end: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); background: none; color: var(--ink, #eef0f4); font: inherit; text-align: start; cursor: pointer; }
  .fd-row span { transition: transform var(--dur, 240ms) var(--ease-out, ease-out); }
  .fd-row span:nth-child(2) { font-weight: var(--weight-strong, 560); font-size: 1.2em; letter-spacing: var(--track-tight, -0.015em); }
  .fd-row span:first-child, .fd-row span:last-child { color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-row:hover span { transform: translateX(2cqw); }
  .fd-tip { margin-block-start: auto; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-bleed { position: absolute; inset: 0; }
  .fd-bleed img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
  .fd-card { position: relative; margin-block-start: auto; padding: 1.4em 1.6em; border-radius: 1.6cqw; background: var(--pane, #1b1e25); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)), var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); }
  .fd-card .fd-hd { margin-block-start: 0.3em; font-size: 2.6em; }
  .fd-in-bleed { justify-content: flex-end; }
  .fd-lede { margin-block-start: 0.8em; font-size: 1.22em; line-height: 1.38; letter-spacing: var(--track-tight, -0.015em); }
  .fd-pull { margin-block: 1.2em; padding-block: 1em; border-block: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); font-size: 1.15em; font-weight: var(--weight-strong, 560); letter-spacing: var(--track-tight, -0.015em); line-height: 1.25; color: var(--ink, #eef0f4); }
  .fd-link { margin-block-start: auto; align-self: flex-start; color: var(--ink, #eef0f4); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; border-block-end: 1px solid var(--hue, #eef0f4); }
  .fd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3cqw; margin-block-start: 1em; }
  .fd-fig img { aspect-ratio: 1; object-fit: cover; border-radius: 1.2cqw; box-shadow: var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); }
  .fd-fig-w { grid-column: 1 / -1; }
  .fd-fig-w img { aspect-ratio: 2 / 1; }
  .fd-fig figcaption { margin-block-start: 0.5em; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-thumb { margin: 1.4em 0 1.6em; overflow: hidden; border-radius: 1.6cqw; box-shadow: var(--shadow-window, var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55))); transform: rotate(-3deg); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .fd-page:hover .fd-thumb { transform: rotate(0) scale(1.03); }
  .fd-rel { margin-block-start: 0.9em; }
  .fd-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2, 8px); align-self: flex-start; margin-block-start: auto; block-size: 10cqw; min-block-size: 0; padding-inline: 4cqw; border-radius: var(--radius-m, 10px); font-size: 2.8cqw; font-weight: var(--weight-strong, 560); text-decoration: none; white-space: nowrap; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease-out), opacity var(--dur-fast, 140ms) var(--ease-out, ease-out); }
  .fd-btn-ink { background: var(--ink, #eef0f4); color: var(--on-ink, #14161b); }
  .fd-btn-ink:hover { opacity: 0.88; }
  .fd-btn-quiet { background: var(--control, #2b303c); color: var(--ink, #eef0f4); }
  .fd-btn-quiet:hover { background: var(--control-hover, #343a48); }
  .fd-quote { margin-block-start: 1.1em; padding-inline-start: 1em; border-inline-start: 1px solid var(--edge-strong, rgb(255 255 255 / 0.18)); }
  .fd-quote p { line-height: 1.35; }
  .fd-quote .fd-src { margin-block-start: 0.4em; color: var(--hue, #eef0f4); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-seps { margin-block-start: auto; color: var(--ink-faint, #6b7283); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
  .fd-copy { display: flex; justify-content: space-between; align-items: baseline; gap: 1em; margin-block-start: 1.2em; padding: 0.9em 1em; border: 0; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); background: none; color: var(--ink, #eef0f4); font: inherit; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.9em; text-align: start; cursor: pointer; }
  .fd-copy b { color: var(--hue, #eef0f4); font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; font-size: 0.85em; }
  .fd-btns { display: flex; gap: 2cqw; margin-block-start: 1.2em; }
  .fd-btns .fd-btn { margin-block-start: 0; }
  .fd-socials { margin-block-start: auto; display: flex; gap: 1em; font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint, #6b7283); }
  .fd-socials a { color: inherit; text-decoration: none; }
  .fd-socials a:hover { color: var(--ink, #eef0f4); }
  .fd-sign-off { margin-block-start: 0.6em; font-size: 3.2em; font-weight: 700; letter-spacing: -0.04em; line-height: 1; text-wrap: balance; }
  .fd-ruler { margin-block-start: auto; display: flex; align-items: flex-end; justify-content: space-between; block-size: 8cqw; }
  .fd-ruler i { display: block; background: var(--ink-faint, #6b7283); }
  .fd-colo { margin-block-start: 1em; color: var(--ink-soft, #a4aab8); }
  .fd-price { margin-block-start: 1em; }

  &.fd-narrow {
    .fd-book, .fd-arrow { display: none; }
    .fd-deck { --fd-pw: min(78vw, calc((100svh - 100px - 230px) * 0.75)); display: flex; position: absolute; inset-inline: -16px; inset-block: 0; gap: 16px; padding-inline: 11vw; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; align-items: center; }
    .fd-deck::-webkit-scrollbar { display: none; }
    .fd-dp { flex: 0 0 var(--fd-pw); inline-size: var(--fd-pw); aspect-ratio: 3 / 4; scroll-snap-align: center; }
    .fd-dp .fd-page { border-radius: 3px; }
    .fd-dp .fd-page::after { display: none; }
  }
  &[data-fwc-reduced] .fd-chip i { animation: none; }
}
@keyframes fwc-pt-blink { 50% { opacity: 0.3; } }
`;

const NAMES = ['Cover', 'Letter and contents', 'Make', 'Pages and publishing', 'Facts and get it', 'Back cover'];
const ARROW_L = '<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6l-9 9 9 9"/></svg>';
const ARROW_R = '<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6l9 9-9 9"/></svg>';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
};
const svgFrom = (markup) => {
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild;
};

export function mount(root, props, ctx) {
  const p = props || {};
  const brand = p.brand ?? 'Form';
  const suffix = p.suffix ?? 'Design';
  const bookLabel = p.bookLabel ?? 'FormDesign publication';
  const prevLabel = p.prevLabel ?? 'Previous spread';
  const nextLabel = p.nextLabel ?? 'Next spread';
  const deckLabel = p.deckLabel ?? 'FormDesign publication, swipe to turn pages';
  const ofWord = p.ofWord ?? 'of';
  const spreadVar = p.spreadVariable ?? 'spread';
  const savedVar = p.savedVariable ?? 'saved';
  let pagesData = Array.isArray(p.pages) ? p.pages.slice() : [];
  if (pagesData.length % 2) pagesData.push({ blocks: [] });
  const LEAVES = Math.max(1, pagesData.length / 2);
  const MAXF = LEAVES;
  const names = Array.isArray(p.names) && p.names.length ? p.names.map(String) : NAMES;
  const vars = globalThis.__formwebVariables;
  const setVar = (name, value) => { if (name && vars && typeof vars.set === 'function') { try { vars.set(name, value); } catch (e) { /* the variable may not exist on this page */ } } };

  const style = h('style');
  style.textContent = CSS;
  root.appendChild(style);
  const wrap = h('div', 'fwc-pt');
  wrap.setAttribute('data-fwc-theme', ctx.theme());
  if (ctx.reduced) wrap.setAttribute('data-fwc-reduced', '');
  root.appendChild(wrap);
  const rise = h('div', 'fd-rise');
  wrap.appendChild(rise);

  // ---- page content -------------------------------------------------------
  const imgs = (parent, d) => {
    const make = (src, theme) => {
      const im = document.createElement('img');
      im.src = ctx.asset(src);
      if (d.w) im.width = d.w;
      if (d.h) im.height = d.h;
      im.alt = d.alt || '';
      im.decoding = 'async';
      im.draggable = false;
      if (theme) im.className = theme;
      return im;
    };
    if (d.light) parent.append(make(d.src, 'shot-dark'), make(d.light, 'shot-light'));
    else parent.append(make(d.src, ''));
  };
  const copyButton = (btn, b) => {
    const url = b.url || '';
    const word = btn.querySelector('b');
    const rest = b.label ?? 'Copy';
    let tm = 0;
    const say = (t, ms) => { word.textContent = t; clearTimeout(tm); tm = setTimeout(() => { word.textContent = rest; }, ms); };
    const ok = () => say(b.done ?? 'Copied', 2200);
    const fail = () => {
      const r = document.createRange();
      r.selectNodeContents(btn.firstElementChild);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      say(b.fail ?? 'Select to copy', 6000);
    };
    const old = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let good = false;
      try { good = document.execCommand('copy'); } catch (e) { good = false; }
      ta.remove();
      if (good) ok(); else fail();
    };
    btn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, old);
      else old();
    });
  };
  const button = (b, extra) => {
    const a = h('a', 'fd-btn fd-btn-' + (b.kind === 'quiet' ? 'quiet' : 'ink'), b.text);
    a.href = b.href || '#';
    if (extra) a.classList.add(extra);
    return a;
  };
  const BLOCKS = {
    k: (b) => h('p', 'fd-k', b.text),
    mono: (b) => { const e = h('p', 'fd-mono' + (b.cls ? ' ' + b.cls : '')); for (const s of b.spans || []) e.append(h('span', '', s)); return e; },
    mast: () => { const e = h('p', 'fd-mast'); e.append(h('span', 'fd-form', brand), h('span', 'fd-suffix', suffix)); return e; },
    shot: (b) => { const f = h('figure', 'fd-cshot'); imgs(f, b); return f; },
    thumb: (b) => { const f = h('figure', 'fd-thumb'); imgs(f, b); return f; },
    cline: (b) => { const e = h('p', 'fd-cline'); String(b.text || '').split('\n').forEach((line, i) => { if (i) e.append(document.createElement('br')); e.append(line); }); return e; },
    hd: (b) => h('h2', 'fd-hd', b.text),
    p: (b) => h('p', 'fd-p', b.text),
    num: (b) => h('p', 'fd-num', b.text),
    tip: (b) => h('p', 'fd-tip', b.text),
    sig: (b) => h('p', 'fd-sig', b.text),
    chip: (b) => { const e = h('p', 'fd-chip'); e.append(document.createElement('i'), b.text || ''); return e; },
    lede: (b) => h('p', 'fd-lede', b.text),
    pull: (b) => h('p', 'fd-pull', b.text),
    colo: (b) => h('p', 'fd-colo', b.text),
    seps: (b) => h('p', 'fd-seps', b.text),
    signoff: (b) => h('p', 'fd-sign-off', b.text),
    link: (b) => { const a = h('a', 'fd-link', b.text); a.href = b.href || '#'; return a; },
    button: (b) => button(b),
    btns: (b) => { const d = h('div', 'fd-btns'); for (const x of b.buttons || []) d.append(button(x)); return d; },
    socials: (b) => { const e = h('p', 'fd-socials'); for (const x of b.links || []) { const a = h('a', '', x.text); a.href = x.href || '#'; e.append(a); } return e; },
    list: (b) => {
      const d = h('div', 'fd-list');
      for (const r of b.rows || []) {
        const btn = h('button', 'fd-row');
        btn.type = 'button';
        btn.dataset.go = String(r.go ?? 0);
        btn.append(h('span', '', r.a), h('span', '', r.b), h('span', '', r.c));
        d.append(btn);
      }
      return d;
    },
    grid: (b) => {
      const d = h('div', 'fd-grid');
      for (const f of b.figs || []) {
        const fig = h('figure', 'fd-fig' + (f.wide ? ' fd-fig-w' : ''));
        imgs(fig, f);
        fig.append(h('figcaption', '', f.caption));
        d.append(fig);
      }
      return d;
    },
    quote: (b) => { const q = h('div', 'fd-quote'); q.append(h('p', '', b.text), h('p', 'fd-src', b.src)); return q; },
    copy: (b) => {
      const btn = h('button', 'fd-copy');
      btn.type = 'button';
      btn.append(h('span', '', b.text), h('b', '', b.label ?? 'Copy'));
      copyButton(btn, b);
      return btn;
    },
    ruler: (b) => {
      const d = h('div', 'fd-ruler');
      d.setAttribute('aria-hidden', 'true');
      for (const bar of b.bars || []) { const i = document.createElement('i'); i.style.blockSize = bar[0] + '%'; i.style.inlineSize = bar[1] + 'px'; d.append(i); }
      return d;
    },
    card: (b) => { const d = h('div', 'fd-card'); d.append(h('p', 'fd-k', b.k), h('h2', 'fd-hd', b.hd)); return d; }
  };
  const renderPage = (desc, n) => {
    const page = h('div', 'fd-page');
    page.dataset.p = String(n + 1);
    if (desc.bleed) { const bl = h('div', 'fd-bleed'); imgs(bl, desc.bleed); page.append(bl); }
    const inner = h('div', 'fd-in' + (desc.bleed ? ' fd-in-bleed' : ''));
    for (const b of desc.blocks || []) { const make = BLOCKS[b.t]; if (make) inner.append(make(b)); }
    page.append(inner);
    return page;
  };

  // ---- book structure ------------------------------------------------------
  const prev = h('button', 'fd-arrow fd-prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', prevLabel);
  prev.append(svgFrom(ARROW_L));
  const next = h('button', 'fd-arrow fd-next');
  next.type = 'button';
  next.setAttribute('aria-label', nextLabel);
  next.append(svgFrom(ARROW_R));
  const book = h('div', 'fd-book');
  book.setAttribute('role', 'group');
  book.setAttribute('aria-label', bookLabel);
  const slabL = h('div', 'fd-slab fd-slab-l');
  const slabR = h('div', 'fd-slab fd-slab-r');
  const blkL = h('div', 'fd-blk fd-blk-l');
  const blkR = h('div', 'fd-blk fd-blk-r');
  const castL = h('div', 'fd-cast fd-cast-l');
  const castR = h('div', 'fd-cast fd-cast-r');
  for (const e of [slabL, slabR, blkL, blkR, castL, castR]) { e.setAttribute('aria-hidden', 'true'); book.append(e); }
  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    const leaf = h('div', 'fd-leaf');
    leaf.dataset.i = String(i);
    const ff = h('div', 'fd-face fd-face-f');
    ff.append(renderPage(pagesData[2 * i] || { blocks: [] }, 2 * i));
    const fb = h('div', 'fd-face fd-face-b');
    fb.append(renderPage(pagesData[2 * i + 1] || { blocks: [] }, 2 * i + 1));
    leaf.append(ff, fb);
    book.append(leaf);
    leaves.push(leaf);
  }
  const corner = h('div', 'fd-corner');
  corner.setAttribute('aria-hidden', 'true');
  book.append(corner);
  const deck = h('div', 'fd-deck');
  deck.setAttribute('role', 'group');
  deck.setAttribute('aria-label', deckLabel);
  pagesData.forEach(() => deck.append(h('div', 'fd-dp')));
  const deckCells = [...deck.children];
  deckCells.forEach((cell, i) => cell.append(renderPage(pagesData[i] || { blocks: [] }, i)));
  const live = h('p', 'fd-sr');
  live.setAttribute('aria-live', 'polite');
  rise.append(prev, next, book, deck, live);

  // ---- state ----------------------------------------------------------------
  let f = 0, vel = 0, target = 0, dirv = -1, running = false, last = 0, shown = -1, narrow = false, sig = '';
  let dead = false;
  const cache = leaves.map(() => ({ mode: '', t: -1 }));
  const sheets = leaves.map(() => null);
  const offs = [];
  let stopFrame = null;

  const buildSheet = (i) => {
    const leaf = leaves[i];
    const sheet = h('div', 'fd-sheet');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    const fp = leaf.querySelector('.fd-face-f .fd-page');
    const bp = leaf.querySelector('.fd-face-b .fd-page');
    const strips = [];
    let parent = sheet;
    for (let k = 0; k < 6; k++) {
      const s = h('div', 'fd-strip' + (k === 0 ? ' fd-strip-0' : ''));
      const mk = (cls, src, shift) => {
        const face = h('div', cls);
        const c = src.cloneNode(true);
        for (const im of c.querySelectorAll('img')) im.removeAttribute('loading');
        c.style.marginInlineStart = (-shift * 100) + '%';
        c.style.insetInlineStart = '0';
        const sh = h('div', 'fd-sh');
        face.append(c, sh);
        return face;
      };
      const fF = mk('fd-sf', fp, k);
      const bF = mk('fd-sb', bp, 5 - k);
      const se = h('div', 'fd-se');
      s.append(fF, bF, se);
      parent.appendChild(s);
      strips.push({ el: s, fs: fF.querySelector('.fd-sh'), bs: bF.querySelector('.fd-sh') });
      parent = s;
    }
    leaf.appendChild(sheet);
    sheets[i] = { sheet, strips };
  };

  const shade = (a) => 'color-mix(in srgb, var(--black, #000) ' + (a * 100).toFixed(1) + '%, transparent)';

  const reorder = (turning) => {
    const s = leaves.map((_, i) => (turning === i ? 't' : f - i >= 0.999 ? 'l' : 'r')).join('');
    if (s === sig) return;
    sig = s;
    const act = document.activeElement;
    const left = leaves.filter((_, i) => s[i] === 'l');
    const right = leaves.filter((_, i) => s[i] === 'r').reverse();
    const tl = leaves.filter((_, i) => s[i] === 't');
    for (const e of [...right, ...left, castL, castR, ...tl, corner]) book.appendChild(e);
    if (act && act !== document.body && act.isConnected && book.contains(act)) { try { act.focus({ preventScroll: true }); } catch (e) { /* focus may be refused */ } }
  };

  const sync = (idx) => {
    shown = idx;
    leaves.forEach((leaf, i) => {
      leaf.querySelector('.fd-face-f').inert = !(i === idx);
      leaf.querySelector('.fd-face-b').inert = !(i === idx - 1);
    });
    prev.disabled = idx === 0;
    next.disabled = idx === MAXF;
    book.toggleAttribute('data-end', idx === MAXF);
    const name = names[idx] ?? '';
    book.setAttribute('aria-label', bookLabel + ', ' + name + ', ' + (idx + 1) + ' ' + ofWord + ' ' + (MAXF + 1));
    live.textContent = name + ', ' + (idx + 1) + ' ' + ofWord + ' ' + (MAXF + 1);
    setVar(spreadVar, idx);
    if (!narrow) setVar(savedVar, false);
  };

  const render = () => {
    const F = clamp(f, 0, MAXF);
    let turning = -1;
    leaves.forEach((leaf, i) => {
      const t = clamp(F - i, 0, 1);
      const c = cache[i];
      if (t <= 0.001 || t >= 0.999) {
        const mode = t <= 0.001 ? 'r' : 'l';
        if (c.mode !== mode) {
          leaf.classList.remove('fd-turning');
          const z = ((mode === 'l' ? i : MAXF - 1 - i) * 0.4).toFixed(1);
          leaf.style.transform = 'perspective(2600px) translateZ(' + z + 'px) rotateY(' + (mode === 'l' ? -180 : 0) + 'deg)';
          c.mode = mode;
        }
        return;
      }
      turning = i;
      if (!sheets[i]) buildSheet(i);
      if (c.mode !== 't') { leaf.classList.add('fd-turning'); leaf.style.transform = 'perspective(2600px)'; c.mode = 't'; }
      const { strips } = sheets[i];
      const sp = Math.sin(Math.PI * t);
      let ang = 0;
      const angles = [];
      for (let k = 0; k < 6; k++) {
        const bend = k === 0 ? -180 * t : -34 * sp * dirv * (k / 15);
        ang += bend;
        angles.push(ang);
        strips[k].el.style.transform = 'rotateY(' + bend.toFixed(3) + 'deg)';
      }
      const al = angles.map((a) => 0.34 * Math.abs(Math.sin((a * Math.PI) / 180)));
      for (let k = 0; k < 6; k++) {
        const a0 = al[k], a1 = al[Math.min(5, k + 1)];
        strips[k].fs.style.background = 'linear-gradient(90deg,' + shade(a0) + ',' + shade(a1) + ')';
        strips[k].bs.style.background = 'linear-gradient(90deg,' + shade(a1) + ',' + shade(a0) + ')';
      }
    });
    reorder(turning);
    const shift = F <= 1 ? -0.5 + 0.5 * F : F <= MAXF - 1 ? 0 : 0.5 * (F - (MAXF - 1));
    book.style.setProperty('--fd-shift', shift.toFixed(4));
    blkR.style.setProperty('--n', (MAXF - F).toFixed(3));
    blkL.style.setProperty('--n', F.toFixed(3));
    blkR.style.opacity = Math.min(1, (MAXF - F) * 4).toFixed(3);
    blkL.style.opacity = Math.min(1, F * 4).toFixed(3);
    slabL.style.opacity = smooth(0.82, 1, F).toFixed(3);
    slabR.style.opacity = (1 - smooth(MAXF - 1, MAXF - 0.82, F)).toFixed(3);
    if (turning >= 0) {
      const fr = F - turning;
      const rv = turning < MAXF - 1 ? Math.sin(Math.PI * fr) * (1 - fr) : 0;
      const lv = turning > 0 ? Math.sin(Math.PI * fr) * fr : 0;
      castR.style.opacity = rv.toFixed(3);
      castR.style.inlineSize = (50 * (1 - 0.85 * fr)).toFixed(2) + '%';
      castL.style.opacity = lv.toFixed(3);
      castL.style.inlineSize = (50 * (0.15 + 0.85 * fr)).toFixed(2) + '%';
    } else { castR.style.opacity = '0'; castL.style.opacity = '0'; }
    const idx = clamp(Math.round(F), 0, MAXF);
    if (idx !== shown) sync(idx);
  };

  // ---- spring motion ------------------------------------------------------------
  const step = (now) => {
    let el = last ? clamp((now - last) / 1000, 0.001, 0.25) : 0.016;
    last = now;
    while (el > 0) {
      const dt = Math.min(0.0125, el);
      el -= dt;
      const acc = 90 * (target - f) - 19.5 * vel;
      vel += acc * dt;
      f += vel * dt;
      if (Math.abs(vel) > 0.01) dirv = vel > 0 ? -1 : 1;
      if (Math.abs(target - f) < 0.0005 && Math.abs(vel) < 0.001) { f = target; vel = 0; running = false; break; }
    }
    render();
    if (!running && stopFrame) { stopFrame(); stopFrame = null; }
  };
  const kick = () => {
    if (running) return;
    running = true;
    last = 0;
    if (!stopFrame) stopFrame = ctx.onFrame(step);
  };

  const deckPage = (n) => (n === 0 ? 0 : 2 * n - 1);
  const deckTo = (n) => {
    const el = deck.children[deckPage(n)];
    if (el) deck.scrollTo({ left: el.offsetLeft - (deck.clientWidth - el.offsetWidth) / 2, behavior: ctx.reduced ? 'auto' : 'smooth' });
  };
  const go = (n) => {
    n = clamp(Math.round(n), 0, MAXF);
    if (narrow) { deckTo(n); return; }
    if (n !== target) dirv = n > target ? -1 : 1;
    target = n;
    if (ctx.reduced) { f = n; vel = 0; running = false; render(); return; }
    kick();
  };

  let rafD = 0;
  const onDeckScroll = () => {
    if (!narrow || rafD) return;
    rafD = requestAnimationFrame(() => {
      rafD = 0;
      const mid = deck.scrollLeft + deck.clientWidth / 2;
      let best = 0, bd = 1e9;
      [...deck.children].forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      const idx = Math.floor((best + 1) / 2);
      if (idx !== shown) sync(idx);
    });
  };
  deck.addEventListener('scroll', onDeckScroll, { passive: true });
  prev.addEventListener('click', () => go(Math.round(target) - 1));
  next.addEventListener('click', () => go(Math.round(target) + 1));
  const onClick = (e) => {
    const g = e.target.closest && e.target.closest('[data-go]');
    if (g && wrap.contains(g)) go(Number(g.dataset.go));
  };
  wrap.addEventListener('click', onClick);

  const scope = () => ctx.host.closest('section') || ctx.host;
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    if (a && a !== document.body && !scope().contains(a)) return;
    const r = ctx.host.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    e.preventDefault();
    go((narrow ? shown : Math.round(target)) + (e.key === 'ArrowRight' ? 1 : -1));
  };
  addEventListener('keydown', onKey);

  // ---- drag -------------------------------------------------------------------
  let drag = null;
  book.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, button, input, textarea')) return;
    drag = { x: e.clientX, start: Math.round(f), id: e.pointerId, on: false, pf: f, pt: performance.now(), v: 0 };
  });
  book.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(dx) <= 6) return;
      drag.on = true;
      vel = 0;
      running = false;
      if (stopFrame) { stopFrame(); stopFrame = null; }
      book.setPointerCapture(e.pointerId);
      book.classList.add('fd-drag');
    }
    const pw = book.clientWidth / 2;
    const nf = clamp(drag.start - dx / (1.6 * pw), Math.max(0, drag.start - 1), Math.min(MAXF, drag.start + 1));
    const now = performance.now();
    const dt = Math.max(0.001, (now - drag.pt) / 1000);
    drag.v = drag.v * 0.6 + ((nf - drag.pf) / dt) * 0.4;
    drag.pf = nf;
    drag.pt = now;
    if (Math.abs(nf - f) > 0.0005) dirv = nf > f ? -1 : 1;
    f = nf;
    target = Math.round(f);
    render();
  });
  const release = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    book.classList.remove('fd-drag');
    if (!d.on) {
      const r = book.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x > 0.72) go(Math.round(target) + 1);
      else if (x < 0.28) go(Math.round(target) - 1);
      return;
    }
    const proj = f + clamp(0.15 * d.v, -0.6, 0.6);
    const t = clamp(Math.round(proj), Math.max(0, d.start - 1), Math.min(MAXF, d.start + 1));
    target = t;
    vel = d.v;
    if (ctx.reduced) { f = t; vel = 0; render(); return; }
    kick();
  };
  book.addEventListener('pointerup', release);
  book.addEventListener('pointercancel', release);

  // ---- layout mode, theme, variable ---------------------------------------------------
  const mode = () => {
    const pad = clamp(innerWidth * 0.03, 16, 44);
    const n = ctx.size().width + 2 * pad < 720;
    if (n === narrow) return;
    narrow = n;
    wrap.classList.toggle('fd-narrow', n);
    if (n) deckTo(shown < 0 ? 0 : shown);
  };
  offs.push(ctx.onResize(mode));
  offs.push(ctx.onTheme((m) => wrap.setAttribute('data-fwc-theme', m)));
  offs.push(ctx.onVariable(spreadVar, (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n === shown) return;
    go(n);
  }));

  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  let pre = 0;
  const warm = () => { if (!dead && pre < leaves.length) { if (!sheets[pre]) buildSheet(pre); pre++; idle(warm); } };

  mode();
  render();
  idle(warm);
  requestAnimationFrame(() => { if (!dead) ctx.ready(); });

  return () => {
    dead = true;
    removeEventListener('keydown', onKey);
    if (stopFrame) { stopFrame(); stopFrame = null; }
    cancelAnimationFrame(rafD);
    for (const off of offs) { try { off(); } catch (e) { /* already removed */ } }
    root.replaceChildren();
  };
}
