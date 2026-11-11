import { element, keyed, text } from './dom';
import { icon } from './icons';
import { t, language, onLanguage } from '../i18n';
import { listCommands, runFromBridge } from '../commands/catalogue';
import { commands, type Command } from '../commands/registry';

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

interface MenuView { name: string; button: HTMLButtonElement; popup: HTMLElement; rows: { row: HTMLButtonElement; item: Command }[]; folded: boolean; row?: HTMLButtonElement }

export class Menubar {
  readonly element = element('nav', 'fw-menubar');
  private menus: MenuView[] = [];
  private open: MenuView | null = null;
  private sub: MenuView | null = null;
  private more: MenuView;
  private count = 0;

  constructor(names: string[], private overlay: HTMLElement) {
    this.element.setAttribute('aria-label', 'Application menu');
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
    moreButton.addEventListener('click', () => (this.open === more ? this.close() : this.show(more)));
    moreButton.addEventListener('pointerenter', () => { if (this.open && this.open !== more) this.show(more); });
    morePopup.addEventListener('keydown', event => this.keys(event, more));
    overlay.append(morePopup);
    for (const name of names) {
      const button = element('button', 'fw-menu-btn', name);
      button.type = 'button';
      button.dataset.menu = name;
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-expanded', 'false');
      const popup = element('div', 'fw-menu');
      popup.setAttribute('role', 'menu');
      popup.setAttribute('aria-label', name);
      popup.hidden = true;
      const view: MenuView = { name, button, popup, rows: [], folded: false };
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
      button.addEventListener('click', () => (this.open === view ? this.close() : this.show(view)));
      button.addEventListener('pointerenter', () => { if (this.open && this.open !== view) this.show(view); });
      popup.addEventListener('keydown', event => this.keys(event, view));
      this.menus.push(view);
      this.element.append(button);
      overlay.append(popup);
    }
    this.element.append(moreButton);
    document.addEventListener('pointerdown', event => {
      const target = event.target as Node;
      if (this.open && !this.open.popup.contains(target) && !this.sub?.popup.contains(target) && !this.element.contains(target)) this.close();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.open) return;
      if (this.sub) { const row = this.sub.row; this.hide(this.sub); this.sub = null; row?.focus(); return; }
      const button = this.open.button;
      this.close();
      button.focus();
    });
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
    const byMenu = new Map<string, Command[]>();
    for (const item of commandList()) if (item.menu) byMenu.set(item.menu, [...(byMenu.get(item.menu) || []), item]);
    for (const view of this.menus) {
      const items = byMenu.get(view.name) || [];
      let group = items[0]?.sep ?? 0;
      for (const item of items) {
        if ((item.sep ?? 0) !== group) { view.popup.append(element('div', 'fw-menu-sep')); group = item.sep ?? 0; }
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
    }
  }

  private show(view: MenuView): void {
    const sub = view.folded ? view : null;
    const top = sub ? this.more : view;
    if (this.open && this.open !== top) this.hide(this.open);
    if (this.sub && this.sub !== sub) this.hide(this.sub);
    this.sub = sub;
    if (this.open !== top) this.reveal(top);
    if (sub) this.reveal(sub);
    this.open = top;
    this.focusable(sub ?? top)[0]?.focus({ preventScroll: true });
  }

  private focusable(view: MenuView): HTMLButtonElement[] {
    if (view === this.more) return this.menus.filter(entry => entry.folded).map(entry => entry.row as HTMLButtonElement);
    return view.rows.map(entry => entry.row).filter(row => !row.disabled);
  }

  private place(view: MenuView, left: number, top: number, beside?: DOMRect): void {
    view.popup.style.left = `${Math.round(left)}px`;
    view.popup.style.top = `${Math.round(top)}px`;
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
      row.disabled = !commands.enabled(item);
      text(row.children[1] as HTMLElement, commands.label(item));
      text(row.children[2] as HTMLElement, commands.keyLabel(item));
      const checked = !!item.checked?.();
      row.classList.toggle('is-checked', checked);
      if (item.checked) row.setAttribute('aria-checked', String(checked));
    }
    if (view.folded && view.row) {
      const anchor = view.row.getBoundingClientRect();
      const parent = this.more.popup.getBoundingClientRect();
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
    if (this.sub) { this.hide(this.sub); this.sub = null; }
    if (this.open) { this.hide(this.open); this.open = null; }
  }

  private keys(event: KeyboardEvent, view: MenuView): void {
    const rows = this.focusable(view);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      rows[(at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
    } else if (view.folded && event.key === 'ArrowLeft') {
      event.preventDefault();
      const row = view.row;
      this.hide(view);
      this.sub = null;
      row?.focus();
    } else if (view === this.more && event.key === 'ArrowRight') {
      event.preventDefault();
      const target = this.menus.find(entry => entry.row === document.activeElement);
      if (target) this.show(target);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const ring = this.menus.filter(entry => !entry.folded);
      if (this.count) ring.push(this.more);
      const index = ring.indexOf(view.folded ? this.more : view);
      this.show(ring[(index + (event.key === 'ArrowRight' ? 1 : ring.length - 1)) % ring.length]);
    }
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
