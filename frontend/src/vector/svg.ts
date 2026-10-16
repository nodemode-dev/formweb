import type { Site } from '../types';
import { applyCorners, renderPath } from './corners';
import { decodeModel, ellipsePath, linePath, mapPath, parsePath, pathBounds, polyPath, rectPath, type Pt, type SubPath } from './geometry';
import { paintOf, svgOf, type Paint } from './store';

export interface ImportedPath { subs: SubPath[]; paint: Paint; name: string }
export interface ImportedSvg { width: number; height: number; paths: ImportedPath[] }

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

const EXPORT_ATTRS = ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'transform', 'vector-effect', 'opacity', 'data-fw-vector'];
const STYLE_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'opacity', 'fill-opacity', 'stroke-opacity']);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

export function safePaint(value: string): boolean {
  if (!value || value.length > 96 || value.trim() !== value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('#')) return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(lower);
  if (/^[a-z]{1,24}$/.test(lower)) return lower !== 'url';
  if (/^var\(--[a-z0-9_-]+\)$/.test(lower)) return true;
  return /^(?:rgb|rgba|hsl|hsla)\([0-9a-z .,%/+-]+\)$/.test(lower);
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function nodeMarkup(site: Site, id: string, root = false): string {
  const node = site.nodes[id];
  if (!node || !['svg', 'g', 'path'].includes(node.tag)) return '';
  const names = node.tag === 'svg' ? ['viewBox', 'width', 'height', ...EXPORT_ATTRS.filter(n => n !== 'd')] : EXPORT_ATTRS.filter(n => node.tag === 'path' || n !== 'd');
  const attrs = names.filter(n => node.attrs[n] !== undefined).map(n => ` ${n}="${escapeAttr(node.attrs[n])}"`).join('');
  const open = node.tag === 'svg' && root ? ` xmlns="http://www.w3.org/2000/svg"` : '';
  const children = node.children.map(child => nodeMarkup(site, child)).join('');
  return `<${node.tag}${open}${attrs}>${children}</${node.tag}>`;
}

export function exportSvg(site: Site, ids: string[]): string {
  const svgIds = [...new Set(ids.map(id => svgOf(site, id)).filter((id): id is string => !!id))];
  if (ids.length === 1 && site.nodes[ids[0]]?.tag === 'svg') return nodeMarkup(site, ids[0], true);
  if (!svgIds.length) return '';
  const paths = ids.filter(id => site.nodes[id]?.tag === 'path');
  const subs = paths.flatMap(id => applyCorners(decodeModel(site.nodes[id].attrs['data-fw-vector']) ?? parsePath(site.nodes[id].attrs.d)));
  const box = pathBounds(subs);
  const pad = Math.max(0, ...paths.map(id => (paintOf(site.nodes[id]).stroke === 'none' ? 0 : paintOf(site.nodes[id]).strokeWidth / 2)));
  const x = (box?.x ?? 0) - pad, y = (box?.y ?? 0) - pad, w = Math.max(1, (box?.w ?? 1) + pad * 2), h = Math.max(1, (box?.h ?? 1) + pad * 2);
  const r = (v: number): string => String(Math.round(v * 100) / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">${paths.map(id => nodeMarkup(site, id)).join('')}</svg>`;
}

const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
];

function parseTransform(text: string | null): Mat {
  let m = IDENTITY;
  if (!text) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (const match of text.matchAll(re)) {
    const a = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some(v => !Number.isFinite(v))) continue;
    let t: Mat = IDENTITY;
    if (match[1] === 'matrix' && a.length === 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (match[1] === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (match[1] === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (match[1] === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      t = [c, s, -s, c, 0, 0];
      if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (match[1] === 'skewX') t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (match[1] === 'skewY') t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

const apply = (m: Mat, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const scaleOf = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function transformSubs(subs: SubPath[], m: Mat): SubPath[] {
  if (m.every((v, i) => v === IDENTITY[i])) return subs;
  const k = scaleOf(m);
  const out = mapPath(subs, p => apply(m, p));
  for (const sub of out) for (const n of sub.nodes) if (n.corner && n.corner.mode === 'absolute') n.corner.radius *= k;
  return out;
}

function declarations(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of STYLE_PROPS) { const v = el.getAttribute(name); if (v !== null) out[name] = v.trim(); }
  for (const part of (el.getAttribute('style') || '').split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim(), value = part.slice(at + 1).trim();
    if (STYLE_PROPS.has(name)) out[name] = value;
  }
  return out;
}

function cleanPaint(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (/url\(/i.test(value)) return '#808080';
  return safePaint(value) ? value : fallback;
}

function num(el: Element, name: string, fallback = 0): number {
  const v = parseFloat(el.getAttribute(name) || '');
  return Number.isFinite(v) ? v : fallback;
}

function shapeSubs(el: Element): SubPath[] {
  const tag = el.tagName.toLowerCase();
  if (tag === 'path') {
    const model = decodeModel(el.getAttribute('data-fw-vector') ?? undefined);
    const d = el.getAttribute('d') || '';
    if (model && renderPath(model) === d) return model;
    return parsePath(d);
  }
  if (tag === 'rect') {
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    if (w <= 0 || h <= 0) return [];
    const sub = rectPath(x, y, w, h);
    const radius = Math.min(num(el, 'rx', num(el, 'ry')), w / 2, h / 2);
    if (radius > 0) for (const n of sub.nodes) n.corner = { type: 'round', radius, mode: 'absolute' };
    return [sub];
  }
  if (tag === 'circle') { const r = num(el, 'r'); return r > 0 ? [ellipsePath(num(el, 'cx'), num(el, 'cy'), r, r)] : []; }
  if (tag === 'ellipse') { const rx = num(el, 'rx'), ry = num(el, 'ry'); return rx > 0 && ry > 0 ? [ellipsePath(num(el, 'cx'), num(el, 'cy'), rx, ry)] : []; }
  if (tag === 'line') return [linePath([num(el, 'x1'), num(el, 'y1')], [num(el, 'x2'), num(el, 'y2')])];
  const values = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length < 4 || values.some(v => !Number.isFinite(v))) return [];
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) pts.push([values[i], values[i + 1]]);
  return [polyPath(pts, tag === 'polygon')];
}

export function importSvg(text: string): ImportedSvg {
  if (text.length > 1024 * 1024) throw new Error('SVG is too large.');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('SVG may not contain a DOCTYPE or entities.');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Not a valid SVG document.');
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const hasBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  let width = hasBox ? vb[2] : parseFloat(root.getAttribute('width') || '') || 100;
  let height = hasBox ? vb[3] : parseFloat(root.getAttribute('height') || '') || 100;
  const fit = Math.min(1, 1200 / Math.max(width, height));
  const base: Mat = mul([fit, 0, 0, fit, 0, 0], [1, 0, 0, 1, hasBox ? -vb[0] : 0, hasBox ? -vb[1] : 0]);
  width *= fit;
  height *= fit;
  const paths: ImportedPath[] = [];
  const walk = (el: Element, matrix: Mat, inherited: Record<string, string>, opacity: number): void => {
    if (paths.length >= 500) return;
    const tag = el.tagName.toLowerCase();
    const own = declarations(el);
    if (own.display === 'none' || el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return;
    const style = { ...inherited, ...own };
    const op = opacity * (Number.isFinite(parseFloat(own.opacity)) ? Math.max(0, Math.min(1, parseFloat(own.opacity))) : 1);
    const m = mul(matrix, parseTransform(el.getAttribute('transform')));
    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      const passed = { ...style };
      delete passed.opacity;
      for (const child of Array.from(el.children)) walk(child, m, passed, op);
      return;
    }
    if (!SHAPES.has(tag)) return;
    const subs = transformSubs(shapeSubs(el), m);
    if (!subs.length) return;
    const k = scaleOf(m);
    const rawWidth = parseFloat(style['stroke-width'] ?? '1');
    const dash = (style['stroke-dasharray'] || '').split(/[\s,]+/).map(Number).filter(Number.isFinite).map(v => Math.max(0, v * k));
    const fillOpacity = parseFloat(style['fill-opacity'] ?? '1');
    const paint: Paint = {
      fill: cleanPaint(style.fill, '#000000'),
      stroke: cleanPaint(style.stroke, 'none'),
      strokeWidth: Math.max(0, Math.min(10000, (Number.isFinite(rawWidth) ? rawWidth : 1) * k)),
      cap: style['stroke-linecap'] === 'round' || style['stroke-linecap'] === 'square' ? style['stroke-linecap'] : 'butt',
      join: style['stroke-linejoin'] === 'round' || style['stroke-linejoin'] === 'bevel' ? style['stroke-linejoin'] : 'miter',
      miter: Math.max(1, Math.min(100, parseFloat(style['stroke-miterlimit'] ?? '4') || 4)),
      dash: dash.length && dash.some(v => v > 0) ? dash.slice(0, 16).map(v => Math.round(v * 100) / 100).join(' ') : '',
      dashOffset: 0,
      fillRule: style['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
      opacity: Math.round(Math.max(0, Math.min(1, op * (Number.isFinite(fillOpacity) && style.stroke === undefined ? fillOpacity : 1))) * 1000) / 1000
    };
    paths.push({ subs, paint, name: el.getAttribute('id')?.slice(0, 60) || 'Path' });
  };
  walk(root, base, {}, 1);
  return { width, height, paths };
}
