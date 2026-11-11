import { element } from '../../ui/dom';
import { t } from '../../i18n';
import { checkField, entryShell, numberField, selectField } from './fields';
import type { MotionContext, MotionEditor } from './context';

export interface Counter {
  to: number;
  from: number;
  duration: number;
  decimals: number;
  trigger: 'view' | 'load';
  odometer: boolean;
}

export const COUNTER_DEFAULT: Counter = { to: 100, from: 0, duration: 1200, decimals: 0, trigger: 'view', odometer: false };

export function installCounter(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let id = '';
  let entry: Counter | undefined;
  const shell = entryShell(ctx, container, 'Counter', 'Count up to a number. The first number in the element text is replaced while counting.', () => { if (id) void ctx.set('counters', id, COUNTER_DEFAULT); }, () => { if (id) void ctx.remove('counters', id); });
  const save = (patch: Partial<Counter>): void => {
    if (!id || !entry) return;
    void ctx.set('counters', id, { ...entry, ...patch });
  };
  const grid = element('div', 'form-grid');
  const from = numberField(ctx, t('From'), -1e12, 1e12, 1, next => save({ from: next ?? 0 }));
  const to = numberField(ctx, t('To'), -1e12, 1e12, 1, next => save({ to: next ?? 0 }));
  const duration = numberField(ctx, t('Duration (ms)'), 0, 60000, 100, next => save({ duration: Math.round(next ?? 0) }));
  const decimals = numberField(ctx, t('Decimals'), 0, 6, 1, next => save({ decimals: Math.round(next ?? 0) }));
  const trigger = selectField<'view' | 'load'>(ctx, t('Trigger'), [{ id: 'view', name: t('When in view') }, { id: 'load', name: t('On page load') }], next => save({ trigger: next }), true);
  const odometer = checkField(ctx, t('Odometer digits'), next => save({ odometer: next }));
  grid.append(from.root, to.root, duration.root, decimals.root, trigger.root);
  shell.body.append(grid, odometer.root);

  return {
    update(next, node) {
      id = node.id;
      const stored = ctx.motion(next).counters[node.id] as Partial<Counter> | undefined;
      entry = stored && typeof stored === 'object' ? { ...COUNTER_DEFAULT, ...stored } : undefined;
      shell.sync(!!entry);
      if (!entry) return;
      from.set(entry.from);
      to.set(entry.to);
      duration.set(entry.duration);
      decimals.set(entry.decimals);
      trigger.set(entry.trigger);
      odometer.set(entry.odometer);
    }
  };
}
