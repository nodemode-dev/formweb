import type { Command, Site } from '../types';
import { flattenSub } from './edit';
import { fmt, parsePath, pathBounds, type Pt, type SubPath } from './geometry';
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

export function layoutArea(subs: SubPath[], o: AreaOptions, measure: (s: string) => number): { lines: AreaLine[]; overflow: number } {
  const box = pathBounds(subs);
  const polys = subs.filter(s => s.closed).map(s => flattenSub(s, 0.25)).filter(p => p.length > 2);
  const queue = tokens(o.text);
  const lines: AreaLine[] = [];
  if (!box || !polys.length) return { lines, overflow: queue.filter(t => 'word' in t).length };
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
  return { lines, overflow: queue.slice(q).filter(t => 'word' in t).length };
}

export function measurer(o: AreaOptions): (s: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return s => s.length * o.size * 0.55;
  ctx.font = `${o.weight} ${o.size}px ${o.family}`;
  return s => ctx.measureText(s).width;
}

/* Live area type: the text keeps its source shape and options in data-fw-area, and areaFixes lays the lines out
   again in the same commit whenever the shape's geometry changes. */
export interface AreaSpec { v: 1; src: string; text: string; leading: number; align: AreaAlign; inset: number; columns: number; gutter: number }

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function areaAttr(src: string, o: AreaOptions): string {
  const spec: AreaSpec = { v: 1, src, text: o.text, leading: o.leading, align: o.align, inset: o.inset, columns: o.columns, gutter: o.gutter };
  return JSON.stringify(spec);
}

export function readArea(raw: string | undefined): AreaSpec | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<AreaSpec>;
    const n = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (c.v !== 1 || typeof c.src !== 'string' || !ID.test(c.src) || typeof c.text !== 'string' || c.text.length > 20000 || !n(c.leading, 1, 10000)
      || (c.align !== 'left' && c.align !== 'center' && c.align !== 'right') || !n(c.inset, 0, 10000) || !n(c.columns, 1, 12) || !n(c.gutter, 0, 10000)) return null;
    return { v: 1, src: c.src, text: c.text, leading: c.leading, align: c.align, inset: c.inset, columns: c.columns, gutter: c.gutter };
  } catch { return null; }
}

export function areaFixes(site: Site, cmds: Command[]): Command[] {
  const removed = new Set(cmds.filter(c => c.command === 'node.remove').map(c => (c.params as { id: string }).id));
  const patched = new Map<string, Record<string, string | null>>();
  for (const c of cmds) {
    if (c.command !== 'node.update') continue;
    const params = c.params as { id: string; patch?: { attrs?: Record<string, string | null> } };
    if (site.nodes[params.id]?.tag === 'path' && params.patch?.attrs && 'd' in params.patch.attrs) patched.set(params.id, { ...patched.get(params.id), ...params.patch.attrs });
  }
  if (!patched.size && !removed.size) return [];
  const out: Command[] = [];
  const taken = new Set<string>();
  for (const t of Object.values(site.nodes)) {
    if (t.tag !== 'text' || removed.has(t.id)) continue;
    const spec = readArea(t.attrs['data-fw-area']);
    if (!spec) continue;
    if (removed.has(spec.src) || !site.nodes[spec.src]) { out.push(updateAttrs(t.id, { 'data-fw-area': null })); continue; }
    const patch = patched.get(spec.src);
    if (!patch) continue;
    const d = patch.d ?? site.nodes[spec.src].attrs.d;
    if (!d) continue;
    const size = parseFloat(t.attrs['font-size'] ?? '16');
    const o: AreaOptions = { text: spec.text, size: Number.isFinite(size) && size > 0 ? size : 16, leading: spec.leading, family: t.attrs['font-family'] ?? 'system-ui, sans-serif', weight: t.attrs['font-weight'] ?? '400', color: t.attrs.fill ?? '#1f1f1f', align: spec.align, inset: spec.inset, columns: spec.columns, gutter: spec.gutter };
    const { lines } = layoutArea(parsePath(d), o, measurer(o));
    out.push(...t.children.map(id => removeNode(id)));
    lines.forEach(line => out.push({ command: 'node.add', params: { parent: t.id, node: { id: freshId(site, taken, 'tspan'), tag: 'tspan', name: 'Line', text: line.text, attrs: { x: fmt(line.x), y: fmt(line.y) } } } }));
  }
  return out;
}

export function areaCommands(parent: string, index: number, textId: string, lineIds: string[], lines: AreaLine[], o: AreaOptions, src?: string): Command[] {
  const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
  const cmds: Command[] = [
    { command: 'node.add', params: { parent, node: { id: textId, tag: 'text', name: 'Area type', attrs: { 'font-size': fmt(o.size), 'font-family': o.family, 'font-weight': o.weight, fill: o.color, 'text-anchor': anchor, ...(src ? { 'data-fw-area': areaAttr(src, o) } : {}) } } } },
    { command: 'node.move', params: { id: textId, parent, index } }
  ];
  lines.forEach((line, i) => cmds.push({ command: 'node.add', params: { parent: textId, node: { id: lineIds[i], tag: 'tspan', name: 'Line', text: line.text, attrs: { x: fmt(line.x), y: fmt(line.y) } } } }));
  return cmds;
}
