import type { Command, Site } from '../types';
import type { Pt, SubPath } from './geometry';
import type { Paint, Shape } from './store';

export interface Frame { left: number; top: number; sx: number; sy: number; vx: number; vy: number }

export interface Host {
  site(): Site;
  selection(): string[];
  primary(): string;
  setSelection(ids: string[]): void;
  anchors(): Set<string>;
  shape(id: string): Shape | undefined;
  frame(svg: string): Frame | undefined;
  toShell(f: Frame, p: Pt): Pt;
  toLocal(f: Frame, p: Pt): Pt;
  px(): number;
  commit(cmds: Command[], afterSelect?: string[]): Promise<boolean>;
  notify(message: string): void;
  render(): void;
  emit(): void;
  activeSvg(): string | undefined;
  parentOf(id: string): string | undefined;
  paint(): Paint;
  element(id: string): Element | null;
  draft(id: string, subs: SubPath[]): void;
  clearDrafts(): void;
  isolated(): string | null;
  tool(): string | null;
  pick(p: Pt): { id: string; kind: 'path' | 'svg' | 'other' } | undefined;
}
