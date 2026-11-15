import { element } from '../../ui/dom';
import { labeled, segmentsOf, styleOf } from './labeled';
import type { InspectorContext } from './context';

export function installTransform3d(ctx: InspectorContext): void {
  const block = ctx.section(ctx.panes.design, 'Transform 3D', 'CSS values');
  const grid = element('div', 'form-grid');
  styleOf(ctx, grid, 'Perspective', 'perspective');
  styleOf(ctx, grid, 'Perspective origin', 'perspective-origin');
  segmentsOf(ctx, grid, 'Transform style', 'transform-style', [['flat', 'Flat'], ['preserve-3d', 'Preserve 3D']]);
  segmentsOf(ctx, grid, 'Backface', 'backface-visibility', [['visible', 'Visible'], ['hidden', 'Hidden']]);
  styleOf(ctx, grid, 'Rotate', 'rotate');
  styleOf(ctx, grid, 'Scale', 'scale');
  styleOf(ctx, grid, 'Translate', 'translate', undefined, true);
  block.append(grid, labeled('p', 'micro', 'Perspective goes on the parent, for example 800px. Rotate takes an axis and angle, such as x 45deg. The canvas draws these like the published site.'));
}
