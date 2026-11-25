export interface CommandParam { type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'; required?: boolean; enum?: ReadonlyArray<string | number>; min?: number; max?: number; description?: string }

export interface Command {
  id: string;
  label: string | (() => string);
  keys?: string[];
  icon?: string;
  run: (params?: Record<string, unknown>) => unknown;
  enabled?: () => boolean;
  checked?: () => boolean;
  group?: string;
  menu?: string;
  submenu?: string;
  sep?: number;
  description?: string;
  when?: string;
  params?: Record<string, CommandParam>;
  mutates?: boolean;
  risky?: boolean;
  global?: boolean;
  passive?: boolean;
  repeat?: boolean;
  native?: () => boolean;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-', Backquote: '`', Backslash: '\\',
  Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Slash: '/', Backspace: 'Backspace', Delete: 'Delete', Enter: 'Enter',
  Escape: 'Escape', Space: 'Space', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
};

const MODIFIERS = new Set(['Alt', 'Shift', 'Mod']);

function partsOf(combo: string): string[] {
  if (combo === '+') return ['+'];
  return combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
}

export function canon(combo: string): string {
  const parts = partsOf(combo);
  const key = parts.filter(part => !MODIFIERS.has(part)).pop() ?? '';
  const mods = parts.filter(part => MODIFIERS.has(part));
  return (mods.includes('Alt') ? 'Alt+' : '') + (mods.includes('Shift') ? 'Shift+' : '') + (mods.includes('Mod') ? 'Mod+' : '') + (key.length === 1 ? key.toUpperCase() : key);
}

export function comboOf(event: KeyboardEvent): string {
  let key: string;
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  else if (/^Digit\d$/.test(event.code)) key = event.code.slice(5);
  else if (/^Numpad\d$/.test(event.code)) key = event.code.slice(6);
  else if (event.code in CODE_KEYS) key = CODE_KEYS[event.code];
  else key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  return (event.altKey ? 'Alt+' : '') + (event.shiftKey ? 'Shift+' : '') + (mod ? 'Mod+' : '') + key;
}

const GLYPHS: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Backspace: '⌫', Delete: '⌦', Enter: '↩', Up: '↑', Down: '↓', Left: '←', Right: '→', Escape: 'Esc' };

export function formatKeys(combo: string): string {
  const parts = partsOf(canon(combo));
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (isMac) return [...mods, key].map(part => GLYPHS[part] ?? part).join('');
  const order = ['Mod', 'Alt', 'Shift'].filter(name => mods.includes(name)).map(name => (name === 'Mod' ? 'Ctrl' : name));
  return [...order, key].join('+');
}

const STORE = 'formweb_shortcuts';

function readSaved(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

export class Commands {
  onRun: ((command: Command, label: string) => void) | null = null;
  onChange: (() => void) | null = null;
  gate: ((command: Command) => boolean) | null = null;
  execute: (action: () => unknown) => unknown = action => action();
  private readonly map = new Map<string, Command>();
  private readonly bound = new Map<string, Command>();
  private readonly defaults = new Map<string, string[]>();
  private saved: Record<string, string[]> = readSaved();

  add(...list: Command[]): void {
    for (const command of list) {
      if (this.map.has(command.id)) throw new Error(`duplicate command: ${command.id}`);
      this.map.set(command.id, command);
      const defined = (command.keys ?? []).map(canon);
      this.defaults.set(command.id, defined);
      const wanted = Array.isArray(this.saved[command.id]) ? this.saved[command.id].map(canon) : defined;
      command.keys = [];
      for (const combo of wanted) {
        if (this.bound.has(combo)) continue;
        command.keys.push(combo);
        if (!command.passive) this.bound.set(combo, command);
      }
    }
    this.onChange?.();
  }

  get(id: string): Command | undefined { return this.map.get(id); }
  all(): Command[] { return [...this.map.values()]; }
  label(command: Command): string { return typeof command.label === 'function' ? command.label() : command.label; }
  enabled(command: Command): boolean { return (!this.gate || this.gate(command)) && (!command.enabled || command.enabled()); }
  keyLabel(command: Command): string { return command.keys && command.keys.length ? formatKeys(command.keys[0]) : ''; }
  comboOf(event: KeyboardEvent): string { return comboOf(event); }
  forEvent(event: KeyboardEvent): Command | undefined { return this.bound.get(comboOf(event)); }
  forCombo(combo: string): Command | undefined { return this.bound.get(canon(combo)); }

  setKeys(id: string, keys: string[]): void {
    const command = this.map.get(id);
    if (!command) return;
    for (const combo of command.keys ?? []) if (this.bound.get(combo) === command) this.bound.delete(combo);
    const next = keys.map(canon);
    for (const combo of next) {
      const had = this.bound.get(combo);
      if (had && had !== command) had.keys = (had.keys ?? []).filter(item => item !== combo);
      if (!command.passive) this.bound.set(combo, command);
    }
    command.keys = next;
    this.persist();
    this.onChange?.();
  }

  resetKeys(id?: string): void {
    const targets = id ? [this.map.get(id)].filter((item): item is Command => !!item) : this.all();
    for (const command of targets) {
      for (const combo of command.keys ?? []) if (this.bound.get(combo) === command) this.bound.delete(combo);
    }
    for (const command of targets) {
      command.keys = [];
      for (const combo of this.defaults.get(command.id) ?? []) {
        const had = this.bound.get(combo);
        if (had && had !== command) continue;
        command.keys.push(combo);
        if (!command.passive) this.bound.set(combo, command);
      }
    }
    this.persist();
    this.onChange?.();
  }

  overrides(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [id, command] of this.map) {
      const base = this.defaults.get(id) ?? [];
      const keys = command.keys ?? [];
      if (base.length !== keys.length || base.some((item, index) => item !== keys[index])) out[id] = [...keys];
    }
    return out;
  }

  private persist(): void {
    this.saved = this.overrides();
    try { localStorage.setItem(STORE, JSON.stringify(this.saved)); } catch {}
  }

  run(id: string, params?: Record<string, unknown>): boolean {
    const command = this.map.get(id);
    if (!command || !this.enabled(command)) return false;
    const label = this.label(command);
    void this.execute(() => command.run(params));
    this.onRun?.(command, label);
    return true;
  }

  async call(id: string, params?: Record<string, unknown>): Promise<{ ran: boolean; result?: unknown }> {
    const command = this.map.get(id);
    if (!command || !this.enabled(command)) return { ran: false };
    const label = this.label(command);
    const result = await command.run(params);
    this.onRun?.(command, label);
    return { ran: true, result };
  }
}

export const commands = new Commands();
