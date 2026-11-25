import { describe, expect, it } from 'vitest';
import { canContain, canDrag, dropTarget, moveCommands, zoneAt, type DropZone } from '../../../src/features/panel/drop';
import { applyCommands, childrenOf, makeSite } from '../site';

const site = makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], {
  root: { tag: 'main', children: ['hero', 'about', 'foot'] },
  hero: { tag: 'section', children: ['h1', 'lead', 'cta'] },
  h1: { tag: 'h1' },
  lead: { tag: 'p' },
  cta: { tag: 'a' },
  about: { tag: 'section', children: ['h2', 'card', 'photo'] },
  h2: { tag: 'h2' },
  card: { tag: 'div', children: ['note'] },
  note: { tag: 'p' },
  photo: { tag: 'img' },
  foot: { tag: 'footer', children: ['badge'] },
  badge: { tag: 'div', componentSourceId: 'cmp-badge', children: ['badgeLink'] },
  badgeLink: { tag: 'a' }
});

function drop(ids: string[], over: string, zone: DropZone, open = false) {
  const target = dropTarget(site, 'root', ids, over, zone, open);
  if (!target) return null;
  return applyCommands(site, moveCommands(site, ids, target));
}

describe('where a dragged layer lands by pointer height', () => {
  it('the upper third of a container row means before, the middle third into and the lower third after', () => {
    expect([0.05, 0.3].map(f => zoneAt(f, true))).toEqual(['before', 'before']);
    expect([0.4, 0.5, 0.6].map(f => zoneAt(f, true))).toEqual(['into', 'into', 'into']);
    expect([0.7, 0.95].map(f => zoneAt(f, true))).toEqual(['after', 'after']);
  });

  it('a row that is not a container never offers into', () => {
    expect([0.1, 0.4, 0.5, 0.6, 0.9].map(f => zoneAt(f, false))).not.toContain('into');
    expect(zoneAt(0.1, false)).toBe('before');
    expect(zoneAt(0.9, false)).toBe('after');
  });
});

describe('drops that are refused', () => {
  it('the page root cannot be dragged', () => {
    expect(canDrag(site, ['root'])).toBe(false);
    expect(dropTarget(site, 'root', ['root'], 'foot', 'into')).toBeNull();
  });

  it('a layer cannot be dropped onto itself', () => {
    expect(dropTarget(site, 'root', ['hero'], 'hero', 'into')).toBeNull();
    expect(dropTarget(site, 'root', ['hero'], 'hero', 'before')).toBeNull();
  });

  it('a layer cannot be dropped inside one of its own descendants', () => {
    expect(dropTarget(site, 'root', ['about'], 'card', 'into')).toBeNull();
    expect(dropTarget(site, 'root', ['about'], 'note', 'before')).toBeNull();
  });

  it('a layer cannot be dropped into an element that is not a container', () => {
    expect(canContain(site, 'h1')).toBe(false);
    expect(canContain(site, 'photo')).toBe(false);
    expect(dropTarget(site, 'root', ['lead'], 'h2', 'into')).toBeNull();
  });

  it('the structure of a linked component instance cannot change', () => {
    expect(canContain(site, 'badge')).toBe(false);
    expect(dropTarget(site, 'root', ['lead'], 'badge', 'into')).toBeNull();
    expect(dropTarget(site, 'root', ['lead'], 'badgeLink', 'before')).toBeNull();
    expect(canDrag(site, ['badgeLink'])).toBe(false);
  });

  it('a whole linked instance can still be placed beside other layers', () => {
    const moved = drop(['badge'], 'h2', 'before');
    expect(moved && childrenOf(moved, 'about')).toEqual(['badge', 'h2', 'card', 'photo']);
  });
});

describe('where one layer lands', () => {
  it('before a row puts it directly above that row', () => {
    const moved = drop(['cta'], 'h1', 'before')!;
    expect(childrenOf(moved, 'hero')).toEqual(['cta', 'h1', 'lead']);
  });

  it('after a row puts it directly below that row', () => {
    const moved = drop(['h1'], 'cta', 'after')!;
    expect(childrenOf(moved, 'hero')).toEqual(['lead', 'cta', 'h1']);
  });

  it('into a container puts it last inside', () => {
    const moved = drop(['photo'], 'hero', 'into')!;
    expect(childrenOf(moved, 'hero')).toEqual(['h1', 'lead', 'cta', 'photo']);
    expect(childrenOf(moved, 'about')).toEqual(['h2', 'card']);
  });

  it('the lower part of an unfolded container puts it first inside', () => {
    const moved = drop(['h2'], 'card', 'after', true)!;
    expect(childrenOf(moved, 'card')).toEqual(['h2', 'note']);
  });

  it('into a container from a different section moves it across sections', () => {
    const moved = drop(['lead'], 'card', 'into')!;
    expect(childrenOf(moved, 'card')).toEqual(['note', 'lead']);
    expect(childrenOf(moved, 'hero')).toEqual(['h1', 'cta']);
  });

  it('dropping on the page root row puts the layer last on the page', () => {
    const moved = drop(['h1'], 'root', 'before')!;
    expect(childrenOf(moved, 'root')).toEqual(['hero', 'about', 'foot', 'h1']);
  });

  it('dropping a layer where it already is changes nothing', () => {
    const moved = drop(['lead'], 'cta', 'before')!;
    expect(moved).toEqual(site);
  });
});

describe('where several layers land', () => {
  it('several layers keep their page order whatever order they were picked in', () => {
    const moved = drop(['h2', 'lead'], 'foot', 'before')!;
    expect(childrenOf(moved, 'root')).toEqual(['hero', 'about', 'lead', 'h2', 'foot']);
    expect(childrenOf(moved, 'hero')).toEqual(['h1', 'cta']);
    expect(childrenOf(moved, 'about')).toEqual(['card', 'photo']);
  });

  it('two siblings dragged below a later sibling stay together and in order', () => {
    const moved = drop(['h1', 'lead'], 'cta', 'after')!;
    expect(childrenOf(moved, 'hero')).toEqual(['cta', 'h1', 'lead']);
  });

  it('two siblings dragged above an earlier sibling stay together and in order', () => {
    const moved = drop(['photo', 'card'], 'h2', 'before')!;
    expect(childrenOf(moved, 'about')).toEqual(['card', 'photo', 'h2']);
  });

  it('several layers dropped into a container go last inside in page order', () => {
    const moved = drop(['note', 'h1', 'photo'], 'foot', 'into')!;
    expect(childrenOf(moved, 'foot')).toEqual(['badge', 'h1', 'note', 'photo']);
  });

  it('a section picked together with a layer inside it moves only the section', () => {
    const moved = drop(['note', 'about'], 'hero', 'before')!;
    expect(childrenOf(moved, 'root')).toEqual(['about', 'hero', 'foot']);
    expect(childrenOf(moved, 'about')).toEqual(['h2', 'card', 'photo']);
    expect(childrenOf(moved, 'card')).toEqual(['note']);
  });

  it('a set that holds a layer inside a linked instance cannot be dragged', () => {
    expect(canDrag(site, ['lead', 'badgeLink'])).toBe(false);
    expect(dropTarget(site, 'root', ['lead', 'badgeLink'], 'h2', 'before')).toBeNull();
  });

  it('a set cannot be dropped inside one of its own members', () => {
    expect(dropTarget(site, 'root', ['lead', 'about'], 'card', 'into')).toBeNull();
  });
});
