import { element, value } from '../../ui/dom';
import { t } from '../../i18n';
import { checkField, entryShell, numberField, selectField, show } from './fields';
import { buttonOf, fieldOf, iconButtonOf, inputOf, noteOf } from './labels';
import type { MotionContext, MotionEditor } from './context';

export type LoopType = 'marquee' | 'spin' | 'float' | 'keyframes';
export type LoopFrame = { at: number; styles: Record<string, string> };

export interface Loop {
  type: LoopType;
  direction?: 'left' | 'right' | 'up' | 'down';
  speed?: number;
  pauseOnHover?: boolean;
  pauseOffscreen?: boolean;
  duration?: number;
  amount?: number;
  keyframes?: LoopFrame[];
  easing?: string;
  iterations?: number | 'infinite';
}

export function loopDefault(type: LoopType): Loop {
  if (type === 'marquee') return { type, direction: 'left', speed: 40, pauseOnHover: true, pauseOffscreen: true };
  if (type === 'spin') return { type, duration: 8000, amount: 360, easing: 'linear' };
  if (type === 'float') return { type, duration: 3000, amount: 12, easing: 'ease-in-out' };
  return { type, duration: 2000, easing: 'ease-in-out', iterations: 'infinite', keyframes: [{ at: 0, styles: { opacity: '1' } }, { at: 0.5, styles: { opacity: '0.5' } }, { at: 1, styles: { opacity: '1' } }] };
}

function readFrames(source: unknown): LoopFrame[] {
  if (!Array.isArray(source)) return [];
  return source.map((frame, index, all) => {
    const raw = frame as { at?: number; styles?: Record<string, string> } & Record<string, string>;
    if (raw && raw.styles && typeof raw.styles === 'object') return { at: typeof raw.at === 'number' ? raw.at : index / Math.max(1, all.length - 1), styles: { ...raw.styles } };
    return { at: index / Math.max(1, all.length - 1), styles: { ...(raw as Record<string, string>) } };
  });
}

interface FrameRow {
  root: HTMLElement;
  at: ReturnType<typeof numberField>;
  styles: { set(next: Record<string, string>): void };
  drop: HTMLButtonElement;
}

export function installLoop(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let id = '';
  let entry: Loop | undefined;
  const shell = entryShell(ctx, container, 'Loop', 'Repeat a motion on this element: marquee, spin, float or custom keyframes.', () => { if (id) void ctx.set('loops', id, loopDefault('marquee')); }, () => { if (id) void ctx.remove('loops', id); });
  const save = (patch: Partial<Loop>): void => {
    if (!id || !entry) return;
    void ctx.set('loops', id, { ...entry, ...patch });
  };

  const type = selectField<LoopType>(ctx, 'Type', [{ id: 'marquee', name: 'Marquee' }, { id: 'spin', name: 'Spin' }, { id: 'float', name: 'Float' }, { id: 'keyframes', name: 'Keyframes' }], next => {
    if (!id) return;
    void ctx.set('loops', id, loopDefault(next));
  }, true);
  shell.body.append(type.root);

  const marquee = element('div', 'form-grid');
  const direction = selectField<NonNullable<Loop['direction']>>(ctx, 'Direction', [{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }, { id: 'up', name: 'Up' }, { id: 'down', name: 'Down' }], next => save({ direction: next }));
  const speed = numberField(ctx, 'Speed (px per second)', 1, 2000, 1, next => save({ speed: next ?? 40 }));
  const hover = checkField(ctx, 'Pause on hover', next => save({ pauseOnHover: next }));
  const offscreen = checkField(ctx, 'Pause when off screen', next => save({ pauseOffscreen: next }));
  marquee.append(direction.root, speed.root, hover.root, offscreen.root);

  const timed = element('div', 'form-grid');
  const duration = numberField(ctx, 'Duration (ms)', 100, 120000, 100, next => save({ duration: next ?? 1000 }));
  const amount = numberField(ctx, 'Amount (degrees or px)', -100000, 100000, 1, next => save({ amount: next ?? 0 }));
  const iterations = inputOf(ctx, 'infinite');
  iterations.addEventListener('change', () => {
    const raw = iterations.value.trim().toLowerCase();
    if (!raw || raw === 'infinite' || raw === t('infinite').toLowerCase()) { save({ iterations: 'infinite' }); return; }
    const count = Math.round(Number(raw));
    if (!Number.isFinite(count) || count < 1 || count > 1000) { ctx.status(t('Iterations must be 1 to 1000 or infinite.'), true); iterations.value = typeof entry?.iterations === 'number' ? String(entry.iterations) : ''; return; }
    save({ iterations: count });
  });
  const iterationsField = fieldOf(ctx, 'Iterations', iterations);
  timed.append(duration.root, amount.root, iterationsField);

  const easingBox = element('div', 'fw-motion-easing');
  const easing = ctx.easing(easingBox, 'Easing', 'ease-in-out', next => save({ easing: next }));

  const framesBox = element('div', 'fw-motion-frames');
  const frameList = element('div', 'fw-frame-list');
  const rows: FrameRow[] = [];
  let frames: LoopFrame[] = [];
  const saveFrames = (next: LoopFrame[]): void => save({ keyframes: next });
  const buildFrame = (index: number): FrameRow => {
    const root = element('div', 'fw-frame-row');
    const head = element('div', 'fw-frame-head');
    const at = numberField(ctx, 'At (0 to 1)', 0, 1, 0.05, next => {
      const copy = frames.map(frame => ({ at: frame.at, styles: frame.styles }));
      copy[index] = { at: next ?? copy[index].at, styles: copy[index].styles };
      saveFrames(copy);
    });
    const drop = iconButtonOf(ctx, 'Remove keyframe', 'close', () => {
      if (frames.length <= 2) return;
      saveFrames(frames.filter((_, position) => position !== index));
    }, 'icon-button');
    head.append(at.root, drop);
    const holder = element('div');
    const styles = ctx.styleRows(holder, {}, next => {
      const copy = frames.map(frame => ({ at: frame.at, styles: frame.styles }));
      copy[index] = { at: copy[index].at, styles: next };
      saveFrames(copy);
    });
    root.append(head, holder);
    frameList.append(root);
    return { root, at, styles, drop };
  };
  const addFrame = buttonOf(ctx, 'Add keyframe', 'plus', () => {
    if (frames.length >= 50) return;
    const last = frames[frames.length - 1];
    const copy = frames.map(frame => ({ at: frame.at, styles: frame.styles }));
    copy.push({ at: last ? Math.min(1, last.at) : 1, styles: { opacity: '1' } });
    saveFrames(copy);
  });
  framesBox.append(noteOf('micro', 'Keyframes play in order over the duration.'), frameList, addFrame);

  shell.body.append(marquee, timed, easingBox, framesBox);

  return {
    update(next, node) {
      id = node.id;
      const stored = ctx.motion(next).loops[node.id] as Loop | undefined;
      entry = stored && typeof stored === 'object' ? { ...stored, keyframes: stored.type === 'keyframes' ? readFrames(stored.keyframes) : undefined } : undefined;
      if (entry && entry.keyframes === undefined) delete entry.keyframes;
      shell.sync(!!entry);
      if (!entry) return;
      const kind = entry.type;
      type.set(kind);
      const isMarquee = kind === 'marquee';
      const isKeys = kind === 'keyframes';
      show(marquee, isMarquee);
      show(timed, !isMarquee);
      show(easingBox, !isMarquee);
      show(framesBox, isKeys);
      show(iterationsField, isKeys);
      show(amount.root, !isKeys);
      if (isMarquee) {
        direction.set(entry.direction || 'left');
        speed.set(entry.speed ?? 40);
        hover.set(!!entry.pauseOnHover);
        offscreen.set(!!entry.pauseOffscreen);
        return;
      }
      duration.set(entry.duration ?? 1000);
      amount.set(entry.amount ?? 0);
      easing.set(entry.easing || 'linear');
      value(iterations, typeof entry.iterations === 'number' ? String(entry.iterations) : '');
      if (!isKeys) return;
      frames = entry.keyframes || [];
      while (rows.length < frames.length) rows.push(buildFrame(rows.length));
      rows.forEach((row, index) => {
        const has = index < frames.length;
        show(row.root, has);
        if (!has) return;
        row.at.set(frames[index].at);
        row.styles.set(frames[index].styles);
        const locked = frames.length <= 2;
        if (row.drop.disabled !== locked) row.drop.disabled = locked;
      });
      const full = frames.length >= 50;
      if (addFrame.disabled !== full) addFrame.disabled = full;
    }
  };
}
