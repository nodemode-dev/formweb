import { EPS, bezierAt, inferKind, polyPath, type Anchor, type Pt, type SubPath } from './geometry';

type Bez = [Pt, Pt, Pt, Pt];
const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add2 = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot2 = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const norm2 = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; };

function bezPt(b: Bez, t: number): Pt { return bezierAt({ p0: b[0], c1: b[1], c2: b[2], p3: b[3] }, t); }
function bezD1(b: Bez, t: number): Pt {
  const u = 1 - t;
  return add2(add2(mul2(sub2(b[1], b[0]), 3 * u * u), mul2(sub2(b[2], b[1]), 6 * u * t)), mul2(sub2(b[3], b[2]), 3 * t * t));
}
function bezD2(b: Bez, t: number): Pt {
  return add2(mul2(add2(sub2(b[2], mul2(b[1], 2)), b[0]), 6 * (1 - t)), mul2(add2(sub2(b[3], mul2(b[2], 2)), b[1]), 6 * t));
}

function chordParams(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = u[u.length - 1] || 1;
  return u.map(v => v / total);
}

function generate(pts: Pt[], u: number[], t1: Pt, t2: Pt): Bez {
  const first = pts[0], last = pts[pts.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i], s = 1 - t;
    const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
    const a1 = mul2(t1, b1), a2 = mul2(t2, b2);
    c00 += dot2(a1, a1);
    c01 += dot2(a1, a2);
    c11 += dot2(a2, a2);
    const tmp = sub2(pts[i], add2(mul2(first, b0 + b1), mul2(last, b2 + b3)));
    x0 += dot2(a1, tmp);
    x1 += dot2(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let al = det ? (x0 * c11 - x1 * c01) / det : 0;
  let ar = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (al < EPS * seg || ar < EPS * seg) { al = seg / 3; ar = seg / 3; }
  return [first, add2(first, mul2(t1, al)), add2(last, mul2(t2, ar)), last];
}

function maxError(pts: Pt[], b: Bez, u: number[]): [number, number] {
  let max = 0, at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const q = bezPt(b, u[i]);
    const d = (q[0] - pts[i][0]) ** 2 + (q[1] - pts[i][1]) ** 2;
    if (d >= max) { max = d; at = i; }
  }
  return [max, at];
}

function reparam(b: Bez, pts: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub2(bezPt(b, t), pts[i]);
    const d1 = bezD1(b, t), d2 = bezD2(b, t);
    const num = dot2(d, d1), den = dot2(d1, d1) + dot2(d, d2);
    if (Math.abs(den) < EPS) return t;
    return Math.max(0, Math.min(1, t - num / den));
  });
}

function fitPart(pts: Pt[], t1: Pt, t2: Pt, err: number, depth: number): Bez[] {
  if (pts.length === 2 || depth > 24) {
    const d = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) / 3;
    return [[pts[0], add2(pts[0], mul2(t1, d)), add2(pts[pts.length - 1], mul2(t2, d)), pts[pts.length - 1]]];
  }
  let u = chordParams(pts);
  let b = generate(pts, u, t1, t2);
  let [e, split] = maxError(pts, b, u);
  if (e < err * err) return [b];
  if (e < 16 * err * err) {
    for (let k = 0; k < 16; k++) {
      u = reparam(b, pts, u);
      b = generate(pts, u, t1, t2);
      [e, split] = maxError(pts, b, u);
      if (e < err * err) return [b];
    }
  }
  split = Math.max(1, Math.min(pts.length - 2, split));
  let tc = norm2(sub2(pts[split - 1], pts[split + 1]));
  if (!tc[0] && !tc[1]) tc = norm2(sub2(pts[split - 1], pts[split]));
  return [...fitPart(pts.slice(0, split + 1), t1, tc, err, depth + 1), ...fitPart(pts.slice(split), mul2(tc, -1), t2, err, depth + 1)];
}

export function fitCurve(raw: Pt[], err: number, ends?: [Pt, Pt]): SubPath {
  const pts: Pt[] = [];
  for (const p of raw) {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > EPS) pts.push(p);
  }
  if (pts.length < 2) return polyPath(pts, false);
  if (pts.length === 2) return polyPath(pts, false);
  const t1 = ends ? norm2(ends[0]) : norm2(sub2(pts[1], pts[0])), t2 = ends ? norm2(ends[1]) : norm2(sub2(pts[pts.length - 2], pts[pts.length - 1]));
  const bez = fitPart(pts, t1, t2, err, 0);
  const nodes: Anchor[] = [{ x: bez[0][0][0], y: bez[0][0][1], in: null, out: bez[0][1], kind: 'corner' }];
  bez.forEach((b, i) => {
    const next = bez[i + 1];
    nodes.push({ x: b[3][0], y: b[3][1], in: b[2], out: next ? next[1] : null, kind: 'corner' });
  });
  for (const n of nodes) n.kind = inferKind(n);
  return { closed: false, nodes };
}

export function simplifyPolyline(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    const a = points[lo], b = points[hi];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len = Math.hypot(vx, vy);
    let worst = 0, at = -1;
    for (let i = lo + 1; i < hi; i++) {
      const p = points[i];
      const d = len < EPS ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((p[0] - a[0]) * vy - (p[1] - a[1]) * vx) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (at >= 0 && worst > tolerance) { keep[at] = 1; stack.push([lo, at], [at, hi]); }
  }
  return points.filter((_, i) => keep[i]);
}
