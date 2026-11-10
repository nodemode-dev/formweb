import { element } from '../../ui/dom';
import { t } from '../../i18n';
import type { InspectorContext } from './context';

export function installTransform3d(ctx: InspectorContext): void {
  const block = ctx.section(ctx.panes.design, t('Transform 3D'), t('CSS values'));
  const grid = element('div', 'form-grid');
  ctx.addStyle(grid, t('Perspective'), 'perspective');
  ctx.addStyle(grid, t('Perspective origin'), 'perspective-origin');
  ctx.addSegments(grid, t('Transform style'), 'transform-style', [['flat', t('Flat')], ['preserve-3d', t('Preserve 3D')]]);
  ctx.addSegments(grid, t('Backface'), 'backface-visibility', [['visible', t('Visible')], ['hidden', t('Hidden')]]);
  ctx.addStyle(grid, t('Rotate'), 'rotate');
  ctx.addStyle(grid, t('Scale'), 'scale');
  ctx.addStyle(grid, t('Translate'), 'translate', undefined, true);
  block.append(grid, element('p', 'micro', t('Perspective goes on the parent, for example 800px. Rotate takes an axis and angle, such as x 45deg. The canvas draws these like the published site.')));
}
