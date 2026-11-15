// Tile cut (C6). Ported from the webspun formvis-tiles section script.
// The template's scene pins the stage and gives the smoothed scroll progress. This module owns the recursive tile
// layout, the pointer slide, the click re-cut and the merge. Copy, buttons and the closing panel are native nodes in
// the stage; this module finds them by data-vt-* attributes and keeps them in step.
export function mount(root, props, ctx) {
  const P = props || {};
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const T = {
    loading: str(P.loadingLabel, 'Loading the still'),
    layer: str(P.layerLabel, 'Layer'),
    capLayers: str(P.capLayers, 'layers cut,'),
    capNow: str(P.capNow, 'now one image'),
    recut: str(P.recutLabel, 'Re-cut layers'),
    newSet: str(P.newSetLabel, 'Load a new set'),
    label: str(P.label, '')
  };
  const COPY = {
    mouse: str(P.copyMouse, 'A still being relit in FormVis, cut into layers and stacked. Click a layer to re-cut it, or move across the pile to slide them apart.'),
    touch: str(P.copyTouch, 'A still being relit in FormVis, cut into layers and stacked. Drag a finger across the pile to slide them apart, and tap a layer to re-cut it.'),
    done: str(P.copyDone, 'The cuts are used up. Load a new set to re-cut the pile, or scroll to merge every layer back down.'),
    fail: str(P.copyFail, 'The image could not be loaded here. Reload the page to try again.')
  };
  const CUTS = Number.isFinite(+P.cuts) && +P.cuts > 0 ? Math.round(+P.cuts) : 36;
  const SRC = typeof P.image === 'string' && P.image ? ctx.asset(P.image) : '';
  const AR = 1481 / 1400;
  const GRID = '000021103333221344443222100009200000311134333222544432231021292000003232333333334443332321101920000033333433333353643324213119200000333334333333645334232131193100003343343433335455552421220931000033434433333354553534213549410000334344343332445535452124594000003344333333325455455531344940010033434433333244443563396339642310333334333332345645453855468410003343433323937955453542243359220043334334399248794534353362491111333347739732444599345234334700123233798993223439999345343335000134333489343224187998333322240010552325931226776671079533133200107799590323847788600531427333003139999202122189766134046579530016998950011387699641142374555321126996100055678998743670845578222239951000887674959767524333223212356753123221429353343233412423233452323212313273422441324224221111312132122332413123123122341100112221211122323222112122224511001112211111123232222223122245100011111001122341212212223222540000111111321113322122021132244300001111231112222212222220122354';
  const GX = 32, GY = 30;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const ss = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const eio = (t) => { t = clamp(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  const doc = root.ownerDocument;
  const mk = (tag, cls) => { const n = doc.createElement(tag); if (cls) n.className = cls; return n; };

  root.classList.add('fwc-tilecut');
  if (P.accent) root.style.setProperty('--vt-accent', String(P.accent));
  const style = doc.createElement('style');
  style.textContent = `
.fwc-tilecut { --vt-accent: var(--hue, #eef0f4); -webkit-user-select: none; user-select: none; touch-action: pan-y; }
.fwc-tilecut .vt-grp { position: absolute; inset-inline-start: 64%; inset-block-start: calc(50% + 16px); translate: -50% -50%; inline-size: min(54cqw, 84cqh * 1.0579); aspect-ratio: 1481 / 1400; z-index: var(--z-base, 0); transform-origin: 50% 50%; will-change: transform; }
.fwc-tilecut.vt-narrow .vt-grp { inset-inline-start: 50%; inset-block-start: 21%; translate: -50% 0; block-size: auto; inline-size: min(94cqw, 56cqh * 1.0579); }
.fwc-tilecut .vt-box { position: absolute; inset: 0; }
.fwc-tilecut .vt-tile { position: absolute; overflow: hidden; will-change: transform, opacity; pointer-events: none; opacity: 0; }
.fwc-tilecut .vt-ti { position: absolute; max-inline-size: none; pointer-events: none; will-change: transform; display: block; }
.fwc-tilecut .vt-fl { position: absolute; inset: 0; background: var(--footage-ink, #fff); opacity: 0; pointer-events: none; }
.fwc-tilecut .vt-st { position: absolute; inset-inline-end: 3px; inset-block-end: 2px; padding: 1px 4px; background: color-mix(in srgb, var(--ground, #14161b) 82%, transparent); font-family: var(--font-mono, ui-monospace, monospace); font-size: 9px; line-height: 1.2; color: var(--vt-accent); letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; pointer-events: none; }
.fwc-tilecut .vt-whole { position: absolute; inset: 0; max-inline-size: none; inline-size: 100%; block-size: 100%; opacity: 0; pointer-events: none; box-shadow: var(--shadow-window); display: block; }
.fwc-tilecut .vt-load { position: absolute; inset-inline: 0; inset-block-start: 50%; margin: 0; text-align: center; font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint, #6b7283); z-index: var(--z-raised, 100); transition: opacity var(--dur, 240ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-tilecut.vt-loaded .vt-load { opacity: 0; }
.fwc-tilecut .vt-cap { position: absolute; inset-inline-start: 44px; inset-block-start: 50%; margin: 0; z-index: var(--z-raised, 100); opacity: 0; pointer-events: none; font-size: clamp(28px, 3.4vw, 52px); font-weight: var(--weight-display, 640); letter-spacing: -0.035em; line-height: 1.05; max-inline-size: min(420px, 30vw); text-wrap: balance; color: var(--ink, #eef0f4); will-change: transform, opacity; }
.fwc-tilecut .vt-cap b { font-weight: inherit; }
.fwc-tilecut .vt-cap span { display: block; color: var(--vt-accent); }
`;
  const grp = mk('div', 'vt-grp');
  grp.setAttribute('role', 'img');
  if (T.label) grp.setAttribute('aria-label', T.label);
  const box = mk('div', 'vt-box');
  const tilesEl = mk('div');
  const whole = mk('img', 'vt-whole');
  whole.alt = '';
  whole.draggable = false;
  whole.decoding = 'async';
  whole.width = 1481;
  whole.height = 1400;
  box.append(tilesEl, whole);
  grp.append(box);
  const loadEl = mk('p', 'vt-load');
  loadEl.setAttribute('role', 'status');
  loadEl.textContent = T.loading;
  const cap = mk('p', 'vt-cap');
  cap.setAttribute('aria-hidden', 'true');
  const capn = mk('b');
  const capTail = mk('span');
  capTail.textContent = T.capNow;
  cap.append(capn, doc.createTextNode(' '), capTail);
  root.append(style, grp, loadEl, cap);

  const stage = ctx.host.parentElement || root;
  const q = (sel) => stage.querySelector(sel);
  const cnt = q('[data-vt-count]'), copyp = q('[data-vt-copy]'), shuf = q('[data-vt-recut]'), backB = q('[data-vt-back]'), fin = q('[data-vt-fin]');
  const scEls = [...stage.querySelectorAll('[data-vt-sc]')];

  let RM = ctx.reduced;
  const coarse = matchMedia('(pointer:coarse)').matches;
  let cuts = CUTS, state = coarse ? 'touch' : 'mouse';
  const setCopy = (k) => { state = k; if (copyp) copyp.textContent = COPY[k]; };
  setCopy(state);

  const layout = () => {
    const r = rng(1), out = [];
    const go = (x, y, w, h, d) => {
      const W = w * AR, H = h;
      let split = W > 0.24 || H > 0.19;
      if (!split && W > 0.125 && H > 0.095 && r() < 0.45) split = true;
      if (!split || d >= 14) { out.push({ x, y, w, h }); return; }
      let vert;
      if (W > 1.1 * H) vert = true; else if (H > 1.1 * W) vert = false; else vert = r() < 0.5;
      const t = 0.32 + r() * 0.36;
      if (vert) { go(x, y, w * t, h, d + 1); go(x + w * t, y, w * (1 - t), h, d + 1); }
      else { go(x, y, w, h * t, d + 1); go(x, y + h * t, w, h * (1 - t), d + 1); }
    };
    go(0, 0, 1, 1, 0);
    return out;
  };
  const roll = (r) => ({ ox: (r() * 2 - 1) * 0.013, oy: (r() * 2 - 1) * 0.01, rot: (r() * 2 - 1) * 2.2, sc: 0.975 + r() * 0.05, cx: (r() * 2 - 1) * 0.015, cy: (r() * 2 - 1) * 0.012, ins: 1.5 + r() * 2.5, br: 0.9 + r() * 0.22, sat: 0.82 + r() * 0.4, sep: r() < 0.3 ? r() * 0.18 : 0 });
  const KEYS = ['ox', 'oy', 'rot', 'sc', 'cx', 'cy', 'ins', 'br', 'sat', 'sep'];

  let tiles = [], bw = 1, bh = 1, sw = 1, sh = 1, zoomS = 1, zdx = 0, zdy = 0, ready = false, eng = 0, assemble = 0, fcache = -9;
  const R = rng(99);
  const pt = { x: 0, y: 0, seen: -99, inside: false };
  const ps = { x: 0, y: 0 }, pres = { v: 0 };
  let now = 0, lastCur = -1, cur = 0;

  const measure = () => {
    root.classList.toggle('vt-narrow', stage.clientWidth <= 699);
    bw = box.offsetWidth; bh = box.offsetHeight; sw = stage.clientWidth; sh = stage.clientHeight;
    const prev = grp.style.transform;
    grp.style.transform = 'none';
    const gr = grp.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    grp.style.transform = prev;
    const cx = gr.left + gr.width / 2 - sr.left, cy = gr.top + gr.height / 2 - sr.top;
    zoomS = Math.max(sw / bw, sh / bh) * 1.02; zdx = sw / 2 - cx; zdy = sh / 2 - cy;
    lastCur = -1;
  };

  const activity = (t) => {
    let hit = 0, tot = 0;
    const x0 = Math.floor(t.x * GX), x1 = Math.max(x0 + 1, Math.ceil((t.x + t.w) * GX)), y0 = Math.floor(t.y * GY), y1 = Math.max(y0 + 1, Math.ceil((t.y + t.h) * GY));
    for (let y = y0; y < y1 && y < GY; y++) for (let x = x0; x < x1 && x < GX; x++) { tot++; if (+GRID[y * GX + x] >= 3) hit++; }
    return tot ? hit / tot : 0;
  };

  const build = () => {
    const lay = layout();
    const frag = doc.createDocumentFragment();
    const areas = lay.map((t) => t.w * t.h).sort((a, b) => a - b);
    const med = areas[areas.length >> 1];
    lay.forEach((t, i) => {
      const cxn = t.x + t.w / 2, cyn = t.y + t.h / 2;
      let vis = activity(t) > 0.34;
      if (!vis && R() < 0.1) vis = true;
      if (cyn > 0.9 && R() < 0.35) vis = false;
      const el = mk('div', 'vt-tile');
      el.style.cssText = 'left:' + t.x * 100 + '%;top:' + t.y * 100 + '%;width:' + t.w * 100 + '%;height:' + t.h * 100 + '%';
      const pos = 'left:' + (-t.x / t.w * 100) + '%;top:' + (-t.y / t.h * 100) + '%;width:' + 100 / t.w + '%;height:' + 100 / t.h + '%';
      const im = mk('img', 'vt-ti');
      im.alt = ''; im.draggable = false; im.src = SRC; im.width = 1481; im.height = 1400; im.decoding = 'async'; im.style.cssText = pos;
      const fl = mk('i', 'vt-fl');
      el.append(im, fl);
      let st = null;
      if (t.w * t.h > med * 1.15 && cyn < 0.7 && cyn > 0.3 && R() < 0.34) { st = mk('span', 'vt-st'); st.textContent = T.layer + ' ' + String(i + 1).padStart(2, '0'); el.append(st); }
      frag.append(el);
      const look = roll(R);
      tiles.push({ t, el, img: im, fl, st, vis, depth: R() * 2 - 1, cur: { ...look }, tgt: { ...look }, easing: false, flash: 0, delay: 0.25 + 1.1 * (1 - (t.y + t.h)) + R() * 0.25, cxn, cyn, hide: { x: cxn - 0.5, y: cyn - 0.5 } });
    });
    tilesEl.append(frag);
    capn.textContent = tiles.length + ' ' + T.capLayers;
  };

  const reroll = (tl, flash) => { tl.tgt = roll(R); tl.easing = true; tl.flash = flash; };
  const rerollAll = () => tiles.forEach((tl, i) => reroll(tl, 0.6 + 0.08 * (i % 5)));

  const setCount = () => {
    if (cnt) cnt.textContent = String(cuts).padStart(2, '0');
    if (cuts === 0) { setCopy('done'); if (shuf) shuf.querySelector('[data-vt-label]') ? (shuf.querySelector('[data-vt-label]').textContent = T.newSet) : (shuf.textContent = T.newSet); }
    else if (state === 'done') { setCopy(coarse ? 'touch' : 'mouse'); if (shuf) shuf.querySelector('[data-vt-label]') ? (shuf.querySelector('[data-vt-label]').textContent = T.recut) : (shuf.textContent = T.recut); }
  };
  const onShuf = () => { if (!ready) return; if (cuts === 0) { cuts = CUTS; setCount(); } rerollAll(); };
  if (shuf) shuf.addEventListener('click', onShuf);
  let rerollAtTop = false;
  const onBack = () => { rerollAtTop = true; };
  if (backB) backB.addEventListener('click', onBack);

  const setPointer = (e) => {
    const r = box.getBoundingClientRect();
    pt.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1.4, 1.4);
    pt.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1.4, 1.4);
    pt.seen = now; pt.inside = true;
  };
  const onMove = (e) => setPointer(e);
  const onDown = (e) => { if (e.pointerType === 'touch') setPointer(e); };
  const onLeave = (e) => { if (e.pointerType !== 'touch') pt.inside = false; };
  const onClick = (e) => {
    if (!ready || cur >= 0.06 || cuts <= 0 || (e.target.closest && e.target.closest('button,a'))) return;
    const r = box.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    for (let i = tiles.length - 1; i >= 0; i--) {
      const tl = tiles[i], t = tl.t;
      if (!tl.vis && assemble < 0.5) continue;
      if (u >= t.x && u <= t.x + t.w && v >= t.y && v <= t.y + t.h) { reroll(tl, 1); cuts--; setCount(); break; }
    }
  };
  stage.addEventListener('pointermove', onMove, { passive: true });
  stage.addEventListener('pointerdown', onDown, { passive: true });
  stage.addEventListener('pointerleave', onLeave, { passive: true });
  stage.addEventListener('click', onClick);

  let finLive = null;
  const applyTimeline = (p) => {
    assemble = ss((p - 0.08) / 0.34);
    scEls.forEach((el) => {
      const i = +el.getAttribute('data-vt-sc') || 0;
      const f = clamp((p - (0.03 + 0.012 * i)) / 0.06);
      const hid = f >= 1;
      if (el.inert !== (f > 0.98)) el.inert = f > 0.98;
      const v = hid ? 'hidden' : 'visible';
      if (el.style.visibility !== v) el.style.visibility = v;
    });
    const ci = clamp((p - 0.38) / 0.05), co = clamp((p - 0.56) / 0.05);
    cap.style.transform = 'translateY(' + ((1 - ci) * 14 - co * 14 - 50).toFixed(2) + '%)';
    cap.style.opacity = (ci * (1 - co)).toFixed(3);
    whole.style.opacity = clamp((assemble - 0.9) / 0.08).toFixed(3);
    const e = eio((p - 0.58) / 0.30);
    const gt = 'translate(' + (zdx * e).toFixed(2) + 'px,' + (zdy * e).toFixed(2) + 'px) scale(' + (1 + (zoomS - 1) * e).toFixed(4) + ')';
    if (grp.style.transform !== gt) grp.style.transform = gt;
    if (fin) {
      const live = clamp((p - 0.9) / 0.07) > 0.5;
      if (live !== finLive) { finLive = live; fin.inert = !live; fin.style.pointerEvents = live ? 'auto' : 'none'; }
    }
  };

  const tileFrame = (dt) => {
    const k = 1 - assemble;
    const drift = !RM && (now - pt.seen > 3 || !pt.inside);
    pres.v += ((drift ? 0 : 1) - pres.v) * (1 - Math.exp(-4 * dt));
    const tx = drift ? (RM ? 0 : 0.35 * Math.sin(now * 2 * Math.PI / 18)) : pt.x, ty = drift ? (RM ? 0 : 0.25 * Math.cos(now * 2 * Math.PI / 23)) : pt.y;
    ps.x += (tx - ps.x) * (1 - Math.exp(-6 * dt)); ps.y += (ty - ps.y) * (1 - Math.exp(-6 * dt));
    const du = 0.5 + ps.x / 2, dv = 0.5 + ps.y / 2, mx = Math.max(bw, bh);
    const doStyle = Math.abs(assemble - fcache) > 0.02 || assemble >= 0.98 !== (fcache >= 0.98);
    if (doStyle) fcache = assemble;
    for (let i = 0; i < tiles.length; i++) {
      const tl = tiles[i], c = tl.cur, g = tl.tgt;
      if (tl.easing) { let m2 = 0; const f = Math.min(1, 7 * dt); for (const key of KEYS) { const d = g[key] - c[key]; c[key] += d * f; m2 = Math.max(m2, Math.abs(d)); } if (m2 < 1e-3) { for (const key of KEYS) c[key] = g[key]; tl.easing = false; } }
      if (tl.flash > 0) { tl.flash = Math.max(0, tl.flash - 2.6 * dt); tl.fl.style.opacity = (tl.flash * tl.flash).toFixed(3); } else if (tl.fl.style.opacity !== '0') { tl.fl.style.opacity = '0'; }
      let e = 1; if (!RM) { e = clamp((eng - tl.delay) / 0.9); e = 1 - Math.pow(1 - e, 3); }
      const d = tl.depth;
      const x = (c.ox * bw + d * ps.x * 5) * k, y = (c.oy * bh + d * ps.y * 5) * k;
      const dist = Math.hypot((tl.cxn - du) * bw, (tl.cyn - dv) * bh) / mx;
      const sw2 = 1 + 0.035 * Math.exp(-30 * dist * dist) * pres.v;
      let sc = (1 + (c.sc - 1) * k) * sw2, rot = c.rot * k + d * 8 * (1 - e) * (RM ? 0 : 1);
      let ox = 0, oy = 0, op = 1;
      if (!tl.vis) { op = assemble; const f = 1 - assemble; ox = tl.hide.x * bw * 0.12 * f; oy = tl.hide.y * bh * 0.12 * f; sc *= 0.92 + 0.08 * assemble; }
      op *= e;
      const ey = -40 * (1 - e);
      tl.el.style.transform = 'translate(' + (x + ox).toFixed(2) + 'px,' + (y + oy + ey).toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + sc.toFixed(4) + ')';
      tl.el.style.opacity = op.toFixed(3);
      tl.img.style.transform = 'translate(' + ((c.cx * bw + d * ps.x * 9) * k).toFixed(2) + 'px,' + ((c.cy * bh + d * ps.y * 9) * k).toFixed(2) + 'px)';
      if (doStyle || tl.easing) {
        const ins = c.ins * k;
        tl.el.style.clipPath = assemble >= 0.98 ? 'none' : 'inset(' + ins.toFixed(2) + 'px)';
        tl.el.style.filter = assemble >= 0.98 ? 'none' : 'brightness(' + (1 + (c.br - 1) * k).toFixed(3) + ') saturate(' + (1 + (c.sat - 1) * k).toFixed(3) + ') sepia(' + (c.sep * k).toFixed(3) + ')';
        if (tl.st) tl.st.style.opacity = clamp(1 - assemble / 0.33).toFixed(3);
      }
    }
  };

  let last = 0, alive = true;
  const offFrame = ctx.onFrame((ts) => {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts; now += dt;
    if (RM !== ctx.reduced) { RM = ctx.reduced; lastCur = -1; if (RM) eng = 9; }
    if (!ctx.visible()) return;
    cur = RM ? 1 : ctx.progress();
    if (Math.abs(cur - lastCur) > 1e-5 || lastCur < 0) { applyTimeline(cur); lastCur = cur; }
    if (rerollAtTop && cur < 0.005) { rerollAtTop = false; if (ready) rerollAll(); }
    if (ready) { eng += dt; tileFrame(dt); }
  });
  const offResize = ctx.onResize(measure);
  const offTheme = ctx.onTheme(() => {});

  const init = () => {
    const fail = () => { if (!alive) return; loadEl.textContent = ''; root.classList.add('vt-loaded'); setCopy('fail'); ctx.ready(); };
    if (!SRC) { fail(); return; }
    whole.src = SRC;
    const go = () => {
      if (!alive) return;
      measure(); build();
      ready = true; eng = RM ? 9 : 0;
      if (shuf) shuf.disabled = false;
      root.classList.add('vt-loaded');
      applyTimeline(cur);
      ctx.ready();
    };
    if (whole.decode) whole.decode().then(go, fail);
    else { whole.addEventListener('load', go); whole.addEventListener('error', fail); }
  };
  if (shuf) shuf.disabled = true;
  measure();
  init();

  return () => {
    alive = false;
    offFrame(); offResize(); offTheme();
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerleave', onLeave);
    stage.removeEventListener('click', onClick);
    if (shuf) shuf.removeEventListener('click', onShuf);
    if (backB) backB.removeEventListener('click', onBack);
    scEls.forEach((el) => { el.inert = false; el.style.visibility = ''; });
    if (fin) { fin.inert = false; fin.style.pointerEvents = ''; }
    root.replaceChildren();
    root.classList.remove('fwc-tilecut', 'vt-loaded');
  };
}
