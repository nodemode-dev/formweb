import { applyCorners } from './corners';
import { nearestOnPath, pathBounds, type Pt } from './geometry';
import type { Host } from './host';
import { pathIds, viewBoxOf } from './store';

export interface Guide { a: Pt; b: Pt; kind: 'x' | 'y' | 'angle' | 'point' | 'segment' }
export interface SnapResult { p: Pt; guides: Guide[] }
export interface SnapOptions { tolerance: number; exclude: Set<string>; origin?: Pt; angles?: boolean }

export function snapLocal(h: Host, svg: string, p: Pt, o: SnapOptions): SnapResult {
  const site = h.site();
  const points: Pt[] = [];
  const subsList = [];
  for (const id of pathIds(site, svg)) {
    if (o.exclude.has(id)) continue;
    const shape = h.shape(id);
    if (!shape) continue;
    const subs = applyCorners(shape.subs);
    subsList.push(subs);
    for (const sub of shape.subs) for (const n of sub.nodes) points.push([n.x, n.y]);
    const box = pathBounds(subs);
    if (box) points.push([box.x + box.w / 2, box.y + box.h / 2]);
  }
  const node = site.nodes[svg];
  if (node) {
    const vb = viewBoxOf(node);
    points.push([vb[0], vb[1]], [vb[0] + vb[2], vb[1] + vb[3]], [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]);
  }
  const tol = o.tolerance;
  const guides: Guide[] = [];
  let best: Pt | null = null, bestD = tol;
  for (const q of points) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) { best = q; bestD = d; }
  }
  if (best) return { p: [best[0], best[1]], guides: [{ a: best, b: best, kind: 'point' }] };
  let x = p[0], y = p[1];
  let ax: Pt | null = null, ay: Pt | null = null;
  let dx = tol, dy = tol;
  for (const q of points) {
    if (Math.abs(q[0] - p[0]) < dx) { dx = Math.abs(q[0] - p[0]); x = q[0]; ax = q; }
    if (Math.abs(q[1] - p[1]) < dy) { dy = Math.abs(q[1] - p[1]); y = q[1]; ay = q; }
  }
  if (o.origin && o.angles && !ax && !ay) {
    const vx = p[0] - o.origin[0], vy = p[1] - o.origin[1], l = Math.hypot(vx, vy);
    if (l > tol * 2) {
      const step = Math.PI / 4, a = Math.atan2(vy, vx), snapped = Math.round(a / step) * step;
      if (Math.abs(a - snapped) * l < tol) {
        const at: Pt = [o.origin[0] + Math.cos(snapped) * l, o.origin[1] + Math.sin(snapped) * l];
        return { p: at, guides: [{ a: o.origin, b: at, kind: 'angle' }] };
      }
    }
  }
  if (ax) guides.push({ a: [x, Math.min(y, ax[1])], b: [x, Math.max(y, ax[1])], kind: 'x' });
  if (ay) guides.push({ a: [Math.min(x, ay[0]), y], b: [Math.max(x, ay[0]), y], kind: 'y' });
  if (guides.length) return { p: [x, y], guides };
  for (const subs of subsList) {
    const hit = nearestOnPath(subs, p);
    if (hit && hit.d < tol) return { p: hit.at, guides: [{ a: hit.at, b: hit.at, kind: 'segment' }] };
  }
  return { p, guides: [] };
}
