import { element } from '../ui/dom';
import { t } from '../i18n';
import type { CommandDef } from '../ui/shell';
import type { Command, Site } from '../types';
import { matrixCommands, unionBox, type EachParams, type TransformParams } from './arrange';
import type { Mat } from './distort';
import type { Pt } from './geometry';
import type { Host } from './host';
import type { Editor } from './editor';
import type { Ops } from './ops';
import type { Scene } from './overlay';
import { button, field, numberInput, section } from './panel';
import { paintOf, pathIds, refOf, svgOf, updateAttrs, type Shape } from './store';

export type PickTool = 'lasso' | 'wand' | 'eyedropper';
export const PICK_TOOLS = new Set<string>(['lasso', 'wand', 'eyedropper']);

type Mode = 'replace' | 'add' | 'remove';
type Criteria = { fill: boolean; stroke: boolean; weight: boolean; opacity: boolean };
type Tolerance = { fill: number; stroke: number; weight: number; opacity: number };

export interface WandOptions { use: Criteria; tolerance: Tolerance }

const EXACT: Tolerance = { fill: 0, stroke: 0, weight: 0, opacity: 0 };
const COPY_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'data-fw-align', 'data-fw-weight', 'paint-order'];

/* Colors */

let swatch: CanvasRenderingContext2D | null | undefined;

export function parseColor(input: string): [number, number, number] | null {
  const v = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    if (h.length === 6 || h.length === 8) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return null;
  }
  const fn = /^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)(%?)[\s,]+([\d.]+)(%?)/.exec(v);
  if (fn) {
    const part = (n: string, pct: string): number => Math.max(0, Math.min(255, Math.round(pct ? (parseFloat(n) * 255) / 100 : parseFloat(n))));
    return [part(fn[1], fn[2]), part(fn[3], fn[4]), part(fn[5], fn[6])];
  }
  if (!/^[a-z]+$/.test(v) || v === 'none' || v === 'transparent' || v === 'currentcolor' || v === 'inherit') return null;
  if (swatch === undefined) swatch = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!swatch) return null;
  swatch.fillStyle = '#000000';
  swatch.fillStyle = v;
  const a = String(swatch.fillStyle);
  swatch.fillStyle = '#ffffff';
  swatch.fillStyle = v;
  const b = String(swatch.fillStyle);
  return a === b && a[0] === '#' ? parseColor(a) : null;
}

function colorMatch(a: string, b: string, tolerance: number): boolean {
  if (a.trim() === b.trim()) return true;
  const pa = parseColor(a), pb = parseColor(b);
  if (!pa || !pb) return false;
  return Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2])) <= tolerance;
}

/* Appearance */

interface Look { fill: string; stroke: string; weight: number; opacity: number }

function lookOf(site: Site, id: string): Look | null {
  const node = site.nodes[id];
  if (!node || node.tag !== 'path') return null;
  const p = paintOf(node);
  return { fill: p.fill, stroke: p.stroke, weight: p.stroke === 'none' ? 0 : p.strokeWidth, opacity: p.opacity };
}

function similar(a: Look, b: Look, use: Criteria, tol: Tolerance): boolean {
  if (use.fill && !colorMatch(a.fill, b.fill, tol.fill)) return false;
  if (use.stroke && !colorMatch(a.stroke, b.stroke, tol.stroke)) return false;
  if (use.weight && Math.abs(a.weight - b.weight) > tol.weight + 1e-6) return false;
  if (use.opacity && Math.abs(a.opacity - b.opacity) * 100 > tol.opacity + 1e-6) return false;
  return true;
}

function parentId(site: Site, id: string): string | undefined {
  for (const node of Object.values(site.nodes)) if (node.children.includes(id)) return node.id;
  return undefined;
}

function hiddenShape(site: Site, id: string): boolean {
  let current: string | undefined = id;
  while (current && site.nodes[current]) {
    const node = site.nodes[current];
    if (node.attrs.visibility === 'hidden' || node.attrs.display === 'none' || node.styles.display === 'none') return true;
    if (node.tag === 'svg') return false;
    current = parentId(site, current);
  }
  return false;
}

function scope(h: Host, svg: string): string[] {
  const site = h.site();
  const iso = h.isolated();
  const root = iso && site.nodes[iso] && svgOf(site, iso) === svg ? iso : svg;
  return pathIds(site, root).filter(id => !hiddenShape(site, id));
}

function combine(h: Host, svg: string, found: string[], mode: Mode): string[] {
  const site = h.site();
  const current = h.selection().filter(id => site.nodes[id] && svgOf(site, id) === svg);
  if (mode === 'add') return [...new Set([...current, ...found])];
  if (mode === 'remove') return current.filter(id => !found.includes(id));
  return found;
}

function inside(poly: Pt[], p: Pt): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/* Transform Again */

type Last =
  | { kind: 'params'; p: TransformParams }
  | { kind: 'each'; p: EachParams }
  | { kind: 'matrix'; m: Mat; center: Pt };

let last: Last | null = null;

export function rememberTransform(p: TransformParams): void { last = { kind: 'params', p: { ...p } }; }
export function rememberEach(p: EachParams): void { last = { kind: 'each', p: { ...p } }; }
export function rememberMatrix(m: Mat, center: Pt): void { last = { kind: 'matrix', m: [...m] as Mat, center }; }
export function rememberMove(delta: Pt): void {
  rememberTransform({ kind: 'move', angle: 0, sx: 100, sy: 100, axis: 0, dx: delta[0], dy: delta[1], copy: false, strokes: false, uniform: true });
}
export function forgetTransform(): void { last = null; }
export function hasLastTransform(): boolean { return last !== null; }

/* Tools */

interface Lasso { pts: Pt[]; mode: Mode }

const modeOf = (event: { shiftKey: boolean; altKey: boolean }): Mode => (event.altKey ? 'remove' : event.shiftKey ? 'add' : 'replace');

export class Picker {
  wand: WandOptions = { use: { fill: true, stroke: false, weight: false, opacity: false }, tolerance: { fill: 32, stroke: 32, weight: 5, opacity: 5 } };
  anchorMode = false;
  private lasso: Lasso | null = null;

  constructor(private h: Host) {}

  showsPoints(tool: string): boolean | undefined {
    if (!PICK_TOOLS.has(tool)) return undefined;
    return tool === 'lasso' && this.anchorMode;
  }

  onTool(prev: string | null, next: string | null): void {
    this.lasso = null;
    if (next === 'lasso' && prev !== 'lasso') this.anchorMode = prev === 'direct';
  }

  cancel(): boolean {
    if (!this.lasso) return false;
    this.lasso = null;
    this.h.render();
    return true;
  }

  down(tool: string, p: Pt, event: PointerEvent): void {
    if (tool === 'lasso') { this.lasso = { pts: [p], mode: modeOf(event) }; return; }
    if (tool === 'wand') { this.wandClick(p, modeOf(event)); return; }
    if (tool === 'eyedropper') void this.sample(p);
  }

  move(p: Pt): boolean {
    const g = this.lasso;
    if (!g) return false;
    if (Math.hypot(p[0] - g.pts[g.pts.length - 1][0], p[1] - g.pts[g.pts.length - 1][1]) > 1.5 * this.h.px()) g.pts.push(p);
    this.h.render();
    return true;
  }

  up(p: Pt): boolean {
    const g = this.lasso;
    if (!g) return false;
    this.lasso = null;
    this.finishLasso([...g.pts, p], g.mode);
    this.h.render();
    return true;
  }

  decorate(scene: Scene): void {
    const g = this.lasso;
    if (!g || g.pts.length < 2) return;
    const d = `M${g.pts.map(q => `${q[0]} ${q[1]}`).join('L')}Z`;
    scene.extras = [...(scene.extras ?? []), { kind: 'path', d, cls: 'trail' }];
  }

  /* Lasso */

  private svgAt(pts: Pt[]): string | undefined {
    const site = this.h.site();
    const mid = pts[Math.floor(pts.length / 2)];
    const centre: Pt = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    for (const q of [pts[0], centre, mid]) {
      const hit = this.h.pick(q);
      const svg = hit ? svgOf(site, hit.id) : undefined;
      if (svg) return svg;
    }
    return this.h.activeSvg();
  }

  private finishLasso(pts: Pt[], mode: Mode): void {
    const h = this.h;
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const small = pts.length < 3 || (Math.max(...xs) - Math.min(...xs) < 3 * h.px() && Math.max(...ys) - Math.min(...ys) < 3 * h.px());
    if (small) {
      if (mode !== 'replace') return;
      if (this.anchorMode) { h.anchors().clear(); h.render(); h.emit(); } else h.setSelection([]);
      return;
    }
    const svg = this.svgAt(pts);
    const f = svg ? h.frame(svg) : undefined;
    if (!svg || !f) return;
    const ids = scope(h, svg);
    const shapes = (list: string[]): Shape[] => list.map(id => h.shape(id)).filter((s): s is Shape => !!s);
    if (this.anchorMode) {
      const picked = h.selection().filter(id => svgOf(h.site(), id) === svg && h.shape(id));
      const keys: string[] = [];
      for (const shape of shapes(picked.length ? picked : ids)) {
        shape.subs.forEach((sub, si) => sub.nodes.forEach((n, idx) => { if (inside(pts, h.toShell(f, [n.x, n.y]))) keys.push(`${shape.id}|${si}|${idx}`); }));
      }
      if (!picked.length && keys.length) h.setSelection([...new Set(keys.map(key => key.split('|')[0]))]);
      const set = h.anchors();
      if (mode === 'replace') set.clear();
      for (const key of keys) { if (mode === 'remove') set.delete(key); else set.add(key); }
      h.render();
      h.emit();
      return;
    }
    const found = shapes(ids).filter(shape => shape.subs.some(sub => sub.nodes.some(n => inside(pts, h.toShell(f, [n.x, n.y]))))).map(shape => shape.id);
    h.setSelection(combine(h, svg, found, mode));
  }

  /* Magic Wand and Select Same */

  matching(reference: string, use: Criteria, tol: Tolerance): string[] {
    const site = this.h.site();
    const svg = svgOf(site, reference);
    const ref = lookOf(site, reference);
    if (!svg || !ref) return [];
    return scope(this.h, svg).filter(id => {
      if (id === reference) return true;
      const other = lookOf(site, id);
      return !!other && similar(ref, other, use, tol);
    });
  }

  private wandClick(p: Pt, mode: Mode): void {
    const h = this.h;
    const hit = h.pick(p);
    if (!hit || hit.kind !== 'path') { if (mode === 'replace') h.setSelection([]); return; }
    const svg = svgOf(h.site(), hit.id);
    if (!svg) return;
    const { use, tolerance } = this.wand;
    const found = use.fill || use.stroke || use.weight || use.opacity ? this.matching(hit.id, use, tolerance) : [hit.id];
    h.setSelection(combine(h, svg, found, mode));
  }

  same(kind: 'fill' | 'stroke' | 'weight' | 'opacity' | 'fillstroke'): void {
    const h = this.h;
    const reference = h.selection().find(id => h.shape(id));
    if (!reference) { h.notify(t('Select a shape first.')); return; }
    const use: Criteria = { fill: kind === 'fill' || kind === 'fillstroke', stroke: kind === 'stroke' || kind === 'fillstroke', weight: kind === 'weight', opacity: kind === 'opacity' };
    const found = this.matching(reference, use, EXACT);
    h.setSelection([reference, ...found.filter(id => id !== reference)]);
  }

  inverse(): void {
    const h = this.h;
    const svg = h.activeSvg();
    if (!svg) { h.notify(t('Select a shape first.')); return; }
    const taken = new Set(h.selection());
    h.setSelection(scope(h, svg).filter(id => !taken.has(id)));
  }

  /* Eyedropper */

  private async sample(p: Pt): Promise<void> {
    const h = this.h;
    const hit = h.pick(p);
    const site = h.site();
    const source = hit?.kind === 'path' ? site.nodes[hit.id] : undefined;
    if (!hit || !source) return;
    const targets = h.selection().filter(id => id !== hit.id && site.nodes[id]?.tag === 'path');
    if (!targets.length) {
      if (h.selection().length) return;
      const next = paintOf(source);
      if (refOf(next.fill)) next.fill = h.paint().fill;
      if (refOf(next.stroke)) next.stroke = h.paint().stroke;
      Object.assign(h.paint(), next);
      h.emit();
      return;
    }
    const cmds: Command[] = targets.map(id => {
      const attrs: Record<string, string | null> = {};
      const sameSvg = svgOf(site, id) === svgOf(site, hit.id);
      for (const name of COPY_ATTRS) {
        const value = source.attrs[name];
        if (value !== undefined && (name === 'fill' || name === 'stroke') && refOf(value) && !sameSvg) continue;
        attrs[name] = value ?? null;
      }
      return updateAttrs(id, attrs);
    });
    await h.commit(cmds);
  }

  /* Transform Again */

  async again(ops: Pick<Ops, 'transform' | 'each'>): Promise<void> {
    const h = this.h;
    const l = last;
    if (!l) return;
    if (l.kind === 'params') { await ops.transform(l.p); return; }
    if (l.kind === 'each') { await ops.each(l.p); return; }
    const shapes = h.selection().map(id => h.shape(id)).filter((s): s is Shape => !!s);
    const box = unionBox(shapes);
    if (!box) { h.notify(t('Select one or more paths first.')); return; }
    const m = l.m, c = l.center;
    const dx = m[0] * c[0] + m[2] * c[1] + m[4] - c[0], dy = m[1] * c[0] + m[3] * c[1] + m[5] - c[1];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const next: Mat = [m[0], m[1], m[2], m[3], cx - m[0] * cx - m[2] * cy + dx, cy - m[1] * cx - m[3] * cy + dy];
    const r = matrixCommands(h, new Map(shapes.map(s => [s.id, next])), false, false);
    await h.commit(r.cmds);
  }
}

/* Commands */

export function selectCommands(editor: Editor): CommandDef[] {
  const MENU = 'Vector';
  const picker = editor.picker;
  const hasShape = (): boolean => editor.selection.some(id => !!editor.shapeOf(id));
  const same = (id: string, label: string, kind: Parameters<Picker['same']>[0]): CommandDef => ({ id: `vector.select.same-${id}`, label, menu: MENU, group: 9, run: () => picker.same(kind), enabled: hasShape });
  return [
    same('fill', 'Select same fill color', 'fill'),
    same('stroke', 'Select same stroke color', 'stroke'),
    same('weight', 'Select same stroke weight', 'weight'),
    same('opacity', 'Select same opacity', 'opacity'),
    same('fill-stroke', 'Select same fill and stroke', 'fillstroke'),
    { id: 'vector.select.inverse', label: 'Select inverse', menu: MENU, group: 9, run: () => picker.inverse(), enabled: () => { try { return !!editor.activeSvg(); } catch { return false; } } },
    {
      id: 'vector.transform-again', label: 'Transform again', menu: MENU, keys: 'Mod+D', group: 9, mutates: true,
      run: () => { void picker.again(editor.ops); },
      enabled: () => editor.tool !== null && hasLastTransform() && hasShape()
    }
  ];
}

/* Panel section */

export function selectSection(editor: Editor): { root: HTMLElement; update: () => void } {
  const picker = editor.picker;
  const box = section(t('Select'), false);
  const rows: { key: keyof Criteria; label: string; min: number; max: number; step: number; hint: string }[] = [
    { key: 'fill', label: 'Fill Color', min: 0, max: 255, step: 1, hint: 'Color tolerance, 0 to 255 per RGB channel' },
    { key: 'stroke', label: 'Stroke Color', min: 0, max: 255, step: 1, hint: 'Color tolerance, 0 to 255 per RGB channel' },
    { key: 'weight', label: 'Stroke Weight', min: 0, max: 1000, step: 0.5, hint: 'Weight tolerance in points' },
    { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, hint: 'Opacity tolerance in percent' }
  ];
  const wrap = element('div', 'fw-v-stack');
  for (const row of rows) {
    const check = element('input', 'fw-v-check');
    check.type = 'checkbox';
    check.checked = picker.wand.use[row.key];
    check.addEventListener('change', () => { picker.wand.use[row.key] = check.checked; });
    const label = element('label', 'fw-v-checkrow');
    label.append(check, element('span', '', row.label));
    const amount = numberInput(row.min, row.max, row.step, n => { picker.wand.tolerance[row.key] = n; });
    amount.value = String(picker.wand.tolerance[row.key]);
    amount.title = row.hint;
    amount.setAttribute('aria-label', t('{0}: {1}', [{ t: row.label }, { t: row.hint }]));
    const line = element('div', 'fw-v-row');
    line.append(label, field(t('Tolerance'), amount));
    wrap.append(line);
  }
  const anchors = element('input', 'fw-v-check');
  anchors.type = 'checkbox';
  anchors.addEventListener('change', () => { picker.anchorMode = anchors.checked; editor.render(); });
  const anchorRow = element('label', 'fw-v-checkrow');
  anchorRow.title = t('The Lasso selects anchors inside the loop instead of whole shapes');
  anchorRow.append(anchors, element('span', '', t('Lasso selects anchors')));
  box.body.append(
    element('p', 'fw-v-note', t('Magic Wand: click a shape to select the shapes with a similar look. Shift adds, Alt removes.')),
    wrap,
    anchorRow,
    button(t('Select inverse'), t('Select every visible shape that is not selected'), () => picker.inverse())
  );
  return { root: box.root, update: () => { if (anchors.checked !== picker.anchorMode) anchors.checked = picker.anchorMode; } };
}
