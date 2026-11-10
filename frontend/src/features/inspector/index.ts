import type { EditorState, SiteNode } from '../../types';
import type { InspectorContext } from './context';
import { installTransform3d } from './transform3d';
import { installEffects } from './effects';
import { installMedia } from './media';
import { installTheme } from './theme';
import { installFonts } from './fonts';
import { installProperties } from './properties';
import { installVariables } from './variables';
import { installComponents } from './components';
import { installCodeSection } from './code-section';
import { installMotion } from '../motion';
import '../../styles/inspector.css';

export type { InspectorContext } from './context';

export interface InspectorExtensions {
  update(next: EditorState, node: SiteNode, breakpoint: string): void;
  updateTokens(next: EditorState): void;
  insertVideo(): void;
}

export function installInspector(ctx: InspectorContext): InspectorExtensions {
  installTransform3d(ctx);
  const effects = installEffects(ctx);
  const media = installMedia(ctx);
  let latest: EditorState | undefined;
  const theme = installTheme(ctx, () => apply(true));
  const fonts = installFonts(ctx);
  const properties = installProperties(ctx);
  const variables = installVariables(ctx);
  const components = installComponents(ctx);
  const codeSection = installCodeSection(ctx);
  const motion = installMotion(ctx);

  function apply(rerender: boolean): void {
    if (!latest) return;
    const view = theme.preview(latest);
    ctx.canvas.setAppearance(view.mode, view.overrides, fonts.css(latest), rerender);
  }

  return {
    update(next, node, breakpoint) {
      latest = next;
      effects(node, breakpoint);
      media.update(node);
      components.update(next, node);
      codeSection.update(next, node);
      motion.update(next, node);
      apply(false);
    },
    updateTokens(next) {
      theme.fill(next);
      fonts.fill(next);
      properties.fill(next);
      variables.fill(next);
    },
    insertVideo: media.insertVideo
  };
}
