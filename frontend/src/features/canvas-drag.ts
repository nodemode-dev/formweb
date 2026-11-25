import type { EditorState, Site } from '../types';
import type { Command } from './sections';
import { canContain, canDrag, dropTarget, moveCommands, movableIds, type DropTarget, type DropZone } from './panel/drop';
import { element } from '../ui/dom';
import '../styles/canvas-drag.css';

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

export interface CanvasDragHost {
  frame: HTMLIFrameElement;
  stage: HTMLElement;
  overlay: HTMLElement;
  loaded: () => Promise<void>;
  state: () => EditorState;
  ready: () => boolean;
  editing: () => boolean;
  root: () => string;
  selectionIds: () => string[];
  select: (id: string) => void;
  commands: (list: Command[]) => Promise<EditorState>;
  run: (action: () => unknown) => Promise<void>;
  status: (message: string, error?: boolean) => void;
}

const THRESHOLD = 6;
const EDGE = 40;
const SPEED = 14;
const PROXY_W = 280;
const PROXY_H = 120;

function clip(box: Box, seen: Box): Box | null {
  const left = Math.max(box.left, seen.left), top = Math.max(box.top, seen.top);
  const right = Math.min(box.left + box.width, seen.left + seen.width), bottom = Math.min(box.top + box.height, seen.top + seen.height);
  return right >= left && bottom >= top ? { left, top, width: right - left, height: bottom - top } : null;
}

function put(node: HTMLElement, box: Box | null): void {
  if (!box) { node.hidden = true; return; }
  node.style.transform = `translate(${Math.round(box.left)}px, ${Math.round(box.top)}px)`;
  node.style.width = `${Math.round(box.width)}px`;
  node.style.height = `${Math.round(box.height)}px`;
  node.hidden = false;
}

export function installCanvasDrag(host: CanvasDragHost): void {
  const map = new FrameMap(host.frame, host.stage);
  const proxy = element('div', 'fw-canvas-proxy');
  const line = element('div', 'fw-canvas-line');
  const outline = element('div', 'fw-canvas-box');
  proxy.hidden = line.hidden = outline.hidden = true;
  host.overlay.append(outline, line, proxy);
  void host.loaded().then(() => {
    const doc = host.frame.contentDocument;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent = 'html[data-fw-dragging],html[data-fw-dragging] *{cursor:grabbing!important;user-select:none!important}[data-fw-drag-source]{opacity:.4!important}';
    doc.head.append(style);
    doc.addEventListener('pointerdown', down => press(doc, down));
  });

  function draw(mark: Mark | null, seen: Box): void {
    outline.classList.toggle('is-into', !!mark?.into);
    put(outline, mark?.box ? clip(map.box(mark.box), seen) : null);
    const edge = mark?.edge;
    if (!edge) { line.hidden = true; return; }
    const a = edge.axis === 'y' ? map.toParent(edge.from, edge.at) : map.toParent(edge.at, edge.from);
    const b = edge.axis === 'y' ? map.toParent(edge.to, edge.at) : map.toParent(edge.at, edge.to);
    const bar = edge.axis === 'y' ? { left: a.x, top: a.y - 1, width: b.x - a.x, height: 2 } : { left: a.x - 1, top: a.y, width: 2, height: b.y - a.y };
    put(line, clip(bar, seen));
  }

  function press(doc: Document, down: PointerEvent): void {
    if (down.button !== 0 || down.ctrlKey || down.metaKey || down.shiftKey || down.altKey || !host.ready() || !host.editing()) return;
    const from = down.target as Element | null;
    if (!from?.closest || from.closest('[contenteditable="true"]') || (doc.activeElement as HTMLElement | null)?.isContentEditable) return;
    const grabbed = from.closest<HTMLElement>('[data-fw-id]');
    const pressed = grabbed?.dataset.fwId;
    if (!grabbed || !pressed || !host.selectionIds().includes(pressed)) return;
    const win = doc.defaultView!;
    const start = map.toParent(down.clientX, down.clientY);
    let pointer = start;
    let ids: string[] = [];
    let dragging = false;
    let spot: Spot | null = null;
    let grab = { x: 0, y: 0 };
    let frame = 0;
    let aborted = false;

    const tick = (): void => {
      frame = 0;
      if (!dragging) return;
      const seen = map.visible();
      const across = pointer.x >= seen.left && pointer.x <= seen.left + seen.width;
      const step = !across ? 0 : pointer.y < seen.top + EDGE ? -SPEED : pointer.y > seen.top + seen.height - EDGE ? SPEED : 0;
      if (step) {
        const scroller = doc.scrollingElement;
        const before = scroller?.scrollTop ?? 0;
        if (scroller) scroller.scrollTop += step / map.scale;
        if (scroller?.scrollTop === before) host.stage.scrollTop += step;
        place();
      }
      frame = requestAnimationFrame(tick);
    };

    const track = (event: PointerEvent): void => {
      pointer = event.view === win ? map.toParent(event.clientX, event.clientY) : { x: event.clientX, y: event.clientY };
    };
    const place = (): void => {
      proxy.style.transform = `translate(${Math.round(pointer.x - grab.x)}px, ${Math.round(pointer.y - grab.y)}px)`;
      const seen = map.visible();
      const inside = pointer.x >= seen.left && pointer.x <= seen.left + seen.width && pointer.y >= seen.top && pointer.y <= seen.top + seen.height;
      const at = map.toFrame(pointer.x, pointer.y);
      const site = host.state().site;
      spot = inside ? findDrop(doc, site, host.root(), ids, at.x, at.y) : null;
      draw(spot ? markOf(doc, site, ids, spot) : null, seen);
    };
    const begin = (event: PointerEvent): boolean => {
      const site = host.state().site;
      const picked = host.selectionIds();
      ids = movableIds(site, pressed === host.root() ? picked : picked.filter(id => id !== host.root()));
      if (!canDrag(site, ids)) {
        host.status(ids.includes(host.root()) ? 'The page itself cannot be moved.' : 'This element is part of a linked component and moves with it. Detach the instance to move it on its own.', true);
        return false;
      }
      dragging = true;
      const source = bounds(grabbed);
      const scaled = source ? map.box(source) : { left: start.x, top: start.y, width: 0, height: 0 };
      const width = Math.min(PROXY_W, Math.max(48, scaled.width)), height = Math.min(PROXY_H, Math.max(24, scaled.height));
      grab = { x: Math.min(Math.max(0, start.x - scaled.left), width), y: Math.min(Math.max(0, start.y - scaled.top), height) };
      const node = site.nodes[pressed];
      proxy.textContent = ids.length > 1 ? `${ids.length} elements` : node?.name || node?.tag || '';
      proxy.style.width = `${Math.round(width)}px`;
      proxy.style.height = `${Math.round(height)}px`;
      proxy.hidden = false;
      for (const id of ids) nodeElement(doc, id)?.setAttribute('data-fw-drag-source', '');
      doc.documentElement.setAttribute('data-fw-dragging', '');
      document.body.classList.add('fw-canvas-dragging');
      doc.getSelection()?.removeAllRanges();
      if (grabbed.isConnected && event.view === win) grabbed.setPointerCapture(event.pointerId);
      return true;
    };
    const end = (): void => {
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('dragstart', block, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      win.removeEventListener('keydown', keys, true);
      window.removeEventListener('keydown', keys, true);
      clear();
    };
    const clear = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      proxy.hidden = line.hidden = outline.hidden = true;
      doc.querySelectorAll('[data-fw-drag-source]').forEach(node => node.removeAttribute('data-fw-drag-source'));
      doc.documentElement.removeAttribute('data-fw-dragging');
      document.body.classList.remove('fw-canvas-dragging');
    };
    const swallow = (): void => {
      const stop = (click: Event): void => { click.preventDefault(); click.stopImmediatePropagation(); };
      for (const target of [win, window]) {
        target.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => target.removeEventListener('click', stop, { capture: true }), 0);
      }
    };
    const block = (event: Event): void => event.preventDefault();
    const keys = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !dragging) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragging = false;
      aborted = true;
      clear();
      host.status('Drag cancelled. Nothing moved.');
    };
    const move = (event: PointerEvent): void => {
      if (aborted) return;
      track(event);
      if (!dragging) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < THRESHOLD) return;
        if (!begin(event)) { end(); return; }
        frame = requestAnimationFrame(tick);
      }
      event.preventDefault();
      place();
    };
    const up = (event: PointerEvent): void => {
      if (aborted) { end(); swallow(); return; }
      if (!dragging) { end(); return; }
      track(event);
      place();
      const chosen = spot;
      end();
      swallow();
      if (!chosen?.commands.length) return;
      const list = chosen.commands;
      void host.run(async () => {
        await host.commands(list);
        if (!host.selectionIds().includes(ids[0])) host.select(ids[0]);
        host.status(ids.length === 1 ? 'Element moved. One undo step puts it back.' : `${ids.length} elements moved. One undo step puts them back.`);
      });
    };
    const cancel = (): void => { const was = dragging || aborted; end(); if (was) swallow(); };
    win.addEventListener('keydown', keys, true);
    window.addEventListener('keydown', keys, true);
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.addEventListener('dragstart', block, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
  }
}
