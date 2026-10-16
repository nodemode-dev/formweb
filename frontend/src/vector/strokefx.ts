import { applyCorners, renderPath } from './corners';
import { bezierAt, decodeModel, dist, ellipsePath, formatPath, parsePath, polyPath, segments, splitBezier, type Anchor, type Pt, type SubPath } from './geometry';

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

function runsOf(list: Bz[], closed: boolean): Bz[][] {
  let order = list;
  if (closed) {
    const first = list.findIndex(s => s.corner);
    if (first < 0) return [list];
    order = [...list.slice(first + 1), ...list.slice(0, first + 1)];
  }
  const runs: Bz[][] = [];
  let current: Bz[] = [];
  for (const s of order) {
    current.push(s);
    if (s.corner) { runs.push(current); current = []; }
  }
  if (current.length) runs.push(current);
  return runs;
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
  if (!src.stroke || src.stroke === 'none') return [];
  const base: Attrs = { ...src };
  for (const k of Object.keys(base)) if (k === 'id' || k.startsWith('data-fw-')) delete base[k];
  if (src['data-fw-align']) { base['stroke-width'] = src['data-fw-weight'] ?? src['stroke-width'] ?? '1'; delete base['paint-order']; delete base['clip-path']; }
  delete base['stroke-opacity'];
  delete base['stroke-dasharray'];
  delete base['stroke-dashoffset'];
  base.fill = 'none';
  const weight = parseFloat(base['stroke-width'] ?? '1') || 1;
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
    const head = open && model.tip === 'end' ? arrowSize(model.a0, weight, model.s0).trim : 0;
    const tail = open && model.tip === 'end' ? arrowSize(model.a1, weight, model.s1).trim : 0;
    const body = open ? trim(list, head, tail) : list;
    if (body.length) {
      if (model.mode === 'align' && period > 0) {
        for (const run of runsOf(body, sub.closed)) {
          const total = run.reduce((a, s) => a + length(s), 0);
          if (total < 1e-6) continue;
          const count = Math.max(1, Math.round(total / period)), k = total / (count * period);
          const scaled = dash.map(v => v * k);
          push({ ...base, d: formatPath([chain(run)]), 'stroke-dasharray': scaled.map(num).join(' '), 'stroke-dashoffset': num(scaled[0] / 2) });
        }
      } else {
        const attrs: Attrs = { ...base, d: formatPath(open ? [chain(body)] : [sub]) };
        if (dash.length && period > 0) attrs['stroke-dasharray'] = dash.map(num).join(' ');
        push(attrs);
      }
    }
    if (!open) continue;
    const ends: { id: Arrow; at: Pt; dir: Pt; scale: number }[] = [
      { id: model.a0, at: first.p0, dir: [-sd[0], -sd[1]], scale: model.s0 },
      { id: model.a1, at: last.p3, dir: ed, scale: model.s1 }
    ];
    for (const end of ends) {
      const shape = arrowShape(end.id, end.at, end.dir, weight, end.scale, model.tip);
      if (!shape) continue;
      const filled = end.id !== 'simple' && end.id !== 'open';
      const attrs: Attrs = { ...base, d: formatPath([shape]) };
      if (filled) {
        attrs.fill = base.stroke;
        attrs.stroke = 'none';
        for (const k of ['stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit']) delete attrs[k];
      } else {
        attrs['stroke-linecap'] = 'butt';
        attrs['stroke-linejoin'] = 'miter';
      }
      push(attrs);
    }
  }
  return out;
}
