import type { Site } from '../types';
import type { Command } from './sections';
import { canContain, dropTarget, moveCommands, type DropTarget, type DropZone } from './panel/drop';

export type Axis = 'x' | 'y';
export interface Flow { axis: Axis; reverse: boolean }
export interface Box { left: number; top: number; width: number; height: number }

export function flowOf(container: Element | null): Flow {
  const view = container?.ownerDocument.defaultView;
  if (!container || !view) return { axis: 'y', reverse: false };
  const style = view.getComputedStyle(container);
  if (style.display.includes('flex')) return { axis: style.flexDirection.startsWith('row') ? 'x' : 'y', reverse: style.flexDirection.endsWith('reverse') };
  if (style.display.includes('grid')) {
    const columns = style.gridTemplateColumns.split(/\s+/).filter(track => track && track !== 'none').length;
    return { axis: style.gridAutoFlow.startsWith('column') || columns > 1 ? 'x' : 'y', reverse: false };
  }
  return { axis: 'y', reverse: false };
}

export function nodeParent(element: Element): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) if (at.dataset.fwId && at.style.display !== 'contents') return at;
  return null;
}

export class FrameMap {
  constructor(private frame: HTMLIFrameElement, private stage: HTMLElement) {}

  private origin(): { left: number; top: number; scale: number } {
    const rect = this.frame.getBoundingClientRect();
    const scale = this.frame.offsetWidth ? rect.width / this.frame.offsetWidth : 1;
    return { left: rect.left + this.frame.clientLeft * scale, top: rect.top + this.frame.clientTop * scale, scale };
  }

  get scale(): number { return this.origin().scale; }

  toParent(x: number, y: number): { x: number; y: number } {
    const at = this.origin();
    return { x: at.left + x * at.scale, y: at.top + y * at.scale };
  }

  toFrame(x: number, y: number): { x: number; y: number } {
    const at = this.origin();
    return { x: (x - at.left) / at.scale, y: (y - at.top) / at.scale };
  }

  box(rect: DOMRect | Box): Box {
    const at = this.origin();
    return { left: at.left + rect.left * at.scale, top: at.top + rect.top * at.scale, width: rect.width * at.scale, height: rect.height * at.scale };
  }

  visible(): Box {
    const frame = this.frame.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const left = Math.max(frame.left, stage.left), top = Math.max(frame.top, stage.top);
    const right = Math.min(frame.right, stage.right), bottom = Math.min(frame.bottom, stage.bottom);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
}

export interface Spot { target: DropTarget; commands: Command[] }
export interface Edge { axis: Axis; at: number; from: number; to: number }
export interface Mark { edge: Edge | null; box: Box | null; into: boolean }

const BAND = 12;

export function nodeElement(doc: Document, id: string): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[data-fw-id="${CSS.escape(id)}"]`);
}

export function bounds(node: HTMLElement): Box | null {
  if (node.style.display === 'contents') {
    const parts = Array.from(node.children).map(child => bounds(child as HTMLElement)).filter((box): box is Box => !!box);
    if (!parts.length) return null;
    const left = Math.min(...parts.map(box => box.left)), top = Math.min(...parts.map(box => box.top));
    return { left, top, width: Math.max(...parts.map(box => box.left + box.width)) - left, height: Math.max(...parts.map(box => box.top + box.height)) - top };
  }
  const rect = node.getBoundingClientRect();
  return rect.width || rect.height ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

const span = (box: Box, axis: Axis): [number, number] => axis === 'x' ? [box.left, box.width] : [box.top, box.height];
const distance = (box: Box, x: number, y: number): number => Math.hypot(Math.max(box.left - x, 0, x - box.left - box.width), Math.max(box.top - y, 0, y - box.top - box.height));

export function findDrop(doc: Document, site: Site, root: string, ids: readonly string[], x: number, y: number): Spot | null {
  const view = doc.documentElement;
  if (x < 0 || y < 0 || x > view.clientWidth || y > view.clientHeight) return null;
  const moving = new Set(ids);
  const hit = doc.elementFromPoint(x, y)?.closest<HTMLElement>('[data-fw-id]') ?? nodeElement(doc, root);
  for (let at = hit; at; at = nodeParent(at)) if (moving.has(at.dataset.fwId!)) return null;
  const attempt = (over: string, zone: DropZone): Spot | undefined => {
    const target = dropTarget(site, root, ids, over, zone, false);
    return target ? { target, commands: moveCommands(site, ids, target) } : undefined;
  };
  const side = (box: Box, flow: Flow): DropZone => {
    const [lo, size] = span(box, flow.axis);
    return ((flow.axis === 'x' ? x : y) < lo + size / 2) !== flow.reverse ? 'before' : 'after';
  };
  const inner = (node: HTMLElement): Spot | undefined => {
    const id = node.dataset.fwId!;
    const kids = (site.nodes[id]?.children || []).filter(child => !moving.has(child))
      .map(child => { const found = nodeElement(doc, child); return { child, box: found && node.contains(found) ? bounds(found) : null }; })
      .filter((kid): kid is { child: string; box: Box } => !!kid.box);
    if (!kids.length) return attempt(id, 'into');
    const best = kids.reduce((a, b) => distance(b.box, x, y) < distance(a.box, x, y) ? b : a);
    return attempt(best.child, side(best.box, flowOf(node)));
  };
  const slot = (node: HTMLElement): Spot | undefined => {
    const id = node.dataset.fwId!;
    if (id === root) return inner(node);
    const box = bounds(node);
    if (!box) return undefined;
    const flow = flowOf(nodeParent(node));
    if (!canContain(site, id)) return attempt(id, side(box, flow));
    const [lo, size] = span(box, flow.axis);
    const at = flow.axis === 'x' ? x : y;
    const band = Math.min(BAND, size / 4);
    if (at - lo < band || lo + size - at < band) return attempt(id, side(box, flow)) ?? inner(node);
    return inner(node) ?? attempt(id, side(box, flow));
  };
  for (let at = hit; at; at = nodeParent(at)) {
    const spot = slot(at);
    if (spot) return spot.commands.length ? spot : null;
  }
  return null;
}

export function markOf(doc: Document, site: Site, ids: readonly string[], spot: Spot): Mark {
  const { target } = spot;
  const parent = nodeElement(doc, target.parent);
  const box = parent ? bounds(parent) : null;
  const flow = flowOf(parent);
  const edgeOf = (id: string, leading: boolean): Edge | null => {
    const found = nodeElement(doc, id);
    const at = found ? bounds(found) : null;
    if (!at) return null;
    const [lo, size] = span(at, flow.axis);
    const [from, length] = span(at, flow.axis === 'x' ? 'y' : 'x');
    return { axis: flow.axis, at: leading !== flow.reverse ? lo : lo + size, from, to: from + length };
  };
  if (target.zone === 'after') return { edge: edgeOf(target.over, false), box, into: false };
  if (target.anchor) return { edge: edgeOf(target.anchor, true), box, into: false };
  const last = [...(site.nodes[target.parent]?.children || [])].reverse().find(child => !ids.includes(child));
  if (last) return { edge: edgeOf(last, false), box, into: false };
  return { edge: null, box, into: true };
}
