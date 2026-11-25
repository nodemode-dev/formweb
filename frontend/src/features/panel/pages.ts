import type { Page, Site } from '../../types';
import type { Command } from '../sections';

const trim = (slug: string): string => slug.replace(/^\/+|\/+$/g, '');

export function slugWord(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';
}

function freeSlug(site: Site, base: string, keep = ''): string {
  const taken = new Set(site.pages.filter(page => page.id !== keep).map(page => trim(page.slug)));
  if (!taken.has(base)) return '/' + base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `/${base}-${n}`;
}

export function copyOfPage(site: Site, page: Page): { name: string; slug: string } {
  const base = `${trim(page.slug) || slugWord(page.name)}-copy`;
  const slug = freeSlug(site, base);
  const suffix = slug.slice(base.length + 1);
  return { name: `${page.name} copy${suffix ? ' ' + suffix.slice(1) : ''}`, slug };
}

export function isHome(site: Site, id: string): boolean {
  return site.pages[0]?.id === id;
}

export function pageMoveCommands(site: Site, ids: readonly string[], anchor: string | null): Command[] {
  const order = site.pages.map(page => page.id);
  const moving = order.filter(id => ids.includes(id));
  if (anchor && moving.includes(anchor)) return [];
  const list: Command[] = [];
  for (const id of moving) {
    const from = order.indexOf(id);
    order.splice(from, 1);
    const index = anchor ? order.indexOf(anchor) : order.length;
    order.splice(index, 0, id);
    if (index !== from) list.push({ command: 'page.move', params: { id, index } });
  }
  return list;
}

export function stepPageCommands(site: Site, id: string, step: -1 | 1): Command[] {
  const at = site.pages.findIndex(page => page.id === id);
  if (at < 0) return [];
  const anchor = step < 0 ? site.pages[at - 1]?.id : site.pages[at + 2]?.id ?? null;
  if (anchor === undefined || (step > 0 && at === site.pages.length - 1)) return [];
  return pageMoveCommands(site, [id], anchor);
}

export function homeCommands(site: Site, id: string): Command[] {
  const page = site.pages.find(entry => entry.id === id);
  if (!page) return [];
  const list = site.pages[0].id === id ? [] : pageMoveCommands(site, [id], site.pages[0].id);
  if (trim(page.slug)) {
    const root = site.pages.find(entry => !trim(entry.slug));
    if (root) list.push({ command: 'page.update', params: { id: root.id, patch: { slug: freeSlug(site, slugWord(root.name), root.id) } } });
    list.push({ command: 'page.update', params: { id, patch: { slug: '/' } } });
  }
  return list;
}
