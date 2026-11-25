import { describe, expect, it } from 'vitest';
import { copyOfPage, homeCommands, homeRefusal, pageMoveCommands, stepPageCommands } from '../../../src/features/panel/pages';
import type { Site } from '../../../src/types';
import { applyCommands, makeSite, pageOrder } from '../site';

const fivePages = (extensions: Record<string, unknown> = {}): Site => makeSite([
  { id: 'home', name: 'Home', slug: '/', root: 'r-home' },
  { id: 'fares', name: 'Fares', slug: '/fares', root: 'r-fares' },
  { id: 'routes', name: 'Routes', slug: '/routes', root: 'r-routes' },
  { id: 'about', name: 'About', slug: '/about', root: 'r-about' },
  { id: 'contact', name: 'Contact', slug: '/contact', root: 'r-contact' }
], {
  'r-home': { tag: 'main', children: ['to-fares', 'to-times', 'to-about', 'to-home', 'outside', 'button'] },
  'to-fares': { tag: 'a', attrs: { href: '/fares' } },
  'to-times': { tag: 'a', attrs: { href: '/fares#times' } },
  'to-about': { tag: 'a', attrs: { href: '/about' } },
  'to-home': { tag: 'a', attrs: { href: '/' } },
  outside: { tag: 'a', attrs: { href: 'https://example.com/fares' } },
  button: { tag: 'button', interactions: [{ trigger: 'click', action: 'navigate', url: '/fares' }] },
  'r-fares': { tag: 'main' },
  'r-routes': { tag: 'main' },
  'r-about': { tag: 'main' },
  'r-contact': { tag: 'main' }
}, extensions);

describe('reordering pages', () => {
  it('a page dragged above another lands directly above it', () => {
    const site = fivePages();
    expect(pageOrder(applyCommands(site, pageMoveCommands(site, ['fares'], 'contact')))).toEqual(['home', 'routes', 'about', 'fares', 'contact']);
  });

  it('a page dragged below the last page lands at the end', () => {
    const site = fivePages();
    expect(pageOrder(applyCommands(site, pageMoveCommands(site, ['routes'], null)))).toEqual(['home', 'fares', 'about', 'contact', 'routes']);
  });

  it('several pages move as one block in list order, whatever order they were picked in', () => {
    const site = fivePages();
    expect(pageOrder(applyCommands(site, pageMoveCommands(site, ['contact', 'fares'], 'home')))).toEqual(['fares', 'contact', 'home', 'routes', 'about']);
  });

  it('a block dragged down past later pages stays in order', () => {
    const site = fivePages();
    expect(pageOrder(applyCommands(site, pageMoveCommands(site, ['home', 'fares'], 'contact')))).toEqual(['routes', 'about', 'home', 'fares', 'contact']);
  });

  it('dropping a block onto one of its own pages changes nothing', () => {
    const site = fivePages();
    expect(pageMoveCommands(site, ['fares', 'routes'], 'routes')).toEqual([]);
  });

  it('dropping a page where it already is sends nothing the engine would refuse', () => {
    const site = fivePages();
    expect(applyCommands(site, pageMoveCommands(site, ['fares'], 'routes'))).toEqual(site);
  });

  it('move up and move down swap a page with its neighbour', () => {
    const site = fivePages();
    expect(pageOrder(applyCommands(site, stepPageCommands(site, 'routes', -1)))).toEqual(['home', 'routes', 'fares', 'about', 'contact']);
    expect(pageOrder(applyCommands(site, stepPageCommands(site, 'routes', 1)))).toEqual(['home', 'fares', 'about', 'routes', 'contact']);
  });

  it('the first page cannot move up and the last cannot move down', () => {
    const site = fivePages();
    expect(stepPageCommands(site, 'home', -1)).toEqual([]);
    expect(stepPageCommands(site, 'contact', 1)).toEqual([]);
  });
});

describe('duplicating a page', () => {
  it('the copy of Hello is Hello copy at /hello-copy', () => {
    const site = makeSite([{ id: 'hello', name: 'Hello', slug: '/hello', root: 'r' }], { r: { tag: 'main' } });
    expect(copyOfPage(site, site.pages[0])).toEqual({ name: 'Hello copy', slug: '/hello-copy' });
  });

  it('a second copy of Hello gets /hello-copy-2 and a name of its own', () => {
    const site = makeSite([
      { id: 'hello', name: 'Hello', slug: '/hello', root: 'r' },
      { id: 'copy', name: 'Hello copy', slug: '/hello-copy', root: 'r2' }
    ], { r: { tag: 'main' }, r2: { tag: 'main' } });
    const second = copyOfPage(site, site.pages[0]);
    expect(second.slug).toBe('/hello-copy-2');
    expect(second.name).toMatch(/^Hello copy/);
    expect(second.name).not.toBe('Hello copy');
  });

  it('a third copy skips every address already taken', () => {
    const site = makeSite([
      { id: 'hello', name: 'Hello', slug: '/hello', root: 'r' },
      { id: 'c1', name: 'Hello copy', slug: '/hello-copy', root: 'r2' },
      { id: 'c2', name: 'Hello copy 2', slug: '/hello-copy-2', root: 'r3' }
    ], { r: { tag: 'main' }, r2: { tag: 'main' }, r3: { tag: 'main' } });
    expect(copyOfPage(site, site.pages[0]).slug).toBe('/hello-copy-3');
  });

  it('the copy of the home page gets an address of its own, never /', () => {
    const site = fivePages();
    const copy = copyOfPage(site, site.pages[0]);
    expect(copy.slug).not.toBe('/');
    expect(copy.slug.startsWith('/')).toBe(true);
    expect(site.pages.map(page => page.slug)).not.toContain(copy.slug);
  });
});

describe('Set as home page', () => {
  it('the page moves to the top with the address / and the old home gets an address from its name', () => {
    const site = fivePages();
    const after = applyCommands(site, homeCommands(site, 'fares'));
    expect(pageOrder(after)).toEqual(['fares', 'home', 'routes', 'about', 'contact']);
    expect(after.pages.map(page => page.slug)).toEqual(['/', '/home', '/routes', '/about', '/contact']);
  });

  it('links and click actions to the page now point at /, keeping a fragment', () => {
    const site = fivePages();
    const after = applyCommands(site, homeCommands(site, 'fares'));
    expect(after.nodes['to-fares'].attrs.href).toBe('/');
    expect(after.nodes['to-times'].attrs.href).toBe('/#times');
    expect(after.nodes.button.interactions?.[0].url).toBe('/');
  });

  it('links to other pages, links to / and outside links are left as they were', () => {
    const site = fivePages();
    const after = applyCommands(site, homeCommands(site, 'fares'));
    expect(after.nodes['to-about'].attrs.href).toBe('/about');
    expect(after.nodes['to-home'].attrs.href).toBe('/');
    expect(after.nodes.outside.attrs.href).toBe('https://example.com/fares');
  });

  it('the old home page gets a free address when its name is already taken as an address', () => {
    const site = fivePages();
    site.pages[4].slug = '/home';
    const after = applyCommands(site, homeCommands(site, 'fares'));
    const slugs = after.pages.map(page => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(after.pages.find(page => page.id === 'home')!.slug).not.toBe('/');
  });

  it('a link to the page with a query keeps its query', () => {
    const site = fivePages();
    site.nodes['to-about'].attrs.href = '/fares?day=sunday';
    const after = applyCommands(site, homeCommands(site, 'fares'));
    expect(after.nodes['to-about'].attrs.href).toBe('/?day=sunday');
  });

  it('the page that is already home changes nothing', () => {
    const site = fivePages();
    expect(applyCommands(site, homeCommands(site, 'home'))).toEqual(site);
  });

  it('an ordinary page is not refused', () => {
    expect(homeRefusal(fivePages(), 'fares')).toBe('');
  });

  it('a CMS template page is refused with the reason', () => {
    const site = fivePages({ cms: { templates: { fares: { collection: 'trips', slug: '/fares/{item.slug}' } } } });
    expect(homeRefusal(site, 'fares')).toMatch(/template/i);
  });

  it('a CMS template home page is refused too', () => {
    const site = fivePages({ cms: { templates: { home: { collection: 'trips', slug: '/{item.slug}' } } } });
    expect(homeRefusal(site, 'fares')).toMatch(/template/i);
  });

  it('a page with a translated address is refused with the reason', () => {
    const site = fivePages({ localization: { pageSlugs: { fares: { fr: '/tarifs' } } } });
    expect(homeRefusal(site, 'fares')).toMatch(/language/i);
  });

  it('a home page with a translated address is refused too', () => {
    const site = fivePages({ localization: { pageSlugs: { home: { fr: '/accueil' } } } });
    expect(homeRefusal(site, 'fares')).toMatch(/language/i);
  });

  it('a page protected by a password at its own route is refused with the reason', () => {
    expect(homeRefusal(fivePages(), 'fares', ['/fares'])).toMatch(/password/i);
  });

  it('a password on / does not block Set as home page', () => {
    expect(homeRefusal(fivePages(), 'fares', ['/'])).toBe('');
  });

  it('a password on another page does not block Set as home page', () => {
    expect(homeRefusal(fivePages(), 'fares', ['/contact'])).toBe('');
  });
});
