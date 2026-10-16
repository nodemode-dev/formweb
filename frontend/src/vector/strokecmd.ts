import type { Command } from '../types';
import { groupCommands } from './arrange';
import type { Host } from './host';
import { liveContainer, liveOf } from './live';
import { updateAttrs } from './store';
import { readWidth } from './stroke';
import { cleanModel, defaultModel, readStroke, strokeOutputs, strokeSig, type StrokeModel } from './strokefx';

export function dashPairs(text: string): number[] {
  const list = text.split(/[\s,]+/).filter(part => part !== '').map(Number).filter(n => Number.isFinite(n) && n >= 0).slice(0, 6);
  return list.length % 2 ? [...list, list[list.length - 1]] : list;
}

export function strokeModelOf(h: Host, id: string): StrokeModel {
  const site = h.site();
  const found = liveOf(site, id);
  const spec = found && found.kind === 'stroke' ? readStroke(site.nodes[found.group].attrs['data-fw-stroke']) : null;
  if (spec) return { dash: spec.dash, mode: spec.mode, a0: spec.a0, a1: spec.a1, s0: spec.s0, s1: spec.s1, tip: spec.tip };
  const shape = h.shape(id);
  return { ...defaultModel, dash: shape ? dashPairs(shape.paint.dash) : [] };
}

export function strokeCommands(h: Host, change: Partial<StrokeModel>): { cmds: Command[]; select: string[] } | null {
  const site = h.site();
  const ids = h.selection().filter(id => site.nodes[id]?.tag === 'path');
  if (!ids.length) { h.notify('Select one or more paths first.'); return null; }
  const cmds: Command[] = [];
  const select: string[] = [];
  for (const id of ids) {
    const found = liveOf(site, id);
    const node = site.nodes[id];
    if (found && found.kind === 'stroke') {
      const spec = readStroke(site.nodes[found.group].attrs['data-fw-stroke']);
      if (!spec) continue;
      const next = cleanModel({ ...spec, ...change });
      cmds.push(updateAttrs(found.group, { 'data-fw-stroke': JSON.stringify({ ...spec, ...next }) }));
      select.push(spec.src);
      continue;
    }
    if (found) { h.notify('These paths already belong to a live blend, repeat or brush.'); continue; }
    if (readWidth(node)) { h.notify('Remove the variable width before adding dashes or arrowheads.'); continue; }
    const shape = h.shape(id);
    if (!shape || !h.parentOf(id)) continue;
    if (shape.paint.stroke === 'none') { h.notify('Give the path a stroke first.'); continue; }
    const next = cleanModel({ ...strokeModelOf(h, id), ...change });
    if (next.mode === 'preserve' && next.a0 === 'none' && next.a1 === 'none') {
      cmds.push(updateAttrs(id, { 'stroke-dasharray': next.dash.length ? next.dash.join(' ') : null }));
      continue;
    }
    const base = { v: 1 as const, src: id, ...next };
    const grouped = groupCommands(h, [id], 'Stroke options', { 'data-fw-stroke': JSON.stringify({ ...base, sig: strokeSig(base, node.attrs) }) });
    if (!grouped) continue;
    cmds.push(...grouped.cmds, updateAttrs(id, { 'stroke-opacity': '0' }), ...liveContainer(site, new Set([grouped.group]), grouped.group, 'stroke', strokeOutputs(node.attrs, next), 1));
    select.push(id);
  }
  return cmds.length ? { cmds, select } : null;
}
