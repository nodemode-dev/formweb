import type { Command, Site } from '../types';
import { cloneCommands, groupCommands, moveCommands } from './arrange';
import { brushOutputs, brushSig, readBrush, readBrushDef, spineOf, spinePoint, type BrushSettings, type BrushSpec } from './brush';
import { applyCorners } from './corners';
import { colorToHex } from './gradient';
import type { Host } from './host';
import { liveContainer, liveOf, readBlend } from './live';
import { pathBounds, type Pt, type SubPath } from './geometry';
import { addPath, freshId, moveNode, pathIds, refOf, removeNode, svgOf, updateAttrs, type Paint } from './store';
import { readWidth } from './stroke';
import { symbolOfUse, symbolPaths } from './symbols';

export interface BrushDef { id: string; name: string; settings: BrushSettings }

export function brushDefs(site: Site, svg: string | undefined): BrushDef[] {
  if (!svg) return [];
  const out: BrushDef[] = [];
  for (const node of Object.values(site.nodes)) {
    const settings = node.tag === 'symbol' ? readBrushDef(node.attrs['data-fw-brushdef']) : null;
    if (settings && svgOf(site, node.id) === svg) out.push({ id: node.id, name: node.name || node.id, settings });
  }
  return out;
}

const artAttrsOf = (site: Site, symbol: string): Record<string, string>[] => symbolPaths(site, symbol).map(id => site.nodes[id].attrs);

export function defineBrush(h: Host, name: string, settings: BrushSettings): { cmds: Command[]; id: string } | null {
  const site = h.site();
  const svg = h.activeSvg();
  if (!svg) { h.notify('Select artwork for the brush first.'); return null; }
  const taken = new Set<string>();
  const id = freshId(site, taken, 'brush');
  let art = '';
  let sources: string[] = [];
  if (settings.kind !== 'calligraphic') {
    const selected = h.selection();
    const use = selected.find(item => site.nodes[item]?.tag === 'use');
    const master = use ? symbolOfUse(site, use) : undefined;
    if (master) art = master.id;
    else {
      const order = pathIds(site, svg);
      sources = selected.filter(item => site.nodes[item]?.tag === 'path' && !liveOf(site, item)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      if (!sources.length) { h.notify('Select artwork for the brush first.'); return null; }
    }
  }
  const cmds: Command[] = [];
  let defs = site.nodes[svg].children.find(item => site.nodes[item]?.tag === 'defs');
  if (!defs) {
    defs = freshId(site, taken, 'defs');
    cmds.push({ command: 'node.add', params: { parent: svg, node: { id: defs, tag: 'defs', name: 'Symbols', attrs: {} } } }, moveNode(defs, svg, 0));
  }
  const label = name.trim().slice(0, 60) || `${settings.kind[0].toUpperCase()}${settings.kind.slice(1)} brush`;
  cmds.push({ command: 'node.add', params: { parent: defs, node: { id, tag: 'symbol', name: label, attrs: { id, 'data-fw-brushdef': JSON.stringify({ ...settings, art }) } } } });
  sources.forEach((source, k) => {
    const shape = h.shape(source);
    if (shape) cmds.push(...cloneCommands(h, taken, source, applyCorners(shape.subs), id, k).cmds);
  });
  return { cmds, id };
}

export function applyBrushCommands(h: Host, def: string): { cmds: Command[]; select: string[] } | null {
  const site = h.site();
  const holder = site.nodes[def];
  const settings = holder && readBrushDef(holder.attrs['data-fw-brushdef']);
  if (!holder || !settings) return null;
  const art = settings.kind === 'calligraphic' ? '' : settings.art || def;
  const artList = art ? artAttrsOf(site, art) : [];
  if (art && !artList.length) { h.notify('This brush has no artwork.'); return null; }
  const ids = h.selection().filter(id => site.nodes[id]?.tag === 'path');
  if (!ids.length) { h.notify('Select one or more open paths to apply a brush.'); return null; }
  const cmds: Command[] = [];
  const select: string[] = [];
  for (const id of ids) {
    const found = liveOf(site, id);
    if (found && found.kind === 'brush') {
      const current = readBrush(site.nodes[found.group].attrs['data-fw-brush']);
      if (!current) continue;
      cmds.push(updateAttrs(found.group, { 'data-fw-brush': JSON.stringify({ ...current, ...settings, art }) }));
      select.push(current.src);
      continue;
    }
    if (found) { h.notify('These paths already belong to a live blend or repeat.'); continue; }
    const node = site.nodes[id], shape = h.shape(id);
    if (readWidth(node)) { h.notify('Remove the variable width before applying a brush.'); continue; }
    if (!shape || !h.parentOf(id)) continue;
    const stroked = shape.paint.stroke !== 'none' && !refOf(shape.paint.stroke) && !!colorToHex(shape.paint.stroke, '');
    const filled = !stroked && shape.paint.stroke === 'none' && shape.paint.fill !== 'none' && !refOf(shape.paint.fill) && !!colorToHex(shape.paint.fill, '');
    const color = stroked ? colorToHex(shape.paint.stroke, '#000000') : filled ? colorToHex(shape.paint.fill, '#000000') : '#000000';
    const base: Omit<BrushSpec, 'sig'> = { ...settings, art, src: id, color, weight: stroked ? shape.paint.strokeWidth : 2 };
    const sig = brushSig(base, node.attrs, artList);
    const grouped = groupCommands(h, [id], 'Brushed path', { 'data-fw-brush': JSON.stringify({ ...base, sig }) });
    if (!grouped) continue;
    cmds.push(...grouped.cmds, updateAttrs(id, filled ? { stroke: 'none', fill: 'none' } : { stroke: 'none' }), ...liveContainer(site, new Set([grouped.group]), grouped.group, 'brush', brushOutputs(node.attrs, artList, base), 1));
    select.push(id);
  }
  return cmds.length ? { cmds, select } : null;
}

export function brushedPathCommands(h: Host, taken: Set<string>, def: string, parent: string, pathId: string, subs: SubPath[], paint: Paint): Command[] | null {
  const site = h.site();
  const holder = site.nodes[def];
  const settings = holder && svgOf(site, def) === parent ? readBrushDef(holder.attrs['data-fw-brushdef']) : null;
  if (!holder || !settings) return null;
  const art = settings.kind === 'calligraphic' ? '' : settings.art || def;
  const artList = art ? artAttrsOf(site, art) : [];
  if (art && !artList.length) return null;
  const stroke = paint.stroke !== 'none' && !refOf(paint.stroke) ? colorToHex(paint.stroke, '#000000') : '#000000';
  const group = freshId(site, taken, 'group');
  taken.add(pathId);
  const path = addPath(group, pathId, subs, { ...paint, stroke: 'none' });
  const attrs = (path.params as { node: { attrs: Record<string, string> } }).node.attrs;
  const base: Omit<BrushSpec, 'sig'> = { ...settings, art, src: pathId, color: stroke, weight: paint.strokeWidth };
  const sig = brushSig(base, attrs, artList);
  return [
    { command: 'node.add', params: { parent, node: { id: group, tag: 'g', name: 'Brushed path', attrs: { 'data-fw-brush': JSON.stringify({ ...base, sig }) } } } },
    path,
    ...liveContainer(site, taken, group, 'brush', brushOutputs(attrs, artList, base), 1)
  ];
}

export function brushChange(site: Site, group: string, change: Partial<BrushSettings>): Command[] {
  const spec = readBrush(site.nodes[group]?.attrs['data-fw-brush']);
  return spec ? [updateAttrs(group, { 'data-fw-brush': JSON.stringify({ ...spec, ...change }) })] : [];
}

export function blendGroupOf(h: Host): string | undefined {
  const site = h.site();
  for (const id of h.selection()) { const found = liveOf(site, id); if (found && found.kind === 'blend') return found.group; }
  return undefined;
}

export function spineCommands(h: Host): Command[] {
  const site = h.site();
  const group = blendGroupOf(h);
  const spec = group ? readBlend(site.nodes[group].attrs['data-fw-blend']) : null;
  if (!group || !spec) { h.notify('Select a live blend and one more path to use as its spine.'); return []; }
  const pick = h.selection().find(id => site.nodes[id]?.tag === 'path' && !liveOf(site, id));
  if (!pick) { h.notify('Select a live blend and one more path to use as its spine.'); return []; }
  const spine = h.shape(pick);
  const rail = spine?.subs[0] ? spineOf(spine.subs[0]) : null;
  const ends = [spec.a, spec.b].map(id => h.shape(id));
  if (!rail || !ends[0] || !ends[1]) { h.notify('Select a live blend and one more path to use as its spine.'); return []; }
  const old = spec.home ?? [0, 0, 0, 0];
  const centres = ends.map((shape, k) => { const box = pathBounds(applyCorners(shape!.subs)); return box ? [box.x + box.w / 2 - old[k * 2], box.y + box.h / 2 - old[k * 2 + 1]] : [0, 0]; });
  const at = [spinePoint(rail, 0), spinePoint(rail, rail.total)];
  const home = [at[0][0] - centres[0][0], at[0][1] - centres[0][1], at[1][0] - centres[1][0], at[1][1] - centres[1][1]].map(n => Math.round(n * 1000) / 1000);
  const moves = new Map<string, Pt>([[spec.a, [home[0] - old[0], home[1] - old[1]]], [spec.b, [home[2] - old[2], home[3] - old[3]]]]);
  return [moveNode(pick, group, site.nodes[group].children.length), ...moveCommands(h, moves), updateAttrs(group, { 'data-fw-blend': JSON.stringify({ ...spec, spine: pick, home }) })];
}

export function removeSpineCommands(h: Host): Command[] {
  const group = blendGroupOf(h);
  const spec = group ? readBlend(h.site().nodes[group].attrs['data-fw-blend']) : null;
  if (!group || !spec) return [];
  const { home, ...rest } = spec;
  const back = home ?? [0, 0, 0, 0];
  const moves = new Map<string, Pt>([[spec.a, [-back[0], -back[1]]], [spec.b, [-back[2], -back[3]]]]);
  return [...moveCommands(h, moves), updateAttrs(group, { 'data-fw-blend': JSON.stringify({ ...rest, spine: '' }) })];
}

export function blendChange(site: Site, group: string, change: { spine?: string; orient?: 'page' | 'path' }): Command[] {
  const spec = readBlend(site.nodes[group]?.attrs['data-fw-blend']);
  return spec ? [updateAttrs(group, { 'data-fw-blend': JSON.stringify({ ...spec, ...change }) })] : [];
}

export const deleteBrushCommands = (def: string): Command[] => [removeNode(def)];
