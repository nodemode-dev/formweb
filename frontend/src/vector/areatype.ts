import type { Command } from '../types';
import { flattenSub } from './edit';
import { fmt, pathBounds, type Pt, type SubPath } from './geometry';

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

export function areaCommands(parent: string, index: number, textId: string, lineIds: string[], lines: AreaLine[], o: AreaOptions): Command[] {
  const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
  const cmds: Command[] = [
    { command: 'node.add', params: { parent, node: { id: textId, tag: 'text', name: 'Area type', attrs: { 'font-size': fmt(o.size), 'font-family': o.family, 'font-weight': o.weight, fill: o.color, 'text-anchor': anchor } } } },
    { command: 'node.move', params: { id: textId, parent, index } }
  ];
  lines.forEach((line, i) => cmds.push({ command: 'node.add', params: { parent: textId, node: { id: lineIds[i], tag: 'tspan', name: 'Line', text: line.text, attrs: { x: fmt(line.x), y: fmt(line.y) } } } }));
  return cmds;
}
