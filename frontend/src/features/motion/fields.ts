import { element, value } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';
import { MOTION_SAFE } from './context';
import { buttonOf, english, fieldOf, iconButtonOf, inputOf, noteOf, selectOf, type Choice } from './labels';
import type { InspectorContext } from '../inspector/context';

export interface NumberField {
  root: HTMLElement;
  control: HTMLInputElement;
  set(next: number | undefined): void;
}

export interface CheckField {
  root: HTMLElement;
  control: HTMLInputElement;
  set(next: boolean): void;
}

export interface SelectField<T extends string> {
  root: HTMLElement;
  control: HTMLSelectElement;
  set(next: T | undefined): void;
}

export interface EntryShell {
  block: HTMLElement;
  body: HTMLElement;
  sync(has: boolean): void;
}

export function show(node: HTMLElement, on: boolean): void {
  if (node.hidden === on) node.hidden = !on;
}

export function numberField(ctx: InspectorContext, name: string, min: number, max: number, step: number, onCommit: (next: number | undefined) => void, full = false): NumberField {
  const control = ctx.input('');
  control.type = 'number';
  control.min = String(min);
  control.max = String(max);
  control.step = String(step);
  control.addEventListener('change', () => {
    const raw = control.value.trim();
    if (raw === '') { onCommit(undefined); return; }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onCommit(Math.min(max, Math.max(min, parsed)));
  });
  return {
    root: fieldOf(ctx, name, control, full),
    control,
    set(next) { value(control, next === undefined ? '' : String(next)); }
  };
}

export function checkField(ctx: InspectorContext, name: string, onCommit: (next: boolean) => void): CheckField {
  void ctx;
  const control = element('input');
  control.type = 'checkbox';
  control.addEventListener('change', () => onCommit(control.checked));
  const root = element('label', 'checkbox-field');
  root.append(control, noteOf('', name, 'span'));
  return {
    root,
    control,
    set(next) { if (control.checked !== next && document.activeElement !== control) control.checked = next; }
  };
}

export function selectField<T extends string>(ctx: InspectorContext, name: string, items: { id: T; name: string }[], onCommit: (next: T) => void, full = false): SelectField<T> {
  const control = selectOf(ctx, english(items));
  control.addEventListener('change', () => onCommit(control.value as T));
  return {
    root: fieldOf(ctx, name, control, full),
    control,
    set(next) { if (next !== undefined) value(control, next); }
  };
}

export function entryShell(ctx: InspectorContext, container: HTMLElement, title: string, hint: string, onAdd: () => void, onRemove: () => void): EntryShell {
  const block = ctx.section(container, title);
  const empty = element('div', 'fw-motion-empty');
  const note = element('p', 'micro');
  label(note, hint);
  empty.append(note, buttonOf(ctx, 'Add', 'plus', onAdd));
  const body = element('div', 'fw-motion-body');
  const actions = element('div', 'fw-ext-actions');
  actions.append(buttonOf(ctx, 'Remove', 'trash', onRemove));
  const editor = element('div', 'fw-motion-editor');
  body.append(editor, actions);
  block.append(empty, body);
  body.hidden = true;
  const shell: EntryShell = {
    block,
    body: editor,
    sync(has) {
      if (body.hidden === has) body.hidden = !has;
      if (empty.hidden !== has) empty.hidden = has;
    }
  };
  return shell;
}

const CURVES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
const CURVE_RE = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;
const SPRING_RE = /^spring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/;

interface EasingParts { mode: string; curve: number[]; spring: number[] }

function parseEasing(source: string): EasingParts {
  const trimmed = (source || 'ease').trim();
  const curve = CURVE_RE.exec(trimmed);
  if (curve) return { mode: 'cubic-bezier', curve: curve.slice(1).map(Number), spring: [100, 10] };
  const spring = SPRING_RE.exec(trimmed);
  if (spring) return { mode: 'spring', curve: [0.25, 0.1, 0.25, 1], spring: spring.slice(1).map(Number) };
  return { mode: CURVES.includes(trimmed) ? trimmed : 'ease', curve: [0.25, 0.1, 0.25, 1], spring: [100, 10] };
}

function clamp(number: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, number));
}

export function easingPicker(ctx: InspectorContext, container: HTMLElement, name: string, current: string, onChange: (next: string) => void): { set(next: string): void } {
  const names: Record<string, string> = { linear: 'Linear', ease: 'Ease', 'ease-in': 'Ease in', 'ease-out': 'Ease out', 'ease-in-out': 'Ease in out', 'cubic-bezier': 'Custom curve', spring: 'Spring' };
  const mode = selectOf(ctx, english(Object.keys(names).map(id => ({ id, name: names[id] }))));
  const holder = element('div', 'fw-easing');
  const pick = fieldOf(ctx, name, mode, true);
  const curveBox = element('div', 'form-grid fw-easing-curve full-row');
  const springBox = element('div', 'form-grid full-row');
  const state: EasingParts = parseEasing(current);

  const output = (): string => {
    if (state.mode === 'cubic-bezier') return `cubic-bezier(${state.curve.join(',')})`;
    if (state.mode === 'spring') return `spring(${state.spring.join(',')})`;
    return state.mode;
  };
  const commit = (): void => onChange(output());

  const curveFields = [
    { name: 'X1', min: 0, max: 1, step: 0.01 },
    { name: 'Y1', min: -2, max: 3, step: 0.01 },
    { name: 'X2', min: 0, max: 1, step: 0.01 },
    { name: 'Y2', min: -2, max: 3, step: 0.01 }
  ].map((spec, index) => {
    const field = numberField(ctx, spec.name, spec.min, spec.max, spec.step, next => {
      state.curve[index] = clamp(next ?? state.curve[index], spec.min, spec.max);
      field.set(state.curve[index]);
      commit();
    });
    curveBox.append(field.root);
    return field;
  });
  const stiffness = numberField(ctx, 'Stiffness', 1, 1000, 1, next => {
    state.spring[0] = Math.round(clamp(next ?? state.spring[0], 1, 1000));
    stiffness.set(state.spring[0]);
    commit();
  });
  const damping = numberField(ctx, 'Damping', 1, 100, 1, next => {
    state.spring[1] = Math.round(clamp(next ?? state.spring[1], 1, 100));
    damping.set(state.spring[1]);
    commit();
  });
  springBox.append(stiffness.root, damping.root);
  holder.append(pick, curveBox, springBox);
  container.append(holder);

  const show = (): void => {
    const curve = state.mode === 'cubic-bezier';
    const spring = state.mode === 'spring';
    if (curveBox.hidden === curve) curveBox.hidden = !curve;
    if (springBox.hidden === spring) springBox.hidden = !spring;
  };
  const paint = (): void => {
    value(mode, state.mode);
    state.curve.forEach((number, index) => curveFields[index].set(number));
    stiffness.set(state.spring[0]);
    damping.set(state.spring[1]);
    show();
  };
  mode.addEventListener('change', () => {
    state.mode = mode.value;
    show();
    commit();
  });
  paint();

  return {
    set(next) {
      if ((next || 'ease') === output()) return;
      const parts = parseEasing(next);
      state.mode = parts.mode;
      if (parts.mode === 'cubic-bezier') state.curve = parts.curve;
      if (parts.mode === 'spring') state.spring = parts.spring;
      paint();
    }
  };
}

interface StyleRow {
  root: HTMLElement;
  key: HTMLSelectElement;
  custom: HTMLInputElement;
  value: HTMLInputElement;
}

const CUSTOM = '__custom';

export function styleRowsEditor(ctx: InspectorContext, container: HTMLElement, styles: Record<string, string>, onChange: (next: Record<string, string>) => void): { set(next: Record<string, string>): void } {
  const holder = element('div', 'fw-style-rows');
  const list = element('div', 'fw-style-list');
  const rows: StyleRow[] = [];
  const keyItems: Choice[] = [...MOTION_SAFE.map(name => ({ id: name as string, name })), { id: CUSTOM, name: 'Custom property', en: true }];

  const rowKey = (row: StyleRow): string => {
    if (row.key.value !== CUSTOM) return row.key.value;
    const raw = row.custom.value.trim();
    if (!raw) return '';
    return raw.startsWith('--') ? raw : `--${raw}`;
  };
  const collect = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const row of rows) {
      const key = rowKey(row);
      const content = row.value.value.trim();
      if (key && content) out[key] = content;
    }
    return out;
  };
  const same = (a: Record<string, string>, b: Record<string, string>): boolean => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
  };
  const emit = (): void => onChange(collect());
  const showCustom = (row: StyleRow): void => {
    const on = row.key.value === CUSTOM;
    if (row.custom.hidden === on) row.custom.hidden = !on;
  };
  const build = (): StyleRow => {
    const key = selectOf(ctx, keyItems);
    labelAttr(key, 'aria-label', 'Property');
    const custom = ctx.input('--name');
    labelAttr(custom, 'aria-label', 'Custom property name');
    custom.hidden = true;
    const content = inputOf(ctx, 'Value');
    labelAttr(content, 'aria-label', 'Value');
    const root = element('div', 'fw-style-row');
    const row: StyleRow = { root, key, custom, value: content };
    const drop = iconButtonOf(ctx, 'Remove style', 'close', undefined, 'icon-button');
    drop.addEventListener('click', () => {
      const had = rowKey(row) && row.value.value.trim();
      const at = rows.indexOf(row);
      if (at >= 0) rows.splice(at, 1);
      root.remove();
      if (had) emit();
    });
    key.addEventListener('change', () => { showCustom(row); emit(); });
    custom.addEventListener('change', emit);
    content.addEventListener('change', emit);
    root.append(key, custom, content, drop);
    return row;
  };
  const place = (row: StyleRow, name: string, content: string): void => {
    const custom = !MOTION_SAFE.includes(name as typeof MOTION_SAFE[number]);
    value(row.key, custom ? CUSTOM : name);
    value(row.custom, custom ? name : '');
    value(row.value, content);
    showCustom(row);
  };
  const add = buttonOf(ctx, 'Add style', 'plus', () => {
    const used = new Set(rows.map(rowKey));
    const free = MOTION_SAFE.find(name => !used.has(name)) || CUSTOM;
    const row = build();
    rows.push(row);
    list.append(row.root);
    place(row, free === CUSTOM ? '--value' : free, '');
    row.value.focus();
  });
  holder.append(list, add);
  container.append(holder);

  const paint = (next: Record<string, string>): void => {
    const entries = Object.entries(next);
    while (rows.length > entries.length) rows.pop()?.root.remove();
    entries.forEach(([name, content], index) => {
      let row = rows[index];
      if (!row) {
        row = build();
        rows.push(row);
        list.append(row.root);
      }
      place(row, name, content);
    });
  };
  paint(styles);

  return {
    set(next) {
      if (same(collect(), next)) return;
      paint(next);
    }
  };
}
