import type { EditorState, SiteNode } from '../../types';
import type { InspectorContext } from './context';
import { installTransform3d } from './transform3d';
import { installEffects } from './effects';
import { installMedia } from './media';
import { installTheme } from './theme';
import { installFonts } from './fonts';
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
      apply(false);
    },
    updateTokens(next) {
      theme.fill(next);
      fonts.fill(next);
    },
    insertVideo: media.insertVideo
  };
}
