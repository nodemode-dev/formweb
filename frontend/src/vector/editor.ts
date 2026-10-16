import { commands as send, state } from '../api';
import type { Command, Site } from '../types';
import type { Canvas } from '../ui/canvas';
import { pathfinder, type PathfinderInput, type PathfinderOp } from './boolean';
import { cornerBasics, distanceFromWidget, radiusFromDistance, solveCorners, widgetDistance, applyCorners } from './corners';
import { addAnchor, averageAnchors, convertAnchors, deleteAnchors, joinEndpoints, offsetSubs, outlineStroke, scissorsAt, simplifySub } from './edit';
import {
  arcPath, autoSmooth, clonePath, dist, ellipsePath, formatPath, linePath, mapPath, moveAnchor, moveHandle, nearestOnPath, pathBounds, polyPath, polygonPath, rectPath, spiralPath, starPath, translate,
  type Anchor, type AnchorKind, type Corner, type CornerType, type Pt, type SubPath
} from './geometry';
import { clipHolder, moveCommands, outerGroup } from './arrange';
import { brushedPathCommands } from './brushcmd';
import { fitCurve, simplifyPolyline } from './fit';
import { EXTRA_TOOLS, Extras } from './extras';
import type { Frame as HostFrame, Host } from './host';
import { Ops } from './ops';
import { Overlay, type Scene, type SceneAnchor, type SceneHandle, type SceneWidget } from './overlay';
import { alignFixes, widthFixes } from './stroke';
import { typeFixes } from './typepath';
import { liveCopyOwner, liveFixes, liveSources } from './live';
import { parseTransform, symbolPaths, usesOf } from './symbols';
import { exportSvg, importSvg } from './svg';
import {
  CONTAINER_TAGS, VECTOR_TAGS, addPath, addSvg, defaultPaint, freshId, geometryAttrs, moveNode, paintAttrs, pathIds, readShape, removeNode, svgOf, updateAttrs, updateGeometry, viewBoxOf,
  type Paint, type Shape
} from './store';

export type ToolId = 'select' | 'direct' | 'pen' | 'curvature' | 'add' | 'delete' | 'convert' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'arc' | 'spiral' | 'scissors'
  | 'knife' | 'eraser' | 'shapebuilder' | 'width' | 'gradient' | 'transform' | 'paintbrush';

export interface VectorContext {
  canvas: Canvas;
  getSelected(): string;
  select(id: string): void;
  pageRoot(): string;
  notify?(message: string): void;
  panelHost?: HTMLElement;
}

export interface ShapeOptions { sides: number; points: number; ratio: number; slope: number; closedArc: boolean; decay: number; turns: number; radius: number }

interface Frame { left: number; top: number; sx: number; sy: number; vx: number; vy: number }
interface Ref { id: string; sub: number; idx: number }

type Gesture =
  | { kind: 'move'; start: Pt; base: Map<string, SubPath[]>; moved: boolean }
  | { kind: 'handle'; ref: Ref; which: 'in' | 'out'; base: SubPath[]; moved: boolean }
  | { kind: 'corner'; ref: Ref; base: Map<string, SubPath[]>; moved: boolean }
  | { kind: 'convert'; ref: Ref; base: SubPath[]; start: Pt; moved: boolean; retract?: boolean }
  | { kind: 'pen'; node: Anchor }
  | { kind: 'paint'; pts: Pt[] }
  | { kind: 'shape'; start: Pt; current: Pt; alt: boolean; shift: boolean }
  | { kind: 'marquee'; start: Pt; current: Pt; shift: boolean; click?: string }
  | { kind: 'pathmove'; start: Pt; base: Map<string, SubPath[]>; svg?: string; moved: boolean }
  | { kind: 'usemove'; id: string; start: Pt; x: number; y: number; nx: number; ny: number; moved: boolean };

const HIT = 7;
const TYPES: CornerType[] = ['round', 'inverted', 'chamfer'];
const NUDGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', a: 'direct', p: 'pen', m: 'rect', l: 'ellipse', '\\': 'line', c: 'scissors', '+': 'add', '-': 'delete', k: 'knife', e: 'transform', g: 'gradient', b: 'paintbrush' };
const SHIFT_KEYS: Record<string, ToolId> = { c: 'convert', m: 'shapebuilder', e: 'eraser', w: 'width' };

export class Editor {
  readonly overlay: Overlay;
  readonly extras: Extras;
  readonly ops: Ops;
  tool: ToolId | null = null;
  selection: string[] = [];
  anchors = new Set<string>();
  paint: Paint = { ...defaultPaint };
  options: ShapeOptions = { sides: 6, points: 5, ratio: 0.5, slope: 0.5, closedArc: false, decay: 0.8, turns: 4, radius: 0 };
  readonly listeners = new Set<() => void>();
  readonly cornerRequests = new Set<() => void>();
  shortcuts = true;
  fidelity = 2.5;
  activeBrush = '';
  symbolEdit: string | null = null;
  clipEdit: string | null = null;
  private drafts = new Map<string, SubPath[]>();
  private lastSvg: string | undefined;
  private cache = new Map<string, { key: string; shape: Shape }>();
  private frames = new Map<string, Frame>();
  private gesture: Gesture | null = null;
  private pen: SubPath | null = null;
  private pointer: Pt = [0, 0];
  private refs: Ref[] = [];
  private handleRefs: { ref: Ref; which: 'in' | 'out' }[] = [];
  private widgetRefs: Ref[] = [];
  private busy = false;
  private liveSkip = '';
  private lastDown = 0;

  constructor(readonly ctx: VectorContext) {
    this.overlay = new Overlay(ctx.canvas.shell);
    this.extras = new Extras(this.host());
    this.ops = new Ops(this.host(), () => this.extras.exit());
    const root = this.overlay.root;
    root.addEventListener('pointerdown', event => this.down(event));
    root.addEventListener('dblclick', event => this.double(event));
    root.addEventListener('contextmenu', event => event.preventDefault());
    window.addEventListener('pointermove', event => this.move(event));
    window.addEventListener('pointerup', event => this.up(event));
    document.addEventListener('keydown', event => this.key(event), true);
    new ResizeObserver(() => this.render()).observe(ctx.canvas.shell);
    void ctx.canvas.loaded().then(() => ctx.canvas.frame.contentWindow?.addEventListener('scroll', () => this.render(), { passive: true }));
  }

  site(): Site { return state().site; }

  host(): Host {
    return {
      site: () => this.site(),
      selection: () => this.selection,
      primary: () => this.ctx.getSelected(),
      setSelection: ids => {
        this.selection = ids;
        this.anchors.clear();
        if (ids.length) this.ctx.select(ids[ids.length - 1]);
        this.render();
        this.emit();
      },
      anchors: () => this.anchors,
      shape: id => this.shapeOf(id),
      frame: svg => this.frame(svg) as HostFrame | undefined,
      toShell: (f, p) => this.toShell(f, p),
      toLocal: (f, p) => this.toLocal(f, p),
      px: () => this.px(),
      commit: (cmds, select) => this.commit(cmds, select),
      notify: message => this.notify(message),
      render: () => this.render(),
      emit: () => this.emit(),
      activeSvg: () => this.activeSvg(),
      parentOf: id => this.parentIdOf(id),
      paint: () => this.paint,
      element: id => this.element(id),
      draft: (id, subs) => { this.drafts.set(id, subs); this.preview(id); },
      clearDrafts: () => this.endDrafts(),
      isolated: () => this.extras.iso,
      tool: () => this.tool,
      pick: p => this.pickPath(p)
    };
  }

  notify(message: string): void { this.ctx.notify?.(message); }

  emit(): void { this.listeners.forEach(listener => listener()); }

  setTool(tool: ToolId | null): void {
    if (this.pen) this.finishPen(false);
    this.tool = tool;
    this.gesture = null;
    if (tool === null) { this.anchors.clear(); }
    this.render();
    this.emit();
  }

  private sync(): void {
    const selected = this.ctx.getSelected();
    let site: Site;
    try { site = this.site(); } catch { return; }
    const copyOf = site.nodes[selected] ? liveCopyOwner(site, selected) : undefined;
    if (copyOf) {
      this.selection = liveSources(site, copyOf).filter(id => site.nodes[id]);
      this.anchors.clear();
      if (this.selection.length) this.ctx.select(this.selection[this.selection.length - 1]);
      return;
    }
    if (!this.selection.includes(selected)) {
      this.selection = site.nodes[selected] ? [selected] : [];
      this.anchors.clear();
    }
    this.selection = this.selection.filter(id => site.nodes[id]);
  }

  refresh(): void {
    this.sync();
    const site = this.site();
    for (const key of [...this.anchors]) if (!site.nodes[key.split('|')[0]]) this.anchors.delete(key);
    this.cache.forEach((_, id) => { if (!site.nodes[id]) this.cache.delete(id); });
    this.render();
    this.emit();
    this.reconcileLive(site);
  }

  private reconcileLive(site: Site): void {
    if (this.busy || this.gesture) return;
    const fixes = liveFixes(site, []);
    if (!fixes.length) return;
    const key = `${state().revision}|${fixes.length}`;
    if (key === this.liveSkip) return;
    this.liveSkip = key;
    void this.commit(fixes);
  }

  activeSvg(): string | undefined {
    const site = this.site();
    return svgOf(site, this.ctx.getSelected()) ?? (this.selection[0] ? svgOf(site, this.selection[0]) : undefined);
  }

  panelSvg(): string | undefined {
    const site = this.site();
    const svg = this.activeSvg();
    if (svg) return (this.lastSvg = svg);
    const selected = this.ctx.getSelected();
    return !selected || !site.nodes[selected] ? (this.lastSvg && site.nodes[this.lastSvg] ? this.lastSvg : undefined) : undefined;
  }

  private element(id: string): Element | null {
    return this.ctx.canvas.frame.contentDocument?.querySelector(`[data-fw-id="${id}"]`) ?? null;
  }

  private shellScale(): number {
    const shell = this.ctx.canvas.shell;
    return shell.getBoundingClientRect().width / (shell.offsetWidth || 1) || 1;
  }

  private frame(svgId: string): Frame | undefined {
    const cached = this.frames.get(svgId);
    if (cached) return cached;
    const el = this.element(svgId);
    const node = this.site().nodes[svgId];
    if (!el || !node) return undefined;
    const vb = viewBoxOf(node);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return undefined;
    const frame = { left: r.left, top: r.top, sx: r.width / vb[2], sy: r.height / vb[3], vx: vb[0], vy: vb[1] };
    this.frames.set(svgId, frame);
    return frame;
  }

  private toShell(f: Frame, p: Pt): Pt { return [f.left + (p[0] - f.vx) * f.sx, f.top + (p[1] - f.vy) * f.sy]; }
  private toLocal(f: Frame, p: Pt): Pt { return [(p[0] - f.left) / f.sx + f.vx, (p[1] - f.top) / f.sy + f.vy]; }

  private pt(event: MouseEvent): Pt {
    const rect = this.ctx.canvas.shell.getBoundingClientRect();
    const scale = this.shellScale();
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale];
  }

  private px(): number { return 1 / this.shellScale(); }

  shapeOf(id: string): Shape | undefined {
    const site = this.site();
    const node = site.nodes[id];
    if (!node) return undefined;
    const key = `${node.attrs.d ?? ''}|${node.attrs['data-fw-vector'] ?? ''}|${node.attrs.fill ?? ''}|${node.attrs.stroke ?? ''}|${node.attrs['stroke-width'] ?? ''}|${node.attrs['stroke-linecap'] ?? ''}|${node.attrs['stroke-linejoin'] ?? ''}|${node.attrs['stroke-miterlimit'] ?? ''}|${node.attrs['stroke-dasharray'] ?? ''}|${node.attrs['fill-rule'] ?? ''}|${node.attrs.opacity ?? ''}|${node.attrs['data-fw-align'] ?? ''}|${node.attrs['data-fw-weight'] ?? ''}`;
    let entry = this.cache.get(id);
    if (!entry || entry.key !== key) {
      const shape = readShape(site, id);
      if (!shape) return undefined;
      entry = { key, shape };
      this.cache.set(id, entry);
    }
    const draft = this.drafts.get(id);
    return draft ? { ...entry.shape, subs: draft } : entry.shape;
  }

  private selectedShapes(): Shape[] {
    return this.selection.map(id => this.shapeOf(id)).filter((s): s is Shape => !!s);
  }

  private anchorKey(ref: Ref): string { return `${ref.id}|${ref.sub}|${ref.idx}`; }

  private selectedRefs(): Ref[] {
    const out: Ref[] = [];
    for (const key of this.anchors) {
      const [id, sub, idx] = key.split('|');
      out.push({ id, sub: Number(sub), idx: Number(idx) });
    }
    return out;
  }

  render(): void {
    this.frames.clear();
    const tool = this.tool;
    const scene: Scene = {
      visible: tool !== null, capture: tool !== null, tool: tool ?? '', scale: this.shellScale(),
      outlines: [], anchors: [], handles: [], widgets: [], marquee: null, draft: '', rubber: ''
    };
    if (tool === null) { this.overlay.render(scene); return; }
    if (!this.gesture) this.sync();
    this.refs = []; this.handleRefs = []; this.widgetRefs = [];
    const showPoints = tool !== 'select' && tool !== 'pen' && tool !== 'curvature' && tool !== 'rect' && tool !== 'ellipse' && tool !== 'polygon' && tool !== 'star' && tool !== 'line' && tool !== 'arc' && tool !== 'spiral' && tool !== 'paintbrush' && !EXTRA_TOOLS.has(tool);
    const s = this.px();
    const margin = 16 * s;
    for (const shape of this.selectedShapes()) {
      const f = this.frame(shape.svg);
      if (!f) continue;
      scene.outlines.push({ d: formatPath(mapPath(applyCorners(shape.subs), p => this.toShell(f, p))), selected: true });
      if (!showPoints) continue;
      shape.subs.forEach((sub, si) => {
        const solved = tool === 'direct' ? solveCorners(sub) : null;
        sub.nodes.forEach((n, idx) => {
          const ref: Ref = { id: shape.id, sub: si, idx };
          const selected = this.anchors.has(this.anchorKey(ref));
          const [x, y] = this.toShell(f, [n.x, n.y]);
          this.refs.push(ref);
          const item: SceneAnchor = { x, y, selected, kind: n.kind, start: false };
          scene.anchors.push(item);
          const showHandles = selected || tool === 'convert' || (tool === 'direct' && this.neighbourSelected(shape.id, si, idx, sub));
          if (showHandles) {
            for (const which of ['in', 'out'] as const) {
              const h = n[which];
              if (!h) continue;
              const [hx, hy] = this.toShell(f, h);
              const handle: SceneHandle = { ax: x, ay: y, x: hx, y: hy, selected };
              scene.handles.push(handle);
              this.handleRefs.push({ ref, which });
            }
          }
          if (tool === 'direct' && selected) {
            const basics = cornerBasics(sub, idx);
            if (basics) {
              const fit = solved?.fits[idx] ?? null;
              const type: CornerType = n.corner?.type ?? 'round';
              const along = widgetDistance(basics.theta, fit?.d ?? 0) + margin / f.sx;
              const pos = this.toShell(f, [basics.P[0] + basics.bisector[0] * along, basics.P[1] + basics.bisector[1] * along]);
              const widget: SceneWidget = { x: pos[0], y: pos[1], limit: !!fit && (fit.clamped || fit.d >= basics.max - 0.01), type };
              scene.widgets.push(widget);
              this.widgetRefs.push(ref);
            }
          }
        });
      });
    }
    if (this.pen) {
      scene.draft = formatPath([this.pen]);
      this.pen.nodes.forEach((n, idx) => {
        this.refs.push({ id: '', sub: 0, idx });
        scene.anchors.push({ x: n.x, y: n.y, selected: false, kind: n.kind, start: idx === 0 });
      });
      const last = this.pen.nodes[this.pen.nodes.length - 1];
      if (last && !this.gesture) scene.rubber = formatPath([{ closed: false, nodes: [last, { x: this.pointer[0], y: this.pointer[1], in: null, out: null, kind: 'corner' }] }]);
    }
    const g = this.gesture;
    if (g?.kind === 'shape') scene.draft = formatPath(applyCorners(this.shapeSubs(g.start, g.current, g.alt, g.shift)));
    if (g?.kind === 'paint' && g.pts.length > 1) scene.draft = formatPath([polyPath(g.pts, false)]);
    if (g?.kind === 'marquee') scene.marquee = { x: g.start[0], y: g.start[1], w: g.current[0] - g.start[0], h: g.current[1] - g.start[1] };
    this.extras.decorate(scene);
    this.overlay.render(scene);
  }

  private neighbourSelected(id: string, si: number, idx: number, sub: SubPath): boolean {
    const n = sub.nodes.length;
    const prev = (idx - 1 + n) % n, next = (idx + 1) % n;
    return (sub.closed || idx > 0) && this.anchors.has(`${id}|${si}|${prev}`) || (sub.closed || idx < n - 1) && this.anchors.has(`${id}|${si}|${next}`);
  }

  private preview(id: string): void {
    const shape = this.shapeOf(id);
    const el = this.element(id);
    if (shape && el) el.setAttribute('d', formatPath(applyCorners(shape.subs)));
  }

  private restore(id: string): void {
    const el = this.element(id);
    const d = this.site().nodes[id]?.attrs.d;
    if (el && d !== undefined) el.setAttribute('d', d);
  }

  async commit(cmds: Command[], afterSelect?: string[]): Promise<boolean> {
    if (!cmds.length) { this.endDrafts(); return false; }
    const before = this.site();
    cmds = [...cmds, ...alignFixes(before, cmds), ...widthFixes(before, cmds), ...typeFixes(before, cmds)];
    cmds = [...cmds, ...liveFixes(before, cmds)];
    this.busy = true;
    const touched = [...this.drafts.keys()];
    try {
      await send(cmds);
      if (afterSelect?.length) {
        this.selection = afterSelect;
        this.ctx.select(afterSelect[afterSelect.length - 1]);
      }
      return true;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Vector edit failed.');
      touched.forEach(id => this.restore(id));
      return false;
    } finally {
      this.busy = false;
      this.endDrafts();
      this.refresh();
    }
  }

  private endDrafts(): void { this.drafts.clear(); }

  private pickPath(p: Pt): { id: string; kind: 'path' | 'svg' | 'other' } | undefined {
    const doc = this.ctx.canvas.frame.contentDocument;
    if (!doc) return undefined;
    const iso = this.extras.iso;
    for (const el of doc.elementsFromPoint(p[0], p[1])) {
      const raw = (el as HTMLElement).dataset?.fwId;
      const owner = raw && this.site().nodes[raw] ? liveCopyOwner(this.site(), raw) : undefined;
      const id = owner ? liveSources(this.site(), owner)[0] : raw;
      if (!id || !this.site().nodes[id]) continue;
      const tag = this.site().nodes[id].tag;
      if (iso && tag === 'path' && !pathIds(this.site(), iso).includes(id)) continue;
      return { id, kind: tag === 'path' ? 'path' : tag === 'svg' ? 'svg' : 'other' };
    }
    return undefined;
  }

  private sameSvgSelection(id: string): string[] {
    const site = this.site();
    const svg = svgOf(site, id);
    return this.selection.filter(other => svgOf(site, other) === svg);
  }

  private select(id: string, additive: boolean): void {
    const site = this.site();
    if (additive && this.selection.length && svgOf(site, id) === svgOf(site, this.selection[0])) {
      this.selection = this.selection.includes(id) ? this.selection.filter(other => other !== id) : [...this.selection, id];
      if (!this.selection.length) this.selection = [id];
    } else {
      this.selection = [id];
      this.anchors.clear();
    }
    this.ctx.select(id);
    this.render();
    this.emit();
  }

  private down(event: PointerEvent): void {
    if (this.tool !== null && event.button === 0) event.preventDefault();
    if (this.busy || this.tool === null || event.button !== 0) return;
    const target = (event.target as Element).closest('[data-role]');
    const role = target?.getAttribute('data-role') ?? 'capture';
    const index = Number(target?.getAttribute('data-i') ?? '-1');
    const p = this.pt(event);
    this.pointer = p;
    event.preventDefault();
    this.frames.clear();
    const tool = this.tool;
    if (role.startsWith('x-') || EXTRA_TOOLS.has(tool)) { if (this.extras.down(tool, role, index, p, event)) { this.render(); return; } }
    if (role === 'widget') { this.startCorner(index, event); return; }
    if (role === 'handle') { this.startHandle(index); return; }
    if (role === 'anchor') { this.downAnchor(index, event, p); return; }
    if (tool === 'pen' || tool === 'curvature') { this.downPen(p, event); return; }
    if (tool === 'paintbrush') { this.gesture = { kind: 'paint', pts: [p] }; this.render(); return; }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'polygon' || tool === 'star' || tool === 'line' || tool === 'arc' || tool === 'spiral') {
      this.gesture = { kind: 'shape', start: p, current: p, alt: event.altKey, shift: event.shiftKey };
      this.render();
      return;
    }
    this.downCapture(p, event);
  }

  private downCapture(p: Pt, event: PointerEvent): void {
    const tool = this.tool;
    const hit = this.symbolEdit || this.clipEdit ? undefined : this.pickPath(p);
    if (hit?.kind === 'other' && tool === 'select' && this.site().nodes[hit.id]?.tag === 'use') { this.startUseMove(hit.id, p); return; }
    if (hit?.kind === 'other' && event.shiftKey && (tool === 'select' || tool === 'direct')) return;
    if (hit?.kind === 'other' && (tool === 'select' || tool === 'direct')) { this.gesture = { kind: 'marquee', start: p, current: p, shift: false, click: hit.id }; return; }
    if (tool === 'select') {
      if (hit?.kind === 'path') {
        const outer = outerGroup(this.site(), hit.id, this.extras.iso);
        const unit = outer ? pathIds(this.site(), outer) : [hit.id];
        if (unit.length > 1 || outer) {
          const already = unit.every(id => this.selection.includes(id));
          if (!already || event.shiftKey) {
            const others = event.shiftKey ? this.selection.filter(id => !unit.includes(id)) : [];
            this.selection = already && event.shiftKey ? others : [...others, ...unit];
            this.anchors.clear();
            if (this.selection.length) this.ctx.select(this.selection[this.selection.length - 1]);
            this.render();
            this.emit();
          }
        } else if (!this.selection.includes(hit.id) || event.shiftKey) this.select(hit.id, event.shiftKey);
        this.gesture = { kind: 'pathmove', start: p, base: this.baseOf(this.selection), moved: false };
        return;
      }
      if (hit?.kind === 'svg') {
        this.selection = [];
        this.ctx.select(hit.id);
        this.gesture = { kind: 'pathmove', start: p, base: new Map(), svg: hit.id, moved: false };
        this.render();
        this.emit();
        return;
      }
      this.gesture = { kind: 'marquee', start: p, current: p, shift: event.shiftKey };
      return;
    }
    if (tool === 'add' || tool === 'scissors') { this.pathClick(p, tool); return; }
    if (hit?.kind === 'path' && !this.selection.includes(hit.id)) { this.select(hit.id, event.shiftKey); return; }
    if (tool === 'direct') {
      const segment = this.segmentAt(p);
      if (segment) {
        const sub = this.shapeOf(segment.id)!.subs[segment.sub];
        if (!event.shiftKey) this.anchors.clear();
        this.anchors.add(`${segment.id}|${segment.sub}|${segment.i}`);
        this.anchors.add(`${segment.id}|${segment.sub}|${segment.j % sub.nodes.length}`);
        this.gesture = { kind: 'move', start: p, base: this.baseOf(this.selection), moved: false };
        this.render();
        this.emit();
        return;
      }
      this.gesture = { kind: 'marquee', start: p, current: p, shift: event.shiftKey };
      if (!event.shiftKey) { this.anchors.clear(); this.render(); }
    }
  }

  private startUseMove(id: string, p: Pt): void {
    const node = this.site().nodes[id];
    const x = parseFloat(node?.attrs.x ?? '0') || 0, y = parseFloat(node?.attrs.y ?? '0') || 0;
    this.selection = [id];
    this.anchors.clear();
    this.ctx.select(id);
    this.gesture = { kind: 'usemove', id, start: p, x, y, nx: x, ny: y, moved: false };
    this.render();
    this.emit();
  }

  private dragUse(g: Extract<Gesture, { kind: 'usemove' }>, p: Pt): void {
    const svg = svgOf(this.site(), g.id);
    const f = svg ? this.frame(svg) : undefined;
    if (!f || (!g.moved && dist(p, g.start) < 2 * this.px())) return;
    g.moved = true;
    const m = parseTransform(this.site().nodes[g.id]?.attrs.transform), det = m[0] * m[3] - m[1] * m[2] || 1;
    const wx = (p[0] - g.start[0]) / f.sx, wy = (p[1] - g.start[1]) / f.sy;
    g.nx = Math.round((g.x + (m[3] * wx - m[2] * wy) / det) * 100) / 100;
    g.ny = Math.round((g.y + (m[0] * wy - m[1] * wx) / det) * 100) / 100;
    const el = this.element(g.id);
    el?.setAttribute('x', String(g.nx));
    el?.setAttribute('y', String(g.ny));
    this.render();
  }

  editSymbol(symbol: string): void {
    const site = this.site();
    const ids = symbolPaths(site, symbol);
    if (!ids.length) { this.notify('This symbol has no paths to edit.'); return; }
    this.symbolEdit = symbol;
    this.selection = ids;
    this.anchors.clear();
    this.ctx.select(ids[ids.length - 1]);
    this.setTool('direct');
  }

  leaveSymbol(): void {
    const symbol = this.symbolEdit;
    if (!symbol) return;
    this.symbolEdit = null;
    const site = this.site();
    const svg = svgOf(site, symbol);
    const use = svg ? usesOf(site, svg, symbol)[0] : undefined;
    this.selection = use ? [use] : [];
    this.anchors.clear();
    if (use) this.ctx.select(use);
    this.render();
    this.emit();
  }

  editClipContents(): void {
    const found = clipHolder(this.site(), this.selection);
    if (!found) { this.notify('Select a clipped group first.'); return; }
    this.leaveClip();
    const ids = pathIds(this.site(), found.group);
    this.selection = ids;
    this.anchors.clear();
    if (ids.length) this.ctx.select(ids[ids.length - 1]);
    this.extras.enter(found.group);
    this.setTool('direct');
  }

  editClipPath(): void {
    const found = clipHolder(this.site(), this.selection);
    if (!found) { this.notify('Select a clipped group first.'); return; }
    const ids = found.def.children.filter(id => this.site().nodes[id]?.tag === 'path' && this.site().nodes[id].name !== 'Mask background');
    if (!ids.length) { this.notify('Select a clipped group first.'); return; }
    this.extras.exit();
    this.clipEdit = found.group;
    this.selection = ids;
    this.anchors.clear();
    this.ctx.select(ids[ids.length - 1]);
    this.setTool('direct');
  }

  leaveClip(): void {
    const group = this.clipEdit;
    if (!group) return;
    this.clipEdit = null;
    this.selection = this.site().nodes[group] ? pathIds(this.site(), group) : [];
    this.anchors.clear();
    if (this.selection.length) this.ctx.select(this.selection[this.selection.length - 1]);
    this.render();
    this.emit();
  }

  private baseOf(ids: string[]): Map<string, SubPath[]> {
    const base = new Map<string, SubPath[]>();
    for (const id of ids) { const shape = this.shapeOf(id); if (shape) base.set(id, clonePath(shape.subs)); }
    return base;
  }

  private segmentAt(p: Pt): { id: string; sub: number; i: number; j: number } | undefined {
    for (const shape of this.selectedShapes()) {
      const f = this.frame(shape.svg);
      if (!f) continue;
      const local = this.toLocal(f, p);
      const hit = nearestOnPath(applyCorners(shape.subs), local);
      if (hit && hit.d * f.sx <= HIT * this.px() + 2) {
        const sub = shape.subs[hit.seg.sub];
        const raw = nearestOnPath(shape.subs, local);
        if (raw && sub) return { id: shape.id, sub: raw.seg.sub, i: raw.seg.i, j: raw.seg.j };
      }
    }
    return undefined;
  }

  private downAnchor(index: number, event: PointerEvent, p: Pt): void {
    const ref = this.refs[index];
    if (!ref) return;
    const tool = this.tool;
    if (ref.id === '') {
      if (this.pen && ref.idx === 0 && this.pen.nodes.length >= 2) { this.pen.closed = true; this.finishPen(true); }
      return;
    }
    const shape = this.shapeOf(ref.id);
    if (!shape) return;
    const key = this.anchorKey(ref);
    if (tool === 'delete') { this.deleteRefs([ref]); return; }
    if (tool === 'convert') {
      this.gesture = { kind: 'convert', ref, base: clonePath(shape.subs), start: p, moved: false };
      this.anchors.clear();
      this.anchors.add(key);
      this.render();
      return;
    }
    if (tool === 'scissors' || tool === 'add') { this.pathClick(p, tool); return; }
    if (event.shiftKey) { if (this.anchors.has(key)) this.anchors.delete(key); else this.anchors.add(key); }
    else if (!this.anchors.has(key)) { this.anchors.clear(); this.anchors.add(key); }
    this.gesture = { kind: 'move', start: p, base: this.baseOf(this.selection), moved: false };
    this.render();
    this.emit();
  }

  private startHandle(index: number): void {
    const item = this.handleRefs[index];
    const shape = item && this.shapeOf(item.ref.id);
    if (!item || !shape) return;
    this.gesture = { kind: 'handle', ref: item.ref, which: item.which, base: clonePath(shape.subs), moved: false };
  }

  private startCorner(index: number, event: PointerEvent): void {
    const ref = this.widgetRefs[index];
    if (!ref) return;
    if (event.altKey) { this.cycleCorners(); return; }
    this.gesture = { kind: 'corner', ref, base: this.baseOf(this.selection), moved: false };
  }

  private double(event: MouseEvent): void {
    const target = (event.target as Element).closest('[data-role]');
    if (target?.getAttribute('data-role') === 'widget') { this.cornerRequests.forEach(fn => fn()); return; }
    if (target?.getAttribute('data-role') === 'x-wpt') { this.extras.openWidthDialog(Number(target.getAttribute('data-i') ?? '-1')); return; }
    if (this.tool === 'select' && !this.pen) {
      const hit = this.pickPath(this.pt(event));
      const group = hit?.kind === 'path' ? outerGroup(this.site(), hit.id, this.extras.iso) : undefined;
      if (hit && group) { this.selection = [hit.id]; this.ctx.select(hit.id); this.extras.enter(group); return; }
      if (!hit || hit.kind !== 'path') this.extras.exit();
      return;
    }
    if (this.pen && this.pen.nodes.length >= 2) {
      this.pen.nodes.pop();
      this.finishPen(false);
    }
  }

  private penAlt(p: Pt): boolean {
    const tolerance = HIT * this.px();
    for (const shape of this.selectedShapes()) {
      const f = this.frame(shape.svg);
      if (!f) continue;
      for (let si = 0; si < shape.subs.length; si++) {
        for (let idx = 0; idx < shape.subs[si].nodes.length; idx++) {
          const n = shape.subs[si].nodes[idx];
          if (dist(this.toShell(f, [n.x, n.y]), p) > tolerance) continue;
          const ref: Ref = { id: shape.id, sub: si, idx };
          this.anchors.clear();
          this.anchors.add(this.anchorKey(ref));
          this.gesture = { kind: 'convert', ref, base: clonePath(shape.subs), start: p, moved: false, retract: true };
          this.render();
          return true;
        }
      }
    }
    return false;
  }

  private downPen(p: Pt, event: PointerEvent): void {
    if (event.altKey && this.tool === 'pen' && !this.pen && this.penAlt(p)) return;
    if (!this.pen) this.pen = { closed: false, nodes: [] };
    const last = this.pen.nodes[this.pen.nodes.length - 1];
    let at = event.shiftKey ? p : this.extras.snapPoint(p, new Set(), last ? [last.x, last.y] : undefined, true);
    if (event.shiftKey && last) {
      const dx = p[0] - last.x, dy = p[1] - last.y;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const l = Math.hypot(dx, dy);
      at = [last.x + Math.cos(angle) * l, last.y + Math.sin(angle) * l];
    }
    const node: Anchor = { x: at[0], y: at[1], in: null, out: null, kind: 'corner' };
    this.pen.nodes.push(node);
    if (this.tool === 'curvature') { autoSmooth(this.pen); this.render(); return; }
    this.gesture = { kind: 'pen', node };
    this.render();
  }

  private finishPen(closed: boolean): void {
    const pen = this.pen;
    this.pen = null;
    this.gesture = null;
    if (!pen || pen.nodes.length < 2) { this.render(); return; }
    pen.closed = closed || pen.closed;
    void this.commitNew([pen], !pen.closed);
  }

  private move(event: PointerEvent): void {
    if (this.tool === null) return;
    const p = this.pt(event);
    this.pointer = p;
    if (this.extras.move(p, event)) return;
    const g = this.gesture;
    if (!g) {
      if (this.pen) {
        const last = this.pen.nodes[this.pen.nodes.length - 1];
        this.pointer = this.extras.snapPoint(p, new Set(), last ? [last.x, last.y] : undefined, true);
        this.render();
      }
      return;
    }
    if (g.kind === 'pen') {
      const node = g.node;
      let q = p;
      if (event.shiftKey) {
        const dx = p[0] - node.x, dy = p[1] - node.y, angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
        q = [node.x + Math.cos(angle) * l, node.y + Math.sin(angle) * l];
      }
      if (dist(q, [node.x, node.y]) > 3 * this.px()) {
        node.out = q;
        if (event.altKey) node.kind = 'corner';
        else { node.in = [2 * node.x - q[0], 2 * node.y - q[1]]; node.kind = 'symmetric'; }
      }
      this.render();
      return;
    }
    if (g.kind === 'paint') { if (dist(g.pts[g.pts.length - 1], p) > 1.5 * this.px()) { g.pts.push(p); this.render(); } return; }
    if (g.kind === 'shape') { g.current = event.shiftKey ? p : this.extras.snapPoint(p, new Set(), g.start, true); g.alt = event.altKey; g.shift = event.shiftKey; this.render(); return; }
    if (g.kind === 'marquee') { g.current = p; this.render(); return; }
    if (g.kind === 'move') { this.dragAnchors(g, p, event.shiftKey); return; }
    if (g.kind === 'pathmove') { this.dragPaths(g, p, event.shiftKey); return; }
    if (g.kind === 'usemove') { this.dragUse(g, p); return; }
    if (g.kind === 'handle') { this.dragHandle(g, p, event.altKey); return; }
    if (g.kind === 'corner') { this.dragCorner(g, p); return; }
    if (g.kind === 'convert') { this.dragConvert(g, p); }
  }

  private delta(f: Frame, start: Pt, p: Pt, constrain: boolean): Pt {
    let dx = (p[0] - start[0]) / f.sx, dy = (p[1] - start[1]) / f.sy;
    if (constrain) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    return [dx, dy];
  }

  private dragAnchors(g: Extract<Gesture, { kind: 'move' }>, p: Pt, constrain: boolean): void {
    if (!g.moved && dist(p, g.start) < 2 * this.px()) return;
    g.moved = true;
    const aim = constrain ? p : this.snapDrag(g.base, g.start, p);
    for (const [id, base] of g.base) {
      const shape = this.shapeOf(id);
      const f = shape && this.frame(shape.svg);
      if (!shape || !f) continue;
      const [dx, dy] = this.delta(f, g.start, aim, constrain);
      const next = clonePath(base);
      next.forEach((sub, si) => sub.nodes.forEach((n, idx) => {
        if (this.anchors.has(`${id}|${si}|${idx}`)) moveAnchor(n, base[si].nodes[idx].x + dx, base[si].nodes[idx].y + dy);
      }));
      this.drafts.set(id, next);
      this.preview(id);
    }
    this.render();
  }

  private snapDrag(base: Map<string, SubPath[]>, start: Pt, p: Pt): Pt {
    const key = [...this.anchors][0];
    const [id, sub, idx] = key ? key.split('|') : [];
    const source = id ? base.get(id) : undefined;
    const shape = id ? this.shapeOf(id) : undefined;
    const f = shape && this.frame(shape.svg);
    const node = source?.[Number(sub)]?.nodes[Number(idx)];
    if (!node || !f) return p;
    const now: Pt = [...this.toShell(f, [node.x, node.y])] as Pt;
    now[0] += p[0] - start[0];
    now[1] += p[1] - start[1];
    const snapped = this.extras.snapPoint(now, new Set(base.keys()));
    return [p[0] + snapped[0] - now[0], p[1] + snapped[1] - now[1]];
  }

  private snapObject(base: Map<string, SubPath[]>, start: Pt, p: Pt): Pt {
    const first = [...base.keys()][0];
    const shape = first ? this.shapeOf(first) : undefined;
    const f = shape && this.frame(shape.svg);
    const box = pathBounds(applyCorners([...base.values()].flat()));
    if (!f || !box) return p;
    const cx = p[0] - start[0], cy = p[1] - start[1];
    const keys: Pt[] = [[box.x + box.w / 2, box.y + box.h / 2], [box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(q => {
      const s = this.toShell(f, q as Pt);
      return [s[0] + cx, s[1] + cy] as Pt;
    });
    let best: Pt | null = null, bestD = Infinity, from: Pt = keys[0];
    for (const q of keys) {
      const r = this.extras.snapPoint(q, new Set(base.keys()));
      const d = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (d > 1e-6 && d < bestD) { best = r; bestD = d; from = q; }
    }
    if (!best) { this.extras.clearGuides(); return p; }
    this.extras.snapPoint(from, new Set(base.keys()));
    return [p[0] + best[0] - from[0], p[1] + best[1] - from[1]];
  }

  private dragPaths(g: Extract<Gesture, { kind: 'pathmove' }>, p: Pt, constrain: boolean): void {
    if (!g.moved && dist(p, g.start) < 2 * this.px()) return;
    g.moved = true;
    if (g.svg) {
      const el = this.element(g.svg) as HTMLElement | null;
      const node = this.site().nodes[g.svg];
      if (!el || !node) return;
      const dx = p[0] - g.start[0], dy = p[1] - g.start[1];
      const left = parseFloat(node.styles.left || '0') || 0, top = parseFloat(node.styles.top || '0') || 0;
      el.style.left = `${left + (constrain && Math.abs(dy) > Math.abs(dx) ? 0 : dx)}px`;
      el.style.top = `${top + (constrain && Math.abs(dx) >= Math.abs(dy) ? 0 : dy)}px`;
      return;
    }
    for (const [id, base] of g.base) {
      const shape = this.shapeOf(id);
      const f = shape && this.frame(shape.svg);
      if (!shape || !f) continue;
      const [dx, dy] = this.delta(f, g.start, constrain ? p : this.snapObject(g.base, g.start, p), constrain);
      this.drafts.set(id, translate(base, dx, dy));
      this.preview(id);
    }
    this.render();
  }

  private dragHandle(g: Extract<Gesture, { kind: 'handle' }>, p: Pt, alt: boolean): void {
    const shape = this.shapeOf(g.ref.id);
    const f = shape && this.frame(shape.svg);
    if (!shape || !f) return;
    g.moved = true;
    const next = clonePath(g.base);
    moveHandle(next[g.ref.sub].nodes[g.ref.idx], g.which, this.toLocal(f, p), alt);
    this.drafts.set(g.ref.id, next);
    this.preview(g.ref.id);
    this.render();
  }

  private dragConvert(g: Extract<Gesture, { kind: 'convert' }>, p: Pt): void {
    const shape = this.shapeOf(g.ref.id);
    const f = shape && this.frame(shape.svg);
    if (!shape || !f) return;
    if (!g.moved && dist(p, g.start) < 3 * this.px()) return;
    g.moved = true;
    const next = clonePath(g.base);
    const node = next[g.ref.sub].nodes[g.ref.idx];
    const local = this.toLocal(f, p);
    node.out = local;
    node.in = [2 * node.x - local[0], 2 * node.y - local[1]];
    node.kind = 'symmetric';
    this.drafts.set(g.ref.id, next);
    this.preview(g.ref.id);
    this.render();
  }

  private dragCorner(g: Extract<Gesture, { kind: 'corner' }>, p: Pt): void {
    const shape = this.shapeOf(g.ref.id);
    const f = shape && this.frame(shape.svg);
    if (!shape || !f) return;
    g.moved = true;
    const base = g.base.get(g.ref.id);
    if (!base) return;
    const sub = base[g.ref.sub];
    const basics = cornerBasics(sub, g.ref.idx);
    if (!basics) return;
    const anchor = sub.nodes[g.ref.idx];
    const type: CornerType = anchor.corner?.type ?? 'round';
    const mode = anchor.corner?.mode ?? 'absolute';
    const local = this.toLocal(f, p);
    const along = (local[0] - basics.P[0]) * basics.bisector[0] + (local[1] - basics.P[1]) * basics.bisector[1];
    const s = Math.max(0, along - (16 * this.px()) / f.sx);
    const d = Math.min(distanceFromWidget(basics.theta, s), basics.max);
    const radius = radiusFromDistance(type, mode, basics.theta, d);
    this.setRadius(g.base, radius, { type, mode }, true);
    this.render();
  }

  private setRadius(base: Map<string, SubPath[]>, radius: number, like: { type: CornerType; mode: Corner['mode'] }, preview: boolean): void {
    for (const ref of this.selectedRefs()) {
      const source = base.get(ref.id);
      if (!source) continue;
      const draft = this.drafts.get(ref.id) ?? clonePath(source);
      const node = draft[ref.sub]?.nodes[ref.idx];
      if (!node || !cornerBasics(draft[ref.sub], ref.idx)) continue;
      node.corner = { type: node.corner?.type ?? like.type, mode: like.mode, radius };
      this.drafts.set(ref.id, draft);
    }
    if (preview) for (const id of base.keys()) if (this.drafts.has(id)) this.preview(id);
  }

  private up(event: PointerEvent): void {
    if (this.tool !== null && this.extras.up(this.pt(event), event)) return;
    this.extras.clearGuides();
    const g = this.gesture;
    if (!g || this.tool === null) return;
    const p = this.pt(event);
    if (g.kind === 'pen') { this.gesture = null; this.render(); return; }
    this.gesture = null;
    if (g.kind === 'paint') {
      const pts = [...g.pts, p];
      const err = Math.max(0.1, this.fidelity) * this.px();
      if (dist(pts[0], p) > 3 * this.px() || pts.length > 4) void this.commitNew([fitCurve(simplifyPolyline(pts, err * 0.3), err)], true, this.activeBrush);
      else this.render();
      return;
    }
    if (g.kind === 'shape') {
      if (dist(g.start, p) > 3 * this.px()) {
        const open = this.tool === 'line' || this.tool === 'spiral' || (this.tool === 'arc' && !this.options.closedArc);
        void this.commitNew(this.shapeSubs(g.start, event.shiftKey ? p : g.current, event.altKey, event.shiftKey), open);
      } else this.render();
      return;
    }
    if (g.kind === 'marquee') { this.finishMarquee(g, p); return; }
    if (g.kind === 'pathmove') {
      if (!g.moved) { this.render(); return; }
      if (g.svg) { void this.commitSvgMove(g.svg, p, g.start, event.shiftKey); return; }
      const deltas = new Map<string, Pt>();
      for (const [id, draft] of this.drafts) {
        const before = g.base.get(id);
        if (before?.[0]?.nodes[0] && draft[0]?.nodes[0]) deltas.set(id, [draft[0].nodes[0].x - before[0].nodes[0].x, draft[0].nodes[0].y - before[0].nodes[0].y]);
      }
      this.endDrafts();
      void this.commit(moveCommands(this.host(), deltas));
      return;
    }
    if (g.kind === 'usemove') {
      if (g.moved) void this.commit([updateAttrs(g.id, { x: String(g.nx), y: String(g.ny) })]); else this.render();
      return;
    }
    if (g.kind === 'convert' && !g.moved) {
      const next = clonePath(g.base);
      const node = next[g.ref.sub].nodes[g.ref.idx];
      if (g.retract && node.kind === 'corner' && !node.in && !node.out) { this.render(); return; }
      const kind: AnchorKind = g.retract || node.kind !== 'corner' ? 'corner' : 'smooth';
      next[g.ref.sub].nodes[g.ref.idx].kind = kind;
      const picks = new Map([[g.ref.sub, new Set([g.ref.idx])]]);
      convertAnchors(next, picks, kind);
      void this.commit([updateGeometry(g.ref.id, next)]);
      return;
    }
    if (!g.moved) { this.render(); return; }
    void this.commit([...this.drafts.keys()].map(id => updateGeometry(id, this.drafts.get(id)!)));
  }

  private async commitSvgMove(id: string, p: Pt, start: Pt, constrain: boolean): Promise<void> {
    const node = this.site().nodes[id];
    if (!node) return;
    let dx = p[0] - start[0], dy = p[1] - start[1];
    if (constrain) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const left = parseFloat(node.styles.left || '0') || 0, top = parseFloat(node.styles.top || '0') || 0;
    await this.commit([{ command: 'node.update', params: { id, patch: { styles: { position: node.styles.position || 'absolute', left: `${Math.round((left + dx) * 100) / 100}px`, top: `${Math.round((top + dy) * 100) / 100}px` } } } }]);
  }

  private finishMarquee(g: Extract<Gesture, { kind: 'marquee' }>, p: Pt): void {
    const x0 = Math.min(g.start[0], p[0]), x1 = Math.max(g.start[0], p[0]), y0 = Math.min(g.start[1], p[1]), y1 = Math.max(g.start[1], p[1]);
    if (x1 - x0 < 3 * this.px() && y1 - y0 < 3 * this.px()) {
      if (g.click) { this.selection = [g.click]; this.anchors.clear(); this.ctx.select(g.click); this.render(); this.emit(); return; }
      if (!g.shift) { this.anchors.clear(); if (this.tool === 'select') { this.selection = []; } }
      this.render();
      this.emit();
      return;
    }
    const site = this.site();
    if (this.tool === 'select') {
      const svg = this.activeSvg();
      const found: string[] = [];
      for (const id of svg ? pathIds(site, svg) : []) {
        const shape = this.shapeOf(id);
        const f = shape && this.frame(shape.svg);
        const box = shape && f && pathBounds(applyCorners(shape.subs));
        if (!box || !f) continue;
        const a = this.toShell(f, [box.x, box.y]), b = this.toShell(f, [box.x + box.w, box.y + box.h]);
        if (a[0] <= x1 && b[0] >= x0 && a[1] <= y1 && b[1] >= y0) found.push(id);
      }
      this.selection = g.shift ? [...new Set([...this.selection, ...found])] : found;
      if (found.length) this.ctx.select(found[found.length - 1]);
    } else {
      const candidates = this.selection.length ? this.selection : (this.activeSvg() ? pathIds(site, this.activeSvg()!) : []);
      if (!g.shift) this.anchors.clear();
      for (const id of candidates) {
        const shape = this.shapeOf(id);
        const f = shape && this.frame(shape.svg);
        if (!shape || !f) continue;
        shape.subs.forEach((sub, si) => sub.nodes.forEach((n, idx) => {
          const [x, y] = this.toShell(f, [n.x, n.y]);
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.anchors.add(`${id}|${si}|${idx}`);
        }));
      }
    }
    this.render();
    this.emit();
  }

  private pathClick(p: Pt, tool: ToolId): void {
    const tolerance = HIT * this.px();
    const cmds: Command[] = [];
    for (const shape of this.selectedShapes()) {
      const f = this.frame(shape.svg);
      if (!f) continue;
      const local = this.toLocal(f, p);
      const subs = clonePath(shape.subs);
      const tol = tolerance / f.sx;
      if (tool === 'add') {
        const added = addAnchor(subs, local, tol);
        if (added) { cmds.push(updateGeometry(shape.id, added.subs)); this.anchors.clear(); this.anchors.add(`${shape.id}|${added.sub}|${added.index}`); break; }
      } else if (scissorsAt(subs, local, tol)) { cmds.push(updateGeometry(shape.id, subs)); this.anchors.clear(); break; }
    }
    if (cmds.length) void this.commit(cmds);
    else {
      const hit = this.pickPath(p);
      if (hit?.kind === 'path') this.select(hit.id, false);
    }
  }

  private deleteRefs(refs: Ref[]): void {
    const byPath = new Map<string, Map<number, Set<number>>>();
    for (const ref of refs) {
      const m = byPath.get(ref.id) ?? new Map<number, Set<number>>();
      m.set(ref.sub, (m.get(ref.sub) ?? new Set()).add(ref.idx));
      byPath.set(ref.id, m);
    }
    const cmds: Command[] = [];
    for (const [id, picks] of byPath) {
      const shape = this.shapeOf(id);
      if (!shape) continue;
      const subs = deleteAnchors(clonePath(shape.subs), picks);
      cmds.push(subs.length ? updateGeometry(id, subs) : removeNode(id));
    }
    this.anchors.clear();
    void this.commit(cmds);
  }

  private nudge(dx: number, dy: number): void {
    const refs = this.selectedRefs();
    if (!refs.length) return;
    const cmds: Command[] = [];
    for (const id of new Set(refs.map(r => r.id))) {
      const shape = this.shapeOf(id);
      if (!shape) continue;
      const next = clonePath(shape.subs);
      for (const ref of refs) if (ref.id === id && next[ref.sub]?.nodes[ref.idx]) moveAnchor(next[ref.sub].nodes[ref.idx], next[ref.sub].nodes[ref.idx].x + dx, next[ref.sub].nodes[ref.idx].y + dy);
      cmds.push(updateGeometry(id, next));
    }
    void this.commit(cmds);
  }

  private key(event: KeyboardEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('input, textarea, select, [contenteditable=true]') || event.ctrlKey || event.metaKey || this.busy) return;
    try { state(); } catch { return; }
    if (this.tool === null) {
      const next = this.toolForKey(event);
      if (next) { this.setTool(next); event.preventDefault(); }
      return;
    }
    if (event.key === 'Escape') {
      if (this.extras.key(event)) { event.preventDefault(); return; }
      if (this.symbolEdit) { this.leaveSymbol(); event.preventDefault(); return; }
      if (this.clipEdit) { this.leaveClip(); event.preventDefault(); return; }
      if (this.pen) { this.finishPen(false); event.preventDefault(); return; }
      if (this.anchors.size) { this.anchors.clear(); this.render(); this.emit(); event.preventDefault(); return; }
      this.setTool(null);
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && this.pen) { this.finishPen(false); event.preventDefault(); return; }
    if ((event.key === 'Backspace' || event.key === 'Delete')) {
      if (this.pen) { this.pen.nodes.pop(); if (!this.pen.nodes.length) this.pen = null; this.render(); event.preventDefault(); event.stopPropagation(); return; }
      const refs = this.selectedRefs();
      if (refs.length) { this.deleteRefs(refs); event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (NUDGE_KEYS.has(event.key) && this.anchors.size) {
      const step = event.shiftKey ? 10 : 1;
      this.nudge(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (this.tool === 'polygon') { this.options.sides = Math.max(3, Math.min(120, this.options.sides + (event.key === 'ArrowUp' ? 1 : -1))); this.render(); this.emit(); event.preventDefault(); }
      if (this.tool === 'star') { this.options.points = Math.max(3, Math.min(120, this.options.points + (event.key === 'ArrowUp' ? 1 : -1))); this.render(); this.emit(); event.preventDefault(); }
      return;
    }
    const next = this.toolForKey(event);
    if (next) { this.setTool(next); event.preventDefault(); }
  }

  private toolForKey(event: KeyboardEvent): ToolId | undefined {
    if (!this.shortcuts || event.altKey) return undefined;
    if (event.shiftKey && SHIFT_KEYS[event.key.toLowerCase()]) return SHIFT_KEYS[event.key.toLowerCase()];
    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (!tool) return undefined;
    if (this.tool !== null || ['pen', 'rect', 'ellipse', 'line', 'paintbrush'].includes(tool)) return tool;
    const selected = this.site().nodes[this.ctx.getSelected()];
    return selected && VECTOR_TAGS.has(selected.tag) ? tool : undefined;
  }

  shapeSubs(a: Pt, b: Pt, alt: boolean, shift: boolean): SubPath[] {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const tool = this.tool;
    if (tool === 'line') {
      if (shift) { const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); dx = Math.cos(angle) * l; dy = Math.sin(angle) * l; }
      return [linePath(a, [a[0] + dx, a[1] + dy])];
    }
    if (tool === 'polygon' || tool === 'star' || tool === 'spiral') {
      const r = Math.hypot(dx, dy);
      const angle = shift ? Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12) : Math.atan2(dy, dx);
      if (tool === 'polygon') return [polygonPath(a[0], a[1], r, this.options.sides, angle)];
      if (tool === 'star') return [starPath(a[0], a[1], r, this.options.points, this.options.ratio, angle)];
      const sub = spiralPath(a[0], a[1], r, this.options.decay, this.options.turns, true);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return mapPath([sub], p => [a[0] + (p[0] - a[0]) * cos - (p[1] - a[1]) * sin, a[1] + (p[0] - a[0]) * sin + (p[1] - a[1]) * cos]);
    }
    if (shift && tool !== 'arc') { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
    let x = a[0], y = a[1];
    if (alt) { x -= dx; y -= dy; dx *= 2; dy *= 2; }
    const left = Math.min(x, x + dx), top = Math.min(y, y + dy), w = Math.abs(dx), h = Math.abs(dy);
    if (tool === 'ellipse') return [ellipsePath(left + w / 2, top + h / 2, w / 2, h / 2)];
    if (tool === 'arc') {
      const sub = arcPath(left, top, w, h, this.options.slope, this.options.closedArc);
      const flipX = dx < 0, flipY = dy > 0;
      return mapPath([sub], p => [flipX ? left + w - (p[0] - left) : p[0], flipY ? top + h - (p[1] - top) : p[1]]);
    }
    const sub = rectPath(left, top, w, h);
    if (this.options.radius > 0) for (const n of sub.nodes) n.corner = { type: 'round', radius: this.options.radius, mode: 'absolute' };
    return [sub];
  }

  paintFor(open: boolean): Paint {
    if (!open) return { ...this.paint };
    return { ...this.paint, fill: 'none', stroke: this.paint.stroke === 'none' ? this.paint.fill : this.paint.stroke, strokeWidth: Math.max(1, this.paint.strokeWidth) };
  }

  private container(): { id: string; el: Element | null } {
    const site = this.site();
    const selected = this.ctx.getSelected();
    let id = this.ctx.pageRoot();
    let current: string | undefined = selected;
    while (current && site.nodes[current]) {
      if (CONTAINER_TAGS.has(site.nodes[current].tag) && !site.nodes[current].binding) { id = current; break; }
      current = this.parentIdOf(current);
    }
    return { id, el: this.element(id) };
  }

  private parentIdOf(id: string): string | undefined {
    for (const node of Object.values(this.site().nodes)) if (node.children.includes(id)) return node.id;
    return undefined;
  }

  async commitNew(shellSubs: SubPath[], open: boolean, brush = ''): Promise<void> {
    const site = this.site();
    const paint = this.paintFor(open);
    const taken = new Set<string>();
    const cmds: Command[] = [];
    const pathId = freshId(site, taken, 'path');
    const svg = this.activeSvg();
    const f = svg ? this.frame(svg) : undefined;
    if (svg && f) {
      const local = mapPath(shellSubs, p => this.toLocal(f, p));
      cmds.push(...(brush ? brushedPathCommands(this.host(), taken, brush, svg, pathId, local, paint) : null) ?? [addPath(svg, pathId, local, paint)]);
    } else {
      const box = pathBounds(applyCorners(shellSubs)) ?? { x: 0, y: 0, w: 1, h: 1 };
      const pad = Math.ceil(paint.stroke === 'none' ? 2 : paint.strokeWidth / 2 + 2);
      const origin: Pt = [box.x - pad, box.y - pad];
      const holder = this.container();
      const rect = holder.el?.getBoundingClientRect();
      const svgId = freshId(site, taken, 'vector');
      if (holder.el && getComputedStyle(holder.el).position === 'static') cmds.push({ command: 'node.update', params: { id: holder.id, patch: { styles: { position: 'relative' } } } });
      cmds.push(addSvg(holder.id, svgId, { left: origin[0] - (rect?.left ?? 0), top: origin[1] - (rect?.top ?? 0), width: box.w + pad * 2, height: box.h + pad * 2 }));
      cmds.push(addPath(svgId, pathId, translate(shellSubs, -origin[0], -origin[1]), paint));
    }
    this.anchors.clear();
    this.render();
    await this.commit(cmds, [pathId]);
  }

  cornerRefs(): Ref[] {
    const refs = this.selectedRefs().filter(ref => this.shapeOf(ref.id)?.subs[ref.sub] && cornerBasics(this.shapeOf(ref.id)!.subs[ref.sub], ref.idx));
    if (refs.length) return refs;
    const all: Ref[] = [];
    for (const shape of this.selectedShapes()) shape.subs.forEach((sub, si) => sub.nodes.forEach((_, idx) => { if (cornerBasics(sub, idx)) all.push({ id: shape.id, sub: si, idx }); }));
    return this.anchors.size ? refs : all;
  }

  cornerState(): { count: number; selected: number; type: CornerType | 'mixed'; mode: Corner['mode'] | 'mixed'; radius: number | 'mixed' } {
    const refs = this.cornerRefs();
    const corners = refs.map(ref => this.shapeOf(ref.id)!.subs[ref.sub].nodes[ref.idx].corner);
    const same = <T,>(values: T[]): T | 'mixed' => (values.every(v => v === values[0]) ? values[0] : 'mixed');
    return {
      count: refs.length,
      selected: this.anchors.size,
      type: refs.length ? same(corners.map(c => c?.type ?? 'round')) : 'round',
      mode: refs.length ? same(corners.map(c => c?.mode ?? 'absolute')) : 'absolute',
      radius: refs.length ? same(corners.map(c => Math.round((c?.radius ?? 0) * 100) / 100)) : 0
    };
  }

  applyCorner(patch: Partial<Corner>): void {
    const refs = this.cornerRefs();
    if (!refs.length) return;
    const cmds: Command[] = [];
    for (const id of new Set(refs.map(r => r.id))) {
      const shape = this.shapeOf(id)!;
      const subs = clonePath(shape.subs);
      for (const ref of refs) {
        if (ref.id !== id) continue;
        const node = subs[ref.sub].nodes[ref.idx];
        const current = node.corner ?? { type: 'round', radius: 0, mode: 'absolute' };
        node.corner = { type: patch.type ?? current.type, mode: patch.mode ?? current.mode, radius: Math.max(0, patch.radius ?? current.radius) };
      }
      cmds.push(updateGeometry(id, subs));
    }
    void this.commit(cmds);
  }

  cycleCorners(): void {
    const refs = this.selectedRefs();
    if (!refs.length) return;
    const cmds: Command[] = [];
    for (const id of new Set(refs.map(r => r.id))) {
      const shape = this.shapeOf(id);
      if (!shape) continue;
      const subs = clonePath(shape.subs);
      for (const ref of refs) {
        if (ref.id !== id) continue;
        const node = subs[ref.sub].nodes[ref.idx];
        if (!cornerBasics(subs[ref.sub], ref.idx)) continue;
        const current = node.corner;
        node.corner = current && current.radius > 0
          ? { ...current, type: TYPES[(TYPES.indexOf(current.type) + 1) % TYPES.length] }
          : { type: 'round', mode: 'absolute', radius: 10 };
      }
      cmds.push(updateGeometry(id, subs));
    }
    void this.commit(cmds);
  }

  bakeCorners(): void {
    const cmds = this.selectedShapes().map(shape => updateGeometry(shape.id, applyCorners(shape.subs).map(sub => ({ ...sub, nodes: sub.nodes.map(n => ({ ...n, corner: undefined })) }))));
    void this.commit(cmds);
  }

  applyPaint(patch: Partial<Paint>): void {
    this.paint = { ...this.paint, ...patch };
    const shapes = this.selectedShapes();
    if (shapes.length) {
      const cmds = shapes.map(shape => {
        const next = { ...shape.paint, ...patch };
        const attrs: Record<string, string | null> = { ...paintAttrs(next) };
        for (const name of ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'data-fw-align', 'data-fw-weight', 'paint-order']) if (attrs[name] === undefined) attrs[name] = null;
        return updateAttrs(shape.id, attrs);
      });
      void this.commit(cmds);
    }
    this.emit();
  }

  runPathfinder(op: PathfinderOp, live = false): void {
    if (live && (op === 'unite' || op === 'minus-front' || op === 'intersect' || op === 'exclude' || op === 'divide' || op === 'outline')) { void this.ops.compound(op); return; }
    const site = this.site();
    const svg = this.activeSvg();
    if (!svg) { this.notify('Select two or more paths first.'); return; }
    const order = pathIds(site, svg);
    const inputs: PathfinderInput[] = this.selection
      .filter(id => order.includes(id))
      .map(id => ({ id, shape: this.shapeOf(id)! }))
      .filter(item => item.shape)
      .map(item => ({ subs: item.shape.subs, fill: item.shape.paint.fill, stroke: item.shape.paint.stroke, index: order.indexOf(item.id) }));
    if (inputs.length < 2) { this.notify('Select two or more paths first.'); return; }
    const results = pathfinder(op, inputs);
    if (!results.length) { this.notify('The operation produced no shape.'); return; }
    const sorted = inputs.slice().sort((a, b) => a.index - b.index);
    const parent = this.parentIdOf(order[sorted[sorted.length - 1].index]) ?? svg;
    const siblings = site.nodes[parent].children;
    const removed = new Set(sorted.map(item => order[item.index]));
    const topIndex = siblings.indexOf(order[sorted[sorted.length - 1].index]);
    const before = siblings.slice(0, topIndex).filter(id => removed.has(id)).length;
    const base = Math.max(0, topIndex - before);
    const taken = new Set<string>();
    const cmds: Command[] = [...removed].map(id => removeNode(id));
    const ids: string[] = [];
    results.forEach((result, k) => {
      const source = site.nodes[order[sorted[Math.min(result.source, sorted.length - 1)].index]];
      const sourcePaint = this.shapeOf(source.id)?.paint ?? this.paint;
      const paint: Paint = result.outline
        ? { ...sourcePaint, fillRule: 'nonzero', fill: 'none', stroke: sourcePaint.fill !== 'none' ? sourcePaint.fill : sourcePaint.stroke, strokeWidth: sourcePaint.stroke === 'none' ? 1 : sourcePaint.strokeWidth }
        : { ...sourcePaint, fillRule: result.fillRule, stroke: result.stroke ? sourcePaint.stroke : 'none' };
      const id = freshId(site, taken, 'path');
      ids.push(id);
      cmds.push(addPath(parent, id, result.subs, paint));
      cmds.push(moveNode(id, parent, base + k));
    });
    void this.commit(cmds, [ids[ids.length - 1]]).then(() => { this.selection = ids; this.refresh(); });
  }

  runPathOp(name: 'join' | 'join-average' | 'average-x' | 'average-y' | 'average' | 'simplify' | 'offset' | 'outline' | 'reverse', amount = 0): void {
    const cmds: Command[] = [];
    const taken = new Set<string>();
    const site = this.site();
    let select: string[] | undefined;
    const joining = name === 'join' || name === 'join-average';
    let center: Pt | undefined;
    if (name === 'average' || name === 'average-x' || name === 'average-y') {
      const nodes = this.selectedRefs().map(ref => this.shapeOf(ref.id)?.subs[ref.sub]?.nodes[ref.idx]).filter((n): n is Anchor => !!n);
      if (nodes.length > 1) center = [nodes.reduce((s, n) => s + n.x, 0) / nodes.length, nodes.reduce((s, n) => s + n.y, 0) / nodes.length];
    }
    if (joining) {
      const refs = this.selectedRefs();
      const ids = [...new Set(refs.map(ref => ref.id))];
      const pair = ids.length === 2 ? ids.map(id => this.shapeOf(id)) : [];
      if (pair[0] && pair[1] && pair[0].svg === pair[1].svg) {
        const offset = pair[0].subs.length;
        const joinPicks = new Map<number, Set<number>>();
        for (const ref of refs) { const at = ref.sub + (ref.id === ids[1] ? offset : 0); joinPicks.set(at, (joinPicks.get(at) ?? new Set()).add(ref.idx)); }
        const both = [...clonePath(pair[0].subs), ...clonePath(pair[1].subs)];
        if (name === 'join-average') averageAnchors(both, joinPicks, 'both');
        const merged = joinEndpoints(both, joinPicks);
        if (!merged) { this.notify('Select two end anchors to join.'); return; }
        void this.commit([updateGeometry(ids[0], merged), removeNode(ids[1])], [ids[0]]);
        return;
      }
    }
    for (const shape of this.selectedShapes()) {
      const picks = new Map<number, Set<number>>();
      for (const ref of this.selectedRefs()) if (ref.id === shape.id) picks.set(ref.sub, (picks.get(ref.sub) ?? new Set()).add(ref.idx));
      if (joining && !picks.size) continue;
      let subs = clonePath(shape.subs);
      if (joining) { if (name === 'join-average') averageAnchors(subs, picks, 'both'); const joined = joinEndpoints(subs, picks); if (!joined) { this.notify('Select two end anchors to join.'); return; } subs = joined; }
      else if (name === 'average' || name === 'average-x' || name === 'average-y') averageAnchors(subs, picks, name === 'average' ? 'both' : name === 'average-x' ? 'x' : 'y', center);
      else if (name === 'simplify') subs = subs.map(sub => simplifySub(sub, Math.max(0.1, amount)));
      else if (name === 'reverse') subs = subs.map(sub => ({ closed: sub.closed, nodes: [...sub.nodes].reverse().map(n => ({ ...n, in: n.out, out: n.in })) }));
      else if (name === 'offset') {
        const next = offsetSubs(applyCorners(subs), amount, shape.paint.join, shape.paint.miter);
        if (!next.length) continue;
        const id = freshId(site, taken, 'path');
        cmds.push(addPath(shape.svg, id, next, shape.paint, 'Offset path'));
        (select ??= []).push(id);
        continue;
      } else if (name === 'outline') {
        const dash = shape.paint.dash.split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const next = outlineStroke(applyCorners(subs), { width: shape.paint.stroke === 'none' ? Math.max(1, shape.paint.strokeWidth) : shape.paint.strokeWidth, cap: shape.paint.cap, join: shape.paint.join, miter: shape.paint.miter, dash, dashOffset: shape.paint.dashOffset });
        if (!next.length) continue;
        const id = freshId(site, taken, 'path');
        cmds.push(addPath(shape.svg, id, next, { ...shape.paint, fill: shape.paint.stroke === 'none' ? shape.paint.fill : shape.paint.stroke, stroke: 'none', fillRule: 'nonzero', dash: '', dashOffset: 0 }, 'Outlined stroke'));
        cmds.push(updateAttrs(shape.id, { stroke: 'none' }));
        (select ??= []).push(id);
        continue;
      }
      cmds.push(updateGeometry(shape.id, subs));
    }
    void this.commit(cmds, select);
  }

  makeCompound(): void {
    const site = this.site();
    const svg = this.activeSvg();
    if (!svg) return;
    const order = pathIds(site, svg);
    const shapes = this.selectedShapes().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    if (shapes.length < 2) { this.notify('Select two or more paths to make a compound path.'); return; }
    const top = shapes[shapes.length - 1];
    const cmds: Command[] = shapes.slice(0, -1).map(shape => removeNode(shape.id));
    cmds.push(updateGeometry(top.id, shapes.flatMap(shape => shape.subs)));
    cmds.push(updateAttrs(top.id, { 'fill-rule': 'evenodd' }));
    void this.commit(cmds, [top.id]);
  }

  releaseCompound(): void {
    const site = this.site();
    const taken = new Set<string>();
    const cmds: Command[] = [];
    const created: string[] = [];
    for (const shape of this.selectedShapes()) {
      if (shape.subs.length < 2) continue;
      const parent = this.parentIdOf(shape.id) ?? shape.svg;
      const index = site.nodes[parent].children.indexOf(shape.id);
      cmds.push(updateGeometry(shape.id, [shape.subs[0]]));
      shape.subs.slice(1).forEach((sub, k) => {
        const id = freshId(site, taken, 'path');
        created.push(id);
        cmds.push(addPath(parent, id, [sub], shape.paint));
        cmds.push(moveNode(id, parent, index + 1 + k));
      });
    }
    if (!cmds.length) { this.notify('The selection has no compound paths.'); return; }
    void this.commit(cmds, created.length ? [created[created.length - 1]] : undefined);
  }

  removeSelection(): void {
    void this.commit(this.selection.map(id => removeNode(id)));
  }

  async importText(text: string): Promise<void> {
    let imported;
    try { imported = importSvg(text); } catch (error) { this.notify(error instanceof Error ? error.message : 'SVG import failed.'); return; }
    if (!imported.paths.length) { this.notify('The SVG contains no shapes this editor can hold.'); return; }
    const site = this.site();
    const taken = new Set<string>();
    const holder = this.container();
    const rect = holder.el?.getBoundingClientRect();
    const svgId = freshId(site, taken, 'vector');
    const cmds: Command[] = [];
    if (holder.el && getComputedStyle(holder.el).position === 'static') cmds.push({ command: 'node.update', params: { id: holder.id, patch: { styles: { position: 'relative' } } } });
    const frame = this.ctx.canvas.frame.contentDocument?.defaultView;
    const scrollX = frame?.scrollX ?? 0, scrollY = frame?.scrollY ?? 0;
    cmds.push(addSvg(holder.id, svgId, { left: 24 + scrollX - (rect?.left ?? 0), top: 24 + scrollY - (rect?.top ?? 0), width: imported.width, height: imported.height }, 'Imported SVG'));
    const ids: string[] = [];
    for (const item of imported.paths) {
      const id = freshId(site, taken, 'path');
      ids.push(id);
      cmds.push({ command: 'node.add', params: { parent: svgId, node: { id, tag: 'path', name: item.name, attrs: { ...geometryAttrs(item.subs), ...paintAttrs(item.paint) } } } });
    }
    await this.commit(cmds, [ids[ids.length - 1]]);
    this.selection = ids;
    this.refresh();
  }

  exportText(): string {
    const site = this.site();
    const ids = this.selection.length ? this.selection : [this.ctx.getSelected()];
    return exportSvg(site, ids);
  }
}
