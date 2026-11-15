import { label, labelAttr, language, onLanguage } from '../i18n';
import { element, keyed, text } from './dom';
import { icon } from './icons';

export interface HomeItem {
  key: string;
  name: string;
  kind: string;
  size: number;
  when: number;
}

export type Tab = 'recent' | 'projects';

export interface HomeFilesDeps {
  list: (tab: Tab) => Promise<HomeItem[]>;
  open: (item: HomeItem) => void;
}

type Sort = 'opened' | 'name' | 'size';
type View = 'grid' | 'list';

const PREFS = 'formweb.home';

export const RECENT_MAX = 12;

function readPrefs(): { sort: Sort; view: View } {
  const out = { sort: 'name' as Sort, view: 'grid' as View };
  try {
    const v = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<typeof out>;
    if (v.sort === 'opened' || v.sort === 'name' || v.sort === 'size') out.sort = v.sort;
    if (v.view === 'grid' || v.view === 'list') out.view = v.view;
  } catch { }
  return out;
}

const sizeText = (n: number): string => (n <= 0 ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function whenText(ms: number): string {
  if (!ms) return '';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  try {
    if (s >= 86400 * 7) return new Date(ms).toLocaleDateString(language(), { dateStyle: 'medium' });
    const ago = new Intl.RelativeTimeFormat(language(), { numeric: 'auto', style: 'short' });
    if (s < 60) return ago.format(0, 'second');
    if (s < 3600) return ago.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return ago.format(-Math.round(s / 3600), 'hour');
    return ago.format(-Math.round(s / 86400), 'day');
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const WATCHED = ['title', 'aria-label', 'placeholder'] as const;

export function sourced(root: ParentNode): void {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-t]'))) {
    node.removeAttribute('data-t');
    label(node, node.textContent ?? '');
  }
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-ta]'))) {
    node.removeAttribute('data-ta');
    for (const name of WATCHED) { const english = node.getAttribute(name); if (english) labelAttr(node, name, english); }
  }
}

function part<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
}

export class HomeFiles {
  readonly root: HTMLElement;
  private readonly items: HTMLElement;
  private readonly skeleton: HTMLElement | null;
  private readonly none: HTMLElement | null;
  private readonly empty: HTMLElement;
  private readonly filter: HTMLInputElement;
  private readonly sort: HTMLSelectElement;
  private all: HomeItem[] = [];
  private loaded = false;
  private prefs = readPrefs();

  constructor(private readonly d: HomeFilesDeps, private readonly o: { tab: Tab; limit?: number; compact?: boolean; onCount?: (n: number) => void }) {
    this.root = element('div', `fw-hf is-fixed is-${o.tab}${o.compact ? ' is-compact' : ''}`);
    const reserve = o.compact ? `<div class="fw-card is-skeleton" aria-hidden="true"><span class="fw-card-preview"></span><span class="fw-card-body"><span class="fw-card-name">&nbsp;</span><span class="fw-card-meta">&nbsp;</span></span></div>
        <div class="fw-card is-empty" hidden><span class="fw-card-preview is-blank">${icon('globe').outerHTML}</span><span class="fw-card-body"><span class="fw-card-name" data-t>No projects yet</span><span class="fw-card-meta" title="Sites you open or save appear here." data-t data-ta>Sites you open or save appear here.</span></span></div>` : '';
    this.root.innerHTML = `<div class="fw-hf-bar">
        <div class="fw-hf-tabs"></div>
        <label class="fw-hf-filter">${icon('search').outerHTML}<input class="fw-hf-input" type="text" placeholder="Filter" aria-label="Filter" data-ta></label>
        <label class="fw-hf-sortbox"><span data-t>Sort</span><select class="fw-hf-sort" aria-label="Sort" data-ta><option value="opened" data-t>Most recent</option><option value="name" data-t>Name</option></select></label>
        <div class="fw-hf-views"><button class="fw-hf-view" type="button" data-view="grid" aria-label="Grid" data-ta>${icon('grid').outerHTML}</button><button class="fw-hf-view" type="button" data-view="list" aria-label="List" data-ta>${icon('list').outerHTML}</button></div>
      </div>
      <div class="fw-card-grid${o.compact ? ' fw-recent-grid' : ''}">
        ${reserve}
        <div class="fw-card-list"></div>
      </div>
      <div class="fw-hf-empty" hidden></div>`;
    sourced(this.root);
    this.items = part(this.root, '.fw-card-list');
    this.skeleton = this.root.querySelector<HTMLElement>('.fw-card.is-skeleton');
    this.none = this.root.querySelector<HTMLElement>('.fw-card.is-empty');
    this.empty = part(this.root, '.fw-hf-empty');
    this.filter = part<HTMLInputElement>(this.root, '.fw-hf-input');
    this.sort = part<HTMLSelectElement>(this.root, '.fw-hf-sort');
    this.sort.value = this.prefs.sort === 'size' ? 'opened' : this.prefs.sort;
    this.filter.addEventListener('input', () => this.render());
    this.sort.addEventListener('change', () => { this.prefs.sort = this.sort.value as Sort; this.save(); this.render(); });
    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const view = target.closest<HTMLElement>('[data-view]')?.dataset.view;
      if (view === 'grid' || view === 'list') { this.prefs.view = view; this.save(); this.render(); return; }
      const key = target.closest<HTMLElement>('.fw-card[data-key]')?.dataset.key;
      const item = key === undefined ? undefined : this.all.find(entry => entry.key === key);
      if (item) this.d.open(item);
    });
    onLanguage(() => this.render());
    this.render();
  }

  private save(): void { try { localStorage.setItem(PREFS, JSON.stringify(this.prefs)); } catch { } }

  async refresh(): Promise<void> {
    try { this.all = await this.d.list(this.o.tab); } catch { this.all = []; }
    this.loaded = true;
    this.o.onCount?.(this.all.length);
    this.render();
  }

  private render(): void {
    this.root.classList.toggle('is-list', this.prefs.view === 'list');
    for (const button of Array.from(this.root.querySelectorAll<HTMLElement>('.fw-hf-view'))) button.classList.toggle('is-active', button.dataset.view === this.prefs.view);
    const needle = this.filter.value.trim().toLowerCase();
    let shown = this.all.filter(item => !needle || item.name.toLowerCase().includes(needle));
    if (this.o.tab === 'projects' && this.prefs.sort === 'name') shown = [...shown].sort((a, b) => a.name.localeCompare(b.name));
    else shown = [...shown].sort((a, b) => b.when - a.when);
    if (this.o.limit) shown = shown.slice(0, this.o.limit);
    keyed(this.items, shown, item => item.key, () => {
      const node = element('button', 'fw-card');
      node.type = 'button';
      node.innerHTML = `<span class="fw-card-preview is-blank">${icon('globe').outerHTML}</span><span class="fw-card-body"><span class="fw-card-name" data-no-i18n></span><span class="fw-card-meta" data-no-i18n><span class="fw-card-kind"></span><span class="fw-card-size"></span><span class="fw-card-time"></span></span></span>`;
      return node;
    }, (node, item) => {
      text(part(node, '.fw-card-name'), item.name);
      text(part(node, '.fw-card-kind'), item.kind);
      text(part(node, '.fw-card-size'), sizeText(item.size));
      text(part(node, '.fw-card-time'), whenText(item.when));
    });
    if (this.skeleton && this.skeleton.hidden !== this.loaded) this.skeleton.hidden = this.loaded;
    const blank = this.loaded && this.all.length === 0;
    if (this.none && this.none.hidden === blank) this.none.hidden = !blank;
    const message = !this.loaded || (blank && this.none) ? '' : blank
      ? (this.o.tab === 'recent' ? 'Sites you open or save appear here.' : 'No saved projects yet. Save the current site to keep an editable snapshot.')
      : shown.length === 0 ? 'No files match the filter.' : '';
    if (message) label(this.empty, message); else text(this.empty, '');
    if (this.empty.hidden !== (message === '')) this.empty.hidden = message === '';
  }
}
