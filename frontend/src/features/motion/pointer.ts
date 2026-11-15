import { value } from '../../ui/dom';
import { t } from '../../i18n';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { group, numberInput, pageNodes, pageRoot, pick, readNumber, remover, saver, setNumber, setSelect, shell, show, type Rec } from './pick';

const TYPES = (): { id: string; name: string }[] => [{ id: 'tilt', name: t('Tilt') }, { id: 'follow', name: t('Follow') }, { id: 'proximity', name: t('Proximity') }];
const SHOWS = (): { id: string; name: string }[] => [{ id: 'hover', name: t('On hover') }, { id: 'always', name: t('Always') }];

export function installPointer(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let node: SiteNode | undefined;
  let root = '';
  const save = saver(ctx, 'pointer', () => node);
  const panel = shell(ctx, container, t('Pointer'), t('React to the pointer with tilt, follow or proximity.'), () => save({ type: 'tilt', max: 8, perspective: '1000px', spring: 0.12 }), remover(ctx, 'pointer', () => node));

  const type = ctx.select(TYPES());
  const tilt = group();
  const follow = group();
  const near = group();
  const max = numberInput(ctx, 0, 45, 0.5);
  const perspective = ctx.input('1000px');
  const tiltSpring = numberInput(ctx, 0, 1, 0.01);
  const within = ctx.select([]);
  const followSpring = numberInput(ctx, 0, 1, 0.01);
  const shown = ctx.select(SHOWS());
  const radius = numberInput(ctx, 1, 2000);

  const collect = (): Rec => {
    const kind = type.value || 'tilt';
    const out: Rec = { type: kind };
    if (kind === 'tilt') {
      const amount = readNumber(max);
      const spring = readNumber(tiltSpring);
      if (amount !== undefined) out.max = amount;
      if (perspective.value.trim()) out.perspective = perspective.value.trim();
      if (spring !== undefined) out.spring = spring;
    } else if (kind === 'follow') {
      const spring = readNumber(followSpring);
      out.within = pick(within) || root;
      if (spring !== undefined) out.spring = spring;
      out.show = shown.value || 'hover';
    } else {
      out.radius = readNumber(radius) ?? 200;
    }
    return out;
  };
  const commit = (): void => save(collect());
  for (const control of [type, max, perspective, tiltSpring, within, followSpring, shown, radius]) control.addEventListener('change', commit);

  tilt.append(ctx.field(t('Max angle'), max), ctx.field(t('Spring'), tiltSpring), ctx.field(t('Perspective'), perspective, true));
  follow.append(ctx.field(t('Follow inside'), within, true), ctx.field(t('Spring'), followSpring), ctx.field(t('Show'), shown));
  near.append(ctx.field(t('Radius'), radius));
  panel.body.append(ctx.field(t('Type'), type, true), tilt, follow, near);

  return {
    update(next, current) {
      node = current;
      root = pageRoot(next, current);
      const entry = ctx.motion(next).pointer[current.id] as Rec | undefined;
      panel.show(!!entry);
      if (!entry) return;
      const kind = String(entry.type || 'tilt');
      value(type, kind);
      show(tilt, kind === 'tilt');
      show(follow, kind === 'follow');
      show(near, kind === 'proximity');
      setNumber(max, entry.max);
      value(perspective, String(entry.perspective || ''));
      setNumber(tiltSpring, kind === 'tilt' ? entry.spring : undefined);
      setNumber(followSpring, kind === 'follow' ? entry.spring : undefined);
      setSelect(within, pageNodes(next, current), String(entry.within || ''));
      value(shown, String(entry.show || 'hover'));
      setNumber(radius, entry.radius);
    }
  };
}
