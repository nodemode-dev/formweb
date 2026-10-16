import { flattenSub } from './edit';
import type { Anchor, Pt, SubPath } from './geometry';

export type WidthPoint = [number, number];
export type WidthPreset = 'uniform' | 'taper-end' | 'taper-both' | 'bulge' | 'ends';

export function widthPreset(name: WidthPreset, base: number): WidthPoint[] {
  if (name === 'taper-end') return [[0, base], [1, 0]];
  if (name === 'taper-both') return [[0, 0], [0.5, base], [1, 0]];
  if (name === 'bulge') return [[0, base * 0.4], [0.5, base * 1.6], [1, base * 0.4]];
  if (name === 'ends') return [[0, base * 1.6], [0.5, base * 0.5], [1, base * 1.6]];
  return [];
}

export function flipProfile(points: WidthPoint[]): WidthPoint[] {
  return points.map(([t, w]) => [1 - t, w] as WidthPoint).sort((a, b) => a[0] - b[0]);
}

export function widthAt(points: WidthPoint[], t: number, base: number): number {
  if (!points.length) return base;
  const s = points.slice().sort((a, b) => a[0] - b[0]);
  if (t <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i][0]) {
      const span = s[i][0] - s[i - 1][0] || 1, k = (t - s[i - 1][0]) / span;
      const e = k * k * (3 - 2 * k);
      return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * e;
    }
  }
  return s[s.length - 1][1];
}

export function insertWidth(points: WidthPoint[], t: number, width: number): WidthPoint[] {
  const next = points.map(p => [...p] as WidthPoint);
  const near = next.find(p => Math.abs(p[0] - t) < 0.02);
  if (near) near[1] = Math.max(0, width);
  else next.push([Math.max(0, Math.min(1, t)), Math.max(0, width)]);
  return next.sort((a, b) => a[0] - b[0]);
}

const corner = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });

function thin(pts: Pt[], max: number): Pt[] {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

function arc(center: Pt, from: Pt, count: number): Pt[] {
  const a0 = Math.atan2(from[1] - center[1], from[0] - center[0]), r = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const out: Pt[] = [];
  for (let i = 1; i < count; i++) {
    const a = a0 - (Math.PI * i) / count;
    out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
  }
  return out;
}

export function variableOutline(subs: SubPath[], points: WidthPoint[], base: number, cap: 'butt' | 'round' | 'square'): SubPath[] {
  const out: SubPath[] = [];
  for (const sub of subs) {
    const raw = thin(flattenSub(sub, 0.25), 360);
    const pts = sub.closed ? [...raw, raw[0]] : raw;
    if (pts.length < 2) continue;
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = lens[lens.length - 1] || 1;
    const normals: Pt[] = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      if (sub.closed && (i === 0 || i === pts.length - 1)) { dx = pts[1][0] - pts[pts.length - 2][0]; dy = pts[1][1] - pts[pts.length - 2][1]; }
      const l = Math.hypot(dx, dy) || 1;
      return [-dy / l, dx / l];
    });
    const half = lens.map(s => widthAt(points, s / total, base) / 2);
    const left = pts.map((p, i): Pt => [p[0] + normals[i][0] * half[i], p[1] + normals[i][1] * half[i]]);
    const right = pts.map((p, i): Pt => [p[0] - normals[i][0] * half[i], p[1] - normals[i][1] * half[i]]);
    if (sub.closed) {
      out.push({ closed: true, nodes: left.slice(0, -1).map(corner) });
      out.push({ closed: true, nodes: right.slice(0, -1).reverse().map(corner) });
      continue;
    }
    const poly: Pt[] = [...left];
    const last = pts[pts.length - 1], first = pts[0];
    const tail = normals[normals.length - 1], head = normals[0];
    if (cap === 'round' && half[half.length - 1] > 0.01) poly.push(...arc(last, left[left.length - 1], 8));
    if (cap === 'square') {
      const e = half[half.length - 1];
      poly.push([left[left.length - 1][0] + tail[1] * e, left[left.length - 1][1] - tail[0] * e], [right[right.length - 1][0] + tail[1] * e, right[right.length - 1][1] - tail[0] * e]);
    }
    poly.push(...right.slice().reverse());
    if (cap === 'round' && half[0] > 0.01) poly.push(...arc(first, right[0], 8));
    if (cap === 'square') {
      const e = half[0];
      poly.push([right[0][0] - head[1] * e, right[0][1] + head[0] * e], [left[0][0] - head[1] * e, left[0][1] + head[0] * e]);
    }
    out.push({ closed: true, nodes: poly.map(corner) });
  }
  return out;
}

export function pointAtParam(subs: SubPath[], t: number): { at: Pt; normal: Pt } | null {
  const sub = subs[0];
  if (!sub) return null;
  const pts = flattenSub(sub, 0.25);
  const list = sub.closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let i = 1; i < list.length; i++) lens.push(lens[i - 1] + Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1]));
  const target = Math.max(0, Math.min(1, t)) * (lens[lens.length - 1] || 1);
  for (let i = 1; i < list.length; i++) {
    if (target <= lens[i] || i === list.length - 1) {
      const span = lens[i] - lens[i - 1] || 1, k = (target - lens[i - 1]) / span;
      const a = list[i - 1], b = list[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], normal: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] };
    }
  }
  return null;
}

export function nearestParam(subs: SubPath[], p: Pt): { t: number; at: Pt; d: number; normal: Pt } | null {
  let best: { t: number; at: Pt; d: number; normal: Pt } | null = null;
  const sub = subs[0];
  if (!sub) return null;
  const pts = flattenSub(sub, 0.25);
  const list = sub.closed ? [...pts, pts[0]] : pts;
  const lens = [0];
  for (let i = 1; i < list.length; i++) lens.push(lens[i - 1] + Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1]));
  const total = lens[lens.length - 1] || 1;
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const at: Pt = [a[0] + dx * k, a[1] + dy * k];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (!best || d < best.d) {
      const l = Math.sqrt(l2);
      best = { t: (lens[i - 1] + Math.sqrt(l2) * k) / total, at, d, normal: [-dy / l, dx / l] };
    }
  }
  return best;
}
