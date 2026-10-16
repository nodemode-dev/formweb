import type { Command, Site, SiteNode } from '../types';
import { applyCorners } from './corners';
import { dist, pathBounds, type Box, type Pt } from './geometry';
import type { Host } from './host';
import { freshId, refOf, removeNode, svgOf, updateAttrs, type Shape } from './store';

export type GradientKind = 'linear' | 'radial';
export type Target = 'fill' | 'stroke';
export type Mat = [number, number, number, number, number, number];

export interface Stop { color: string; offset: number; opacity: number }
export interface Gradient { kind: GradientKind; p0: Pt; p1: Pt; stops: Stop[]; spread: 'pad' | 'reflect' | 'repeat' }

const r2 = (v: number): string => String(Math.round(v * 100) / 100);
const r3 = (v: number): string => String(Math.round(v * 1000) / 1000);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function colorToHex(value: string, fallback = '#000000'): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map(v => clamp(Number(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

export function mixColor(a: string, b: string, t: number): string {
  const ca = colorToHex(a), cb = colorToHex(b);
  const channel = (i: number): string => Math.round(parseInt(ca.slice(i, i + 2), 16) * (1 - t) + parseInt(cb.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function stopColorAt(stops: Stop[], t: number): { color: string; opacity: number } {
  const s = stops.slice().sort((a, b) => a.offset - b.offset);
  if (t <= s[0].offset) return { color: s[0].color, opacity: s[0].opacity };
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].offset) {
      const span = s[i].offset - s[i - 1].offset || 1, k = (t - s[i - 1].offset) / span;
      return { color: mixColor(s[i - 1].color, s[i].color, k), opacity: s[i - 1].opacity + (s[i].opacity - s[i - 1].opacity) * k };
    }
  }
  return { color: s[s.length - 1].color, opacity: s[s.length - 1].opacity };
}

export function gradientCss(g: Gradient): string {
  const parts = g.stops.slice().sort((a, b) => a.offset - b.offset).map(s => `color-mix(in srgb, ${colorToHex(s.color)} ${Math.round(s.opacity * 100)}%, transparent) ${Math.round(s.offset * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export function angleOf(g: Gradient): number {
  return (Math.atan2(g.p1[1] - g.p0[1], g.p1[0] - g.p0[0]) * 180) / Math.PI;
}

export function withAngle(g: Gradient, degrees: number): Gradient {
  const mid: Pt = [(g.p0[0] + g.p1[0]) / 2, (g.p0[1] + g.p1[1]) / 2];
  const half = dist(g.p0, g.p1) / 2, a = (degrees * Math.PI) / 180;
  return { ...g, p0: [mid[0] - Math.cos(a) * half, mid[1] - Math.sin(a) * half], p1: [mid[0] + Math.cos(a) * half, mid[1] + Math.sin(a) * half] };
}

export function stopPoint(g: Gradient, offset: number): Pt {
  return [g.p0[0] + (g.p1[0] - g.p0[0]) * offset, g.p0[1] + (g.p1[1] - g.p0[1]) * offset];
}

export function offsetAt(g: Gradient, p: Pt): number {
  const dx = g.p1[0] - g.p0[0], dy = g.p1[1] - g.p0[1], l2 = dx * dx + dy * dy || 1;
  return clamp(((p[0] - g.p0[0]) * dx + (p[1] - g.p0[1]) * dy) / l2, 0, 1);
}

export function defaultGradient(kind: GradientKind, box: Box | null, color: string): Gradient {
  const b = box ?? { x: 0, y: 0, w: 100, h: 100 };
  const start = colorToHex(color, '#f97316');
  const end = start === '#ffffff' ? '#000000' : '#ffffff';
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const p0: Pt = kind === 'linear' ? [b.x, cy] : [cx, cy];
  const p1: Pt = kind === 'linear' ? [b.x + b.w, cy] : [cx + Math.max(b.w, b.h) / 2, cy];
  return { kind, p0, p1, stops: [{ color: start, offset: 0, opacity: 1 }, { color: end, offset: 1, opacity: 1 }], spread: 'pad' };
}

export function gradientNode(site: Site, svgId: string, ref: string): SiteNode | undefined {
  const visit = (id: string, depth: number): SiteNode | undefined => {
    const node = site.nodes[id];
    if (!node || depth > 32) return undefined;
    if ((node.tag === 'linearGradient' || node.tag === 'radialGradient') && node.attrs.id === ref) return node;
    for (const child of node.children) { const found = visit(child, depth + 1); if (found) return found; }
    return undefined;
  };
  return visit(svgId, 0);
}

function parseCoordinate(value: string | undefined, fallback: number, unit: number): number {
  if (value === undefined) return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return value.trim().endsWith('%') ? (n / 100) * unit : n;
}

export function readGradient(site: Site, svgId: string, ref: string, box?: Box | null): { node: SiteNode; gradient: Gradient } | undefined {
  const node = gradientNode(site, svgId, ref);
  if (!node) return undefined;
  const a = node.attrs;
  const bbox = a.gradientUnits === 'userSpaceOnUse' ? null : box ?? { x: 0, y: 0, w: 1, h: 1 };
  const mapX = (v: number): number => (bbox ? bbox.x + v * bbox.w : v);
  const mapY = (v: number): number => (bbox ? bbox.y + v * bbox.h : v);
  const unitX = bbox ? 1 : 100, unitY = bbox ? 1 : 100;
  const stops: Stop[] = node.children.map(id => site.nodes[id]).filter((s): s is SiteNode => !!s && s.tag === 'stop').map(s => {
    const off = s.attrs.offset ?? '0';
    const n = parseFloat(off);
    return { color: s.attrs['stop-color'] ?? '#000000', offset: clamp(off.endsWith('%') ? n / 100 : n, 0, 1) || 0, opacity: clamp(parseFloat(s.attrs['stop-opacity'] ?? '1'), 0, 1) };
  });
  if (stops.length < 2) stops.push({ color: stops[0]?.color ?? '#000000', offset: 1, opacity: 1 });
  const spread = a.spreadMethod === 'reflect' || a.spreadMethod === 'repeat' ? a.spreadMethod : 'pad';
  if (node.tag === 'linearGradient') {
    const p0: Pt = [mapX(parseCoordinate(a.x1, 0, unitX)), mapY(parseCoordinate(a.y1, 0, unitY))];
    const p1: Pt = [mapX(parseCoordinate(a.x2, bbox ? 1 : 100, unitX)), mapY(parseCoordinate(a.y2, 0, unitY))];
    return { node, gradient: { kind: 'linear', p0, p1, stops, spread } };
  }
  const cx = mapX(parseCoordinate(a.cx, bbox ? 0.5 : 50, unitX)), cy = mapY(parseCoordinate(a.cy, bbox ? 0.5 : 50, unitY));
  const r = parseCoordinate(a.r, bbox ? 0.5 : 50, unitX) * (bbox ? bbox.w : 1);
  return { node, gradient: { kind: 'radial', p0: [cx, cy], p1: [cx + r, cy], stops, spread } };
}

export function gradientAttrs(g: Gradient, id: string): Record<string, string> {
  const base: Record<string, string> = { id, gradientUnits: 'userSpaceOnUse' };
  if (g.spread !== 'pad') base.spreadMethod = g.spread;
  if (g.kind === 'linear') return { ...base, x1: r2(g.p0[0]), y1: r2(g.p0[1]), x2: r2(g.p1[0]), y2: r2(g.p1[1]) };
  return { ...base, cx: r2(g.p0[0]), cy: r2(g.p0[1]), r: r2(Math.max(0.01, dist(g.p0, g.p1))), fx: r2(g.p0[0]), fy: r2(g.p0[1]) };
}

export function stopAttrs(s: Stop): Record<string, string> {
  return { offset: r3(clamp(s.offset, 0, 1)), 'stop-color': colorToHex(s.color), 'stop-opacity': r3(clamp(s.opacity, 0, 1)) };
}

const tagOf = (g: Gradient): string => (g.kind === 'linear' ? 'linearGradient' : 'radialGradient');

export function createGradient(site: Site, taken: Set<string>, svgId: string, g: Gradient, id = freshId(site, taken, 'grad')): { id: string; cmds: Command[] } {
  const cmds: Command[] = [{ command: 'node.add', params: { parent: svgId, node: { id, tag: tagOf(g), name: 'Gradient', attrs: gradientAttrs(g, id) } } }];
  g.stops.forEach(stop => cmds.push({ command: 'node.add', params: { parent: id, node: { id: freshId(site, taken, 'stop'), tag: 'stop', name: 'Stop', attrs: stopAttrs(stop) } } }));
  return { id, cmds };
}

export function syncGradient(site: Site, taken: Set<string>, node: SiteNode, g: Gradient): Command[] {
  const svg = svgOf(site, node.id);
  if (!svg) return [];
  if (node.tag !== tagOf(g)) return [removeNode(node.id), ...createGradient(site, taken, svg, g, node.id).cmds];
  const stops = node.children.map(id => site.nodes[id]).filter((s): s is SiteNode => !!s && s.tag === 'stop');
  const cmds: Command[] = [updateAttrs(node.id, { ...gradientAttrs(g, node.id), ...(g.spread === 'pad' ? { spreadMethod: null } : {}) })];
  if (stops.length === g.stops.length) {
    stops.forEach((stop, i) => cmds.push(updateAttrs(stop.id, stopAttrs(g.stops[i]))));
    return cmds;
  }
  stops.forEach(stop => cmds.push(removeNode(stop.id)));
  g.stops.forEach(stop => cmds.push({ command: 'node.add', params: { parent: node.id, node: { id: freshId(site, taken, 'stop'), tag: 'stop', name: 'Stop', attrs: stopAttrs(stop) } } }));
  return cmds;
}

export function boxOf(shape: Shape): Box | null {
  return pathBounds(applyCorners(shape.subs));
}

export function targetOf(shape: Shape, target: Target): string {
  return target === 'fill' ? shape.paint.fill : shape.paint.stroke;
}

export function isReferenced(site: Site, ref: string, except: Set<string>): boolean {
  return Object.values(site.nodes).some(n => !except.has(n.id) && (refOf(n.attrs.fill) === ref || refOf(n.attrs.stroke) === ref));
}

export function readFor(host: Host, shape: Shape, target: Target): { node: SiteNode; gradient: Gradient } | undefined {
  const ref = refOf(targetOf(shape, target));
  return ref ? readGradient(host.site(), shape.svg, ref, boxOf(shape)) : undefined;
}

export function setPaintKind(host: Host, target: Target, kind: 'solid' | GradientKind, shapes: Shape[]): Command[] {
  const site = host.site();
  const taken = new Set<string>();
  const cmds: Command[] = [];
  const dropped = new Set<string>(shapes.map(s => s.id));
  for (const shape of shapes) {
    const ref = refOf(targetOf(shape, target));
    const existing = ref ? readGradient(site, shape.svg, ref, boxOf(shape)) : undefined;
    if (kind === 'solid') {
      if (!existing) continue;
      cmds.push(updateAttrs(shape.id, { [target]: colorToHex(existing.gradient.stops[0].color) }));
      if (!isReferenced(site, ref!, dropped)) cmds.push(removeNode(existing.node.id));
      continue;
    }
    if (existing && existing.gradient.kind === kind) continue;
    const base = existing?.gradient ?? defaultGradient(kind, boxOf(shape), targetOf(shape, target) === 'none' ? host.paint().fill : targetOf(shape, target));
    const next: Gradient = existing ? { ...defaultGradient(kind, boxOf(shape), '#000000'), stops: base.stops, spread: base.spread } : base;
    const made = createGradient(site, taken, shape.svg, { ...next, kind });
    cmds.push(...made.cmds, updateAttrs(shape.id, { [target]: `url(#${made.id})` }));
    if (existing && !isReferenced(site, ref!, dropped)) cmds.push(removeNode(existing.node.id));
  }
  return cmds;
}

export function editGradient(host: Host, target: Target, shapes: Shape[], change: (g: Gradient, shape: Shape) => void): Command[] {
  const taken = new Set<string>();
  const cmds: Command[] = [];
  for (const shape of shapes) {
    const found = readFor(host, shape, target);
    if (!found) continue;
    const next: Gradient = { ...found.gradient, stops: found.gradient.stops.map(s => ({ ...s })), p0: [...found.gradient.p0], p1: [...found.gradient.p1] };
    change(next, shape);
    next.stops.sort((a, b) => a.offset - b.offset);
    cmds.push(...syncGradient(host.site(), taken, found.node, next));
  }
  return cmds;
}

export function mapGradient(g: Gradient, m: Mat): Gradient {
  const apply = (p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  return { ...g, p0: apply(g.p0), p1: apply(g.p1) };
}

export function transformDefsCommands(host: Host, ids: string[], matrix: (id: string) => Mat | undefined): Command[] {
  const site = host.site();
  const taken = new Set<string>();
  const done = new Set<string>();
  const cmds: Command[] = [];
  for (const id of ids) {
    const node = site.nodes[id];
    const svg = node && svgOf(site, id);
    const m = matrix(id);
    if (!node || !svg || !m) continue;
    for (const attr of ['fill', 'stroke']) {
      const ref = refOf(node.attrs[attr]);
      if (!ref || done.has(ref)) continue;
      const found = readGradient(site, svg, ref);
      if (!found || found.node.attrs.gradientUnits !== 'userSpaceOnUse') continue;
      done.add(ref);
      cmds.push(...syncGradient(site, taken, found.node, mapGradient(found.gradient, m)));
    }
  }
  return cmds;
}
