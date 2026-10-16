import { EPS, bezierAt, dist, nearestOnPath, openAt, polyPath, segments, setKind, splitAt, type Anchor, type AnchorKind, type Pt, type SubPath } from './geometry';
import { fitCurve } from './fit';

export type JoinStyle = 'miter' | 'round' | 'bevel';
export type CapStyle = 'butt' | 'round' | 'square';

export interface StrokeSpec {
  width: number;
  cap: CapStyle;
  join: JoinStyle;
  miter: number;
  dash: number[];
  dashOffset: number;
}

export function flattenSub(sub: SubPath, tolerance = 0.2): Pt[] {
  const pts: Pt[] = [];
  for (const s of segments([sub])) {
    if (!pts.length) pts.push(s.p0);
    if (s.line) { pts.push(s.p3); continue; }
    const m = Math.max(Math.hypot(s.p0[0] - 2 * s.c1[0] + s.c2[0], s.p0[1] - 2 * s.c1[1] + s.c2[1]), Math.hypot(s.c1[0] - 2 * s.c2[0] + s.p3[0], s.c1[1] - 2 * s.c2[1] + s.p3[1]));
    const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt((0.75 * m) / tolerance))));
    for (let i = 1; i <= n; i++) pts.push(bezierAt(s, i / n));
  }
  if (!pts.length && sub.nodes.length) pts.push([sub.nodes[0].x, sub.nodes[0].y]);
  if (sub.closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < EPS) pts.pop();
  return pts;
}

export function deleteAnchors(subs: SubPath[], picks: Map<number, Set<number>>): SubPath[] {
  const out: SubPath[] = [];
  subs.forEach((sub, si) => {
    const drop = picks.get(si);
    if (!drop || !drop.size) { out.push(sub); return; }
    const nodes = sub.nodes.filter((_, i) => !drop.has(i));
    if (nodes.length >= 2) out.push({ closed: sub.closed && nodes.length >= 3, nodes });
  });
  return out;
}

export function addAnchor(subs: SubPath[], p: Pt, tolerance: number): { subs: SubPath[]; sub: number; index: number } | null {
  const hit = nearestOnPath(subs, p);
  if (!hit || hit.d > tolerance) return null;
  const index = splitAt(subs, hit.seg, hit.t);
  return { subs, sub: hit.seg.sub, index };
}

export function convertAnchors(subs: SubPath[], picks: Map<number, Set<number>>, kind: AnchorKind): void {
  for (const [si, set] of picks) for (const i of set) if (subs[si]?.nodes[i]) setKind(subs[si], i, kind);
}

export function scissorsAt(subs: SubPath[], p: Pt, tolerance: number): boolean {
  const hit = nearestOnPath(subs, p);
  if (!hit || hit.d > tolerance) return false;
  const sub = subs[hit.seg.sub];
  const a = sub.nodes[hit.seg.i], b = sub.nodes[hit.seg.j];
  const da = dist([a.x, a.y], hit.at), db = dist([b.x, b.y], hit.at);
  if (Math.min(da, db) < tolerance) {
    const index = da <= db ? hit.seg.i : hit.seg.j;
    splitAnchor(subs, hit.seg.sub, index);
    return true;
  }
  const at = splitAt(subs, hit.seg, hit.t);
  splitAnchor(subs, hit.seg.sub, at);
  return true;
}

function splitAnchor(subs: SubPath[], si: number, index: number): void {
  const sub = subs[si];
  const n = sub.nodes;
  const twin: Anchor = { x: n[index].x, y: n[index].y, in: null, out: n[index].out, kind: 'corner' };
  n[index].out = null;
  n[index].kind = 'corner';
  if (sub.closed) {
    const rot = [...n.slice(index + 1), ...n.slice(0, index + 1)];
    const first: Anchor = twin;
    sub.nodes = [first, ...rot];
    sub.closed = false;
    return;
  }
  const head = n.slice(0, index + 1);
  const tail = [twin, ...n.slice(index + 1)];
  subs.splice(si, 1, { closed: false, nodes: head }, { closed: false, nodes: tail });
}

export function joinEndpoints(subs: SubPath[], picks: Map<number, Set<number>>): SubPath[] | null {
  const ends: { si: number; start: boolean }[] = [];
  for (const [si, set] of picks) {
    const sub = subs[si];
    if (!sub || sub.closed) continue;
    for (const i of set) {
      if (i === 0) ends.push({ si, start: true });
      else if (i === sub.nodes.length - 1) ends.push({ si, start: false });
    }
  }
  if (ends.length !== 2) return null;
  const [a, b] = ends;
  if (a.si === b.si) {
    const sub = subs[a.si];
    const first = sub.nodes[0], last = sub.nodes[sub.nodes.length - 1];
    if (sub.nodes.length > 2 && dist([first.x, first.y], [last.x, last.y]) < 1e-3) { first.in = last.in; sub.nodes.pop(); }
    else { last.out = null; first.in = null; }
    sub.closed = true;
    return subs;
  }
  const take = (e: { si: number; start: boolean }): Anchor[] => {
    const nodes = subs[e.si].nodes.map(n => ({ ...n }));
    return e.start ? nodes.reverse().map(n => ({ ...n, in: n.out, out: n.in })) : nodes;
  };
  const left = take(a), right = take({ si: b.si, start: !b.start });
  const tail = left[left.length - 1], head = right[0];
  let nodes: Anchor[];
  if (dist([tail.x, tail.y], [head.x, head.y]) < 1e-3) {
    nodes = [...left.slice(0, -1), { x: tail.x, y: tail.y, in: tail.in, out: head.out, kind: 'corner' }, ...right.slice(1)];
  } else nodes = [...left.slice(0, -1), { ...tail, out: null }, { ...head, in: null }, ...right.slice(1)];
  const merged: SubPath = { closed: false, nodes };
  const keep = subs.filter((_, i) => i !== a.si && i !== b.si);
  return [...keep, merged];
}

export function averageAnchors(subs: SubPath[], picks: Map<number, Set<number>>, axis: 'x' | 'y' | 'both', target?: Pt): void {
  const chosen: Anchor[] = [];
  for (const [si, set] of picks) for (const i of set) if (subs[si]?.nodes[i]) chosen.push(subs[si].nodes[i]);
  if (chosen.length < (target ? 1 : 2)) return;
  const mx = target ? target[0] : chosen.reduce((s, n) => s + n.x, 0) / chosen.length, my = target ? target[1] : chosen.reduce((s, n) => s + n.y, 0) / chosen.length;
  for (const n of chosen) {
    const nx = axis === 'y' ? n.x : mx, ny = axis === 'x' ? n.y : my;
    const dx = nx - n.x, dy = ny - n.y;
    n.x = nx; n.y = ny;
    if (n.in) n.in = [n.in[0] + dx, n.in[1] + dy];
    if (n.out) n.out = [n.out[0] + dx, n.out[1] + dy];
  }
}

export function reverseSub(sub: SubPath): SubPath {
  return { closed: sub.closed, nodes: [...sub.nodes].reverse().map(n => ({ ...n, in: n.out, out: n.in })) };
}

function turnIsSharp(sub: SubPath, i: number): boolean {
  const n = sub.nodes, len = n.length;
  const cur = n[i];
  const prev = n[(i - 1 + len) % len], next = n[(i + 1) % len];
  const a: Pt = cur.in ?? [prev.x, prev.y], b: Pt = cur.out ?? [next.x, next.y];
  const ax = cur.x - a[0], ay = cur.y - a[1], bx = b[0] - cur.x, by = b[1] - cur.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPS || lb < EPS) return true;
  return (ax * bx + ay * by) / (la * lb) < 0.85;
}

export function simplifySub(sub: SubPath, tolerance: number): SubPath {
  if (sub.nodes.length < 3) return sub;
  let start = 0;
  if (sub.closed) {
    start = sub.nodes.findIndex((_, i) => turnIsSharp(sub, i));
    if (start < 0) start = 0;
  }
  const order = sub.closed ? [...sub.nodes.slice(start), ...sub.nodes.slice(0, start)] : sub.nodes;
  const ordered: SubPath = { closed: sub.closed, nodes: order };
  const dense: Pt[] = [];
  const markers: number[] = [];
  const segs = segments([ordered]);
  segs.forEach((s, k) => {
    if (k === 0) { dense.push(s.p0); markers.push(0); }
    const steps = s.line ? 1 : 24;
    for (let i = 1; i <= steps; i++) dense.push(s.line ? s.p3 : bezierAt(s, i / steps));
    markers.push(dense.length - 1);
  });
  const breaks: number[] = [0];
  for (let i = 1; i < order.length; i++) if (turnIsSharp(ordered, i)) breaks.push(i);
  if (sub.closed) breaks.push(order.length);
  else if (breaks[breaks.length - 1] !== order.length - 1) breaks.push(order.length - 1);
  const nodes: Anchor[] = [];
  for (let k = 0; k + 1 < breaks.length; k++) {
    const from = markers[breaks[k]], to = markers[Math.min(breaks[k + 1], markers.length - 1)];
    const fit = fitCurve(dense.slice(from, to + 1), tolerance);
    if (!nodes.length) nodes.push(...fit.nodes);
    else {
      const last = nodes[nodes.length - 1];
      last.out = fit.nodes[0].out;
      last.kind = 'corner';
      nodes.push(...fit.nodes.slice(1));
    }
  }
  if (sub.closed && nodes.length > 1) {
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (dist([first.x, first.y], [last.x, last.y]) < 1e-3) { first.in = last.in; nodes.pop(); }
  }
  const count = sub.closed ? nodes.length : nodes.length - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i], b = nodes[(i + 1) % nodes.length];
    if (!a.out || !b.in) continue;
    const vx = b.x - a.x, vy = b.y - a.y, len = Math.hypot(vx, vy);
    if (len < EPS) continue;
    const off = (p: Pt): number => Math.abs((p[0] - a.x) * vy - (p[1] - a.y) * vx) / len;
    if (off(a.out) < 0.05 && off(b.in) < 0.05) { a.out = null; b.in = null; }
  }
  for (const b of breaks) {
    const source = order[Math.min(b, order.length - 1)];
    const target = nodes.find(n => Math.abs(n.x - source.x) < 1e-3 && Math.abs(n.y - source.y) < 1e-3);
    if (target && source.corner) target.corner = { ...source.corner };
  }
  return { closed: sub.closed, nodes };
}

function signedArea(pts: Pt[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
  return area / 2;
}

function oriented(points: Pt[]): SubPath {
  return polyPath(signedArea(points) < 0 ? [...points].reverse() : points, true);
}

function arcPoints(center: Pt, from: Pt, to: Pt, radius: number, steps: number): Pt[] {
  const a0 = Math.atan2(from[1], from[0]);
  let delta = Math.atan2(to[1], to[0]) - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps;
    out.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return out;
}

export function dashPolyline(pts: Pt[], closed: boolean, dash: number[], offset: number): { pts: Pt[]; closed: boolean }[] {
  const pattern = dash.length % 2 ? [...dash, ...dash] : dash;
  const total = pattern.reduce((s, v) => s + v, 0);
  const line = closed ? [...pts, pts[0]] : pts;
  if (total <= EPS || pattern.some(v => v < 0) || line.length < 2) return [{ pts, closed }];
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let index = 0, remain = pattern[0];
  let shift = ((offset % total) + total) % total;
  while (shift > 0) {
    if (shift >= remain) { shift -= remain; index = (index + 1) % pattern.length; remain = pattern[index]; } else { remain -= shift; shift = 0; }
  }
  let current: Pt[] | null = index % 2 === 0 ? [line[0]] : null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const length = dist(a, b);
    let travelled = 0;
    while (length - travelled > remain) {
      travelled += remain;
      const p: Pt = [a[0] + ((b[0] - a[0]) * travelled) / length, a[1] + ((b[1] - a[1]) * travelled) / length];
      if (current) { current.push(p); out.push({ pts: current, closed: false }); current = null; } else current = [p];
      index = (index + 1) % pattern.length;
      remain = pattern[index] > EPS ? pattern[index] : EPS;
    }
    remain -= length - travelled;
    if (current) current.push(b);
  }
  if (current && current.length > 1) out.push({ pts: current, closed: false });
  return out;
}

function strokePolyline(pts: Pt[], closed: boolean, spec: StrokeSpec): SubPath[] {
  const h = spec.width / 2;
  const clean: Pt[] = [];
  for (const p of pts) if (!clean.length || dist(p, clean[clean.length - 1]) > EPS) clean.push(p);
  if (closed && clean.length > 1 && dist(clean[0], clean[clean.length - 1]) < EPS) clean.pop();
  const out: SubPath[] = [];
  if (clean.length === 1) {
    if (spec.cap === 'round') out.push(oriented(roundCap(clean[0], [1, 0], h).concat(roundCap(clean[0], [-1, 0], h))));
    else if (spec.cap === 'square') out.push(oriented([[clean[0][0] - h, clean[0][1] - h], [clean[0][0] + h, clean[0][1] - h], [clean[0][0] + h, clean[0][1] + h], [clean[0][0] - h, clean[0][1] + h]]));
    return out;
  }
  const count = closed ? clean.length : clean.length - 1;
  const dirs: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = clean[i], b = clean[(i + 1) % clean.length];
    const l = dist(a, b);
    dirs.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
  }
  for (let i = 0; i < count; i++) {
    const a = clean[i], b = clean[(i + 1) % clean.length];
    const nx = -dirs[i][1] * h, ny = dirs[i][0] * h;
    out.push(oriented([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]));
  }
  const joins = closed ? count : count - 1;
  for (let k = 0; k < joins; k++) {
    const i = closed ? k : k + 1;
    const v = clean[i];
    const e1 = dirs[(i - 1 + count) % count], e2 = dirs[i % count];
    const cross = e1[0] * e2[1] - e1[1] * e2[0];
    const dot = e1[0] * e2[0] + e1[1] * e2[1];
    if (Math.abs(cross) < 1e-9 && dot > 0) continue;
    const side = cross > 0 ? -1 : 1;
    const n1: Pt = [-e1[1] * side, e1[0] * side], n2: Pt = [-e2[1] * side, e2[0] * side];
    const p1: Pt = [v[0] + n1[0] * h, v[1] + n1[1] * h], p2: Pt = [v[0] + n2[0] * h, v[1] + n2[1] * h];
    if (spec.join === 'round') out.push(oriented([v, ...arcPoints(v, [n1[0], n1[1]], [n2[0], n2[1]], h, 12)]));
    else {
      const half = Math.acos(Math.max(-1, Math.min(1, -dot))) / 2;
      const ratio = Math.sin(half) > EPS ? 1 / Math.sin(half) : Infinity;
      if (spec.join === 'miter' && ratio <= spec.miter) {
        const k = h / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
        out.push(oriented([v, p1, [v[0] + (n1[0] + n2[0]) * k, v[1] + (n1[1] + n2[1]) * k], p2]));
      } else out.push(oriented([v, p1, p2]));
    }
  }
  if (!closed) {
    const capAt = (p: Pt, dir: Pt): void => {
      if (spec.cap === 'butt') return;
      const nx = -dir[1] * h, ny = dir[0] * h;
      if (spec.cap === 'square') out.push(oriented([[p[0] + nx, p[1] + ny], [p[0] + nx + dir[0] * h, p[1] + ny + dir[1] * h], [p[0] - nx + dir[0] * h, p[1] - ny + dir[1] * h], [p[0] - nx, p[1] - ny]]));
      else out.push(oriented(roundCap(p, dir, h)));
    };
    const first = dirs[0], last = dirs[dirs.length - 1];
    capAt(clean[0], [-first[0], -first[1]]);
    capAt(clean[clean.length - 1], last);
  }
  return out;
}

function roundCap(p: Pt, dir: Pt, h: number): Pt[] {
  const nx = -dir[1], ny = dir[0];
  const base = Math.atan2(ny, nx);
  const out: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = base - (Math.PI * i) / 12;
    out.push([p[0] + h * Math.cos(a), p[1] + h * Math.sin(a)]);
  }
  return out;
}

export function outlineStroke(subs: SubPath[], spec: StrokeSpec): SubPath[] {
  const out: SubPath[] = [];
  for (const sub of subs) {
    const pts = flattenSub(sub, 0.1);
    if (!pts.length) continue;
    const pieces = spec.dash.length && spec.dash.some(v => v > 0) ? dashPolyline(pts, sub.closed, spec.dash, spec.dashOffset) : [{ pts, closed: sub.closed }];
    for (const piece of pieces) out.push(...strokePolyline(piece.pts, piece.closed, spec));
  }
  return out;
}

export function offsetSubs(subs: SubPath[], distance: number, join: JoinStyle, miter: number): SubPath[] {
  const out: SubPath[] = [];
  for (const sub of subs) {
    const pts = flattenSub(sub, 0.1);
    if (pts.length < 2) continue;
    if (!sub.closed || pts.length < 3) {
      out.push(...outlineStroke([sub], { width: Math.abs(distance) * 2, cap: join === 'round' ? 'round' : 'butt', join, miter, dash: [], dashOffset: 0 }));
      continue;
    }
    const s = signedArea(pts) >= 0 ? 1 : -1;
    const n = pts.length;
    const ring: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
      const l1 = dist(prev, cur), l2 = dist(cur, next);
      if (l1 < EPS || l2 < EPS) continue;
      const e1: Pt = [(cur[0] - prev[0]) / l1, (cur[1] - prev[1]) / l1], e2: Pt = [(next[0] - cur[0]) / l2, (next[1] - cur[1]) / l2];
      const n1: Pt = [e1[1] * s, -e1[0] * s], n2: Pt = [e2[1] * s, -e2[0] * s];
      const cross = e1[0] * e2[1] - e1[1] * e2[0];
      const convex = s * cross > 0;
      const outer = convex === (distance > 0);
      const p1: Pt = [cur[0] + n1[0] * distance, cur[1] + n1[1] * distance], p2: Pt = [cur[0] + n2[0] * distance, cur[1] + n2[1] * distance];
      const dot = n1[0] * n2[0] + n1[1] * n2[1];
      const k = distance / Math.max(0.2, 1 + dot);
      const tip: Pt = [cur[0] + (n1[0] + n2[0]) * k, cur[1] + (n1[1] + n2[1]) * k];
      if (!outer) { ring.push(1 + dot > 0.04 ? tip : p1); continue; }
      if (join === 'round') ring.push(...arcPoints(cur, [n1[0] * Math.sign(distance), n1[1] * Math.sign(distance)], [n2[0] * Math.sign(distance), n2[1] * Math.sign(distance)], Math.abs(distance), 10));
      else if (join === 'miter' && 1 / Math.sqrt(Math.max(1e-6, (1 + dot) / 2)) <= miter) ring.push(tip);
      else ring.push(p1, p2);
    }
    if (ring.length < 3) continue;
    const result = fitRing(ring);
    out.push(result);
  }
  return out;
}

function fitRing(ring: Pt[]): SubPath {
  const sub = polyPath(ring, true);
  return simplifySubSafe(sub);
}

function simplifySubSafe(sub: SubPath): SubPath {
  return sub.nodes.length > 400 ? simplifySub(sub, 0.35) : sub;
}
