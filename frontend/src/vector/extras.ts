import type { Piece } from './boolean';
import { applyCorners } from './corners';
import { eraseFilled, eraseOpen, gapInputs, hitPiece, knifeCut, mergePieces, regionPieces, strokeSplit } from './cut';
import { compose, rotation, scaling, type Mat } from './distort';
import { dist, formatPath, mapPath, pathBounds, type Box, type Pt, type SubPath } from './geometry';
import {
  boxOf, createGradient, defaultGradient, gradientAttrs, offsetAt, readFor, stopAttrs, stopColorAt, stopPoint, syncGradient,
  type Gradient, type Target
} from './gradient';
import type { Frame, Host } from './host';
import type { ExtraItem, Scene } from './overlay';
import { snapAids, snapLocal, type AidSource, type Guide } from './snap';
import { addPath, freshId, moveNode, pathIds, removeNode, svgOf, updateAttrs, updateGeometry, type Shape } from './store';
import { matrixText, parseTransform, useFrame } from './symbols';
import { liveOf } from './live';
import { FREEFORM_LIMIT, SPREAD_MIN, freeformGradient, readFreeform, sourceBox, stopsOf, turnHue, writeStops, type FreeformSpec, type FreeformStop } from './freeform';
import { openFreeformStop } from './pathdialogs';
import { readArea } from './areatype';
import { paintFill, readLivePaint, type LivePaintSpec } from './livepaint';
import { readWarp, warpBox, type WarpSpec } from './warp';
import { readWidth, widthCommands } from './stroke';
import { insertWidth, nearestParam, pointAtParam, setPointWidth, sidesAt, variableOutline, type WidthPoint } from './widthprofile';
import { WidthDialog } from './widthdialog';
import { bracketParam, offsetFromParam, readType, typeCommands, typeHolder, type TypeConfig } from './typepath';
import { matrixCommands, applyMat, unionBox } from './arrange';
import { forgetTransform, rememberMatrix } from './select';
import { distortShape, dragQuad, isCorner, isSide, shearMatrix, type Quad, type TfMode } from './freetransform';

export const EXTRA_TOOLS = new Set(['knife', 'eraser', 'shapebuilder', 'width', 'gradient', 'transform', 'livepaint']);

type Gesture =
  | { kind: 'knife'; pts: Pt[]; alt: boolean }
  | { kind: 'eraser'; pts: Pt[] }
  | { kind: 'builder'; picks: Set<number>; alt: boolean }
  | { kind: 'width'; id: string; idx: number; t: number; points: WidthPoint[]; alt: boolean; moved: boolean; start: [number, number] }
  | { kind: 'tbracket'; id: string; flip: 0 | 1; offset: number; moved: boolean }
  | { kind: 'grad'; mode: 'p0' | 'p1' | 'stop' | 'draw'; id: string; idx: number; next: Gradient | null; start: Pt }
  | { kind: 'tf'; i: number; base: Map<string, SubPath[]>; box: Box; per: Map<string, Mat>; svg: string; quad?: Quad; out?: Map<string, SubPath[]> }
  | { kind: 'use'; id: string; i: number; svg: string; t: Mat; corners: Pt[]; centre: Pt; next?: Mat }
  | { kind: 'mesh'; idx: number; mesh: number[]; moved: boolean }
  | { kind: 'ff'; mode: 'move' | 'spread'; group: string; idx: number; stops: FreeformStop[]; moved: boolean };

interface FreeformState { group: string; spec: FreeformSpec; src: Record<string, string>; box: Box; f: Frame; svg: string }

const HANDLE_FRACTIONS: Pt[] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];

const poly = (pts: Pt[]): string => (pts.length ? `M${pts.map(p => `${Math.round(p[0] * 100) / 100} ${Math.round(p[1] * 100) / 100}`).join('L')}` : '');

export class Extras {
  snapping = true;
  eraserSize = 12;
  gap = 0;
  splitStroke = false;
  tfMode: TfMode = 'scale';
  iso: string | null = null;
  target: Target = 'fill';
  stop = 0;
  ffStop = 0;
  ffMode: 'points' | 'lines' = 'points';
  private ffLine = 0;
  private gesture: Gesture | null = null;
  private guides: { svg: string; list: Guide[] } = { svg: '', list: [] };
  aids: AidSource | undefined;
  private pieces: Piece[] = [];
  private owners: number[] = [];
  private pieceKey = '';
  private hover = -1;
  private pointer: Pt = [0, 0];
  private dialog = new WidthDialog();

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
    if (!svg || !f) return p;
    const tolerance = (6 * this.h.px()) / f.sx;
    if (!this.snapping) {
      const aid = this.aids?.active(svg) ? snapAids(this.aids, svg, this.local(f, p), tolerance) : null;
      if (!aid) return p;
      this.guides = { svg, list: aid.guides };
      return this.h.toShell(f, aid.p);
    }
    const result = snapLocal(this.h, svg, this.local(f, p), { tolerance, exclude, origin: origin ? this.local(f, origin) : undefined, angles, aids: this.aids });
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
    if (role === 'x-ffs' || role === 'x-ffr') return this.startFreeform(role === 'x-ffs' ? 'move' : 'spread', index);
    if (role === 'x-wpt') return this.startWidthPoint(index, event.altKey);
    if (role === 'x-tbracket') return this.startTypeBracket();
    if (role === 'x-tf') return this.startTransform(index);
    if (role === 'x-use') return this.startUse(index);
    if (role === 'x-mesh') {
      const state = this.meshState();
      if (!state) return false;
      this.gesture = { kind: 'mesh', idx: index, mesh: [...state.spec.mesh!], moved: false };
      return true;
    }
    if (tool === 'knife') { this.gesture = { kind: 'knife', pts: [p], alt: event.altKey }; return true; }
    if (tool === 'eraser') { this.gesture = { kind: 'eraser', pts: [p] }; return true; }
    if (tool === 'shapebuilder') return this.startBuilder(p, event.altKey);
    if (tool === 'livepaint') { void this.paintFace(p, event.shiftKey); return true; }
    if (tool === 'width') return this.startWidth(p, event.altKey);
    if (tool === 'gradient') return this.downGradient(p);
    if (tool === 'transform') return this.downTransform(p);
    return false;
  }

  move(p: Pt, event: PointerEvent): boolean {
    this.pointer = p;
    const g = this.gesture;
    const tool = this.h.tool();
    if (!g) {
      if (tool === 'shapebuilder' || tool === 'livepaint') this.hoverBuilder(p);
      return false;
    }
    if (g.kind === 'knife') {
      if (g.alt) {
        let end = p;
        if (event.shiftKey) { const a = g.pts[0], dx = p[0] - a[0], dy = p[1] - a[1], ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); end = [a[0] + Math.cos(ang) * l, a[1] + Math.sin(ang) * l]; }
        g.pts = [g.pts[0], end];
      } else if (dist(g.pts[g.pts.length - 1], p) > 2 * this.h.px()) g.pts.push(p);
    } else if (g.kind === 'eraser') { if (dist(g.pts[g.pts.length - 1], p) > 1.5 * this.h.px()) g.pts.push(p); }
    else if (g.kind === 'builder') { const i = this.hitBuilder(p); if (i >= 0) g.picks.add(i); this.hover = i; }
    else if (g.kind === 'width') this.dragWidth(g, p, event.altKey);
    else if (g.kind === 'tbracket') this.dragBracket(g, p);
    else if (g.kind === 'grad') this.dragGradient(g, p, event.shiftKey);
    else if (g.kind === 'tf') this.dragTransform(g, p, event);
    else if (g.kind === 'use') this.dragUseHandle(g, p, event);
    else if (g.kind === 'mesh') this.dragMesh(g, p);
    else if (g.kind === 'ff') this.dragFreeform(g, p);
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
    else if (g.kind === 'tbracket') void this.finishBracket(g);
    else if (g.kind === 'grad') void this.finishGradient(g, p, event.shiftKey);
    else if (g.kind === 'tf') void this.finishTransform(g);
    else if (g.kind === 'use') void this.finishUse(g);
    else if (g.kind === 'mesh') void this.finishMesh(g);
    else if (g.kind === 'ff') void this.finishFreeform(g);
    this.h.render();
    return true;
  }

  key(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape') return false;
    if (this.gesture) { this.gesture = null; this.h.render(); return true; }
    if (this.ffLine) { this.ffLine = 0; this.h.render(); return true; }
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
    const key = `${this.gap}#${shapes.map(s => `${s.id}:${formatPath(applyCorners(s.subs))}`).join('|')}`;
    if (key !== this.pieceKey) {
      const made = gapInputs(shapes.map(s => applyCorners(s.subs)), this.gap);
      this.pieces = regionPieces(made.inputs);
      this.owners = made.owners;
      this.pieceKey = key;
      this.hover = -1;
    }
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

  private splitAt(p: Pt): boolean {
    const ready = this.ensurePieces();
    if (!ready) return false;
    const { shapes, f } = ready;
    const found = strokeSplit(shapes.map(s => applyCorners(s.subs)), this.local(f, p), (5 * this.h.px()) / f.sx);
    if (!found) return false;
    const shape = shapes[found.shape];
    const site = this.h.site();
    const parent = this.h.parentOf(shape.id) ?? shape.svg;
    const index = site.nodes[parent].children.indexOf(shape.id);
    const taken = new Set<string>();
    const cmds = [removeNode(shape.id)];
    const created: string[] = [];
    found.subs.forEach((sub, k) => {
      const id = freshId(site, taken, 'path');
      created.push(id);
      cmds.push(addPath(parent, id, [sub], shape.paint), moveNode(id, parent, index + k));
    });
    this.pieceKey = '';
    void this.h.commit(cmds, [...shapes.filter(s => s.id !== shape.id).map(s => s.id), ...created]);
    return true;
  }

  private startBuilder(p: Pt, alt: boolean): boolean {
    if (!this.ensurePieces()) { this.h.notify('Select two or more overlapping paths, then use the Shape Builder.'); return true; }
    if (this.splitStroke && !alt && this.splitAt(p)) return true;
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
      let best: Shape | null = null;
      this.owners.forEach((owner, k) => {
        const s = shapes[owner];
        if (piece.sig & (1 << k) && (!best || order.indexOf(s.id) >= order.indexOf(best.id))) best = s;
      });
      return best ?? shapes[0];
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

  private startWidth(p: Pt, alt: boolean): boolean {
    const shape = this.widthShape();
    const f = shape && this.h.frame(shape.svg);
    if (!shape || !f) { const hit = this.h.pick(p); if (hit?.kind === 'path') this.h.setSelection([hit.id]); return true; }
    const hit = nearestParam(applyCorners(shape.subs), this.local(f, p));
    if (!hit || hit.d * f.sx > 12 * this.h.px()) { const other = this.h.pick(p); if (other?.kind === 'path') this.h.setSelection([other.id]); return true; }
    const points = this.widthBase(shape);
    this.gesture = { kind: 'width', id: shape.id, idx: -1, t: hit.t, points, alt, moved: false, start: sidesAt(points, hit.t, Math.max(1, shape.paint.strokeWidth) / 2) };
    return true;
  }

  private startWidthPoint(index: number, alt: boolean): boolean {
    const shape = this.widthShape();
    if (!shape) return true;
    const points = this.widthBase(shape);
    const point = points[index];
    this.gesture = { kind: 'width', id: shape.id, idx: index, t: point?.[0] ?? 0, points, alt, moved: false, start: point ? [point[1], point[2]] : [0, 0] };
    return true;
  }

  private dragWidth(g: Extract<Gesture, { kind: 'width' }>, p: Pt, alt: boolean): void {
    const shape = this.h.shape(g.id);
    const f = shape && this.h.frame(shape.svg);
    if (!shape || !f) return;
    const subs = applyCorners(shape.subs);
    const at = pointAtParam(subs, g.t);
    if (!at) return;
    const local = this.local(f, p);
    const d = dist(local, at.at);
    const side = (local[0] - at.at[0]) * at.normal[0] + (local[1] - at.at[1]) * at.normal[1];
    const one = alt || g.alt;
    const s1 = one ? (side >= 0 ? d : g.start[0]) : d, s2 = one ? (side < 0 ? d : g.start[1]) : d;
    g.moved = true;
    if (g.idx >= 0 && g.points[g.idx]) g.points = g.points.map((pt, i) => (i === g.idx ? [pt[0], s1, s2] as WidthPoint : pt));
    else { g.points = insertWidth(g.points, g.t, s1, s2); g.idx = g.points.findIndex(pt => Math.abs(pt[0] - g.t) < 0.02); }
  }

  private async finishWidth(g: Extract<Gesture, { kind: 'width' }>): Promise<void> {
    const shape = this.h.shape(g.id);
    if (!shape) return;
    if (!g.moved) {
      if (g.alt && g.idx >= 0) await this.h.commit(widthCommands(this.h.site(), shape, g.points.filter((_, i) => i !== g.idx)));
      return;
    }
    await this.h.commit(widthCommands(this.h.site(), shape, g.points));
  }

  openWidthDialog(index: number): void {
    const shape = this.widthShape();
    const point = shape && this.widthBase(shape)[index];
    if (!shape || !point) return;
    this.dialog.open({ side1: point[1], side2: point[2], apply: (a, b, adjoin) => {
      const current = this.h.shape(shape.id);
      if (current) void this.h.commit(widthCommands(this.h.site(), current, setPointWidth(this.widthBase(current), index, a, b, adjoin)));
    } });
  }

  private currentGradient(): { shape: Shape; found: NonNullable<ReturnType<typeof readFor>> } | null {
    const shape = this.shape();
    const found = shape && readFor(this.h, shape, this.target);
    return shape && found ? { shape, found } : null;
  }

  private downGradient(p: Pt): boolean {
    const ff = this.ffState();
    if (ff && this.addFreeformStop(ff, p)) return true;
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
    const mode = this.modeFor(g.i, event);
    if (mode === 'perspective' || mode === 'distort') {
      g.quad = dragQuad(mode, g.i, b, lp, event.altKey, event.shiftKey);
      g.out = new Map();
      g.per = new Map();
      for (const [id, subs] of g.base) { const mapped = distortShape(subs, b, g.quad); g.out.set(id, mapped); this.h.draft(id, mapped); }
      return;
    }
    let m: Mat;
    if (mode === 'shear') {
      m = shearMatrix(g.i, b, lp, event.altKey, event.shiftKey);
    } else if (g.i === 8) {
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

  private modeFor(i: number, event: PointerEvent): TfMode {
    const ctrl = event.ctrlKey || event.metaKey;
    if (isCorner(i)) {
      if (ctrl && event.altKey && event.shiftKey) return 'perspective';
      if (ctrl) return 'distort';
      return this.tfMode === 'perspective' || this.tfMode === 'distort' ? this.tfMode : 'scale';
    }
    return isSide(i) && (ctrl || this.tfMode === 'shear') ? 'shear' : 'scale';
  }

  private async finishTransform(g: Extract<Gesture, { kind: 'tf' }>): Promise<void> {
    if (g.out?.size) {
      forgetTransform();
      this.h.clearDrafts();
      await this.h.commit([...g.out].map(([id, subs]) => updateGeometry(id, subs)));
      return;
    }
    if (!g.per.size) return;
    this.h.clearDrafts();
    const r = matrixCommands(this.h, g.per, false, false);
    const first = g.per.values().next().value;
    if (first) rememberMatrix(first, [g.box.x + g.box.w / 2, g.box.y + g.box.h / 2]);
    await this.h.commit(r.cmds);
  }

  makeLivePaint?: (at: Pt, color: string) => Promise<void>;

  private livePaintState(): { group: string; spec: LivePaintSpec; sources: Record<string, string>[]; f: Frame } | null {
    const site = this.h.site();
    for (const id of this.h.selection()) {
      const found = liveOf(site, id);
      if (found?.kind !== 'livepaint') continue;
      const spec = readLivePaint(site.nodes[found.group]?.attrs['data-fw-livepaint']);
      const sources = spec ? spec.src.map(s => site.nodes[s]?.attrs).filter((a): a is Record<string, string> => !!a) : [];
      const svg = svgOf(site, found.group);
      const f = svg ? this.h.frame(svg) : undefined;
      if (spec && f && sources.length === spec.src.length) return { group: found.group, spec, sources, f };
    }
    return null;
  }

  private async paintFace(p: Pt, edge: boolean): Promise<void> {
    const paint = this.h.paint();
    const sources = this.shapes();
    if (edge) {
      const hit = this.h.pick(p);
      const color = paint.stroke !== 'none' ? paint.stroke : paint.fill;
      if (!hit || hit.kind !== 'path' || color === 'none') return;
      const shape = this.h.shape(hit.id);
      await this.h.commit([updateAttrs(hit.id, { stroke: color, 'stroke-width': String(Math.max(1, shape?.paint.strokeWidth ?? 1)) })], sources.map(s => s.id));
      return;
    }
    if (paint.fill === 'none') { this.h.notify('Choose a fill color first.'); return; }
    const lp = this.livePaintState();
    if (lp) {
      const fills = paintFill(lp.spec, lp.sources, this.local(lp.f, p), paint.fill);
      if (fills) await this.h.commit([updateAttrs(lp.group, { 'data-fw-livepaint': JSON.stringify({ ...lp.spec, fills, sig: '00000000' }) })]);
      return;
    }
    if (this.makeLivePaint && this.shapes().length >= 2) {
      const svg = this.h.activeSvg();
      const f = svg ? this.h.frame(svg) : undefined;
      if (f) { await this.makeLivePaint(this.local(f, p), paint.fill); return; }
    }
    const ready = this.ensurePieces();
    if (!ready) { this.h.notify('Select two or more overlapping paths, then use the Live Paint Bucket.'); return; }
    const i = hitPiece(this.pieces, this.local(ready.f, p));
    if (i < 0) return;
    const piece = this.pieces[i].subs;
    const site = this.h.site();
    const svg = ready.shapes[0].svg;
    const order = pathIds(site, svg);
    const own = new Set(ready.shapes.map(s => s.id));
    const box = pathBounds(piece);
    const same = (b: Box | null): boolean => !!box && !!b && Math.abs(b.x - box.x) < 0.5 && Math.abs(b.y - box.y) < 0.5 && Math.abs(b.w - box.w) < 0.5 && Math.abs(b.h - box.h) < 0.5;
    const face = order.find(id => { if (own.has(id)) return false; const s = this.h.shape(id); return !!s && s.paint.stroke === 'none' && same(pathBounds(s.subs)); });
    const keep = ready.shapes.map(s => s.id);
    if (face) { await this.h.commit([updateAttrs(face, { fill: paint.fill })], keep); return; }
    const lowest = ready.shapes.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0];
    const parent = this.h.parentOf(lowest.id) ?? svg;
    const index = site.nodes[parent].children.indexOf(lowest.id);
    const id = freshId(site, new Set<string>(), 'path');
    await this.h.commit([addPath(parent, id, piece, { ...paint, stroke: 'none', align: 'center', fillRule: 'nonzero' }, 'Live Paint face'), moveNode(id, parent, Math.max(0, index))], keep);
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
    if ((tool === 'shapebuilder' || tool === 'livepaint') && f && this.ensurePieces()) {
      const picks = g?.kind === 'builder' ? g.picks : new Set<number>();
      const alt = g?.kind === 'builder' && g.alt;
      this.pieces.forEach((piece, i) => {
        if (picks.has(i)) items.push({ kind: 'path', d: toShell(piece.subs, f), cls: alt ? 'region-cut' : 'region-pick' });
        else if (i === this.hover) items.push({ kind: 'path', d: toShell(piece.subs, f), cls: 'region-hover' });
      });
    }
    if (tool === 'width') this.decorateWidth(items, g);
    if (tool === 'select' || tool === 'direct') { this.decorateType(items, g); this.decorateUse(items, g); this.decorateOverflow(items); }
    if (tool === 'direct') this.decorateMesh(items, g);
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

  private typeInfo(): { shape: Shape; cfg: TypeConfig; f: Frame } | null {
    const shape = this.shape();
    const f = shape && this.h.frame(shape.svg);
    const cfg = shape && readType(typeHolder(this.h.site(), shape.id));
    return shape && f && cfg ? { shape, cfg, f } : null;
  }

  private startTypeBracket(): boolean {
    const info = this.typeInfo();
    if (info) this.gesture = { kind: 'tbracket', id: info.shape.id, flip: info.cfg.flip, offset: info.cfg.offset, moved: false };
    return true;
  }

  private dragBracket(g: Extract<Gesture, { kind: 'tbracket' }>, p: Pt): void {
    const info = this.typeInfo();
    if (!info) return;
    const subs = applyCorners(info.shape.subs);
    const local = this.local(info.f, p);
    const hit = nearestParam(subs, local);
    if (!hit) return;
    const side = (local[0] - hit.at[0]) * hit.normal[0] + (local[1] - hit.at[1]) * hit.normal[1];
    const band = (5 * this.h.px()) / info.f.sx;
    const flip: 0 | 1 = Math.abs(side) <= band ? g.flip : side > 0 ? 1 : 0;
    g.flip = flip;
    g.offset = offsetFromParam(subs, info.cfg, hit.t, flip === 1);
    g.moved = true;
  }

  private async finishBracket(g: Extract<Gesture, { kind: 'tbracket' }>): Promise<void> {
    const info = this.typeInfo();
    if (!info || !g.moved) return;
    const c = info.cfg;
    await this.h.commit(typeCommands(this.h.site(), c.path, { text: c.text, size: c.size, offset: g.offset, effect: c.effect, flip: g.flip === 1, align: c.align, spacing: c.spacing }, message => this.h.notify(message)));
  }

  private currentUse(): { id: string; svg: string } | null {
    const site = this.h.site();
    const id = this.h.selection().find(item => site.nodes[item]?.tag === 'use');
    const svg = id ? svgOf(site, id) : undefined;
    return id && svg ? { id, svg } : null;
  }

  private startUse(i: number): boolean {
    const found = this.currentUse();
    const frame = found && useFrame(this.h.site(), found.id);
    if (!found || !frame) return true;
    this.gesture = { kind: 'use', id: found.id, i, svg: found.svg, t: parseTransform(this.h.site().nodes[found.id].attrs.transform), corners: frame.corners, centre: frame.centre };
    return true;
  }

  private dragUseHandle(g: Extract<Gesture, { kind: 'use' }>, p: Pt, event: PointerEvent): void {
    const f = this.h.frame(g.svg);
    if (!f) return;
    const lp = this.local(f, p), c = g.centre;
    let w: Mat;
    if (g.i === 8) {
      const top: Pt = [(g.corners[0][0] + g.corners[1][0]) / 2, (g.corners[0][1] + g.corners[1][1]) / 2];
      let delta = ((Math.atan2(lp[1] - c[1], lp[0] - c[0]) - Math.atan2(top[1] - c[1], top[0] - c[0])) * 180) / Math.PI;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      w = rotation(delta, c[0], c[1]);
    } else {
      const pivot = event.altKey ? c : g.corners[(g.i + 2) % 4], held = g.corners[g.i];
      const k = Math.max(0.01, Math.min(100, dist(lp, pivot) / Math.max(1e-6, dist(held, pivot))));
      w = scaling(k, k, pivot[0], pivot[1]);
    }
    g.next = compose(w, g.t);
    this.h.element(g.id)?.setAttribute('transform', matrixText(g.next));
  }

  private async finishUse(g: Extract<Gesture, { kind: 'use' }>): Promise<void> {
    if (!g.next) return;
    await this.h.commit([updateAttrs(g.id, { transform: matrixText(g.next) })]);
  }

  private decorateUse(items: ExtraItem[], g: Gesture | null): void {
    const found = this.currentUse();
    const frame = found && useFrame(this.h.site(), found.id);
    const f = found ? this.h.frame(found.svg) : undefined;
    if (!found || !frame || !f) return;
    const corners = frame.corners.map(p => this.h.toShell(f, p));
    items.push({ kind: 'path', d: `M${corners.map(p => `${p[0]} ${p[1]}`).join('L')}Z`, cls: 'iso' });
    if (this.h.tool() !== 'select' || (g && g.kind !== 'use')) return;
    corners.forEach((p, i) => items.push({ kind: 'circle', x: p[0], y: p[1], r: 4.5, cls: 'thandle', role: 'x-use', i }));
    const top: Pt = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2], mid = this.h.toShell(f, frame.centre);
    const len = Math.hypot(top[0] - mid[0], top[1] - mid[1]) || 1, reach = 18 * this.h.px();
    const knob: Pt = [top[0] + ((top[0] - mid[0]) / len) * reach, top[1] + ((top[1] - mid[1]) / len) * reach];
    items.push({ kind: 'line', x1: top[0], y1: top[1], x2: knob[0], y2: knob[1], cls: 'gline' }, { kind: 'circle', x: knob[0], y: knob[1], r: 5, cls: 'thandle', role: 'x-use', i: 8 });
  }

  private decorateType(items: ExtraItem[], g: Gesture | null): void {
    const info = this.typeInfo();
    if (!info) return;
    const subs = applyCorners(info.shape.subs);
    const live = g?.kind === 'tbracket' ? { ...info.cfg, offset: g.offset, flip: g.flip } : info.cfg;
    const at = pointAtParam(subs, bracketParam(subs, live));
    if (!at) return;
    const s = this.h.toShell(info.f, at.at);
    const side = live.flip ? 1 : -1;
    const reach = 14 * this.h.px();
    items.push({ kind: 'line', x1: s[0], y1: s[1], x2: s[0] + at.normal[0] * side * reach, y2: s[1] + at.normal[1] * side * reach, cls: 'gline' });
    items.push({ kind: 'circle', x: s[0], y: s[1], r: 6, cls: 'tbracket', role: 'x-tbracket', i: 0 });
  }

  private meshState(): { group: string; spec: WarpSpec; box: Box; svg: string } | null {
    const site = this.h.site();
    for (const id of this.h.selection()) {
      const found = liveOf(site, id);
      if (found?.kind !== 'warp') continue;
      const spec = readWarp(site.nodes[found.group].attrs['data-fw-warp']);
      if (!spec || spec.mode !== 'mesh' || !spec.mesh) continue;
      const attrs = spec.src.map(s => site.nodes[s]?.attrs);
      if (!attrs.every(a => !!a)) continue;
      const box = warpBox(attrs as Record<string, string>[]);
      const svg = svgOf(site, found.group);
      if (box && svg) return { group: found.group, spec, box, svg };
    }
    return null;
  }

  private decorateMesh(items: ExtraItem[], g: Gesture | null): void {
    const state = this.meshState();
    const f = state && this.h.frame(state.svg);
    if (!state || !f) return;
    const { rows, cols, box } = { rows: state.spec.rows!, cols: state.spec.cols!, box: state.box };
    const mesh = g?.kind === 'mesh' ? g.mesh : state.spec.mesh!;
    const at = (i: number, j: number): Pt => { const k = (i * (cols + 1) + j) * 2; return this.h.toShell(f, [box.x + mesh[k] * box.w, box.y + mesh[k + 1] * box.h]); };
    let d = '';
    for (let i = 0; i <= rows; i++) d += `M${[...Array(cols + 1).keys()].map(j => at(i, j).map(n => Math.round(n * 100) / 100).join(' ')).join('L')}`;
    for (let j = 0; j <= cols; j++) d += `M${[...Array(rows + 1).keys()].map(i => at(i, j).map(n => Math.round(n * 100) / 100).join(' ')).join('L')}`;
    items.push({ kind: 'path', d, cls: 'trail' });
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) { const p = at(i, j); items.push({ kind: 'circle', x: p[0], y: p[1], r: 4, cls: g?.kind === 'mesh' && g.idx === i * (cols + 1) + j ? 'wpt-on' : 'thandle', role: 'x-mesh', i: i * (cols + 1) + j }); }
  }

  private dragMesh(g: Extract<Gesture, { kind: 'mesh' }>, p: Pt): void {
    const state = this.meshState();
    const f = state && this.h.frame(state.svg);
    if (!state || !f) return;
    const local = this.local(f, p);
    const clamp = (n: number): number => Math.max(-10, Math.min(10, Math.round(n * 1e5) / 1e5));
    g.mesh[g.idx * 2] = clamp((local[0] - state.box.x) / Math.max(1e-6, state.box.w));
    g.mesh[g.idx * 2 + 1] = clamp((local[1] - state.box.y) / Math.max(1e-6, state.box.h));
    g.moved = true;
  }

  private async finishMesh(g: Extract<Gesture, { kind: 'mesh' }>): Promise<void> {
    const state = this.meshState();
    if (!state || !g.moved) return;
    await this.h.commit([updateAttrs(state.group, { 'data-fw-warp': JSON.stringify({ ...state.spec, mesh: g.mesh }) })]);
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
    if (this.decorateFreeform(items, g)) return;
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

  /* Area type with words left over: a plus in a box at the bottom right of the last shape in its thread (the out port
     plus sign). */
  private decorateOverflow(items: ExtraItem[]): void {
    const site = this.h.site();
    for (const n of Object.values(site.nodes)) {
      if (n.tag !== 'text' || !n.attrs['data-fw-area']) continue;
      const spec = readArea(n.attrs['data-fw-area']);
      if (!spec?.over) continue;
      const last = spec.chain?.length ? spec.chain[spec.chain.length - 1][0] : spec.src;
      const shape = this.h.shape(last);
      const f = shape ? this.h.frame(shape.svg) : undefined;
      const box = shape ? pathBounds(shape.subs) : null;
      if (!f || !box) continue;
      const [x, y] = this.h.toShell(f, [box.x + box.w, box.y + box.h]);
      items.push({ kind: 'path', d: `M${x - 5} ${y - 5}h10v10h-10ZM${x - 3} ${y}h6M${x} ${y - 3}v6`, cls: 'overflow' });
    }
  }

  /* Freeform gradient stops with the Gradient tool: drag to move, drag the ring handle for spread, click inside
     the shape to add, drag outside or press Backspace to remove, double-click for colour and spread. */
  private ffState(): FreeformState | null {
    const site = this.h.site();
    for (const id of this.h.selection()) {
      const found = liveOf(site, id);
      if (found?.kind !== 'freeform') continue;
      const spec = readFreeform(site.nodes[found.group]?.attrs['data-fw-freeform']);
      const src = spec ? site.nodes[spec.src]?.attrs : undefined;
      const box = src ? sourceBox(src) : null;
      const svg = svgOf(site, found.group);
      const f = svg ? this.h.frame(svg) : undefined;
      if (spec && src && box && svg && f) return { group: found.group, spec, src, box, f, svg };
    }
    return null;
  }

  private ffPoint(s: FreeformState, x: number, y: number): Pt { return this.h.toShell(s.f, [s.box.x + x * s.box.w, s.box.y + y * s.box.h]); }

  private ffLocal(s: FreeformState, p: Pt): Pt { const l = this.local(s.f, p); return [(l[0] - s.box.x) / s.box.w, (l[1] - s.box.y) / s.box.h]; }

  private async writeFreeform(s: FreeformState, stops: FreeformStop[]): Promise<void> {
    await this.h.commit(writeStops(this.h.site(), s.svg, s.group, s.spec, stops, s.src));
  }

  private ffClick = { idx: -1, at: 0 };

  private startFreeform(mode: 'move' | 'spread', idx: number): boolean {
    const s = this.ffState();
    const stops = s ? stopsOf(s.spec) : [];
    if (!s || !stops[idx]) return false;
    const now = performance.now();
    const twice = mode === 'move' && this.ffClick.idx === idx && now - this.ffClick.at < 450;
    this.ffClick = { idx: mode === 'move' ? idx : -1, at: twice ? 0 : now };
    this.ffStop = idx;
    if (twice && mode === 'move') {
      openFreeformStop(stops[idx].c, stops[idx].s, (color, spread) => {
        const cur = this.ffState();
        const list = cur ? stopsOf(cur.spec) : [];
        if (!cur || !list[idx]) return;
        list[idx] = { ...list[idx], c: color, s: spread };
        void this.writeFreeform(cur, list);
      });
      this.h.render();
      return true;
    }
    this.gesture = { kind: 'ff', mode, group: s.group, idx, stops, moved: false };
    this.h.render();
    return true;
  }

  private dragFreeform(g: Extract<Gesture, { kind: 'ff' }>, p: Pt): void {
    const s = this.ffState();
    const stop = g.stops[g.idx];
    if (!s || s.group !== g.group || !stop) return;
    const at = this.ffLocal(s, p);
    if (g.mode === 'move') { stop.x = at[0]; stop.y = at[1]; }
    else stop.s = Math.max(SPREAD_MIN, Math.min(1, Math.hypot((at[0] - stop.x) * s.box.w, (at[1] - stop.y) * s.box.h) / Math.hypot(s.box.w, s.box.h)));
    g.moved = true;
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const made = freeformGradient(s.src, [clamp01(stop.x), clamp01(stop.y), stop.s], stop.c);
    const el = stop.grad ? this.h.element(stop.grad) : null;
    if (made && el) for (const [name, value] of Object.entries(made.attrs)) if (value !== null && el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  private async finishFreeform(g: Extract<Gesture, { kind: 'ff' }>): Promise<void> {
    const s = this.ffState();
    const stop = g.stops[g.idx];
    if (!s || s.group !== g.group || !stop || !g.moved) return;
    const outside = g.mode === 'move' && (stop.x < -0.02 || stop.x > 1.02 || stop.y < -0.02 || stop.y > 1.02);
    if (outside && g.stops.length > 1) { g.stops.splice(g.idx, 1); this.ffStop = Math.max(0, g.idx - 1); }
    else if (outside) this.h.notify('A freeform gradient keeps at least one stop.');
    await this.writeFreeform(s, g.stops);
  }

  private addFreeformStop(s: FreeformState, p: Pt): boolean {
    const at = this.ffLocal(s, p);
    if (at[0] < 0 || at[0] > 1 || at[1] < 0 || at[1] > 1) return false;
    const hit = this.h.pick(p);
    if (!hit || liveOf(this.h.site(), hit.id)?.group !== s.group) return false;
    const stops = stopsOf(s.spec);
    if (stops.length >= FREEFORM_LIMIT) { this.h.notify(`A freeform gradient holds at most ${FREEFORM_LIMIT} stops.`); return true; }
    const gap = (st: FreeformStop): number => Math.hypot(st.x - at[0], st.y - at[1]);
    const near = stops.reduce((best, st, i) => (gap(st) < gap(stops[best]) ? i : best), 0);
    if (this.ffMode === 'lines' && (!this.ffLine || !stops.some(st => st.ln === this.ffLine))) {
      const top = Math.max(0, ...stops.map(st => st.ln ?? 0));
      if (top >= FREEFORM_LIMIT) { this.h.notify('This freeform gradient has no room for another line.'); return true; }
      this.ffLine = top + 1;
    }
    stops.push({ grad: null, x: at[0], y: at[1], s: stops[near].s, c: turnHue(stops[near].c, 40), ln: this.ffMode === 'lines' ? this.ffLine : 0 });
    this.ffStop = stops.length - 1;
    void this.writeFreeform(s, stops);
    return true;
  }

  setFreeformMode(mode: 'points' | 'lines'): void {
    this.ffMode = mode;
    this.ffLine = 0;
    this.h.render();
    this.h.emit();
  }

  deleteFreeformStop(): boolean {
    if (this.h.tool() !== 'gradient') return false;
    const s = this.ffState();
    if (!s) return false;
    const stops = stopsOf(s.spec);
    if (stops.length <= 1) { this.h.notify('A freeform gradient keeps at least one stop.'); return true; }
    const idx = Math.min(this.ffStop, stops.length - 1);
    stops.splice(idx, 1);
    this.ffStop = Math.max(0, idx - 1);
    void this.writeFreeform(s, stops);
    return true;
  }

  private decorateFreeform(items: ExtraItem[], g: Gesture | null): boolean {
    const s = this.ffState();
    if (!s) return false;
    const stops = g?.kind === 'ff' && g.group === s.group ? g.stops : stopsOf(s.spec);
    const diag = Math.hypot(s.box.w, s.box.h);
    for (const k of new Set(stops.map(st => st.ln ?? 0).filter(k => k > 0))) {
      const pts = stops.filter(st => st.ln === k).map(st => this.ffPoint(s, st.x, st.y));
      if (pts.length > 1) items.push({ kind: 'path', d: poly(pts), cls: 'gline' });
    }
    stops.forEach((st, i) => {
      const c = this.ffPoint(s, st.x, st.y);
      if (i === this.ffStop) {
        const edge = this.h.toShell(s.f, [s.box.x + st.x * s.box.w + Math.max(1, st.s * diag), s.box.y + st.y * s.box.h]);
        const r = dist(c, edge);
        items.push({ kind: 'path', d: `M${c[0] - r} ${c[1]}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`, cls: 'gring' });
        items.push({ kind: 'circle', x: edge[0], y: edge[1], r: 4, cls: 'gend', role: 'x-ffr', i });
      }
      items.push({ kind: 'circle', x: c[0], y: c[1], r: 6, cls: i === this.ffStop ? 'gstop-on' : 'gstop', role: 'x-ffs', i, fill: st.c });
    });
    return true;
  }

  private decorateTransform(items: ExtraItem[]): void {
    const ready = this.transformBox();
    if (!ready) return;
    const { box, f } = ready;
    const pt = (x: number, y: number): Pt => this.h.toShell(f, [x, y]);
    const a = pt(box.x, box.y), c = pt(box.x + box.w, box.y + box.h);
    items.push({ kind: 'path', d: `M${a[0]} ${a[1]}H${c[0]}V${c[1]}H${a[0]}Z`, cls: 'tbox' });
    const quad = this.gesture?.kind === 'tf' ? this.gesture.quad : undefined;
    if (quad) items.push({ kind: 'path', d: `M${quad.map(q => pt(q[0], q[1])).map(p => `${p[0]} ${p[1]}`).join('L')}Z`, cls: 'trail' });
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
