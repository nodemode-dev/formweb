import { label, labelAttr } from '../../i18n';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { SYNONYMS } from './search-terms';
import '../../styles/inspector-search.css';

export interface SearchTab { id: string; button: HTMLElement; pane: HTMLElement }
export interface SearchOptions { after: HTMLElement; scroll: HTMLElement; tabs: SearchTab[] }
export interface InspectorSearch { focus(): void; clear(): void }

interface Entry {
  key: string;
  group: string;
  parent: string;
  kind: 'section' | 'field' | 'choice';
  name: string;
  place: string;
  css: string;
  off: boolean;
  words: { name: string; prop: string; place: string };
}
interface Row { key: string; entry: Entry; value: number; order: number }

const MAX_ROWS = 120;
const MAX_ENTRIES = 4000;
const MAX_CHOICES = 64;
const MAX_TEXT = 120;
const SEP = ' > ';
const FIELDS = '.field, .checkbox-field, :scope > button, .inspect-actions > button';
const OWNER = '.field, .checkbox-field';
const norm = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clean = (value: string | null | undefined): string => (value || '').slice(0, MAX_TEXT * 4).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
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
  if (own.trim()) return clean(own);
  const copy = head.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('button').forEach(button => button.remove());
  return clean(copy.textContent);
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
  if (entry.kind === 'choice') return place.includes(token) ? 5 : -1;
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
  input.maxLength = MAX_TEXT;
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
  const note = element('p', 'inspector-results-note');
  note.id = 'inspector-results-note';
  label(note, 'Each result shows where to find it. Open that tab and section to use it.');
  const list = element('div', 'inspector-results-list');
  list.id = 'inspector-results-list';
  list.setAttribute('role', 'list');
  const empty = element('p', 'inspector-results-empty');
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  label(empty, 'No matching properties');
  const more = element('p', 'inspector-results-more');
  more.setAttribute('role', 'status');
  more.hidden = true;
  label(more, 'Showing the first {0} results. Type more to narrow it down.', [MAX_ROWS]);
  labelAttr(more, 'title', 'Showing the first {0} results. Type more to narrow it down.', [MAX_ROWS]);
  results.append(note, list, more, empty);
  input.setAttribute('aria-describedby', note.id);
  options.after.after(bar);
  options.scroll.before(results);

  let index: Entry[] = [];
  let dirty = true;
  let open = false;
  let queued = false;
  let savedTop = 0;

  function build(): Entry[] {
    const found: Entry[] = [];
    for (const tab of options.tabs) {
      const tabName = clean(tab.button.textContent);
      const sections = new Map<string, number>();
      tab.pane.querySelectorAll<HTMLElement>('.inspector-section').forEach(section => {
        if (found.length >= MAX_ENTRIES || !shown(section, tab.pane)) return;
        const head = section.querySelector<HTMLElement>(':scope > .section-title');
        const sectionName = clean(head?.firstElementChild?.textContent);
        if (!head || !sectionName) return;
        const where = `${tabName}${SEP}${sectionName}`;
        const place = norm(`${sectionName} ${tabName}`);
        const id = section.dataset.section || sectionId(sectionName);
        const nth = sections.get(id) || 0;
        sections.set(id, nth + 1);
        const base = `${tab.id}|${id}|${nth}`;
        const add = (entry: Omit<Entry, 'words' | 'group'>, prop: string, words = place): void => {
          if (found.length < MAX_ENTRIES) found.push({ ...entry, group: base, words: { name: norm(entry.name), prop: norm(prop), place: words } });
        };
        const mine = <T extends HTMLElement>(root: HTMLElement, selector: string, owner: HTMLElement | null): T[] =>
          Array.from(root.querySelectorAll<T>(selector)).filter(node => node.closest('.inspector-section') === section && node.closest(OWNER) === owner && shown(node, section));
        const choices = (parent: string, field: string, off: boolean, groups: HTMLElement[], selects: HTMLSelectElement[]): void => {
          const at = field ? `${where}${SEP}${field}` : where;
          const words = norm(`${field} ${sectionName} ${tabName}`);
          const seen = new Map<string, number>();
          const one = (name: string, value: string, disabled: boolean): void => {
            if (!name) return;
            const slug = `${parent}|c|${norm(value || name)}`;
            const n = seen.get(slug) || 0;
            seen.set(slug, n + 1);
            add({ key: `${slug}|${n}`, kind: 'choice', parent, name, place: at, css: '', off: off || disabled }, value, words);
          };
          for (const group of groups) {
            Array.from(group.querySelectorAll<HTMLButtonElement>('.fw-seg-btn')).slice(0, MAX_CHOICES).forEach(button => {
              if (shown(button, group)) one(clean(button.textContent || button.getAttribute('aria-label')), clean(button.dataset.value), button.disabled);
            });
          }
          for (const select of selects) {
            Array.from(select.options).slice(0, MAX_CHOICES).forEach(option => {
              if (option.value && !option.hidden) one(clean(option.text), clean(option.value), select.disabled || option.disabled);
            });
          }
        };
        add({ key: `${base}|`, kind: 'section', parent: '', name: sectionName, place: where, css: '', off: false }, '');
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
          const key = `${base}|${slug}|${seen}`;
          const off = !!control?.disabled;
          add({ key, kind: 'field', parent: '', name, place: where, css, off }, prop);
          if (node.tagName !== 'BUTTON') choices(key, name, off, mine(node, '.fw-seg', node), mine<HTMLSelectElement>(node, 'select[data-style]', node));
        });
        mine(section, '.fw-seg', null).forEach((group, at) => {
          const head = group.previousElementSibling;
          choices(`${base}|set|${at}`, head?.matches('.field-label') ? clean(head.textContent) : '', false, [group], []);
        });
      });
    }
    return found;
  }

  function score(entry: Entry, tokens: string[]): number {
    let total = 0;
    let own = entry.kind !== 'choice';
    for (const token of tokens) {
      const best = rank(entry, token);
      if (best < 0) return -1;
      if (best < 5) own = true;
      total += best;
    }
    return own ? total : -1;
  }

  function createRow(): HTMLElement {
    const node = element('div', 'inspector-result');
    node.setAttribute('role', 'listitem');
    const words = element('span', 'inspector-result-text');
    words.dataset.noI18n = '';
    const name = element('span', 'inspector-result-name');
    const dot = element('span', 'inspector-result-dot');
    text(dot, ' · ');
    const place = element('span', 'inspector-result-place');
    words.append(name, dot, place);
    const css = element('span', 'inspector-result-css');
    css.dataset.noI18n = '';
    const off = element('span', 'inspector-result-off');
    label(off, 'Unavailable');
    off.hidden = true;
    node.append(words, css, off);
    return node;
  }

  function updateRow(node: HTMLElement, row: Row): void {
    const entry = row.entry;
    const [words, css, off] = Array.from(node.children) as HTMLElement[];
    const [name, , place] = Array.from(words.children) as HTMLElement[];
    text(name, entry.name);
    text(place, entry.place);
    text(css, entry.css);
    if (off.hidden === entry.off) off.hidden = !entry.off;
    if (node.classList.contains('is-off') !== entry.off) node.classList.toggle('is-off', entry.off);
    if (node.classList.contains('is-section') !== (entry.kind === 'section')) node.classList.toggle('is-section', entry.kind === 'section');
    if (node.classList.contains('is-choice') !== (entry.kind === 'choice')) node.classList.toggle('is-choice', entry.kind === 'choice');
    if (entry.off) labelAttr(node, 'title', 'Not available for the current selection'); else if (node.hasAttribute('title')) node.removeAttribute('title');
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
    if (!on) return;
    if (dirty) { index = build(); dirty = false; }
    const scored: Row[] = [];
    const values = new Map<string, number>();
    index.forEach((entry, order) => {
      const value = score(entry, tokens);
      if (value < 0) return;
      scored.push({ key: entry.key, entry, value, order });
      values.set(entry.key, value);
    });
    const groups = new Map<string, { best: number; order: number; items: Row[] }>();
    for (const item of scored) {
      const parent = values.get(item.entry.parent);
      if (parent !== undefined && parent > item.value) item.value = parent;
      const id = item.entry.group;
      const group = groups.get(id);
      if (group) { group.best = Math.min(group.best, item.value); group.items.push(item); }
      else groups.set(id, { best: item.value, order: item.order, items: [item] });
    }
    const rows: Row[] = [];
    Array.from(groups.values()).sort((a, b) => a.best - b.best || a.order - b.order).forEach(group => {
      if (rows.length >= MAX_ROWS) return;
      group.items.sort((a, b) => a.value - b.value || a.order - b.order);
      rows.push(...group.items.slice(0, MAX_ROWS - rows.length));
    });
    keyed(list, rows, row => row.key, createRow, updateRow);
    if (empty.hidden !== rows.length > 0) empty.hidden = rows.length > 0;
    const capped = scored.length > MAX_ROWS;
    if (more.hidden === capped) more.hidden = !capped;
  }

  function clear(): void {
    input.value = '';
    refresh();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (input.value) { clear(); return; }
    const tab = options.tabs.find(item => !item.pane.hidden && item.button.getClientRects().length);
    if (tab) tab.button.focus({ preventScroll: true }); else input.blur();
  });
  results.addEventListener('mousedown', event => {
    if (event.target !== results || (event.offsetX < results.clientWidth && event.offsetY < results.clientHeight)) event.preventDefault();
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
