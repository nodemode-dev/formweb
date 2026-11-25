import type { Site } from '../types';
import { movableIds } from './panel/drop';
import '../styles/selection.css';

export interface SelectionHost {
  ready: () => boolean;
  site: () => Site;
  primary: () => string;
  select: (id: string) => void;
  pageId: () => string;
  openPage: (id: string) => void;
  pageRoot: () => string;
  refresh: () => void;
  layersList: HTMLElement;
  pagesList: HTMLElement;
}

const HIDDEN_TAGS = new Set(['pattern', 'linearGradient', 'radialGradient', 'tspan']);

let host: SelectionHost | null = null;
let nodes: string[] = [];
let primary = '';
let anchor = '';
let pages: string[] = [];
let openId = '';
let pageAnchor = '';
let memo: { site: Site; root: string; ids: Set<string> } | null = null;

export function installSelection(next: SelectionHost): void {
  host = next;
  selectionKeys(next.layersList, 'layers');
  selectionKeys(next.pagesList, 'pages');
}

function onPage(): Set<string> {
  const site = host!.site();
  const root = host!.pageRoot();
  if (memo && memo.site === site && memo.root === root) return memo.ids;
  const ids = new Set<string>();
  const walk = (id: string): void => {
    if (ids.has(id) || !site.nodes[id]) return;
    ids.add(id);
    site.nodes[id].children.forEach(walk);
  };
  walk(root);
  memo = { site, root, ids };
  return ids;
}

function syncNodes(): void {
  const current = host!.primary();
  if (current !== primary) { nodes = [current]; primary = current; anchor = current; return; }
  const live = onPage();
  if (nodes.some(id => !live.has(id))) nodes = nodes.filter(id => live.has(id));
  if (!nodes.includes(primary)) nodes.push(primary);
}

function syncPages(): void {
  const current = host!.pageId();
  if (current !== openId) { pages = [current]; openId = current; pageAnchor = current; return; }
  const live = new Set(host!.site().pages.map(page => page.id));
  if (pages.some(id => !live.has(id))) pages = pages.filter(id => live.has(id));
  if (!pages.includes(openId)) pages.push(openId);
}

export function selectedIds(): string[] {
  if (!host?.ready()) return [];
  syncNodes();
  return [...nodes];
}

export function primaryId(): string {
  if (!host?.ready()) return '';
  syncNodes();
  return primary;
}

export function topMost(ids: readonly string[] = selectedIds()): string[] {
  return host?.ready() ? movableIds(host.site(), ids) : [];
}

export function isSelected(id: string): boolean {
  return selectedIds().includes(id);
}

export function isMulti(): boolean {
  return selectedIds().length > 1;
}

export function selectedPageIds(): string[] {
  if (!host?.ready()) return [];
  syncPages();
  return host.site().pages.map(page => page.id).filter(id => pages.includes(id));
}

export function isPageSelected(id: string): boolean {
  return selectedPageIds().includes(id);
}

export function selectNodes(ids: readonly string[], main = ids[ids.length - 1]): void {
  if (!host || !main) return;
  const site = host.site();
  nodes = ids.filter((id, at) => site.nodes[id] && ids.indexOf(id) === at);
  if (!nodes.includes(main)) nodes.push(main);
  primary = main;
  if (!ids.includes(anchor)) anchor = main;
  if (host.primary() === main) host.refresh(); else host.select(main);
}

export function selectPages(ids: readonly string[], main = ids[ids.length - 1]): void {
  if (!host || !main) return;
  const live = new Set(host.site().pages.map(page => page.id));
  pages = ids.filter((id, at) => live.has(id) && ids.indexOf(id) === at);
  if (!pages.includes(main)) pages.push(main);
  openId = main;
  if (!ids.includes(pageAnchor)) pageAnchor = main;
  if (host.pageId() === main) host.refresh(); else host.openPage(main);
}

const toggles = (event: MouseEvent | KeyboardEvent): boolean => event.ctrlKey || event.metaKey;

function toggled(list: readonly string[], id: string): { ids: string[]; main: string } | null {
  if (!list.includes(id)) return { ids: [...list, id], main: id };
  if (list.length === 1) return null;
  const ids = list.filter(item => item !== id);
  return { ids, main: ids[ids.length - 1] };
}

function rowKeys(list: HTMLElement): string[] {
  return Array.from(list.children).map(row => (row as HTMLElement).dataset.key || '').filter(Boolean);
}

function span(keys: readonly string[], from: string, to: string): string[] {
  const a = keys.indexOf(from);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return a <= b ? keys.slice(a, b + 1) : keys.slice(b, a + 1).reverse();
}

export function layerClick(event: MouseEvent, id: string): void {
  if (!host) return;
  const list = host.layersList;
  syncNodes();
  if (toggles(event)) {
    const next = toggled(nodes, id);
    if (!next) return;
    if (!nodes.includes(id)) anchor = id;
    selectNodes(next.ids, next.main);
  } else if (event.shiftKey) {
    const from = anchor;
    selectNodes(span(rowKeys(list), from, id), id);
    anchor = from;
  } else {
    anchor = id;
    selectNodes([id], id);
  }
}

export function canvasClick(event: MouseEvent | undefined, id: string): void {
  if (!host) return;
  syncNodes();
  if (event && (toggles(event) || event.shiftKey)) {
    const next = toggled(nodes, id);
    if (!next) return;
    anchor = next.main;
    selectNodes(next.ids, next.main);
  } else {
    anchor = id;
    selectNodes([id], id);
  }
}

export function pageClick(event: MouseEvent, id: string): void {
  if (!host) return;
  syncPages();
  const order = host.site().pages.map(page => page.id);
  if (toggles(event)) {
    const next = toggled(pages, id);
    if (!next) return;
    if (!pages.includes(id)) pageAnchor = id;
    selectPages(next.ids, next.main);
  } else if (event.shiftKey) {
    const from = pageAnchor;
    selectPages(span(order, from, id), id);
    pageAnchor = from;
  } else {
    pageAnchor = id;
    selectPages([id], id);
  }
}

function layersOnPage(): string[] {
  const site = host!.site();
  const out: string[] = [];
  const walk = (id: string): void => {
    const node = site.nodes[id];
    if (!node || HIDDEN_TAGS.has(node.tag)) return;
    out.push(id);
    node.children.forEach(walk);
  };
  site.nodes[host!.pageRoot()]?.children.forEach(walk);
  return out;
}

function selectAllLayers(): void {
  syncNodes();
  const site = host!.site();
  const root = host!.pageRoot();
  const parent = primary === root ? site.nodes[root] : Object.values(site.nodes).find(node => node.children.includes(primary));
  const siblings = (parent?.children ?? []).filter(id => site.nodes[id] && !HIDDEN_TAGS.has(site.nodes[id].tag));
  const have = new Set(nodes);
  const all = siblings.length && !siblings.every(id => have.has(id)) ? siblings : layersOnPage();
  if (!all.length) return;
  const main = all.includes(primary) ? primary : all[0];
  selectNodes(all, main);
  anchor = main;
}

function collapse(kind: 'layers' | 'pages'): void {
  if (kind === 'layers') { syncNodes(); if (nodes.length > 1) selectNodes([primary], primary); }
  else { syncPages(); if (pages.length > 1) selectPages([openId], openId); }
}

function extend(kind: 'layers' | 'pages', list: HTMLElement, row: HTMLElement, step: -1 | 1): void {
  const next = (step < 0 ? row.previousElementSibling : row.nextElementSibling) as HTMLElement | null;
  const id = next?.dataset.key;
  if (!next || !id) return;
  if (kind === 'layers') {
    syncNodes();
    const from = anchor;
    selectNodes(span(rowKeys(list), from, id), id);
    anchor = from;
  } else {
    syncPages();
    const from = pageAnchor;
    selectPages(span(host!.site().pages.map(page => page.id), from, id), id);
    pageAnchor = from;
  }
  next.focus();
}

function selectionKeys(list: HTMLElement, kind: 'layers' | 'pages'): void {
  list.addEventListener('keydown', event => {
    const row = (event.target as Element | null)?.closest<HTMLElement>('.list-row');
    if (!host || event.defaultPrevented || !row || row !== event.target || row.parentElement !== list) return;
    const shiftOnly = event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (toggles(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (kind === 'layers') selectAllLayers();
      else { const order = host.site().pages.map(page => page.id); selectPages(order, host.pageId()); }
      row.focus();
    } else if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (kind === 'layers' ? isMulti() : selectedPageIds().length > 1) { event.preventDefault(); collapse(kind); }
    } else if (shiftOnly && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      extend(kind, list, row, event.key === 'ArrowUp' ? -1 : 1);
    }
  });
}

export function paintLayerRow(row: HTMLElement, id: string): void {
  const on = isSelected(id);
  const extra = on && id !== primary;
  if (row.classList.contains('is-multi') !== extra) row.classList.toggle('is-multi', extra);
  if (row.getAttribute('aria-selected') !== String(on)) row.setAttribute('aria-selected', String(on));
}

export function paintPageRow(row: HTMLElement, id: string): void {
  const on = isPageSelected(id);
  const extra = on && id !== openId;
  if (row.classList.contains('is-multi') !== extra) row.classList.toggle('is-multi', extra);
  if (row.getAttribute('aria-selected') !== String(on)) row.setAttribute('aria-selected', String(on));
}
