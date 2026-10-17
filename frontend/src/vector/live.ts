import type { Command, Site, SiteNode } from '../types';
import { applyMat } from './arrange';
import { pathfinder, type PathfinderOp } from './boolean';
import { applyCorners, renderPath } from './corners';
import { brushOutputs, brushSig, needsArt, readBrush, spineOf, spinePoint, spineTangent } from './brush';
import { blendSub, compose, matchSubs, repeatMatrices, rotation, translation, type Mat } from './distort';
import { freeformGradient, freeformOutputs, freeformSamples, freeformSig, readFreeform } from './freeform';
import { livePaintOutputs, livePaintSig, livePaintStroke, readLivePaint, type LivePaintEdge, type LivePaintFill } from './livepaint';
import { decodeModel, dist, parsePath, pathBounds, type Box, type Pt, type SubPath } from './geometry';
import { colorToHex } from './gradient';
import { freshId, geometryAttrs, moveNode, paintOf, parentOf, refOf, removeNode, updateAttrs } from './store';
import { readStroke, strokeOutputs, strokeSig, strokeUnder, widthSpec } from './strokefx';
import { readWarp, warpIds, warpOutputs, warpSig } from './warp';

export type BlendMode = 'color' | 'steps' | 'distance';
export type RepeatKind = 'radial' | 'grid' | 'mirror';
type Attrs = Record<string, string>;

export interface BlendSpec { v: 1; a: string; b: string; mid: string[]; spine: string; mode: BlendMode; steps: number; distance: number; orient: 'page' | 'path'; sig: string; home?: number[] }
export type CompoundOp = 'unite' | 'minus-front' | 'intersect' | 'exclude' | 'divide' | 'outline';
export interface CompoundSpec { v: 1; op: CompoundOp; src: string[]; sig: string }
export interface EffectSpec { v: 1; fx: 'pathfinder'; op: PathfinderOp; sig: string }
export type LiveKind = 'blend' | 'repeat' | 'brush' | 'stroke' | 'compound' | 'warp' | 'effect' | 'freeform' | 'livepaint';
export const PF_OPS: PathfinderOp[] = ['unite', 'minus-front', 'intersect', 'exclude', 'divide', 'trim', 'merge', 'crop', 'minus-back', 'outline'];
export const blendIds =(s: Pick<BlendSpec, 'a' | 'b' | 'mid'>): string[] => [s.a, ...s.mid, s.b];
export interface RepeatSpec { v: 1; kind: RepeatKind; src: string[]; count: number; radius: number; cols: number; rows: number; gx: number; gy: number; angle: number; brick: 'none' | 'row' | 'column'; offset: number; sig: string }

const COPY_LIMIT = 3000;
const BLEND_LIMIT = 3000;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const whole = (v: unknown, lo: number, hi: number): v is number => finite(v, lo, hi) && Number.isInteger(v);

export function readBlend(raw: string | undefined): BlendSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<BlendSpec>;
    const mid = c.mid === undefined ? [] : c.mid, spine = c.spine === undefined ? '' : c.spine;
    if (c.v !== 1 || typeof c.a !== 'string' || typeof c.b !== 'string' || !ID.test(c.a) || !ID.test(c.b) || !Array.isArray(mid) || mid.length > 14 || !mid.every(id => typeof id === 'string' && ID.test(id))
      || typeof spine !== 'string' || (spine !== '' && !ID.test(spine)) || new Set([c.a, c.b, ...mid, ...(spine ? [spine] : [])]).size !== mid.length + 2 + (spine ? 1 : 0)
      || (c.mode !== 'color' && c.mode !== 'steps' && c.mode !== 'distance') || !whole(c.steps, 1, 500) || !finite(c.distance, 0.5, 10000) || (c.orient !== 'page' && c.orient !== 'path')
      || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    const home = Array.isArray(c.home) && c.home.length === 4 && c.home.every(n => finite(n, -1e6, 1e6)) ? c.home : undefined;
    return { v: 1, a: c.a, b: c.b, mid, spine, mode: c.mode, steps: c.steps, distance: c.distance, orient: c.orient, sig: c.sig, ...(home ? { home } : {}) };
  } catch { return null; }
}

export function readRepeat(raw: string | undefined): RepeatSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<RepeatSpec>;
    if (c.v !== 1 || !Array.isArray(c.src) || !c.src.length || c.src.length > 16 || !c.src.every(id => typeof id === 'string' && ID.test(id)) || (c.kind !== 'radial' && c.kind !== 'grid' && c.kind !== 'mirror')
      || !whole(c.count, 2, 120) || !whole(c.cols, 1, 60) || !whole(c.rows, 1, 60) || !finite(c.radius, -5000, 5000) || !finite(c.gx, -1000, 1000) || !finite(c.gy, -1000, 1000) || !finite(c.offset, -1000, 1000)
      || !finite(c.angle, -360, 360) || (c.brick !== 'none' && c.brick !== 'row' && c.brick !== 'column') || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, kind: c.kind, src: c.src, count: c.count, radius: c.radius, cols: c.cols, rows: c.rows, gx: c.gx, gy: c.gy, angle: c.angle, brick: c.brick, offset: c.offset, sig: c.sig };
  } catch { return null; }
}

export function readCompound(raw: string | undefined): CompoundSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<CompoundSpec>;
    if (c.v !== 1 || (c.op !== 'unite' && c.op !== 'minus-front' && c.op !== 'intersect' && c.op !== 'exclude' && c.op !== 'divide' && c.op !== 'outline') || !Array.isArray(c.src) || c.src.length < 2 || c.src.length > 16
      || !c.src.every(id => typeof id === 'string' && ID.test(id)) || new Set(c.src).size !== c.src.length || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, op: c.op, src: c.src, sig: c.sig };
  } catch { return null; }
}

export function readEffect(raw: string | undefined): EffectSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<EffectSpec>;
    if (c.v !== 1 || c.fx !== 'pathfinder' || !c.op || !PF_OPS.includes(c.op) || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, fx: 'pathfinder', op: c.op, sig: c.sig };
  } catch { return null; }
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (attrs: Attrs): string => JSON.stringify(Object.keys(attrs).filter(k => k !== 'id').sort().map(k => [k, attrs[k]]));
const blendSig = (s: BlendSpec, sources: Attrs[], spine: Attrs | null): string => hash(JSON.stringify([blendIds(s), s.spine, s.mode, s.steps, s.distance, s.orient, ...sources.map(fingerprint), spine ? fingerprint(spine) : '']));
const repeatSig = (s: RepeatSpec, sources: Attrs[]): string => hash(JSON.stringify([s.kind, s.src, s.count, s.radius, s.cols, s.rows, s.gx, s.gy, s.angle, s.brick, s.offset, ...sources.map(fingerprint)]));

const compoundSig = (s: CompoundSpec, sources: Attrs[]): string => hash(JSON.stringify([s.op, s.src, ...sources.map(a => fingerprint({ ...a, visibility: '' }))]));
const effectSig = (op: PathfinderOp, ids: string[], sources: Attrs[]): string => hash(JSON.stringify(['effect', op, ids, ...sources.map(fingerprint)]));

interface View { attrs(id: string): Attrs | undefined; kids(id: string): string[]; tag(id: string): string | undefined; alive(id: string): boolean }

function viewOf(site: Site, cmds: Command[]): View {
  const attrs = new Map<string, Attrs>(), kids = new Map<string, string[]>(), tags = new Map<string, string>(), parent = new Map<string, string>(), gone = new Set<string>();
  for (const n of Object.values(site.nodes)) for (const c of n.children) parent.set(c, n.id);
  const own = (id: string): Attrs => { let a = attrs.get(id); if (!a) { a = { ...(site.nodes[id]?.attrs ?? {}) }; attrs.set(id, a); } return a; };
  const list = (id: string): string[] => { let k = kids.get(id); if (!k) { k = [...(site.nodes[id]?.children ?? [])]; kids.set(id, k); } return k; };
  const detach = (id: string): void => { const p = parent.get(id); if (p) { const k = list(p), i = k.indexOf(id); if (i >= 0) k.splice(i, 1); parent.delete(id); } };
  const drop = (id: string): void => { gone.add(id); for (const c of list(id)) drop(c); };
  for (const cmd of cmds) {
    const p = cmd.params as { id?: string; parent?: string; index?: number; patch?: { attrs?: Record<string, string | null> }; node?: { id: string; tag: string; attrs?: Attrs } };
    if (cmd.command === 'node.update' && p.id && p.patch?.attrs) {
      const a = own(p.id);
      for (const [k, v] of Object.entries(p.patch.attrs)) { if (v === null) delete a[k]; else a[k] = v; }
    } else if (cmd.command === 'node.remove' && p.id) { detach(p.id); drop(p.id); }
    else if (cmd.command === 'node.move' && p.id && p.parent) {
      detach(p.id);
      const k = list(p.parent);
      k.splice(typeof p.index === 'number' ? Math.min(p.index, k.length) : k.length, 0, p.id);
      parent.set(p.id, p.parent);
    } else if (cmd.command === 'node.add' && p.node && p.parent) {
      attrs.set(p.node.id, { ...(p.node.attrs ?? {}) });
      tags.set(p.node.id, p.node.tag);
      kids.set(p.node.id, []);
      const k = list(p.parent);
      k.splice(typeof p.index === 'number' ? Math.min(p.index, k.length) : k.length, 0, p.node.id);
      parent.set(p.node.id, p.parent);
    }
  }
  return {
    attrs: id => (gone.has(id) ? undefined : attrs.get(id) ?? (site.nodes[id] ? { ...site.nodes[id].attrs } : undefined)),
    kids: id => list(id),
    tag: id => tags.get(id) ?? site.nodes[id]?.tag,
    alive: id => !gone.has(id) && (!!site.nodes[id] || tags.has(id))
  };
}

interface Drawn { subs: SubPath[]; attrs: Attrs }

function drawn(attrs: Attrs): Drawn {
  let subs = decodeModel(attrs['data-fw-vector']);
  if (!subs || renderPath(subs) !== (attrs.d ?? '')) subs = parsePath(attrs.d);
  return { subs, attrs };
}

function copyAttrs(attrs: Attrs): Attrs {
  const out: Attrs = { ...attrs };
  for (const k of Object.keys(out)) if (k === 'id' || k.startsWith('data-fw-')) delete out[k];
  if (attrs['data-fw-align']) {
    out['stroke-width'] = attrs['data-fw-weight'] ?? attrs['stroke-width'] ?? '1';
    delete out['paint-order'];
    delete out['clip-path'];
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const centreOf = (subs: SubPath[]): [number, number] => { const b = pathBounds(applyCorners(subs)); return b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0]; };

function channels(x: string, y: string): number {
  if (x === 'none' || y === 'none' || refOf(x) || refOf(y)) return 0;
  const ca = colorToHex(x, ''), cb = colorToHex(y, '');
  if (!ca || !cb) return 0;
  return Math.max(...[1, 3, 5].map(i => Math.abs(parseInt(ca.slice(i, i + 2), 16) - parseInt(cb.slice(i, i + 2), 16))));
}

export function blendCount(a: Drawn, b: Drawn, spec: BlendSpec): number {
  if (spec.mode === 'steps') return clamp(Math.round(spec.steps), 1, 500);
  const gap = dist(centreOf(a.subs), centreOf(b.subs));
  if (spec.mode === 'distance') return clamp(Math.round(gap / Math.max(0.5, spec.distance)) - 1, 1, 500);
  const pa = paintOf({ attrs: a.attrs } as SiteNode), pb = paintOf({ attrs: b.attrs } as SiteNode);
  const delta = Math.max(channels(pa.fill, pb.fill), channels(pa.stroke, pb.stroke));
  return clamp(delta > 0 ? delta : Math.round(gap / 6), 1, 500);
}

function blendPair(a: Attrs, b: Attrs, spec: BlendSpec, rail: ReturnType<typeof spineOf>, i: number, n: number, out: Attrs[]): void {
  const A = drawn(a), B = drawn(b);
  if (!A.subs[0] || !B.subs[0]) return;
  const [SA, SB] = matchSubs(A.subs[0], B.subs[0]);
  const pa = paintOf({ attrs: a } as SiteNode), pb = paintOf({ attrs: b } as SiteNode);
  const pair = (name: 'fill' | 'stroke'): [string, string] | null => {
    const x = pa[name], y = pb[name];
    return x !== 'none' && y !== 'none' && colorToHex(x, '') && colorToHex(y, '') && !refOf(x) && !refOf(y) ? [colorToHex(x), colorToHex(y)] : null;
  };
  const fills = pair('fill'), strokes = pair('stroke');
  const mix = (colors: [string, string] | null, own: string, t: number): string => {
    if (!colors) return own;
    const ch = (c: number): string => Math.round(parseInt(colors[0].slice(c, c + 2), 16) * (1 - t) + parseInt(colors[1].slice(c, c + 2), 16) * t).toString(16).padStart(2, '0');
    return `#${ch(1)}${ch(3)}${ch(5)}`;
  };
  const count = blendCount(A, B, spec);
  for (let k = 1; k <= count && out.length < BLEND_LIMIT; k++) {
    const t = k / (count + 1);
    let sub = blendSub(SA, SB, t);
    if (rail) {
      const at = (u: number): Pt => spinePoint(rail, u * rail.total);
      const u = (i + t) / (n - 1), p0 = at(i / (n - 1)), p1 = at((i + 1) / (n - 1)), pu = at(u);
      let m: Mat = translation(pu[0] - (p0[0] + (p1[0] - p0[0]) * t), pu[1] - (p0[1] + (p1[1] - p0[1]) * t));
      if (spec.orient === 'path') {
        const tan = spineTangent(rail, u * rail.total);
        const c = centreOf([sub]);
        m = compose(m, rotation(((Math.atan2(tan[1], tan[0]) - Math.atan2(p1[1] - p0[1], p1[0] - p0[0])) * 180) / Math.PI, c[0], c[1]));
      }
      sub = applyMat([sub], m)[0];
    }
    const attrs: Attrs = { ...copyAttrs(a), ...geometryAttrs([sub]), fill: mix(fills, pa.fill, t), stroke: mix(strokes, pa.stroke, t) };
    if (pa.stroke === 'none' && pb.stroke === 'none') delete attrs['stroke-width'];
    else attrs['stroke-width'] = String(Math.round((pa.strokeWidth + (pb.strokeWidth - pa.strokeWidth) * t) * 100) / 100);
    const opacity = pa.opacity + (pb.opacity - pa.opacity) * t;
    if (opacity < 1) attrs.opacity = String(Math.round(opacity * 1000) / 1000); else delete attrs.opacity;
    out.push(attrs);
  }
}

export function blendOutputs(sources: Attrs[], spine: Attrs | null, spec: BlendSpec): Attrs[] {
  const first = spine ? drawn(spine).subs[0] : undefined;
  const rail = first ? spineOf(first) : null;
  const out: Attrs[] = [];
  for (let i = 0; i < sources.length - 1; i++) blendPair(sources[i], sources[i + 1], spec, rail, i, sources.length, out);
  return out;
}

function artOf(view: View, symbol: string): Attrs[] {
  const out: Attrs[] = [];
  const walk = (id: string, depth: number): void => {
    if (depth > 8 || !view.alive(id)) return;
    for (const child of view.kids(id)) {
      const tag = view.tag(child), attrs = view.attrs(child);
      if (tag === 'path' && attrs) out.push(attrs);
      else if (tag === 'g') walk(child, depth + 1);
    }
  };
  if (view.tag(symbol) === 'symbol') walk(symbol, 0);
  return out;
}

function unionOf(items: Drawn[]): Box | null {
  let box: Box | null = null;
  for (const item of items) {
    const b = pathBounds(applyCorners(item.subs));
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return box;
}

export function repeatOutputs(sources: Attrs[], spec: RepeatSpec): Attrs[] {
  const items = sources.map(drawn);
  const box = unionOf(items);
  if (!box) return [];
  const mats = repeatMatrices(spec.kind, box, { count: spec.count, radius: spec.radius, cols: spec.cols, rows: spec.rows, gapX: spec.gx, gapY: spec.gy, angle: spec.angle, brick: spec.brick, offset: spec.offset });
  const out: Attrs[] = [];
  for (const m of mats) {
    for (const item of items) {
      if (out.length >= COPY_LIMIT) return out;
      out.push({ ...copyAttrs(item.attrs), ...geometryAttrs(applyMat(item.subs, m)) });
    }
  }
  return out;
}

function pathfinderAttrs(sources: Attrs[], op: PathfinderOp): Attrs[] {
  const items = sources.map(drawn);
  const inputs = items.map((item, index) => { const p = paintOf({ attrs: item.attrs } as SiteNode); return { subs: item.subs, fill: p.fill, stroke: p.stroke, index }; });
  return pathfinder(op, inputs).map(made => {
    const own = sources[Math.min(made.source, sources.length - 1)];
    const attrs: Attrs = { ...copyAttrs(own), ...geometryAttrs(made.subs), 'fill-rule': made.fillRule };
    const p = paintOf({ attrs: own } as SiteNode);
    if (made.outline) { attrs.fill = 'none'; attrs.stroke = p.fill !== 'none' ? p.fill : p.stroke; attrs['stroke-width'] = String(p.stroke === 'none' ? 1 : p.strokeWidth); attrs['fill-rule'] = 'nonzero'; }
    else if (!made.stroke) attrs.stroke = 'none';
    delete attrs.visibility;
    return attrs;
  });
}

export function compoundOutputs(sources: Attrs[], spec: CompoundSpec): Attrs[] {
  const out = pathfinderAttrs(sources, spec.op);
  return spec.op === 'divide' || spec.op === 'outline' ? out : out.slice(0, 1);
}

export const effectOutputs = (sources: Attrs[], op: PathfinderOp): Attrs[] => pathfinderAttrs(sources, op).map(attrs => ({ ...attrs, visibility: 'visible' }));

export function effectAttrs(site: Site, ids: string[], op: PathfinderOp): { attr: string; outputs: Attrs[] } | null {
  const sources = ids.map(id => site.nodes[id]?.attrs).filter((a): a is Attrs => !!a);
  if (ids.length < 2 || ids.length > 30 || sources.length !== ids.length) return null;
  return { attr: JSON.stringify({ v: 1, fx: 'pathfinder', op, sig: effectSig(op, ids, sources) }), outputs: effectOutputs(sources, op) };
}

export function compoundAttrs(site: Site, ids: string[], op: CompoundOp): { attr: string; outputs: Attrs[] } | null {
  const sources = ids.map(id => site.nodes[id]?.attrs).filter((a): a is Attrs => !!a);
  if (ids.length < 2 || ids.length > 16 || sources.length !== ids.length) return null;
  const spec: CompoundSpec = { v: 1, op, src: ids, sig: '00000000' };
  return { attr: JSON.stringify({ ...spec, sig: compoundSig(spec, sources) }), outputs: compoundOutputs(sources, spec) };
}

function containerCommands(site: Site, taken: Set<string>, group: string, kind: LiveKind, list: Attrs[], index: number): Command[] {
  const id = freshId(site, taken, 'live');
  const names = { blend: ['Blend steps', 'Blend step'], repeat: ['Repeat copies', 'Repeat copy'], brush: ['Brush strokes', 'Brush stroke'], stroke: ['Stroke parts', 'Stroke part'], compound: ['Compound result', 'Compound shape'], warp: ['Envelope result', 'Envelope path'], effect: ['Effect result', 'Effect shape'], freeform: ['Freeform gradient', 'Freeform stop'], livepaint: ['Live Paint faces', 'Live Paint face'] }[kind];
  const cmds: Command[] = [{ command: 'node.add', params: { parent: group, node: { id, tag: 'g', name: names[0], attrs: { 'data-fw-live': kind } } } }];
  for (const attrs of list) {
    const pid = freshId(site, taken, 'path');
    cmds.push({ command: 'node.add', params: { parent: id, node: { id: pid, tag: 'path', name: names[1], attrs } } });
  }
  cmds.push(moveNode(id, group, index));
  return cmds;
}

function refresh(view: View, taken: Set<string>, site: Site, group: string, kind: LiveKind, live: string | undefined, list: Attrs[], index: number): Command[] {
  const children = live ? view.kids(live) : [];
  if (live && children.length === list.length && children.every(id => view.tag(id) === 'path')) {
    const cmds: Command[] = [];
    children.forEach((id, i) => {
      const old = view.attrs(id) ?? {}, next = list[i];
      const patch: Record<string, string | null> = {};
      for (const k of Object.keys(next)) if (old[k] !== next[k]) patch[k] = next[k];
      for (const k of Object.keys(old)) if (!(k in next)) patch[k] = null;
      if (Object.keys(patch).length) cmds.push(updateAttrs(id, patch));
    });
    return cmds;
  }
  return [...(live ? [removeNode(live)] : []), ...containerCommands(site, taken, group, kind, list, index)];
}

export function liveFixes(site: Site, cmds: Command[]): Command[] {
  const groups: { id: string }[] = Object.values(site.nodes).filter(n => n.tag === 'g' && (n.attrs['data-fw-blend'] || n.attrs['data-fw-repeat'] || n.attrs['data-fw-brush'] || n.attrs['data-fw-stroke'] || n.attrs['data-fw-compound'] || n.attrs['data-fw-warp'] || n.attrs['data-fw-effect'] || n.attrs['data-fw-freeform'] || n.attrs['data-fw-livepaint']));
  /* Freeform gradients and Live Paint groups are made in the same batch as their group, so new groups are checked too. */
  const added = cmds.flatMap(c => { const node = c.command === 'node.add' ? (c.params as { node?: { id?: string; tag?: string } }).node : undefined; return node?.tag === 'g' && node.id && !site.nodes[node.id] ? [node.id] : []; });
  if (!groups.length && !added.length) return [];
  const view = viewOf(site, cmds);
  for (const id of added) if (view.attrs(id)?.['data-fw-freeform'] || view.attrs(id)?.['data-fw-livepaint']) groups.push({ id });
  const taken = new Set<string>();
  const out: Command[] = [];
  for (const g of groups) {
    if (!view.alive(g.id)) continue;
    const gattrs = view.attrs(g.id) ?? {};
    const kids = view.kids(g.id);
    const live = kids.find(id => view.attrs(id)?.['data-fw-live']);
    const rest = kids.filter(id => id !== live);
    const blend = readBlend(gattrs['data-fw-blend']), repeat = readRepeat(gattrs['data-fw-repeat']), brush = readBrush(gattrs['data-fw-brush']), fx = readStroke(gattrs['data-fw-stroke']), compound = readCompound(gattrs['data-fw-compound']), warp = readWarp(gattrs['data-fw-warp']), effect = readEffect(gattrs['data-fw-effect']);
    const ok = (id: string): boolean => view.alive(id) && rest.includes(id) && view.tag(id) === 'path';
    const lp = readLivePaint(gattrs['data-fw-livepaint']);
    if (lp) {
      const alive = lp.src.map((id, i) => ({ id, i, of: lp.of[i] })).filter(s => ok(s.id));
      if (alive.length < 2) {
        out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-livepaint': null }), ...alive.map(s => updateAttrs(s.id, { fill: s.of || null, ...livePaintStroke(lp.os?.[s.i]) })));
        continue;
      }
      const src = alive.map(s => s.id), of = alive.map(s => s.of);
      const os = lp.os ? alive.map(s => lp.os![s.i]) : undefined;
      /* A deleted source takes its bit out of every face signature, and its edges go. */
      const remap = (sig: number): number => alive.reduce((acc, s, k) => (sig & (1 << s.i) ? acc | (1 << k) : acc), 0);
      const fills: LivePaintFill[] = src.length === lp.src.length ? lp.fills : lp.fills.map(f => [remap(f[0]), f[1], f[2], f[3]] as LivePaintFill).filter(f => f[0] > 0);
      const edges: LivePaintEdge[] | undefined = !lp.edges || src.length === lp.src.length ? lp.edges : lp.edges.flatMap(e => { const k = alive.findIndex(s => s.i === e[0]); return k < 0 ? [] : [[k, remap(e[1]), e[2], e[3], e[4], e[5]] as LivePaintEdge]; });
      const attrs = src.map(id => view.attrs(id)!);
      if (livePaintSig({ src, fills, edges }, attrs) === lp.sig && live && src.length === lp.src.length) continue;
      const made = livePaintOutputs(attrs, fills, edges);
      const next = { v: 1, src, fills: made.fills, of, sig: livePaintSig({ src, fills: made.fills, edges: made.edges }, attrs), ...(made.edges ? { edges: made.edges } : {}), ...(os ? { os } : {}) };
      out.push(...refresh(view, taken, site, g.id, 'livepaint', live, made.outputs, rest.length), updateAttrs(g.id, { 'data-fw-livepaint': JSON.stringify(next) }));
      continue;
    }
    const ff = readFreeform(gattrs['data-fw-freeform']);
    if (ff) {
      if (!ok(ff.src) || ![...ff.grads, ...(ff.sg ?? [])].every(id => view.alive(id) && view.tag(id) === 'radialGradient')) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-freeform': null })); continue; }
      const sattrs = view.attrs(ff.src)!;
      const sig = freeformSig(ff, sattrs);
      if (sig === ff.sig && live) continue;
      const used = new Set([...ff.grads, ...(ff.sg ?? [])]);
      const old = live ? view.kids(live).map(id => refOf(view.attrs(id)?.fill)).filter((id): id is string => !!id && !used.has(id)) : [];
      const samples = freeformSamples(ff);
      const place = (id: string, made: ReturnType<typeof freeformGradient>): void => {
        if (!made) return;
        out.push(updateAttrs(id, made.attrs));
        view.kids(id).forEach((stop, k) => { if (made.stops[k]) out.push(updateAttrs(stop, made.stops[k])); });
      };
      ff.grads.forEach((id, i) => place(id, freeformGradient(sattrs, ff.pts[i], ff.cols[i])));
      (ff.sg ?? []).forEach((id, i) => { const s = samples[i]; if (s) place(id, freeformGradient(sattrs, [s.x, s.y, s.s], s.c)); });
      out.push(...refresh(view, taken, site, g.id, 'freeform', live, freeformOutputs(sattrs, ff), rest.indexOf(ff.src) + 1), updateAttrs(g.id, { 'data-fw-freeform': JSON.stringify({ ...ff, sig }) }));
      for (const id of new Set(old)) if (view.alive(id)) out.push(removeNode(id));
    } else if (effect) {
      const ids = rest.filter(ok);
      if (ids.length < 2) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-effect': null, visibility: null })); continue; }
      if (gattrs.visibility !== 'hidden') out.push(updateAttrs(g.id, { visibility: 'hidden' }));
      const attrs = ids.map(id => view.attrs(id)!);
      const sig = effectSig(effect.op, ids, attrs);
      if (sig === effect.sig && live) continue;
      out.push(...refresh(view, taken, site, g.id, 'effect', live, effectOutputs(attrs, effect.op), rest.length), updateAttrs(g.id, { 'data-fw-effect': JSON.stringify({ ...effect, sig }) }));
    } else if (warp) {
      const ids = warpIds(warp);
      if (!ids.every(ok)) {
        out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-warp': null }));
        ids.forEach((id, i) => { if (ok(id)) out.push(updateAttrs(id, { opacity: warp.op[i] || null })); });
        continue;
      }
      const attrs = warp.src.map(id => view.attrs(id)!), envAttrs = warp.env ? view.attrs(warp.env)! : null;
      const sig = warpSig(warp, attrs, envAttrs);
      if (sig === warp.sig && live) continue;
      const made = warpOutputs(attrs, envAttrs, warp);
      if (made.length) out.push(...refresh(view, taken, site, g.id, 'warp', live, made, rest.length));
      out.push(updateAttrs(g.id, { 'data-fw-warp': JSON.stringify({ ...warp, sig }) }));
    } else if (fx) {
      if (!ok(fx.src)) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-stroke': null })); continue; }
      const sattrs = view.attrs(fx.src)!;
      const wide = widthSpec(sattrs['data-fw-width']);
      if (wide && view.alive(wide.outline) && view.attrs(wide.outline)?.opacity !== '0') out.push(updateAttrs(wide.outline, { opacity: '0' }));
      const sig = strokeSig(fx, sattrs);
      if (sig === fx.sig && live) continue;
      const at = rest.indexOf(fx.src) + (strokeUnder(sattrs) ? 0 : 1);
      if (live && kids.indexOf(live) !== at) out.push(moveNode(live, g.id, at));
      out.push(...refresh(view, taken, site, g.id, 'stroke', live, strokeOutputs(sattrs, fx), at), updateAttrs(g.id, { 'data-fw-stroke': JSON.stringify({ ...fx, sig }) }));
    } else if (blend) {
      const ids = blendIds(blend).filter(ok);
      if (ids.length < 2) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-blend': null })); continue; }
      const spine = blend.spine && ok(blend.spine) ? blend.spine : '';
      const next: BlendSpec = { ...blend, a: ids[0], b: ids[ids.length - 1], mid: ids.slice(1, -1), spine };
      const attrs = ids.map(id => view.attrs(id)!), rail = spine ? view.attrs(spine)! : null;
      const sig = blendSig(next, attrs, rail);
      if (sig === blend.sig && live) continue;
      const index = Math.min(...ids.map(id => rest.indexOf(id))) + 1;
      out.push(...refresh(view, taken, site, g.id, 'blend', live, blendOutputs(attrs, rail, next), index), updateAttrs(g.id, { 'data-fw-blend': JSON.stringify({ ...next, sig }) }));
    } else if (brush) {
      const art = brush.art ? artOf(view, brush.art) : [];
      if (!ok(brush.src) || (needsArt(brush.kind) && !art.length)) {
        out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-brush': null }));
        if (ok(brush.src)) out.push(updateAttrs(brush.src, { stroke: brush.color, 'stroke-width': String(brush.weight) }));
        continue;
      }
      const sattrs = view.attrs(brush.src)!;
      const next = { ...brush };
      const patch: Record<string, string | null> = {};
      if (sattrs.stroke && sattrs.stroke !== 'none') {
        const hex = refOf(sattrs.stroke) ? '' : colorToHex(sattrs.stroke, '');
        if (hex) next.color = hex;
        const w = parseFloat((sattrs['data-fw-align'] ? sattrs['data-fw-weight'] : sattrs['stroke-width']) ?? '');
        if (Number.isFinite(w) && w >= 0 && w <= 10000) next.weight = w;
        patch.stroke = 'none';
      }
      const sig = brushSig(next, sattrs, art);
      const changed = Object.keys(patch).length > 0 || next.color !== brush.color || next.weight !== brush.weight;
      if (sig === brush.sig && live && !changed) continue;
      if (Object.keys(patch).length) out.push(updateAttrs(brush.src, patch));
      if (sig !== brush.sig || !live) out.push(...refresh(view, taken, site, g.id, 'brush', live, brushOutputs(sattrs, art, next), rest.indexOf(brush.src) + 1));
      out.push(updateAttrs(g.id, { 'data-fw-brush': JSON.stringify({ ...next, sig }) }));
    } else if (compound) {
      const ids = compound.src.filter(ok);
      if (ids.length < 2) {
        out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-compound': null }), ...ids.map(id => updateAttrs(id, { visibility: null })));
        continue;
      }
      for (const id of ids) if (view.attrs(id)?.visibility !== 'hidden') out.push(updateAttrs(id, { visibility: 'hidden' }));
      const next: CompoundSpec = { ...compound, src: ids };
      const attrs = ids.map(id => view.attrs(id)!);
      const sig = compoundSig(next, attrs);
      if (sig === compound.sig && live && ids.length === compound.src.length) continue;
      out.push(...refresh(view, taken, site, g.id, 'compound', live, compoundOutputs(attrs, next), rest.length), updateAttrs(g.id, { 'data-fw-compound': JSON.stringify({ ...next, sig }) }));
    } else if (repeat) {
      const src = repeat.src.filter(id => view.alive(id) && rest.includes(id) && view.tag(id) === 'path');
      if (!src.length) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-repeat': null })); continue; }
      const next = { ...repeat, src };
      const attrs = src.map(id => view.attrs(id)!);
      const sig = repeatSig(next, attrs);
      if (sig === repeat.sig && live && src.length === repeat.src.length) continue;
      out.push(...refresh(view, taken, site, g.id, 'repeat', live, repeatOutputs(attrs, next), rest.length), updateAttrs(g.id, { 'data-fw-repeat': JSON.stringify({ ...next, sig }) }));
    }
  }
  return out;
}

export function liveOf(site: Site, id: string): { group: string; kind: LiveKind } | undefined {
  let current: string | undefined = id;
  for (let depth = 0; current && depth < 64; depth++) {
    const node: SiteNode | undefined = site.nodes[current];
    if (!node) return undefined;
    if (node.tag === 'g' && node.attrs['data-fw-blend']) return { group: node.id, kind: 'blend' };
    if (node.tag === 'g' && node.attrs['data-fw-brush']) return { group: node.id, kind: 'brush' };
    if (node.tag === 'g' && node.attrs['data-fw-repeat']) return { group: node.id, kind: 'repeat' };
    if (node.tag === 'g' && node.attrs['data-fw-stroke']) return { group: node.id, kind: 'stroke' };
    if (node.tag === 'g' && node.attrs['data-fw-warp']) return { group: node.id, kind: 'warp' };
    if (node.tag === 'g' && node.attrs['data-fw-effect']) return { group: node.id, kind: 'effect' };
    if (node.tag === 'g' && node.attrs['data-fw-compound']) return { group: node.id, kind: 'compound' };
    if (node.tag === 'g' && node.attrs['data-fw-freeform']) return { group: node.id, kind: 'freeform' };
    if (node.tag === 'g' && node.attrs['data-fw-livepaint']) return { group: node.id, kind: 'livepaint' };
    if (node.tag === 'svg') return undefined;
    current = parentOf(site, current);
  }
  return undefined;
}

export function liveSources(site: Site, group: string): string[] {
  const node = site.nodes[group];
  const blend = node && readBlend(node.attrs['data-fw-blend']), repeat = node && readRepeat(node.attrs['data-fw-repeat']), brush = node && readBrush(node.attrs['data-fw-brush']), fx = node && readStroke(node.attrs['data-fw-stroke']), compound = node && readCompound(node.attrs['data-fw-compound']), warp = node && readWarp(node.attrs['data-fw-warp']);
  const effect = node && readEffect(node.attrs['data-fw-effect']), ff = node && readFreeform(node.attrs['data-fw-freeform']);
  if (ff) return [ff.src];
  const lps = node && readLivePaint(node.attrs['data-fw-livepaint']);
  if (lps) return lps.src;
  return effect ?node.children.filter(id => site.nodes[id]?.tag === 'path' && !site.nodes[id].attrs['data-fw-live']) : compound ? compound.src : blend ? blendIds(blend) : brush ? [brush.src] : fx ? [fx.src] : repeat ? repeat.src : warp ? warpIds(warp) : [];
}

export function liveCopyOwner(site: Site, id: string): string | undefined {
  const holder = parentOf(site, id);
  const above = holder && site.nodes[holder]?.attrs['data-fw-live'] ? parentOf(site, holder) : undefined;
  return above && (site.nodes[above]?.attrs['data-fw-blend'] || site.nodes[above]?.attrs['data-fw-repeat'] || site.nodes[above]?.attrs['data-fw-brush'] || site.nodes[above]?.attrs['data-fw-stroke'] || site.nodes[above]?.attrs['data-fw-compound'] || site.nodes[above]?.attrs['data-fw-warp'] || site.nodes[above]?.attrs['data-fw-effect'] || site.nodes[above]?.attrs['data-fw-freeform'] || site.nodes[above]?.attrs['data-fw-livepaint']) ? above : undefined;
}

export function expandCommands(site: Site, group: string): Command[] {
  const g = site.nodes[group];
  if (!g) return [];
  const live = g.children.find(id => site.nodes[id]?.attrs['data-fw-live']);
  const compound = readCompound(g.attrs['data-fw-compound']) ?? readEffect(g.attrs['data-fw-effect']);
  const home = parentOf(site, group);
  if (compound && home && live) {
    const at = site.nodes[home].children.indexOf(group);
    return [...site.nodes[live].children.map((child, k) => moveNode(child, home, at + k)), ...g.children.filter(id => id !== live).map(id => removeNode(id)), removeNode(live), removeNode(group)];
  }
  const cmds: Command[] = [];
  if (live) {
    const at = g.children.indexOf(live);
    site.nodes[live].children.forEach((child, k) => cmds.push(moveNode(child, group, at + k)));
    cmds.push(removeNode(live));
  }
  const brush = readBrush(g.attrs['data-fw-brush']);
  if (brush && site.nodes[brush.src]) cmds.push(removeNode(brush.src));
  const warp = readWarp(g.attrs['data-fw-warp']);
  if (warp) for (const id of warpIds(warp)) if (site.nodes[id]) cmds.push(removeNode(id));
  const fx = readStroke(g.attrs['data-fw-stroke']);
  const body = fx && site.nodes[fx.src];
  const wide = body && widthSpec(body.attrs['data-fw-width']);
  if (fx && body) cmds.push(body.attrs.fill === 'none' ? removeNode(fx.src) : updateAttrs(fx.src, { stroke: 'none', 'stroke-opacity': null, ...(wide ? { 'data-fw-width': null } : {}) }));
  if (fx && body && wide && body.attrs.fill !== 'none' && site.nodes[wide.outline]) cmds.push(removeNode(wide.outline));
  cmds.push(updateAttrs(group, { 'data-fw-blend': null, 'data-fw-repeat': null, 'data-fw-brush': null, 'data-fw-stroke': null, 'data-fw-warp': null, 'data-fw-freeform': null, 'data-fw-livepaint': null }));
  return cmds;
}

export function removeEffectCommands(site: Site, group: string): Command[] {
  const g = site.nodes[group];
  if (!g) return [];
  const live = g.children.find(id => site.nodes[id]?.attrs['data-fw-live']);
  return [...(live ? [removeNode(live)] : []), updateAttrs(group, { 'data-fw-effect': null, visibility: null })];
}

export function releaseCommands(site: Site, group: string): { cmds: Command[]; sources: string[] } {
  const g = site.nodes[group];
  const parent = g && parentOf(site, group);
  if (!g || !parent) return { cmds: [], sources: [] };
  const live = g.children.find(id => site.nodes[id]?.attrs['data-fw-live']);
  const cmds: Command[] = live ? [removeNode(live)] : [];
  for (const id of readCompound(g.attrs['data-fw-compound'])?.src ?? []) if (site.nodes[id]) cmds.push(updateAttrs(id, { visibility: null }));
  const brush = readBrush(g.attrs['data-fw-brush']);
  if (brush && site.nodes[brush.src]) cmds.push(updateAttrs(brush.src, { stroke: brush.color, 'stroke-width': String(brush.weight) }));
  const warp = readWarp(g.attrs['data-fw-warp']);
  if (warp) warpIds(warp).forEach((id, i) => { if (site.nodes[id]) cmds.push(updateAttrs(id, { opacity: warp.op[i] || null })); });
  const fx = readStroke(g.attrs['data-fw-stroke']);
  if (fx && site.nodes[fx.src]) cmds.push(updateAttrs(fx.src, { 'stroke-opacity': null, 'stroke-dasharray': fx.mode === 'preserve' && fx.dash.length ? fx.dash.join(' ') : null }));
  const wide = fx && site.nodes[fx.src] && widthSpec(site.nodes[fx.src].attrs['data-fw-width']);
  if (wide && site.nodes[wide.outline]) cmds.push(updateAttrs(wide.outline, { opacity: null }));
  const lpSpec = readLivePaint(g.attrs['data-fw-livepaint']);
  lpSpec?.src.forEach((id, i) => { if (site.nodes[id]) cmds.push(updateAttrs(id, { fill: lpSpec.of[i] || null, ...livePaintStroke(lpSpec.os?.[i]) })); });
  const ffSpec = readFreeform(g.attrs['data-fw-freeform']);
  for (const id of [...(ffSpec?.grads ?? []), ...(ffSpec?.sg ?? [])]) if (site.nodes[id]) cmds.push(removeNode(id));
  const keep = g.children.filter(id => id !== live);
  const at = site.nodes[parent].children.indexOf(group);
  keep.forEach((child, k) => cmds.push(moveNode(child, parent, at + k)));
  cmds.push(removeNode(group));
  return { cmds, sources: keep };
}

export function blendAttrs(site: Site, ids: string[], change: Partial<Omit<BlendSpec, 'v' | 'a' | 'b' | 'mid' | 'sig'>>): { attr: string; outputs: Attrs[] } | null {
  const sources = ids.map(id => site.nodes[id]?.attrs).filter((a): a is Attrs => !!a);
  if (ids.length < 2 || ids.length > 16 || sources.length !== ids.length) return null;
  const spec: BlendSpec = { v: 1, a: ids[0], b: ids[ids.length - 1], mid: ids.slice(1, -1), spine: '', mode: 'steps', steps: 5, distance: 20, orient: 'page', sig: '00000000', ...change };
  const sig = blendSig(spec, sources, null);
  return { attr: JSON.stringify({ ...spec, sig }), outputs: blendOutputs(sources, null, spec) };
}

export function repeatAttrs(site: Site, src: string[], change: Omit<RepeatSpec, 'v' | 'src' | 'sig'>): { attr: string; outputs: Attrs[] } | null {
  const spec: RepeatSpec = { v: 1, src, sig: '00000000', ...change };
  const sources = src.map(id => site.nodes[id]?.attrs).filter((a): a is Attrs => !!a);
  if (sources.length !== src.length) return null;
  return { attr: JSON.stringify({ ...spec, sig: repeatSig(spec, sources) }), outputs: repeatOutputs(sources, spec) };
}

export function liveContainer(site: Site, taken: Set<string>, group: string, kind: LiveKind, outputs: Attrs[], index: number): Command[] {
  return containerCommands(site, taken, group, kind, outputs, index);
}
