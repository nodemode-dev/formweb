import { fragmentPieces, unionSubs, type Piece } from './boolean';
import { flattenSub } from './edit';
import { pathBounds, type Anchor, type Pt, type SubPath } from './geometry';

const corner = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });

export function polygon(points: Pt[]): SubPath {
  return { closed: true, nodes: points.map(corner) };
}

export function stadium(a: Pt, b: Pt, r: number): SubPath {
  const base = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) { const t = base - Math.PI / 2 + (Math.PI * i) / 12; pts.push([b[0] + Math.cos(t) * r, b[1] + Math.sin(t) * r]); }
  for (let i = 0; i <= 12; i++) { const t = base + Math.PI / 2 + (Math.PI * i) / 12; pts.push([a[0] + Math.cos(t) * r, a[1] + Math.sin(t) * r]); }
  return polygon(pts);
}

function reduce(line: Pt[], max: number): Pt[] {
  if (line.length <= max) return line;
  const step = (line.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => line[Math.round(i * step)]);
}

export function cutterRegion(line: Pt[], reach: number): SubPath | null {
  const pts = reduce(line, 40);
  if (pts.length < 2) return null;
  const first = pts[0], second = pts.find(p => Math.hypot(p[0] - first[0], p[1] - first[1]) > 1e-6) ?? pts[1];
  const last = pts[pts.length - 1], before = [...pts].reverse().find(p => Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) ?? pts[pts.length - 2];
  const unit = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const d0 = unit(second, first), d1 = unit(before, last);
  const start: Pt = [first[0] + d0[0] * reach, first[1] + d0[1] * reach];
  const end: Pt = [last[0] + d1[0] * reach, last[1] + d1[1] * reach];
  const chord = unit(start, end);
  const side: Pt = [chord[1], -chord[0]];
  const far = reach * 2;
  return polygon([start, ...pts, end, [end[0] + side[0] * far, end[1] + side[1] * far], [start[0] + side[0] * far, start[1] + side[1] * far]]);
}

function reachOf(subs: SubPath[], line: Pt[]): number {
  const box = pathBounds(subs);
  const xs = line.map(p => p[0]), ys = line.map(p => p[1]);
  const w = Math.max(box ? box.x + box.w : 0, ...xs) - Math.min(box ? box.x : 0, ...xs);
  const h = Math.max(box ? box.y + box.h : 0, ...ys) - Math.min(box ? box.y : 0, ...ys);
  return Math.hypot(w, h) * 2 + 100;
}

export function knifeCut(subs: SubPath[], line: Pt[]): SubPath[][] {
  const cutter = cutterRegion(line, reachOf(subs, line));
  if (!cutter) return [];
  return fragmentPieces([subs, [cutter]]).filter(piece => (piece.sig & 1) === 1).map(piece => piece.subs);
}

export function eraseFilled(subs: SubPath[], line: Pt[], radius: number): SubPath[][] | null {
  const pts = reduce(line, 12);
  const stamps = pts.length === 1 ? [stadium(pts[0], pts[0], radius)] : pts.slice(1).map((p, i) => stadium(pts[i], p, radius));
  const pieces = fragmentPieces([subs, ...stamps.map(s => [s])]);
  if (!pieces.some(piece => (piece.sig & 1) === 1 && piece.sig > 1)) return null;
  return pieces.filter(piece => piece.sig === 1).map(piece => piece.subs);
}

export function eraseOpen(sub: SubPath, line: Pt[], radius: number): SubPath[] {
  const pts = flattenSub(sub, 0.3);
  const hit = (p: Pt): boolean => {
    if (line.length === 1) return Math.hypot(p[0] - line[0][0], p[1] - line[0][1]) <= radius;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      if (Math.hypot(p[0] - (a[0] + dx * k), p[1] - (a[1] + dy * k)) <= radius) return true;
    }
    return false;
  };
  const dense: Pt[] = [];
  const list = sub.closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i < list.length; i++) {
    dense.push(list[i]);
    const next = list[i + 1];
    if (!next) break;
    const n = Math.min(40, Math.ceil(Math.hypot(next[0] - list[i][0], next[1] - list[i][1]) / Math.max(0.5, radius / 3)));
    for (let k = 1; k < n; k++) dense.push([list[i][0] + ((next[0] - list[i][0]) * k) / n, list[i][1] + ((next[1] - list[i][1]) * k) / n]);
  }
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (const p of dense) {
    if (hit(p)) { if (run.length > 1) runs.push(run); run = []; } else run.push(p);
  }
  if (run.length > 1) runs.push(run);
  return runs.map(r => ({ closed: false, nodes: r.map(corner) }));
}

export function insideSubs(subs: SubPath[], p: Pt): boolean {
  let inside = false;
  for (const sub of subs) {
    const pts = flattenSub(sub, 0.4);
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > p[1]) !== (pts[j][1] > p[1]) && p[0] < ((pts[j][0] - pts[i][0]) * (p[1] - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
    }
  }
  return inside;
}

export function regionPieces(shapes: SubPath[][]): Piece[] {
  return fragmentPieces(shapes).filter(piece => piece.sig !== 0);
}

export function hitPiece(pieces: Piece[], p: Pt): number {
  for (let i = pieces.length - 1; i >= 0; i--) if (insideSubs(pieces[i].subs, p)) return i;
  return -1;
}

export function mergePieces(pieces: Piece[], picks: Set<number>): SubPath[] {
  return unionSubs([...picks].map(i => pieces[i].subs));
}
