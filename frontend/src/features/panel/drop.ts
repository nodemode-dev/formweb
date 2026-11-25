import type { Site } from '../../types';
import type { Command } from '../sections';

export const CONTAINER_TAGS = ['main', 'section', 'div', 'article', 'aside', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'li', 'figure'];

export type DropZone = 'before' | 'after' | 'into';
export interface DropTarget { over: string; zone: DropZone; parent: string; anchor: string | null }

function parentIndex(site: Site): Map<string, string> {
  const up = new Map<string, string>();
  for (const node of Object.values(site.nodes)) for (const child of node.children) up.set(child, node.id);
  return up;
}

function inside(up: Map<string, string>, id: string, ancestor: string): boolean {
  for (let at: string | undefined = id; at; at = up.get(at)) if (at === ancestor) return true;
  return false;
}

const linked = (site: Site, id: string | undefined): boolean => !!id && !!site.nodes[id]?.componentSourceId;

export function canContain(site: Site, id: string): boolean {
  const node = site.nodes[id];
  return !!node && CONTAINER_TAGS.includes(node.tag) && !node.componentSourceId;
}

export function zoneAt(fraction: number, into: boolean): DropZone {
  if (!into) return fraction < 0.5 ? 'before' : 'after';
  return fraction < 1 / 3 ? 'before' : fraction > 2 / 3 ? 'after' : 'into';
}

export function movableIds(site: Site, ids: readonly string[]): string[] {
  const up = parentIndex(site);
  const order: string[] = [];
  const visit = (id: string): void => { order.push(id); site.nodes[id]?.children.forEach(visit); };
  site.pages.forEach(page => visit(page.root));
  const wanted = ids.filter(id => site.nodes[id] && !ids.some(other => other !== id && inside(up, id, other)));
  return wanted.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function canDrag(site: Site, ids: readonly string[]): boolean {
  if (!ids.length) return false;
  const up = parentIndex(site);
  const roots = new Set(site.pages.map(page => page.root));
  return ids.every(id => site.nodes[id] && !roots.has(id) && up.has(id) && !linked(site, up.get(id)));
}

export function dropTarget(site: Site, root: string, ids: readonly string[], over: string, zone: DropZone, open = false): DropTarget | null {
  const moving = movableIds(site, ids);
  if (!canDrag(site, moving) || !site.nodes[over] || moving.includes(over)) return null;
  const up = parentIndex(site);
  if (moving.some(id => inside(up, over, id))) return null;
  if (over === root) zone = 'into';
  const node = site.nodes[over];
  if (zone === 'after' && open && canContain(site, over)) {
    const first = node.children.find(child => !moving.includes(child)) ?? null;
    return { over, zone: 'into', parent: over, anchor: first };
  }
  if (zone === 'into') return canContain(site, over) ? { over, zone, parent: over, anchor: null } : null;
  const parent = up.get(over);
  if (!parent || linked(site, parent)) return null;
  if (!CONTAINER_TAGS.includes(site.nodes[parent].tag) && moving.some(id => up.get(id) !== parent)) return null;
  const siblings = site.nodes[parent].children;
  const anchor = zone === 'before' ? over : siblings.slice(siblings.indexOf(over) + 1).find(child => !moving.includes(child)) ?? null;
  return { over, zone, parent, anchor };
}

export function moveCommands(site: Site, ids: readonly string[], target: DropTarget): Command[] {
  const moving = movableIds(site, ids);
  const up = parentIndex(site);
  const kids = new Map<string, string[]>();
  const list = (id: string): string[] => {
    let found = kids.get(id);
    if (!found) { found = [...site.nodes[id].children]; kids.set(id, found); }
    return found;
  };
  const out: Command[] = [];
  for (const id of moving) {
    const from = up.get(id);
    if (!from) continue;
    const old = list(from);
    const was = old.indexOf(id);
    old.splice(was, 1);
    const into = list(target.parent);
    const index = target.anchor ? into.indexOf(target.anchor) : into.length;
    into.splice(index < 0 ? into.length : index, 0, id);
    up.set(id, target.parent);
    if (from !== target.parent || was !== index) out.push({ command: 'node.move', params: { id, parent: target.parent, index: index < 0 ? into.length - 1 : index } });
  }
  return out;
}
