import type { EditorState } from '../../../types';
import { labelAttr } from '../../../i18n';
import { element } from '../../../ui/dom';
import { icon } from '../../../ui/icons';
import { readBrand } from '../../brand-kit';
import type { ColorToken, Control, ControlFactory, ControlHost, ControlKit, StyleField } from './types';
import { register as registerSlider } from './slider';
import { register as registerColor } from './color';
import { register as registerGrid } from './grid';
import '../../../styles/controls.css';

const factories = new Map<string, ControlFactory>();

export function registerControl(keys: readonly string[], factory: ControlFactory): void {
  for (const key of keys) {
    if (factories.has(key)) throw new Error(`control already registered for ${key}`);
    factories.set(key, factory);
  }
}

export interface ControlOptions {
  fields: ReadonlyMap<string, HTMLInputElement | HTMLSelectElement>;
  overlay: HTMLElement;
  state(): EditorState | undefined;
  values(key: string): { value: string; inherited: string };
  setStyle(key: string, value: string): Promise<unknown>;
  status(message: string, error?: boolean): void;
  changed?(): void;
  setStyles?(styles: Record<string, string>): Promise<unknown>;
  scope(key: string): string;
}

export interface InstalledKit extends ControlKit {
  own(): number;
  clearRaw(): void;
  track<T>(key: string, value: string, work: Promise<T>): Promise<T>;
  shown(key: string, stored: string): string;
}

type Mode = 'controls' | 'css';
interface Stored { default?: Mode; fields?: Record<string, Mode> }
const STORE_KEY = 'formweb.design-controls';
const PASS = 'input, select, textarea, a[href], summary';

function load(): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Stored;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function save(stored: Stored): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch { }
}

function isColor(value: string): boolean {
  const text = value.trim();
  return !!text && !/var\(/i.test(text) && typeof CSS !== 'undefined' && CSS.supports('color', text);
}

function englishLabel(head: HTMLElement | null, key: string): string {
  const own = head ? Array.from(head.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() : '';
  return own || key;
}

interface Gesture { scope: string; held: string; values: Set<string>; dead: boolean; released: boolean }
interface Upgraded { field: StyleField; control: Control; toggle: HTMLButtonElement; shown: boolean; gesture: Gesture | null; stale: Set<string> }

let installed = false;

export function installControls(options: ControlOptions): InstalledKit {
  if (!installed) {
    installed = true;
    registerSlider();
    registerColor();
    registerGrid();
  }
  const stored = load();
  stored.fields = stored.fields && typeof stored.fields === 'object' ? stored.fields : {};
  const host: ControlHost & { commitStyles?(styles: Record<string, string>): Promise<void> } = {
    commitStyles: options.setStyles ? async styles => { await options.setStyles!(styles); } : undefined,
    overlay: options.overlay,
    state: options.state,
    colors(): ColorToken[] {
      const state = options.state();
      if (!state) return [];
      const seen = new Set<string>();
      const out: ColorToken[] = [];
      const add = (token: ColorToken): void => { if (!seen.has(token.css)) { seen.add(token.css); out.push(token); } };
      const brand = readBrand(state);
      for (const item of brand.colors) add({ name: item.name, value: item.value, css: `var(--${item.token})`, group: 'brand' });
      for (const item of brand.teamColors) add({ name: item.name, value: item.value, css: `var(--${item.token})`, group: 'team' });
      for (const [name, content] of Object.entries(state.site.tokens || {})) {
        const bare = name.replace(/^--/, '');
        if (isColor(content)) add({ name: bare, value: content, css: `var(--${bare})`, group: 'site' });
      }
      return out;
    },
    restricted: () => { const state = options.state(); return !!state && readBrand(state).restricted; },
    status: (message, error = false) => options.status(message, error)
  };
  const upgraded = new Map<string, Upgraded>();
  const inflight = new Map<string, { value: string }[]>();
  let identity: string | null = null;
  const held = (key: string): string | null => {
    const gesture = upgraded.get(key)?.gesture;
    return gesture && !gesture.dead && gesture.scope === options.scope(key) ? gesture.held : null;
  };
  const committed = (key: string, stored: string): string => inflight.get(options.scope(key))?.at(-1)?.value ?? stored;
  const shown = (key: string, stored: string): string => held(key) ?? committed(key, stored);
  function settle(key: string, scope: string): void {
    const list = inflight.get(scope);
    if (!list || list.length) return;
    inflight.delete(scope);
    const entry = upgraded.get(key);
    if (entry && entry.gesture) { later(entry); return; }
    if (!entry || options.scope(key) !== scope || document.activeElement === entry.field.input) return;
    entry.field.restore();
    syncOne(entry);
  }
  function later(entry: Upgraded): void {
    const gesture = entry.gesture;
    window.setTimeout(() => {
      const key = entry.field.key;
      if (!gesture || entry.gesture !== gesture || gesture.dead || gesture.scope !== options.scope(key) || inflight.get(gesture.scope)?.length) return;
      if (!gesture.released && gesture.held !== entry.field.value()) return;
      entry.field.restore();
      syncOne(entry);
    });
  }
  const release = (event: Event): void => {
    upgraded.forEach(entry => {
      if (!entry.gesture) return;
      if (event.type !== 'keyup') entry.gesture.released = true;
      later(entry);
    });
  };
  for (const type of ['pointerup', 'pointercancel', 'keyup']) window.addEventListener(type, release, true);
  function moved(): boolean {
    const now = options.scope('');
    if (identity === now) return false;
    const first = identity === null;
    identity = now;
    if (first) return false;
    upgraded.forEach(entry => {
      const cancel = entry.control.cancel;
      const gesture = entry.gesture;
      if (gesture) gesture.dead = true;
      if (cancel) { try { cancel.call(entry.control); } catch { } }
      entry.stale = new Set();
      if (!gesture) return;
      if (cancel) { entry.stale = gesture.values; entry.gesture = null; } else gesture.dead = true;
    });
    return true;
  }

  const defaultRaw = (): boolean => stored.default === 'css';
  const raw = (key: string): boolean => { const own = stored.fields![key]; return own ? own === 'css' : defaultRaw(); };

  function paint(entry: Upgraded): void {
    const isRaw = raw(entry.field.key);
    const mode = isRaw ? 'raw' : entry.shown ? 'on' : 'off';
    const wrapper = entry.field.wrapper;
    if (wrapper.dataset.ctl !== mode) wrapper.dataset.ctl = mode;
    for (const slot of [entry.field.lead, entry.field.trail, entry.field.below]) {
      const inert = mode !== 'on';
      if (slot.inert !== inert) slot.inert = inert;
    }
    const pressed = String(isRaw);
    if (entry.toggle.getAttribute('aria-pressed') !== pressed) entry.toggle.setAttribute('aria-pressed', pressed);
  }

  function syncOne(entry: Upgraded): void {
    if (!raw(entry.field.key)) {
      let shown = false;
      try { shown = entry.control.sync(entry.field.input.value, entry.field.inherited()); } catch { shown = false; }
      entry.shown = shown;
    }
    paint(entry);
  }

  function applyRaw(entry: Upgraded, before: boolean): void {
    const now = raw(entry.field.key);
    if (now !== before) {
      try { entry.control.setRaw?.(now); } catch { }
    }
    syncOne(entry);
  }

  function stopLabel(event: MouseEvent): void {
    const target = event.target as Element | null;
    const slot = event.currentTarget as HTMLElement;
    const pass = target?.closest(PASS);
    if (pass && slot.contains(pass)) return;
    event.preventDefault();
  }

  for (const [key, node] of options.fields) {
    const factory = factories.get(key);
    if (!factory || !(node instanceof HTMLInputElement)) continue;
    const input = node;
    const wrapper = input.closest<HTMLElement>('.field');
    if (!wrapper) continue;
    const head = wrapper.querySelector<HTMLElement>(':scope > .field-label');
    const label = englishLabel(head, key);
    const row = element('span', 'fw-ctl-row');
    const lead = element('span', 'fw-ctl-slot fw-ctl-lead');
    const trail = element('span', 'fw-ctl-slot fw-ctl-trail');
    const below = element('span', 'fw-ctl-slot fw-ctl-below');
    input.before(row);
    row.append(lead, input, trail);
    row.after(below);
    for (const slot of [lead, trail, below]) {
      slot.dataset.ownKeys = '';
      slot.addEventListener('click', stopLabel);
    }
    if (wrapper instanceof HTMLLabelElement) {
      if (!input.id) input.id = `fw-style-${key}`;
      wrapper.htmlFor = input.id;
    }
    labelAttr(input, 'aria-label', label);
    wrapper.classList.add('fw-ctl');
    wrapper.dataset.ctl = 'off';

    const toggle = element('button', 'fw-ctl-raw');
    toggle.type = 'button';
    toggle.dataset.ctlRaw = key;
    toggle.dataset.ownKeys = '';
    toggle.append(icon('code'));
    labelAttr(toggle, 'title', 'Type {0} by hand: hide its control and edit the CSS text only. Press again to bring the control back.', [{ t: label }]);
    labelAttr(toggle, 'aria-label', 'Type {0} by hand', [{ t: label }]);
    toggle.setAttribute('aria-pressed', 'false');
    const reset = head?.querySelector<HTMLElement>(':scope > .fw-reset');
    if (reset) reset.after(toggle);
    else head?.append(toggle);

    const values = (): { value: string; inherited: string } => options.state() ? options.values(key) : { value: '', inherited: '' };
    let entry: Upgraded;
    const field: StyleField = {
      key, label, input, wrapper, lead, trail, below,
      value: () => committed(key, values().value),
      inherited: () => values().inherited,
      show(next: string) {
        const value = next.trim();
        const scope = options.scope(key);
        const gesture = entry.gesture;
        if (gesture && (gesture.dead || gesture.scope !== scope)) { gesture.dead = true; gesture.values.add(value); return; }
        if (gesture) { gesture.held = value; gesture.values.add(value); gesture.released = false; }
        else { entry.gesture = { scope, held: value, values: new Set([value]), dead: false, released: false }; entry.stale.delete(value); }
        if (input.value !== next) input.value = next;
      },
      restore() {
        entry.gesture = null;
        const stored = committed(key, values().value);
        if (input.value !== stored) input.value = stored;
        settle(key, options.scope(key));
      },
      async commit(next: string) {
        const entered = next.trim();
        const gesture = entry.gesture;
        if (gesture && (gesture.dead || gesture.scope !== options.scope(key))) { entry.stale = gesture.values; entry.gesture = null; return; }
        if (!gesture && entry.stale.delete(entered)) return;
        const shownNow = held(key);
        if (entered === committed(key, values().value) && (shownNow === null || shownNow === entered)) { field.restore(); syncOne(entry); return; }
        if ((shownNow === null || shownNow === entered) && input.value !== next) input.value = next;
        try {
          await options.setStyle(key, next);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const after = held(key);
          if (after === null || after === entered) field.restore();
          options.status(message, true);
          syncOne(entry);
          throw error instanceof Error ? error : new Error(message);
        }
      }
    };
    let control: Control;
    try { control = factory(field, host); } catch (error) { console.error(error); continue; }
    entry = { field, control, toggle, shown: false, gesture: null, stale: new Set() };
    upgraded.set(key, entry);
    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      kit.setRaw(key, !raw(key));
    });
    const typed = (): void => syncOne(entry);
    input.addEventListener('input', typed);
    input.addEventListener('change', typed);
    input.addEventListener('blur', () => { if (!inflight.has(options.scope(key)) && held(key) === null && options.state()) { field.restore(); syncOne(entry); } });
    if (raw(key)) { try { control.setRaw?.(true); } catch { } }
    paint(entry);
  }

  const kit: InstalledKit = {
    sync() { moved(); upgraded.forEach(syncOne); },
    track<T>(key: string, value: string, work: Promise<T>): Promise<T> {
      const scope = options.scope(key);
      const list = inflight.get(scope) ?? [];
      inflight.set(scope, list);
      const mark = { value };
      list.push(mark);
      const entry = upgraded.get(key);
      if (entry && held(key) === value) entry.gesture = null;
      return work.finally(() => {
        list.splice(list.indexOf(mark), 1);
        settle(key, scope);
      });
    },
    shown,
    raw,
    setRaw(key: string, next: boolean) {
      const entry = upgraded.get(key);
      const before = raw(key);
      stored.fields![key] = next ? 'css' : 'controls';
      save(stored);
      if (entry) applyRaw(entry, before);
      options.changed?.();
    },
    defaultRaw,
    setDefaultRaw(next: boolean) {
      const before = new Map(Array.from(upgraded.keys(), key => [key, raw(key)]));
      stored.default = next ? 'css' : 'controls';
      save(stored);
      upgraded.forEach((entry, key) => applyRaw(entry, before.get(key)!));
      options.changed?.();
    },
    own: () => Object.keys(stored.fields!).length,
    clearRaw() {
      const before = new Map(Array.from(upgraded.keys(), key => [key, raw(key)]));
      stored.fields = {};
      save(stored);
      upgraded.forEach((entry, key) => applyRaw(entry, before.get(key)!));
      options.changed?.();
    }
  };
  return kit;
}
