import type { Command, EditorState, SiteNode } from '../../types';
import { element } from '../../ui/dom';

export interface WishlistContext {
  state: () => EditorState;
  commands: (batch: Command[]) => Promise<unknown>;
  selected: () => string;
  select: (id: string) => void;
  notify: (message: string, error?: boolean) => void;
  audit: () => Promise<{ issues: AuditRow[] }>;
  host?: HTMLElement;
}
export type AuditRow = { severity: string; code: string; page?: string; node?: string; message: string };
export interface Tab { id: string; label: string; element: HTMLElement; refresh: () => void }
export type ListConfig = { collection: string; facets?: Facet[]; sortOptions?: SortOption[]; slider?: Slider; pageSize?: number; [key: string]: unknown };
export type Facet = { key: string; field: string; kind: 'checkbox' | 'select' | 'search' | 'range'; label?: string };
export type SortOption = { key: string; field: string; direction: 'asc' | 'desc'; label?: string };
export type Slider = { perView?: number; arrows?: boolean; dots?: boolean; autoplay?: boolean; interval?: number; loop?: boolean; label?: string; gap?: string };
export type Folder = { name: string; collections: string[] };

export function cmsGroup(state: EditorState): { lists: Record<string, ListConfig>; folders: Record<string, Folder>; templates: Record<string, { collection: string; slug: string }> } {
  const group = (state.site.extensions?.cms || {}) as Record<string, unknown>;
  return { lists: (group.lists || {}) as Record<string, ListConfig>, folders: (group.folders || {}) as Record<string, Folder>, templates: (group.templates || {}) as Record<string, { collection: string; slug: string }> };
}

export function listCollection(state: EditorState, id: string): string | null {
  const configured = cmsGroup(state).lists[id]?.collection;
  if (configured) return configured;
  const binding = state.site.nodes[id]?.binding;
  return binding && !binding.field ? binding.collection : null;
}

export function parentOf(state: EditorState, id: string): string | null {
  for (const node of Object.values(state.site.nodes)) if (node.children.includes(id)) return node.id;
  return null;
}

export function pageOf(state: EditorState, id: string): string | null {
  for (const page of state.site.pages) {
    const pending = [page.root];
    for (let hops = 0; pending.length && hops < 100000; hops += 1) {
      const current = pending.pop() as string;
      if (current === id) return page.id;
      pending.push(...(state.site.nodes[current]?.children || []));
    }
  }
  return null;
}

export function ancestorWhere(state: EditorState, id: string, test: (node: SiteNode) => boolean): SiteNode | null {
  let current: string | null = id;
  for (let hops = 0; current && hops < 120; hops += 1) {
    const node: SiteNode | undefined = state.site.nodes[current];
    if (node && test(node)) return node;
    current = parentOf(state, current);
  }
  return null;
}

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrap = element('label', 'wl-field');
  wrap.append(element('span', 'wl-label', label), control);
  return wrap;
}

export function check(label: string, box: HTMLInputElement): HTMLLabelElement {
  const wrap = element('label', 'wl-check');
  box.type = 'checkbox';
  wrap.append(box, element('span', '', label));
  return wrap;
}

export function btn(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
  const node = element('button', variant ? `wl-btn ${variant}` : 'wl-btn', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function select(items: [string, string][]): HTMLSelectElement {
  const node = element('select');
  for (const [value, label] of items) { const option = element('option', '', label); option.value = value; node.append(option); }
  return node;
}

export function sync(node: HTMLSelectElement, items: [string, string][]): void {
  const current = Array.from(node.options).map(o => `${o.value}\u0000${o.textContent}`).join('\u0001');
  if (current === items.map(([v, l]) => `${v}\u0000${l}`).join('\u0001')) return;
  const keep = node.value;
  node.replaceChildren(...items.map(([value, label]) => { const option = element('option', '', label); option.value = value; return option; }));
  if (items.some(([v]) => v === keep)) node.value = keep;
}

export function number(min: number, max: number, step = 1): HTMLInputElement {
  const node = element('input');
  node.type = 'number';
  node.min = String(min);
  node.max = String(max);
  node.step = String(step);
  return node;
}

export function text(placeholder = ''): HTMLInputElement {
  const node = element('input');
  node.type = 'text';
  node.placeholder = placeholder;
  return node;
}

export function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const node = element('section', 'wl-section');
  node.append(element('h3', 'wl-title', title), ...children);
  return node;
}

export function note(): HTMLParagraphElement { const node = element('p', 'wl-note'); node.setAttribute('aria-live', 'polite'); return node; }
export function row(...children: HTMLElement[]): HTMLElement { const node = element('div', 'wl-row'); node.append(...children); return node; }

export function setValue(node: HTMLInputElement | HTMLSelectElement, next: string): void {
  if (document.activeElement !== node && node.value !== next) node.value = next;
}

export function setChecked(node: HTMLInputElement, next: boolean): void {
  if (document.activeElement !== node && node.checked !== next) node.checked = next;
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

export function containerFor(state: EditorState, id: string): string {
  const flow = ['main', 'section', 'div', 'article', 'aside', 'header', 'footer', 'nav', 'form', 'li', 'figure', 'blockquote', 'details', 'fieldset'];
  let current: string | null = id;
  for (let hops = 0; current && hops < 120; hops += 1) {
    if (flow.includes(state.site.nodes[current]?.tag || '')) return current;
    current = parentOf(state, current);
  }
  return state.site.pages[0]?.root || id;
}
