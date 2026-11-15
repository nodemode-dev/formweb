import { element, keyed, value } from '../../ui/dom';
import { t } from '../../i18n';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { actionLists, checkbox, clone, group, numberInput, pageNodes, pick, readNumber, remover, saver, setChecked, setDisabled, setNumber, setSelect, shell, show, type ActionLists, type Item, type Rec } from './pick';

const MAX_ACTIONS = 20;

const TRIGGERS = (): Item[] => [
  { id: 'click', name: t('Click') },
  { id: 'hover', name: t('Hover') },
  { id: 'submit', name: t('Submit') },
  { id: 'change', name: t('Change') },
  { id: 'input', name: t('Input') },
  { id: 'load', name: t('Load') },
  { id: 'view', name: t('Enters view') }
];

const ACTIONS = (): Item[] => [
  { id: 'copy', name: t('Copy text') },
  { id: 'scroll-to', name: t('Scroll to') },
  { id: 'media', name: t('Control media') },
  { id: 'lightbox', name: t('Open lightbox') },
  { id: 'toggle-theme', name: t('Toggle theme') },
  { id: 'set-variable', name: t('Set variable') },
  { id: 'search', name: t('Site search') },
  { id: 'play', name: t('Play script') }
];

const COMMANDS = (): Item[] => [{ id: 'play', name: t('Play') }, { id: 'pause', name: t('Pause') }, { id: 'toggle', name: t('Toggle') }, { id: 'restart', name: t('Restart') }];

export interface ActionForm { set(action: Rec, lists: ActionLists): void }

export function buildAction(ctx: MotionContext, host: HTMLElement, withTrigger: boolean, onChange: (action: Rec) => void): ActionForm {
  let lists: ActionLists = { nodes: [], media: [], images: [], inputs: [], templates: [], variables: [], scripts: [] };
  let easingValue = '';
  const emit = (): void => onChange(compose());

  const trigger = ctx.select(TRIGGERS());
  const kind = ctx.select(ACTIONS());
  const head = group();
  if (withTrigger) head.append(ctx.field(t('Trigger'), trigger));
  head.append(ctx.field(t('Action'), kind, !withTrigger));
  host.append(head);

  const copy = group();
  const copyFrom = ctx.select([]);
  const copyText = ctx.input(t('Text to copy'));
  const feedback = ctx.input(t('Copied'));
  const copyDuration = numberInput(ctx, 0, 60000);
  const copyTextField = ctx.field(t('Literal text'), copyText, true);
  copy.append(ctx.field(t('Copy from element'), copyFrom, true), copyTextField,ctx.field(t('Feedback label'), feedback), ctx.field(t('Feedback duration in ms'), copyDuration));

  const scroll = group();
  const scrollTo = ctx.select([]);
  const progress = numberInput(ctx, 0, 1, 0.05);
  const scrollDuration = numberInput(ctx, 0, 60000);
  scroll.append(ctx.field(t('Scroll to element'), scrollTo, true), ctx.field(t('Scene progress'), progress), ctx.field(t('Duration in ms'), scrollDuration));
  const easing = ctx.easing(scroll, t('Easing'), 'ease-in-out', next => { easingValue = next; emit(); });

  const media = group();
  const command = ctx.select(COMMANDS());
  const mediaTarget = ctx.select([]);
  media.append(ctx.field(t('Command'), command), ctx.field(t('Media element'), mediaTarget));

  const lightbox = group();
  const lightTarget = ctx.select([]);
  lightbox.append(ctx.field(t('Image'), lightTarget, true));

  const variable = group();
  const variableName = ctx.select([]);
  const variableMode = ctx.select([{ id: 'value', name: t('Value') }, { id: 'formula', name: t('Formula') }]);
  const variableText = ctx.input(t('Value'));
  const variableBool = ctx.select([{ id: 'true', name: t('True') }, { id: 'false', name: t('False') }]);
  const variableFormula = ctx.input('seats * 2');
  const textField = ctx.field(t('Value'), variableText, true);
  const boolField = ctx.field(t('Value'), variableBool, true);
  const formulaField = ctx.field(t('Formula'), variableFormula, true);
  variable.append(ctx.field(t('Variable'), variableName), ctx.field(t('Set from'), variableMode), textField, boolField, formulaField);

  const search = group();
  const searchInput = ctx.select([]);
  const searchResults = ctx.select([]);
  const searchTemplate = ctx.select([]);
  const searchLimit = numberInput(ctx, 1, 50);
  const searchEmpty = ctx.select([]);
  const searchParam = checkbox(t('Read the from parameter on load'));
  search.append(ctx.field(t('Search input'), searchInput, true), ctx.field(t('Results container'), searchResults, true), ctx.field(t('Result template'), searchTemplate, true), ctx.field(t('Result limit'), searchLimit), ctx.field(t('Empty message'), searchEmpty), searchParam.wrap);

  const play = group();
  const script = ctx.select([]);
  play.append(ctx.field(t('Script'), script, true));

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
      const none: Item = { id: '', name: t('None') };
      value(trigger, String(action.trigger || 'click'));
      value(kind, name);
      for (const key of Object.keys(groups)) show(groups[key], key === name);
      const own = (id: string, select: HTMLSelectElement, current: unknown): string => name === id ? String(current || '') : select.value;
      setSelect(copyFrom, [{ id: '', name: t('Use the literal text') }, ...next.nodes], own('copy', copyFrom, action.from));
      setSelect(scrollTo, next.nodes, own('scroll-to', scrollTo, action.to));
      setSelect(mediaTarget, next.media, own('media', mediaTarget, action.target));
      setSelect(lightTarget, next.images, own('lightbox', lightTarget, action.target));
      setSelect(variableName, next.variables.map(item => ({ id: item.id, name: item.id })), own('set-variable', variableName, action.variable));
      setSelect(searchInput, next.inputs, own('search', searchInput, action.input));
      setSelect(searchResults, next.nodes, own('search', searchResults, action.results));
      setSelect(searchTemplate, next.templates, own('search', searchTemplate, action.template));
      setSelect(searchEmpty, [none, ...next.nodes], own('search', searchEmpty, action.empty));
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
    const up = ctx.button(t('Move up'), undefined, () => edit(draft => {
      const at = indexOf(row);
      if (at > 0) [draft[at - 1], draft[at]] = [draft[at], draft[at - 1]];
    }));
    const down = ctx.button(t('Move down'), undefined, () => edit(draft => {
      const at = indexOf(row);
      if (at < draft.length - 1) [draft[at + 1], draft[at]] = [draft[at], draft[at + 1]];
    }));
    const remove = ctx.button(t('Remove action'), 'close', () => edit(draft => { draft.splice(indexOf(row), 1); }));
    tools.append(up, down, remove);
    row.append(host, tools);
    rows.set(row, { form, up, down, remove });
    return row;
  };

  const addAction = ctx.button(t('Add action'), 'plus', () => edit(draft => { draft.push({ trigger: 'click', action: 'toggle-theme' }); }));
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
