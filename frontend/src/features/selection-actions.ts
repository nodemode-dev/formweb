import { accept, commands, libraryMutate, request, state } from '../api';
import type { EditorState, Site } from '../types';
import type { Command } from './sections';
import { t } from '../i18n';
import { canDrag, dropTarget, moveCommands } from './panel/drop';
import { copyOfPage, pageMoveCommands } from './panel/pages';
import { isMulti, isPageSelected, primaryId, selectNodes, selectPages, selectedIds, selectedPageIds, topMost } from './selection';

export interface SelectionActionsHost {
  idle: () => boolean;
  pageRoot: () => string;
  status: (parts: string | readonly string[], error?: boolean) => void;
  copyNote: (copied: { behind: number; left: number }) => string[];
}

const FRAGMENT_FORMAT = 'com.nodemode.formweb.fragment';
const MANY_FORMAT = 'com.nodemode.formweb.fragments';

let host: SelectionActionsHost | null = null;

export function installSelectionActions(next: SelectionActionsHost): void {
  host = next;
}

const site = (): Site => state().site;
const roots = (): Set<string> => new Set(site().pages.map(page => page.root));
const parentOf = (id: string): string | undefined => Object.values(site().nodes).find(node => node.children.includes(id))?.id;

function linked(id: string): boolean {
  const nodes = site().nodes;
  for (let at: string | undefined = id; at; at = parentOf(at)) if (nodes[at]?.componentId || nodes[at]?.componentSourceId) return true;
  return false;
}

const copyable = (id: string): boolean => !roots().has(id) && !linked(id);
const removable = (id: string): boolean => !roots().has(id) && !site().nodes[parentOf(id) ?? '']?.componentSourceId;

function split(test: (id: string) => boolean): { ids: string[]; skipped: number } {
  const picked = selectedIds();
  const all = topMost(picked);
  const ids = all.filter(test);
  const pageRoots = roots();
  return { ids, skipped: all.length - ids.length + picked.filter(id => pageRoots.has(id)).length };
}

const skipNote = (count: number): string => count ? ' ' + (count === 1
  ? t('One was skipped: a page root or an element inside a linked component instance.')
  : t('{0} were skipped: page roots or elements inside a linked component instance.', [count])) : '';

const elements = (count: number): string => count === 1 ? t('1 element') : t('{0} elements', [count]);

export function countLabel(english: string, many: string, count: number): string {
  return count > 1 ? t(many, [count]) : english;
}

export const anyCopyable = (): boolean => !!host?.idle() && split(copyable).ids.length > 0;
export const anyRemovable = (): boolean => !!host?.idle() && split(removable).ids.length > 0;

export async function duplicateSelected(): Promise<void> {
  const { ids, skipped } = split(copyable);
  if (!ids.length) { host!.status(t('None of the selected elements can be duplicated.'), true); return; }
  const main = ids.includes(primaryId()) ? primaryId() : ids[ids.length - 1];
  const next = await commands(ids.map(id => ({ command: 'node.duplicate', params: { id } })));
  const copyOf = (id: string): string | undefined => {
    const parent = Object.values(next.site.nodes).find(node => node.children.includes(id));
    return parent?.children[parent.children.indexOf(id) + 1];
  };
  const copies = ids.map(copyOf).filter((id): id is string => !!id);
  selectNodes(copies, copyOf(main) ?? copies[copies.length - 1]);
  host!.status(t('{0} duplicated.', [elements(ids.length)]) + skipNote(skipped));
}

export async function removeSelected(): Promise<void> {
  const { ids, skipped } = split(removable);
  if (!ids.length) { host!.status(t('None of the selected elements can be deleted.'), true); return; }
  await commands(ids.map(id => ({ command: 'node.remove', params: { id } })));
  host!.status(t('{0} deleted. One undo step puts them back.', [elements(ids.length)]) + skipNote(skipped));
}

async function copyMany(ids: readonly string[]): Promise<{ behind: number; left: number }> {
  const items = await Promise.all(ids.map(id => request<Record<string, unknown>>('/api/fragment', { node: id, embed: true, clip: true })));
  const nodes = items.reduce((sum, item) => sum + (Array.isArray(item.nodes) ? item.nodes.length : item.nodes && typeof item.nodes === 'object' ? Object.keys(item.nodes).length : 0), 0);
  if (nodes > MAX_TOTAL_NODES) throw new Error(t('A paste can bring at most {0} elements in all. Copy fewer elements at a time.', [MAX_TOTAL_NODES.toLocaleString('en')]));
  if (!navigator.clipboard?.writeText) throw new Error('This browser does not allow writing to the clipboard here.');
  await navigator.clipboard.writeText(JSON.stringify({ format: MANY_FORMAT, version: 1, items }));
  let behind = 0;
  let left = 0;
  for (const fragment of items) {
    const clip = fragment.clip as { ids?: unknown } | null | undefined;
    const behindIds = clip && typeof clip === 'object' && Array.isArray(clip.ids) ? clip.ids : [];
    behind += behindIds.length;
    left += Array.isArray(fragment.notEmbedded) ? fragment.notEmbedded.filter(id => !behindIds.includes(id)).length : 0;
  }
  return { behind, left };
}

const MAX_FRAGMENTS = 64;
const MAX_TOTAL_NODES = 8000;
const tooMany = (count: number): boolean => {
  if (count <= MAX_FRAGMENTS) return false;
  host!.status(t('{0} elements are selected; copy or cut at most {1} at a time, or select their container instead.', [count, MAX_FRAGMENTS]), true);
  return true;
};

export async function copySelected(): Promise<void> {
  const { ids, skipped } = split(copyable);
  if (!ids.length) { host!.status(t('None of the selected elements can be copied.'), true); return; }
  if (tooMany(ids.length)) return;
  const copied = await copyMany(ids);
  host!.status([t('{0} copied.', [elements(ids.length)]), ...host!.copyNote(copied), skipNote(skipped)]);
}

export async function cutSelected(): Promise<void> {
  const { ids, skipped } = split(copyable);
  if (!ids.length) { host!.status(t('None of the selected elements can be cut.'), true); return; }
  if (tooMany(ids.length)) return;
  const copied = await copyMany(ids);
  await commands(ids.map(id => ({ command: 'node.remove', params: { id } })));
  host!.status([t('{0} cut. Paste puts them back; Undo restores them in place.', [elements(ids.length)]), ...host!.copyNote(copied), skipNote(skipped)]);
}

function fragmentsOf(raw: string): Record<string, unknown>[] | null {
  if (raw.length < 20 || raw.length > 32_000_000 || raw.trimStart()[0] !== '{') return null;
  try {
    const value = JSON.parse(raw) as { format?: unknown; version?: unknown; items?: unknown };
    if (!value || value.format !== MANY_FORMAT || value.version !== 1 || !Array.isArray(value.items) || !value.items.length) return null;
    const items = value.items as Record<string, unknown>[];
    return items.every(item => item && typeof item === 'object' && item.format === FRAGMENT_FORMAT && item.version === 1) ? items : null;
  } catch { return null; }
}

export const holdsMany = (raw: string): boolean => fragmentsOf(raw) !== null;

export async function pasteMany(raw: string): Promise<boolean> {
  const items = fragmentsOf(raw);
  if (!items) return false;
  const nodes = site().nodes;
  const before = new Set(Object.keys(nodes));
  const selected = primaryId() && nodes[primaryId()] ? primaryId() : host!.pageRoot();
  const owner = selected === host!.pageRoot() ? undefined : parentOf(selected);
  const parent = owner ?? host!.pageRoot();
  const body: Record<string, unknown> = { fragments: items, parent };
  if (owner) body.index = nodes[owner].children.indexOf(selected) + 1;
  const result = await libraryMutate<{ state?: EditorState }>('/api/paste', body);
  const next = 'site' in result ? (result as unknown as EditorState) : result.state ? accept(result.state) : state();
  const made = (next.site.nodes[parent]?.children ?? []).filter(child => !before.has(child));
  if (made.length) selectNodes(made, made[made.length - 1]);
  host!.status(t('{0} pasted.', [elements(made.length || items.length)]));
  return true;
}

function stepGroups(step: -1 | 1): Command[] {
  const s = site();
  const root = host!.pageRoot();
  const ids = topMost(selectedIds()).filter(id => canDrag(s, [id]));
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const parent = parentOf(id);
    if (parent) groups.set(parent, [...(groups.get(parent) ?? []), id]);
  }
  const out: Command[] = [];
  for (const [parent, group] of groups) {
    const kids = s.nodes[parent].children;
    const edge = kids.indexOf(group[step < 0 ? 0 : group.length - 1]);
    const outside = step < 0 ? kids.slice(0, edge).reverse().find(id => !group.includes(id)) : kids.slice(edge + 1).find(id => !group.includes(id));
    if (!outside) continue;
    const target = dropTarget(s, root, group, outside, step < 0 ? 'before' : 'after');
    if (target) out.push(...moveCommands(s, group, target));
  }
  return out;
}

export const canStep = (step: -1 | 1): boolean => !!host && stepGroups(step).length > 0;

export async function stepSelected(step: -1 | 1): Promise<void> {
  const list = stepGroups(step);
  if (!list.length) return;
  await commands(list);
  host!.status(step < 0 ? t('{0} moved up.', [elements(topMost(selectedIds()).length)]) : t('{0} moved down.', [elements(topMost(selectedIds()).length)]));
}

export function dragIds(id: string): string[] {
  if (!isMulti() || !selectedIds().includes(id)) return [id];
  return topMost(selectedIds()).filter(item => canDrag(site(), [item]));
}

export function pageSetFor(id?: string): string[] {
  const chosen = selectedPageIds();
  if (!id) return chosen;
  return chosen.length > 1 && isPageSelected(id) ? chosen : [id];
}

const pagesWord = (count: number): string => count === 1 ? t('1 page') : t('{0} pages', [count]);

export function deletePagesNote(): string | null {
  const ids = selectedPageIds();
  if (ids.length < 2) return null;
  if (ids.length >= site().pages.length) return t('A site keeps at least one page. Leave one page out of the selection, then delete again.');
  return t('Delete {0} and their content? You can undo this operation.', [pagesWord(ids.length)]);
}

export async function deleteSelectedPages(): Promise<boolean> {
  const ids = selectedPageIds();
  if (ids.length < 2) return false;
  if (ids.length >= site().pages.length) { host!.status(t('A site keeps at least one page. Leave one page out of the selection, then delete again.'), true); return true; }
  await commands(ids.map(id => ({ command: 'page.remove', params: { id } })));
  host!.status(t('{0} removed. One undo step puts them back.', [pagesWord(ids.length)]));
  return true;
}

export async function duplicatePages(ids: readonly string[]): Promise<void> {
  const s = site();
  const before = new Set(s.pages.map(page => page.id));
  const planned = { ...s, pages: [...s.pages] };
  const list: Command[] = [];
  for (const id of ids) {
    const page = s.pages.find(entry => entry.id === id);
    if (!page) continue;
    const copy = copyOfPage(planned, page);
    planned.pages.push({ ...page, id: `${page.id}-planned`, ...copy });
    list.push({ command: 'page.duplicate', params: { id, ...copy } });
  }
  if (!list.length) return;
  const next = await commands(list);
  const made = next.site.pages.filter(page => !before.has(page.id)).map(page => page.id);
  if (made.length) selectPages(made, made[made.length - 1]);
  host!.status(t('{0} duplicated. One undo step removes them.', [pagesWord(list.length)]));
}

export function stepPagesCommands(ids: readonly string[], step: -1 | 1): Command[] {
  const order = site().pages.map(page => page.id);
  const set = order.filter(id => ids.includes(id));
  if (!set.length) return [];
  if (step < 0) {
    const first = order.indexOf(set[0]);
    const anchor = order.slice(0, first).reverse().find(id => !set.includes(id));
    return anchor ? pageMoveCommands(site(), set, anchor) : [];
  }
  const last = order.indexOf(set[set.length - 1]);
  const next = order.slice(last + 1).find(id => !set.includes(id));
  if (!next) return [];
  const anchor = order.slice(order.indexOf(next) + 1).find(id => !set.includes(id)) ?? null;
  return pageMoveCommands(site(), set, anchor);
}

export function selectionTitle(): string | null {
  const count = selectedIds().length;
  return count > 1 ? t('{0} selected', [elements(count)]) : null;
}

export function selectionNote(name: string): string | null {
  return isMulti() ? t('Changes apply to {0}, the last one you picked', [name]) : null;
}
