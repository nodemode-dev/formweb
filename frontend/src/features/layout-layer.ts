import type { Box, Edge, Mapper } from './canvas-drag';
import type { Measure } from './layout-grid';
import { element, text } from '../ui/dom';
import '../styles/layout-grid.css';

export interface Scene { boxes: Box[]; tracks: Box[]; slots: Edge[]; guides: Edge[]; gaps: Measure[] }

export const EMPTY: Scene = { boxes: [], tracks: [], slots: [], guides: [], gaps: [] };

export function clip(box: Box, seen: Box): Box | null {
  const left = Math.max(box.left, seen.left), top = Math.max(box.top, seen.top);
  const right = Math.min(box.left + box.width, seen.left + seen.width), bottom = Math.min(box.top + box.height, seen.top + seen.height);
  return right >= left && bottom >= top ? { left, top, width: right - left, height: bottom - top } : null;
}

export function put(node: HTMLElement, box: Box | null): void {
  if (!box) { if (!node.hidden) node.hidden = true; return; }
  node.style.transform = `translate(${Math.round(box.left)}px, ${Math.round(box.top)}px)`;
  node.style.width = `${Math.round(box.width)}px`;
  node.style.height = `${Math.round(box.height)}px`;
  if (node.hidden) node.hidden = false;
}

export function bar(map: Mapper, edge: Edge, thick: number): Box {
  const a = edge.axis === 'y' ? map.toParent(edge.from, edge.at) : map.toParent(edge.at, edge.from);
  const b = edge.axis === 'y' ? map.toParent(edge.to, edge.at) : map.toParent(edge.at, edge.to);
  return edge.axis === 'y' ? { left: a.x, top: a.y - thick / 2, width: b.x - a.x, height: thick } : { left: a.x - thick / 2, top: a.y, width: thick, height: b.y - a.y };
}

class Pool {
  readonly host: HTMLElement;
  private nodes: HTMLElement[] = [];

  constructor(kind: string, private make: () => HTMLElement) {
    this.host = element('div', `fw-layout-${kind}s`);
  }

  fill(count: number, set: (node: HTMLElement, index: number) => void): void {
    while (this.nodes.length < count) {
      const node = this.make();
      node.hidden = true;
      this.nodes.push(node);
      this.host.append(node);
    }
    for (let index = 0; index < this.nodes.length; index++) {
      if (index < count) set(this.nodes[index], index);
      else if (!this.nodes[index].hidden) this.nodes[index].hidden = true;
    }
  }
}

export class LayoutLayer {
  readonly root = element('div', 'fw-layout');
  private boxes = new Pool('box', () => element('div', 'fw-layout-box'));
  private tracks = new Pool('track', () => element('div', 'fw-layout-track'));
  private slots = new Pool('slot', () => element('div', 'fw-layout-slot'));
  private guides = new Pool('guide', () => element('div', 'fw-layout-guide'));
  private gaps = new Pool('gap', () => { const node = element('div', 'fw-layout-gap'); node.append(element('span', 'fw-layout-gap-label')); return node; });

  constructor(overlay: HTMLElement) {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.append(this.boxes.host, this.tracks.host, this.slots.host, this.guides.host, this.gaps.host);
    overlay.append(this.root);
  }

  show(scene: Scene, map: Mapper, seen: Box): void {
    this.boxes.fill(scene.boxes.length, (node, index) => put(node, clip(map.box(scene.boxes[index]), seen)));
    this.tracks.fill(scene.tracks.length, (node, index) => put(node, clip(map.box(scene.tracks[index]), seen)));
    this.slots.fill(scene.slots.length, (node, index) => put(node, clip(bar(map, scene.slots[index], 1), seen)));
    this.guides.fill(scene.guides.length, (node, index) => put(node, clip(bar(map, scene.guides[index], 1), seen)));
    this.gaps.fill(scene.gaps.length, (node, index) => {
      const gap = scene.gaps[index];
      const a = gap.axis === 'y' ? map.toParent(gap.at, gap.from) : map.toParent(gap.from, gap.at);
      const b = gap.axis === 'y' ? map.toParent(gap.at, gap.to) : map.toParent(gap.to, gap.at);
      const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
      const inside = box.left >= seen.left && box.top >= seen.top && box.left + box.width <= seen.left + seen.width && box.top + box.height <= seen.top + seen.height;
      if (node.dataset.axis !== gap.axis) node.dataset.axis = gap.axis;
      text(node.firstElementChild as HTMLElement, `${Math.round(gap.value * 10) / 10} px`);
      put(node, inside ? box : null);
    });
    if (this.root.hidden) this.root.hidden = false;
  }

  hide(): void {
    if (!this.root.hidden) this.root.hidden = true;
  }
}
