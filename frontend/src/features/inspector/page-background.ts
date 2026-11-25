import { command, commands } from '../../api';
import { element, value } from '../../ui/dom';
import { runCommand, type CommandDef } from '../../ui/shell';
import type { Icon } from '../../ui/icons';
import { label, labelAttr } from '../../i18n';
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
  group.append(wrapper, note, actions);

  field.addEventListener('change', () => void host.run(async () => {
    const next = host.state();
    if (!next) return;
    const page = host.page();
    const refusal = brandRefusal(next, field.value);
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
        const list = allPagesCommands(next.site, mine);
        if (!list.length) { host.status('Every page already has this background.'); return; }
        await commands(list);
        host.status(mine ? `Background ${mine} applied to all ${next.site.pages.length} pages.` : `Backgrounds cleared on all ${next.site.pages.length} pages; they use the site background.`);
      } },
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

export function brandRefusal(next: EditorState | undefined, content: string): string {
  const entered = content.trim();
  if (!next || !entered || !readBrand(next).restricted) return '';
  if (/^var\(--(?:brand|lib)-[a-z0-9-]+\)$/.test(entered) || ['inherit', 'transparent', 'currentcolor', 'none'].includes(entered.toLowerCase())) return '';
  return 'Brand restriction is on: pick a brand or team library value from the list (var(--brand-...) or var(--lib-...)), or ask a project manager to turn it off in Window > Brand kit.';
}
