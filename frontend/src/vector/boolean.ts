import { fitCurve } from './fit';
import { applyCorners } from './corners';
import { segments, type Anchor, type Pt, type SubPath } from './geometry';

export type Ring = Pt[];
export interface Region { groups: Ring[][] }
export type MergeOp = 'union' | 'combine' | 'fragment' | 'intersect' | 'subtract' | 'exclude';
export interface Piece { subs: SubPath[]; sig: number }
export type PathfinderOp = 'unite' | 'minus-front' | 'intersect' | 'exclude' | 'divide' | 'trim' | 'merge' | 'crop' | 'minus-back' | 'outline';

export interface PathfinderInput { subs: SubPath[]; fill: string; stroke?: string; index: number }
export const pathfinderOptions = { precision: 0.028, redundant: true, unpainted: false };
export interface PathfinderOutput { subs: SubPath[]; source: number; fillRule: 'nonzero' | 'evenodd'; stroke: boolean; outline?: boolean }

const SNAP = 1000;
const flatTol = (): number => pathfinderOptions.precision;
const fitTol = (): number => pathfinderOptions.precision * 2;

const key = (p: Pt): string => `${Math.round(p[0] * SNAP)},${Math.round(p[1] * SNAP)}`;
const snap = (p: Pt): Pt => [Math.round(p[0] * SNAP) / SNAP, Math.round(p[1] * SNAP) / SNAP];

function flatten(subs: SubPath[], smooth: Set<string>): Ring[] {
  const closed = subs.map(s => ({ ...s, closed: true }));
  const out: Ring[] = [];
  const bySub = new Map<number, Ring>();
  for (const s of segments(closed)) {
    let ring = bySub.get(s.sub);
    if (!ring) { ring = [s.p0]; bySub.set(s.sub, ring); out.push(ring); }
    if (s.line) { ring.push(s.p3); continue; }
    const m = Math.max(Math.hypot(s.p0[0] - 2 * s.c1[0] + s.c2[0], s.p0[1] - 2 * s.c1[1] + s.c2[1]), Math.hypot(s.c1[0] - 2 * s.c2[0] + s.p3[0], s.c1[1] - 2 * s.c2[1] + s.p3[1]));
    const n = Math.max(1, Math.min(256, Math.ceil(Math.sqrt((0.75 * m) / flatTol()))));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      const p: Pt = [a * s.p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p3[0], a * s.p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p3[1]];
      if (i < n) smooth.add(key(p));
      ring.push(p);
    }
  }
  for (const r of out) {
    const f = r[0], l = r[r.length - 1];
    if (r.length > 1 && Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) r.pop();
  }
  return out.filter(r => r.length >= 3);
}

function inRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRegion(reg: Region, x: number, y: number): boolean {
  for (const g of reg.groups) {
    let odd = false;
    for (const r of g) if (inRing(r, x, y)) odd = !odd;
    if (odd) return true;
  }
  return false;
}

interface E0 { a: Pt; b: Pt; cuts: Array<[number, Pt]> }

const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

function intersectAll(edges: E0[]): void {
  const order = edges.map((e, i) => ({ i, lo: Math.min(e.a[0], e.b[0]), hi: Math.max(e.a[0], e.b[0]) })).sort((p, q) => p.lo - q.lo);
  const eps = 1e-9;
  for (let oi = 0; oi < order.length; oi++) {
    const A = edges[order[oi].i];
    const ahi = order[oi].hi;
    const aylo = Math.min(A.a[1], A.b[1]), ayhi = Math.max(A.a[1], A.b[1]);
    for (let oj = oi + 1; oj < order.length && order[oj].lo <= ahi + 1e-6; oj++) {
      const B = edges[order[oj].i];
      if (Math.max(B.a[1], B.b[1]) < aylo - 1e-6 || Math.min(B.a[1], B.b[1]) > ayhi + 1e-6) continue;
      const rx = A.b[0] - A.a[0], ry = A.b[1] - A.a[1], sx = B.b[0] - B.a[0], sy = B.b[1] - B.a[1];
      const den = cross(rx, ry, sx, sy);
      const qpx = B.a[0] - A.a[0], qpy = B.a[1] - A.a[1];
      const lr = Math.hypot(rx, ry), ls = Math.hypot(sx, sy);
      if (!lr || !ls) continue;
      if (Math.abs(den) <= 1e-12 * lr * ls) {
        if (Math.abs(cross(qpx, qpy, rx, ry)) / lr > 1e-6) continue;
        const rr = rx * rx + ry * ry, ss = sx * sx + sy * sy;
        const t0 = (qpx * rx + qpy * ry) / rr, t1 = ((B.b[0] - A.a[0]) * rx + (B.b[1] - A.a[1]) * ry) / rr;
        if (t0 > eps && t0 < 1 - eps) A.cuts.push([t0, B.a]);
        if (t1 > eps && t1 < 1 - eps) A.cuts.push([t1, B.b]);
        const u0 = ((A.a[0] - B.a[0]) * sx + (A.a[1] - B.a[1]) * sy) / ss, u1 = ((A.b[0] - B.a[0]) * sx + (A.b[1] - B.a[1]) * sy) / ss;
        if (u0 > eps && u0 < 1 - eps) B.cuts.push([u0, A.a]);
        if (u1 > eps && u1 < 1 - eps) B.cuts.push([u1, A.b]);
        continue;
      }
      const t = cross(qpx, qpy, sx, sy) / den, u = cross(qpx, qpy, rx, ry) / den;
      if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) continue;
      const p: Pt = [A.a[0] + t * rx, A.a[1] + t * ry];
      if (t > eps && t < 1 - eps) A.cuts.push([t, p]);
      if (u > eps && u < 1 - eps) B.cuts.push([u, p]);
    }
  }
}

interface Edge { a: Pt; b: Pt; ka: string; kb: string; sig: [number, number] }

function arrange(regions: Region[]): Edge[] {
  const raw: E0[] = [];
  for (const reg of regions) for (const g of reg.groups) for (const r of g) for (let i = 0; i < r.length; i++) raw.push({ a: r[i], b: r[(i + 1) % r.length], cuts: [] });
  intersectAll(raw);
  const seen = new Map<string, Edge>();
  for (const e of raw) {
    const chain: Pt[] = [e.a, ...e.cuts.sort((p, q) => p[0] - q[0]).map(c => c[1]), e.b];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = snap(chain[i]), b = snap(chain[i + 1]);
      const ka = key(a), kb = key(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (!seen.has(k)) seen.set(k, { a, b, ka, kb, sig: [0, 0] });
    }
  }
  const edges = [...seen.values()];
  for (const e of edges) {
    const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], len = Math.hypot(dx, dy);
    const off = Math.min(0.01, len / 4);
    const mx = (e.a[0] + e.b[0]) / 2, my = (e.a[1] + e.b[1]) / 2, nx = (-dy / len) * off, ny = (dx / len) * off;
    let l = 0, r = 0;
    regions.forEach((reg, i) => {
      if (inRegion(reg, mx + nx, my + ny)) l |= 1 << i;
      if (inRegion(reg, mx - nx, my - ny)) r |= 1 << i;
    });
    e.sig = [l, r];
  }
  return edges;
}

interface Loop { pts: Pt[]; keys: string[]; area: number }

function link(edges: Array<{ a: Pt; b: Pt; ka: string; kb: string }>): Loop[] {
  const out = new Map<string, number[]>();
  edges.forEach((e, i) => { const l = out.get(e.ka); if (l) l.push(i); else out.set(e.ka, [i]); });
  const used = new Uint8Array(edges.length);
  const loops: Loop[] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const pts: Pt[] = [], keys: string[] = [];
    let cur = s;
    let guard = edges.length + 2;
    while (guard-- > 0) {
      used[cur] = 1;
      const e = edges[cur];
      pts.push(e.a);
      keys.push(e.ka);
      if (e.kb === edges[s].ka) break;
      const dinx = e.b[0] - e.a[0], diny = e.b[1] - e.a[1];
      let best = -1, bestAng = -Infinity;
      for (const j of out.get(e.kb) ?? []) {
        if (used[j]) continue;
        const f = edges[j];
        const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1];
        const ang = Math.atan2(cross(dinx, diny, dx, dy), dinx * dx + diny * dy);
        if (ang > bestAng) { bestAng = ang; best = j; }
      }
      if (best < 0) break;
      cur = best;
    }
    if (pts.length < 3) continue;
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    loops.push({ pts, keys, area: area / 2 });
  }
  return loops;
}

function simplifyLoop(loop: Loop): Loop {
  const pts: Pt[] = [], keys: string[] = [];
  const n = loop.pts.length;
  for (let i = 0; i < n; i++) {
    const a = loop.pts[(i + n - 1) % n], b = loop.pts[i], c = loop.pts[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const cr = cross(ux, uy, vx, vy), lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (!lu || (pathfinderOptions.redundant && lv && Math.abs(cr) <= 1e-7 * lu * lv && ux * vx + uy * vy > 0)) continue;
    pts.push(b);
    keys.push(loop.keys[i]);
  }
  return { pts, keys, area: loop.area };
}

function loopPath(loop: Loop, smooth: Set<string>): SubPath {
  const n = loop.pts.length;
  const corner = loop.pts.map((_, i) => !smooth.has(loop.keys[i]));
  let start = corner.indexOf(true);
  if (start < 0) start = 0;
  const pts = [...loop.pts.slice(start), ...loop.pts.slice(0, start)];
  const isCorner = [...corner.slice(start), ...corner.slice(0, start)];
  if (!isCorner.some(Boolean)) isCorner[0] = true;
  const nodes: Anchor[] = [];
  const at = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && !isCorner[j]) j++;
    const run = pts.slice(i, j + 1 > n ? n : j + 1);
    if (j >= n) run.push(pts[0]);
    if (!nodes.length) nodes.push(at(run[0]));
    if (run.length <= 2) nodes.push(at(run[run.length - 1]));
    else {
      const fit = fitCurve(run, fitTol()).nodes;
      nodes[nodes.length - 1].out = fit[0].out;
      for (let k = 1; k < fit.length; k++) nodes.push({ x: fit[k].x, y: fit[k].y, in: fit[k].in, out: fit[k].out, kind: fit[k].kind });
    }
    i = j;
  }
  const last = nodes[nodes.length - 1];
  if (nodes.length > 1 && Math.abs(last.x - nodes[0].x) < 1e-6 && Math.abs(last.y - nodes[0].y) < 1e-6) { nodes[0].in = last.in; nodes.pop(); }
  return { closed: true, nodes };
}

function split(loops: Loop[]): Loop[][] {
  const outer = loops.filter(l => l.area > 0).sort((a, b) => a.area - b.area);
  const groups = new Map<Loop, Loop[]>(outer.map(o => [o, [o]]));
  for (const h of loops.filter(l => l.area < 0)) {
    const a = h.pts[0], b = h.pts[1];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const off = Math.min(0.01, len / 4);
    const x = (a[0] + b[0]) / 2 + (dy / len) * off, y = (a[1] + b[1]) / 2 - (dx / len) * off;
    const host = outer.find(o => inRing(o.pts, x, y));
    if (host) groups.get(host)?.push(h);
  }
  return [...groups.values()];
}

function pieceOf(loops: Loop[], smooth: Set<string>, sig: number): Piece {
  return { subs: loops.map(l => loopPath(l, smooth)), sig };
}

export function mergeRegions(regions: Region[], op: MergeOp, smooth: Set<string>): Piece[] {
  if (regions.length < 1 || regions.length > 30) return [];
  const edges = arrange(regions);
  const all = (1 << regions.length) - 1;
  const want = (sig: number): boolean => {
    if (op === 'union' || op === 'combine') return sig !== 0;
    if (op === 'intersect') return sig === all;
    if (op === 'subtract') return (sig & 1) === 1 && (sig & ~1) === 0;
    let c = 0;
    for (let s = sig; s; s &= s - 1) c++;
    return c % 2 === 1;
  };
  const boundary = (pred: (sig: number) => boolean): Loop[] => {
    const list: Array<{ a: Pt; b: Pt; ka: string; kb: string }> = [];
    for (const e of edges) {
      const l = pred(e.sig[0]), r = pred(e.sig[1]);
      if (l === r) continue;
      list.push(l ? { a: e.a, b: e.b, ka: e.ka, kb: e.kb } : { a: e.b, b: e.a, ka: e.kb, kb: e.ka });
    }
    return link(list).map(simplifyLoop).filter(l => l.pts.length >= 3 && Math.abs(l.area) > 1e-4);
  };
  if (op !== 'fragment') {
    const loops = boundary(want);
    return loops.length ? [pieceOf(loops, smooth, all)] : [];
  }
  const sigs = new Set<number>();
  for (const e of edges) for (const s of e.sig) if (s) sigs.add(s);
  const out: Piece[] = [];
  for (const s of [...sigs].sort((a, b) => a - b)) for (const g of split(boundary(x => x === s))) out.push(pieceOf(g, smooth, s));
  return out;
}

function regionOf(subs: SubPath[], smooth: Set<string>): Region {
  const rings = flatten(applyCorners(subs), smooth);
  return { groups: rings.length ? [rings] : [] };
}

function toSubs(pieces: Piece[]): SubPath[] {
  return pieces.flatMap(p => p.subs);
}

function topmost(sig: number): number {
  return 31 - Math.clz32(sig);
}

function chainPath(pts: Pt[], smooth: Set<string>): SubPath {
  const at = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });
  const nodes: Anchor[] = [at(pts[0])];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    while (j < pts.length - 1 && smooth.has(key(pts[j]))) j++;
    const run = pts.slice(i, j + 1);
    if (run.length <= 2) nodes.push(at(run[1]));
    else {
      const fit = fitCurve(run, fitTol()).nodes;
      nodes[nodes.length - 1].out = fit[0].out;
      for (let k = 1; k < fit.length; k++) nodes.push({ x: fit[k].x, y: fit[k].y, in: fit[k].in, out: fit[k].out, kind: fit[k].kind });
    }
    i = j;
  }
  return { closed: false, nodes };
}

interface Seg { a: Pt; b: Pt; ka: string; kb: string }

function outlineSegments(regions: Region[], smooth: Set<string>): Array<{ object: number; other: number; subs: SubPath[] }> {
  const edges = arrange(regions);
  const out: Array<{ object: number; other: number; subs: SubPath[] }> = [];
  regions.forEach((_, k) => {
    const bit = 1 << k;
    const groups = new Map<number, Seg[]>();
    for (const e of edges) {
      const l = (e.sig[0] & bit) !== 0, r = (e.sig[1] & bit) !== 0;
      if (l === r) continue;
      const seg: Seg = l ? { a: e.a, b: e.b, ka: e.ka, kb: e.kb } : { a: e.b, b: e.a, ka: e.kb, kb: e.ka };
      const other = (l ? e.sig[0] : e.sig[1]) & ~bit;
      const list = groups.get(other);
      if (list) list.push(seg); else groups.set(other, [seg]);
    }
    for (const [other, list] of groups) {
      const starts = new Map<string, number[]>();
      list.forEach((s, i) => { const l = starts.get(s.ka); if (l) l.push(i); else starts.set(s.ka, [i]); });
      const ends = new Set(list.map(s => s.kb));
      const used = new Uint8Array(list.length);
      const walk = (first: number): { pts: Pt[]; closed: boolean } => {
        const pts: Pt[] = [list[first].a];
        let cur = first;
        for (let guard = list.length + 1; guard > 0; guard--) {
          used[cur] = 1;
          const s = list[cur];
          if (s.kb === list[first].ka) return { pts, closed: true };
          pts.push(s.b);
          const next = (starts.get(s.kb) ?? []).find(j => !used[j]);
          if (next === undefined) return { pts, closed: false };
          cur = next;
        }
        return { pts, closed: false };
      };
      const open = list.map((_, i) => i).filter(i => !ends.has(list[i].ka));
      for (const i of [...open, ...list.map((_, j) => j)]) {
        if (used[i]) continue;
        const run = walk(i);
        if (run.pts.length < 2) continue;
        if (run.closed) {
          if (run.pts.length < 3) continue;
          const loop = simplifyLoop({ pts: run.pts, keys: run.pts.map(key), area: 0 });
          out.push({ object: k, other, subs: [{ ...loopPath(loop, smooth), closed: true }] });
        } else out.push({ object: k, other, subs: [chainPath(run.pts, smooth)] });
      }
    }
  });
  return out;
}

export function pathfinder(op: PathfinderOp, inputs: PathfinderInput[]): PathfinderOutput[] {
  const out = compute(op, inputs);
  if (!pathfinderOptions.unpainted || (op !== 'divide' && op !== 'outline')) return out;
  const items = inputs.slice().sort((a, b) => a.index - b.index);
  return out.filter(piece => { const src = items[Math.min(piece.source, items.length - 1)]; return !(src.fill === 'none' && (src.stroke ?? 'none') === 'none'); });
}

function compute(op: PathfinderOp, inputs: PathfinderInput[]): PathfinderOutput[] {
  const items = inputs.slice().sort((a, b) => a.index - b.index);
  if (items.length < 2 || items.length > 30) return [];
  const smooth = new Set<string>();
  const regions = items.map(item => regionOf(item.subs, smooth));
  const top = items.length - 1;
  const result = (subs: SubPath[], source: number, stroke = false): PathfinderOutput => ({ subs, source, fillRule: 'nonzero', stroke });
  if (op === 'outline') return outlineSegments(regions, smooth).map(s => ({ subs: s.subs, source: s.object, fillRule: 'nonzero' as const, stroke: true, outline: true }));
  if (op === 'unite') {
    const pieces = mergeRegions(regions, 'union', smooth);
    return pieces.length ? [result(toSubs(pieces), top, true)] : [];
  }
  if (op === 'intersect') {
    const pieces = mergeRegions(regions, 'intersect', smooth);
    return pieces.length ? [result(toSubs(pieces), top, true)] : [];
  }
  if (op === 'exclude') {
    const pieces = mergeRegions(regions, 'exclude', smooth);
    return pieces.length ? [{ ...result(toSubs(pieces), top, true), fillRule: 'evenodd' as const }] : [];
  }
  if (op === 'minus-front') {
    const pieces = mergeRegions(regions, 'subtract', smooth);
    return pieces.length ? [result(toSubs(pieces), 0, true)] : [];
  }
  if (op === 'minus-back') {
    const ordered = [regions[top], ...regions.slice(0, top)];
    const pieces = mergeRegions(ordered, 'subtract', smooth);
    return pieces.length ? [result(toSubs(pieces), top, true)] : [];
  }
  if (op === 'crop') {
    const out: PathfinderOutput[] = [];
    for (let k = 0; k < top; k++) {
      const pieces = mergeRegions([regions[k], regions[top]], 'intersect', smooth);
      if (pieces.length) out.push(result(toSubs(pieces), k));
    }
    return out;
  }
  const fragments = mergeRegions(regions, 'fragment', smooth);
  if (op === 'divide') return fragments.map(piece => result(piece.subs, topmost(piece.sig), true));
  const owned = new Map<number, SubPath[]>();
  for (const piece of fragments) {
    const owner = topmost(piece.sig);
    owned.set(owner, [...(owned.get(owner) ?? []), ...piece.subs]);
  }
  if (op === 'trim') return [...owned.entries()].sort((a, b) => a[0] - b[0]).map(([owner, subs]) => result(subs, owner));
  const byFill = new Map<string, number[]>();
  for (const owner of [...owned.keys()].sort((a, b) => a - b)) byFill.set(items[owner].fill, [...(byFill.get(items[owner].fill) ?? []), owner]);
  const out: PathfinderOutput[] = [];
  for (const owners of byFill.values()) {
    if (owners.length === 1) { out.push(result(owned.get(owners[0])!, owners[0])); continue; }
    const groupRegions = owners.map(owner => regionOf(owned.get(owner)!, smooth));
    const merged = mergeRegions(groupRegions, 'union', smooth);
    out.push(result(merged.length ? toSubs(merged) : owners.flatMap(owner => owned.get(owner)!), owners[owners.length - 1]));
  }
  return out.sort((a, b) => a.source - b.source);
}

export function fragmentPieces(inputs: SubPath[][]): Piece[] {
  if (inputs.length < 1 || inputs.length > 30) return [];
  const smooth = new Set<string>();
  return mergeRegions(inputs.map(subs => regionOf(subs, smooth)), 'fragment', smooth);
}

/* Live Paint edges: each source outline cut wherever the faces on its two sides change. `object` is the source
   the edge belongs to and `other` the signature of the other sources around it, so (object, other) names the two
   faces it separates. */
export function edgePieces(inputs: SubPath[][]): Array<{ object: number; other: number; subs: SubPath[] }> {
  if (inputs.length < 1 || inputs.length > 30) return [];
  const smooth = new Set<string>();
  return outlineSegments(inputs.map(subs => regionOf(subs, smooth)), smooth);
}

export function unionSubs(inputs: SubPath[][]): SubPath[] {
  const smooth = new Set<string>();
  if (inputs.length === 1) return inputs[0];
  return toSubs(mergeRegions(inputs.map(subs => regionOf(subs, smooth)), 'union', smooth));
}

