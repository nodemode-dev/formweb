import { applyCorners } from './corners';
import { bezierAt, clonePath, dist, mapPath, moveAnchor, nearestOnPath, type Anchor, type Pt, type SubPath } from './geometry';
import { addAnchor } from './edit';
import type { Host } from './host';
import type { Scene } from './overlay';
import { updateGeometry, type Shape } from './store';

/* Moving least squares (Schaefer, McPhail and Warren 2006) */

/**
 * Builds the rigid moving-least-squares deformation that takes the control points `p` to `q`.
 * Weights are 1 / |p - v|^2. With one control point (or a degenerate fit) the map is a translation.
 */
export function mlsMap(p: Pt[], q: Pt[], rigid = true): (v: Pt) => Pt {
  return v => {
    let sw = 0, px = 0, py = 0, qx = 0, qy = 0;
    const w: number[] = new Array(p.length);
    for (let i = 0; i < p.length; i++) {
      const dx = v[0] - p[i][0], dy = v[1] - p[i][1], d2 = dx * dx + dy * dy;
      if (d2 < 1e-12) return [q[i][0], q[i][1]];
      const wi = 1 / d2;
      w[i] = wi;
      sw += wi;
      px += wi * p[i][0]; py += wi * p[i][1];
      qx += wi * q[i][0]; qy += wi * q[i][1];
    }
    px /= sw; py /= sw; qx /= sw; qy /= sw;
    let a = 0, b = 0, mu = 0;
    for (let i = 0; i < p.length; i++) {
      const hx = p[i][0] - px, hy = p[i][1] - py, kx = q[i][0] - qx, ky = q[i][1] - qy;
      a += w[i] * (hx * kx + hy * ky);
      b += w[i] * (hx * ky - hy * kx);
      mu += w[i] * (hx * hx + hy * hy);
    }
    const dx = v[0] - px, dy = v[1] - py;
    const norm = rigid ? Math.hypot(a, b) : mu;
    if (norm < 1e-9) return [qx + dx, qy + dy];
    return [qx + (a * dx - b * dy) / norm, qy + (b * dx + a * dy) / norm];
  };
}

/* Puppet Warp tool */

interface Drag { start: Pt; moved: boolean; ids: number[]; from: Pt[]; base: Map<string, SubPath[]>; last: Map<string, SubPath[]> }

const PIN_R = 6;

export class Puppet {
  pins: Pt[] = [];
  selected = new Set<number>();
  private drag: Drag | null = null;
  private svg = '';
  private sig = '\0';
  private pending = false;

  constructor(private h: Host) {}

  onTool(next: string | null): void {
    this.pins = [];
    this.selected.clear();
    this.drag = null;
    this.sig = '\0';
    this.svg = '';
    if (next !== 'puppet') this.pending = false;
  }

  shapes(): Shape[] {
    const all = this.h.selection().map(id => this.h.shape(id)).filter((s): s is Shape => !!s);
    return all.length ? all.filter(s => s.svg === all[0].svg) : [];
  }

  private signature(shapes: Shape[]): string {
    const nodes = this.h.site().nodes;
    return shapes.map(s => `${s.id}:${nodes[s.id]?.attrs.d ?? ''}`).join('|');
  }

  /** Pins belong to the selection as it stands in the document. Any change not made by a pin drag starts over with three pins. */
  private ensure(): void {
    if (this.drag || this.pending) return;
    const shapes = this.shapes();
    const sig = this.signature(shapes);
    if (sig === this.sig) return;
    this.sig = sig;
    this.pins = [];
    this.selected.clear();
    this.svg = shapes[0]?.svg ?? '';
    if (shapes.length) this.pins = autoPins(shapes);
  }

  down(role: string, index: number, p: Pt, event: PointerEvent): boolean {
    this.ensure();
    const h = this.h;
    const f = this.svg ? h.frame(this.svg) : undefined;
    if (!f) return true;
    if (role === 'x-pin' && this.pins[index]) {
      if (event.altKey) {
        this.pins.splice(index, 1);
        this.selected = new Set([...this.selected].filter(i => i !== index).map(i => (i > index ? i - 1 : i)));
        h.render();
        return true;
      }
      if (event.shiftKey) { if (this.selected.has(index)) this.selected.delete(index); else this.selected.add(index); }
      else if (!this.selected.has(index)) this.selected = new Set([index]);
      if (this.selected.has(index)) this.start(p);
      h.render();
      return true;
    }
    const shapes = this.shapes();
    const hit = h.pick(p);
    if (hit?.kind === 'path' && shapes.some(s => s.id === hit.id)) {
      this.pins.push(h.toLocal(f, p));
      this.selected = new Set([this.pins.length - 1]);
      this.start(p);
      h.render();
      return true;
    }
    if (hit?.kind === 'path') { h.setSelection([hit.id]); return true; }
    if (!event.shiftKey && this.selected.size) { this.selected.clear(); h.render(); }
    return true;
  }

  private start(p: Pt): void {
    const base = new Map<string, SubPath[]>();
    for (const s of this.shapes()) base.set(s.id, clonePath(s.subs));
    this.drag = { start: p, moved: false, ids: [...this.selected], from: this.pins.map(q => [q[0], q[1]] as Pt), base, last: new Map() };
  }

  move(p: Pt): boolean {
    const d = this.drag;
    if (!d) return false;
    if (!d.moved && dist(p, d.start) < 2 * this.h.px()) return true;
    const f = this.svg ? this.h.frame(this.svg) : undefined;
    if (!f) return true;
    d.moved = true;
    const dx = (p[0] - d.start[0]) / f.sx, dy = (p[1] - d.start[1]) / f.sy;
    const to = d.from.map((q, i) => (d.ids.includes(i) ? [q[0] + dx, q[1] + dy] as Pt : q));
    const map = mlsMap(d.from, to);
    for (const [id, base] of d.base) {
      const next = mapPath(base, map);
      d.last.set(id, next);
      this.h.draft(id, next);
    }
    this.pins = to.map(q => [q[0], q[1]] as Pt);
    this.h.render();
    return true;
  }

  up(): boolean {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    if (!d.moved || !d.last.size) { this.h.render(); return true; }
    const cmds = [...d.last].map(([id, subs]) => updateGeometry(id, subs));
    this.pending = true;
    void this.h.commit(cmds).then(ok => {
      if (!ok) this.pins = d.from;
      this.sig = this.signature(this.shapes());
      this.pending = false;
      this.h.render();
    });
    return true;
  }

  cancel(): boolean {
    const d = this.drag;
    if (!d) return false;
    this.drag = null;
    if (d.moved) for (const [id, base] of d.base) this.h.draft(id, base);
    this.h.clearDrafts();
    this.pins = d.from;
    this.h.render();
    return true;
  }

  decorate(scene: Scene): void {
    if (scene.tool !== 'puppet') return;
    this.ensure();
    const f = this.svg ? this.h.frame(this.svg) : undefined;
    if (!f) return;
    const extras = scene.extras ?? [];
    this.pins.forEach((pin, i) => {
      const [x, y] = this.h.toShell(f, pin);
      extras.push({ kind: 'circle', x, y, r: PIN_R, cls: this.selected.has(i) ? 'pin-on' : 'pin', role: 'x-pin', i });
    });
    scene.extras = extras;
  }
}

/** Three anchors spread over the selection by farthest-point sampling, or bounds points when there are too few anchors. */
export function autoPins(shapes: Shape[]): Pt[] {
  const pts: Pt[] = [];
  for (const s of shapes) for (const sub of applyCorners(s.subs)) for (const n of sub.nodes) pts.push([n.x, n.y]);
  if (!pts.length) return [];
  const cx = pts.reduce((sum, q) => sum + q[0], 0) / pts.length, cy = pts.reduce((sum, q) => sum + q[1], 0) / pts.length;
  const unique: Pt[] = [];
  for (const q of pts) if (!unique.some(u => dist(u, q) < 1e-6)) unique.push(q);
  if (unique.length < 3) {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return [[x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2], [x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.5], [x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.85]];
  }
  const out: Pt[] = [];
  let first = unique[0];
  for (const q of unique) if (dist(q, [cx, cy]) > dist(first, [cx, cy]) + 1e-6) first = q;
  out.push(first);
  while (out.length < 3) {
    let best = unique[0], bestD = -1;
    for (const q of unique) {
      const dd = Math.min(...out.map(o => dist(o, q)));
      if (dd > bestD) { best = q; bestD = dd; }
    }
    out.push(best);
  }
  return out.map(q => [q[0], q[1]] as Pt);
}

/* Reshape tool */

const HIT = 7;
const SEGMENT_NEIGHBOUR = 0.35;
const OTHER_PATH = 0.25;

function segmentLength(a: Anchor, b: Anchor): number {
  const seg = { p0: [a.x, a.y] as Pt, c1: a.out ?? ([a.x, a.y] as Pt), c2: b.in ?? ([b.x, b.y] as Pt), p3: [b.x, b.y] as Pt };
  let total = 0, prev = seg.p0;
  for (let k = 1; k <= 16; k++) { const q = bezierAt(seg, k / 16); total += dist(prev, q); prev = q; }
  return total;
}

/** Along-path distance between anchors of one sub path, and the longest possible such distance. */
function pathDistances(sub: SubPath): { dist: (i: number, j: number) => number; max: number } {
  const n = sub.nodes.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + segmentLength(sub.nodes[i - 1], sub.nodes[i]));
  const total = sub.closed && n > 1 ? cum[n - 1] + segmentLength(sub.nodes[n - 1], sub.nodes[0]) : cum[n - 1];
  const max = Math.max(1e-9, sub.closed ? total / 2 : total);
  return { dist: (i, j) => { const arc = Math.abs(cum[j] - cum[i]); return sub.closed ? Math.min(arc, total - arc) : arc; }, max };
}

/** Weight of every moved anchor for a drag of `from`: 1 for the dragged anchor, falling off with path distance for other selected anchors. */
export function reshapeWeights(shapes: Shape[], selected: Set<string>, from: string): Map<string, number> {
  const out = new Map<string, number>([[from, 1]]);
  const [fid, fsub, fidx] = from.split('|');
  for (const shape of shapes) {
    shape.subs.forEach((sub, si) => {
      const dists = shape.id === fid && si === Number(fsub) ? pathDistances(sub) : null;
      sub.nodes.forEach((_, idx) => {
        const key = `${shape.id}|${si}|${idx}`;
        if (key === from || !selected.has(key)) return;
        out.set(key, dists ? 1 - 0.75 * Math.min(1, dists.dist(Number(fidx), idx) / dists.max) : OTHER_PATH);
      });
    });
  }
  return out;
}

interface Pull { start: Pt; moved: boolean; added: string | null; base: Map<string, SubPath[]>; weights: Map<string, number>; last: Map<string, SubPath[]> }

export class Reshape {
  private g: Pull | null = null;

  constructor(private h: Host) {}

  private shapes(): Shape[] { return this.h.selection().map(id => this.h.shape(id)).filter((s): s is Shape => !!s); }

  /** Starts a reshape drag on a selected anchor, or on a path segment when no anchor is selected. Returns false to leave the click to Direct Selection. */
  down(p: Pt, event: PointerEvent, onAnchor: boolean): boolean {
    if (event.shiftKey || event.altKey) return false;
    const h = this.h;
    const shapes = this.shapes();
    const anchors = h.anchors();
    const tolerance = HIT * h.px();
    if (anchors.size) {
      for (const shape of shapes) {
        const f = h.frame(shape.svg);
        if (!f) continue;
        for (let si = 0; si < shape.subs.length; si++) {
          for (let idx = 0; idx < shape.subs[si].nodes.length; idx++) {
            const key = `${shape.id}|${si}|${idx}`;
            const n = shape.subs[si].nodes[idx];
            if (!anchors.has(key) || dist(h.toShell(f, [n.x, n.y]), p) > tolerance) continue;
            this.begin(p, new Map(shapes.map(s => [s.id, clonePath(s.subs)])), reshapeWeights(shapes, anchors, key), null);
            return true;
          }
        }
      }
      return false;
    }
    if (onAnchor) return false;
    for (const shape of shapes) {
      const f = h.frame(shape.svg);
      if (!f) continue;
      const local = h.toLocal(f, p);
      const near = nearestOnPath(applyCorners(shape.subs), local);
      if (!near || near.d * f.sx > tolerance + 2) continue;
      const subs = clonePath(shape.subs);
      const added = addAnchor(subs, local, (tolerance + 2) / f.sx * 2);
      if (!added) continue;
      const key = `${shape.id}|${added.sub}|${added.index}`;
      const sub = subs[added.sub];
      const weights = new Map<string, number>([[key, 1]]);
      const n = sub.nodes.length;
      for (const j of [added.index - 1, added.index + 1]) {
        const k = sub.closed ? (j + n) % n : j;
        if (k >= 0 && k < n && k !== added.index) weights.set(`${shape.id}|${added.sub}|${k}`, SEGMENT_NEIGHBOUR);
      }
      anchors.add(key);
      this.begin(p, new Map([[shape.id, subs]]), weights, key);
      h.render();
      h.emit();
      return true;
    }
    return false;
  }

  private begin(start: Pt, base: Map<string, SubPath[]>, weights: Map<string, number>, added: string | null): void {
    this.g = { start, moved: false, added, base, weights, last: new Map() };
  }

  move(p: Pt): boolean {
    const g = this.g;
    if (!g) return false;
    if (!g.moved && dist(p, g.start) < 2 * this.h.px()) return true;
    g.moved = true;
    const byShape = new Map<string, Map<string, number>>();
    for (const [key, w] of g.weights) {
      const id = key.split('|')[0];
      byShape.set(id, (byShape.get(id) ?? new Map()).set(key, w));
    }
    for (const [id, weights] of byShape) {
      const base = g.base.get(id);
      const shape = this.h.shape(id);
      const f = shape && this.h.frame(shape.svg);
      if (!base || !f) continue;
      const dx = (p[0] - g.start[0]) / f.sx, dy = (p[1] - g.start[1]) / f.sy;
      const next = clonePath(base);
      for (const [key, w] of weights) {
        const [, si, idx] = key.split('|');
        const n = next[Number(si)]?.nodes[Number(idx)];
        const o = base[Number(si)]?.nodes[Number(idx)];
        if (n && o) moveAnchor(n, o.x + dx * w, o.y + dy * w);
      }
      g.last.set(id, next);
      this.h.draft(id, next);
    }
    this.h.render();
    return true;
  }

  up(): boolean {
    const g = this.g;
    if (!g) return false;
    this.g = null;
    if (!g.moved || !g.last.size) {
      if (g.added) this.h.anchors().delete(g.added);
      this.h.render();
      this.h.emit();
      return true;
    }
    void this.h.commit([...g.last].map(([id, subs]) => updateGeometry(id, subs)));
    return true;
  }

  cancel(): boolean {
    const g = this.g;
    if (!g) return false;
    this.g = null;
    if (g.moved) for (const [id, base] of g.base) if (g.last.has(id)) this.h.draft(id, g.added ? clonePath(base) : base);
    this.h.clearDrafts();
    if (g.added) this.h.anchors().delete(g.added);
    this.h.render();
    return true;
  }
}
