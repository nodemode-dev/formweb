import type { Command, Site, SiteNode } from '../types';
import { applyCorners } from './corners';
import { flattenSub, reverseSub } from './edit';
import { decodeModel, formatPath, parsePath, type Pt, type SubPath } from './geometry';
import { colorToHex } from './gradient';
import { freshId, moveNode, parentOf, removeNode, svgOf, updateAttrs } from './store';

export type TypeEffect = 'rainbow' | 'skew' | 'ribbon' | 'stair' | 'gravity';
export type TypeAlign = 'baseline' | 'ascender' | 'descender' | 'center';

export interface TypeConfig {
  v: 1;
  path: string;
  text: string;
  size: number;
  offset: number;
  effect: TypeEffect;
  flip: 0 | 1;
  align: TypeAlign;
  spacing: number;
}

export const TYPE_EFFECTS: { id: TypeEffect; label: string }[] = [
  { id: 'rainbow', label: 'Rainbow' }, { id: 'skew', label: 'Skew' }, { id: 'ribbon', label: '3D Ribbon' }, { id: 'stair', label: 'Stair Step' }, { id: 'gravity', label: 'Gravity' }
];
export const TYPE_ALIGNS: { id: TypeAlign; label: string }[] = [
  { id: 'ascender', label: 'Ascender' }, { id: 'descender', label: 'Descender' }, { id: 'center', label: 'Center' }, { id: 'baseline', label: 'Baseline' }
];

const FAMILY = 'Inter, sans-serif';
const GLYPH_LIMIT = 80;
const SHIFT: Record<TypeAlign, number> = { baseline: 0, ascender: 0.75, descender: -0.2, center: 0.34 };
const CARRIER = 'M-400 0H400';

const isEffect = (v: unknown): v is TypeEffect => TYPE_EFFECTS.some(e => e.id === v);
const isAlign = (v: unknown): v is TypeAlign => TYPE_ALIGNS.some(a => a.id === v);
const within = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

export function readType(node: SiteNode | undefined): TypeConfig | null {
  const raw = node?.attrs['data-fw-type'];
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<TypeConfig>;
    if (c.v !== 1 || typeof c.path !== 'string' || typeof c.text !== 'string' || c.text.length > 500 || !within(c.size, 1, 500) || !within(c.offset, 0, 100) || !isEffect(c.effect) || !isAlign(c.align) || !within(c.spacing, -100, 100) || (c.flip !== 0 && c.flip !== 1)) return null;
    return { v: 1, path: c.path, text: c.text, size: c.size, offset: c.offset, effect: c.effect, flip: c.flip, align: c.align, spacing: c.spacing };
  } catch { return null; }
}

export function typeHolder(site: Site, pathId: string): SiteNode | undefined {
  return Object.values(site.nodes).find(n => n.tag === 'g' && readType(n)?.path === pathId);
}

function legacyHolder(site: Site, pathId: string): string | undefined {
  const piece = Object.values(site.nodes).find(n => n.tag === 'textPath' && n.attrs.href === `#${pathId}` && !parentGroup(site, n.id));
  return piece ? parentOf(site, piece.id) : undefined;
}

function parentGroup(site: Site, id: string): boolean {
  let current = parentOf(site, id);
  for (let depth = 0; current && depth < 4; depth++) {
    if (site.nodes[current]?.attrs['data-fw-type']) return true;
    current = parentOf(site, current);
  }
  return false;
}

let canvas: CanvasRenderingContext2D | null | undefined;

function advances(chars: string[], size: number): number[] {
  if (canvas === undefined) canvas = document.createElement('canvas').getContext('2d');
  if (canvas) canvas.font = `${size}px ${FAMILY}`;
  return chars.map(c => (canvas ? canvas.measureText(c).width : size * 0.6));
}

export function textLength(cfg: TypeConfig): number {
  const chars = Array.from(cfg.text);
  return advances(chars, cfg.size).reduce((s, a) => s + a + cfg.spacing, 0);
}

function polyline(path: SiteNode, flip: boolean): Pt[] {
  const subs = applyCorners(decodeModel(path.attrs['data-fw-vector']) ?? parsePath(path.attrs.d));
  const sub = subs[0];
  if (!sub) return [];
  const use = flip ? reverseSub(sub) : sub;
  const pts = flattenSub(use, 0.25);
  if (use.closed && pts.length) pts.push(pts[0]);
  return pts;
}

interface Sampler { total: number; at: (s: number) => { p: Pt; angle: number } | null; center: Pt }

function sampler(pts: Pt[]): Sampler {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lens[lens.length - 1] || 0;
  const center: Pt = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [0, 0];
  return {
    total,
    center,
    at: s => {
      if (pts.length < 2 || s < 0 || s > total) return null;
      let i = 1;
      while (i < pts.length - 1 && lens[i] < s) i++;
      const a = pts[i - 1], b = pts[i], span = lens[i] - lens[i - 1] || 1, k = Math.max(0, Math.min(1, (s - lens[i - 1]) / span));
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
  };
}

type Mat = [number, number, number, number, number, number];

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];

const translate = (p: Pt): Mat => [1, 0, 0, 1, p[0], p[1]];
const rotate = (a: number): Mat => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];

function glyphMatrix(effect: TypeEffect, p: Pt, angle: number, first: number, sampled: Sampler, flip: boolean): Mat {
  if (effect === 'stair') return translate(p);
  if (effect === 'gravity') {
    let dx = p[0] - sampled.center[0], dy = p[1] - sampled.center[1];
    if (flip) { dx = -dx; dy = -dy; }
    const l = Math.hypot(dx, dy);
    return mul(translate(p), rotate(l < 1e-6 ? angle : Math.atan2(dx / l, -dy / l)));
  }
  if (effect === 'skew') {
    const c = Math.cos(angle), guarded = (c < 0 ? -1 : 1) * Math.max(Math.abs(c), 0.12);
    return mul(translate(p), [guarded, Math.sin(angle), 0, 1, 0, 0]);
  }
  let delta = angle - first;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const tilt = Math.max(-Math.PI, Math.min(Math.PI, delta)) / 2;
  return mul(mul(translate(p), rotate(angle)), [1, 0, Math.sin(tilt) * 0.6, Math.max(0.22, Math.cos(tilt)), 0, 0]);
}

export function typeBuild(site: Site, taken: Set<string>, cfg: TypeConfig, path: SiteNode, fill: string): { cmds: Command[]; group: string } {
  const group = freshId(site, taken, 'typeg');
  const svg = svgOf(site, path.id) ?? '';
  const cmds: Command[] = [{ command: 'node.add', params: { parent: svg, node: { id: group, tag: 'g', name: 'Type on a path', attrs: { 'data-fw-type': JSON.stringify(cfg) } } } }];
  const flip = cfg.flip === 1;
  const font = { fill, 'font-size': String(cfg.size), 'font-family': FAMILY };
  const dy = r4(SHIFT[cfg.align] * cfg.size);
  const addText = (attrs: Record<string, string>, ref: string, offset: string, label: string, pieceAttrs: Record<string, string>): void => {
    const text = freshId(site, taken, 'type');
    const piece = freshId(site, taken, 'typepath');
    cmds.push({ command: 'node.add', params: { parent: group, node: { id: text, tag: 'text', name: 'Type', attrs } } });
    cmds.push({ command: 'node.add', params: { parent: text, node: { id: piece, tag: 'textPath', name: 'Path text', text: label, attrs: { href: `#${ref}`, startOffset: offset, ...pieceAttrs } } } });
  };
  const withShift: Record<string, string> = dy === 0 ? {} : { dy: String(dy) };
  if (cfg.effect === 'rainbow') {
    let ref = path.id;
    if (flip) {
      const guide = freshId(site, taken, 'typeguide');
      const subs = applyCorners(decodeModel(path.attrs['data-fw-vector']) ?? parsePath(path.attrs.d));
      cmds.push({ command: 'node.add', params: { parent: group, node: { id: guide, tag: 'path', name: 'Type guide', attrs: { id: guide, d: formatPath(subs[0] ? [reverseSub(subs[0])] : []), fill: 'none', stroke: 'none' } } } });
      ref = guide;
    }
    const attrs: Record<string, string> = { ...font };
    if (cfg.spacing) attrs['letter-spacing'] = String(cfg.spacing);
    addText(attrs, ref, `${Math.round(cfg.offset * 100) / 100}%`, cfg.text, withShift);
    return { cmds, group };
  }
  const carrier = freshId(site, taken, 'typecarrier');
  cmds.push({ command: 'node.add', params: { parent: group, node: { id: carrier, tag: 'path', name: 'Type guide', attrs: { id: carrier, d: CARRIER, fill: 'none', stroke: 'none' } } } });
  const chars = Array.from(cfg.text).slice(0, GLYPH_LIMIT);
  const widths = advances(chars, cfg.size);
  const sampled = sampler(polyline(path, flip));
  const first = sampled.at(0)?.angle ?? 0;
  let run = (cfg.offset / 100) * sampled.total;
  chars.forEach((ch, i) => {
    const centre = run + widths[i] / 2;
    run += widths[i] + cfg.spacing;
    const hit = ch.trim() ? sampled.at(centre) : null;
    if (!hit) return;
    const m = glyphMatrix(cfg.effect, hit.p, hit.angle, first, sampled, flip);
    addText({ ...font, 'text-anchor': 'middle', transform: `matrix(${m.map(r4).join(' ')})` }, carrier, '50%', ch, withShift);
  });
  return { cmds, group };
}

function lengthOf(subs: SubPath[]): number {
  const sub = subs[0];
  if (!sub) return 0;
  const pts = flattenSub(sub, 0.25);
  if (sub.closed && pts.length) pts.push(pts[0]);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

export function bracketParam(subs: SubPath[], cfg: TypeConfig): number {
  const total = lengthOf(subs);
  if (!total) return 0;
  const s = Math.max(0, Math.min(total, (cfg.offset / 100) * total + textLength(cfg) / 2));
  return cfg.flip ? 1 - s / total : s / total;
}

export function offsetFromParam(subs: SubPath[], cfg: TypeConfig, t: number, flip: boolean): number {
  const total = lengthOf(subs);
  if (!total) return cfg.offset;
  const s = (flip ? 1 - t : t) * total;
  return Math.max(0, Math.min(100, ((s - textLength(cfg) / 2) / total) * 100));
}

export interface TypeOptions { text: string; size: number; offset: number; effect: TypeEffect; flip: boolean; align: TypeAlign; spacing: number }

function fillFor(site: Site, path: SiteNode, previous?: SiteNode): string {
  const old = previous && Object.values(site.nodes).find(n => n.tag === 'text' && parentOf(site, n.id) === previous.id);
  if (old?.attrs.fill) return old.attrs.fill;
  const color = path.attrs.stroke && path.attrs.stroke !== 'none' ? path.attrs.stroke : path.attrs.fill && path.attrs.fill !== 'none' ? path.attrs.fill : '#ffffff';
  return colorToHex(color, '#ffffff');
}

export function typeCommands(site: Site, pathId: string, options: TypeOptions, notify: (message: string) => void): Command[] {
  const path = site.nodes[pathId];
  const svg = svgOf(site, pathId);
  if (!path || path.tag !== 'path' || !svg) { notify('Select a path to set type on.'); return []; }
  const text = options.text.replace(/[<>]/g, '').slice(0, 500);
  const previous = typeHolder(site, pathId);
  const legacy = legacyHolder(site, pathId);
  const cmds: Command[] = [];
  if (previous) cmds.push(removeNode(previous.id));
  if (legacy && site.nodes[legacy]) cmds.push(removeNode(legacy));
  if (!text) return cmds;
  const cfg: TypeConfig = {
    v: 1, path: pathId, text, size: Math.max(1, Math.min(500, options.size)), offset: Math.max(0, Math.min(100, options.offset)), effect: options.effect,
    flip: options.flip ? 1 : 0, align: options.align, spacing: Math.max(-100, Math.min(100, options.spacing))
  };
  const taken = new Set<string>();
  const built = typeBuild(site, taken, cfg, path, fillFor(site, path, previous));
  const parent = parentOf(site, pathId) ?? svg;
  const index = site.nodes[parent].children.indexOf(pathId) + 1;
  if (path.attrs.id !== pathId) cmds.unshift(updateAttrs(pathId, { id: pathId }));
  cmds.push(...built.cmds, moveNode(built.group, parent, index));
  return cmds;
}

export function typeFixes(site: Site, cmds: Command[]): Command[] {
  const out: Command[] = [];
  const removed = new Set(cmds.filter(c => c.command === 'node.remove').map(c => (c.params as { id: string }).id));
  const taken = new Set<string>();
  for (const id of removed) {
    const holder = site.nodes[id]?.tag === 'path' ? typeHolder(site, id) : undefined;
    if (holder && !removed.has(holder.id)) out.push(removeNode(holder.id));
  }
  const patched = new Map<string, Record<string, string | null>>();
  for (const c of cmds) {
    if (c.command !== 'node.update') continue;
    const params = c.params as { id: string; patch?: { attrs?: Record<string, string | null> } };
    if (site.nodes[params.id]?.tag === 'path' && params.patch?.attrs && ('d' in params.patch.attrs || 'data-fw-vector' in params.patch.attrs)) patched.set(params.id, { ...patched.get(params.id), ...params.patch.attrs });
  }
  for (const [id, patch] of patched) {
    const holder = typeHolder(site, id);
    const cfg = readType(holder);
    if (!holder || !cfg || removed.has(holder.id) || (cfg.effect === 'rainbow' && !cfg.flip)) continue;
    const attrs = { ...site.nodes[id].attrs };
    for (const [name, value] of Object.entries(patch)) if (value === null) delete attrs[name]; else attrs[name] = value;
    const path: SiteNode = { ...site.nodes[id], attrs };
    const parent = parentOf(site, holder.id) ?? svgOf(site, id) ?? '';
    const index = site.nodes[parent]?.children.indexOf(holder.id) ?? 0;
    const built = typeBuild(site, taken, cfg, path, fillFor(site, path, holder));
    out.push(removeNode(holder.id), ...built.cmds, moveNode(built.group, parent, index));
  }
  return out;
}
