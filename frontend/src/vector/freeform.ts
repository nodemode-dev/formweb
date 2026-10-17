import type { Command, Site } from '../types';
import { parsePath, pathBounds, type Box } from './geometry';
import { colorToHex } from './gradient';
import { freshId, updateAttrs } from './store';

/* Freeform gradients (Points mode). SVG has no mesh paint, so each colour stop is drawn as a copy of the
   source path filled with a radial gradient that fades from the stop colour to transparent. The source path
   keeps the average colour as its base fill. Stops are stored in the bounding box of the source path (0..1),
   and each gradient uses objectBoundingBox units with a vertical scale so the spread stays circular. */

type Attrs = Record<string, string>;
export type FreeformPoint = [number, number, number];
export interface FreeformSpec { v: 1; src: string; grads: string[]; pts: FreeformPoint[]; cols: string[]; sig: string }
export interface FreeformStop { grad: string | null; x: number; y: number; s: number; c: string }

export const FREEFORM_LIMIT = 20;
export const SPREAD_MIN = 0.02;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEX = /^#[0-9a-f]{6}$/;
const r4 = (v: number): string => String(Math.round(v * 10000) / 10000);
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function readFreeform(raw: string | undefined): FreeformSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<FreeformSpec>;
    const grads = c.grads, pts = c.pts, cols = c.cols;
    if (c.v !== 1 || typeof c.src !== 'string' || !ID.test(c.src) || !Array.isArray(grads) || !Array.isArray(pts) || !Array.isArray(cols)) return null;
    if (!grads.length || grads.length > FREEFORM_LIMIT || pts.length !== grads.length || cols.length !== grads.length || new Set(grads).size !== grads.length) return null;
    if (!grads.every(id => typeof id === 'string' && ID.test(id) && id !== c.src) || !cols.every(col => typeof col === 'string' && HEX.test(col))) return null;
    if (!pts.every(p => Array.isArray(p) && p.length === 3 && unit(p[0]) && unit(p[1]) && unit(p[2]) && p[2] >= SPREAD_MIN)) return null;
    if (typeof c.sig !== 'string' || !/^[0-9a-f]{8}$/.test(c.sig)) return null;
    return { v: 1, src: c.src, grads, pts, cols, sig: c.sig };
  } catch { return null; }
}

export const freeformSig = (s: FreeformSpec, src: Attrs): string => hash(JSON.stringify(['freeform', s.src, s.grads, s.pts, s.cols, src.d ?? '', src.transform ?? '', src['fill-rule'] ?? '']));

export function sourceBox(src: Attrs): Box | null {
  const box = pathBounds(parsePath(src.d));
  return box && box.w > 0 && box.h > 0 ? box : null;
}

export function averageColor(cols: string[]): string {
  if (!cols.length) return '#808080';
  const sum = [0, 0, 0];
  for (const col of cols) { const hex = colorToHex(col, '#808080'); for (let k = 0; k < 3; k++) sum[k] += parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16); }
  return `#${sum.map(v => Math.round(v / cols.length).toString(16).padStart(2, '0')).join('')}`;
}

/* The gradient and its two stops for stop i, sized to the source path's bounding box. */
export function freeformGradient(src: Attrs, spec: Pick<FreeformSpec, 'pts' | 'cols'>, i: number): { attrs: Record<string, string | null>; stops: Attrs[] } | null {
  const box = sourceBox(src);
  const pt = spec.pts[i], col = spec.cols[i];
  if (!box || !pt || !col) return null;
  const [x, y, s] = pt;
  const k = box.w / box.h;
  const radius = Math.max(1, s * Math.hypot(box.w, box.h)) / box.w;
  return {
    attrs: { gradientUnits: 'objectBoundingBox', cx: r4(x), cy: r4(y), fx: r4(x), fy: r4(y), r: r4(radius), gradientTransform: `matrix(1 0 0 ${r4(k)} 0 ${r4(y - k * y)})`, spreadMethod: null },
    stops: [{ offset: '0', 'stop-color': col, 'stop-opacity': '1' }, { offset: '0.35', 'stop-color': col, 'stop-opacity': '0.6' }, { offset: '1', 'stop-color': col, 'stop-opacity': '0' }],
  };
}

export function freeformOutputs(src: Attrs, spec: FreeformSpec): Attrs[] {
  return spec.grads.map(id => ({ d: src.d ?? '', ...(src.transform ? { transform: src.transform } : {}), ...(src['fill-rule'] ? { 'fill-rule': src['fill-rule'] } : {}), fill: `url(#${id})`, stroke: 'none' }));
}

export function stopsOf(spec: FreeformSpec): FreeformStop[] {
  return spec.grads.map((grad, i) => ({ grad, x: spec.pts[i][0], y: spec.pts[i][1], s: spec.pts[i][2], c: spec.cols[i] }));
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/* Commands that store a new stop list: new stops get a gradient node in the svg, the source takes the average
   colour, and the live refresh rebuilds the layers and drops gradients no stop uses. */
export function writeStops(site: Site, svg: string, group: string, spec: FreeformSpec, stops: FreeformStop[], src: Attrs): Command[] {
  const list = stops.slice(0, FREEFORM_LIMIT);
  if (!list.length) return [];
  const taken = new Set<string>();
  const cmds: Command[] = [];
  const grads = list.map(stop => {
    if (stop.grad) return stop.grad;
    const id = freshId(site, taken, 'ffgrad');
    taken.add(id);
    cmds.push({ command: 'node.add', params: { parent: svg, node: { id, tag: 'radialGradient', name: 'Freeform stop', attrs: { id } } } });
    for (const offset of ['0', '0.35', '1']) {
      const sid = freshId(site, taken, 'stop');
      taken.add(sid);
      cmds.push({ command: 'node.add', params: { parent: id, node: { id: sid, tag: 'stop', name: 'Stop', attrs: { offset, 'stop-color': colorToHex(stop.c, '#808080') } } } });
    }
    return id;
  });
  const next: FreeformSpec = { v: 1, src: spec.src, grads, pts: list.map(s => [r4n(clamp01(s.x)), r4n(clamp01(s.y)), r4n(Math.max(SPREAD_MIN, clamp01(s.s)))]), cols: list.map(s => colorToHex(s.c, '#808080')), sig: '00000000' };
  const fill = averageColor(next.cols);
  return [...cmds, ...(src.fill !== fill ? [updateAttrs(spec.src, { fill })] : []), updateAttrs(group, { 'data-fw-freeform': JSON.stringify(next) })];
}

const r4n = (v: number): number => Math.round(v * 10000) / 10000;

/* Default stops when a freeform gradient is first applied: four points around the middle in colours turned
   around the hue wheel from the current fill, plus the fill itself in the centre. */
export function defaultStops(fill: string): FreeformStop[] {
  const base = colorToHex(fill, '#f97316');
  const spots: [number, number][] = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]];
  return spots.map(([x, y], i) => ({ grad: null, x, y, s: 0.5, c: i === 0 ? base : turnHue(base, i * 72) }));
}

export function turnHue(hex: string, degrees: number): string {
  const c = colorToHex(hex, '#808080');
  const [r, g, b] = [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  if (s < 0.15) { s = 0.7; }
  const hue = (((h + degrees) % 360) + 360) % 360;
  const light = Math.max(0.35, Math.min(0.65, l));
  const chroma = (1 - Math.abs(2 * light - 1)) * s, xx = chroma * (1 - Math.abs(((hue / 60) % 2) - 1)), m = light - chroma / 2;
  const [r1, g1, b1] = hue < 60 ? [chroma, xx, 0] : hue < 120 ? [xx, chroma, 0] : hue < 180 ? [0, chroma, xx] : hue < 240 ? [0, xx, chroma] : hue < 300 ? [xx, 0, chroma] : [chroma, 0, xx];
  return `#${[r1, g1, b1].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
