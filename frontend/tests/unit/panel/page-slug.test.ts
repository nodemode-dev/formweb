import { beforeEach, describe, expect, it } from 'vitest';
import { installPageSlug, slugOf, type PageSlug } from '../../../src/features/page-slug';
import { makeSite } from '../site';

const site = makeSite([
  { id: 'home', name: 'Home', slug: '/', root: 'r1' },
  { id: 'fares', name: 'Timetable and fares', slug: '/fares', root: 'r2' }
], { r1: { tag: 'main' }, r2: { tag: 'main' } });

let name: HTMLInputElement;
let slug: HTMLInputElement;
let pane: HTMLElement;
let page: PageSlug;

const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const note = (): HTMLElement => pane.querySelector<HTMLElement>('.fw-page-address')!;

beforeEach(() => {
  document.body.replaceChildren();
  name = document.createElement('input');
  slug = document.createElement('input');
  pane = document.createElement('div');
  pane.append(name, slug);
  document.body.append(pane);
  page = installPageSlug(name, slug, pane, () => site);
  page.reset();
});

describe('the address made from a page name', () => {
  it('is lower case with words joined by hyphens', () => {
    expect(slugOf('Timetable and Fares')).toBe('timetable-and-fares');
  });

  it('drops accents, as the manual says for Café Menu', () => {
    expect(slugOf('Café Menu')).toBe('cafe-menu');
  });

  it('drops punctuation and spaces at both ends', () => {
    expect(slugOf('  Hello, world!  ')).toBe('hello-world');
  });
});

describe('the Add page fields', () => {
  it('the slug follows the name as it is typed', () => {
    type(name, 'Classes');
    expect(slug.value).toBe('/classes');
    type(name, 'Classes for kids');
    expect(slug.value).toBe('/classes-for-kids');
    expect(page.resolve()).toBe('/classes-for-kids');
  });

  it('once the slug is edited by hand it no longer follows the name', () => {
    type(name, 'Classes');
    type(slug, '/learn');
    type(name, 'Classes for kids');
    expect(slug.value).toBe('/learn');
    expect(page.resolve()).toBe('/learn');
  });

  it('the line under the fields shows the address that will be used', () => {
    type(name, 'Classes');
    expect(note().textContent).toContain('/classes');
    expect(note().classList.contains('error')).toBe(false);
  });

  it('an address another page already uses is named in red and refused', () => {
    type(name, 'Fares');
    expect(note().classList.contains('error')).toBe(true);
    expect(note().textContent).toContain('Timetable and fares');
    expect(() => page.resolve()).toThrow(/\/fares/);
  });

  it('an address another page uses in other capital letters is the same address, named in red and refused', () => {
    type(slug, '/FARES');
    expect(note().classList.contains('error')).toBe(true);
    expect(note().textContent).toContain('Timetable and fares');
    expect(() => page.resolve()).toThrow(/\/FARES/);
  });

  it('with both fields empty the page is at /untitled-page', () => {
    expect(page.resolve()).toBe('/untitled-page');
  });

  it('an address with characters an address cannot hold is refused', () => {
    type(slug, '/a b?');
    expect(note().classList.contains('error')).toBe(true);
    expect(() => page.resolve()).toThrow();
  });
});
