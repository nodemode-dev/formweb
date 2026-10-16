import { applyMat } from './arrange';
import { applyCorners, renderPath } from './corners';
import { compose, rotation, scaling, subdivide, translation } from './distort';
import { flattenSub } from './edit';
import { decodeModel, parsePath, pathBounds, type Anchor, type Box, type Pt, type SubPath } from './geometry';
import { geometryAttrs } from './store';

type Attrs = Record<string, string>;

export type BrushKind = 'calligraphic' | 'scatter' | 'art' | 'pattern' | 'bristle';
export type BristleShape = 'round' | 'flat' | 'fan' | 'angle';
export interface BrushSettings {
  v: 1; kind: BrushKind; art: string; angle: number; roundness: number; size: number; scale: number; spacing: number; scatter: number; rotation: number;
  rotmode: 'fixed' | 'random'; rotrel: 'page' | 'path'; seed: number; stretch: 0 | 1; flip: 0 | 1; flipv: 0 | 1; fit: 'stretch' | 'space';
  bshape: BristleShape; blen: number; bdens: number; bthick: number; bopac: number; bstiff: number;
}

export const needsArt = (kind: BrushKind): boolean => kind !== 'calligraphic' && kind !== 'bristle';
export interface BrushSpec extends BrushSettings { src: string; color: string; weight: number; sig: string }

export const BRUSH_LIMIT = 3000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const inRange = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const whole = (v: unknown, lo: number, hi: number): v is number => inRange(v, lo, hi) && Number.isInteger(v);
const flag = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const rad = (d: number): number => (d * Math.PI) / 180;
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function defaultBrush(kind: BrushKind): BrushSettings {
  return { v: 1, kind, art: '', angle: 45, roundness: 30, size: kind === 'bristle' ? 24 : 8, scale: 100, spacing: kind === 'pattern' ? 0 : 20, scatter: 0, rotation: 0, rotmode: 'fixed', rotrel: 'path', seed: 7, stretch: 1, flip: 0, flipv: 0, fit: 'stretch',
    bshape: 'round', blen: 80, bdens: 60, bthick: 1, bopac: 55, bstiff: 70 };
}

function settingsOf(c: Record<string, unknown>): BrushSettings | null {
  const kind = c.kind;
  if (c.v !== 1 || (kind !== 'calligraphic' && kind !== 'scatter' && kind !== 'art' && kind !== 'pattern' && kind !== 'bristle')) return null;
  const d = defaultBrush(kind);
  const bshape = c.bshape ?? d.bshape, blen = c.blen ?? d.blen, bdens = c.bdens ?? d.bdens, bthick = c.bthick ?? d.bthick, bopac = c.bopac ?? d.bopac, bstiff = c.bstiff ?? d.bstiff;
  if ((bshape !== 'round' && bshape !== 'flat' && bshape !== 'fan' && bshape !== 'angle') || !inRange(blen, 5, 100) || !inRange(bdens, 1, 100) || !inRange(bthick, 0.1, 50) || !inRange(bopac, 5, 100) || !inRange(bstiff, 0, 100)) return null;
  if (typeof c.art !== 'string' || (c.art !== '' && !ID.test(c.art))) return null;
  if (!inRange(c.angle, -180, 180) || !inRange(c.roundness, 1, 100) || !inRange(c.size, 0.1, 2000) || !inRange(c.scale, 1, 1000) || !inRange(c.spacing, 0, 1000) || !inRange(c.scatter, 0, 500)
    || !inRange(c.rotation, -180, 180) || !whole(c.seed, 1, 99999) || !flag(c.stretch) || !flag(c.flip) || !flag(c.flipv)) return null;
  if ((c.rotmode !== 'fixed' && c.rotmode !== 'random') || (c.rotrel !== 'page' && c.rotrel !== 'path') || (c.fit !== 'stretch' && c.fit !== 'space')) return null;
  return { v: 1, kind, art: c.art, angle: c.angle, roundness: c.roundness, size: c.size, scale: c.scale, spacing: c.spacing, scatter: c.scatter, rotation: c.rotation, rotmode: c.rotmode, rotrel: c.rotrel, seed: c.seed, stretch: c.stretch, flip: c.flip, flipv: c.flipv, fit: c.fit, bshape, blen, bdens, bthick, bopac, bstiff };
}

export function readBrushDef(raw: string | undefined): BrushSettings | null {
  if (!raw) return null;
  try { return settingsOf(JSON.parse(raw) as Record<string, unknown>); } catch { return null; }
}

export function readBrush(raw: string | undefined): BrushSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Record<string, unknown>;
    const s = settingsOf(c);
    if (!s || typeof c.src !== 'string' || !ID.test(c.src) || typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/.test(c.color) || !inRange(c.weight, 0, 10000)
      || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig) || (needsArt(s.kind) && !s.art)) return null;
    return { ...s, src: c.src, color: c.color, weight: c.weight, sig: c.sig };
  } catch { return null; }
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (attrs: Attrs): string => JSON.stringify(Object.keys(attrs).filter(k => k !== 'id').sort().map(k => [k, attrs[k]]));

export function brushSig(spec: Omit<BrushSpec, 'sig'> & { sig?: string }, src: Attrs, art: Attrs[]): string {
  return hash(JSON.stringify([{ ...spec, weight: 0, sig: '' },src.d ?? '', src['data-fw-vector'] ?? '', ...art.map(fingerprint)]));
}

export interface Spine { pts: Pt[]; lens: number[]; total: number; closed: boolean }

export function spineOf(sub: SubPath): Spine | null {
  const raw = flattenSub(sub, 0.2);
  const pts: Pt[] = [];
  for (const p of sub.closed && raw.length ? [...raw, raw[0]] : raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) pts.push(p);
  }
  if (pts.length < 2) return null;
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, lens, total: lens[lens.length - 1], closed: sub.closed };
}

export function spinePoint(sp: Spine, s: number): Pt {
  let lo = 0, hi = sp.pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sp.lens[mid] <= s) lo = mid; else hi = mid - 1;
  }
  const a = sp.pts[lo], b = sp.pts[lo + 1], span = sp.lens[lo + 1] - sp.lens[lo] || 1, k = (s - sp.lens[lo]) / span;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

export function spineTangent(sp: Spine, s: number): Pt {
  const d = Math.max(0.25, Math.min(2, sp.total / 200));
  const p0 = spinePoint(sp, s - d), p1 = spinePoint(sp, s + d);
  const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return l < 1e-9 ? [1, 0] : [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
}

const corner = (p: Pt): Anchor => ({ x: p[0], y: p[1], in: null, out: null, kind: 'corner' });

function nibPoint(spec: BrushSettings, c: Pt, psi: number): Pt {
  const a = spec.size / 2, b = Math.max(0.02, (a * spec.roundness) / 100), th = rad(spec.angle);
  const local = psi - th;
  const u = Math.atan2(b * Math.sin(local), a * Math.cos(local));
  const x = a * Math.cos(u), y = b * Math.sin(u);
  return [c[0] + x * Math.cos(th) - y * Math.sin(th), c[1] + x * Math.sin(th) + y * Math.cos(th)];
}

const wrap = (a: number): number => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI; return d; };

function calligraphy(subs: SubPath[], spec: BrushSettings): SubPath[] {
  const out: SubPath[] = [];
  for (const sub of subs) {
    const sp = spineOf(sub);
    if (!sp) continue;
    const pts = sp.pts, m = pts.length, segs = m - 1;
    const dirs: number[] = [];
    for (let i = 0; i < segs; i++) dirs.push(Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) + Math.PI / 2);
    const side = (flip: number): Pt[] => {
      const list: Pt[] = [];
      for (let i = 0; i < segs; i++) {
        const psi = dirs[i] + flip;
        list.push(nibPoint(spec, pts[i], psi), nibPoint(spec, pts[i + 1], psi));
        if (i < segs - 1 || sub.closed) {
          const turn = wrap(dirs[(i + 1) % segs] - dirs[i]);
          if ((flip === 0 && turn < 0) || (flip !== 0 && turn > 0)) {
            const steps = Math.ceil(Math.abs(turn) / rad(12));
            for (let k = 1; k < steps; k++) list.push(nibPoint(spec, pts[i + 1], psi + (turn * k) / steps));
          }
        }
      }
      return list;
    };
    const left = side(0), right = side(Math.PI);
    if (sub.closed) {
      out.push({ closed: true, nodes: left.map(corner) }, { closed: true, nodes: right.slice().reverse().map(corner) });
      continue;
    }
    const cap = (at: Pt, from: number): Pt[] => Array.from({ length: 11 }, (_, k) => nibPoint(spec, at, from - (Math.PI * (k + 1)) / 12));
    out.push({ closed: true, nodes: [...left, ...cap(pts[m - 1], dirs[segs - 1]), ...right.slice().reverse(), ...cap(pts[0], dirs[0] + Math.PI)].map(corner) });
  }
  return out;
}

interface Part { attrs: Attrs; subs: SubPath[] }

function drawn(attrs: Attrs): SubPath[] {
  let subs = decodeModel(attrs['data-fw-vector']);
  if (!subs || renderPath(subs) !== (attrs.d ?? '')) subs = parsePath(attrs.d);
  return applyCorners(subs);
}

function artAttrs(attrs: Attrs, k: number): Attrs {
  const out: Attrs = { ...attrs };
  for (const name of Object.keys(out)) if (name === 'id' || name.startsWith('data-fw-')) delete out[name];
  if (attrs['data-fw-align']) {
    out['stroke-width'] = attrs['data-fw-weight'] ?? attrs['stroke-width'] ?? '1';
    delete out['paint-order'];
  }
  delete out['clip-path'];
  delete out.mask;
  if (out['stroke-width'] !== undefined && out.stroke && out.stroke !== 'none') out['stroke-width'] = String(round2((parseFloat(out['stroke-width']) || 1) * k));
  return out;
}

function boxOf(parts: Part[]): Box | null {
  let box: Box | null = null;
  for (const part of parts) {
    const b = pathBounds(part.subs);
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return box;
}

function warp(subs: SubPath[], step: number, f: (p: Pt) => Pt): SubPath[] {
  const dense = subdivide(subs, step);
  for (const sub of dense) {
    for (const a of sub.nodes) {
      const moved = f([a.x, a.y]);
      a.x = moved[0];
      a.y = moved[1];
      if (a.in) a.in = f(a.in);
      if (a.out) a.out = f(a.out);
    }
  }
  return dense;
}

function along(parts: Part[], box: Box, sp: Spine, s0: number, len: number, thick: number, spec: BrushSettings, divisions: number, out: Attrs[]): void {
  const width = Math.max(box.w, 0.01), mid = box.y + box.h / 2, sign = spec.flipv === 1 ? -1 : 1;
  const f = (p: Pt): Pt => {
    let u = (p[0] - box.x) / width;
    if (spec.flip === 1) u = 1 - u;
    const at = spinePoint(sp, s0 + u * len), t = spineTangent(sp, s0 + u * len), v = (p[1] - mid) * thick * sign;
    return [at[0] - t[1] * v, at[1] + t[0] * v];
  };
  const step = Math.max(0.5, width / divisions);
  for (const part of parts) {
    if (out.length >= BRUSH_LIMIT) return;
    out.push({ ...artAttrs(part.attrs, thick), ...geometryAttrs(warp(part.subs, step, f)) });
  }
}

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

function bristles(subs: SubPath[], spec: BrushSettings & { color: string }, out: Attrs[]): void {
  const rand = mulberry(spec.seed);
  const half = spec.size / 2;
  const count = Math.max(2, Math.min(200, Math.round((spec.size * spec.bdens) / 100 / Math.max(0.5, spec.bthick))));
  const slack = 1 - spec.blen / 100, wobble = ((100 - spec.bstiff) / 100) * spec.size * 0.3;
  for (const sub of subs) {
    const sp = spineOf(sub);
    if (!sp) continue;
    const pts = Math.max(8, Math.min(160, Math.round(sp.total / 5)));
    for (let k = 0; k < count && out.length < BRUSH_LIMIT; k++) {
      const u = (k / (count - 1)) * 2 - 1;
      const r = [rand(), rand(), rand(), rand(), rand()];
      const jitter = (r[0] * 2 - 1) * 0.5 * (spec.size / count), phase = r[1] * 2 * Math.PI, freq = 1 + r[2] * 2;
      const cut = slack * (0.4 + 0.6 * r[3]);
      let head = cut * r[4], tail = cut - head;
      if (spec.bshape === 'round') { head += u * u * 0.35; tail += u * u * 0.35; }
      else if (spec.bshape === 'angle') head += ((u + 1) / 2) * 0.3;
      const over = head + tail;
      if (over > 0.9) { head = (head / over) * 0.9; tail = (tail / over) * 0.9; }
      const s0 = head * sp.total, s1 = (1 - tail) * sp.total;
      const nodes: Anchor[] = [];
      for (let i = 0; i <= pts; i++) {
        const s = s0 + ((s1 - s0) * i) / pts, g = s / sp.total;
        const at = spinePoint(sp, s), t = spineTangent(sp, s);
        const off = (u * half + jitter) * (spec.bshape === 'fan' ? 0.35 + 0.65 * g : 1) + wobble * Math.sin(phase + freq * 2 * Math.PI * g);
        nodes.push(corner([at[0] - t[1] * off, at[1] + t[0] * off]));
      }
      out.push({ d: renderPath([{ closed: false, nodes }]), fill: 'none', stroke: spec.color, 'stroke-width': String(round2(spec.bthick)), 'stroke-opacity': String(round2(spec.bopac / 100)), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    }
  }
}

export function brushOutputs(src: Attrs, art: Attrs[], spec: BrushSettings & { color: string }): Attrs[] {
  const subs = drawn(src);
  const out: Attrs[] = [];
  if (spec.kind === 'bristle') { bristles(subs, spec, out); return out; }
  if (spec.kind === 'calligraphic') {
    const outline = calligraphy(subs, spec);
    if (outline.length) out.push({ ...geometryAttrs(outline), fill: spec.color, stroke: 'none', 'fill-rule': 'nonzero' });
    return out;
  }
  const parts: Part[] = art.map(attrs => ({ attrs, subs: drawn(attrs) })).filter(part => part.subs.length);
  const box = boxOf(parts);
  if (!box || (box.w < 0.01 && box.h < 0.01)) return out;
  const sc = spec.scale / 100, width = Math.max(box.w, 0.01);
  for (const sub of subs) {
    const sp = spineOf(sub);
    if (!sp) continue;
    if (spec.kind === 'art') {
      along(parts, box, sp, 0, spec.stretch === 1 ? sp.total : width * sc, sc, spec, 80, out);
    } else if (spec.kind === 'pattern') {
      const tile = width * sc, gap0 = (tile * spec.spacing) / 100;
      let count: number, length: number, pitch: number;
      if (spec.fit === 'stretch') { count = Math.max(1, Math.round(sp.total / tile)); length = sp.total / count; pitch = length; }
      else { count = Math.max(1, Math.floor((sp.total + gap0) / (tile + gap0))); length = tile; pitch = count > 1 ? (sp.total - count * tile) / (count - 1) + tile : tile; }
      for (let i = 0; i < count && out.length < BRUSH_LIMIT; i++) along(parts, box, sp, i * pitch, length, sc, spec, count > 24 ? 10 : 36, out);
    } else {
      const ext = Math.max(0.5, (spec.rotrel === 'path' && spec.rotmode === 'fixed' ? width : Math.max(box.w, box.h)) * sc);
      const step = Math.max(0.5, ext * (1 + spec.spacing / 100));
      const rand = mulberry(spec.seed);
      const centre: Pt = [box.x + box.w / 2, box.y + box.h / 2];
      let count = Math.floor(sp.total / step + 1e-9) + 1;
      if (sp.closed && count > 1 && sp.total - (count - 1) * step < step * 0.5) count -= 1;
      for (let k = 0; k < count && out.length < BRUSH_LIMIT; k++) {
        const s = k * step, at = spinePoint(sp, s), t = spineTangent(sp, s);
        const r1 = rand(), r2 = rand();
        const perp = (r1 * 2 - 1) * (spec.scatter / 100) * ext;
        const angle = (spec.rotmode === 'random' ? (r2 * 2 - 1) * Math.abs(spec.rotation) : spec.rotation) + (spec.rotrel === 'path' ? (Math.atan2(t[1], t[0]) * 180) / Math.PI : 0);
        const m = compose(translation(at[0] - t[1] * perp, at[1] + t[0] * perp), compose(rotation(angle, 0, 0), compose(scaling(sc, sc, 0, 0), translation(-centre[0], -centre[1]))));
        for (const part of parts) {
          if (out.length >= BRUSH_LIMIT) break;
          out.push({ ...artAttrs(part.attrs, sc), ...geometryAttrs(applyMat(part.subs, m)) });
        }
      }
    }
  }
  return out;
}
