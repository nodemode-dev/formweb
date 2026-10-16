import { EPS, dist, lerp, splitBezier, type Anchor, type Corner, type CornerMode, type CornerType, type Pt, type SubPath, formatPath } from './geometry';

interface CSeg { p0: Pt; c1: Pt; c2: Pt; p3: Pt; line: boolean; len: number; cum: number[] }

export interface CornerBasics {
  index: number;
  P: Pt;
  bisector: Pt;
  theta: number;
  minLength: number;
  max: number;
}

export interface CornerFit extends CornerBasics {
  A: Pt;
  B: Pt;
  d: number;
  wanted: number;
  clamped: boolean;
  corner: Corner;
}

export interface CornerSolution { fits: (CornerFit | null)[]; baked: SubPath }

const SAMPLES = 32;
const MIN_THETA = 0.02;

function unit(a: Pt, b: Pt): Pt | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return l < EPS ? null : [dx / l, dy / l];
}

function makeSeg(a: Anchor, b: Anchor): CSeg {
  const p0: Pt = [a.x, a.y], p3: Pt = [b.x, b.y];
  const line = !a.out && !b.in;
  const seg: CSeg = { p0, c1: a.out ?? p0, c2: b.in ?? p3, p3, line, len: 0, cum: [0] };
  if (line) { seg.len = dist(p0, p3); return seg; }
  let prev = p0;
  let total = 0;
  for (let k = 1; k <= SAMPLES; k++) {
    const t = k / SAMPLES, u = 1 - t;
    const q: Pt = [u * u * u * p0[0] + 3 * u * u * t * seg.c1[0] + 3 * u * t * t * seg.c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * seg.c1[1] + 3 * u * t * t * seg.c2[1] + t * t * t * p3[1]];
    total += dist(prev, q);
    seg.cum.push(total);
    prev = q;
  }
  seg.len = total;
  return seg;
}

function paramAt(s: CSeg, length: number): number {
  if (s.len < EPS) return 0;
  const target = Math.max(0, Math.min(s.len, length));
  if (s.line) return target / s.len;
  let k = 1;
  while (k < s.cum.length - 1 && s.cum[k] < target) k++;
  const lo = s.cum[k - 1], hi = s.cum[k];
  const f = hi - lo < EPS ? 0 : (target - lo) / (hi - lo);
  return (k - 1 + f) / SAMPLES;
}

function startTangent(s: CSeg): Pt | null {
  return unit(s.p0, s.c1) ?? unit(s.p0, s.c2) ?? unit(s.p0, s.p3);
}
function endTangentBack(s: CSeg): Pt | null {
  return unit(s.p3, s.c2) ?? unit(s.p3, s.c1) ?? unit(s.p3, s.p0);
}

function piece(s: CSeg, from: number, to: number): [Pt, Pt, Pt, Pt] {
  if (s.line) return [lerp(s.p0, s.p3, from), lerp(s.p0, s.p3, from), lerp(s.p0, s.p3, to), lerp(s.p0, s.p3, to)];
  let b: [Pt, Pt, Pt, Pt] = [s.p0, s.c1, s.c2, s.p3];
  if (to < 1) b = splitBezier(b[0], b[1], b[2], b[3], to)[0];
  if (from > 0) b = splitBezier(b[0], b[1], b[2], b[3], to > 0 ? from / to : 0)[1];
  return b;
}

export function effectiveRadius(corner: { radius: number; mode: CornerMode }, theta: number): number {
  const r = Math.max(0, corner.radius);
  return corner.mode === 'relative' ? r * Math.tan(theta / 2) : r;
}

export function distanceFromCorner(corner: { type: CornerType; radius: number; mode: CornerMode }, theta: number): number {
  const r = effectiveRadius(corner, theta);
  if (corner.type === 'chamfer') return r;
  return r / Math.tan(theta / 2);
}

export function radiusFromDistance(type: CornerType, mode: CornerMode, theta: number, d: number): number {
  const r = type === 'chamfer' ? Math.max(0, d) : Math.max(0, d * Math.tan(theta / 2));
  return mode === 'relative' ? r / Math.tan(theta / 2) : r;
}

export function widgetDistance(theta: number, d: number): number {
  return d / Math.cos(theta / 2);
}

export function distanceFromWidget(theta: number, s: number): number {
  return s * Math.cos(theta / 2);
}

function segList(sub: SubPath): CSeg[] {
  const n = sub.nodes.length;
  const count = sub.closed ? n : n - 1;
  const out: CSeg[] = [];
  for (let k = 0; k < count; k++) out.push(makeSeg(sub.nodes[k], sub.nodes[(k + 1) % n]));
  return out;
}

function basicsAt(sub: SubPath, segs: CSeg[], i: number): Omit<CornerBasics, 'max'> | null {
  const n = sub.nodes.length;
  if (n < 3 || (sub.closed && n < 3)) return null;
  if (!sub.closed && (i === 0 || i === n - 1)) return null;
  const prev = segs[(i - 1 + segs.length) % segs.length], next = segs[i];
  if (!prev || !next) return null;
  const P: Pt = [sub.nodes[i].x, sub.nodes[i].y];
  const u1 = endTangentBack(prev), u2 = startTangent(next);
  if (!u1 || !u2) return null;
  const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (theta < MIN_THETA || theta > Math.PI - MIN_THETA) return null;
  const bx = u1[0] + u2[0], by = u1[1] + u2[1];
  const bl = Math.hypot(bx, by) || 1;
  return { index: i, P, bisector: [bx / bl, by / bl], theta, minLength: Math.min(prev.len, next.len) };
}

function finalDistances(sub: SubPath, segs: CSeg[], wanted: number[]): number[] {
  const n = sub.nodes.length;
  const factor = new Array<number>(segs.length).fill(1);
  segs.forEach((s, k) => {
    const demand = wanted[k] + wanted[(k + 1) % n];
    if (demand > EPS) factor[k] = s.len < EPS ? 0 : Math.min(1, s.len / demand);
  });
  return wanted.map((w, i) => {
    if (w <= 0) return 0;
    const prev = sub.closed ? factor[(i - 1 + segs.length) % segs.length] : i > 0 ? factor[i - 1] : 1;
    const next = i < segs.length ? factor[i] : 1;
    return w * Math.min(prev, next);
  });
}

function maxFor(sub: SubPath, segs: CSeg[], wanted: number[], i: number): number {
  const n = sub.nodes.length;
  const zeroed = wanted.slice();
  zeroed[i] = 0;
  const others = finalDistances(sub, segs, zeroed);
  const prevIndex = (i - 1 + segs.length) % segs.length;
  const prevOther = others[(i - 1 + n) % n];
  const nextOther = others[(i + 1) % n];
  const a = segs[prevIndex].len - prevOther;
  const b = segs[i].len - nextOther;
  return Math.max(0, Math.min(a, b));
}

export function cornerBasics(sub: SubPath, i: number): CornerBasics | null {
  const segs = segList(sub);
  const basic = basicsAt(sub, segs, i);
  if (!basic) return null;
  const wanted = sub.nodes.map((node, k) => {
    const b = k === i ? basic : basicsAt(sub, segs, k);
    return b && node.corner && node.corner.radius > 0 ? distanceFromCorner(node.corner, b.theta) : 0;
  });
  return { ...basic, max: maxFor(sub, segs, wanted, i) };
}

function reflect(p: Pt, a: Pt, b: Pt): Pt {
  const u = unit(a, b);
  if (!u) return p;
  const vx = p[0] - a[0], vy = p[1] - a[1];
  const k = vx * u[0] + vy * u[1];
  return [a[0] + 2 * k * u[0] - vx, a[1] + 2 * k * u[1] - vy];
}

function handleOf(c: Pt, end: Pt): Pt | null {
  return dist(c, end) < EPS ? null : c;
}

export function solveCorners(sub: SubPath): CornerSolution {
  const n = sub.nodes.length;
  const empty: CornerSolution = { fits: new Array<CornerFit | null>(n).fill(null), baked: sub };
  if (n < 3 || !sub.nodes.some(node => node.corner && node.corner.radius > 0)) return empty;
  const segs = segList(sub);
  const basics = sub.nodes.map((_, i) => basicsAt(sub, segs, i));
  const wanted = sub.nodes.map((node, i) => {
    const b = basics[i];
    return b && node.corner && node.corner.radius > 0 ? distanceFromCorner(node.corner, b.theta) : 0;
  });
  const finals = finalDistances(sub, segs, wanted);
  const trimStart = segs.map((_, k) => finals[k]);
  const trimEnd = segs.map((_, k) => finals[(k + 1) % n]);
  const pieces = segs.map((s, k) => {
    const t0 = trimStart[k] > EPS ? paramAt(s, trimStart[k]) : 0;
    const t1 = trimEnd[k] > EPS ? paramAt(s, s.len - trimEnd[k]) : 1;
    return piece(s, t0, Math.max(t0, t1));
  });
  const nodes: Anchor[] = [];
  const fits: (CornerFit | null)[] = new Array<CornerFit | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const node = sub.nodes[i];
    const prevPiece = sub.closed ? pieces[(i - 1 + segs.length) % segs.length] : i > 0 ? pieces[i - 1] : null;
    const nextPiece = i < segs.length ? pieces[i] : null;
    const b = basics[i];
    if (b && node.corner && finals[i] > EPS && prevPiece && nextPiece) {
      const A = prevPiece[3], B = nextPiece[0];
      const prevSeg = segs[(i - 1 + segs.length) % segs.length], nextSeg = segs[i];
      const back = endTangentBack(prevSeg);
      const a = unit(prevPiece[2], A) ?? unit(prevPiece[1], A) ?? unit(prevPiece[0], A) ?? (back ? [-back[0], -back[1]] as Pt : null);
      const bd = unit(B, nextPiece[1]) ?? unit(B, nextPiece[2]) ?? unit(B, nextPiece[3]) ?? startTangent(nextSeg);
      let c1: Pt | null = null, c2: Pt | null = null;
      if (node.corner.type !== 'chamfer' && a && bd) {
        const phi = Math.acos(Math.max(-1, Math.min(1, a[0] * bd[0] + a[1] * bd[1])));
        if (phi > 1e-3) {
          const chord = dist(A, B);
          const radius = chord / (2 * Math.sin(phi / 2));
          const h = (4 / 3) * Math.tan(phi / 4) * radius;
          c1 = [A[0] + a[0] * h, A[1] + a[1] * h];
          c2 = [B[0] - bd[0] * h, B[1] - bd[1] * h];
          if (node.corner.type === 'inverted') { c1 = reflect(c1, A, B); c2 = reflect(c2, A, B); }
        }
      }
      nodes.push({ x: A[0], y: A[1], in: handleOf(prevPiece[2], A), out: c1, kind: 'corner' });
      nodes.push({ x: B[0], y: B[1], in: c2, out: handleOf(nextPiece[1], B), kind: 'corner' });
      fits[i] = { ...b, max: maxFor(sub, segs, wanted, i), A, B, d: finals[i], wanted: wanted[i], clamped: finals[i] < wanted[i] - 1e-6, corner: node.corner };
    } else {
      nodes.push({
        x: node.x, y: node.y,
        in: prevPiece ? handleOf(prevPiece[2], [node.x, node.y]) : node.in,
        out: nextPiece ? handleOf(nextPiece[1], [node.x, node.y]) : node.out,
        kind: node.kind
      });
    }
  }
  return { fits, baked: { nodes, closed: sub.closed } };
}

export function applyCorners(subs: SubPath[]): SubPath[] {
  return subs.map(sub => solveCorners(sub).baked);
}

export function renderPath(subs: SubPath[]): string {
  return formatPath(applyCorners(subs));
}

export function hasCorners(subs: SubPath[]): boolean {
  return subs.some(sub => sub.nodes.some(node => node.corner && node.corner.radius > 0));
}
