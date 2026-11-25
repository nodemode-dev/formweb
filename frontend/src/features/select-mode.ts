import { element } from '../ui/dom';
import { icon } from '../ui/icons';
import { label, labelAttr } from '../i18n';
import type { CommandDef } from '../ui/shell';
import { picking, selectedIds, selectedPageIds, setPicking } from './selection';
import '../styles/select-mode.css';

export interface SelectModeHost {
  heads: { head: HTMLElement; kind: 'pages' | 'layers' }[];
  lists: HTMLElement[];
  frame: HTMLIFrameElement;
  loaded: Promise<void>;
  ready: () => boolean;
  status: (message: string) => void;
}

interface Bar { kind: 'pages' | 'layers'; head: HTMLElement; toggle: HTMLButtonElement; bar: HTMLElement; count: HTMLElement }

let bars: Bar[] = [];

export function paintSelectMode(): void {
  const on = picking();
  for (const item of bars) {
    if (item.bar.hidden === on) item.bar.hidden = !on;
    if (item.head.classList.contains('is-picking') !== on) item.head.classList.toggle('is-picking', on);
    if (item.toggle.getAttribute('aria-pressed') !== String(on)) item.toggle.setAttribute('aria-pressed', String(on));
    if (item.toggle.classList.contains('active') !== on) item.toggle.classList.toggle('active', on);
    if (!on) continue;
    const many = item.kind === 'pages' ? selectedPageIds().length : selectedIds().length;
    if (item.kind === 'pages') label(item.count, many === 1 ? '1 page selected' : '{0} pages selected', [many]);
    else label(item.count, many === 1 ? '1 layer selected' : '{0} layers selected', [many]);
  }
}

export function installSelectMode(host: SelectModeHost): CommandDef[] {
  bars = host.heads.map(({ head, kind }) => {
    const before = head.lastElementChild;
    const toggle = element('button', 'fw-pick-toggle');
    toggle.type = 'button';
    toggle.dataset.cmd = 'edit.select-mode';
    toggle.append(icon('selectSeveral'));
    labelAttr(toggle, 'title', 'Select several');
    labelAttr(toggle, 'aria-label', 'Select several');
    toggle.setAttribute('aria-pressed', 'false');
    const bar = element('div', 'fw-pick-bar');
    bar.hidden = true;
    const count = element('span', 'fw-pick-count');
    count.setAttribute('aria-live', 'polite');
    const done = element('button', 'fw-pick-done');
    done.type = 'button';
    label(done, 'Done');
    done.addEventListener('click', () => { set(false); toggle.focus(); });
    bar.append(count, done);
    head.insertBefore(bar, before);
    head.insertBefore(toggle, before);
    head.classList.add('has-pick');
    return { kind, head, toggle, bar, count };
  });

  function set(on: boolean): void {
    if (picking() === on) return;
    setPicking(on);
    paintSelectMode();
    host.status(on ? 'Select several is on: tap or click layers, pages or elements on the canvas to add them to the selection or take them out. Done or Escape turns it off.' : 'Select several is off.');
  }

  window.addEventListener('keydown', event => {
    if (!picking() || event.key !== 'Escape' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    set(false);
  });
  const quiet = (event: Event): void => { if (picking()) { event.preventDefault(); event.stopPropagation(); } };
  for (const list of host.lists) list.addEventListener('dblclick', quiet, true);
  void host.loaded.then(() => host.frame.contentWindow?.addEventListener('dblclick', quiet, true));

  return [
    { id: 'edit.select-mode', label: 'Select several', menu: 'Edit', group: 1, run: () => set(!picking()), enabled: () => host.ready() || picking(), checked: picking, description: 'Turn Select several on or off. While it is on, a tap or click on a layer, a page or an element on the canvas adds it to the selection or takes it out, as Ctrl+click does, which is how a touch screen builds a selection. The Pages and Layers headings then show how many are selected and a Done button. Escape or Done turns it off. The selection itself is kept.' }
  ];
}
