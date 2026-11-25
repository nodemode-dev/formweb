import { label, labelAttr } from '../../i18n';
import { element, keyed, text } from '../../ui/dom';
import { icon, type Icon } from '../../ui/icons';
import './insert-flyout.css';

export interface FlyoutItem { id: string; label: string; icon: Icon; raw?: boolean; run: () => unknown }
export interface FlyoutGroup { id: string; title: string; items: FlyoutItem[] }
export interface FlyoutHooks {
  host: HTMLElement;
  groups: () => FlyoutGroup[];
  openAll: () => unknown;
  run: (action: () => unknown) => unknown;
}
export interface InsertFlyout {
  toggle: (anchor: HTMLElement) => void;
  open: (anchor: HTMLElement) => void;
  close: (restoreFocus?: boolean) => void;
  isOpen: () => boolean;
}

const MARGIN = 8;
const GAP = 4;
const MIN_LIST = 96;

export function installInsertFlyout(hooks: FlyoutHooks): InsertFlyout {
  const panel = element('div', 'fw-flyout');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  labelAttr(panel, 'aria-label', 'Quick insert');
  const search = element('div', 'fw-flyout-search');
  const filter = element('input', 'fw-flyout-filter');
  filter.type = 'text';
  filter.autocomplete = 'off';
  filter.spellcheck = false;
  filter.setAttribute('role', 'combobox');
  filter.setAttribute('aria-expanded', 'true');
  filter.setAttribute('aria-autocomplete', 'list');
  labelAttr(filter, 'placeholder', 'Filter elements...');
  labelAttr(filter, 'aria-label', 'Filter elements');
  search.append(filter);
  const list = element('div', 'fw-flyout-list');
  list.id = 'fw-flyout-list';
  list.setAttribute('role', 'listbox');
  filter.setAttribute('aria-controls', list.id);
  const groupsEl = element('div', 'fw-flyout-groups');
  const none = element('div', 'fw-flyout-none');
  none.hidden = true;
  label(none, 'Nothing matches this filter.');
  list.append(groupsEl, none);
  const foot = element('div', 'fw-flyout-foot');
  const all = element('button', 'fw-flyout-row fw-flyout-all');
  all.type = 'button';
  all.tabIndex = -1;
  all.id = 'fw-flyout-all';
  all.setAttribute('role', 'option');
  const allLabel = element('span', 'fw-flyout-label');
  label(allLabel, 'All elements and components...');
  all.append(icon('grid'), allLabel);
  foot.append(all);
  panel.append(search, list, foot);
  hooks.host.append(panel);

  const actions = new WeakMap<HTMLElement, () => unknown>();
  let shown: HTMLElement[] = [];
  let active: HTMLElement | null = null;
  let anchorEl: HTMLElement | null = null;
  let counter = 0;

  function setActive(row: HTMLElement | null, scroll = true): void {
    if (active && active !== row) { active.classList.remove('is-active'); active.setAttribute('aria-selected', 'false'); }
    active = row;
    if (!row) { filter.removeAttribute('aria-activedescendant'); return; }
    if (!row.classList.contains('is-active')) row.classList.add('is-active');
    row.setAttribute('aria-selected', 'true');
    filter.setAttribute('aria-activedescendant', row.id);
    if (scroll) row.scrollIntoView({ block: 'nearest' });
  }

  function fill(): void {
    const groups = hooks.groups().filter(group => group.items.length > 0);
    keyed(groupsEl, groups, group => group.id, () => {
      const section = element('div', 'fw-flyout-group');
      section.setAttribute('role', 'group');
      section.append(element('div', 'fw-flyout-head'), element('div', 'fw-flyout-items'));
      return section;
    }, (section, group) => {
      const head = section.children[0] as HTMLElement;
      label(head, group.title);
      head.id = head.id || `fw-flyout-head-${++counter}`;
      section.setAttribute('aria-labelledby', head.id);
      keyed(section.children[1] as HTMLElement, group.items, item => item.id, item => {
        const row = element('button', 'fw-flyout-row');
        row.type = 'button';
        row.tabIndex = -1;
        row.id = `fw-flyout-row-${++counter}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');
        row.append(icon(item.icon), element('span', 'fw-flyout-label'));
        return row;
      }, (row, item) => {
        const name = row.children[1] as HTMLElement;
        if (item.raw) text(name, item.label); else label(name, item.label);
        actions.set(row, item.run);
      });
    });
  }

  function refresh(): void {
    const needle = filter.value.trim().toLowerCase();
    shown = [];
    for (const section of Array.from(groupsEl.children) as HTMLElement[]) {
      let any = false;
      for (const row of Array.from(section.children[1].children) as HTMLElement[]) {
        const hit = !needle || (row.children[1].textContent || '').toLowerCase().includes(needle);
        row.hidden = !hit;
        if (hit) { shown.push(row); any = true; }
      }
      section.hidden = !any;
    }
    none.hidden = shown.length > 0;
    if (!active || !shown.includes(active)) setActive(shown[0] || all, false);
  }

  function place(anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    list.style.height = '';
    panel.style.left = '0px';
    panel.style.top = '0px';
    const width = panel.offsetWidth;
    const natural = list.scrollHeight;
    const chrome = panel.offsetHeight - list.offsetHeight;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const underneath = below >= Math.min(chrome + natural, 320) || below >= above;
    const room = underneath ? below : above;
    const height = Math.max(MIN_LIST, Math.min(natural, room - chrome));
    list.style.height = `${height}px`;
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
    const top = underneath ? rect.bottom + GAP : rect.top - GAP - (chrome + height);
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(MARGIN, top)}px`;
  }

  function choose(row: HTMLElement): void {
    const action = row === all ? hooks.openAll : actions.get(row);
    close(true);
    if (action) void hooks.run(action);
  }

  function move(step: number): void {
    const rows = [...shown, all];
    const at = active ? rows.indexOf(active) : -1;
    setActive(rows[(at + step + rows.length) % rows.length]);
  }

  const outside = (event: Event): void => {
    const target = event.target as Node;
    if (panel.contains(target) || anchorEl?.contains(target)) return;
    close();
  };
  const leave = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (panel.contains(next) || anchorEl?.contains(next))) return;
    close();
  };
  const resize = (): void => close();

  function open(anchor: HTMLElement): void {
    if (!panel.hidden) close();
    anchorEl = anchor;
    anchor.setAttribute('aria-haspopup', 'dialog');
    anchor.setAttribute('aria-expanded', 'true');
    fill();
    filter.value = '';
    setActive(null, false);
    refresh();
    panel.hidden = false;
    place(anchor);
    setActive(shown[0] || all, false);
    filter.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', resize);
    panel.addEventListener('focusout', leave);
  }

  function close(restoreFocus = false): void {
    if (panel.hidden) return;
    panel.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', resize);
    panel.removeEventListener('focusout', leave);
    const anchor = anchorEl;
    anchorEl = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) anchor?.focus({ preventScroll: true });
  }

  filter.addEventListener('input', refresh);
  panel.addEventListener('mousedown', event => { if (event.target !== filter) event.preventDefault(); });
  panel.addEventListener('click', event => {
    const row = (event.target as Element).closest<HTMLElement>('.fw-flyout-row');
    if (row && panel.contains(row)) choose(row);
  });
  panel.addEventListener('pointermove', event => {
    const row = (event.target as Element).closest<HTMLElement>('.fw-flyout-row');
    if (row && row !== active) setActive(row, false);
  });
  panel.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); if (active) choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
  });

  return {
    open,
    close,
    isOpen: () => !panel.hidden,
    toggle: anchor => { if (!panel.hidden && anchorEl === anchor) close(true); else open(anchor); }
  };
}
