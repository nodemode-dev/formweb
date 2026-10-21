import { element, keyed, text } from './dom';
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

export const BRAND_MARK = '<svg class="fw-mark" width="18" height="18" viewBox="0 0 128 128" fill="none" role="img" aria-label="formweb"><defs><linearGradient id="fwm-g" gradientUnits="userSpaceOnUse" x1="22" y1="104" x2="106" y2="26"><stop offset="0" stop-color="#3A7BFF"/><stop offset=".32" stop-color="#9A5CFF"/><stop offset=".64" stop-color="#FF4F7A"/><stop offset="1" stop-color="#FFAE2B"/></linearGradient><linearGradient id="fwm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24212B"/><stop offset="1" stop-color="#0B0A0E"/></linearGradient></defs><rect width="128" height="128" rx="29" fill="url(#fwm-bg)"/><rect x="20" y="24" width="88" height="80" rx="9" fill="#2E2A35"/><rect x="27" y="40" width="74" height="28" rx="5" fill="url(#fwm-g)"/><rect x="27" y="73" width="35" height="24" rx="5" fill="url(#fwm-g)"/><rect x="66" y="73" width="35" height="24" rx="5" fill="url(#fwm-g)"/></svg>';

interface MenuView { name: string; button: HTMLButtonElement; popup: HTMLElement; rows: { row: HTMLButtonElement; item: Command }[] }

export class Menubar {
  readonly element = element('nav', 'fw-menubar');
  private menus: MenuView[] = [];
  private open: MenuView | null = null;

  constructor(names: string[], private overlay: HTMLElement) {
    this.element.setAttribute('aria-label', 'Application menu');
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
      const view: MenuView = { name, button, popup, rows: [] };
      button.addEventListener('click', () => (this.open === view ? this.close() : this.show(view)));
      button.addEventListener('pointerenter', () => { if (this.open && this.open !== view) this.show(view); });
      popup.addEventListener('keydown', event => this.keys(event, view));
      this.menus.push(view);
      this.element.append(button);
      overlay.append(popup);
    }
    document.addEventListener('pointerdown', event => {
      const target = event.target as Node;
      if (this.open && !this.open.popup.contains(target) && !this.element.contains(target)) this.close();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.open) { const button = this.open.button; this.close(); button.focus(); } });
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
        row.title = `${commands.label(item)} · ${item.id}`;
        row.append(element('span', 'fw-menu-check'), element('span', 'fw-menu-label', commands.label(item)), element('span', 'fw-menu-keys', commands.keyLabel(item)));
        row.addEventListener('click', () => { this.close(); runCommand(item.id); });
        view.popup.append(row);
        view.rows.push({ row, item });
      }
    }
  }

  private show(view: MenuView): void {
    if (this.open && this.open !== view) this.hide(this.open);
    for (const { row, item } of view.rows) {
      row.disabled = !commands.enabled(item);
      text(row.children[1] as HTMLElement, commands.label(item));
      text(row.children[2] as HTMLElement, commands.keyLabel(item));
      const checked = !!item.checked?.();
      row.classList.toggle('is-checked', checked);
      if (item.checked) row.setAttribute('aria-checked', String(checked));
    }
    const rect = view.button.getBoundingClientRect();
    view.popup.style.left = `${Math.round(rect.left)}px`;
    view.popup.style.top = `${Math.round(rect.bottom + 4)}px`;
    view.popup.hidden = false;
    view.button.classList.add('is-open');
    view.button.setAttribute('aria-expanded', 'true');
    this.open = view;
    view.rows.find(entry => !entry.row.disabled)?.row.focus({ preventScroll: true });
  }

  private hide(view: MenuView): void {
    view.popup.hidden = true;
    view.button.classList.remove('is-open');
    view.button.setAttribute('aria-expanded', 'false');
  }

  close(): void { if (this.open) { this.hide(this.open); this.open = null; } }

  private keys(event: KeyboardEvent, view: MenuView): void {
    const rows = view.rows.map(entry => entry.row).filter(row => !row.disabled);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      rows[(at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const index = this.menus.indexOf(view);
      this.show(this.menus[(index + (event.key === 'ArrowRight' ? 1 : this.menus.length - 1)) % this.menus.length]);
    }
  }
}

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
    const words = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
    this.matches = commandList().filter(item => commands.enabled(item) && words.every(word => `${item.menu || ''} ${commands.label(item)} ${item.id}`.toLowerCase().includes(word))).slice(0, 12);
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
      text(row.children[0] as HTMLElement, item.menu ? `${item.menu} › ${commands.label(item)}` : commands.label(item));
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
