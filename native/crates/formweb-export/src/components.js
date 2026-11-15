(() => {
  'use strict';
  let config = {};
  try { config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const pages = config.components?.page;
  if (!pages || typeof pages !== 'object') return;
  const html = document.documentElement;
  const prefix = typeof config.routePrefix === 'string' ? config.routePrefix : './';
  const noop = () => {};
  const motion = () => globalThis.__formwebMotion;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const isReduced = () => html.classList.contains('fw-r') || media.matches;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const readTheme = () => {
    const mode = html.getAttribute('data-theme');
    return mode === 'light' || mode === 'dark' ? mode : (dark.matches ? 'dark' : 'light');
  };

  const themeSubs = new Set();
  let theme = readTheme();
  const themeCheck = () => {
    const next = readTheme();
    if (next === theme) return;
    theme = next;
    for (const fn of [...themeSubs]) fn(next);
  };
  new MutationObserver(themeCheck).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  dark.addEventListener?.('change', themeCheck);

  const loops = new Set();
  let raf = 0;
  const tick = now => {
    raf = 0;
    if (document.hidden || !loops.size) return;
    for (const fn of [...loops]) fn(now);
    if (loops.size) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && loops.size && !document.hidden) raf = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', kick);
  const ownFrame = fn => { loops.add(fn); kick(); return () => { loops.delete(fn); }; };

  const asset = path => {
    const value = String(path ?? '');
    return value.startsWith('/api/assets/') ? prefix + 'assets/' + value.slice('/api/assets/'.length) : value;
  };

  const modules = new Map();
  const load = id => {
    let pending = modules.get(id);
    if (!pending) {
      pending = Promise.resolve().then(() => import(new URL(prefix + 'assets/components/' + id + '.js', document.baseURI).href));
      modules.set(id, pending);
    }
    return pending;
  };

  const run = (host, id, props) => {
    const stops = [];
    let failed = false;
    const fail = error => {
      if (!failed) console.error('FormWeb component "' + id + '" failed on [data-fw-node="' + (host.getAttribute('data-fw-node') || '') + '"]:', error);
      failed = true;
      host.setAttribute('data-fw-component-error', '');
    };
    const guard = fn => (...args) => { try { return fn(...args); } catch (error) { fail(error); } };
    const track = off => { stops.push(off); return () => { const i = stops.indexOf(off); if (i >= 0) stops.splice(i, 1); off(); }; };
    const poster = host.querySelector(':scope > [data-fw-poster]');
    let box = { width: host.clientWidth, height: host.clientHeight };
    const measure = () => { const next = { width: host.clientWidth, height: host.clientHeight }; if (next.width === box.width && next.height === box.height) return null; box = next; return next; };
    const resizeSubs = new Set();
    const visSubs = new Set();
    let vis = false;
    const r0 = host.getBoundingClientRect();
    vis = r0.bottom > 0 && r0.top < innerHeight && r0.right > 0 && r0.left < innerWidth;
    const io = new IntersectionObserver(list => {
      const next = list[list.length - 1].isIntersecting;
      if (next === vis) return;
      vis = next;
      for (const fn of [...visSubs]) fn(next);
    });
    io.observe(host);
    const ro = new ResizeObserver(() => { const next = measure(); if (next) for (const fn of [...resizeSubs]) fn({ ...next }); });
    ro.observe(host);
    stops.push(() => { io.disconnect(); ro.disconnect(); });

    const sub = (set, fn) => {
      const wrapped = guard(fn);
      set.add(wrapped);
      return track(() => { set.delete(wrapped); });
    };
    const sceneFor = scene => {
      const m = motion();
      if (!m) return null;
      if (typeof scene === 'string') return scene;
      return m.sceneOf ? m.sceneOf(host) : null;
    };

    const ctx = {
      host,
      id,
      theme: () => theme,
      onTheme: fn => sub(themeSubs, fn),
      token: name => getComputedStyle(html).getPropertyValue('--' + String(name).replace(/^-+/, '')).trim(),
      asset,
      progress: scene => {
        const m = motion();
        const key = sceneFor(scene);
        return m && key && m.sceneProgress ? m.sceneProgress(key) : 0;
      },
      onProgress: (fn, scene) => {
        const m = motion();
        const key = sceneFor(scene);
        if (!m || !key || !m.onProgress) return noop;
        return track(m.onProgress(key, guard(fn)));
      },
      onFrame: fn => {
        const m = motion();
        const wrapped = guard(fn);
        return track(m && m.onFrame ? m.onFrame(wrapped) : ownFrame(wrapped));
      },
      visible: () => vis,
      onVisible: fn => sub(visSubs, fn),
      size: () => ({ ...box }),
      onResize: fn => sub(resizeSubs, fn),
      variable: name => globalThis.__formwebVariables?.get?.(name),
      onVariable: (name, fn) => {
        const v = globalThis.__formwebVariables;
        if (!v || typeof v.subscribe !== 'function') return noop;
        const off = v.subscribe(name, guard(fn));
        return track(typeof off === 'function' ? off : noop);
      },
      ready: () => { if (poster) poster.style.visibility = 'hidden'; }
    };
    Object.defineProperty(ctx, 'reduced', { enumerable: true, get: isReduced });

    const layer = document.createElement('div');
    layer.setAttribute('data-fw-layer', '');
    layer.style.cssText = 'position:absolute;inset:0';
    host.append(layer);

    return load(id).then(mod => {
      const result = mod.mount(layer, props, ctx);
      if (typeof result === 'function') stops.push(guard(result));
      else if (result && typeof result === 'object' && typeof result.destroy === 'function') stops.push(guard(() => result.destroy()));
    }).catch(error => {
      fail(error);
      layer.remove();
      if (poster) poster.style.visibility = '';
      for (const off of stops.splice(0)) { try { off(); } catch {} }
    }).then(() => failed);
  };

  const start = () => {
    const pending = new Map();
    const io = new IntersectionObserver(list => {
      for (const e of list) {
        if (!e.isIntersecting) continue;
        const entry = pending.get(e.target);
        io.unobserve(e.target);
        pending.delete(e.target);
        if (entry) run(e.target, entry.id, entry.props);
      }
    }, { rootMargin: '100%' });
    for (const [host, spec] of Object.entries(pages)) {
      const id = spec && typeof spec.component === 'string' ? spec.component : '';
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
      const el = document.querySelector(`[data-fw-node="${CSS.escape(host)}"]`);
      if (!el || pending.has(el)) continue;
      pending.set(el, { id, props: spec.props && typeof spec.props === 'object' ? spec.props : {} });
      io.observe(el);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
