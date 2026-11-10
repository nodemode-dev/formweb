import { element, text } from '../ui/dom';
import '../styles/background-remover.css';

/**
 * Remove background (FW-072). formvis finds the subject and returns a soft mask; this dialog shows the cut-out over
 * a checkerboard with the removed part faintly visible, and lets the person paint the mask with an Erase or a Restore
 * brush before applying. Apply sends the edited mask; the service composites it with the original picture, saves a
 * new transparent PNG and points the image at it in one undo step. Restore original undoes that at any later time.
 *
 * The canvases never re-mount: brush strokes change mask pixels and one requestAnimationFrame redraws the preview.
 */
export type BackgroundStatus = { available: boolean; engines: { ml: boolean; lite: boolean }; default?: string; note: string };
type Target = { id: string; name: string; src: string; original: string };
type Hooks = {
  status: () => Promise<BackgroundStatus>;
  mask: (node: string, method: string) => Promise<{ blob: Blob; method: string }>;
  image: (url: string) => Promise<Blob>;
  apply: (node: string, mask: string, feather: number) => Promise<{ message: string }>;
  restore: (node: string) => Promise<{ message: string }>;
  close: () => void;
  notify: (message: string, error?: boolean) => void;
};

const MAX_SIDE = 2048;  // mask editing resolution; the service scales the mask back to the picture's size

export class BackgroundRemover {
  readonly element = element('div', 'fw-bg');
  private note = element('p', 'micro fw-bg-note');
  private method = element('select');
  private find: HTMLButtonElement;
  private modes = element('div', 'fw-seg fw-bg-modes');
  private size = element('input');
  private feather = element('input');
  private sizeOut = element('output', 'fw-bg-out');
  private featherOut = element('output', 'fw-bg-out');
  private stage = element('div', 'fw-bg-stage');
  private view = element('canvas', 'fw-bg-view');
  private busy = element('p', 'fw-bg-busy');
  private applyButton: HTMLButtonElement;
  private restoreButton: HTMLButtonElement;
  private original = document.createElement('canvas');  // the picture at editing resolution
  private matte = document.createElement('canvas');     // alpha = keep
  private cut = document.createElement('canvas');       // reused each frame: the original clipped by the matte
  private target: Target | null = null;
  private mode: 'erase' | 'restore' = 'erase';
  private painting = false;
  private last: { x: number; y: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private frame = 0;
  private hasMask = false;
  private token = 0;

  constructor(private hooks: Hooks) {
    this.method.dataset.field = 'background.method';
    this.method.setAttribute('aria-label', 'Engine');
    for (const [value, label] of [['auto', 'Best available'], ['ml', 'Detailed (U2-Net)'], ['lite', 'Fast (GrabCut)']]) {
      const option = element('option', '', label);
      option.value = value;
      this.method.append(option);
    }
    this.find = this.button('Find subject', 'background.find', () => this.detect(), 'primary');
    for (const [value, label] of [['erase', 'Erase'], ['restore', 'Restore']] as const) {
      const segment = this.button(label, `background.${value}`, () => this.setMode(value), 'fw-seg-btn');
      segment.dataset.mode = value;
      segment.setAttribute('aria-pressed', String(value === this.mode));
      segment.classList.toggle('is-on', value === this.mode);
      this.modes.append(segment);
    }
    this.size.type = 'range'; this.size.min = '4'; this.size.max = '160'; this.size.value = '36';
    this.size.dataset.field = 'background.brush';
    this.size.setAttribute('aria-label', 'Brush size');
    this.size.addEventListener('input', () => { text(this.sizeOut, `${this.size.value} px`); this.draw(); });
    this.feather.type = 'range'; this.feather.min = '0'; this.feather.max = '20'; this.feather.value = '1';
    this.feather.dataset.field = 'background.feather';
    this.feather.setAttribute('aria-label', 'Soft edge');
    this.feather.addEventListener('input', () => text(this.featherOut, `${this.feather.value} px`));
    text(this.sizeOut, '36 px');
    text(this.featherOut, '1 px');
    const tools = element('div', 'fw-bg-tools');
    const brush = element('label', 'fw-bg-range');
    brush.append(element('span', '', 'Brush'), this.size, this.sizeOut);
    const soft = element('label', 'fw-bg-range');
    soft.append(element('span', '', 'Soft edge'), this.feather, this.featherOut);
    tools.append(this.method, this.find, this.modes, brush, soft);
    this.view.setAttribute('aria-label', 'Cut-out preview. Paint to erase or restore parts of the picture.');
    this.view.tabIndex = 0;
    this.view.dataset.loaded = 'false';
    this.stage.append(this.view, this.busy);
    this.applyButton = this.button('Apply cut-out', 'background.apply', () => this.apply(), 'primary');
    this.restoreButton = this.button('Restore original', 'background.restore-original', () => this.restoreOriginal());
    const actions = element('div', 'fw-bg-actions');
    actions.append(element('p', 'micro', 'Erase removes what formvis kept; Restore brings back what it removed (shown faintly). The original picture is kept, so Undo or Restore original returns it.'), this.restoreButton, this.applyButton);
    this.element.append(this.note, tools, this.stage, actions);
    this.view.addEventListener('pointerdown', event => this.start(event));
    this.view.addEventListener('pointermove', event => this.move(event));
    this.view.addEventListener('pointerup', () => this.end());
    this.view.addEventListener('pointercancel', () => this.end());
    this.view.addEventListener('pointerleave', () => { this.pointer = null; this.end(); this.draw(); });
    this.view.addEventListener('keydown', event => {
      if (event.key === 'e') this.setMode('erase');
      if (event.key === 'r') this.setMode('restore');
      if (event.key === '[' || event.key === ']') { this.size.value = String(Number(this.size.value) + (event.key === ']' ? 8 : -8)); this.size.dispatchEvent(new Event('input')); }
    });
    this.setReady(false);
  }

  /** Opens on an image element: loads the original picture, then asks formvis for the subject when it is available. */
  async open(target: Target): Promise<void> {
    const token = ++this.token;
    this.target = target;
    this.hasMask = false;
    this.restoreButton.hidden = !target.original;
    this.view.dataset.loaded = 'false';
    this.setReady(false);
    this.setBusy('Loading the picture...');
    const [status, blob] = await Promise.all([this.hooks.status(), this.hooks.image(target.original || target.src)]);
    if (token !== this.token) return;
    text(this.note, status.note);
    this.note.dataset.state = status.available ? 'ok' : 'off';
    for (const option of Array.from(this.method.options)) option.disabled = option.value !== 'auto' && !status.engines[option.value as 'ml' | 'lite'];
    this.find.disabled = !status.available;
    const bitmap = await createImageBitmap(blob);
    if (token !== this.token) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    for (const canvas of [this.original, this.matte, this.cut, this.view]) { canvas.width = width; canvas.height = height; }
    this.original.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const matte = this.matte.getContext('2d')!;
    matte.fillStyle = '#fff';
    matte.fillRect(0, 0, width, height);
    this.view.style.aspectRatio = `${width} / ${height}`;
    this.view.dataset.loaded = 'true';
    this.draw();
    if (status.available) await this.detect();
    else this.setBusy('');
  }

  private async detect(): Promise<void> {
    if (!this.target) return;
    const token = this.token;
    this.setBusy('formvis is finding the subject...');
    this.find.disabled = true;
    try {
      const { blob, method } = await this.hooks.mask(this.target.id, this.method.value);
      if (token !== this.token) return;
      const bitmap = await createImageBitmap(blob);
      const { width, height } = this.matte;
      const scratch = document.createElement('canvas');
      scratch.width = width; scratch.height = height;
      const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const pixels = sctx.getImageData(0, 0, width, height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) { data[i + 3] = data[i]; data[i] = data[i + 1] = data[i + 2] = 255; }
      this.matte.getContext('2d')!.putImageData(pixels, 0, 0);
      this.hasMask = true;
      this.setReady(true);
      this.hooks.notify(`Subject found with ${method === 'ml' ? 'U2-Net' : 'GrabCut'}. Paint to erase or restore, then Apply cut-out.`);
    } finally {
      if (token === this.token) { this.setBusy(''); this.find.disabled = false; this.draw(); }
    }
  }

  private setMode(mode: 'erase' | 'restore'): void {
    this.mode = mode;
    for (const segment of Array.from(this.modes.children) as HTMLElement[]) {
      const on = segment.dataset.mode === mode;
      segment.classList.toggle('is-on', on);
      segment.setAttribute('aria-pressed', String(on));
    }
    this.draw();
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.view.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (this.view.width / rect.width), y: (event.clientY - rect.top) * (this.view.height / rect.height) };
  }

  private start(event: PointerEvent): void {
    if (!this.hasMask) return;
    this.view.setPointerCapture(event.pointerId);
    this.painting = true;
    this.last = this.point(event);
    this.stroke(this.last, this.last);
  }

  private move(event: PointerEvent): void {
    this.pointer = this.point(event);
    if (this.painting && this.last) { this.stroke(this.last, this.pointer); this.last = this.pointer; }
    this.draw();
  }

  private end(): void { this.painting = false; this.last = null; }

  private stroke(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const ctx = this.matte.getContext('2d')!;
    const rect = this.view.getBoundingClientRect();
    ctx.save();
    ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Number(this.size.value) * (this.view.width / Math.max(1, rect.width));  // brush size is in screen pixels
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    ctx.restore();
  }

  private draw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const { width, height } = this.view;
      const ctx = this.view.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = this.hasMask ? 0.15 : 1;  // the removed part stays faintly visible so it can be restored
      ctx.drawImage(this.original, 0, 0);
      ctx.globalAlpha = 1;
      if (this.hasMask) {
        const cctx = this.cut.getContext('2d')!;
        cctx.globalCompositeOperation = 'copy';
        cctx.drawImage(this.original, 0, 0);
        cctx.globalCompositeOperation = 'destination-in';
        cctx.drawImage(this.matte, 0, 0);
        ctx.drawImage(this.cut, 0, 0);
      }
      if (this.pointer && this.hasMask) {
        const rect = this.view.getBoundingClientRect();
        const radius = Number(this.size.value) * (width / Math.max(1, rect.width)) / 2;
        ctx.beginPath();
        ctx.arc(this.pointer.x, this.pointer.y, radius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, width / Math.max(1, rect.width));
        ctx.strokeStyle = this.mode === 'erase' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)';
        ctx.stroke();
      }
    });
  }

  /** The matte as a greyscale PNG (white keeps), which is what the service and formvis exchange. */
  private maskPng(): string {
    const { width, height } = this.matte;
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(this.matte, 0, 0);
    const pixels = octx.getImageData(0, 0, width, height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) { const a = data[i + 3]; data[i] = data[i + 1] = data[i + 2] = a; data[i + 3] = 255; }
    octx.putImageData(pixels, 0, 0);
    return out.toDataURL('image/png');
  }

  private async apply(): Promise<void> {
    if (!this.target || !this.hasMask) throw new Error('Find the subject first.');
    this.setBusy('Saving the cut-out...');
    try {
      const result = await this.hooks.apply(this.target.id, this.maskPng(), Number(this.feather.value));
      this.hooks.notify(result.message);
      this.hooks.close();
    } finally { this.setBusy(''); }
  }

  private async restoreOriginal(): Promise<void> {
    if (!this.target) return;
    const result = await this.hooks.restore(this.target.id);
    this.hooks.notify(result.message);
    this.hooks.close();
  }

  private setReady(ready: boolean): void {
    this.applyButton.disabled = !ready;
    for (const control of [this.size, this.feather, ...Array.from(this.modes.children)] as (HTMLInputElement | HTMLButtonElement)[]) control.disabled = !ready;
    this.view.dataset.ready = String(ready);
  }

  private setBusy(message: string): void {
    text(this.busy, message);
    this.busy.hidden = !message;
  }

  private button(label: string, command: string, action: () => unknown, className = 'quiet'): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    node.dataset.command = command;
    node.addEventListener('click', () => { Promise.resolve(action()).catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    return node;
  }
}
