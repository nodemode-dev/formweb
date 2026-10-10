'use strict';
(() => {
  const config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const nodes = new Map(Array.from(document.querySelectorAll('[data-fw-id]')).map(node => [node.dataset.fwId, node]));
  const dialogs = new Map(Array.from(document.querySelectorAll('dialog[data-fw-overlay]')).map(node => [node.dataset.fwOverlay, node]));
  const query = new URLSearchParams(location.search);
  const memorySession = new Map();
  const readSession = key => { try { return sessionStorage.getItem(key) ?? memorySession.get(key) ?? null; } catch { return memorySession.get(key) ?? null; } };
  const writeSession = (key, value) => { memorySession.set(key, value); try { sessionStorage.setItem(key, value); } catch {} dispatchEvent(new Event('formweb-session')); };
  const conditions = entries => (entries || []).every(condition => {
    const value = condition.source === 'session' ? readSession(condition.key) : query.get(condition.key);
    if (condition.op === 'exists') return value !== null;
    if (condition.op === 'ne') return value !== String(condition.value ?? '');
    if (condition.op === 'contains') return (value || '').includes(String(condition.value ?? ''));
    return value === String(condition.value ?? '');
  });
  const resolve = (id, scope = '') => nodes.get(id + scope) || nodes.get(id);
  const conditionalNodes = [];
  addEventListener('formweb-session', () => { for (const entry of conditionalNodes) { const active = conditions(entry.record.conditions); entry.node.hidden = entry.authoredHidden || !active; if (active && !entry.active) for (const invoke of entry.load) invoke(true); entry.active = active; } });
  const text = (node, content) => {
    if (!node) return;
    let target = Array.from(node.childNodes).find(child => child.nodeType === Node.TEXT_NODE);
    if (target) target.data = content;
    else if (!node.children.length) node.textContent = content;
    else node.insertBefore(document.createTextNode(content), node.firstChild);
  };
  const applyPatch = (node, patch) => {
    if (!node) return;
    if (Object.hasOwn(patch, 'text')) text(node, patch.text);
    for (const [name, value] of Object.entries(patch.styles || {})) value === null ? node.style.removeProperty(name) : node.style.setProperty(name, String(value));
    for (const [name, value] of Object.entries(patch.attrs || {})) value === null ? node.removeAttribute(name) : node.setAttribute(name, String(value));
  };
  const variant = (root, name) => {
    if (!root) return;
    const metadata = config.nodes?.[root.dataset.fwNode];
    const definition = config.components?.definitions?.[metadata?.componentId];
    const changes = definition?.variants?.[name]?.nodes;
    if (!changes) return;
    const descendants = [root, ...root.querySelectorAll('[data-fw-node]')];
    const references = new Map(descendants.map(node => { const source = config.nodes?.[node.dataset.fwNode]?.componentSourceId || node.dataset.fwNode; return [config.nodes?.[source]?.attrs?.id, node.id]; }).filter(([source, target]) => source && target));
    const fragment = value => typeof value === 'string' && value.startsWith('#') && references.has(value.slice(1)) ? '#' + references.get(value.slice(1)) : value;
    const scopedPatch = patch => { const result = { ...patch, attrs: { ...patch.attrs } }; if (Object.hasOwn(result.attrs, 'href')) result.attrs.href = fragment(result.attrs.href); return result; };
    for (const node of descendants) {
      const source = config.nodes?.[node.dataset.fwNode]?.componentSourceId || node.dataset.fwNode;
      const baseline = config.nodes?.[source] || config.nodes?.[node.dataset.fwNode] || {};
      const baseStyles = { ...baseline.styles };
      for (const breakpoint of [...config.breakpoints || []].sort((a, b) => b.maxWidth - a.maxWidth)) if (breakpoint.maxWidth === 100000 || matchMedia(`(max-width:${breakpoint.maxWidth}px)`).matches) Object.assign(baseStyles, baseline.breakpoints?.[breakpoint.id] || {});
      const reset = { styles: {}, attrs: {} };
      for (const option of Object.values(definition.variants || {})) {
        const patch = option.nodes?.[source] || {};
        if (Object.hasOwn(patch, 'text')) reset.text = baseline.text || '';
        for (const key of Object.keys(patch.styles || {})) reset.styles[key] = baseStyles[key] ?? 'revert';
        for (const key of Object.keys(patch.attrs || {})) reset.attrs[key] = baseline.attrs?.[key] ?? null;
      }
      applyPatch(node, scopedPatch(reset));
      if (changes[source]) applyPatch(node, scopedPatch(changes[source]));
      const values = config.components?.instances?.[root.dataset.fwNode]?.props || {};
      for (const [key, prop] of Object.entries(definition.props || {})) {
        if (prop.target !== source) continue;
        const value = Object.hasOwn(values, key) ? values[key] : prop.default;
        if (value === undefined) continue;
        if (prop.field === 'text') text(node, String(value));
        else if (prop.field.startsWith('styles.')) node.style.setProperty(prop.field.slice(7), String(value));
        else if (prop.field.startsWith('attrs.')) node.setAttribute(prop.field.slice(6), String(prop.field === 'attrs.href' ? fragment(value) : value));
      }
    }
    root.dataset.fwVariant = name;
  };
  const timeline = (id, scope) => {
    const specification = config.behaviors?.timelines?.[id];
    const animations = [];
    for (const track of specification?.tracks || []) {
      const node = resolve(track.node, scope);
      if (!node) continue;
      if (reduced.matches || !node.animate) { applyPatch(node, { styles: track.keyframes.at(-1) || {} }); continue; }
      const frames = track.keyframes.map(frame => Object.fromEntries(Object.entries(frame).map(([key, value]) => [key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])));
      animations.push(node.animate(frames, { duration: track.duration, delay: track.at ?? track.delay ?? 0, easing: track.easing || 'ease', iterations: specification.repeat || 1, fill: 'both' }));
    }
    return animations;
  };
  const priorFocus = new WeakMap();
  const closeDialog = dialog => { if (dialog?.open) { dialog.close(); priorFocus.get(dialog)?.focus(); } };
  const openDialog = dialog => { if (!dialog || dialog.open) return; priorFocus.set(dialog, document.activeElement); dialog.showModal(); };
  for (const dialog of dialogs.values()) {
    dialog.querySelector('[data-fw-close]')?.addEventListener('click', () => closeDialog(dialog));
    dialog.addEventListener('cancel', event => { if (dialog.dataset.fwDismissible === 'false') event.preventDefault(); });
    dialog.addEventListener('close', () => { if (dialog.dataset.fwSessionKey) writeSession(dialog.dataset.fwSessionKey, 'dismissed'); priorFocus.get(dialog)?.focus(); });
    dialog.addEventListener('click', event => { if (event.target === dialog && dialog.dataset.fwDismissible !== 'false') { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog); } });
  }
  for (const dialog of dialogs.values()) { const specification = config.behaviors?.overlays?.[dialog.dataset.fwOverlayKey]; if (specification?.initial && (!specification.sessionKey || readSession(specification.sessionKey) !== 'dismissed')) openDialog(dialog); }
  const run = (origin, action, record, active = true) => {
    if (!conditions(action.conditions)) return;
    const node = action.target ? resolve(action.target, record.scope) : origin;
    if (!node) return;
    if (action.action === 'toggle-class') action.trigger === 'hover' ? node.classList.toggle(action.className, active) : active && node.classList.toggle(action.className);
    if (action.action === 'navigate' && active) location.assign(action.url);
    if (action.action === 'fade-in' && active) {
      node.style.opacity = '1';
      if (!reduced.matches && node.animate) node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: action.duration ?? 300, easing: action.easing || 'ease-out' });
    }
    if (action.action === 'variant' && active) variant(node, action.variant);
    if (action.action === 'timeline' && active) timeline(action.timeline, record.scope);
    if (action.action === 'overlay-open' && active) openDialog(dialogs.get(action.overlay + (record.scope || '')) || dialogs.get(action.overlay));
    if (action.action === 'overlay-close' && active) closeDialog(dialogs.get(action.overlay + (record.scope || '')) || dialogs.get(action.overlay));
    if (action.action === 'analytics-event' && active) queueMicrotask(() => { const extra = action.experiment ? { experiment: action.experiment, variant: assignment[action.experiment] } : {}; if (!action.experiment || extra.variant) track(action.event, extra); });
  };
  for (const node of nodes.values()) {
    node.addEventListener('pointerdown', () => node.setAttribute('data-fw-press', ''));
    for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) node.addEventListener(event, () => node.removeAttribute('data-fw-press'));
    node.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) node.setAttribute('data-fw-press', ''); });
    node.addEventListener('keyup', () => node.removeAttribute('data-fw-press'));
  }
  for (const record of config.records || []) {
    const node = nodes.get(record.id);
    if (!node) continue;
    const conditionEntry = { node, record, authoredHidden: node.hasAttribute('hidden'), active: conditions(record.conditions), load: [] };
    if (record.conditions?.length) { conditionalNodes.push(conditionEntry); node.hidden = conditionEntry.authoredHidden || !conditionEntry.active; }
    for (const action of [...record.interactions || [], ...record.actions || []]) {
      let executed = false;
      const invoke = active => { if (active && action.once && executed) return; if (!conditions(record.conditions)) return; run(node, action, record, active); if (active) executed = true; };
      if (action.trigger === 'click') node.addEventListener('click', () => invoke(true));
      if (action.trigger === 'press') node.addEventListener('pointerdown', () => invoke(true));
      if (action.trigger === 'hover') {
        node.addEventListener('pointerenter', () => invoke(true)); node.addEventListener('pointerleave', () => invoke(false));
        node.addEventListener('focusin', () => invoke(true)); node.addEventListener('focusout', () => invoke(false));
      }
      if (action.trigger === 'load') { conditionEntry.load.push(invoke); invoke(true); }
      if (action.trigger === 'scroll') {
        if (reduced.matches || !window.IntersectionObserver) { invoke(true); continue; }
        if (action.action === 'fade-in') node.style.opacity = '0';
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { invoke(true); if (action.once !== false) observer.disconnect(); } }, { threshold: .1 });
        observer.observe(node);
      }
    }
  }
  for (const list of document.querySelectorAll('[data-fw-list]')) {
    const rows = Array.from(list.children).filter(node => node.hasAttribute('data-fw-item'));
    const size = Math.max(1, Number(list.dataset.fwPageSize));
    const navigation = list.querySelector('[data-fw-pagination]');
    const output = navigation?.querySelector('[data-fw-page-output]');
    let page = 0;
    const refresh = () => { const count = Math.max(1, Math.ceil(rows.length / size)); rows.forEach((row, index) => { row.hidden = Math.floor(index / size) !== page; }); if (output) output.textContent = `${page + 1} / ${count}`; navigation?.querySelector('[data-fw-prev]')?.toggleAttribute('disabled', page === 0); navigation?.querySelector('[data-fw-next]')?.toggleAttribute('disabled', page + 1 >= count); };
    navigation?.querySelector('[data-fw-prev]')?.addEventListener('click', () => { page = Math.max(0, page - 1); refresh(); });
    navigation?.querySelector('[data-fw-next]')?.addEventListener('click', () => { page = Math.min(Math.ceil(rows.length / size) - 1, page + 1); refresh(); });
    refresh();
  }
  for (const form of document.querySelectorAll('form[data-fw-form]')) {
    const settings = config.forms?.forms?.[form.dataset.fwNode] || {};
    for (const field of form.querySelectorAll('[data-fw-track]')) field.value = query.get(field.dataset.fwTrack) || '';
    const status = form.querySelector('[data-fw-form-status]');
    const errors = new Map(Array.from(form.querySelectorAll('[data-fw-error]')).map(output => [output.dataset.fwError, output]));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type=submit]');
      if (button) button.disabled = true;
      if (status) status.textContent = 'Sending...';
      for (const output of errors.values()) output.textContent = '';
      try {
        const fields = new FormData(form);
        if (Array.from(fields.values()).some(value => typeof value !== 'string')) throw Error('File uploads are unavailable');
        const response = await fetch(form.action, { method: 'POST', body: new URLSearchParams(fields), headers: { Accept: 'application/json' } });
        const result = await response.json();
        if (!response.ok) { for (const [name, message] of Object.entries(result.errors || {})) { const output = errors.get(name); if (output) output.textContent = String(message); } throw Error(result.detail || 'Submission failed'); }
        if (status) status.textContent = result.successMessage || settings.successMessage || 'Thank you. Your message has been received.';
        form.reset();
        for (const field of form.querySelectorAll('[data-fw-track]')) field.value = query.get(field.dataset.fwTrack) || '';
        const redirect = settings.successRedirect || result.successRedirect;
        if (redirect) location.assign(/^\/(?!\/)/.test(redirect) ? `${config.routePrefix || './'}${redirect.slice(1)}` : redirect);
      } catch (error) { if (status) status.textContent = settings.errorMessage || error.message || 'We could not send your message. Please try again.'; }
      finally { if (button) button.disabled = false; }
    });
  }
  const integration = config.integrations || {};
  const endpoint = integration.endpointBase?.replace(/\/$/, '');
  const parameters = new URLSearchParams(Object.entries(config.context || {}).filter(([, value]) => value !== null && value !== ''));
  let visitorToken = '', consentToken = '';
  const request = async (path, body) => {
    if (!endpoint) throw Error('Configure a backend provider endpoint first.');
    const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
    if (config.context?.previewToken) { if (visitorToken) headers['X-FormWeb-Visitor'] = visitorToken; if (consentToken) headers['X-FormWeb-Consent'] = consentToken; }
    const response = await fetch(`${endpoint}/api/runtime${path}?${parameters}`, { method: body === undefined ? 'GET' : 'POST', credentials: config.context?.previewToken ? 'omit' : 'include', headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(typeof result.detail === 'string' ? result.detail : 'Backend provider unavailable.');
    if (config.context?.previewToken) { if (result.visitorToken) visitorToken = result.visitorToken; if (result.consentToken) consentToken = result.consentToken; if (path === '/member/logout') visitorToken = ''; if (path === '/consent' && body?.analytics === false) consentToken = ''; }
    return result;
  };
  const cartKey = `formweb-cart:${config.context?.site}`;
  const getCart = () => { try { return JSON.parse(readSession(cartKey) || '[]'); } catch { return []; } };
  const setCart = lines => { writeSession(cartKey, JSON.stringify(lines)); dispatchEvent(new Event('formweb-cart')); };
  const assignment = {};
  const track = async (name, extra = {}) => { if (readSession(`formweb-consent:${config.context?.site}`) !== 'true') return; try { await request('/event', { name, path: location.pathname, ...extra }); } catch {} };
  const assignExperiments = async () => {
    if (readSession(`formweb-consent:${config.context?.site}`) !== 'true') return;
    await Promise.all(Object.keys(integration.experiments || {}).map(async name => {
      try { const result = await request(`/experiment/${encodeURIComponent(name)}`); assignment[name] = result.variant; document.documentElement.setAttribute(`data-fw-experiment-${name}`, result.variant); writeSession(name, result.variant); } catch {}
    }));
  };
  for (const widget of document.querySelectorAll('[data-fw-widget]')) {
    const specification = integration.widgets?.[widget.dataset.fwOwner] || {};
    const status = widget.querySelector('.fw-widget-status');
    const perform = async work => { try { await work(); } catch (error) { status.textContent = error.message; } };
    if (widget.dataset.fwWidget === 'fetch') perform(async () => { const result = await request(`/data/${encodeURIComponent(specification.source)}`); const data = result.data ?? result; const value = specification.field ? Object.hasOwn(data, specification.field) ? data[specification.field] : specification.field.split('.').reduce((value, key) => value?.[key], data) : data; const output = widget.querySelector('[data-fw-output]'); output.textContent = typeof value === 'string' ? value : JSON.stringify(value) ?? ''; status.textContent = ''; });
    if (widget.dataset.fwWidget === 'product') perform(async () => {
      const catalog = await request('/commerce/catalog');
      const products = catalog.products || catalog.data?.products || [];
      const product = products.find(product => product.id === specification.product) || products[0];
      if (!product) throw Error('No published product is available.');
      widget.querySelector('[data-fw-product-title]').textContent = product.title;
      const select = widget.querySelector('[data-fw-variant]');
      const available = variant => variant && variant.availableForSale !== false && !(variant.inventoryKnown && variant.quantityAvailable <= 0);
      for (const variant of product.variants || []) { const option = document.createElement('option'); option.value = variant.id; option.textContent = `${variant.title}${available(variant) ? '' : ' (sold out)'}`; option.disabled = !available(variant); select.append(option); }
      const first = product.variants?.find(available); if (first) select.value = first.id;
      const price = () => { const variant = product.variants?.find(variant => variant.id === select.value); const value = variant?.price; widget.querySelector('[data-fw-price]').textContent = typeof value === 'object' ? `${value.amount} ${value.currencyCode || ''}` : String(value ?? ''); widget.querySelector('[data-fw-add]').disabled = !available(variant); status.textContent = available(variant) ? 'Available. Availability is checked again at checkout.' : 'Sold out.'; };
      select.addEventListener('change', price); price();
      widget.querySelector('[data-fw-add]').addEventListener('click', () => { const variant = product.variants?.find(variant => variant.id === select.value); if (!available(variant)) return; const quantity = Math.max(1, Math.min(99, Number(widget.querySelector('[data-fw-quantity]').value) || 1)); const lines = getCart(); const existing = lines.find(line => line.variantId === select.value); const total = (existing?.quantity || 0) + quantity; if (variant.inventoryKnown && total > variant.quantityAvailable) { status.textContent = 'Requested quantity exceeds available inventory.'; return; } if (existing) existing.quantity = total; else lines.push({ variantId: select.value, quantity }); setCart(lines); status.textContent = 'Added to cart.'; });
    });
    if (widget.dataset.fwWidget === 'cart') { const refresh = () => { widget.querySelector('[data-fw-cart-count]').textContent = `${getCart().reduce((total, line) => total + line.quantity, 0)} items`; }; refresh(); addEventListener('formweb-cart', refresh); widget.querySelector('[data-fw-clear]').addEventListener('click', () => setCart([])); }
    if (widget.dataset.fwWidget === 'checkout') widget.querySelector('[data-fw-checkout]').addEventListener('click', () => perform(async () => { const result = await request('/commerce/cart', { lines: getCart() }); if (!result.checkoutUrl || !/^https:\/\//.test(result.checkoutUrl)) throw Error('Configured provider did not return a hosted checkout.'); location.assign(result.checkoutUrl); }));
    if (widget.dataset.fwWidget === 'member-login') {
      const form = widget.querySelector('[data-fw-member-form]');
      const credentials = () => Object.fromEntries(new FormData(form));
      form.addEventListener('submit', event => { event.preventDefault(); perform(async () => { const result = await request('/member/login', credentials()); status.textContent = 'Signed in.'; form.elements.password.value = ''; widget.dispatchEvent(new CustomEvent('formweb-member', { bubbles: true, detail: result })); }); });
      widget.querySelector('[data-fw-register]').addEventListener('click', () => perform(async () => { if (!form.reportValidity()) return; await request('/member/register', credentials()); status.textContent = 'Account created. You can sign in.'; form.elements.password.value = ''; }));
      widget.querySelector('[data-fw-logout]').addEventListener('click', () => perform(async () => { await request('/member/logout', {}); status.textContent = 'Signed out.'; widget.dispatchEvent(new CustomEvent('formweb-member', { bubbles: true })); }));
    }
    if (widget.dataset.fwWidget === 'member-gate') { const refresh = () => perform(async () => { const result = await request('/member/session'); widget.querySelector('[data-fw-output]').textContent = result.authenticated ? 'Authenticated member session.' : 'Sign in to access protected routes.'; }); refresh(); document.addEventListener('formweb-member', refresh); }
    if (widget.dataset.fwWidget === 'analytics-consent') for (const button of widget.querySelectorAll('[data-fw-consent]')) button.addEventListener('click', () => perform(async () => { const analytics = button.dataset.fwConsent === 'true'; await request('/consent', { analytics }); writeSession(`formweb-consent:${config.context?.site}`, String(analytics)); status.textContent = analytics ? 'Analytics allowed.' : 'Analytics declined.'; if (analytics) { await assignExperiments(); track('page-view'); } }));
  }
  assignExperiments();
  document.addEventListener('click', event => { if (event.target.closest('a,button')) track('click'); });
  track('page-view');
})();
