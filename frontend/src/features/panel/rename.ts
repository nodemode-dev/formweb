import { element } from '../../ui/dom';
import { labelAttr } from '../../i18n';

export interface RenameOptions {
  host: HTMLElement;
  current: string;
  commit: (name: string) => unknown;
  refuse: () => void;
}

let active: { row: HTMLElement; finish: (save: boolean) => void } | null = null;

export function renaming(): boolean { return !!active; }

export function startRename(row: HTMLElement, options: RenameOptions): void {
  if (active?.row === row) return;
  active?.finish(true);
  const label = row.querySelector<HTMLElement>('.row-label');
  if (!label || !row.isConnected) return;
  const scroller = row.parentElement;
  const field = element('input', 'fw-rename-input');
  field.type = 'text';
  field.value = options.current;
  field.spellcheck = false;
  field.dataset.noI18n = '';
  labelAttr(field, 'aria-label', 'Name');
  const place = (): void => {
    const box = label.getBoundingClientRect();
    const line = row.getBoundingClientRect();
    const inset = field.clientLeft + (parseFloat(getComputedStyle(field).paddingLeft) || 0);
    field.style.left = `${Math.round(box.left - inset)}px`;
    field.style.top = `${Math.round(line.top)}px`;
    field.style.width = `${Math.round(Math.max(box.width, 48) + inset * 2)}px`;
    field.style.height = `${Math.round(line.height)}px`;
  };
  let done = false;
  const watch = new MutationObserver(() => {
    if (!row.isConnected || row.parentElement !== scroller || row.offsetParent === null) finish(false);
    else place();
  });
  const finish = (save: boolean, keepFocus = false): void => {
    if (done) return;
    const name = field.value.trim();
    if (save && !name) { options.refuse(); if (keepFocus) { field.select(); return; } save = false; }
    done = true;
    active = null;
    watch.disconnect();
    scroller?.removeEventListener('scroll', place);
    window.removeEventListener('resize', place);
    row.classList.remove('is-renaming');
    field.remove();
    if (keepFocus && row.isConnected) row.focus({ preventScroll: true });
    if (save && name !== options.current) options.commit(name);
  };
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') finish(true, true);
    else if (event.key === 'Escape') finish(false, true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  field.addEventListener('blur', () => finish(true));
  field.addEventListener('pointerdown', event => event.stopPropagation());
  active = { row, finish };
  field.style.visibility = 'hidden';
  options.host.append(field);
  place();
  field.style.visibility = '';
  row.classList.add('is-renaming');
  if (scroller) watch.observe(scroller, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  scroller?.addEventListener('scroll', place, { passive: true });
  window.addEventListener('resize', place);
  field.focus({ preventScroll: true });
  field.select();
}
