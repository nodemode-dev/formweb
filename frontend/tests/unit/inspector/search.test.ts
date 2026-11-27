import { beforeEach, describe, expect, it } from 'vitest';
import { installInspectorSearch, type InspectorSearch, type SearchTab } from '../../../src/features/inspector/search';

interface FieldSpec { label: string; style?: string; attr?: string; field?: string; hidden?: boolean; disabled?: boolean; labelButton?: string; wrapLabel?: boolean }

function field(spec: FieldSpec): HTMLElement {
  const box = document.createElement('label');
  box.className = 'field';
  box.hidden = !!spec.hidden;
  const head = document.createElement('span');
  head.className = 'field-label';
  if (spec.wrapLabel) { const inner = document.createElement('span'); inner.textContent = spec.label; head.append(inner); }
  else head.append(spec.label);
  if (spec.labelButton) { const button = document.createElement('button'); button.type = 'button'; button.textContent = spec.labelButton; head.append(button); }
  const input = document.createElement('input');
  if (spec.style) input.dataset.style = spec.style;
  if (spec.attr) input.dataset.attr = spec.attr;
  if (spec.field) input.dataset.field = spec.field;
  input.disabled = !!spec.disabled;
  box.append(head, input);
  return box;
}

function section(title: string, fields: FieldSpec[], options: { hidden?: boolean; collapsed?: boolean } = {}): HTMLElement {
  const box = document.createElement('div');
  box.className = 'inspector-section';
  box.hidden = !!options.hidden;
  const head = document.createElement('div');
  head.className = 'section-title';
  const name = document.createElement('span');
  name.textContent = title;
  head.append(name);
  const body = document.createElement('div');
  body.append(...fields.map(field));
  if (options.collapsed) { box.classList.add('is-collapsed'); body.hidden = false; }
  head.addEventListener('click', () => box.classList.toggle('is-collapsed'));
  box.append(head, body);
  return box;
}

function tab(id: string, name: string, sections: HTMLElement[]): SearchTab {
  const button = document.createElement('button');
  button.textContent = name;
  const pane = document.createElement('div');
  pane.append(...sections);
  return { id, button, pane };
}

let search: InspectorSearch;
let input: HTMLInputElement;
let scroll: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  const tabs = [
    tab('design', 'Design', [
      section('Appearance', [{ label: 'Background', style: 'background' }, { label: 'Radius', style: 'border-radius' }, { label: 'Shadow', style: 'box-shadow' }, { label: 'Object fit', style: 'object-fit', hidden: true }]),
      section('Spacing', [{ label: 'Padding', style: 'padding', labelButton: 'Reset' }, { label: 'Margin', style: 'margin', labelButton: 'Clear', wrapLabel: true }, { label: 'Gap', style: 'gap' }]),
      section('Typography', [{ label: 'Font size', style: 'font-size' }, { label: 'Font family', style: 'font-family' }, { label: 'Letter spacing', style: 'letter-spacing', disabled: true }]),
      section('Image', [{ label: 'Caption', attr: 'title' }], { hidden: true })
    ]),
    tab('content', 'Content', [
      section('Link', [{ label: 'Link URL', attr: 'href' }]),
      section('Image', [{ label: 'Alternative text', attr: 'alt' }], { collapsed: true })
    ]),
    tab('page', 'Page', [
      section('SEO', [{ label: 'Title', field: 'seo.title' }, { label: 'Description', field: 'seo.description' }])
    ])
  ];
  const head = document.createElement('div');
  scroll = document.createElement('div');
  scroll.append(...tabs.map(entry => entry.pane));
  document.body.append(head, ...tabs.map(entry => entry.button), scroll);
  search = installInspectorSearch({ after: head, scroll, tabs });
  input = document.querySelector<HTMLInputElement>('.inspector-search-input')!;
});

function query(value: string): void {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const names = (): string[] => Array.from(document.querySelectorAll('.inspector-result')).map(row => row.querySelector('.inspector-result-name')!.textContent || '');
const groups = (): string[] => Array.from(document.querySelectorAll('.inspector-result-place')).map(row => row.textContent || '');
function key(name: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

describe('what a query finds', () => {
  it('bg finds Background under Design > Appearance', () => {
    query('bg');
    expect(names()).toContain('Background');
    expect(groups()).toContain('Design > Appearance');
  });

  it('rounded finds Radius', () => {
    query('rounded');
    expect(names()).toContain('Radius');
  });

  it('shadow finds Shadow by its label', () => {
    query('shadow');
    expect(names()[0]).toBe('Shadow');
  });

  it('spacing finds Padding, Margin and Gap', () => {
    query('spacing');
    expect(names()).toEqual(expect.arrayContaining(['Padding', 'Margin', 'Gap']));
  });

  it('font finds the Typography fields', () => {
    query('font');
    expect(names()).toEqual(expect.arrayContaining(['Font size', 'Font family']));
    expect(groups()).toContain('Design > Typography');
  });

  it('href finds Link URL', () => {
    query('href');
    expect(names()).toContain('Link URL');
  });

  it('alt finds Alternative text', () => {
    query('alt');
    expect(names()).toContain('Alternative text');
    expect(groups()).toContain('Content > Image');
  });

  it('seo finds the page title and description', () => {
    query('seo');
    expect(names()).toEqual(expect.arrayContaining(['Title', 'Description']));
    expect(groups()).toContain('Page > SEO');
  });

  it('a CSS property name finds its field', () => {
    query('border-radius');
    expect(names()).toContain('Radius');
  });

  it('case does not matter', () => {
    query('padding');
    const lower = names();
    query('PADDING');
    expect(names()).toEqual(lower);
    expect(lower).toContain('Padding');
  });

  it('several words must all match', () => {
    query('font family');
    expect(names()).toContain('Font family');
    expect(names()).not.toContain('Font size');
  });
});

describe('what a query never lists', () => {
  it('a field hidden for the current element is not listed', () => {
    query('object');
    expect(names()).toEqual([]);
  });

  it('a field in a hidden section is not listed', () => {
    query('caption');
    expect(names()).toEqual([]);
  });

  it('no result name contains the text of a button inside a label', () => {
    query('spacing');
    expect(names().filter(name => /Reset|Clear/.test(name))).toEqual([]);
    query('reset');
    expect(names().filter(name => /Reset/.test(name))).toEqual([]);
  });

  it('a query with no match shows No matching properties', () => {
    query('zzqx');
    const empty = document.querySelector<HTMLElement>('.inspector-results-empty')!;
    expect(names()).toEqual([]);
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No matching properties');
  });

  it('a field that is shown but switched off is listed as Unavailable', () => {
    query('letter');
    const row = Array.from(document.querySelectorAll<HTMLElement>('.inspector-result')).find(entry => entry.querySelector('.inspector-result-name')!.textContent === 'Letter spacing')!;
    const off = row.querySelector<HTMLElement>('.inspector-result-off')!;
    expect(off.hidden).toBe(false);
    expect(off.textContent).toBe('Unavailable');
  });

  it('a field that can be used is not marked Unavailable', () => {
    query('font size');
    const row = document.querySelector<HTMLElement>('.inspector-result:not(.is-section)')!;
    expect(row.querySelector<HTMLElement>('.inspector-result-off')!.hidden).toBe(true);
  });

  it('the empty message is hidden while there are matches', () => {
    query('bg');
    expect(document.querySelector<HTMLElement>('.inspector-results-empty')!.hidden).toBe(true);
  });
});

describe('going to a result and back', () => {
  it('Enter, the arrow keys and a click on a result go nowhere: the folded section stays folded and focus stays in the box', () => {
    query('alternative');
    expect(names()).toContain('Alternative text');
    const target = document.querySelector<HTMLInputElement>('[data-attr="alt"]')!;
    const folded = target.closest('.inspector-section')!;
    expect(folded.classList.contains('is-collapsed')).toBe(true);
    const before = document.body.innerHTML;
    key('Enter');
    key('ArrowDown');
    key('Enter');
    document.querySelector<HTMLElement>('.inspector-result')!.click();
    expect(folded.classList.contains('is-collapsed')).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(document.body.innerHTML).toBe(before);
  });

  it('Escape clears the search and shows the panel again at the same scroll position', () => {
    scroll.scrollTop = 120;
    const before = scroll.scrollTop;
    query('bg');
    expect(scroll.hidden).toBe(true);
    scroll.scrollTop = 0;
    key('Escape');
    expect(input.value).toBe('');
    expect(scroll.hidden).toBe(false);
    expect(scroll.scrollTop).toBe(before);
    expect(document.querySelector<HTMLElement>('.inspector-results')!.hidden).toBe(true);
  });

  it('clear empties the field and hides the results', () => {
    query('bg');
    search.clear();
    expect(input.value).toBe('');
    expect(document.querySelector<HTMLElement>('.inspector-results')!.hidden).toBe(true);
  });
});
