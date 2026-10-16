import { applyCorners } from './corners';
import type { Mat } from './distort';
import { dist, segments, splitBezier, type Anchor, type Box, type Pt, type SubPath } from './geometry';

export type TfMode = 'scale' | 'shear' | 'perspective' | 'distort';
export type Quad = [Pt, Pt, Pt, Pt];

export const isCorner = (i: number): boolean => i >= 0 && i < 8 && i % 2 === 0;
export const isSide = (i: number): boolean => i >= 0 && i < 8 && i % 2 === 1;

export const boxQuad = (b: Box): Quad => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];

const snapShear = (k: number, on: boolean): number => (on ? Math.tan((Math.round((Math.atan(k) * 180) / Math.PI / 15) * 15 * Math.PI) / 180) : k);

export function shearMatrix(i: number, b: Box, lp: Pt, alt: boolean, constrain = false): Mat {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (i === 1 || i === 5) {
    const top = i === 1;
    const hy = top ? b.y : b.y + b.h;
    const ay = alt ? cy : top ? b.y + b.h : b.y;
    const k = Math.abs(hy - ay) < 1e-6 ? 0 : snapShear((lp[0] - cx) / (hy - ay), constrain);
    return [1, 0, k, 1, -k * ay, 0];
  }
  const right = i === 3;
  const hx = right ? b.x + b.w : b.x;
  const ax = alt ? cx : right ? b.x : b.x + b.w;
  const k = Math.abs(hx - ax) < 1e-6 ? 0 : snapShear((lp[1] - cy) / (hx - ax), constrain);
  return [1, k, 0, 1, 0, -k * ax];
}

export function dragQuad(mode: 'perspective' | 'distort', i: number, b: Box, lp: Pt, alt: boolean, constrain = false): Quad {
  const q = boxQuad(b).map(p => [p[0], p[1]] as Pt) as Quad;
  const c = i / 2;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (mode === 'distort') {
    if (constrain) lp = Math.abs(lp[0] - q[c][0]) >= Math.abs(lp[1] - q[c][1]) ? [lp[0], q[c][1]] : [q[c][0], lp[1]];
    q[c] = [lp[0], lp[1]];
    if (alt) q[(c + 2) % 4] = [2 * cx - lp[0], 2 * cy - lp[1]];
    return q;
  }
  const o = q[c];
  if (Math.abs(lp[0] - o[0]) >= Math.abs(lp[1] - o[1])) {
    const mate = c ^ 1;
    q[c] = [lp[0], o[1]];
    q[mate] = [2 * cx - lp[0], q[mate][1]];
  } else {
    const mate = 3 - c;
    q[c] = [o[0], lp[1]];
    q[mate] = [q[mate][0], 2 * cy - lp[1]];
  }
  return q;
}

function convex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(cross); else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

function homography(s: Quad, d: Quad): number[] | null {
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = s[i], [u, v] = d[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let c = col; c < 9; c++) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[8] / row[i]);
}

export function quadMapper(box: Box, quad: Quad): { map: (p: Pt) => Pt; projective: boolean } {
  const src = boxQuad(box);
  const h = convex(quad) ? homography(src, quad) : null;
  if (h && src.every(p => h[6] * p[0] + h[7] * p[1] + 1 > 1e-6)) {
    return { projective: true, map: p => { const w = h[6] * p[0] + h[7] * p[1] + 1; return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w]; } };
  }
  const bw = box.w || 1, bh = box.h || 1;
  return {
    projective: false,
    map: p => {
      const u = (p[0] - box.x) / bw, v = (p[1] - box.y) / bh;
      const f = (k: 0 | 1): number => (1 - u) * (1 - v) * quad[0][k] + u * (1 - v) * quad[1][k] + u * v * quad[2][k] + (1 - u) * v * quad[3][k];
      return [f(0), f(1)];
    }
  };
}

function refine(subs: SubPath[], step: number, lines: boolean): SubPath[] {
  return subs.map(sub => {
    const segs = segments([sub]);
    const nodes: Anchor[] = [];
    const inward = new Map<number, Pt>();
    sub.nodes.forEach((n, i) => {
      const handle = inward.get(i) ?? n.in;
      nodes.push({ ...n, in: handle ? [handle[0], handle[1]] : null, out: n.out ? [n.out[0], n.out[1]] : null, corner: undefined });
      const seg = segs.find(s => s.i === i);
      if (!seg || (seg.line && !lines)) return;
      const length = seg.line ? dist(seg.p0, seg.p3) : dist(seg.p0, seg.c1) + dist(seg.c1, seg.c2) + dist(seg.c2, seg.p3);
      const pieces = Math.max(1, Math.min(48, Math.ceil(length / step)));
      if (pieces === 1) return;
      if (seg.line) {
        for (let k = 1; k < pieces; k++) {
          const t = k / pieces;
          nodes.push({ x: seg.p0[0] + (seg.p3[0] - seg.p0[0]) * t, y: seg.p0[1] + (seg.p3[1] - seg.p0[1]) * t, in: null, out: null, kind: 'corner' });
        }
        return;
      }
      let rest: [Pt, Pt, Pt, Pt] = [seg.p0, seg.c1, seg.c2, seg.p3];
      for (let k = 1; k < pieces; k++) {
        const [left, right] = splitBezier(rest[0], rest[1], rest[2], rest[3], 1 / (pieces - k + 1));
        nodes[nodes.length - 1].out = left[1];
        nodes.push({ x: left[3][0], y: left[3][1], in: left[2], out: null, kind: 'smooth' });
        rest = right;
      }
      nodes[nodes.length - 1].out = rest[1];
      if (i + 1 < sub.nodes.length || sub.closed) inward.set((i + 1) % sub.nodes.length, rest[2]);
    });
    const wrap = inward.get(0);
    if (wrap && nodes[0]) nodes[0].in = [wrap[0], wrap[1]];
    return { closed: sub.closed, nodes };
  });
}

export function distortShape(subs: SubPath[], box: Box, quad: Quad): SubPath[] {
  const { map, projective } = quadMapper(box, quad);
  const work = refine(applyCorners(subs), Math.max(box.w, box.h) / 10 || 1, !projective);
  for (const sub of work) {
    for (const a of sub.nodes) {
      const moved = map([a.x, a.y]);
      if (a.in) a.in = map(a.in);
      if (a.out) a.out = map(a.out);
      a.x = moved[0];
      a.y = moved[1];
    }
  }
  return work;
}
