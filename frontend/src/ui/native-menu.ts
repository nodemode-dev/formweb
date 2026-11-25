import type { Commands } from '../commands/registry';
import { t } from '../i18n';
import { itemsOf, type MenuDef, type MenuItem as MenuSpec } from './menus';

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
  const parts = combo === '+' ? ['Plus'] : combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), 'Plus'] : combo.split('+');
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

const TEXT_EDITS: Record<string, string> = { 'edit.undo': 'undo', 'edit.redo': 'redo', 'edit.cut': 'cut', 'edit.copy': 'copy', 'edit.paste': 'paste' };
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

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[], private readonly appName = 'formweb', private readonly preferencesId = 'edit.settings') {
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
      const separator = (): Promise<unknown> => api.PredefinedMenuItem.new({ item: 'Separator' });
      const make = async (spec: MenuSpec): Promise<unknown> => {
        if (typeof spec !== 'string') {
          const inner: unknown[] = [];
          for (const id of spec.items) inner.push(await make(id));
          return api.Submenu.new({ text: t(spec.label), items: inner.filter(Boolean) as never[] });
        }
        if (spec === '-') return separator();
        const command = this.commands.get(spec);
        if (!command) return null;
        const text = t(this.commands.label(command));
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
      const top: unknown[] = [];
      top.push(await api.Submenu.new({ text: this.appName, items: [
        await api.PredefinedMenuItem.new({ item: { About: { name: this.appName, copyright: 'Copyright 2026 NodeAgentc, Inc. Apache-2.0', license: 'Apache-2.0' } }, text: t('About {0}', [this.appName]) }),
        await separator(),
        ...(this.commands.get(this.preferencesId) ? [await make(this.preferencesId)] : []),
        await separator(),
        await api.PredefinedMenuItem.new({ item: 'Hide' }),
        await api.PredefinedMenuItem.new({ item: 'Quit' }),
      ] as never[] }));
      for (const def of this.menus()) {
        const made: unknown[] = [];
        for (const spec of itemsOf(def)) made.push(await make(spec));
        if (def.label === 'Edit') {
          made.push(await separator(), await api.PredefinedMenuItem.new({ item: 'Cut', text: t('Cut') }), await api.PredefinedMenuItem.new({ item: 'Copy', text: t('Copy') }), await api.PredefinedMenuItem.new({ item: 'Paste', text: t('Paste') }), await api.PredefinedMenuItem.new({ item: 'SelectAll', text: t('Select All') }));
        }
        top.push(await api.Submenu.new({ text: t(def.label), items: made.filter(Boolean) as never[] }));
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
