import { element, text } from './dom';
import { icon } from './icons';
import { label, labelAttr } from '../i18n';
import '../styles/notice.css';

export type NoticeAction = { label: string; run: () => unknown };

const SHOWN_MS = 12000;
const ERROR_MS = 30000;

export class Notice {
  readonly element = element('div', 'fw-notice');
  private message = element('span', 'fw-notice-text');
  private action = element('button', 'fw-notice-action');
  private dismiss = element('button', 'fw-notice-close');
  private act: (() => unknown) | null = null;
  private timer = 0;
  private wait = SHOWN_MS;

  constructor(host: HTMLElement, run: (action: () => unknown) => unknown) {
    this.element.hidden = true;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.action.type = 'button';
    this.action.hidden = true;
    this.action.addEventListener('click', () => { const act = this.act; if (act) void run(act); });
    this.dismiss.type = 'button';
    this.dismiss.append(icon('close'));
    labelAttr(this.dismiss, 'aria-label', 'Dismiss');
    labelAttr(this.dismiss, 'title', 'Dismiss');
    this.dismiss.addEventListener('click', () => this.hide());
    const done = icon('check');
    done.classList.add('fw-notice-ok');
    const failed = icon('info');
    failed.classList.add('fw-notice-bad');
    this.element.append(done, failed, this.message, this.action, this.dismiss);
    this.element.addEventListener('pointerenter', () => this.stop());
    this.element.addEventListener('pointerleave', () => this.schedule());
    this.element.addEventListener('focusin', () => this.stop());
    this.element.addEventListener('focusout', () => this.schedule());
    host.append(this.element);
  }

  show(message: string, options: { error?: boolean; action?: NoticeAction } = {}): void {
    text(this.message, message);
    this.element.classList.toggle('is-error', !!options.error);
    this.act = options.action ? options.action.run : null;
    if (options.action) label(this.action, options.action.label);
    if (this.action.hidden === !!options.action) this.action.hidden = !options.action;
    this.wait = options.error ? ERROR_MS : SHOWN_MS;
    if (this.element.hidden) this.element.hidden = false;
    this.schedule();
  }

  hide(): void {
    this.stop();
    if (!this.element.hidden) this.element.hidden = true;
  }

  private stop(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private schedule(): void {
    this.stop();
    if (this.element.hidden || this.element.matches(':hover, :focus-within')) return;
    this.timer = window.setTimeout(() => this.hide(), this.wait);
  }
}
