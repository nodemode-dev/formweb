import { element, value } from '../ui/dom';
import type { PathfinderOp } from './boolean';
import type { CornerType } from './geometry';
import { vectorIcon, type VectorIcon } from './icons';
import type { Cap, Join, Paint } from './store';
import { safePaint } from './svg';
import type { Editor, ToolId } from './editor';
import { ExtraSections } from './panel2';

interface ToolDef { id: ToolId; label: string; icon: VectorIcon; keys: string }

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Selection', icon: 'select', keys: 'V' },
  { id: 'direct', label: 'Direct Selection', icon: 'direct', keys: 'A' },
  { id: 'pen', label: 'Pen', icon: 'pen', keys: 'P' },
  { id: 'curvature', label: 'Curvature', icon: 'curvature', keys: '' },
  { id: 'add', label: 'Add Anchor Point', icon: 'add', keys: '+' },
  { id: 'delete', label: 'Delete Anchor Point', icon: 'remove', keys: '-' },
  { id: 'convert', label: 'Anchor Point', icon: 'convert', keys: 'Shift+C' },
  { id: 'scissors', label: 'Scissors', icon: 'scissors', keys: 'C' },
  { id: 'rect', label: 'Rectangle', icon: 'rect', keys: 'M' },
  { id: 'ellipse', label: 'Ellipse', icon: 'ellipse', keys: 'L' },
  { id: 'polygon', label: 'Polygon', icon: 'polygon', keys: '' },
  { id: 'star', label: 'Star', icon: 'star', keys: '' },
  { id: 'line', label: 'Line Segment', icon: 'line', keys: '\\' },
  { id: 'arc', label: 'Arc', icon: 'arc', keys: '' },
  { id: 'spiral', label: 'Spiral', icon: 'spiral', keys: '' },
  { id: 'knife', label: 'Knife', icon: 'knife', keys: 'K' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', keys: 'Shift+E' },
  { id: 'shapebuilder', label: 'Shape Builder', icon: 'shapebuilder', keys: 'Shift+M' },
  { id: 'width', label: 'Width', icon: 'width', keys: 'Shift+W' },
  { id: 'gradient', label: 'Gradient', icon: 'gradient', keys: 'G' },
  { id: 'transform', label: 'Free Transform', icon: 'transform', keys: 'E' }
];

export const PATHFINDERS: { op: PathfinderOp; label: string; icon: VectorIcon }[] = [
  { op: 'unite', label: 'Unite', icon: 'unite' },
  { op: 'minus-front', label: 'Minus Front', icon: 'minusFront' },
  { op: 'intersect', label: 'Intersect', icon: 'intersect' },
  { op: 'exclude', label: 'Exclude', icon: 'exclude' },
  { op: 'divide', label: 'Divide', icon: 'divide' },
  { op: 'trim', label: 'Trim', icon: 'trim' },
  { op: 'merge', label: 'Merge', icon: 'merge' },
  { op: 'crop', label: 'Crop', icon: 'crop' },
  { op: 'minus-back', label: 'Minus Back', icon: 'minusBack' },
  { op: 'outline', label: 'Outline', icon: 'pfOutline' }
];

const CORNER_TYPES: { id: CornerType; label: string }[] = [{ id: 'round', label: 'Round' }, { id: 'inverted', label: 'Inverted' }, { id: 'chamfer', label: 'Chamfer' }];

function button(label: string, title: string, run: () => void, icon?: VectorIcon): HTMLButtonElement {
  const b = element('button', 'fw-v-btn');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  if (icon) b.append(vectorIcon(icon));
  if (label) b.append(element('span', 'fw-v-btn-label', label));
  b.addEventListener('click', run);
  return b;
}

function segment<T extends string>(items: { id: T; label: string }[], pick: (id: T) => void): { root: HTMLElement; set: (id: T | 'mixed') => void } {
  const root = element('div', 'fw-seg');
  const buttons = new Map<T, HTMLButtonElement>();
  for (const item of items) {
    const b = element('button', 'fw-seg-btn', item.label);
    b.type = 'button';
    b.addEventListener('click', () => pick(item.id));
    buttons.set(item.id, b);
    root.append(b);
  }
  return { root, set: id => buttons.forEach((b, key) => { b.classList.toggle('is-on', key === id); b.setAttribute('aria-pressed', String(key === id)); }) };
}

function field(label: string, control: HTMLElement, full = false): HTMLElement {
  const wrap = element('div', full ? 'field full' : 'field');
  wrap.append(element('span', 'field-label', label), control);
  return wrap;
}

function numberInput(min: number, max: number, step: number, change: (n: number) => void): HTMLInputElement {
  const input = element('input', 'fw-v-input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => { const n = parseFloat(input.value); if (Number.isFinite(n)) change(Math.max(min, Math.min(max, n))); });
  return input;
}

function section(title: string, open: boolean): { root: HTMLDetailsElement; body: HTMLElement } {
  const root = element('details', 'fw-v-section');
  root.open = open;
  root.append(element('summary', 'fw-v-summary', title));
  const body = element('div', 'fw-v-body');
  root.append(body);
  return { root, body };
}

function hex(valueText: string, fallback: string): string {
  if (/^#[0-9a-f]{6}$/i.test(valueText)) return valueText.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(valueText);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : fallback;
}

export class VectorPanel {
  readonly bar = element('div', 'fw-vtools');
  readonly root = element('aside', 'fw-vpanel');
  private toolButtons = new Map<ToolId, HTMLButtonElement>();
  private manual = false;
  private fill = element('input', 'fw-v-color');
  private stroke = element('input', 'fw-v-color');
  private fillNone = element('button', 'fw-seg-btn', 'None');
  private strokeNone = element('button', 'fw-seg-btn', 'None');
  private weight: HTMLInputElement;
  private miter: HTMLInputElement;
  private dash = element('input', 'fw-v-input');
  private opacity: HTMLInputElement;
  private caps: ReturnType<typeof segment<Cap>>;
  private joins: ReturnType<typeof segment<Join>>;
  private radius: HTMLInputElement;
  private cornerType: ReturnType<typeof segment<CornerType>>;
  private cornerMode: ReturnType<typeof segment<'absolute' | 'relative'>>;
  private cornerInfo = element('p', 'fw-v-note');
  private sides: HTMLInputElement;
  private points: HTMLInputElement;
  private ratio: HTMLInputElement;
  private slope: HTMLInputElement;
  private closedArc = element('input', 'fw-v-check');
  private decay: HTMLInputElement;
  private turns: HTMLInputElement;
  private rectRadius: HTMLInputElement;
  private simplifyTolerance: HTMLInputElement;
  private offsetDistance: HTMLInputElement;
  private fileInput = element('input');

  constructor(private editor: Editor, private host: HTMLElement) {
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Vector tools');
    for (const tool of TOOLS) {
      const b = button('', tool.keys ? `${tool.label} (${tool.keys})` : tool.label, () => editor.setTool(editor.tool === tool.id ? null : tool.id), tool.icon);
      b.dataset.tool = tool.id;
      this.toolButtons.set(tool.id, b);
      this.bar.append(b);
    }
    this.root.setAttribute('aria-label', 'Vector');
    const appearance = section('Appearance', true);
    this.fill.type = 'color';
    this.stroke.type = 'color';
    this.fill.addEventListener('change', () => editor.applyPaint({ fill: this.fill.value }));
    this.stroke.addEventListener('change', () => editor.applyPaint({ stroke: this.stroke.value }));
    this.fillNone.type = 'button';
    this.strokeNone.type = 'button';
    this.fillNone.addEventListener('click', () => editor.applyPaint({ fill: 'none' }));
    this.strokeNone.addEventListener('click', () => editor.applyPaint({ stroke: 'none' }));
    const swatches = element('div', 'fw-v-row');
    swatches.append(field('Fill', this.pair(this.fill, this.fillNone)), field('Stroke', this.pair(this.stroke, this.strokeNone)));
    this.weight = numberInput(0, 1000, 0.5, n => editor.applyPaint({ strokeWidth: n }));
    this.miter = numberInput(1, 100, 0.5, n => editor.applyPaint({ miter: n }));
    this.opacity = numberInput(0, 100, 1, n => editor.applyPaint({ opacity: n / 100 }));
    this.dash.type = 'text';
    this.dash.placeholder = 'dash gap dash gap';
    this.dash.addEventListener('change', () => {
      const text = this.dash.value.trim();
      const ok = text === '' || /^(?:\d+(?:\.\d+)?)(?:[ ,]+\d+(?:\.\d+)?){0,15}$/.test(text);
      if (ok) editor.applyPaint({ dash: text.replace(/,/g, ' ') });
      else this.dash.value = editor.paint.dash;
    });
    this.caps = segment<Cap>([{ id: 'butt', label: 'Butt' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }], id => editor.applyPaint({ cap: id }));
    this.joins = segment<Join>([{ id: 'miter', label: 'Miter' }, { id: 'round', label: 'Round' }, { id: 'bevel', label: 'Bevel' }], id => editor.applyPaint({ join: id }));
    const numbers = element('div', 'fw-v-row');
    numbers.append(field('Weight', this.weight), field('Miter limit', this.miter), field('Opacity %', this.opacity));
    appearance.body.append(swatches, numbers, field('Cap', this.caps.root, true), field('Join', this.joins.root, true), field('Dashes', this.dash, true));

    const corners = section('Corners', true);
    this.radius = numberInput(0, 100000, 1, n => editor.applyCorner({ radius: n }));
    this.cornerType = segment<CornerType>(CORNER_TYPES, id => editor.applyCorner({ type: id }));
    this.cornerMode = segment<'absolute' | 'relative'>([{ id: 'absolute', label: 'Absolute' }, { id: 'relative', label: 'Relative' }], id => editor.applyCorner({ mode: id }));
    corners.body.append(field('Radius', this.radius), field('Type', this.cornerType.root, true), field('Mode', this.cornerMode.root, true), this.cornerInfo, button('Expand corners', 'Bake rounded corners into plain anchors', () => editor.bakeCorners(), 'bake'));
    editor.cornerRequests.add(() => { corners.root.open = true; this.setOpen(true); this.radius.focus(); this.radius.select(); });

    const shapes = section('Shapes', false);
    this.sides = numberInput(3, 120, 1, n => { editor.options.sides = n; });
    this.points = numberInput(3, 120, 1, n => { editor.options.points = n; });
    this.ratio = numberInput(0.02, 1, 0.01, n => { editor.options.ratio = n; });
    this.slope = numberInput(-1, 1, 0.05, n => { editor.options.slope = n; });
    this.closedArc.type = 'checkbox';
    this.closedArc.addEventListener('change', () => { editor.options.closedArc = this.closedArc.checked; });
    this.decay = numberInput(0.05, 0.99, 0.01, n => { editor.options.decay = n; });
    this.turns = numberInput(0.5, 40, 0.5, n => { editor.options.turns = n; });
    this.rectRadius = numberInput(0, 10000, 1, n => { editor.options.radius = n; });
    const shapeGrid = element('div', 'fw-v-row');
    shapeGrid.append(field('Polygon sides', this.sides), field('Star points', this.points), field('Star inner ratio', this.ratio), field('Arc slope', this.slope), field('Spiral decay', this.decay), field('Spiral turns', this.turns), field('Rectangle radius', this.rectRadius), field('Arc closed', this.closedArc));
    shapes.body.append(shapeGrid);

    const pathfinder = section('Pathfinder', true);
    const grid = element('div', 'fw-v-grid');
    for (const item of PATHFINDERS) grid.append(button(item.label, `${item.label} on the selected paths`, () => editor.runPathfinder(item.op), item.icon));
    pathfinder.body.append(grid);

    const path = section('Path', false);
    this.simplifyTolerance = numberInput(0.1, 50, 0.1, () => undefined);
    this.offsetDistance = numberInput(-1000, 1000, 1, () => undefined);
    const ops = element('div', 'fw-v-grid');
    ops.append(
      button('Join', 'Join the two selected end anchors', () => editor.runPathOp('join'), 'join'),
      button('Average', 'Average the selected anchors on both axes', () => editor.runPathOp('average'), 'average'),
      button('Simplify', 'Reduce anchors within the tolerance', () => editor.runPathOp('simplify', parseFloat(this.simplifyTolerance.value) || 1), 'simplify'),
      button('Offset', 'Offset path by the distance', () => editor.runPathOp('offset', parseFloat(this.offsetDistance.value) || 8), 'offset'),
      button('Outline stroke', 'Convert the stroke to a filled shape', () => editor.runPathOp('outline'), 'outline'),
      button('Reverse', 'Reverse the path direction', () => editor.runPathOp('reverse'), 'convert'),
      button('Compound', 'Make a compound path from the selected paths', () => editor.makeCompound(), 'exclude'),
      button('Release', 'Release a compound path into separate paths', () => editor.releaseCompound(), 'divide')
    );
    const tolerances = element('div', 'fw-v-row');
    tolerances.append(field('Simplify tolerance', this.simplifyTolerance), field('Offset distance', this.offsetDistance));
    path.body.append(tolerances, ops);

    const svg = section('SVG', false);
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/svg+xml,.svg';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void file.text().then(text => editor.importText(text));
    });
    svg.body.append(
      button('Import SVG', 'Import an SVG file as editable paths', () => this.fileInput.click(), 'upload'),
      button('Export SVG', 'Download the selected paths as SVG', () => this.download(), 'download'),
      this.fileInput
    );

    const extra = new ExtraSections(editor);
    this.root.append(appearance.root, ...extra.sections.slice(0, 2), corners.root, shapes.root, pathfinder.root, path.root, ...extra.sections.slice(2), svg.root);
    editor.listeners.add(() => extra.update());
    extra.update();
    const close = button('', 'Close vector panel', () => { this.manual = false; this.setOpen(false); editor.setTool(null); }, 'close');
    close.classList.add('fw-v-close');
    this.root.prepend(close);
    host.append(this.bar, this.root);
    editor.listeners.add(() => this.update());
    const stage = editor.ctx.canvas.outer.parentElement;
    if (stage) new ResizeObserver(() => this.place(stage)).observe(stage);
    window.addEventListener('resize', () => stage && this.place(stage));
    if (stage) this.place(stage);
    this.update();
  }

  private pair(color: HTMLInputElement, none: HTMLButtonElement): HTMLElement {
    const row = element('div', 'fw-v-pair');
    none.type = 'button';
    none.classList.add('fw-v-none');
    row.append(color, none);
    return row;
  }

  private place(stage: HTMLElement): void {
    const r = stage.getBoundingClientRect();
    for (const style of [this.bar.style, this.root.style]) {
      style.setProperty('--fw-v-left', `${Math.round(r.left + 12)}px`);
      style.setProperty('--fw-v-right', `${Math.round(window.innerWidth - r.right + 12)}px`);
      style.setProperty('--fw-v-top', `${Math.round(r.top + 12)}px`);
      style.setProperty('--fw-v-max', `${Math.max(160, Math.round(r.height - 24))}px`);
    }
  }

  setOpen(open: boolean): void {
    this.manual = open;
    this.update();
  }

  toggle(): void { this.setOpen(!this.manual); }

  pickFile(): void { this.fileInput.click(); }

  download(): void {
    const markup = this.editor.exportText();
    if (!markup) { this.editor.notify('Select a vector shape to export.'); return; }
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vector.svg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  update(): void {
    const e = this.editor;
    const open = this.manual || e.tool !== null;
    this.bar.dataset.open = String(open);
    this.root.dataset.open = String(open);
    for (const [id, b] of this.toolButtons) { b.classList.toggle('is-on', e.tool === id); b.setAttribute('aria-pressed', String(e.tool === id)); }
    const shape = e.selection.map(id => e.shapeOf(id)).find(s => !!s);
    const paint: Paint = shape ? shape.paint : e.paint;
    this.setColor(this.fill, this.fillNone, paint.fill);
    this.setColor(this.stroke, this.strokeNone, paint.stroke);
    value(this.weight, String(paint.strokeWidth));
    value(this.miter, String(paint.miter));
    value(this.opacity, String(Math.round(paint.opacity * 100)));
    value(this.dash, paint.dash);
    this.caps.set(paint.cap);
    this.joins.set(paint.join);
    const c = e.cornerState();
    value(this.radius, c.radius === 'mixed' ? '' : String(c.radius));
    this.radius.placeholder = c.radius === 'mixed' ? 'Mixed' : '0';
    this.radius.disabled = c.count === 0;
    this.cornerType.set(c.type);
    this.cornerMode.set(c.mode);
    const info = c.count === 0 ? 'No rounded-corner anchors. Select an anchor with the Direct Selection tool.' : c.selected ? `${c.selected} anchor${c.selected === 1 ? '' : 's'} selected` : `All ${c.count} corners of the selection`;
    if (this.cornerInfo.textContent !== info) this.cornerInfo.textContent = info;
    value(this.sides, String(e.options.sides));
    value(this.points, String(e.options.points));
    value(this.ratio, String(e.options.ratio));
    value(this.slope, String(e.options.slope));
    this.closedArc.checked = e.options.closedArc;
    value(this.decay, String(e.options.decay));
    value(this.turns, String(e.options.turns));
    value(this.rectRadius, String(e.options.radius));
    if (!this.simplifyTolerance.value) this.simplifyTolerance.value = '1';
    if (!this.offsetDistance.value) this.offsetDistance.value = '8';
  }

  private setColor(input: HTMLInputElement, none: HTMLButtonElement, paint: string): void {
    const isNone = paint === 'none';
    none.classList.toggle('is-on', isNone);
    none.setAttribute('aria-pressed', String(isNone));
    if (!isNone && safePaint(paint) && document.activeElement !== input) {
      const next = hex(paint, input.value || '#000000');
      if (input.value !== next) input.value = next;
    }
  }
}

export { button, field, numberInput, section, segment };
