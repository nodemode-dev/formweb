import type { Site, SiteNode } from '../../types';
import { element } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { labelAttr } from '../../i18n';

const SECTIONS_KEY = 'formweb.panel.sections';
const FOLDED_KEY = 'formweb.layers.folded';
const MAX_PAGES = 64;
const MAX_IDS = 2000;
const PAINT_TAGS = new Set(['pattern', 'linearGradient', 'radialGradient']);

export interface LayerRow { node: SiteNode; depth: number; kids: boolean; folded: boolean }

function read<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as T : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

export function sectionToggle(eyebrow: HTMLElement, list: HTMLElement, name: 'pages' | 'layers'): HTMLButtonElement {
  const toggle = element('button', 'fw-fold-head');
  toggle.type = 'button';
  const chevron = icon('chevron');
  chevron.classList.add('fw-fold-chevron');
  eyebrow.replaceWith(toggle);
  toggle.append(chevron, eyebrow);
  if (!list.id) list.id = `fw-${name}-list`;
  toggle.setAttribute('aria-controls', list.id);
  const paint = (collapsed: boolean): void => {
    list.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    labelAttr(toggle, 'title', collapsed ? (name === 'pages' ? 'Show pages' : 'Show layers') : (name === 'pages' ? 'Hide pages' : 'Hide layers'));
  };
  paint(read<Record<string, boolean>>(SECTIONS_KEY, {})[name] === true);
  toggle.addEventListener('click', () => {
    const collapsed = !list.hidden;
    paint(collapsed);
    write(SECTIONS_KEY, { ...read<Record<string, boolean>>(SECTIONS_KEY, {}), [name]: collapsed });
  });
  return toggle;
}

export class LayerFolds {
  private readonly folded = new Map<string, Set<string>>();
  private revealed = '';

  constructor() {
    const saved = read<Record<string, unknown>>(FOLDED_KEY, {});
    for (const [page, ids] of Object.entries(saved).slice(-MAX_PAGES)) {
      if (Array.isArray(ids)) this.folded.set(page, new Set(ids.filter((id): id is string => typeof id === 'string').slice(0, MAX_IDS)));
    }
  }

  private of(page: string): Set<string> {
    let set = this.folded.get(page);
    if (!set) { set = new Set(); this.folded.set(page, set); }
    return set;
  }

  private save(): void {
    const out: Record<string, string[]> = {};
    for (const [page, ids] of [...this.folded].slice(-MAX_PAGES)) if (ids.size) out[page] = [...ids].slice(0, MAX_IDS);
    write(FOLDED_KEY, out);
  }

  isFolded(page: string, id: string): boolean { return !!this.folded.get(page)?.has(id); }

  set(page: string, id: string, folded: boolean): boolean {
    const set = this.of(page);
    if (set.has(id) === folded) return false;
    if (folded) set.add(id); else set.delete(id);
    this.save();
    return true;
  }

  all(page: string, ids: readonly string[]): void {
    const set = this.of(page);
    set.clear();
    for (const id of ids) set.add(id);
    this.save();
  }

  rows(site: Site, page: string, root: string, selected: string): { rows: LayerRow[]; total: number; parents: string[] } {
    if (selected !== this.revealed) {
      this.revealed = selected;
      const set = this.folded.get(page);
      if (set?.size) {
        let changed = false;
        for (let at = parentIn(site, selected); at; at = parentIn(site, at)) if (set.delete(at)) changed = true;
        if (changed) this.save();
      }
    }
    const rows: LayerRow[] = [];
    const parents: string[] = [];
    let total = 0;
    const walk = (id: string, depth: number, shown: boolean): void => {
      const node = site.nodes[id];
      if (!node || PAINT_TAGS.has(node.tag)) return;
      total++;
      const kids = node.children.filter(child => site.nodes[child] && site.nodes[child].tag !== 'tspan' && !PAINT_TAGS.has(site.nodes[child].tag));
      const folded = kids.length > 0 && this.isFolded(page, id);
      if (kids.length && id !== root) parents.push(id);
      if (shown) rows.push({ node, depth, kids: kids.length > 0, folded });
      kids.forEach(child => walk(child, depth + 1, shown && !folded));
    };
    walk(root, 0, true);
    return { rows, total, parents };
  }
}

function parentIn(site: Site, id: string): string | undefined {
  for (const node of Object.values(site.nodes)) if (node.children.includes(id)) return node.id;
  return undefined;
}
