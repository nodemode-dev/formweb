import { command, commands } from '../../api';
import { element, options, value } from '../../ui/dom';
import { runCommand, type CommandDef } from '../../ui/shell';
import type { Icon } from '../../ui/icons';
import { label, labelAttr, t } from '../../i18n';
import { readBrand } from '../brand-kit';
import type { Command, EditorState, Page, Site } from '../../types';
import '../../styles/page-background.css';

export interface PageBackgroundHost {
  section(title: string): HTMLElement;
  input(placeholder?: string): HTMLInputElement;
  button(label: string, symbol?: Icon, action?: () => unknown, className?: string): HTMLButtonElement;
  page(): Page;
  state(): EditorState | undefined;
  run(action: () => unknown): Promise<void>;
  status(message: string, error?: boolean): void;
  showPageTab(): void;
}

export interface PageBackgroundHandle {
  field: HTMLInputElement;
  fill(next: EditorState): void;
  commands: CommandDef[];
}

export function installPageBackground(host: PageBackgroundHost): PageBackgroundHandle {
  const group = host.section('Page background');
  const wrapper = element('div', 'field full fw-pagebg-field');
  const head = element('span', 'field-label');
  const name = element('span', '', 'Background');
  const field = host.input('Site background');
  field.dataset.field = 'page.background';
  field.setAttribute('list', 'fw-brand-colors');
  labelAttr(field, 'aria-label', 'Page background');
  const clear = element('button', 'fw-reset', 'Clear');
  clear.type = 'button';
  clear.dataset.cmd = 'page.background-clear';
  labelAttr(clear, 'title', 'Clear the page background and use the site background');
  clear.hidden = true;
  head.append(name, clear);
  wrapper.append(head, field);
  const note = element('p', 'micro fw-pagebg-note');
  note.setAttribute('aria-live', 'polite');
  const own = element('span');
  const inherited = element('span');
  const others = element('span');
  const overrides = element('span');
  note.append(own, inherited, others, overrides);
  const actions = element('div', 'fw-pagebg-actions');
  const applyAll = host.button('Apply to all pages', 'layers');
  applyAll.dataset.cmd = 'page.background-all';
  const themeLink = element('button', 'fw-pagebg-link', 'Edit site theme colors');
  themeLink.type = 'button';
  themeLink.dataset.cmd = 'window.theme-colors';
  actions.append(applyAll, themeLink);
  const match = element('div', 'field full fw-pagebg-match');
  const matchName = element('span', 'field-label', 'Match another page');
  const matchSelect = element('select');
  matchSelect.dataset.field = 'page.background-from';
  labelAttr(matchSelect, 'aria-label', 'Match another page');
  labelAttr(matchSelect, 'title', 'Use the background and text color of the page you pick');
  match.append(matchName, matchSelect);
  group.append(wrapper, note, match, actions);

  matchSelect.addEventListener('change', () => {
    const from = matchSelect.value;
    matchSelect.value = '';
    if (from) void host.run(() => matchPage(from));
  });
  async function matchPage(from: string): Promise<void> {
    const next = host.state();
    const source = next?.site.pages.find(entry => entry.id === from);
    const page = host.page();
    if (!next || !source || source.id === page.id) return;
    await command('node.update', { id: page.root, patch: { styles: matchPatch(next.site, source, page) } });
    host.status(t('The background and text color of "{0}" are now used on "{1}".', [source.name, page.name]));
  }

  field.addEventListener('change', () => void host.run(async () => {
    const next = host.state();
    if (!next) return;
    const page = host.page();
    const refusal = brandRefusal(next, field.value) || backgroundRefusal(next.site, field.value);
    if (refusal) { field.value = pageBackground(next.site, page)?.value || ''; throw new Error(refusal); }
    const step = setBackgroundCommand(next.site, page, field.value);
    await command(step.command, step.params);
  }));

  function show(node: HTMLElement, on: boolean): void { if (node.hidden === on) node.hidden = !on; }
  function ready(): boolean { return !!host.state(); }
  function current(): PageBackground | null { const next = host.state(); return next ? pageBackground(next.site, host.page()) : null; }

  return {
    field,
    fill(next) {
      const site = next.site;
      const page = host.page();
      const mine = pageBackground(site, page);
      value(field, mine?.value || '');
      if (mine) {
        const resolved = resolveTokens(site, mine.value);
        if (resolved !== mine.value) label(own, 'This page uses {0}, which is {1}.', [mine.value, resolved]);
        else label(own, 'This page uses {0}.', [mine.value]);
        label(inherited, 'Clear returns it to the site background: white, the browser default.');
      } else label(inherited, 'Using the site background: white, the browser default.');
      show(own, !!mine);
      const common = mine ? null : commonBackground(site, page.id);
      if (common) label(others, '{0} uses {1}.', [common.pages.length > 1 ? `${common.pages[0]} +${common.pages.length - 1}` : common.pages[0], common.value]);
      show(others, !!common);
      const bps = breakpointOverrides(site, page);
      if (bps.length) label(overrides, 'Own background at: {0}.', [bps.join(', ')]);
      show(overrides, bps.length > 0);
      show(clear, !!mine);
      const single = site.pages.length < 2;
      if (applyAll.disabled !== single) applyAll.disabled = single;
      if (matchSelect.disabled !== single) matchSelect.disabled = single;
      options(matchSelect, matchChoices(site, page.id));
      if (document.activeElement !== matchSelect && matchSelect.value) matchSelect.value = '';
    },
    commands: [
      { id: 'page.background', label: 'Page background...', menu: 'Page', group: 4, enabled: ready, run: () => {
        host.showPageTab();
        if (group.classList.contains('is-collapsed')) (group.firstElementChild as HTMLElement).click();
        group.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        field.focus({ preventScroll: true });
      } },
      { id: 'page.background-clear', label: 'Clear page background', menu: 'Page', group: 4, enabled: () => !!current(), run: async () => {
        const next = host.state()!;
        const step = setBackgroundCommand(next.site, host.page(), '');
        await command(step.command, step.params);
        host.status('Page background cleared. The page uses the site background.');
      } },
      { id: 'page.background-all', label: 'Use this page background on all pages', menu: 'Page', group: 4, enabled: () => ready() && host.state()!.site.pages.length > 1, run: async () => {
        const next = host.state()!;
        const mine = current()?.value || '';
        const refusal = backgroundRefusal(next.site, mine);
        if (refusal) { host.status(refusal, true); return; }
        const list = allPagesCommands(next.site, mine);
        if (!list.length) { host.status('Every page already has this background.'); return; }
        await commands(list);
        host.status(mine ? t('Background {0} applied to all {1} pages.', [mine, next.site.pages.length]) : t('Backgrounds cleared on all {0} pages; they use the site background.', [next.site.pages.length]));
      } },
      { id: 'page.background-from', label: 'Match another page', enabled: () => ready() && host.state()!.site.pages.length > 1, params: { from: { type: 'string', required: true, description: 'Id of the page whose background and text color the open page takes.' } }, mutates: true, description: 'Give the open page the background and text color of another page, as a copy of its values. One undo step.', run: params => matchPage(typeof params?.from === 'string' ? params.from : '') },
      { id: 'page.background-home', label: 'Use the home page background', menu: 'Page', group: 4, enabled: () => { const next = host.state(); return !!next && homePage(next.site)?.id !== host.page().id; }, mutates: true, description: 'Give the open page the background and text color of the home page, as a copy of its values. One undo step.', run: () => { const next = host.state(); const home = next && homePage(next.site); return home ? matchPage(home.id) : undefined; } },
      { id: 'window.theme-colors', label: 'Site theme colors...', enabled: ready, run: () => {
        runCommand('window.tokens');
        const target = document.querySelector<HTMLElement>('[data-field="themes.default"]');
        target?.closest<HTMLElement>('.fw-ext-block')?.scrollIntoView({ block: 'start', inline: 'nearest' });
        target?.focus({ preventScroll: true });
      } }
    ]
  };
}

export const PAGE_BACKGROUND_KEYS = ['background', 'background-color'] as const;

export interface PageBackground { key: string; value: string }

export function pageBackground(site: Site, page: Page): PageBackground | null {
  const styles = site.nodes[page.root]?.styles || {};
  for (const key of PAGE_BACKGROUND_KEYS) if (styles[key]?.trim()) return { key, value: styles[key].trim() };
  return null;
}

export function resolveTokens(site: Site, content: string): string {
  return content.replace(/var\(\s*--([a-zA-Z0-9_-]+)\s*(?:,\s*([^)]*))?\)/g, (whole, name: string, fallback?: string) => site.tokens[name] ?? site.tokens['--' + name] ?? fallback?.trim() ?? whole);
}

export function breakpointOverrides(site: Site, page: Page): string[] {
  const node = site.nodes[page.root];
  if (!node) return [];
  return site.breakpoints.filter(bp => PAGE_BACKGROUND_KEYS.some(key => node.breakpoints[bp.id]?.[key]?.trim())).map(bp => bp.name);
}

export function commonBackground(site: Site, except: string): { value: string; pages: string[] } | null {
  const seen = new Map<string, string[]>();
  for (const page of site.pages) {
    if (page.id === except) continue;
    const own = pageBackground(site, page);
    if (own) seen.set(own.value, [...(seen.get(own.value) || []), page.name]);
  }
  let best: { value: string; pages: string[] } | null = null;
  for (const [value, pages] of seen) if (!best || pages.length > best.pages.length) best = { value, pages };
  return best;
}

export function backgroundPatch(content: string): Record<string, string | null> {
  return { background: content.trim() || null, 'background-color': null };
}

export function setBackgroundCommand(site: Site, page: Page, content: string): Command {
  const styles = site.nodes[page.root]?.styles || {};
  const patch = backgroundPatch(content);
  if (!styles['background-color']) delete patch['background-color'];
  return { command: 'node.update', params: { id: page.root, patch: { styles: patch } } };
}

export function allPagesCommands(site: Site, content: string): Command[] {
  const wanted = content.trim();
  return site.pages.filter(page => {
    const styles = site.nodes[page.root]?.styles;
    return styles && ((styles.background || '').trim() !== wanted || !!styles['background-color']);
  }).map(page => setBackgroundCommand(site, page, content));
}

export function homePage(site: Site): Page | undefined {
  return site.pages.find(page => page.slug === '/') ?? site.pages[0];
}

export function matchPatch(site: Site, from: Page, target?: Page): Record<string, string | null> {
  const source = site.nodes[from.root]?.styles || {};
  const mine = target ? site.nodes[target.root]?.styles || {} : {};
  const patch: Record<string, string | null> = { background: pageBackground(site, from)?.value || null };
  if (mine['background-color']) patch['background-color'] = null;
  const color = source.color?.trim();
  if (color || mine.color) patch.color = color || null;
  return patch;
}

export function matchChoices(site: Site, except: string): { id: string; name: string }[] {
  const home = homePage(site);
  const others = site.pages.filter(page => page.id !== except);
  const ordered = home && home.id !== except ? [home, ...others.filter(page => page.id !== home.id)] : others;
  return [{ id: '', name: t('Choose a page...') }, ...ordered.map(page => ({ id: page.id, name: page.id === home?.id ? t('{0} (home page)', [page.name]) : page.name }))];
}

export function startChoices(site: Site, open: string): { id: string; name: string }[] {
  const home = homePage(site);
  const current = site.pages.find(page => page.id === open);
  const color = siteBackgroundColor(site);
  const list = [{ id: '', name: color ? t('Site background ({0})', [color]) : t('Site background (white)') }];
  if (home) list.push({ id: home.id, name: t('Same as {0} (home page)', [home.name]) });
  if (current && current.id !== home?.id) list.push({ id: current.id, name: t('Same as {0}, the page open now', [current.name]) });
  return list;
}

export function startCommands(site: Site, root: string, from: Page | undefined): Command[] {
  if (!from) return siteBackgroundKey(site) ? [{ command: 'node.update', params: { id: root, patch: { styles: { background: SITE_BACKGROUND_VALUE } } } }] : [];
  const patch = matchPatch(site, from);
  const styles = Object.fromEntries(Object.entries(patch).filter(([, entry]) => entry !== null));
  return Object.keys(styles).length ? [{ command: 'node.update', params: { id: root, patch: { styles } } }] : [];
}

export const SITE_BACKGROUND = 'page-background';
export const SITE_BACKGROUND_VALUE = `var(--${SITE_BACKGROUND})`;
const PAGE_COLOR_NAMES = ['paper', 'bg', 'background', 'page', 'ground', 'surface'];

const tokenKey = (site: Site, name: string): string | null => {
  const bare = name.replace(/^--/, '');
  return bare in site.tokens ? bare : `--${bare}` in site.tokens ? `--${bare}` : null;
};
const tokenReference = (content: string): string | null => /^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/.exec(content.trim())?.[1] ?? null;

export function siteBackgroundKey(site: Site): string | null { return tokenKey(site, SITE_BACKGROUND); }

export function siteBackgroundTarget(site: Site): string | null {
  const key = siteBackgroundKey(site);
  if (!key) return null;
  const alias = tokenReference(site.tokens[key]);
  const target = alias && alias !== SITE_BACKGROUND ? tokenKey(site, alias) : null;
  return target ?? key;
}

export function resolveColor(site: Site, content: string): string {
  let current = content;
  for (let step = 0; step < 6; step++) {
    const next = resolveTokens(site, current);
    if (next === current) break;
    current = next;
  }
  return current;
}

export function siteBackgroundColor(site: Site): string { return siteBackgroundKey(site) ? resolveColor(site, SITE_BACKGROUND_VALUE) : ''; }

export function usesSiteBackground(site: Site, page: Page): boolean { return tokenReference(pageBackground(site, page)?.value || '') === SITE_BACKGROUND; }

export function siteBackgroundPages(site: Site): Page[] { return site.pages.filter(page => usesSiteBackground(site, page)); }

export type BackgroundMode = 'site' | 'other' | 'own';

export function backgroundMode(site: Site, page: Page): Exclude<BackgroundMode, 'other'> {
  if (usesSiteBackground(site, page)) return 'site';
  return pageBackground(site, page) || siteBackgroundKey(site) ? 'own' : 'site';
}

export function pageColorToken(site: Site): string | null {
  if (siteBackgroundKey(site)) return null;
  const home = homePage(site);
  const used = home ? tokenReference(pageBackground(site, home)?.value || '') : null;
  const found = used ? tokenKey(site, used) : null;
  if (found) return found;
  for (const name of PAGE_COLOR_NAMES) { const key = tokenKey(site, name); if (key) return key; }
  return null;
}

export function useSiteBackgroundCommands(site: Site, pages: Page[], color = ''): Command[] {
  const list: Command[] = [];
  if (!siteBackgroundKey(site)) {
    if (!color.trim()) return [];
    list.push({ command: 'token.set', params: { name: SITE_BACKGROUND, value: color.trim() } });
  }
  for (const page of pages) if (!usesSiteBackground(site, page) || site.nodes[page.root]?.styles['background-color']) list.push(setBackgroundCommand(site, page, SITE_BACKGROUND_VALUE));
  return list;
}

export function siteBackgroundColorCommand(site: Site, color: string): Command {
  return { command: 'token.set', params: { name: siteBackgroundTarget(site) ?? SITE_BACKGROUND, value: color.trim() } };
}

export function backgroundRefusal(site: Site, content: string): string {
  const entered = content.trim();
  if (!entered || CSS.supports('background', resolveTokens(site, entered).replace(/var\(\s*--[\w-]+\s*(?:,[^()]*)?\)/g, 'transparent'))) return '';
  return t('"{0}" is not a background the browser can read. Use a color such as #f3efe6, a theme color such as var(--paper), or a gradient.', [entered]);
}

export function brandRefusal(next: EditorState | undefined, content: string): string {
  const entered = content.trim();
  if (!next || !entered || !readBrand(next).restricted) return '';
  if (/^var\(--(?:brand|lib)-[a-z0-9-]+\)$/.test(entered) || ['inherit', 'transparent', 'currentcolor', 'none'].includes(entered.toLowerCase())) return '';
  return 'Brand restriction is on: pick a brand or team library value from the list (var(--brand-...) or var(--lib-...)), or ask a project manager to turn it off in Window > Brand kit.';
}
