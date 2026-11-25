import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Registry = typeof import('../../../src/commands/registry');

const DOCUMENTED = [
  { id: 'insert.quick', keys: ['Mod+Shift+L'] },
  { id: 'inspector.search', keys: ['Mod+Alt+F'], global: true },
  { id: 'view.preview-full', keys: ['Mod+Shift+P'] },
  { id: 'edit.delete', keys: ['Delete', 'Backspace'] }
];

async function load(platform: string): Promise<{ reg: Registry; commands: InstanceType<Registry['Commands']>; ran: string[] }> {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('navigator', { platform, userAgent: platform });
  const reg = await import('../../../src/commands/registry');
  const commands = new reg.Commands();
  const ran: string[] = [];
  commands.add(...DOCUMENTED.map(entry => ({ ...entry, label: entry.id, run: () => { ran.push(entry.id); } })));
  return { reg, commands, ran };
}

const down = (code: string, key: string, init: KeyboardEventInit = {}): KeyboardEvent => new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...init });

afterEach(() => { vi.unstubAllGlobals(); });

describe('the shortcuts on Windows and Linux', () => {
  let commands: Awaited<ReturnType<typeof load>>['commands'];
  let reg: Registry;
  beforeEach(async () => ({ commands, reg } = await load('Win32')));

  it('Ctrl+Shift+L opens Quick insert', () => {
    expect(commands.forEvent(down('KeyL', 'L', { ctrlKey: true, shiftKey: true }))?.id).toBe('insert.quick');
  });

  it('Ctrl+Alt+F searches properties', () => {
    expect(commands.forEvent(down('KeyF', 'f', { ctrlKey: true, altKey: true }))?.id).toBe('inspector.search');
  });

  it('Ctrl+Shift+P opens Preview as published', () => {
    expect(commands.forEvent(down('KeyP', 'P', { ctrlKey: true, shiftKey: true }))?.id).toBe('view.preview-full');
  });

  it('the Windows key does not stand in for Ctrl', () => {
    expect(commands.forEvent(down('KeyL', 'L', { metaKey: true, shiftKey: true }))).toBeUndefined();
  });

  it('Delete and Backspace both delete the element', () => {
    expect(commands.forEvent(down('Delete', 'Delete'))?.id).toBe('edit.delete');
    expect(commands.forEvent(down('Backspace', 'Backspace'))?.id).toBe('edit.delete');
  });

  it('the keys are written with Ctrl as in the shortcuts guide', () => {
    expect(reg.formatKeys('Mod+Shift+L')).toBe('Ctrl+Shift+L');
    expect(reg.formatKeys('Mod+Alt+F')).toBe('Ctrl+Alt+F');
    expect(reg.formatKeys('Mod+Shift+P')).toBe('Ctrl+Shift+P');
  });
});

describe('the shortcuts on a Mac', () => {
  let commands: Awaited<ReturnType<typeof load>>['commands'];
  let reg: Registry;
  beforeEach(async () => ({ commands, reg } = await load('MacIntel')));

  it('Cmd+Shift+L opens Quick insert', () => {
    expect(commands.forEvent(down('KeyL', 'l', { metaKey: true, shiftKey: true }))?.id).toBe('insert.quick');
  });

  it('Cmd+Option+F searches properties even though Option changes the typed character', () => {
    expect(commands.forEvent(down('KeyF', 'ƒ', { metaKey: true, altKey: true }))?.id).toBe('inspector.search');
  });

  it('Cmd+Shift+P opens Preview as published', () => {
    expect(commands.forEvent(down('KeyP', 'p', { metaKey: true, shiftKey: true }))?.id).toBe('view.preview-full');
  });

  it('Ctrl does not stand in for Cmd', () => {
    expect(commands.forEvent(down('KeyL', 'l', { ctrlKey: true, shiftKey: true }))).toBeUndefined();
  });

  it('Delete and Backspace both delete the element', () => {
    expect(commands.forEvent(down('Delete', 'Delete'))?.id).toBe('edit.delete');
    expect(commands.forEvent(down('Backspace', 'Backspace'))?.id).toBe('edit.delete');
  });

  it('the keys are written with the Mac symbols in Apple order', () => {
    expect(reg.formatKeys('Mod+Shift+L')).toBe('⇧⌘L');
    expect(reg.formatKeys('Mod+Alt+F')).toBe('⌥⌘F');
  });
});

describe('a shortcut that is already taken', () => {
  it('a later command cannot take a key a documented command already has', async () => {
    const { commands } = await load('Win32');
    commands.add({ id: 'other.thing', label: 'Other', keys: ['Mod+Shift+L'], run: () => undefined });
    expect(commands.forCombo('Mod+Shift+L')?.id).toBe('insert.quick');
  });
});

describe('Delete and Backspace while typing', () => {
  let ran: string[];
  let enabled = true;

  beforeAll(async () => {
    const loaded = await load('Win32');
    ran = loaded.ran;
    loaded.commands.get('edit.delete')!.enabled = () => enabled;
    const { installKeymap } = await import('../../../src/commands/keymap');
    installKeymap(loaded.commands, () => true);
  });

  beforeEach(() => {
    ran.length = 0;
    enabled = true;
    document.body.replaceChildren();
  });

  function pressIn(target: HTMLElement, code: string): KeyboardEvent {
    if (!target.isConnected) document.body.append(target);
    const event = down(code, code);
    target.dispatchEvent(event);
    return event;
  }

  it('Backspace and Delete delete the selected element when no field has focus', () => {
    const backspace = pressIn(document.createElement('div'), 'Backspace');
    pressIn(document.createElement('div'), 'Delete');
    expect(ran).toEqual(['edit.delete', 'edit.delete']);
    expect(backspace.defaultPrevented).toBe(true);
  });

  for (const [name, make] of [
    ['a text field', () => document.createElement('input')],
    ['a text area', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
    ['editable text', () => { const box = document.createElement('div'); box.setAttribute('contenteditable', 'true'); return box; }],
    ['text inside an editable block', () => { const box = document.createElement('div'); box.setAttribute('contenteditable', ''); const span = document.createElement('span'); box.append(span); document.body.append(box); return span; }]
  ] as const) {
    it(`neither key deletes an element while typing in ${name}`, () => {
      const target = make();
      const backspace = pressIn(target, 'Backspace');
      const del = pressIn(target, 'Delete');
      expect(ran).toEqual([]);
      expect(backspace.defaultPrevented).toBe(false);
      expect(del.defaultPrevented).toBe(false);
    });
  }

  it('neither key deletes when there is nothing that can be deleted', () => {
    enabled = false;
    pressIn(document.createElement('div'), 'Backspace');
    expect(ran).toEqual([]);
  });
});
