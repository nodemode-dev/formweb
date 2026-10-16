import { apiBase } from '../api';
import { element, text } from '../ui/dom';
import type { Command } from '../types';
import type { Editor } from './editor';
import { button, field, numberInput, section, segment } from './panel';
import { freshId } from './store';
import { defaultTrace, MAX_SIDE, type TraceMethod, type TraceOptions, type TraceOutput, type TracePreset, type TraceQuant, type TraceResult } from './trace';

interface Bitmap { data: Uint8ClampedArray; width: number; height: number; natural: [number, number] }
interface Asset { id: string; url: string; name: string; mime: string }

class TraceError extends Error {}

const RASTER = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ASSET_FIT = 480;

function resolve(src: string): string {
  return src.startsWith('/') ? apiBase + src : src;
}

async function loadPixels(url: string): Promise<Bitmap> {
  const crossOrigin = !url.startsWith('data:') && !url.startsWith('blob:') && new URL(url, location.href).origin !== location.origin;
  const image = new Image();
  if (crossOrigin) image.crossOrigin = 'anonymous';
  await new Promise<void>((done, fail) => {
    image.onload = () => done();
    image.onerror = () => fail(new TraceError(crossOrigin
      ? 'This image is from another site, so the browser will not let the editor read its pixels. Upload it as an asset and trace that.'
      : 'The image could not be loaded.'));
    image.src = url;
  });
  const nw = image.naturalWidth, nh = image.naturalHeight;
  if (!nw || !nh) throw new TraceError('The image could not be loaded.');
  const scale = Math.min(1, MAX_SIDE / Math.max(nw, nh));
  const width = Math.max(1, Math.round(nw * scale)), height = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new TraceError('The image could not be loaded.');
  context.drawImage(image, 0, 0, width, height);
  try {
    return { data: context.getImageData(0, 0, width, height).data, width, height, natural: [nw, nh] };
  } catch {
    throw new TraceError('This image is from another site, so the browser will not let the editor read its pixels. Upload it as an asset and trace that.');
  }
}

let active: TraceSection | null = null;

export function runTrace(): void {
  active?.start(true);
}

export class TraceSection {
  readonly root: HTMLDetailsElement;
  private options: TraceOptions = { ...defaultTrace };
  private source = element('select', 'fw-v-input');
  private assets: Asset[] = [];
  private signature = '';
  private preset: ReturnType<typeof segment<TracePreset>>;
  private quant: ReturnType<typeof segment<TraceQuant>>;
  private method: ReturnType<typeof segment<TraceMethod>>;
  private output: ReturnType<typeof segment<TraceOutput>>;
  private threshold: HTMLInputElement;
  private levels: HTMLInputElement;
  private colors: HTMLInputElement;
  private paths: HTMLInputElement;
  private corners: HTMLInputElement;
  private noise: HTMLInputElement;
  private white = element('input', 'fw-v-check');
  private run: HTMLButtonElement;
  private stop: HTMLButtonElement;
  private bar = element('progress', 'fw-v-progress');
  private status = element('p', 'fw-v-note fw-v-trace-status');
  private worker: Worker | null = null;
  private busy = false;

  constructor(private editor: Editor) {
    active = this;
    const sec = section('Image Trace', false);
    this.root = sec.root;
    const o = this.options;
    this.source.title = 'Source image';
    this.source.setAttribute('aria-label', 'Source image');
    this.source.addEventListener('focus', () => { void this.loadAssets(); });
    this.root.addEventListener('toggle', () => { if (this.root.open) void this.loadAssets(); });
    this.preset = segment<TracePreset>([{ id: 'bw', label: 'Black and White' }, { id: 'gray', label: 'Grayscale' }, { id: 'color', label: 'Color' }], id => { o.preset = id; this.sync(); });
    this.quant = segment<TraceQuant>([{ id: 'median', label: 'Median cut' }, { id: 'kmeans', label: 'K-means' }], id => { o.quant = id; this.sync(); });
    this.method = segment<TraceMethod>([{ id: 'abutting', label: 'Abutting' }, { id: 'overlapping', label: 'Overlapping' }], id => { o.method = id; this.sync(); });
    this.output = segment<TraceOutput>([{ id: 'color', label: 'Per color' }, { id: 'region', label: 'Per region' }], id => { o.output = id; this.sync(); });
    this.threshold = numberInput(0, 255, 1, n => { o.threshold = n; });
    this.levels = numberInput(2, 16, 1, n => { o.levels = n; });
    this.colors = numberInput(2, 32, 1, n => { o.colors = n; });
    this.paths = numberInput(0, 100, 1, n => { o.paths = n; });
    this.corners = numberInput(0, 100, 1, n => { o.corners = n; });
    this.noise = numberInput(0, 1000, 1, n => { o.noise = n; });
    this.paths.title = 'Higher values follow the pixels more closely';
    this.corners.title = 'Higher values keep more sharp corners';
    this.noise.title = 'Ignore regions smaller than this many pixels';
    this.white.type = 'checkbox';
    this.white.addEventListener('change', () => { o.ignoreWhite = this.white.checked; });
    const whiteRow = element('label', 'fw-v-checkrow');
    whiteRow.append(this.white, element('span', '', 'Ignore White'));
    this.run = button('Trace', 'Trace the image into filled paths placed over it. The original image is kept.', () => this.start(false));
    this.stop = button('Stop', 'Stop', () => this.cancel());
    this.stop.disabled = true;
    this.bar.max = 1;
    this.bar.value = 0;
    const actions = element('div', 'fw-v-grid');
    actions.append(this.run, this.stop);
    const methodField = field('Method', this.method.root, true);
    methodField.title = 'Abutting: regions touch edge to edge. Overlapping: each shape sits on the one beneath, so no gaps show.';
    sec.body.append(field('Source image', this.source, true), field('Preset', this.preset.root, true), field('Threshold', this.threshold), field('Levels', this.levels), field('Colors', this.colors),
      field('Quantize', this.quant.root, true), field('Paths', this.paths), field('Corners', this.corners), field('Noise (px)', this.noise), whiteRow, methodField, field('Output', this.output.root, true),
      actions, this.bar, this.status, element('p', 'fw-v-note', 'Images are scaled down to 1024 px before tracing.'));
    this.sync();
    this.update();
    editor.listeners.add(() => this.update());
  }

  private sync(): void {
    const o = this.options;
    this.preset.set(o.preset);
    this.quant.set(o.quant);
    this.method.set(o.method);
    this.output.set(o.output);
    this.threshold.disabled = o.preset !== 'bw';
    this.levels.disabled = o.preset !== 'gray';
    this.colors.disabled = o.preset !== 'color';
    for (const b of Array.from(this.quant.root.querySelectorAll('button'))) b.disabled = o.preset !== 'color';
    this.threshold.value = String(o.threshold);
    this.levels.value = String(o.levels);
    this.colors.value = String(o.colors);
    this.paths.value = String(o.paths);
    this.corners.value = String(o.corners);
    this.noise.value = String(o.noise);
    this.white.checked = o.ignoreWhite;
  }

  private async loadAssets(): Promise<void> {
    try {
      const response = await fetch(apiBase + '/api/assets', { credentials: 'same-origin' });
      if (!response.ok) return;
      const body = await response.json() as { assets?: { id: string; url: string; name?: string; mime: string }[] };
      this.assets = (body.assets ?? []).filter(a => RASTER.has(a.mime)).map(a => ({ id: a.id, url: a.url, name: a.name || a.id, mime: a.mime }));
      this.update();
    } catch {
      this.assets = [];
    }
  }

  private images(): { id: string; label: string }[] {
    const site = this.editor.site();
    return Object.values(site.nodes).filter(n => n.tag === 'img' && n.attrs.src).map(n => ({ id: n.id, label: n.name || n.attrs.alt || n.id }));
  }

  update(): void {
    let pageImages: { id: string; label: string }[] = [];
    try { pageImages = this.images(); } catch { pageImages = []; }
    const signature = JSON.stringify([pageImages, this.assets.map(a => a.id + a.name)]);
    if (signature !== this.signature) {
      this.signature = signature;
      const keep = this.source.value;
      if (!this.source.firstElementChild) {
        const first = element('option', '', 'Choose an image');
        first.value = '';
        this.source.append(first);
      }
      this.group('Page images', pageImages.map(item => ['node:' + item.id, item.label]));
      this.group('Uploaded images', this.assets.map(item => ['asset:' + item.url, item.name]));
      this.source.value = Array.from(this.source.options).some(opt => opt.value === keep) ? keep : '';
    }
    this.run.disabled = this.busy;
    this.stop.disabled = !this.busy;
  }

  private group(label: string, items: string[][]): void {
    const old = Array.from(this.source.querySelectorAll('optgroup')).find(node => node.label === label);
    const sig = JSON.stringify(items);
    if (old && old.dataset.sig === sig) return;
    if (!items.length) { old?.remove(); return; }
    const group = element('optgroup');
    group.label = label;
    group.dataset.sig = sig;
    for (const [value, name] of items) { const opt = element('option', '', name); opt.value = value; group.append(opt); }
    if (old) old.replaceWith(group); else this.source.insertBefore(group, label === 'Page images' ? this.source.querySelector('optgroup') : null);
  }

  private selectedImage(): string {
    try {
      const id = this.editor.ctx.getSelected();
      const node = this.editor.site().nodes[id];
      return node?.tag === 'img' && node.attrs.src ? 'node:' + id : '';
    } catch { return ''; }
  }

  private say(message: string): void {
    text(this.status, message);
  }

  cancel(): void {
    if (!this.busy) return;
    this.worker?.terminate();
    this.worker = null;
    this.finish('Tracing stopped.');
  }

  private finish(message: string): void {
    this.busy = false;
    this.bar.value = 0;
    this.say('');
    this.update();
    if (message) this.editor.notify(message);
  }

  start(open: boolean): void {
    if (open) this.root.open = true;
    if (this.busy) return;
    let value = this.source.value;
    if (!value) {
      value = this.selectedImage();
      if (value && Array.from(this.source.options).some(opt => opt.value === value)) this.source.value = value;
    }
    if (!value) { this.editor.notify('Choose an image to trace first.'); return; }
    this.busy = true;
    this.say('Tracing...');
    this.update();
    void this.trace(value);
  }

  private async trace(value: string): Promise<void> {
    try {
      const isNode = value.startsWith('node:');
      const ref = value.slice(value.indexOf(':') + 1);
      let url = ref;
      if (isNode) {
        const node = this.editor.site().nodes[ref];
        if (!node || !node.attrs.src) throw new TraceError('Choose an image to trace first.');
        url = node.attrs.src;
      }
      const bitmap = await loadPixels(resolve(url));
      if (!this.busy) return;
      const result = await this.compute(bitmap);
      if (!result) return;
      if (!result.shapes.length) { this.finish('The trace found no shapes to draw.'); return; }
      await this.place(result, isNode ? ref : '', bitmap);
      this.finish(result.truncated ? 'Image traced. Some small shapes were left out to stay under the path limit.' : 'Image traced.');
    } catch (error) {
      this.finish(error instanceof Error && error.message ? error.message : 'Tracing failed.');
    }
  }

  private compute(bitmap: Bitmap): Promise<TraceResult | null> {
    return new Promise((done, fail) => {
      const worker = new Worker(new URL('./traceworker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<{ type: string; value?: number; result?: TraceResult; message?: string }>) => {
        const data = event.data;
        if (data.type === 'progress') { this.bar.value = data.value ?? 0; return; }
        worker.terminate();
        this.worker = null;
        if (data.type === 'done' && data.result) done(data.result);
        else fail(new TraceError(data.message || 'Tracing failed.'));
      };
      worker.onerror = () => { worker.terminate(); this.worker = null; fail(new TraceError('Tracing failed.')); };
      const pixels = bitmap.data.buffer.slice(0) as ArrayBuffer;
      worker.postMessage({ pixels, width: bitmap.width, height: bitmap.height, options: { ...this.options } }, [pixels]);
    });
  }

  private async place(result: TraceResult, imageId: string, bitmap: Bitmap): Promise<void> {
    const editor = this.editor;
    const site = editor.site();
    const taken = new Set<string>();
    const cmds: Command[] = [];
    let parent = editor.ctx.pageRoot();
    let left = 24, top = 24;
    const fit = Math.min(1, ASSET_FIT / Math.max(bitmap.natural[0], bitmap.natural[1]));
    let width = Math.round(bitmap.natural[0] * fit), height = Math.round(bitmap.natural[1] * fit);
    const img = imageId ? editor.host().element(imageId) as HTMLElement | null : null;
    if (img && img.parentElement) {
      parent = editor.host().parentOf(imageId) ?? parent;
      const holder = img.parentElement;
      const a = img.getBoundingClientRect(), b = holder.getBoundingClientRect();
      left = a.left - b.left - holder.clientLeft + holder.scrollLeft;
      top = a.top - b.top - holder.clientTop + holder.scrollTop;
      width = a.width || width;
      height = a.height || height;
      if (img.ownerDocument.defaultView?.getComputedStyle(holder).position === 'static') cmds.push({ command: 'node.update', params: { id: parent, patch: { styles: { position: 'relative' } } } });
    } else {
      const holder = editor.host().element(parent);
      if (holder && holder.ownerDocument.defaultView?.getComputedStyle(holder).position === 'static') cmds.push({ command: 'node.update', params: { id: parent, patch: { styles: { position: 'relative' } } } });
    }
    const round = (v: number): number => Math.round(v * 100) / 100;
    const svgId = freshId(site, taken, 'trace');
    cmds.push({
      command: 'node.add',
      params: {
        parent,
        node: {
          id: svgId, tag: 'svg', name: 'Image Trace',
          attrs: { viewBox: `0 0 ${result.width} ${result.height}`, width: String(round(width)), height: String(round(height)), preserveAspectRatio: 'none' },
          styles: { position: 'absolute', left: `${round(left)}px`, top: `${round(top)}px`, overflow: 'hidden' }
        }
      }
    });
    const ids: string[] = [];
    result.shapes.forEach((shape, index) => {
      const id = freshId(site, taken, 'path');
      ids.push(id);
      cmds.push({ command: 'node.add', params: { parent: svgId, node: { id, tag: 'path', name: `${this.options.output === 'color' ? 'Color' : 'Region'} ${index + 1}`, attrs: { d: shape.d, fill: shape.fill, 'fill-rule': 'evenodd' } } } });
    });
    await editor.commit(cmds, [ids[ids.length - 1]]);
  }
}
