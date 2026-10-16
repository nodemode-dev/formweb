const NS = 'http://www.w3.org/2000/svg';

export interface SceneAnchor { x: number; y: number; selected: boolean; kind: string; start: boolean }
export interface SceneHandle { ax: number; ay: number; x: number; y: number; selected: boolean }
export interface SceneWidget { x: number; y: number; limit: boolean; type: string }
export type ExtraItem =
  | { kind: 'path'; d: string; cls: string; w?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; cls: string }
  | { kind: 'circle'; x: number; y: number; r: number; cls: string; role?: string; i?: number; fill?: string };

export interface Scene {
  extras?: ExtraItem[];
  visible: boolean;
  capture: boolean;
  tool: string;
  scale: number;
  outlines: { d: string; selected: boolean }[];
  anchors: SceneAnchor[];
  handles: SceneHandle[];
  widgets: SceneWidget[];
  marquee: { x: number; y: number; w: number; h: number } | null;
  draft: string;
  rubber: string;
}

function set(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

class Pool {
  private items: SVGElement[] = [];
  constructor(private group: SVGGElement, private tag: string, private className: string) {}
  update<T>(list: T[], fill: (el: SVGElement, item: T, index: number) => void): void {
    while (this.items.length < list.length) {
      const el = document.createElementNS(NS, this.tag) as SVGElement;
      el.setAttribute('class', this.className);
      el.setAttribute('data-off', '');
      this.group.append(el);
      this.items.push(el);
    }
    this.items.forEach((el, i) => {
      if (i < list.length) {
        fill(el, list[i], i);
        if (el.hasAttribute('data-off')) el.removeAttribute('data-off');
      } else if (!el.hasAttribute('data-off')) el.setAttribute('data-off', '');
    });
  }
}

export class Overlay {
  readonly root: SVGSVGElement;
  private capture: SVGRectElement;
  private outlines: Pool;
  private draft: SVGPathElement;
  private rubber: SVGPathElement;
  private hlines: Pool;
  private handles: Pool;
  private anchors: Pool;
  private widgets: Pool;
  private xPaths: Pool;
  private xLines: Pool;
  private xCircles: Pool;
  private marquee: SVGRectElement;

  constructor(host: HTMLElement) {
    this.root = document.createElementNS(NS, 'svg');
    this.root.setAttribute('class', 'fw-vo');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.setAttribute('data-off', '');
    this.capture = document.createElementNS(NS, 'rect');
    this.capture.setAttribute('class', 'fw-vo-capture');
    this.capture.setAttribute('data-role', 'capture');
    const group = (name: string): SVGGElement => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `fw-vo-${name}`);
      this.root.append(g);
      return g;
    };
    this.root.append(this.capture);
    const outlines = group('outlines');
    this.outlines = new Pool(outlines, 'path', 'fw-vo-outline');
    this.draft = document.createElementNS(NS, 'path');
    this.draft.setAttribute('class', 'fw-vo-draft');
    this.rubber = document.createElementNS(NS, 'path');
    this.rubber.setAttribute('class', 'fw-vo-rubber');
    this.root.append(this.draft, this.rubber);
    this.hlines = new Pool(group('hlines'), 'line', 'fw-vo-hline');
    this.anchors = new Pool(group('anchors'), 'rect', 'fw-vo-anchor');
    this.handles = new Pool(group('handles'), 'circle', 'fw-vo-handle');
    this.widgets = new Pool(group('widgets'), 'circle', 'fw-vo-widget');
    this.xPaths = new Pool(group('xpaths'), 'path', 'fw-vo-x');
    this.xLines = new Pool(group('xlines'), 'line', 'fw-vo-x');
    this.xCircles = new Pool(group('xcircles'), 'circle', 'fw-vo-x');
    this.marquee = document.createElementNS(NS, 'rect');
    this.marquee.setAttribute('class', 'fw-vo-marquee');
    this.marquee.setAttribute('data-off', '');
    this.root.append(this.marquee);
    host.append(this.root);
  }

  render(scene: Scene): void {
    const root = this.root;
    if (scene.visible) { if (root.hasAttribute('data-off')) root.removeAttribute('data-off'); } else if (!root.hasAttribute('data-off')) root.setAttribute('data-off', '');
    set(root, 'data-tool', scene.tool);
    set(root, 'data-capture', scene.capture ? 'true' : 'false');
    if (!scene.visible) return;
    const s = 1 / scene.scale;
    root.style.setProperty('--fw-vo-px', String(s));
    this.outlines.update(scene.outlines, (el, item) => {
      set(el, 'd', item.d);
      set(el, 'data-selected', item.selected ? 'true' : 'false');
    });
    set(this.draft, 'd', scene.draft);
    set(this.rubber, 'd', scene.rubber);
    this.hlines.update(scene.handles, (el, h) => {
      set(el, 'x1', String(h.ax)); set(el, 'y1', String(h.ay)); set(el, 'x2', String(h.x)); set(el, 'y2', String(h.y));
    });
    const half = 4 * s;
    this.anchors.update(scene.anchors, (el, a, i) => {
      set(el, 'x', String(a.x - half)); set(el, 'y', String(a.y - half));
      set(el, 'width', String(half * 2)); set(el, 'height', String(half * 2));
      set(el, 'data-role', 'anchor'); set(el, 'data-i', String(i));
      set(el, 'data-selected', a.selected ? 'true' : 'false');
      set(el, 'data-kind', a.kind);
      set(el, 'data-start', a.start ? 'true' : 'false');
    });
    this.handles.update(scene.handles, (el, h, i) => {
      set(el, 'cx', String(h.x)); set(el, 'cy', String(h.y)); set(el, 'r', String(3.5 * s));
      set(el, 'data-role', 'handle'); set(el, 'data-i', String(i));
      set(el, 'data-selected', h.selected ? 'true' : 'false');
    });
    this.widgets.update(scene.widgets, (el, w, i) => {
      set(el, 'cx', String(w.x)); set(el, 'cy', String(w.y)); set(el, 'r', String(5 * s));
      set(el, 'data-role', 'widget'); set(el, 'data-i', String(i));
      set(el, 'data-limit', w.limit ? 'true' : 'false');
      set(el, 'data-type', w.type);
    });
    const extras = scene.extras ?? [];
    this.xPaths.update(extras.filter((e): e is Extract<ExtraItem, { kind: 'path' }> => e.kind === 'path'), (el, item) => {
      set(el, 'd', item.d); set(el, 'data-c', item.cls); set(el, 'style', item.w ? `stroke-width:${item.w}px` : '');
    });
    this.xLines.update(extras.filter((e): e is Extract<ExtraItem, { kind: 'line' }> => e.kind === 'line'), (el, item) => {
      set(el, 'x1', String(item.x1)); set(el, 'y1', String(item.y1)); set(el, 'x2', String(item.x2)); set(el, 'y2', String(item.y2)); set(el, 'data-c', item.cls);
    });
    this.xCircles.update(extras.filter((e): e is Extract<ExtraItem, { kind: 'circle' }> => e.kind === 'circle'), (el, item) => {
      set(el, 'cx', String(item.x)); set(el, 'cy', String(item.y)); set(el, 'r', String(item.r * s)); set(el, 'data-c', item.cls);
      set(el, 'data-role', item.role ?? ''); set(el, 'data-i', String(item.i ?? -1)); set(el, 'style', item.fill ? `fill:${item.fill}` : '');
    });
    if (scene.marquee) {
      const m = scene.marquee;
      set(this.marquee, 'x', String(m.w < 0 ? m.x + m.w : m.x)); set(this.marquee, 'y', String(m.h < 0 ? m.y + m.h : m.y));
      set(this.marquee, 'width', String(Math.abs(m.w))); set(this.marquee, 'height', String(Math.abs(m.h)));
      if (this.marquee.hasAttribute('data-off')) this.marquee.removeAttribute('data-off');
    } else if (!this.marquee.hasAttribute('data-off')) this.marquee.setAttribute('data-off', '');
  }
}
