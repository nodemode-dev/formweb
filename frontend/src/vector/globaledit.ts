import type { Command, Site } from '../types';
import { applyCorners } from './corners';
import { decodeModel, formatPath, mapPath, parsePath, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import type { Scene } from './overlay';
import { pathIds, readShape, svgOf, updateGeometry } from './store';

/** Attributes that carry paint. A change to any of them on one shape is copied to its matches. */
const PAINT_ATTRS = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-rule', 'data-fw-align', 'data-fw-weight', 'paint-order']);

/** Anchors, handles and corner settings relative to the first anchor, so equal shapes compare equal wherever they sit. */
function normalize(subs: SubPath[]): (number | string)[][] {
  const o = subs[0]?.nodes[0];
  const ox = o?.x ?? 0, oy = o?.y ?? 0;
  const rel = (p: Pt | null): number[] => (p ? [p[0] - ox, p[1] - oy] : [NaN, NaN]);
  return subs.map(sub => [sub.closed ? 1 : 0, sub.nodes.length, ...sub.nodes.flatMap(n => [n.x - ox, n.y - oy, ...rel(n.in), ...rel(n.out), n.corner ? n.corner.radius : 0, n.corner?.type ?? ''])]);
}

export function sameGeometry(a: SubPath[], b: SubPath[]): boolean {
  if (a.length !== b.length) return false;
  const x = normalize(a), y = normalize(b);
  for (let i = 0; i < x.length; i++) {
    if (x[i].length !== y[i].length) return false;
    for (let k = 0; k < x[i].length; k++) {
      const u = x[i][k], v = y[i][k];
      if (typeof u === 'string' || typeof v === 'string') { if (u !== v) return false; continue; }
      if (Number.isNaN(u) || Number.isNaN(v)) { if (Number.isNaN(u) !== Number.isNaN(v)) return false; continue; }
      if (Math.abs(u - v) > 0.05) return false;
    }
  }
  return true;
}

/** Every other path in the same SVG whose geometry equals `id` up to translation. */
export function matchesOf(site: Site, id: string): string[] {
  const shape = readShape(site, id);
  const svg = svgOf(site, id);
  if (!shape || !svg) return [];
  return pathIds(site, svg).filter(other => {
    if (other === id) return false;
    const peer = readShape(site, other);
    return !!peer && sameGeometry(shape.subs, peer.subs);
  });
}

function newGeometry(attrs: Record<string, string | null>): SubPath[] | null {
  const model = attrs['data-fw-vector'];
  if (typeof model === 'string') { const subs = decodeModel(model); if (subs) return subs; }
  return typeof attrs.d === 'string' ? parsePath(attrs.d) : null;
}

export class GlobalEdit {
  active = false;
  origin = '';

  constructor(private h: Host) {}

  start(): boolean {
    const site = this.h.site();
    const primary = this.h.primary();
    const pick = site.nodes[primary]?.tag === 'path' && readShape(site, primary) ? primary : this.h.selection().find(id => !!readShape(site, id));
    if (!pick) { this.h.notify('Select a shape to start Global Edit.'); return false; }
    this.origin = pick;
    this.active = true;
    this.h.render();
    this.h.emit();
    return true;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.origin = '';
    this.h.render();
    this.h.emit();
  }

  toggle(): void { if (this.active) this.stop(); else this.start(); }

  /** Shapes in the group: the original and everything that matches it. */
  members(site: Site = this.h.site()): string[] {
    if (!this.active || !site.nodes[this.origin]) return [];
    return [this.origin, ...matchesOf(site, this.origin)];
  }

  /**
   * Commands that repeat, on the matches of the shape being edited, the paint and geometry changes in `cmds`.
   * They are appended to the same batch, so the whole edit is one undo step.
   */
  mirror(before: Site, cmds: Command[]): Command[] {
    if (!this.active) return [];
    const group = new Set(this.members(before));
    if (group.size < 2) return [];
    const edits = cmds.filter(c => c.command === 'node.update' && typeof c.params.id === 'string' && group.has(c.params.id as string)
      && !!(c.params.patch as { attrs?: unknown } | undefined)?.attrs);
    const edited = new Set(edits.map(c => c.params.id as string));
    if (edited.size !== 1) return [];
    const id = [...edited][0];
    const patch: Record<string, string | null> = {};
    for (const c of edits) Object.assign(patch, (c.params.patch as { attrs: Record<string, string | null> }).attrs);
    const paint: Record<string, string | null> = {};
    for (const key of Object.keys(patch)) if (PAINT_ATTRS.has(key)) paint[key] = patch[key];
    const wasShape = readShape(before, id);
    const nextSubs = 'd' in patch || 'data-fw-vector' in patch ? newGeometry(patch) : null;
    const geometry = !!wasShape && !!nextSubs && !sameGeometry(wasShape.subs, nextSubs);
    if (!Object.keys(paint).length && !geometry) return [];
    const out: Command[] = [];
    for (const target of group) {
      if (target === id || !before.nodes[target]) continue;
      if (Object.keys(paint).length) out.push({ command: 'node.update', params: { id: target, patch: { attrs: { ...paint } } } });
      const peer = geometry ? readShape(before, target) : undefined;
      if (geometry && wasShape && nextSubs && peer) {
        const a = wasShape.subs[0]?.nodes[0], b = peer.subs[0]?.nodes[0];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        out.push(updateGeometry(target, mapPath(nextSubs, q => [q[0] + dx, q[1] + dy])));
      }
    }
    return out;
  }

  decorate(scene: Scene): void {
    if (!this.active) return;
    const site = this.h.site();
    if (!site.nodes[this.origin]) { this.active = false; this.origin = ''; return; }
    const svg = svgOf(site, this.origin);
    const f = svg ? this.h.frame(svg) : undefined;
    if (!f) return;
    const extras = scene.extras ?? [];
    for (const id of matchesOf(site, this.origin)) {
      const shape = this.h.shape(id);
      if (shape) extras.push({ kind: 'path', d: formatPath(mapPath(applyCorners(shape.subs), q => this.h.toShell(f, q))), cls: 'ge', w: 2 });
    }
    scene.extras = extras;
  }
}
