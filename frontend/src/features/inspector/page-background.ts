import { readBrand } from '../brand-kit';
import type { Command, EditorState, Page, Site } from '../../types';

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
