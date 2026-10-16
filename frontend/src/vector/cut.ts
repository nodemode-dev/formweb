import { fragmentPieces, unionSubs, type Piece } from './boolean';
import { flattenSub } from './edit';
import { fitCurve } from './fit';
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

function reverseSub(sub: SubPath): SubPath {
  return { closed: sub.closed, nodes: [...sub.nodes].reverse().map(n => ({ ...n, in: n.out, out: n.in })) };
}

export function gapInputs(shapes: SubPath[][], gap: number): { inputs: SubPath[][]; owners: number[] } {
  const keep = shapes.map(subs => subs.slice());
  const loops: { sub: SubPath; owner: number }[] = [];
  if (gap > 0) {
    const open: { owner: number; sub: SubPath }[] = [];
    shapes.forEach((subs, owner) => subs.forEach(sub => { if (!sub.closed && sub.nodes.length >= 2) open.push({ owner, sub }); }));
    const used = new Set<number>();
    const tip = (s: SubPath, first: boolean): Pt => { const n = first ? s.nodes[0] : s.nodes[s.nodes.length - 1]; return [n.x, n.y]; };
    open.forEach((item, i) => {
      if (used.has(i)) return;
      let acc = item.sub;
      const taken = [i];
      let closed = false;
      for (let guard = 0; guard <= open.length; guard++) {
        if (acc.nodes.length >= 3 && Math.hypot(tip(acc, false)[0] - tip(acc, true)[0], tip(acc, false)[1] - tip(acc, true)[1]) <= gap) { closed = true; break; }
        const tail = tip(acc, false);
        let best = -1, bestD = Infinity, flip = false;
        open.forEach((cand, j) => {
          if (taken.includes(j) || used.has(j)) return;
          const a = Math.hypot(tail[0] - tip(cand.sub, true)[0], tail[1] - tip(cand.sub, true)[1]);
          const b = Math.hypot(tail[0] - tip(cand.sub, false)[0], tail[1] - tip(cand.sub, false)[1]);
          if (Math.min(a, b) < bestD) { bestD = Math.min(a, b); best = j; flip = b < a; }
        });
        if (best < 0 || bestD > gap) break;
        taken.push(best);
        const next = flip ? reverseSub(open[best].sub) : open[best].sub;
        acc = { closed: false, nodes: [...acc.nodes, ...next.nodes] };
      }
      if (!closed) return;
      taken.forEach(t => { used.add(t); keep[open[t].owner] = keep[open[t].owner].filter(s => s !== open[t].sub); });
      loops.push({ sub: { closed: true, nodes: acc.nodes }, owner: item.owner });
    });
  }
  const inputs: SubPath[][] = [], owners: number[] = [];
  keep.forEach((subs, k) => { if (subs.length) { inputs.push(subs); owners.push(k); } });
  loops.forEach(l => { inputs.push([l.sub]); owners.push(l.owner); });
  return { inputs, owners };
}

function crossAt(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function strokeSplit(shapes: SubPath[][], p: Pt, tol: number): { shape: number; subs: SubPath[] } | null {
  const hits: { shape: number; sub: number; pos: number; d: number; pts: Pt[] }[] = [];
  shapes.forEach((subs, k) => subs.forEach((sub, si) => {
    const pts = flattenSub(sub, 0.3);
    const count = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const d = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
      if (d <= tol) hits.push({ shape: k, sub: si, pos: i + t, d, pts });
    }
  }));
  if (!hits.length) return null;
  const { shape, sub: si, pos, pts } = hits.reduce((a, b) => (b.d < a.d ? b : a));
  const target = shapes[shape][si];
  const n = pts.length, count = target.closed ? n : n - 1;
  const cuts: number[] = [];
  shapes.forEach((subs, k) => subs.forEach((other, oi) => {
    if (k === shape && oi === si) return;
    const q = flattenSub(other, 0.3);
    const qc = other.closed ? q.length : q.length - 1;
    for (let i = 0; i < count; i++) for (let j = 0; j < qc; j++) {
      const t = crossAt(pts[i], pts[(i + 1) % n], q[j], q[(j + 1) % q.length]);
      if (t !== null) cuts.push(i + t);
    }
  }));
  cuts.sort((a, b) => a - b);
  if (cuts.length < (target.closed ? 2 : 1)) return null;
  const at = (x: number): Pt => { const i = Math.floor(x) % n, t = x - Math.floor(x), a = pts[i], b = pts[(i + 1) % n]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const run = (u0: number, u1: number): SubPath | null => {
    if (u1 - u0 < 1e-6) return null;
    const list: Pt[] = [at(u0)];
    for (let x = Math.floor(u0) + 1; x < u1 - 1e-9; x++) list.push(pts[x % n]);
    list.push(at(u1));
    const curved = target.nodes.some(node => node.in || node.out);
    return curved && list.length > 2 ? fitCurve(list, 0.15) : { closed: false, nodes: list.map(q => ({ x: q[0], y: q[1], in: null, out: null, kind: 'corner' as const })) };
  };
  const lower = cuts.filter(c => c <= pos).pop(), upper = cuts.find(c => c > pos);
  const out: (SubPath | null)[] = [];
  if (target.closed) {
    const lo = lower ?? cuts[cuts.length - 1] - count, hi = upper ?? cuts[0] + count;
    out.push(run(lo, hi), run(hi, lo + count));
  } else out.push(lower !== undefined ? run(0, lower) : null, run(lower ?? 0, upper ?? count), upper !== undefined ? run(upper, count) : null);
  const pieces = out.filter((s): s is SubPath => !!s);
  if (pieces.length < 2) return null;
  const subs = shapes[shape].slice();
  subs.splice(si, 1, ...pieces);
  return { shape, subs };
}
