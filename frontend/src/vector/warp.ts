import { applyCorners, renderPath } from './corners';
import { WARP_PRESETS, envelopeMap, remapSubs, warpMap, type WarpPreset } from './distort';
import { decodeModel, parsePath, pathBounds, type Box, type SubPath } from './geometry';
import { geometryAttrs } from './store';

type Attrs = Record<string, string>;

export interface WarpSpec { v: 1; mode: 'warp' | 'top'; style: WarpPreset; orient: 'h' | 'v'; bend: number; hd: number; vd: number; src: string[]; env: string; op: string[]; sig: string }

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export const warpIds = (s: Pick<WarpSpec, 'src' | 'env'>): string[] => (s.env ? [...s.src, s.env] : [...s.src]);

export function readWarp(raw: string | undefined): WarpSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<WarpSpec>;
    if (c.v !== 1 || (c.mode !== 'warp' && c.mode !== 'top') || !WARP_PRESETS.includes(c.style as WarpPreset) || (c.orient !== 'h' && c.orient !== 'v')
      || !finite(c.bend, -100, 100) || !finite(c.hd, -100, 100) || !finite(c.vd, -100, 100) || !Array.isArray(c.src) || !c.src.length || c.src.length > 16
      || !c.src.every(id => typeof id === 'string' && ID.test(id)) || typeof c.env !== 'string' || (c.env !== '' && !ID.test(c.env)) || (c.mode === 'top') !== (c.env !== '')
      || !Array.isArray(c.op) || c.op.length !== c.src.length + (c.env ? 1 : 0) || !c.op.every(o => typeof o === 'string' && (o === '' || finite(Number(o), 0, 1)))
      || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, mode: c.mode, style: c.style as WarpPreset, orient: c.orient, bend: c.bend, hd: c.hd, vd: c.vd, src: c.src, env: c.env, op: c.op, sig: c.sig };
  } catch { return null; }
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (attrs: Attrs): string => JSON.stringify(Object.keys(attrs).filter(k => k !== 'id' && k !== 'opacity').sort().map(k => [k, attrs[k]]));

export const warpSig = (s: WarpSpec, sources: Attrs[], env: Attrs | null): string =>
  hash(JSON.stringify([s.mode, s.style, s.orient, s.bend, s.hd, s.vd, s.src, s.env, s.op, ...sources.map(fingerprint), env ? fingerprint(env) : '']));

function drawn(attrs: Attrs): SubPath[] {
  let subs = decodeModel(attrs['data-fw-vector']);
  if (!subs || renderPath(subs) !== (attrs.d ?? '')) subs = parsePath(attrs.d);
  return applyCorners(subs);
}

export function warpOutputs(sources: Attrs[], env: Attrs | null, spec: WarpSpec): Attrs[] {
  const items = sources.map(drawn);
  let box: Box | null = null;
  for (const subs of items) {
    const b = pathBounds(subs);
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  if (!box) return [];
  const f = spec.mode === 'top' ? (env ? envelopeMap(drawn(env), box) : null) : warpMap({ preset: spec.style, bend: spec.bend / 100, horizontal: spec.hd / 100, vertical: spec.vd / 100, orient: spec.orient }, box);
  if (!f) return [];
  const scale = Math.max(box.w, box.h);
  return sources.map((attrs, i) => {
    const out: Attrs = { ...attrs };
    for (const k of Object.keys(out)) if (k === 'id' || k === 'opacity' || k.startsWith('data-fw-')) delete out[k];
    if (spec.op[i]) out.opacity = spec.op[i];
    return { ...out, ...geometryAttrs(remapSubs(items[i], f, scale)) };
  });
}

export function warpAttrs(nodes: Record<string, { attrs: Attrs } | undefined>, ids: string[], env: string, change: Pick<WarpSpec, 'style' | 'orient' | 'bend' | 'hd' | 'vd'>): { attr: string; outputs: Attrs[] } | null {
  const all = env ? [...ids, env] : ids;
  const attrs = all.map(id => nodes[id]?.attrs);
  if (attrs.some(a => !a) || !ids.length || ids.length > 16) return null;
  const spec: WarpSpec = { v: 1, mode: env ? 'top' : 'warp', ...change, src: ids, env, op: attrs.map(a => a!.opacity ?? ''), sig: '00000000' };
  const sources = attrs.slice(0, ids.length) as Attrs[], envAttrs = env ? (attrs[ids.length] as Attrs) : null;
  const outputs = warpOutputs(sources, envAttrs, spec);
  if (!outputs.length) return null;
  return { attr: JSON.stringify({ ...spec, sig: warpSig(spec, sources, envAttrs) }), outputs };
}
