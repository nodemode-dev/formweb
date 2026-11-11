import { element, value } from '../../ui/dom';
import { t, labelAttr } from '../../i18n';
import { checkField, entryShell, numberField, selectField, show } from './fields';
import { fieldOf, noteOf } from './labels';
import type { MotionContext, MotionEditor } from './context';

export type TextType = 'split' | 'typewriter' | 'ghost';

export interface TextEffect {
  type: TextType;
  by?: 'chars' | 'words' | 'lines';
  from?: Record<string, string>;
  duration?: number;
  stagger?: number;
  trigger?: 'view' | 'load';
  strings?: string[];
  speed?: number;
  erase?: number;
  hold?: number;
  cursor?: boolean;
}

export function textDefault(type: TextType): TextEffect {
  if (type === 'split') return { type, by: 'words', from: { opacity: '0', translate: '0 0.4em' }, duration: 500, stagger: 40, trigger: 'view' };
  if (type === 'typewriter') return { type, speed: 24, trigger: 'view', cursor: true };
  return { type, strings: ['Forecast next quarter', 'Compare regions'], speed: 60, erase: 18, hold: 1600 };
}

export function installText(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let id = '';
  let entry: TextEffect | undefined;
  const shell = entryShell(ctx, container, 'Text', 'Split text into animated parts, type it out, or type into an input placeholder.', () => { if (id) void ctx.set('text', id, textDefault('split')); }, () => { if (id) void ctx.remove('text', id); });
  const save = (patch: Partial<TextEffect>): void => {
    if (!id || !entry) return;
    void ctx.set('text', id, { ...entry, ...patch });
  };

  const type = selectField<TextType>(ctx, 'Type', [{ id: 'split', name: 'Split' }, { id: 'typewriter', name: 'Typewriter' }, { id: 'ghost', name: 'Ghost placeholder' }], next => { if (id) void ctx.set('text', id, textDefault(next)); }, true);
  shell.body.append(type.root);
  const ghostOption = Array.from(type.control.options).find(option => option.value === 'ghost');

  const trigger = selectField<'view' | 'load'>(ctx, 'Trigger', [{ id: 'view', name: 'When in view' }, { id: 'load', name: 'On page load' }], next => save({ trigger: next }));
  const splitBox = element('div', 'fw-motion-group');
  const splitGrid = element('div', 'form-grid');
  const by = selectField<NonNullable<TextEffect['by']>>(ctx, 'Split by', [{ id: 'chars', name: 'Characters' }, { id: 'words', name: 'Words' }, { id: 'lines', name: 'Lines' }], next => save({ by: next }));
  const duration = numberField(ctx, 'Duration (ms)', 0, 10000, 10, next => save({ duration: Math.round(next ?? 0) }));
  const stagger = numberField(ctx, 'Stagger (ms)', 0, 10000, 10, next => save({ stagger: Math.round(next ?? 0) }));
  splitGrid.append(by.root, duration.root, stagger.root);
  splitBox.append(noteOf('micro', 'Start state of each part.'));
  const from = ctx.styleRows(splitBox, {}, next => save({ from: next }));
  splitBox.append(splitGrid);

  const typeBox = element('div', 'form-grid');
  const speed = numberField(ctx, 'Speed (characters per second)', 1, 10000, 1, next => save({ speed: next ?? 24 }));
  const cursor = checkField(ctx, 'Show cursor', next => save({ cursor: next }));
  typeBox.append(speed.root, cursor.root);

  const ghostBox = element('div', 'form-grid');
  const strings = element('textarea');
  strings.rows = 3;
  labelAttr(strings, 'placeholder', 'One string per line');
  strings.addEventListener('change', () => {
    const list = strings.value.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 20);
    if (!list.length) { ctx.status(t('Ghost text needs at least one string.'), true); strings.value = (entry?.strings || []).join('\n'); return; }
    save({ strings: list.map(line => line.slice(0, 200)) });
  });
  const ghostSpeed = numberField(ctx, 'Type speed', 1, 10000, 1, next => save({ speed: next ?? 60 }));
  const erase = numberField(ctx, 'Erase speed', 1, 10000, 1, next => save({ erase: next ?? 18 }));
  const hold = numberField(ctx, 'Hold (ms)', 0, 60000, 100, next => save({ hold: Math.round(next ?? 0) }));
  ghostBox.append(fieldOf(ctx, 'Strings', strings, true), ghostSpeed.root, erase.root, hold.root);

  shell.body.append(trigger.root, splitBox, typeBox, ghostBox);

  return {
    update(next, node) {
      id = node.id;
      const stored = ctx.motion(next).text[node.id] as TextEffect | undefined;
      entry = stored && typeof stored === 'object' ? { ...stored } : undefined;
      shell.sync(!!entry);
      if (ghostOption) {
        const allowed = node.tag === 'input' || node.tag === 'textarea';
        if (ghostOption.disabled === allowed) ghostOption.disabled = !allowed;
      }
      if (!entry) return;
      const kind = entry.type;
      type.set(kind);
      show(trigger.root, kind !== 'ghost');
      show(splitBox, kind === 'split');
      show(typeBox, kind === 'typewriter');
      show(ghostBox, kind === 'ghost');
      if (kind !== 'ghost') trigger.set(entry.trigger || 'view');
      if (kind === 'split') {
        by.set(entry.by || 'words');
        from.set(entry.from || {});
        duration.set(entry.duration ?? 500);
        stagger.set(entry.stagger ?? 40);
      } else if (kind === 'typewriter') {
        speed.set(entry.speed ?? 24);
        cursor.set(!!entry.cursor);
      } else {
        value(strings, (entry.strings || []).join('\n'));
        ghostSpeed.set(entry.speed ?? 60);
        erase.set(entry.erase ?? 18);
        hold.set(entry.hold ?? 0);
      }
    }
  };
}
