import type { Command, Site, SiteNode } from '../types';
import { applyMat } from './arrange';
import { applyCorners, renderPath } from './corners';
import { blendSub, matchSubs, repeatMatrices } from './distort';
import { decodeModel, dist, parsePath, pathBounds, type Box, type SubPath } from './geometry';
import { colorToHex } from './gradient';
import { freshId, geometryAttrs, moveNode, paintOf, parentOf, refOf, removeNode, updateAttrs } from './store';

export type BlendMode = 'color' | 'steps' | 'distance';
export type RepeatKind = 'radial' | 'grid' | 'mirror';
type Attrs = Record<string, string>;

export interface BlendSpec { v: 1; a: string; b: string; mode: BlendMode; steps: number; distance: number; orient: 'page'; sig: string }
export interface RepeatSpec { v: 1; kind: RepeatKind; src: string[]; count: number; radius: number; cols: number; rows: number; gx: number; gy: number; angle: number; brick: 'none' | 'row' | 'column'; offset: number; sig: string }

const COPY_LIMIT = 800;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const whole = (v: unknown, lo: number, hi: number): v is number => finite(v, lo, hi) && Number.isInteger(v);

export function readBlend(raw: string | undefined): BlendSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<BlendSpec>;
    if (c.v !== 1 || typeof c.a !== 'string' || typeof c.b !== 'string' || !ID.test(c.a) || !ID.test(c.b) || c.a === c.b || (c.mode !== 'color' && c.mode !== 'steps' && c.mode !== 'distance')
      || !whole(c.steps, 1, 100) || !finite(c.distance, 0.5, 10000) || c.orient !== 'page' || typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, a: c.a, b: c.b, mode: c.mode, steps: c.steps, distance: c.distance, orient: 'page', sig: c.sig };
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

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (attrs: Attrs): string => JSON.stringify(Object.keys(attrs).filter(k => k !== 'id').sort().map(k => [k, attrs[k]]));
const blendSig = (s: BlendSpec, a: Attrs, b: Attrs): string => hash(JSON.stringify([s.a, s.b, s.mode, s.steps, s.distance, s.orient, fingerprint(a), fingerprint(b)]));
const repeatSig = (s: RepeatSpec, sources: Attrs[]): string => hash(JSON.stringify([s.kind, s.src, s.count, s.radius, s.cols, s.rows, s.gx, s.gy, s.angle, s.brick, s.offset, ...sources.map(fingerprint)]));

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
  if (spec.mode === 'steps') return clamp(Math.round(spec.steps), 1, 100);
  const gap = dist(centreOf(a.subs), centreOf(b.subs));
  if (spec.mode === 'distance') return clamp(Math.round(gap / Math.max(0.5, spec.distance)) - 1, 1, 100);
  const pa = paintOf({ attrs: a.attrs } as SiteNode), pb = paintOf({ attrs: b.attrs } as SiteNode);
  const delta = Math.max(channels(pa.fill, pb.fill), channels(pa.stroke, pb.stroke));
  return clamp(delta > 0 ? delta : Math.round(gap / 6), 1, 100);
}

export function blendOutputs(a: Attrs, b: Attrs, spec: BlendSpec): Attrs[] {
  const A = drawn(a), B = drawn(b);
  if (!A.subs[0] || !B.subs[0]) return [];
  const [SA, SB] = matchSubs(A.subs[0], B.subs[0]);
  const pa = paintOf({ attrs: a } as SiteNode), pb = paintOf({ attrs: b } as SiteNode);
  const pair = (name: 'fill' | 'stroke'): [string, string] | null => {
    const x = pa[name], y = pb[name];
    return x !== 'none' && y !== 'none' && colorToHex(x, '') && colorToHex(y, '') && !refOf(x) && !refOf(y) ? [colorToHex(x), colorToHex(y)] : null;
  };
  const fills = pair('fill'), strokes = pair('stroke');
  const mix = (colors: [string, string] | null, own: string, t: number): string => {
    if (!colors) return own;
    const ch = (i: number): string => Math.round(parseInt(colors[0].slice(i, i + 2), 16) * (1 - t) + parseInt(colors[1].slice(i, i + 2), 16) * t).toString(16).padStart(2, '0');
    return `#${ch(1)}${ch(3)}${ch(5)}`;
  };
  const count = blendCount(A, B, spec);
  const out: Attrs[] = [];
  for (let k = 1; k <= count; k++) {
    const t = k / (count + 1);
    const attrs: Attrs = { ...copyAttrs(a), ...geometryAttrs([blendSub(SA, SB, t)]), fill: mix(fills, pa.fill, t), stroke: mix(strokes, pa.stroke, t) };
    if (pa.stroke === 'none' && pb.stroke === 'none') delete attrs['stroke-width'];
    else attrs['stroke-width'] = String(Math.round((pa.strokeWidth + (pb.strokeWidth - pa.strokeWidth) * t) * 100) / 100);
    const opacity = pa.opacity + (pb.opacity - pa.opacity) * t;
    if (opacity < 1) attrs.opacity = String(Math.round(opacity * 1000) / 1000); else delete attrs.opacity;
    out.push(attrs);
  }
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

function containerCommands(site: Site, taken: Set<string>, group: string, kind: 'blend' | 'repeat', list: Attrs[], index: number): Command[] {
  const id = freshId(site, taken, 'live');
  const cmds: Command[] = [{ command: 'node.add', params: { parent: group, node: { id, tag: 'g', name: kind === 'blend' ? 'Blend steps' : 'Repeat copies', attrs: { 'data-fw-live': kind } } } }];
  for (const attrs of list) {
    const pid = freshId(site, taken, 'path');
    cmds.push({ command: 'node.add', params: { parent: id, node: { id: pid, tag: 'path', name: kind === 'blend' ? 'Blend step' : 'Repeat copy', attrs } } });
  }
  cmds.push(moveNode(id, group, index));
  return cmds;
}

function refresh(view: View, taken: Set<string>, site: Site, group: string, kind: 'blend' | 'repeat', live: string | undefined, list: Attrs[], index: number): Command[] {
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
  const groups = Object.values(site.nodes).filter(n => n.tag === 'g' && (n.attrs['data-fw-blend'] || n.attrs['data-fw-repeat']));
  if (!groups.length) return [];
  const view = viewOf(site, cmds);
  const taken = new Set<string>();
  const out: Command[] = [];
  for (const g of groups) {
    if (!view.alive(g.id)) continue;
    const gattrs = view.attrs(g.id) ?? {};
    const kids = view.kids(g.id);
    const live = kids.find(id => view.attrs(id)?.['data-fw-live']);
    const rest = kids.filter(id => id !== live);
    const blend = readBlend(gattrs['data-fw-blend']), repeat = readRepeat(gattrs['data-fw-repeat']);
    if (blend) {
      const ok = (id: string): boolean => view.alive(id) && rest.includes(id) && view.tag(id) === 'path';
      if (!ok(blend.a) || !ok(blend.b)) { out.push(...(live ? [removeNode(live)] : []), updateAttrs(g.id, { 'data-fw-blend': null })); continue; }
      const a = view.attrs(blend.a)!, b = view.attrs(blend.b)!;
      const sig = blendSig(blend, a, b);
      if (sig === blend.sig && live) continue;
      const index = Math.min(rest.indexOf(blend.a), rest.indexOf(blend.b)) + 1;
      out.push(...refresh(view, taken, site, g.id, 'blend', live, blendOutputs(a, b, blend), index), updateAttrs(g.id, { 'data-fw-blend': JSON.stringify({ ...blend, sig }) }));
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

export function liveOf(site: Site, id: string): { group: string; kind: 'blend' | 'repeat' } | undefined {
  let current: string | undefined = id;
  for (let depth = 0; current && depth < 64; depth++) {
    const node: SiteNode | undefined = site.nodes[current];
    if (!node) return undefined;
    if (node.tag === 'g' && node.attrs['data-fw-blend']) return { group: node.id, kind: 'blend' };
    if (node.tag === 'g' && node.attrs['data-fw-repeat']) return { group: node.id, kind: 'repeat' };
    if (node.tag === 'svg') return undefined;
    current = parentOf(site, current);
  }
  return undefined;
}

export function liveSources(site: Site, group: string): string[] {
  const node = site.nodes[group];
  const blend = node && readBlend(node.attrs['data-fw-blend']), repeat = node && readRepeat(node.attrs['data-fw-repeat']);
  return blend ? [blend.a, blend.b] : repeat ? repeat.src : [];
}

export function liveCopyOwner(site: Site, id: string): string | undefined {
  const holder = parentOf(site, id);
  const above = holder && site.nodes[holder]?.attrs['data-fw-live'] ? parentOf(site, holder) : undefined;
  return above && (site.nodes[above]?.attrs['data-fw-blend'] || site.nodes[above]?.attrs['data-fw-repeat']) ? above : undefined;
}

export function expandCommands(site: Site, group: string): Command[] {
  const g = site.nodes[group];
  if (!g) return [];
  const live = g.children.find(id => site.nodes[id]?.attrs['data-fw-live']);
  const cmds: Command[] = [];
  if (live) {
    const at = g.children.indexOf(live);
    site.nodes[live].children.forEach((child, k) => cmds.push(moveNode(child, group, at + k)));
    cmds.push(removeNode(live));
  }
  cmds.push(updateAttrs(group, { 'data-fw-blend': null, 'data-fw-repeat': null }));
  return cmds;
}

export function releaseCommands(site: Site, group: string): { cmds: Command[]; sources: string[] } {
  const g = site.nodes[group];
  const parent = g && parentOf(site, group);
  if (!g || !parent) return { cmds: [], sources: [] };
  const live = g.children.find(id => site.nodes[id]?.attrs['data-fw-live']);
  const cmds: Command[] = live ? [removeNode(live)] : [];
  const keep = g.children.filter(id => id !== live);
  const at = site.nodes[parent].children.indexOf(group);
  keep.forEach((child, k) => cmds.push(moveNode(child, parent, at + k)));
  cmds.push(removeNode(group));
  return { cmds, sources: keep };
}

export function blendAttrs(site: Site, a: string, b: string, change: Partial<Omit<BlendSpec, 'v' | 'a' | 'b' | 'sig' | 'orient'>>): { attr: string; outputs: Attrs[] } | null {
  const spec: BlendSpec = { v: 1, a, b, mode: 'steps', steps: 5, distance: 20, orient: 'page', sig: '00000000', ...change };
  const aa = site.nodes[a]?.attrs, bb = site.nodes[b]?.attrs;
  if (!aa || !bb) return null;
  const sig = blendSig(spec, aa, bb);
  return { attr: JSON.stringify({ ...spec, sig }), outputs: blendOutputs(aa, bb, spec) };
}

export function repeatAttrs(site: Site, src: string[], change: Omit<RepeatSpec, 'v' | 'src' | 'sig'>): { attr: string; outputs: Attrs[] } | null {
  const spec: RepeatSpec = { v: 1, src, sig: '00000000', ...change };
  const sources = src.map(id => site.nodes[id]?.attrs).filter((a): a is Attrs => !!a);
  if (sources.length !== src.length) return null;
  return { attr: JSON.stringify({ ...spec, sig: repeatSig(spec, sources) }), outputs: repeatOutputs(sources, spec) };
}

export function liveContainer(site: Site, taken: Set<string>, group: string, kind: 'blend' | 'repeat', outputs: Attrs[], index: number): Command[] {
  return containerCommands(site, taken, group, kind, outputs, index);
}
