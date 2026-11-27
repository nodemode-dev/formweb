import { englishOf, label, labelAttr } from '../../i18n';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { Trial, TrialOwner, TryKit, TryOptions } from './types';
import '../../styles/try-list.css';

interface Field { select: HTMLSelectElement; key: string; label: string }
interface Row { value: string; english: string | null; shown: string }

const MARGIN = 8;
const GAP = 4;
const MIN_ROOM = 96;
const OPENERS = new Set([' ', 'Enter', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp']);

function englishLabel(select: HTMLSelectElement, key: string): string {
  const head = select.closest('.field')?.querySelector(':scope > .field-label');
  const own = head ? Array.from(head.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim() : '';
  return own || key;
}

function rendered(node: Element | null | undefined): boolean {
  return !!node && node.isConnected && node.getClientRects().length > 0 && !node.closest('[inert]');
}

function typed(event: KeyboardEvent): string {
  return event.key.length === 1 && event.key !== ' ' && !event.altKey ? event.key.toLowerCase() : '';
}

export function installChoiceLists(kit: TryKit, options: TryOptions): void {
  const fields: Field[] = [];
  options.fields.forEach((control, key) => {
    if (control instanceof HTMLSelectElement) fields.push({ select: control, key, label: englishLabel(control, key) });
  });
  if (!fields.length) return;

  const pop = element('div', 'fw-tlist');
  pop.id = 'fw-tlist';
  pop.hidden = true;
  pop.tabIndex = -1;
  pop.dataset.ownKeys = '';
  pop.setAttribute('role', 'listbox');
  options.overlay.append(pop);

  let field: Field | null = null;
  let rows: Row[] = [];
  let nodes: HTMLElement[] = [];
  let active = -1;
  let tried: string | null = null;
  let trial: Trial | null = null;
  let owner: TrialOwner | null = null;
  let shownStored = '';
  let frame = 0;
  let placedAt = '';
  let made = 0;
  let held: { target: Field; seen: string; frame: number } | null = null;

  const bar = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-try-bar]');
  const inBar = (node: Node | null): boolean => !!node && !!bar()?.contains(node);
  const live = (): boolean => !!trial && !trial.over;

  function aria(select: HTMLSelectElement): void {
    if (kit.enabled()) {
      if (select.getAttribute('aria-haspopup') !== 'listbox') select.setAttribute('aria-haspopup', 'listbox');
      if (select.getAttribute('aria-controls') !== pop.id) select.setAttribute('aria-controls', pop.id);
      const open = String(field?.select === select);
      if (select.getAttribute('aria-expanded') !== open) select.setAttribute('aria-expanded', open);
    } else for (const name of ['aria-haspopup', 'aria-controls', 'aria-expanded']) select.removeAttribute(name);
  }

  function safe(target: Field): void {
    if (rendered(target.select)) { target.select.focus({ preventScroll: true }); return; }
    const head = target.select.closest('.inspector-section')?.querySelector<HTMLElement>(':scope > .section-title');
    if (head && rendered(head)) { head.focus({ preventScroll: true }); return; }
    const tab = document.querySelector<HTMLElement>('.inspector-tabs button.active');
    if (tab && rendered(tab)) tab.focus({ preventScroll: true });
  }

  function guard(target: Field): void {
    const check = (): void => {
      const now = document.activeElement;
      if (!now || now === document.body || (pop.contains(now) && pop.hidden)) safe(target);
    };
    window.setTimeout(check, 0);
    requestAnimationFrame(() => requestAnimationFrame(check));
  }

  function mark(): void {
    if (!field) return;
    const stored = options.stored(field.key);
    shownStored = stored;
    nodes.forEach((node, index) => {
      const row = rows[index];
      const isStored = row.value === stored;
      if (node.hasAttribute('data-stored') !== isStored) node.toggleAttribute('data-stored', isStored);
      const trying = tried !== null && row.value === tried;
      if (node.hasAttribute('data-trying') !== trying) node.toggleAttribute('data-trying', trying);
      const selected = String(tried !== null ? trying : isStored);
      if (node.getAttribute('aria-selected') !== selected) node.setAttribute('aria-selected', selected);
      const on = index === active;
      if (node.classList.contains('is-active') !== on) node.classList.toggle('is-active', on);
    });
    const id = nodes[active]?.id || '';
    if (id) { if (pop.getAttribute('aria-activedescendant') !== id) pop.setAttribute('aria-activedescendant', id); }
    else pop.removeAttribute('aria-activedescendant');
    const busy = String(!!trial && trial.pending);
    if (pop.getAttribute('aria-busy') !== busy) pop.setAttribute('aria-busy', busy);
  }

  function reveal(): void {
    const node = nodes[active];
    if (!node) return;
    const top = node.offsetTop - pop.clientTop;
    const pad = parseFloat(getComputedStyle(pop).paddingTop) || 0;
    if (top - pad < pop.scrollTop) pop.scrollTop = top - pad;
    else if (top + node.offsetHeight + pad > pop.scrollTop + pop.clientHeight) pop.scrollTop = top + node.offsetHeight + pad - pop.clientHeight;
  }

  function place(): void {
    if (!field) return;
    const box = field.select.getBoundingClientRect();
    const key = `${box.left}|${box.top}|${box.width}|${box.height}|${window.innerWidth}|${window.innerHeight}`;
    if (key === placedAt) return;
    placedAt = key;
    pop.style.minWidth = `${Math.round(box.width)}px`;
    pop.style.maxHeight = '';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const below = window.innerHeight - box.bottom - GAP - MARGIN;
    const above = box.top - GAP - MARGIN;
    const under = below >= height || below >= above;
    const room = Math.max(MIN_ROOM, under ? below : above);
    if (height > room) pop.style.maxHeight = `${Math.floor(room)}px`;
    const shown = Math.min(height, room);
    let top = under ? box.bottom + GAP : box.top - GAP - shown;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - shown - MARGIN));
    const left = Math.max(MARGIN, Math.min(box.left, window.innerWidth - (height > room ? pop.offsetWidth : width) - MARGIN));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function watch(): void {
    frame = 0;
    if (!field) return;
    if (!kit.enabled()) { close(); return; }
    if (!rendered(field.select)) { lost(); return; }
    if (options.stored(field.key) !== shownStored) mark();
    place();
    frame = requestAnimationFrame(watch);
  }

  function hide(): Field | null {
    const was = field;
    if (!was) return null;
    if (pop.contains(document.activeElement)) safe(was);
    pop.hidden = true;
    field = null;
    active = -1;
    tried = null;
    placedAt = '';
    pop.removeAttribute('aria-activedescendant');
    pop.setAttribute('aria-busy', 'false');
    aria(was.select);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('focusin', moved, true);
    document.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('blur', blurred);
    return was;
  }

  function close(): void {
    const was = field;
    if (live()) { if (!trial!.pending) trial!.revert(); return; }
    hide();
    if (was) guard(was);
  }

  function lost(): void {
    const was = field;
    if (was && pop.contains(document.activeElement)) safe(was);
    if (live() && !trial!.pending) trial!.revert();
    hide();
    if (was) guard(was);
  }

  function ended(mine: TrialOwner): void {
    if (owner !== mine) return;
    owner = null;
    trial = null;
    tried = null;
    const was = field;
    if (!was) return;
    const now = document.activeElement;
    const back = !now || now === document.body || pop.contains(now) || inBar(now) || now === was.select;
    hide();
    if (back) safe(was);
    guard(was);
  }

  function rowsOf(select: HTMLSelectElement): Row[] {
    return Array.from(select.options).map(option => ({ value: option.value, english: englishOf(option), shown: option.text }));
  }

  function open(target: Field): void {
    if (field && field !== target) close();
    if (field) return;
    rows = rowsOf(target.select);
    keyed(pop, rows, row => `v:${row.value}`, () => {
      const node = element('div', 'fw-tlist-row');
      node.id = `fw-tlist-row-${++made}`;
      node.setAttribute('role', 'option');
      const tick = element('span', 'fw-tlist-tick');
      tick.append(icon('check'));
      node.append(tick, element('span', 'fw-tlist-name'));
      return node;
    }, (node, row) => {
      const name = node.lastElementChild as HTMLElement;
      if (row.english !== null) { name.removeAttribute('data-no-i18n'); label(name, row.english); }
      else { name.dataset.noI18n = ''; text(name, row.shown); }
    });
    nodes = Array.from(pop.children) as HTMLElement[];
    labelAttr(pop, 'aria-label', target.label);
    field = target;
    tried = null;
    active = Math.max(0, rows.findIndex(row => row.value === options.stored(target.key)));
    mark();
    pop.hidden = false;
    aria(target.select);
    place();
    reveal();
    pop.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', moved, true);
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('blur', blurred);
    frame = requestAnimationFrame(watch);
  }

  function nameAt(index: number): string {
    return nodes[index]?.lastElementChild?.textContent || rows[index]?.shown || '';
  }

  function tryAt(index: number): void {
    if (!field || !kit.enabled()) return;
    if (trial?.pending) return;
    if (index < 0 || index >= rows.length) return;
    active = index;
    if (!live()) {
      const target = field;
      const mine: TrialOwner = {
        key: target.key,
        label: target.label,
        anchor: pop,
        inside: () => [target.select],
        ended: () => ended(mine)
      };
      owner = mine;
      trial = kit.begin(mine);
    }
    tried = rows[index].value;
    trial!.put(rows[index].value, nameAt(index));
    mark();
    reveal();
  }

  function seek(letter: string): void {
    if (!rows.length) return;
    for (let step = 1; step <= rows.length; step++) {
      const index = (active + step) % rows.length;
      if (nameAt(index).trim().toLowerCase().startsWith(letter)) { tryAt(index); return; }
    }
  }

  function keep(): void {
    if (!live()) { const was = hide(); if (was) { safe(was); guard(was); } return; }
    if (trial!.pending) return;
    const kept = trial!;
    void kept.keep().catch(() => undefined).finally(() => { if (trial === kept) mark(); });
    mark();
  }

  function outside(event: Event): void {
    const target = event.target as Node;
    if (!field || pop.contains(target) || field.select.contains(target) || inBar(target)) return;
    close();
  }

  function moved(event: FocusEvent): void {
    const target = event.target as Node;
    if (!field || pop.contains(target) || target === field.select || inBar(target)) return;
    if (live()) { if (!trial!.pending) trial!.revert(); return; }
    hide();
  }

  function blurred(): void {
    window.setTimeout(() => {
      if (field && !live() && document.activeElement instanceof HTMLIFrameElement) close();
    }, 0);
  }

  function key(event: KeyboardEvent): void {
    if (!field) return;
    if (!kit.enabled()) { close(); return; }
    const busy = !!trial?.pending;
    const letter = typed(event);
    if (event.key === 'Tab') {
      if (live()) {
        const keepButton = bar()?.querySelector<HTMLButtonElement>('button:not(:disabled)');
        if (keepButton && rendered(keepButton)) { event.preventDefault(); keepButton.focus({ preventScroll: true }); }
        return;
      }
      hide();
      return;
    }
    if (event.key === 'Escape') { if (!busy) { if (live()) trial!.revert(); else { const was = hide(); if (was) { safe(was); guard(was); } } } }
    else if (event.key === 'Enter') keep();
    else if (event.key === 'ArrowDown' && !event.altKey) { if (!busy && active < rows.length - 1) tryAt(active + 1); }
    else if (event.key === 'ArrowUp' && !event.altKey) { if (!busy && active > 0) tryAt(active - 1); }
    else if (event.key === 'Home') { if (!busy) tryAt(0); }
    else if (event.key === 'End') { if (!busy) tryAt(rows.length - 1); }
    else if (letter) { if (!busy) seek(letter); }
    else if (!['Delete', 'Backspace', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  pop.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey) return;
    key(event);
  });
  pop.addEventListener('mousedown', event => event.preventDefault());
  pop.addEventListener('click', event => {
    const node = (event.target as Element).closest<HTMLElement>('.fw-tlist-row');
    if (!node || !field || trial?.pending) return;
    const index = nodes.indexOf(node);
    if (index < 0) return;
    if (document.activeElement !== pop) pop.focus({ preventScroll: true });
    tryAt(index);
  });

  function follow(): void {
    if (!held) return;
    const { target } = held;
    if (document.activeElement !== target.select) { held = null; return; }
    const now = options.stored(target.key);
    if (now !== held.seen) {
      held.seen = now;
      if (kit.enabled() && !field && target.select.value !== now) target.select.value = now;
    }
    held.frame = requestAnimationFrame(follow);
  }

  function hold(target: Field): void {
    if (held) cancelAnimationFrame(held.frame);
    held = { target, seen: options.stored(target.key), frame: requestAnimationFrame(follow) };
  }

  function onward(from: HTMLElement): HTMLElement | null {
    const stops = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
      .filter(node => node.tabIndex >= 0 && !(node as HTMLButtonElement).disabled && !node.closest('[hidden], [inert]') && rendered(node) && !pop.contains(node) && !inBar(node));
    return stops.find(node => node !== from && !from.contains(node) && !!(from.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) || null;
  }

  document.addEventListener('keydown', event => {
    if (!field || event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const at = event.target as HTMLElement;
    if (!live() || trial!.pending || !inBar(at)) return;
    const buttons = Array.from(bar()!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (at !== bar() && at !== buttons.at(-1)) return;
    const next = onward(field.select);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
  }, true);

  for (const target of fields) {
    const { select } = target;
    aria(select);
    select.addEventListener('focus', () => { aria(select); hold(target); });
    select.addEventListener('mousedown', event => {
      aria(select);
      if (!kit.enabled() || select.disabled || event.button !== 0) return;
      event.preventDefault();
      if (field === target) { close(); return; }
      select.focus({ preventScroll: true });
      open(target);
    });
    select.addEventListener('keydown', event => {
      if (event.isComposing || event.ctrlKey || event.metaKey || !kit.enabled() || select.disabled) return;
      if (field === target) { pop.focus({ preventScroll: true }); key(event); return; }
      const letter = typed(event);
      const home = event.key === 'Home' || event.key === 'End';
      if (!letter && !home && !OPENERS.has(event.key)) return;
      event.preventDefault();
      open(target);
      if (event.key === 'Home') tryAt(0);
      else if (event.key === 'End') tryAt(rows.length - 1);
      else if (letter) seek(letter);
    });
  }
}
