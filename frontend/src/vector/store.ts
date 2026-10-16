import type { Command, Site, SiteNode } from '../types';
import { decodeModel, encodeModel, parsePath, type SubPath } from './geometry';
import { renderPath } from './corners';

export type Cap = 'butt' | 'round' | 'square';
export type Join = 'miter' | 'round' | 'bevel';

export interface Paint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cap: Cap;
  join: Join;
  miter: number;
  dash: string;
  dashOffset: number;
  fillRule: 'nonzero' | 'evenodd';
  opacity: number;
}

export interface Shape { id: string; svg: string; subs: SubPath[]; paint: Paint }

export const defaultPaint: Paint = { fill: '#f97316', stroke: 'none', strokeWidth: 2, cap: 'butt', join: 'miter', miter: 4, dash: '', dashOffset: 0, fillRule: 'nonzero', opacity: 1 };

export const VECTOR_TAGS = new Set(['svg', 'g', 'path']);
export const CONTAINER_TAGS = new Set(['div', 'main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'figure', 'li', 'ul', 'ol', 'a', 'button', 'span', 'form', 'fieldset', 'details', 'blockquote']);

export function parentOf(site: Site, id: string): string | undefined {
  for (const node of Object.values(site.nodes)) if (node.children.includes(id)) return node.id;
  return undefined;
}

export function svgOf(site: Site, id: string): string | undefined {
  let current: string | undefined = id;
  while (current) {
    const node: SiteNode | undefined = site.nodes[current];
    if (!node) return undefined;
    if (node.tag === 'svg') return node.id;
    if (!VECTOR_TAGS.has(node.tag)) return undefined;
    current = parentOf(site, current);
  }
  return undefined;
}

export function pathIds(site: Site, root: string): string[] {
  const out: string[] = [];
  const visit = (id: string): void => {
    const node = site.nodes[id];
    if (!node) return;
    if (node.tag === 'path') out.push(id);
    node.children.forEach(visit);
  };
  visit(root);
  return out;
}

export function viewBoxOf(node: SiteNode): [number, number, number, number] {
  const parts = (node.attrs.viewBox || '').split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) return [parts[0], parts[1], parts[2], parts[3]];
  const w = parseFloat(node.attrs.width || '') || 100, h = parseFloat(node.attrs.height || '') || 100;
  return [0, 0, w, h];
}

const number = (value: string | undefined, fallback: number): number => {
  const parsed = value === undefined ? NaN : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function paintOf(node: SiteNode): Paint {
  const a = node.attrs;
  const cap = a['stroke-linecap'], join = a['stroke-linejoin'];
  return {
    fill: a.fill ?? '#000000',
    stroke: a.stroke ?? 'none',
    strokeWidth: number(a['stroke-width'], 1),
    cap: cap === 'round' || cap === 'square' ? cap : 'butt',
    join: join === 'round' || join === 'bevel' ? join : 'miter',
    miter: number(a['stroke-miterlimit'], 4),
    dash: a['stroke-dasharray'] && a['stroke-dasharray'] !== 'none' ? a['stroke-dasharray'] : '',
    dashOffset: number(a['stroke-dashoffset'], 0),
    fillRule: a['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
    opacity: number(a.opacity, 1)
  };
}

export function paintAttrs(paint: Paint): Record<string, string> {
  const out: Record<string, string> = {
    fill: paint.fill,
    stroke: paint.stroke,
    'fill-rule': paint.fillRule
  };
  if (paint.stroke !== 'none') {
    out['stroke-width'] = String(paint.strokeWidth);
    out['stroke-linecap'] = paint.cap;
    out['stroke-linejoin'] = paint.join;
    out['stroke-miterlimit'] = String(paint.miter);
  }
  if (paint.dash.trim()) out['stroke-dasharray'] = paint.dash.trim().replace(/\s+/g, ' ');
  if (paint.dashOffset) out['stroke-dashoffset'] = String(paint.dashOffset);
  if (paint.opacity < 1) out.opacity = String(paint.opacity);
  return out;
}

export function geometryAttrs(subs: SubPath[]): Record<string, string> {
  const text = encodeModel(subs);
  return { d: renderPath(decodeModel(text) ?? subs), 'data-fw-vector': text };
}

export function readShape(site: Site, id: string): Shape | undefined {
  const node = site.nodes[id];
  if (!node || node.tag !== 'path') return undefined;
  const svg = svgOf(site, id);
  if (!svg) return undefined;
  let subs = decodeModel(node.attrs['data-fw-vector']);
  if (!subs || renderPath(subs) !== (node.attrs.d ?? '')) subs = parsePath(node.attrs.d);
  return { id, svg, subs, paint: paintOf(node) };
}

export function freshId(site: Site, taken: Set<string>, prefix: string): string {
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    if (!site.nodes[id] && !taken.has(id)) { taken.add(id); return id; }
  }
}

export function updateGeometry(id: string, subs: SubPath[]): Command {
  return { command: 'node.update', params: { id, patch: { attrs: geometryAttrs(subs) } } };
}

export function updateAttrs(id: string, attrs: Record<string, string | null>): Command {
  return { command: 'node.update', params: { id, patch: { attrs } } };
}

export function addPath(parent: string, id: string, subs: SubPath[], paint: Paint, name = 'Path'): Command {
  return { command: 'node.add', params: { parent, node: { id, tag: 'path', name, attrs: { ...geometryAttrs(subs), ...paintAttrs(paint) } } } };
}

export function addSvg(parent: string, id: string, box: { left: number; top: number; width: number; height: number }, name = 'Vector'): Command {
  const w = Math.max(1, Math.round(box.width * 100) / 100), h = Math.max(1, Math.round(box.height * 100) / 100);
  return {
    command: 'node.add',
    params: {
      parent,
      node: {
        id, tag: 'svg', name,
        attrs: { viewBox: `0 0 ${w} ${h}`, width: String(w), height: String(h) },
        styles: { position: 'absolute', left: `${Math.round(box.left * 100) / 100}px`, top: `${Math.round(box.top * 100) / 100}px`, overflow: 'visible' }
      }
    }
  };
}

export function removeNode(id: string): Command {
  return { command: 'node.remove', params: { id } };
}

export function moveNode(id: string, parent: string, index: number): Command {
  return { command: 'node.move', params: { id, parent, index } };
}
