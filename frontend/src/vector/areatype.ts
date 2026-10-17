import type { Command, Site, SiteNode } from '../types';
import { flattenSub } from './edit';
import { fmt, parsePath, pathBounds, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import { freshId, removeNode, updateAttrs } from './store';

export type AreaAlign = 'left' | 'center' | 'right';

export interface AreaOptions { text: string; size: number; leading: number; family: string; weight: string; color: string; align: AreaAlign; inset: number; columns: number; gutter: number }

export const areaOptions: AreaOptions = { text: '', size: 16, leading: 20, family: 'system-ui, sans-serif', weight: '400', color: '#1f1f1f', align: 'left', inset: 6, columns: 1, gutter: 12 };

export interface AreaLine { x: number; y: number; text: string }

const LINE_LIMIT = 400;
const ASCENT = 0.8;
const DESCENT = 0.2;

type Span = [number, number];

function spansAt(polys: Pt[][], y: number): Span[] {
  const xs: number[] = [];
  for (const pts of polys) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  }
  xs.sort((p, q) => p - q);
  const out: Span[] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}

function meet(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) { const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi > lo) out.push([lo, hi]); }
  return out;
}

type Token = { word: string } | { para: true };

function tokens(text: string): Token[] {
  const out: Token[] = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((para, i) => {
    if (i > 0) out.push({ para: true });
    for (const word of para.split(/\s+/)) if (word) out.push({ word });
  });
  return out;
}

export function layoutArea(subs: SubPath[], o: AreaOptions, measure: (s: string) => number): { lines: AreaLine[]; overflow: number; rest: string } {
  const box = pathBounds(subs);
  const polys = subs.filter(s => s.closed).map(s => flattenSub(s, 0.25)).filter(p => p.length > 2);
  const queue = tokens(o.text);
  const lines: AreaLine[] = [];
  if (!box || !polys.length) return { lines, overflow: queue.filter(t => 'word' in t).length, rest: o.text };
  const columns = Math.max(1, Math.min(12, Math.round(o.columns)));
  const colW = (box.w - 2 * o.inset - o.gutter * (columns - 1)) / columns;
  const space = measure(' ');
  let q = 0;
  for (let c = 0; c < columns && q < queue.length && colW > 0; c++) {
    const col: Span = [box.x + o.inset + c * (colW + o.gutter), box.x + o.inset + c * (colW + o.gutter) + colW];
    for (let y = box.y + o.inset + o.size * ASCENT; q < queue.length && lines.length < LINE_LIMIT; y += o.leading) {
      if (y + o.size * DESCENT > box.y + box.h - o.inset) break;
      const top = y - o.size * ASCENT + 0.01, bottom = y + o.size * DESCENT - 0.01;
      let spans = meet(meet(spansAt(polys, top), spansAt(polys, y - o.size * 0.3)), spansAt(polys, bottom));
      spans = meet(spans, [col]).map(([a, b]) => [a + o.inset, b - o.inset] as Span).filter(([a, b]) => b - a >= o.size);
      if (!spans.length) continue;
      const [x0, x1] = spans.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best));
      const width = x1 - x0;
      const tok = queue[q];
      if ('para' in tok) { q++; continue; }
      let text = '';
      let used = 0;
      while (q < queue.length) {
        const t = queue[q];
        if ('para' in t) { if (text) { q++; } break; }
        const w = measure(t.word);
        if (!text && w > width) {
          let cut = t.word.length;
          while (cut > 1 && measure(t.word.slice(0, cut)) > width) cut--;
          text = t.word.slice(0, cut);
          queue[q] = { word: t.word.slice(cut) };
          if (!t.word.slice(cut)) q++;
          break;
        }
        const next = text ? used + space + w : w;
        if (next > width) break;
        text = text ? `${text} ${t.word}` : t.word;
        used = next;
        q++;
      }
      if (!text) continue;
      const x = o.align === 'center' ? (x0 + x1) / 2 : o.align === 'right' ? x1 : x0;
      lines.push({ x, y, text });
    }
  }
  const left = queue.slice(q);
  let rest = '';
  for (const tok of left) rest += 'para' in tok ? '\n' : rest && !rest.endsWith('\n') ? ` ${tok.word}` : tok.word;
  return { lines, overflow: left.filter(t => 'word' in t).length, rest };
}

export function measurer(o: AreaOptions): (s: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return s => s.length * o.size * 0.55;
  ctx.font = `${o.weight} ${o.size}px ${o.family}`;
  return s => ctx.measureText(s).width;
}

/* Live area type: the text keeps its source shape and options in data-fw-area, and areaFixes lays the lines out
   again in the same commit whenever the shape's geometry changes. */
export interface AreaSpec { v: 1; src: string; text: string; leading: number; align: AreaAlign; inset: number; columns: number; gutter: number; chain?: [string, string][]; over?: number }

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const THREAD_LIMIT = 20;

export function areaAttr(src: string, o: AreaOptions, chain?: [string, string][], over?: number): string {
  const spec: AreaSpec = { v: 1, src, text: o.text, leading: o.leading, align: o.align, inset: o.inset, columns: o.columns, gutter: o.gutter, ...(chain?.length ? { chain } : {}), ...(over ? { over } : {}) };
  return JSON.stringify(spec);
}

export function readArea(raw: string | undefined): AreaSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<AreaSpec>;
    const n = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (c.v !== 1 || typeof c.src !== 'string' || !ID.test(c.src) || typeof c.text !== 'string' || c.text.length > 20000 || !n(c.leading, 1, 10000)
      || (c.align !== 'left' && c.align !== 'center' && c.align !== 'right') || !n(c.inset, 0, 10000) || !n(c.columns, 1, 12) || !n(c.gutter, 0, 10000)) return null;
    const chain = c.chain;
    if (chain !== undefined && (!Array.isArray(chain) || chain.length > THREAD_LIMIT || !chain.every(l => Array.isArray(l) && l.length === 2 && l.every(id => typeof id === 'string' && ID.test(id))))) return null;
    if (c.over !== undefined && !(Number.isInteger(c.over) && c.over >= 0 && c.over <= 100000)) return null;
    return { v: 1, src: c.src, text: c.text, leading: c.leading, align: c.align, inset: c.inset, columns: c.columns, gutter: c.gutter, ...(chain?.length ? { chain } : {}), ...(c.over ? { over: c.over } : {}) };
  } catch { return null; }
}

/* Threaded text: the words flow through the first shape and then each linked shape in order; whatever is left
   after the last one is the overflow, kept in the spec so the canvas can mark it. */
export function relayoutChain(site: Site, text: SiteNode, spec: AreaSpec, o: AreaOptions, subsOf: (id: string) => SubPath[] | null, chain: [string, string][] = spec.chain ?? []): { cmds: Command[]; overflow: number; lines: number } {
  const taken = new Set<string>();
  const measure = measurer(o);
  const cmds: Command[] = [];
  let remaining = o.text;
  let total = 0;
  for (const [shapeId, textId] of [[spec.src, text.id] as [string, string], ...chain]) {
    cmds.push(...(site.nodes[textId]?.children ?? []).map(id => removeNode(id)));
    const subs = subsOf(shapeId);
    if (!subs || !remaining.trim()) continue;
    const res = layoutArea(subs, { ...o, text: remaining }, measure);
    res.lines.forEach(line => cmds.push({ command: 'node.add', params: { parent: textId, node: { id: freshId(site, taken, 'tspan'), tag: 'tspan', name: 'Line', text: line.text, attrs: { x: fmt(line.x), y: fmt(line.y) } } } }));
    total += res.lines.length;
    remaining = res.rest;
  }
  const overflow = remaining.split(/\s+/).filter(Boolean).length;
  cmds.push(updateAttrs(text.id, { 'data-fw-area': areaAttr(spec.src, o, chain, overflow) }));
  return { cmds, overflow, lines: total };
}

const fontAttrs = (o: AreaOptions): Record<string, string> => ({ 'font-size': fmt(o.size), 'font-family': o.family, 'font-weight': o.weight, fill: o.color, 'text-anchor': o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start' });

const shapeSubs = (site: Site, patched?: Map<string, Record<string, string | null>>) => (id: string): SubPath[] | null => {
  const d = patched?.get(id)?.d ?? site.nodes[id]?.attrs.d;
  return d ? parsePath(d) : null;
};

/* Type > Threaded Text > Create: link the area type to more closed shapes, in the order given. Each new shape gets
   an empty text after it with the same font; the words are laid out again through the whole thread. */
export function threadCommands(site: Site, text: SiteNode, spec: AreaSpec, shapes: { id: string; parent: string; index: number; d?: string }[], at?: number, taken = new Set<string>()): Command[] | null {
  const chain: [string, string][] = [...(spec.chain ?? [])];
  const used = new Set([spec.src, ...chain.map(l => l[0])]);
  const o = areaOptionsOf(text, spec);
  const cmds: Command[] = [];
  const fresh = new Map<string, Record<string, string | null>>();
  let slot = at === undefined ? chain.length : Math.max(0, Math.min(chain.length, at));
  for (const s of shapes) {
    if (used.has(s.id) || chain.length >= THREAD_LIMIT) continue;
    const id = freshId(site, taken, 'text');
    cmds.push({ command: 'node.add', params: { parent: s.parent, node: { id, tag: 'text', name: 'Threaded type', attrs: fontAttrs(o) } } }, { command: 'node.move', params: { id, parent: s.parent, index: s.index } });
    chain.splice(slot++, 0, [s.id, id]);
    used.add(s.id);
    if (s.d) fresh.set(s.id, { d: s.d });
  }
  if (!cmds.length) return null;
  return [...cmds, ...relayoutChain(site, text, spec, o, shapeSubs(site, fresh), chain).cmds];
}

/* The shapes of a thread in reading order: the first shape, then each linked shape. */
export function threadShapes(spec: AreaSpec): string[] { return [spec.src, ...(spec.chain ?? []).map(l => l[0])]; }

/* Double-clicking a port breaks the thread there: the shapes after the break keep their outlines, their texts
   go, and the words flow back into the shapes before it. `after` is the index of the last shape kept. */
export function breakThreadCommands(site: Site, text: SiteNode, spec: AreaSpec, after: number): Command[] {
  const chain = spec.chain ?? [];
  const keep = Math.max(0, Math.min(chain.length, after));
  if (keep >= chain.length) return [];
  const o = areaOptionsOf(text, spec);
  return [...chain.slice(keep).filter(([, t]) => site.nodes[t]).map(([, t]) => removeNode(t)), ...relayoutChain(site, text, spec, o, shapeSubs(site), chain.slice(0, keep)).cmds];
}

const joinTokens = (list: Token[]): string => {
  let out = '';
  for (const tok of list) out += 'para' in tok ? '\n' : out && !out.endsWith('\n') ? ` ${tok.word}` : tok.word;
  return out;
};

/* Type > Threaded Text > Remove Threading: every shape keeps the words it shows now as its own area type, and the
   last one keeps the overflow. Nothing moves, so the lines stay as they are. */
export function removeThreadingCommands(site: Site, text: SiteNode, spec: AreaSpec): Command[] {
  const links = (spec.chain ?? []).filter(([s, t]) => site.nodes[s] && site.nodes[t]);
  if (!links.length) return [];
  const o = areaOptionsOf(text, spec);
  const measure = measurer(o);
  const subsOf = shapeSubs(site);
  const parts: [string, string][] = [[spec.src, text.id], ...links];
  const cmds: Command[] = [];
  let remaining = o.text;
  parts.forEach(([shapeId, textId], k) => {
    const subs = subsOf(shapeId);
    const res = subs && remaining.trim() ? layoutArea(subs, { ...o, text: remaining }, measure) : { rest: remaining, overflow: 0 };
    const last = k === parts.length - 1;
    const all = tokens(remaining);
    const head = last ? remaining : joinTokens(all.slice(0, Math.max(0, all.length - tokens(res.rest).length)));
    cmds.push(updateAttrs(textId, { 'data-fw-area': areaAttr(shapeId, { ...o, text: head }, undefined, last ? res.overflow : 0) }));
    remaining = last ? '' : res.rest;
  });
  return cmds;
}

/* Thread from the selection: the selected area type (or its shape) plus the other selected closed paths, in
   selection order. */
export function threadSelection(h: Host): Command[] | string {
  const site = h.site();
  const ids = h.selection();
  const found = ids.map(id => areaTextFor(site, id)).find(Boolean);
  if (!found) return 'Select area type and the closed shapes to thread it into.';
  const own = new Set([found.spec.src, found.text.id, ...(found.spec.chain ?? []).flat()]);
  const shapes = ids.filter(id => !own.has(id)).map(id => h.shape(id)).filter((s): s is NonNullable<ReturnType<Host['shape']>> => !!s && s.subs.some(sp => sp.closed));
  if (!shapes.length) return 'Select one or more closed shapes to thread the text into.';
  const placed = shapes.map(s => { const parent = h.parentOf(s.id) ?? s.svg; return { id: s.id, parent, index: site.nodes[parent].children.indexOf(s.id) + 1 }; });
  return threadCommands(site, found.text, found.spec, placed) ?? 'These shapes are already in the thread.';
}

/* Release: the linked texts are removed and the words roll back into the first shape. */
export function releaseThreadCommands(site: Site, text: SiteNode, spec: AreaSpec): Command[] {
  if (!spec.chain?.length) return [];
  const o = areaOptionsOf(text, spec);
  return [...spec.chain.filter(([, t]) => site.nodes[t]).map(([, t]) => removeNode(t)), ...relayoutChain(site, text, spec, o, shapeSubs(site), []).cmds];
}

/* The live area text for a selected text, line or source shape. */
export function areaTextFor(site: Site, id: string): { text: SiteNode; spec: AreaSpec } | null {
  let node = site.nodes[id];
  if (node?.tag === 'tspan') node = Object.values(site.nodes).find(n => n.children.includes(id)) ?? node;
  if (node?.tag === 'text') { const spec = readArea(node.attrs['data-fw-area']); if (spec) return { text: node, spec }; }
  if (node?.tag !== 'path' && node?.tag !== 'text') return null;
  for (const n of Object.values(site.nodes)) {
    if (n.tag !== 'text') continue;
    const spec = readArea(n.attrs['data-fw-area']);
    if (spec && (spec.src === node.id || spec.chain?.some(([s, t]) => s === node.id || t === node.id))) return { text: n, spec };
  }
  return null;
}

export function areaOptionsOf(text: SiteNode, spec: AreaSpec): AreaOptions {
  const size = parseFloat(text.attrs['font-size'] ?? '16');
  return { text: spec.text, size: Number.isFinite(size) && size > 0 ? size : 16, leading: spec.leading, family: text.attrs['font-family'] ?? 'system-ui, sans-serif', weight: text.attrs['font-weight'] ?? '400', color: text.attrs.fill ?? '#1f1f1f', align: spec.align, inset: spec.inset, columns: spec.columns, gutter: spec.gutter };
}

/* Editing placed area type: new text and options, laid out again in the same shape, one undo step. */
export function areaEditCommands(site: Site, text: SiteNode, spec: AreaSpec, o: AreaOptions): { cmds: Command[]; overflow: number; lines: number } {
  const font = fontAttrs(o);
  const made = relayoutChain(site, text, spec, o, shapeSubs(site));
  return { ...made, cmds: [updateAttrs(text.id, font), ...(spec.chain ?? []).filter(([, t]) => site.nodes[t]).map(([, t]) => updateAttrs(t, font)), ...made.cmds] };
}

export function areaFixes(site: Site, cmds: Command[]): Command[] {
  const removed = new Set(cmds.filter(c => c.command === 'node.remove').map(c => (c.params as { id: string }).id));
  const patched = new Map<string, Record<string, string | null>>();
  for (const c of cmds) {
    if (c.command !== 'node.update') continue;
    const params = c.params as { id: string; patch?: { attrs?: Record<string, string | null> } };
    if (site.nodes[params.id]?.tag === 'path' && params.patch?.attrs && 'd' in params.patch.attrs) patched.set(params.id, { ...patched.get(params.id), ...params.patch.attrs });
  }
  /* A command that rewrites a text's spec has already laid it out; links whose shape or text is gone (also after a
     change made outside the editor, through reconcile) are dropped and the words flow again. */
  const respecced = new Set(cmds.filter(c => c.command === 'node.update' && ((c.params as { patch?: { attrs?: Record<string, unknown> } }).patch?.attrs ?? {})['data-fw-area'] !== undefined).map(c => (c.params as { id: string }).id));
  const out: Command[] = [];
  for (const t of Object.values(site.nodes)) {
    if (t.tag !== 'text' || removed.has(t.id) || respecced.has(t.id) || !t.attrs['data-fw-area']) continue;
    const spec = readArea(t.attrs['data-fw-area']);
    if (!spec) continue;
    const links = spec.chain ?? [];
    if (removed.has(spec.src) || !site.nodes[spec.src]) {
      out.push(updateAttrs(t.id, { 'data-fw-area': null }));
      continue;
    }
    const kept = links.filter(([s, x]) => site.nodes[s] && !removed.has(s) && site.nodes[x] && !removed.has(x));
    for (const [s, x] of links) if (!kept.some(l => l[1] === x) && site.nodes[x] && !removed.has(x) && (removed.has(s) || !site.nodes[s])) out.push(removeNode(x));
    const touched = patched.has(spec.src) || links.some(([s]) => patched.has(s)) || kept.length !== links.length;
    if (!touched) continue;
    const made = relayoutChain(site, t, spec, areaOptionsOf(t, spec), shapeSubs(site, patched), kept);
    out.push(...made.cmds.filter(c => !(c.command === 'node.remove' && removed.has((c.params as { id: string }).id))));
  }
  return out;
}

export function areaCommands(parent: string, index: number, textId: string, lineIds: string[], lines: AreaLine[], o: AreaOptions, src?: string, over = 0): Command[] {
  const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
  const cmds: Command[] = [
    { command: 'node.add', params: { parent, node: { id: textId, tag: 'text', name: 'Area type', attrs: { 'font-size': fmt(o.size), 'font-family': o.family, 'font-weight': o.weight, fill: o.color, 'text-anchor': anchor, ...(src ? { 'data-fw-area': areaAttr(src, o, undefined, over) } : {}) } } } },
    { command: 'node.move', params: { id: textId, parent, index } }
  ];
  lines.forEach((line, i) => cmds.push({ command: 'node.add', params: { parent: textId, node: { id: lineIds[i], tag: 'tspan', name: 'Line', text: line.text, attrs: { x: fmt(line.x), y: fmt(line.y) } } } }));
  return cmds;
}
