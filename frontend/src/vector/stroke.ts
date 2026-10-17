import type { Command, Site, SiteNode } from '../types';
import { applyCorners } from './corners';
import { decodeModel, formatPath, parsePath } from './geometry';
import { freshId, moveNode, refOf, removeNode, svgOf, updateAttrs, type Shape } from './store';
import { normalizePoint, variableOutline, widthPreset, type WidthPoint, type WidthPreset } from './widthprofile';

const BIG = 'M-50000 -50000H50000V50000H-50000Z';

function patchesOf(cmds: Command[], site: Site): Map<string, Record<string, string | null>> {
  const found = new Map<string, Record<string, string | null>>();
  for (const c of cmds) {
    if (c.command !== 'node.update') continue;
    const params = c.params as { id: string; patch?: { attrs?: Record<string, string | null> } };
    if (site.nodes[params.id]?.tag === 'path' && params.patch?.attrs) found.set(params.id, { ...found.get(params.id), ...params.patch.attrs });
  }
  return found;
}

function merged(node: SiteNode, patch: Record<string, string | null>): Record<string, string> {
  const attrs = { ...node.attrs };
  for (const [name, value] of Object.entries(patch)) if (value === null) delete attrs[name]; else attrs[name] = value;
  return attrs;
}

export function alignFixes(site: Site, cmds: Command[]): Command[] {
  const out: Command[] = [];
  const taken = new Set<string>();
  const up = new Map<string, string>();
  for (const n of Object.values(site.nodes)) for (const child of n.children) up.set(child, n.id);
  for (const c of cmds) {
    if (c.command !== 'node.remove') continue;
    const node = site.nodes[(c.params as { id: string }).id];
    const ref = node && refOf(node.attrs['clip-path']);
    const holder = ref?.startsWith('fwa-') ? Object.values(site.nodes).find(n => n.tag === 'clipPath' && n.attrs.id === ref) : undefined;
    const gone = (id: string): boolean => {
      for (let cur: string | undefined = id; cur; cur = up.get(cur)) {
        if (cmds.some(o => o.command === 'node.remove' && (o.params as { id: string }).id === cur)) return true;
        if (cmds.some(o => o.command === 'node.move' && (o.params as { id: string }).id === cur)) return false;
      }
      return false;
    };
    const shared = Object.values(site.nodes).some(n => n.id !== node.id && n.attrs['clip-path'] === node.attrs['clip-path'] && !gone(n.id));
    if (holder && !shared && !gone(holder.id) && !out.some(o => o.command === 'node.remove' && (o.params as { id: string }).id === holder.id)) out.push(removeNode(holder.id));
  }
  for (const [id, patch] of patchesOf(cmds, site)) {
    const node = site.nodes[id];
    const attrs = merged(node, patch);
    const align = attrs['data-fw-align'];
    const stroked = attrs.stroke !== undefined && attrs.stroke !== 'none';
    const wants = stroked && (align === 'inside' || (align === 'outside' && attrs.fill === 'none'));
    const ref = refOf(attrs['clip-path']);
    const owned = !!ref && ref.startsWith('fwa-');
    const svg = svgOf(site, id);
    if (!svg) continue;
    const d = wants ? (align === 'inside' ? attrs.d ?? '' : `${BIG}${attrs.d ?? ''}`) : '';
    const rule = align === 'inside' ? attrs['fill-rule'] ?? 'nonzero' : 'evenodd';
    if (wants && !owned) {
      const clipId = freshId(site, taken, 'fwa');
      const childId = freshId(site, taken, 'fwap');
      out.push({ command: 'node.add', params: { parent: svg, node: { id: clipId, tag: 'clipPath', name: 'Stroke clip', attrs: { id: clipId, clipPathUnits: 'userSpaceOnUse' } } } });
      out.push({ command: 'node.add', params: { parent: clipId, node: { id: childId, tag: 'path', name: 'Clip', attrs: { d, 'clip-rule': rule } } } });
      out.push(updateAttrs(id, { 'clip-path': `url(#${clipId})` }));
    } else if (wants && owned) {
      const holder = Object.values(site.nodes).find(n => n.tag === 'clipPath' && n.attrs.id === ref);
      const child = holder && site.nodes[holder.children[0]];
      if (child && (child.attrs.d !== d || child.attrs['clip-rule'] !== rule)) out.push(updateAttrs(child.id, { d, 'clip-rule': rule }));
    } else if (!wants && owned) {
      const holder = Object.values(site.nodes).find(n => n.tag === 'clipPath' && n.attrs.id === ref);
      out.push(updateAttrs(id, { 'clip-path': null }));
      if (holder) out.push(removeNode(holder.id));
    }
  }
  return out;
}

export function readWidth(node: SiteNode): { outline: string; color: string; points: WidthPoint[] } | undefined {
  const text = node.attrs['data-fw-width'];
  if (!text) return undefined;
  try {
    const list = JSON.parse(text) as unknown[];
    if (!Array.isArray(list) || typeof list[0] !== 'string' || typeof list[1] !== 'string') return undefined;
    return { outline: list[0], color: list[1], points: list.slice(2).map(normalizePoint).filter((p): p is WidthPoint => !!p) };
  } catch { return undefined; }
}

function outlineD(attrs: Record<string, string>, points: WidthPoint[]): string {
  const subs = decodeModel(attrs['data-fw-vector']) ?? parsePath(attrs.d);
  const cap = attrs['stroke-linecap'] === 'round' || attrs['stroke-linecap'] === 'square' ? attrs['stroke-linecap'] : 'butt';
  const weight = parseFloat(attrs['data-fw-weight'] ?? attrs['stroke-width'] ?? '2') || 2;
  return formatPath(variableOutline(applyCorners(subs), points, weight, cap));
}

export function widthFixes(site: Site, cmds: Command[]): Command[] {
  const out: Command[] = [];
  for (const c of cmds) {
    if (c.command !== 'node.remove') continue;
    const node = site.nodes[(c.params as { id: string }).id];
    const info = node && readWidth(node);
    if (info && site.nodes[info.outline] && !cmds.some(o => o.command === 'node.remove' && (o.params as { id: string }).id === info.outline)) out.push(removeNode(info.outline));
  }
  for (const [id, patch] of patchesOf(cmds, site)) {
    const node = site.nodes[id];
    const info = readWidth(node);
    if (!info || !site.nodes[info.outline] || 'data-fw-width' in patch) continue;
    const attrs = merged(node, patch);
    const color = attrs.stroke && attrs.stroke !== 'none' ? attrs.stroke : info.color;
    const geometry = 'd' in patch || 'data-fw-vector' in patch || 'stroke' in patch || 'stroke-linecap' in patch || 'stroke-width' in patch;
    if (!geometry) continue;
    const list: unknown[] = [info.outline, color, ...info.points];
    out.push(updateAttrs(info.outline, { d: outlineD(attrs, info.points), fill: color }));
    out.push(updateAttrs(id, { stroke: 'none', 'data-fw-width': JSON.stringify(list) }));
  }
  return out;
}

export function widthCommands(site: Site, shape: Shape, points: WidthPoint[]): Command[] {
  const node = site.nodes[shape.id];
  if (!node) return [];
  const info = readWidth(node);
  if (!points.length) {
    if (!info) return [];
    return [updateAttrs(shape.id, { stroke: info.color, 'data-fw-width': null }), ...(site.nodes[info.outline] ? [removeNode(info.outline)] : [])];
  }
  const color = info?.color ?? (shape.paint.stroke === 'none' ? shape.paint.fill : shape.paint.stroke);
  const attrs = { ...node.attrs };
  const outline = info?.outline && site.nodes[info.outline] ? info.outline : freshId(site, new Set(), 'wide');
  const list: unknown[] = [outline, color, ...points];
  const cmds: Command[] = [];
  const d = outlineD({ ...attrs, 'data-fw-weight': String(shape.paint.strokeWidth) }, points);
  if (site.nodes[outline]) cmds.push(updateAttrs(outline, { d, fill: color }));
  else {
    const parent = Object.values(site.nodes).find(n => n.children.includes(shape.id))?.id ?? shape.svg;
    const index = site.nodes[parent].children.indexOf(shape.id) + 1;
    cmds.push({ command: 'node.add', params: { parent, node: { id: outline, tag: 'path', name: 'Width outline', attrs: { d, fill: color, stroke: 'none', 'fill-rule': 'nonzero' } } } });
    cmds.push(moveNode(outline, parent, index));
  }
  cmds.push(updateAttrs(shape.id, { stroke: 'none', 'data-fw-width': JSON.stringify(list) }));
  return cmds;
}

/* The path whose variable-width outline `id` is, so picking the drawn stroke picks the path it belongs to. */
export function widthOwner(site: Site, id: string): string | undefined {
  const node = site.nodes[id];
  if (!node || node.tag !== 'path' || node.name !== 'Width outline') return undefined;
  return Object.values(site.nodes).find(n => n.tag === 'path' && n.attrs['data-fw-width'] && readWidth(n)?.outline === id)?.id;
}

export function presetCommands(site: Site, shape: Shape, preset: WidthPreset): Command[] {
  return widthCommands(site, shape, widthPreset(preset, Math.max(1, shape.paint.strokeWidth)));
}
