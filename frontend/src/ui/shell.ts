import { element, keyed, text } from './dom';
import { icon } from './icons';
import { t, language, onLanguage } from '../i18n';
import { listCommands, runFromBridge } from '../commands/catalogue';
import { commands, isMac, type Command } from '../commands/registry';
import { itemsOf, type MenuDef, type SubMenu } from './menus';

export type CommandDef = Omit<Command, 'keys' | 'group' | 'label'> & { label: string | (() => string); keys?: string | string[]; group?: number; sep?: number };

const LEGACY_KEYS: Record<string, string> = { Ctrl: 'Mod', Cmd: 'Mod', Del: 'Delete', Esc: 'Escape' };

function bindings(keys: string | string[] | undefined): string[] {
  if (!keys) return [];
  const list = Array.isArray(keys) ? keys : [keys];
  return list.filter(Boolean).map(item => (item.includes(' ') ? item.split(' ').map(part => LEGACY_KEYS[part] ?? part).join('+') : item));
}

export function setRunner(next: (action: () => unknown) => unknown): void { commands.execute = next; }
export function registerCommands(list: CommandDef[]): void {
  commands.add(...list.map(item => {
    const { group, sep, keys, ...rest } = item;
    const own = bindings(keys);
    const passive = rest.passive ?? (rest.id.startsWith('vector.') && own.length > 0 && !own.some(combo => combo.includes('Mod')));
    return { ...rest, keys: own, passive, sep: sep ?? (typeof group === 'number' ? group : undefined) } as Command;
  }));
}
export function commandList(): Command[] { return commands.all(); }
export function runCommand(id: string, params?: Record<string, unknown>): boolean { return commands.run(id, params); }

export const BRAND_MARK = '<img class="fw-mark" src="/formweb-logo.png" width="18" height="18" alt="formweb" draggable="false">';

interface MenuView { name: string; def?: MenuDef; button: HTMLButtonElement; popup: HTMLElement; rows: { row: HTMLButtonElement; item?: Command; child?: MenuView }[]; folded: boolean; row?: HTMLButtonElement; parent?: MenuView }

const KEEPS_ALT = '.xterm, .fw-term, [data-no-keys]';
const TYPE_AHEAD_MS = 700;

export class Menubar {
  readonly element = element('nav', 'fw-menubar');
  blocked: (() => boolean) | null = null;
  private menus: MenuView[] = [];
  private open: MenuView | null = null;
  private sub: MenuView | null = null;
  private leaf: MenuView | null = null;
  private more: MenuView;
  private count = 0;
  private returnTo: HTMLElement | null = null;
  private barBack: HTMLElement | null = null;
  private typed = '';
  private typedAt = 0;
  private altLone = false;

  constructor(defs: MenuDef[], private overlay: HTMLElement) {
    this.element.setAttribute('aria-label', 'Main menu');
    const moreButton = element('button', 'fw-menu-btn fw-menu-more is-folded');
    moreButton.type = 'button';
    moreButton.dataset.more = '';
    moreButton.title = 'More menus';
    moreButton.setAttribute('aria-label', 'More menus');
    moreButton.setAttribute('aria-haspopup', 'menu');
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.append(icon('more'));
    const morePopup = element('div', 'fw-menu');
    morePopup.setAttribute('role', 'menu');
    morePopup.setAttribute('aria-label', 'More menus');
    morePopup.hidden = true;
    const more: MenuView = { name: 'More menus', button: moreButton, popup: morePopup, rows: [], folded: false };
    this.more = more;
    this.press(moreButton, more);
    moreButton.addEventListener('pointerenter', () => { if (this.open && this.open !== more) this.show(more); });
    overlay.append(morePopup);
    for (const def of defs) {
      const name = def.label;
      const button = element('button', 'fw-menu-btn', name);
      button.type = 'button';
      button.dataset.menu = name;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      const popup = element('div', 'fw-menu');
      popup.setAttribute('role', 'menu');
      popup.setAttribute('aria-label', name);
      popup.hidden = true;
      const view: MenuView = { name, def, button, popup, rows: [], folded: false };
      const row = element('button', 'fw-menu-item fw-menu-sub');
      row.type = 'button';
      row.hidden = true;
      row.dataset.menuRow = name;
      row.setAttribute('role', 'menuitem');
      row.setAttribute('aria-haspopup', 'menu');
      row.setAttribute('aria-expanded', 'false');
      const chevron = element('span', 'fw-menu-keys');
      chevron.append(icon('chevron'));
      row.append(element('span', 'fw-menu-check'), element('span', 'fw-menu-label', name), chevron);
      row.addEventListener('click', () => this.show(view));
      row.addEventListener('pointerenter', () => { if (this.sub !== view) this.show(view); });
      view.row = row;
      morePopup.append(row);
      this.press(button, view);
      button.addEventListener('pointerenter', () => { if (this.open && this.open !== view) this.show(view); });
      this.menus.push(view);
      this.element.append(button);
      overlay.append(popup);
    }
    this.element.append(moreButton);
    document.addEventListener('pointerdown', event => {
      this.altLone = false;
      const target = event.target as Node;
      if (this.open && !this.open.popup.contains(target) && !this.sub?.popup.contains(target) && !this.leaf?.popup.contains(target) && !this.element.contains(target)) this.close();
    }, true);
    window.addEventListener('blur', () => { this.altLone = false; document.documentElement.classList.remove('is-menu-mnemonics'); this.close(); });
    window.addEventListener('resize', () => this.close());
    document.addEventListener('wheel', () => { this.altLone = false; }, { capture: true, passive: true });
    document.addEventListener('keydown', event => this.key(event), true);
    document.addEventListener('keyup', event => this.altUp(event), true);
  }

  get isOpen(): boolean { return this.open !== null; }

  private press(button: HTMLButtonElement, view: MenuView): void {
    const toggle = (): void => { if (this.open === view) this.close(); else this.show(view); };
    button.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); toggle(); });
    button.addEventListener('click', event => { if (event.detail === 0) toggle(); });
  }

  fold(count: number): void {
    const next = Math.max(0, Math.min(this.menus.length, count));
    if (next === this.count) return;
    this.close();
    this.count = next;
    this.menus.forEach((view, index) => {
      view.folded = index >= this.menus.length - next;
      view.button.classList.toggle('is-folded', view.folded);
      if (view.row) view.row.hidden = !view.folded;
    });
    this.more.button.classList.toggle('is-folded', next === 0);
  }

  build(): void {
    for (const view of this.menus) {
      for (const spec of view.def ? itemsOf(view.def) : []) {
        if (typeof spec === 'string') this.item(view, spec);
        else this.nested(view, spec);
      }
    }
  }

  private item(view: MenuView, spec: string): void {
    if (spec === '-') { view.popup.append(element('div', 'fw-menu-sep')); return; }
    const item = commands.get(spec);
    if (!item) return;
    const row = element('button', 'fw-menu-item');
    row.type = 'button';
    row.setAttribute('role', 'menuitem');
    row.dataset.command = item.id;
    row.title = t('{0} · {1}', [{ t: commands.label(item) }, item.id]);
    row.append(element('span', 'fw-menu-check'), element('span', 'fw-menu-label', commands.label(item)), element('span', 'fw-menu-keys', commands.keyLabel(item)));
    row.addEventListener('click', () => { this.close(); runCommand(item.id); });
    view.popup.append(row);
    view.rows.push({ row, item });
  }

  private nested(parent: MenuView, spec: SubMenu): void {
    const row = element('button', 'fw-menu-item fw-menu-sub');
    row.type = 'button';
    row.dataset.submenu = spec.label;
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', 'false');
    const chevron = element('span', 'fw-menu-keys');
    chevron.append(icon('chevron'));
    row.append(element('span', 'fw-menu-check'), element('span', 'fw-menu-label', spec.label), chevron);
    const popup = element('div', 'fw-menu');
    popup.setAttribute('role', 'menu');
    popup.setAttribute('aria-label', spec.label);
    popup.hidden = true;
    const child: MenuView = { name: spec.label, button: row, popup, rows: [], folded: false, row, parent };
    for (const id of spec.items) this.item(child, id);
    row.addEventListener('click', () => this.nest(child));
    row.addEventListener('pointerenter', () => this.nest(child));
    if (!parent.rows.some(entry => entry.child)) {
      parent.popup.addEventListener('pointerover', event => {
        const over = (event.target as Element).closest('.fw-menu-item');
        if (over && this.leaf?.parent === parent && over !== this.leaf.row) this.unnest();
      });
    }
    parent.popup.append(row);
    parent.rows.push({ row, child });
    this.overlay.append(popup);
  }

  private nest(child: MenuView, keyboard = false): void {
    if (this.leaf !== child) {
      this.unnest();
      this.reveal(child);
      this.leaf = child;
    }
    if (keyboard) this.focusable(child)[0]?.focus({ preventScroll: true });
  }

  private unnest(): void {
    if (!this.leaf) return;
    this.hide(this.leaf);
    this.leaf = null;
  }

  private show(view: MenuView, keyboard = false): void {
    const from = document.activeElement;
    if (!this.returnTo && keyboard && from instanceof HTMLElement && !from.closest('.fw-menu')) this.returnTo = from;
    this.unnest();
    const sub = view.folded ? view : null;
    const top = sub ? this.more : view;
    if (this.open && this.open !== top) this.hide(this.open);
    if (this.sub && this.sub !== sub) this.hide(this.sub);
    this.sub = sub;
    if (this.open !== top) this.reveal(top);
    if (sub) this.reveal(sub);
    this.open = top;
    if (keyboard) this.focusable(sub ?? top)[0]?.focus({ preventScroll: true });
  }

  private ring(): MenuView[] {
    const ring = this.menus.filter(entry => !entry.folded);
    if (this.count) ring.push(this.more);
    return ring;
  }

  private byLetter(letter: string): MenuView | undefined {
    const wanted = letter.toLowerCase();
    return this.menus.find(entry => (entry.button.textContent ?? '').trim().charAt(0).toLowerCase() === wanted);
  }

  private leave(): boolean {
    const leaf = this.leaf;
    if (leaf) {
      this.unnest();
      leaf.row?.focus({ preventScroll: true });
      return true;
    }
    const sub = this.sub;
    if (!sub) return false;
    this.hide(sub);
    this.sub = null;
    sub.row?.focus();
    return true;
  }

  private focusable(view: MenuView): HTMLButtonElement[] {
    if (view === this.more) return this.menus.filter(entry => entry.folded).map(entry => entry.row as HTMLButtonElement);
    return view.rows.map(entry => entry.row).filter(row => !row.disabled);
  }

  private place(view: MenuView, left: number, top: number, beside?: DOMRect): void {
    view.popup.style.left = `${Math.round(left)}px`;
    view.popup.style.top = `${Math.round(top)}px`;
    view.popup.style.maxHeight = beside ? '' : `${Math.max(120, Math.floor(window.innerHeight - 4 - top))}px`;
    view.popup.hidden = false;
    const width = view.popup.offsetWidth;
    const height = view.popup.offsetHeight;
    let x = left;
    if (x + width > window.innerWidth - 4) x = beside ? beside.left - width - 2 : window.innerWidth - 4 - width;
    const y = Math.min(top, window.innerHeight - 4 - height);
    if (x !== left) view.popup.style.left = `${Math.max(4, Math.round(x))}px`;
    if (y !== top) view.popup.style.top = `${Math.max(4, Math.round(y))}px`;
  }

  private reveal(view: MenuView): void {
    for (const { row, item } of view.rows) {
      if (!item) continue;
      row.disabled = !commands.enabled(item);
      text(row.children[1] as HTMLElement, commands.label(item));
      text(row.children[2] as HTMLElement, commands.keyLabel(item));
      const checked = !!item.checked?.();
      row.classList.toggle('is-checked', checked);
      if (item.checked) row.setAttribute('aria-checked', String(checked));
    }
    const host = view.parent ?? (view.folded ? this.more : null);
    if (host && view.row) {
      const anchor = view.row.getBoundingClientRect();
      const parent = host.popup.getBoundingClientRect();
      this.place(view, parent.right + 2, anchor.top - 6, parent);
      view.row.classList.add('is-open');
      view.row.setAttribute('aria-expanded', 'true');
      return;
    }
    const rect = view.button.getBoundingClientRect();
    this.place(view, rect.left, rect.bottom + 4);
    view.button.classList.add('is-open');
    view.button.setAttribute('aria-expanded', 'true');
  }

  private hide(view: MenuView): void {
    view.popup.hidden = true;
    view.button.classList.remove('is-open');
    view.button.setAttribute('aria-expanded', 'false');
    view.row?.classList.remove('is-open');
    view.row?.setAttribute('aria-expanded', 'false');
  }

  close(): void {
    const inside = !!document.activeElement?.closest('.fw-menu');
    this.unnest();
    if (this.sub) { this.hide(this.sub); this.sub = null; }
    if (this.open) { this.hide(this.open); this.open = null; }
    const back = this.returnTo;
    this.returnTo = null;
    if (inside && back?.isConnected) back.focus();
  }

  private idle(): boolean {
    return document.documentElement.classList.contains('has-native-menus') || !!this.blocked?.();
  }

  private altUp(event: KeyboardEvent): void {
    if (event.key !== 'Alt') return;
    document.documentElement.classList.remove('is-menu-mnemonics');
    if (!this.altLone) return;
    this.altLone = false;
    const ring = this.ring();
    if (this.open || this.idle() || !ring.length) return;
    event.preventDefault();
    const from = document.activeElement;
    if (from instanceof HTMLElement && !ring.some(entry => entry.button === from)) this.barBack = from;
    ring[0].button.focus();
  }

  private leaveBar(): void {
    const back = this.barBack;
    this.barBack = null;
    if (back?.isConnected && back !== document.body) back.focus(); else (document.activeElement as HTMLElement | null)?.blur();
  }

  private key(event: KeyboardEvent): void {
    const stop = (): void => { event.preventDefault(); event.stopPropagation(); };
    const keepsAlt = !!(event.target as Element | null)?.closest?.(KEEPS_ALT);
    if (event.key === 'Alt') {
      if (!event.repeat && !isMac && !keepsAlt && !this.open && !this.idle() && !event.ctrlKey && !event.metaKey && !event.shiftKey) { this.altLone = true; document.documentElement.classList.add('is-menu-mnemonics'); }
      return;
    }
    this.altLone = false;
    if (!this.open) {
      if (this.idle() || event.ctrlKey || event.metaKey) return;
      const ring = this.ring();
      if (!ring.length) return;
      const at = ring.findIndex(entry => entry.button === document.activeElement);
      if (at >= 0 && !event.altKey && !event.shiftKey) {
        const focus = (index: number): void => ring[(index + ring.length) % ring.length].button.focus();
        if (event.key === 'ArrowRight') { stop(); focus(at + 1); return; }
        if (event.key === 'ArrowLeft') { stop(); focus(at - 1); return; }
        if (event.key === 'Home') { stop(); focus(0); return; }
        if (event.key === 'End') { stop(); focus(-1); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') { stop(); this.show(ring[at], true); return; }
        if (event.key === 'Escape') { stop(); this.leaveBar(); return; }
        if (event.key.length === 1 && /\S/.test(event.key)) {
          const hit = this.byLetter(event.key);
          if (hit) { stop(); this.show(hit, true); }
          return;
        }
      }
      if (event.key === 'F10' && !event.altKey && !event.shiftKey && !keepsAlt) { stop(); this.show(ring[0], true); return; }
      if (!event.altKey || event.shiftKey || isMac || keepsAlt || !/^Key[A-Z]$/.test(event.code) || commands.forEvent(event)) return;
      const hit = this.byLetter(event.code.slice(3));
      if (!hit) return;
      stop();
      this.show(hit, true);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) { if (commands.forEvent(event)) stop(); return; }
    const view = this.leaf ?? this.sub ?? this.open;
    const rows = this.focusable(view);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const child = at >= 0 ? view.rows.find(entry => entry.row === rows[at])?.child : undefined;
    const go = (index: number): void => { if (rows.length) rows[(index + rows.length) % rows.length].focus(); };
    const ring = this.ring();
    const turn = (step: number): void => { this.show(ring[(ring.indexOf(this.open as MenuView) + step + ring.length) % ring.length], true); };
    const folded = view === this.more && at >= 0 ? this.menus.find(entry => entry.row === rows[at]) : undefined;
    if (event.key === 'ArrowDown') { stop(); go(at + 1); }
    else if (event.key === 'ArrowUp') { stop(); go(at < 0 ? -1 : at - 1); }
    else if (event.key === 'Home') { stop(); go(0); }
    else if (event.key === 'End') { stop(); go(-1); }
    else if (event.key === 'ArrowRight') { stop(); if (child) this.nest(child, true); else if (folded) this.show(folded, true); else turn(1); }
    else if (event.key === 'ArrowLeft') { stop(); if (!this.leave()) turn(-1); }
    else if (event.key === 'Enter' || event.key === ' ') { stop(); if (child) this.nest(child, true); else if (folded) this.show(folded, true); else if (at >= 0) rows[at].click(); }
    else if (event.key === 'Escape') { stop(); if (!this.leave()) this.close(); }
    else if (event.key === 'Tab') { stop(); this.close(); }
    else if (event.key.length === 1 && /\S/.test(event.key) && !event.shiftKey) {
      stop();
      const now = performance.now();
      const word = now - this.typedAt < TYPE_AHEAD_MS ? this.typed + event.key.toLowerCase() : event.key.toLowerCase();
      this.typed = word;
      this.typedAt = now;
      const starts = (row: HTMLElement): boolean => (row.querySelector('.fw-menu-label')?.textContent ?? '').trim().toLowerCase().startsWith(word);
      const from = word.length === 1 ? at + 1 : Math.max(0, at);
      for (let step = 0; step < rows.length; step += 1) { const row = rows[(from + step) % rows.length]; if (starts(row)) { row.focus(); break; } }
    } else if (commands.forEvent(event)) stop();
  }
}

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

export class CommandSearch {
  readonly button = element('button', 'fw-tt-btn');
  readonly popup = element('div', 'fw-search-pop');
  private input = element('input', 'fw-search-input');
  private results = element('div', 'fw-search-results');
  private picked = 0;
  private matches: Command[] = [];

  constructor(searchIcon: HTMLElement) {
    this.button.type = 'button';
    this.button.title = 'Search commands (Ctrl/Cmd+K)';
    this.button.setAttribute('aria-label', 'Search commands');
    this.button.append(searchIcon);
    this.popup.hidden = true;
    this.popup.setAttribute('role', 'dialog');
    this.popup.setAttribute('aria-label', 'Command search');
    this.input.type = 'search';
    this.input.placeholder = 'Search commands';
    this.input.setAttribute('aria-label', 'Search commands');
    this.results.setAttribute('role', 'listbox');
    this.popup.append(this.input, this.results);
    this.button.addEventListener('click', () => (this.popup.hidden ? this.show() : this.hide()));
    this.input.addEventListener('input', () => { this.picked = 0; this.refresh(); });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.picked = (this.picked + (event.key === 'ArrowDown' ? 1 : this.matches.length - 1)) % Math.max(1, this.matches.length); this.refresh(); }
      else if (event.key === 'Enter') { event.preventDefault(); const item = this.matches[this.picked]; if (item) { this.hide(); runCommand(item.id); } }
      else if (event.key === 'Escape') { event.preventDefault(); this.hide(); this.button.focus(); }
    });
    onLanguage(() => { if (!this.popup.hidden) this.refresh(); });
    document.addEventListener('pointerdown', event => {
      const target = event.target as Node;
      if (!this.popup.hidden && !this.popup.contains(target) && !this.button.contains(target)) this.hide();
    });
  }

  show(): void {
    if (!this.popup.hidden) { this.input.focus(); return; }
    this.input.value = ''; this.picked = 0; this.refresh(); this.popup.hidden = false; this.input.focus();
  }
  hide(): void { this.popup.hidden = true; }

  private refresh(): void {
    const words = fold(this.input.value).split(/\s+/).filter(Boolean);
    const query = words.join(' ');
    const rank = language() !== 'en' && query !== '';
    const found: { item: Command; first: boolean }[] = [];
    for (const item of commandList()) {
      if (!commands.enabled(item)) continue;
      const english = commands.label(item);
      const labels = [...new Set([fold(t(english)), fold(english)])];
      const menus = item.menu ? [...new Set([fold(t(item.menu)), fold(item.menu)])] : [];
      const hay = `${menus.join(' ')} ${labels.join(' ')} ${fold(item.id)}`;
      if (!words.every(word => hay.includes(word))) continue;
      found.push({ item, first: rank && labels.some(name => name.startsWith(query)) });
    }
    this.matches = [...found.filter(entry => entry.first), ...found.filter(entry => !entry.first)].slice(0, 12).map(entry => entry.item);
    keyed(this.results, this.matches, item => item.id, item => {
      const row = element('button', 'fw-search-item');
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.append(element('span', 'fw-search-label'), element('span', 'fw-search-keys'));
      row.addEventListener('click', () => { this.hide(); runCommand(item.id); });
      return row;
    }, (row, item) => {
      row.dataset.command = item.id;
      row.title = item.id;
      const name = t(commands.label(item));
      text(row.children[0] as HTMLElement, item.menu ? `${t(item.menu)} › ${name}` : name);
      text(row.children[1] as HTMLElement, commands.keyLabel(item));
      const picked = this.matches[this.picked] === item;
      row.classList.toggle('is-picked', picked);
      row.setAttribute('aria-selected', String(picked));
    });
  }
}

export function exposeToAgents(): void {
  (window as unknown as { formweb?: unknown }).formweb = {
    commands: (filter?: string) => listCommands(filter),
    run: (id: string, params?: Record<string, unknown>) => runFromBridge(id, params, false)
  };
}
