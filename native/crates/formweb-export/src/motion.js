(() => {
  'use strict';
  let config = {};
  try { config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const motion = config.motion;
  if (!motion || typeof motion !== 'object') return;
  const html = document.documentElement;
  const reduced = html.classList.contains('fw-r') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SAFE = /^(opacity|transform|translate|scale|rotate|filter|backdrop-filter|clip-path|color|background-color|border-color|box-shadow|--.+)$/;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const kebab = k => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
  const camel = k => (k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
  const all = (id, root = document) => {
    const sel = `[data-fw-node="${CSS.escape(String(id))}"]`;
    const found = [...root.querySelectorAll(sel)];
    return root !== document && root.matches(sel) ? [root, ...found] : found;
  };
  const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };
  const entries = map => Object.entries(map && typeof map === 'object' ? map : {});

  const bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 24; i++) { const e = sx(t); if (Math.abs(e - x) < 1e-6) break; if (e < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  };
  const spring = (stiffness, damping) => {
    const w0 = Math.sqrt(stiffness), z = damping / (2 * w0);
    let raw;
    let settle;
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      settle = Math.min(6 / (z * w0), 20);
      raw = s => 1 - Math.exp(-z * w0 * s) * (Math.cos(wd * s) + (z * w0 / wd) * Math.sin(wd * s));
    } else if (z === 1) {
      settle = Math.min(8 / w0, 20);
      raw = s => 1 - Math.exp(-w0 * s) * (1 + w0 * s);
    } else {
      const q = Math.sqrt(z * z - 1), r1 = -w0 * (z - q), r2 = -w0 * (z + q);
      settle = Math.min(6 / -r1, 20);
      raw = s => 1 - (r2 * Math.exp(r1 * s) - r1 * Math.exp(r2 * s)) / (r2 - r1);
    }
    const end = raw(settle);
    return t => (t <= 0 ? 0 : t >= 1 ? 1 : raw(t * settle) + (1 - end) * t);
  };
  const KEYWORDS = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
  const easings = new Map();
  const easing = name => {
    const key = String(name || 'linear').trim();
    let fn = easings.get(key);
    if (fn) return fn;
    const args = (/\(([^)]*)\)/.exec(key)?.[1] || '').split(',').map(Number);
    if (key === 'linear') fn = t => t;
    else if (KEYWORDS[key]) fn = bezier(...KEYWORDS[key]);
    else if (key.startsWith('cubic-bezier') && args.length === 4 && args.every(Number.isFinite)) fn = bezier(...args);
    else if (key.startsWith('spring') && args.length === 2 && args.every(Number.isFinite) && args[0] > 0 && args[1] > 0) fn = spring(args[0], args[1]);
    else fn = t => t;
    easings.set(key, fn);
    return fn;
  };
  const LINEAR_OK = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  const cssEasing = name => {
    const key = String(name || 'ease').trim();
    if (KEYWORDS[key] || key.startsWith('cubic-bezier')) return key;
    if (key === 'linear') return 'linear';
    if (key.startsWith('spring') && LINEAR_OK) {
      const fn = easing(key);
      const points = [];
      for (let i = 0; i <= 40; i++) points.push((Math.round(fn(i / 40) * 1000) / 1000).toString());
      return `linear(${points.join(',')})`;
    }
    return 'ease-out';
  };

  const subs = new Set();
  let raf = 0, lastTime = 0;
  const tick = now => {
    raf = 0;
    if (document.hidden || !subs.size) { lastTime = 0; return; }
    const dt = lastTime ? Math.min(now - lastTime, 100) : 16;
    lastTime = now;
    for (const fn of subs) fn(now, dt);
    if (subs.size) raf = requestAnimationFrame(tick); else lastTime = 0;
  };
  const kick = () => { if (!raf && subs.size && !document.hidden) raf = requestAnimationFrame(tick); };
  const onFrame = fn => { subs.add(fn); kick(); return () => { subs.delete(fn); }; };
  document.addEventListener('visibilitychange', () => { lastTime = 0; kick(); });

  const hex = s => s.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi, (_, h) => {
    if (h.length < 6) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return h.length === 8 ? `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${Math.round(n(6) / 255 * 1000) / 1000})` : `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
  });
  const parsed = new Map();
  const parse = str => {
    let p = parsed.get(str);
    if (p) return p;
    p = { parts: [], nums: [], units: [] };
    const re = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z%]*)/gi;
    const s = hex(str);
    let last = 0, m;
    while ((m = re.exec(s))) { p.parts.push(s.slice(last, m.index)); p.nums.push(parseFloat(m[1])); p.units.push(m[2]); last = m.index + m[0].length; }
    p.parts.push(s.slice(last));
    parsed.set(str, p);
    return p;
  };
  const round = v => Math.round(v * 1000) / 1000;
  const interpolate = (a, b, t) => {
    a = String(a); b = String(b);
    if (a === b) return a;
    const pa = parse(a), pb = parse(b);
    const n = pa.nums.length;
    let ok = n === pb.nums.length && n > 0 && pa.parts.every((s, i) => s === pb.parts[i]);
    const units = [];
    for (let i = 0; ok && i < n; i++) {
      const ua = pa.units[i], ub = pb.units[i];
      if (ua === ub) units.push(ua);
      else if (pa.nums[i] === 0 && ua === '') units.push(ub);
      else if (pb.nums[i] === 0 && ub === '') units.push(ua);
      else ok = false;
    }
    if (!ok) return t < 0.5 ? a : b;
    let out = pa.parts[0];
    for (let i = 0; i < n; i++) out += round(pa.nums[i] + (pb.nums[i] - pa.nums[i]) * t) + units[i] + pa.parts[i + 1];
    return out;
  };
  const applyStyles = (el, styles) => {
    for (const [k, v] of entries(styles)) { const key = kebab(k); if (SAFE.test(key)) el.style.setProperty(key, String(v)); }
  };
  const frameStyles = styles => {
    const out = {};
    for (const [k, v] of entries(styles)) if (SAFE.test(kebab(k))) out[camel(k)] = String(v);
    return out;
  };
  const styleKeys = styles => Object.keys(styles || {}).map(kebab).filter(k => SAFE.test(k));

  const pools = new Map();
  const watch = (el, threshold, margin, fn) => {
    const key = threshold + '|' + margin;
    let pool = pools.get(key);
    if (!pool) {
      pool = { map: new Map() };
      let io;
      try { io = new IntersectionObserver(list => { for (const e of list) for (const f of [...(pool.map.get(e.target) || [])]) f(e); }, { threshold, rootMargin: margin }); }
      catch { io = new IntersectionObserver(list => { for (const e of list) for (const f of [...(pool.map.get(e.target) || [])]) f(e); }, { threshold, rootMargin: '0px' }); }
      pool.io = io;
      pools.set(key, pool);
    }
    let fns = pool.map.get(el);
    if (!fns) { fns = []; pool.map.set(el, fns); pool.io.observe(el); }
    fns.push(fn);
    return () => {
      const l = pool.map.get(el);
      if (!l) return;
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) { pool.map.delete(el); pool.io.unobserve(el); }
    };
  };
  const whenIn = (el, cfg, run, threshold = 0.15) => {
    if (cfg.trigger === 'load') { ready(run); return; }
    const stop = watch(el, clamp(Number(cfg.threshold ?? threshold), 0, 1), cfg.rootMargin || '0px', e => { if (e.isIntersecting) { stop(); run(); } });
  };

  const authoredOf = list => {
    const root = html.classList.contains('fw-m');
    const els = list.map(l => l.el);
    const held = els.map(el => el.style.getPropertyValue('transition'));
    for (const el of els) el.style.setProperty('transition', 'none');
    if (root) html.classList.remove('fw-m');
    const out = list.map(({ el, keys }) => { const cs = getComputedStyle(el); return keys.map(k => cs.getPropertyValue(k).trim()); });
    if (root) { html.classList.add('fw-m'); if (els[0]) getComputedStyle(els[0]).opacity; }
    els.forEach((el, i) => { if (held[i]) el.style.setProperty('transition', held[i]); else el.style.removeProperty('transition'); });
    return out;
  };
  const toFrame = (keys, values) => { const o = {}; keys.forEach((k, i) => { if (values[i]) o[camel(k)] = values[i]; }); return o; };

  const scrollJobs = { id: 0 };
  for (const type of ['wheel', 'touchstart', 'keydown']) addEventListener(type, () => { scrollJobs.id++; }, { passive: true });
  const glide = (target, duration, easingName) => new Promise(resolve => {
    const job = ++scrollJobs.id;
    const from = scrollY;
    if (reduced || !(duration > 0) || Math.abs(target - from) < 1) { scrollTo({ top: target, behavior: 'instant' }); resolve(); return; }
    const ease = easing(easingName);
    let start = -1;
    const stop = onFrame(now => {
      if (job !== scrollJobs.id) { stop(); resolve(); return; }
      if (start < 0) start = now;
      const t = Math.min(1, (now - start) / duration);
      scrollTo({ top: from + (target - from) * ease(t), behavior: 'instant' });
      if (t >= 1) { stop(); resolve(); }
    });
  });

  const sceneStates = new Map();
  const sceneProgress = id => sceneStates.get(id)?.[0]?.s || 0;
  const scrollToNode = (id, duration, easingName) => {
    const el = all(id)[0];
    if (!el) return Promise.resolve();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    return glide(el.getBoundingClientRect().top + scrollY - margin, duration, easingName);
  };
  const scrollToScene = (id, progress, duration, easingName) => {
    const s = sceneStates.get(id)?.[0];
    if (!s) return scrollToNode(id, duration, easingName);
    s.measure();
    const r = s.el.getBoundingClientRect();
    const span = Math.max(0, r.height - s.stageH);
    return glide(r.top + scrollY - s.offset + clamp(Number(progress) || 0, 0, 1) * span, duration, easingName);
  };

  const sampleProps = keyframes => {
    const props = new Map();
    for (const kf of [...(keyframes || [])].sort((a, b) => a.at - b.at)) {
      for (const [k, v] of entries(kf.styles)) {
        const key = kebab(k);
        if (!SAFE.test(key)) continue;
        if (!props.has(key)) props.set(key, []);
        props.get(key).push({ at: Number(kf.at) || 0, v: String(v) });
      }
    }
    return props;
  };
  const sample = (props, p, ease) => {
    const out = [];
    for (const [key, arr] of props) {
      let v;
      const last = arr.length - 1;
      if (p <= arr[0].at) v = arr[0].v;
      else if (p >= arr[last].at) v = arr[last].v;
      else {
        let i = 0;
        while (i < last - 1 && arr[i + 1].at <= p) i++;
        const span = arr[i + 1].at - arr[i].at;
        v = interpolate(arr[i].v, arr[i + 1].v, span > 0 ? ease((p - arr[i].at) / span) : 1);
      }
      out.push(key, v);
    }
    return out;
  };
  const written = new WeakMap();
  const put = (el, key, v) => {
    let m = written.get(el);
    if (!m) { m = new Map(); written.set(el, m); }
    if (m.get(key) !== v) { m.set(key, v); el.style.setProperty(key, v); }
  };

  const initReveals = () => {
    const groups = [];
    for (const [id, cfg] of entries(motion.reveals)) {
      const keys = styleKeys(cfg.from);
      if (!keys.length) continue;
      for (const el of all(id)) groups.push({ el, cfg, keys, shown: false, anims: [], done: [] });
    }
    if (reduced || !groups.length) return;
    const pending = [];
    let queued = false;
    const flush = () => {
      queued = false;
      const batch = pending.splice(0).filter(g => !g.shown);
      if (!batch.length) return;
      const jobs = [];
      for (const g of batch) { g.shown = true; for (const el of g.cfg.children ? [...g.el.children] : [g.el]) jobs.push({ g, el, keys: g.keys }); }
      const authored = authoredOf(jobs);
      const idx = new Map();
      jobs.forEach((j, i) => {
        const n = idx.get(j.g) || 0;
        idx.set(j.g, n + 1);
        const c = j.g.cfg;
        const to = toFrame(j.keys, authored[i]);
        const anim = j.el.animate([frameStyles(c.from), to], { duration: Number(c.duration ?? 600), delay: Number(c.delay || 0) + n * Number(c.stagger || 0), easing: cssEasing(c.easing || 'ease-out'), fill: 'both' });
        j.g.anims.push(anim);
        j.g.done.push(j);
        anim.onfinish = () => {
          j.el.dataset.fwIn = '';
          j.keys.forEach((k, ki) => { if (authored[i][ki]) j.el.style.setProperty(k, authored[i][ki]); });
          anim.cancel();
        };
      });
    };
    const arm = g => { pending.push(g); if (!queued) { queued = true; queueMicrotask(flush); } };
    const reset = g => {
      for (const a of g.anims) a.cancel();
      for (const j of g.done) { delete j.el.dataset.fwIn; for (const k of j.keys) j.el.style.removeProperty(k); }
      g.anims = []; g.done = []; g.shown = false;
    };
    for (const g of groups) {
      const c = g.cfg;
      if (c.trigger === 'load') { ready(() => arm(g)); continue; }
      const once = c.once !== false;
      const stop = watch(g.el, clamp(Number(c.threshold ?? 0.15), 0, 1), c.rootMargin || '0px', e => {
        if (e.isIntersecting) { if (!g.shown) arm(g); if (once) stop(); }
        else if (!once && g.shown) reset(g);
      });
    }
  };

  const initScenes = () => {
    const list = [];
    for (const [id, cfg] of entries(motion.scenes)) {
      const states = [];
      for (const el of all(id)) {
        const stage = cfg.stage ? all(cfg.stage, el).find(n => n !== el) || null : null;
        const s = {
          id, cfg, el, stage, offset: 0, stageH: 0, s: 0, prev: 0, applied: -1, init: false,
          tracks: (cfg.tracks || []).map(t => ({ items: all(t.node, el), props: sampleProps(t.keyframes), ease: easing(t.easing || 'linear') })),
          dist: (cfg.distribute || []).map(d => ({ parents: all(d.parent, el), props: sampleProps(d.keyframes), stagger: Number(d.stagger || 0), ease: easing(d.easing || 'linear') })),
          measure() {
            this.stageH = stage ? stage.getBoundingClientRect().height : innerHeight;
            this.offset = stage ? parseFloat(getComputedStyle(stage).top) || 0 : 0;
          }
        };
        s.measure();
        states.push(s);
        list.push(s);
      }
      if (states.length) sceneStates.set(id, states);
    }
    if (!list.length) return;
    if (reduced) {
      for (const s of list) if (s.cfg.progressVar) s.el.style.setProperty('--fw-progress', String(s.cfg.reducedAt ?? 1));
      return;
    }
    let dirty = true, stopFrame = null;
    const frame = (now, dt) => {
      dirty = false;
      let busy = false;
      const live = [];
      for (const s of list) {
        const r = s.el.getBoundingClientRect();
        if (r.bottom >= -innerHeight && r.top <= innerHeight * 2) live.push(s, r.top, r.height);
      }
      for (let i = 0; i < live.length; i += 3) {
        const s = live[i], span = live[i + 2] - s.stageH;
        const raw = span > 0 ? clamp((s.offset - live[i + 1]) / span, 0, 1) : 0;
        const tau = Number(s.cfg.smoothing || 0);
        if (!s.init) { s.init = true; s.s = s.prev = raw; }
        else if (tau > 0) s.s += (raw - s.s) * (1 - Math.exp(-dt / tau));
        else s.s = raw;
        if (Math.abs(raw - s.s) < 5e-4) s.s = raw; else busy = true;
        if (s.s !== s.applied) {
          s.applied = s.s;
          for (const t of s.tracks) { const vals = sample(t.props, s.s, t.ease); for (const el of t.items) for (let k = 0; k < vals.length; k += 2) put(el, vals[k], vals[k + 1]); }
          for (const d of s.dist) {
            for (const parent of d.parents) {
              const kids = parent.children, n = kids.length, den = Math.max(1 - (n - 1) * d.stagger, 0.01);
              for (let c = 0; c < n; c++) { const vals = sample(d.props, clamp((s.s - c * d.stagger) / den, 0, 1), d.ease); for (let k = 0; k < vals.length; k += 2) put(kids[c], vals[k], vals[k + 1]); }
            }
          }
          if (s.cfg.progressVar) put(s.el, '--fw-progress', s.s.toFixed(4));
        }
        for (const m of s.cfg.markers || []) if (s.prev < m.at && s.s >= m.at) document.dispatchEvent(new CustomEvent('formweb-motion-action', { detail: { action: m.action, origin: s.el } }));
        s.prev = s.s;
      }
      if (!busy && !dirty && stopFrame) { stopFrame(); stopFrame = null; }
    };
    const wake = () => { dirty = true; if (!stopFrame) stopFrame = onFrame(frame); };
    addEventListener('scroll', wake, { passive: true });
    addEventListener('resize', wake);
    const ro = new ResizeObserver(() => { for (const s of list) s.measure(); wake(); });
    for (const s of list) { ro.observe(s.el); if (s.stage) ro.observe(s.stage); }
    frame(performance.now(), 16);
    wake();
  };

  const initLoops = () => {
    if (reduced) return;
    const marquees = [];
    for (const [id, cfg] of entries(motion.loops)) {
      for (const el of all(id)) {
        const type = cfg.type;
        const duration = Number(cfg.duration || 0);
        if (type === 'marquee') {
          const track = el.querySelector(':scope > .fw-track');
          if (!track || track.dataset.fwCloned) continue;
          const originals = [...track.children];
          if (!originals.length) continue;
          track.dataset.fwCloned = '';
          for (const child of originals) {
            const copy = child.cloneNode(true);
            copy.setAttribute('aria-hidden', 'true');
            copy.setAttribute('inert', '');
            copy.removeAttribute('id');
            for (const n of copy.querySelectorAll('[id]')) n.removeAttribute('id');
            track.append(copy);
          }
          marquees.push({ el, track, cfg, first: originals[0], clone: track.children[originals.length], anim: null, hover: false, off: false });
        } else if (type === 'spin') {
          el.animate([{ rotate: '0deg' }, { rotate: `${Number(cfg.amount ?? 360)}deg` }], { duration: clamp(duration || 8000, 100, 120000), iterations: Infinity, easing: 'linear' });
        } else if (type === 'float') {
          el.animate([{ translate: '0 0' }, { translate: `0 ${-Number(cfg.amount ?? 12)}px` }], { duration: clamp(duration || 4000, 100, 120000), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        } else if (type === 'keyframes' && Array.isArray(cfg.keyframes) && cfg.keyframes.length > 1) {
          const frames = cfg.keyframes.map(k => ({ ...frameStyles(k.styles), offset: clamp(Number(k.at ?? k.offset ?? 0), 0, 1) }));
          el.animate(frames, { duration: clamp(duration || 2000, 100, 120000), easing: cssEasing(cfg.easing || 'linear'), iterations: cfg.iterations === 'infinite' || cfg.iterations == null ? Infinity : Number(cfg.iterations) });
        }
      }
    }
    if (!marquees.length) return;
    const retime = list => {
      const reads = list.map(m => {
        const vertical = m.cfg.direction === 'up' || m.cfg.direction === 'down';
        const a = m.first, b = m.clone;
        let dist = vertical ? b.offsetTop - a.offsetTop : b.offsetLeft - a.offsetLeft;
        if (!(dist > 0)) dist = (vertical ? m.track.offsetHeight : m.track.offsetWidth) / 2;
        return { m, vertical, dist };
      });
      for (const { m, vertical, dist } of reads) {
        if (!(dist > 0)) continue;
        const reverse = m.cfg.direction === 'right' || m.cfg.direction === 'down';
        const at = v => (vertical ? `0 ${v}px` : `${v}px 0`);
        const frames = [{ translate: at(reverse ? -dist : 0) }, { translate: at(reverse ? 0 : -dist) }];
        const duration = dist / clamp(Number(m.cfg.speed || 40), 1, 2000) * 1000;
        if (!m.anim) { m.anim = m.track.animate(frames, { duration, iterations: Infinity, easing: 'linear' }); sync(m); continue; }
        const progress = m.anim.effect.getComputedTiming().progress || 0;
        m.anim.effect.setKeyframes(frames);
        m.anim.effect.updateTiming({ duration });
        m.anim.currentTime = progress * duration;
      }
    };
    const sync = m => { if (!m.anim) return; if (m.hover || m.off) m.anim.pause(); else m.anim.play(); };
    for (const m of marquees) {
      if (m.cfg.pauseOnHover) {
        m.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { m.hover = true; sync(m); } });
        m.el.addEventListener('pointerleave', () => { m.hover = false; sync(m); });
      }
      if (m.cfg.pauseOffscreen) watch(m.el, 0, '0px', e => { m.off = !e.isIntersecting; sync(m); });
    }
    retime(marquees);
    const ro = new ResizeObserver(() => retime(marquees));
    for (const m of marquees) ro.observe(m.track);
    if (document.fonts?.ready) document.fonts.ready.then(() => retime(marquees));
  };

  const NUMBER = /(\d{1,3}(?:([,  ])\d{3})+|\d+)(\.\d+)?/;
  const initCounters = () => {
    for (const [id, cfg] of entries(motion.counters)) {
      for (const el of all(id)) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, m;
        while ((node = walker.nextNode())) { m = NUMBER.exec(node.data); if (m) break; }
        if (!m) continue;
        const from = Number(cfg.from || 0), to = Number(cfg.to ?? 0), decimals = clamp(Number(cfg.decimals || 0), 0, 8);
        const sep = m[2] || '';
        const prefix = node.data.slice(0, m.index), suffix = node.data.slice(m.index + m[0].length);
        const format = v => {
          const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
          const body = sep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
          return (v < 0 ? '-' : '') + body + (frac ? '.' + frac : '');
        };
        let update = v => { const next = prefix + format(v) + suffix; if (node.data !== next) node.data = next; };
        if (!el.style.minWidth) { const range = document.createRange(); range.selectNodeContents(el); const width = Math.ceil(range.getBoundingClientRect().width); if (width) el.style.minWidth = width + 'px'; }
        if (reduced) { update(to); continue; }
        if (cfg.odometer) {
          const template = format(Math.max(Math.abs(from), Math.abs(to)));
          const root = document.createElement('span');
          const cols = document.createElement('span');
          const label = document.createElement('span');
          const pre = document.createTextNode(prefix), post = document.createTextNode(suffix);
          cols.setAttribute('aria-hidden', 'true');
          label.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
          label.textContent = prefix + format(to) + suffix;
          const strips = [...template].map(ch => {
            const col = document.createElement('span');
            if (!/\d/.test(ch)) { col.append(document.createTextNode(ch)); cols.append(col); return { col, digit: false, text: col.firstChild, ch }; }
            col.style.cssText = 'display:inline-block;height:1lh;overflow:hidden;vertical-align:text-bottom';
            const strip = document.createElement('span');
            strip.style.cssText = 'display:block;transition:translate 160ms ease-out;translate:0 -10lh';
            for (let d = 0; d <= 10; d++) { const cell = document.createElement('span'); cell.style.cssText = 'display:block;height:1lh'; cell.textContent = d < 10 ? String(d) : ''; strip.append(cell); }
            col.append(strip);
            cols.append(col);
            return { col, strip, digit: true };
          });
          root.append(pre, cols, label, post);
          node.replaceWith(root);
          let shown = '';
          update = v => {
            const s = format(v).padStart(strips.length, ' ');
            if (s === shown) return;
            shown = s;
            strips.forEach((c, i) => {
              if (c.digit) c.strip.style.translate = `0 ${s[i] === ' ' ? -10 : -Number(s[i])}lh`;
              else { const t = /\d| /.test(s[i]) ? '' : s[i]; if (c.text.data !== t) c.text.data = t; }
            });
          };
        }
        update(from);
        const ease = easing('ease-out'), duration = Math.max(1, Number(cfg.duration ?? 1200));
        whenIn(el, cfg, () => {
          let start = -1;
          const stop = onFrame(now => {
            if (start < 0) start = now;
            const t = Math.min(1, (now - start) / duration);
            update(t >= 1 ? to : from + (to - from) * ease(t));
            if (t >= 1) stop();
          });
        }, 0.3);
      }
    }
  };

  const initText = () => {
    const jobs = [];
    for (const [id, cfg] of entries(motion.text)) for (const el of all(id)) jobs.push({ el, cfg });
    if (!jobs.length) return;
    if (reduced) return;
    const splits = jobs.filter(j => j.cfg.type === 'split');
    const plans = splits.map(({ el, cfg }) => {
      const sel = cfg.by === 'chars' ? '.fw-c' : '.fw-w';
      const parts = [...el.querySelectorAll(sel)];
      const keys = styleKeys(cfg.from);
      return { el, cfg, parts, keys };
    }).filter(p => p.parts.length && p.keys.length);
    const authored = plans.map(p => authoredOfPart(p));
    plans.forEach((p, i) => {
      const to = toFrame(p.keys, authored[i]);
      for (const part of p.parts) applyStyles(part, p.cfg.from);
      whenIn(p.el, p.cfg, () => {
        let groups;
        if (p.cfg.by === 'lines') {
          const rows = new Map();
          for (const part of p.parts) { const top = Math.round(part.offsetTop); if (!rows.has(top)) rows.set(top, []); rows.get(top).push(part); }
          groups = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(r => r[1]);
        } else groups = p.parts.map(x => [x]);
        groups.forEach((group, gi) => {
          for (const part of group) {
            const anim = part.animate([frameStyles(p.cfg.from), to], { duration: Number(p.cfg.duration ?? 500), delay: gi * Number(p.cfg.stagger || 0), easing: cssEasing(p.cfg.easing || 'ease-out'), fill: 'both' });
            anim.onfinish = () => { for (const k of p.keys) part.style.removeProperty(k); anim.cancel(); };
          }
        });
      });
    });
    for (const { el, cfg } of jobs.filter(j => j.cfg.type === 'typewriter')) {
      const chars = [...el.querySelectorAll('.fw-c')];
      if (!chars.length) continue;
      for (const c of chars) c.style.visibility = 'hidden';
      let caret = null;
      if (cfg.cursor) {
        caret = document.createElement('span');
        caret.setAttribute('aria-hidden', 'true');
        caret.style.cssText = 'display:inline-block;width:0;height:1em;vertical-align:text-bottom;box-shadow:0 0 0 1px currentColor;visibility:hidden';
        chars[0].before(caret);
      }
      whenIn(el, cfg, () => {
        const speed = Math.max(1, Number(cfg.speed ?? 30));
        let start = -1, shown = 0;
        if (caret) {
          caret.style.visibility = '';
          caret.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: 1000, iterations: Infinity });
        }
        const stop = onFrame(now => {
          if (start < 0) start = now;
          const want = Math.min(chars.length, Math.floor((now - start) / speed) + 1);
          if (want === shown) return;
          for (; shown < want; shown++) chars[shown].style.visibility = '';
          if (caret) chars[shown - 1].after(caret);
          if (shown >= chars.length) stop();
        });
      });
    }
    for (const { el, cfg } of jobs.filter(j => j.cfg.type === 'ghost')) {
      const input = el.matches('input,textarea') ? el : el.querySelector('input,textarea');
      const strings = (cfg.strings || []).map(String).filter(Boolean);
      if (!input || !strings.length) continue;
      const original = input.getAttribute('placeholder') || '';
      const speed = Number(cfg.speed ?? 60), erase = Number(cfg.erase ?? 30), hold = Number(cfg.hold ?? 1500);
      let index = 0, count = 0, phase = 'type', timer = 0, visible = false;
      const busy = () => document.activeElement === input || input.value !== '' || !visible || document.hidden;
      const step = () => {
        timer = 0;
        if (busy()) { if (input.value !== '' || document.activeElement === input) input.setAttribute('placeholder', original); return; }
        const s = strings[index];
        let wait = speed;
        if (phase === 'type') { count++; if (count >= s.length) { phase = 'hold'; wait = hold; } }
        else if (phase === 'hold') { phase = 'erase'; wait = erase; }
        else { count--; wait = erase; if (count <= 0) { phase = 'type'; index = (index + 1) % strings.length; wait = speed * 3; } }
        input.setAttribute('placeholder', s.slice(0, Math.max(count, 0)));
        timer = setTimeout(step, wait);
      };
      const resume = () => { if (!timer && !busy()) timer = setTimeout(step, speed); };
      input.addEventListener('blur', resume);
      input.addEventListener('input', () => { if (input.value === '') resume(); });
      document.addEventListener('visibilitychange', resume);
      watch(el, 0, '0px', e => { visible = e.isIntersecting; if (visible) resume(); });
    }
  };
  const authoredOfPart = p => {
    const cs = getComputedStyle(p.parts[0]);
    return p.keys.map(k => cs.getPropertyValue(k).trim());
  };

  globalThis.__formwebMotion = Object.freeze({ config, reduced, easing, onFrame, interpolate, applyStyles, sceneProgress, scrollToScene, scrollToNode });

  initReveals();
  initScenes();
  initLoops();
  initCounters();
  initText();
})();
