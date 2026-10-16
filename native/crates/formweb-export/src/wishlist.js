'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const writeUrl = values => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of values) { if (value === '' || value === null) next.delete(key); else next.set(key, value); }
    const query = next.toString();
    try { history.replaceState(null, '', `${location.pathname}${query ? '?' + query : ''}${location.hash}`); } catch {}
  };

  for (const form of document.querySelectorAll('form[data-fw-facets]')) {
    const key = form.dataset.fwFacets;
    const list = Array.from(document.querySelectorAll('[data-fw-list][data-fw-managed]')).find(node => node.dataset.fwList === key);
    if (!list) continue;
    const entries = Array.from(list.children).filter(node => node.hasAttribute('data-fw-item')).map((row, index) => {
      let facets = {}, sorts = {};
      try { facets = JSON.parse(row.dataset.fwFacetData || '{}'); sorts = JSON.parse(row.dataset.fwSortData || '{}'); } catch {}
      return { row, index, facets, sorts };
    });
    const navigation = list.querySelector('[data-fw-pagination]');
    const output = navigation?.querySelector('[data-fw-page-output]');
    const size = Math.max(0, Number(list.dataset.fwPageSize) || 0);
    const status = form.querySelector('[data-fw-status]');
    const sortSelect = form.querySelector('[data-fw-sort]');
    const facetControls = Array.from(form.querySelectorAll('[data-fw-facet]'));
    const ranges = Array.from(form.querySelectorAll('[data-fw-range]'));
    const facetKeys = [...new Set(facetControls.map(control => control.dataset.fwFacet))];
    const rangeKeys = [...new Set(ranges.map(input => input.dataset.fwRange))];
    let page = 0;

    const read = () => {
      const state = {};
      for (const control of facetControls) {
        const name = control.dataset.fwFacet;
        if (control.type === 'checkbox') { if (control.checked) (state[name] ||= { kind: 'checkbox', values: [] }).values.push(control.value); }
        else if (control.value.trim()) state[name] = { kind: control.dataset.fwKind, value: control.value.trim() };
      }
      for (const input of ranges) if (input.value !== '') (state[input.dataset.fwRange] ||= { kind: 'range' })[input.dataset.fwBound] = input.value;
      return state;
    };
    const compareRange = (a, b) => (a !== '' && b !== '' && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) ? Number(a) - Number(b) : (a < b ? -1 : a > b ? 1 : 0);
    const matches = (entry, state) => Object.entries(state).every(([name, rule]) => {
      const values = entry.facets[name] || [];
      if (rule.kind === 'checkbox') return rule.values.some(value => values.includes(value));
      if (rule.kind === 'select') return values.includes(rule.value);
      if (rule.kind === 'search') return rule.value.toLowerCase().split(/\s+/).every(term => (values[0] || '').includes(term));
      const value = values[0];
      if (value === undefined) return false;
      if (rule.min !== undefined && compareRange(value, rule.min) < 0) return false;
      if (rule.max !== undefined && compareRange(value, rule.max) > 0) return false;
      return true;
    });

    const apply = (persist = true) => {
      const state = read();
      const sort = sortSelect?.value || '';
      const direction = sortSelect?.selectedOptions[0]?.dataset.fwDirection === 'desc' ? -1 : 1;
      const ordered = entries.slice().sort((a, b) => {
        if (!sort) return a.index - b.index;
        const x = a.sorts[sort], y = b.sorts[sort];
        if ((x ?? null) === null && (y ?? null) === null) return a.index - b.index;
        if ((x ?? null) === null) return 1;
        if ((y ?? null) === null) return -1;
        const result = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
        return result * direction || a.index - b.index;
      });
      const current = Array.from(list.children).filter(node => node.hasAttribute('data-fw-item'));
      if (ordered.some((entry, index) => entry.row !== current[index])) for (const entry of ordered) list.insertBefore(entry.row, navigation);
      const hits = ordered.filter(entry => matches(entry, state));
      const pages = size ? Math.max(1, Math.ceil(hits.length / size)) : 1;
      page = Math.min(page, pages - 1);
      const shown = new Set(size ? hits.slice(page * size, page * size + size) : hits);
      for (const entry of entries) entry.row.hidden = !shown.has(entry);
      if (status) status.textContent = hits.length ? `${hits.length} of ${entries.length} results` : 'No results match your filters.';
      if (navigation) {
        navigation.hidden = size === 0 || hits.length <= size;
        if (output) output.textContent = `${page + 1} / ${pages}`;
        navigation.querySelector('[data-fw-prev]')?.toggleAttribute('disabled', page === 0);
        navigation.querySelector('[data-fw-next]')?.toggleAttribute('disabled', page + 1 >= pages);
      }
      if (!persist) return;
      const values = [];
      for (const name of facetKeys) {
        const rule = state[name];
        values.push([name, !rule ? '' : rule.kind === 'checkbox' ? rule.values.join(',') : rule.value]);
      }
      for (const name of rangeKeys) { values.push([`${name}-min`, state[name]?.min ?? '']); values.push([`${name}-max`, state[name]?.max ?? '']); }
      values.push(['sort', sort], ['page', page > 0 ? String(page + 1) : '']);
      writeUrl(values);
    };

    for (const control of facetControls) {
      const stored = params.get(control.dataset.fwFacet);
      if (stored === null) continue;
      if (control.type === 'checkbox') control.checked = stored.split(',').includes(control.value);
      else control.value = stored;
    }
    for (const input of ranges) { const stored = params.get(`${input.dataset.fwRange}-${input.dataset.fwBound}`); if (stored !== null) input.value = stored; }
    if (sortSelect && params.get('sort') !== null) sortSelect.value = params.get('sort');
    if (sortSelect && sortSelect.selectedIndex === -1) sortSelect.value = '';
    page = Math.max(0, (Number(params.get('page')) || 1) - 1);

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', () => { page = 0; apply(); });
    form.addEventListener('change', () => { page = 0; apply(); });
    form.querySelector('[data-fw-clear]')?.addEventListener('click', () => {
      for (const control of facetControls) { if (control.type === 'checkbox') control.checked = false; else control.value = ''; }
      for (const input of ranges) input.value = '';
      if (sortSelect) sortSelect.value = '';
      page = 0;
      apply();
    });
    navigation?.querySelector('[data-fw-prev]')?.addEventListener('click', () => { page = Math.max(0, page - 1); apply(); });
    navigation?.querySelector('[data-fw-next]')?.addEventListener('click', () => { page += 1; apply(); });
    apply(false);
  }

  for (const slider of document.querySelectorAll('[data-fw-slider]')) {
    const viewport = slider.querySelector('[data-fw-viewport]');
    const slides = Array.from(slider.querySelectorAll('[data-fw-slide]'));
    const dots = Array.from(slider.querySelectorAll('[data-fw-dot]'));
    const previous = slider.querySelector('[data-fw-prev]');
    const next = slider.querySelector('[data-fw-next]');
    const pause = slider.querySelector('[data-fw-pause]');
    if (!viewport || !slides.length) continue;
    const loop = slider.dataset.fwLoop === 'true';
    const interval = Math.max(2000, Number(slider.dataset.fwInterval) || 5000);
    const perView = () => Math.max(1, Number(getComputedStyle(slider).getPropertyValue('--fw-per-view')) || 1);
    const stops = () => Math.max(1, slides.length - Math.min(perView(), slides.length) + 1);
    const offset = index => slides[index].offsetLeft - slides[0].offsetLeft;
    let index = 0;
    let userPaused = false;
    let hovering = false;
    let timer = 0;

    const update = () => {
      const left = viewport.scrollLeft;
      let best = 0, distance = Infinity;
      for (let i = 0; i < slides.length; i += 1) { const gap = Math.abs(offset(i) - left); if (gap < distance) { distance = gap; best = i; } }
      index = Math.min(best, stops() - 1);
      const end = viewport.scrollWidth - viewport.clientWidth - 2;
      if (left >= end) index = stops() - 1;
      dots.forEach((dot, i) => { if (i === index) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
      if (!loop) { previous?.toggleAttribute('disabled', left <= 1); next?.toggleAttribute('disabled', left >= end); }
    };
    const go = target => {
      const count = stops();
      const wrapped = loop ? (target + count) % count : Math.max(0, Math.min(count - 1, target));
      viewport.scrollTo({ left: offset(wrapped), behavior: reduced.matches ? 'auto' : 'smooth' });
    };
    let frame = 0;
    viewport.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }, { passive: true });
    previous?.addEventListener('click', () => go(index - 1));
    next?.addEventListener('click', () => go(index + 1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => go(i)));
    viewport.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(stops() - 1); }
    });

    const stop = () => { clearInterval(timer); timer = 0; };
    const start = () => {
      stop();
      if (slider.dataset.fwAutoplay !== 'true' || reduced.matches || userPaused || hovering || document.hidden) return;
      timer = setInterval(() => go(index + 1 >= stops() ? 0 : index + 1), interval);
    };
    if (slider.dataset.fwAutoplay === 'true') {
      slider.addEventListener('pointerenter', () => { hovering = true; start(); });
      slider.addEventListener('pointerleave', () => { hovering = false; start(); });
      slider.addEventListener('focusin', () => { hovering = true; start(); });
      slider.addEventListener('focusout', () => { hovering = false; start(); });
      document.addEventListener('visibilitychange', start);
      reduced.addEventListener?.('change', () => { if (pause) pause.hidden = reduced.matches; start(); });
      pause?.addEventListener('click', () => {
        userPaused = !userPaused;
        pause.setAttribute('aria-pressed', String(userPaused));
        pause.textContent = userPaused ? 'Play' : 'Pause';
        start();
      });
      if (pause) pause.hidden = reduced.matches;
    }
    addEventListener('resize', update);
    update();
    start();
  }

  let config = {};
  try { config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const presets = {
    phone: { pattern: '\\+?[0-9][0-9 .\\-]{5,18}[0-9]', type: 'tel', inputMode: 'tel', autocomplete: 'tel', title: 'Enter a valid phone number' },
    postal: { pattern: '[A-Za-z0-9][A-Za-z0-9 \\-]{2,9}', autocomplete: 'postal-code', title: 'Enter a valid postal code' },
    email: { type: 'email', inputMode: 'email', autocomplete: 'email', title: 'Enter a valid email address' }
  };
  const limitFor = (form, name) => Math.min(2 * 1024 * 1024, Number(config.forms?.forms?.[form.dataset.fwNode]?.constraints?.[name]?.maxSize) || 2 * 1024 * 1024);

  for (const form of document.querySelectorAll('form')) {
    const rules = config.forms?.forms?.[form.dataset.fwNode]?.constraints || {};
    for (const [name, rule] of Object.entries(rules)) {
      const preset = presets[rule.preset];
      if (!preset) continue;
      for (const control of form.querySelectorAll('input[name], textarea[name]')) {
        if (control.name !== name) continue;
        if (preset.pattern && !control.pattern) control.pattern = preset.pattern;
        if (preset.type && control.tagName === 'INPUT' && control.type === 'text') control.type = preset.type;
        if (preset.inputMode) control.inputMode = preset.inputMode;
        if (preset.autocomplete && !control.autocomplete) control.autocomplete = preset.autocomplete;
        if (!control.title) control.title = preset.title;
      }
    }

    const steps = Array.from(form.querySelectorAll('[data-fw-step]')).sort((a, b) => Number(a.dataset.fwStep) - Number(b.dataset.fwStep));
    const nav = form.querySelector('[data-fw-step-nav]');
    if (steps.length < 2 || !nav) continue;
    const back = nav.querySelector('[data-fw-step-prev]');
    const forward = nav.querySelector('[data-fw-step-next]');
    const output = nav.querySelector('[data-fw-step-output]');
    const submitters = Array.from(form.querySelectorAll('[type=submit]')).filter(button => !steps.some(step => step.contains(button)));
    const fieldsOf = step => Array.from(step.querySelectorAll('input, select, textarea'));
    let index = 0;
    const show = (target, focus) => {
      index = target;
      steps.forEach((step, i) => { step.hidden = i !== index; });
      back.disabled = index === 0;
      forward.hidden = index === steps.length - 1;
      for (const button of submitters) button.hidden = index !== steps.length - 1;
      const title = steps[index].dataset.fwStepTitle;
      output.textContent = `Step ${index + 1} of ${steps.length}${title ? ': ' + title : ''}`;
      if (focus) fieldsOf(steps[index]).find(control => control.type !== 'hidden')?.focus();
    };
    const valid = i => {
      const bad = fieldsOf(steps[i]).find(control => !control.checkValidity());
      if (!bad) return true;
      show(i, false);
      bad.reportValidity();
      bad.focus();
      return false;
    };
    back.addEventListener('click', () => show(Math.max(0, index - 1), true));
    forward.addEventListener('click', () => { if (valid(index)) show(index + 1, true); });
    form.addEventListener('submit', event => {
      if (index < steps.length - 1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (valid(index)) show(index + 1, true);
        return;
      }
      for (let i = 0; i < steps.length; i += 1) {
        if (!valid(i)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      }
      show(steps.length - 1, false);
    }, true);
    form.addEventListener('reset', () => show(0, false));
    form.setAttribute('data-fw-ready', '');
    show(0, false);
  }

  window.fwEncodeForm = async (form, fields) => {
    const entries = Array.from(fields.entries());
    if (!entries.some(([, value]) => typeof value !== 'string')) return null;
    const real = entries.filter(([, value]) => typeof value !== 'string' && value.size > 0);
    if (!real.length) {
      const plain = new URLSearchParams();
      for (const [name, value] of entries) if (typeof value === 'string') plain.append(name, value);
      return { body: plain, type: 'application/x-www-form-urlencoded;charset=UTF-8' };
    }
    const read = file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error('The file could not be read.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.readAsDataURL(file);
    });
    const body = {};
    let total = 0;
    for (const [name, value] of entries) {
      let item = value;
      if (typeof value !== 'string') {
        if (value.size === 0) continue;
        total += value.size;
        if (value.size > limitFor(form, name) || total > 3 * 1024 * 1024) throw Error('The attached files are too large.');
        item = { name: value.name, type: value.type, size: value.size, data: await read(value) };
      }
      body[name] = name in body ? [].concat(body[name], item) : item;
    }
    return { body: JSON.stringify(body), type: 'application/json' };
  };
})();
