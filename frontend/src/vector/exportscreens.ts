import { label, labelAttr, t } from '../i18n';
import { element } from '../ui/dom';
import type { Host } from './host';
import { svgOf } from './store';
import { boards } from './artboards';
import { svgToPdf } from './pdfexport';

/**
 * Export for Screens: the edited SVG (or only the selected shapes) as PNG, JPG, WebP and clean SVG at several scales.
 * Everything runs in the browser: the canvas iframe's inline svg is cloned, stripped of editor attributes, serialized,
 * drawn through an Image from a Blob URL onto a canvas, and each file is handed to the browser as a download.
 */

type Format = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf';
const FORMATS: { id: Format; label: string; mime: string }[] = [
  { id: 'png', label: 'PNG', mime: 'image/png' },
  { id: 'jpg', label: 'JPG', mime: 'image/jpeg' },
  { id: 'webp', label: 'WebP', mime: 'image/webp' },
  { id: 'svg', label: 'SVG', mime: 'image/svg+xml' },
  { id: 'pdf', label: 'PDF', mime: 'application/pdf' }
];
/* Formats written once at 1x, whatever scales are ticked. */
const VECTOR = new Set<Format>(['svg', 'pdf']);
const SCALES: { scale: number; suffix: string }[] = [
  { scale: 0.5, suffix: '@0.5x' }, { scale: 1, suffix: '' }, { scale: 2, suffix: '@2x' }, { scale: 3, suffix: '@3x' }, { scale: 4, suffix: '@4x' }
];
const MAX_SIDE = 16384;
const KEEP = new Set(['defs', 'symbol', 'lineargradient', 'radialgradient', 'clippath', 'mask', 'style', 'title', 'desc', 'pattern', 'filter', 'marker']);
const NS = 'http://www.w3.org/2000/svg';

export interface ExportOptions {
  base: string;
  selectionOnly: boolean;
  formats: Format[];
  scales: { scale: number; suffix: string }[];
  quality: number;
  /** Background for PNG and WebP; null leaves them transparent. */
  background: string | null;
  jpgBackground: string;
}

interface Source { markup: (px: number) => string; width: number; height: number; live: SVGSVGElement; vb: number[]; wanted?: Set<string> }

const numeric = (value: string | null): number => { const n = parseFloat(value ?? ''); return Number.isFinite(n) && n > 0 && !/%$/.test(value ?? '') ? n : 0; };

/** Shapes picked inside this svg: the vector selection, or the single node selected on the canvas. */
function chosenIds(host: Host, svgId: string): string[] {
  const site = host.site();
  const picked = host.selection().length ? host.selection() : [host.primary()];
  return picked.filter(id => !!id && id !== svgId && svgOf(site, id) === svgId && !!host.element(id));
}

/** Clone the live svg without the editor's attributes, optionally keeping only the selected shapes and cropping to them. */
export function buildSource(host: Host, svgId: string, selectionOnly: boolean): Source | null {
  const live = host.element(svgId) as SVGSVGElement | null;
  if (!live || live.localName !== 'svg') return null;
  const site = host.site();
  const vbAttr = (live.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const rect = live.getBoundingClientRect();
  let vb: number[] = vbAttr.length === 4 && vbAttr.every(Number.isFinite) && vbAttr[2] > 0 && vbAttr[3] > 0 ? vbAttr : [0, 0, numeric(live.getAttribute('width')) || rect.width || 100, numeric(live.getAttribute('height')) || rect.height || 100];
  const baseW = numeric(live.getAttribute('width')) || rect.width || vb[2];
  const baseH = numeric(live.getAttribute('height')) || rect.height || vb[3];
  let width = baseW, height = baseH;
  let wanted: Set<string> | undefined;
  const clone = live.cloneNode(true) as SVGSVGElement;

  if (selectionOnly) {
    const chosen = chosenIds(host, svgId);
    const els = chosen.map(id => host.element(id)).filter((el): el is SVGGraphicsElement => !!el && 'getBBox' in el);
    if (!els.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) {
      const raw = el.getCTM(), root = live.getCTM();
      const m = raw && root ? root.inverse().multiply(raw) : raw;
      const box = el.getBBox();
      const view = el.ownerDocument.defaultView;
      const style = view?.getComputedStyle(el);
      const stroke = style && style.stroke !== 'none' ? parseFloat(style.strokeWidth) || 0 : 0;
      const k = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;
      const pad = (stroke * k) / 2;
      for (const [px, py] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
        const qx = m ? m.a * px + m.c * py + m.e : px, qy = m ? m.b * px + m.d * py + m.f : py;
        x0 = Math.min(x0, qx - pad); y0 = Math.min(y0, qy - pad); x1 = Math.max(x1, qx + pad); y1 = Math.max(y1, qy + pad);
      }
    }
    if (!Number.isFinite(x0) || x1 - x0 <= 0 || y1 - y0 <= 0) return null;
    const unit = baseW / vb[2];
    vb = [x0, y0, x1 - x0, y1 - y0];
    width = Math.max(1, (x1 - x0) * unit);
    height = Math.max(1, (y1 - y0) * unit);
    wanted = new Set(chosen);
    const keep = wanted;
    const prune = (node: Element): boolean => {
      let holds = false;
      for (const child of Array.from(node.children)) {
        const id = child.getAttribute('data-fw-id') ?? '';
        if (keep.has(id)) { holds = true; continue; }
        if (KEEP.has(child.localName.toLowerCase())) continue;
        if (prune(child)) { holds = true; continue; }
        child.remove();
      }
      return holds;
    };
    prune(clone);
  }

  const scrub = (node: Element): void => {
    for (const attr of Array.from(node.attributes)) if (/^data-fw-/i.test(attr.name) || attr.name === 'class' || /^on/i.test(attr.name)) node.removeAttribute(attr.name);
    Array.from(node.children).forEach(scrub);
  };
  scrub(clone);
  clone.removeAttribute('style');
  clone.removeAttribute('x'); clone.removeAttribute('y');
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('viewBox', vb.map(v => Math.round(v * 1000) / 1000).join(' '));
  const round = (v: number): string => String(Math.round(v * 100) / 100);
  return {
    width, height, live, vb, wanted,
    markup: px => {
      clone.setAttribute('width', round(width * px));
      clone.setAttribute('height', round(height * px));
      return new XMLSerializer().serializeToString(clone);
    }
  };
}

function loadImage(markup: string): Promise<{ img: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('The drawing could not be rendered as an image.'))); };
    img.src = url;
  });
}

async function rasterize(source: Source, scale: number, format: Exclude<Format, 'svg' | 'pdf'>, options: ExportOptions): Promise<Blob> {
  const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
  if (w > MAX_SIDE || h > MAX_SIDE) throw new Error(t('{0}x is too large: {1} px is the longest side allowed.', [scale, MAX_SIDE]));
  const { img, release } = await loadImage(source.markup(scale));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('The browser cannot create a drawing surface.'));
    const fill = format === 'jpg' ? options.jpgBackground : options.background;
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    const mime = FORMATS.find(f => f.id === format)!.mime;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, format === 'png' ? undefined : options.quality / 100));
    if (!blob || blob.type !== mime) throw new Error(t('This browser cannot save {0} files.', [format.toUpperCase()]));
    return blob;
  } finally { release(); }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
export const safeName = (value: string): string => value.replace(/[^\w.@+-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Render and download every chosen format at every chosen scale. Returns the file names written. */
async function queueFiles(source: Source, base: string, options: ExportOptions, queue: { blob: Blob; name: string }[]): Promise<void> {
  for (const format of options.formats) {
    if (format === 'svg') {
      queue.push({ blob: new Blob([source.markup(1)], { type: 'image/svg+xml' }), name: `${base}.svg` });
      continue;
    }
    if (format === 'pdf') {
      queue.push({ blob: svgToPdf(source), name: `${base}.pdf` });
      continue;
    }
    for (const { scale, suffix } of options.scales) queue.push({ blob: await rasterize(source, scale, format, options), name: `${base}${safeName(suffix)}.${format}` });
  }
}

export async function exportScreens(host: Host, svgId: string, options: ExportOptions): Promise<string[]> {
  const source = buildSource(host, svgId, options.selectionOnly);
  if (!source) throw new Error(options.selectionOnly ? t('Select shapes to export.') : t('The edited SVG is not on the canvas.'));
  const base = safeName(options.base) || 'artwork';
  const written: string[] = [];
  const queue: { blob: Blob; name: string }[] = [];
  await queueFiles(source, base, options, queue);
  for (const item of queue) { download(item.blob, item.name); written.push(item.name); await pause(200); }
  return written;
}

/** Every artboard (svg) drawn on the current page, in page order. */
export function pageArtboards(host: Host): { id: string; name: string }[] {
  return boards(host.site()).filter(b => !!host.element(b.id)).map(b => ({ id: b.id, name: b.name }));
}

/** Export each artboard under its own name, with the file name field as a prefix; names that collide get -2, -3. */
export async function exportArtboards(host: Host, items: { id: string; name: string }[], options: ExportOptions): Promise<string[]> {
  const prefix = options.base.replace(/[^\w.@+-]+/g, '-').replace(/^-+/, '').slice(0, 40);
  const used = new Map<string, number>();
  const queue: { blob: Blob; name: string }[] = [];
  for (const item of items) {
    const source = buildSource(host, item.id, false);
    if (!source) continue;
    const stem = `${prefix}${safeName(item.name) || 'artboard'}`;
    const n = (used.get(stem) ?? 0) + 1;
    used.set(stem, n);
    await queueFiles(source, n > 1 ? `${stem}-${n}` : stem, options, queue);
  }
  if (!queue.length) throw new Error(t('No artboards on this page to export.'));
  const written: string[] = [];
  for (const file of queue) { download(file.blob, file.name); written.push(file.name); await pause(200); }
  return written;
}

class ExportDialog {
  private root: HTMLElement | null = null;
  private host: Host | null = null;
  private svg = '';
  private named = '';
  private scope!: { whole: HTMLInputElement; selection: HTMLInputElement; all: HTMLInputElement };
  private allLabel!: HTMLElement;
  private formats = new Map<Format, HTMLInputElement>();
  private scales: { scale: number; on: HTMLInputElement; suffix: HTMLInputElement }[] = [];
  private quality!: HTMLInputElement;
  private qualityOut!: HTMLElement;
  private name!: HTMLInputElement;
  private transparent!: HTMLInputElement;
  private bg!: HTMLInputElement;
  private jpgBg!: HTMLInputElement;
  private status!: HTMLElement;
  private go!: HTMLButtonElement;

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog fw-v-exportdlg');
    root.setAttribute('role', 'dialog');
    labelAttr(root, 'aria-label', 'Export for Screens');
    root.hidden = true;
    const check = (type: 'checkbox' | 'radio', english: string, name = '', plain = false): { row: HTMLElement; input: HTMLInputElement } => {
      const input = element('input', 'fw-v-check');
      input.type = type;
      if (name) input.name = name;
      const row = element('label', 'fw-v-checkrow');
      const span = element('span', '', plain ? english : '');
      if (!plain) label(span, english);
      row.append(input, span);
      return { row, input };
    };
    const group = (title: string, ...children: HTMLElement[]): HTMLElement => {
      const box = element('div', 'fw-v-stack');
      const head = element('span', 'fw-v-note');
      label(head, title);
      box.append(head, ...children);
      return box;
    };

    this.name = element('input', 'fw-v-input');
    labelAttr(this.name, 'aria-label', 'File name');
    const whole = check('radio', 'Whole drawing', 'fw-exp-scope');
    const sel = check('radio', 'Selected shapes only', 'fw-exp-scope');
    const all = check('radio', 'All artboards on this page', 'fw-exp-scope');
    this.allLabel = all.row.lastElementChild as HTMLElement;
    this.scope = { whole: whole.input, selection: sel.input, all: all.input };
    const nameMode = (): void => {
      const prefix = this.scope.all.checked;
      labelAttr(this.name, 'aria-label', prefix ? 'File name prefix' : 'File name');
      if (prefix && this.name.value === (safeName(this.host?.site().nodes[this.svg]?.name ?? '') || 'artwork')) this.name.value = '';
      if (!prefix && !this.name.value) this.name.value = safeName(this.host?.site().nodes[this.svg]?.name ?? '') || 'artwork';
    };
    for (const input of [whole.input, sel.input, all.input]) input.addEventListener('change', nameMode);

    const formatRows = FORMATS.map(f => { const c = check('checkbox', f.label, '', true); this.formats.set(f.id, c.input); return c.row; });
    const formats = element('div', 'fw-v-exp-formats');
    formats.append(...formatRows);

    this.quality = element('input', 'fw-v-input');
    this.quality.type = 'range'; this.quality.min = '1'; this.quality.max = '100'; this.quality.value = '90';
    labelAttr(this.quality, 'aria-label', 'JPG and WebP quality');
    this.qualityOut = element('span', 'fw-v-note', '90');
    this.quality.addEventListener('input', () => { this.qualityOut.textContent = this.quality.value; });
    const qualityRow = element('div', 'fw-v-exp-quality');
    qualityRow.append(this.quality, this.qualityOut);

    const scaleRows = SCALES.map(s => {
      const on = element('input', 'fw-v-check');
      on.type = 'checkbox';
      on.setAttribute('aria-label', `${s.scale}x`);
      const suffix = element('input', 'fw-v-input');
      suffix.type = 'text'; suffix.value = s.suffix; suffix.maxLength = 16; labelAttr(suffix, 'aria-label', 'Suffix for {0}x', [s.scale]);
      const row = element('label', 'fw-v-exp-scale');
      row.append(on, element('span', '', `${s.scale}x`), suffix);
      this.scales.push({ scale: s.scale, on, suffix });
      return row;
    });

    this.transparent = element('input', 'fw-v-check');
    this.transparent.type = 'checkbox';
    this.transparent.checked = true;
    this.bg = element('input', 'fw-v-color');
    this.bg.type = 'color'; this.bg.value = '#ffffff';
    labelAttr(this.bg, 'aria-label', 'PNG and WebP background color');
    const bgRow = element('div', 'fw-v-exp-bg');
    const transparentLabel = element('label', 'fw-v-checkrow');
    const transparentText = element('span');
    label(transparentText, 'Transparent PNG and WebP');
    transparentLabel.append(this.transparent, transparentText);
    bgRow.append(transparentLabel, this.bg);
    this.transparent.addEventListener('change', () => { this.bg.disabled = this.transparent.checked; });
    this.bg.disabled = true;
    this.jpgBg = element('input', 'fw-v-color');
    this.jpgBg.type = 'color'; this.jpgBg.value = '#ffffff';
    labelAttr(this.jpgBg, 'aria-label', 'JPG background color');
    const jpgRow = element('div', 'fw-v-exp-bg');
    const jpgNote = element('span', 'fw-v-note');
    label(jpgNote, 'JPG background');
    jpgRow.append(jpgNote, this.jpgBg);

    this.status = element('p', 'fw-v-note');
    this.status.setAttribute('role', 'status');
    this.go = element('button', 'fw-v-btn');
    label(this.go, 'Export');
    this.go.type = 'button';
    const cancel = element('button', 'fw-v-btn');
    label(cancel, 'Close');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(this.go, cancel);

    const summary = element('div', 'fw-v-summary');
    label(summary, 'Export for Screens');
    root.append(summary,
      group('File name', this.name), group('Export', whole.row, sel.row, all.row), group('Formats', formats), group('JPG and WebP quality', qualityRow),
      group('Scales and file name suffixes', ...scaleRows), group('Background', bgRow, jpgRow), this.status, actions);

    const submit = (): void => { void this.run(); };
    this.go.addEventListener('click', submit);
    cancel.addEventListener('click', () => this.close());
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    });
    document.body.append(root);
    return root;
  }

  private async run(): Promise<void> {
    const host = this.host;
    if (!host || (!this.svg && !this.scope.all.checked)) return;
    const formats = FORMATS.map(f => f.id).filter(id => this.formats.get(id)?.checked);
    const scales = this.scales.filter(s => s.on.checked).map(s => ({ scale: s.scale, suffix: s.suffix.value.trim() }));
    const raster = formats.some(f => !VECTOR.has(f));
    if (!formats.length) { label(this.status, 'Choose at least one format.'); return; }
    if (raster && !scales.length) { label(this.status, 'Choose at least one scale.'); return; }
    if (new Set(scales.map(s => safeName(s.suffix))).size !== scales.length) { label(this.status, 'Each scale needs a different suffix.'); return; }
    this.go.disabled = true;
    label(this.status, 'Exporting...');
    try {
      const options: ExportOptions = {
        base: this.name.value, selectionOnly: this.scope.selection.checked, formats, scales,
        quality: Number(this.quality.value) || 90, background: this.transparent.checked ? null : this.bg.value, jpgBackground: this.jpgBg.value
      };
      const files = this.scope.all.checked ? await exportArtboards(host, pageArtboards(host), options) : await exportScreens(host, this.svg, options);
      label(this.status, 'Exported {0} files.', [files.length]);
      host.notify(t('Exported {0} files.', [files.length]));
    } catch (error) {
      if (error instanceof Error) this.status.textContent = error.message;
      else label(this.status, 'Export failed.');
    } finally { this.go.disabled = false; }
  }

  open(host: Host, svg: string): void {
    const root = this.root ?? (this.root = this.build());
    this.host = host;
    this.svg = svg;
    const site = host.site();
    const hasSelection = !!svg && chosenIds(host, svg).length > 0;
    const count = pageArtboards(host).length;
    label(this.allLabel, 'All artboards on this page ({0})', [count]);
    this.scope.all.disabled = count === 0;
    this.scope.whole.disabled = !svg;
    this.scope.selection.disabled = !hasSelection;
    this.scope.selection.checked = hasSelection;
    this.scope.whole.checked = !hasSelection && !!svg;
    this.scope.all.checked = !svg;
    if (!svg) { this.named = ''; this.name.value = ''; }
    else if (this.named !== svg) { this.named = svg; this.name.value = safeName(site.nodes[svg]?.name ?? '') || 'artwork'; }
    if (this.formats.size && !FORMATS.some(f => this.formats.get(f.id)?.checked)) this.formats.get('png')!.checked = true;
    if (!this.scales.some(s => s.on.checked)) this.scales.find(s => s.scale === 1)!.on.checked = true;
    this.status.textContent = '';
    root.hidden = false;
    this.go.focus();
  }

  close(): void {
    this.host = null;
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }
}

const dialog = new ExportDialog();

export function openExportScreens(host: Host): void {
  const svg = host.activeSvg() ?? '';
  if (!svg && !pageArtboards(host).length) { host.notify(t('Select an SVG to export.')); return; }
  dialog.open(host, svg);
}
