import type { Command, Site, SiteNode } from '../types';
import { applyCorners } from './corners';
import { blendSub, matchSubs, rotation, reflection, repeatMatrices, scaling, shearing, translation, type Mat } from './distort';
import { clonePath, decodeModel, mapPath, moveAnchor, parsePath, pathBounds, type Box, type Pt, type SubPath } from './geometry';
import { colorToHex, createGradient, mapGradient, readGradient, transformDefsCommands } from './gradient';
import type { Host } from './host';
import {
  freshId, geometryAttrs, moveNode, parentOf, pathIds, refOf, removeNode, svgOf, updateAttrs, updateGeometry, viewBoxOf, type Shape
} from './store';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';
export type AlignTo = 'selection' | 'key' | 'artboard';
export type DistributeMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom' | 'hspace' | 'vspace';

export const applyPt = (m: Mat, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

export function applyMat(subs: SubPath[], m: Mat): SubPath[] {
  const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const out = mapPath(subs, p => applyPt(m, p));
  for (const sub of out) for (const n of sub.nodes) if (n.corner && n.corner.mode === 'absolute') n.corner.radius *= k;
  return out;
}

function chainOf(site: Site, id: string, svg: string): string[] {
  const list: string[] = [];
  let current: string | undefined = id;
  while (current && list.length < 64) {
    list.push(current);
    if (current === svg) break;
    current = parentOf(site, current);
  }
  return list;
}

export function outerGroup(site: Site, id: string, boundary: string | null): string | undefined {
  let found: string | undefined;
  let current = parentOf(site, id);
  while (current && site.nodes[current]?.tag === 'g' && current !== boundary) {
    found = current;
    current = parentOf(site, current);
  }
  return found;
}

export function nearestGroup(site: Site, id: string): string | undefined {
  const parent = parentOf(site, id);
  return parent && site.nodes[parent]?.tag === 'g' ? parent : undefined;
}

export function groupCommands(h: Host, ids: string[], name = 'Group', attrs: Record<string, string> = {}): { cmds: Command[]; group: string } | null {
  const site = h.site();
  const svg = h.activeSvg();
  if (!svg || !ids.length) return null;
  const full = ids.map(id => chainOf(site, id, svg).reverse());
  let depth = 0;
  while (full.every(c => c.length > depth + 2 && c[depth + 1] === full[0][depth + 1])) depth++;
  const lca = full[0][depth];
  const units = [...new Set(full.map(c => c[depth + 1]))];
  const siblings = site.nodes[lca].children;
  units.sort((a, b) => siblings.indexOf(a) - siblings.indexOf(b));
  const group = freshId(site, new Set(), 'group');
  const top = siblings.indexOf(units[units.length - 1]);
  const cmds: Command[] = [{ command: 'node.add', params: { parent: lca, node: { id: group, tag: 'g', name, attrs } } }];
  units.forEach((unit, k) => cmds.push(moveNode(unit, group, k)));
  cmds.push(moveNode(group, lca, Math.max(0, top - (units.length - 1))));
  return { cmds, group };
}

export function ungroupCommands(h: Host, ids: string[]): Command[] {
  const site = h.site();
  const groups = new Set<string>();
  for (const id of ids) { const g = nearestGroup(site, id); if (g) groups.add(g); }
  const cmds: Command[] = [];
  for (const g of groups) {
    const node = site.nodes[g];
    if (node.attrs['clip-path'] || node.attrs.mask) { h.notify('Release the clipping or opacity mask before ungrouping.'); continue; }
    const parent = parentOf(site, g);
    if (!parent) continue;
    const index = site.nodes[parent].children.indexOf(g);
    node.children.forEach((child, k) => cmds.push(moveNode(child, parent, index + k)));
    cmds.push(removeNode(g));
  }
  return cmds;
}

function defFor(site: Site, svg: string, ref: string): SiteNode | undefined {
  const visit = (id: string, depth: number): SiteNode | undefined => {
    const node = site.nodes[id];
    if (!node || depth > 32) return undefined;
    if ((node.tag === 'clipPath' || node.tag === 'mask') && node.attrs.id === ref) return node;
    for (const child of node.children) { const found = visit(child, depth + 1); if (found) return found; }
    return undefined;
  };
  return visit(svg, 0);
}

export interface MaskOptions { clip: boolean; invert: boolean }

const MASK_BACKDROP = 'M-50000 -50000H50000V50000H-50000Z';
const BACKDROP_NAME = 'Mask background';

const maskToken = (o: MaskOptions): string => (o.clip ? (o.invert ? 'clip-invert' : 'clip') : o.invert ? 'invert' : 'plain');

function maskOptionsOf(token: string | undefined): MaskOptions {
  return { clip: token === undefined || token === 'clip' || token === 'clip-invert', invert: token === 'invert' || token === 'clip-invert' };
}

const backdropFill = (o: MaskOptions): string => (o.clip === o.invert ? '#ffffff' : '#000000');

function complement(value: string | undefined): string | null | undefined {
  if (value === undefined || value === 'none') return value;
  const hex = colorToHex(value, '');
  if (!hex) return null;
  return `#${[1, 3, 5].map(i => (255 - parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('')}`;
}

export function maskHolder(site: Site, ids: string[]): { group: string; def: SiteNode; options: MaskOptions } | undefined {
  for (const id of ids) {
    let g = nearestGroup(site, id);
    while (g && !site.nodes[g].attrs.mask) g = nearestGroup(site, g);
    const node = g && site.nodes[g];
    const svg = g && svgOf(site, g);
    const ref = node && refOf(node.attrs.mask);
    const def = ref && svg ? defFor(site, svg, ref) : undefined;
    if (g && node && def && def.tag === 'mask') return { group: g, def, options: maskOptionsOf(node.attrs['data-fw-mask']) };
  }
  return undefined;
}

export function maskOptionCommands(h: Host, next: MaskOptions): Command[] {
  const site = h.site();
  const holder = maskHolder(site, h.selection());
  if (!holder) return [];
  const cmds: Command[] = [];
  const kids = holder.def.children.map(id => site.nodes[id]).filter(Boolean);
  const shape = kids.filter(n => n.tag === 'path' && n.name !== BACKDROP_NAME);
  const back = kids.find(n => n.name === BACKDROP_NAME);
  if (holder.options.invert !== next.invert) {
    for (const node of shape) {
      const patch: Record<string, string | null> = {};
      for (const name of ['fill', 'stroke'] as const) {
        const flipped = complement(node.attrs[name]);
        if (flipped === null) { h.notify('Invert Mask needs solid colors in the mask shape.'); return []; }
        if (flipped !== undefined) patch[name] = flipped;
      }
      cmds.push(updateAttrs(node.id, patch));
    }
  }
  const fill = backdropFill(next);
  if (back) { if (back.attrs.fill !== fill) cmds.push(updateAttrs(back.id, { fill })); }
  else {
    const id = freshId(site, new Set(), 'maskbg');
    cmds.push({ command: 'node.add', params: { parent: holder.def.id, node: { id, tag: 'path', name: BACKDROP_NAME, attrs: { d: MASK_BACKDROP, fill } } } }, moveNode(id, holder.def.id, 0));
  }
  cmds.push(updateAttrs(holder.group, { 'data-fw-mask': maskToken(next) }));
  return cmds;
}

export function makeMaskCommands(h: Host, kind: 'clip' | 'mask', options: MaskOptions = { clip: true, invert: false }): Command[] {
  const site = h.site();
  const svg = h.activeSvg();
  const ids = h.selection().filter(id => site.nodes[id]?.tag === 'path');
  if (!svg || ids.length < 2) { h.notify('Select two or more paths. The top one becomes the mask.'); return []; }
  const order = pathIds(site, svg);
  ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const top = ids[ids.length - 1];
  const contents = ids.slice(0, -1);
  const source = site.nodes[top];
  const defId = freshId(site, new Set(), kind === 'clip' ? 'clip' : 'mask');
  const childId = freshId(site, new Set([defId]), 'maskpath');
  const defAttrs: Record<string, string> = kind === 'clip' ? { id: defId, clipPathUnits: 'userSpaceOnUse' } : { id: defId, maskUnits: 'userSpaceOnUse', x: '-50000', y: '-50000', width: '100000', height: '100000' };
  const childAttrs: Record<string, string> = { d: source.attrs.d ?? '' };
  if (source.attrs['data-fw-vector']) childAttrs['data-fw-vector'] = source.attrs['data-fw-vector'];
  if (kind === 'clip') childAttrs['clip-rule'] = source.attrs['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';
  else for (const name of ['fill', 'stroke', 'stroke-width', 'fill-rule', 'opacity']) if (source.attrs[name] !== undefined) childAttrs[name] = source.attrs[name];
  if (kind === 'mask' && options.invert) {
    for (const name of ['fill', 'stroke'] as const) {
      const flipped = complement(childAttrs[name]);
      if (flipped === null) { h.notify('Invert Mask needs solid colors in the mask shape.'); return []; }
      if (flipped !== undefined) childAttrs[name] = flipped;
    }
  }
  const cmds: Command[] = [
    { command: 'node.add', params: { parent: svg, node: { id: defId, tag: kind === 'clip' ? 'clipPath' : 'mask', name: kind === 'clip' ? 'Clipping mask' : 'Opacity mask', attrs: defAttrs } } }
  ];
  if (kind === 'mask') cmds.push({ command: 'node.add', params: { parent: defId, node: { id: freshId(site, new Set([defId, childId]), 'maskbg'), tag: 'path', name: BACKDROP_NAME, attrs: { d: MASK_BACKDROP, fill: backdropFill(options) } } } });
  cmds.push({ command: 'node.add', params: { parent: defId, node: { id: childId, tag: 'path', name: 'Mask shape', attrs: childAttrs } } });
  const groupAttrs: Record<string, string> = { [kind === 'clip' ? 'clip-path' : 'mask']: `url(#${defId})` };
  if (kind === 'mask') groupAttrs['data-fw-mask'] = maskToken(options);
  const grouped = groupCommands(h, contents, kind === 'clip' ? 'Clipped group' : 'Masked group', groupAttrs);
  if (!grouped) return [];
  cmds.push(...grouped.cmds, removeNode(top));
  return cmds;
}

export function releaseMaskCommands(h: Host): Command[] {
  const site = h.site();
  const svg = h.activeSvg();
  if (!svg) return [];
  const cmds: Command[] = [];
  const done = new Set<string>();
  for (const id of h.selection()) {
    let g = nearestGroup(site, id);
    while (g && !(site.nodes[g].attrs['clip-path'] || site.nodes[g].attrs.mask)) g = nearestGroup(site, g);
    if (!g || done.has(g)) continue;
    done.add(g);
    const node = site.nodes[g];
    const ref = refOf(node.attrs['clip-path']) ?? refOf(node.attrs.mask);
    const def = ref ? defFor(site, svg, ref) : undefined;
    const parent = parentOf(site, g);
    if (!parent) continue;
    const index = site.nodes[parent].children.indexOf(g);
    node.children.forEach((child, k) => cmds.push(moveNode(child, parent, index + k)));
    cmds.push(removeNode(g));
    const shape = def && def.children.map(child => site.nodes[child]).find(n => n && n.name !== BACKDROP_NAME);
    if (def && shape) {
      const restored = freshId(site, new Set(), 'path');
      const attrs = { ...shape.attrs };
      delete attrs['clip-rule'];
      if (def.tag === 'mask' && maskOptionsOf(node.attrs['data-fw-mask']).invert) {
        for (const name of ['fill', 'stroke'] as const) { const flipped = complement(attrs[name]); if (flipped) attrs[name] = flipped; }
      }
      if (def.tag === 'clipPath') Object.assign(attrs, { fill: 'none', stroke: '#808080', 'stroke-width': '1' });
      cmds.push({ command: 'node.add', params: { parent, node: { id: restored, tag: 'path', name: 'Mask shape', attrs } } });
      cmds.push(moveNode(restored, parent, index + node.children.length));
    }
    if (def) cmds.push(removeNode(def.id));
  }
  if (!cmds.length) h.notify('The selection is not inside a clipping or opacity mask.');
  return cmds;
}

function holders(site: Site, ids: string[]): { group: string; def: SiteNode; members: string[] }[] {
  const wanted = new Set(ids);
  const seen = new Set<string>();
  const out: { group: string; def: SiteNode; members: string[] }[] = [];
  for (const id of ids) {
    let g = nearestGroup(site, id);
    while (g) {
      const node = site.nodes[g];
      const ref = refOf(node.attrs['clip-path']) ?? refOf(node.attrs.mask);
      const svg = svgOf(site, g);
      const def = ref && svg ? defFor(site, svg, ref) : undefined;
      const members = pathIds(site, g);
      if (def && !seen.has(g) && members.every(m => wanted.has(m))) { seen.add(g); out.push({ group: g, def, members }); }
      g = nearestGroup(site, g);
    }
  }
  return out;
}

export function maskShiftCommands(h: Host, ids: string[], matrix: (id: string) => Mat | undefined): Command[] {
  const site = h.site();
  const cmds: Command[] = [];
  for (const holder of holders(site, ids)) {
    const m = matrix(holder.members[0]);
    if (!m) continue;
    for (const child of holder.def.children) {
      const node = site.nodes[child];
      if (!node || node.tag !== 'path') continue;
      const subs = shapeSubs(node);
      cmds.push({ command: 'node.update', params: { id: child, patch: { attrs: geometryAttrs(applyMat(subs, m)) } } });
    }
  }
  return cmds;
}

function shapeSubs(node: SiteNode): SubPath[] {
  return decodeModel(node.attrs['data-fw-vector']) ?? parsePath(node.attrs.d);
}

export function defsFollowCommands(h: Host, ids: string[], matrix: (id: string) => Mat | undefined): Command[] {
  return [...transformDefsCommands(h, ids, matrix), ...maskShiftCommands(h, ids, matrix)];
}

export function unionBox(shapes: Shape[]): Box | null {
  let box: Box | null = null;
  for (const shape of shapes) {
    const b = pathBounds(applyCorners(shape.subs));
    if (!b) continue;
    if (!box) { box = { ...b }; continue; }
    const x0 = Math.min(box.x, b.x), y0 = Math.min(box.y, b.y), x1 = Math.max(box.x + box.w, b.x + b.w), y1 = Math.max(box.y + box.h, b.y + b.h);
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return box;
}

const boxOf = (shape: Shape): Box => pathBounds(applyCorners(shape.subs)) ?? { x: 0, y: 0, w: 0, h: 0 };

export function moveCommands(h: Host, deltas: Map<string, Pt>): Command[] {
  const cmds: Command[] = [];
  const ids: string[] = [];
  for (const [id, d] of deltas) {
    const shape = h.shape(id);
    if (!shape || (Math.abs(d[0]) < 1e-6 && Math.abs(d[1]) < 1e-6)) continue;
    ids.push(id);
    cmds.push(updateGeometry(id, applyMat(shape.subs, translation(d[0], d[1]))));
  }
  cmds.push(...defsFollowCommands(h, ids, id => { const d = deltas.get(id); return d ? translation(d[0], d[1]) : undefined; }));
  return cmds;
}

interface AnchorRef { id: string; sub: number; idx: number }

function anchorRefs(h: Host): AnchorRef[] {
  return [...h.anchors()].map(key => { const [id, sub, idx] = key.split('|'); return { id, sub: Number(sub), idx: Number(idx) }; });
}

function artboard(h: Host): Box {
  const svg = h.activeSvg();
  const node = svg ? h.site().nodes[svg] : undefined;
  const vb = node ? viewBoxOf(node) : [0, 0, 100, 100];
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
}

function commitAnchorMoves(h: Host, refs: AnchorRef[], target: (ref: AnchorRef, x: number, y: number) => Pt): Command[] {
  const cmds: Command[] = [];
  for (const id of new Set(refs.map(r => r.id))) {
    const shape = h.shape(id);
    if (!shape) continue;
    const subs = clonePath(shape.subs);
    for (const ref of refs) {
      if (ref.id !== id) continue;
      const node = subs[ref.sub]?.nodes[ref.idx];
      if (!node) continue;
      const next = target(ref, node.x, node.y);
      moveAnchor(node, next[0], next[1]);
    }
    cmds.push(updateGeometry(id, subs));
  }
  return cmds;
}

export function alignCommands(h: Host, mode: AlignMode, to: AlignTo): Command[] {
  const refs = anchorRefs(h);
  if (refs.length >= 2) {
    const pts = refs.map(r => { const n = h.shape(r.id)?.subs[r.sub]?.nodes[r.idx]; return n ? [n.x, n.y] as Pt : [0, 0] as Pt; });
    const ref: Box = to === 'artboard' ? artboard(h) : { x: Math.min(...pts.map(p => p[0])), y: Math.min(...pts.map(p => p[1])), w: 0, h: 0 };
    if (to !== 'artboard') { ref.w = Math.max(...pts.map(p => p[0])) - ref.x; ref.h = Math.max(...pts.map(p => p[1])) - ref.y; }
    return commitAnchorMoves(h, refs, (_r, x, y) => [
      mode === 'left' ? ref.x : mode === 'right' ? ref.x + ref.w : mode === 'hcenter' ? ref.x + ref.w / 2 : x,
      mode === 'top' ? ref.y : mode === 'bottom' ? ref.y + ref.h : mode === 'vmiddle' ? ref.y + ref.h / 2 : y
    ]);
  }
  const shapes = h.selection().map(id => h.shape(id)).filter((s): s is Shape => !!s);
  if (!shapes.length || (to !== 'artboard' && shapes.length < 2)) { h.notify('Select two or more objects, or two or more anchors, to align.'); return []; }
  const key = shapes.find(s => s.id === h.primary());
  const ref = to === 'artboard' ? artboard(h) : to === 'key' && key ? boxOf(key) : unionBox(shapes)!;
  const deltas = new Map<string, Pt>();
  for (const shape of shapes) {
    if (to === 'key' && key && shape.id === key.id) continue;
    const b = boxOf(shape);
    const dx = mode === 'left' ? ref.x - b.x : mode === 'right' ? ref.x + ref.w - (b.x + b.w) : mode === 'hcenter' ? ref.x + ref.w / 2 - (b.x + b.w / 2) : 0;
    const dy = mode === 'top' ? ref.y - b.y : mode === 'bottom' ? ref.y + ref.h - (b.y + b.h) : mode === 'vmiddle' ? ref.y + ref.h / 2 - (b.y + b.h / 2) : 0;
    deltas.set(shape.id, [dx, dy]);
  }
  return moveCommands(h, deltas);
}

export function distributeCommands(h: Host, mode: DistributeMode, gap: number | null): Command[] {
  const refs = anchorRefs(h);
  const horizontal = mode === 'left' || mode === 'hcenter' || mode === 'right' || mode === 'hspace';
  if (refs.length >= 3) {
    const pos = refs.map(r => { const n = h.shape(r.id)?.subs[r.sub]?.nodes[r.idx]; return horizontal ? n?.x ?? 0 : n?.y ?? 0; });
    const order = refs.map((_, i) => i).sort((a, b) => pos[a] - pos[b]);
    const lo = pos[order[0]], hi = pos[order[order.length - 1]];
    const target = new Map<AnchorRef, number>();
    order.forEach((i, k) => target.set(refs[i], lo + ((hi - lo) * k) / (order.length - 1)));
    return commitAnchorMoves(h, refs, (r, x, y) => (horizontal ? [target.get(refs.find(o => o.id === r.id && o.sub === r.sub && o.idx === r.idx)!) ?? x, y] : [x, target.get(refs.find(o => o.id === r.id && o.sub === r.sub && o.idx === r.idx)!) ?? y]));
  }
  const shapes = h.selection().map(id => h.shape(id)).filter((s): s is Shape => !!s);
  const spacing = mode === 'hspace' || mode === 'vspace';
  if (shapes.length < (spacing && gap !== null ? 2 : 3)) { h.notify('Select three or more objects to distribute.'); return []; }
  const boxes = new Map(shapes.map(s => [s.id, boxOf(s)]));
  const start = (id: string): number => { const b = boxes.get(id)!; return horizontal ? b.x : b.y; };
  const size = (id: string): number => { const b = boxes.get(id)!; return horizontal ? b.w : b.h; };
  const anchorPos = (id: string): number => (mode === 'left' || mode === 'top' ? start(id) : mode === 'right' || mode === 'bottom' ? start(id) + size(id) : start(id) + size(id) / 2);
  const deltas = new Map<string, Pt>();
  const set = (id: string, d: number): void => { deltas.set(id, horizontal ? [d, 0] : [0, d]); };
  if (!spacing) {
    const order = shapes.map(s => s.id).sort((a, b) => anchorPos(a) - anchorPos(b));
    const lo = anchorPos(order[0]), hi = anchorPos(order[order.length - 1]);
    order.forEach((id, k) => set(id, lo + ((hi - lo) * k) / (order.length - 1) - anchorPos(id)));
    return moveCommands(h, deltas);
  }
  const order = shapes.map(s => s.id).sort((a, b) => start(a) - start(b));
  const first = start(order[0]), last = start(order[order.length - 1]) + size(order[order.length - 1]);
  const total = order.reduce((sum, id) => sum + size(id), 0);
  const step = gap ?? (last - first - total) / (order.length - 1);
  let cursor = first;
  const targets = new Map<string, number>();
  for (const id of order) { targets.set(id, cursor); cursor += size(id) + step; }
  const key = order.find(id => id === h.primary());
  const shift = gap !== null && key ? start(key) - targets.get(key)! : 0;
  for (const id of order) set(id, targets.get(id)! + shift - start(id));
  return moveCommands(h, deltas);
}

export function cloneCommands(h: Host, taken: Set<string>, id: string, subs: SubPath[], parent: string, index: number, matrix?: Mat, overrides: Record<string, string> = {}): { id: string; cmds: Command[] } {
  const site = h.site();
  const node = site.nodes[id];
  const svg = svgOf(site, id) ?? h.activeSvg() ?? parent;
  const nid = freshId(site, taken, 'path');
  const attrs: Record<string, string> = { ...node.attrs, ...geometryAttrs(subs), ...overrides };
  delete attrs.id;
  delete attrs['data-fw-width'];
  if (attrs['data-fw-align']) {
    attrs['stroke-width'] = attrs['data-fw-weight'] ?? attrs['stroke-width'];
    for (const name of ['data-fw-align', 'data-fw-weight', 'paint-order', 'clip-path']) delete attrs[name];
  }
  const cmds: Command[] = [];
  for (const name of ['fill', 'stroke']) {
    const ref = refOf(attrs[name]);
    const found = ref ? readGradient(site, svg, ref) : undefined;
    if (!found) continue;
    const made = createGradient(site, taken, svg, matrix && found.node.attrs.gradientUnits === 'userSpaceOnUse' ? mapGradient(found.gradient, matrix) : found.gradient);
    cmds.push(...made.cmds);
    attrs[name] = `url(#${made.id})`;
  }
  cmds.push({ command: 'node.add', params: { parent, node: { id: nid, tag: 'path', name: node.name, attrs } } }, moveNode(nid, parent, index));
  return { id: nid, cmds };
}

function orderedSelection(h: Host): Shape[] {
  const svg = h.activeSvg();
  const order = svg ? pathIds(h.site(), svg) : [];
  return h.selection().map(id => h.shape(id)).filter((s): s is Shape => !!s).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function matrixCommands(h: Host, per: Map<string, Mat>, copy: boolean, strokes: boolean): { cmds: Command[]; created: string[] } {
  const site = h.site();
  const cmds: Command[] = [];
  const created: string[] = [];
  const taken = new Set<string>();
  const ids = [...per.keys()];
  for (const id of ids) {
    const shape = h.shape(id);
    const m = per.get(id)!;
    if (!shape) continue;
    const subs = applyMat(shape.subs, m);
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
    const overrides: Record<string, string> = {};
    if (strokes && shape.paint.stroke !== 'none') overrides['stroke-width'] = String(Math.round(shape.paint.strokeWidth * k * 100) / 100);
    if (copy) {
      const parent = parentOf(site, id) ?? shape.svg;
      const made = cloneCommands(h, taken, id, subs, parent, site.nodes[parent].children.indexOf(id) + 1, m, overrides);
      cmds.push(...made.cmds);
      created.push(made.id);
    } else {
      cmds.push(updateGeometry(id, subs));
      if (overrides['stroke-width']) cmds.push(updateAttrs(id, shape.paint.align === 'center' ? { 'stroke-width': overrides['stroke-width'] } : { 'stroke-width': String(Number(overrides['stroke-width']) * 2), 'data-fw-weight': overrides['stroke-width'] }));
    }
  }
  if (!copy) cmds.push(...defsFollowCommands(h, ids, id => per.get(id)));
  return { cmds, created };
}

export interface TransformParams { kind: 'rotate' | 'scale' | 'reflect' | 'shear' | 'move'; angle: number; sx: number; sy: number; axis: number; dx: number; dy: number; copy: boolean; strokes: boolean; uniform: boolean }

export function transformSelection(h: Host, p: TransformParams): { cmds: Command[]; created: string[] } {
  const shapes = orderedSelection(h);
  if (!shapes.length) { h.notify('Select one or more paths first.'); return { cmds: [], created: [] }; }
  const box = unionBox(shapes)!;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  let m: Mat;
  if (p.kind === 'rotate') m = rotation(p.angle, cx, cy);
  else if (p.kind === 'scale') m = scaling(p.sx / 100, (p.uniform ? p.sx : p.sy) / 100, cx, cy);
  else if (p.kind === 'reflect') m = reflection(p.axis, cx, cy);
  else if (p.kind === 'shear') m = shearing(p.angle, p.axis, cx, cy);
  else m = translation(p.dx, p.dy);
  return matrixCommands(h, new Map(shapes.map(s => [s.id, m])), p.copy, p.strokes);
}

export interface EachParams { sx: number; sy: number; angle: number; dx: number; dy: number; reflectX: boolean; reflectY: boolean; random: boolean; copy: boolean; strokes: boolean }

export function transformEach(h: Host, p: EachParams): { cmds: Command[]; created: string[] } {
  const shapes = orderedSelection(h);
  if (!shapes.length) { h.notify('Select one or more paths first.'); return { cmds: [], created: [] }; }
  const per = new Map<string, Mat>();
  for (const shape of shapes) {
    const b = boxOf(shape);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const r = (): number => (p.random ? Math.random() : 1);
    const sx = 1 + (p.sx / 100 - 1) * r(), sy = 1 + (p.sy / 100 - 1) * r();
    const fx = p.reflectX ? -1 : 1, fy = p.reflectY ? -1 : 1;
    const mats: Mat[] = [scaling(sx * fx, sy * fy, cx, cy), rotation(p.angle * r(), cx, cy), translation(p.dx * r(), p.dy * r())];
    per.set(shape.id, mats.reduce((acc, next) => composeMat(next, acc)));
  }
  return matrixCommands(h, per, p.copy, p.strokes);
}

function composeMat(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function wrapCommands(h: Host, name: string, parent: string, index: number): { id: string; cmds: Command[] } {
  const id = freshId(h.site(), new Set(), 'group');
  return { id, cmds: [{ command: 'node.add', params: { parent, node: { id, tag: 'g', name, attrs: {} } } }, moveNode(id, parent, index)] };
}

export function blendCommands(h: Host, steps: number): { cmds: Command[]; group: string } | null {
  const shapes = orderedSelection(h);
  if (shapes.length !== 2) { h.notify('Select exactly two paths to blend.'); return null; }
  const [a, b] = shapes;
  if (!a.subs[0] || !b.subs[0]) return null;
  const [A, B] = matchSubs(a.subs[0], b.subs[0]);
  const site = h.site();
  const parent = parentOf(site, a.id) ?? a.svg;
  const wrap = wrapCommands(h, 'Blend', parent, site.nodes[parent].children.indexOf(a.id) + 1);
  const taken = new Set<string>([wrap.id]);
  const cmds = [...wrap.cmds];
  const count = Math.max(1, Math.min(60, Math.round(steps)));
  const colors = (name: 'fill' | 'stroke'): [string, string] | null => {
    const x = a.paint[name], y = b.paint[name];
    return x !== 'none' && y !== 'none' && colorToHex(x, '') && colorToHex(y, '') && !refOf(x) && !refOf(y) ? [colorToHex(x), colorToHex(y)] : null;
  };
  const fillPair = colors('fill'), strokePair = colors('stroke');
  const mix = (pair: [string, string] | null, own: string, t: number): string => {
    if (!pair) return own;
    const ca = pair[0], cb = pair[1];
    const ch = (i: number): string => Math.round(parseInt(ca.slice(i, i + 2), 16) * (1 - t) + parseInt(cb.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0');
    return `#${ch(1)}${ch(3)}${ch(5)}`;
  };
  for (let k = 1; k <= count; k++) {
    const t = k / (count + 1);
    const overrides: Record<string, string> = {
      fill: mix(fillPair, a.paint.fill, t),
      stroke: mix(strokePair, a.paint.stroke, t),
      'stroke-width': String(Math.round((a.paint.strokeWidth + (b.paint.strokeWidth - a.paint.strokeWidth) * t) * 100) / 100)
    };
    if (a.paint.stroke === 'none' && b.paint.stroke === 'none') delete overrides['stroke-width'];
    const opacity = a.paint.opacity + (b.paint.opacity - a.paint.opacity) * t;
    if (opacity < 1) overrides.opacity = String(Math.round(opacity * 1000) / 1000);
    cmds.push(...cloneCommands(h, taken, a.id, [blendSub(A, B, t)], wrap.id, k - 1, undefined, overrides).cmds);
  }
  return { cmds, group: wrap.id };
}

export interface RepeatParams { kind: 'radial' | 'grid' | 'mirror'; count: number; radius: number; cols: number; rows: number; gapX: number; gapY: number; angle: number; brick: 'none' | 'row' | 'column'; offset: number }

export function repeatCommands(h: Host, p: RepeatParams): { cmds: Command[]; group: string } | null {
  const shapes = orderedSelection(h);
  if (!shapes.length) { h.notify('Select one or more paths to repeat.'); return null; }
  const box = unionBox(shapes)!;
  const mats = repeatMatrices(p.kind, box, p);
  if (!mats.length) return null;
  const site = h.site();
  const last = shapes[shapes.length - 1];
  const parent = parentOf(site, last.id) ?? last.svg;
  const wrap = wrapCommands(h, `Repeat (${p.kind})`, parent, site.nodes[parent].children.indexOf(last.id) + 1);
  const taken = new Set<string>([wrap.id]);
  const cmds = [...wrap.cmds];
  let index = 0;
  for (const m of mats) for (const shape of shapes) cmds.push(...cloneCommands(h, taken, shape.id, applyMat(shape.subs, m), wrap.id, index++, m).cmds);
  return { cmds, group: wrap.id };
}

