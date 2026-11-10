import type { Canvas } from '../../ui/canvas';
import type { Icon } from '../../ui/icons';
import type { DesignFont, DesignThemes, EditorState, SiteNode } from '../../types';

export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface InspectorContext {
  section(container: HTMLElement, title: string, hint?: string): HTMLElement;
  field(label: string, input: Control, full?: boolean): HTMLElement;
  select(items: { id: string; name: string }[]): HTMLSelectElement;
  input(placeholder?: string, className?: string): HTMLInputElement;
  button(label: string, symbol?: Icon, action?: () => unknown, className?: string): HTMLButtonElement;
  addStyle(container: HTMLElement, label: string, key: string, choices?: string[], full?: boolean): void;
  addSegments(container: HTMLElement, label: string, key: string, choices: [string, string][]): void;
  setStyle(name: string, content: string): Promise<EditorState>;
  nodePatch(patch: Record<string, unknown>): Promise<EditorState>;
  run(action: () => unknown): Promise<void>;
  status(message: string, error?: boolean): void;
  insertionParent(): string;
  makeNode(tag: string, name: string, content?: string, styles?: Record<string, string>, attrs?: Record<string, string>): SiteNode;
  selectNode(id: string): void;
  showLayers(): void;
  canvas: Canvas;
  panes: { design: HTMLElement; content: HTMLElement; tokens: HTMLElement; motion: HTMLElement };
  anchors: { afterAttributes: HTMLElement; stageBefore: HTMLElement };
}

export interface DesignGroup { themes?: Partial<DesignThemes>; fonts?: Record<string, DesignFont> }

export function designGroup(next: EditorState): DesignGroup {
  return (next.site.extensions?.design || {}) as DesignGroup;
}

export function readThemes(next: EditorState): DesignThemes {
  const stored = designGroup(next).themes || {};
  return {
    default: stored.default === 'light' ? 'light' : 'dark',
    followSystem: !!stored.followSystem,
    values: { dark: { ...(stored.values?.dark || {}) }, light: { ...(stored.values?.light || {}) } }
  };
}

export function readFonts(next: EditorState): Record<string, DesignFont> {
  return { ...(designGroup(next).fonts || {}) };
}

export function breakpointStyles(node: SiteNode, breakpoint: string): Record<string, string> {
  return breakpoint === 'desktop' ? node.styles : node.breakpoints[breakpoint] || {};
}
