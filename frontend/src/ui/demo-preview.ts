import { label, labelAttr, t } from '../i18n';
import { DEMOS, DEMO_PREVIEW } from './demos';
import { element, text } from './dom';
import { icon } from './icons';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

export class DemoPreview {
  private readonly root = element('section', 'fw-demo-pv');
  private readonly name = element('span', 'fw-demo-pv-name');
  private readonly edit = element('button', 'fw-home-btn');
  private readonly shut = element('button', 'fw-home-btn fw-demo-pv-close');
  private readonly stage = element('div', 'fw-demo-pv-stage');
  private readonly note = element('span', 'fw-demo-pv-note');
  private frame: HTMLIFrameElement | null = null;
  private watch: MutationObserver | null = null;
  private current = '';
  private back: HTMLElement | null = null;
  private held: HTMLElement[] = [];

  constructor(private readonly openForEditing: (id: string) => void) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    labelAttr(this.root, 'aria-label', 'Demo preview');
    const bar = element('header', 'fw-demo-pv-bar');
    if (document.documentElement.classList.contains('has-overlay-titlebar')) bar.setAttribute('data-tauri-drag-region', '');
    this.name.setAttribute('translate', 'no');
    this.name.dataset.noI18n = '';
    this.edit.type = 'button';
    label(this.edit, 'Open this demo');
    this.edit.addEventListener('click', () => {
      const id = this.shown();
      this.close();
      this.openForEditing(id);
    });
    this.shut.type = 'button';
    const shutText = element('span');
    label(shutText, 'Close');
    this.shut.append(icon('close'), shutText);
    this.shut.addEventListener('click', () => this.close());
    label(this.note, 'Loading the preview...');
    this.stage.append(this.note);
    bar.append(this.name, this.edit, this.shut);
    this.root.append(bar, this.stage);
    document.body.append(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  show(id: string, opener?: HTMLElement | null): void {
    const found = DEMOS.find(d => d.id === id) ?? DEMOS[0];
    if (!found) return;
    this.current = found.id;
    text(this.name, found.title);
    if (this.frame) {
      try { this.frame.contentWindow?.location.replace(`${DEMO_PREVIEW}#${found.id}/`); } catch { return; }
      return;
    }
    const active = opener ?? document.activeElement;
    this.back = active instanceof HTMLElement && active !== document.body ? active : null;
    this.held = [];
    for (const node of Array.from(document.body.children)) {
      if (node === this.root || !(node instanceof HTMLElement) || node.inert) continue;
      node.inert = true;
      this.held.push(node);
    }
    const frame = element('iframe', 'fw-demo-pv-frame');
    frame.title = t('Demo preview');
    frame.setAttribute('sandbox', SANDBOX);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.addEventListener('load', () => {
      if (this.frame !== frame) return;
      frame.classList.add('is-ready');
      if (!this.note.hidden) this.note.hidden = true;
      this.follow(frame);
    });
    frame.src = `${DEMO_PREVIEW}#${found.id}/`;
    this.frame = frame;
    if (this.note.hidden) this.note.hidden = false;
    this.stage.append(frame);
    this.root.hidden = false;
    window.addEventListener('keydown', this.onKey, true);
    this.shut.focus({ preventScroll: true });
  }

  close(): void {
    if (this.root.hidden) return;
    window.removeEventListener('keydown', this.onKey, true);
    this.watch?.disconnect();
    this.watch = null;
    this.frame?.remove();
    this.frame = null;
    this.root.hidden = true;
    for (const node of this.held) node.inert = false;
    this.held = [];
    const back = this.back;
    this.back = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  private shown(): string {
    let slug = '';
    try { slug = (this.frame?.contentWindow?.location.hash ?? '').slice(1).split('/')[0]; } catch { slug = ''; }
    const found = DEMOS.find(d => d.id === slug);
    if (found && found.id !== this.current) {
      this.current = found.id;
      text(this.name, found.title);
    }
    return this.current;
  }

  private follow(frame: HTMLIFrameElement): void {
    this.watch?.disconnect();
    this.watch = null;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      this.watch = new MutationObserver(() => { this.shown(); });
      this.watch.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      this.shown();
      const hook = (inner: Window | null): void => {
        try { inner?.addEventListener('keydown', this.onInnerKey); } catch { return; }
      };
      hook(frame.contentWindow);
      for (const page of Array.from(doc.querySelectorAll('iframe'))) hook(page.contentWindow);
      doc.addEventListener('load', event => {
        const page = event.target as HTMLIFrameElement | null;
        if (page && page.tagName === 'IFRAME') hook(page.contentWindow);
      }, true);
    } catch { this.watch = null; }
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close();
  };

  private readonly onInnerKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    const page = (event.target as Node | null)?.ownerDocument;
    if (page?.querySelector('dialog[open]')) return;
    event.preventDefault();
    this.close();
  };
}
