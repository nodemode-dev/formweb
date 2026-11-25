import { label, labelAttr } from '../../i18n';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { SYNONYMS } from './search-terms';
import '../../styles/inspector-search.css';

export interface SearchTab { id: string; button: HTMLElement; pane: HTMLElement }
export interface SearchOptions { after: HTMLElement; scroll: HTMLElement; tabs: SearchTab[]; select(id: string): void }
export interface InspectorSearch { focus(): void; clear(): void }

interface Entry {
  key: string;
  group: string;
  tab: string;
  tabName: string;
  sectionName: string;
  isSection: boolean;
  name: string;
  css: string;
  target: HTMLElement;
  off: boolean;
  words: { name: string; prop: string; place: string };
}
interface Row { key: string; heading?: string; entry?: Entry }

const MAX_ROWS = 120;
const PULSE_MS = 1600;
const FIELDS = '.field, .checkbox-field, :scope > button, .inspect-actions > button';
const norm = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clean = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
const GROUPS = SYNONYMS.map(group => group.map(norm));

export function sectionId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function shown(node: HTMLElement, stop: HTMLElement): boolean {
  for (let at: HTMLElement | null = node; at && at !== stop; at = at.parentElement) if (at.hidden) return false;
  return true;
}

function labelOf(node: HTMLElement): string {
  if (node.tagName === 'BUTTON') return clean(node.textContent || node.getAttribute('aria-label'));
  const head = node.matches('.checkbox-field') ? node.querySelector(':scope > span:not(.icon)') : node.querySelector(':scope > .field-label');
  if (!head) return '';
  const own = Array.from(head.childNodes).filter(child => child.nodeType === 3).map(child => child.textContent).join('');
  return clean(own || head.textContent);
}

function controlOf(node: HTMLElement): HTMLElement | null {
  if (node.tagName === 'BUTTON') return node;
  return node.querySelector<HTMLElement>('input, select, textarea, .fw-seg-btn.is-on') || node.querySelector<HTMLElement>('.fw-seg-btn, button:not(.fw-reset)');
}

function rank(entry: Entry, token: string): number {
  const { name, prop, place } = entry.words;
  if (name.startsWith(token)) return 0;
  if (` ${name}`.includes(` ${token}`)) return 1;
  if (name.includes(token)) return 2;
  if (prop.includes(token)) return 3;
  const own = ` ${name} ${prop}`;
  if (token.length >= 2) {
    for (const group of GROUPS) {
      if (!group.some(member => member === token || member.startsWith(token))) continue;
      if (group.some(member => own.includes(` ${member}`))) return 4;
    }
  }
  if (place.includes(token)) return 5;
  if (token.length >= 2) {
    for (const group of GROUPS) {
      if (!group.some(member => member === token || member.startsWith(token))) continue;
      if (group.some(member => ` ${place}`.includes(` ${member}`))) return 6;
    }
  }
  return -1;
}

export function installInspectorSearch(options: SearchOptions): InspectorSearch {
  const bar = element('div', 'inspector-search');
  bar.setAttribute('role', 'search');
  const holder = element('div', 'inspector-search-field');
  const input = element('input', 'inspector-search-input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  labelAttr(input, 'placeholder', 'Search properties');
  labelAttr(input, 'aria-label', 'Search properties');
  const clearButton = element('button', 'inspector-search-clear');
  clearButton.type = 'button';
  clearButton.hidden = true;
  clearButton.append(icon('close'));
  labelAttr(clearButton, 'title', 'Clear search');
  labelAttr(clearButton, 'aria-label', 'Clear search');
  holder.append(icon('search'), input, clearButton);
  bar.append(holder);

  const results = element('div', 'inspector-results');
  results.hidden = true;
  const list = element('div', 'inspector-results-list');
  list.id = 'inspector-results-list';
  list.setAttribute('role', 'listbox');
  const empty = element('p', 'inspector-results-empty');
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  label(empty, 'No matching properties');
  results.append(list, empty);
  input.setAttribute('aria-controls', list.id);
  options.after.after(bar);
  options.scroll.before(results);

  const entries = new Map<string, Entry>();
  let index: Entry[] = [];
  let dirty = true;
  let open = false;
  let queued = false;
  let savedTop = 0;
  let activeKey = '';
  let pulsing: HTMLElement | null = null;
  let pulseTimer = 0;
  let picks: Entry[] = [];
  let serial = 0;

  function build(): Entry[] {
    const found: Entry[] = [];
    entries.clear();
    for (const tab of options.tabs) {
      const tabName = clean(tab.button.textContent);
      const sections = new Map<string, number>();
      tab.pane.querySelectorAll<HTMLElement>('.inspector-section').forEach(section => {
        if (!shown(section, tab.pane)) return;
        const head = section.querySelector<HTMLElement>(':scope > .section-title');
        const sectionName = clean(head?.firstElementChild?.textContent);
        if (!head || !sectionName) return;
        const place = norm(`${sectionName} ${tabName}`);
        const id = section.dataset.section || sectionId(sectionName);
        const nth = sections.get(id) || 0;
        sections.set(id, nth + 1);
        const base = `${tab.id}|${id}|${nth}`;
        const add = (entry: Omit<Entry, 'words' | 'group' | 'tab' | 'tabName' | 'sectionName'>, prop: string): void => {
          const made: Entry = { ...entry, group: base, tab: tab.id, tabName, sectionName, words: { name: norm(entry.name), prop: norm(prop), place } };
          found.push(made);
          entries.set(made.key, made);
        };
        add({ key: `${base}|`, isSection: true, name: sectionName, css: '', target: head, off: false }, '');
        const counts = new Map<string, number>();
        const done = new Map<HTMLElement, string>();
        section.querySelectorAll<HTMLElement>(FIELDS).forEach(node => {
          if (node.closest('.inspector-section') !== section || !shown(node, section)) return;
          const name = labelOf(node);
          if (!name) return;
          const outer = node.parentElement?.closest<HTMLElement>('.field, .checkbox-field');
          if (outer && done.get(outer) === name) return;
          done.set(node, name);
          const source = node.querySelector<HTMLElement>('[data-style], [data-field], [data-attr]');
          const css = source?.dataset.style || '';
          const prop = css || source?.dataset.field || source?.dataset.attr || node.dataset.command || '';
          const slug = norm(name);
          const seen = counts.get(slug) || 0;
          counts.set(slug, seen + 1);
          const control = controlOf(node) as (HTMLElement & { disabled?: boolean }) | null;
          add({ key: `${base}|${slug}|${seen}`, isSection: false, name, css, target: node, off: !!control?.disabled }, prop);
        });
      });
    }
    return found;
  }

  function score(entry: Entry, tokens: string[]): number {
    let total = 0;
    for (const token of tokens) {
      const best = rank(entry, token);
      if (best < 0) return -1;
      total += best;
    }
    return total;
  }

  function createRow(row: Row): HTMLElement {
    if (row.heading !== undefined) {
      const head = element('div', 'inspector-results-group');
      head.setAttribute('role', 'presentation');
      head.dataset.noI18n = '';
      return head;
    }
    const node = element('div', 'inspector-result');
    node.setAttribute('role', 'option');
    node.id = `inspector-result-${++serial}`;
    const name = element('span', 'inspector-result-name');
    name.dataset.noI18n = '';
    const css = element('span', 'inspector-result-css');
    css.dataset.noI18n = '';
    const off = element('span', 'inspector-result-off');
    label(off, 'Unavailable');
    off.hidden = true;
    node.append(name, css, off);
    node.addEventListener('pointerdown', event => event.preventDefault());
    node.addEventListener('click', () => { const entry = entries.get(node.dataset.key || ''); if (entry) pick(entry); });
    return node;
  }

  function updateRow(node: HTMLElement, row: Row): void {
    if (row.heading !== undefined) { text(node, row.heading); return; }
    const entry = row.entry!;
    const [name, css, off] = Array.from(node.children) as HTMLElement[];
    text(name, entry.name);
    text(css, entry.css);
    if (off.hidden === entry.off) off.hidden = !entry.off;
    node.classList.toggle('is-off', entry.off);
    node.classList.toggle('is-section', entry.isSection);
    node.setAttribute('aria-label', `${entry.tabName}, ${entry.sectionName}${entry.isSection ? '' : `, ${entry.name}`}`);
    if (entry.off) labelAttr(node, 'title', 'Not available for the current selection'); else node.removeAttribute('title');
  }

  function mark(scrollTo: boolean): void {
    let current: HTMLElement | null = null;
    Array.from(list.children).forEach(child => {
      const node = child as HTMLElement;
      if (node.dataset.key === activeKey) current = node;
      const on = node.dataset.key === activeKey;
      if (node.classList.contains('is-active') !== on) node.classList.toggle('is-active', on);
      if (node.getAttribute('role') === 'option') node.setAttribute('aria-selected', String(on));
    });
    const node = current as HTMLElement | null;
    if (node) input.setAttribute('aria-activedescendant', node.id); else input.removeAttribute('aria-activedescendant');
    if (node && scrollTo) node.scrollIntoView({ block: 'nearest' });
  }

  function refresh(): void {
    const tokens = norm(input.value).split(' ').filter(Boolean);
    const on = tokens.length > 0;
    if (clearButton.hidden === on) clearButton.hidden = !on;
    if (on && !open) savedTop = options.scroll.scrollTop;
    if (results.hidden === on) results.hidden = !on;
    if (options.scroll.hidden !== on) options.scroll.hidden = on;
    if (!on && open) options.scroll.scrollTop = savedTop;
    open = on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) { picks = []; return; }
    if (dirty) { index = build(); dirty = false; }
    const scored = index.map((entry, order) => ({ entry, order, value: score(entry, tokens) })).filter(item => item.value >= 0);
    const groups = new Map<string, { best: number; order: number; items: typeof scored }>();
    for (const item of scored) {
      const id = item.entry.group;
      const group = groups.get(id);
      if (group) { group.best = Math.min(group.best, item.value); group.items.push(item); }
      else groups.set(id, { best: item.value, order: item.order, items: [item] });
    }
    const rows: Row[] = [];
    picks = [];
    Array.from(groups.entries()).sort((a, b) => a[1].best - b[1].best || a[1].order - b[1].order).forEach(([id, group]) => {
      if (rows.length >= MAX_ROWS) return;
      const first = group.items[0].entry;
      rows.push({ key: `g|${id}`, heading: `${first.tabName} > ${first.sectionName}` });
      group.items.sort((a, b) => a.value - b.value || a.order - b.order).forEach(item => {
        if (rows.length >= MAX_ROWS) return;
        rows.push({ key: item.entry.key, entry: item.entry });
        picks.push(item.entry);
      });
    });
    keyed(list, rows, row => row.key, createRow, updateRow);
    if (empty.hidden === rows.length > 0) empty.hidden = rows.length > 0;
    if (!picks.some(entry => entry.key === activeKey)) activeKey = picks[0]?.key || '';
    mark(false);
  }

  function move(step: number): void {
    if (!picks.length) return;
    const at = picks.findIndex(entry => entry.key === activeKey);
    activeKey = picks[(at + step + picks.length) % picks.length].key;
    mark(true);
  }

  function pulse(target: HTMLElement): void {
    if (pulsing) pulsing.classList.remove('fw-search-hit');
    clearTimeout(pulseTimer);
    void target.offsetWidth;
    target.classList.add('fw-search-hit');
    pulsing = target;
    pulseTimer = window.setTimeout(() => { target.classList.remove('fw-search-hit'); if (pulsing === target) pulsing = null; }, PULSE_MS);
  }

  function pick(chosen: Entry): void {
    input.value = '';
    refresh();
    if (dirty) { index = build(); dirty = false; }
    const entry = entries.get(chosen.key);
    if (!entry || !entry.target.isConnected) return;
    options.select(entry.tab);
    for (let at = entry.target.closest<HTMLElement>('.inspector-section'); at; at = at.parentElement?.closest<HTMLElement>('.inspector-section') || null) {
      if (at.classList.contains('is-collapsed')) at.querySelector<HTMLElement>(':scope > .section-title')?.click();
    }
    entry.target.scrollIntoView({ block: entry.isSection ? 'start' : 'center' });
    const control = entry.isSection ? entry.target : controlOf(entry.target);
    if (control && !(control as HTMLButtonElement).disabled) control.focus({ preventScroll: true });
    pulse(entry.isSection ? entry.target.parentElement || entry.target : entry.target);
  }

  function clear(): void {
    input.value = '';
    refresh();
  }

  input.addEventListener('input', () => { activeKey = ''; refresh(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') {
      const entry = picks.find(item => item.key === activeKey);
      if (entry) { event.preventDefault(); pick(entry); }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (input.value) clear(); else input.blur();
    }
  });
  clearButton.addEventListener('click', () => { clear(); input.focus(); });

  const observer = new MutationObserver(() => {
    dirty = true;
    if (!open || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (open) refresh(); });
  });
  for (const tab of options.tabs) observer.observe(tab.pane, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });

  return {
    focus() { input.focus(); input.select(); },
    clear
  };
}
