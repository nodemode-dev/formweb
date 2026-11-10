export function mount(root, props, ctx) {
  const P = props || {};
  const str = (k, d) => (typeof P[k] === 'string' ? P[k] : d);
  const num = (k, d) => (typeof P[k] === 'number' && Number.isFinite(P[k]) ? P[k] : d);
  const arr = (k, d) => (Array.isArray(P[k]) ? P[k] : d);
  const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const VAR = str('variable', 'apps');
  const STEPS = num('steps', 13);
  const SUB = num('sub', 4);
  const LAST = STEPS * SUB;
  const BREAKS = arr('breaks', [4, 5]).map(Number);
  const NAMES = arr('names', []);
  const SCALE = arr('scale', []);
  const TIERS = arr('tiers', []);
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const V = () => globalThis.__formwebVariables;
  const getVar = (n) => { const v = V(); return v && typeof v.get === 'function' ? v.get(n) : ctx.variable(n); };
  const setVar = (n, val) => { const v = V(); if (v && typeof v.set === 'function') v.set(n, val); };
  const money = (c) => '$' + c.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const style = document.createElement('style');
  style.textContent = `
.fwc-ruler { position: absolute; inset: 0; --fm-tw: 2px; color: var(--ink, #eef0f4); font-family: inherit; }
.fwc-ruler *, .fwc-ruler *::before, .fwc-ruler *::after { box-sizing: border-box; }
.fwc-ruler-bub { position: absolute; inset-block-start: 0; inset-inline-start: 0; inline-size: 112px; padding-block: 4px; background: var(--float, #242833); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); color: var(--ink, #eef0f4); font-size: var(--fs-xs, 0.8125rem); font-weight: var(--weight-strong, 560); text-align: center; white-space: nowrap; transform: translateX(var(--bx, 0px)) translateY(var(--by, 0px)) scale(var(--bs, 1)); transition: transform 220ms var(--ease-out, ease-out); }
.fwc-ruler.is-down .fwc-ruler-bub { --by: -3px; --bs: 1.05; }
.fwc-ruler-ticks { position: absolute; inset-inline: 0; inset-block-start: 44px; block-size: 40px; display: flex; align-items: flex-end; justify-content: space-between; border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09)); }
.fwc-ruler-t { position: relative; flex: none; inline-size: var(--fm-tw); block-size: 10px; background: var(--edge-strong, rgb(255 255 255 / 0.18)); transform-origin: 50% 100%; transform: scaleY(var(--w, 1)); transition: transform 240ms var(--ease-out, ease-out), background-color 140ms var(--ease-out, ease-out); }
.fwc-ruler-t.is-step { block-size: 18px; }
.fwc-ruler-t.is-break { block-size: 28px; }
.fwc-ruler-t.is-on { background: var(--ink, #eef0f4); }
.fwc-ruler-t b { position: absolute; inset: 0; background: var(--hue, #eef0f4); opacity: 0; }
.fwc-ruler-needle { position: absolute; inset-block-start: 26px; inset-inline-start: 0; inline-size: 2px; block-size: 58px; background: var(--hue, #eef0f4); transform: translateX(var(--nx, 0px)); transition: transform 260ms var(--ease-out, ease-out); pointer-events: none; }
.fwc-ruler-knob { position: absolute; inset-block-start: -7px; inset-inline-start: -6px; inline-size: 14px; block-size: 14px; border-radius: 50%; background: var(--ink, #eef0f4); box-shadow: 0 0 0 3px var(--pane, #1b1e25); transform: scale(var(--ks, 1)); transition: transform 220ms var(--ease-out, ease-out); }
.fwc-ruler.is-down .fwc-ruler-knob { --ks: 1.45; }
.fwc-ruler-knob i { position: absolute; inset: 4px; border-radius: 50%; background: var(--hue, #eef0f4); }
.fwc-ruler:has(.fwc-ruler-range:focus-visible) .fwc-ruler-knob { outline: 2px solid var(--focus, #eef0f4); outline-offset: 4px; }
.fwc-ruler-range { position: absolute; inset-inline: 0; inset-block-start: 24px; inline-size: 100%; block-size: 68px; margin: 0; opacity: 0; cursor: pointer; touch-action: pan-y; }
.fwc-ruler-scale { position: absolute; inset-inline: 0; inset-block-start: 96px; color: var(--ink-faint, #6b7283); font-size: var(--fs-xs, 0.8125rem); font-variant-numeric: tabular-nums; }
.fwc-ruler-scale span { position: absolute; inset-inline-start: calc(var(--fm-tw) / 2 + (100% - var(--fm-tw)) * var(--i) / ${LAST}); transform: translateX(-50%); white-space: nowrap; }
.fwc-ruler-scale .is-first { transform: none; }
.fwc-ruler-scale .is-last { transform: translateX(-100%); }
.fwc-ruler-scale .fwc-ruler-tier { font-family: var(--font-mono, monospace); letter-spacing: 0.14em; text-transform: uppercase; transition: color 220ms var(--ease-out, ease-out); }
.fwc-ruler-scale .fwc-ruler-tier.is-on { color: var(--ink, #eef0f4); }
.fwc-ruler-live { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 720px) { .fwc-ruler { --fm-tw: 1.5px; } .fwc-ruler-scale .fwc-ruler-tier { display: none; } }
.fwc-ruler-reduced .fwc-ruler-bub, .fwc-ruler-reduced .fwc-ruler-needle, .fwc-ruler-reduced .fwc-ruler-knob, .fwc-ruler-reduced .fwc-ruler-t, .fwc-ruler-reduced .fwc-ruler-tier { transition: none !important; }
.fwc-ruler-odo { position: relative; }
.fwc-ruler-ol { position: absolute; inset-block-start: 0; inset-inline-start: 0; display: inline-flex; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }
.fwc-ruler-od-c { display: inline-block; inline-size: 1ch; block-size: 1.1em; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent); mask-image: linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent); }
.fwc-ruler-od-s { display: inline-block; block-size: 1.1em; }
.fwc-ruler-od-st { display: block; transform: translateY(calc(var(--d) * -10%)); }
.fwc-ruler-od-st > span { display: block; block-size: 1.1em; text-align: center; }
.fwc-ruler-ol.is-on .fwc-ruler-od-st { transition: transform 560ms ${EASE}; transition-delay: calc(var(--k) * 14ms); }
.fwc-ruler-ol > .is-sm { align-self: flex-start; font-size: 0.4em; margin-block-start: 0.35em; }
.fwc-ruler-ol.is-flat > .is-sm { align-self: auto; font-size: inherit; margin-block-start: 0; }
.fwc-ruler-reduced.fwc-ruler-ol .fwc-ruler-od-st { transition: none !important; }
`;

  let ticksHtml = '';
  for (let i = 0; i <= LAST; i++) {
    const isBreak = BREAKS.includes(i / SUB);
    ticksHtml += `<i class="fwc-ruler-t${isBreak ? ' is-break' : i % SUB === 0 ? ' is-step' : ''}"><b></b></i>`;
  }
  const scaleHtml = SCALE.map((s) => `<span class="${s.edge ? 'is-' + esc(s.edge) : ''}" style="--i:${Number(s.at) || 0}">${esc(s.text)}</span>`).join('')
    + TIERS.map((s) => `<span class="fwc-ruler-tier ${s.edge ? 'is-' + esc(s.edge) : ''}" style="--i:${Number(s.at) || 0}">${esc(s.text)}</span>`).join('');
  const wrap = document.createElement('div');
  wrap.className = 'fwc-ruler' + (ctx.reduced ? ' fwc-ruler-reduced' : '');
  wrap.innerHTML = `
  <div class="fwc-ruler-bub"></div>
  <div class="fwc-ruler-ticks" aria-hidden="true">${ticksHtml}</div>
  <div class="fwc-ruler-needle" aria-hidden="true"><i class="fwc-ruler-knob"><i class="fwc-ruler-dot"></i></i></div>
  <div class="fwc-ruler-scale" aria-hidden="true">${scaleHtml}</div>
  <input class="fwc-ruler-range" type="range" min="0" max="${LAST}" step="${SUB}" value="0" aria-label="${esc(str('ariaLabel', 'Paid apps you switch from'))}">
  <p class="fwc-ruler-live" aria-live="polite"></p>`;
  root.appendChild(style);
  root.appendChild(wrap);

  const $ = (s) => wrap.querySelector(s);
  const ticks = [...wrap.querySelectorAll('.fwc-ruler-t')];
  const bub = $('.fwc-ruler-bub'), needle = $('.fwc-ruler-needle'), range = $('.fwc-ruler-range'), live = $('.fwc-ruler-live'), dot = $('.fwc-ruler-dot');
  const tierEls = [...wrap.querySelectorAll('.fwc-ruler-tier')];
  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };
  const RM = () => ctx.reduced;

  const st = { idx: 0, hover: -1, down: false, focus: false, touch: false };
  let width = 0, first = true, prevIdx = -1, waveRaf = 0, liveTimer = 0, destroyed = false;

  const tw = () => parseFloat(getComputedStyle(wrap).getPropertyValue('--fm-tw')) || 2;
  const xOf = (u) => { const t = tw(); return t / 2 + ((width - t) * u) / LAST; };
  const place = () => {
    width = wrap.clientWidth;
    const x = xOf(st.idx * SUB);
    needle.style.setProperty('--nx', x - 1 + 'px');
    const bw = 112;
    bub.style.setProperty('--bx', Math.min(Math.max(x - bw / 2, 0), Math.max(width - bw, 0)) + 'px');
  };
  const wave = () => {
    waveRaf = 0;
    let amp = 0;
    let c = st.idx * SUB;
    if (!RM()) {
      if (st.hover >= 0) { amp = st.down ? 1.5 : 0.85; c = st.hover; }
      else if (st.focus) amp = 0.55;
    }
    ticks.forEach((t, i) => {
      let s = 1;
      if (amp) {
        const d = i - c;
        const g = Math.exp(-(d * d) / (2 * 3.2 * 3.2));
        s = 1 + amp * g * (t.classList.contains('is-break') ? 0.45 : 1);
      }
      t.style.setProperty('--w', s.toFixed(3));
    });
  };
  const queueWave = () => { if (!waveRaf) waveRaf = requestAnimationFrame(wave); };

  const announce = (n) => {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (destroyed) return;
      const lv = (P.liveVariables && typeof P.liveVariables === 'object') ? P.liveVariables : { monthly: 'monthlyUsd', yearly: 'yearlyUsd', total: 'totalUsd' };
      const years = Number(getVar(str('yearsVariable', 'years'))) || 0;
      const capOn = Number(getVar(str('capVariable', 'cap'))) === 1;
      live.textContent = fill(str('live', '{n} of {steps} apps.'), {
        n, steps: STEPS, monthly: money(Number(getVar(lv.monthly)) || 0), yearly: money(Number(getVar(lv.yearly)) || 0), total: money(Number(getVar(lv.total)) || 0),
        years, yearsWord: years === 1 ? str('yearsOne', 'year') : str('yearsMany', 'years'), cap: capOn ? str('capText', '') : ''
      });
    }, 450);
  };

  const render = () => {
    const n = st.idx;
    place();
    ticks.forEach((t, i) => t.classList.toggle('is-on', i <= n * SUB));
    bub.textContent = n === 0 ? str('bubbleNone', 'No apps yet') : fill(str('bubble', '{n} of {steps} apps'), { n, steps: STEPS });
    range.setAttribute('aria-valuetext', n === 0 ? str('valueTextNone', 'No apps') : fill(str('valueText', '{n} of {steps}'), { n, steps: STEPS, name: NAMES[n - 1] || '' }));
    tierEls.forEach((el, i) => el.classList.toggle('is-on', n >= (BREAKS[i] ?? Infinity)));
    range.value = String(n * SUB);
    queueWave();
    if (!first) announce(n);
    first = false;
  };

  const flash = (b) => {
    if (RM()) return;
    const bEl = ticks[b * SUB] && ticks[b * SUB].querySelector('b');
    if (bEl) bEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    dot.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 340 });
    if (st.touch && st.down && navigator.vibrate) navigator.vibrate(6);
  };

  const setIdx = (i, drag, fromVar) => {
    let idx = Math.max(0, Math.min(STEPS, i));
    if (drag && prevIdx >= 0 && Math.abs(idx - prevIdx) > 1) {
      const dir = idx > prevIdx ? 1 : -1;
      const hit = BREAKS.filter((b) => (dir > 0 ? b > prevIdx && b <= idx : b < prevIdx && b >= idx));
      if (hit.length) idx = dir > 0 ? Math.min(...hit) : Math.max(...hit);
    }
    st.idx = idx;
    if (prevIdx >= 0) BREAKS.forEach((b) => { if ((prevIdx < b) !== (idx < b) && idx !== prevIdx) flash(b); });
    prevIdx = idx;
    if (!fromVar) setVar(VAR, idx);
    render();
  };

  on(range, 'input', () => setIdx(Math.round(Number(range.value) / SUB), st.down, false));
  const pointerX = (e) => { const r = wrap.getBoundingClientRect(); return ((e.clientX - r.left - tw() / 2) / (r.width - tw())) * LAST; };
  on(wrap, 'pointermove', (e) => { st.touch = e.pointerType === 'touch'; if (st.touch && !st.down) return; st.hover = pointerX(e); queueWave(); });
  on(wrap, 'pointerleave', () => { if (st.down) return; st.hover = -1; queueWave(); });
  on(wrap, 'pointerdown', (e) => { st.touch = e.pointerType === 'touch'; st.down = true; wrap.classList.add('is-down'); st.hover = pointerX(e); queueWave(); });
  const release = (e) => {
    if (!st.down) return;
    st.down = false;
    wrap.classList.remove('is-down');
    if (st.touch || (e && e.type === 'pointercancel')) st.hover = -1;
    queueWave();
  };
  on(window, 'pointerup', release);
  on(window, 'pointercancel', release);
  on(range, 'focus', () => { st.focus = true; queueWave(); });
  on(range, 'blur', () => { st.focus = false; queueWave(); });

  const init = Number(getVar(VAR));
  setIdx(Number.isFinite(init) ? Math.round(init) : 0, false, true);
  offs.push(ctx.onResize(() => place()));
  offs.push(ctx.onVariable(VAR, (v) => { const k = Math.round(Number(v)); if (Number.isFinite(k) && k !== st.idx) setIdx(k, false, true); }));

  /* Odometer layers over native output nodes. The node keeps its own text for layout, no script and screen readers. */
  const make = (ch, digit, small, flat) => {
    const el = document.createElement('span');
    if (digit) {
      el.className = 'fwc-ruler-od-c';
      const s = document.createElement('span');
      s.className = 'fwc-ruler-od-st';
      for (let i = 0; i < 10; i++) { const e = document.createElement('span'); e.textContent = String(i); s.append(e); }
      s.style.setProperty('--d', ch);
      el.append(s);
    } else { el.className = 'fwc-ruler-od-s'; el.textContent = ch; }
    if (small) el.classList.add('is-sm');
    return el;
  };
  const odos = [];
  const spec = arr('odometers', []);
  spec.forEach((o) => {
    const node = o && typeof o.node === 'string' ? document.querySelector(`[data-fw-node="${CSS.escape(o.node)}"]`) : null;
    if (!node) return;
    const saved = getComputedStyle(node).color;
    const layer = document.createElement('span');
    layer.className = 'fwc-ruler-ol' + (o.big ? '' : ' is-flat');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.color = saved;
    node.classList.add('fwc-ruler-odo');
    node.style.color = 'transparent';
    node.append(layer);
    const nodes = [];
    let last = '';
    let animate = false;
    const fmt = () => {
      const v = Number(getVar(o.source));
      const d = Number.isFinite(Number(o.decimals)) ? Number(o.decimals) : 2;
      const body = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: o.grouping !== false });
      return (o.prefix || '') + (Number.isFinite(v) ? body : '0');
    };
    const set = () => {
      const text = fmt();
      if (text === last) return;
      last = text;
      const rects = new Map();
      if (animate) for (const el of layer.children) rects.set(el, el.getBoundingClientRect().left);
      const rev = [...text].reverse();
      const fresh = new Set();
      rev.forEach((ch, k) => {
        const digit = /\d/.test(ch);
        const small = !!o.big && (ch === '$' || (rev[2] === '.' && k < 3 && ch !== ','));
        const n = nodes[k];
        if (n && n.digit === digit && n.small === small) {
          if (digit) n.el.firstChild.style.setProperty('--d', ch);
          else if (n.el.textContent !== ch) n.el.textContent = ch;
        } else {
          const el = make(ch, digit, small);
          if (n) n.el.replaceWith(el); else layer.prepend(el);
          nodes[k] = { el, digit, small };
          fresh.add(el);
        }
      });
      for (let k = rev.length; k < nodes.length; k++) nodes[k].el.remove();
      nodes.length = rev.length;
      let col = 0;
      for (const el of layer.children) if (el.classList.contains('fwc-ruler-od-c')) el.firstChild.style.setProperty('--k', col++);
      if (animate && !RM()) {
        for (const el of layer.children) {
          if (fresh.has(el)) el.animate([{ opacity: 0, transform: 'translateY(35%)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
          else if (rects.has(el)) {
            const dx = rects.get(el) - el.getBoundingClientRect().left;
            if (Math.abs(dx) > 0.5) el.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], { duration: 420, easing: EASE });
          }
        }
      }
    };
    set();
    requestAnimationFrame(() => { animate = true; if (!RM()) layer.classList.add('is-on'); });
    offs.push(ctx.onVariable(o.source, set));
    odos.push(() => { layer.remove(); node.classList.remove('fwc-ruler-odo'); node.style.color = ''; });
  });

  ctx.ready();
  return () => {
    destroyed = true;
    clearTimeout(liveTimer);
    cancelAnimationFrame(waveRaf);
    for (const off of offs.splice(0)) { try { off(); } catch (e) { /* already gone */ } }
    for (const off of odos.splice(0)) off();
    wrap.remove(); style.remove();
  };
}
