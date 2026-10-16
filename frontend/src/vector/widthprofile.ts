import { flattenSub } from './edit';
import type { Anchor, Pt, SubPath } from './geometry';

export type WidthPoint = [number, number, number];
export type WidthPreset = 'uniform' | 'taper-end' | 'taper-both' | 'bulge' | 'ends';

export interface SavedProfile { name: string; points: WidthPoint[] }

const PROFILE_KEY = 'formweb_width_profiles';

const sym = (t: number, w: number): WidthPoint => [t, w / 2, w / 2];

export function widthPreset(name: WidthPreset, base: number): WidthPoint[] {
  if (name === 'taper-end') return [sym(0, base), sym(1, 0)];
  if (name === 'taper-both') return [sym(0, 0), sym(0.5, base), sym(1, 0)];
  if (name === 'bulge') return [sym(0, base * 0.4), sym(0.5, base * 1.6), sym(1, base * 0.4)];
  if (name === 'ends') return [sym(0, base * 1.6), sym(0.5, base * 0.5), sym(1, base * 1.6)];
  return [];
}

export function flipProfile(points: WidthPoint[]): WidthPoint[] {
  return points.map(([t, a, b]) => [1 - t, a, b] as WidthPoint).sort((x, y) => x[0] - y[0]);
}

export function normalizePoint(value: unknown): WidthPoint | null {
  if (!Array.isArray(value) || value.length < 2 || !value.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  const t = Math.max(0, Math.min(1, value[0]));
  if (value.length === 2) return sym(t, Math.max(0, value[1]));
  return [t, Math.max(0, value[1]), Math.max(0, value[2])];
}

export function sidesAt(points: WidthPoint[], t: number, half: number): [number, number] {
  if (!points.length) return [half, half];
  const s = points.slice().sort((a, b) => a[0] - b[0]);
  if (t <= s[0][0]) return [s[0][1], s[0][2]];
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i][0]) {
      const span = s[i][0] - s[i - 1][0] || 1, k = (t - s[i - 1][0]) / span;
      const e = k * k * (3 - 2 * k);
      return [s[i - 1][1] + (s[i][1] - s[i - 1][1]) * e, s[i - 1][2] + (s[i][2] - s[i - 1][2]) * e];
    }
  }
  const last = s[s.length - 1];
  return [last[1], last[2]];
}

export function widthAt(points: WidthPoint[], t: number, base: number): number {
  const [a, b] = sidesAt(points, t, base / 2);
  return a + b;
}

export function insertWidth(points: WidthPoint[], t: number, side1: number, side2: number): WidthPoint[] {
  const next = points.map(p => [...p] as WidthPoint);
  const near = next.find(p => Math.abs(p[0] - t) < 0.02);
  if (near) { near[1] = Math.max(0, side1); near[2] = Math.max(0, side2); }
  else next.push([Math.max(0, Math.min(1, t)), Math.max(0, side1), Math.max(0, side2)]);
  return next.sort((a, b) => a[0] - b[0]);
}

export function setPointWidth(points: WidthPoint[], index: number, side1: number, side2: number, adjoining: boolean): WidthPoint[] {
  const next = points.map(p => [...p] as WidthPoint);
  const at = next[index];
  if (!at) return next;
  const r1 = at[1] > 1e-6 ? side1 / at[1] : 1, r2 = at[2] > 1e-6 ? side2 / at[2] : 1;
  if (adjoining) for (const k of [index - 1, index + 1]) if (next[k]) { next[k][1] *= r1; next[k][2] *= r2; }
  at[1] = Math.max(0, side1);
  at[2] = Math.max(0, side2);
  return next;
}

export function profileToSaved(points: WidthPoint[], weight: number): WidthPoint[] {
  const w = weight > 0 ? weight : 1;
  return points.map(([t, a, b]) => [t, Math.round((a / w) * 1000) / 1000, Math.round((b / w) * 1000) / 1000] as WidthPoint);
}

export function profileFromSaved(points: WidthPoint[], weight: number): WidthPoint[] {
  return points.map(([t, a, b]) => [t, a * weight, b * weight] as WidthPoint);
}

export function loadProfiles(): SavedProfile[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    const out: SavedProfile[] = [];
    for (const item of list.slice(0, 40)) {
      const entry = item as { name?: unknown; points?: unknown };
      if (typeof entry.name !== 'string' || !Array.isArray(entry.points)) continue;
      const points = entry.points.map(normalizePoint).filter((p): p is WidthPoint => !!p);
      if (points.length) out.push({ name: entry.name.slice(0, 40), points });
    }
    return out;
  } catch { return []; }
}

export function storeProfiles(list: SavedProfile[]): boolean {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(list.slice(0, 40))); return true; } catch { return false; }
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

function densify(pts: Pt[], closed: boolean): Pt[] {
  const list = closed ? [...pts, pts[0]] : pts;
  let total = 0;
  for (let i = 1; i < list.length; i++) total += Math.hypot(list[i][0] - list[i - 1][0], list[i][1] - list[i - 1][1]);
  const step = Math.max(0.5, total / 120);
  const out: Pt[] = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (!closed && list.length) out.push(list[list.length - 1]);
  return out;
}

export function variableOutline(subs: SubPath[], points: WidthPoint[], base: number, cap: 'butt' | 'round' | 'square'): SubPath[] {
  const out: SubPath[] = [];
  for (const sub of subs) {
    const raw = thin(densify(flattenSub(sub, 0.25), sub.closed), 360);
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
    const sides = lens.map(s => sidesAt(points, s / total, base / 2));
    const half = sides.map(s => (s[0] + s[1]) / 2);
    const left = pts.map((p, i): Pt => [p[0] + normals[i][0] * sides[i][0], p[1] + normals[i][1] * sides[i][0]]);
    const right = pts.map((p, i): Pt => [p[0] - normals[i][0] * sides[i][1], p[1] - normals[i][1] * sides[i][1]]);
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
