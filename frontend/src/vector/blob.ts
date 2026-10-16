import type { Command } from '../types';
import { unionSubs } from './boolean';
import { outlineStroke } from './edit';
import { pathBounds, type Box, type SubPath } from './geometry';
import type { Host } from './host';
import { pathIds, readShape, removeNode, updateAttrs, updateGeometry } from './store';

export interface BlobOptions { size: number; fidelity: number; keepSelected: boolean; mergeSelection: boolean }

export const blobOptions: BlobOptions = { size: 20, fidelity: 2.5, keepSelected: false, mergeSelection: false };

export const BLOB_MAX_SIZE = 1000;
const MERGE_LIMIT = 30;

export function setBlobOptions(next: Partial<BlobOptions>): void {
  Object.assign(blobOptions, next);
  blobOptions.size = Math.max(1, Math.min(BLOB_MAX_SIZE, blobOptions.size));
  blobOptions.fidelity = Math.max(0.5, Math.min(20, blobOptions.fidelity));
}

export function stepBlobSize(up: boolean): number {
  const s = blobOptions.size;
  const step = s < 10 ? 1 : s < 50 ? 5 : s < 200 ? 10 : 50;
  setBlobOptions({ size: up ? s + step : s - step });
  return blobOptions.size;
}

export function blobOutline(line: SubPath, size: number): SubPath[] {
  return outlineStroke([line], { width: size, cap: 'round', join: 'round', miter: 4, dash: [], dashOffset: 0 });
}

const boxesMeet = (a: Box, b: Box): boolean => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export function overlaps(a: SubPath[], b: SubPath[]): boolean {
  const ba = pathBounds(a), bb = pathBounds(b);
  if (!ba || !bb || !boxesMeet(ba, bb)) return false;
  return unionSubs([a, b]).length < a.length + b.length;
}

export function blobMerge(h: Host, svg: string, blob: SubPath[], color: string): { cmds: Command[]; id: string } | null {
  const site = h.site();
  const selected = new Set(h.selection());
  const targets: { id: string; subs: SubPath[] }[] = [];
  for (const id of pathIds(site, svg)) {
    if (targets.length >= MERGE_LIMIT) break;
    if (blobOptions.mergeSelection && !selected.has(id)) continue;
    const shape = readShape(site, id);
    if (!shape || shape.paint.stroke !== 'none' || shape.paint.fill.toLowerCase() !== color.toLowerCase()) continue;
    if (overlaps(blob, shape.subs)) targets.push({ id, subs: shape.subs });
  }
  if (!targets.length) return null;
  const merged = unionSubs([blob, ...targets.map(t => t.subs)]);
  const keep = targets[0].id;
  return {
    id: keep,
    cmds: [updateGeometry(keep, merged), updateAttrs(keep, { 'fill-rule': 'nonzero' }), ...targets.slice(1).map(t => removeNode(t.id))]
  };
}
