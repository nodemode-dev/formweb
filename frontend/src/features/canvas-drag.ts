import type { EditorState, Site } from '../types';
import type { Command } from './sections';
import { canContain, canDrag, dropTarget, moveCommands, movableIds, type DropTarget, type DropZone } from './panel/drop';
import { element, text } from '../ui/dom';
import { label, t } from '../i18n';
import { HOLD_MS, SLOP, blockScroll, buzz, hushMenus, isTouch, openMenu, startsDrag, swallowClick } from './hold';
import { alignGuides, alignOf, gridCells, landing, lineDistance, nearestSlot, pixels, slotsOf, spacing, trackSizes, type Slot } from './layout-grid';
import { EMPTY, LayoutLayer, bar, clip, put, type Scene } from './layout-layer';
import type { CommandDef } from '../ui/shell';
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

export interface Mapper {
  toParent: (x: number, y: number) => { x: number; y: number };
  box: (rect: Box) => Box;
}

export class FrameMap {
  constructor(private frame: HTMLIFrameElement, private stage: HTMLElement) {}

  private origin(): { left: number; top: number; scale: number } {
    const rect = this.frame.getBoundingClientRect();
    const scale = this.frame.offsetWidth ? rect.width / this.frame.offsetWidth : 1;
    return { left: rect.left + this.frame.clientLeft * scale, top: rect.top + this.frame.clientTop * scale, scale };
  }

  get scale(): number { return this.origin().scale; }

  still(): Mapper {
    const at = this.origin();
    return {
      toParent: (x, y) => ({ x: at.left + x * at.scale, y: at.top + y * at.scale }),
      box: rect => ({ left: at.left + rect.left * at.scale, top: at.top + rect.top * at.scale, width: rect.width * at.scale, height: rect.height * at.scale })
    };
  }

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

export interface Spot { target: DropTarget; commands: Command[]; line?: Edge; lane?: string }
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
export interface Lane { id: string; flow: Flow; kids: { child: string; box: Box }[]; slots: Slot[] }

export class Lanes {
  measured = 0;
  private known = new Map<string, Lane>();
  private scroll = '';

  constructor(private doc: Document, private ids: readonly string[]) {}

  of(site: Site, node: HTMLElement): Lane {
    const view = this.doc.defaultView;
    const scroll = `${view?.scrollX ?? 0},${view?.scrollY ?? 0}`;
    if (scroll !== this.scroll) { this.known.clear(); this.scroll = scroll; }
    const id = node.dataset.fwId!;
    const known = this.known.get(id);
    if (known) return known;
    const moving = new Set(this.ids);
    const kids = (site.nodes[id]?.children || []).filter(child => !moving.has(child))
      .map(child => { const found = nodeElement(this.doc, child); return { child, box: found && node.contains(found) ? bounds(found) : null }; })
      .filter((kid): kid is { child: string; box: Box } => !!kid.box);
    const flow = flowOf(node);
    const lane = { id, flow, kids, slots: slotsOf(kids.map(kid => kid.box), flow) };
    this.known.set(id, lane);
    this.measured++;
    return lane;
  }
}

export function findDrop(doc: Document, site: Site, root: string, ids: readonly string[], x: number, y: number, lanes = new Lanes(doc, ids)): Spot | null {
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
  const placed = (spot: Spot | undefined, lane: Lane, line?: Edge): Spot | undefined => {
    if (!spot) return undefined;
    if (!line) {
      const index = spot.target.anchor ? lane.kids.findIndex(kid => kid.child === spot.target.anchor) : lane.kids.length;
      line = lane.slots[index]?.lines.reduce((a, b) => lineDistance(b, x, y) < lineDistance(a, x, y) ? b : a);
    }
    return { ...spot, line, lane: lane.id };
  };
  const inner = (node: HTMLElement): Spot | undefined => {
    const id = node.dataset.fwId!;
    const lane = lanes.of(site, node);
    const near = nearestSlot(lane.slots, x, y);
    if (!near) { const spot = attempt(id, 'into'); return spot && { ...spot, lane: id }; }
    const kid = lane.kids[near.index];
    return placed(kid ? attempt(kid.child, 'before') : attempt(lane.kids[lane.kids.length - 1].child, 'after'), lane, near.line);
  };
  const beside = (node: HTMLElement, zone: DropZone): Spot | undefined => {
    const spot = attempt(node.dataset.fwId!, zone);
    const parent = spot ? nodeElement(doc, spot.target.parent) : null;
    return spot && parent ? placed(spot, lanes.of(site, parent)) : spot;
  };
  const slot = (node: HTMLElement): Spot | undefined => {
    const id = node.dataset.fwId!;
    if (id === root) return inner(node);
    const box = bounds(node);
    if (!box) return undefined;
    const flow = flowOf(nodeParent(node));
    if (!canContain(site, id)) return beside(node, side(box, flow));
    const [lo, size] = span(box, flow.axis);
    const at = flow.axis === 'x' ? x : y;
    const parent = nodeParent(node)?.dataset.fwId;
    const sibling = parent !== undefined && ids.some(other => site.nodes[parent]?.children.includes(other));
    const band = sibling ? size / 4 : Math.min(BAND, size / 4);
    if (at - lo < band || lo + size - at < band) return beside(node, side(box, flow)) ?? inner(node);
    return inner(node) ?? beside(node, side(box, flow));
  };
  for (let at = hit; at; at = nodeParent(at)) {
    const spot = slot(at);
    if (spot) return spot;
  }
  return null;
}

export function markOf(doc: Document, site: Site, ids: readonly string[], spot: Spot): Mark {
  const { target } = spot;
  const parent = nodeElement(doc, target.parent);
  const box = parent ? bounds(parent) : null;
  if (spot.line) return { edge: spot.line, box, into: false };
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
const PROXY_MIN_W = 180;
const PROXY_H = 120;

const MOVE_CURSOR = 'html:not([data-fw-dragging]):not([data-fw-holding]) [data-fw-selected]:not(body>*):not([contenteditable=true]):hover,html:not([data-fw-dragging]):not([data-fw-holding]) [data-fw-marked]:not(body>*):not([contenteditable=true]):hover{cursor:move}';
const OUTLINES_KEY = 'formweb.canvas.layout-outlines';
const HINT_KEY = 'formweb.canvas.drag-hint';
const MAX_BOXES = 400;

function remembered(store: () => Storage, key: string): boolean {
  try { return store().getItem(key) === '1'; } catch { return false; }
}

function remember(store: () => Storage, key: string, on: boolean): void {
  try { store().setItem(key, on ? '1' : '0'); } catch { }
}

export function gridTracks(node: HTMLElement): Box[] {
  const view = node.ownerDocument.defaultView;
  const box = bounds(node);
  if (!view || !box) return [];
  const style = view.getComputedStyle(node);
  if (!style.display.includes('grid')) return [];
  const left = pixels(style.borderLeftWidth) + pixels(style.paddingLeft), top = pixels(style.borderTopWidth) + pixels(style.paddingTop);
  const content = { left: box.left + left, top: box.top + top, width: box.width - left - pixels(style.borderRightWidth) - pixels(style.paddingRight), height: box.height - top - pixels(style.borderBottomWidth) - pixels(style.paddingBottom) };
  return gridCells(content, trackSizes(style.gridTemplateColumns), trackSizes(style.gridTemplateRows), pixels(style.columnGap), pixels(style.rowGap)).slice(0, MAX_BOXES);
}

export function slotHints(doc: Document, lane: Lane, index: number, line: Edge): Pick<Scene, 'guides' | 'gaps'> {
  const view = doc.defaultView;
  const node = nodeElement(doc, lane.id);
  if (!view || !node) return { guides: [], gaps: [] };
  const side = lane.flow.axis === 'x' ? ['top', 'height'] as const : ['left', 'width'] as const;
  const near = (kid: { box: Box } | undefined): Box | null => kid && Math.min(line.to, kid.box[side[0]] + kid.box[side[1]]) - Math.max(line.from, kid.box[side[0]]) > 0 ? kid.box : null;
  const before = near(lane.kids[index - 1]), after = near(lane.kids[index]);
  const style = view.getComputedStyle(node);
  const neighbours = [before, after].filter((box): box is Box => !!box);
  const guides = alignGuides(neighbours, lane.flow, alignOf(style.display, lane.flow, style.alignItems, style.justifyItems), line);
  if (style.display.includes('flex') || style.display.includes('grid')) {
    const gap = pixels(lane.flow.axis === 'x' ? style.columnGap : style.rowGap);
    return { guides, gaps: spacing(before, after, lane.flow, gap, gap) };
  }
  const margin = (kid: { child: string } | undefined, edge: 'marginBottom' | 'marginTop'): number => {
    const found = kid ? nodeElement(doc, kid.child) : null;
    return found ? pixels(view.getComputedStyle(found)[edge]) : 0;
  };
  return { guides, gaps: spacing(before, after, lane.flow, before ? margin(lane.kids[index - 1], 'marginBottom') : 0, after ? margin(lane.kids[index], 'marginTop') : 0) };
}

export function installCanvasDrag(host: CanvasDragHost): { commands: CommandDef[] } {
  const map = new FrameMap(host.frame, host.stage);
  const proxy = element('div', 'fw-canvas-proxy');
  const proxyName = element('span', 'fw-canvas-proxy-name');
  const proxyWhere = element('span', 'fw-canvas-proxy-where');
  proxy.append(proxyName, proxyWhere);
  const line = element('div', 'fw-canvas-line');
  const outline = element('div', 'fw-canvas-box');
  proxy.hidden = line.hidden = outline.hidden = true;
  host.overlay.append(outline, line, proxy);
  const layer = new LayoutLayer(host.overlay);
  let blocking = false;
  let dragOn = false;
  let outlinesOn = remembered(() => localStorage, OUTLINES_KEY);
  let canvasDoc: Document | null = null;
  let pressedAt = -Infinity;
  let painting = 0;
  let resized: (() => void) | null = null;
  const watcher = new MutationObserver(() => schedule());
  const schedule = (): void => { if (!painting) painting = requestAnimationFrame(paint); };
  const sized = new ResizeObserver(() => schedule());
  sized.observe(host.frame);
  sized.observe(host.stage);
  host.stage.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  function chain(doc: Document): HTMLElement[] {
    const site = host.state().site;
    const root = host.root();
    const up = new Map<string, string>();
    for (const node of Object.values(site.nodes)) for (const child of node.children) up.set(child, node.id);
    const wanted = new Set<string>();
    for (const id of host.selectionIds()) {
      if (id === root) wanted.add(root);
      for (let at = up.get(id); at; at = at === root ? undefined : up.get(at)) wanted.add(at);
    }
    return [...wanted].map(id => nodeElement(doc, id)).filter((node): node is HTMLElement => !!node);
  }

  function paint(): void {
    painting = 0;
    if (dragOn) { resized?.(); return; }
    const doc = canvasDoc;
    if (!outlinesOn || !doc || !host.ready() || !host.editing() || !host.frame.offsetWidth) { layer.hide(); return; }
    const nodes = chain(doc);
    const boxes = nodes.map(node => bounds(node)).filter((box): box is Box => !!box);
    layer.show({ ...EMPTY, boxes, tracks: nodes.flatMap(gridTracks).slice(0, MAX_BOXES) }, map.still(), map.visible());
  }

  function watch(): void {
    watcher.disconnect();
    if (outlinesOn && canvasDoc) watcher.observe(canvasDoc, { subtree: true, childList: true, attributes: true, characterData: true });
    schedule();
  }

  function hint(records: MutationRecord[]): void {
    if (performance.now() - pressedAt > 1500 || remembered(() => sessionStorage, HINT_KEY)) return;
    const picked = records.some(record => { const node = record.target as HTMLElement; return node.hasAttribute('data-fw-selected') && node.parentElement !== node.ownerDocument.body; });
    if (!picked) return;
    remember(() => sessionStorage, HINT_KEY, true);
    host.status('Tip: drag a selected element to move it; on a touch screen, hold it first. It snaps to the places the layout allows.');
  }

  void host.loaded().then(() => {
    const doc = host.frame.contentDocument;
    if (!doc) return;
    canvasDoc = doc;
    const style = doc.createElement('style');
    style.textContent = 'html[data-fw-dragging],html[data-fw-dragging] *{cursor:grabbing!important;user-select:none!important}[data-fw-drag-source]{opacity:.4!important}html{-webkit-touch-callout:none}html[data-fw-holding],html[data-fw-holding] *{-webkit-user-select:none!important;user-select:none!important;touch-action:none!important}[data-fw-lifted]{outline-style:solid!important;outline-width:3px!important;outline-offset:6px!important}' + MOVE_CURSOR;
    doc.head.append(style);
    blockScroll(doc, () => blocking);
    doc.addEventListener('pointerdown', () => { pressedAt = performance.now(); }, true);
    doc.addEventListener('pointerdown', down => press(doc, down));
    doc.defaultView?.addEventListener('scroll', schedule, { passive: true });
    new MutationObserver(hint).observe(doc, { subtree: true, attributes: true, attributeFilter: ['data-fw-selected'] });
    watch();
  });

  function draw(mark: Mark | null, seen: Box): void {
    outline.classList.toggle('is-into', !!mark?.into);
    put(outline, mark?.box ? clip(map.box(mark.box), seen) : null);
    const edge = mark?.edge;
    if (!edge) { line.hidden = true; return; }
    put(line, clip(bar(map, edge, 2), seen));
  }

  const toggle = (): void => {
    outlinesOn = !outlinesOn;
    remember(() => localStorage, OUTLINES_KEY, outlinesOn);
    watch();
    host.status(outlinesOn ? 'Layout outlines are on: the containers around the selected element and their grid tracks are outlined.' : 'Layout outlines are off.');
  };
  const commands: CommandDef[] = [
    { id: 'view.layout-outlines', label: 'Show layout outlines', menu: 'View', keys: 'Mod+Alt+G', group: 2, run: toggle, checked: () => outlinesOn, enabled: host.ready }
  ];

  function press(doc: Document, down: PointerEvent): void {
    if (!startsDrag(down) || !down.isPrimary || down.ctrlKey || down.metaKey || down.shiftKey || down.altKey || !host.ready() || !host.editing()) return;
    const from = down.target as Element | null;
    if (!from?.closest || from.closest('[contenteditable="true"]') || (doc.activeElement as HTMLElement | null)?.isContentEditable) return;
    const touch = isTouch(down);
    const grabbed = from.closest<HTMLElement>('[data-fw-id]');
    const pressed = grabbed?.dataset.fwId;
    if (!grabbed || !pressed || (!touch && !host.selectionIds().includes(pressed))) return;
    const win = doc.defaultView!;
    const page = host.root();
    const start = map.toParent(down.clientX, down.clientY);
    let pointer = start;
    let ids: string[] = [];
    let dragging = false;
    let spot: Spot | null = null;
    let grab = { x: 0, y: 0 };
    let frame = 0;
    let aborted = false;
    let held = false;
    let lifted = false;
    let timer = 0;
    let hush: (() => void) | null = null;
    let lanes = new Lanes(doc, []);
    let targets: Box[] = [];
    let base = { x: 0, y: 0 };
    let shown = '';
    const tracks = new Map<string, Box[]>();

    const measure = (): void => {
      const site = host.state().site, root = host.root();
      lanes = new Lanes(doc, ids);
      targets = [];
      tracks.clear();
      shown = '';
      const walk = (id: string): void => {
        const node = site.nodes[id];
        if (!node || ids.includes(id) || targets.length >= MAX_BOXES) return;
        if (canContain(site, id)) {
          const found = nodeElement(doc, id);
          const box = found ? bounds(found) : null;
          if (box) targets.push(box);
        }
        if (!node.componentSourceId) node.children.forEach(walk);
      };
      walk(root);
      base = { x: win.scrollX, y: win.scrollY };
      const size = `${window.innerWidth}x${window.innerHeight}x${map.scale}`;
      resized = () => { if (dragging && !aborted && `${window.innerWidth}x${window.innerHeight}x${map.scale}` !== size) { measure(); place(); } };
    };
    const scene = (): void => {
      const site = host.state().site;
      const origin = map.toParent(0, 0);
      const key = `${win.scrollX},${win.scrollY},${origin.x},${origin.y},${map.scale}|${spot ? `${spot.lane}|${spot.target.parent}|${spot.target.anchor}|${spot.line?.at}|${spot.line?.from}|${spot.commands.length}` : ''}`;
      if (key === shown) return;
      shown = key;
      const dx = base.x - win.scrollX, dy = base.y - win.scrollY;
      const out: Scene = { ...EMPTY, boxes: targets.map(box => ({ ...box, left: box.left + dx, top: box.top + dy })) };
      const node = spot?.lane ? nodeElement(doc, spot.lane) : null;
      if (spot && node) {
        const lane = lanes.of(site, node);
        const grid = `${spot.lane}|${win.scrollX},${win.scrollY}`;
        if (!tracks.has(grid)) tracks.set(grid, gridTracks(node));
        out.tracks = tracks.get(grid)!;
        out.slots = lane.slots.flatMap(slot => slot.lines);
        if (spot.line) {
          const index = spot.target.anchor ? lane.kids.findIndex(kid => kid.child === spot!.target.anchor) : lane.kids.length;
          if (index >= 0) Object.assign(out, slotHints(doc, lane, index, spot.line));
        }
      }
      layer.show(out, map.still(), map.visible());
      if (!spot) text(proxyWhere, '');
      else if (!spot.commands.length) label(proxyWhere, 'Stays where it is');
      else { const where = landing(site, ids, spot.target); label(proxyWhere, where.en, where.values); }
    };

    const tick = (): void => {
      frame = 0;
      if (!dragging) return;
      if (host.root() !== page || !host.editing()) { stop(); return; }
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
      spot = inside ? findDrop(doc, site, host.root(), ids, at.x, at.y, lanes) : null;
      draw(spot ? markOf(doc, site, ids, spot) : null, seen);
      scene();
    };
    const pick = (): boolean => {
      const site = host.state().site;
      const picked = host.selectionIds();
      ids = movableIds(site, pressed === host.root() ? picked : picked.filter(id => id !== host.root()));
      return canDrag(site, ids);
    };
    const refuse = (): void => host.status(ids.includes(host.root()) ? 'The page itself cannot be moved.' : 'This element is part of a linked component and moves with it. Detach the instance to move it on its own.', true);
    const hold = (): void => {
      timer = 0;
      held = true;
      hush = hushMenus([win, window]);
      if (!host.selectionIds().includes(pressed)) host.select(pressed);
      doc.documentElement.setAttribute('data-fw-holding', '');
      if (!pick()) return;
      lifted = true;
      blocking = true;
      grabbed.setAttribute('data-fw-lifted', '');
      buzz();
    };
    const begin = (event: PointerEvent): boolean => {
      if (!lifted && !pick()) { refuse(); return false; }
      dragging = true;
      blocking = true;
      grabbed.removeAttribute('data-fw-lifted');
      const source = bounds(grabbed);
      const scaled = source ? map.box(source) : { left: start.x, top: start.y, width: 0, height: 0 };
      const width = Math.min(PROXY_W, Math.max(PROXY_MIN_W, scaled.width)), height = Math.min(PROXY_H, Math.max(40, scaled.height));
      grab = { x: Math.min(Math.max(0, start.x - scaled.left), width), y: Math.min(Math.max(0, start.y - scaled.top), height) };
      const node = host.state().site.nodes[pressed];
      text(proxyName, ids.length > 1 ? `${ids.length} elements` : node?.name || node?.tag || '');
      text(proxyWhere, '');
      dragOn = true;
      measure();
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
      doc.removeEventListener('pointerdown', other, true);
      document.removeEventListener('pointerdown', other, true);
      win.removeEventListener('keydown', keys, true);
      window.removeEventListener('keydown', keys, true);
      clear();
    };
    const clear = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (timer) clearTimeout(timer);
      timer = 0;
      hush?.();
      hush = null;
      blocking = false;
      proxy.hidden = line.hidden = outline.hidden = true;
      doc.querySelectorAll('[data-fw-drag-source]').forEach(node => node.removeAttribute('data-fw-drag-source'));
      grabbed.removeAttribute('data-fw-lifted');
      doc.documentElement.removeAttribute('data-fw-dragging');
      doc.documentElement.removeAttribute('data-fw-holding');
      document.body.classList.remove('fw-canvas-dragging');
      if (dragging) doc.getSelection()?.removeAllRanges();
      resized = null;
      if (dragOn) { dragOn = false; layer.hide(); schedule(); }
    };
    const swallow = (): void => swallowClick([win, window], touch ? 400 : 0);
    const block = (event: Event): void => event.preventDefault();
    const keys = (event: KeyboardEvent): void => {
      if (!(dragging || held) || aborted || ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      const was = dragging;
      dragging = false;
      held = false;
      aborted = true;
      clear();
      if (was) host.status('Drag cancelled. Nothing moved.');
    };
    const move = (event: PointerEvent): void => {
      if (aborted || event.pointerId !== down.pointerId) return;
      track(event);
      if (!dragging) {
        const far = Math.hypot(pointer.x - start.x, pointer.y - start.y);
        if (touch && !lifted) {
          if (far < SLOP) return;
          if (held) refuse();
          end();
          return;
        }
        if (far < (touch ? SLOP : THRESHOLD)) return;
        if (!begin(event)) { aborted = true; return; }
        frame = requestAnimationFrame(tick);
      }
      event.preventDefault();
      place();
    };
    const up = (event: PointerEvent): void => {
      if (event.pointerId !== down.pointerId) return;
      if (aborted) { end(); swallow(); return; }
      if (!dragging) {
        const menu = held;
        track(event);
        end();
        if (!menu) return;
        swallow();
        const at = map.toFrame(pointer.x, pointer.y);
        openMenu(from.isConnected ? from : grabbed, at.x, at.y);
        return;
      }
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
        host.status(ids.length === 1 ? 'Element moved. One undo step puts it back.' : t('{0} elements moved. One undo step puts them back.', [ids.length]));
      });
    };
    const stop = (): void => {
      const was = dragging || aborted || held;
      const note = dragging;
      end();
      if (was) swallow();
      if (note) host.status('Drag cancelled. Nothing moved.');
    };
    const cancel = (event: PointerEvent): void => { if (event.pointerId === down.pointerId) stop(); };
    const other = (event: PointerEvent): void => { if (event.pointerId !== down.pointerId) stop(); };
    doc.addEventListener('pointerdown', other, true);
    document.addEventListener('pointerdown', other, true);
    win.addEventListener('keydown', keys, true);
    window.addEventListener('keydown', keys, true);
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.addEventListener('dragstart', block, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    if (touch) timer = window.setTimeout(hold, HOLD_MS);
  }

  return { commands };
}
