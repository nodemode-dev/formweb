import { commands } from '../commands/registry';
import { label, labelAttr } from '../i18n';
import type { EditorState } from '../types';
import { element, keyed, options, text, value } from '../ui/dom';
import { icon, type Icon } from '../ui/icons';
import { CompiledFrames, type CompileTarget } from './compiled-frames';
import '../styles/full-preview.css';

export interface FullPreviewHost {
  state: () => EditorState;
  page: () => string;
  locale: () => string;
  width: (breakpoint: string) => number | undefined;
  back: HTMLElement;
  notify: (message: string, error?: boolean) => void;
}

type Kind = 'phone' | 'tablet' | 'desktop' | 'full';
interface Device { id: string; name: string; width: number; kind: Kind }

const FULL = ':full';
const LINKED = '';
const BASE_WIDTH = 1280;
const ROOM = 48;

export class FullPreview {
  private readonly root = element('section', 'fw-fp');
  private readonly bar = element('header', 'fw-fp-bar');
  private readonly pages = element('select', 'fw-fp-select');
  private readonly devices = element('div', 'fw-seg fw-fp-devices');
  private readonly rotate = element('button', 'fw-fp-btn');
  private readonly bezel = element('button', 'fw-fp-btn');
  private readonly locales = element('select', 'fw-fp-select fw-fp-locale');
  private readonly note = element('span', 'fw-fp-state');
  private readonly refresh = element('button', 'fw-fp-btn');
  private readonly open = element('a', 'fw-fp-btn');
  private readonly shut = element('button', 'fw-fp-btn fw-fp-close');
  private readonly stage = element('div', 'fw-fp-stage');
  private readonly device = element('div', 'fw-fp-device');
  private readonly empty = element('span', 'fw-fp-empty');
  private readonly buffer: CompiledFrames;
  private target: CompileTarget = { revision: -1, page: '', locale: '' };
  private chosen = FULL;
  private turned = false;
  private framed = true;
  private linked = false;
  private list: Device[] = [];
  private held: HTMLElement[] = [];
  private previous: HTMLElement | null = null;

  constructor(overlay: HTMLElement, private readonly host: FullPreviewHost) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    labelAttr(this.root, 'aria-label', 'Preview as published');
    if (document.documentElement.classList.contains('has-overlay-titlebar')) this.bar.setAttribute('data-tauri-drag-region', '');
    labelAttr(this.pages, 'aria-label', 'Page');
    this.pages.dataset.noI18n = '';
    this.pages.setAttribute('translate', 'no');
    this.pages.addEventListener('change', () => { if (this.pages.value !== LINKED) this.show({ ...this.target, page: this.pages.value }); });
    labelAttr(this.devices, 'aria-label', 'Preview width');
    this.devices.setAttribute('role', 'group');
    this.tool(this.rotate, 'rotate', 'Rotate the device', () => { this.turned = !this.turned; this.fit(); });
    this.tool(this.bezel, 'mobile', 'Device frame', () => { this.framed = !this.framed; this.fit(); });
    labelAttr(this.locales, 'aria-label', 'Language');
    this.locales.addEventListener('change', () => this.show({ ...this.target, locale: this.locales.value }));
    this.note.setAttribute('aria-live', 'polite');
    this.tool(this.refresh, 'redo', 'Refresh', () => this.show({ ...this.target, revision: this.host.state().revision }, true));
    this.open.append(icon('external'), element('span'));
    label(this.open.lastChild as HTMLElement, 'Open in browser');
    labelAttr(this.open, 'title', 'Open in browser');
    labelAttr(this.shut, 'title', 'Close');
    this.open.target = '_blank';
    this.open.rel = 'noopener noreferrer';
    this.open.setAttribute('aria-disabled', 'true');
    this.shut.type = 'button';
    this.shut.append(icon('close'), element('span'));
    label(this.shut.lastChild as HTMLElement, 'Close');
    this.shut.addEventListener('click', () => this.close());
    const gap = element('span', 'fw-fp-gap');
    this.bar.append(this.pages, this.devices, this.rotate, this.bezel, this.locales, gap, this.note, this.refresh, this.open, this.shut);
    label(this.empty, 'Compiling the site...');
    this.buffer = new CompiledFrames(this.device, 'fw-fp-frame', (message, error) => {
      this.state(message, !!error);
      if (!this.empty.hidden) label(this.empty, message);
      this.host.notify(message, error);
    });
    this.buffer.onBusy = busy => {
      this.root.classList.toggle('is-busy', busy);
      if (busy) this.state('Compiling...');
    };
    this.buffer.onShown = (result, target) => {
      this.target = { ...target, revision: result.revision };
      this.linked = false;
      this.empty.hidden = true;
      this.open.href = result.url;
      this.open.removeAttribute('aria-disabled');
      this.state('Revision {0}', false, [String(result.revision)]);
      this.sync();
    };
    this.buffer.onNavigated = () => {
      this.linked = true;
      this.buffer.forget();
      this.sync();
    };
    this.stage.append(this.empty, this.device);
    const lead = this.trap(() => this.shut);
    const tail = this.trap(() => this.pages);
    this.root.append(lead, this.bar, this.stage, tail);
    overlay.append(this.root);
    new ResizeObserver(() => { if (!this.root.hidden) this.fit(); }).observe(this.stage);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  follow(revision: number): void {
    if (this.root.hidden || revision === this.target.revision) return;
    if (this.linked) this.state('Revision {0}. The site has changed since: press Refresh.', false, [String(this.target.revision)]);
    else {
      const site = this.host.state().site;
      const page = site.pages.some(item => item.id === this.target.page) ? this.target.page : this.host.page();
      const locale = site.locales[this.target.locale] ? this.target.locale : site.defaultLocale;
      this.show({ revision, page, locale });
    }
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.show();
  }

  close(): void {
    if (this.root.hidden) return;
    window.removeEventListener('keydown', this.onKey, true);
    this.buffer.want(false, this.target);
    this.root.hidden = true;
    for (const node of this.held) node.inert = false;
    this.held = [];
    const back = this.host.back.isConnected && this.host.back.offsetParent ? this.host.back : this.previous;
    this.previous = null;
    back?.focus({ preventScroll: true });
  }

  private show(next?: CompileTarget, force = false): void {
    const opening = this.root.hidden;
    if (opening) {
      const site = this.host.state().site;
      next = { revision: this.host.state().revision, page: this.host.page(), locale: this.host.locale() };
      this.list = this.presets(site.breakpoints);
      if (!this.list.some(item => item.id === this.chosen)) this.chosen = FULL;
      options(this.locales, Object.keys(site.locales).map(id => ({ id, name: id.toUpperCase() })));
      this.locales.hidden = Object.keys(site.locales).length < 2;
      this.renderDevices();
      this.hold();
    }
    if (!next) return;
    this.target = { ...next };
    if (force) this.buffer.forget();
    const ready = this.buffer.want(true, this.target);
    if (opening && !ready) {
      this.buffer.blank();
      label(this.empty, 'Compiling the site...');
      this.empty.hidden = false;
      this.open.removeAttribute('href');
      this.open.setAttribute('aria-disabled', 'true');
    }
    this.sync();
    if (opening) {
      this.root.hidden = false;
      window.addEventListener('keydown', this.onKey, true);
      this.fit();
      this.shut.focus({ preventScroll: true });
    }
  }

  private hold(): void {
    const active = document.activeElement;
    this.previous = active instanceof HTMLElement && active !== document.body ? active : null;
    this.held = [];
    const layers = [...Array.from(document.body.children), ...Array.from(this.root.parentElement?.children ?? [])];
    for (const node of layers) {
      if (node === this.root || node === this.root.parentElement || !(node instanceof HTMLElement) || node.inert) continue;
      node.inert = true;
      this.held.push(node);
    }
  }

  private sync(): void {
    const site = this.host.state().site;
    const rows = site.pages.map(page => ({ id: page.id, name: page.name }));
    if (this.linked) rows.push({ id: LINKED, name: 'Page opened from a link' });
    options(this.pages, rows);
    this.pages.value = this.linked ? LINKED : this.target.page;
    value(this.locales, this.target.locale);
  }

  private presets(breakpoints: EditorState['site']['breakpoints']): Device[] {
    const sorted = [...breakpoints].sort((a, b) => b.maxWidth - a.maxWidth);
    const list = sorted.map((item, index) => {
      const floor = (sorted[index + 1]?.maxWidth ?? 239) + 1;
      const ceiling = index === 0 ? 3840 : item.maxWidth;
      const wanted = this.host.width(item.id) ?? (index === 0 ? BASE_WIDTH : item.maxWidth);
      const width = Math.min(ceiling, Math.max(floor, wanted));
      const kind: Kind = width <= 600 ? 'phone' : width <= 1100 ? 'tablet' : 'desktop';
      return { id: item.id, name: item.name, width, kind };
    });
    return [{ id: FULL, name: 'Full width', width: 0, kind: 'full' }, ...list];
  }

  private renderDevices(): void {
    keyed(this.devices, this.list, item => item.id, item => {
      const node = element('button', 'fw-seg-btn');
      node.type = 'button';
      if (item.kind !== 'full') node.dataset.noI18n = '';
      node.addEventListener('click', () => { this.chosen = item.id; this.renderDevices(); this.fit(); });
      return node;
    }, (node, item) => {
      if (item.kind === 'full') label(node, 'Full width');
      else text(node, `${item.name} ${item.width}`);
      node.classList.toggle('is-on', item.id === this.chosen);
      node.setAttribute('aria-pressed', String(item.id === this.chosen));
    });
  }

  private fit(): void {
    const picked = this.list.find(item => item.id === this.chosen) ?? this.list[0];
    const handheld = picked.kind === 'phone' || picked.kind === 'tablet';
    this.rotate.disabled = !handheld;
    this.bezel.disabled = !handheld;
    this.rotate.setAttribute('aria-pressed', String(handheld && this.turned));
    this.bezel.setAttribute('aria-pressed', String(handheld && this.framed));
    this.root.dataset.kind = picked.kind;
    this.root.dataset.turned = String(handheld && this.turned);
    this.device.classList.toggle('has-bezel', handheld && this.framed);
    if (picked.kind === 'full') {
      this.device.style.transform = '';
      this.size('', '');
      return;
    }
    const roomWidth = Math.max(240, this.stage.clientWidth - ROOM);
    const roomHeight = Math.max(240, this.stage.clientHeight - ROOM);
    let width = picked.width;
    let height = Math.round(width * (picked.kind === 'phone' ? 2.165 : 1.44));
    if (handheld && this.turned) [width, height] = [height, width];
    if (!handheld) height = Math.floor(roomHeight / Math.min(1, roomWidth / width));
    this.size(`${width}px`, `${height}px`);
    const scale = Math.min(1, roomWidth / this.device.offsetWidth, roomHeight / this.device.offsetHeight);
    this.device.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  private size(width: string, height: string): void {
    for (const frame of this.buffer.frames) {
      frame.style.width = width;
      frame.style.height = height;
    }
  }

  private state(english: string, error = false, values?: string[]): void {
    label(this.note, english, values);
    this.note.classList.toggle('is-error', error);
  }

  private tool(node: HTMLButtonElement, symbol: Icon, title: string, run: () => void): void {
    node.type = 'button';
    node.classList.add('is-icon');
    node.append(icon(symbol));
    labelAttr(node, 'title', title);
    labelAttr(node, 'aria-label', title);
    node.addEventListener('click', run);
  }

  private trap(target: () => HTMLElement): HTMLElement {
    const edge = element('span', 'fw-fp-trap');
    edge.tabIndex = 0;
    edge.addEventListener('focus', () => target().focus({ preventScroll: true }));
    return edge;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key !== 'Escape' && commands.forEvent(event)?.id !== 'view.preview-full') return;
    event.preventDefault();
    this.close();
  };
}
