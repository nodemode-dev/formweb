import { apiBase, request } from '../api';
import { element } from '../ui/dom';

export interface CompileTarget { revision: number; page: string; locale: string }
export interface Compiled { url: string; revision: number; token: string }

export class CompiledFrames {
  readonly frames: HTMLIFrameElement[] = [];
  shown?: Compiled;
  onShown: (result: Compiled, target: CompileTarget) => void = () => undefined;
  onBusy: (busy: boolean) => void = () => undefined;
  onNavigated: () => void = () => undefined;
  private visible = 0;
  private active = false;
  private loading = false;
  private desired?: CompileTarget;
  private shownKey = '';
  private waiting: (() => void)[] = [];

  constructor(shell: HTMLElement, className: string, private notify: (message: string, error?: boolean) => void) {
    for (let index = 0; index < 2; index++) {
      const frame = element('iframe', className);
      frame.title = `Compiled website preview ${index + 1}`;
      frame.hidden = true;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
      frame.addEventListener('load', () => {
        const done = this.waiting[index];
        if (done) { delete this.waiting[index]; done(); }
        else if (index === this.visible && !frame.hidden && this.shownKey) this.onNavigated();
      });
      this.frames.push(frame);
      shell.append(frame);
    }
  }
  get frame(): HTMLIFrameElement { return this.frames[this.visible]; }
  get busy(): boolean { return this.loading; }
  want(active: boolean, target: CompileTarget): boolean {
    this.active = active;
    this.desired = { ...target };
    if (!active) return false;
    if (this.key(target) === this.shownKey) return true;
    if (!this.loading) void this.compile();
    return false;
  }
  refresh(): void {
    this.shownKey = '';
    if (this.active && !this.loading) void this.compile();
  }
  forget(): void { this.shownKey = ''; }
  blank(): void {
    this.shownKey = '';
    this.frames[this.visible].hidden = true;
  }
  private key(target: CompileTarget): string { return `${target.revision}:${target.page}:${target.locale}`; }
  private async compile(): Promise<void> {
    if (!this.desired || !this.active || this.loading) return;
    const target = { ...this.desired };
    const key = this.key(target);
    this.loading = true;
    this.onBusy(true);
    let retry = false;
    try {
      const result = await request<Compiled>('/api/preview', { page: target.page, locale: target.locale });
      const index = 1 - this.visible;
      const frame = this.frames[index];
      frame.hidden = true;
      const url = result.url.startsWith('/') ? apiBase + result.url : result.url;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { delete this.waiting[index]; reject(new Error('Compiled preview did not load. The previous view is retained.')); }, 25000);
        this.waiting[index] = () => { clearTimeout(timeout); resolve(); };
        frame.src = url;
      });
      if (!this.active || !this.desired || this.key(this.desired) !== key) { retry = this.active; return; }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      this.frames[this.visible].hidden = true;
      frame.hidden = false;
      this.visible = index;
      this.shownKey = key;
      this.shown = { ...result, url };
      this.onShown(this.shown, target);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.loading = false;
      if (retry && this.active) void this.compile();
      else this.onBusy(false);
    }
  }
}
