// Physics deck (C4): slides land on a desk to throw and flip, then sort into a grid and zoom to one slide as the
// page scrolls. Ported from the FormDeck deckhand section. Pin and progress come from a native scene on the template.
export function mount(root, props, ctx) {
  const P = props || {};
  const text = (k, d) => (typeof P[k] === 'string' ? P[k] : d);
  const slides = Array.isArray(P.slides) ? P.slides.filter((s) => s && typeof s === 'object') : [];
  if (!slides.length) return () => {};
  const headline = (Array.isArray(P.headline) ? P.headline : ['Throw them.', 'Sort them.', 'Present.']).map(String).slice(0, 3);
  const N = slides.length;
  const FOCAL = Math.min(N - 1, Math.max(0, Math.round(Number(P.focal ?? 6)) || 0));
  const K = 4.2;
  const KA = 5;
  const RATIO = 0.72;
  const WIN = 0.5625;
  const reduced = () => !!ctx.reduced;

  const CSS = `
.fwc-deck, .fwc-deck *, .fwc-deck *::before, .fwc-deck *::after { box-sizing: border-box; }
.fwc-deck { position: absolute; inset: 0; isolation: isolate; overflow: hidden; --dk-out: cubic-bezier(0.16, 1, 0.3, 1); color: var(--ink, #f5f6f8); font-family: var(--font-ui, system-ui, sans-serif); line-height: 1.55; }
.fwc-deck p, .fwc-deck h1, .fwc-deck h2, .fwc-deck dl, .fwc-deck dd { margin: 0; }
.fwc-deck button { font: inherit; color: inherit; margin: 0; }
.fwc-deck img { display: block; max-width: none; }
.fwc-deck .dk-rule { position: absolute; inset-block: 0; inline-size: 1px; background: var(--edge, rgb(255 255 255 / 0.1)); z-index: var(--z-behind, -1); }
.fwc-deck .dk-rule-a { inset-inline-start: clamp(20px, 11vw, 160px); }
.fwc-deck .dk-rule-b { inset-inline-end: clamp(20px, 11vw, 160px); }
.fwc-deck .dk-cover { position: absolute; inset: 0; z-index: var(--z-field, 150); margin: 0; opacity: 0; pointer-events: none; }
.fwc-deck .dk-cover img { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; object-fit: cover; }
.fwc-deck .dk-top { position: absolute; inset-inline: 0; inset-block-start: 0; z-index: var(--z-sticky, 200); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--sp-4, 16px); padding: var(--sp-3, 12px) clamp(16px, 2.2vw, 32px); border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.1)); background: var(--ground, #0b0c0e); color: var(--ink, #f5f6f8); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.14em; text-transform: uppercase; transition: color 0.4s var(--ease-out, ease), border-color 0.4s var(--ease-out, ease); }
.fwc-deck .dk-top > * { opacity: 0; }
.fwc-deck.dk-go .dk-top > * { animation: fwcdk-drop 1s var(--dk-out) both; }
.fwc-deck.dk-go .dk-top > :nth-child(1) { animation-delay: 0.2s; }
.fwc-deck.dk-go .dk-top > :nth-child(2) { animation-delay: 0.28s; }
.fwc-deck.dk-go .dk-top > :nth-child(3) { animation-delay: 0.36s; }
@keyframes fwcdk-drop { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
.fwc-deck .dk-brand { justify-self: start; font-family: var(--font-ui, system-ui, sans-serif); font-size: var(--fs-m, 1rem); font-weight: var(--weight-display, 700); letter-spacing: var(--track-tight, -0.01em); text-transform: none; }
.fwc-deck .dk-brand .app-form { color: var(--ink, #f5f6f8); }
.fwc-deck .dk-brand .app-suffix { color: var(--hue, #c8ee4f); }
.fwc-deck .dk-vol { justify-self: center; }
.fwc-deck .dk-vol b { margin-inline-start: var(--sp-2, 8px); color: var(--hue, #c8ee4f); font-weight: 400; }
.fwc-deck .dk-read { justify-self: end; display: inline-flex; align-items: center; gap: var(--sp-2, 8px); }
.fwc-deck .dk-count { padding: 2px var(--sp-2, 8px); border: 1px solid var(--hue-line, var(--edge-strong, rgb(255 255 255 / 0.2))); color: var(--hue, #c8ee4f); font-variant-numeric: tabular-nums; }
.fwc-deck.dk-photo .dk-top { background: linear-gradient(to bottom, var(--shade-strong, rgb(0 0 0 / 0.8)), transparent); color: var(--footage-ink, #fff); border-color: var(--footage-line, rgb(255 255 255 / 0.2)); }
.fwc-deck.dk-photo .dk-top .app-form { color: var(--footage-ink, #fff); }
.fwc-deck .dk-hl { position: absolute; inset-inline-start: clamp(20px, 3.1vw, 44px); inset-block-end: clamp(20px, 3.1vw, 44px); z-index: var(--z-raised, 100); margin: 0; font-size: clamp(44px, 5.8vw, 100px); font-weight: 720; line-height: 0.95; letter-spacing: -0.045em; pointer-events: none; }
.fwc-deck .dk-ln { display: block; overflow: hidden; padding-block-end: 0.08em; }
.fwc-deck .dk-ln > span { display: block; transform: translateY(110%); }
.fwc-deck .dk-ln:last-child { color: var(--hue, #c8ee4f); }
.fwc-deck.dk-go .dk-ln > span { animation: fwcdk-up 1.6s var(--dk-out) both; }
.fwc-deck.dk-go .dk-ln:nth-child(1) > span { animation-delay: 0.15s; }
.fwc-deck.dk-go .dk-ln:nth-child(2) > span { animation-delay: 0.24s; }
.fwc-deck.dk-go .dk-ln:nth-child(3) > span { animation-delay: 0.33s; }
@keyframes fwcdk-up { from { transform: translateY(110%); } to { transform: none; } }
.fwc-deck .dk-aside { position: absolute; inset-inline-start: clamp(20px, 3.1vw, 44px); inset-block-start: calc(var(--control-h, 40px) + var(--sp-7, 48px)); z-index: var(--z-raised, 100); inline-size: 270px; max-inline-size: 40vw; color: var(--ink-soft, rgb(255 255 255 / 0.7)); font-size: var(--fs-s, 0.875rem); }
.fwc-deck .dk-aside p { opacity: 0; }
.fwc-deck.dk-go .dk-aside p { animation: fwcdk-fade 1.2s 0.8s var(--dk-out) both; }
@keyframes fwcdk-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.fwc-deck .dk-touch { display: none; }
.fwc-deck.dk-coarse .dk-mouse { display: none; }
.fwc-deck.dk-coarse .dk-touch { display: inline; }
.fwc-deck .dk-desk { position: absolute; inset: 0; z-index: var(--z-raised, 100); }
.fwc-deck .dk-card { position: absolute; inset-inline-start: 0; inset-block-start: 0; inline-size: var(--cw, 200px); block-size: calc(var(--cw, 200px) * 0.72); margin: calc(var(--cw, 200px) * -0.36) 0 0 calc(var(--cw, 200px) * -0.5); z-index: calc(var(--z-base, 0) + var(--zi, 10)); font-size: calc(var(--cw, 200px) * 0.056); line-height: 1.25; opacity: 0; user-select: none; -webkit-user-select: none; touch-action: pan-y; }
.fwc-deck.dk-pile .dk-card { cursor: grab; touch-action: none; }
.fwc-deck.dk-grid .dk-card { cursor: pointer; }
.fwc-deck .dk-card.dk-held { cursor: grabbing; }
.fwc-deck .dk-card:has(.dk-hit:focus-visible) { outline: 2px solid var(--focus, #7aa2ff); outline-offset: 3px; }
.fwc-deck .dk-in { position: absolute; inset: 0; border-radius: var(--radius-m, 8px); background: var(--pane, #15171a); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.2)), 0 6px 8px -6px rgb(0 0 0 / 0.7); transition: transform 0.7s cubic-bezier(0.76, 0, 0.24, 1), box-shadow 0.25s var(--ease-out, ease); }
.fwc-deck .dk-held .dk-in { box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.2)), 0 2px 2px rgb(0 0 0 / 0.3), 0 44px 80px -24px rgb(0 0 0 / 0.9); }
.fwc-deck .dk-flipped .dk-in { transform: scaleX(-1); }
.fwc-deck .dk-face { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; transition: visibility 0s 0.35s; }
.fwc-deck .dk-back { display: grid; align-content: start; gap: 0.35em; padding: 0.9em 1em; background: var(--pane, #15171a); transform: scaleX(-1); visibility: hidden; }
.fwc-deck .dk-flipped .dk-front { visibility: hidden; }
.fwc-deck .dk-flipped .dk-back { visibility: visible; }
.fwc-deck .dk-win { position: relative; inline-size: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--inset, #0e1012); }
.fwc-deck .dk-win img { pointer-events: none; -webkit-user-drag: none; position: absolute; inset: 0; inline-size: 100%; block-size: 100%; object-fit: cover; }
.fwc-deck .dk-lab { display: flex; align-items: baseline; gap: 0.7em; padding: 0.75em 0.9em 0; }
.fwc-deck .dk-no { color: var(--hue, #c8ee4f); font-family: var(--font-mono, ui-monospace, monospace); letter-spacing: 0.1em; }
.fwc-deck .dk-nm { overflow: hidden; color: var(--ink, #f5f6f8); font-weight: var(--weight-strong, 600); text-overflow: ellipsis; white-space: nowrap; }
.fwc-deck .dk-kick { color: var(--hue, #c8ee4f); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.8em; letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-deck .dk-name { color: var(--ink, #f5f6f8); font-size: 1.5em; font-weight: var(--weight-display, 700); line-height: 1.1; letter-spacing: var(--track-tight, -0.01em); }
.fwc-deck .dk-line { color: var(--ink-soft, rgb(255 255 255 / 0.7)); font-size: 0.92em; }
.fwc-deck .dk-meta { display: grid; grid-template-columns: auto 1fr; gap: 0.15em 0.8em; padding-block-start: 0.4em; border-block-start: 1px solid var(--edge, rgb(255 255 255 / 0.1)); font-size: 0.86em; }
.fwc-deck .dk-meta dt { color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-family: var(--font-mono, ui-monospace, monospace); letter-spacing: 0.08em; text-transform: uppercase; }
.fwc-deck .dk-meta dd { margin: 0; color: var(--ink, #f5f6f8); }
.fwc-deck .dk-note { color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-size: 0.86em; }
.fwc-deck .dk-hit { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; padding: 0; border: 0; }
.fwc-deck .dk-idx { position: absolute; inset-inline: 0; inset-block-start: calc(var(--control-h, 40px) + var(--sp-5, 24px) + var(--sp-3, 12px)); z-index: var(--z-raised, 100); display: grid; justify-items: center; gap: var(--sp-2, 8px); text-align: center; opacity: 0; pointer-events: none; }
.fwc-deck .dk-idx p { color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-deck .dk-idx h2 { font-size: var(--fs-xl, 1.75rem); font-weight: var(--weight-display, 700); letter-spacing: var(--track-display, -0.02em); }
.fwc-deck .dk-dock { position: absolute; inset-inline-end: clamp(20px, 3.1vw, 44px); inset-block-end: clamp(20px, 3.1vw, 44px); z-index: var(--z-sticky, 200); display: flex; gap: var(--sp-2, 8px); }
.fwc-deck .dk-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2, 8px); block-size: 48px; padding: 0 var(--sp-5, 24px); border: 0; border-radius: 0; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; white-space: nowrap; cursor: pointer; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease), opacity var(--dur-fast, 140ms) var(--ease-out, ease); }
.fwc-deck .dk-btn svg { flex: none; display: block; inline-size: var(--icon-m, 20px); block-size: var(--icon-m, 20px); }
.fwc-deck .dk-btn-ink { background: var(--ink, #f5f6f8); color: var(--on-ink, #0b0c0e); }
.fwc-deck .dk-btn-ink:hover { opacity: 0.88; }
.fwc-deck .dk-btn-quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.2)); color: var(--ink, #f5f6f8); }
.fwc-deck .dk-btn-quiet:hover { background: var(--control, #1d2024); }
.fwc-deck .dk-btn:focus-visible { outline: 2px solid var(--focus, #7aa2ff); outline-offset: 2px; }
.fwc-deck .dk-dock .dk-btn { opacity: 0; }
.fwc-deck.dk-go .dk-dock .dk-btn { animation: fwcdk-fade 1.2s var(--dk-out) both; }
.fwc-deck.dk-go .dk-dock .dk-btn:nth-child(1) { animation-delay: 0.9s; }
.fwc-deck.dk-go .dk-dock .dk-btn:nth-child(2) { animation-delay: 1s; }
.fwc-deck .dk-dock .dk-btn[disabled] { cursor: progress; opacity: 0.5; }
.fwc-deck .dk-fin { position: absolute; inset: 0; z-index: var(--z-sticky, 200); display: grid; align-content: end; justify-items: start; gap: var(--sp-3, 12px); padding: 0 clamp(20px, 3.1vw, 44px) clamp(20px, 3.1vw, 44px); background: linear-gradient(to top, var(--shade-strong, rgb(0 0 0 / 0.8)) 0%, var(--shade-mid, rgb(0 0 0 / 0.45)) 55%, transparent 90%); color: var(--footage-ink, #fff); opacity: 0; pointer-events: none; }
.fwc-deck .dk-meta2 { color: var(--footage-soft, rgb(255 255 255 / 0.75)); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-deck .dk-fin h2 { font-size: clamp(56px, 11vw, 176px); font-weight: 720; line-height: 0.9; letter-spacing: -0.05em; }
.fwc-deck .dk-fin .dk-subline { max-inline-size: 44ch; color: var(--footage-soft, rgb(255 255 255 / 0.75)); font-size: var(--fs-l, 1.125rem); }
.fwc-deck .dk-fin .dk-btn { margin-block-start: var(--sp-2, 8px); }
.fwc-deck .dk-loader { position: absolute; inset: 0; z-index: var(--z-raised, 100); display: grid; place-items: center; color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.2em; text-transform: uppercase; transition: opacity 0.4s var(--ease-out, ease); }
.fwc-deck .dk-loader.dk-done { opacity: 0; pointer-events: none; }
.fwc-deck.dk-phone .dk-top { grid-template-columns: 1fr auto; }
.fwc-deck.dk-phone .dk-vol, .fwc-deck.dk-phone .dk-aside, .fwc-deck.dk-phone .dk-note { display: none; }
.fwc-deck.dk-phone .dk-hl { inset-block: calc(var(--control-h, 40px) + var(--sp-8, 64px) - 24px) auto; font-size: min(13vw, 68px); }
.fwc-deck.dk-phone .dk-dock { inset-inline: 16px; justify-content: center; }
.fwc-deck.dk-reduced .dk-in, .fwc-deck.dk-reduced .dk-face, .fwc-deck.dk-reduced .dk-top { transition: none; }
.fwc-deck.dk-reduced.dk-go .dk-top > *, .fwc-deck.dk-reduced.dk-go .dk-ln > span, .fwc-deck.dk-reduced.dk-go .dk-aside p, .fwc-deck.dk-reduced.dk-go .dk-dock .dk-btn { animation: none; opacity: 1; transform: none; }
`;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const pad2 = (n) => String(n).padStart(2, '0');

  const h = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const arrow = (d1, d2) => {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    for (const d of [d1, d2]) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.append(p);
    }
    return s;
  };

  // DOM ----------------------------------------------------------------------------------------------------
  const style = h('style');
  style.textContent = CSS;
  const wrap = h('div', 'fwc-deck dk-pile');
  root.append(style, wrap);
  if (matchMedia('(pointer: coarse)').matches) wrap.classList.add('dk-coarse');

  wrap.append(h('div', 'dk-rule dk-rule-a'), h('div', 'dk-rule dk-rule-b'));

  const cover = h('figure', 'dk-cover');
  cover.setAttribute('aria-hidden', 'true');
  const coverImg = h('img');
  coverImg.src = String(slides[FOCAL].src || '');
  coverImg.width = 1280;
  coverImg.height = 721;
  coverImg.alt = '';
  coverImg.decoding = 'async';
  cover.append(coverImg);

  const top = h('div', 'dk-top');
  const brand = h('span', 'dk-brand');
  brand.append(h('span', 'app-form', text('brandForm', 'Form')), h('span', 'app-suffix', text('brandSuffix', 'Deck')));
  const vol = h('span', 'dk-vol', text('volume', 'Deckhand'));
  vol.append(h('b', '', String(N)));
  const read = h('span', 'dk-read');
  const countEl = h('span', 'dk-count', '00');
  read.append(document.createTextNode(text('flippedLabel', 'Flipped') + ' '), countEl, document.createTextNode(' / ' + N));
  top.append(brand, vol, read);

  const hl = h('h1', 'dk-hl');
  for (const line of headline) {
    const ln = h('span', 'dk-ln');
    ln.append(h('span', '', line));
    hl.append(ln);
  }

  const aside = h('div', 'dk-aside');
  const asideP = h('p');
  asideP.append(h('span', 'dk-mouse', text('asideMouse', 'Drag a slide, click it to flip, then scroll.')), h('span', 'dk-touch', text('asideTouch', 'Drag and tap a slide, then scroll.')));
  aside.append(asideP);

  const idx = h('div', 'dk-idx');
  idx.append(h('p', '', text('indexKicker', "Twelve slides from FormDeck's demos")), h('h2', '', text('indexTitle', 'One deck, ready.')));

  const desk = h('div', 'dk-desk');
  const els = slides.map((sl, i) => {
    const card = h('div', 'dk-card');
    card.dataset.i = String(i);
    const inn = h('div', 'dk-in');
    const front = h('div', 'dk-face dk-front');
    const win = h('div', 'dk-win');
    const img = h('img');
    img.src = String(sl.src || '');
    img.width = 1280;
    img.height = 721;
    img.alt = String(sl.alt || '');
    img.decoding = 'async';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    win.append(img);
    const lab = h('p', 'dk-lab');
    lab.append(h('span', 'dk-no', pad2(i + 1)), h('span', 'dk-nm', String(sl.title || '')));
    front.append(win, lab);
    const back = h('div', 'dk-face dk-back');
    back.append(h('p', 'dk-kick', String(sl.kicker || '')), h('p', 'dk-name', String(sl.title || '')), h('p', 'dk-line', String(sl.line || '')));
    const meta = h('dl', 'dk-meta');
    for (const pair of Array.isArray(sl.meta) ? sl.meta : []) {
      if (Array.isArray(pair)) meta.append(h('dt', '', String(pair[0] ?? '')), h('dd', '', String(pair[1] ?? '')));
    }
    back.append(meta, h('p', 'dk-note', String(sl.note || '')));
    inn.append(front, back);
    const hit = h('button', 'dk-hit', pad2(i + 1) + ' ' + String(sl.title || ''));
    hit.type = 'button';
    hit.setAttribute('aria-pressed', 'false');
    hit.disabled = true;
    card.append(inn, hit);
    desk.append(card);
    return card;
  });

  const dock = h('div', 'dk-dock');
  const btnShuffle = h('button', 'dk-btn dk-btn-quiet');
  btnShuffle.type = 'button';
  btnShuffle.disabled = true;
  btnShuffle.append(h('span', '', text('shuffleLabel', 'Shuffle')));
  const btnSort = h('button', 'dk-btn dk-btn-ink');
  btnSort.type = 'button';
  btnSort.disabled = true;
  btnSort.append(h('span', '', text('sortLabel', 'Sort the slides')), arrow('M12 5v14', 'M6 13l6 6 6-6'));
  dock.append(btnShuffle, btnSort);

  const fin = h('div', 'dk-fin');
  const btnAgain = h('button', 'dk-btn dk-btn-quiet');
  btnAgain.type = 'button';
  btnAgain.append(h('span', '', text('againLabel', 'Throw them again')), arrow('M12 19V5', 'M6 11l6-6 6 6'));
  fin.append(h('p', 'dk-meta2', text('finMeta', '')), h('h2', '', text('finTitle', 'Present.')), h('p', 'dk-subline', text('finText', '')), btnAgain);

  const loader = h('p', 'dk-loader', text('loadingLabel', 'Loading slides'));
  loader.setAttribute('role', 'status');

  wrap.append(cover, top, hl, aside, idx, desk, dock, fin, loader);

  // State --------------------------------------------------------------------------------------------------
  let W = 0, H = 0, cw = 0, gw = 0, gScale = 1, phone = false;
  let cols = 4;
  let ready = false;
  let sortAmt = 0, zoomAmt = 0, prog = 0, target = 0;
  let zc = 10;
  let drag = null;
  let last = 0;
  let scrollAnim = null;
  let scene = null;
  const seen = new Set();
  const grid = [];
  const mode = { pile: true, zoom: false };
  const S = els.map((el, i) => ({
    el, i, btn: el.querySelector('.dk-hit'),
    x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0,
    hx: 0, hy: 0, ha: 0, jx: 0, jy: 0, cell: i,
    wait: 0, pending: false, vis: false, entered: false,
    flipped: false, held: false, zi: 10, zr: -1, shownFlip: false, op: -1,
  }));

  // The sticky stage and its tall track come from the template's native scene.
  const findScene = () => {
    if (scene && scene.stage.isConnected) return scene;
    for (let n = ctx.host.parentElement; n; n = n.parentElement) {
      if (getComputedStyle(n).position === 'sticky' && n.parentElement) {
        scene = { stage: n, track: n.parentElement };
        return scene;
      }
    }
    return null;
  };
  const topOffset = () => { const s = findScene(); return s ? parseFloat(getComputedStyle(s.stage).top) || 0 : 0; };
  const readScroll = () => {
    if (!reduced()) return clamp(ctx.progress());
    const s = findScene();
    if (!s) return 0;
    const r = s.track.getBoundingClientRect();
    const span = s.track.offsetHeight - s.stage.offsetHeight;
    return span > 0 ? clamp((topOffset() - r.top) / span) : 0;
  };

  function shuffleOrder() {
    const order = els.map((_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    S.forEach((s, i) => {
      s.cell = order[i];
      s.jx = rand(-1, 1) * 0.32;
      s.jy = rand(-1, 1) * 0.3;
      s.ha = rand(-0.38, 0.38);
    });
  }

  function computeHomes() {
    const x0 = phone ? W * 0.14 : W * 0.36;
    const x1 = phone ? W * 0.86 : W * 0.93;
    const y0 = phone ? H * 0.4 : H * 0.2;
    const y1 = phone ? H * 0.8 : H * 0.8;
    cols = phone ? 3 : 4;
    const rows = Math.ceil(N / cols);
    const cwid = (x1 - x0) / cols;
    const chei = (y1 - y0) / rows;
    for (const s of S) {
      const c = s.cell % cols;
      const r = Math.floor(s.cell / cols);
      s.hx = x0 + (c + 0.5) * cwid + s.jx * cwid;
      s.hy = y0 + (r + 0.5) * chei + s.jy * chei;
    }
  }

  function computeGrid() {
    const headH = phone ? 138 : 150;
    const footH = phone ? 40 : 56;
    const gap = phone ? 10 : 18;
    const side = phone ? 16 : Math.max(32, W * 0.06);
    const availW = W - side * 2;
    const availH = H - headH - footH;
    let best = { c: 2, size: 0 };
    for (let c = 2; c <= 8; c++) {
      const r = Math.ceil(N / c);
      const size = Math.min((availW - (c - 1) * gap) / c, (availH - (r - 1) * gap) / r / RATIO);
      if (size > best.size) best = { c, size };
    }
    gw = Math.max(20, best.size);
    const c = best.c;
    const r = Math.ceil(N / c);
    const gh = gw * RATIO;
    const blockH = r * gh + (r - 1) * gap;
    const topY = headH + (availH - blockH) / 2;
    gScale = gw / cw;
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / c);
      const inRow = row === r - 1 ? N - c * (r - 1) : c;
      const col = i - row * c;
      const rowW = inRow * gw + (inRow - 1) * gap;
      grid[i] = { x: (W - rowW) / 2 + col * (gw + gap) + gw / 2, y: topY + row * (gh + gap) + gh / 2 };
    }
  }

  function layout(first) {
    const oW = W, oH = H;
    const sz = ctx.size();
    W = sz.width || root.clientWidth;
    H = sz.height || root.clientHeight;
    if (!W || !H) return;
    phone = W < 700;
    wrap.classList.toggle('dk-phone', phone);
    if (phone) cw = clamp(W * 0.36, 110, 160);
    else cw = Math.min(clamp(W * 0.155, 130, 280), (H * 0.3) / RATIO);
    wrap.style.setProperty('--cw', cw + 'px');
    if (!first && oW && oH) {
      for (const s of S) { s.x *= W / oW; s.y *= H / oH; }
    }
    computeHomes();
    computeGrid();
  }

  function setFlip(s, on) {
    s.flipped = on;
    s.btn.setAttribute('aria-pressed', String(on));
  }

  function toggleFlip(s) {
    setFlip(s, !s.flipped);
    if (!seen.has(s.i)) {
      seen.add(s.i);
      countEl.textContent = pad2(seen.size);
    }
  }

  function launch(s) {
    if (reduced()) {
      s.x = s.hx; s.y = s.hy; s.a = s.ha; s.vx = s.vy = s.va = 0;
      return;
    }
    s.vx = (s.hx - s.x) * K;
    s.vy = (s.hy - s.y) * K;
    s.va = (s.ha - s.a) * KA;
    s.entered = s.entered || s.y < H - cw / 3;
  }

  function relaunch(stagger) {
    shuffleOrder();
    computeHomes();
    S.forEach((s, i) => {
      s.ha += rand(-0.3, 0.3);
      s.wait = reduced() ? 0 : stagger * i;
      s.pending = true;
      s.held = false;
      s.el.classList.remove('dk-held');
    });
    drag = null;
    if (reduced()) S.forEach((s) => { launch(s); s.pending = false; });
  }

  function deal() {
    shuffleOrder();
    computeHomes();
    S.forEach((s, i) => {
      s.x = s.hx + rand(-0.2, 0.2) * W;
      s.y = H + cw * 1.2;
      s.a = s.ha + rand(-1.4, 1.4);
      s.wait = reduced() ? 0 : 0.15 + 0.075 * i;
      s.pending = true;
      s.vis = reduced();
      s.entered = false;
      if (reduced()) { s.x = s.hx; s.y = s.hy; s.a = s.ha; s.pending = false; s.entered = true; }
    });
  }

  function step(dt) {
    const e = Math.exp(-K * dt);
    const ea = Math.exp(-KA * dt);
    const l = cw / 3, r = W - cw / 3, b = H - cw / 3, t = cw / 3 + 50;
    for (const s of S) {
      if (s.held) continue;
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait > 0) continue;
      }
      if (s.pending) { s.pending = false; s.vis = true; launch(s); }
      s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
      s.vx *= e; s.vy *= e; s.va *= ea;
      if (!s.entered) { if (s.y < b) s.entered = true; else continue; }
      if (s.x < l) { s.x = l; if (s.vx < 0) { s.vx = -s.vx * 0.45; s.va -= s.vy * 0.002; } }
      else if (s.x > r) { s.x = r; if (s.vx > 0) { s.vx = -s.vx * 0.45; s.va += s.vy * 0.002; } }
      if (s.y > b) { s.y = b; if (s.vy > 0) { s.vy = -s.vy * 0.45; s.va -= s.vx * 0.002; } }
      else if (s.y < t) { s.y = t; if (s.vy < 0) { s.vy = -s.vy * 0.45; s.va += s.vx * 0.002; } }
    }
  }

  function render() {
    const Fx = grid[FOCAL].x, Fy = grid[FOCAL].y - gw * (RATIO - WIN) / 2;
    const zmax = Math.max(W / gw, H / (gw * WIN)) * 1.01;
    const ze = zoomAmt;
    const Z = Math.exp(Math.log(zmax) * ze);
    const cx = lerp(Fx, W / 2, ze), cy = lerp(Fy, H / 2, ze);
    const fade = 1 - smooth(range(ze, 0.15, 0.55));
    for (const s of S) {
      const e = easeIO(clamp((sortAmt - 0.045 * s.i) / 0.46));
      const g = grid[s.i];
      let x = lerp(s.x, g.x, e);
      let y = lerp(s.y, g.y, e);
      const a = s.a * (1 - e);
      let sc = lerp(1, gScale, e) * (1 + 0.12 * Math.sin(Math.PI * e));
      if (ze > 0) {
        x = (x - Fx) * Z + cx;
        y = (y - Fy) * Z + cy;
        sc *= Z;
      }
      const el = s.el;
      el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${a.toFixed(4)}rad) scale(${sc.toFixed(4)})`;
      const op = !s.vis ? 0 : s.i === FOCAL ? 1 : fade;
      if (op !== s.op) { el.style.opacity = op; s.op = op; }
      const zi = s.i === FOCAL && ze > 0 ? 900 : e > 0 && e < 1 ? 400 + s.i : s.zi;
      if (zi !== s.zr) { el.style.setProperty('--zi', zi); s.zr = zi; }
      const showFlip = s.flipped && !(s.i === FOCAL && ze > 0);
      if (showFlip !== s.shownFlip) { el.classList.toggle('dk-flipped', showFlip); s.shownFlip = showFlip; }
    }
  }

  function chrome(p) {
    let io, fo, hlo, aso, dko;
    if (reduced()) {
      const st = p < 0.25 ? 0 : p < 0.75 ? 1 : 2;
      sortAmt = st >= 1 ? 1 : 0;
      zoomAmt = st === 2 ? 1 : 0;
      hlo = aso = dko = st === 0 ? 1 : 0;
      io = st === 1 ? 1 : 0;
      fo = st === 2 ? 1 : 0;
    } else {
      sortAmt = smooth(range(p, 0.07, 0.46));
      zoomAmt = smooth(range(p, 0.6, 0.9));
      hlo = 1 - smooth(range(p, 0.04, 0.11));
      aso = 1 - smooth(range(p, 0.055, 0.125));
      dko = 1 - smooth(range(p, 0.07, 0.14));
      io = smooth(range(p, 0.36, 0.42)) * (1 - smooth(range(p, 0.58, 0.63)));
      fo = smooth(range(p, 0.91, 0.98));
    }
    const put = (el, o, rise) => {
      el.style.opacity = o;
      el.style.transform = `translate3d(0,${((1 - o) * -rise).toFixed(2)}px,0)`;
      el.style.pointerEvents = o < 0.5 ? 'none' : '';
    };
    put(hl, hlo, 20);
    put(aside, aso, 20);
    put(dock, dko, 20);
    const iy = p < 0.5 ? (1 - smooth(range(p, 0.36, 0.42))) * 16 : -smooth(range(p, 0.58, 0.63)) * 16;
    idx.style.opacity = io;
    idx.style.transform = `translate3d(0,${iy.toFixed(2)}px,0)`;
    fin.style.opacity = fo;
    fin.style.transform = `translate3d(0,${((1 - fo) * 30).toFixed(2)}px,0)`;
    fin.style.pointerEvents = fo > 0.5 ? 'auto' : 'none';
    fin.toggleAttribute('inert', fo <= 0.5);
    const cv = reduced() ? zoomAmt : smooth(range(zoomAmt, 0.86, 0.96));
    cover.style.opacity = cv;
    const pile = sortAmt <= 0.002;
    if (pile !== mode.pile) {
      wrap.classList.toggle('dk-pile', pile);
      wrap.classList.toggle('dk-grid', !pile);
      mode.pile = pile;
      if (!pile && drag) dropDrag();
    }
    const zm = zoomAmt > 0;
    if (zm !== mode.zoom) {
      wrap.classList.toggle('dk-photo', zm);
      mode.zoom = zm;
    }
  }

  function scrollToProgress(p, dur, done) {
    const s = findScene();
    if (!s) { if (done) done(); return; }
    const r = s.track.getBoundingClientRect();
    const span = s.track.offsetHeight - s.stage.offsetHeight;
    const y1 = scrollY + r.top - topOffset() + p * span;
    const y0 = scrollY;
    if (reduced() || Math.abs(y1 - y0) < 2) { scrollTo(0, y1); scrollAnim = null; if (done) done(); return; }
    scrollAnim = { t0: 0, y0, y1, dur: dur * 1000, done };
  }

  function stepScroll(now) {
    const a = scrollAnim;
    if (!a) return;
    if (!a.t0) a.t0 = now;
    const k = clamp((now - a.t0) / a.dur);
    scrollTo(0, lerp(a.y0, a.y1, easeIO(k)));
    if (k >= 1) {
      scrollAnim = null;
      if (a.done) a.done();
    }
  }

  function frame(now) {
    if (!ctx.visible()) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    stepScroll(now);
    target = readScroll();
    if (reduced()) prog = target;
    else prog = lerp(prog, target, 1 - Math.pow(1 - 0.085, dt * 60));
    if (Math.abs(prog - target) < 0.0002) prog = target;
    wrap.classList.toggle('dk-reduced', reduced());
    chrome(prog);
    if (ready) step(dt);
    render();
  }

  function dropDrag() {
    if (!drag) return;
    drag.s.held = false;
    drag.s.el.classList.remove('dk-held');
    drag = null;
  }

  function stagePoint(e) {
    const r = wrap.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  els.forEach((el, i) => {
    const s = S[i];
    el.addEventListener('pointerdown', (e) => {
      if (!ready || mode.zoom || (e.button !== undefined && e.button > 0) || drag) return;
      const p = stagePoint(e);
      const canDrag = sortAmt <= 0.002;
      drag = { s, id: e.pointerId, px: p.x, py: p.y, moved: 0, canDrag, lastMove: e.timeStamp, rx: p.x - s.x, ry: p.y - s.y, vx: 0, vy: 0, va: 0 };
      el.setPointerCapture(e.pointerId);
      if (canDrag) {
        s.held = true;
        s.vx = s.vy = s.va = 0;
        zc += 1;
        s.zi = zc;
        el.classList.add('dk-held');
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.s !== s || e.pointerId !== drag.id) return;
      const p = stagePoint(e);
      const dx = p.x - drag.px, dy = p.y - drag.py;
      drag.moved += Math.hypot(dx, dy);
      if (!drag.canDrag) { drag.px = p.x; drag.py = p.y; return; }
      const d2 = drag.rx * drag.rx + drag.ry * drag.ry + Math.pow(cw * 0.9, 2);
      const da = clamp(((drag.rx * dy - drag.ry * dx) / d2) * 0.9, -0.25, 0.25);
      const c = Math.cos(da), sn = Math.sin(da);
      const nrx = drag.rx * c - drag.ry * sn;
      const nry = drag.rx * sn + drag.ry * c;
      drag.rx = nrx; drag.ry = nry;
      const ox = s.x, oy = s.y;
      s.a += da;
      s.x = clamp(p.x - drag.rx, 0, W);
      s.y = clamp(p.y - drag.ry, 0, H);
      const dt = Math.max((e.timeStamp - drag.lastMove) / 1000, 0.001);
      const al = 1 - Math.exp(-dt * 18);
      drag.vx += ((s.x - ox) / dt - drag.vx) * al;
      drag.vy += ((s.y - oy) / dt - drag.vy) * al;
      drag.va += (da / dt - drag.va) * al;
      drag.lastMove = e.timeStamp;
      drag.px = p.x; drag.py = p.y;
    });
    const end = (e) => {
      if (!drag || drag.s !== s || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      s.held = false;
      el.classList.remove('dk-held');
      if (e.type === 'pointerup' && d.moved < 7) {
        toggleFlip(s);
        return;
      }
      if (!d.canDrag || e.type === 'pointercancel') return;
      if (reduced() || e.timeStamp - d.lastMove > 90) { s.vx = s.vy = s.va = 0; return; }
      const sp = Math.hypot(d.vx, d.vy);
      const k = sp > 4200 ? 4200 / sp : 1;
      s.vx = d.vx * k; s.vy = d.vy * k;
      s.va = clamp(d.va, -14, 14);
      s.entered = true;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    s.btn.addEventListener('click', (e) => { if (e.detail === 0) toggleFlip(s); });
  });

  btnShuffle.addEventListener('click', () => relaunch(0.03));
  btnSort.addEventListener('click', () => scrollToProgress(0.5, 1.6));
  btnAgain.addEventListener('click', () => {
    for (const s of S) setFlip(s, false);
    scrollToProgress(0, 2.2, () => relaunch(0.03));
  });

  const cancelScroll = () => { scrollAnim = null; };
  const cancelEvents = ['wheel', 'touchstart', 'keydown'];
  for (const ev of cancelEvents) addEventListener(ev, cancelScroll, { passive: true });

  const offResize = ctx.onResize(() => layout(false));
  const offFrame = ctx.onFrame(frame);

  layout(true);
  deal();
  prog = target = readScroll();
  chrome(prog);
  render();
  wrap.classList.toggle('dk-reduced', reduced());
  ctx.ready();

  const imgReady = (img) => new Promise((res) => {
    if (img.complete) return res();
    img.addEventListener('load', res, { once: true });
    img.addEventListener('error', res, { once: true });
  });
  const shown = [...wrap.querySelectorAll('.dk-card .dk-front img')];
  let alive = true;
  Promise.race([
    Promise.all([document.fonts ? document.fonts.ready : null, ...shown.map(imgReady)]),
    new Promise((r) => setTimeout(r, 1200)),
  ]).then(() => {
    if (!alive) return;
    ready = true;
    loader.classList.add('dk-done');
    wrap.classList.add('dk-go');
    for (const s of S) s.btn.disabled = false;
    btnShuffle.disabled = false;
    btnSort.disabled = false;
    if (!reduced()) deal();
  });

  return () => {
    alive = false;
    offResize();
    offFrame();
    for (const ev of cancelEvents) removeEventListener(ev, cancelScroll);
    wrap.remove();
    style.remove();
  };
}
