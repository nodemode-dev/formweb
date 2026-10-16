import type { Piece } from './boolean';
import { applyCorners } from './corners';
import { eraseFilled, eraseOpen, hitPiece, knifeCut, mergePieces, regionPieces } from './cut';
import { rotation, scaling, type Mat } from './distort';
import { dist, formatPath, mapPath, pathBounds, type Box, type Pt, type SubPath } from './geometry';
import {
  boxOf, createGradient, defaultGradient, gradientAttrs, offsetAt, readFor, stopAttrs, stopColorAt, stopPoint, syncGradient,
  type Gradient, type Target
} from './gradient';
import type { Frame, Host } from './host';
import type { ExtraItem, Scene } from './overlay';
import { snapLocal, type Guide } from './snap';
import { addPath, freshId, moveNode, pathIds, removeNode, updateAttrs, type Shape } from './store';
import { readWidth, widthCommands } from './stroke';
import { insertWidth, nearestParam, pointAtParam, variableOutline, type WidthPoint } from './widthprofile';
import { matrixCommands, applyMat, unionBox } from './arrange';

export const EXTRA_TOOLS = new Set(['knife', 'eraser', 'shapebuilder', 'width', 'gradient', 'transform']);

type Gesture =
  | { kind: 'knife'; pts: Pt[]; alt: boolean }
  | { kind: 'eraser'; pts: Pt[] }
  | { kind: 'builder'; picks: Set<number>; alt: boolean }
  | { kind: 'width'; id: string; idx: number; t: number; points: WidthPoint[] }
  | { kind: 'grad'; mode: 'p0' | 'p1' | 'stop' | 'draw'; id: string; idx: number; next: Gradient | null; start: Pt }
  | { kind: 'tf'; i: number; base: Map<string, SubPath[]>; box: Box; per: Map<string, Mat>; svg: string };

const HANDLE_FRACTIONS: Pt[] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];

const poly = (pts: Pt[]): string => (pts.length ? `M${pts.map(p => `${Math.round(p[0] * 100) / 100} ${Math.round(p[1] * 100) / 100}`).join('L')}` : '');

export class Extras {
  snapping = true;
  eraserSize = 12;
  iso: string | null = null;
  target: Target = 'fill';
  stop = 0;
  private gesture: Gesture | null = null;
  private guides: { svg: string; list: Guide[] } = { svg: '', list: [] };
  private pieces: Piece[] = [];
  private pieceKey = '';
  private hover = -1;
  private pointer: Pt = [0, 0];

  constructor(private h: Host) {}

  active(): boolean { return this.gesture !== null; }

  private shape(): Shape | undefined {
    return this.h.selection().map(id => this.h.shape(id)).find((s): s is Shape => !!s);
  }

  private shapes(): Shape[] {
    return this.h.selection().map(id => this.h.shape(id)).filter((s): s is Shape => !!s);
  }

  private local(f: Frame, p: Pt): Pt { return this.h.toLocal(f, p); }

  enter(group: string): void { this.iso = group; this.h.render(); this.h.emit(); }

  exit(): void { if (this.iso) { this.iso = null; this.h.render(); this.h.emit(); } }

  snapPoint(p: Pt, exclude: Set<string>, origin?: Pt, angles = false): Pt {
    this.guides = { svg: '', list: [] };
    const svg = this.h.activeSvg();
    const f = svg ? this.h.frame(svg) : undefined;
    if (!this.snapping || !svg || !f) return p;
    const result = snapLocal(this.h, svg, this.local(f, p), { tolerance: (6 * this.h.px()) / f.sx, exclude, origin: origin ? this.local(f, origin) : undefined, angles });
    this.guides = { svg, list: result.guides };
    return this.h.toShell(f, result.p);
  }

  clearGuides(): void { if (this.guides.list.length) this.guides = { svg: '', list: [] }; }

  private targets(): Shape[] {
    const chosen = this.shapes();
    if (chosen.length) return chosen;
    const svg = this.h.activeSvg();
    return svg ? pathIds(this.h.site(), svg).map(id => this.h.shape(id)).filter((s): s is Shape => !!s) : [];
  }

  down(tool: string, role: string, index: number, p: Pt, event: PointerEvent): boolean {
    this.pointer = p;
    if (role === 'x-gstart' || role === 'x-gend') return this.startGradient(role === 'x-gstart' ? 'p0' : 'p1', 0, p);
    if (role === 'x-gstop') {
      if (event.altKey) { void this.removeStop(index); return true; }
      this.stop = index;
      return this.startGradient('stop', index, p);
    }
    if (role === 'x-wpt') return this.startWidthPoint(index, event.altKey);
    if (role === 'x-tf') return this.startTransform(index);
    if (tool === 'knife') { this.gesture = { kind: 'knife', pts: [p], alt: event.altKey }; return true; }
    if (tool === 'eraser') { this.gesture = { kind: 'eraser', pts: [p] }; return true; }
    if (tool === 'shapebuilder') return this.startBuilder(p, event.altKey);
    if (tool === 'width') return this.startWidth(p);
    if (tool === 'gradient') return this.downGradient(p);
    if (tool === 'transform') return this.downTransform(p);
    return false;
  }

  move(p: Pt, event: PointerEvent): boolean {
    this.pointer = p;
    const g = this.gesture;
    const tool = this.h.tool();
    if (!g) {
      if (tool === 'shapebuilder') this.hoverBuilder(p);
      return false;
    }
    if (g.kind === 'knife') {
      if (g.alt) {
        let end = p;
        if (event.shiftKey) { const a = g.pts[0], dx = p[0] - a[0], dy = p[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); end = [a[0] + Math.cos(ang) * l, a[1] + Math.sin(ang) * l]; }
        g.pts = [g.pts[0], end];
      } else if (dist(g.pts[g.pts.length - 1], p) > 2 * this.h.px()) g.pts.push(p);
    } else if (g.kind === 'eraser') { if (dist(g.pts[g.pts.length - 1], p) > 1.5 * this.h.px()) g.pts.push(p); }
    else if (g.kind === 'builder') { const i = this.hitBuilder(p); if (i >= 0 && !g.alt) g.picks.add(i); this.hover = i; }
    else if (g.kind === 'width') this.dragWidth(g, p);
    else if (g.kind === 'grad') this.dragGradient(g, p, event.shiftKey);
    else if (g.kind === 'tf') this.dragTransform(g, p, event);
    this.h.render();
    return true;
  }

  up(p: Pt, event: PointerEvent): boolean {
    const g = this.gesture;
    if (!g) return false;
    this.gesture = null;
    if (g.kind === 'knife') void this.cutLine(g.pts, 'knife');
    else if (g.kind === 'eraser') void this.cutLine(g.pts, 'eraser');
    else if (g.kind === 'builder') void this.finishBuilder(g);
    else if (g.kind === 'width') void this.finishWidth(g);
    else if (g.kind === 'grad') void this.finishGradient(g, p, event.shiftKey);
    else if (g.kind === 'tf') void this.finishTransform(g);
    this.h.render();
    return true;
  }

  key(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (this.gesture) { this.gesture = null; this.h.render(); return true; }
    if (this.iso) { this.exit(); return true; }
    return false;
  }

  private async replaceShapes(shapes: Shape[], make: (shape: Shape) => SubPath[][] | null): Promise<void> {
    const site = this.h.site();
    const cmds = [];
    const created: string[] = [];
    const taken = new Set<string>();
    for (const shape of shapes) {
      const pieces = make(shape);
      if (!pieces) continue;
      const parent = this.h.parentOf(shape.id) ?? shape.svg;
      const index = site.nodes[parent].children.indexOf(shape.id);
      cmds.push(removeNode(shape.id));
      pieces.forEach((subs, k) => {
        const id = freshId(site, taken, 'path');
        created.push(id);
        cmds.push(addPath(parent, id, subs, shape.paint), moveNode(id, parent, index + k));
      });
    }
    if (!cmds.length) { this.h.notify('Nothing was changed. Drag across the shapes you want to change.'); return; }
    await this.h.commit(cmds, created.length ? created : undefined);
  }

  private async cutLine(pts: Pt[], mode: 'knife' | 'eraser'): Promise<void> {
    if (pts.length < 2 && mode === 'knife') return;
    const shapes = this.targets();
    await this.replaceShapes(shapes, shape => {
      const f = this.h.frame(shape.svg);
      if (!f) return null;
      const line = pts.map(p => this.local(f, p));
      const subs = applyCorners(shape.subs);
      if (mode === 'knife') {
        if (shape.paint.fill === 'none' || !subs.some(s => s.closed)) return null;
        const pieces = knife(subs, line);
        return pieces.length > 1 ? pieces : null;
      }
      const radius = this.eraserSize / 2;
      if (shape.paint.fill === 'none' || !subs.some(s => s.closed)) {
        const out = subs.flatMap(sub => eraseOpen(sub, line, radius));
        const touched = out.length !== subs.length || out.some((o, i) => o.nodes.length !== subs[i]?.nodes.length);
        return touched ? out.map(sub => [sub]) : null;
      }
      return eraseFilled(subs, line, radius);
    });
  }

  private ensurePieces(): { shapes: Shape[]; f: Frame } | null {
    const shapes = this.shapes();
    const svg = this.h.activeSvg();
    const f = svg ? this.h.frame(svg) : undefined;
    if (shapes.length < 2 || !svg || !f) { this.pieces = []; this.pieceKey = ''; return null; }
    const key = shapes.map(s => `${s.id}:${formatPath(applyCorners(s.subs))}`).join('|');
    if (key !== this.pieceKey) { this.pieces = regionPieces(shapes.map(s => applyCorners(s.subs))); this.pieceKey = key; this.hover = -1; }
    return { shapes, f };
  }

  private hitBuilder(p: Pt): number {
    const ready = this.ensurePieces();
    return ready ? hitPiece(this.pieces, this.local(ready.f, p)) : -1;
  }

  private hoverBuilder(p: Pt): void {
    const i = this.hitBuilder(p);
    if (i !== this.hover) { this.hover = i; this.h.render(); }
  }

  private startBuilder(p: Pt, alt: boolean): boolean {
    if (!this.ensurePieces()) { this.h.notify('Select two or more overlapping paths, then use the Shape Builder.'); return true; }
    const i = this.hitBuilder(p);
    const picks = new Set<number>(i >= 0 ? [i] : []);
    this.gesture = { kind: 'builder', picks, alt };
    return true;
  }

  private async finishBuilder(g: Extract<Gesture, { kind: 'builder' }>): Promise<void> {
    const ready = this.ensurePieces();
    if (!ready || !g.picks.size) return;
    const { shapes } = ready;
    const site = this.h.site();
    const order = pathIds(site, ready.shapes[0].svg);
    const byZ = shapes.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const topShape = (piece: Piece): Shape => {
      for (let k = shapes.length - 1; k >= 0; k--) if (piece.sig & (1 << k)) return shapes[k];
      return shapes[0];
    };
    const results: { subs: SubPath[]; paint: Shape['paint'] }[] = [];
    if (g.alt) this.pieces.forEach((piece, i) => { if (!g.picks.has(i)) results.push({ subs: piece.subs, paint: topShape(piece).paint }); });
    else {
      const first = [...g.picks][0];
      results.push({ subs: mergePieces(this.pieces, g.picks), paint: topShape(this.pieces[first]).paint });
      this.pieces.forEach((piece, i) => { if (!g.picks.has(i)) results.push({ subs: piece.subs, paint: topShape(piece).paint }); });
    }
    const top = byZ[byZ.length - 1];
    const parent = this.h.parentOf(top.id) ?? top.svg;
    const removed = new Set(byZ.map(s => s.id));
    const siblings = site.nodes[parent].children;
    const base = Math.max(0, siblings.indexOf(top.id) - siblings.slice(0, siblings.indexOf(top.id)).filter(id => removed.has(id)).length);
    const cmds = byZ.map(s => removeNode(s.id));
    const taken = new Set<string>();
    const ids: string[] = [];
    results.forEach((r, k) => {
      const id = freshId(site, taken, 'path');
      ids.push(id);
      cmds.push(addPath(parent, id, r.subs, r.paint), moveNode(id, parent, base + k));
    });
    this.pieceKey = '';
    await this.h.commit(cmds, ids.length ? [ids[0]] : undefined);
    this.h.setSelection(ids);
  }

  private widthShape(): Shape | undefined { return this.shape(); }

  private widthBase(shape: Shape): WidthPoint[] {
    return readWidth(this.h.site().nodes[shape.id]!)?.points ?? [];
  }

  private startWidth(p: Pt): boolean {
    const shape = this.widthShape();
    const f = shape && this.h.frame(shape.svg);
    if (!shape || !f) { const hit = this.h.pick(p); if (hit?.kind === 'path') this.h.setSelection([hit.id]); return true; }
    const hit = nearestParam(applyCorners(shape.subs), this.local(f, p));
    if (!hit || hit.d * f.sx > 12 * this.h.px()) { const other = this.h.pick(p); if (other?.kind === 'path') this.h.setSelection([other.id]); return true; }
    this.gesture = { kind: 'width', id: shape.id, idx: -1, t: hit.t, points: this.widthBase(shape) };
    return true;
  }

  private startWidthPoint(index: number, alt: boolean): boolean {
    const shape = this.widthShape();
    if (!shape) return true;
    const points = this.widthBase(shape);
    if (alt) { void this.h.commit(widthCommands(this.h.site(), shape, points.filter((_, i) => i !== index))); return true; }
    this.gesture = { kind: 'width', id: shape.id, idx: index, t: points[index]?.[0] ?? 0, points };
    return true;
  }

  private dragWidth(g: Extract<Gesture, { kind: 'width' }>, p: Pt): void {
    const shape = this.h.shape(g.id);
    const f = shape && this.h.frame(shape.svg);
    if (!shape || !f) return;
    const subs = applyCorners(shape.subs);
    const at = pointAtParam(subs, g.t);
    if (!at) return;
    const width = Math.max(0, 2 * dist(this.local(f, p), at.at));
    const next = g.points.map(pt => [...pt] as WidthPoint);
    if (g.idx >= 0 && next[g.idx]) next[g.idx][1] = width;
    else { g.points = insertWidth(g.points, g.t, width); g.idx = g.points.findIndex(pt => Math.abs(pt[0] - g.t) < 1e-6); return; }
    g.points = next;
  }

  private async finishWidth(g: Extract<Gesture, { kind: 'width' }>): Promise<void> {
    const shape = this.h.shape(g.id);
    if (!shape) return;
    await this.h.commit(widthCommands(this.h.site(), shape, g.points));
  }

  private currentGradient(): { shape: Shape; found: NonNullable<ReturnType<typeof readFor>> } | null {
    const shape = this.shape();
    const found = shape && readFor(this.h, shape, this.target);
    return shape && found ? { shape, found } : null;
  }

  private downGradient(p: Pt): boolean {
    const shape = this.shape();
    const hit = this.h.pick(p);
    if (hit?.kind === 'path' && (!shape || hit.id !== shape.id) && !this.h.selection().includes(hit.id)) { this.h.setSelection([hit.id]); return true; }
    if (!shape) return true;
    const f = this.h.frame(shape.svg);
    const current = this.currentGradient();
    if (!f) return true;
    if (current) {
      const g = current.found.gradient;
      const a = this.h.toShell(f, g.p0), b = this.h.toShell(f, g.p1);
      const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
      const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2));
      const near = Math.hypot(p[0] - (a[0] + (b[0] - a[0]) * k), p[1] - (a[1] + (b[1] - a[1]) * k));
      if (near <= 7 * this.h.px()) { void this.addStop(k); return true; }
    }
    this.gesture = { kind: 'grad', mode: 'draw', id: shape.id, idx: 0, next: null, start: this.local(f, p) };
    return true;
  }

  private startGradient(mode: 'p0' | 'p1' | 'stop', idx: number, _p: Pt): boolean {
    const current = this.currentGradient();
    if (!current) return true;
    this.gesture = { kind: 'grad', mode, id: current.shape.id, idx, next: null, start: [0, 0] };
    return true;
  }

  private preview(next: Gradient, nodeId: string): void {
    const attrs = gradientAttrs(next, nodeId);
    const el = this.h.element(nodeId);
    if (!el) return;
    for (const [name, value] of Object.entries(attrs)) if (name !== 'id' && el.getAttribute(name) !== value) el.setAttribute(name, value);
    const stops = Array.from(el.children);
    next.stops.forEach((s, i) => { const node = stops[i]; if (!node) return; for (const [name, value] of Object.entries(stopAttrs(s))) node.setAttribute(name, value); });
  }

  private dragGradient(g: Extract<Gesture, { kind: 'grad' }>, p: Pt, constrain: boolean): void {
    const shape = this.h.shape(g.id);
    const f = shape && this.h.frame(shape.svg);
    const current = shape && this.currentGradient();
    if (!shape || !f) return;
    let lp = this.local(f, p);
    if (g.mode === 'draw') {
      if (constrain) { const dx = lp[0] - g.start[0], dy = lp[1] - g.start[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); lp = [g.start[0] + Math.cos(ang) * l, g.start[1] + Math.sin(ang) * l]; }
      const base = current?.found.gradient ?? defaultGradient('linear', boxOf(shape), this.target === 'fill' ? shape.paint.fill : shape.paint.stroke);
      g.next = { ...base, p0: [...g.start], p1: lp };
    } else if (current) {
      const base = current.found.gradient;
      const next: Gradient = { ...base, stops: base.stops.map(s => ({ ...s })), p0: [...base.p0], p1: [...base.p1] };
      if (g.mode === 'p0') next.p0 = lp;
      else if (g.mode === 'p1') next.p1 = lp;
      else if (next.stops[g.idx]) next.stops[g.idx].offset = offsetAt(next, lp);
      g.next = next;
    }
    if (current && g.next) this.preview(g.next, current.found.node.id);
  }

  private async finishGradient(g: Extract<Gesture, { kind: 'grad' }>, _p: Pt, _constrain: boolean): Promise<void> {
    const shape = this.h.shape(g.id);
    const current = this.currentGradient();
    if (!shape || !g.next) return;
    const taken = new Set<string>();
    const next = { ...g.next, stops: g.next.stops.slice().sort((a, b) => a.offset - b.offset) };
    if (current) { await this.h.commit(syncGradient(this.h.site(), taken, current.found.node, next)); return; }
    if (dist(next.p0, next.p1) < 1) return;
    const made = createGradient(this.h.site(), taken, shape.svg, next);
    await this.h.commit([...made.cmds, updateAttrs(shape.id, { [this.target]: `url(#${made.id})` })]);
  }

  private async addStop(offset: number): Promise<void> {
    const current = this.currentGradient();
    if (!current) return;
    const g = current.found.gradient;
    const at = stopColorAt(g.stops, offset);
    const next: Gradient = { ...g, stops: [...g.stops, { color: at.color, offset, opacity: at.opacity }].sort((a, b) => a.offset - b.offset) };
    this.stop = next.stops.findIndex(s => s.offset === offset);
    await this.h.commit(syncGradient(this.h.site(), new Set(), current.found.node, next));
  }

  private async removeStop(index: number): Promise<void> {
    const current = this.currentGradient();
    if (!current || current.found.gradient.stops.length <= 2) return;
    const g = current.found.gradient;
    this.stop = 0;
    await this.h.commit(syncGradient(this.h.site(), new Set(), current.found.node, { ...g, stops: g.stops.filter((_, i) => i !== index) }));
  }

  private transformBox(): { shapes: Shape[]; box: Box; f: Frame; svg: string } | null {
    const shapes = this.shapes();
    const box = unionBox(shapes);
    const svg = this.h.activeSvg();
    const f = svg ? this.h.frame(svg) : undefined;
    return box && f && svg ? { shapes, box, f, svg } : null;
  }

  private downTransform(p: Pt): boolean {
    const hit = this.h.pick(p);
    if (hit?.kind === 'path') this.h.setSelection([hit.id]);
    return true;
  }

  private startTransform(i: number): boolean {
    const ready = this.transformBox();
    if (!ready) return true;
    this.gesture = { kind: 'tf', i, base: new Map(ready.shapes.map(s => [s.id, s.subs.map(sub => ({ closed: sub.closed, nodes: sub.nodes.map(n => ({ ...n, in: n.in && [...n.in] as Pt, out: n.out && [...n.out] as Pt, corner: n.corner && { ...n.corner } })) }))])), box: ready.box, per: new Map(), svg: ready.svg };
    return true;
  }

  private dragTransform(g: Extract<Gesture, { kind: 'tf' }>, p: Pt, event: PointerEvent): void {
    const f = this.h.frame(g.svg);
    if (!f) return;
    const lp = this.local(f, p), b = g.box;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let m: Mat;
    if (g.i === 8) {
      const start = pointAtTop(b);
      let delta = ((Math.atan2(lp[1] - cy, lp[0] - cx) - Math.atan2(start[1] - cy, start[0] - cx)) * 180) / Math.PI;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      m = rotation(delta, cx, cy);
    } else {
      const [fx, fy] = HANDLE_FRACTIONS[g.i];
      const hx = b.x + fx * b.w, hy = b.y + fy * b.h;
      const ax = event.altKey ? cx : b.x + (1 - fx) * b.w, ay = event.altKey ? cy : b.y + (1 - fy) * b.h;
      let sx = fx === 0.5 || Math.abs(hx - ax) < 1e-6 ? 1 : (lp[0] - ax) / (hx - ax);
      let sy = fy === 0.5 || Math.abs(hy - ay) < 1e-6 ? 1 : (lp[1] - ay) / (hy - ay);
      if (event.shiftKey) {
        if (fx !== 0.5 && fy !== 0.5) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s; }
        else if (fx === 0.5) sx = sy; else sy = sx;
      }
      m = scaling(sx, sy, ax, ay);
    }
    g.per = new Map([...g.base.keys()].map(id => [id, m]));
    for (const [id, subs] of g.base) this.h.draft(id, applyMat(subs, m));
  }

  private async finishTransform(g: Extract<Gesture, { kind: 'tf' }>): Promise<void> {
    if (!g.per.size) return;
    const r = matrixCommands(this.h, g.per, false, false);
    await this.h.commit(r.cmds);
  }

  decorate(scene: Scene): void {
    const items: ExtraItem[] = [];
    const px = this.h.px();
    const tool = this.h.tool();
    const svg = this.h.activeSvg();
    const f = svg ? this.h.frame(svg) : undefined;
    const g = this.gesture;
    const toShell = (subs: SubPath[], frame: Frame): string => formatPath(mapPath(subs, p => this.h.toShell(frame, p)));
    if (g?.kind === 'knife') items.push({ kind: 'path', d: poly(g.pts), cls: 'trail' });
    if (g?.kind === 'eraser') items.push({ kind: 'path', d: poly(g.pts), cls: 'eraser', w: this.eraserSize });
    if (tool === 'shapebuilder' && f && this.ensurePieces()) {
      const picks = g?.kind === 'builder' ? g.picks : new Set<number>();
      const alt = g?.kind === 'builder' && g.alt;
      this.pieces.forEach((piece, i) => {
        if (picks.has(i)) items.push({ kind: 'path', d: toShell(piece.subs, f), cls: alt ? 'region-cut' : 'region-pick' });
        else if (i === this.hover) items.push({ kind: 'path', d: toShell(piece.subs, f), cls: 'region-hover' });
      });
    }
    if (tool === 'width') this.decorateWidth(items, g);
    if (tool === 'gradient') this.decorateGradient(items, g);
    if (tool === 'transform') this.decorateTransform(items);
    if (this.iso && f) {
      const shapes = pathIds(this.h.site(), this.iso).map(id => this.h.shape(id)).filter((s): s is Shape => !!s);
      const box = unionBox(shapes);
      if (box) {
        const a = this.h.toShell(f, [box.x, box.y]), b = this.h.toShell(f, [box.x + box.w, box.y + box.h]);
        items.push({ kind: 'path', d: `M${a[0]} ${a[1]}H${b[0]}V${b[1]}H${a[0]}Z`, cls: 'iso' });
      }
    }
    const gf = this.guides.svg ? this.h.frame(this.guides.svg) : undefined;
    if (gf) {
      for (const guide of this.guides.list) {
        const a = this.h.toShell(gf, guide.a), b = this.h.toShell(gf, guide.b);
        if (guide.kind === 'point' || guide.kind === 'segment') items.push({ kind: 'circle', x: a[0], y: a[1], r: 5, cls: 'snap' });
        else items.push({ kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: `guide-${guide.kind}` });
      }
    }
    void px;
    scene.extras = items;
  }

  private decorateWidth(items: ExtraItem[], g: Gesture | null): void {
    const shape = this.widthShape();
    const f = shape && this.h.frame(shape.svg);
    if (!shape || !f) return;
    const subs = applyCorners(shape.subs);
    const points = g?.kind === 'width' ? g.points : this.widthBase(shape);
    const weight = Math.max(1, shape.paint.strokeWidth);
    if (g?.kind === 'width' || points.length) items.push({ kind: 'path', d: formatPath(mapPath(variableOutline(subs, points, weight, shape.paint.cap), p => this.h.toShell(f, p))), cls: 'trail' });
    points.forEach(([t], i) => {
      const at = pointAtParam(subs, t);
      if (!at) return;
      const s = this.h.toShell(f, at.at);
      items.push({ kind: 'circle', x: s[0], y: s[1], r: 4.5, cls: g?.kind === 'width' && g.idx === i ? 'wpt-on' : 'wpt', role: 'x-wpt', i });
    });
  }

  private decorateGradient(items: ExtraItem[], g: Gesture | null): void {
    const current = this.currentGradient();
    const live = g?.kind === 'grad' && g.next ? g.next : current?.found.gradient;
    const shape = this.shape();
    const f = shape && this.h.frame(shape.svg);
    if (!live || !f) return;
    const a = this.h.toShell(f, live.p0), b = this.h.toShell(f, live.p1);
    items.push({ kind: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], cls: 'gline' });
    if (live.kind === 'radial') {
      const r = dist(a, b);
      items.push({ kind: 'path', d: `M${a[0] - r} ${a[1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`, cls: 'gring' });
    }
    live.stops.forEach((s, i) => {
      const at = this.h.toShell(f, stopPoint(live, s.offset));
      items.push({ kind: 'circle', x: at[0], y: at[1], r: 6, cls: i === this.stop ? 'gstop-on' : 'gstop', role: 'x-gstop', i, fill: s.color });
    });
    items.push({ kind: 'circle', x: a[0], y: a[1], r: 3, cls: 'gend', role: 'x-gstart', i: 0 }, { kind: 'circle', x: b[0], y: b[1], r: 3, cls: 'gend', role: 'x-gend', i: 1 });
  }

  private decorateTransform(items: ExtraItem[]): void {
    const ready = this.transformBox();
    if (!ready) return;
    const { box, f } = ready;
    const pt = (x: number, y: number): Pt => this.h.toShell(f, [x, y]);
    const a = pt(box.x, box.y), c = pt(box.x + box.w, box.y + box.h);
    items.push({ kind: 'path', d: `M${a[0]} ${a[1]}H${c[0]}V${c[1]}H${a[0]}Z`, cls: 'tbox' });
    HANDLE_FRACTIONS.forEach(([fx, fy], i) => { const at = pt(box.x + fx * box.w, box.y + fy * box.h); items.push({ kind: 'circle', x: at[0], y: at[1], r: 4.5, cls: 'thandle', role: 'x-tf', i }); });
    const top = pt(box.x + box.w / 2, box.y);
    const rot = pointAtTop(box);
    const r = pt(rot[0], rot[1]);
    items.push({ kind: 'line', x1: top[0], y1: top[1], x2: r[0], y2: r[1] - 18 * this.h.px(), cls: 'gline' }, { kind: 'circle', x: r[0], y: r[1] - 18 * this.h.px(), r: 5, cls: 'thandle', role: 'x-tf', i: 8 });
  }
}

function pointAtTop(b: Box): Pt { return [b.x + b.w / 2, b.y - 1]; }

function knife(subs: SubPath[], line: Pt[]): SubPath[][] {
  return pathBounds(subs) ? knifeCut(subs, line) : [];
}
