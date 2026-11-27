import { label, labelAttr } from '../../../i18n';
import { element, keyed } from '../../../ui/dom';
import { createColorArea, type Area } from './color-area';
import { gradientColors, parseColor, varName, type Rgba } from './color-math';
import type { ColorArea, ColorAreaOptions, PickerApi, PickerTab } from './picker-api';
import type { ColorToken, ControlHost, StyleField } from './types';

export interface PickerTarget {
  readonly key: string;
  readonly label: string;
  readonly anchor: HTMLElement;
  readonly field?: StyleField;
  value(): string;
  inherited(): string;
  show(value: string): void;
  restore(): void;
  commit(value: string): Promise<void>;
  closed?(): void;
}

interface Mounted { tab: PickerTab; panel: HTMLElement; areas: Area[]; handle: { open(value: string): boolean; close(): void } }

const MARGIN = 8;
const GAP = 6;
const SOLID = 'solid';
const GROUPS: { id: ColorToken['group']; title: string }[] = [
  { id: 'site', title: 'Site colors' },
  { id: 'brand', title: 'Brand' },
  { id: 'team', title: 'Team library' }
];
const tabs: PickerTab[] = [];
let picker: Picker | null = null;
let probe: CanvasRenderingContext2D | null = null;

export function registerPickerTab(tab: PickerTab): void {
  if (tab.id === SOLID || tabs.some(item => item.id === tab.id)) throw new Error(`picker tab already registered: ${tab.id}`);
  tabs.push(tab);
  picker?.mountTab(tab);
}

export function browserColor(value: string): Rgba | null {
  const text = value.trim();
  if (!text || /var\(|currentcolor|inherit|initial|unset|revert/i.test(text) || !CSS.supports('color', text)) return null;
  const exact = parseColor(text);
  if (exact) return exact;
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return null;
  probe.fillStyle = '#000000';
  probe.fillStyle = text;
  const read = parseColor(String(probe.fillStyle));
  if (read) return read;
  probe.clearRect(0, 0, 1, 1);
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

export function tokenFor(tokens: ColorToken[], value: string): ColorToken | undefined {
  const name = varName(value);
  return name ? tokens.find(token => varName(token.css) === name) : undefined;
}

let memo: { state: unknown; tokens: ColorToken[] } | null = null;
export function colorTokens(host: ControlHost): ColorToken[] {
  const state = host.state();
  if (memo && memo.state === state && state) return memo.tokens;
  const tokens = host.colors();
  memo = { state, tokens };
  const known = new Set(tokens.map(token => varName(token.css)));
  for (const [name, value] of Object.entries(state?.site.tokens || {})) {
    const bare = name.replace(/^--/, '');
    const css = `var(--${bare})`;
    if (!known.has(`--${bare}`) && /var\(|calc\(/i.test(String(value)) && siteColor(host, css)) tokens.push({ name: bare, value: String(value), css, group: 'site' });
  }
  return tokens;
}

export function resolveColor(tokens: ColorToken[], value: string, depth = 0): Rgba | null {
  const token = tokenFor(tokens, value);
  if (token) return depth < 4 ? resolveColor(tokens, token.value, depth + 1) : null;
  return parseColor(value) || browserColor(value);
}

const SENTINELS = ['rgba(1, 2, 3, 0.5)', 'rgba(4, 5, 6, 0.5)'];
let sheet: { state: unknown; root: HTMLElement; probe: HTMLElement; names: Set<string>; cache: Map<string, Rgba | null> } | null = null;

function siteSheet(host: ControlHost): NonNullable<typeof sheet> | null {
  const state = host.state();
  if (!state) return null;
  if (!sheet) {
    const root = element('div', 'fw-cp-site');
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    const probe = element('span');
    root.append(probe);
    host.overlay.append(root);
    sheet = { state: null, root, probe, names: new Set(), cache: new Map() };
  }
  if (sheet.state !== state) {
    const tokens = Object.entries(state.site.tokens || {}).map(([name, value]) => [`--${name.replace(/^--/, '')}`, String(value)] as const);
    const next = new Set<string>(tokens.map(([name]) => name));
    for (const name of sheet.names) if (!next.has(name)) sheet.root.style.removeProperty(name);
    for (const [name, value] of tokens) if (sheet.root.style.getPropertyValue(name) !== value) sheet.root.style.setProperty(name, value);
    sheet.names = next;
    sheet.state = state;
    sheet.cache.clear();
  }
  return sheet;
}

export function siteColor(host: ControlHost, value: string): Rgba | null {
  const text = value.trim();
  const names = Array.from(text.matchAll(/var\(\s*(--[a-z0-9_-]+)/gi), match => match[1]);
  const site = names.length ? siteSheet(host) : null;
  if (!site || names.some(name => !site.names.has(name))) return null;
  if (site.cache.has(text)) return site.cache.get(text)!;
  let found: Rgba | null = null;
  site.probe.style.color = '';
  site.probe.style.color = text;
  if (site.probe.style.color) {
    const seen = SENTINELS.map(sentinel => {
      site.root.style.color = sentinel;
      return getComputedStyle(site.probe).color;
    });
    site.root.style.color = '';
    if (seen[0] === seen[1]) found = parseColor(seen[0]) || browserColor(seen[0]);
  }
  site.cache.set(text, found);
  return found;
}

export function resolveFor(host: ControlHost, value: string): Rgba | null {
  return resolveColor(colorTokens(host), value) || (/var\(/i.test(value) ? siteColor(host, value) : null);
}

export function colorPicker(host: ControlHost): Picker {
  picker ??= new Picker(host);
  return picker;
}

export class Picker {
  private readonly root = element('div', 'fw-cp');
  private readonly strip = element('div', 'fw-cp-tabs');
  private readonly solid = element('div', 'fw-cp-panel');
  private readonly note = element('p', 'fw-cp-note');
  private readonly sets = element('div', 'fw-cp-sets');
  private readonly clear = element('button', 'fw-cp-clear');
  private readonly area: Area;
  private readonly mounted: Mounted[] = [];
  private target: PickerTarget | null = null;
  private active = SOLID;
  private seen = '';
  private frame = 0;
  private quiet = false;
  private closing = false;
  private readonly resized = new ResizeObserver(() => this.place());
  private readonly watch = new MutationObserver(() => this.guard());
  private guardFrame = 0;

  private guard(): void {
    cancelAnimationFrame(this.guardFrame);
    this.guardFrame = requestAnimationFrame(() => this.keepFocus());
  }

  private keepFocus(): void {
    if (this.root.hidden || !this.target || !document.hasFocus()) return;
    const now = document.activeElement as HTMLElement | null;
    const gone = !now || now === document.body || now === document.documentElement
      || now !== this.root && this.root.contains(now) && (!now.getClientRects().length || !!now.closest('[hidden], [inert]') || (now as HTMLButtonElement).disabled === true);
    if (!gone) return;
    const tab = this.strip.hidden ? null : this.strip.querySelector<HTMLElement>('[aria-selected="true"]');
    (tab || this.root).focus({ preventScroll: true });
  }

  constructor(private readonly host: ControlHost) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.tabIndex = -1;
    this.root.dataset.ownKeys = '';
    this.strip.setAttribute('role', 'tablist');
    labelAttr(this.strip, 'aria-label', 'Color kinds');
    this.strip.hidden = true;
    this.solid.dataset.tab = SOLID;
    this.solid.setAttribute('role', 'tabpanel');
    this.solid.id = 'fw-cp-panel-solid';
    this.note.hidden = true;
    label(this.note, 'A project manager restricted colors to the brand kit: choose a brand or team color, or No color.');
    this.area = createColorArea({
      label: 'Color',
      resolve: value => this.resolve(value),
      input: value => this.show(value),
      commit: value => void this.commit(value),
      cancel: () => this.restore()
    });
    this.solid.append(this.note, this.area.element, this.sets);
    this.clear.type = 'button';
    label(this.clear, 'No color');
    this.clear.addEventListener('click', () => { void this.commit(''); this.close(true); });
    const foot = element('div', 'fw-cp-foot');
    foot.append(this.clear);
    this.root.append(this.strip, this.solid, foot);
    host.overlay.append(this.root);
    for (const tab of tabs) this.mountTab(tab);
    this.root.addEventListener('keydown', event => this.keys(event));
    this.strip.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLElement>('[role="tab"]');
      if (button?.dataset.key) this.select(button.dataset.key, true);
    });
    this.sets.addEventListener('click', event => {
      const swatch = (event.target as Element).closest<HTMLElement>('.fw-cp-swatch');
      if (swatch?.dataset.css) this.choose(swatch.dataset.css);
    });
    this.sets.addEventListener('keydown', event => this.roam(event));
  }

  mountTab(tab: PickerTab): void {
    const panel = element('div', 'fw-cp-panel');
    panel.dataset.tab = tab.id;
    panel.id = `fw-cp-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    this.root.insertBefore(panel, this.root.lastElementChild);
    const areas: Area[] = [];
    const api: PickerApi = {
      field: () => {
        const field = this.target?.field;
        if (!field) throw new Error('the color picker is not open on a style field');
        return this.quiet ? { ...field, show() {}, restore() {}, commit: () => Promise.resolve() } as StyleField : field;
      },
      colorArea: (options: ColorAreaOptions): ColorArea => {
        const area = createColorArea({ ...options, resolve: value => this.resolve(value) });
        areas.push(area);
        return area;
      },
      colors: () => this.host.colors(),
      resolve: value => this.resolve(value),
      show: value => this.show(value),
      commit: value => this.commit(value)
    };
    this.mounted.push({ tab, panel, areas, handle: tab.mount(panel, api) });
  }

  isOpen(target?: PickerTarget): boolean {
    return !this.root.hidden && (!target || this.target === target);
  }

  toggle(target: PickerTarget): void {
    if (this.isOpen(target)) this.close(true); else this.open(target);
  }

  open(target: PickerTarget): void {
    if (this.target && this.target !== target) this.close(false);
    this.target = target;
    labelAttr(this.root, 'aria-label', 'Color picker for {0}', [{ t: target.label }]);
    this.area.relabel(target.label);
    target.anchor.setAttribute('aria-expanded', 'true');
    const value = target.value();
    this.seen = value;
    this.paintSets(value);
    this.paintTabs();
    const claimed = this.restricted() ? undefined : this.choices().find(item => item.handle.open(value));
    this.setActive(claimed ? claimed.tab.id : SOLID);
    if (!claimed) this.area.set(this.solidStart(value));
    this.root.hidden = false;
    this.place();
    this.resized.observe(this.root);
    this.watch.observe(this.root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'disabled', 'class'] });
    document.addEventListener('pointerdown', this.outside, true);
    window.addEventListener('blur', this.blur);
    window.addEventListener('resize', this.reflow);
    document.addEventListener('scroll', this.reflow, true);
    this.root.addEventListener('focusout', this.leave);
    this.focusFirst();
  }

  close(restoreFocus = false): void {
    if (this.root.hidden || !this.target || this.closing) return;
    this.closing = true;
    for (const area of [this.area, ...this.mounted.flatMap(item => item.areas)]) if (area.dragging()) area.cancel();
    const target = this.target;
    const hadFocus = this.root.contains(document.activeElement);
    for (const item of this.mounted) if (item.tab.id === this.active) item.handle.close();
    this.closing = false;
    this.resized.disconnect();
    this.watch.disconnect();
    cancelAnimationFrame(this.guardFrame);
    this.root.hidden = true;
    this.target = null;
    cancelAnimationFrame(this.frame);
    document.removeEventListener('pointerdown', this.outside, true);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('resize', this.reflow);
    document.removeEventListener('scroll', this.reflow, true);
    this.root.removeEventListener('focusout', this.leave);
    target.anchor.setAttribute('aria-expanded', 'false');
    target.closed?.();
    if ((restoreFocus || hadFocus) && target.anchor.isConnected) target.anchor.focus({ preventScroll: true });
  }

  refresh(target: PickerTarget, value: string): void {
    if (!this.isOpen(target)) return;
    this.guard();
    this.paintSets(value);
    this.paintTabs();
    if (value === this.seen) return;
    this.seen = value;
    const current = this.mounted.find(item => item.tab.id === this.active);
    if (current && !this.restricted() && current.handle.open(value)) return;
    if (current) { current.handle.close(); this.setActive(SOLID); }
    this.area.set(this.solidStart(value));
  }

  private resolve(value: string): Rgba | null {
    return resolveFor(this.host, value);
  }

  private solidStart(value: string): string {
    const target = this.target;
    if (this.resolve(value)) return value;
    const stop = gradientColors(value).find(part => this.resolve(part));
    if (stop) return stop;
    const inherited = target?.inherited() || '';
    return this.resolve(inherited) ? inherited : '#000000';
  }

  cancel(target: PickerTarget): void {
    if (!this.isOpen(target)) return;
    this.quiet = true;
    try { this.close(false); } finally { this.quiet = false; }
  }

  private show(value: string): void {
    if (!this.target || this.quiet) return;
    this.seen = value;
    this.target.show(value);
  }

  private restore(): void {
    if (!this.target || this.quiet) return;
    this.target.restore();
    this.seen = this.target.value();
  }

  private commit(value: string): Promise<void> {
    if (!this.target || this.quiet) return Promise.resolve();
    this.seen = value;
    return this.target.commit(value).catch(() => undefined);
  }

  private choose(css: string): void {
    this.area.set(css);
    void this.commit(css);
    this.paintSets(css);
  }

  private restricted(): boolean {
    return this.host.restricted();
  }

  private choices(): Mounted[] {
    const key = this.target?.key || '';
    return this.mounted.filter(item => item.tab.accepts(key));
  }

  private paintTabs(): void {
    const restricted = this.restricted();
    this.root.dataset.restricted = String(restricted);
    if (this.note.hidden === restricted) this.note.hidden = !restricted;
    if (this.area.element.hidden !== restricted) this.area.element.hidden = restricted;
    const list = restricted ? [] : this.choices();
    const items = [{ id: SOLID, label: 'Solid' }, ...list.map(item => ({ id: item.tab.id, label: item.tab.label }))];
    if (this.strip.hidden !== items.length < 2) this.strip.hidden = items.length < 2;
    keyed(this.strip, items, item => item.id, () => {
      const button = element('button', 'fw-cp-tab');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      return button;
    }, (button, item) => {
      label(button, item.label);
      button.id = `fw-cp-tab-${item.id}`;
      button.setAttribute('aria-controls', `fw-cp-panel-${item.id}`);
    });
    if (restricted && this.active !== SOLID) this.setActive(SOLID);
  }

  private setActive(id: string): void {
    this.active = id;
    for (const button of Array.from(this.strip.children) as HTMLElement[]) {
      const on = button.dataset.key === id;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    if (this.solid.hidden !== (id !== SOLID)) this.solid.hidden = id !== SOLID;
    this.solid.setAttribute('aria-labelledby', 'fw-cp-tab-solid');
    for (const item of this.mounted) {
      if (item.panel.hidden !== (item.tab.id !== id)) item.panel.hidden = item.tab.id !== id;
      item.panel.setAttribute('aria-labelledby', `fw-cp-tab-${item.tab.id}`);
    }
  }

  private select(id: string, focus: boolean): void {
    if (id === this.active || !this.target) return;
    const value = this.target.value();
    for (const item of this.mounted) if (item.tab.id === this.active) item.handle.close();
    this.setActive(id);
    const next = this.mounted.find(item => item.tab.id === id);
    if (next) next.handle.open(value); else this.area.set(this.solidStart(value));
    this.place();
    if (focus) this.strip.querySelector<HTMLElement>(`[data-key="${id}"]`)?.focus({ preventScroll: true });
  }

  private paintSets(value: string): void {
    const tokens = colorTokens(this.host).map(token => {
      const name = varName(token.css) || '';
      const group: ColorToken['group'] = name.startsWith('--brand-') ? 'brand' : name.startsWith('--lib-') ? 'team' : token.group;
      return group === token.group ? token : { ...token, group };
    });
    const restricted = this.restricted();
    const chosen = tokenFor(tokens, value);
    const groups = GROUPS.filter(group => !restricted || group.id !== 'site')
      .map(group => ({ ...group, tokens: tokens.filter(token => token.group === group.id) }))
      .filter(group => group.tokens.length > 0 || restricted && group.id === 'brand');
    const held = this.sets.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    this.fillSets(groups, chosen);
    if (held && document.activeElement !== held && held.isConnected && !held.closest('[hidden]')) held.focus({ preventScroll: true });
  }

  private fillSets(groups: (typeof GROUPS[number] & { tokens: ColorToken[] })[], chosen: ColorToken | undefined): void {
    keyed(this.sets, groups, group => group.id, group => {
      const set = element('div', 'fw-cp-set');
      const head = element('div', 'fw-cp-set-head');
      head.id = `fw-cp-set-${group.id}`;
      const row = element('div', 'fw-cp-set-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-labelledby', head.id);
      const empty = element('div', 'fw-cp-set-empty');
      label(empty, 'No brand or team colors yet. Add them in Window > Brand kit.');
      set.append(head, row, empty);
      return set;
    }, (set, group) => {
      label(set.children[0] as HTMLElement, group.title);
      const empty = set.children[2] as HTMLElement;
      const none = group.tokens.length === 0;
      if (empty.hidden === none) empty.hidden = !none;
      keyed(set.children[1] as HTMLElement, group.tokens, token => token.css, () => {
        const swatch = element('button', 'fw-cp-swatch');
        swatch.type = 'button';
        swatch.dataset.noI18n = '';
        swatch.append(element('span', 'fw-cp-swatch-fill'));
        return swatch;
      }, (swatch, token) => {
        swatch.dataset.css = token.css;
        const name = `${token.name} (${token.value})`;
        if (swatch.getAttribute('aria-label') !== token.name) swatch.setAttribute('aria-label', token.name);
        if (swatch.title !== name) swatch.title = name;
        const color = this.resolve(token.value);
        const fill = swatch.firstChild as HTMLElement;
        const paint = color ? `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a})` : '';
        if (fill.style.backgroundColor !== paint) fill.style.backgroundColor = paint;
        swatch.setAttribute('aria-pressed', String(chosen?.css === token.css));
      });
      const swatches = Array.from(set.children[1].children) as HTMLElement[];
      const stop = swatches.find(swatch => swatch.getAttribute('aria-pressed') === 'true') || swatches[0];
      for (const swatch of swatches) if (swatch.tabIndex !== (swatch === stop ? 0 : -1)) swatch.tabIndex = swatch === stop ? 0 : -1;
    });
  }

  private roam(event: KeyboardEvent): void {
    const swatch = (event.target as Element).closest<HTMLElement>('.fw-cp-swatch');
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!swatch || !keys.includes(event.key)) return;
    const row = Array.from(swatch.parentElement!.children) as HTMLElement[];
    const at = row.indexOf(swatch);
    const across = Math.max(1, Math.round(swatch.parentElement!.clientWidth / Math.max(1, swatch.offsetWidth + 4)));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -across, ArrowDown: across, Home: -at, End: row.length - 1 - at }[event.key] ?? 0;
    const next = row[Math.max(0, Math.min(row.length - 1, at + step))];
    event.preventDefault();
    if (!next || next === swatch) return;
    swatch.tabIndex = -1;
    next.tabIndex = 0;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
  }

  private place(): void {
    const target = this.target;
    if (!target) return;
    const box = target.anchor.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const beside = box.left - GAP - width >= MARGIN;
    const below = window.innerHeight - box.bottom - GAP - MARGIN;
    const above = box.top - GAP - MARGIN;
    let top = beside ? box.top - MARGIN : below >= height || below >= above ? box.bottom + GAP : box.top - GAP - height;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
    const left = beside ? box.left - GAP - width : Math.max(MARGIN, Math.min(box.left, window.innerWidth - width - MARGIN));
    const x = `${Math.round(left)}px`;
    const y = `${Math.round(top)}px`;
    if (this.root.style.left !== x) this.root.style.left = x;
    if (this.root.style.top !== y) this.root.style.top = y;
  }

  private focusFirst(): void {
    const first = this.active === SOLID
      ? (this.restricted() ? this.sets.querySelector<HTMLElement>('.fw-cp-swatch') || this.clear : this.area.element.querySelector<HTMLElement>('[role="slider"]'))
      : this.focusables().find(node => !this.strip.contains(node));
    (first || this.root).focus({ preventScroll: true });
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]'))
      .filter(node => node !== this.root && node.tabIndex >= 0 && !(node as HTMLButtonElement).disabled && !node.closest('[hidden]'));
  }

  private keys(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      const areas = this.active === SOLID ? [this.area] : this.mounted.find(item => item.tab.id === this.active)?.areas || [];
      if (!areas.some(area => area.cancel())) this.close(true);
      return;
    }
    if (event.key === 'Tab') {
      const list = this.focusables();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at < 0 || at === list.length - 1 ? 0 : at + 1);
      event.preventDefault();
      list[next].focus({ preventScroll: true });
      return;
    }
    const tab = (event.target as Element).closest<HTMLElement>('[role="tab"]');
    if (tab && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End')) {
      const list = Array.from(this.strip.children) as HTMLElement[];
      const at = list.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
      event.preventDefault();
      if (list[next]?.dataset.key) this.select(list[next].dataset.key!, true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  }

  private readonly outside = (event: Event): void => {
    const node = event.target as Node;
    if (this.root.contains(node) || this.target?.anchor.contains(node)) return;
    this.close(false);
  };

  private readonly blur = (): void => {
    if (this.area.dropping()) return;
    this.close(false);
  };

  private readonly leave = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (!next) { this.guard(); return; }
    if (this.root.contains(next) || this.target?.anchor.contains(next)) return;
    this.close(false);
  };

  private readonly reflow = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.place());
  };
}
