import { applyCorners, renderPath } from './corners';
import { bezierAt, decodeModel, dist, ellipsePath, formatPath, parsePath, polyPath, segments, splitBezier, type Anchor, type Pt, type SubPath } from './geometry';
import { normalizePoint, sidesAt, variableOutline, widthAt, type WidthPoint } from './widthprofile';

export type Arrow = 'none' | 'simple' | 'filled' | 'open' | 'circle' | 'square' | 'bar';
export type DashMode = 'preserve' | 'align';
export type ArrowTip = 'extend' | 'end';
type Attrs = Record<string, string>;

export const ARROWS: Arrow[] = ['none', 'simple', 'filled', 'open', 'circle', 'square', 'bar'];

export interface StrokeModel { dash: number[]; mode: DashMode; a0: Arrow; a1: Arrow; s0: number; s1: number; tip: ArrowTip }
export interface StrokeSpec extends StrokeModel { v: 1; src: string; sig: string }

export const defaultModel: StrokeModel = { dash: [], mode: 'preserve', a0: 'none', a1: 'none', s0: 100, s1: 100, tip: 'extend' };

const OUTPUT_LIMIT = 3000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const arrowOf = (v: unknown): v is Arrow => typeof v === 'string' && (ARROWS as string[]).includes(v);

export function cleanModel(model: StrokeModel): StrokeModel {
  const dash = model.dash.filter(n => Number.isFinite(n)).slice(0, 6).map(n => Math.max(0, Math.min(10000, Math.round(n * 1000) / 1000)));
  if (dash.length % 2) dash.pop();
  return {
    dash,
    mode: model.mode === 'align' ? 'align' : 'preserve',
    a0: arrowOf(model.a0) ? model.a0 : 'none',
    a1: arrowOf(model.a1) ? model.a1 : 'none',
    s0: Math.max(1, Math.min(1000, Math.round(model.s0) || 100)),
    s1: Math.max(1, Math.min(1000, Math.round(model.s1) || 100)),
    tip: model.tip === 'end' ? 'end' : 'extend'
  };
}

export function readStroke(raw: string | undefined): StrokeSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Record<string, unknown>;
    const dash = c.dash;
    if (c.v !== 1 || typeof c.src !== 'string' || !ID.test(c.src) || !Array.isArray(dash) || dash.length > 6 || dash.length % 2 || !dash.every(n => finite(n, 0, 10000))) return null;
    if ((c.mode !== 'preserve' && c.mode !== 'align') || !arrowOf(c.a0) || !arrowOf(c.a1) || !finite(c.s0, 1, 1000) || !finite(c.s1, 1, 1000) || (c.tip !== 'extend' && c.tip !== 'end')) return null;
    if (typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, src: c.src, dash: dash as number[], mode: c.mode, a0: c.a0, a1: c.a1, s0: c.s0, s1: c.s1, tip: c.tip, sig: c.sig };
  } catch { return null; }
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function strokeSig(spec: StrokeModel & { src: string; v: 1; sig?: string }, src: Attrs): string {
  const keys = Object.keys(src).filter(k => k !== 'id' && k !== 'stroke-opacity').sort().map(k => [k, src[k]]);
  return hash(JSON.stringify([{ ...spec, sig: '' }, keys]));
}

export interface WidthSpec { outline: string; color: string; points: WidthPoint[] }

export function widthSpec(raw: string | undefined): WidthSpec | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list) || typeof list[0] !== 'string' || typeof list[1] !== 'string') return null;
    const points = list.slice(2).map(normalizePoint).filter((p): p is WidthPoint => !!p);
    return points.length ? { outline: list[0], color: list[1], points } : null;
  } catch { return null; }
}

export const strokeUnder = (attrs: Attrs): boolean => attrs['data-fw-align'] === 'outside' && (attrs.fill ?? '#000000') !== 'none';

interface Bz { p0: Pt; c1: Pt; c2: Pt; p3: Pt; line: boolean; corner: boolean }

const unit = (a: Pt, b: Pt): Pt => { const l = dist(a, b); return l < 1e-9 ? [1, 0] : [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

function startDir(s: Bz): Pt {
  for (const q of [s.c1, s.c2, s.p3]) if (dist(q, s.p0) > 1e-6) return unit(s.p0, q);
  return [1, 0];
}

function endDir(s: Bz): Pt {
  for (const q of [s.c2, s.c1, s.p0]) if (dist(q, s.p3) > 1e-6) return unit(q, s.p3);
  return [1, 0];
}

function pieces(sub: SubPath): Bz[] {
  const list = segments([sub]).map(s => ({ p0: s.p0, c1: s.c1, c2: s.c2, p3: s.p3, line: s.line, corner: false }));
  list.forEach((s, i) => {
    const next = list[i + 1] ?? (sub.closed ? list[0] : undefined);
    if (!next) { s.corner = true; return; }
    const a = endDir(s), b = startDir(next);
    s.corner = a[0] * b[0] + a[1] * b[1] < 0.9994;
  });
  return list;
}

function length(s: Bz): number {
  if (s.line) return dist(s.p0, s.p3);
  let total = 0, last = s.p0;
  for (let i = 1; i <= 32; i++) { const p = bezierAt(s, i / 32); total += dist(last, p); last = p; }
  return total;
}

function paramAt(s: Bz, d: number): number {
  const total = length(s);
  if (total < 1e-9) return 0;
  if (s.line) return Math.max(0, Math.min(1, d / total));
  let acc = 0, last = s.p0;
  for (let i = 1; i <= 48; i++) {
    const p = bezierAt(s, i / 48), step = dist(last, p);
    if (acc + step >= d) return ((i - 1) + (step < 1e-12 ? 0 : (d - acc) / step)) / 48;
    acc += step;
    last = p;
  }
  return 1;
}

function chop(s: Bz, d: number, fromStart: boolean): Bz {
  const t = paramAt(s, fromStart ? d : length(s) - d);
  if (s.line) {
    const q: Pt = [s.p0[0] + (s.p3[0] - s.p0[0]) * t, s.p0[1] + (s.p3[1] - s.p0[1]) * t];
    return fromStart ? { ...s, p0: q, c1: q } : { ...s, p3: q, c2: q };
  }
  const [l, r] = splitBezier(s.p0, s.c1, s.c2, s.p3, t);
  const half = fromStart ? r : l;
  return { ...s, p0: half[0], c1: half[1], c2: half[2], p3: half[3] };
}

function trim(source: Bz[], head: number, tail: number): Bz[] {
  const out = source.map(s => ({ ...s }));
  while (head > 1e-9 && out.length) {
    const l = length(out[0]);
    if (head >= l - 1e-9) { head -= l; out.shift(); continue; }
    out[0] = chop(out[0], head, true);
    head = 0;
  }
  while (tail > 1e-9 && out.length) {
    const l = length(out[out.length - 1]);
    if (tail >= l - 1e-9) { tail -= l; out.pop(); continue; }
    out[out.length - 1] = chop(out[out.length - 1], tail, false);
    tail = 0;
  }
  if (out.length) out[out.length - 1].corner = true;
  return out;
}

function chain(list: Bz[]): SubPath {
  const nodes: Anchor[] = [{ x: list[0].p0[0], y: list[0].p0[1], in: null, out: list[0].line ? null : list[0].c1, kind: 'corner' }];
  list.forEach((s, i) => {
    const next = list[i + 1];
    nodes.push({ x: s.p3[0], y: s.p3[1], in: s.line ? null : s.c2, out: next && !next.line ? next.c1 : null, kind: 'corner' });
  });
  return { nodes, closed: false };
}

interface Track { list: Bz[]; lens: number[]; cum: number[]; total: number; closed: boolean }

function trackOf(list: Bz[], closed: boolean): Track {
  const lens = list.map(length);
  const cum = [0];
  lens.forEach((l, i) => cum.push(cum[i] + l));
  return { list, lens, cum, total: cum[cum.length - 1], closed };
}

function evalAt(s: Bz, d: number, len: number): { p: Pt; dir: Pt } {
  const t = len < 1e-9 ? 0 : paramAt(s, d);
  if (s.line) return { p: [s.p0[0] + (s.p3[0] - s.p0[0]) * t, s.p0[1] + (s.p3[1] - s.p0[1]) * t], dir: unit(s.p0, s.p3) };
  const u = 1 - t;
  const dx = 3 * (u * u * (s.c1[0] - s.p0[0]) + 2 * u * t * (s.c2[0] - s.c1[0]) + t * t * (s.p3[0] - s.c2[0]));
  const dy = 3 * (u * u * (s.c1[1] - s.p0[1]) + 2 * u * t * (s.c2[1] - s.c1[1]) + t * t * (s.p3[1] - s.c2[1]));
  const l = Math.hypot(dx, dy);
  return { p: bezierAt(s, t), dir: l < 1e-9 ? (t < 0.5 ? startDir(s) : endDir(s)) : [dx / l, dy / l] };
}

function pointAt(k: Track, pos: number, forward: boolean): { p: Pt; dir: Pt } {
  const n = k.list.length;
  let s = Math.max(0, Math.min(k.total, pos));
  if (k.closed) s = pos - Math.floor((pos + (forward ? 1e-9 : -1e-9)) / k.total) * k.total;
  let i = n - 1;
  for (let j = 0; j < n; j++) if (forward ? s < k.cum[j + 1] - 1e-9 : s <= k.cum[j + 1] + 1e-9) { i = j; break; }
  return evalAt(k.list[i], Math.max(0, Math.min(k.lens[i], s - k.cum[i])), k.lens[i]);
}

function extract(k: Track, a: number, b: number): Bz[] {
  const n = k.list.length, out: Bz[] = [];
  const rounds = k.closed ? Math.ceil(b / k.total) + 1 : 1;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n; i++) {
      const lo = r * k.total + k.cum[i], hi = lo + k.lens[i];
      if (hi <= a + 1e-9 || k.lens[i] < 1e-9) continue;
      if (lo >= b - 1e-9) return out;
      let piece = { ...k.list[i] };
      if (a - lo > 1e-9) piece = chop(piece, a - lo, true);
      if (hi - b > 1e-9) piece = chop(piece, hi - b, false);
      out.push(piece);
    }
  }
  if (!out.length) { const at = pointAt(k, a, true).p; out.push({ p0: at, c1: at, c2: at, p3: at, line: true, corner: false }); }
  return out;
}

function runBounds(k: Track, lo: number, hi: number): [number, number][] {
  const marks: number[] = [];
  k.list.forEach((s, i) => { if (s.corner) marks.push(k.cum[i + 1]); });
  const runs: [number, number][] = [];
  if (k.closed) {
    if (!marks.length) return [[0, k.total]];
    marks.forEach((a, i) => {
      const b = i + 1 < marks.length ? marks[i + 1] : marks[0] + k.total;
      if (b - a > 1e-6) runs.push([a, b]);
    });
    return runs;
  }
  const cuts = [lo, ...marks.filter(m => m > lo + 1e-6 && m < hi - 1e-6), hi];
  for (let i = 1; i < cuts.length; i++) runs.push([cuts[i - 1], cuts[i]]);
  return runs;
}

function dashSpans(runs: [number, number][], dash: number[], centered: boolean): [number, number][] {
  const period = dash.reduce((x, y) => x + y, 0);
  const out: [number, number][] = [];
  if (period <= 0) return out;
  for (const [lo, hi] of runs) {
    const span = hi - lo;
    if (span < 1e-6) continue;
    const k = centered ? span / (Math.max(1, Math.round(span / period)) * period) : 1;
    const sc = dash.map(v => v * k);
    let pos = centered ? lo - sc[0] / 2 : lo, idx = 0;
    while (pos < hi + 1e-9 && out.length < OUTPUT_LIMIT) {
      const len = sc[idx % sc.length];
      if (idx % 2 === 0 && pos + len >= lo - 1e-9) out.push([Math.max(lo, pos), Math.min(hi, pos + len)]);
      pos += len;
      idx++;
    }
  }
  return out;
}

function joinSpans(list: [number, number][], closed: boolean, from: number, total: number): [number, number][] {
  const out: [number, number][] = [];
  for (const s of list.slice().sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  if (closed && out.length > 1 && out[0][0] <= from + 1e-6 && out[out.length - 1][1] >= from + total - 1e-6) {
    const head = out.shift() as [number, number];
    out[out.length - 1][1] = head[1] + total;
  }
  return out;
}

interface Profile { points: WidthPoint[]; base: number; cap: string; join: string; miter: number }

function capPoints(poly: Pt[], from: Pt, to: Pt, dir: Pt, sign: number, cap: string): void {
  const c: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const v: Pt = [from[0] - c[0], from[1] - c[1]], h = Math.hypot(v[0], v[1]);
  if (h < 1e-6) return;
  if (cap === 'round') {
    for (let j = 1; j < 8; j++) {
      const f = (Math.PI * j) / 8;
      poly.push([c[0] + v[0] * Math.cos(f) + dir[0] * sign * h * Math.sin(f), c[1] + v[1] * Math.cos(f) + dir[1] * sign * h * Math.sin(f)]);
    }
  } else if (cap === 'square') {
    poly.push([from[0] + dir[0] * sign * h, from[1] + dir[1] * sign * h], [to[0] + dir[0] * sign * h, to[1] + dir[1] * sign * h]);
  }
}

function joinPoints(p: Pt, t1: Pt, t2: Pt, w: number, sign: number, f: Profile): Pt[] {
  const n1: Pt = [-t1[1], t1[0]], n2: Pt = [-t2[1], t2[0]];
  const cross = t1[0] * t2[1] - t1[1] * t2[0], dot = t1[0] * t2[0] + t1[1] * t2[1];
  const at = (nv: Pt, r: number): Pt => [p[0] + sign * nv[0] * r, p[1] + sign * nv[1] * r];
  if (Math.abs(cross) < 1e-6 && dot > 0) return [at(n1, w)];
  const m: Pt = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(m[0], m[1]);
  if (ml < 1e-6) return [at(n1, w), at([-n1[0], -n1[1]], w)];
  const mu: Pt = [m[0] / ml, m[1] / ml];
  const ratio = 1 / Math.max(ml / 2, 1e-3);
  const inner = cross * sign > 0;
  if (inner) return [at(mu, w * Math.min(ratio, 10))];
  if (f.join === 'miter' && ratio <= f.miter) return [at(mu, w * ratio)];
  if (f.join === 'round') {
    const a0 = Math.atan2(n1[1], n1[0]), da = Math.atan2(cross, dot), out: Pt[] = [];
    for (let j = 0; j <= 4; j++) out.push([p[0] + sign * Math.cos(a0 + (da * j) / 4) * w, p[1] + sign * Math.sin(a0 + (da * j) / 4) * w]);
    return out;
  }
  return [at(n1, w), at(n2, w)];
}

function ribbon(k: Track, a: number, b: number, f: Profile): SubPath {
  const total = k.total, n = k.list.length;
  const steps = Math.max(2, Math.min(240, Math.ceil((b - a) / 2.5)));
  const marks: { s: number; ci: number }[] = [];
  const rounds = k.closed ? Math.ceil(b / total) + 1 : 1;
  for (let r = 0; r < rounds; r++) k.list.forEach((s, i) => { const c = r * total + k.cum[i + 1]; if (s.corner && c > a + 1e-6 && c < b - 1e-6) marks.push({ s: c, ci: i }); });
  const entries: { s: number; ci: number }[] = [...marks];
  for (let j = 0; j <= steps; j++) {
    const s = a + ((b - a) * j) / steps;
    if (!marks.some(m => Math.abs(m.s - s) < 1e-6)) entries.push({ s, ci: -1 });
  }
  entries.sort((x, y) => x.s - y.s);
  const left: Pt[] = [], right: Pt[] = [];
  let startDirV: Pt = [1, 0], endDirV: Pt = [1, 0];
  entries.forEach((e, idx) => {
    const wrapped = k.closed ? ((e.s % total) + total) % total : e.s;
    const [sl, sr] = sidesAt(f.points, Math.max(0, Math.min(1, wrapped / total)), f.base / 2);
    if (e.ci >= 0) {
      const sIn = k.list[e.ci], sOut = k.list[(e.ci + 1) % n];
      const t1 = endDir(sIn), t2 = startDir(sOut);
      left.push(...joinPoints(sIn.p3, t1, t2, sl, 1, f));
      right.push(...joinPoints(sIn.p3, t1, t2, sr, -1, f));
      return;
    }
    const at = pointAt(k, e.s, idx < entries.length - 1);
    if (idx === 0) startDirV = at.dir;
    if (idx === entries.length - 1) endDirV = at.dir;
    const nv: Pt = [-at.dir[1], at.dir[0]];
    left.push([at.p[0] + nv[0] * sl, at.p[1] + nv[1] * sl]);
    right.push([at.p[0] - nv[0] * sr, at.p[1] - nv[1] * sr]);
  });
  const poly: Pt[] = [...left];
  capPoints(poly, left[left.length - 1], right[right.length - 1], endDirV, 1, f.cap);
  poly.push(...right.slice().reverse());
  capPoints(poly, right[0], left[0], startDirV, -1, f.cap);
  return polyPath(poly, true);
}

function widePart(list: Bz[], sub: SubPath, wide: WidthSpec, base: Attrs, weight: number, dash: number[], align: boolean, head: number, tail: number): Attrs | null {
  const k = trackOf(list, sub.closed);
  const lo = sub.closed ? 0 : head, hi = sub.closed ? k.total : k.total - tail;
  if (hi - lo < 1e-6) return null;
  const f: Profile = { points: wide.points, base: weight, cap: base['stroke-linecap'] ?? 'butt', join: base['stroke-linejoin'] ?? 'miter', miter: parseFloat(base['stroke-miterlimit'] ?? '4') || 4 };
  let shapes: SubPath[];
  if (dash.reduce((x, y) => x + y, 0) > 0) {
    const runs = align ? runBounds(k, lo, hi) : [[lo, hi] as [number, number]];
    shapes = joinSpans(dashSpans(runs, dash, align), sub.closed, runs.length ? runs[0][0] : 0, k.total).map(([a, b]) => ribbon(k, a, b, f));
  } else if (sub.closed) shapes = variableOutline([sub], wide.points, weight, 'butt');
  else shapes = [ribbon(k, lo, hi, f)];
  if (!shapes.length) return null;
  const attrs: Attrs = { ...base, d: formatPath(shapes), fill: wide.color, stroke: 'none', 'fill-rule': 'nonzero' };
  for (const key of ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']) delete attrs[key];
  return attrs;
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

function arrowSize(id: Arrow, weight: number, scale: number): { len: number; trim: number } {
  const u = (Math.max(weight, 1) * scale) / 100;
  switch (id) {
    case 'simple': return { len: 4 * u, trim: 0 };
    case 'filled': case 'open': return { len: 4 * u, trim: 4 * u };
    case 'circle': case 'square': return { len: 3 * u, trim: 3 * u };
    case 'bar': return { len: u, trim: u };
    default: return { len: 0, trim: 0 };
  }
}

function arrowShape(id: Arrow, tipAt: Pt, dir: Pt, weight: number, scale: number, tip: ArrowTip): SubPath | null {
  const { len } = arrowSize(id, weight, scale);
  if (!len) return null;
  const u = (Math.max(weight, 1) * scale) / 100;
  const base: Pt = tip === 'end' ? [tipAt[0] - dir[0] * len, tipAt[1] - dir[1] * len] : tipAt;
  const at = (x: number, y: number): Pt => [base[0] + dir[0] * x - dir[1] * y, base[1] + dir[1] * x + dir[0] * y];
  if (id === 'simple') return polyPath([at(0, -2 * u), at(len, 0), at(0, 2 * u)], false);
  if (id === 'filled' || id === 'open') return polyPath([at(0, -2 * u), at(len, 0), at(0, 2 * u)], true);
  if (id === 'circle') { const c = at(len / 2, 0); return ellipsePath(c[0], c[1], len / 2, len / 2); }
  const h = id === 'square' ? len / 2 : 2.5 * u;
  return polyPath([at(0, -h), at(len, -h), at(len, h), at(0, h)], true);
}

function drawnSubs(src: Attrs): SubPath[] {
  let subs = decodeModel(src['data-fw-vector']);
  if (!subs || renderPath(subs) !== (src.d ?? '')) subs = parsePath(src.d);
  return applyCorners(subs);
}

export function strokeOutputs(src: Attrs, model: StrokeModel): Attrs[] {
  const wide = widthSpec(src['data-fw-width']);
  if (!wide && (!src.stroke || src.stroke === 'none')) return [];
  const base: Attrs = { ...src };
  for (const k of Object.keys(base)) if (k === 'id' || k.startsWith('data-fw-')) delete base[k];
  const aligned = !wide && !!src['data-fw-align'];
  const raw = parseFloat(src['stroke-width'] ?? '1') || 1;
  const weight = wide ? parseFloat(src['data-fw-weight'] ?? src['stroke-width'] ?? '2') || 2 : aligned ? parseFloat(src['data-fw-weight'] ?? '') || raw / 2 : raw;
  if (aligned) base['stroke-width'] = String(weight * 2);
  delete base['paint-order'];
  delete base['stroke-opacity'];
  delete base['stroke-dasharray'];
  delete base['stroke-dashoffset'];
  base.fill = 'none';
  if (wide) delete base['clip-path'];
  let dash = model.dash.length ? model.dash.slice() : (src['stroke-dasharray'] ?? '').split(/[\s,]+/).filter(part => part !== '').map(Number).filter(n => Number.isFinite(n) && n >= 0).slice(0, 16);
  if (dash.length % 2) dash = [...dash, ...dash];
  const period = dash.reduce((a, b) => a + b, 0);
  const out: Attrs[] = [];
  const push = (attrs: Attrs): void => { if (out.length < OUTPUT_LIMIT) out.push(attrs); };
  for (const sub of drawnSubs(src)) {
    if (sub.nodes.length < 2) continue;
    const list = pieces(sub);
    if (!list.length) continue;
    const open = !sub.closed;
    const first = list[0], last = list[list.length - 1];
    const sd = startDir(first), ed = endDir(last);
    const w0 = wide ? Math.max(1, widthAt(wide.points, 0, weight)) : weight, w1 = wide ? Math.max(1, widthAt(wide.points, 1, weight)) : weight;
    const head = open && model.tip === 'end' ? arrowSize(model.a0, w0, model.s0).trim : 0;
    const tail = open && model.tip === 'end' ? arrowSize(model.a1, w1, model.s1).trim : 0;
    if (wide) {
      const part = widePart(list, sub, wide, base, weight, dash, model.mode === 'align', head, tail);
      if (part) push(part);
    } else {
      const body = open ? trim(list, head, tail) : list;
      if (body.length) {
        if (model.mode === 'align' && period > 0) {
          const k = trackOf(list, sub.closed);
          const lo = open ? head : 0, hi = open ? k.total - tail : k.total;
          const runs = hi - lo > 1e-6 ? runBounds(k, lo, hi) : [];
          const spans = joinSpans(dashSpans(runs, dash, true), sub.closed, runs.length ? runs[0][0] : 0, k.total);
          if (spans.length) push({ ...base, d: formatPath(spans.map(([a, b]) => chain(extract(k, a, b)))) });
        } else {
          const attrs: Attrs = { ...base, d: formatPath(open ? [chain(body)] : [sub]) };
          if (dash.length && period > 0) attrs['stroke-dasharray'] = dash.map(num).join(' ');
          push(attrs);
        }
      }
    }
    if (!open) continue;
    const ends: { id: Arrow; at: Pt; dir: Pt; scale: number; weight: number }[] = [
      { id: model.a0, at: first.p0, dir: [-sd[0], -sd[1]], scale: model.s0, weight: w0 },
      { id: model.a1, at: last.p3, dir: ed, scale: model.s1, weight: w1 }
    ];
    for (const end of ends) {
      const shape = arrowShape(end.id, end.at, end.dir, end.weight, end.scale, model.tip);
      if (!shape) continue;
      const filled = end.id !== 'simple' && end.id !== 'open';
      const color = wide ? wide.color : base.stroke;
      const attrs: Attrs = { ...base, d: formatPath([shape]) };
      if (filled) {
        attrs.fill = color;
        attrs.stroke = 'none';
        for (const k of ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']) delete attrs[k];
      } else {
        attrs.stroke = color;
        if (wide) attrs['stroke-width'] = num(end.weight);
        attrs['stroke-linecap'] = 'butt';
        attrs['stroke-linejoin'] = 'miter';
      }
      push(attrs);
    }
  }
  return out;
}
