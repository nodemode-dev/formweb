import { element } from './dom';
import { label, labelAttr } from '../i18n';

export interface MenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  title?: string;
  keys?: string;
  checked?: boolean;
  run: () => unknown;
}
export interface MenuSeparator { separator: true }
export type MenuEntry = MenuItem | MenuSeparator;
export type MenuAnchor = { x: number; y: number } | HTMLElement;
export interface MenuOptions {
  host: HTMLElement;
  className?: string;
  run?: (action: () => unknown) => unknown;
  returnFocus?: HTMLElement | null;
}
export interface OpenMenu { element: HTMLElement; close: (restore?: boolean) => void }

const EDGE = 4;
let current: OpenMenu | null = null;

export function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry && entry.separator === true;
}

export function closeContextMenu(): void {
  current?.close(false);
}

export function menuKeyPressed(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey);
}

export function anchorOf(event: MouseEvent, fallback: HTMLElement): MenuAnchor {
  return event.button < 0 || (event.clientX === 0 && event.clientY === 0) ? fallback : { x: event.clientX, y: event.clientY };
}

function place(menu: HTMLElement, anchor: MenuAnchor): void {
  let x: number;
  let y: number;
  if (anchor instanceof HTMLElement) {
    const box = anchor.getBoundingClientRect();
    x = box.left + Math.min(24, box.width / 2);
    y = box.bottom;
  } else ({ x, y } = anchor);
  const size = menu.getBoundingClientRect();
  const left = Math.max(EDGE, Math.min(x, window.innerWidth - size.width - EDGE));
  const top = y + size.height + EDGE > window.innerHeight && anchor instanceof HTMLElement
    ? anchor.getBoundingClientRect().top - size.height
    : Math.min(y, window.innerHeight - size.height - EDGE);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(Math.max(EDGE, top))}px`;
}

export function showContextMenu(entries: readonly MenuEntry[], anchor: MenuAnchor, options: MenuOptions): OpenMenu {
  current?.close(false);
  const menu = element('div', 'fw-menu' + (options.className ? ' ' + options.className : ''));
  menu.setAttribute('role', 'menu');
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.visibility = 'hidden';
  const opener = options.returnFocus === undefined ? (document.activeElement as HTMLElement | null) : options.returnFocus;
  const items: HTMLButtonElement[] = [];
  const close = (restore = true): void => {
    if (current !== open) return;
    current = null;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', keys, true);
    window.removeEventListener('blur', blur);
    window.removeEventListener('resize', blur);
    if (restore && opener?.isConnected) opener.focus({ preventScroll: true });
  };
  const outside = (down: Event): void => { if (!menu.contains(down.target as Node)) close(false); };
  const blur = (): void => close(false);
  const enabled = (): HTMLButtonElement[] => items.filter(item => !item.disabled);
  const move = (step: number): void => {
    const list = enabled();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    list[next].focus({ preventScroll: true });
  };
  const keys = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
    else if (event.key === 'Tab') { close(false); return; }
    else if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Home') enabled()[0]?.focus({ preventScroll: true });
    else if (event.key === 'End') enabled().at(-1)?.focus({ preventScroll: true });
    else if (event.key === 'Enter' || event.key === ' ') {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && menu.contains(focused) && !focused.disabled) focused.click();
    } else if (!menuKeyPressed(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  for (const entry of entries) {
    if (isSeparator(entry)) {
      if (menu.lastElementChild && !menu.lastElementChild.classList.contains('fw-menu-sep')) menu.append(element('div', 'fw-menu-sep'));
      continue;
    }
    const on = entry.enabled !== false;
    const row = element('button', 'fw-menu-item');
    row.type = 'button';
    row.tabIndex = -1;
    row.dataset.command = entry.id;
    row.setAttribute('role', entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
    if (entry.checked !== undefined) { row.setAttribute('aria-checked', String(entry.checked)); row.classList.toggle('is-checked', entry.checked); }
    row.disabled = !on;
    labelAttr(row, 'title', entry.title || entry.label);
    const name = element('span', 'fw-menu-label');
    label(name, entry.label);
    row.append(element('span', 'fw-menu-check'), name, element('span', 'fw-menu-keys', entry.keys || ''));
    row.addEventListener('click', () => {
      close();
      const action = entry.run;
      if (options.run) void options.run(action); else action();
    });
    menu.append(row);
    items.push(row);
  }
  if (menu.lastElementChild?.classList.contains('fw-menu-sep')) menu.lastElementChild.remove();
  const open: OpenMenu = { element: menu, close };
  current = open;
  options.host.append(menu);
  place(menu, anchor);
  menu.style.visibility = '';
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', keys, true);
  window.addEventListener('blur', blur);
  window.addEventListener('resize', blur);
  enabled()[0]?.focus({ preventScroll: true });
  return open;
}
