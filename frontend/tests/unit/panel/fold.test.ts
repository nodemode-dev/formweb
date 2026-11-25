import { beforeEach, describe, expect, it } from 'vitest';
import { LayerFolds, sectionToggle } from '../../../src/features/panel/fold';
import { makeSite } from '../site';

const site = makeSite([
  { id: 'home', name: 'Home', slug: '/', root: 'root' },
  { id: 'other', name: 'Other', slug: '/other', root: 'root2' }
], {
  root: { tag: 'main', children: ['hero', 'list', 'foot'] },
  hero: { tag: 'section', children: ['title', 'card'] },
  title: { tag: 'h1' },
  card: { tag: 'div', children: ['deep'] },
  deep: { tag: 'p' },
  list: { tag: 'ul', children: ['item'] },
  item: { tag: 'li' },
  foot: { tag: 'footer' },
  root2: { tag: 'main', children: ['box'] },
  box: { tag: 'div', children: ['inner'] },
  inner: { tag: 'p' }
});

const shown = (folds: LayerFolds, selected = 'root', page = 'home', root = 'root'): string[] => folds.rows(site, page, root, selected).rows.map(row => row.node.id);

beforeEach(() => localStorage.clear());

describe('folding layers', () => {
  it('with nothing folded every layer has a row at its depth', () => {
    const { rows, total } = new LayerFolds().rows(site, 'home', 'root', 'root');
    expect(rows.map(row => [row.node.id, row.depth])).toEqual([['root', 0], ['hero', 1], ['title', 2], ['card', 2], ['deep', 3], ['list', 1], ['item', 2], ['foot', 1]]);
    expect(total).toBe(8);
  });

  it('a folded layer keeps its own row and hides every row below it', () => {
    const folds = new LayerFolds();
    folds.set('home', 'hero', true);
    expect(shown(folds)).toEqual(['root', 'hero', 'list', 'item', 'foot']);
    expect(folds.rows(site, 'home', 'root', 'root').rows.find(row => row.node.id === 'hero')?.folded).toBe(true);
  });

  it('unfolding a layer shows its rows again', () => {
    const folds = new LayerFolds();
    folds.set('home', 'hero', true);
    folds.set('home', 'hero', false);
    expect(shown(folds)).toContain('deep');
  });

  it('a layer without children is never shown as folded', () => {
    const folds = new LayerFolds();
    folds.set('home', 'foot', true);
    const foot = folds.rows(site, 'home', 'root', 'root').rows.find(row => row.node.id === 'foot')!;
    expect(foot.kids).toBe(false);
    expect(foot.folded).toBe(false);
  });

  it('selecting a hidden layer opens every folded layer above it', () => {
    const folds = new LayerFolds();
    folds.set('home', 'hero', true);
    folds.set('home', 'card', true);
    expect(shown(folds, 'deep')).toContain('deep');
    expect(folds.isFolded('home', 'hero')).toBe(false);
    expect(folds.isFolded('home', 'card')).toBe(false);
  });

  it('selecting a hidden layer leaves unrelated folds alone', () => {
    const folds = new LayerFolds();
    folds.set('home', 'hero', true);
    folds.set('home', 'list', true);
    shown(folds, 'deep');
    expect(folds.isFolded('home', 'list')).toBe(true);
  });

  it('Collapse all leaves the page and its top-level layers in view', () => {
    const folds = new LayerFolds();
    folds.all('home', folds.rows(site, 'home', 'root', 'root').parents);
    expect(shown(folds)).toEqual(['root', 'hero', 'list', 'foot']);
  });

  it('Expand all shows every layer again', () => {
    const folds = new LayerFolds();
    folds.all('home', folds.rows(site, 'home', 'root', 'root').parents);
    folds.all('home', []);
    expect(shown(folds)).toEqual(['root', 'hero', 'title', 'card', 'deep', 'list', 'item', 'foot']);
  });

  it('folds are kept per page', () => {
    const folds = new LayerFolds();
    folds.set('home', 'hero', true);
    expect(shown(folds, 'root2', 'other', 'root2')).toEqual(['root2', 'box', 'inner']);
  });

  it('folds survive a reload of the editor', () => {
    const before = new LayerFolds();
    before.set('home', 'list', true);
    expect(shown(new LayerFolds())).toEqual(['root', 'hero', 'title', 'card', 'deep', 'list', 'foot']);
  });
});

describe('folding the PAGES heading', () => {
  function mount(): { toggle: HTMLButtonElement; list: HTMLElement } {
    document.body.replaceChildren();
    const eyebrow = document.createElement('span');
    eyebrow.textContent = 'PAGES';
    const list = document.createElement('div');
    document.body.append(eyebrow, list);
    return { toggle: sectionToggle(eyebrow, list, 'pages'), list };
  }

  it('clicking the heading hides the list and clicking again shows it', () => {
    const { toggle, list } = mount();
    expect(list.hidden).toBe(false);
    toggle.click();
    expect(list.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(list.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('a hidden list stays hidden after a reload', () => {
    mount().toggle.click();
    expect(mount().list.hidden).toBe(true);
  });
});
