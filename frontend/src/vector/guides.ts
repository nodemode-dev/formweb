import type { SubPath } from './geometry';
import type { GuideItem } from './view';

/**
 * Guides live on the svg node as `data-fw-guides`, so they reload with the document, undo like any edit and never reach an export.
 * Schema (numbers only): {"v":1,"locked":0|1,"x":[pos...],"y":[pos...],"paths":[{"c":0|1,"n":[[x,y,inX,inY,outX,outY]...]}]}
 * A handle equal to its anchor means no handle. The Rust model and the backend check the same shape.
 */
export const GUIDE_ATTR = 'data-fw-guides';
export const GUIDE_LIMIT = 200;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6;
const round = (v: number): number => Math.round(v * 1000) / 1000;

export function encodeGuides(list: GuideItem[], locked: boolean): string {
  const x: number[] = [], y: number[] = [];
  const paths: { c: number; n: number[][] }[] = [];
  for (const g of list) {
    if (g.kind === 'line') (g.axis === 'x' ? x : y).push(round(g.pos));
    else for (const s of g.subs) paths.push({ c: s.closed ? 1 : 0, n: s.nodes.map(a => [a.x, a.y, a.in?.[0] ?? a.x, a.in?.[1] ?? a.y, a.out?.[0] ?? a.x, a.out?.[1] ?? a.y].map(round)) });
  }
  return JSON.stringify({ v: 1, locked: locked ? 1 : 0, x, y, paths });
}

/** Parse a stored value; null when it is not a valid guide set. Fresh ids come from `next`. */
export function decodeGuides(raw: string, next: () => string): { list: GuideItem[]; locked: boolean } | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const o = value as { v?: unknown; locked?: unknown; x?: unknown; y?: unknown; paths?: unknown } | null;
  if (!o || o.v !== 1 || !Array.isArray(o.x) || !Array.isArray(o.y) || !Array.isArray(o.paths)) return null;
  if (!o.x.every(num) || !o.y.every(num)) return null;
  const list: GuideItem[] = [];
  for (const pos of o.x as number[]) list.push({ id: next(), kind: 'line', axis: 'x', pos });
  for (const pos of o.y as number[]) list.push({ id: next(), kind: 'line', axis: 'y', pos });
  for (const p of o.paths as { c?: unknown; n?: unknown }[]) {
    if (!p || !Array.isArray(p.n) || !p.n.length) return null;
    const nodes: SubPath['nodes'] = [];
    for (const n of p.n as unknown[]) {
      if (!Array.isArray(n) || n.length !== 6 || !n.every(num)) return null;
      const [x, y, ix, iy, ox, oy] = n as number[];
      nodes.push({ x, y, in: ix === x && iy === y ? null : [ix, iy], out: ox === x && oy === y ? null : [ox, oy], kind: 'corner' });
    }
    list.push({ id: next(), kind: 'path', subs: [{ nodes, closed: p.c === 1 }] });
  }
  return { list, locked: o.locked === 1 };
}
