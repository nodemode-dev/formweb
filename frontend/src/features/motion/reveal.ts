import { element, value } from '../../ui/dom';
import { t } from '../../i18n';
import { checkField, entryShell, numberField, selectField } from './fields';
import type { MotionContext, MotionEditor } from './context';

export interface Reveal {
  from: Record<string, string>;
  duration: number;
  delay: number;
  stagger: number;
  children: boolean;
  easing: string;
  threshold: number;
  rootMargin: string;
  once: boolean;
  trigger: 'view' | 'load';
}

export const REVEAL_DEFAULT: Reveal = {
  from: { opacity: '0', translate: '0 24px' },
  duration: 600,
  delay: 0,
  stagger: 80,
  children: false,
  easing: 'ease-out',
  threshold: 0.15,
  rootMargin: '0px 0px -10% 0px',
  once: true,
  trigger: 'view'
};

export function readReveal(source: unknown): Reveal | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const raw = source as Partial<Reveal>;
  return { ...REVEAL_DEFAULT, ...raw, from: { ...(raw.from || {}) } };
}

export function installReveal(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let id = '';
  let entry: Reveal | undefined;
  const shell = entryShell(ctx, container, t('Reveal'), t('Animate this element into place when it enters the view or the page loads.'), () => { if (id) void ctx.set('reveals', id, REVEAL_DEFAULT); }, () => { if (id) void ctx.remove('reveals', id); });
  const save = (patch: Partial<Reveal>): void => {
    if (!id || !entry) return;
    void ctx.set('reveals', id, { ...entry, ...patch });
  };

  const trigger = selectField<'view' | 'load'>(ctx, t('Trigger'), [{ id: 'view', name: t('When in view') }, { id: 'load', name: t('On page load') }], next => save({ trigger: next }));
  const easing = ctx.easing(shell.body, t('Easing'), REVEAL_DEFAULT.easing, next => save({ easing: next }));
  shell.body.append(element('p', 'micro', t('Start state. The element animates from these styles to its own.')));
  const from = ctx.styleRows(shell.body, {}, next => save({ from: next }));
  const grid = element('div', 'form-grid');
  const duration = numberField(ctx, t('Duration (ms)'), 0, 10000, 10, next => save({ duration: next ?? 0 }));
  const delay = numberField(ctx, t('Delay (ms)'), 0, 10000, 10, next => save({ delay: next ?? 0 }));
  const stagger = numberField(ctx, t('Stagger (ms)'), 0, 10000, 10, next => save({ stagger: next ?? 0 }));
  const threshold = numberField(ctx, t('Threshold'), 0, 1, 0.05, next => save({ threshold: next ?? 0 }));
  const margin = ctx.input('0px 0px -10% 0px');
  margin.addEventListener('change', () => {
    const parts = margin.value.trim().split(/\s+/);
    const ok = parts.length >= 1 && parts.length <= 4 && parts.every(part => /^-?\d+(\.\d+)?(px|%)$/.test(part));
    if (!ok) { ctx.status(t('Root margin needs one to four lengths such as 0px or -10%.'), true); margin.value = entry?.rootMargin || ''; return; }
    save({ rootMargin: parts.join(' ') });
  });
  const children = checkField(ctx, t('Apply to each child'), next => save({ children: next }));
  const once = checkField(ctx, t('Play once'), next => save({ once: next }));
  const flags = element('div', 'fw-motion-flags');
  flags.append(children.root, once.root);
  grid.append(trigger.root, duration.root, delay.root, stagger.root, threshold.root, ctx.field(t('Root margin'), margin));
  shell.body.append(grid, flags);

  return {
    update(next, node) {
      id = node.id;
      entry = readReveal(ctx.motion(next).reveals[node.id]);
      shell.sync(!!entry);
      if (!entry) return;
      trigger.set(entry.trigger);
      easing.set(entry.easing);
      from.set(entry.from);
      duration.set(entry.duration);
      delay.set(entry.delay);
      stagger.set(entry.stagger);
      threshold.set(entry.threshold);
      value(margin, entry.rootMargin);
      children.set(entry.children);
      once.set(entry.once);
    }
  };
}
