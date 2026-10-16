import type { Command } from '../types';
import { fmt, pathBounds, type Box } from './geometry';
import type { Host } from './host';
import { addPath, freshId, updateAttrs, type Shape } from './store';

export type TileType = 'grid' | 'brick-row' | 'brick-column';

export interface PatternOptions { tile: TileType; offset: number; sizeToArt: boolean; width: number; height: number; hSpace: number; vSpace: number }

export const patternOptions: PatternOptions = { tile: 'grid', offset: 0.5, sizeToArt: true, width: 50, height: 50, hSpace: 0, vSpace: 0 };

export const BRICK_OFFSETS: [number, string][] = [[1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'], [4 / 5, '4/5']];

export interface PatternParts { art: Shape[]; target: Shape; box: Box }

export function patternParts(h: Host): PatternParts | null {
  const target = h.shape(h.primary());
  if (!target) return null;
  const art = h.selection().filter(id => id !== target.id).map(id => h.shape(id)).filter((s): s is Shape => !!s && s.svg === target.svg);
  if (!art.length) return null;
  let box: Box | null = null;
  for (const s of art) {
    const b = pathBounds(s.subs);
    if (!b) continue;
    box = box ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x), h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y) } : b;
  }
  return box ? { art, target, box } : null;
}

export function tileSize(parts: PatternParts, o: PatternOptions): [number, number] {
  const w = o.sizeToArt ? parts.box.w + o.hSpace : o.width;
  const hgt = o.sizeToArt ? parts.box.h + o.vSpace : o.height;
  return [Math.max(1, w), Math.max(1, hgt)];
}

export function tileCopies(o: PatternOptions, w: number, h: number): { size: [number, number]; at: [number, number][] } {
  if (o.tile === 'brick-row') return { size: [w, h * 2], at: [[0, 0], [o.offset * w, h], [o.offset * w - w, h]] };
  if (o.tile === 'brick-column') return { size: [w * 2, h], at: [[0, 0], [w, o.offset * h], [w, o.offset * h - h]] };
  return { size: [w, h], at: [[0, 0]] };
}

export function patternCommands(h: Host, parts: PatternParts, o: PatternOptions): { cmds: Command[]; id: string } {
  const site = h.site();
  const taken = new Set<string>();
  const [w, hgt] = tileSize(parts, o);
  const layout = tileCopies(o, w, hgt);
  const id = freshId(site, taken, 'pattern');
  const cmds: Command[] = [{
    command: 'node.add',
    params: { parent: parts.target.svg, node: { id, tag: 'pattern', name: 'Pattern', attrs: { id, patternUnits: 'userSpaceOnUse', x: fmt(parts.box.x), y: fmt(parts.box.y), width: fmt(layout.size[0]), height: fmt(layout.size[1]) } } }
  }];
  layout.at.forEach(([dx, dy]) => {
    const group = freshId(site, taken, 'g');
    cmds.push({ command: 'node.add', params: { parent: id, node: { id: group, tag: 'g', name: 'Tile', attrs: { transform: `translate(${fmt(dx - parts.box.x)} ${fmt(dy - parts.box.y)})` } } } });
    for (const s of parts.art) cmds.push(addPath(group, freshId(site, taken, 'path'), s.subs, s.paint, 'Tile art'));
  });
  cmds.push(updateAttrs(parts.target.id, { fill: `url(#${id})` }));
  return { cmds, id };
}
