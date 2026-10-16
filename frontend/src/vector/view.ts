import { t } from '../i18n';
import { commands as registry } from '../commands/registry';
import { element } from '../ui/dom';
import type { CommandDef } from '../ui/shell';
import { applyCorners } from './corners';
import type { Command } from '../types';
import { dist, formatPath, mapPath, nearestOnPath, translate, type Pt, type SubPath } from './geometry';
import type { Host } from './host';
import type { AidSource } from './snap';
import { GUIDE_ATTR, GUIDE_LIMIT, decodeGuides, encodeGuides } from './guides';
import { addPath, defaultPaint, freshId, removeNode, updateAttrs, viewBoxOf } from './store';

const NS = 'http://www.w3.org/2000/svg';
const RULER = 18;
const HIT = 4;
const OUTLINE_STYLE = 'fw-vv-outline';
const OUTLINE_COLOR = '#3b82f6';

export type GuideItem =
  | { id: string; kind: 'line'; axis: 'x' | 'y'; pos: number }
  | { id: string; kind: 'path'; subs: SubPath[] };

type Drag = { guide: GuideItem; svg: string; start: Pt; base: GuideItem; fresh: boolean; moved: boolean };

function set(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function niceStep(minUnits: number): { major: number; minor: number } {
  const exp = Math.floor(Math.log10(minUnits));
  const base = 10 ** exp;
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= minUnits) {
      const major = m * base;
      return { major, minor: major / (m === 2 ? 4 : m === 5 ? 5 : 10) };
    }
  }
  return { major: 10 * base, minor: base };
}

function clean(v: number): number { return Math.round(v * 1000) / 1000; }

export class ViewAids {
  rulers = false;
  guidesVisible = true;
  grid = false;
  snapGrid = false;
  outline = false;
  spacing = 72;
  subdivisions = 8;
  private readonly cache = new Map<string, { raw: string; list: GuideItem[]; locked: boolean }>();
  readonly picked = new Set<string>();
  private svgId = '';
  private pointer: Pt | null = null;
  private drag: Drag | null = null;
  private uid = 0;
  private raf = 0;
  private active = false;
  private readonly layer: SVGSVGElement;
  private readonly gridMinor: SVGPathElement;
  private readonly gridMajor: SVGPathElement;
  private readonly guideGroup: SVGGElement;
  private readonly boxGroup: SVGGElement;
  private readonly rulerH: HTMLCanvasElement;
  private readonly rulerV: HTMLCanvasElement;
  private readonly corner: HTMLDivElement;
  private guideEls: SVGElement[] = [];
  private boxEls: SVGRectElement[] = [];
  readonly source: AidSource;

  constructor(private readonly h: Host, private readonly shell: HTMLElement) {
    this.layer = document.createElementNS(NS, 'svg');
    this.layer.setAttribute('class', 'fw-vv');
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.setAttribute('data-off', '');
    const group = (name: string): SVGGElement => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `fw-vv-${name}`);
      this.layer.append(g);
      return g;
    };
    const gridGroup = group('grid');
    this.gridMinor = document.createElementNS(NS, 'path');
    this.gridMinor.setAttribute('class', 'fw-vv-minor');
    this.gridMajor = document.createElementNS(NS, 'path');
    this.gridMajor.setAttribute('class', 'fw-vv-major');
    gridGroup.append(this.gridMinor, this.gridMajor);
    this.boxGroup = group('boxes');
    this.guideGroup = group('guides');
    this.rulerH = this.makeRuler('h');
    this.rulerV = this.makeRuler('v');
    this.corner = element('div', 'fw-vv-corner');
    this.corner.setAttribute('data-off', '');
    shell.append(this.layer, this.rulerH, this.rulerV, this.corner);
    window.addEventListener('pointermove', event => this.onMove(event));
    window.addEventListener('pointerup', event => this.onUp(event));
    this.source = {
      lines: svg => (this.guidesVisible ? this.guides(svg).filter((g): g is Extract<GuideItem, { kind: 'line' }> => g.kind === 'line').map(g => ({ axis: g.axis, pos: g.pos })) : []),
      paths: svg => (this.guidesVisible ? this.guides(svg).filter((g): g is Extract<GuideItem, { kind: 'path' }> => g.kind === 'path').map(g => g.subs) : []),
      gridStep: () => (this.snapGrid ? this.gridUnit() : 0),
      active: svg => this.active && (this.snapGrid || (this.guidesVisible && this.guides(svg).length > 0))
    };
  }

  private gridUnit(): number { return this.spacing / Math.max(1, this.subdivisions); }

  private makeRuler(kind: 'h' | 'v'): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = `fw-vv-ruler fw-vv-ruler-${kind}`;
    canvas.setAttribute('data-off', '');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('pointerdown', event => this.startFromRuler(kind, event));
    return canvas;
  }

  private svg(): string {
    const id = this.h.activeSvg();
    if (id) this.svgId = id;
    try { if (this.svgId && !this.h.site().nodes[this.svgId]) this.svgId = ''; } catch { this.svgId = ''; }
    return this.svgId;
  }

  /** Guides of an svg, read from its data-fw-guides attribute (re-read whenever the stored value changes, for example on undo). */
  private entry(svg: string): { raw: string; list: GuideItem[]; locked: boolean } {
    let raw = '';
    try { raw = svg ? this.h.site().nodes[svg]?.attrs[GUIDE_ATTR] ?? '' : ''; } catch { raw = ''; }
    let e = this.cache.get(svg);
    if (!e || e.raw !== raw) {
      const decoded = raw ? decodeGuides(raw, () => `g${++this.uid}`) : null;
      e = { raw, list: decoded?.list ?? [], locked: decoded?.locked ?? false };
      if (svg) this.cache.set(svg, e);
      this.picked.clear();
    }
    return e;
  }

  guides(svg = this.svg()): GuideItem[] { return this.entry(svg).list; }

  get locked(): boolean { return this.entry(this.svgId).locked; }

  /** Write the guide set onto the svg through the normal commit path: one undo step, with any companion commands. */
  private async save(svg: string, list: GuideItem[], locked: boolean, extra: Command[] = [], afterSelect?: string[]): Promise<boolean> {
    const raw = list.length || locked ? encodeGuides(list, locked) : '';
    const ok = await this.h.commit([...extra, updateAttrs(svg, { [GUIDE_ATTR]: raw || null })], afterSelect);
    const e = this.cache.get(svg);
    if (e) { if (ok) { e.raw = raw; e.list = list; e.locked = locked; } else e.raw = '\u0000'; }
    this.h.render();
    this.h.emit();
    return ok;
  }

  private shellPt(event: MouseEvent): Pt {
    const rect = this.shell.getBoundingClientRect();
    const scale = rect.width / (this.shell.offsetWidth || 1) || 1;
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale];
  }

  private overRuler(p: Pt): boolean {
    const px = this.h.px();
    return this.rulers && (p[0] < RULER * px || p[1] < RULER * px);
  }

  /* ---------- guide gestures ---------- */

  private startFromRuler(kind: 'h' | 'v', event: PointerEvent): void {
    if (event.button !== 0) return;
    const svg = this.svg();
    const f = svg ? this.h.frame(svg) : undefined;
    if (!f) return;
    event.preventDefault();
    event.stopPropagation();
    this.guidesVisible = true;
    if (this.guides(svg).length >= GUIDE_LIMIT) { this.h.notify(t('A drawing holds up to {0} guides.', [GUIDE_LIMIT])); return; }
    const guide: GuideItem = { id: `g${++this.uid}`, kind: 'line', axis: kind === 'h' ? 'y' : 'x', pos: 0 };
    const p = this.shellPt(event);
    const local = this.h.toLocal(f, p);
    guide.pos = clean(guide.axis === 'x' ? local[0] : local[1]);
    this.picked.clear();
    this.drag = { guide, svg, start: p, base: { ...guide }, fresh: true, moved: false };
    this.h.render();
    this.h.emit();
  }

  /** Called by the editor on pointerdown over the artwork (select and direct tools). True when a guide took it. */
  pointerDown(p: Pt, event: PointerEvent): boolean {
    if (!this.active || !this.guidesVisible || this.locked || this.drag) return false;
    const svg = this.svg();
    const f = svg ? this.h.frame(svg) : undefined;
    if (!f) return false;
    const hit = this.hitGuide(svg, f, p);
    if (!hit) return false;
    if (event.shiftKey) { if (this.picked.has(hit.id)) this.picked.delete(hit.id); else this.picked.add(hit.id); }
    else if (!this.picked.has(hit.id)) { this.picked.clear(); this.picked.add(hit.id); }
    this.drag = { guide: hit, svg, start: p, base: hit.kind === 'line' ? { ...hit } : { ...hit, subs: hit.subs }, fresh: false, moved: false };
    this.h.render();
    this.h.emit();
    return true;
  }

  private hitGuide(svg: string, f: ReturnType<Host['frame']> & object, p: Pt): GuideItem | undefined {
    const tol = HIT * this.h.px() + 1;
    const list = this.guides(svg);
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      if (g.kind === 'line') {
        const at = g.axis === 'x' ? this.h.toShell(f, [g.pos, 0])[0] : this.h.toShell(f, [0, g.pos])[1];
        if (Math.abs(at - (g.axis === 'x' ? p[0] : p[1])) <= tol) return g;
      } else {
        const hit = nearestOnPath(g.subs, this.h.toLocal(f, p));
        if (hit && dist(this.h.toShell(f, hit.at), p) <= tol) return g;
      }
    }
    return undefined;
  }

  private onMove(event: PointerEvent): void {
    const p = this.shellPt(event);
    this.pointer = p;
    const d = this.drag;
    if (d) {
      const f = this.h.frame(d.svg);
      if (f) {
        const here = this.h.toLocal(f, p);
        const from = this.h.toLocal(f, d.start);
        if (d.guide.kind === 'line') {
          d.guide.pos = clean(d.guide.axis === 'x' ? here[0] : here[1]);
          if (!d.fresh && Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > 2) d.moved = true;
          else if (d.fresh) d.moved = true;
        } else if (d.base.kind === 'path') {
          d.moved = true;
          d.guide.subs = translate(d.base.subs, here[0] - from[0], here[1] - from[1]);
        }
      }
      this.h.render();
      return;
    }
    if (this.active && this.rulers) this.schedule();
  }

  private onUp(event: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const p = this.shellPt(event);
    const list = this.guides(d.svg);
    const dropped = this.overRuler(p);
    let changed = false;
    if (d.fresh) {
      if (!dropped && list.length < GUIDE_LIMIT) { list.push(d.guide); this.picked.clear(); this.picked.add(d.guide.id); changed = true; }
    } else if (dropped) {
      const i = list.indexOf(d.guide);
      if (i >= 0) list.splice(i, 1);
      this.picked.delete(d.guide.id);
      changed = true;
    } else changed = d.moved;
    if (changed) void this.save(d.svg, list, this.entry(d.svg).locked);
    else { this.h.render(); this.h.emit(); }
  }

  /* ---------- guide commands ---------- */

  clearGuides(): void {
    const svg = this.svg();
    if (!svg) return;
    if (!this.guides(svg).length) return;
    this.picked.clear();
    void this.save(svg, [], this.entry(svg).locked);
  }

  async toggleLock(): Promise<void> {
    const svg = this.svg();
    if (!svg) return;
    const e = this.entry(svg);
    await this.save(svg, e.list, !e.locked);
  }

  hasSelection(): boolean { return this.h.selection().some(id => !!this.h.shape(id)); }

  hasGuides(): boolean { const svg = this.svgId; return !!svg && this.guides(svg).length > 0; }

  async makeGuides(): Promise<void> {
    const svg = this.svg();
    if (!svg) return;
    const shapes = this.h.selection().map(id => this.h.shape(id)).filter((s): s is NonNullable<typeof s> => !!s && s.svg === svg);
    if (!shapes.length) { this.h.notify(t('Select a shape to turn into guides.')); return; }
    const list = [...this.guides(svg)];
    if (list.length + shapes.length > GUIDE_LIMIT) { this.h.notify(t('A drawing holds up to {0} guides.', [GUIDE_LIMIT])); return; }
    const made: GuideItem[] = shapes.map(s => ({ id: `g${++this.uid}`, kind: 'path', subs: applyCorners(s.subs) }));
    const ok = await this.save(svg, [...list, ...made], this.entry(svg).locked, shapes.map(s => removeNode(s.id)));
    if (!ok) return;
    this.picked.clear();
    for (const g of made) this.picked.add(g.id);
    this.guidesVisible = true;
    this.h.render();
    this.h.emit();
  }

  async releaseGuides(): Promise<void> {
    const svg = this.svg();
    if (!svg) return;
    if (this.locked) { this.h.notify(t('Unlock guides before releasing them.')); return; }
    const list = this.guides(svg);
    const chosen = this.picked.size ? list.filter(g => this.picked.has(g.id)) : list.filter(g => g.kind === 'path');
    if (!chosen.length) { this.h.notify(t('No guides to release. Select guides or make guides from shapes first.')); return; }
    const site = this.h.site();
    const node = site.nodes[svg];
    const vb = node ? viewBoxOf(node) : [0, 0, 100, 100];
    const taken = new Set<string>();
    const paint = { ...defaultPaint, fill: 'none', stroke: '#111827', strokeWidth: 1 };
    const ids: string[] = [];
    const cmds = chosen.map(g => {
      const id = freshId(site, taken, 'path');
      ids.push(id);
      const subs: SubPath[] = g.kind === 'path' ? g.subs : [{ closed: false, nodes: (g.axis === 'x'
        ? [[g.pos, vb[1]], [g.pos, vb[1] + vb[3]]] : [[vb[0], g.pos], [vb[0] + vb[2], g.pos]]).map(([x, y]) => ({ x, y, in: null, out: null, kind: 'corner' as const })) }];
      return addPath(svg, id, subs, paint, t('Released guide'));
    });
    const ok = await this.save(svg, list.filter(g => !chosen.includes(g)), this.entry(svg).locked, cmds, ids);
    if (!ok) return;
    this.picked.clear();
    this.h.render();
    this.h.emit();
  }

  /* ---------- rendering ---------- */

  render(visible: boolean): void {
    this.active = visible;
    const svg = visible ? this.svg() : '';
    const f = svg ? this.h.frame(svg) : undefined;
    const px = this.h.px();
    const showRulers = visible && this.rulers;
    toggle(this.layer, visible);
    toggle(this.rulerH, showRulers);
    toggle(this.rulerV, showRulers);
    toggle(this.corner, showRulers);
    this.applyOutline(visible && this.outline ? svg : '');
    if (!visible) return;
    this.layer.style.setProperty('--fw-vv-px', String(px));
    const w = this.shell.offsetWidth, hgt = this.shell.offsetHeight;
    set(this.layer, 'width', String(w)); set(this.layer, 'height', String(hgt));
    this.drawGrid(f, w, hgt, px);
    this.drawGuides(svg, f, w, hgt);
    this.drawBoxes(svg, visible && this.outline);
    if (showRulers) {
      this.corner.style.cssText = `width:${RULER * px}px;height:${RULER * px}px`;
      this.drawRulers(f, w, hgt, px);
    }
  }

  private schedule(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.active || !this.rulers) return;
      const svg = this.svg();
      this.drawRulers(svg ? this.h.frame(svg) : undefined, this.shell.offsetWidth, this.shell.offsetHeight, this.h.px());
    });
  }

  private drawGrid(f: ReturnType<Host['frame']>, w: number, hgt: number, px: number): void {
    if (!this.grid || !f) { set(this.gridMinor, 'd', ''); set(this.gridMajor, 'd', ''); return; }
    const scale = 1 / px;
    let major = Math.max(0.0001, this.spacing);
    while (major * f.sx * scale < 6) major *= 2;
    const subdiv = Math.max(1, Math.round(this.subdivisions));
    const minor = major / subdiv;
    const drawMinor = subdiv > 1 && minor * f.sx * scale >= 5;
    const a = this.h.toLocal(f, [0, 0]), b = this.h.toLocal(f, [w, hgt]);
    const lines = (step: number, skip: number): string => {
      let d = '';
      let n = 0;
      for (let v = Math.ceil(a[0] / step); v * step <= b[0] && n < 1500; v++, n++) {
        if (skip && v % skip === 0) continue;
        const x = Math.round(this.h.toShell(f, [v * step, 0])[0] * scale) / scale;
        d += `M${x} 0V${hgt}`;
      }
      for (let v = Math.ceil(a[1] / step); v * step <= b[1] && n < 3000; v++, n++) {
        if (skip && v % skip === 0) continue;
        const y = Math.round(this.h.toShell(f, [0, v * step])[1] * scale) / scale;
        d += `M0 ${y}H${w}`;
      }
      return d;
    };
    set(this.gridMajor, 'd', lines(major, 0));
    set(this.gridMinor, 'd', drawMinor ? lines(minor, subdiv) : '');
  }

  private drawGuides(svg: string, f: ReturnType<Host['frame']>, w: number, hgt: number): void {
    const list: GuideItem[] = svg && f && this.guidesVisible ? [...this.guides(svg)] : [];
    if (this.drag?.fresh && this.drag.svg === svg && this.guidesVisible) list.push(this.drag.guide);
    while (this.guideEls.length < list.length) {
      this.guideEls.push(document.createElementNS(NS, 'path'));
      this.guideGroup.append(this.guideEls[this.guideEls.length - 1]);
    }
    this.guideEls.forEach((el, i) => {
      const g = list[i];
      if (!g || !f) { if (!el.hasAttribute('data-off')) el.setAttribute('data-off', ''); return; }
      let d = '';
      if (g.kind === 'line') {
        if (g.axis === 'x') { const x = this.h.toShell(f, [g.pos, 0])[0]; d = `M${x} 0V${hgt}`; } else { const y = this.h.toShell(f, [0, g.pos])[1]; d = `M0 ${y}H${w}`; }
      } else d = formatPath(mapPath(g.subs, p => this.h.toShell(f, p)));
      set(el, 'd', d);
      set(el, 'class', `fw-vv-guide${this.picked.has(g.id) ? ' is-picked' : ''}${this.locked ? ' is-locked' : ''}`);
      if (el.hasAttribute('data-off')) el.removeAttribute('data-off');
    });
  }

  private drawBoxes(svg: string, on: boolean): void {
    const doc = this.shell.querySelector('iframe')?.contentDocument;
    const els = on && svg && doc ? Array.from(doc.querySelectorAll(`[data-fw-id="${svg}"] image`)) : [];
    while (this.boxEls.length < els.length) {
      this.boxEls.push(document.createElementNS(NS, 'rect'));
      this.boxEls[this.boxEls.length - 1].setAttribute('class', 'fw-vv-box');
      this.boxGroup.append(this.boxEls[this.boxEls.length - 1]);
    }
    this.boxEls.forEach((rect, i) => {
      const el = els[i];
      if (!el) { if (!rect.hasAttribute('data-off')) rect.setAttribute('data-off', ''); return; }
      const r = el.getBoundingClientRect();
      set(rect, 'x', String(r.left)); set(rect, 'y', String(r.top));
      set(rect, 'width', String(r.width)); set(rect, 'height', String(r.height));
      if (rect.hasAttribute('data-off')) rect.removeAttribute('data-off');
    });
  }

  private applyOutline(svg: string): void {
    const doc = this.shell.querySelector('iframe')?.contentDocument;
    if (!doc) return;
    const existing = doc.getElementById(OUTLINE_STYLE);
    if (!svg) { existing?.remove(); return; }
    const sel = `[data-fw-id="${svg}"]`;
    const css = `${sel}, ${sel} * { fill: none !important; fill-opacity: 1 !important; stroke: ${OUTLINE_COLOR} !important; stroke-width: 1px !important; stroke-opacity: 1 !important; stroke-dasharray: none !important; vector-effect: non-scaling-stroke !important; filter: none !important; opacity: 1 !important; paint-order: normal !important; }\n${sel} image { visibility: hidden !important; }`;
    let style = existing as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = OUTLINE_STYLE;
      (doc.head ?? doc.documentElement).append(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  private drawRulers(f: ReturnType<Host['frame']>, w: number, hgt: number, px: number): void {
    const scale = 1 / px;
    const dpr = window.devicePixelRatio || 1;
    const T = RULER * px;
    const style = getComputedStyle(this.shell);
    const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    const bg = read('--surface-2', '#222');
    const ink = read('--text-secondary', '#aaa');
    const line = read('--line-2', '#555');
    const accent = read('--accent-color', '#f97316');
    const setup = (canvas: HTMLCanvasElement, cw: number, ch: number): CanvasRenderingContext2D | null => {
      const bw = Math.max(1, Math.round(cw * scale * dpr)), bh = Math.max(1, Math.round(ch * scale * dpr));
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);
      return ctx;
    };
    const hc = setup(this.rulerH, w - T, T);
    const vc = setup(this.rulerV, T, hgt - T);
    if (!hc || !vc) return;
    this.rulerH.style.left = `${T}px`;
    this.rulerV.style.top = `${T}px`;
    const drawAxis = (ctx: CanvasRenderingContext2D, horizontal: boolean, length: number): void => {
      ctx.strokeStyle = line; ctx.fillStyle = ink; ctx.lineWidth = px;
      ctx.font = `${9 * px}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(0, T - px / 2); ctx.lineTo(length, T - px / 2); } else { ctx.moveTo(T - px / 2, 0); ctx.lineTo(T - px / 2, length); }
      ctx.stroke();
      if (!f) return;
      const unit = horizontal ? f.sx : f.sy;
      const origin = horizontal ? f.left - f.vx * f.sx : f.top - f.vy * f.sy;
      const offset = T;
      const { major, minor } = niceStep(70 * px / unit);
      const toLocalV = (s: number): number => (s + offset - origin) / unit;
      const lo = toLocalV(0), hi = toLocalV(length);
      const draw = (step: number, tick: number, label: boolean): void => {
        if (step * unit < 3 * px) return;
        const first = Math.ceil(lo / step - 1e-9);
        for (let n = first, c = 0; n * step <= hi && c < 2000; n++, c++) {
          const v = n * step;
          if (!label && Math.abs(v / major - Math.round(v / major)) < 1e-6) continue;
          const s = origin + v * unit - offset;
          const len = label ? T : T * tick;
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(s, T - len); ctx.lineTo(s, T); } else { ctx.moveTo(T - len, s); ctx.lineTo(T, s); }
          ctx.stroke();
          if (label) {
            const text = String(clean(v));
            if (horizontal) ctx.fillText(text, s + 2 * px, 1 * px);
            else { ctx.save(); ctx.translate(1 * px, s + 2 * px); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.textAlign = 'right'; ctx.fillText(text, 0, 0); ctx.restore(); }
          }
        }
      };
      draw(minor, 0.3, false);
      draw(major, 1, true);
      const p = this.pointer;
      if (p) {
        const at = (horizontal ? p[0] : p[1]) - offset;
        if (at >= 0 && at <= length) {
          ctx.strokeStyle = accent; ctx.lineWidth = px;
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(at, 0); ctx.lineTo(at, T); } else { ctx.moveTo(0, at); ctx.lineTo(T, at); }
          ctx.stroke();
        }
      }
    };
    drawAxis(hc, true, w - T);
    drawAxis(vc, false, hgt - T);
  }

  /* ---------- preferences ---------- */

  private dialog: HTMLElement | null = null;
  private spacingInput: HTMLInputElement | null = null;
  private subInput: HTMLInputElement | null = null;

  openPrefs(): void {
    const root = this.dialog ?? (this.dialog = this.buildPrefs());
    if (this.spacingInput) this.spacingInput.value = String(this.spacing);
    if (this.subInput) this.subInput.value = String(this.subdivisions);
    root.hidden = false;
    this.spacingInput?.focus();
  }

  private buildPrefs(): HTMLElement {
    const root = element('div', 'fw-v-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('Grid preferences'));
    root.hidden = true;
    const field = (label: string, input: HTMLInputElement): HTMLElement => {
      const row = element('label', 'fw-v-stack');
      row.append(element('span', 'fw-v-note', label), input);
      return row;
    };
    const num = (min: number, max: number, step: string): HTMLInputElement => {
      const input = element('input', 'fw-v-input');
      input.type = 'number'; input.min = String(min); input.max = String(max); input.step = step;
      return input;
    };
    this.spacingInput = num(0.1, 10000, '1');
    this.subInput = num(1, 100, '1');
    const ok = element('button', 'fw-v-btn', t('OK'));
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', t('Cancel'));
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    root.append(element('div', 'fw-v-summary', t('Grid preferences')), field(t('Gridline every (units)'), this.spacingInput), field(t('Subdivisions'), this.subInput), actions);
    const close = (): void => { root.hidden = true; };
    const submit = (): void => {
      const s = parseFloat(this.spacingInput?.value ?? '');
      const n = parseInt(this.subInput?.value ?? '', 10);
      if (Number.isFinite(s) && s > 0) this.spacing = Math.min(10000, s);
      if (Number.isFinite(n) && n >= 1) this.subdivisions = Math.min(100, n);
      close();
      this.h.render();
      this.h.emit();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', close);
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    });
    document.body.append(root);
    return root;
  }
}

function toggle(el: Element, on: boolean): void {
  if (on) { if (el.hasAttribute('data-off')) el.removeAttribute('data-off'); } else if (!el.hasAttribute('data-off')) el.setAttribute('data-off', '');
}

/** View menu commands: rulers, guides, grid, outline. Fall back to the browser or redo keys outside vector editing. */
export function viewCommands(view: ViewAids, editing: () => boolean, redraw: () => void): CommandDef[] {
  const MENU = 'View';
  const on = (): boolean => editing();
  const flip = (fn: () => void) => (): void => { fn(); redraw(); };
  return [
    { id: 'vector.rulers', label: () => (view.rulers ? t('Hide Rulers') : t('Show Rulers')), menu: MENU, keys: 'Mod+R', group: 20, checked: () => view.rulers,
      run: () => { if (!on()) { location.reload(); return; } flip(() => { view.rulers = !view.rulers; })(); } },
    { id: 'vector.guides.toggle', label: () => (view.guidesVisible ? t('Hide Guides') : t('Show Guides')), menu: MENU, keys: 'Mod+;', group: 20, checked: () => view.guidesVisible, enabled: on, run: flip(() => { view.guidesVisible = !view.guidesVisible; }) },
    { id: 'vector.guides.lock', label: t('Lock Guides'), menu: MENU, keys: 'Mod+Alt+;', group: 20, checked: () => view.locked, enabled: on, run: () => { void view.toggleLock().then(redraw); } },
    { id: 'vector.guides.make', label: t('Make Guides'), menu: MENU, keys: 'Mod+5', group: 20, enabled: () => on() && view.hasSelection(), run: () => { void view.makeGuides(); } },
    { id: 'vector.guides.release', label: t('Release Guides'), menu: MENU, keys: 'Mod+Alt+5', group: 20, enabled: on, run: () => { void view.releaseGuides(); } },
    { id: 'vector.guides.clear', label: t('Clear Guides'), menu: MENU, group: 20, enabled: () => on() && view.hasGuides(), run: () => view.clearGuides() },
    { id: 'vector.grid.show', label: () => (view.grid ? t('Hide Grid') : t('Show Grid')), menu: MENU, keys: "Mod+'", group: 21, checked: () => view.grid, enabled: on, run: flip(() => { view.grid = !view.grid; }) },
    { id: 'vector.grid.snap', label: t('Snap to Grid'), menu: MENU, keys: "Mod+Shift+'", group: 21, checked: () => view.snapGrid, enabled: on, run: flip(() => { view.snapGrid = !view.snapGrid; }) },
    { id: 'vector.grid.prefs', label: t('Grid Preferences...'), menu: MENU, group: 21, enabled: on, run: () => view.openPrefs() },
    { id: 'vector.outline', label: () => (view.outline ? t('Preview') : t('Outline')), menu: MENU, keys: 'Mod+Y', group: 22, checked: () => view.outline,
      run: () => { if (!on()) { registry.run('edit.redo'); return; } flip(() => { view.outline = !view.outline; })(); } }
  ];
}
