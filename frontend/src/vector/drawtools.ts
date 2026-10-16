import type { Command } from '../types';
import { reverseSub } from './edit';
import { clonePath, dist, ellipsePath, inferKind, linePath, mapPath, rectPath, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import { addPath, freshId, updateGeometry, type Paint } from './store';

/** Tools that are drawn by dragging a box and produce a group of paths. */
export const GRID_TOOLS = new Set<string>(['rgrid', 'pgrid']);
/** Tools handled by this module (they never show anchor points of the selection). */
export const DRAW_TOOLS = new Set<string>(['pencil', 'rgrid', 'pgrid']);

export interface GridOptions { hdiv: number; vdiv: number; rings: number; spokes: number }
export const gridOptions: GridOptions = { hdiv: 5, vdiv: 5, rings: 5, spokes: 5 };

const clampCount = (n: number, lo: number, hi: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : lo);

export function setGridOptions(next: Partial<GridOptions>): void {
  if (next.hdiv !== undefined) gridOptions.hdiv = clampCount(next.hdiv, 0, 100);
  if (next.vdiv !== undefined) gridOptions.vdiv = clampCount(next.vdiv, 0, 100);
  if (next.rings !== undefined) gridOptions.rings = clampCount(next.rings, 1, 100);
  if (next.spokes !== undefined) gridOptions.spokes = clampCount(next.spokes, 0, 360);
}

/** The drag box shared by the grid tools: Shift makes it square, Alt draws from the centre. */
export function dragBox(a: Pt, b: Pt, alt: boolean, shift: boolean): { x: number; y: number; w: number; h: number } {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  if (shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
  let x = a[0], y = a[1];
  if (alt) { x -= dx; y -= dy; dx *= 2; dy *= 2; }
  return { x: Math.min(x, x + dx), y: Math.min(y, y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

export interface GridPart { subs: SubPath[]; open: boolean; name: string }

/** The pieces of a grid inside a box, in the box's own coordinates. The first part is the frame. */
export function gridParts(tool: string, box: { x: number; y: number; w: number; h: number }, options: GridOptions = gridOptions): GridPart[] {
  const parts: GridPart[] = [];
  if (tool === 'rgrid') {
    parts.push({ subs: [rectPath(box.x, box.y, box.w, box.h)], open: false, name: 'Grid frame' });
    for (let i = 1; i <= options.hdiv; i++) {
      const y = box.y + (box.h * i) / (options.hdiv + 1);
      parts.push({ subs: [linePath([box.x, y], [box.x + box.w, y])], open: true, name: 'Horizontal divider' });
    }
    for (let i = 1; i <= options.vdiv; i++) {
      const x = box.x + (box.w * i) / (options.vdiv + 1);
      parts.push({ subs: [linePath([x, box.y], [x, box.y + box.h])], open: true, name: 'Vertical divider' });
    }
    return parts;
  }
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, rx = box.w / 2, ry = box.h / 2;
  for (let i = 1; i <= options.rings; i++) {
    const f = i / options.rings;
    parts.push({ subs: [ellipsePath(cx, cy, rx * f, ry * f)], open: false, name: 'Concentric ring' });
  }
  for (let i = 0; i < options.spokes; i++) {
    const a = (i * 2 * Math.PI) / options.spokes - Math.PI / 2;
    parts.push({ subs: [linePath([cx, cy], [cx + rx * Math.cos(a), cy + ry * Math.sin(a)])], open: true, name: 'Radial divider' });
  }
  return parts;
}

/** Every part drawn as one list of subpaths, for the live preview while dragging. */
export function gridPreview(tool: string, a: Pt, b: Pt, alt: boolean, shift: boolean): SubPath[] {
  return gridParts(tool, dragBox(a, b, alt, shift)).flatMap(part => part.subs);
}

/** Grids are line art: no fill, the current stroke (or the fill colour when the stroke is off). */
export function gridPaint(base: Paint): Paint {
  return { ...base, fill: 'none', stroke: base.stroke === 'none' ? base.fill : base.stroke, strokeWidth: Math.max(1, base.strokeWidth) };
}

/* Pencil */

export interface PencilJoin { id: string; sub: number; end: 'start' | 'end' }

/** The open path end under the pointer in the current selection, when the Pencil may continue it. */
export function pencilJoin(h: Host, p: Pt, tolerance: number): PencilJoin | undefined {
  for (const id of h.selection()) {
    const shape = h.shape(id);
    const f = shape && h.frame(shape.svg);
    if (!shape || !f) continue;
    for (let si = 0; si < shape.subs.length; si++) {
      const sub = shape.subs[si];
      if (sub.closed || sub.nodes.length < 2) continue;
      const first = sub.nodes[0], last = sub.nodes[sub.nodes.length - 1];
      const dEnd = dist(h.toShell(f, [last.x, last.y]), p), dStart = dist(h.toShell(f, [first.x, first.y]), p);
      if (Math.min(dEnd, dStart) <= tolerance) return { id, sub: si, end: dEnd <= dStart ? 'end' : 'start' };
    }
  }
  return undefined;
}

/** Appends a freshly fitted stroke (already in the path's own coordinates) to an end of an open subpath. */
export function joinStroke(sub: SubPath, stroke: SubPath, end: 'start' | 'end'): SubPath {
  const base = clonePath([sub])[0];
  const added = clonePath([end === 'end' ? stroke : reverseSub(stroke)])[0];
  if (end === 'end') {
    const last = base.nodes[base.nodes.length - 1];
    last.out = added.nodes[0].out;
    last.kind = inferKind(last);
    base.nodes.push(...added.nodes.slice(1));
  } else {
    const first = base.nodes[0];
    first.in = added.nodes[added.nodes.length - 1].in;
    first.kind = inferKind(first);
    base.nodes.unshift(...added.nodes.slice(0, -1));
  }
  base.nodes[0].in = null;
  base.nodes[base.nodes.length - 1].out = null;
  return base;
}

/**
 * Finishes a Pencil stroke. A stroke that started on the end of the selected open path extends that path and
 * returns null; otherwise the stroke is returned (closed when Alt is held) to be added as a new path.
 */
export function pencilFinish(h: Host, stroke: SubPath, join: PencilJoin | undefined, close: boolean): SubPath | null {
  const shape = join ? h.shape(join.id) : undefined;
  const f = shape && h.frame(shape.svg);
  if (join && shape && f && stroke.nodes.length >= 2) {
    const local = mapPath([stroke], q => h.toLocal(f, q))[0];
    const target = shape.subs[join.sub];
    const at = join.end === 'end' ? target.nodes[target.nodes.length - 1] : target.nodes[0];
    local.nodes[0].x = at.x;
    local.nodes[0].y = at.y;
    const subs = shape.subs.map((sub, i) => (i === join.sub ? joinStroke(sub, local, join.end) : sub));
    void h.commit([updateGeometry(join.id, subs)], [join.id]);
    return null;
  }
  if (close && stroke.nodes.length >= 3) {
    const first = stroke.nodes[0], last = stroke.nodes[stroke.nodes.length - 1];
    const nodes = Math.hypot(first.x - last.x, first.y - last.y) < 1e-6 ? stroke.nodes.slice(0, -1) : stroke.nodes;
    return { closed: true, nodes };
  }
  return stroke;
}

/* Grids */

/** Adds a grid as one group of paths. `svg` is the target svg (local frame); returns the commands and the group id. */
export function gridGroupCommands(h: Host, svg: string, parts: GridPart[], paint: Paint, pick: (p: Pt) => Pt): { cmds: Command[]; group: string; ids: string[] } {
  const site = h.site();
  const taken = new Set<string>();
  const group = freshId(site, taken, 'group');
  const cmds: Command[] = [{ command: 'node.add', params: { parent: svg, node: { id: group, tag: 'g', name: 'Grid', attrs: {} } } }];
  const ids: string[] = [];
  for (const part of parts) {
    const id = freshId(site, taken, 'path');
    ids.push(id);
    cmds.push(addPath(group, id, mapPath(part.subs, pick), paint, part.name));
  }
  return { cmds, group, ids };
}
