// Receipt printer (C20): prints the closest pages for a query row by row, with a pull-to-tear gesture.
// Ported from the FormTxt 404 section. The search field, print button and address text are native nodes of the
// template, found by the node ids passed in props.
export function mount(root, props, ctx) {
  const P = props || {};
  const DEF = {
    title: 'lost page desk', subtitle: 'Closest matches, printed', date: 'Date', ticket: 'Ticket',
    requested: 'Requested', searched: 'You searched for', status: 'Status', notFound: 'Not found',
    noMatch: 'No match', below: 'below', pagesSearched: 'Pages searched', matches: 'Matches',
    closest: 'Closest pages', shown: 'Shown', total: 'Total pages', free: 'Free and open source',
    thanks: 'Thank you for reading', pull: 'Pull down to tear', release: 'Release to tear',
    reprint: 'Reprint', newPrint: 'New print',
  };
  const L = { ...DEF, ...(P.labels && typeof P.labels === 'object' ? P.labels : {}) };
  const PAGES = (Array.isArray(P.pages) ? P.pages : []).filter((x) => x && typeof x === 'object').map((x) => ({ t: String(x.t || ''), p: String(x.p || ''), k: String(x.k || '') }));
  const FALLBACK = Array.isArray(P.fallback) ? P.fallback.map(String) : ['Home', 'FormTxt', 'Every app'];
  const BASE = typeof P.baseUrl === 'string' ? P.baseUrl.replace(/\/+$/, '') : '';
  const PLACEHOLDER = typeof P.placeholder === 'string' ? P.placeholder : '/formtxt/docs/old-draft/';
  const brandForm = typeof P.brandForm === 'string' ? P.brandForm : 'Form';
  const brandSuffix = typeof P.brandSuffix === 'string' ? P.brandSuffix : 'Txt';
  const reduced = () => !!ctx.reduced;

  const RULES = `
.fwc-rp, .fwc-rp *, .fwc-rp *::before, .fwc-rp *::after { box-sizing: border-box; }
.fwc-rp { position: absolute; inset: 0; display: grid; justify-items: center; align-content: start; min-inline-size: 0; padding-block-start: 4vh; color: var(--ink, #f5f6f8); font-family: var(--font-ui, system-ui, sans-serif); line-height: 1.55; }
.fwc-rp.rp-narrow { padding-block-start: 0; }
.fwc-rp p, .fwc-rp ol, .fwc-rp li { margin: 0; }
.fwc-rp button { font: inherit; margin: 0; }
.fwc-rp .rp-printer { position: relative; z-index: var(--z-raised, 100); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3, 12px); inline-size: min(100%, 360px); block-size: 86px; padding-inline: var(--sp-4, 16px); background: var(--float, #1b1d21); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.2)), var(--shadow-tile, 0 8px 24px rgb(0 0 0 / 0.5)); }
.fwc-rp .rp-pl { display: flex; align-items: center; gap: var(--sp-3, 12px); }
.fwc-rp .rp-lamp { inline-size: 10px; block-size: 10px; background: var(--edge-strong, rgb(255 255 255 / 0.2)); }
.fwc-rp .rp-lamp.is-on { background: var(--hue, #7aa2ff); }
.fwc-rp .rp-lamp.is-blink { animation: fwcrp-blink 0.48s steps(1) infinite; }
@keyframes fwcrp-blink { 0% { background: var(--edge-strong, rgb(255 255 255 / 0.2)); } 50% { background: var(--hue, #7aa2ff); } }
.fwc-rp .rp-ico { inline-size: 28px; block-size: 28px; display: block; }
.fwc-rp .rp-model { color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-rp .rp-feed { min-block-size: 40px; padding-inline: var(--sp-4, 16px); border: 0; background: var(--control, #24272c); color: var(--ink, #f5f6f8); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: background-color var(--dur-fast, 140ms) var(--ease-out, ease), opacity var(--dur, 240ms) var(--ease-out, ease); }
.fwc-rp .rp-feed:hover { background: var(--control-hover, #2d3036); }
.fwc-rp .rp-feed:disabled { opacity: 0.35; cursor: default; }
.fwc-rp .rp-feed:focus-visible { outline: 2px solid var(--focus, #7aa2ff); outline-offset: 2px; }
.fwc-rp .rp-slot { inline-size: min(calc(100% - 24px), 336px); block-size: 10px; background: var(--inset, #0e1012); box-shadow: inset 0 0 0 1px var(--edge, rgb(255 255 255 / 0.1)); }
.fwc-rp .rp-out { position: relative; inline-size: 300px; min-block-size: 570px; margin-block-start: -4px; }
.fwc-rp .rp-sheet { position: relative; inline-size: 300px; padding: var(--sp-4, 16px); background: var(--pane, #15171a); box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.2)), var(--shadow-tile, 0 8px 24px rgb(0 0 0 / 0.5)); clip-path: inset(0 -60px var(--cb, 0px) -60px); transition: clip-path 70ms linear, transform 0.12s var(--ease-out, ease); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; transform-origin: 50% 0; }
.fwc-rp .rp-sheet.is-grab { cursor: grabbing; transition: clip-path 70ms linear; }
.fwc-rp .rp-sheet.is-torn { cursor: default; }
.fwc-rp .rp-rows { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--ink, #f5f6f8); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem; line-height: 1.45; }
.fwc-rp .rp-r { visibility: hidden; min-inline-size: 0; }
.fwc-rp .rp-r.is-on { visibility: visible; }
.fwc-rp .rp-c { text-align: center; }
.fwc-rp .rp-c b { font-weight: var(--weight-strong, 600); color: var(--ink, #f5f6f8); }
.fwc-rp .rp-brand .app-form { color: var(--ink, #f5f6f8); }
.fwc-rp .rp-brand .app-suffix { color: var(--hue, #7aa2ff); }
.fwc-rp .rp-kv { display: flex; justify-content: space-between; gap: var(--sp-3, 12px); }
.fwc-rp .rp-kv span:last-child { text-align: end; overflow-wrap: anywhere; }
.fwc-rp .rp-dim { color: var(--ink-faint, rgb(255 255 255 / 0.45)); letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-rp .rp-ad { overflow-wrap: anywhere; word-break: break-all; }
.fwc-rp .rp-rule { block-size: 0; margin-block: 4px; border-block-start: 1px dashed var(--edge-strong, rgb(255 255 255 / 0.2)); }
.fwc-rp .rp-rule.is-solid { border-block-start: 1px solid var(--ink-faint, rgb(255 255 255 / 0.45)); }
.fwc-rp .rp-lk { display: flex; align-items: baseline; gap: 6px; color: var(--ink, #f5f6f8); text-decoration: none; }
.fwc-rp .rp-lk:focus-visible { outline: 1px dashed var(--ink, #f5f6f8); outline-offset: 2px; border-radius: 0; }
.fwc-rp .rp-lk i { color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-style: normal; }
.fwc-rp .rp-lk .rp-t { flex: none; max-inline-size: 9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-underline-offset: 3px; }
.fwc-rp .rp-lk:hover .rp-t, .fwc-rp .rp-lk:focus-visible .rp-t { text-decoration: underline; }
.fwc-rp .rp-ld { flex: 1; min-inline-size: 6px; border-block-end: 1px dotted var(--ink-faint, rgb(255 255 255 / 0.45)); transform: translateY(-3px); }
.fwc-rp .rp-p { flex: none; color: var(--ink-soft, rgb(255 255 255 / 0.7)); font-size: 0.6875rem; }
.fwc-rp .rp-ar { flex: none; inline-size: 12px; block-size: 12px; opacity: 0; transform: translateX(-4px); transition: opacity 150ms var(--ease-out, ease), transform 150ms var(--ease-out, ease); }
.fwc-rp .rp-lk:hover .rp-ar, .fwc-rp .rp-lk:focus-visible .rp-ar { opacity: 1; transform: none; }
.fwc-rp .rp-bar { display: flex; block-size: 34px; margin-block: 4px; }
.fwc-rp .rp-bar span { background: var(--ink, #f5f6f8); }
.fwc-rp .rp-bar span.g { background: transparent; }
.fwc-rp .rp-tear { min-block-size: 1.4em; margin: var(--sp-3, 12px) 0 0; color: var(--ink-faint, rgb(255 255 255 / 0.45)); font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs, 0.75rem); letter-spacing: 0.14em; text-align: center; text-transform: uppercase; opacity: 0; transition: opacity 0.2s var(--ease-out, ease); }
.fwc-rp .rp-tear.is-on { opacity: 1; }
.fwc-rp .rp-fall { position: absolute; inset-block-start: 0; inset-inline-start: 0; z-index: var(--z-overlay, 600); pointer-events: none; }
.fwc-rp.rp-reduced .rp-lamp.is-blink { animation: none; }
.fwc-rp.rp-reduced .rp-sheet, .fwc-rp.rp-reduced .rp-tear, .fwc-rp.rp-reduced .rp-ar { transition: none; }
`;

  const $ = (s, r = root) => r.querySelector(s);
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const pad = (n, k = 2) => String(n).padStart(k, '0');
  const byNode = (id) => {
    if (!id) return null;
    try { return document.querySelector('[data-fw-node="' + CSS.escape(id) + '"]'); } catch { return null; }
  };

  // DOM ----------------------------------------------------------------------------------------------------
  const style = el('style');
  style.textContent = RULES;
  const wrap = el('div', 'fwc-rp');
  const printer = el('div', 'rp-printer');
  const pl = el('span', 'rp-pl');
  const lamp = el('span', 'rp-lamp');
  lamp.setAttribute('aria-hidden', 'true');
  pl.append(lamp);
  if (typeof P.icon === 'string' && P.icon) {
    const img = el('img', 'rp-ico');
    img.src = ctx.asset(P.icon);
    img.width = 28;
    img.height = 28;
    img.alt = '';
    pl.append(img);
  } else {
    pl.append(el('span', 'rp-ico'));
  }
  pl.append(el('span', 'rp-model', typeof P.model === 'string' ? P.model : 'FT-404'));
  const feed = el('button', 'rp-feed', L.reprint);
  feed.type = 'button';
  feed.disabled = true;
  printer.append(pl, feed);
  const slot = el('div', 'rp-slot');
  slot.setAttribute('aria-hidden', 'true');
  const out = el('div', 'rp-out');
  const live = el('div');
  const tear = el('p', 'rp-tear');
  tear.setAttribute('aria-hidden', 'true');
  out.append(live, tear);
  wrap.append(printer, slot, out);
  root.append(style, wrap);

  const narrowMq = matchMedia('(max-width: 860px)');
  const syncNarrow = () => wrap.classList.toggle('rp-narrow', narrowMq.matches);
  syncNarrow();
  narrowMq.addEventListener('change', syncNarrow);

  // Address that was not found ------------------------------------------------------------------------------
  const original = (() => {
    const q = new URLSearchParams(location.search).get('from');
    if (q) return q;
    const path = location.pathname;
    if (/\.html?$/.test(path) || /formtxt-404/.test(path)) return PLACEHOLDER;
    return path;
  })();
  const addrNode = byNode(P.addressNode);
  if (addrNode) addrNode.textContent = original;

  // Search ---------------------------------------------------------------------------------------------------
  const tokens = (s) => s.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  const score = (qt, page) => {
    const pt = tokens(page.t + ' ' + page.p + ' ' + page.k);
    let total = 0;
    for (const q of qt) {
      let best = 0;
      for (const w of pt) {
        let s = 0;
        if (q === w) s = 3;
        else if (w.startsWith(q) || q.startsWith(w)) s = 1.6;
        else if (lev(q, w) <= Math.max(1, Math.floor(Math.min(q.length, w.length) / 4))) s = 1.2;
        if (s > best) best = s;
      }
      total += best;
    }
    return total;
  };
  // Results the native site search action put in the hidden list: they print first.
  const siteHits = () => {
    const box = byNode(P.siteResults);
    if (!box) return [];
    const hits = [];
    for (const item of box.querySelectorAll('[data-fw-result]')) {
      const link = item.querySelector('[data-fw-slot="link"]');
      const title = item.querySelector('[data-fw-slot="title"]');
      const path = item.querySelector('[data-fw-slot="path"]');
      if (!link || !title) continue;
      hits.push({ t: title.textContent.trim(), p: path ? path.textContent.trim() : '', href: link.getAttribute('href') || '#' });
    }
    return hits;
  };
  const find = (text) => {
    const qt = tokens(text);
    const scored = PAGES.map((p, i) => ({ p, i, s: score(qt, p) }));
    const hits = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
    const fromSite = siteHits();
    const picks = [...fromSite, ...hits.map((x) => x.p)].slice(0, 4);
    for (const name of FALLBACK) {
      if (picks.length >= 3) break;
      const page = PAGES.find((p) => p.t === name);
      if (page && !picks.includes(page)) picks.push(page);
    }
    return { picks, matches: hits.length + fromSite.length };
  };
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  // Receipt --------------------------------------------------------------------------------------------------
  const SVG = 'http://www.w3.org/2000/svg';
  const arrowIcon = () => {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'rp-ar');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    for (const d of ['M5 12h14', 'M13 6l6 6-6 6']) {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.append(p);
    }
    return s;
  };

  let counter = Number.isFinite(Number(P.firstTicket)) ? Math.round(Number(P.firstTicket)) : 404;
  let printId = 0;
  let timer = 0;
  let cur = null;
  const falling = [];

  const kv = (k, v) => {
    const li = el('li', 'rp-r rp-kv');
    li.append(el('span', '', k), el('span', '', v));
    return li;
  };
  const rule = (solid) => el('li', 'rp-r rp-rule' + (solid ? ' is-solid' : ''));

  const buildReceipt = (query) => {
    const searched = query.trim();
    const { picks, matches } = find(searched || original);
    const now = new Date();
    const ticket = counter++;
    const sheet = el('div', 'rp-sheet');
    const ol = el('ol', 'rp-rows');
    const rows = [];
    const add = (li) => { ol.append(li); rows.push(li); };

    const h1 = el('li', 'rp-r rp-c');
    const b = el('b');
    const brand = el('span', 'rp-brand');
    brand.append(el('span', 'app-form', brandForm), el('span', 'app-suffix', brandSuffix));
    b.append(brand, document.createTextNode(' ' + L.title));
    h1.append(b);
    add(h1);
    add(el('li', 'rp-r rp-c rp-dim', L.subtitle));
    add(kv(L.date, pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())));
    add(kv(L.ticket, pad(ticket, 6)));
    add(rule(false));
    add(el('li', 'rp-r rp-dim', searched ? L.searched : L.requested));
    add(el('li', 'rp-r rp-ad', searched ? '“' + searched + '”' : original));
    add(kv(L.status, !searched ? L.notFound : matches > 0 ? matches + ' ' + L.below : L.noMatch));
    add(kv(L.pagesSearched, String(PAGES.length)));
    add(kv(L.matches, String(matches)));
    add(rule(false));
    add(el('li', 'rp-r rp-dim', L.closest));
    picks.forEach((pg, i) => {
      const li = el('li', 'rp-r');
      const a = el('a', 'rp-lk');
      a.href = pg.href || BASE + pg.p;
      a.append(el('i', '', pad(i + 1)), el('span', 'rp-t', pg.t), el('span', 'rp-ld'), el('span', 'rp-p', pg.p));
      a.append(arrowIcon());
      li.append(a);
      add(li);
    });
    add(rule(false));
    add(kv(L.shown, String(picks.length)));
    add(kv(L.total, String(PAGES.length)));
    add(rule(true));
    const bar = el('li', 'rp-r rp-bar');
    let hs = hash(searched || original);
    for (let i = 0; i < 44; i++) {
      hs = (Math.imul(hs, 1664525) + 1013904223) >>> 0;
      const w = 1 + (hs >>> 24) % 3;
      const s = el('span', i % 2 ? 'g' : '');
      s.style.flex = w + ' 1 0';
      bar.append(s);
    }
    add(bar);
    add(el('li', 'rp-r rp-c', L.free));
    add(el('li', 'rp-r rp-c rp-dim', L.thanks));
    sheet.append(ol);
    return { sheet, rows, ol };
  };

  const setCb = (r, v) => r.sheet.style.setProperty('--cb', v + 'px');

  const dropClone = (clone, dy, rotStart) => {
    const holder = el('div', 'rp-fall');
    holder.style.insetBlockStart = '0px';
    holder.append(clone);
    out.append(holder);
    falling.push(holder);
    while (falling.length > 3) falling.shift().remove();
    const dur = reduced() ? 1 : 1100;
    const a = holder.animate(
      [{ transform: 'translateY(' + dy + 'px) rotate(' + rotStart + 'deg)', opacity: 1 }, { transform: 'translateY(' + (innerHeight * 1.2 + dy) + 'px) rotate(16deg)', opacity: 0.6 }],
      { duration: dur, easing: 'ease-in', fill: 'forwards' }
    );
    const done = () => {
      holder.remove();
      const k = falling.indexOf(holder);
      if (k >= 0) falling.splice(k, 1);
    };
    a.finished.then(done, done);
  };

  const queueFall = (src) => {
    const clone = src.cloneNode(true);
    clone.removeAttribute('aria-live');
    clone.style.transition = 'none';
    clone.style.clipPath = 'inset(0 -60px -60px -60px)';
    clone.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    clone.querySelectorAll('.rp-r').forEach((r) => r.classList.add('is-on'));
    dropClone(clone, 0, 0);
  };

  const queueFallFrom = (r) => {
    const clone = r.sheet.cloneNode(true);
    clone.style.transform = '';
    clone.classList.remove('is-grab');
    clone.style.transition = 'none';
    clone.style.clipPath = 'inset(0 -60px -60px -60px)';
    clone.removeAttribute('aria-live');
    clone.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));
    dropClone(clone, r.off || 0, r.pull * 0.012);
  };

  const lampState = (m) => {
    lamp.classList.toggle('is-on', m !== 'off');
    lamp.classList.toggle('is-blink', m === 'blink' && !reduced());
  };

  const sendAway = () => {
    if (cur && !cur.torn) queueFall(cur.sheet);
    if (cur) cur.sheet.remove();
    cur = null;
  };

  const print = (query) => {
    const id = ++printId;
    clearInterval(timer);
    sendAway();
    tear.classList.remove('is-on');
    wrap.classList.toggle('rp-reduced', reduced());
    const r = buildReceipt(query);
    r.torn = false;
    r.pull = 0;
    live.append(r.sheet);
    live.setAttribute('aria-live', 'polite');
    r.sheet.setAttribute('aria-live', 'polite');
    cur = r;
    feed.textContent = L.reprint;
    attachDrag(r);
    if (reduced()) {
      r.rows.forEach((li) => li.classList.add('is-on'));
      setCb(r, -60);
      feed.disabled = false;
      lampState('off');
      return;
    }
    feed.disabled = true;
    lampState('blink');
    setCb(r, r.sheet.offsetHeight);
    let n = 0;
    timer = setInterval(() => {
      if (id !== printId) { clearInterval(timer); return; }
      const li = r.rows[n];
      li.classList.add('is-on');
      n++;
      if (n >= r.rows.length) {
        clearInterval(timer);
        setCb(r, -60);
        feed.disabled = false;
        lampState('off');
        return;
      }
      const sb = r.sheet.getBoundingClientRect();
      const rb = li.getBoundingClientRect();
      const sheetH = r.sheet.offsetHeight;
      const bottom = (rb.bottom - sb.top) * (sheetH / sb.height) + 22;
      setCb(r, Math.max(-60, sheetH - bottom));
    }, 70);
  };

  function attachDrag(r) {
    const s = r.sheet;
    let startY = 0;
    let drag = false;
    s.addEventListener('pointerdown', (e) => {
      if (r.torn || e.target.closest('a')) return;
      drag = true;
      startY = e.clientY;
      s.classList.add('is-grab');
      try { s.setPointerCapture(e.pointerId); } catch {}
    });
    s.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const pull = Math.max(0, e.clientY - startY);
      r.pull = pull;
      const off = pull <= 60 ? pull : 60 + (pull - 60) * 0.35;
      s.style.transform = 'translateY(' + off + 'px) rotate(' + pull * 0.012 + 'deg)';
      r.off = off;
      tear.textContent = pull > 74 ? L.release : L.pull;
      tear.classList.toggle('is-on', pull > 0);
    });
    const end = () => {
      if (!drag) return;
      drag = false;
      s.classList.remove('is-grab');
      tear.classList.remove('is-on');
      if (r.pull > 74) {
        r.torn = true;
        s.classList.add('is-torn');
        queueFallFrom(r);
        s.remove();
        cur = r;
        feed.textContent = L.newPrint;
        feed.disabled = false;
        lampState('off');
      } else {
        s.style.transform = '';
      }
      r.pull = 0;
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
  }

  // Native search field and print button ------------------------------------------------------------------------
  const input = byNode(P.searchInput);
  const button = byNode(P.searchButton);
  const value = () => (input && typeof input.value === 'string' ? input.value : '');
  let debounce = 0;
  const onInput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => print(value()), 650);
  };
  const printNow = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => print(value()), 120);
  };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); printNow(); } };
  const onFeed = () => { clearTimeout(debounce); print(value()); };
  if (input) {
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKey);
  }
  if (button) button.addEventListener('click', printNow);
  feed.addEventListener('click', onFeed);

  // The first receipt is for the address that was not found, as in the original.
  print('');
  ctx.ready();

  return () => {
    clearTimeout(debounce);
    clearInterval(timer);
    narrowMq.removeEventListener('change', syncNarrow);
    if (input) {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKey);
    }
    if (button) button.removeEventListener('click', printNow);
    for (const h of falling) h.remove();
    wrap.remove();
    style.remove();
  };
}
