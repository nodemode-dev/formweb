import { clonePath, dist, pathBounds, segments, splitBezier, type Anchor, type Box, type Pt, type SubPath } from './geometry';

export type WarpPreset = 'arc' | 'bulge' | 'flag' | 'wave';
export type DistortKind = 'pucker-bloat' | 'roughen' | 'zigzag' | 'twist';
export type Mat = [number, number, number, number, number, number];

export interface WarpOptions { preset: WarpPreset; bend: number; horizontal: number; vertical: number }
export interface DistortOptions { kind: DistortKind; amount: number; size: number; detail: number; smooth: boolean; seed: number }

const interpolated = new WeakSet<Anchor>();

function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plain = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });

export function subdivide(subs: SubPath[], step: number): SubPath[] {
  return subs.map(sub => {
    const segs = segments([sub]);
    const nodes: Anchor[] = [];
    sub.nodes.forEach((n, i) => {
      const own: Anchor = { ...n, in: n.in ? [...n.in] : null, out: n.out ? [...n.out] : null, corner: n.corner ? { ...n.corner } : undefined };
      nodes.push(own);
      const seg = segs.find(s => s.i === i);
      if (!seg) return;
      const chord = dist(seg.p0, seg.c1) + dist(seg.c1, seg.c2) + dist(seg.c2, seg.p3);
      const pieces = Math.max(1, Math.min(80, Math.ceil((seg.line ? dist(seg.p0, seg.p3) : chord) / step)));
      if (pieces === 1) return;
      if (seg.line) {
        for (let k = 1; k < pieces; k++) {
          const t = k / pieces;
          const a = plain([seg.p0[0] + (seg.p3[0] - seg.p0[0]) * t, seg.p0[1] + (seg.p3[1] - seg.p0[1]) * t]);
          interpolated.add(a);
          nodes.push(a);
        }
        return;
      }
      let rest: [Pt, Pt, Pt, Pt] = [seg.p0, seg.c1, seg.c2, seg.p3];
      for (let k = 1; k < pieces; k++) {
        const [left, right] = splitBezier(rest[0], rest[1], rest[2], rest[3], 1 / (pieces - k + 1));
        nodes[nodes.length - 1].out = left[1];
        const a: Anchor = { x: left[3][0], y: left[3][1], in: left[2], out: null, kind: 'smooth' };
        interpolated.add(a);
        nodes.push(a);
        rest = right;
      }
      nodes[nodes.length - 1].out = rest[1];
    });
    return { closed: sub.closed, nodes };
  });
}

function catmull(sub: SubPath, only: (a: Anchor) => boolean): void {
  const n = sub.nodes.length;
  sub.nodes.forEach((a, i) => {
    if (!only(a)) return;
    const prev = sub.nodes[(i - 1 + n) % n], next = sub.nodes[(i + 1) % n];
    if (!sub.closed && (i === 0 || i === n - 1)) return;
    const dx = (next.x - prev.x) / 6, dy = (next.y - prev.y) / 6;
    a.in = [a.x - dx, a.y - dy];
    a.out = [a.x + dx, a.y + dy];
    a.kind = 'smooth';
  });
}

function mapAll(subs: SubPath[], f: (p: Pt) => Pt, smooth = true): SubPath[] {
  for (const sub of subs) {
    for (const a of sub.nodes) {
      const moved = f([a.x, a.y]);
      a.x = moved[0]; a.y = moved[1];
      if (a.in) a.in = f(a.in);
      if (a.out) a.out = f(a.out);
    }
    if (smooth) catmull(sub, a => interpolated.has(a) && !a.in && !a.out);
  }
  return subs;
}

export function warpSubs(subs: SubPath[], options: WarpOptions, box: Box): SubPath[] {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, hw = Math.max(1e-6, box.w / 2), hh = Math.max(1e-6, box.h / 2);
  const b = options.bend, hd = options.horizontal, vd = options.vertical;
  const f = (p: Pt): Pt => {
    const u = (p[0] - cx) / hw, v = (p[1] - cy) / hh;
    let x = p[0], y = p[1];
    if (options.preset === 'arc') y += -b * hh * (1 - u * u) * 0.9;
    else if (options.preset === 'bulge') { x = cx + (p[0] - cx) * (1 + b * (1 - v * v) * 0.6); y = cy + (p[1] - cy) * (1 + b * (1 - u * u) * 0.6); }
    else if (options.preset === 'flag') y += b * hh * 0.5 * Math.sin(Math.PI * u) * (1 - 0.3 * v);
    else y += b * hh * 0.5 * Math.sin(2 * Math.PI * u);
    x += hd * hw * v * 0.5;
    y += vd * hh * u * 0.5;
    return [x, y];
  };
  return mapAll(subdivide(clonePath(subs), Math.max(box.w, box.h) / 24), f);
}

export function distortSubs(subs: SubPath[], options: DistortOptions): SubPath[] {
  const box = pathBounds(subs);
  if (!box) return subs;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const diag = Math.hypot(box.w, box.h) || 1;
  if (options.kind === 'pucker-bloat') {
    const work = subdivide(clonePath(subs), diag / 10);
    let R = 0;
    for (const sub of work) for (const a of sub.nodes) R = Math.max(R, Math.hypot(a.x - cx, a.y - cy));
    R = R || 1;
    return mapAll(work, p => {
      const r = Math.hypot(p[0] - cx, p[1] - cy);
      const k = 1 - options.amount * (1 - Math.min(1, r / R));
      return [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
    });
  }
  if (options.kind === 'twist') {
    const work = subdivide(clonePath(subs), diag / 28);
    let R = 0;
    for (const sub of work) for (const a of sub.nodes) R = Math.max(R, Math.hypot(a.x - cx, a.y - cy));
    R = R || 1;
    const angle = (options.amount * Math.PI) / 180;
    return mapAll(work, p => {
      const r = Math.hypot(p[0] - cx, p[1] - cy), a = angle * (1 - Math.min(1, r / R)), c = Math.cos(a), s = Math.sin(a);
      return [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c];
    });
  }
  const rnd = mulberry(options.seed);
  const out: SubPath[] = [];
  for (const sub of subs) {
    const segs = segments([sub]);
    const nodes: Anchor[] = [];
    const push = (p: Pt): void => { const a = plain(p); interpolated.add(a); nodes.push(a); };
    const normalAt = (s: (typeof segs)[number], t: number): Pt => {
      const e = 0.01;
      const at = (k: number): Pt => {
        const u = 1 - k;
        return [u * u * u * s.p0[0] + 3 * u * u * k * s.c1[0] + 3 * u * k * k * s.c2[0] + k * k * k * s.p3[0], u * u * u * s.p0[1] + 3 * u * u * k * s.c1[1] + 3 * u * k * k * s.c2[1] + k * k * k * s.p3[1]];
      };
      const a = s.line ? s.p0 : at(Math.max(0, t - e)), b = s.line ? s.p3 : at(Math.min(1, t + e));
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    };
    const sample = (s: (typeof segs)[number], t: number): Pt => {
      const u = 1 - t;
      if (s.line) return [s.p0[0] + (s.p3[0] - s.p0[0]) * t, s.p0[1] + (s.p3[1] - s.p0[1]) * t];
      return [u * u * u * s.p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p3[0], u * u * u * s.p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p3[1]];
    };
    sub.nodes.forEach((n, i) => {
      const first = plain([n.x, n.y]);
      if (options.kind === 'roughen') {
        const a = rnd() * Math.PI * 2, m = (rnd() * 2 - 1) * options.size;
        first.x += Math.cos(a) * m; first.y += Math.sin(a) * m;
      }
      nodes.push(first);
      const seg = segs.find(s => s.i === i);
      if (!seg) return;
      if (options.kind === 'zigzag') {
        const ridges = Math.max(1, Math.round(options.detail));
        for (let k = 0; k < ridges; k++) {
          const t = (k + 0.5) / ridges, p = sample(seg, t), nrm = normalAt(seg, t), sign = k % 2 === 0 ? 1 : -1;
          push([p[0] + nrm[0] * options.size * sign, p[1] + nrm[1] * options.size * sign]);
        }
        return;
      }
      const length = dist(seg.p0, seg.p3) + (seg.line ? 0 : dist(seg.p0, seg.c1) + dist(seg.c2, seg.p3));
      const points = Math.max(1, Math.round(options.detail * Math.max(1, length / (diag / 4))));
      for (let k = 1; k <= points; k++) {
        const t = k / (points + 1), p = sample(seg, t), nrm = normalAt(seg, t), m = (rnd() * 2 - 1) * options.size;
        push([p[0] + nrm[0] * m, p[1] + nrm[1] * m]);
      }
    });
    const result: SubPath = { closed: sub.closed, nodes };
    if (options.smooth) catmull(result, () => true);
    out.push(result);
  }
  return out;
}

function splitLongest(sub: SubPath): void {
  const segs = segments([sub]);
  let best = segs[0];
  for (const s of segs) if (dist(s.p0, s.p3) > dist(best.p0, best.p3)) best = s;
  if (!best) return;
  const i = best.i;
  const nodes = sub.nodes;
  if (best.line) {
    nodes.splice(i + 1, 0, plain([(best.p0[0] + best.p3[0]) / 2, (best.p0[1] + best.p3[1]) / 2]));
    return;
  }
  const [left, right] = splitBezier(best.p0, best.c1, best.c2, best.p3, 0.5);
  nodes[i].out = left[1];
  const mid: Anchor = { x: left[3][0], y: left[3][1], in: left[2], out: right[1], kind: 'smooth' };
  nodes.splice(i + 1, 0, mid);
  const next = nodes[(i + 2) % nodes.length];
  next.in = right[2];
}

function area(sub: SubPath): number {
  let s = 0;
  sub.nodes.forEach((a, i) => { const b = sub.nodes[(i + 1) % sub.nodes.length]; s += a.x * b.y - b.x * a.y; });
  return s / 2;
}

export function matchSubs(a: SubPath, b: SubPath): [SubPath, SubPath] {
  const A = clonePath([a])[0], B = clonePath([b])[0];
  let guard = 0;
  while (A.nodes.length < B.nodes.length && guard++ < 400) splitLongest(A);
  while (B.nodes.length < A.nodes.length && guard++ < 800) splitLongest(B);
  if (A.closed && B.closed && A.nodes.length === B.nodes.length) {
    if (area(A) * area(B) < 0) { B.nodes.reverse(); for (const n of B.nodes) { const t = n.in; n.in = n.out; n.out = t; } }
    const n = B.nodes.length;
    let best = 0, score = Infinity;
    for (let shift = 0; shift < n; shift++) {
      let total = 0;
      for (let i = 0; i < n; i++) { const p = B.nodes[(i + shift) % n]; total += (p.x - A.nodes[i].x) ** 2 + (p.y - A.nodes[i].y) ** 2; }
      if (total < score) { score = total; best = shift; }
    }
    B.nodes = [...B.nodes.slice(best), ...B.nodes.slice(0, best)];
  }
  return [A, B];
}

export function blendSub(a: SubPath, b: SubPath, t: number): SubPath {
  const mixPt = (p: Pt | null, q: Pt | null, own: Pt): Pt | null => (p && q ? [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] : p || q ? [own[0], own[1]] : null);
  return {
    closed: a.closed,
    nodes: a.nodes.map((n, i) => {
      const m = b.nodes[i];
      const x = n.x + (m.x - n.x) * t, y = n.y + (m.y - n.y) * t;
      const out = n.out && m.out ? mixPt(n.out, m.out, [x, y]) : null;
      const inn = n.in && m.in ? mixPt(n.in, m.in, [x, y]) : null;
      const corner = n.corner || m.corner ? { type: (n.corner ?? m.corner)!.type, mode: (n.corner ?? m.corner)!.mode, radius: (n.corner?.radius ?? 0) + ((m.corner?.radius ?? 0) - (n.corner?.radius ?? 0)) * t } : undefined;
      return { x, y, in: inn, out, kind: n.kind === 'corner' || m.kind === 'corner' ? 'corner' : n.kind, corner };
    })
  };
}

export const rotation = (degrees: number, cx: number, cy: number): Mat => {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
};
export const scaling = (sx: number, sy: number, cx: number, cy: number): Mat => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
export const translation = (dx: number, dy: number): Mat => [1, 0, 0, 1, dx, dy];
export const reflection = (axisDegrees: number, cx: number, cy: number): Mat => {
  const a = (axisDegrees * Math.PI) / 180, c = Math.cos(2 * a), s = Math.sin(2 * a);
  return [c, s, s, -c, cx - c * cx - s * cy, cy - s * cx + c * cy];
};
export const shearing = (degrees: number, axisDegrees: number, cx: number, cy: number): Mat => {
  const k = Math.tan((degrees * Math.PI) / 180);
  const toAxis = rotation(-axisDegrees, cx, cy), back = rotation(axisDegrees, cx, cy);
  const shear: Mat = [1, 0, k, 1, -k * cy, 0];
  return compose(back, compose(shear, toAxis));
};

export function compose(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

export function repeatMatrices(kind: 'radial' | 'grid' | 'mirror', box: Box, p: { count: number; radius: number; cols: number; rows: number; gapX: number; gapY: number; angle: number; brick: 'none' | 'row' | 'column'; offset: number }): Mat[] {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const a = (p.angle * Math.PI) / 180;
  if (kind === 'radial') {
    const px = cx + Math.cos(a) * p.radius, py = cy + Math.sin(a) * p.radius;
    return Array.from({ length: Math.max(0, Math.round(p.count) - 1) }, (_, i) => rotation((360 / Math.round(p.count)) * (i + 1), px, py));
  }
  if (kind === 'grid') {
    const out: Mat[] = [];
    for (let r = 0; r < Math.max(1, Math.round(p.rows)); r++) for (let c = 0; c < Math.max(1, Math.round(p.cols)); c++) {
      if (!r && !c) continue;
      const dx = c * (box.w + p.gapX) + (p.brick === 'row' && r % 2 ? (box.w + p.gapX) / 2 : 0);
      const dy = r * (box.h + p.gapY) + (p.brick === 'column' && c % 2 ? (box.h + p.gapY) / 2 : 0);
      out.push(translation(dx, dy));
    }
    return out;
  }
  const nx = Math.sin(a), ny = Math.cos(a);
  const reach = Math.abs(nx) * box.w / 2 + Math.abs(ny) * box.h / 2 + p.offset;
  return [reflection(p.angle, cx + nx * reach, cy + ny * reach)];
}
