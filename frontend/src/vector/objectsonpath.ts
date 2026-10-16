import { t, tn } from '../i18n';
import type { Command } from '../types';
import { bezierAt, mapPath, pathBounds, segments, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import { updateGeometry } from './store';

interface Station { at: Pt; length: number }

function stations(sub: SubPath): Station[] {
  const out: Station[] = [];
  let length = 0;
  for (const seg of segments([sub])) {
    const steps = seg.line ? 1 : 48;
    for (let k = out.length ? 1 : 0; k <= steps; k++) {
      const at = bezierAt(seg, k / steps);
      if (out.length) length += Math.hypot(at[0] - out[out.length - 1].at[0], at[1] - out[out.length - 1].at[1]);
      out.push({ at, length });
    }
  }
  return out;
}

export function pointAt(table: Station[], s: number): { at: Pt; angle: number } {
  let i = 1;
  while (i < table.length - 1 && table[i].length < s) i++;
  const a = table[i - 1], b = table[i];
  const span = b.length - a.length;
  const k = span > 0 ? Math.min(1, Math.max(0, (s - a.length) / span)) : 0;
  return { at: [a.at[0] + (b.at[0] - a.at[0]) * k, a.at[1] + (b.at[1] - a.at[1]) * k], angle: Math.atan2(b.at[1] - a.at[1], b.at[0] - a.at[0]) };
}

export function placeOnPath(path: SubPath, objects: SubPath[][]): SubPath[][] {
  const table = stations(path);
  if (table.length < 2) return objects;
  const total = table[table.length - 1].length;
  const n = objects.length;
  const step = path.closed ? total / n : n > 1 ? total / (n - 1) : 0;
  return objects.map((subs, i) => {
    const box = pathBounds(subs);
    if (!box) return subs;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const { at, angle } = pointAt(table, Math.min(total, i * step));
    const c = Math.cos(angle), s = Math.sin(angle);
    return mapPath(subs, p => {
      const x = p[0] - cx, y = p[1] - cy;
      return [at[0] + x * c - y * s, at[1] + x * s + y * c];
    });
  });
}

export function objectsOnPathCommands(h: Host): Command[] {
  const pathId = h.primary();
  const path = h.shape(pathId);
  const objects = h.selection().filter(id => id !== pathId).map(id => h.shape(id)).filter((s): s is NonNullable<typeof s> => !!s && !!path && s.svg === path.svg);
  if (!path || !path.subs[0] || !objects.length) { h.notify(t('Select the objects, then the path to place them on.')); return []; }
  const placed = placeOnPath(path.subs[0], objects.map(o => o.subs));
  h.notify(tn(objects.length, 'Placed {0} object on the path.', 'Placed {0} objects on the path.'));
  return objects.map((o, i) => updateGeometry(o.id, placed[i]));
}
