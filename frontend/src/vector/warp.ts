import { applyCorners, renderPath } from './corners';
import { WARP_PRESETS, envelopeMap, remapSubs, warpMap, type WarpPreset } from './distort';
import { decodeModel, parsePath, pathBounds, type Box, type Pt, type SubPath } from './geometry';
import { geometryAttrs } from './store';

type Attrs = Record<string, string>;

export interface WarpSpec { v: 1; mode: 'warp' | 'top' | 'mesh'; style: WarpPreset; orient: 'h' | 'v'; bend: number; hd: number; vd: number; src: string[]; env: string; op: string[]; sig: string; rows?: number; cols?: number; mesh?: number[] }

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export const meshGrid = (rows: number, cols: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) out.push(j / cols, i / rows);
  return out.map(n => Math.round(n * 1e5) / 1e5);
};

export function meshMap(box: Box, rows: number, cols: number, mesh: number[]): (p: Pt) => Pt {
  const at = (i: number, j: number): Pt => { const k = (i * (cols + 1) + j) * 2; return [box.x + mesh[k] * box.w, box.y + mesh[k + 1] * box.h]; };
  return p => {
    const s = (p[0] - box.x) / Math.max(1e-6, box.w), t = (p[1] - box.y) / Math.max(1e-6, box.h);
    const j = Math.max(0, Math.min(cols - 1, Math.floor(s * cols))), i = Math.max(0, Math.min(rows - 1, Math.floor(t * rows)));
    const a = s * cols - j, b = t * rows - i;
    const p00 = at(i, j), p10 = at(i, j + 1), p01 = at(i + 1, j), p11 = at(i + 1, j + 1);
    const mix = (k: 0 | 1): number => (1 - a) * (1 - b) * p00[k] + a * (1 - b) * p10[k] + (1 - a) * b * p01[k] + a * b * p11[k];
    return [mix(0), mix(1)];
  };
}

export const warpIds = (s: Pick<WarpSpec, 'src' | 'env'>): string[] => (s.env ? [...s.src, s.env] : [...s.src]);

export function readWarp(raw: string | undefined): WarpSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<WarpSpec>;
    const meshed = c.mode === 'mesh';
    if (meshed ? !(Number.isInteger(c.rows) && finite(c.rows, 1, 50) && Number.isInteger(c.cols) && finite(c.cols, 1, 50) && Array.isArray(c.mesh) && c.mesh.length === (c.rows + 1) * (c.cols + 1) * 2 && c.mesh.every(n => finite(n, -10, 10))) : (c.rows !== undefined || c.cols !== undefined || c.mesh !== undefined)) return null;
    if (c.v !== 1 || (c.mode !== 'warp' && c.mode !== 'top' && !meshed) || !WARP_PRESETS.includes(c.style as WarpPreset) || (c.orient !== 'h' && c.orient !== 'v')
      || !finite(c.bend, -100, 100) || !finite(c.hd, -100, 100) || !finite(c.vd, -100, 100) || !Array.isArray(c.src) || !c.src.length || c.src.length > 16
      || !c.src.every(id => typeof id === 'string' && ID.test(id)) || typeof c.env !== 'string' || (c.env !== '' && !ID.test(c.env)) || (c.mode === 'top') !== (c.env !== '')
      || !Array.isArray(c.op) || c.op.length !== c.src.length + (c.env ? 1 : 0) || !c.op.every(o => typeof o === 'string' && (o === '' || finite(Number(o), 0, 1)))
      || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, mode: c.mode as WarpSpec['mode'], style: c.style as WarpPreset, orient: c.orient, bend: c.bend, hd: c.hd, vd: c.vd, src: c.src, env: c.env, op: c.op, sig: c.sig, ...(meshed ? { rows: c.rows, cols: c.cols, mesh: c.mesh } : {}) };
  } catch { return null; }
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (attrs: Attrs): string => JSON.stringify(Object.keys(attrs).filter(k => k !== 'id' && k !== 'opacity').sort().map(k => [k, attrs[k]]));

export const warpSig = (s: WarpSpec, sources: Attrs[], env: Attrs | null): string =>
  hash(JSON.stringify([s.mode, s.style, s.orient, s.bend, s.hd, s.vd, s.src, s.env, s.op, s.rows ?? 0, s.cols ?? 0, s.mesh ?? [], ...sources.map(fingerprint), env ? fingerprint(env) : '']));

function drawn(attrs: Attrs): SubPath[] {
  let subs = decodeModel(attrs['data-fw-vector']);
  if (!subs || renderPath(subs) !== (attrs.d ?? '')) subs = parsePath(attrs.d);
  return applyCorners(subs);
}

export function warpBox(sources: Attrs[]): Box | null {
  let box: Box | null = null;
  for (const subs of sources.map(drawn)) {
    const b = pathBounds(subs);
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return box;
}

export function meshFromWarp(sources: Attrs[], env: Attrs | null, spec: WarpSpec, rows: number, cols: number): number[] | null {
  const box = warpBox(sources);
  if (!box) return null;
  const f = spec.mode === 'top' ? (env ? envelopeMap(drawn(env), box) : null) : warpMap({ preset: spec.style, bend: spec.bend / 100, horizontal: spec.hd / 100, vertical: spec.vd / 100, orient: spec.orient }, box);
  if (!f) return null;
  const out: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const q = f([box.x + (box.w * j) / cols, box.y + (box.h * i) / rows]);
    out.push(Math.max(-10, Math.min(10, Math.round(((q[0] - box.x) / Math.max(1e-6, box.w)) * 1e5) / 1e5)), Math.max(-10, Math.min(10, Math.round(((q[1] - box.y) / Math.max(1e-6, box.h)) * 1e5) / 1e5)));
  }
  return out;
}

export function warpOutputs(sources: Attrs[], env: Attrs | null, spec: WarpSpec): Attrs[] {
  const items = sources.map(drawn);
  const box = warpBox(sources);
  if (!box) return [];
  const f = spec.mode === 'mesh' && spec.mesh && spec.rows && spec.cols ? meshMap(box, spec.rows, spec.cols, spec.mesh)
    : spec.mode === 'top' ? (env ? envelopeMap(drawn(env), box) : null) : warpMap({ preset: spec.style, bend: spec.bend / 100, horizontal: spec.hd / 100, vertical: spec.vd / 100, orient: spec.orient }, box);
  if (!f) return [];
  const scale = Math.max(box.w, box.h);
  return sources.map((attrs, i) => {
    const out: Attrs = { ...attrs };
    for (const k of Object.keys(out)) if (k === 'id' || k === 'opacity' || k.startsWith('data-fw-')) delete out[k];
    if (spec.op[i]) out.opacity = spec.op[i];
    return { ...out, ...geometryAttrs(remapSubs(items[i], f, scale)) };
  });
}

export function warpAttrs(nodes: Record<string, { attrs: Attrs } | undefined>, ids: string[], env: string, change: Pick<WarpSpec, 'style' | 'orient' | 'bend' | 'hd' | 'vd'>, grid?: { rows: number; cols: number }): { attr: string; outputs: Attrs[] } | null {
  const all = env ? [...ids, env] : ids;
  const attrs = all.map(id => nodes[id]?.attrs);
  if (attrs.some(a => !a) || !ids.length || ids.length > 16) return null;
  const spec: WarpSpec = { v: 1, mode: grid ? 'mesh' : env ? 'top' : 'warp', ...change, src: ids, env, op: attrs.map(a => a!.opacity ?? ''), sig: '00000000', ...(grid ? { rows: grid.rows, cols: grid.cols, mesh: meshGrid(grid.rows, grid.cols) } : {}) };
  const sources = attrs.slice(0, ids.length) as Attrs[], envAttrs = env ? (attrs[ids.length] as Attrs) : null;
  const outputs = warpOutputs(sources, envAttrs, spec);
  if (!outputs.length) return null;
  return { attr: JSON.stringify({ ...spec, sig: warpSig(spec, sources, envAttrs) }), outputs };
}
