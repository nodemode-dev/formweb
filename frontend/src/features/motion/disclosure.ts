import { element, keyed, value } from '../../ui/dom';
import { t } from '../../i18n';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { checkbox, clone, group, numberInput, pageNodes, readNumber, remover, saver, setChecked, setDisabled, setNumber, setSelect, shell, show, type Item, type Rec } from './pick';

interface Pair { trigger: string; panel: string }
interface Chip { trigger: string; value: string }
interface Row { first: HTMLSelectElement; second: HTMLSelectElement | HTMLInputElement; remove: HTMLButtonElement }

const TYPES = (): Item[] => [{ id: 'accordion', name: t('Accordion') }, { id: 'tabs', name: t('Tabs') }, { id: 'filter', name: t('Filter') }];

export function installDisclosure(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let node: SiteNode | undefined;
  let entry: Rec = {};
  let nodes: Item[] = [];
  const save = saver(ctx, 'disclosure', () => node);
  const edit = (change: (draft: Rec) => void): void => {
    const draft = clone(entry);
    change(draft);
    save(draft);
  };
  const defaults = (kind: string): Rec => {
    const id = node ? node.id : '';
    if (kind === 'filter') return { type: 'filter', items: id, initial: 'all', chips: [{ trigger: id, value: 'all' }] };
    if (kind === 'tabs') return { type: 'tabs', initial: 0, items: [{ trigger: id, panel: id }] };
    return { type: 'accordion', single: false, initial: 0, items: [{ trigger: id, panel: id }] };
  };
  const panel = shell(ctx, container, t('Disclosure'), t('Accordion, tabs or filter chips.'), () => save(defaults('accordion')), remover(ctx, 'disclosure', () => node));

  const type = ctx.select(TYPES());
  type.addEventListener('change', () => save(defaults(type.value)));
  const single = checkbox(t('Open one at a time'));
  single.box.addEventListener('change', () => edit(draft => { draft.single = single.box.checked; }));
  const indicator = ctx.select([]);
  indicator.addEventListener('change', () => edit(draft => { if (indicator.value) draft.indicator = indicator.value; else delete draft.indicator; }));
  const initial = numberInput(ctx, 0, 49);
  initial.addEventListener('change', () => edit(draft => {
    const index = readNumber(initial, true);
    if (index === undefined) delete draft.initial; else draft.initial = index;
  }));
  const itemsSelect = ctx.select([]);
  itemsSelect.addEventListener('change', () => edit(draft => { draft.items = itemsSelect.value; }));
  const initialChip = ctx.select([]);
  initialChip.addEventListener('change', () => edit(draft => { draft.initial = initialChip.value; }));

  const accordion = group();
  accordion.append(single.wrap);
  const tabs = group();
  tabs.append(ctx.field(t('Indicator'), indicator, true));
  const indexed = group();
  indexed.append(ctx.field(t('Initial item number'), initial));
  const filter = group();
  filter.append(ctx.field(t('Items container'), itemsSelect, true), ctx.field(t('Initial value'), initialChip, true));
  panel.body.append(ctx.field(t('Type'), type, true), accordion, tabs, indexed, filter);

  const pairs = element('div', 'fw-font-list');
  const chips = element('div', 'fw-font-list');
  const rows = new WeakMap<HTMLElement, Row>();
  const indexOf = (row: HTMLElement): number => Number(row.dataset.key);

  const makeRow = (kind: 'pair' | 'chip'): HTMLElement => {
    const row = element('div', 'fw-font-row fw-motion-row');
    const fields = element('div', 'form-grid');
    const first = ctx.select([]);
    const second = kind === 'pair' ? ctx.select([]) : ctx.input('all');
    const remove = ctx.button(t('Remove item'), 'close', () => edit(draft => {
      const list = (kind === 'pair' ? draft.items : draft.chips) as unknown[];
      const removed = list.splice(indexOf(row), 1)[0] as Chip;
      if (kind === 'chip' && draft.initial === removed.value) draft.initial = (list[0] as Chip | undefined)?.value;
      if (kind === 'pair' && typeof draft.initial === 'number' && draft.initial >= list.length) draft.initial = Math.max(0, list.length - 1);
    }));
    first.addEventListener('change', () => edit(draft => {
      const list = (kind === 'pair' ? draft.items : draft.chips) as Rec[];
      list[indexOf(row)].trigger = first.value;
    }));
    second.addEventListener('change', () => edit(draft => {
      const list = (kind === 'pair' ? draft.items : draft.chips) as Rec[];
      const at = indexOf(row);
      if (kind === 'pair') list[at].panel = second.value;
      else {
        const next = second.value.trim();
        if (draft.initial === list[at].value) draft.initial = next;
        list[at].value = next;
      }
    }));
    fields.append(ctx.field(t('Trigger'), first), ctx.field(kind === 'pair' ? t('Panel') : t('Value'), second));
    const tools = element('div', 'fw-ext-actions');
    tools.append(remove);
    row.append(fields, tools);
    rows.set(row, { first, second, remove });
    return row;
  };

  const add = element('div', 'fw-ext-actions');
  add.append(ctx.button(t('Add item'), 'plus', () => edit(draft => {
    const id = node ? node.id : '';
    if (draft.type === 'filter') (draft.chips as Rec[]).push({ trigger: id, value: `tag${(draft.chips as Rec[]).length + 1}` });
    else (draft.items as Rec[]).push({ trigger: id, panel: id });
  })));
  panel.list.append(pairs, chips);
  panel.tools.append(add);

  return {
    update(next, current) {
      node = current;
      const stored = ctx.motion(next).disclosure[current.id] as Rec | undefined;
      panel.show(!!stored);
      if (!stored) return;
      entry = stored;
      nodes = pageNodes(next, current);
      const kind = String(stored.type || 'accordion');
      value(type, kind);
      show(accordion, kind === 'accordion');
      show(tabs, kind === 'tabs');
      show(indexed, kind !== 'filter');
      show(filter, kind === 'filter');
      show(pairs, kind !== 'filter');
      show(chips, kind === 'filter');
      setChecked(single.box, stored.single === true);
      setSelect(indicator, [{ id: '', name: t('None') }, ...nodes], String(stored.indicator || ''));
      setNumber(initial, stored.initial);
      if (kind === 'filter') {
        const list = (stored.chips as Chip[] | undefined) || [];
        setSelect(itemsSelect, nodes, String(stored.items || ''));
        setSelect(initialChip, list.map(chip => ({ id: chip.value, name: chip.value })), String(stored.initial || ''));
        keyed(chips, list.map((chip, index) => ({ chip, index })), item => String(item.index), () => makeRow('chip'), (row, item) => {
          const state = rows.get(row) as Row;
          setSelect(state.first, nodes, item.chip.trigger);
          value(state.second as HTMLInputElement, item.chip.value);
          setDisabled(state.remove, list.length <= 1);
        });
      } else {
        const list = (stored.items as Pair[] | undefined) || [];
        keyed(pairs, list.map((pair, index) => ({ pair, index })), item => String(item.index), () => makeRow('pair'), (row, item) => {
          const state = rows.get(row) as Row;
          setSelect(state.first, nodes, item.pair.trigger);
          setSelect(state.second as HTMLSelectElement, nodes, item.pair.panel);
          setDisabled(state.remove, list.length <= 1);
        });
      }
    }
  };
}
