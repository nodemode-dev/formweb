import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSite } from '../site';

type Selection = typeof import('../../../src/features/selection');

const site = makeSite([
  { id: 'pa', name: 'A', slug: '/', root: 'ra' },
  { id: 'pb', name: 'B', slug: '/b', root: 'rb' },
  { id: 'pc', name: 'C', slug: '/c', root: 'rc' },
  { id: 'pd', name: 'D', slug: '/d', root: 'rd' }
], {
  ra: { tag: 'main', children: ['a', 'b', 'c', 'd'] },
  a: { tag: 'h1' },
  b: { tag: 'p' },
  c: { tag: 'section', children: ['c1', 'c2'] },
  c1: { tag: 'h2' },
  c2: { tag: 'p' },
  d: { tag: 'footer' },
  rb: { tag: 'main', children: ['x'] },
  x: { tag: 'p' },
  rc: { tag: 'main' },
  rd: { tag: 'main' }
});

let sel: Selection;
let primary = 'a';
let open = 'pa';
let layers: HTMLElement;
let pagesList: HTMLElement;

function rows(list: HTMLElement, keys: string[]): void {
  list.replaceChildren(...keys.map(key => {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.dataset.key = key;
    row.tabIndex = 0;
    return row;
  }));
}
const row = (list: HTMLElement, key: string): HTMLElement => list.querySelector<HTMLElement>(`[data-key="${key}"]`)!;
const click = (init: MouseEventInit = {}): MouseEvent => new MouseEvent('click', init);
function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  target.focus();
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

beforeEach(async () => {
  vi.resetModules();
  sel = await import('../../../src/features/selection');
  primary = 'a';
  open = 'pa';
  document.body.replaceChildren();
  layers = document.createElement('div');
  pagesList = document.createElement('div');
  document.body.append(layers, pagesList);
  rows(layers, ['a', 'b', 'c', 'c1', 'c2', 'd']);
  rows(pagesList, ['pa', 'pb', 'pc', 'pd']);
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
});

describe('picking layers with the mouse', () => {
  it('a plain click selects that one layer only', () => {
    sel.layerClick(click(), 'b');
    sel.layerClick(click(), 'd');
    expect(sel.selectedIds()).toEqual(['d']);
    expect(primary).toBe('d');
  });

  it('Ctrl+click adds a layer and makes it the primary one', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ ctrlKey: true }), 'c');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'c']));
    expect(primary).toBe('c');
  });

  it('Cmd+click adds a layer as Ctrl+click does', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ metaKey: true }), 'd');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'd']));
  });

  it('Ctrl+click on a selected layer takes it out of the selection', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ ctrlKey: true }), 'b');
    sel.layerClick(click({ ctrlKey: true }), 'c');
    sel.layerClick(click({ ctrlKey: true }), 'b');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'c']));
  });

  it('Ctrl+click never empties the selection', () => {
    sel.layerClick(click(), 'b');
    sel.layerClick(click({ ctrlKey: true }), 'b');
    expect(sel.selectedIds()).toEqual(['b']);
  });

  it('Shift+click selects every visible row from the last clicked layer to this one', () => {
    sel.layerClick(click(), 'b');
    sel.layerClick(click({ shiftKey: true }), 'c2');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c', 'c1', 'c2']));
    expect(primary).toBe('c2');
  });

  it('Shift+click upwards selects the same range', () => {
    sel.layerClick(click(), 'd');
    sel.layerClick(click({ shiftKey: true }), 'b');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c', 'c1', 'c2', 'd']));
  });

  it('Shift+click skips the rows of a folded layer', () => {
    rows(layers, ['a', 'b', 'c', 'd']);
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ shiftKey: true }), 'd');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('a second Shift+click measures from the same starting layer', () => {
    sel.layerClick(click(), 'b');
    sel.layerClick(click({ shiftKey: true }), 'd');
    sel.layerClick(click({ shiftKey: true }), 'c');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c']));
  });
});

describe('picking elements on the canvas', () => {
  it('Shift+click and Ctrl+click on the canvas add an element or take it out', () => {
    sel.canvasClick(undefined, 'a');
    sel.canvasClick(click({ shiftKey: true }), 'd');
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'd']));
    sel.canvasClick(click({ ctrlKey: true }), 'a');
    expect(sel.selectedIds()).toEqual(['d']);
  });

  it('a plain click on the canvas selects one element', () => {
    sel.canvasClick(click({ shiftKey: true }), 'b');
    sel.canvasClick(click(), 'c');
    expect(sel.selectedIds()).toEqual(['c']);
  });
});

describe('the selection keys on a focused layer row', () => {
  it('Ctrl+A once selects the layer and its siblings, twice every layer on the page', () => {
    sel.layerClick(click(), 'c1');
    press(row(layers, 'c1'), 'a', { ctrlKey: true });
    expect(new Set(sel.selectedIds())).toEqual(new Set(['c1', 'c2']));
    press(row(layers, 'c1'), 'a', { ctrlKey: true });
    expect(new Set(sel.selectedIds())).toEqual(new Set(['a', 'b', 'c', 'c1', 'c2', 'd']));
  });

  it('Ctrl+A keeps the primary layer', () => {
    sel.layerClick(click(), 'b');
    press(row(layers, 'b'), 'a', { ctrlKey: true });
    expect(primary).toBe('b');
  });

  it('Escape goes back to the primary layer alone', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ ctrlKey: true }), 'd');
    press(row(layers, 'd'), 'Escape');
    expect(sel.selectedIds()).toEqual(['d']);
  });

  it('Shift+Down and Shift+Up extend the selection one row at a time', () => {
    sel.layerClick(click(), 'b');
    press(row(layers, 'b'), 'ArrowDown', { shiftKey: true });
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c']));
    press(row(layers, 'c'), 'ArrowDown', { shiftKey: true });
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c', 'c1']));
    press(row(layers, 'c1'), 'ArrowUp', { shiftKey: true });
    expect(new Set(sel.selectedIds())).toEqual(new Set(['b', 'c']));
  });
});

describe('what the rows show', () => {
  it('every selected row is marked selected and only the extra ones are marked as extras', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ ctrlKey: true }), 'c');
    for (const key of ['a', 'b', 'c']) sel.paintLayerRow(row(layers, key), key);
    expect(['a', 'b', 'c'].map(key => row(layers, key).getAttribute('aria-selected'))).toEqual(['true', 'false', 'true']);
    expect(['a', 'b', 'c'].map(key => row(layers, key).classList.contains('is-multi'))).toEqual([true, false, false]);
  });
});

describe('the set that actions work on', () => {
  it('a section picked together with a layer inside it acts as the section alone', () => {
    sel.layerClick(click(), 'c');
    sel.layerClick(click({ ctrlKey: true }), 'c1');
    sel.layerClick(click({ ctrlKey: true }), 'a');
    expect(sel.topMost()).toEqual(['a', 'c']);
  });

  it('the page root is never part of the set', () => {
    expect(sel.topMost(['ra', 'b'])).toEqual(['b']);
  });

  it('opening another page drops the layers picked on the first page', () => {
    sel.layerClick(click(), 'a');
    sel.layerClick(click({ ctrlKey: true }), 'b');
    open = 'pb';
    primary = 'x';
    expect(sel.selectedIds()).toEqual(['x']);
  });
});

describe('picking pages', () => {
  it('a plain click opens one page', () => {
    sel.pageClick(click(), 'pc');
    expect(open).toBe('pc');
    expect(sel.selectedPageIds()).toEqual(['pc']);
  });

  it('Ctrl+click adds a page and opens it; again takes it out', () => {
    sel.pageClick(click({ ctrlKey: true }), 'pc');
    expect(sel.selectedPageIds()).toEqual(['pa', 'pc']);
    expect(open).toBe('pc');
    sel.pageClick(click({ ctrlKey: true }), 'pa');
    expect(sel.selectedPageIds()).toEqual(['pc']);
  });

  it('Shift+click selects the range of pages in list order', () => {
    sel.pageClick(click(), 'pb');
    sel.pageClick(click({ shiftKey: true }), 'pd');
    expect(sel.selectedPageIds()).toEqual(['pb', 'pc', 'pd']);
  });

  it('Ctrl+A in the pages list selects every page and Escape goes back to the open page', () => {
    sel.pageClick(click(), 'pb');
    press(row(pagesList, 'pb'), 'a', { ctrlKey: true });
    expect(sel.selectedPageIds()).toEqual(['pa', 'pb', 'pc', 'pd']);
    press(row(pagesList, 'pb'), 'Escape');
    expect(sel.selectedPageIds()).toEqual([open]);
  });
});
