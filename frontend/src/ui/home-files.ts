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

function readPrefs(): { sort: Sort; view: View } {
  const out = { sort: 'opened' as Sort, view: 'grid' as View };
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
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function part<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
}

export class HomeFiles {
  readonly root: HTMLElement;
  private readonly items: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly filter: HTMLInputElement;
  private readonly sort: HTMLSelectElement;
  private all: HomeItem[] = [];
  private loaded = false;
  private prefs = readPrefs();

  constructor(private readonly d: HomeFilesDeps, private readonly o: { tab: Tab; limit?: number; compact?: boolean; onCount?: (n: number) => void }) {
    this.root = element('div', `fw-hf is-fixed${o.compact ? ' is-compact' : ''}`);
    this.root.innerHTML = `<div class="fw-hf-bar">
        <div class="fw-hf-tabs"></div>
        <label class="fw-hf-filter">${icon('search').outerHTML}<input class="fw-hf-input" type="text" placeholder="Filter" aria-label="Filter"></label>
        <label class="fw-hf-sortbox"><span>Sort</span><select class="fw-hf-sort" aria-label="Sort"><option value="opened">Most recent</option><option value="name">Name</option></select></label>
        <div class="fw-hf-views"><button class="fw-hf-view" type="button" data-view="grid" aria-label="Grid">${icon('grid').outerHTML}</button><button class="fw-hf-view" type="button" data-view="list" aria-label="List">${icon('list').outerHTML}</button></div>
      </div>
      <div class="fw-hf-items"></div>
      <div class="fw-hf-empty" hidden></div>`;
    this.items = part(this.root, '.fw-hf-items');
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
      const key = target.closest<HTMLElement>('.fw-hf-item')?.dataset.key;
      const item = key === undefined ? undefined : this.all.find(entry => entry.key === key);
      if (item) this.d.open(item);
    });
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
    if (this.prefs.sort === 'name') shown = [...shown].sort((a, b) => a.name.localeCompare(b.name));
    else shown = [...shown].sort((a, b) => b.when - a.when);
    if (this.o.limit) shown = shown.slice(0, this.o.limit);
    keyed(this.items, shown, item => item.key, () => {
      const node = element('div', 'fw-hf-item');
      node.innerHTML = `<button class="fw-hf-open" type="button"><span class="fw-hf-thumb"><span class="fw-hf-glyph">${icon('globe').outerHTML}</span></span><span class="fw-hf-name"></span><span class="fw-hf-kind"></span><span class="fw-hf-size"></span><span class="fw-hf-when"></span></button>`;
      return node;
    }, (node, item) => {
      text(part(node, '.fw-hf-name'), item.name);
      text(part(node, '.fw-hf-kind'), item.kind);
      text(part(node, '.fw-hf-size'), sizeText(item.size));
      text(part(node, '.fw-hf-when'), whenText(item.when));
    });
    const message = !this.loaded ? '' : this.all.length === 0
      ? (this.o.tab === 'recent' ? 'Sites you open or save appear here.' : 'No saved projects yet. Save the current site to keep an editable snapshot.')
      : shown.length === 0 ? 'No files match the filter.' : '';
    text(this.empty, message);
    if (this.empty.hidden !== (message === '')) this.empty.hidden = message === '';
  }
}
