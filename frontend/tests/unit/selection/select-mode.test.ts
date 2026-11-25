import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSite } from '../site';

type Selection = typeof import('../../../src/features/selection');
type SelectMode = typeof import('../../../src/features/select-mode');

const site = makeSite([
  { id: 'pa', name: 'A', slug: '/', root: 'ra' },
  { id: 'pb', name: 'B', slug: '/b', root: 'rb' },
  { id: 'pc', name: 'C', slug: '/c', root: 'rc' }
], {
  ra: { tag: 'main', children: ['a', 'b', 'c'] },
  a: { tag: 'h1' },
  b: { tag: 'p' },
  c: { tag: 'p' },
  rb: { tag: 'main' },
  rc: { tag: 'main' }
});

let sel: Selection;
let mode: SelectMode;
let primary: string;
let open: string;
let statuses: string[];
let renames: number;
let layersHead: HTMLElement;
let pagesHead: HTMLElement;
let layers: HTMLElement;
let pagesList: HTMLElement;
let run: () => void;

const click = (init: MouseEventInit = {}): MouseEvent => new MouseEvent('click', init);
const toggle = (head: HTMLElement): HTMLButtonElement => head.querySelector<HTMLButtonElement>('.fw-pick-toggle')!;
const bar = (head: HTMLElement): HTMLElement => head.querySelector<HTMLElement>('.fw-pick-bar')!;
const count = (head: HTMLElement): string => head.querySelector('.fw-pick-count')!.textContent ?? '';
const escape = (init: KeyboardEventInit = {}): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init }));

function heading(title: string): HTMLElement {
  const head = document.createElement('div');
  head.className = 'panel-head';
  const name = document.createElement('span');
  name.textContent = title;
  const add = document.createElement('button');
  add.textContent = '+';
  head.append(name, add);
  return head;
}

function list(keys: string[]): HTMLElement {
  const out = document.createElement('div');
  for (const key of keys) {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.dataset.key = key;
    out.append(row);
  }
  out.addEventListener('dblclick', () => { renames += 1; });
  return out;
}

beforeEach(async () => {
  vi.resetModules();
  sel = await import('../../../src/features/selection');
  mode = await import('../../../src/features/select-mode');
  primary = 'a';
  open = 'pa';
  statuses = [];
  renames = 0;
  document.body.replaceChildren();
  layersHead = heading('Layers');
  pagesHead = heading('Pages');
  layers = list(['ra', 'a', 'b', 'c']);
  pagesList = list(['pa', 'pb', 'pc']);
  const frame = document.createElement('iframe');
  document.body.append(pagesHead, pagesList, layersHead, layers);
  sel.installSelection({
    ready: () => true,
    site: () => site,
    primary: () => primary,
    select: id => { primary = id; },
    pageId: () => open,
    openPage: id => { open = id; },
    pageRoot: () => site.pages.find(page => page.id === open)!.root,
    refresh: () => undefined,
    layersList: layers,
    pagesList
  });
  const defs = mode.installSelectMode({
    heads: [{ head: pagesHead, kind: 'pages' }, { head: layersHead, kind: 'layers' }],
    lists: [layers, pagesList],
    frame,
    loaded: Promise.resolve(),
    ready: () => true,
    status: message => { statuses.push(message); }
  });
  const command = defs.find(def => def.id === 'edit.select-mode')!;
  run = () => { command.run(); };
  for (const head of [layersHead, pagesHead]) toggle(head).addEventListener('click', run);
});

afterEach(() => { if (sel.picking()) run(); });

describe('Select several', () => {
  it('is off at first: no count, no Done, the buttons are not pressed', () => {
    for (const head of [layersHead, pagesHead]) {
      expect(bar(head).hidden).toBe(true);
      expect(toggle(head).getAttribute('aria-pressed')).toBe('false');
    }
    expect(sel.picking()).toBe(false);
  });

  it('turning it on presses both heading buttons and shows the count and Done in each heading', () => {
    run();
    for (const head of [layersHead, pagesHead]) {
      expect(bar(head).hidden).toBe(false);
      expect(toggle(head).getAttribute('aria-pressed')).toBe('true');
      expect(bar(head).textContent).toContain('Done');
    }
    expect(count(layersHead)).toBe('1 selected');
    expect(statuses.at(-1)).toMatch(/^Select several is on/);
  });

  it('while it is on a plain click on a layer adds it and a second click takes it out', () => {
    run();
    sel.layerClick(click(), 'b');
    sel.layerClick(click(), 'c');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'b', 'c']));
    mode.paintSelectMode();
    expect(count(layersHead)).toBe('3 selected');
    sel.layerClick(click(), 'b');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'c']));
    mode.paintSelectMode();
    expect(count(layersHead)).toBe('2 selected');
  });

  it('while it is on a plain click on a canvas element adds it', () => {
    run();
    sel.canvasClick(click(), 'c');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'c']));
  });

  it('while it is on a plain click on a page adds it and the pages heading counts the pages', () => {
    run();
    sel.pageClick(click(), 'pc');
    expect(sel.selectedPageIds()).toEqual(['pa', 'pc']);
    mode.paintSelectMode();
    expect(count(pagesHead)).toBe('2 selected');
  });

  it('the last selected item is never taken out by a click', () => {
    run();
    sel.layerClick(click(), 'a');
    expect(sel.selectedIds()).toEqual(['a']);
  });

  it('when it is off a plain click selects only that layer', () => {
    sel.layerClick(click(), 'b');
    sel.layerClick(click(), 'c');
    expect(sel.selectedIds()).toEqual(['c']);
  });

  it('Escape turns it off and keeps the selection', () => {
    run();
    sel.layerClick(click(), 'b');
    escape();
    expect(sel.picking()).toBe(false);
    expect(bar(layersHead).hidden).toBe(true);
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'b']));
    expect(statuses.at(-1)).toBe('Select several is off.');
  });

  it('Escape with a modifier key leaves it on', () => {
    run();
    escape({ shiftKey: true });
    expect(sel.picking()).toBe(true);
  });

  it('Done turns it off, keeps the selection and gives focus back to the heading button', () => {
    run();
    sel.layerClick(click(), 'c');
    bar(layersHead).querySelector<HTMLButtonElement>('.fw-pick-done')!.click();
    expect(sel.picking()).toBe(false);
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'c']));
    expect(document.activeElement).toBe(toggle(layersHead));
  });

  it('the heading button turns it off again', () => {
    toggle(pagesHead).click();
    expect(sel.picking()).toBe(true);
    toggle(pagesHead).click();
    expect(sel.picking()).toBe(false);
  });

  it('a double click on a row does not reach the rename while it is on, and does when it is off', () => {
    run();
    layers.children[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    pagesList.children[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(renames).toBe(0);
    escape();
    layers.children[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(renames).toBe(1);
  });

  it('the heading keeps its own title and add button in the same order when it turns on', () => {
    const before = Array.from(layersHead.children).filter(node => !node.classList.contains('fw-pick-bar') && !node.classList.contains('fw-pick-toggle'));
    run();
    const after = Array.from(layersHead.children).filter(node => !node.classList.contains('fw-pick-bar') && !node.classList.contains('fw-pick-toggle'));
    expect(after).toEqual(before);
    expect(layersHead.lastElementChild?.textContent).toBe('+');
  });
});
