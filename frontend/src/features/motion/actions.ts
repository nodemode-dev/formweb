import { element, keyed, value } from '../../ui/dom';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { buttonOf, english, fieldOf, inputOf, selectOf } from './labels';
import { actionLists, checkbox, clone, group, numberInput, pageNodes, pick, readNumber, remover, saver, setChecked, setDisabled, setNumber, setSelect, shell, show, type ActionLists, type Item, type Rec } from './pick';

const MAX_ACTIONS = 20;

const TRIGGERS: Item[] = english([
  { id: 'click', name: 'Click' },
  { id: 'hover', name: 'Hover' },
  { id: 'submit', name: 'Submit' },
  { id: 'change', name: 'Change' },
  { id: 'input', name: 'Input' },
  { id: 'load', name: 'Load' },
  { id: 'view', name: 'Enters view' }
]);

const ACTIONS: Item[] = english([
  { id: 'copy', name: 'Copy text' },
  { id: 'scroll-to', name: 'Scroll to' },
  { id: 'media', name: 'Control media' },
  { id: 'lightbox', name: 'Open lightbox' },
  { id: 'toggle-theme', name: 'Toggle theme' },
  { id: 'set-variable', name: 'Set variable' },
  { id: 'search', name: 'Site search' },
  { id: 'play', name: 'Play script' }
]);

const COMMANDS: Item[] = english([{ id: 'play', name: 'Play' }, { id: 'pause', name: 'Pause' }, { id: 'toggle', name: 'Toggle' }, { id: 'restart', name: 'Restart' }]);
const NONE: Item[] = english([{ id: '', name: 'None' }]);
const LITERAL: Item[] = english([{ id: '', name: 'Use the literal text' }]);

export interface ActionForm { set(action: Rec, lists: ActionLists): void }

export function buildAction(ctx: MotionContext, host: HTMLElement, withTrigger: boolean, onChange: (action: Rec) => void): ActionForm {
  let lists: ActionLists = { nodes: [], media: [], images: [], inputs: [], templates: [], variables: [], scripts: [] };
  let easingValue = '';
  const emit = (): void => onChange(compose());

  const trigger = selectOf(ctx, TRIGGERS);
  const kind = selectOf(ctx, ACTIONS);
  const head = group();
  if (withTrigger) head.append(fieldOf(ctx, 'Trigger', trigger));
  head.append(fieldOf(ctx, 'Action', kind, !withTrigger));
  host.append(head);

  const copy = group();
  const copyFrom = ctx.select([]);
  const copyText = inputOf(ctx, 'Text to copy');
  const feedback = inputOf(ctx, 'Copied');
  const copyDuration = numberInput(ctx, 0, 60000);
  const copyTextField = fieldOf(ctx, 'Literal text', copyText, true);
  copy.append(fieldOf(ctx, 'Copy from element', copyFrom, true), copyTextField, fieldOf(ctx, 'Feedback label', feedback), fieldOf(ctx, 'Feedback duration in ms', copyDuration));

  const scroll = group();
  const scrollTo = ctx.select([]);
  const progress = numberInput(ctx, 0, 1, 0.05);
  const scrollDuration = numberInput(ctx, 0, 60000);
  scroll.append(fieldOf(ctx, 'Scroll to element', scrollTo, true), fieldOf(ctx, 'Scene progress', progress), fieldOf(ctx, 'Duration in ms', scrollDuration));
  const easing = ctx.easing(scroll, 'Easing', 'ease-in-out', next => { easingValue = next; emit(); });

  const media = group();
  const command = selectOf(ctx, COMMANDS);
  const mediaTarget = ctx.select([]);
  media.append(fieldOf(ctx, 'Command', command), fieldOf(ctx, 'Media element', mediaTarget));

  const lightbox = group();
  const lightTarget = ctx.select([]);
  lightbox.append(fieldOf(ctx, 'Image', lightTarget, true));

  const variable = group();
  const variableName = ctx.select([]);
  const variableMode = selectOf(ctx, english([{ id: 'value', name: 'Value' }, { id: 'formula', name: 'Formula' }]));
  const variableText = inputOf(ctx, 'Value');
  const variableBool = selectOf(ctx, english([{ id: 'true', name: 'True' }, { id: 'false', name: 'False' }]));
  const variableFormula = ctx.input('seats * 2');
  const textField = fieldOf(ctx, 'Value', variableText, true);
  const boolField = fieldOf(ctx, 'Value', variableBool, true);
  const formulaField = fieldOf(ctx, 'Formula', variableFormula, true);
  variable.append(fieldOf(ctx, 'Variable', variableName), fieldOf(ctx, 'Set from', variableMode), textField, boolField, formulaField);

  const search = group();
  const searchInput = ctx.select([]);
  const searchResults = ctx.select([]);
  const searchTemplate = ctx.select([]);
  const searchLimit = numberInput(ctx, 1, 50);
  const searchEmpty = ctx.select([]);
  const searchParam = checkbox('Fill the search from the page address on load');
  search.append(fieldOf(ctx, 'Search input', searchInput, true), fieldOf(ctx, 'Results container', searchResults, true), fieldOf(ctx, 'Result template', searchTemplate, true), fieldOf(ctx, 'Result limit', searchLimit), fieldOf(ctx, 'Empty message', searchEmpty), searchParam.wrap);

  const play = group();
  const script = ctx.select([]);
  play.append(fieldOf(ctx, 'Script', script, true));

  host.append(copy, scroll, media, lightbox, variable, search, play);
  const groups: Record<string, HTMLElement> = { copy, 'scroll-to': scroll, media, lightbox, 'set-variable': variable, search, play };

  const typeOf = (name: string): string => lists.variables.find(item => item.id === name)?.type || 'text';

  const compose = (): Rec => {
    const out: Rec = {};
    if (withTrigger) out.trigger = trigger.value || 'click';
    const name = kind.value || 'toggle-theme';
    out.action = name;
    if (name === 'copy') {
      if (copyFrom.value) out.from = copyFrom.value; else out.text = copyText.value;
      if (feedback.value.trim()) out.feedback = feedback.value.trim();
      const duration = readNumber(copyDuration, true);
      if (duration !== undefined) out.duration = duration;
    } else if (name === 'scroll-to') {
      out.to = pick(scrollTo);
      const amount = readNumber(progress);
      const duration = readNumber(scrollDuration, true);
      if (amount !== undefined) out.progress = amount;
      if (duration !== undefined) out.duration = duration;
      if (easingValue) out.easing = easingValue;
    } else if (name === 'media') {
      out.command = command.value || 'play';
      out.target = pick(mediaTarget);
    } else if (name === 'lightbox') {
      out.target = pick(lightTarget);
    } else if (name === 'set-variable') {
      const id = pick(variableName);
      out.variable = id;
      if (variableMode.value === 'formula') out.formula = variableFormula.value.trim();
      else {
        const type = typeOf(id);
        if (type === 'boolean') out.value = variableBool.value === 'true';
        else if (type === 'number') out.value = Number(variableText.value) || 0;
        else out.value = variableText.value;
      }
    } else if (name === 'search') {
      out.input = pick(searchInput);
      out.results = pick(searchResults);
      out.template = pick(searchTemplate);
      const limit = readNumber(searchLimit, true);
      if (limit !== undefined) out.limit = limit;
      if (searchEmpty.value) out.empty = searchEmpty.value;
      if (searchParam.box.checked) out.fromParam = true;
    } else if (name === 'play') {
      out.script = pick(script);
    }
    return out;
  };

  for (const control of [trigger, kind, copyFrom, copyText, feedback, copyDuration, scrollTo, progress, scrollDuration, command, mediaTarget, lightTarget, variableName, variableMode, variableText, variableBool, variableFormula, searchInput, searchResults, searchTemplate, searchLimit, searchEmpty, searchParam.box, script]) control.addEventListener('change', emit);

  return {
    set(action, next) {
      lists = next;
      const name = String(action.action || 'toggle-theme');
      value(trigger, String(action.trigger || 'click'));
      value(kind, name);
      for (const key of Object.keys(groups)) show(groups[key], key === name);
      const own = (id: string, select: HTMLSelectElement, current: unknown): string => name === id ? String(current || '') : select.value;
      setSelect(copyFrom, [...LITERAL, ...next.nodes], own('copy', copyFrom, action.from));
      setSelect(scrollTo, next.nodes, own('scroll-to', scrollTo, action.to));
      setSelect(mediaTarget, next.media, own('media', mediaTarget, action.target));
      setSelect(lightTarget, next.images, own('lightbox', lightTarget, action.target));
      setSelect(variableName, next.variables.map(item => ({ id: item.id, name: item.id })), own('set-variable', variableName, action.variable));
      setSelect(searchInput, next.inputs, own('search', searchInput, action.input));
      setSelect(searchResults, next.nodes, own('search', searchResults, action.results));
      setSelect(searchTemplate, next.templates, own('search', searchTemplate, action.template));
      setSelect(searchEmpty, [...NONE, ...next.nodes], own('search', searchEmpty, action.empty));
      setSelect(script, next.scripts, own('play', script, action.script));
      if (name === 'copy') {
        show(copyTextField, !action.from);
        value(copyText, String(action.text ?? ''));
        value(feedback, String(action.feedback ?? ''));
        setNumber(copyDuration, action.duration);
      } else if (name === 'scroll-to') {
        setNumber(progress, action.progress);
        setNumber(scrollDuration, action.duration);
        easingValue = String(action.easing || '');
        easing.set(easingValue || 'ease-in-out');
      } else if (name === 'media') {
        value(command, String(action.command || 'play'));
      } else if (name === 'set-variable') {
        const type = typeOf(String(action.variable || ''));
        const formula = action.formula !== undefined;
        value(variableMode, formula ? 'formula' : 'value');
        show(textField, !formula && type !== 'boolean');
        show(boolField, !formula && type === 'boolean');
        show(formulaField, formula);
        value(variableText, action.value === undefined ? '' : String(action.value));
        value(variableBool, action.value === true ? 'true' : 'false');
        value(variableFormula, String(action.formula ?? ''));
      } else if (name === 'search') {
        setNumber(searchLimit, action.limit);
        setChecked(searchParam.box, action.fromParam === true);
      }
    }
  };
}

interface RowState { form: ActionForm; up: HTMLButtonElement; down: HTMLButtonElement; remove: HTMLButtonElement }

export function installActions(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let node: SiteNode | undefined;
  let entry: Rec[] = [];
  let lists: ActionLists | undefined;
  const save = saver(ctx, 'actions', () => node);
  const edit = (change: (draft: Rec[]) => void): void => {
    const draft = clone(entry);
    change(draft);
    if (draft.length) save(draft);
    else if (node) void ctx.run(() => ctx.remove('actions', (node as SiteNode).id));
  };
  const panel = shell(ctx, container, 'Actions', 'Run an action on a trigger, up to 20 per element.', () => save([{ trigger: 'click', action: 'toggle-theme' }]), remover(ctx, 'actions', () => node));
  const rows = new WeakMap<HTMLElement, RowState>();
  const indexOf = (row: HTMLElement): number => Number(row.dataset.key);

  const makeRow = (): HTMLElement => {
    const row = element('div', 'fw-font-row fw-motion-row');
    const host = element('div', 'form-grid');
    const form = buildAction(ctx, host, true, action => edit(draft => { draft[indexOf(row)] = action; }));
    const tools = element('div', 'fw-ext-actions');
    const up = buttonOf(ctx, 'Move up', undefined, () => edit(draft => {
      const at = indexOf(row);
      if (at > 0) [draft[at - 1], draft[at]] = [draft[at], draft[at - 1]];
    }));
    const down = buttonOf(ctx, 'Move down', undefined, () => edit(draft => {
      const at = indexOf(row);
      if (at < draft.length - 1) [draft[at + 1], draft[at]] = [draft[at], draft[at + 1]];
    }));
    const remove = buttonOf(ctx, 'Remove action', 'close', () => edit(draft => { draft.splice(indexOf(row), 1); }));
    tools.append(up, down, remove);
    row.append(host, tools);
    rows.set(row, { form, up, down, remove });
    return row;
  };

  const addAction = buttonOf(ctx, 'Add action', 'plus', () => edit(draft => { draft.push({ trigger: 'click', action: 'toggle-theme' }); }));
  panel.tools.append(addAction);

  return {
    update(next, current) {
      node = current;
      const stored = ctx.motion(next).actions[current.id] as unknown as Rec[] | undefined;
      panel.show(!!stored);
      if (!stored) return;
      entry = stored;
      lists = actionLists(next, pageNodes(next, current));
      const shared = lists;
      keyed(panel.list, stored.map((action, index) => ({ action, index })), item => String(item.index), makeRow, (row, item) => {
        const state = rows.get(row) as RowState;
        state.form.set(item.action, shared);
        setDisabled(state.up, item.index === 0);
        setDisabled(state.down, item.index === stored.length - 1);
      });
      setDisabled(addAction, stored.length >= MAX_ACTIONS);
    }
  };
}
