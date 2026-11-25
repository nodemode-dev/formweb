import type { Page, Site } from '../../types';
import type { Command } from '../sections';
import { t } from '../../i18n';

const trim = (slug: string): string => slug.replace(/^\/+|\/+$/g, '');

export function slugWord(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page';
}

function freeSlug(site: Site, base: string, keep = ''): string {
  const taken = new Set(site.pages.filter(page => page.id !== keep).map(page => trim(page.slug).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return '/' + base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`.toLowerCase())) return `/${base}-${n}`;
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

const homePage = (site: Site, id: string): Page | undefined => site.pages.find(entry => !trim(entry.slug) && entry.id !== id);
const routeOf = (url: string): string | null => url && !url.startsWith('#') && !url.startsWith('?') && !url.includes(':') ? trim(url.split(/[?#]/)[0]) : null;

export function homeRefusal(site: Site, id: string, gates: readonly string[] = []): string {
  const page = site.pages.find(entry => entry.id === id);
  if (!page || !trim(page.slug)) return '';
  const old = homePage(site, id);
  const templates = Object.keys((site.extensions?.cms as { templates?: Record<string, unknown> } | undefined)?.templates || {});
  if ([page.id, old?.id].some(entry => entry && templates.includes(entry))) return t('"{0}" is a CMS template page, which makes one page per item rather than a page at its own address, so Set as home page cannot swap it with the page at /.', [(templates.includes(page.id) ? page : old!).name]);
  const localized = (site.extensions?.localization as { pageSlugs?: Record<string, Record<string, string>> } | undefined)?.pageSlugs || {};
  if ([page, old].some(entry => entry && Object.keys(localized[entry.id] || {}).length)) return t('"{0}" has its own address in another language, so changing which page is at / would leave a language without a home page. Change the slugs in Page settings and CMS > Localization instead.', [(Object.keys(localized[page.id] || {}).length ? page : old!).name]);
  const covers = (route: string): string | undefined => gates.find(gate => gate !== '/' && (route === gate || route.startsWith(gate + '/')));
  const lost = covers('/' + trim(page.slug));
  if (lost) return t('"{0}" is password protected through {1}. At / it would be open to everyone, so it was not made the home page. Remove that password first, or protect the whole site on the home page.', [page.name, lost]);
  const gained = old ? covers(freeSlug(site, slugWord(old.name), old.id)) : undefined;
  if (gained) return t('"{0}" would move to {1}, which the password on {2} covers. Remove that password first.', [old!.name, freeSlug(site, slugWord(old!.name), old!.id), gained]);
  return '';
}

export function homeCommands(site: Site, id: string): Command[] {
  const page = site.pages.find(entry => entry.id === id);
  if (!page) return [];
  const list = site.pages[0].id === id ? [] : pageMoveCommands(site, [id], site.pages[0].id);
  const from = trim(page.slug);
  if (from) {
    const root = homePage(site, id);
    if (root) list.push({ command: 'page.update', params: { id: root.id, patch: { slug: freeSlug(site, slugWord(root.name), root.id) } } });
    list.push({ command: 'page.update', params: { id, patch: { slug: '/' } } });
    const moved = (url: string | undefined): string | null => url !== undefined && routeOf(url) === from ? '/' + url.slice(url.search(/[?#]|$/)) : null;
    for (const node of Object.values(site.nodes)) {
      const own = (key: string): boolean => !node.componentSourceId || !!node.overrides?.includes(key);
      const patch: Record<string, unknown> = {};
      const href = own('attrs') ? moved(node.attrs.href) : null;
      if (href) patch.attrs = { href };
      if (own('interactions') && node.interactions?.some(entry => moved(entry.url))) patch.interactions = node.interactions.map(entry => moved(entry.url) ? { ...entry, url: moved(entry.url)! } : entry);
      if (Object.keys(patch).length) list.push({ command: 'node.update', params: { id: node.id, patch } });
    }
  }
  return list;
}
