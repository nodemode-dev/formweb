import type { Command, Site, SiteNode } from '../types';
import { fmt, pathBounds, type Box } from './geometry';
import type { Host } from './host';
import { addPath, freshId, readShape, refOf, removeNode, updateAttrs, type Shape } from './store';

export type TileType = 'grid' | 'brick-row' | 'brick-column' | 'hex-row' | 'hex-column';
export const TILE_TYPES: TileType[] = ['grid', 'brick-row', 'brick-column', 'hex-row', 'hex-column'];

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

/* Hex by Row staggers every other row by half a tile with rows 3/4 of a tile apart (hexagon packing); Hex by Column
   does the same for columns. Copies that overlap the tile edge are repeated one tile back so the overlap wraps. */
export function tileCopies(o: PatternOptions, w: number, h: number): { size: [number, number]; at: [number, number][] } {
  if (o.tile === 'hex-row') return { size: [w, h * 1.5], at: [[0, 0], [w / 2, h * 0.75], [-w / 2, h * 0.75], [w / 2, -h * 0.75], [-w / 2, -h * 0.75]] };
  if (o.tile === 'hex-column') return { size: [w * 1.5, h], at: [[0, 0], [w * 0.75, h / 2], [w * 0.75, -h / 2], [-w * 0.75, h / 2], [-w * 0.75, -h / 2]] };
  if (o.tile === 'brick-row') return { size: [w, h * 2], at: [[0, 0], [o.offset * w, h], [o.offset * w - w, h]] };
  if (o.tile === 'brick-column') return { size: [w * 2, h], at: [[0, 0], [w, o.offset * h], [w, o.offset * h - h]] };
  return { size: [w, h], at: [[0, 0]] };
}

const optionsAttr = (o: PatternOptions): string => JSON.stringify({ v: 1, tile: o.tile, offset: o.offset, sizeToArt: o.sizeToArt, width: o.width, height: o.height, hSpace: o.hSpace, vSpace: o.vSpace });

export function readPatternOptions(raw: string | undefined): PatternOptions | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<PatternOptions> & { v?: number };
    const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (c.v !== 1 || !c.tile || !TILE_TYPES.includes(c.tile) || !n(c.offset) || typeof c.sizeToArt !== 'boolean' || !n(c.width) || !n(c.height) || !n(c.hSpace) || !n(c.vSpace)) return null;
    return { tile: c.tile, offset: c.offset, sizeToArt: c.sizeToArt, width: c.width, height: c.height, hSpace: c.hSpace, vSpace: c.vSpace };
  } catch { return null; }
}

function copyCommands(site: Site, taken: Set<string>, pattern: string, parts: Pick<PatternParts, 'art' | 'box'>, layout: { at: [number, number][] }): Command[] {
  const cmds: Command[] = [];
  layout.at.forEach(([dx, dy]) => {
    const group = freshId(site, taken, 'g');
    cmds.push({ command: 'node.add', params: { parent: pattern, node: { id: group, tag: 'g', name: 'Tile', attrs: { transform: `translate(${fmt(dx - parts.box.x)} ${fmt(dy - parts.box.y)})` } } } });
    for (const s of parts.art) cmds.push(addPath(group, freshId(site, taken, 'path'), s.subs, s.paint, 'Tile art'));
  });
  return cmds;
}

export function patternCommands(h: Host, parts: PatternParts, o: PatternOptions): { cmds: Command[]; id: string } {
  const site = h.site();
  const taken = new Set<string>();
  const [w, hgt] = tileSize(parts, o);
  const layout = tileCopies(o, w, hgt);
  const id = freshId(site, taken, 'pattern');
  const cmds: Command[] = [{
    command: 'node.add',
    params: { parent: parts.target.svg, node: { id, tag: 'pattern', name: 'Pattern', attrs: { id, patternUnits: 'userSpaceOnUse', x: fmt(parts.box.x), y: fmt(parts.box.y), width: fmt(layout.size[0]), height: fmt(layout.size[1]), 'data-fw-pattern': optionsAttr(o) } } }
  }];
  cmds.push(...copyCommands(site, taken, id, parts, layout));
  cmds.push(updateAttrs(parts.target.id, { fill: `url(#${id})` }));
  return { cmds, id };
}

/* Editing: the selected shape's pattern fill is rebuilt from the art of its first tile with new options; the pattern
   keeps its id, so every shape using it updates. Patterns made before v0.11.1 have no stored options and open as a
   Grid with their current size. */
export interface PatternEdit { pattern: SiteNode; target: Shape; art: Shape[]; box: Box; options: PatternOptions }

export function patternEdit(h: Host): PatternEdit | null {
  const target = h.shape(h.primary());
  const ref = target ? refOf(target.paint.fill) : undefined;
  if (!target || !ref) return null;
  const site = h.site();
  const pattern = Object.values(site.nodes).find(n => n.tag === 'pattern' && n.attrs.id === ref);
  const first = pattern ? site.nodes[pattern.children[0]] : undefined;
  if (!pattern || !first || first.tag !== 'g') return null;
  const art = first.children.map(id => readShape(site, id)).filter((s): s is Shape => !!s);
  let box: Box | null = null;
  for (const s of art) {
    const b = pathBounds(s.subs);
    if (!b) continue;
    box = box ? { x: Math.min(box.x, b.x), y: Math.min(box.y, b.y), w: Math.max(box.x + box.w, b.x + b.w) - Math.min(box.x, b.x), h: Math.max(box.y + box.h, b.y + b.h) - Math.min(box.y, b.y) } : b;
  }
  if (!box) return null;
  const num = (v: string | undefined, d: number): number => { const x = parseFloat(v ?? ''); return Number.isFinite(x) ? x : d; };
  const options = readPatternOptions(pattern.attrs['data-fw-pattern']) ?? { tile: 'grid', offset: 0.5, sizeToArt: false, width: num(pattern.attrs.width, box.w), height: num(pattern.attrs.height, box.h), hSpace: 0, vSpace: 0 };
  return { pattern, target, art, box, options };
}

export function repatternCommands(h: Host, ed: PatternEdit, o: PatternOptions): Command[] {
  const site = h.site();
  const taken = new Set<string>();
  const [w, hgt] = tileSize({ art: ed.art, target: ed.target, box: ed.box }, o);
  const layout = tileCopies(o, w, hgt);
  return [
    ...ed.pattern.children.map(id => removeNode(id)),
    updateAttrs(ed.pattern.id, { x: fmt(ed.box.x), y: fmt(ed.box.y), width: fmt(layout.size[0]), height: fmt(layout.size[1]), 'data-fw-pattern': optionsAttr(o) }),
    ...copyCommands(site, taken, ed.pattern.id, ed, layout),
  ];
}
