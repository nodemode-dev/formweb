import { element, value } from '../../ui/dom';
import { labelAttr } from '../../i18n';
import { breakpointStyles, type InspectorContext } from './context';
import { fieldOf, labeled, selectOf, styleOf } from './labeled';
import type { SiteNode } from '../../types';

const BLEND = ['', 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter'];
const CLIPS: [string, string][] = [
  ['', 'None'],
  ['inset(0)', 'Inset'],
  ['inset(0 round 16px)', 'Rounded'],
  ['circle(50%)', 'Circle'],
  ['polygon(50% 0, 100% 100%, 0 100%)', 'Triangle'],
  ['polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)', 'Hexagon']
];

export function installEffects(ctx: InspectorContext): (node: SiteNode, breakpoint: string) => void {
  const block = ctx.section(ctx.panes.design, 'Effects', 'CSS values');
  const grid = element('div', 'form-grid');
  styleOf(ctx, grid, 'Blend mode', 'mix-blend-mode', BLEND);
  styleOf(ctx, grid, 'Isolation', 'isolation', ['', 'auto', 'isolate']);
  styleOf(ctx, grid, 'Clip path', 'clip-path', undefined, true);
  const presets = element('div', 'field full');
  presets.append(labeled('span', 'field-label', 'Clip presets'));
  const group = element('div', 'fw-seg');
  group.setAttribute('role', 'group');
  labelAttr(group, 'aria-label', 'Clip presets');
  const buttons = CLIPS.map(([shape, name]) => {
    const choice = labeled('button', 'fw-seg-btn', name);
    choice.type = 'button';
    choice.dataset.shape = shape;
    if (shape) choice.title = shape; else labelAttr(choice, 'title', 'Remove the clip path');
    choice.setAttribute('aria-pressed', 'false');
    choice.addEventListener('click', () => void ctx.run(() => ctx.setStyle('clip-path', shape)));
    group.append(choice);
    return choice;
  });
  presets.append(group);
  grid.append(presets);
  styleOf(ctx, grid, 'Mask image', 'mask-image', undefined, true);
  grid.append(labeled('p', 'micro full-row', 'Mask image takes gradients only, such as linear-gradient(black, transparent). Images and url() are not allowed.'));
  styleOf(ctx, grid, 'Filter', 'filter', undefined, true);
  styleOf(ctx, grid, 'Backdrop filter', 'backdrop-filter', undefined, true);
  styleOf(ctx, grid, 'Will change', 'will-change', undefined, true);
  const showIn = selectOf(ctx, [{ id: '', name: 'Both', en: 'Both' }, { id: 'dark', name: 'Dark only', en: 'Dark only' }, { id: 'light', name: 'Light only', en: 'Light only' }]);
  labelAttr(showIn, 'aria-label', 'Show in');
  showIn.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { 'data-fw-theme-only': showIn.value || null } })));
  grid.append(fieldOf(ctx, 'Show in', showIn, true));
  grid.append(labeled('p', 'micro full-row', 'Dark only and Light only keep a twin of this element hidden in the other theme. Switch the canvas theme in the stage bar to see each one.'));
  block.append(grid);

  return (node, breakpoint) => {
    const own = breakpointStyles(node, breakpoint)['clip-path'] || '';
    for (const choice of buttons) {
      const on = choice.dataset.shape === own;
      if (choice.classList.contains('is-on') !== on) choice.classList.toggle('is-on', on);
      if (choice.getAttribute('aria-pressed') !== String(on)) choice.setAttribute('aria-pressed', String(on));
    }
    value(showIn, node.attrs['data-fw-theme-only'] || '');
  };
}
