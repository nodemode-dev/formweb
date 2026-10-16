import { t, tn } from '../i18n';
import type { Command, Site, SiteNode } from '../types';
import { cloneCommands } from './arrange';
import { fragmentPieces } from './boolean';
import { insideSubs } from './cut';
import { flattenSub } from './edit';
import { fitCurve } from './fit';
import { bezierAt, clonePath, inferKind, pathBounds, rectPath, segments, splitAt, type Anchor, type Box, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import { knifeCut } from './cut';
import { DEF_TAGS, freshId, moveNode, pathIds, removeNode, updateGeometry } from './store';
import { readType } from './typepath';

const selectedShapes = (h: Host) => h.selection().map(id => h.shape(id)).filter((s): s is NonNullable<ReturnType<Host['shape']>> => !!s);

/* Object > Path > Add Anchor Points */

export function addAnchorCommands(h: Host): Command[] {
  const cmds: Command[] = [];
  let added = 0;
  for (const shape of selectedShapes(h)) {
    const subs = clonePath(shape.subs);
    const segs = segments(subs);
    for (let k = segs.length - 1; k >= 0; k--) { splitAt(subs, segs[k], 0.5); added++; }
    if (segs.length) cmds.push(updateGeometry(shape.id, subs));
  }
  if (!cmds.length) h.notify(t('Select one or more paths first.'));
  else h.notify(tn(added, 'Added {0} anchor point.', 'Added {0} anchor points.'));
  return cmds;
}

/* Object > Path > Remove Anchor Points */

function runSamples(orig: Anchor[], from: number, to: number, wrap: (i: number) => number): Pt[] {
  const pts: Pt[] = [[orig[wrap(from)].x, orig[wrap(from)].y]];
  for (let k = from; k < to; k++) {
    const a = orig[wrap(k)], b = orig[wrap(k + 1)];
    const seg = { p0: [a.x, a.y] as Pt, c1: a.out ?? [a.x, a.y] as Pt, c2: b.in ?? [b.x, b.y] as Pt, p3: [b.x, b.y] as Pt };
    for (let s = 1; s <= 8; s++) pts.push(bezierAt(seg, s / 8));
  }
  return pts;
}

const unit = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };

/** Deletes the anchors in `drop` from one subpath, refitting the neighbours' handles so the curve keeps its shape. */
export function removeAnchors(sub: SubPath, drop: Set<number>): SubPath | null {
  const n = sub.nodes.length;
  const keep = sub.nodes.map((_, i) => !drop.has(i));
  if (keep.filter(Boolean).length < 2) return null;
  const wrap = (i: number): number => ((i % n) + n) % n;
  const nodes = clonePath([sub])[0].nodes;
  const touched = new Set<number>();
  for (let s = 0; s < n; s++) {
    if (keep[s]) continue;
    const a = sub.closed ? wrap(s - 1) : s - 1;
    if (a < 0 || !keep[a]) continue;
    let e = s;
    while (sub.closed ? e < s + n && !keep[wrap(e)] : e < n && !keep[e]) e++;
    if (!sub.closed && e >= n) { nodes[a].out = null; touched.add(a); continue; }
    const b = wrap(e);
    const A = sub.nodes[a], B = sub.nodes[b];
    const involved = [A.out, B.in, ...sub.nodes.slice(s, e).flatMap((_, k) => [sub.nodes[wrap(s + k)].in, sub.nodes[wrap(s + k)].out])];
    if (!involved.some(Boolean)) { nodes[a].out = null; nodes[b].in = null; touched.add(a); touched.add(b); continue; }
    const pts = runSamples(sub.nodes, a === wrap(s - 1) && sub.closed ? s - 1 : a, e, wrap);
    const chord = Math.hypot(A.x - B.x, A.y - B.y);
    const t1 = A.out ? unit([A.x, A.y], A.out) : unit(pts[0], pts[1]);
    const t2 = B.in ? unit([B.x, B.y], B.in) : unit(pts[pts.length - 1], pts[pts.length - 2]);
    const fit = fitCurve(pts, Math.max(0.05, chord * 0.01), [t1, t2]);
    if (fit.nodes.length === 2) { nodes[a].out = fit.nodes[0].out; nodes[b].in = fit.nodes[1].in; touched.add(a); touched.add(b); }
  }
  const out = nodes.filter((_, i) => keep[i]);
  if (!sub.closed) { out[0].in = null; out[out.length - 1].out = null; }
  nodes.forEach((node, i) => { if (touched.has(i) && keep[i]) node.kind = inferKind(node); });
  return { closed: sub.closed, nodes: out };
}

export function removeAnchorCommands(h: Host): Command[] {
  const picks = new Map<string, Map<number, Set<number>>>();
  for (const key of h.anchors()) {
    const [id, sub, idx] = key.split('|');
    const bySub = picks.get(id) ?? new Map<number, Set<number>>();
    bySub.set(Number(sub), (bySub.get(Number(sub)) ?? new Set<number>()).add(Number(idx)));
    picks.set(id, bySub);
  }
  const cmds: Command[] = [];
  let count = 0;
  for (const [id, bySub] of picks) {
    const shape = h.shape(id);
    if (!shape) continue;
    const subs: SubPath[] = [];
    shape.subs.forEach((sub, si) => {
      const drop = bySub.get(si);
      if (!drop || !drop.size) { subs.push(sub); return; }
      count += drop.size;
      const next = removeAnchors(sub, drop);
      if (next) subs.push(next);
    });
    cmds.push(subs.length ? updateGeometry(id, subs) : removeNode(id));
  }
  if (!cmds.length) h.notify(t('Select the anchors to remove first.'));
  return cmds;
}

/* Object > Path > Divide Objects Below */

const cutLine = (piece: SubPath[], line: Pt[]): SubPath[][] => {
  if (line.length < 2) return [piece];
  const ends = [line[0], line[line.length - 1]];
  if (ends.some(p => insideSubs(piece, p))) return [piece];
  const parts = knifeCut(piece, line);
  return parts.length ? parts : [piece];
};

export function dividePieces(target: SubPath[], cutter: SubPath[]): SubPath[][] {
  let pieces: SubPath[][] = [target];
  const closed = cutter.filter(sub => sub.closed && sub.nodes.length >= 3);
  if (closed.length) pieces = fragmentPieces([target, closed]).filter(piece => (piece.sig & 1) === 1).map(piece => piece.subs);
  for (const sub of cutter) {
    if (sub.closed || sub.nodes.length < 2) continue;
    const line = flattenSub(sub, 0.2);
    pieces = pieces.flatMap(piece => cutLine(piece, line));
  }
  return pieces.filter(piece => piece.length);
}

const overlaps = (a: Box, b: Box): boolean => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export function divideBelowCommands(h: Host): { cmds: Command[]; select: string[] } | null {
  const site = h.site();
  const svg = h.activeSvg();
  const cutters = selectedShapes(h).filter(s => s.svg === svg);
  if (!svg || !cutters.length) { h.notify(t('Select a path to use as the cutter first.')); return null; }
  const order = pathIds(site, svg);
  const lowest = Math.min(...cutters.map(c => order.indexOf(c.id)));
  const cutSubs = cutters.flatMap(c => c.subs);
  const box = pathBounds(cutSubs);
  const targets = order.slice(0, lowest).map(id => h.shape(id)).filter((s): s is NonNullable<typeof s> => !!s && !cutters.some(c => c.id === s.id) && s.paint.fill !== 'none');
  const taken = new Set<string>();
  const cmds: Command[] = [];
  const select: string[] = [];
  let divided = 0;
  for (const target of targets.reverse()) {
    const tb = pathBounds(target.subs);
    if (!box || !tb || !overlaps(box, tb)) continue;
    const pieces = dividePieces(target.subs, cutSubs);
    if (pieces.length < 2) continue;
    const parent = h.parentOf(target.id);
    if (!parent) continue;
    const index = site.nodes[parent].children.indexOf(target.id);
    pieces.forEach((subs, k) => {
      const made = cloneCommands(h, taken, target.id, subs, parent, index + k, undefined, { 'fill-rule': 'nonzero' });
      cmds.push(...made.cmds);
      select.push(made.id);
    });
    cmds.push(removeNode(target.id));
    divided++;
  }
  if (!divided) { h.notify(t('The selected path does not divide any object below it.')); return null; }
  for (const cutter of cutters) cmds.push(removeNode(cutter.id));
  h.notify(tn(divided, 'Divided {0} object.', 'Divided {0} objects.'));
  return { cmds, select };
}

/* Object > Path > Split Into Grid */

/** `fit` makes each rectangle fill its own bounds with the row heights and column widths worked out from the counts and gutters. */
export interface GridSpec { rows: number; rowHeight: number; rowGutter: number; cols: number; colWidth: number; colGutter: number; fit: boolean }

export function rectLike(subs: SubPath[]): Box | null {
  if (subs.length !== 1 || !subs[0].closed) return null;
  let nodes = subs[0].nodes;
  if (nodes.length === 5 && Math.hypot(nodes[0].x - nodes[4].x, nodes[0].y - nodes[4].y) < 1e-6) nodes = nodes.slice(0, 4);
  if (nodes.length !== 4 || nodes.some(n => n.in || n.out)) return null;
  const xs = [...new Set(nodes.map(n => Math.round(n.x * 1000) / 1000))], ys = [...new Set(nodes.map(n => Math.round(n.y * 1000) / 1000))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
}

export function gridBoxes(box: Box, spec: GridSpec): Box[] {
  const out: Box[] = [];
  const rowHeight = spec.fit ? (box.h - spec.rowGutter * (spec.rows - 1)) / spec.rows : spec.rowHeight;
  const colWidth = spec.fit ? (box.w - spec.colGutter * (spec.cols - 1)) / spec.cols : spec.colWidth;
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      out.push({ x: box.x + c * (colWidth + spec.colGutter), y: box.y + r * (rowHeight + spec.rowGutter), w: colWidth, h: rowHeight });
    }
  }
  return out;
}

export function gridTargets(h: Host): { id: string; box: Box }[] {
  const out: { id: string; box: Box }[] = [];
  for (const shape of selectedShapes(h)) { const box = rectLike(shape.subs); if (box && box.w > 0 && box.h > 0) out.push({ id: shape.id, box }); }
  return out;
}

export function splitGridCommands(h: Host, spec: GridSpec): { cmds: Command[]; select: string[] } | null {
  const site = h.site();
  const targets = gridTargets(h);
  if (!targets.length) { h.notify(t('Select a rectangle first.')); return null; }
  if (spec.rows * spec.cols > 2500) { h.notify(t('That grid has too many cells.')); return null; }
  if (spec.fit ? targets.some(({ box }) => box.h - spec.rowGutter * (spec.rows - 1) <= 0 || box.w - spec.colGutter * (spec.cols - 1) <= 0) : spec.rowHeight <= 0 || spec.colWidth <= 0) { h.notify(t('The gutters leave no room for the cells.')); return null; }
  const taken = new Set<string>();
  const cmds: Command[] = [];
  const select: string[] = [];
  for (const { id, box } of targets.reverse()) {
    const parent = h.parentOf(id);
    if (!parent) continue;
    const index = site.nodes[parent].children.indexOf(id);
    const group = freshId(site, taken, 'group');
    cmds.push({ command: 'node.add', params: { parent, node: { id: group, tag: 'g', name: t('Grid'), attrs: {} } } }, moveNode(group, parent, index + 1));
    gridBoxes(box, spec).forEach((cell, k) => {
      const made = cloneCommands(h, taken, id, [rectPath(cell.x, cell.y, cell.w, cell.h)], group, k);
      cmds.push(...made.cmds);
      select.push(made.id);
    });
    cmds.push(removeNode(id));
  }
  return cmds.length ? { cmds, select } : null;
}

/* Object > Path > Clean Up */

export interface CleanOptions { stray: boolean; unpainted: boolean; emptyText: boolean }

const textOf = (site: Site, node: SiteNode): string => node.text + node.children.map(id => (site.nodes[id] ? textOf(site, site.nodes[id]) : '')).join('');

export function cleanUpCommands(h: Host, options: CleanOptions): { cmds: Command[]; counts: { stray: number; unpainted: number; text: number } } {
  const site = h.site();
  const svg = h.activeSvg();
  const counts = { stray: 0, unpainted: 0, text: 0 };
  const cmds: Command[] = [];
  if (!svg) return { cmds, counts };
  const visit = (id: string): void => {
    const node = site.nodes[id];
    if (!node || DEF_TAGS.has(node.tag) || node.attrs['data-fw-live']) return;
    if (node.attrs['data-fw-type']) {
      const cfg = readType(node);
      if (options.emptyText && cfg && !cfg.text.trim()) { cmds.push(removeNode(id)); counts.text++; }
      return;
    }
    if (node.tag === 'text') {
      if (options.emptyText && !textOf(site, node).trim()) { cmds.push(removeNode(id)); counts.text++; }
      return;
    }
    if (node.tag === 'path') {
      const shape = h.shape(id);
      if (shape && options.stray && shape.subs.every(sub => sub.nodes.length <= 1)) { cmds.push(removeNode(id)); counts.stray++; return; }
      if (shape && options.unpainted && shape.paint.fill === 'none' && shape.paint.stroke === 'none') { cmds.push(removeNode(id)); counts.unpainted++; }
      return;
    }
    node.children.forEach(visit);
  };
  site.nodes[svg].children.forEach(visit);
  return { cmds, counts };
}

export function cleanUp(h: Host, options: CleanOptions): void {
  const { cmds, counts } = cleanUpCommands(h, options);
  const total = counts.stray + counts.unpainted + counts.text;
  if (!total) { h.notify(t('Nothing to clean up.')); return; }
  const message = t('Clean up removed {0} objects: {1} stray points, {2} unpainted objects, {3} empty text paths.', [total, counts.stray, counts.unpainted, counts.text]);
  void h.commit(cmds).then(() => h.notify(message));
}
