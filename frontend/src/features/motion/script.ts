import { element, keyed, value } from '../../ui/dom';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { buttonOf, english, fieldOf, inputOf, selectOf } from './labels';
import { buildAction, type ActionForm } from './actions';
import { actionLists, checkbox, clone, numberInput, pageNodes, pick, readNumber, remover, saver, setChecked, setDisabled, setNumber, setSelect, shell, show, type ActionLists, type Item, type Rec } from './pick';

const MAX_STEPS = 100;

const TRIGGERS: Item[] = english([{ id: 'click', name: 'Click' }, { id: 'submit', name: 'Submit' }, { id: 'load', name: 'Load' }, { id: 'view', name: 'Enters view' }, { id: 'change', name: 'Change' }]);

const STEPS: Item[] = english([
  { id: 'append', name: 'Append a copy' },
  { id: 'clear', name: 'Clear' },
  { id: 'wait', name: 'Wait' },
  { id: 'stream', name: 'Stream text' },
  { id: 'type', name: 'Type text' },
  { id: 'class', name: 'Change classes' },
  { id: 'pointer', name: 'Move pointer' },
  { id: 'press', name: 'Press' },
  { id: 'scroll', name: 'Scroll' },
  { id: 'focus', name: 'Focus' },
  { id: 'action', name: 'Run action' }
]);

const BOUNDS: Item[] = english([{ id: 'start', name: 'Start' }, { id: 'end', name: 'End' }]);

const FIELDS: Record<string, string[]> = {
  append: ['template', 'into', 'as', 'text'],
  clear: ['target'],
  wait: ['ms'],
  stream: ['target', 'text', 'speed', 'by'],
  type: ['target', 'text', 'speed'],
  class: ['target', 'add', 'remove'],
  pointer: ['target', 'to', 'duration', 'easing'],
  press: ['target'],
  scroll: ['target', 'scrollTo'],
  focus: ['target'],
  action: []
};

const split = (text: string): string[] => text.split(/[\s,]+/).filter(Boolean);

interface StepRow {
  type: HTMLSelectElement;
  fields: Record<string, HTMLElement>;
  template: HTMLSelectElement;
  into: HTMLSelectElement;
  alias: HTMLInputElement;
  text: HTMLInputElement;
  target: HTMLSelectElement;
  ms: HTMLInputElement;
  speed: HTMLInputElement;
  by: HTMLSelectElement;
  add: HTMLInputElement;
  remove: HTMLInputElement;
  to: HTMLSelectElement;
  duration: HTMLInputElement;
  easing: { set(value: string): void };
  scrollTo: HTMLSelectElement;
  form: ActionForm;
  actionHost: HTMLElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
  drop: HTMLButtonElement;
  easingValue: string;
  action: Rec;
}

export function installScript(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let node: SiteNode | undefined;
  let entry: Rec = {};
  let nodes: Item[] = [];
  let targets: Item[] = [];
  let lists: ActionLists | undefined;
  const save = saver(ctx, 'scripts', () => node);
  const edit = (change: (draft: Rec) => void): void => {
    const draft = clone(entry);
    change(draft);
    save(draft);
  };
  const panel = shell(ctx, container, 'Script', 'Play a timed sequence of steps from this element.', () => save({ trigger: 'click', once: false, restart: false, reset: false, loop: false, loopDelay: 2000, steps: [{ type: 'wait', ms: 500 }] }), remover(ctx, 'scripts', () => node));

  const trigger = selectOf(ctx, TRIGGERS);
  trigger.addEventListener('change', () => edit(draft => {
    draft.trigger = trigger.value;
    if (trigger.value !== 'load' && trigger.value !== 'view') draft.loop = false;
  }));
  const flag = (label: string, key: string): { wrap: HTMLElement; box: HTMLInputElement } => {
    const made = checkbox(label);
    made.box.addEventListener('change', () => edit(draft => { draft[key] = made.box.checked; }));
    return made;
  };
  const once = flag('Run once per page view', 'once');
  const restart = flag('Restart when triggered again', 'restart');
  const reset = flag('Remove earlier copies before running', 'reset');
  const loop = flag('Loop', 'loop');
  const loopDelay = numberInput(ctx, 0, 60000);
  loopDelay.addEventListener('change', () => edit(draft => { draft.loopDelay = readNumber(loopDelay, true) ?? 0; }));
  const loopField = fieldOf(ctx, 'Loop delay in ms', loopDelay);
  panel.body.append(fieldOf(ctx, 'Trigger', trigger, true), once.wrap, restart.wrap, reset.wrap, loop.wrap, loopField);

  const rows = new WeakMap<HTMLElement, StepRow>();
  const indexOf = (row: HTMLElement): number => Number(row.dataset.key);

  const compose = (state: StepRow): Rec => {
    const type = state.type.value || 'wait';
    const target = pick(state.target);
    if (type === 'append') {
      const out: Rec = { type, template: pick(state.template), into: pick(state.into) };
      if (state.alias.value.trim()) out.as = state.alias.value.trim();
      if (state.text.value) out.text = state.text.value;
      return out;
    }
    if (type === 'wait') return { type, ms: readNumber(state.ms, true) ?? 500 };
    if (type === 'stream') return { type, target, text: state.text.value, speed: readNumber(state.speed, true) ?? 40, by: state.by.value || 'chars' };
    if (type === 'type') return { type, target, text: state.text.value, speed: readNumber(state.speed, true) ?? 24 };
    if (type === 'class') return { type, target, add: split(state.add.value), remove: split(state.remove.value) };
    if (type === 'pointer') {
      const out: Rec = { type, target, to: pick(state.to), duration: readNumber(state.duration, true) ?? 700 };
      if (state.easingValue) out.easing = state.easingValue;
      return out;
    }
    if (type === 'scroll') return { type, target, to: state.scrollTo.value || 'end' };
    if (type === 'action') return { type, action: Object.keys(state.action).length ? state.action : { action: 'toggle-theme' } };
    return { type, target };
  };

  const makeRow = (): HTMLElement => {
    const row = element('div', 'fw-font-row fw-motion-row');
    const host = element('div', 'form-grid');
    const type = selectOf(ctx, STEPS);
    const template = ctx.select([]);
    const into = ctx.select([]);
    const alias = ctx.input('reply');
    const text = inputOf(ctx, 'Text');
    const target = ctx.select([]);
    const ms = numberInput(ctx, 0, 60000);
    const speed = numberInput(ctx, 1, 2000);
    const by = selectOf(ctx, english([{ id: 'chars', name: 'Characters' }, { id: 'words', name: 'Words' }]));
    const add = ctx.input('is-open');
    const remove = ctx.input('is-closed');
    const to = ctx.select([]);
    const duration = numberInput(ctx, 0, 10000);
    const scrollTo = ctx.select([]);
    const fields: Record<string, HTMLElement> = {
      template: fieldOf(ctx, 'Template', template),
      into: fieldOf(ctx, 'Append into', into),
      as: fieldOf(ctx, 'Alias name', alias),
      text: fieldOf(ctx, 'Text', text, true),
      target: fieldOf(ctx, 'Target', target, true),
      ms: fieldOf(ctx, 'Wait in ms', ms),
      speed: fieldOf(ctx, 'Speed per second', speed),
      by: fieldOf(ctx, 'Reveal by', by),
      add: fieldOf(ctx, 'Add classes', add),
      remove: fieldOf(ctx, 'Remove classes', remove),
      to: fieldOf(ctx, 'Move to', to, true),
      duration: fieldOf(ctx, 'Duration in ms', duration),
      scrollTo: fieldOf(ctx, 'Scroll to', scrollTo, true)
    };
    const easingHost = element('div', 'form-grid full-row');
    const actionHost = element('div', 'form-grid full-row');
    fields.easing = easingHost;
    const state = { type, fields, template, into, alias, text, target, ms, speed, by, add, remove, to, duration, scrollTo, actionHost, easingValue: '', action: {} } as unknown as StepRow;
    state.easing = ctx.easing(easingHost, 'Easing', 'ease-in-out', next => { state.easingValue = next; commit(); });
    const commit = (): void => edit(draft => { (draft.steps as Rec[])[indexOf(row)] = compose(state); });
    state.form = buildAction(ctx, actionHost, false, action => { state.action = action; edit(draft => { (draft.steps as Rec[])[indexOf(row)] = { type: 'action', action }; }); });
    for (const control of [template, into, alias, text, target, ms, speed, by, add, remove, to, duration, scrollTo]) control.addEventListener('change', commit);
    type.addEventListener('change', commit);
    host.append(fieldOf(ctx, 'Step', type, true));
    for (const key of Object.keys(fields)) host.append(fields[key]);
    host.append(actionHost);
    const tools = element('div', 'fw-ext-actions');
    state.up = buttonOf(ctx, 'Move up', undefined, () => edit(draft => {
      const list = draft.steps as Rec[];
      const at = indexOf(row);
      if (at > 0) [list[at - 1], list[at]] = [list[at], list[at - 1]];
    }));
    state.down = buttonOf(ctx, 'Move down', undefined, () => edit(draft => {
      const list = draft.steps as Rec[];
      const at = indexOf(row);
      if (at < list.length - 1) [list[at + 1], list[at]] = [list[at], list[at + 1]];
    }));
    state.drop = buttonOf(ctx, 'Remove step', 'close', () => edit(draft => { (draft.steps as Rec[]).splice(indexOf(row), 1); }));
    tools.append(state.up, state.down, state.drop);
    row.append(host, tools);
    rows.set(row, state);
    return row;
  };

  const addStep = buttonOf(ctx, 'Add step', 'plus', () => edit(draft => { (draft.steps as Rec[]).push({ type: 'wait', ms: 500 }); }));
  panel.tools.append(addStep);

  const fill = (row: HTMLElement, item: { step: Rec; index: number; count: number }): void => {
    const state = rows.get(row) as StepRow;
    const step = item.step;
    const type = String(step.type || 'wait');
    const shown = FIELDS[type] || [];
    value(state.type, type);
    for (const key of Object.keys(state.fields)) show(state.fields[key], shown.includes(key));
    show(state.actionHost, type === 'action');
    const base = lists as ActionLists;
    const own = (id: string, select: HTMLSelectElement, current: unknown, fallback = ''): string => type === id ? String(current || fallback) : select.value;
    setSelect(state.template, base.templates, own('append', state.template, step.template));
    setSelect(state.into, nodes, own('append', state.into, step.into));
    setSelect(state.to, targets, own('pointer', state.to, step.to));
    setSelect(state.scrollTo, [...BOUNDS, ...nodes], own('scroll', state.scrollTo, step.to, 'end'));
    setSelect(state.target, targets, step.target ? String(step.target) : state.target.value);
    if (type === 'append') {
      value(state.alias, String(step.as || ''));
      value(state.text, String(step.text ?? ''));
    } else if (type === 'stream' || type === 'type') {
      value(state.text, String(step.text ?? ''));
      setNumber(state.speed, step.speed);
      value(state.by, String(step.by || 'chars'));
    } else if (type === 'wait') {
      setNumber(state.ms, step.ms);
    } else if (type === 'class') {
      value(state.add, ((step.add as string[] | undefined) || []).join(' '));
      value(state.remove, ((step.remove as string[] | undefined) || []).join(' '));
    } else if (type === 'pointer') {
      setNumber(state.duration, step.duration);
      state.easingValue = String(step.easing || '');
      state.easing.set(state.easingValue || 'ease-in-out');
    } else if (type === 'action') {
      state.action = (step.action as Rec | undefined) || {};
      state.form.set(state.action, base);
    }
    setDisabled(state.up, item.index === 0);
    setDisabled(state.down, item.index === item.count - 1);
    setDisabled(state.drop, item.count <= 1);
  };

  return {
    update(next, current) {
      node = current;
      const stored = ctx.motion(next).scripts[current.id] as Rec | undefined;
      panel.show(!!stored);
      if (!stored) return;
      entry = stored;
      nodes = pageNodes(next, current);
      lists = actionLists(next, nodes);
      const steps = (stored.steps as Rec[] | undefined) || [];
      const aliases = steps.filter(step => step.type === 'append' && step.as).map(step => `@${String(step.as)}`);
      targets = [...nodes, ...Array.from(new Set(aliases)).map(id => ({ id, name: id }))];
      const kind = String(stored.trigger || 'click');
      value(trigger, kind);
      setChecked(once.box, stored.once === true);
      setChecked(restart.box, stored.restart === true);
      setChecked(reset.box, stored.reset === true);
      setChecked(loop.box, stored.loop === true);
      setDisabled(loop.box, kind !== 'load' && kind !== 'view');
      show(loopField, stored.loop === true);
      setNumber(loopDelay, stored.loopDelay);
      keyed(panel.list, steps.map((step, index) => ({ step, index, count: steps.length })), item => String(item.index), makeRow, fill);
      setDisabled(addStep, steps.length >= MAX_STEPS);
    }
  };
}
