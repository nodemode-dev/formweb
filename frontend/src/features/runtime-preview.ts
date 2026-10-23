import { apiBase, request } from '../api';
import type { EditorState } from '../types';
import { element, text } from '../ui/dom';

interface PreviewTarget { revision: number; page: string; locale: string; width: number }
export class RuntimePreview {
  private outer = element('div', 'frame-outer runtime-preview');
  private label = element('div', 'frame-label');
  private shell = element('div', 'frame-shell');
  private frames: HTMLIFrameElement[] = [];
  private visible = 0;
  private active = false;
  private loading = false;
  private desired?: PreviewTarget;
  private shownKey = '';
  private height = 860;

  constructor(private stage: HTMLElement, private design: HTMLElement, private notify: (message: string, error?: boolean) => void) {
    this.outer.hidden = true;
    this.label.append(element('span', '', 'Live responsive preview'), element('span'));
    for (let index = 0; index < 2; index++) {
      const frame = element('iframe', 'canvas-frame');
      frame.title = `Compiled website preview ${index + 1}`;
      frame.hidden = true;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
      this.frames.push(frame);
      this.shell.append(frame);
    }
    this.outer.append(this.label, this.shell);
    this.stage.append(this.outer);
    new ResizeObserver(() => this.fit()).observe(stage);
  }
  update(active: boolean, state: EditorState, page: string, locale: string, width: number): void {
    this.active = active;
    this.desired = { revision: state.revision, page, locale, width };
    this.fit();
    if (!active) {
      this.outer.hidden = true;
      this.design.hidden = false;
      return;
    }
    if (this.key(this.desired) === this.shownKey) {
      this.outer.hidden = false;
      this.design.hidden = true;
    } else if (!this.loading) void this.compile();
  }
  refresh(): void {
    this.shownKey = '';
    if (this.active && !this.loading) void this.compile();
  }
  private key(target: PreviewTarget): string { return `${target.revision}:${target.page}:${target.locale}`; }
  private async compile(): Promise<void> {
    if (!this.desired || !this.active || this.loading) return;
    const target = { ...this.desired };
    const key = this.key(target);
    this.loading = true;
    let retry = false;
    try {
      const result = await request<{ url: string; revision: number; token: string }>('/api/preview', { page: target.page, locale: target.locale });
      const index = 1 - this.visible;
      const frame = this.frames[index];
      frame.hidden = true;
      const url = result.url.startsWith('/') ? apiBase + result.url : result.url;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { frame.onload = null; reject(new Error('Compiled preview did not load. The previous view is retained.')); }, 25000);
        frame.onload = () => { clearTimeout(timeout); frame.onload = null; resolve(); };
        frame.src = url;
      });
      if (!this.active || !this.desired || this.key(this.desired) !== key) { retry = this.active; return; }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      this.frames[this.visible].hidden = true;
      frame.hidden = false;
      this.visible = index;
      this.shownKey = key;
      this.outer.hidden = false;
      this.design.hidden = true;
      text(this.label.children[0] as HTMLElement, `Live responsive preview · ${target.locale.toUpperCase()} · rev ${result.revision}`);
      this.fit();
      this.notify('Runtime preview uses the compiled site, including forms, interactions and integrations.');
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.loading = false;
      if (retry && this.active) void this.compile();
    }
  }
  private fit(): void {
    if (!this.desired) return;
    const width = this.desired.width;
    const scale = Math.min(1, Math.max(240, this.stage.clientWidth - 64) / width);
    this.height = Math.max(760, Math.floor((this.stage.clientHeight - 64) / scale));
    this.outer.style.width = `${width * scale}px`;
    this.outer.style.height = `${this.height * scale + 24}px`;
    this.shell.style.width = `${width}px`;
    this.shell.style.height = `${this.height}px`;
    this.shell.style.transform = `scale(${scale})`;
    for (const frame of this.frames) {
      frame.style.width = `${width}px`;
      frame.style.height = `${this.height}px`;
    }
    text(this.label.children[1] as HTMLElement, `${Math.round(scale * 100)}%`);
  }
}
