import { edgePieces } from './boolean';
import { applyCorners } from './corners';
import { insideSubs, regionPieces } from './cut';
import { flattenSub } from './edit';
import { decodeModel, formatPath, parsePath, pathBounds, type Pt, type SubPath } from './geometry';

/* Live Paint groups. The source paths stay editable; every painted face is stored as the set of sources that
   contain it (the region signature from fragmentPieces, one bit per source in paint order) plus a point inside it
   and its colour. When the sources change, each fill goes to the face with the same signature that holds its
   point, or the nearest such face; a fill whose face no longer exists is dropped. Faces are drawn as plain paths
   in the live container above the sources, whose own fills are set to none so their strokes act as edges. */

type Attrs = Record<string, string>;
export type LivePaintFill = [number, number, number, string];
/* A painted edge: the source it lies on, the signature of the other sources around it, a point on it, its colour
   and width. Once any edge is painted the group keeps every edge stroke itself (`edges`), the sources' own
   strokes are set to none and kept in `os` ("colour width") for Release. */
export type LivePaintEdge = [number, number, number, number, string, number];
export interface LivePaintSpec { v: 1; src: string[]; fills: LivePaintFill[]; of: string[]; sig: string; edges?: LivePaintEdge[]; os?: string[] }
export const LIVE_PAINT_EDGES = 2000;

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
    const edges = c.edges, os = c.os;
    if (edges !== undefined && (!Array.isArray(edges) || edges.length > LIVE_PAINT_EDGES || !edges.every(e => Array.isArray(e) && e.length === 6 && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < src.length && Number.isInteger(e[1]) && e[1] >= 0 && Number.isFinite(e[2]) && Number.isFinite(e[3]) && typeof e[4] === 'string' && COLOR.test(e[4]) && Number.isFinite(e[5]) && e[5] > 0 && e[5] <= 1000))) return null;
    if (os !== undefined && (!Array.isArray(os) || os.length !== src.length || !os.every(v => typeof v === 'string' && v.length <= 64))) return null;
    return { v: 1, src, fills, of, sig: c.sig, ...(edges ? { edges } : {}), ...(os ? { os } : {}) };
  } catch { return null; }
}

export function subsOf(attrs: Attrs): SubPath[] {
  const model = attrs['data-fw-vector'] ? decodeModel(attrs['data-fw-vector']) : null;
  return model ? applyCorners(model) : parsePath(attrs.d);
}

export const livePaintSig = (spec: Pick<LivePaintSpec, 'src' | 'fills' | 'edges'>, sources: Attrs[]): string =>
  hash(JSON.stringify(['livepaint', spec.src, spec.fills, ...sources.map(a => [a.d ?? '', a.transform ?? '']), ...(spec.edges ? [spec.edges] : [])]));

export function livePaintPieces(sources: Attrs[]): { subs: SubPath[]; sig: number }[] {
  return regionPieces(sources.map(subsOf));
}

const centre = (subs: SubPath[]): Pt => { const b = pathBounds(subs); return b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0]; };

/* Place every fill on its face; returns the fills that still have a face (with their point moved inside it) and
   one output path per face. */
export function livePaintOutputs(sources: Attrs[], fills: LivePaintFill[], edges?: LivePaintEdge[]): { fills: LivePaintFill[]; outputs: Attrs[]; edges?: LivePaintEdge[] } {
  const faces = faceOutputs(sources, fills);
  if (!edges) return faces;
  const placed = edgeOutputs(sources, edges);
  return { fills: faces.fills, outputs: [...faces.outputs, ...placed.outputs], edges: placed.edges };
}

const round = (v: number): number => Math.round(v * 100) / 100;

function edgeLines(subs: SubPath[]): Pt[][] { return subs.map(s => { const pts = flattenSub(s, 0.4); return s.closed && pts.length ? [...pts, pts[0]] : pts; }); }

function distToEdge(subs: SubPath[], p: Pt): number {
  let best = Infinity;
  for (const pts of edgeLines(subs)) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

/* The point halfway along an edge, kept in the spec to tell apart edges with the same two faces. */
function edgeMiddle(subs: SubPath[]): Pt | null {
  const pts = edgeLines(subs)[0] ?? [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (walked + l >= total / 2 && l > 0) { const t = (total / 2 - walked) / l; return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])]; }
    walked += l;
  }
  return pts[0] ?? null;
}

export function livePaintEdgePieces(sources: Attrs[]): { object: number; other: number; subs: SubPath[] }[] {
  return edgePieces(sources.map(subsOf));
}

/* Each stored edge goes to the piece with the same source and faces that lies nearest its point. */
function matchEdges(pieces: { object: number; other: number; subs: SubPath[] }[], edges: LivePaintEdge[]): Map<number, LivePaintEdge> {
  const taken = new Map<number, LivePaintEdge>();
  for (const e of edges) {
    let pick = -1, best = Infinity;
    pieces.forEach((pc, i) => { if (pc.object !== e[0] || pc.other !== e[1]) return; const d = distToEdge(pc.subs, [e[2], e[3]]); if (d < best) { best = d; pick = i; } });
    if (pick >= 0) taken.set(pick, e);
  }
  return taken;
}

function edgeOutputs(sources: Attrs[], edges: LivePaintEdge[]): { edges: LivePaintEdge[]; outputs: Attrs[] } {
  const pieces = livePaintEdgePieces(sources);
  const kept = [...matchEdges(pieces, edges).entries()].sort((a, b) => a[0] - b[0]).map(([i, e]) => {
    const mid = edgeMiddle(pieces[i].subs) ?? [e[2], e[3]];
    return { i, e: [e[0], e[1], round(mid[0]), round(mid[1]), e[4], e[5]] as LivePaintEdge };
  });
  return { edges: kept.map(k => k.e), outputs: kept.map(({ i, e }) => ({ d: formatPath(pieces[i].subs), fill: 'none', stroke: e[4], 'stroke-width': String(e[5]), 'stroke-linejoin': 'round' })) };
}

/* A source's original stroke as kept in `os`, and the attributes that put it back. Without `os` nothing changes. */
export const strokeMemo = (a: Attrs): string => `${a.stroke ?? ''} ${a['stroke-width'] ?? ''}`.slice(0, 64);
export function livePaintStroke(memo: string | undefined): Record<string, string | null> {
  if (memo === undefined) return {};
  const [stroke, width] = memo.split(' ');
  return { stroke: stroke || null, 'stroke-width': width || null };
}

/* The edges a group starts with when its first edge is painted: every edge carries its source's stroke. */
export function initialEdges(sources: Attrs[]): LivePaintEdge[] {
  const out: LivePaintEdge[] = [];
  for (const pc of livePaintEdgePieces(sources)) {
    const a = sources[pc.object];
    const stroke = a?.stroke;
    if (!stroke || stroke === 'none' || !COLOR.test(stroke)) continue;
    const width = parseFloat(a['stroke-width'] ?? '1');
    const mid = edgeMiddle(pc.subs);
    if (mid) out.push([pc.object, pc.other, round(mid[0]), round(mid[1]), stroke, Number.isFinite(width) && width > 0 ? Math.min(1000, width) : 1]);
  }
  return out;
}

/* Live Paint Bucket on an edge (Shift): the edge nearest the point, within `tol`, takes the colour and width, or
   loses its stroke when the colour is none. Returns null when no edge is that close. */
export function paintEdge(spec: LivePaintSpec, sources: Attrs[], p: Pt, color: string, width: number, tol: number): LivePaintEdge[] | null {
  const pieces = livePaintEdgePieces(sources);
  let hit = -1, best = tol;
  pieces.forEach((pc, i) => { const d = distToEdge(pc.subs, p); if (d <= best) { best = d; hit = i; } });
  if (hit < 0) return null;
  const base = spec.edges ?? initialEdges(sources);
  const matched = matchEdges(pieces, base);
  const others = [...matched.entries()].filter(([i]) => i !== hit).map(([, e]) => e);
  if (color === 'none') return others;
  const mid = edgeMiddle(pieces[hit].subs) ?? p;
  return [...others, [pieces[hit].object, pieces[hit].other, round(mid[0]), round(mid[1]), color, Math.max(0.25, Math.min(1000, width))]];
}

function faceOutputs(sources: Attrs[], fills: LivePaintFill[]): { fills: LivePaintFill[]; outputs: Attrs[] } {
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
