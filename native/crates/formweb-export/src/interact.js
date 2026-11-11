(() => {
  'use strict';
  const doc = document, root = doc.documentElement;
  let cfg = {};
  try { cfg = JSON.parse(doc.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const motion = cfg.motion;
  if (!motion || typeof motion !== 'object') return;
  const M = globalThis.__formwebMotion || null;
  const reduced = M ? !!M.reduced : (root.classList.contains('fw-r') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const guard = fn => { try { fn(); } catch {} };
  const subs = new Set();
  let raf = 0;
  const pump = () => { raf = 0; for (const fn of [...subs]) fn(); if (subs.size && !raf) raf = requestAnimationFrame(pump); };
  const onFrame = fn => { if (M && M.onFrame) return M.onFrame(fn); subs.add(fn); if (!raf) raf = requestAnimationFrame(pump); return () => subs.delete(fn); };
  const loop = step => {
    let off = null, dead = false, last = performance.now();
    const stop = () => { dead = true; if (off) { off(); off = null; } };
    const tick = () => { if (dead) return; const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; if (!step(dt)) stop(); };
    const unsub = onFrame(tick);
    off = dead ? (unsub(), null) : unsub;
    return stop;
  };
  const runner = step => { let stop = null; return () => { if (!stop) stop = loop(dt => { const go = step(dt); if (!go) stop = null; return go; }); }; };
  const eases = { linear: t => t, 'ease-in': t => t * t * t, 'ease-out': t => 1 - Math.pow(1 - t, 3), 'ease-in-out': t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 };
  const ease = name => (M && M.easing) ? M.easing(name || 'ease-in-out') : (eases[name] || eases['ease-in-out']);
  const esc = s => CSS.escape(String(s));
  const nodes = id => [...doc.querySelectorAll(`[data-fw-node="${esc(id)}"]`)];
  const find = (id, from) => {
    if (id === undefined || id === null || id === '') return null;
    const sel = `[data-fw-node="${esc(id)}"]`;
    for (let a = from; a; a = a.parentElement) { if (a.matches(sel)) return a; const hit = a.querySelector(sel); if (hit) return hit; }
    return doc.querySelector(sel);
  };
  let serial = 0;
  const ident = el => { while (!el.id) { const id = `fw-i${++serial}`; if (!doc.getElementById(id)) el.id = id; } return el.id; };
  const press = (el, fn) => {
    if (!el.matches('a[href],button,input,select,textarea,summary')) {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (el.tabIndex < 0) el.tabIndex = 0;
      el.addEventListener('keydown', e => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } });
    }
    el.addEventListener('click', fn);
  };
  const owned = new WeakSet();
  const hide = (el, on) => {
    if (on) { el.hidden = true; if (getComputedStyle(el).display !== 'none') { el.style.display = 'none'; owned.add(el); } }
    else { el.hidden = false; if (owned.has(el)) { el.style.display = ''; owned.delete(el); } }
  };
  const length = v => { const s = String(v === undefined || v === null ? '' : v).trim(); return /^\d*\.?\d+$/.test(s) ? `${s}px` : /^\d*\.?\d+(px|em|rem|vw|vh)$/.test(s) ? s : '1000px'; };

  const drag = (el, o) => {
    const back = o.flip && o.flip.back ? find(o.flip.back, el) : null;
    const nested = !!back && el.contains(back);
    const faces = back && !nested ? [el, back] : [el];
    const axis = o.axis || 'both';
    const friction = typeof o.friction === 'number' ? o.friction : 4;
    const bounce = typeof o.restitution === 'number' ? o.restitution : 0.4;
    const step = Number(o.keyboard) || 0;
    const inertia = !!o.inertia && !reduced;
    const spin = !!o.rotate && !reduced && axis === 'both';
    let x = 0, y = 0, rot = 0, vx = 0, vy = 0, spinning = 0, flipped = false, halt = null, grip = null;
    const bounds = () => !o.bounds ? null : o.bounds === 'parent' ? el.parentElement : find(o.bounds, el);
    const paint = () => { for (const f of faces) { f.style.translate = `${x}px ${y}px`; f.style.rotate = `${rot}deg`; } };
    const nudge = (dx, dy) => {
      if (axis === 'x') dy = 0; else if (axis === 'y') dx = 0;
      const hit = { x: false, y: false }, b = bounds();
      if (b) {
        const r = el.getBoundingClientRect(), p = b.getBoundingClientRect();
        const cx = Math.min(Math.max(dx, p.left - r.left), p.right - r.right), cy = Math.min(Math.max(dy, p.top - r.top), p.bottom - r.bottom);
        hit.x = Math.abs(cx - dx) > 0.01; hit.y = Math.abs(cy - dy) > 0.01; dx = cx; dy = cy;
      }
      x += dx; y += dy; paint();
      return hit;
    };
    const turn = on => {
      flipped = on;
      const t = reduced ? 'none' : 'transform 700ms ease';
      el.style.transition = t;
      el.style.transform = `perspective(1200px) rotateY(${on ? 180 : 0}deg)`;
      if (back) { back.style.transition = t; back.style.transform = nested ? 'rotateY(180deg)' : `perspective(1200px) rotateY(${on ? 360 : 180}deg)`; back.setAttribute('aria-hidden', String(!on)); }
    };
    const fling = () => {
      halt = loop(dt => {
        const k = Math.exp(-friction * dt);
        vx *= k; vy *= k; spinning *= k;
        const hit = nudge(vx * dt, vy * dt);
        if (hit.x) vx = -vx * bounce;
        if (hit.y) vy = -vy * bounce;
        rot += spinning * dt; paint();
        if (Math.hypot(vx, vy) < 6 && Math.abs(spinning) < 2) { halt = null; return false; }
        return true;
      });
    };
    const down = e => {
      if (e.button > 0) return;
      const inner = e.target.closest('a[href],button,input,select,textarea,[contenteditable]');
      if (inner && inner !== e.currentTarget && e.currentTarget.contains(inner)) return;
      if (halt) { halt(); halt = null; }
      const r = el.getBoundingClientRect();
      grip = { id: e.pointerId, px: e.clientX, py: e.clientY, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left - r.width / 2, gy: e.clientY - r.top - r.height / 2, inertia: (r.width * r.width + r.height * r.height) / 4 || 1, far: 0, live: false, t: performance.now(), vx: 0, vy: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = e => {
      if (!grip || e.pointerId !== grip.id) return;
      const now = performance.now(), dt = Math.max(0.001, (now - grip.t) / 1000), dx = e.clientX - grip.px, dy = e.clientY - grip.py;
      grip.px = e.clientX; grip.py = e.clientY; grip.t = now;
      grip.far = Math.max(grip.far, Math.hypot(e.clientX - grip.sx, e.clientY - grip.sy));
      if (!grip.live) { if (grip.far < 4) return; grip.live = true; el.style.cursor = 'grabbing'; return; }
      nudge(dx, dy);
      grip.vx = 0.5 * (dx / dt) + 0.5 * grip.vx; grip.vy = 0.5 * (dy / dt) + 0.5 * grip.vy;
    };
    const up = e => {
      if (!grip || e.pointerId !== grip.id) return;
      const g = grip; grip = null; el.style.cursor = 'grab';
      if (!g.live) { if (e.type === 'pointerup' && back && o.flip) turn(!flipped); return; }
      if (!inertia || e.type === 'pointercancel') return;
      const idle = performance.now() - g.t > 90;
      vx = idle || axis === 'y' ? 0 : g.vx; vy = idle || axis === 'x' ? 0 : g.vy;
      if (Math.hypot(vx, vy) < 30) return;
      spinning = spin ? clamp((g.gx * vy - g.gy * vx) / g.inertia * 180 / Math.PI, -720, 720) : 0;
      fling();
    };
    const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    el.addEventListener('keydown', e => {
      if (e.target !== el) return;
      const d = keys[e.key];
      if (d && step) { e.preventDefault(); if (halt) { halt(); halt = null; } nudge(d[0] * step, d[1] * step); }
      else if ((e.key === 'Enter' || e.key === ' ') && back && o.flip) { e.preventDefault(); turn(!flipped); }
    });
    for (const f of faces) { f.addEventListener('pointerdown', down); f.addEventListener('pointermove', move); f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up); f.style.touchAction = 'none'; f.style.cursor = 'grab'; f.style.userSelect = 'none'; }
    if (el.tabIndex < 0) el.tabIndex = 0;
    if (back) {
      for (const f of faces) { f.style.backfaceVisibility = 'hidden'; f.style.webkitBackfaceVisibility = 'hidden'; }
      if (nested) el.style.transformStyle = 'preserve-3d';
      el.style.transform = 'perspective(1200px) rotateY(0deg)';
      back.style.transform = nested ? 'rotateY(180deg)' : 'perspective(1200px) rotateY(180deg)';
      back.setAttribute('aria-hidden', 'true');
    }
  };

  const tilt = (el, o) => {
    if (reduced) return;
    const max = Number(o.max) || 8, spring = clamp(Number(o.spring) || 0.12, 0.01, 1), depth = length(o.perspective);
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const start = runner(dt => {
      const k = 1 - Math.pow(1 - spring, dt * 60);
      cx += (tx - cx) * k; cy += (ty - cy) * k;
      const rest = !tx && !ty && Math.abs(cx) < 0.01 && Math.abs(cy) < 0.01;
      if (rest) { cx = cy = 0; el.style.transform = ''; return false; }
      el.style.transform = `perspective(${depth}) rotateX(${cx.toFixed(3)}deg) rotateY(${cy.toFixed(3)}deg)`;
      return Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01;
    });
    const aim = e => {
      const r = el.getBoundingClientRect(), w = el.offsetWidth || r.width || 1, h = el.offsetHeight || r.height || 1;
      tx = clamp((e.clientY - r.top - r.height / 2) / (h / 2), -1, 1) * max;
      ty = -clamp((e.clientX - r.left - r.width / 2) / (w / 2), -1, 1) * max;
      start();
    };
    el.addEventListener('pointerenter', aim);
    el.addEventListener('pointermove', aim);
    el.addEventListener('pointerleave', () => { tx = ty = 0; start(); });
  };

  const follow = (el, o) => {
    if (reduced) return;
    const zone = find(o.within, el) || el.parentElement;
    if (!zone) return;
    const spring = clamp(Number(o.spring) || 0.18, 0.01, 1);
    let px = 0, py = 0, cx = 0, cy = 0, vis = 0, goal = 0, fresh = false;
    el.style.opacity = '0';
    const start = runner(dt => {
      const k = 1 - Math.pow(1 - spring, dt * 60), r = el.getBoundingClientRect();
      const tx = px - (r.left + r.width / 2 - cx), ty = py - (r.top + r.height / 2 - cy);
      if (fresh) { cx = tx; cy = ty; fresh = false; }
      cx += (tx - cx) * k; cy += (ty - cy) * k; vis += (goal - vis) * k;
      if (goal === 0 && vis < 0.005) { vis = 0; el.style.opacity = '0'; return false; }
      el.style.translate = `${cx.toFixed(2)}px ${cy.toFixed(2)}px`;
      el.style.opacity = vis.toFixed(3);
      el.style.scale = (0.9 + 0.1 * vis).toFixed(4);
      return goal === 0 || Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 || vis < 0.995;
    });
    const aim = e => { px = e.clientX; py = e.clientY; if (goal === 0) { if (vis < 0.05) fresh = true; goal = 1; } start(); };
    zone.addEventListener('pointerenter', aim);
    zone.addEventListener('pointermove', aim);
    zone.addEventListener('pointerleave', () => { goal = 0; start(); });
  };

  const proximity = list => {
    const seen = new Map();
    let pt = null, queued = false;
    const apply = () => {
      queued = false;
      for (const [el, radius] of list) {
        let n = 0;
        if (pt) { const r = el.getBoundingClientRect(); n = clamp(1 - Math.hypot(pt.x - r.left - r.width / 2, pt.y - r.top - r.height / 2) / radius, 0, 1); n = Math.round(n * 1000) / 1000; }
        if (seen.get(el) !== n) { seen.set(el, n); el.style.setProperty('--fw-near', String(n)); }
      }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };
    for (const [el] of list) el.style.setProperty('--fw-near', '0');
    addEventListener('pointermove', e => { pt = { x: e.clientX, y: e.clientY }; queue(); }, { passive: true });
    root.addEventListener('pointerleave', () => { pt = null; queue(); });
  };

  const accordion = (host, o, items) => {
    const open = typeof o.initial === 'number' ? o.initial : -1;
    const set = (i, on) => {
      const { t, p } = items[i];
      t.setAttribute('aria-expanded', String(on));
      if (on) { p.setAttribute('data-fw-open', ''); p.removeAttribute('inert'); p.removeAttribute('aria-hidden'); }
      else { p.removeAttribute('data-fw-open'); p.setAttribute('inert', ''); p.setAttribute('aria-hidden', 'true'); }
    };
    items.forEach(({ t, p }, i) => {
      t.setAttribute('aria-controls', ident(p));
      set(i, p.hasAttribute('data-fw-open') || i === open);
      void p.offsetHeight;
      if (!reduced && parseFloat(getComputedStyle(p).transitionDuration) === 0) p.style.transition = 'grid-template-rows 300ms ease';
      press(t, () => {
        const on = t.getAttribute('aria-expanded') !== 'true';
        if (on && o.single) items.forEach((_, j) => { if (j !== i) set(j, false); });
        set(i, on);
      });
      t.addEventListener('keydown', e => {
        const to = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
        if (to >= 0 && e.target === t) { e.preventDefault(); items[to].t.focus(); }
      });
    });
  };

  const tabs = (host, o, items) => {
    let list = items[0].t.parentElement;
    while (list && !items.every(i => list.contains(i.t))) list = list.parentElement;
    if (list && !list.hasAttribute('role')) list.setAttribute('role', 'tablist');
    const ind = o.indicator ? find(o.indicator, host) : null;
    let cur = -1, ready = false;
    const place = () => {
      if (!ind || cur < 0) return;
      const tr = items[cur].t.getBoundingClientRect();
      if (!tr.width && !tr.height) return;
      const parent = ind.offsetParent || root, pr = parent.getBoundingClientRect(), iw = ind.offsetWidth || 1, ih = ind.offsetHeight || 1;
      const cx = pr.left + (parent.clientLeft || 0) + ind.offsetLeft + iw / 2, cy = pr.top + (parent.clientTop || 0) + ind.offsetTop + ih / 2;
      const a = items[0].t.getBoundingClientRect(), b = items[items.length - 1].t.getBoundingClientRect();
      const vertical = items.length > 1 && Math.abs(a.top - b.top) > Math.abs(a.left - b.left);
      const tx = vertical ? 0 : tr.left + tr.width / 2 - cx, ty = vertical ? tr.top + tr.height / 2 - cy : 0;
      const sx = vertical ? 1 : tr.width / iw, sy = vertical ? tr.height / ih : 1;
      if (!ready) ind.style.transition = 'none';
      ind.style.translate = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`;
      ind.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
      if (!ready) { ready = true; void ind.offsetWidth; ind.style.transition = reduced ? 'none' : 'translate 300ms ease, scale 300ms ease'; }
    };
    const select = (i, focus) => {
      cur = i;
      items.forEach(({ t, p }, j) => { const on = j === i; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; hide(p, !on); });
      if (focus) items[i].t.focus();
      place();
    };
    items.forEach(({ t, p }, i) => {
      t.setAttribute('role', 'tab'); p.setAttribute('role', 'tabpanel');
      t.setAttribute('aria-controls', ident(p)); p.setAttribute('aria-labelledby', ident(t));
      press(t, () => select(i, false));
      t.addEventListener('keydown', e => {
        const n = items.length, to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (to >= 0) { e.preventDefault(); select(to, true); }
      });
    });
    select(clamp(typeof o.initial === 'number' ? o.initial : 0, 0, items.length - 1), false);
    if (ind) {
      if (typeof ResizeObserver === 'function' && list) new ResizeObserver(place).observe(list);
      addEventListener('resize', place);
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(place);
    }
  };

  const filter = (host, o) => {
    const box = find(o.items, host);
    const chips = (o.chips || []).map(c => ({ t: find(c.trigger, host), v: String(c.value) })).filter(c => c.t);
    if (!box || !chips.length) return;
    let cur = null;
    const apply = (val, animate) => {
      cur = val;
      const kids = [...box.children], before = new Map();
      if (animate && !reduced) for (const k of kids) if (!k.hidden) before.set(k, k.getBoundingClientRect());
      for (const k of kids) hide(k, !(val === 'all' || (k.getAttribute('data-fw-tags') || '').split(/\s+/).includes(val)));
      for (const c of chips) c.t.setAttribute('aria-pressed', String(c.v === val));
      if (!animate || reduced) return;
      for (const k of kids) {
        if (k.hidden) continue;
        const was = before.get(k), now = k.getBoundingClientRect();
        if (was) { const dx = was.left - now.left, dy = was.top - now.top; if (dx || dy) k.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' }); }
        else k.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      }
    };
    for (const c of chips) press(c.t, () => apply(cur === c.v && c.v !== 'all' ? 'all' : c.v, true));
    apply(String(o.initial === undefined ? 'all' : o.initial), false);
  };

  const disclosure = (host, o) => {
    if (o.type === 'filter') return filter(host, o);
    const items = (Array.isArray(o.items) ? o.items : []).map(i => ({ t: find(i.trigger, host), p: find(i.panel, host) })).filter(i => i.t && i.p);
    if (!items.length) return;
    if (o.type === 'accordion') accordion(host, o, items); else if (o.type === 'tabs') tabs(host, o, items);
  };

  const copying = new WeakMap();
  const firstText = el => { const w = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.trim()) return n; return null; };
  const feedback = (el, text, ms) => {
    let s = copying.get(el);
    if (s) clearTimeout(s.timer);
    else {
      const node = firstText(el);
      if (!node) return;
      const w = parseFloat(getComputedStyle(el).width) || el.getBoundingClientRect().width;
      s = { node, data: node.data, min: el.style.minWidth };
      copying.set(el, s);
      el.style.minWidth = `${w}px`;
    }
    s.node.data = text;
    s.timer = setTimeout(() => { s.node.data = s.data; el.style.minWidth = s.min; copying.delete(el); }, ms);
  };
  const clip = async text => {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
    const ta = doc.createElement('textarea'), prev = doc.activeElement;
    ta.value = text; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    doc.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch {}
    ta.remove();
    if (prev && prev.focus) prev.focus({ preventScroll: true });
    return ok;
  };
  const copy = async (step, el, ctx) => {
    const src = step.from ? find(step.from, el) : null;
    const text = typeof step.text === 'string' ? step.text : src ? (src.matches('input,textarea,select') ? src.value : src.innerText || src.textContent) : (ctx.value || '');
    if (await clip(text) && step.feedback) feedback(el, String(step.feedback), Number.isFinite(step.duration) ? step.duration : 1600);
  };

  const glide = (y, ms, name) => new Promise(done => {
    const from = scrollY, fn = ease(name);
    let t = 0;
    loop(dt => { t += dt * 1000; const p = Math.min(1, t / ms); scrollTo({ top: from + (y - from) * fn(p), behavior: 'instant' }); if (p >= 1) { done(); return false; } return true; });
  });
  const toNode = async (step, el) => {
    const ms = Number.isFinite(step.duration) ? step.duration : 800;
    if (M) {
      try {
        if (typeof step.progress === 'number' && M.scrollToScene) return await M.scrollToScene(step.to, step.progress, ms, step.easing);
        if (M.scrollToNode) return await M.scrollToNode(step.to, ms, step.easing);
      } catch {}
    }
    const target = find(step.to, el);
    if (!target) return;
    const y = target.getBoundingClientRect().top + scrollY;
    if (reduced) scrollTo({ top: y, behavior: 'instant' });
    else if (Number.isFinite(step.duration)) await glide(y, ms, step.easing);
    else scrollTo({ top: y, behavior: 'smooth' });
  };

  const media = (step, el) => {
    let m = find(step.target, el);
    if (m && !(m instanceof HTMLMediaElement)) m = m.querySelector('video,audio');
    if (!m) return;
    const play = () => { const p = m.play(); if (p && p.catch) p.catch(() => {}); };
    if (step.command === 'play') play();
    else if (step.command === 'pause') m.pause();
    else if (step.command === 'toggle') { if (m.paused) play(); else m.pause(); }
    else if (step.command === 'restart') { m.currentTime = 0; play(); }
  };

  let box = null, source = null, opener = null, busy = false, closing = false;
  const largest = img => {
    const set = img.getAttribute('srcset');
    if (set) {
      let best = null, score = -1;
      for (const part of set.split(',')) { const [u, d] = part.trim().split(/\s+/); const s = d ? parseFloat(d) : 1; if (u && s > score) { score = s; best = u; } }
      if (best) return new URL(best, doc.baseURI).href;
    }
    return img.currentSrc || img.src;
  };
  const dialog = () => {
    if (box) return box;
    const d = doc.createElement('dialog'), im = doc.createElement('img');
    d.className = 'fw-lightbox'; d.setAttribute('aria-label', 'Image preview'); d.tabIndex = -1;
    d.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;overflow:hidden;background:rgba(0,0,0,.88);cursor:zoom-out';
    im.style.cssText = 'position:absolute;inset:0;margin:auto;max-width:92vw;max-height:92vh;object-fit:contain';
    d.appendChild(im);
    d.addEventListener('click', () => shut());
    d.addEventListener('cancel', e => { e.preventDefault(); shut(); });
    doc.body.appendChild(d);
    return (box = d);
  };
  const fly = opening => {
    const im = box.firstChild;
    if (reduced || !source || !source.isConnected) return Promise.resolve();
    const a = source.getBoundingClientRect(), b = im.getBoundingClientRect();
    if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return Promise.resolve();
    const frames = [{ transformOrigin: '0 0', transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})` }, { transformOrigin: '0 0', transform: 'none' }];
    if (!opening) frames.reverse();
    return im.animate(frames, { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)', fill: opening ? 'none' : 'forwards' }).finished.catch(() => {});
  };
  const shut = async () => {
    if (!box || !box.open || closing) return;
    closing = true;
    if (!reduced) { box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }); await fly(false); }
    box.close();
    for (const a of box.getAnimations({ subtree: true })) a.cancel();
    closing = false;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  };
  const lightbox = async (step, el) => {
    const hit = find(step.target, el) || el;
    const img = hit.matches('img') ? hit : hit.querySelector('img');
    if (!img || busy || (box && box.open)) return;
    busy = true;
    try {
      const d = dialog(), im = d.firstChild, src = largest(img);
      im.alt = img.alt || '';
      if (im.getAttribute('src') !== src) im.src = src;
      try { await Promise.race([im.decode(), new Promise(r => setTimeout(r, 1500))]); } catch {}
      source = img;
      opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : el;
      d.showModal();
      if (!reduced) d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
      fly(true);
    } finally { busy = false; }
  };

  const themeKey = () => cfg.context && cfg.context.site ? `fw-theme-${cfg.context.site}` : 'fw-theme';
  const themers = new Set();
  const mark = () => { const dark = (root.getAttribute('data-theme') || (cfg.design && cfg.design.themes && cfg.design.themes.default) || 'dark') === 'dark'; for (const el of themers) el.setAttribute('aria-pressed', String(dark)); };
  const theme = () => {
    const now = root.getAttribute('data-theme') || (cfg.design && cfg.design.themes && cfg.design.themes.default) || 'dark';
    const next = now === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(themeKey(), next); } catch {}
    mark();
  };

  const run = (step, el, ctx) => {
    if (!step || typeof step !== 'object') return;
    let out;
    switch (step.action) {
      case 'copy': out = copy(step, el, ctx); break;
      case 'scroll-to': out = toNode(step, el); break;
      case 'media': media(step, el); break;
      case 'lightbox': out = lightbox(step, el); break;
      case 'toggle-theme': theme(); break;
    }
    if (out && out.catch) out.catch(() => {});
  };

  const bind = (el, step) => {
    const go = ctx => run(step, el, ctx || {});
    if (step.action === 'toggle-theme') { themers.add(el); if (step.trigger !== 'click') el.setAttribute('aria-pressed', 'false'); }
    if (step.action === 'copy' && step.feedback) el.setAttribute('aria-live', 'polite');
    switch (step.trigger) {
      case 'click': press(el, e => { if (e.type === 'click' && el.matches('a,button')) e.preventDefault(); go(); }); break;
      case 'hover': el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') go(); }); break;
      case 'change': el.addEventListener('change', () => go({ value: el.value })); break;
      case 'submit': {
        const form = el.matches('form') ? el : el.closest('form') || el.querySelector('form');
        if (form) form.addEventListener('submit', e => { e.preventDefault(); const field = form.querySelector('input:not([type=submit]):not([type=button]),textarea,select'); go({ value: field ? field.value : '' }); });
        break;
      }
      case 'load': go(); break;
      case 'view': {
        if (typeof IntersectionObserver !== 'function') { go(); break; }
        const io = new IntersectionObserver(list => { if (list.some(i => i.isIntersecting)) { io.disconnect(); go(); } }, { threshold: 0.25 });
        io.observe(el);
        break;
      }
    }
  };

  const init = () => {
    const each = (kind, fn) => { const map = motion[kind]; if (map && typeof map === 'object') for (const [id, o] of Object.entries(map)) if (o && typeof o === 'object') nodes(id).forEach(el => guard(() => fn(el, o))); };
    each('drag', drag);
    const near = [];
    each('pointer', (el, o) => {
      if (o.type === 'tilt') tilt(el, o);
      else if (o.type === 'follow') follow(el, o);
      else if (o.type === 'proximity') near.push([el, Number(o.radius) > 0 ? Number(o.radius) : 200]);
    });
    if (near.length) guard(() => proximity(near));
    each('disclosure', disclosure);
    const acts = motion.actions;
    if (acts && typeof acts === 'object') {
      for (const [id, steps] of Object.entries(acts)) {
        if (!Array.isArray(steps)) continue;
        for (const el of nodes(id)) for (const step of steps) if (step && typeof step === 'object') guard(() => bind(el, step));
      }
      mark();
    }
    doc.addEventListener('formweb-motion-action', e => {
      const d = e.detail || {};
      const step = typeof d.action === 'string' ? { action: d.action, ...d } : d.action;
      const origin = typeof d.origin === 'string' ? nodes(d.origin)[0] : d.origin;
      guard(() => run(step, origin instanceof Element ? origin : doc.body, {}));
    });
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
