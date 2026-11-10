import type { InspectorContext } from '../inspector/context';
import type { EditorState, SiteNode } from '../../types';

export const MOTION_KINDS = ['reveals', 'scenes', 'loops', 'counters', 'text', 'drag', 'pointer', 'disclosure', 'actions', 'scripts'] as const;
export type MotionKind = typeof MOTION_KINDS[number];
export type MotionGroup = Record<MotionKind, Record<string, unknown>>;
export type TrackList = 'tracks' | 'distribute';

export const MOTION_SAFE = ['opacity', 'transform', 'translate', 'scale', 'rotate', 'filter', 'backdrop-filter', 'clip-path', 'color', 'background-color', 'border-color', 'box-shadow'] as const;

export interface MotionEditor { update(next: EditorState, node: SiteNode): void }

export interface MotionContext extends InspectorContext {
  motion(next: EditorState): MotionGroup;
  set(kind: MotionKind, node: string, value: unknown): Promise<void>;
  remove(kind: MotionKind, node: string): Promise<void>;
  track(scene: string, list: TrackList, index: number, track: unknown): Promise<void>;
  easing(container: HTMLElement, label: string, value: string, onChange: (next: string) => void): { set(value: string): void };
  styleRows(container: HTMLElement, styles: Record<string, string>, onChange: (next: Record<string, string>) => void): { set(styles: Record<string, string>): void };
}

export type MotionInstaller = (ctx: MotionContext, container: HTMLElement) => MotionEditor;

export function readMotion(next: EditorState): MotionGroup {
  const stored = (next.site.extensions?.motion || {}) as Partial<Record<MotionKind, Record<string, unknown>>>;
  const group = {} as MotionGroup;
  for (const kind of MOTION_KINDS) group[kind] = { ...(stored[kind] || {}) };
  return group;
}
