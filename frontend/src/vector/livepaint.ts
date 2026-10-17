import { applyCorners } from './corners';
import { insideSubs, regionPieces } from './cut';
import { decodeModel, formatPath, parsePath, pathBounds, type Pt, type SubPath } from './geometry';

/* Live Paint groups. The source paths stay editable; every painted face is stored as the set of sources that
   contain it (the region signature from fragmentPieces, one bit per source in paint order) plus a point inside it
   and its colour. When the sources change, each fill goes to the face with the same signature that holds its
   point, or the nearest such face; a fill whose face no longer exists is dropped. Faces are drawn as plain paths
   in the live container above the sources, whose own fills are set to none so their strokes act as edges. */

type Attrs = Record<string, string>;
export type LivePaintFill = [number, number, number, string];
export interface LivePaintSpec { v: 1; src: string[]; fills: LivePaintFill[]; of: string[]; sig: string }

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$|^rgba?\([0-9., %]{5,40}\)$/;
export const LIVE_PAINT_SOURCES = 30;
export const LIVE_PAINT_FILLS = 500;

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function readLivePaint(raw: string | undefined): LivePaintSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<LivePaintSpec>;
    const src = c.src, fills = c.fills, of = c.of;
    if (c.v !== 1 || !Array.isArray(src) || src.length < 2 || src.length > LIVE_PAINT_SOURCES || !src.every(id => typeof id === 'string' && ID.test(id)) || new Set(src).size !== src.length) return null;
    if (!Array.isArray(fills) || fills.length > LIVE_PAINT_FILLS || !fills.every(f => Array.isArray(f) && f.length === 4 && Number.isInteger(f[0]) && f[0] > 0 && Number.isFinite(f[1]) && Number.isFinite(f[2]) && typeof f[3] === 'string' && COLOR.test(f[3]))) return null;
    if (!Array.isArray(of) || of.length !== src.length || !of.every(v => typeof v === 'string' && v.length <= 64)) return null;
    if (typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, src, fills, of, sig: c.sig };
  } catch { return null; }
}

export function subsOf(attrs: Attrs): SubPath[] {
  const model = attrs['data-fw-vector'] ? decodeModel(attrs['data-fw-vector']) : null;
  return model ? applyCorners(model) : parsePath(attrs.d);
}

export const livePaintSig = (spec: Pick<LivePaintSpec, 'src' | 'fills'>, sources: Attrs[]): string =>
  hash(JSON.stringify(['livepaint', spec.src, spec.fills, ...sources.map(a => [a.d ?? '', a.transform ?? ''])]));

export function livePaintPieces(sources: Attrs[]): { subs: SubPath[]; sig: number }[] {
  return regionPieces(sources.map(subsOf));
}

const centre = (subs: SubPath[]): Pt => { const b = pathBounds(subs); return b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0]; };

/* Place every fill on its face; returns the fills that still have a face (with their point moved inside it) and
   one output path per face. */
export function livePaintOutputs(sources: Attrs[], fills: LivePaintFill[]): { fills: LivePaintFill[]; outputs: Attrs[] } {
  const pieces = livePaintPieces(sources);
  const taken = new Map<number, LivePaintFill>();
  for (const [sig, x, y, color] of fills) {
    const same = pieces.map((p, i) => ({ p, i })).filter(c => c.p.sig === sig);
    if (!same.length) continue;
    const inside = same.find(c => insideSubs(c.p.subs, [x, y]));
    const pick = inside ?? same.reduce((best, c) => { const a = centre(c.p.subs), b = centre(best.p.subs); return Math.hypot(a[0] - x, a[1] - y) < Math.hypot(b[0] - x, b[1] - y) ? c : best; });
    const at: Pt = inside ? [x, y] : centre(pick.p.subs);
    taken.set(pick.i, [sig, Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100, color]);
  }
  const kept = [...taken.entries()].sort((a, b) => a[0] - b[0]);
  return {
    fills: kept.map(([, f]) => f),
    outputs: kept.map(([i, f]) => ({ d: formatPath(pieces[i].subs), fill: f[3], stroke: 'none', 'fill-rule': 'evenodd' })),
  };
}

/* Object > Live Paint > Make: each face starts with the fill of the topmost source that contains it. */
export function initialFills(sources: Attrs[]): LivePaintFill[] {
  const out: LivePaintFill[] = [];
  for (const piece of livePaintPieces(sources)) {
    const top = 31 - Math.clz32(piece.sig);
    const fill = sources[top]?.fill;
    if (!fill || fill === 'none' || !COLOR.test(fill)) continue;
    const at = interiorPoint(piece.subs);
    if (at) out.push([piece.sig, Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100, fill]);
  }
  return out;
}

/* A point inside a face: the box centre when it is inside, otherwise a scan along the middle row. */
export function interiorPoint(subs: SubPath[]): Pt | null {
  const b = pathBounds(subs);
  if (!b) return null;
  const c: Pt = [b.x + b.w / 2, b.y + b.h / 2];
  if (insideSubs(subs, c)) return c;
  for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) for (let k = 1; k < 40; k++) { const p: Pt = [b.x + (b.w * k) / 40, b.y + b.h * fy]; if (insideSubs(subs, p)) return p; }
  return null;
}

export function paintFill(spec: LivePaintSpec, sources: Attrs[], p: Pt, color: string): LivePaintFill[] | null {
  const pieces = livePaintPieces(sources);
  let hit = -1;
  for (let i = pieces.length - 1; i >= 0; i--) if (insideSubs(pieces[i].subs, p)) { hit = i; break; }
  if (hit < 0) return null;
  const sig = pieces[hit].sig;
  const others = spec.fills.filter(f => !(f[0] === sig && insideSubs(pieces[hit].subs, [f[1], f[2]])));
  return [...others, [sig, Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, color]];
}
