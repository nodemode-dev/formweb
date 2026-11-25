import type { Site } from '../types';
import type { DropTarget } from './panel/drop';
import type { Axis, Box, Edge, Flow } from './canvas-drag';

export interface Slot { index: number; lines: Edge[] }
export interface Measure { axis: Axis; from: number; to: number; at: number; value: number }
export type Align = 'start' | 'center' | 'end' | 'stretch';
export interface Landing { en: string; values: string[] }

const cross = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x';
const low = (box: Box, axis: Axis): number => axis === 'x' ? box.left : box.top;
const high = (box: Box, axis: Axis): number => axis === 'x' ? box.left + box.width : box.top + box.height;
const middle = (box: Box, axis: Axis): number => (low(box, axis) + high(box, axis)) / 2;

export function slotsOf(kids: readonly Box[], flow: Flow): Slot[] {
  if (!kids.length) return [];
  const along = flow.axis, side = cross(along);
  const lead = (box: Box): number => flow.reverse ? high(box, along) : low(box, along);
  const trail = (box: Box): number => flow.reverse ? low(box, along) : high(box, along);
  const line = (at: number, box: Box): Edge => ({ axis: along, at, from: low(box, side), to: high(box, side) });
  const slots: Slot[] = [{ index: 0, lines: [line(lead(kids[0]), kids[0])] }];
  for (let index = 1; index < kids.length; index++) {
    const a = kids[index - 1], b = kids[index];
    const ordered = flow.reverse ? lead(b) <= trail(a) + 1 : lead(b) >= trail(a) - 1;
    const overlap = Math.min(high(a, side), high(b, side)) - Math.max(low(a, side), low(b, side)) > 0;
    slots.push({
      index,
      lines: ordered && overlap
        ? [{ axis: along, at: (trail(a) + lead(b)) / 2, from: Math.min(low(a, side), low(b, side)), to: Math.max(high(a, side), high(b, side)) }]
        : [line(trail(a), a), line(lead(b), b)]
    });
  }
  const last = kids[kids.length - 1];
  slots.push({ index: kids.length, lines: [line(trail(last), last)] });
  return slots;
}

export function lineDistance(edge: Edge, x: number, y: number): number {
  const along = edge.axis === 'y' ? y : x, other = edge.axis === 'y' ? x : y;
  return Math.hypot(along - edge.at, Math.max(edge.from - other, 0, other - edge.to));
}

export function nearestSlot(slots: readonly Slot[], x: number, y: number): { index: number; line: Edge } | null {
  let best: { index: number; line: Edge } | null = null;
  let far = Infinity;
  for (const slot of slots) for (const line of slot.lines) {
    const distance = lineDistance(line, x, y);
    if (distance < far) { far = distance; best = { index: slot.index, line }; }
  }
  return best;
}

export function trackSizes(template: string): number[] {
  return template.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(part => /^-?\d*\.?\d+px$/.test(part)).map(part => parseFloat(part));
}

export function pixels(value: string): number {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

export function gridCells(content: Box, columns: readonly number[], rows: readonly number[], columnGap: number, rowGap: number): Box[] {
  const spans = (start: number, size: number, tracks: readonly number[], gap: number): Array<[number, number]> => {
    if (!tracks.length) return [[start, size]];
    let at = start;
    return tracks.map(track => { const span: [number, number] = [at, track]; at += track + gap; return span; });
  };
  const across = spans(content.left, content.width, columns, columnGap);
  const down = spans(content.top, content.height, rows, rowGap);
  return down.flatMap(([top, height]) => across.map(([left, width]) => ({ left, top, width, height })));
}

export function alignOf(display: string, flow: Flow, alignItems: string, justifyItems: string): Align | null {
  const grid = display.includes('grid');
  if (!grid && !display.includes('flex')) return flow.axis === 'y' ? 'start' : null;
  const value = grid && flow.axis === 'y' ? justifyItems : alignItems;
  if (/baseline/.test(value)) return null;
  if (/center/.test(value)) return 'center';
  if (/(^|\s)(end|flex-end|self-end|right)$/.test(value)) return 'end';
  if (/(^|\s)(start|flex-start|self-start|left)$/.test(value)) return 'start';
  return 'stretch';
}

export function alignGuides(neighbours: readonly Box[], flow: Flow, align: Align | null, slot?: Edge): Edge[] {
  if (!align || !neighbours.length) return [];
  const side = cross(flow.axis);
  const kinds: Array<Exclude<Align, 'stretch'>> = align === 'stretch' ? ['start', 'end'] : [align];
  const at = (box: Box, kind: Exclude<Align, 'stretch'>): number => kind === 'start' ? low(box, side) : kind === 'end' ? high(box, side) : middle(box, side);
  const from = Math.min(...neighbours.map(box => low(box, flow.axis)), slot ? slot.at : Infinity);
  const to = Math.max(...neighbours.map(box => high(box, flow.axis)), slot ? slot.at : -Infinity);
  const out: Edge[] = [];
  for (const kind of kinds) {
    const values = neighbours.map(box => at(box, kind));
    if (Math.max(...values) - Math.min(...values) <= 1) out.push({ axis: side, at: values[0], from, to });
  }
  return out;
}

export function spacing(before: Box | null, after: Box | null, flow: Flow, afterBefore: number, beforeAfter: number): Measure[] {
  const along = flow.axis, side = cross(along);
  const sign = flow.reverse ? -1 : 1;
  const out: Measure[] = [];
  const mark = (start: number, length: number, box: Box, value: number): void => {
    out.push({ axis: along, from: Math.min(start, start + length), to: Math.max(start, start + length), at: low(box, side) + (high(box, side) - low(box, side)) / 4, value });
  };
  if (before && afterBefore > 0) mark(flow.reverse ? low(before, along) : high(before, along), sign * afterBefore, before, afterBefore);
  if (after && beforeAfter > 0) mark(flow.reverse ? high(after, along) : low(after, along), -sign * beforeAfter, after, beforeAfter);
  return out;
}

export function landing(site: Site, ids: readonly string[], target: DropTarget): Landing {
  const name = (id: string): string => site.nodes[id]?.name || site.nodes[id]?.tag || id;
  if (target.anchor) return { en: 'Before {0}', values: [name(target.anchor)] };
  const others = (site.nodes[target.parent]?.children || []).filter(child => !ids.includes(child));
  return { en: others.length ? 'Inside {0}, at the end' : 'Inside {0}', values: [name(target.parent)] };
}
