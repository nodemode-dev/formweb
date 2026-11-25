import { beforeEach, describe, expect, it } from 'vitest';
import { closeContextMenu, menuKeyPressed, showContextMenu, type MenuEntry } from '../../../src/ui/context-menu';
import { setLanguage } from '../../../src/i18n';

let host: HTMLElement;
let opener: HTMLButtonElement;
let ran: string[];

const entry = (id: string, enabled = true): MenuEntry => ({ id, label: id[0].toUpperCase() + id.slice(1), enabled, run: () => { ran.push(id); } });
const menuEntries = (): MenuEntry[] => [entry('open'), entry('rename'), { separator: true }, entry('duplicate'), entry('home', false), { separator: true }, entry('delete')];

const items = (): HTMLButtonElement[] => Array.from(host.querySelectorAll<HTMLButtonElement>('.fw-menu-item'));
const focused = (): string => (document.activeElement as HTMLElement | null)?.dataset.command || '';
function key(name: string, init: KeyboardEventInit = {}): void {
  (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
}
const isOpen = (): boolean => !!host.querySelector('.fw-menu');

beforeEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
  ran = [];
  host = document.createElement('div');
  opener = document.createElement('button');
  opener.textContent = 'Fares';
  document.body.append(opener, host);
  opener.focus();
});

describe('opening the menu', () => {
  it('shows the given entries in order with a separator between groups', () => {
    showContextMenu(menuEntries(), { x: 40, y: 60 }, { host });
    expect(items().map(item => item.textContent)).toEqual(['Open', 'Rename', 'Duplicate', 'Home', 'Delete']);
    expect(Array.from(host.querySelector('.fw-menu')!.children).map(child => child.classList.contains('fw-menu-sep') ? '|' : (child as HTMLElement).dataset.command)).toEqual(['open', 'rename', '|', 'duplicate', 'home', '|', 'delete']);
  });

  it('a separator at the start, at the end or twice in a row is not drawn', () => {
    showContextMenu([{ separator: true }, entry('open'), { separator: true }, { separator: true }, entry('delete'), { separator: true }], { x: 0, y: 0 }, { host });
    expect(host.querySelectorAll('.fw-menu-sep').length).toBe(1);
  });

  it('an entry marked raw shows a person\'s own name as written in every language, while other entries are translated', async () => {
    await setLanguage('de');
    try {
      showContextMenu([{ id: 'layer', label: 'Section', raw: true, run: () => undefined }, { id: 'insert', label: 'Section', run: () => undefined }], { x: 0, y: 0 }, { host });
      const [layer, insert] = items().map(item => item.textContent);
      expect(layer).toBe('Section');
      expect(insert).not.toBe('Section');
    } finally {
      await setLanguage('en');
    }
  });

  it('the first entry that can run has focus', () => {
    showContextMenu([entry('cut', false), entry('copy'), entry('paste')], { x: 0, y: 0 }, { host });
    expect(focused()).toBe('copy');
  });

  it('opening a second menu closes the first', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    showContextMenu([entry('copy')], { x: 0, y: 0 }, { host });
    expect(host.querySelectorAll('.fw-menu').length).toBe(1);
    expect(items().map(item => item.dataset.command)).toEqual(['copy']);
  });
});

describe('entries that are off', () => {
  it('a disabled entry is shown greyed and cannot run when clicked', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    const home = items().find(item => item.dataset.command === 'home')!;
    expect(home.disabled).toBe(true);
    home.click();
    expect(ran).toEqual([]);
  });

  it('a disabled entry carries its reason', () => {
    showContextMenu([entry('open'), { id: 'home', label: 'Set as home page', enabled: false, title: 'This page is already the home page.', run: () => { ran.push('home'); } }], { x: 0, y: 0 }, { host });
    expect(items()[1].title).toBe('This page is already the home page.');
  });

  it('the arrow keys step over a disabled entry', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    key('ArrowDown');
    key('ArrowDown');
    expect(focused()).toBe('duplicate');
    key('ArrowDown');
    expect(focused()).toBe('delete');
  });
});

describe('the keys inside the menu', () => {
  it('Down and Up move between entries and wrap at the ends', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    key('ArrowUp');
    expect(focused()).toBe('delete');
    key('ArrowDown');
    expect(focused()).toBe('open');
  });

  it('Home and End go to the first and last entry', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    key('End');
    expect(focused()).toBe('delete');
    key('Home');
    expect(focused()).toBe('open');
  });

  it('Enter runs the focused entry and closes the menu', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    key('ArrowDown');
    key('Enter');
    expect(ran).toEqual(['rename']);
    expect(isOpen()).toBe(false);
  });

  it('Escape closes the menu without running anything and returns focus to where it was', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    expect(focused()).toBe('open');
    key('Escape');
    expect(isOpen()).toBe(false);
    expect(ran).toEqual([]);
    expect(document.activeElement).toBe(opener);
  });

  it('Escape returns focus to the element the caller names', () => {
    const row = document.createElement('div');
    row.tabIndex = 0;
    document.body.append(row);
    showContextMenu(menuEntries(), row, { host, returnFocus: row });
    key('Escape');
    expect(document.activeElement).toBe(row);
  });

  it('the Menu key and Shift+F10 open a menu, F10 alone does not', () => {
    expect(menuKeyPressed(new KeyboardEvent('keydown', { key: 'ContextMenu' }))).toBe(true);
    expect(menuKeyPressed(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true }))).toBe(true);
    expect(menuKeyPressed(new KeyboardEvent('keydown', { key: 'F10' }))).toBe(false);
  });
});

describe('closing the menu', () => {
  it('a press outside the menu closes it without running anything', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(false);
    expect(ran).toEqual([]);
  });

  it('a press inside the menu keeps it open', () => {
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host });
    items()[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(isOpen()).toBe(true);
  });

  it('clicking an entry runs it through the caller and closes the menu', () => {
    const through: unknown[] = [];
    showContextMenu(menuEntries(), { x: 0, y: 0 }, { host, run: action => { through.push(action); return action(); } });
    items().find(item => item.dataset.command === 'duplicate')!.click();
    expect(ran).toEqual(['duplicate']);
    expect(through.length).toBe(1);
    expect(isOpen()).toBe(false);
  });
});
