// Token prompt (C19): a prompt field that highlights slash commands and at mentions as you type and offers an
// autocomplete menu for both. Ported from the FormMCP prompt hero of formai-xmental-webspun v3.1.0.
// The run that follows a submit is native (motion scripts, variables, actions); this module only owns the field,
// the menu, and the small amount of glue the field needs from that run: it copies the task into hidden inputs the
// script reads, and it follows the `started` and `finished` variables to lock the field, inert the log and reset.

const DEFAULT_COMMANDS = [
  { name: '/family_apps', desc: 'List every Form app' },
  { name: '/suggest_app', desc: 'Rank apps for a task' },
  { name: '/app_tools', desc: 'Start an app, list its tools' },
  { name: '/call_app', desc: 'Run one app tool' },
  { name: '/app_resources', desc: "List an app's documents" }
];
const DEFAULT_APPS = [
  { name: '@formcut', path: 'formcut', desc: 'Video editor' },
  { name: '@formvis', path: 'formvis', desc: 'Layered image editor' },
  { name: '@formwav', path: 'formwav', desc: 'Audio editor and music studio' },
  { name: '@formdeck', path: 'formdeck', desc: 'Presentation and pitch deck app' },
  { name: '@formmd', path: 'formmd', desc: 'Workspace for people and agents' }
];
const DEFAULT_EXAMPLES = [
  'Run /app_tools on @formcut and list what it can do',
  'Ask /suggest_app which app fits a job for @formmd pages',
  'Use /call_app to run one tool from @formwav'
];

const SHEET = `
.fwc-tp-root { position: absolute; inset: 0; }
.fwc-tp-mir, .fwc-tp-ta, .fwc-tp-ph {
  margin: 0; padding: 0; border: 0;
  font-family: var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 15px; line-height: 1.6; letter-spacing: 0;
  white-space: pre-wrap; overflow-wrap: break-word; word-break: normal; tab-size: 4;
}
.fwc-tp-mir, .fwc-tp-ta { position: absolute; left: 18px; top: 16px; width: calc(100% - 36px); height: calc(100% - 32px); overflow: hidden; box-sizing: border-box; }
.fwc-tp-mir { color: var(--ink, currentColor); pointer-events: none; }
.fwc-tp-ta { resize: none; outline: 0; background: transparent; color: transparent; caret-color: var(--ink, currentColor); overflow-y: auto; scrollbar-width: none; }
.fwc-tp-ta::-webkit-scrollbar { display: none; }
.fwc-tp-ta::selection { background: color-mix(in srgb, var(--hue, currentColor) 35%, transparent); }
.fwc-tp-cmd { background: color-mix(in srgb, var(--hue, currentColor) 22%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--hue, currentColor) 40%, transparent); color: var(--hue, currentColor); }
.fwc-tp-app { background: color-mix(in srgb, var(--ink, currentColor) 14%, transparent); box-shadow: 0 0 0 1px var(--edge-strong, currentColor); }
.fwc-tp-ph { position: absolute; left: 18px; top: 16px; right: 18px; z-index: var(--z-raised, 100); background: transparent; color: var(--ink-faint, currentColor); text-align: left; cursor: text; }
.fwc-tp-ph[hidden] { display: none; }
.fwc-tp-ph .fwc-tp-cmd, .fwc-tp-ph .fwc-tp-app { color: var(--ink-soft, currentColor); }
.fwc-tp-key { padding: 0 6px; border: 1px solid var(--edge-strong, currentColor); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-tp-pop {
  position: absolute; left: 14px; top: calc(100% - 6px); z-index: var(--z-popover, 700);
  width: min(360px, calc(100% - 28px)); padding: 6px; box-sizing: border-box;
  border: 1px solid var(--edge-strong, currentColor); background: var(--float, Canvas);
  transform-origin: 0 0; animation: fwc-tp-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  text-align: left;
}
.fwc-tp-pop[hidden] { display: none; }
.fwc-tp-pop-h { padding: 4px 8px 8px; color: var(--ink-faint, currentColor); font-family: var(--font-mono, monospace); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-tp-opt { display: flex; align-items: baseline; gap: 12px; padding: 7px 8px; cursor: pointer; }
.fwc-tp-opt[aria-selected="true"] { background: var(--control, transparent); }
.fwc-tp-opt-n { color: var(--hue, currentColor); font-family: var(--font-mono, monospace); font-size: var(--fs-s, 0.875rem); }
.fwc-tp-opt-d { min-width: 0; margin-left: auto; overflow: hidden; color: var(--ink-faint, currentColor); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@keyframes fwc-tp-pop {
  from { opacity: 0; transform: translateY(-4px) scale(0.94); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .fwc-tp-pop { animation: none; } }
`;

const asList = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
const text = (value, fallback) => (typeof value === 'string' ? value : fallback);

export function mount(root, props, ctx) {
  const p = props || {};
  const commands = asList(p.commands, DEFAULT_COMMANDS).filter((c) => c && typeof c.name === 'string');
  const apps = asList(p.apps, DEFAULT_APPS).filter((a) => a && typeof a.name === 'string');
  const examples = asList(p.examples, DEFAULT_EXAMPLES).filter((e) => typeof e === 'string');
  const startedVar = text(p.startedVariable, 'started');
  const finishedVar = text(p.finishedVariable, 'finished');

  const style = document.createElement('style');
  style.textContent = SHEET;
  const wrap = document.createElement('div');
  wrap.className = 'fwc-tp-root';

  const mir = document.createElement('div');
  mir.className = 'fwc-tp-mir';
  mir.setAttribute('aria-hidden', 'true');

  const ph = document.createElement('button');
  ph.type = 'button';
  ph.className = 'fwc-tp-ph';
  ph.tabIndex = -1;
  const span = (cls, label) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = label;
    return s;
  };
  ph.append(
    document.createTextNode(text(p.hintBefore, 'Try') + ' '),
    span('fwc-tp-cmd', text(p.hintCommand, '/call_app')),
    document.createTextNode(' ' + text(p.hintMiddle, 'with') + ' '),
    span('fwc-tp-app', text(p.hintApp, '@formcut')),
    document.createTextNode(' '),
    span('fwc-tp-key', text(p.hintKey, 'Tab'))
  );

  const ta = document.createElement('textarea');
  ta.className = 'fwc-tp-ta';
  ta.rows = 3;
  ta.spellcheck = false;
  ta.autocomplete = 'off';
  ta.setAttribute('role', 'combobox');
  ta.setAttribute('aria-label', text(p.label, 'Task for the agent'));
  ta.setAttribute('aria-autocomplete', 'list');
  ta.setAttribute('aria-expanded', 'false');
  ta.setAttribute('aria-haspopup', 'listbox');
  const popId = 'fwc-tp-pop-' + String(ctx.id || 'x').replace(/[^A-Za-z0-9_-]/g, '');
  ta.setAttribute('aria-controls', popId);

  const pop = document.createElement('div');
  pop.className = 'fwc-tp-pop';
  pop.id = popId;
  pop.setAttribute('role', 'listbox');
  pop.setAttribute('aria-label', text(p.popoverLabel, 'Suggestions'));
  pop.hidden = true;

  wrap.append(mir, ph, ta, pop);
  root.append(style, wrap);

  const form = ctx.host.closest('form');
  const find = (id) => (typeof id === 'string' && id ? document.querySelector('[data-fw-node="' + CSS.escape(id) + '"]') : null);
  const scope = find(p.scopeNode);
  const setField = (id, value) => {
    const el = find(id);
    if (el && 'value' in el && el.value !== value) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  let popOpen = false;
  let dismissed = false;
  let selIdx = 0;
  let lastTok = '';
  let items = [];
  let kind = 'cmd';
  let exIdx = 0;
  let phase = 'idle';
  const offs = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  };

  const renderMirror = () => {
    const v = ta.value;
    const frag = document.createDocumentFragment();
    const re = /(^|\s)([\/@][A-Za-z0-9._\/-]*)/g;
    let last = 0;
    let m;
    while ((m = re.exec(v))) {
      const s = m.index + m[1].length;
      if (s > last) frag.append(document.createTextNode(v.slice(last, s)));
      frag.append(span(m[2][0] === '/' ? 'fwc-tp-cmd' : 'fwc-tp-app', m[2]));
      last = s + m[2].length;
    }
    if (last < v.length) frag.append(document.createTextNode(v.slice(last)));
    frag.append(document.createTextNode('​'));
    mir.replaceChildren(frag);
    mir.scrollTop = ta.scrollTop;
    ph.hidden = v.length > 0;
  };

  const activeToken = () => {
    const c = ta.selectionStart;
    const m = /(^|\s)([\/@]\S*)$/.exec(ta.value.slice(0, c));
    return m ? { text: m[2], start: c - m[2].length, end: c } : null;
  };

  const closePop = () => {
    popOpen = false;
    pop.hidden = true;
    ta.setAttribute('aria-expanded', 'false');
    ta.removeAttribute('aria-activedescendant');
  };
  const select = (i) => {
    selIdx = i;
    [...pop.querySelectorAll('.fwc-tp-opt')].forEach((r, k) => r.setAttribute('aria-selected', String(k === i)));
    ta.setAttribute('aria-activedescendant', popId + '-o' + i);
  };
  const paintPop = () => {
    const h = document.createElement('div');
    h.className = 'fwc-tp-pop-h';
    h.textContent = kind === 'cmd' ? text(p.commandsHeading, 'Commands') : text(p.appsHeading, 'Apps in the family');
    const rows = items.map((it, i) => {
      const r = document.createElement('div');
      r.className = 'fwc-tp-opt';
      r.id = popId + '-o' + i;
      r.setAttribute('role', 'option');
      r.setAttribute('aria-selected', String(i === selIdx));
      r.append(span('fwc-tp-opt-n', it.name), span('fwc-tp-opt-d', it.desc || ''));
      r.addEventListener('pointerenter', () => select(i));
      r.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        accept(i);
      });
      return r;
    });
    pop.replaceChildren(h, ...rows);
    ta.setAttribute('aria-activedescendant', popId + '-o' + selIdx);
  };
  const updatePop = () => {
    const tok = phase === 'idle' ? activeToken() : null;
    if (!tok) {
      lastTok = '';
      closePop();
      return;
    }
    let list;
    if (tok.text[0] === '/') {
      kind = 'cmd';
      list = commands.filter((c) => c.name.startsWith(tok.text));
    } else {
      kind = 'app';
      const q = tok.text.slice(1);
      list = apps.filter((a) => String(a.path || a.name.slice(1)).includes(q));
    }
    const only = list.length === 1 && list[0].name === tok.text;
    if (!list.length || dismissed || only) {
      closePop();
      return;
    }
    if (tok.text !== lastTok) selIdx = 0;
    lastTok = tok.text;
    items = list;
    if (selIdx >= items.length) selIdx = 0;
    const was = popOpen;
    popOpen = true;
    pop.hidden = false;
    ta.setAttribute('aria-expanded', 'true');
    paintPop();
    if (!was && !ctx.reduced) {
      pop.style.animation = 'none';
      void pop.offsetWidth;
      pop.style.animation = '';
    }
  };
  const accept = (i) => {
    const tok = activeToken();
    const it = items[i];
    if (!tok || !it) return;
    const v = ta.value;
    ta.value = v.slice(0, tok.start) + it.name + ' ' + v.slice(tok.end);
    const c = tok.start + it.name.length + 1;
    ta.setSelectionRange(c, c);
    dismissed = false;
    lastTok = '';
    renderMirror();
    updatePop();
    ta.focus();
  };

  const fillExample = () => {
    if (!examples.length) return;
    ta.value = examples[exIdx % examples.length];
    renderMirror();
    ta.focus();
    const c = ta.value.length;
    ta.setSelectionRange(c, c);
    updatePop();
  };

  // Apps named in the task, then the family portal, at most three (the original's "read N apps" step).
  const prepareRun = () => {
    const q = ta.value.trim() || examples[exIdx % Math.max(1, examples.length)] || '';
    const known = apps.map((a) => String(a.path || a.name.slice(1)));
    const found = [...new Set((q.match(/@[A-Za-z0-9._\/-]+/g) || []).map((s) => s.slice(1)))].filter((s) => known.includes(s));
    const files = (found.length ? found : [known[0] || 'formcut']).concat('formportal').slice(0, 3);
    setField(p.taskNode, q);
    setField(p.countNode, String(files.length));
    setField(p.filesNode, files.join(', '));
  };

  listen(ta, 'input', () => {
    dismissed = false;
    renderMirror();
    updatePop();
  });
  listen(ta, 'scroll', () => {
    mir.scrollTop = ta.scrollTop;
  });
  listen(ta, 'click', updatePop);
  listen(ta, 'keyup', (e) => {
    if (e.key.startsWith('Arrow') && !popOpen) updatePop();
  });
  listen(document, 'selectionchange', () => {
    if (document.activeElement === ta) updatePop();
  });
  listen(ta, 'blur', () => {
    if (popOpen) closePop();
  });
  listen(ta, 'keydown', (e) => {
    if (popOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        select((selIdx + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        select((selIdx - 1 + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(selIdx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissed = true;
        closePop();
        return;
      }
    }
    if (e.key === 'Tab' && !e.shiftKey && ta.value === '' && phase === 'idle') {
      e.preventDefault();
      fillExample();
      return;
    }
    if (e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    }
  });
  listen(ph, 'click', fillExample);
  listen(document, 'keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ta.focus();
    }
  });
  if (scope) {
    listen(window, 'pointermove', (e) => {
      const r = scope.getBoundingClientRect();
      scope.style.setProperty('--kx', e.clientX - r.left + 'px');
      scope.style.setProperty('--ky', e.clientY - r.top + 'px');
    });
  }
  if (form) {
    // Runs before the native script's own submit listener: a second submit while a run is on screen does nothing.
    listen(form, 'submit', (e) => {
      if (phase !== 'idle') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      closePop();
      prepareRun();
    }, true);
  }

  const setInert = (id, on) => {
    const el = find(id);
    if (!el) return;
    if (on) {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  };
  const applyPhase = (next) => {
    const was = phase;
    phase = next;
    ta.readOnly = next === 'running';
    const run = find(p.runNode);
    if (run && 'disabled' in run) run.disabled = next === 'running';
    setInert(p.logNode, next === 'idle');
    setInert(p.doneNode, next !== 'done');
    if (next !== 'idle') closePop();
    if (was !== 'idle' && next === 'idle') {
      ta.value = '';
      exIdx = (exIdx + 1) % Math.max(1, examples.length);
      renderMirror();
      requestAnimationFrame(() => ta.focus());
    }
  };
  const readPhase = () => (ctx.variable(finishedVar) === true ? 'done' : ctx.variable(startedVar) === true ? 'running' : 'idle');
  offs.push(ctx.onVariable(startedVar, () => applyPhase(readPhase())));
  offs.push(ctx.onVariable(finishedVar, () => applyPhase(readPhase())));

  // Keeps aria-checked of the transport buttons in step with their number variable (0 selects the first node).
  const transportVar = text(p.transportVariable, 'http');
  const transportNodes = Array.isArray(p.transportNodes) ? p.transportNodes : [];
  if (transportNodes.length) {
    const paintTransport = () => {
      const v = Number(ctx.variable(transportVar)) || 0;
      transportNodes.forEach((id, i) => {
        const el = find(id);
        if (el) el.setAttribute('aria-checked', String(i === v));
      });
    };
    offs.push(ctx.onVariable(transportVar, paintTransport));
    paintTransport();
  }

  renderMirror();
  applyPhase(readPhase());
  ctx.ready();

  return () => {
    for (const off of offs.splice(0)) {
      try {
        off();
      } catch (e) {
        // Nothing to undo when a listener is already gone.
      }
    }
    root.replaceChildren();
  };
}
