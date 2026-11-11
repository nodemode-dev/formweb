import { element, value } from '../../ui/dom';
import { t } from '../../i18n';
import { breakpointStyles, type InspectorContext } from './context';
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
  const block = ctx.section(ctx.panes.design, t('Effects'), t('CSS values'));
  const grid = element('div', 'form-grid');
  ctx.addStyle(grid, t('Blend mode'), 'mix-blend-mode', BLEND);
  ctx.addStyle(grid, t('Isolation'), 'isolation', ['', 'auto', 'isolate']);
  ctx.addStyle(grid, t('Clip path'), 'clip-path', undefined, true);
  const presets = element('div', 'field full');
  presets.append(element('span', 'field-label', t('Clip presets')));
  const group = element('div', 'fw-seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', t('Clip presets'));
  const buttons = CLIPS.map(([shape, name]) => {
    const choice = element('button', 'fw-seg-btn', t(name));
    choice.type = 'button';
    choice.dataset.shape = shape;
    choice.title = shape || t('Remove the clip path');
    choice.setAttribute('aria-pressed', 'false');
    choice.addEventListener('click', () => void ctx.run(() => ctx.setStyle('clip-path', shape)));
    group.append(choice);
    return choice;
  });
  presets.append(group);
  grid.append(presets);
  ctx.addStyle(grid, t('Mask image'), 'mask-image', undefined, true);
  grid.append(element('p', 'micro full-row', t('Mask image takes gradients only, such as linear-gradient(black, transparent). Images and url() are not allowed.')));
  ctx.addStyle(grid, t('Filter'), 'filter', undefined, true);
  ctx.addStyle(grid, t('Backdrop filter'), 'backdrop-filter', undefined, true);
  ctx.addStyle(grid, t('Will change'), 'will-change', undefined, true);
  const showIn = ctx.select([{ id: '', name: t('Both') }, { id: 'dark', name: t('Dark only') }, { id: 'light', name: t('Light only') }]);
  showIn.setAttribute('aria-label', t('Show in'));
  showIn.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { 'data-fw-theme-only': showIn.value || null } })));
  grid.append(ctx.field(t('Show in'), showIn, true));
  grid.append(element('p', 'micro full-row', t('Dark only and Light only keep a twin of this element hidden in the other theme. Switch the canvas theme in the stage bar to see each one.')));
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
