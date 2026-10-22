import type { Command, Commands } from '../commands/registry';

export const MENUS_IN_WINDOW_KEY = 'formweb.menusInWindow';

export function menusInWindow(): boolean {
  try { return localStorage.getItem(MENUS_IN_WINDOW_KEY) === '1'; } catch { return false; }
}

export function setMenusInWindow(on: boolean): void {
  try { localStorage.setItem(MENUS_IN_WINDOW_KEY, on ? '1' : '0'); } catch { void 0; }
}

export const desktopMac = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform);
export const wantsNativeMenus = (): boolean => desktopMac() && !menusInWindow();

export function accelerator(combo: string | undefined): string | null {
  if (!combo) return null;
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), 'Plus'] : combo.split('+');
  const names: Record<string, string> = { Mod: 'CmdOrCtrl', Alt: 'Alt', Shift: 'Shift', '=': '=', '-': '-', '[': '[', ']': ']', ',': ',', '.': '.', '/': '/', '`': '`', Delete: 'Delete', Backspace: 'Backspace', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: 'Space', Plus: 'Plus', Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right' };
  const out: string[] = [];
  for (const part of parts) {
    if (names[part]) out.push(names[part]);
    else if (/^[A-Za-z0-9]$/.test(part)) out.push(part.toUpperCase());
    else if (/^F([1-9]|1[0-2])$/.test(part)) out.push(part);
    else return null;
  }
  return out.join('+');
}

type Api = typeof import('@tauri-apps/api/menu');

const TEXT_EDITS: Record<string, string> = { 'edit.undo': 'undo', 'edit.redo': 'redo' };
const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image']);

export function textFieldFocused(): boolean {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return !active.readOnly && !active.disabled;
  if (active instanceof HTMLInputElement) return !NOT_TEXT.has(active.type) && !active.readOnly && !active.disabled;
  return active instanceof HTMLElement && active.isContentEditable;
}

interface Live { id: string; item: { setEnabled(on: boolean): Promise<void>; setChecked?(on: boolean): Promise<void> } }

export class NativeMenus {
  private items: Live[] = [];
  private building = false;
  private again = false;
  private stateTimer = 0;

  constructor(private readonly commands: Commands, private readonly menus: string[], private readonly appName = 'formweb', private readonly preferencesId = 'edit.settings') {
    for (const name of ['pointerup', 'keyup', 'focusin', 'focusout'] as const) window.addEventListener(name, () => { if (this.items.length) this.refresh(); }, { passive: true });
  }

  async build(): Promise<void> {
    if (this.building) { this.again = true; return; }
    this.building = true;
    try {
      const api: Api = await import('@tauri-apps/api/menu');
      const items: Live[] = [];
      const run = (id: string): void => {
        const edit = TEXT_EDITS[id];
        if (edit && textFieldFocused()) {
          void import('@tauri-apps/api/core').then(core => core.invoke('text_edit', { action: edit })).catch(() => document.execCommand(edit));
        } else this.commands.run(id);
        this.refresh();
      };
      const make = async (command: Command): Promise<unknown> => {
        const text = this.commands.label(command);
        const keys = accelerator(command.keys?.[0]);
        const options = { text, enabled: this.enabled(command.id), action: () => run(command.id) };
        let item;
        if (command.checked) {
          const checked = { ...options, checked: !!command.checked() };
          try { item = await api.CheckMenuItem.new(keys ? { ...checked, accelerator: keys } : checked); } catch { item = await api.CheckMenuItem.new(checked); }
        } else {
          try { item = await api.MenuItem.new(keys ? { ...options, accelerator: keys } : options); } catch { item = await api.MenuItem.new(options); }
        }
        items.push({ id: command.id, item });
        return item;
      };
      const byMenu = new Map<string, Command[]>();
      for (const command of this.commands.all()) if (command.menu) byMenu.set(command.menu, [...(byMenu.get(command.menu) || []), command]);
      const separator = (): Promise<unknown> => api.PredefinedMenuItem.new({ item: 'Separator' });
      const top: unknown[] = [];
      const preferences = this.commands.get(this.preferencesId);
      top.push(await api.Submenu.new({ text: this.appName, items: [
        await api.PredefinedMenuItem.new({ item: { About: { name: this.appName } }, text: `About ${this.appName}` }),
        await separator(),
        ...(preferences ? [await this.preferences(api, preferences, run)] : []),
        await separator(),
        await api.PredefinedMenuItem.new({ item: 'Hide' }),
        await api.PredefinedMenuItem.new({ item: 'Quit' }),
      ] as never[] }));
      for (const name of this.menus) {
        const list = (byMenu.get(name) || []).filter(command => command.id !== this.preferencesId);
        const made: unknown[] = [];
        let group = list[0]?.sep ?? 0;
        for (const command of list) {
          if ((command.sep ?? 0) !== group) { made.push(await separator()); group = command.sep ?? 0; }
          made.push(await make(command));
        }
        if (name === 'Edit') {
          made.push(await separator(), await api.PredefinedMenuItem.new({ item: 'Cut' }), await api.PredefinedMenuItem.new({ item: 'Copy' }), await api.PredefinedMenuItem.new({ item: 'Paste' }), await api.PredefinedMenuItem.new({ item: 'SelectAll' }));
        }
        top.push(await api.Submenu.new({ text: name, items: made as never[] }));
      }
      const menu = await api.Menu.new({ items: top as never[] });
      await menu.setAsAppMenu();
      this.items = items;
      document.documentElement.classList.add('has-native-menus');
    } finally {
      this.building = false;
      if (this.again) { this.again = false; void this.build(); }
    }
  }

  private async preferences(api: Api, command: Command, run: (id: string) => void): Promise<unknown> {
    const text = this.commands.label(command).replace(/\.\.\.$/, '') + '...';
    const options = { text, enabled: true, action: () => run(command.id) };
    try { return await api.MenuItem.new({ ...options, accelerator: 'CmdOrCtrl+,' }); } catch { return api.MenuItem.new(options); }
  }

  private enabled(id: string): boolean {
    if (TEXT_EDITS[id] && textFieldFocused()) return true;
    const command = this.commands.get(id);
    return !!command && this.commands.enabled(command);
  }

  refresh(): void {
    if (this.stateTimer) return;
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = 0;
      for (const { id, item } of this.items) {
        const command = this.commands.get(id);
        if (!command) continue;
        void item.setEnabled(this.enabled(id)).catch(() => undefined);
        if (command.checked && item.setChecked) void item.setChecked(!!command.checked()).catch(() => undefined);
      }
    }, 150);
  }
}
