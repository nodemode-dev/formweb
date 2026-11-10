import { command } from '../../api';
import { element } from '../../ui/dom';
import { t } from '../../i18n';
import { easingPicker, show, styleRowsEditor } from './fields';
import { readMotion, type MotionContext, type MotionEditor, type MotionInstaller } from './context';
import { installPresets } from './presets';
import { installReveal } from './reveal';
import { installLoop } from './loop';
import { installCounter } from './counter';
import { installText } from './text';
import { installScene } from './scene';
import { installDrag } from './drag';
import { installPointer } from './pointer';
import { installDisclosure } from './disclosure';
import { installActions } from './actions';
import { installScript } from './script';
import { installScrubber } from './scrubber';
import type { InspectorContext } from '../inspector/context';
import '../../styles/motion.css';

const SECTIONS: [string, MotionInstaller][] = [
  ['presets', installPresets],
  ['reveal', installReveal],
  ['scene', installScene],
  ['loop', installLoop],
  ['counter', installCounter],
  ['text', installText],
  ['drag', installDrag],
  ['pointer', installPointer],
  ['disclosure', installDisclosure],
  ['actions', installActions],
  ['script', installScript]
];

export function installMotion(ctx: InspectorContext): MotionEditor {
  const motionCtx: MotionContext = {
    ...ctx,
    motion: readMotion,
    set: (kind, node, value) => ctx.run(() => command('motion.set', { kind, node, value })),
    remove: (kind, node) => ctx.run(() => command('motion.remove', { kind, node })),
    track: (scene, list, index, track) => ctx.run(() => command('motion.track', { scene, list, index, track })),
    easing: (container, label, value, onChange) => easingPicker(ctx, container, label, value, onChange),
    styleRows: (container, styles, onChange) => styleRowsEditor(ctx, container, styles, onChange)
  };

  const pane = ctx.panes.motion;
  pane.classList.add('fw-motion');
  const empty = element('p', 'empty-note fw-motion-none', t('Select an element to edit its motion.'));
  const stack = element('div', 'fw-motion-stack');
  stack.hidden = true;
  pane.append(empty, stack);

  const editors: MotionEditor[] = SECTIONS.map(([name, install]) => {
    const holder = element('div', `fw-motion-section fw-motion-${name}`);
    stack.append(holder);
    return install(motionCtx, holder);
  });
  editors.push(installScrubber(motionCtx));

  return {
    update(next, node) {
      show(stack, true);
      show(empty, false);
      for (const editor of editors) editor.update(next, node);
    }
  };
}
