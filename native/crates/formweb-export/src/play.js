(() => {
  'use strict';
  let config = {};
  try { config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const motion = config.motion;
  if (!motion || typeof motion !== 'object') return;
  const html = document.documentElement;
  const M = globalThis.__formwebMotion || null;
  const reduced = M ? !!M.reduced : (html.classList.contains('fw-r') || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, fallback, lo, hi) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : fallback; };
  const guard = fn => { try { return fn(); } catch {} };
  const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };
  const entries = map => Object.entries(map && typeof map === 'object' ? map : {});
  const STOP = { stop: true };
  const prefix = typeof config.routePrefix === 'string' && config.routePrefix ? config.routePrefix : './';

  const nodes = id => {
    if (id === undefined || id === null || id === '') return [];
    return [...document.querySelectorAll(`[data-fw-node="${CSS.escape(String(id))}"]`)].filter(n => !n.closest('[data-fw-clone]'));
  };
  const node = id => nodes(id)[0] || null;
  const isField = el => !!el && el.matches('input,textarea');
  const withSelf = (root, sel) => (root.matches(sel) ? [root] : []).concat([...root.querySelectorAll(sel)]);
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

  const textTarget = root => {
    let el = root;
    for (;;) {
      const next = [...el.children].find(c => c.textContent.trim() !== '');
      if (!next) return el;
      el = next;
    }
  };
  const clone = tpl => {
    const copy = tpl.cloneNode(true);
    copy.removeAttribute('hidden');
    copy.removeAttribute('id');
    for (const n of copy.querySelectorAll('[id]')) n.removeAttribute('id');
    copy.setAttribute('data-fw-clone', '');
    return copy;
  };

  const frame = (ms, fn, alive, ease) => new Promise(resolve => {
    let start = -1, dead = false, off = null;
    const finish = () => { dead = true; if (off) off(); resolve(); };
    const cb = now => {
      if (dead) return;
      if (!alive()) { finish(); return; }
      if (start < 0) start = now;
      const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
      fn(ease ? ease(t) : t, t);
      if (t >= 1) finish();
    };
    if (M && M.onFrame) off = M.onFrame(cb);
    else {
      const tick = now => { if (dead) return; cb(now); if (!dead) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const easeOf = name => (M && M.easing ? M.easing(name || 'ease-in-out') : t => t);

  const variableText = name => {
    const V = globalThis.__formwebVariables;
    if (!V || typeof V.get !== 'function') return '';
    const v = guard(() => V.get(name));
    return v === undefined || v === null ? '' : String(v);
  };
  const expand = text => String(text ?? '').slice(0, 4000).replace(/\{(input|var):([^{}]+)\}/g, (all, kind, name) => {
    name = name.trim();
    if (kind === 'var') return variableText(name);
    const el = node(name);
    return el && 'value' in el ? String(el.value ?? '') : '';
  });

  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const offsets = new WeakMap();
  const offsetOf = el => {
    let o = offsets.get(el);
    if (o) return o;
    const m = /^(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?$/.exec(el.style.translate || '');
    o = m ? { x: parseFloat(m[1]), y: parseFloat(m[2] || 0) } : { x: 0, y: 0 };
    offsets.set(el, o);
    return o;
  };
  const place = (el, x, y) => {
    const o = offsetOf(el);
    o.x = x; o.y = y;
    el.style.translate = `${Math.round(x * 100) / 100}px ${Math.round(y * 100) / 100}px`;
  };

  const IDENT = /^[A-Za-z_][\w-]*$/;
  const list = v => (Array.isArray(v) ? v : []).filter(s => typeof s === 'string' && IDENT.test(s));

  const states = new Map();

  const execute = async (st, id, step) => {
    const alive = () => st.id === id;
    const check = () => { if (!alive()) throw STOP; };
    const target = name => (typeof name === 'string' && name[0] === '@' ? st.aliases.get(name.slice(1)) || null : node(name));
    switch (step.type) {
      case 'append': {
        const tpl = node(step.template), into = node(step.into);
        if (!tpl || !into) return;
        const copy = clone(tpl);
        if (typeof step.text === 'string') setText(textTarget(copy), expand(step.text));
        into.append(copy);
        st.clones.push(copy);
        if (typeof step.as === 'string' && step.as) st.aliases.set(step.as, copy);
        return;
      }
      case 'clear': {
        const el = target(step.target);
        if (!el) return;
        if (isField(el)) { if (el.value !== '') { el.value = ''; fire(el, 'input'); } } else setText(el, '');
        return;
      }
      case 'wait':
        await sleep(num(step.ms, 0, 0, 60000));
        check();
        return;
      case 'stream': {
        const el = target(step.target);
        if (!el) return;
        const dest = isField(el) ? el : textTarget(el);
        const text = expand(step.text);
        const by = step.by === 'words' ? 'words' : 'chars';
        const parts = by === 'words' ? text.match(/\S+\s*/g) || [] : [...text];
        const speed = num(step.speed, 40, 1, 2000);
        const write = n => { const s = parts.slice(0, n).join(''); if (isField(dest)) { if (dest.value !== s) dest.value = s; } else setText(dest, s); };
        if (reduced || !parts.length) { write(parts.length); return; }
        let shown = -1;
        await frame(parts.length / speed * 1000, (e, t) => {
          const n = t >= 1 ? parts.length : Math.min(parts.length, Math.floor(t * parts.length));
          if (n !== shown) { shown = n; write(n); }
        }, alive);
        check();
        return;
      }
      case 'type': {
        const el = target(step.target);
        if (!el || !isField(el)) return;
        const chars = [...expand(step.text)];
        const speed = num(step.speed, 24, 1, 2000);
        const write = n => { const s = chars.slice(0, n).join(''); if (el.value !== s) { el.value = s; fire(el, 'input'); } };
        if (reduced || !chars.length) { write(chars.length); return; }
        let shown = -1;
        await frame(chars.length / speed * 1000, (e, t) => {
          const n = t >= 1 ? chars.length : Math.min(chars.length, Math.floor(t * chars.length));
          if (n !== shown) { shown = n; write(n); }
        }, alive);
        check();
        return;
      }
      case 'class': {
        const el = target(step.target);
        if (!el) return;
        const add = list(step.add), remove = list(step.remove);
        if (remove.length) el.classList.remove(...remove);
        if (add.length) el.classList.add(...add);
        return;
      }
      case 'pointer': {
        const el = target(step.target), to = target(step.to);
        if (!el || !to) return;
        const a = el.getBoundingClientRect(), b = to.getBoundingClientRect();
        const o = offsetOf(el);
        const fx = o.x, fy = o.y;
        const tx = fx + (b.left + b.width / 2 - a.left), ty = fy + (b.top + b.height / 2 - a.top);
        const ms = num(step.duration, 600, 0, 10000);
        if (reduced || ms === 0) { place(el, tx, ty); return; }
        await frame(ms, e => place(el, fx + (tx - fx) * e, fy + (ty - fy) * e), alive, easeOf(step.easing));
        check();
        return;
      }
      case 'press': {
        const el = target(step.target);
        if (!el) return;
        el.setAttribute('data-fw-pressed', '');
        setTimeout(() => el.removeAttribute('data-fw-pressed'), 160);
        return;
      }
      case 'scroll': {
        const el = target(step.target);
        if (!el) return;
        const behavior = reduced ? 'instant' : 'smooth';
        if (step.to === 'start') el.scrollTo({ top: 0, behavior });
        else if (step.to === 'end') el.scrollTo({ top: el.scrollHeight, behavior });
        else { const dest = target(step.to); if (dest) dest.scrollIntoView({ block: 'nearest', behavior }); }
        return;
      }
      case 'focus': {
        const el = target(step.target);
        if (el) el.focus({ preventScroll: true });
        return;
      }
      case 'action': {
        const act = step.action;
        if (!act || typeof act !== 'object') return;
        const run = globalThis.__formwebRun;
        if (typeof run === 'function') { run(act, st.el, {}); return; }
        const handler = globalThis.__formwebActions && globalThis.__formwebActions[act.action];
        if (typeof handler === 'function') handler(act, st.el, {});
        return;
      }
    }
  };

  const begin = (st, internal) => {
    const cfg = st.cfg;
    if (!internal) {
      if (cfg.once && st.ran) return;
      if (st.running && !cfg.restart) return;
    }
    clearTimeout(st.timer);
    const id = ++st.id;
    st.ran = true;
    st.running = true;
    st.aliases = new Map();
    if (cfg.reset === true) { for (const c of st.clones) c.remove(); st.clones = []; }
    const steps = (Array.isArray(cfg.steps) ? cfg.steps : []).slice(0, 100);
    (async () => {
      for (const step of steps) {
        if (st.id !== id) return;
        if (!step || typeof step !== 'object') continue;
        try { await execute(st, id, step); } catch (e) { if (e === STOP) return; }
      }
      if (st.id !== id) return;
      st.running = false;
      if (cfg.loop === true && (cfg.trigger === 'load' || cfg.trigger === 'view')) st.timer = setTimeout(() => begin(st, true), Math.max(num(cfg.loopDelay, 0, 0, 60000), 16));
    })();
  };

  const bindScript = (st) => {
    const { el, cfg } = st;
    const go = () => begin(st, false);
    switch (cfg.trigger) {
      case 'submit': {
        const form = el.matches('form') ? el : el.closest('form') || el.querySelector('form');
        if (form) form.addEventListener('submit', e => { e.preventDefault(); go(); });
        break;
      }
      case 'click':
        el.addEventListener('click', e => { if (el.matches('a,button')) e.preventDefault(); go(); });
        break;
      case 'change':
        el.addEventListener('change', go);
        break;
      case 'load':
        go();
        break;
      case 'view': {
        if (typeof IntersectionObserver !== 'function') { go(); break; }
        const io = new IntersectionObserver(l => { if (l.some(i => i.isIntersecting)) { io.disconnect(); go(); } }, { threshold: 0.25 });
        io.observe(el);
        break;
      }
    }
  };

  const initScripts = () => {
    let count = 0;
    for (const [key, cfg] of entries(motion.scripts)) {
      if (!cfg || typeof cfg !== 'object' || ++count > 50) continue;
      const list = [];
      for (const el of nodes(key)) {
        const st = { key, cfg, el, id: 0, running: false, ran: false, clones: [], aliases: new Map(), timer: 0 };
        list.push(st);
        guard(() => bindScript(st));
      }
      if (list.length) states.set(key, list);
    }
  };

  const fold = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tokens = s => fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const subsequence = (token, word) => {
    let i = 0;
    for (let k = 0; k < word.length && i < token.length; k++) if (word[k] === token[i]) i++;
    return i === token.length;
  };
  const fieldScore = (token, words) => {
    let best = 0;
    for (const w of words) {
      if (w === token) return 1;
      if (best < 0.8 && w.startsWith(token)) best = 0.8;
      else if (best < 0.4 && w.length >= 3 && subsequence(token, w)) best = 0.4;
    }
    return best;
  };

  let indexPromise = null;
  const loadIndex = () => {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(prefix + 'search-index.json').then(r => { if (!r.ok) throw Error('index'); return r.json(); }).then(data => (Array.isArray(data) ? data : []).map(item => ({
      item,
      title: tokens(item.title),
      headings: tokens(Array.isArray(item.headings) ? item.headings.join(' ') : ''),
      text: tokens(item.text)
    }))).catch(() => { indexPromise = null; return null; });
    return indexPromise;
  };

  const rank = (index, query, limit) => {
    const qs = tokens(query);
    if (!qs.length) return [];
    const out = [];
    for (const entry of index) {
      let score = 0;
      for (const q of qs) score += Math.max(3 * fieldScore(q, entry.title), 2 * fieldScore(q, entry.headings), fieldScore(q, entry.text));
      if (score > 0) out.push({ item: entry.item, score });
    }
    out.sort((a, b) => b.score - a.score || (a.item.path < b.item.path ? -1 : a.item.path > b.item.path ? 1 : 0));
    return out.slice(0, limit).map(o => o.item);
  };

  const sequence = new WeakMap();
  const search = (step, el) => {
    const input = (step.input !== undefined ? node(step.input) : null) || el;
    const results = node(step.results), tpl = node(step.template);
    if (!input || !results || !tpl || !('value' in input)) return;
    const mine = (sequence.get(results) || 0) + 1;
    sequence.set(results, mine);
    const limit = num(step.limit, 8, 1, 50);
    const empty = step.empty ? node(step.empty) : null;
    const value = input.value;
    const hasQuery = tokens(value).length > 0;
    loadIndex().then(index => {
      if (sequence.get(results) !== mine || !index) return;
      const found = hasQuery ? rank(index, value, limit) : [];
      const frag = document.createDocumentFragment();
      for (const item of found) {
        const copy = clone(tpl);
        copy.setAttribute('data-fw-result', '');
        for (const slot of withSelf(copy, '[data-fw-slot]')) {
          const kind = slot.getAttribute('data-fw-slot');
          if (kind === 'title') setText(slot, String(item.title ?? ''));
          else if (kind === 'path') setText(slot, '/' + String(item.path ?? ''));
          else if (kind === 'excerpt') setText(slot, String(item.text ?? ''));
          else if (kind === 'link') slot.setAttribute('href', prefix + String(item.path ?? ''));
        }
        frag.append(copy);
      }
      const old = [...results.children].filter(c => c.hasAttribute('data-fw-result'));
      if (old.length) { old[0].replaceWith(frag); for (let i = 1; i < old.length; i++) old[i].remove(); }
      else if (found.length) results.append(frag);
      if (empty) {
        const show = hasQuery && !found.length;
        if (show && empty.hasAttribute('hidden')) empty.removeAttribute('hidden');
        else if (!show && !empty.hasAttribute('hidden')) empty.setAttribute('hidden', '');
      }
    });
  };

  const initSearch = () => {
    const param = guard(() => new URLSearchParams(location.search).get('from')) || '';
    const words = param.split(/[\/\-_.]+/).filter(Boolean).join(' ');
    for (const [id, steps] of entries(motion.actions)) {
      if (!Array.isArray(steps)) continue;
      for (const step of steps) {
        if (!step || step.action !== 'search') continue;
        const input = node(step.input) || node(id);
        if (!input) continue;
        input.addEventListener('focus', loadIndex, { once: true });
        if (step.fromParam && words) {
          input.value = words;
          search(step, input);
        }
      }
    }
  };

  const reg = (globalThis.__formwebActions ||= {});
  reg.search = (step, el) => { if (step && typeof step === 'object') search(step, el instanceof Element ? el : null); };
  reg.play = (step, el) => {
    const list = states.get(step && step.script);
    if (list && list[0]) begin(list[0], false);
  };

  ready(() => { guard(initScripts); guard(initSearch); });
})();
