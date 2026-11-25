import { afterEach, describe, expect, it, vi } from 'vitest';

type Registry = typeof import('../../../src/commands/registry');

async function load(platform: string): Promise<Registry> {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('navigator', { platform, userAgent: platform });
  return import('../../../src/commands/registry');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('the plus key as a shortcut', () => {
  it('a lone plus stays a plus and is not read as a separator', async () => {
    const reg = await load('Win32');
    expect(reg.canon('+')).toBe('+');
  });

  it('plus with modifiers keeps the plus as its key', async () => {
    const reg = await load('Win32');
    expect(reg.canon('Mod++')).toBe('Mod++');
    expect(reg.canon('Shift+Mod++')).toBe('Shift+Mod++');
  });

  it('the plus key is written as + on Windows and Linux', async () => {
    const reg = await load('Win32');
    expect(reg.formatKeys('+')).toBe('+');
    expect(reg.formatKeys('Mod++')).toBe('Ctrl++');
  });

  it('the plus key is written as + on a Mac', async () => {
    const reg = await load('MacIntel');
    expect(reg.formatKeys('+')).toBe('+');
    expect(reg.formatKeys('Mod++')).toBe('⌘+');
  });

  it('a command bound to + is found by + and shows + as its key label', async () => {
    const reg = await load('Win32');
    const commands = new reg.Commands();
    commands.add({ id: 'vector.add-anchor', label: 'Add Anchor Point', keys: ['+'], run: () => undefined });
    commands.add({ id: 'zoom.in', label: 'Zoom in', keys: ['Mod+='], run: () => undefined });
    const add = commands.get('vector.add-anchor')!;
    expect(add.keys).toEqual(['+']);
    expect(commands.keyLabel(add)).toBe('+');
    expect(commands.forCombo('+')?.id).toBe('vector.add-anchor');
    expect(commands.forCombo('Mod+=')?.id).toBe('zoom.in');
  });
});
