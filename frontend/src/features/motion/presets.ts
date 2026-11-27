import { element } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';
import type { MotionContext, MotionEditor, MotionKind } from './context';
import type { EditorState, SiteNode } from '../../types';
import { createPlayer, playableKind } from './play';
import '../../styles/motion-play.css';

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const SHOWN_LATER = 'This effect plays in Preview and on the published site.';
const REDUCED = 'Your system asks for reduced motion, so nothing is played here.';

interface MotionPreset {
  id: string;
  label: string;
  kind: MotionKind;
  make(node: SiteNode, parent: string): Record<string, unknown>;
}

interface EffectPreset {
  id: string;
  label: string;
  effect: string;
}

const reveal = (from: Record<string, string>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  from, duration: 600, delay: 0, stagger: 0, children: false, easing: 'ease-out', threshold: 0.15, rootMargin: '0px 0px -10% 0px', once: true, trigger: 'view', ...extra
});

const MOTION_PRESETS: MotionPreset[] = [
  { id: 'fade-up', label: 'Fade up', kind: 'reveals', make: () => reveal({ opacity: '0', translate: '0 24px' }) },
  { id: 'fade-in', label: 'Fade in', kind: 'reveals', make: () => reveal({ opacity: '0' }) },
  { id: 'scale-in', label: 'Scale in', kind: 'reveals', make: () => reveal({ opacity: '0', scale: '0.9' }) },
  { id: 'blur-in', label: 'Blur in', kind: 'reveals', make: () => reveal({ opacity: '0', filter: 'blur(12px)' }) },
  { id: 'slide-left', label: 'Slide from left', kind: 'reveals', make: () => reveal({ opacity: '0', translate: '-48px 0' }) },
  { id: 'slide-right', label: 'Slide from right', kind: 'reveals', make: () => reveal({ opacity: '0', translate: '48px 0' }) },
  { id: 'stagger', label: 'Stagger children', kind: 'reveals', make: () => reveal({ opacity: '0', translate: '0 24px' }, { children: true, stagger: 80 }) },
  { id: 'split-words', label: 'Split words', kind: 'text', make: () => ({ type: 'split', by: 'words', from: { opacity: '0', translate: '0 0.4em' }, duration: 500, stagger: 40, trigger: 'view' }) },
  { id: 'split-chars', label: 'Split characters', kind: 'text', make: () => ({ type: 'split', by: 'chars', from: { opacity: '0', translate: '0 0.4em' }, duration: 400, stagger: 20, trigger: 'view' }) },
  { id: 'typewriter', label: 'Typewriter', kind: 'text', make: () => ({ type: 'typewriter', speed: 24, trigger: 'view', cursor: true }) },
  { id: 'count-up', label: 'Count up', kind: 'counters', make: () => ({ to: 100, from: 0, duration: 1200, decimals: 0, trigger: 'view', odometer: false }) },
  { id: 'marquee-left', label: 'Marquee left', kind: 'loops', make: () => ({ type: 'marquee', direction: 'left', speed: 40, pauseOnHover: true, pauseOffscreen: true }) },
  { id: 'marquee-right', label: 'Marquee right', kind: 'loops', make: () => ({ type: 'marquee', direction: 'right', speed: 40, pauseOnHover: true, pauseOffscreen: true }) },
  { id: 'spin', label: 'Spin', kind: 'loops', make: () => ({ type: 'spin', duration: 8000, amount: 360, easing: 'linear' }) },
  { id: 'float', label: 'Float', kind: 'loops', make: () => ({ type: 'float', duration: 3000, amount: 12, easing: 'ease-in-out' }) },
  { id: 'tilt', label: 'Tilt', kind: 'pointer', make: () => ({ type: 'tilt', max: 8, perspective: '1000px', spring: 0.12 }) },
  { id: 'follow', label: 'Follow pointer', kind: 'pointer', make: (node, parent) => ({ type: 'follow', within: parent || node.id, spring: 0.18, show: 'hover' }) }
];

const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'parallax', label: 'Parallax', effect: 'parallax' },
  { id: 'scroll-fade', label: 'Scroll fade', effect: 'scroll' },
  { id: 'mouse-parallax', label: 'Mouse parallax', effect: 'mouse' },
  { id: 'cursor', label: 'Cursor', effect: 'cursor' }
];

const ACTIVE_KEYS: Partial<Record<string, string[]>> = {
  reveals: ['from', 'children', 'stagger'],
  text: ['type', 'by'],
  counters: ['odometer'],
  loops: ['type', 'direction'],
  pointer: ['type']
};

function matches(preset: MotionPreset, node: SiteNode, entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const target = preset.make(node, '') as Record<string, unknown>;
  const stored = entry as Record<string, unknown>;
  const keys = ACTIVE_KEYS[preset.kind] || [];
  if (preset.kind === 'counters') return true;
  const sorted = (value: unknown): string => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  return keys.every(key => target[key] === undefined ? stored[key] === undefined || stored[key] === false || stored[key] === 0 : sorted(target[key]) === sorted(stored[key]));
}

export function installPresets(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let current: SiteNode | undefined;
  let parent = '';
  let latest: EditorState | undefined;
  let playedAt = -1;
  let playedIn = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const viewOf = (): string => ctx.breakpoint?.() ?? 'desktop';
  let calm = reduced.matches;
  const still = (): boolean => {
    if (reduced.matches !== calm) { calm = reduced.matches; queueMicrotask(refresh); }
    return calm;
  };
  const live = (): boolean => !still() && (ctx.editing?.() ?? true) && !ctx.canvas.outer.hidden && !ctx.canvas.frame.closest('[inert]') && ctx.canvas.frame.getClientRects().length > 0;
  const player = createPlayer(ctx.canvas, live);
  const start = (node: SiteNode, first?: MotionKind): void => {
    if (!latest) return;
    const group = ctx.motion(latest);
    const kind = playableKind(group, node, first);
    if (!kind || !player.play(node.id, kind, group[kind][node.id], node.children)) return;
    playedAt = latest.revision;
    playedIn = viewOf();
  };
  const block = ctx.section(container, 'Presets');
  const help = element('p', 'micro');
  label(help, 'One click sets the effect for the selected element. Click an active preset again to remove it.');
  block.append(help);
  const motionGroup = element('div', 'fw-seg fw-presets');
  motionGroup.setAttribute('role', 'group');
  labelAttr(motionGroup, 'aria-label', 'Motion presets');
  const effectGroup = element('div', 'fw-seg fw-presets');
  effectGroup.setAttribute('role', 'group');
  labelAttr(effectGroup, 'aria-label', 'Classic effects');

  const motionButtons = MOTION_PRESETS.map(preset => {
    const choice = element('button', 'fw-seg-btn');
    label(choice, preset.label);
    choice.type = 'button';
    choice.setAttribute('aria-pressed', 'false');
    choice.addEventListener('click', () => {
      if (!current) return;
      const node = current;
      player.stop();
      if (choice.classList.contains('is-on')) { void ctx.remove(preset.kind, node.id); return; }
      const entry = preset.make(node, parent);
      const shows = preset.kind === 'reveals' || (preset.kind === 'loops' && (entry.type === 'spin' || entry.type === 'float'));
      void ctx.set(preset.kind, node.id, entry).then(() => {
        if (!current || current.id !== node.id || !latest) return;
        if (!matches(preset, current, ctx.motion(latest)[preset.kind][node.id])) return;
        refresh();
        if (!shows || still()) return;
        const at = latest.revision;
        requestAnimationFrame(() => setTimeout(() => {
          if (current && current.id === node.id && latest && latest.revision === at && !player.playing()) start(current, preset.kind);
        }));
      });
    });
    motionGroup.append(choice);
    return { preset, choice };
  });
  const effectButtons = EFFECT_PRESETS.map(preset => {
    const choice = element('button', 'fw-seg-btn');
    label(choice, preset.label);
    choice.type = 'button';
    choice.setAttribute('aria-pressed', 'false');
    choice.addEventListener('click', () => {
      if (!current) return;
      const node = current;
      const on = node.attrs['data-fw-effect'] === preset.effect;
      const attrs: Record<string, string | null> = { ...node.attrs, 'data-fw-effect': on ? null : preset.effect };
      if (on) attrs['data-fw-effect-speed'] = null;
      player.stop();
      void ctx.run(() => ctx.nodePatch({ attrs }));
    });
    effectGroup.append(choice);
    return { preset, choice };
  });
  const effectLabel = element('span', 'field-label');
  label(effectLabel, 'Classic effects');
  const row = element('div', 'fw-play-row');
  const again = element('button', 'fw-play-again');
  again.type = 'button';
  again.disabled = true;
  const glyph = element('span', 'icon');
  glyph.innerHTML = PLAY_ICON;
  const caption = element('span');
  label(caption, 'Play again');
  again.append(glyph, caption);
  const note = element('p', 'fw-play-note');
  note.setAttribute('aria-live', 'polite');
  row.append(again, note);
  block.append(motionGroup, effectLabel, effectGroup, row);

  again.addEventListener('click', () => {
    player.stop();
    if (current && !still()) start(current);
  });

  function refresh(): void {
    if (!current || !latest) return;
    const group = ctx.motion(latest);
    const playable = !!playableKind(group, current);
    const loop = group.loops[current.id] as { type?: string } | undefined;
    const id = current.id;
    const elsewhere = !!current.attrs['data-fw-effect'] || (['text', 'counters', 'pointer'] as const).some(kind => !!group[kind][id]) || (!!loop && loop.type !== 'spin' && loop.type !== 'float');
    const quiet = still();
    const said = quiet ? REDUCED : elsewhere && !playable ? SHOWN_LATER : '';
    if (said) label(note, said);
    else if (note.textContent) note.textContent = '';
    const off = quiet || !playable;
    if (again.disabled !== off) {
      if (off && document.activeElement === again) motionButtons[0].choice.focus();
      again.disabled = off;
    }
  }

  reduced.addEventListener('change', () => {
    if (still()) player.stop();
    refresh();
  });

  const mark = (choice: HTMLButtonElement, on: boolean): void => {
    if (choice.classList.contains('is-on') !== on) choice.classList.toggle('is-on', on);
    if (choice.getAttribute('aria-pressed') !== String(on)) choice.setAttribute('aria-pressed', String(on));
  };

  return {
    update(next, node) {
      const playing = player.playing();
      if (playing && (playing !== node.id || next.revision !== playedAt || viewOf() !== playedIn || !live())) player.stop();
      latest = next;
      current = node;
      const owner = Object.values(next.site.nodes).find(candidate => candidate.children.includes(node.id));
      parent = owner ? owner.id : '';
      const group = ctx.motion(next);
      for (const { preset, choice } of motionButtons) mark(choice, matches(preset, node, group[preset.kind][node.id]));
      for (const { preset, choice } of effectButtons) mark(choice, node.attrs['data-fw-effect'] === preset.effect);
      refresh();
    }
  };
}
