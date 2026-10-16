import type { Command, Site, SiteNode } from '../types';
import { applyMat, applyPt, cloneCommands } from './arrange';
import { applyCorners, renderPath } from './corners';
import { compose, rotation, scaling, shearing, translation, type Mat } from './distort';
import { decodeModel, parsePath, pathBounds, type Box, type Pt } from './geometry';
import type { Host } from './host';
import { liveOf } from './live';
import { freshId, moveNode, parentOf, pathIds, removeNode, svgOf, updateAttrs } from './store';

export interface SymbolInfo { id: string; name: string }

const SYMBOL_STYLE = { overflow: 'visible' };

function symbolNodes(site: Site, root: string): SiteNode[] {
  const out: SiteNode[] = [];
  const visit = (id: string, depth: number): void => {
    const node = site.nodes[id];
    if (!node || depth > 32) return;
    if (node.tag === 'symbol') { out.push(node); return; }
    node.children.forEach(child => visit(child, depth + 1));
  };
  visit(root, 0);
  return out;
}

export function symbolsIn(site: Site, svg: string | undefined): SymbolInfo[] {
  return svg ? symbolNodes(site, svg).filter(node => !node.attrs['data-fw-brushdef']).map(node => ({ id: node.id, name: node.name || node.id })) : [];
}

export function usesOf(site: Site, svg: string, symbol: string): string[] {
  const id = site.nodes[symbol]?.attrs.id;
  const out: string[] = [];
  const visit = (nodeId: string, depth: number): void => {
    const node = site.nodes[nodeId];
    if (!node || depth > 32) return;
    if (node.tag === 'use' && node.attrs.href === `#${id}`) out.push(node.id);
    node.children.forEach(child => visit(child, depth + 1));
  };
  visit(svg, 0);
  return out;
}

export function symbolOfUse(site: Site, useId: string): SiteNode | undefined {
  const use = site.nodes[useId];
  const svg = use && use.tag === 'use' ? svgOf(site, useId) : undefined;
  return svg && use ? symbolNodes(site, svg).find(node => `#${node.attrs.id}` === use.attrs.href) : undefined;
}

export function symbolBox(site: Site, symbol: string): Box | null {
  let box: Box | null = null;
  for (const id of pathIds(site, symbol)) {
    const attrs = site.nodes[id].attrs;
    let subs = decodeModel(attrs['data-fw-vector']);
    if (!subs || renderPath(subs) !== (attrs.d ?? '')) subs = parsePath(attrs.d);
    const b = pathBounds(applyCorners(subs));
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return box;
}

export function symbolPaths(site: Site, symbol: string): string[] {
  const holder = site.nodes[symbol];
  if (!holder) return [];
  const out: string[] = [];
  const visit = (id: string, depth: number): void => {
    const node = site.nodes[id];
    if (!node || depth > 32) return;
    if (node.tag === 'path') out.push(id);
    node.children.forEach(child => visit(child, depth + 1));
  };
  holder.children.forEach(child => visit(child, 0));
  return out;
}

export function defineCommands(h: Host, name: string): { cmds: Command[]; use: string; symbol: string } | null {
  const site = h.site();
  const svg = h.activeSvg();
  const ids = h.selection().filter(id => site.nodes[id]?.tag === 'path');
  if (!svg || !ids.length) { h.notify('Select one or more paths to turn into a symbol.'); return null; }
  if (ids.some(id => liveOf(site, id) || site.nodes[id].attrs['data-fw-live'])) { h.notify('Expand or release the live blend or repeat before making a symbol.'); return null; }
  const order = pathIds(site, svg);
  ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const taken = new Set<string>();
  const symbol = freshId(site, taken, 'symbol');
  const use = freshId(site, taken, 'use');
  const cmds: Command[] = [];
  let defs = site.nodes[svg].children.find(id => site.nodes[id]?.tag === 'defs');
  if (!defs) {
    defs = freshId(site, taken, 'defs');
    cmds.push({ command: 'node.add', params: { parent: svg, node: { id: defs, tag: 'defs', name: 'Symbols', attrs: {} } } }, moveNode(defs, svg, 0));
  }
  cmds.push({ command: 'node.add', params: { parent: defs, node: { id: symbol, tag: 'symbol', name: name.trim().slice(0, 60) || 'Symbol', attrs: { id: symbol }, styles: SYMBOL_STYLE } } });
  const first = ids[0];
  const parent = parentOf(site, first) ?? svg;
  const siblings = site.nodes[parent].children;
  const before = siblings.slice(0, siblings.indexOf(first)).filter(id => ids.includes(id)).length;
  ids.forEach((id, k) => cmds.push(moveNode(id, symbol, k)));
  cmds.push({ command: 'node.add', params: { parent, node: { id: use, tag: 'use', name: `${name.trim().slice(0, 50) || 'Symbol'} instance`, attrs: { href: `#${symbol}`, x: '0', y: '0' } } } });
  cmds.push(moveNode(use, parent, Math.max(0, siblings.indexOf(first) - before)));
  return { cmds, use, symbol };
}

export function placeCommands(h: Host, symbol: string): { cmds: Command[]; use: string } | null {
  const site = h.site();
  const svg = h.activeSvg();
  const node = site.nodes[symbol];
  if (!svg || !node || node.tag !== 'symbol') return null;
  const owner = svgOf(site, symbol);
  if (owner !== svg) { h.notify('Select something in the svg that holds this symbol first.'); return null; }
  const box = symbolBox(site, symbol);
  const count = usesOf(site, svg, symbol).length;
  const step = (box ? box.w : 40) + 16;
  const use = freshId(site, new Set(), 'use');
  return { use, cmds: [{ command: 'node.add', params: { parent: svg, node: { id: use, tag: 'use', name: `${node.name || 'Symbol'} instance`, attrs: { href: `#${node.attrs.id}`, x: String(Math.round(count * step * 100) / 100), y: '0' } } } }] };
}

export function parseTransform(value: string | undefined): Mat {
  let m: Mat = [1, 0, 0, 1, 0, 0];
  if (!value) return m;
  for (const part of value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\(([^)]*)\)/g)) {
    const a = part[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some(n => !Number.isFinite(n))) continue;
    let next: Mat | null = null;
    if (part[1] === 'matrix' && a.length === 6) next = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (part[1] === 'translate') next = translation(a[0] ?? 0, a[1] ?? 0);
    else if (part[1] === 'scale') next = scaling(a[0] ?? 1, a[1] ?? a[0] ?? 1, 0, 0);
    else if (part[1] === 'rotate') next = rotation(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
    else if (part[1] === 'skewX') next = shearing(a[0] ?? 0, 0, 0, 0);
    else if (part[1] === 'skewY') next = shearing(a[0] ?? 0, 90, 0, 0);
    if (next) m = compose(m, next);
  }
  return m;
}

export function breakCommands(h: Host, useId: string): { cmds: Command[]; created: string[] } | null {
  const site = h.site();
  const use = site.nodes[useId];
  const symbol = symbolOfUse(site, useId);
  const parent = use && parentOf(site, useId);
  if (!use || !symbol || !parent) { h.notify('Select a symbol instance first.'); return null; }
  const x = parseFloat(use.attrs.x ?? '0') || 0, y = parseFloat(use.attrs.y ?? '0') || 0;
  const m = compose(parseTransform(use.attrs.transform), translation(x, y));
  const taken = new Set<string>();
  const group = freshId(site, taken, 'group');
  const at = site.nodes[parent].children.indexOf(useId);
  const cmds: Command[] = [{ command: 'node.add', params: { parent, node: { id: group, tag: 'g', name: use.name.replace(/ instance$/, '') || 'Symbol contents', attrs: {} } } }];
  const created: string[] = [];
  symbolPaths(site, symbol.id).forEach((id, k) => {
    const shape = h.shape(id);
    if (!shape) return;
    const made = cloneCommands(h, taken, id, applyMat(shape.subs, m), group, k, m);
    created.push(made.id);
    cmds.push(...made.cmds);
  });
  if (!created.length) { h.notify('This symbol has no paths to release.'); return null; }
  cmds.push(removeNode(useId), moveNode(group, parent, at));
  return { cmds, created };
}

export const matrixText = (m: Mat): string => `matrix(${m.map(n => String(Math.round(n * 10000) / 10000)).join(' ')})`;

export interface UseFrame { matrix: Mat; corners: Pt[]; centre: Pt; box: Box; x: number; y: number }

export function useFrame(site: Site, id: string): UseFrame | null {
  const use = site.nodes[id];
  const symbol = symbolOfUse(site, id);
  const box = symbol && symbolBox(site, symbol.id);
  if (!use || !box) return null;
  const x = parseFloat(use.attrs.x ?? '0') || 0, y = parseFloat(use.attrs.y ?? '0') || 0;
  const matrix = compose(parseTransform(use.attrs.transform), translation(x, y));
  const corners = ([[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]] as Pt[]).map(p => applyPt(matrix, p));
  return { matrix, corners, centre: applyPt(matrix, [box.x + box.w / 2, box.y + box.h / 2]), box, x, y };
}

export function useScaleRotation(site: Site, id: string): { scale: number; rotate: number } | null {
  const use = site.nodes[id];
  if (!use || use.tag !== 'use') return null;
  const m = parseTransform(use.attrs.transform);
  return { scale: Math.hypot(m[0], m[1]), rotate: (Math.atan2(m[1], m[0]) * 180) / Math.PI };
}

export function useTransformCommand(site: Site, id: string, scalePercent: number, rotateDegrees: number): Command | null {
  const frame = useFrame(site, id);
  if (!frame) return null;
  const k = Math.max(0.01, Math.min(100, scalePercent / 100)), a = (rotateDegrees * Math.PI) / 180;
  const l0 = Math.cos(a) * k, l1 = Math.sin(a) * k, l2 = -l1, l3 = l0;
  const cx = frame.box.x + frame.box.w / 2 + frame.x, cy = frame.box.y + frame.box.h / 2 + frame.y;
  const m: Mat = [l0, l1, l2, l3, frame.centre[0] - (l0 * cx + l2 * cy), frame.centre[1] - (l1 * cx + l3 * cy)];
  return updateAttrs(id, { transform: matrixText(m) });
}
