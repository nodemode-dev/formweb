import { command } from '../../api';
import { element, keyed, options, text, value } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { t } from '../../i18n';
import type { InspectorContext } from './context';
import type { EditorState } from '../../types';

interface ValueDef { type: 'number' | 'text' | 'boolean'; initial: number | string | boolean; min?: number; max?: number; step?: number; options?: string[]; cssVar?: boolean }
interface InputDef { variable: string; event?: string }
interface OutputDef { from: string; decimals?: number; prefix?: string; suffix?: string; grouping?: boolean; reserve?: number }
interface Group {
  values: Record<string, ValueDef>;
  tables: Record<string, Record<string, number | string>>;
  formulas: Record<string, string>;
  inputs: Record<string, InputDef>;
  outputs: Record<string, OutputDef>;
}
type Kind = keyof Group;
type Item = { id: string; name: string };

const TYPES = ['number', 'text', 'boolean'];
const INPUT_TAGS = ['input', 'select', 'textarea'];

function readGroup(next: EditorState): Group {
  const raw = (next.site.extensions?.variables || {}) as Partial<Group>;
  return { values: raw.values || {}, tables: raw.tables || {}, formulas: raw.formulas || {}, inputs: raw.inputs || {}, outputs: raw.outputs || {} };
}

function nodeItems(next: EditorState, inputLike: boolean): Item[] {
  const seen = new Set<string>();
  const order: { id: string; page: string }[] = [];
  const walk = (id: string, page: string): void => {
    const node = next.site.nodes[id];
    if (!node || seen.has(id)) return;
    seen.add(id);
    order.push({ id, page });
    node.children.forEach(child => walk(child, page));
  };
  for (const page of next.site.pages) walk(page.root, page.name);
  for (const id of Object.keys(next.site.nodes)) walk(id, '');
  const multi = next.site.pages.length > 1;
  return order.filter(entry => INPUT_TAGS.includes(next.site.nodes[entry.id].tag) === inputLike).map(entry => {
    const node = next.site.nodes[entry.id];
    const label = `${node.name || node.id} (${node.tag})`;
    return { id: entry.id, name: multi && entry.page ? t('{0} in {1}', [{ t: label }, { t: entry.page }]) : label };
  });
}

function fieldValue(raw: string): number | string {
  const trimmed = raw.trim();
  const number = Number(trimmed);
  return trimmed !== '' && Number.isFinite(number) ? number : raw;
}

function parseNumber(raw: string, label: string): number {
  const number = Number(raw.trim());
  if (raw.trim() === '' || !Number.isFinite(number)) throw new Error(t('{0} must be a number.', [{ t: label }]));
  return number;
}

export function installVariables(ctx: InspectorContext): { fill(next: EditorState): void } {
  const block = element('div', 'fw-ext-block');
  block.append(element('div', 'fw-ext-head', t('Variables')));
  ctx.panes.tokens.append(block);

  const put = (kind: Kind, name: string, content: unknown): Promise<unknown> => command('variables.set', { kind, name, value: content });
  const drop = (kind: Kind, name: string): Promise<unknown> => command('variables.remove', { kind, name });

  function attempt(error: HTMLElement, action: () => Promise<unknown>): void {
    void ctx.run(async () => {
      try {
        await action();
        if (!error.hidden) error.hidden = true;
      } catch (failure) {
        text(error, failure instanceof Error ? failure.message : String(failure));
        error.hidden = false;
        throw failure;
      }
    });
  }

  function heading(label: string, small = false): void { block.append(element('div', small ? 'micro fw-theme-other' : 'fw-ext-head fw-theme-other', label)); }
  function listBox(): HTMLElement { const box = element('div', 'fw-font-list'); block.append(box); return box; }
  function emptyNote(label: string): HTMLElement { const note = element('p', 'micro', label); block.append(note); return note; }
  function checkbox(label: string): { wrap: HTMLElement; box: HTMLInputElement } {
    const box = element('input');
    box.type = 'checkbox';
    const wrap = element('label', 'checkbox-field');
    wrap.append(box, element('span', '', label));
    return { wrap, box };
  }
  function check(box: HTMLInputElement, on: boolean): void { if (document.activeElement !== box && box.checked !== on) box.checked = on; }
  function toggle(node: HTMLElement, show: boolean): void { if (node.hidden === show) node.hidden = !show; }
  function rowShell(kind: Kind, row: HTMLElement, error: HTMLElement, mono = false): HTMLElement {
    const top = element('div', 'fw-font-top');
    const label = element('span', 'fw-font-name fw-font-src');
    const remove = ctx.button('', undefined, () => drop(kind, row.dataset.key!), 'icon-button');
    remove.append(icon('trash'));
    remove.title = t('Remove');
    remove.setAttribute('aria-label', t('Remove'));
    if (mono) label.classList.add('fw-code-area');
    top.append(label, remove);
    error.hidden = true;
    return top;
  }
  function addRow(label: string, fields: HTMLElement[], action: () => Promise<unknown>): void {
    const grid = element('div', 'form-grid');
    grid.append(...fields);
    const button = ctx.button(label, 'plus', action, 'fw-ext-add');
    block.append(grid, button);
  }
  function addNamed(kind: Kind, label: string, make: () => unknown): void {
    const name = ctx.input('seats');
    addRow(label, [ctx.field(t('Name'), name, true)], async () => {
      const key = name.value.trim();
      if (!key) throw new Error(t('Enter a name.'));
      await put(kind, key, make());
      name.value = '';
    });
  }

  heading(t('Values'), true);
  const valuesList = listBox();
  const valuesEmpty = emptyNote(t('No values yet.'));
  addNamed('values', t('Add value'), () => ({ type: 'number', initial: 0 }));

  heading(t('Tables'), true);
  const tablesList = listBox();
  const tablesEmpty = emptyNote(t('No tables yet.'));
  addNamed('tables', t('Add table'), () => ({}));

  heading(t('Formulas'), true);
  const formulasList = listBox();
  const formulasEmpty = emptyNote(t('No formulas yet.'));
  addNamed('formulas', t('Add formula'), () => '0');

  heading(t('Bindings'));
  heading(t('Inputs'), true);
  const inputsList = listBox();
  const inputsEmpty = emptyNote(t('No inputs bound yet.'));
  const addInputNode = ctx.select([]);
  const addInputValue = ctx.select([]);
  const addInputEvent = ctx.select([{ id: 'input', name: 'input' }, { id: 'change', name: 'change' }]);
  addRow(t('Bind input'), [ctx.field(t('Element'), addInputNode, true), ctx.field(t('Value'), addInputValue), ctx.field(t('Event'), addInputEvent)], async () => {
    if (!addInputNode.value) throw new Error(t('Choose an input, select or textarea element first.'));
    if (!addInputValue.value) throw new Error(t('Add a value first.'));
    await put('inputs', addInputNode.value, { variable: addInputValue.value, event: addInputEvent.value });
  });

  heading(t('Outputs'), true);
  const outputsList = listBox();
  const outputsEmpty = emptyNote(t('No outputs bound yet.'));
  const addOutputNode = ctx.select([]);
  const addOutputFrom = ctx.select([]);
  addRow(t('Bind output'), [ctx.field(t('Element'), addOutputNode, true), ctx.field(t('From'), addOutputFrom, true)], async () => {
    if (!addOutputNode.value) throw new Error(t('Choose an element first.'));
    if (!addOutputFrom.value) throw new Error(t('Add a value or formula first.'));
    await put('outputs', addOutputNode.value, { from: addOutputFrom.value });
  });

  block.append(element('p', 'micro', t('Values, tables and formulas share one namespace. Inputs write a value and outputs show a value or formula as text. Formulas use min, max, round, floor, ceil, abs, clamp, sum, lookup and if.')));

  function valueRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const error = element('p', 'micro error', '');
    const top = rowShell('values', row, error);
    const fields = element('div', 'form-grid');
    const type = ctx.select(TYPES.map(id => ({ id, name: t(id === 'number' ? 'Number' : id === 'text' ? 'Text' : 'Boolean') })));
    const initial = ctx.input();
    const initialBool = ctx.select([{ id: 'false', name: t('False') }, { id: 'true', name: t('True') }]);
    const min = ctx.input();
    const max = ctx.input();
    const step = ctx.input();
    const choices = ctx.input('solo, team, studio');
    const css = checkbox(t('CSS variable'));
    const wrapInitial = ctx.field(t('Initial'), initial);
    const wrapBool = ctx.field(t('Initial'), initialBool);
    const wraps = { min: ctx.field(t('Min'), min), max: ctx.field(t('Max'), max), step: ctx.field(t('Step'), step), choices: ctx.field(t('Options, comma separated'), choices, true) };
    fields.append(ctx.field(t('Type'), type), wrapInitial, wrapBool, wraps.min, wraps.max, wraps.step, wraps.choices, css.wrap);
    const shape = (kind: string): void => {
      toggle(wrapInitial, kind !== 'boolean');
      toggle(wrapBool, kind === 'boolean');
      toggle(wraps.min, kind === 'number');
      toggle(wraps.max, kind === 'number');
      toggle(wraps.step, kind === 'number');
      toggle(wraps.choices, kind === 'text');
      toggle(css.wrap, kind !== 'text');
    };
    const commit = (reset = false): void => attempt(error, () => {
      const kind = type.value as ValueDef['type'];
      let def: ValueDef;
      if (reset) def = { type: kind, initial: kind === 'number' ? 0 : kind === 'boolean' ? false : '' };
      else if (kind === 'number') {
        def = { type: kind, initial: parseNumber(initial.value, t('Initial')) };
        if (min.value.trim()) def.min = parseNumber(min.value, t('Min'));
        if (max.value.trim()) def.max = parseNumber(max.value, t('Max'));
        if (step.value.trim()) def.step = parseNumber(step.value, t('Step'));
      } else if (kind === 'boolean') def = { type: kind, initial: initialBool.value === 'true' };
      else {
        def = { type: kind, initial: initial.value };
        const list = choices.value.split(',').map(item => item.trim()).filter(Boolean);
        if (list.length) def.options = list;
      }
      if (kind !== 'text' && css.box.checked) def.cssVar = true;
      return put('values', row.dataset.key!, def);
    });
    type.addEventListener('change', () => { shape(type.value); commit(true); });
    for (const control of [initial, initialBool, min, max, step, choices, css.box]) control.addEventListener('change', () => commit());
    row.append(top, fields, error);
    return row;
  }

  function tableRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const error = element('p', 'micro error', '');
    const top = rowShell('tables', row, error);
    const entries = element('div', 'fw-font-list');
    const gather = (): Record<string, number | string> => {
      const map: Record<string, number | string> = {};
      for (const entry of Array.from(entries.children)) {
        const [key, content] = Array.from(entry.querySelectorAll('input')) as HTMLInputElement[];
        map[key.value] = fieldValue(content.value);
      }
      return map;
    };
    const commit = (map: Record<string, number | string>): void => attempt(error, () => put('tables', row.dataset.key!, map));
    const add = ctx.button(t('Add entry'), 'plus', () => {
      const map = gather();
      let key = 'key';
      for (let n = 2; key in map; n++) key = `key${n}`;
      map[key] = 0;
      return put('tables', row.dataset.key!, map);
    }, 'fw-ext-add');
    entries.addEventListener('change', () => commit(gather()));
    entries.addEventListener('click', event => {
      const target = (event.target as Element).closest('button');
      if (!target) return;
      target.parentElement!.remove();
      commit(gather());
    });
    row.append(top, entries, add, error);
    return row;
  }

  function entryRow(): HTMLElement {
    const entry = element('div', 'fw-font-top');
    const key = ctx.input(t('Key'));
    const content = ctx.input(t('Value'));
    const remove = element('button', 'icon-button');
    remove.type = 'button';
    remove.append(icon('trash'));
    remove.title = t('Remove entry');
    remove.setAttribute('aria-label', t('Remove entry'));
    entry.append(key, content, remove);
    return entry;
  }

  function formulaRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const error = element('p', 'micro error', '');
    const top = rowShell('formulas', row, error, true);
    const expression = ctx.input('seats * lookup(price, plan)', 'fw-code-area');
    expression.spellcheck = false;
    expression.addEventListener('change', () => attempt(error, () => put('formulas', row.dataset.key!, expression.value)));
    row.append(top, expression, error);
    return row;
  }

  function inputRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const error = element('p', 'micro error', '');
    const top = rowShell('inputs', row, error);
    const variable = ctx.select([]);
    const event = ctx.select([{ id: 'input', name: 'input' }, { id: 'change', name: 'change' }]);
    const commit = (): void => attempt(error, () => put('inputs', row.dataset.key!, { variable: variable.value, event: event.value }));
    variable.addEventListener('change', commit);
    event.addEventListener('change', commit);
    const fields = element('div', 'form-grid');
    fields.append(ctx.field(t('Value'), variable), ctx.field(t('Event'), event));
    row.append(top, fields, error);
    return row;
  }

  function outputRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const error = element('p', 'micro error', '');
    const top = rowShell('outputs', row, error);
    const from = ctx.select([]);
    const decimals = ctx.input('0');
    const prefix = ctx.input('$');
    const suffix = ctx.input('/mo');
    const reserve = ctx.input();
    const grouping = checkbox(t('Thousands separators'));
    const commit = (): void => attempt(error, () => {
      const def: OutputDef = { from: from.value };
      if (decimals.value.trim()) def.decimals = parseNumber(decimals.value, t('Decimals'));
      if (prefix.value) def.prefix = prefix.value;
      if (suffix.value) def.suffix = suffix.value;
      def.grouping = grouping.box.checked;
      if (reserve.value.trim()) def.reserve = parseNumber(reserve.value, t('Reserve'));
      return put('outputs', row.dataset.key!, def);
    });
    for (const control of [from, decimals, prefix, suffix, reserve, grouping.box]) control.addEventListener('change', commit);
    const fields = element('div', 'form-grid');
    fields.append(ctx.field(t('From'), from, true), ctx.field(t('Decimals'), decimals), ctx.field(t('Reserve, in characters'), reserve), ctx.field(t('Prefix'), prefix), ctx.field(t('Suffix'), suffix), grouping.wrap);
    row.append(top, fields, error);
    return row;
  }

  function title(row: HTMLElement, label: string): void { text(row.querySelector('.fw-font-name') as HTMLElement, label); }
  function nodeName(next: EditorState, id: string): string { return next.site.nodes[id]?.name || id; }
  function sync(control: HTMLInputElement | HTMLSelectElement, next: string, error?: HTMLElement): void {
    if (document.activeElement !== control && control.value !== next) {
      control.value = next;
      if (error && !error.hidden) error.hidden = true;
    }
  }

  return {
    fill(next) {
      const group = readGroup(next);
      const valueNames = Object.keys(group.values);
      const bindable = valueNames.map(id => ({ id, name: id }));
      const sources = [...valueNames, ...Object.keys(group.formulas)].map(id => ({ id, name: id }));

      valuesEmpty.hidden = valueNames.length > 0;
      keyed(valuesList, Object.entries(group.values), item => item[0], valueRow, (row, [key, def]) => {
        title(row, key);
        const controls = Array.from(row.querySelectorAll('input, select')) as (HTMLInputElement | HTMLSelectElement)[];
        const [type, initial, initialBool, min, max, step, choices, css] = controls as [HTMLSelectElement, HTMLInputElement, HTMLSelectElement, HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLInputElement];
        value(type, def.type);
        value(initial, def.type === 'boolean' ? '' : String(def.initial));
        value(initialBool, def.type === 'boolean' ? String(def.initial) : 'false');
        value(min, def.min === undefined ? '' : String(def.min));
        value(max, def.max === undefined ? '' : String(def.max));
        value(step, def.step === undefined ? '' : String(def.step));
        value(choices, (def.options || []).join(', '));
        check(css, !!def.cssVar);
        const wrap = (control: HTMLElement): HTMLElement => control.parentElement as HTMLElement;
        toggle(wrap(initial), def.type !== 'boolean');
        toggle(wrap(initialBool), def.type === 'boolean');
        for (const control of [min, max, step]) toggle(wrap(control), def.type === 'number');
        toggle(wrap(choices), def.type === 'text');
        toggle(wrap(css), def.type !== 'text');
      });

      tablesEmpty.hidden = Object.keys(group.tables).length > 0;
      keyed(tablesList, Object.entries(group.tables), item => item[0], tableRow, (row, [key, table]) => {
        title(row, key);
        const entries = row.children[1] as HTMLElement;
        const pairs = Object.entries(table);
        while (entries.children.length > pairs.length) entries.lastElementChild!.remove();
        while (entries.children.length < pairs.length) entries.append(entryRow());
        pairs.forEach(([entryKey, content], index) => {
          const inputs = entries.children[index].querySelectorAll('input') as NodeListOf<HTMLInputElement>;
          value(inputs[0], entryKey);
          value(inputs[1], String(content));
        });
      });

      formulasEmpty.hidden = Object.keys(group.formulas).length > 0;
      keyed(formulasList, Object.entries(group.formulas), item => item[0], formulaRow, (row, [key, source]) => {
        title(row, key);
        sync(row.querySelector('input') as HTMLInputElement, source, row.lastElementChild as HTMLElement);
      });

      const inputNodes = nodeItems(next, true);
      options(addInputNode, inputNodes);
      options(addInputValue, bindable);
      const outputNodes = nodeItems(next, false);
      options(addOutputNode, outputNodes);
      options(addOutputFrom, sources);

      inputsEmpty.hidden = Object.keys(group.inputs).length > 0;
      keyed(inputsList, Object.entries(group.inputs), item => item[0], inputRow, (row, [id, def]) => {
        title(row, nodeName(next, id));
        const selects = row.querySelectorAll('select') as NodeListOf<HTMLSelectElement>;
        options(selects[0], bindable);
        value(selects[0], def.variable);
        value(selects[1], def.event || 'input');
      });

      outputsEmpty.hidden = Object.keys(group.outputs).length > 0;
      keyed(outputsList, Object.entries(group.outputs), item => item[0], outputRow, (row, [id, def]) => {
        title(row, nodeName(next, id));
        const select = row.querySelector('select') as HTMLSelectElement;
        options(select, sources);
        value(select, def.from);
        const inputs = row.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
        value(inputs[0], def.decimals === undefined ? '' : String(def.decimals));
        value(inputs[1], def.reserve === undefined ? '' : String(def.reserve));
        value(inputs[2], def.prefix || '');
        value(inputs[3], def.suffix || '');
        check(inputs[4], !!def.grouping);
      });
    }
  };
}
