import { command, commands } from '../../api';
import { element, options, value } from '../../ui/dom';
import { runCommand, type CommandDef } from '../../ui/shell';
import type { Icon } from '../../ui/icons';
import { label, labelAttr, t, tn } from '../../i18n';
import { readBrand } from '../brand-kit';
import { readThemes } from './context';
import { DARK_INK, LIGHT_INK, inkOn } from '../contrast';
import { hasThemes, otherTheme, otherThemeValueCommand } from './theme';
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
  offer(message: string, undo: () => Promise<unknown>): void;
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
  const modes = element('div', 'fw-pagebg-modes');
  modes.setAttribute('role', 'radiogroup');
  labelAttr(modes, 'aria-label', 'Page background');
  const radios = new Map<BackgroundMode, HTMLInputElement>();
  for (const [mode, english] of [['site', 'Site background'], ['other', 'Same as another page...'], ['own', 'This page only']] as [BackgroundMode, string][]) {
    const row = element('label', 'checkbox-field fw-pagebg-mode');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'fw-pagebg-mode';
    radio.value = mode;
    radio.dataset.field = `page.background-mode-${mode}`;
    const caption = element('span');
    label(caption, english);
    row.append(radio, caption);
    modes.append(row);
    radios.set(mode, radio);
    radio.addEventListener('change', () => { if (radio.checked) choose(mode); });
  }
  const sitePart = element('div', 'fw-pagebg-site');
  const siteColor = element('div', 'field full fw-pagebg-field');
  const siteName = element('span', 'field-label');
  label(siteName, 'Site background color');
  const siteField = host.input('#ffffff');
  siteField.dataset.field = 'page.site-background';
  siteField.setAttribute('list', 'fw-brand-colors');
  labelAttr(siteField, 'aria-label', 'Site background color');
  siteColor.append(siteName, siteField);
  const altColor = element('div', 'field full fw-pagebg-field');
  const altName = element('span', 'field-label');
  const altField = host.input();
  altField.dataset.field = 'page.site-background-theme';
  altColor.append(altName, altField);
  const adopt = element('button', 'fw-pagebg-link', 'Use the theme page color');
  adopt.type = 'button';
  adopt.dataset.cmd = 'page.background-site-theme';
  const siteNote = element('p', 'micro fw-pagebg-note');
  siteNote.setAttribute('aria-live', 'polite');
  const siteAll = host.button('Use the site background on all pages', 'layers');
  siteAll.dataset.cmd = 'page.background-site-all';
  const siteActions = element('div', 'fw-pagebg-actions');
  siteActions.append(siteAll);
  sitePart.append(siteColor, altColor, adopt, siteNote, siteActions);
  const ownPart = element('div', 'fw-pagebg-own');
  ownPart.append(wrapper, note, actions);
  const links = element('div', 'fw-pagebg-actions');
  links.append(themeLink);
  group.append(modes, sitePart, match, ownPart, links);
  let picked: { page: string; mode: BackgroundMode } | null = null;
  let filled: EditorState | undefined;

  async function apply(list: Command[]): Promise<void> {
    const before = host.state()?.site;
    if (list.length === 1) await command(list[0].command, list[0].params);
    else await commands(list);
    const changed = list.filter(step => step.command === 'node.update' && 'color' in ((step.params.patch as { styles?: Record<string, unknown> }).styles ?? {}));
    if (!before || !changed.length) return;
    const ink = (changed[0].params.patch as { styles: Record<string, string | null> }).styles.color;
    const revert = changed.map(step => ({ command: 'node.update', params: { id: step.params.id, patch: { styles: { color: before.nodes[step.params.id as string]?.styles.color ?? null } } } }));
    host.offer(ink ? t('Background set. The page text is now {0} so it stays readable on it.', [ink]) : t('Background set. The page text is dark again so it stays readable on it.'), () => commands(revert));
  }

  function choose(mode: BackgroundMode): void {
    const next = host.state();
    if (!next) return;
    const page = host.page();
    picked = { page: page.id, mode };
    if (mode === 'site' && siteBackgroundKey(next.site)) { void host.run(() => useSite(next.site.pages.filter(entry => entry.id === page.id))); return; }
    if (filled) paint(filled);
    (mode === 'site' ? siteField : mode === 'other' ? matchSelect : field).focus({ preventScroll: true });
  }
  async function useSite(pages: Page[], color = ''): Promise<void> {
    const next = host.state();
    if (!next) return;
    const taken = siteBackgroundTaken(next.site);
    if (taken) throw new Error(t('This site already uses --page-background for {0}, so it cannot be the site background. Rename that token to give the site a background.', [taken]));
    const created = !siteBackgroundKey(next.site);
    const refusal = color ? brandRefusal(next, color) || backgroundRefusal(next.site, color) : '';
    if (refusal) throw new Error(refusal);
    if (created && !color) throw new Error(t('Pick a color for the site background first.'));
    const list = useSiteBackgroundCommands(next.site, pages, color);
    picked = null;
    if (!list.length) { host.status(t('Every page already uses the site background.')); if (filled) paint(filled); return; }
    await apply(list);
    const after = host.state()?.site ?? next.site;
    const shown = siteBackgroundColor(after);
    if (pages.length > 1) host.status(t('All {0} pages use the site background, {1}.', [pages.length, shown]));
    else if (created) host.status(t('Site background {0} created. "{1}" uses it, and new pages start with it.', [shown, pages[0]?.name ?? '']));
    else host.status(t('"{0}" uses the site background, {1}.', [pages[0]?.name ?? '', shown]));
  }
  async function setSiteColor(content: string, other: boolean): Promise<void> {
    const next = host.state();
    if (!next) return;
    const entered = content.trim();
    if (!siteBackgroundKey(next.site)) { if (!other || siteBackgroundTaken(next.site)) await useSite(next.site.pages.filter(entry => entry.id === host.page().id), entered); return; }
    const refusal = brandRefusal(next, entered) || backgroundRefusal(next.site, entered);
    if (refusal) throw new Error(refusal);
    if (!other && !entered) throw new Error(t('The site background needs a color. To stop using it on this page, choose This page only.'));
    const target = siteBackgroundTarget(next.site)!;
    const step = other ? otherThemeValueCommand(next, target, entered) : siteBackgroundColorCommand(next.site, entered);
    const seen = { ...next.site, tokens: { ...next.site.tokens, [target]: entered } };
    const text = other ? [] : readableTextCommands(seen, siteBackgroundPages(next.site), SITE_BACKGROUND_VALUE);
    await apply([step, ...text]);
    const count = siteBackgroundPages(host.state()?.site ?? next.site).length;
    host.status(tn(count, 'Site background color is now {0}; {1} page uses it.', 'Site background color is now {0}; {1} pages use it.', [entered || resolveColor(next.site, `var(--${target})`), count]));
  }
  siteField.addEventListener('change', () => void host.run(async () => {
    try { await setSiteColor(siteField.value, false); } catch (error) { if (filled) { value(siteField, ''); paint(filled, true); } throw error; }
  }));
  altField.addEventListener('change', () => void host.run(() => setSiteColor(altField.value, true)));
  async function adoptThemeColor(): Promise<void> {
    const next = host.state();
    const token = next && pageColorToken(next.site);
    if (!token) return;
    await useSite(next.site.pages.filter(entry => entry.id === host.page().id), `var(--${token.replace(/^--/, '')})`);
  }

  function paint(next: EditorState, force = false): void {
    const site = next.site;
    const page = host.page();
    if (picked && picked.page !== page.id) picked = null;
    const mode = picked?.mode ?? backgroundMode(site, page);
    for (const [id, radio] of radios) if (radio.checked !== (id === mode)) radio.checked = id === mode;
    show(sitePart, mode === 'site');
    show(match, mode === 'other');
    show(ownPart, mode === 'own');
    const key = siteBackgroundKey(site);
    const target = siteBackgroundTarget(site);
    const themed = hasThemes(next);
    const themes = readThemes(next);
    const base = target ? site.tokens[target] : '';
    if (force) siteField.value = base;
    else value(siteField, base);
    const shown = siteBackgroundColor(site);
    if (siteField.placeholder !== (shown || '#ffffff')) siteField.placeholder = shown || '#ffffff';
    if (themed && target) {
      const alt = otherTheme(themes);
      label(siteName, 'Site background color, {0}', [{ t: themes.default === 'light' ? 'Light' : 'Dark' }]);
      label(altName, 'Site background color, {0}', [{ t: alt === 'light' ? 'Light' : 'Dark' }]);
      value(altField, themes.values[alt][target] || '');
      if (altField.placeholder !== base) altField.placeholder = base;
    } else label(siteName, 'Site background color');
    show(altColor, themed && !!target);
    const candidate = pageColorToken(site);
    if (candidate) label(adopt, 'Use --{0} ({1}), the theme page color',[candidate.replace(/^--/, ''), resolveColor(site, site.tokens[candidate])]);
    show(adopt, !!candidate);
    const count = siteBackgroundPages(site).length;
    const taken = siteBackgroundTaken(site);
    if (taken) label(siteNote, 'This site already uses --page-background for {0}, so it cannot be the site background. Rename that token to give the site a background.', [taken]);
    else if (!key) label(siteNote, 'Using the site background: white, the browser default. Pick a color to give the site a background; this page uses it at once and new pages start with it.');
    else if (target !== key) label(siteNote, '{0} of {1} pages use the site background. It follows --{2}, so changing it changes that theme color everywhere it is used.', [count, site.pages.length, target!.replace(/^--/, '')]);
    else label(siteNote, '{0} of {1} pages use the site background. New pages start with it.', [count, site.pages.length]);
    const allOn = !!key && count === site.pages.length;
    if (siteAll.disabled !== (!key || allOn)) siteAll.disabled = !key || allOn;
  }

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
    await apply([setBackgroundCommand(next.site, page, field.value)]);
  }));

  function show(node: HTMLElement, on: boolean): void { if (node.hidden === on) node.hidden = !on; }
  function ready(): boolean { return !!host.state(); }
  function current(): PageBackground | null { const next = host.state(); return next ? pageBackground(next.site, host.page()) : null; }

  return {
    field,
    fill(next) {
      const site = next.site;
      const page = host.page();
      filled = next;
      const onSite = usesSiteBackground(site, page);
      const mine = onSite ? null : pageBackground(site, page);
      const siteKey = siteBackgroundKey(site);
      value(field, mine?.value || '');
      if (mine) {
        const resolved = resolveColor(site, mine.value);
        if (resolved !== mine.value) label(own, 'This page uses {0}, which is {1}.', [mine.value, resolved]);
        else label(own, 'This page uses {0}.', [mine.value]);
        if (siteKey) label(inherited, 'Clear removes it and the page shows white. Choose Site background to use {0}.', [siteBackgroundColor(site)]);
        else label(inherited, 'Clear returns it to the site background: white, the browser default.');
      } else if (siteKey) label(inherited, 'This page has no background of its own and shows white. Type a color to give it one.');
      else label(inherited, 'Using the site background: white, the browser default.');
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
      if (radios.get('other')!.disabled !== single) radios.get('other')!.disabled = single;
      paint(next);
    },
    commands: [
      { id: 'page.background', label: 'Page background...', menu: 'Page', group: 4, enabled: ready, run: () => {
        host.showPageTab();
        if (group.classList.contains('is-collapsed')) (group.firstElementChild as HTMLElement).click();
        group.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const next = host.state();
        const mode = next ? picked?.mode ?? backgroundMode(next.site, host.page()) : 'own';
        (mode === 'site' ? siteField : mode === 'own' ? field : radios.get(mode)!).focus({ preventScroll: true });
      } },
      { id: 'page.background-site', label: 'Use the site background', menu: 'Page', group: 4, enabled: () => { const next = host.state(); return !!next && !usesSiteBackground(next.site, host.page()); }, params: { color: { type: 'string', description: 'Color for the site background. Needed only when the site has none yet: it creates the --page-background token in the same undo step.' } }, mutates: true, description: 'Give the open page the site background, var(--page-background). One undo step.', run: params => {
        const next = host.state();
        const color = typeof params?.color === 'string' ? params.color : '';
        if (next && !siteBackgroundKey(next.site) && !color) { choose('site'); return; }
        return useSite(next ? next.site.pages.filter(entry => entry.id === host.page().id) : [], color);
      } },
      { id: 'page.background-site-all', label: 'Use the site background on all pages', menu: 'Page', group: 4, enabled: () => { const next = host.state(); return !!next && !!siteBackgroundKey(next.site) && siteBackgroundPages(next.site).length < next.site.pages.length; }, mutates: true, description: 'Give every page the site background, var(--page-background), in one undo step.', run: () => useSite(host.state()?.site.pages ?? []) },
      { id: 'page.background-site-color', label: 'Set the site background color', enabled: ready, params: { color: { type: 'string', required: true, description: 'A CSS color such as #f3efe6 or a theme color such as var(--paper).' }, theme: { type: 'string', enum: ['light', 'dark'], description: 'On a site with themes, the theme this color is for; leave out for the default theme.' } }, mutates: true, description: 'Change the color of the site background, the --page-background token, which every page on the site background shows. On a site without one it is created and the open page uses it, in one undo step.', run: params => {
        const next = host.state();
        const color = typeof params?.color === 'string' ? params.color : '';
        const other = !!next && hasThemes(next) && params?.theme === otherTheme(readThemes(next));
        return setSiteColor(color, other);
      } },
      { id: 'page.background-site-theme', label: 'Use the theme page color as the site background', enabled: () => { const next = host.state(); return !!next && !!pageColorToken(next.site); }, mutates: true, description: 'On a site without a site background whose theme has a page color such as --paper, make --page-background follow it and give the open page the site background. One undo step.', run: () => adoptThemeColor() },
      { id: 'page.background-clear', label: 'Clear page background', menu: 'Page', group: 4, enabled: () => !!current(), run: async () => {
        const next = host.state()!;
        await apply([setBackgroundCommand(next.site, host.page(), '')]);
        if (siteBackgroundKey(next.site)) host.status(t('Clear removes it and the page shows white. Choose Site background to use {0}.', [siteBackgroundColor(next.site)]));
        else host.status('Page background cleared. The page uses the site background.');
      } },
      { id: 'page.background-all', label: 'Use this page background on all pages', menu: 'Page', group: 4, enabled: () => ready() && host.state()!.site.pages.length > 1, run: async () => {
        const next = host.state()!;
        const mine = current()?.value || '';
        const refusal = backgroundRefusal(next.site, mine);
        if (refusal) { host.status(refusal, true); return; }
        const list = allPagesCommands(next.site, mine);
        if (!list.length) { host.status('Every page already has this background.'); return; }
        await apply(list);
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

export function readableTextPatch(site: Site, page: Page, content: string): Record<string, string | null> {
  if ((site.extensions?.design as { themes?: unknown } | undefined)?.themes) return {};
  const own = (site.nodes[page.root]?.styles.color || '').trim().toLowerCase();
  const ink = inkOn(resolveColor(site, content.trim() || LIGHT_INK));
  if (ink === LIGHT_INK && !own) return { color: LIGHT_INK };
  if (ink === DARK_INK && own === LIGHT_INK) return { color: null };
  return {};
}

export function setBackgroundCommand(site: Site, page: Page, content: string): Command {
  const styles = site.nodes[page.root]?.styles || {};
  const patch = { ...backgroundPatch(content), ...readableTextPatch(site, page, content) };
  if (!styles['background-color']) delete patch['background-color'];
  return { command: 'node.update', params: { id: page.root, patch: { styles: patch } } };
}

export function readableTextCommands(site: Site, pages: Page[], content: string): Command[] {
  return pages.flatMap(page => {
    const patch = readableTextPatch(site, page, content);
    return Object.keys(patch).length ? [{ command: 'node.update', params: { id: page.root, patch: { styles: patch } } }] : [];
  });
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
  if (!from) return siteBackgroundKey(site) ? [{ command: 'node.update', params: { id: root, patch: { styles: { background: SITE_BACKGROUND_VALUE, ...readableTextPatch(site, { root } as Page, SITE_BACKGROUND_VALUE) } } } }] : [];
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

export function siteBackgroundTaken(site: Site): string {
  const key = tokenKey(site, SITE_BACKGROUND);
  if (!key) return '';
  const shown = resolveColor(site, site.tokens[key]).replace(/var\(\s*--[\w-]+\s*(?:,[^()]*)?\)/g, 'transparent').trim();
  return shown && (CSS.supports('background-color', shown) || CSS.supports('background-image', shown)) ? '' : site.tokens[key] || '""';
}

export function siteBackgroundKey(site: Site): string | null { const key = tokenKey(site, SITE_BACKGROUND); return key && !siteBackgroundTaken(site) ? key : null; }

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
  if (tokenKey(site, SITE_BACKGROUND)) return null;
  const home = homePage(site);
  const used = home ? tokenReference(pageBackground(site, home)?.value || '') : null;
  const found = used ? tokenKey(site, used) : null;
  if (found) return found;
  for (const name of PAGE_COLOR_NAMES) { const key = tokenKey(site, name); if (key) return key; }
  return null;
}

export function useSiteBackgroundCommands(site: Site, pages: Page[], color = ''): Command[] {
  const list: Command[] = [];
  let seen = site;
  if (!siteBackgroundKey(site)) {
    if (!color.trim()) return [];
    list.push({ command: 'token.set', params: { name: SITE_BACKGROUND, value: color.trim() } });
    seen = { ...site, tokens: { ...site.tokens, [SITE_BACKGROUND]: color.trim() } };
  }
  for (const page of pages) if (!usesSiteBackground(site, page) || site.nodes[page.root]?.styles['background-color']) list.push(setBackgroundCommand(seen, page, SITE_BACKGROUND_VALUE));
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
