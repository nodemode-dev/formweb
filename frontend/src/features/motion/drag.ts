import { t } from '../../i18n';
import type { SiteNode } from '../../types';
import type { MotionContext, MotionEditor } from './context';
import { checkbox, numberInput, pageNodes, readNumber, remover, saver, setChecked, setNumber, setSelect, shell, type Rec } from './pick';

const DEFAULT: Rec = { axis: 'both', bounds: 'parent', inertia: true, friction: 4, restitution: 0.4, rotate: false, keyboard: 16 };

export function installDrag(ctx: MotionContext, container: HTMLElement): MotionEditor {
  let node: SiteNode | undefined;
  const save = saver(ctx, 'drag', () => node);
  const panel = shell(ctx, container, t('Drag'), t('Let visitors drag this element.'), () => save({ ...DEFAULT }), remover(ctx, 'drag', () => node));

  const collect = (): Rec => {
    const out: Rec = { axis: axis.value || 'both', bounds: bounds.value || 'parent', inertia: inertia.box.checked, rotate: rotate.box.checked };
    const friction = readNumber(frictionInput);
    const restitution = readNumber(restitutionInput);
    const keyboard = readNumber(keyboardInput, true);
    if (friction !== undefined) out.friction = friction;
    if (restitution !== undefined) out.restitution = restitution;
    if (keyboard !== undefined) out.keyboard = keyboard;
    if (flip.value) out.flip = { back: flip.value };
    return out;
  };
  const commit = (): void => save(collect());

  const axis = ctx.select([{ id: 'both', name: t('Both') }, { id: 'x', name: t('Horizontal') }, { id: 'y', name: t('Vertical') }]);
  const bounds = ctx.select([]);
  const inertia = checkbox(t('Inertia'));
  const rotate = checkbox(t('Rotate while dragging'));
  const frictionInput = numberInput(ctx, 0, 100, 0.1);
  const restitutionInput = numberInput(ctx, 0, 1, 0.05);
  const keyboardInput = numberInput(ctx, 0, 200);
  const flip = ctx.select([]);
  for (const control of [axis, bounds, inertia.box, rotate.box, frictionInput, restitutionInput, keyboardInput, flip]) control.addEventListener('change', commit);
  panel.body.append(
    ctx.field(t('Axis'), axis),
    ctx.field(t('Bounds'), bounds),
    ctx.field(t('Friction'), frictionInput),
    ctx.field(t('Bounce'), restitutionInput),
    ctx.field(t('Keyboard step'), keyboardInput),
    ctx.field(t('Flip back element'), flip),
    inertia.wrap,
    rotate.wrap
  );

  return {
    update(next, current) {
      node = current;
      const entry = ctx.motion(next).drag[current.id] as Rec | undefined;
      panel.show(!!entry);
      if (!entry) return;
      const nodes = pageNodes(next, current);
      setSelect(axis, [{ id: 'both', name: t('Both') }, { id: 'x', name: t('Horizontal') }, { id: 'y', name: t('Vertical') }], String(entry.axis || 'both'));
      setSelect(bounds, [{ id: 'parent', name: t('Parent') }, { id: 'window', name: t('Window') }, { id: 'none', name: t('None') }, ...nodes], String(entry.bounds || 'parent'));
      setSelect(flip, [{ id: '', name: t('None') }, ...nodes], String((entry.flip as Rec | undefined)?.back || ''));
      setChecked(inertia.box, entry.inertia === true);
      setChecked(rotate.box, entry.rotate === true);
      setNumber(frictionInput, entry.friction);
      setNumber(restitutionInput, entry.restitution);
      setNumber(keyboardInput, entry.keyboard);
    }
  };
}
