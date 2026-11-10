// Filmstrip scrub (C5). Ported from the webspun formmorpheus-filmstrip section script.
// The scene on the template pins the stage and gives us the smoothed scroll progress; this module lays out the plates
// (focus falloff, velocity skew, parallax), the caption, the frame counter, the loader and the closing video.
export function mount(root, props, ctx) {
  const P = props || {};
  const frames = (Array.isArray(P.frames) ? P.frames : []).filter((f) => f && typeof f.src === 'string' && f.src);
  const N = frames.length;
  if (N < 2) return () => {};
  const LAST = N - 1, K = 1.4206, FOCUS_END = 0.84;
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const L = {
    plate: str(P.plateLabel, 'Plate'),
    loading: str(P.loadingLabel, 'Loading frames'),
    counter: str(P.counterLabel, 'Frame counter, running from frame 0 to frame 72'),
    hint: str(P.hint, 'Scroll to scrub the frames, or use the left and right arrow keys'),
    replay: str(P.replayLabel, 'Replay the video'),
    video: str(P.videoLabel, '')
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (n, len) => String(n).padStart(len, '0');
  const doc = root.ownerDocument;
  const mk = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const svgNS = 'http://www.w3.org/2000/svg';

  root.classList.add('fwc-filmstrip');
  if (P.accent) root.style.setProperty('--fs-accent', String(P.accent));

  const style = doc.createElement('style');
  style.textContent = `
.fwc-filmstrip { overflow: hidden; isolation: isolate; --fs-accent: var(--hue, #eef0f4); font-family: var(--font-ui, system-ui, sans-serif); color: var(--ink, #eef0f4); }
.fwc-filmstrip .fs-strip { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }
.fwc-filmstrip .fs-card { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.fwc-filmstrip .fs-btn { all: unset; display: block; width: 100%; height: 100%; cursor: pointer; box-sizing: border-box; }
.fwc-filmstrip .fs-btn:focus-visible { outline: 2px solid var(--focus, #eef0f4); outline-offset: 6px; }
.fwc-filmstrip .fs-frame { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; background: var(--pane, #1b1e25); border-radius: 2px; box-shadow: var(--shadow-shot, 0 30px 80px -40px rgb(0 0 0 / 0.55)); outline: 1px solid var(--edge, rgb(255 255 255 / 0.09)); outline-offset: -1px; }
.fwc-filmstrip .fs-tags, .fwc-filmstrip .fs-cap-n, .fwc-filmstrip .fs-cap-l, .fwc-filmstrip .fs-fb, .fwc-filmstrip .fs-load, .fwc-filmstrip .fs-hint { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.8125rem); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft, #a4aab8); }
.fwc-filmstrip .fs-card:not(.is-bad) .fs-fb { opacity: 0; }
.fwc-filmstrip .fs-fb { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: var(--sp-3, 12px); }
.fwc-filmstrip .fs-in { position: absolute; inset: 0; display: block; transform: scale(1.22); clip-path: inset(100% 0 0 0); transition: clip-path 1.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-filmstrip.fs-ready .fs-in { clip-path: inset(0 0 0 0); }
.fwc-filmstrip .fs-card.is-top { z-index: var(--z-raised, 100); }
.fwc-filmstrip .fs-img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; object-position: var(--fx) var(--fy); transform: scale(var(--z)); transform-origin: var(--fx) var(--fy); filter: saturate(0.7) contrast(0.96); transition: filter 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-filmstrip[data-mode="dark"] .fs-light, .fwc-filmstrip[data-mode="light"] .fs-dark { display: none; }
.fwc-filmstrip .fs-card.is-on .fs-img, .fwc-filmstrip .fs-card:hover .fs-img { filter: none; }
.fwc-filmstrip .fs-cap { position: absolute; left: 0; right: 0; z-index: var(--z-raised, 100); display: grid; justify-items: stretch; gap: var(--sp-1, 4px); text-align: center; pointer-events: none; }
.fwc-filmstrip .fs-cap-n, .fwc-filmstrip .fs-cap-l { margin: 0; }
.fwc-filmstrip .fs-cap-t { margin: 0; font-size: var(--fs-xl, 1.5rem); font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); line-height: 1.15; }
.fwc-filmstrip .fs-cap-t.is-in { animation: fwc-fs-rise 0.7s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
@keyframes fwc-fs-rise { from { opacity: 0; transform: translateY(60%); filter: blur(4px); } to { opacity: 1; transform: none; filter: blur(0); } }
.fwc-filmstrip .fs-read { position: absolute; left: 0; right: 0; bottom: clamp(44px, 7vh, 90px); z-index: var(--z-raised, 100); display: flex; align-items: center; justify-content: center; gap: var(--sp-5, 24px); font-size: clamp(56px, 7.6vw, 132px); line-height: 1; font-weight: var(--weight-display, 640); letter-spacing: var(--track-display, -0.035em); font-variant-numeric: tabular-nums; }
.fwc-filmstrip .fs-now { display: inline-block; min-width: 3ch; text-align: right; }
.fwc-filmstrip .fs-end { display: inline-block; min-width: 3ch; color: var(--ink-faint, #6b7283); }
.fwc-filmstrip .fs-line { position: relative; width: clamp(60px, 13vw, 190px); height: 1px; background: var(--edge-strong, rgb(255 255 255 / 0.18)); }
.fwc-filmstrip .fs-fill { position: absolute; inset: 0; background: var(--fs-accent); transform: scaleX(0); transform-origin: left; height: 2px; top: -0.5px; }
.fwc-filmstrip .fs-hint { position: absolute; left: 0; right: 0; bottom: var(--sp-4, 16px); z-index: var(--z-raised, 100); margin: 0; text-align: center; color: var(--ink-faint, #6b7283); }
.fwc-filmstrip .fs-vid { position: absolute; inset: 0; overflow: hidden; background: #000; opacity: 0; pointer-events: none; outline: 1px solid var(--edge, rgb(255 255 255 / 0.09)); outline-offset: -1px; }
.fwc-filmstrip .fs-vid.is-live { pointer-events: auto; }
.fwc-filmstrip .fs-vid video, .fwc-filmstrip .fs-poster { position: absolute; inset: 0; display: block; width: 100%; height: 100%; max-width: none; object-fit: cover; }
.fwc-filmstrip .fs-poster { transition: opacity var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-filmstrip .fs-poster.is-off { opacity: 0; }
.fwc-filmstrip .fs-replay { all: unset; visibility: hidden; box-sizing: border-box; position: absolute; right: var(--sp-3, 12px); bottom: var(--sp-3, 12px); width: 40px; height: 40px; display: grid; place-items: center; cursor: pointer; color: var(--footage-ink, #fff); background: var(--footage-glass, rgb(10 12 13 / 0.45)); box-shadow: inset 0 0 0 1px var(--footage-line, rgb(255 255 255 / 0.16)); }
.fwc-filmstrip .fs-replay:hover { box-shadow: inset 0 0 0 1px var(--footage-edge, rgb(255 255 255 / 0.55)); }
.fwc-filmstrip .fs-replay:focus-visible { outline: 2px solid var(--focus, #eef0f4); outline-offset: 3px; }
.fwc-filmstrip .fs-replay svg { width: var(--icon-s, 16px); height: var(--icon-s, 16px); }
.fwc-filmstrip .fs-loader { position: absolute; inset: 0; z-index: var(--z-overlay, 600); display: grid; place-content: center; gap: var(--sp-3, 12px); text-align: center; background: var(--ground, #14161b); transition: opacity 0.4s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)); }
.fwc-filmstrip .fs-loader.is-gone { opacity: 0; pointer-events: none; }
.fwc-filmstrip .fs-load { margin: 0; }
.fwc-filmstrip.is-phone .fs-read { font-size: clamp(44px, 14vw, 70px); bottom: 68px; }
.fwc-filmstrip.is-phone .fs-hint { padding: 0 var(--sp-4, 16px); }
.fwc-filmstrip.is-phone .fs-line { width: 40px; }
.fwc-filmstrip.is-reduced .fs-in { transition: none; clip-path: none; }
.fwc-filmstrip.is-reduced .fs-cap-t.is-in { animation: none; }
.fwc-filmstrip.is-reduced .fs-poster { transition: none; }
`;
  root.append(style);

  const strip = mk('ul', 'fs-strip');
  const cards = [];
  frames.forEach((f, i) => {
    const li = mk('li', 'fs-card');
    const btn = mk('button', 'fs-btn');
    btn.type = 'button';
    const num = pad(Number.isFinite(+f.frame) ? Math.round(+f.frame) : 0, 3);
    btn.setAttribute('aria-label', L.plate + ' ' + (i + 1) + ' of ' + N + ', ' + (f.title || '') + ', ' + (f.loc || '') + ', frame ' + num);
    const fr = mk('span', 'fs-frame');
    const fb = mk('span', 'fs-fb', L.plate + ' ' + pad(i + 1, 2) + ' / frame ' + num);
    fb.setAttribute('aria-hidden', 'true');
    const inner = mk('span', 'fs-in');
    const fx = (Number.isFinite(+f.fx) ? +f.fx : 50) + '%', fy = (Number.isFinite(+f.fy) ? +f.fy : 50) + '%', z = Number.isFinite(+f.zoom) && +f.zoom > 0 ? +f.zoom : 1;
    const imgs = [];
    const addImg = (src, srcset, mode) => {
      const im = doc.createElement('img');
      im.className = 'fs-img ' + mode;
      im.alt = f.alt || '';
      im.decoding = 'async';
      im.style.cssText = '--fx:' + fx + ';--fy:' + fy + ';--z:' + z;
      if (Number.isFinite(+f.w) && +f.w > 0) im.width = +f.w;
      if (Number.isFinite(+f.h) && +f.h > 0) im.height = +f.h;
      if (srcset) { im.setAttribute('srcset', srcset); im.setAttribute('sizes', '100vw'); }
      imgs.push({ im, src, mode });
      inner.append(im);
    };
    addImg(f.src, f.srcset, 'fs-dark');
    if (typeof f.srcLight === 'string' && f.srcLight) addImg(f.srcLight, f.srcsetLight, 'fs-light');
    else imgs[0].im.classList.remove('fs-dark');
    fr.append(fb, inner);
    btn.append(fr);
    li.append(btn);
    strip.append(li);
    cards.push({ li, btn, fr, inner, imgs, f });
  });

  // The last plate opens into the clip.
  const lastCard = cards[LAST];
  const vidBox = mk('div', 'fs-vid');
  const video = doc.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  if (L.video) video.setAttribute('aria-label', L.video);
  const posterUrl = typeof P.videoPoster === 'string' && P.videoPoster ? ctx.asset(P.videoPoster) : '';
  if (posterUrl) video.setAttribute('poster', posterUrl);
  const poster = mk('img', 'fs-poster');
  poster.alt = '';
  poster.decoding = 'async';
  if (posterUrl) poster.src = posterUrl;
  const replay = mk('button', 'fs-replay');
  replay.type = 'button';
  replay.tabIndex = -1;
  replay.setAttribute('aria-label', L.replay);
  const ic = doc.createElementNS(svgNS, 'svg');
  ic.setAttribute('viewBox', '0 0 24 24');
  ic.setAttribute('fill', 'none');
  ic.setAttribute('stroke', 'currentColor');
  ic.setAttribute('stroke-width', '1.75');
  ic.setAttribute('stroke-linecap', 'round');
  ic.setAttribute('stroke-linejoin', 'round');
  ic.setAttribute('aria-hidden', 'true');
  ic.setAttribute('focusable', 'false');
  for (const d of ['M20 12a8 8 0 1 1-2.9-6.2', 'M20 4v5h-5']) {
    const path = doc.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    ic.append(path);
  }
  replay.append(ic);
  vidBox.append(video, poster, replay);
  lastCard.li.append(vidBox);
  const hasVideo = typeof P.video === 'string' && P.video;
  if (hasVideo) video.src = ctx.asset(P.video);
  else { vidBox.style.display = 'none'; }

  const cap = mk('div', 'fs-cap');
  cap.setAttribute('aria-live', 'polite');
  const capN = mk('p', 'fs-cap-n'), capT = mk('p', 'fs-cap-t'), capL = mk('p', 'fs-cap-l');
  cap.append(capN, capT, capL);
  const read = mk('div', 'fs-read');
  read.setAttribute('role', 'img');
  read.setAttribute('aria-label', L.counter);
  const nowEl = mk('span', 'fs-now', pad(frames[0].frame || 0, 3));
  nowEl.setAttribute('aria-hidden', 'true');
  const line = mk('span', 'fs-line');
  line.setAttribute('aria-hidden', 'true');
  const fill = mk('span', 'fs-fill');
  line.append(fill);
  const endNum = mk('span', 'fs-end', pad(Math.round(+frames[LAST].frame || 0), 3));
  endNum.setAttribute('aria-hidden', 'true');
  read.append(nowEl, line, endNum);
  const hint = mk('p', 'fs-hint', L.hint);
  const loader = mk('div', 'fs-loader');
  loader.setAttribute('role', 'status');
  const loadTxt = mk('p', 'fs-load', L.loading + ' 00 / ' + N);
  loader.append(loadTxt);
  root.append(strip, cap, read, hint, loader);
  const chrome = [cap, read, hint];

  // Scene wiring: the template pins the stage; we read its progress and ask it to scroll.
  const M = globalThis.__formwebMotion;
  const sceneKey = M && M.sceneOf ? M.sceneOf(ctx.host) : null;
  const trackEl = sceneKey ? ctx.host.closest('[data-fw-node="' + (globalThis.CSS && CSS.escape ? CSS.escape(sceneKey) : sceneKey) + '"]') : null;
  const stageEl = ctx.host.parentElement;
  const endEl = stageEl ? stageEl.querySelector(':scope > [data-fs-end]') : null;

  let reduced = ctx.reduced;
  let W = 0, H = 0, fh = 0, cyv = 0.42, rangePx = 1, dirty = true, shown = -1, started = false, armed = true, done = 0;
  const vr = { w: 0, h: 0, x: 0, y: 0 };
  let mode = ctx.theme();
  root.dataset.mode = mode;
  root.classList.toggle('is-reduced', reduced);

  const measure = () => {
    const s = ctx.size();
    W = s.width || ctx.host.clientWidth;
    H = s.height || ctx.host.clientHeight;
    const phone = W <= 900;
    root.classList.toggle('is-phone', phone);
    fh = phone ? Math.min(H * 0.5, (W * 0.66) / 0.75) : Math.min(H * 0.44, (W * 0.34) / 0.75, 620);
    cyv = phone ? 0.41 : 0.42;
    const gap = phone ? 16 : 32, ch = (endEl ? endEl.offsetHeight : 0) + gap;
    const aw = W - gap * 2, ah = Math.max(60, H - ch - gap);
    const vw = Math.min(aw, ah * 1.6, 1280);
    vr.w = vw; vr.h = vw / 1.6; vr.x = W / 2; vr.y = gap + (phone ? 0 : (ah - vr.h) / 2) + vr.h / 2;
    cap.style.top = (cyv * H + fh / 2 + 18) + 'px';
    rangePx = trackEl && stageEl ? Math.max(1, trackEl.offsetHeight - stageEl.clientHeight) : 1;
    dirty = true;
  };

  const getP = () => (reduced ? 1 : ctx.progress());
  const plateP = (i) => (i / LAST) * FOCUS_END;
  let psNow = 0;
  const focusIndex = () => Math.round(clamp(psNow / FOCUS_END, 0, 1) * LAST);
  const go = (p, dur) => {
    const ms = reduced ? 0 : (dur === undefined ? 1400 : dur);
    if (M && M.scrollToScene && sceneKey) { M.scrollToScene(sceneKey, p, ms, 'ease-in-out'); return; }
    if (trackEl) scrollTo({ top: trackEl.getBoundingClientRect().top + scrollY + p * rangePx, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onBtn = cards.map((c, i) => {
    const fn = () => { if (i !== focusIndex()) go(plateP(i)); };
    c.btn.addEventListener('click', fn);
    return fn;
  });
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const r = (trackEl || ctx.host).getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    e.preventDefault();
    go(plateP(clamp(focusIndex() + (e.key === 'ArrowRight' ? 1 : -1), 0, LAST)));
  };
  addEventListener('keydown', onKey);

  const setCaption = (i) => {
    const f = cards[i].f;
    capN.textContent = L.plate + ' ' + pad(i + 1, 2) + ' / ' + N;
    capT.textContent = f.title || '';
    capL.textContent = f.loc || '';
    capT.classList.remove('is-in');
    void capT.offsetWidth;
    if (!reduced) capT.classList.add('is-in');
  };

  const hidePoster = () => poster.classList.add('is-off');
  const rewind = () => {
    if (!video.paused) video.pause();
    if (video.readyState > 0) video.currentTime = 0.001;
    if (!reduced) poster.classList.remove('is-off');
  };
  const play = (fromStart) => {
    if (!hasVideo) return;
    if (!video.paused && !video.ended) return;
    if (fromStart || video.ended || video.currentTime > 0.05) video.currentTime = 0;
    const pr = video.play();
    if (pr && pr.catch) pr.catch(() => {});
  };
  const vEv = [
    ['loadedmetadata', () => { if (video.currentTime === 0) video.currentTime = 0.001; }],
    ['seeked', () => { if (video.paused && !reduced && video.currentTime < 0.05) hidePoster(); }],
    ['playing', hidePoster],
    ['error', () => poster.classList.remove('is-off')]
  ];
  vEv.forEach(([n, fn]) => video.addEventListener(n, fn));
  const onReplay = () => { hidePoster(); play(true); };
  replay.addEventListener('click', onReplay);
  if (reduced) poster.classList.remove('is-off');

  let endLive = null;
  let firstDrawn = false;
  const draw = (ps, skew) => {
    psNow = ps;
    const rm = reduced;
    const B = clamp(ps / FOCUS_END, 0, 1) * LAST;
    const gap = Math.max(12, W * 0.018);
    const w0 = fh * 0.75;
    const F = rm ? smooth(0.86, 0.95, ps) : smooth(0.86, 0.995, ps);
    const G = F;
    const V = smooth(0.4, 0.92, F);
    const ws = [], cs = [];
    let x = 0;
    for (let i = 0; i < N; i++) {
      const d = i - B;
      const s = 0.42 + 0.58 * Math.exp(-K * d * d);
      ws[i] = w0 * s;
      cs[i] = x + ws[i] / 2;
      x += ws[i] + gap;
    }
    const fl = Math.min(LAST - 1, Math.floor(B)), fr = B - fl;
    const mid = lerp(cs[fl], cs[fl + 1], fr);
    const off = W / 2 - mid;
    const act = Math.round(B);
    for (let i = 0; i < N; i++) {
      const c = cards[i];
      const h = ws[i] / 0.75;
      let cx = off + cs[i], cyy = H * cyv, w = ws[i], hh = h, op = 1, radius = 2, sk = skew;
      let par = clamp((i - B) * -7, -10, 10), sc = 1.22;
      if (i === LAST) {
        cx = lerp(cx, vr.x, G); cyy = lerp(cyy, vr.y, G);
        w = lerp(w, vr.w, G); hh = lerp(hh, vr.h, G);
        radius = lerp(2, 0, G); sk = lerp(skew, 0, G);
        par = lerp(par, 0, G); sc = lerp(1.22, 1, G);
        op = 1;
      } else {
        op = clamp(1 - 1.6 * F, 0, 1);
        if (!rm) cx += (i < B ? -1 : 1) * W * 0.2 * G;
      }
      const st = c.li.style;
      st.width = w + 'px'; st.height = hh + 'px';
      st.transform = 'translate3d(' + (cx - w / 2) + 'px,' + (cyy - hh / 2) + 'px,0) skewX(' + sk + 'deg)';
      st.opacity = op;
      st.pointerEvents = op < 0.05 ? 'none' : '';
      c.li.classList.toggle('is-top', i === LAST && F > 0.001);
      c.li.classList.toggle('is-on', i === act);
      c.btn.setAttribute('aria-current', i === act ? 'true' : 'false');
      c.fr.style.borderRadius = radius + 'px';
      c.inner.style.transform = 'translateX(' + par + '%) scale(' + sc + ')';
    }
    vidBox.style.opacity = V;
    vidBox.style.borderRadius = lerp(2, 0, G) + 'px';
    vidBox.classList.toggle('is-live', V > 0.5);
    replay.tabIndex = F > 0.98 ? 0 : -1;
    replay.style.visibility = F > 0.98 ? 'visible' : 'hidden';
    if (F > 0.985 && armed) { armed = false; if (!rm) play(false); }
    if (V < 0.02 && !armed) { armed = true; rewind(); }
    const co = clamp(1 - F, 0, 1);
    for (const el of chrome) { el.style.opacity = co; el.style.visibility = co < 0.01 ? 'hidden' : 'visible'; }
    if (endEl) {
      const live = smooth(0.93, 1, ps) > 0.5;
      if (live !== endLive) { endLive = live; endEl.inert = !live; }
    }
    const fi = Math.round(lerp(+cards[fl].f.frame || 0, +cards[fl + 1].f.frame || 0, fr));
    nowEl.textContent = pad(fi, 3);
    fill.style.transform = 'scaleX(' + B / LAST + ')';
    if (act !== shown) { shown = act; setCaption(act); }
  };

  // Loader: reveal once every shown picture has settled, or after six seconds.
  const reveal = () => {
    if (started) return;
    started = true;
    loader.classList.add('is-gone');
    cards.forEach((c, i) => { c.inner.style.transitionDelay = (i * 0.06) + 's'; });
    requestAnimationFrame(() => root.classList.add('fs-ready'));
  };
  const tick = () => {
    done++;
    loadTxt.textContent = L.loading + ' ' + pad(Math.min(done, N), 2) + ' / ' + N;
    if (done >= N) reveal();
  };
  cards.forEach((c) => {
    const pick = c.imgs.find((e) => e.mode === (mode === 'light' ? 'fs-light' : 'fs-dark')) || c.imgs[0];
    let fin = false;
    const ok = () => { if (fin) return; fin = true; tick(); };
    pick.im.addEventListener('load', ok);
    pick.im.addEventListener('error', () => { c.li.classList.add('is-bad'); c.imgs.forEach((e) => e.im.remove()); ok(); });
    for (const e of c.imgs) e.im.src = e.src;
  });
  const timer = setTimeout(reveal, 6000);
  if (reduced) { started = true; loader.classList.add('is-gone'); root.classList.add('fs-ready'); }

  measure();
  let last = 0, prevPs = -1, skew = 0, drawnPs = -1;
  const offFrame = ctx.onFrame((now) => {
    if (!ctx.visible()) { last = 0; return; }
    const dt = last ? Math.min(64, now - last) : 16.667;
    last = now;
    if (reduced !== ctx.reduced) { reduced = ctx.reduced; root.classList.toggle('is-reduced', reduced); dirty = true; }
    const ps = getP();
    if (prevPs < 0) prevPs = ps;
    const vel = (ps - prevPs) * rangePx * (16.667 / Math.max(1, dt));
    prevPs = ps;
    skew = reduced ? 0 : lerp(skew, clamp(vel * 0.12, -6, 6), 0.1);
    if (Math.abs(skew) < 0.01) skew = 0;
    if (!dirty && skew === 0 && ps === drawnPs) return;
    dirty = false;
    drawnPs = ps;
    draw(ps, skew);
    if (!firstDrawn) { firstDrawn = true; ctx.ready(); }
  });
  const offResize = ctx.onResize(measure);
  const offVisible = ctx.onVisible((v) => { if (v) dirty = true; });
  const offTheme = ctx.onTheme((m) => { mode = m; root.dataset.mode = m; dirty = true; });
  if (endEl) endEl.inert = true;

  return () => {
    clearTimeout(timer);
    offFrame(); offResize(); offVisible(); offTheme();
    removeEventListener('keydown', onKey);
    cards.forEach((c, i) => c.btn.removeEventListener('click', onBtn[i]));
    vEv.forEach(([n, fn]) => video.removeEventListener(n, fn));
    replay.removeEventListener('click', onReplay);
    video.pause();
    if (endEl) endEl.inert = false;
    root.replaceChildren();
    root.classList.remove('fwc-filmstrip', 'is-reduced', 'is-phone', 'fs-ready');
  };
}
