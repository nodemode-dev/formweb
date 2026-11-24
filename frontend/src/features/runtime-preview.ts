import type { EditorState } from '../types';
import { element, text } from '../ui/dom';
import { CompiledFrames } from './compiled-frames';

interface PreviewTarget { revision: number; page: string; locale: string; width: number }
export class RuntimePreview {
  private outer = element('div', 'frame-outer runtime-preview');
  private label = element('div', 'frame-label');
  private shell = element('div', 'frame-shell');
  private buffer: CompiledFrames;
  private desired?: PreviewTarget;
  private height = 860;

  constructor(private stage: HTMLElement, private design: HTMLElement, private notify: (message: string, error?: boolean) => void) {
    this.outer.hidden = true;
    this.label.append(element('span', '', 'Live responsive preview'), element('span'));
    this.buffer = new CompiledFrames(this.shell, 'canvas-frame', notify);
    this.buffer.onShown = (result, target) => {
      this.outer.hidden = false;
      this.design.hidden = true;
      text(this.label.children[0] as HTMLElement, `Live responsive preview · ${target.locale.toUpperCase()} · rev ${result.revision}`);
      this.fit();
      this.notify('Runtime preview uses the compiled site, including forms, interactions and integrations.');
    };
    this.outer.append(this.label, this.shell);
    this.stage.append(this.outer);
    new ResizeObserver(() => this.fit()).observe(stage);
  }
  update(active: boolean, state: EditorState, page: string, locale: string, width: number): void {
    this.desired = { revision: state.revision, page, locale, width };
    this.fit();
    const shown = this.buffer.want(active, this.desired);
    if (!active) {
      this.outer.hidden = true;
      this.design.hidden = false;
      return;
    }
    if (shown) {
      this.outer.hidden = false;
      this.design.hidden = true;
    }
  }
  refresh(): void { this.buffer.refresh(); }
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
    for (const frame of this.buffer.frames) {
      frame.style.width = `${width}px`;
      frame.style.height = `${this.height}px`;
    }
    text(this.label.children[1] as HTMLElement, `${Math.round(scale * 100)}%`);
  }
}
