import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHoverOutline } from '../../../src/features/hover-outline';
import type { CommandDef } from '../../../src/ui/shell';

const KEY = 'formweb.canvas.hover-outline';
const ON = 'Hover outlines are on: pointing at a layer outlines its element on the canvas, and pointing at an element tints its layer.';
const OFF = 'Hover outlines are off.';

let canvas: Document;
let list: HTMLElement;
let selected: string[];
let previewing: boolean;
let said: string[];
let sent: unknown[];
let command: CommandDef;

function install(): CommandDef {
  canvas = document.implementation.createHTMLDocument('canvas');
  const root = canvas.createElement('main');
  root.dataset.fwId = 'root';
  for (const id of ['title', 'lead', 'call']) {
    const node = canvas.createElement(id === 'title' ? 'h1' : 'p');
    node.dataset.fwId = id;
    node.textContent = id;
    root.append(node);
  }
  canvas.body.append(root);
  list = document.createElement('div');
  for (const id of ['root', 'title', 'lead', 'call']) {
    const row = document.createElement('div');
    row.className = 'list-row layer-row';
    row.dataset.key = id;
    const name = document.createElement('span');
    name.className = 'row-label';
    name.textContent = id;
    row.append(name);
    list.append(row);
  }
  document.body.append(list);
  const [toggle] = installHoverOutline({
    frame: { contentDocument: canvas } as unknown as HTMLIFrameElement,
    loaded: () => Promise.resolve(),
    list,
    ready: () => true,
    editing: () => !previewing,
    busy: () => false,
    root: () => 'root',
    selectionIds: () => selected,
    status: message => { said.push(message); }
  });
  return toggle;
}

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
const loaded = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const row = (id: string): HTMLElement => list.querySelector<HTMLElement>(`[data-key="${id}"]`)!;
const node = (id: string): HTMLElement => canvas.querySelector<HTMLElement>(`[data-fw-id="${id}"]`)!;
const outlined = (): string[] => Array.from(canvas.querySelectorAll<HTMLElement>('[data-fw-hover]')).map(found => found.dataset.fwId || '');
const tinted = (): string[] => Array.from(list.querySelectorAll<HTMLElement>('[data-fw-hover]')).map(found => found.dataset.key || '');

async function point(target: Element, pointerType = 'mouse'): Promise<void> {
  target.dispatchEvent(new PointerEvent('pointermove', { pointerType, bubbles: true }));
  await frame();
}

beforeEach(async () => {
  document.body.replaceChildren();
  document.body.className = '';
  localStorage.clear();
  selected = ['lead'];
  previewing = false;
  said = [];
  sent = [];
  vi.stubGlobal('fetch', (url: unknown) => { sent.push(url); return new Promise(() => undefined); });
  command = install();
  await loaded();
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('pointing at a layer row', () => {
  it('a mouse resting on a layer row outlines that one element on the canvas', async () => {
    await point(row('title').querySelector('.row-label')!);
    expect(outlined()).toEqual(['title']);
  });

  it('moving to another row moves the outline, so only one element is ever outlined', async () => {
    await point(row('title'));
    await point(row('call'));
    expect(outlined()).toEqual(['call']);
  });

  it('leaving the list clears the outline', async () => {
    await point(row('title'));
    list.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(outlined()).toEqual([]);
  });

  it('the selected element and the page root are never outlined from their rows', async () => {
    await point(row('lead'));
    expect(outlined()).toEqual([]);
    await point(row('root'));
    expect(outlined()).toEqual([]);
  });

  it('a pen or a touch on a layer row outlines nothing', async () => {
    await point(row('title'), 'pen');
    expect(outlined()).toEqual([]);
    await point(row('title'), 'touch');
    expect(outlined()).toEqual([]);
  });
});

describe('pointing at an element on the canvas', () => {
  it('a mouse resting on an element outlines it and tints its layer row', async () => {
    await point(node('call'));
    expect(outlined()).toEqual(['call']);
    expect(tinted()).toEqual(['call']);
  });

  it('the selected element shows no hover outline and no tint', async () => {
    await point(node('lead'));
    expect(outlined()).toEqual([]);
    expect(tinted()).toEqual([]);
  });

  it('a pen on the canvas outlines nothing and clears an outline the mouse left', async () => {
    await point(node('call'));
    await point(node('call'), 'pen');
    expect(outlined()).toEqual([]);
    expect(tinted()).toEqual([]);
  });
});

describe('when nothing shows', () => {
  it('nothing shows while an element is dragged on the canvas, and it shows again once the drag ends', async () => {
    canvas.documentElement.setAttribute('data-fw-dragging', '');
    await point(node('call'));
    expect(outlined()).toEqual([]);
    canvas.documentElement.removeAttribute('data-fw-dragging');
    await point(node('call'));
    expect(outlined()).toEqual(['call']);
  });

  it('nothing shows while a layer row is dragged, and it shows again once the drag ends', async () => {
    document.body.classList.add('fw-row-dragging');
    await point(row('title'));
    expect(outlined()).toEqual([]);
    document.body.classList.remove('fw-row-dragging');
    await point(row('title'));
    expect(outlined()).toEqual(['title']);
  });

  it('nothing shows while text is being edited on the canvas, and it shows again once editing ends', async () => {
    node('title').setAttribute('contenteditable', 'true');
    await point(node('call'));
    expect(outlined()).toEqual([]);
    node('title').removeAttribute('contenteditable');
    await point(node('call'));
    expect(outlined()).toEqual(['call']);
  });

  it('nothing shows while a menu is open, and pointing again once it closes shows the outline', async () => {
    const menu = document.createElement('div');
    menu.className = 'fw-menu';
    document.body.append(menu);
    await point(row('title'));
    expect(outlined()).toEqual([]);
    menu.hidden = true;
    await point(row('title'));
    expect(outlined()).toEqual(['title']);
  });

  it('nothing shows in Preview, and it shows again back in the design view', async () => {
    previewing = true;
    await point(row('title'));
    expect(outlined()).toEqual([]);
    previewing = false;
    await point(row('title'));
    expect(outlined()).toEqual(['title']);
  });
});

describe('the Show hover outlines switch', () => {
  it('is on by default, with nothing stored', () => {
    expect(command.label).toBe('Show hover outlines');
    expect(command.checked?.()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('switching it off says so, stops the outline and is remembered by a new window', async () => {
    command.run();
    expect(said).toEqual([OFF]);
    expect(command.checked?.()).toBe(false);
    await point(row('title'));
    expect(outlined()).toEqual([]);
    document.body.replaceChildren();
    const reloaded = install();
    await loaded();
    expect(reloaded.checked?.()).toBe(false);
    await point(row('title'));
    expect(outlined()).toEqual([]);
  });

  it('switching it off with an outline showing removes the outline at once', async () => {
    await point(row('title'));
    command.run();
    expect(outlined()).toEqual([]);
  });

  it('switching it back on says so and the outline works again', async () => {
    command.run();
    command.run();
    expect(said).toEqual([OFF, ON]);
    expect(command.checked?.()).toBe(true);
    await point(row('title'));
    expect(outlined()).toEqual(['title']);
  });

  it('the choice is kept in this browser only and never sent to the site', async () => {
    command.run();
    expect(localStorage.getItem(KEY)).toBe('0');
    command.run();
    expect(localStorage.getItem(KEY)).toBe('1');
    await point(row('title'));
    expect(sent).toEqual([]);
  });
});
