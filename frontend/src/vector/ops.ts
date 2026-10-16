import type { Command } from '../types';
import {
  alignCommands, blendCommands, distributeCommands, groupCommands, makeMaskCommands, releaseMaskCommands, repeatCommands, textOnPathCommands, transformEach, transformSelection, ungroupCommands, unionBox,
  type AlignMode, type AlignTo, type DistributeMode, type EachParams, type RepeatParams, type TransformParams
} from './arrange';
import { applyCorners } from './corners';
import { distortSubs, warpSubs, type DistortOptions, type WarpOptions } from './distort';
import { editGradient, setPaintKind, withAngle, type Gradient, type Target } from './gradient';
import type { Host } from './host';
import { pathIds, updateGeometry, type Shape } from './store';
import { presetCommands, readWidth, widthCommands } from './stroke';
import { flipProfile, type WidthPreset } from './widthprofile';

export class Ops {
  constructor(private h: Host, private leave: () => void) {}

  private shapes(): Shape[] {
    return this.h.selection().map(id => this.h.shape(id)).filter((s): s is Shape => !!s);
  }

  private async run(cmds: Command[], select?: string[]): Promise<void> {
    if (cmds.length) await this.h.commit(cmds, select);
  }

  async group(): Promise<void> {
    const ids = this.shapes().map(s => s.id);
    if (ids.length < 2) { this.h.notify('Select two or more paths to group.'); return; }
    const made = groupCommands(this.h, ids);
    if (made) await this.run(made.cmds, ids);
  }

  async ungroup(): Promise<void> {
    const ids = this.shapes().map(s => s.id);
    const cmds = ungroupCommands(this.h, ids);
    if (!cmds.length) { this.h.notify('The selection is not in a group.'); return; }
    this.leave();
    await this.run(cmds, ids);
  }

  async makeMask(kind: 'clip' | 'mask'): Promise<void> {
    const ids = this.shapes().map(s => s.id);
    const svg = this.h.activeSvg();
    const order = svg ? pathIds(this.h.site(), svg) : [];
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    await this.run(makeMaskCommands(this.h, kind), ids.slice(0, -1));
  }

  async releaseMask(): Promise<void> {
    const ids = this.shapes().map(s => s.id);
    await this.run(releaseMaskCommands(this.h), ids);
  }

  async align(mode: AlignMode, to: AlignTo): Promise<void> { await this.run(alignCommands(this.h, mode, to)); }

  async distribute(mode: DistributeMode, gap: number | null): Promise<void> { await this.run(distributeCommands(this.h, mode, gap)); }

  async transform(p: TransformParams): Promise<void> {
    const r = transformSelection(this.h, p);
    await this.run(r.cmds, r.created.length ? r.created : undefined);
  }

  async each(p: EachParams): Promise<void> {
    const r = transformEach(this.h, p);
    await this.run(r.cmds, r.created.length ? r.created : undefined);
  }

  async blend(steps: number): Promise<void> {
    const r = blendCommands(this.h, steps);
    if (r) await this.run(r.cmds);
  }

  async repeat(p: RepeatParams): Promise<void> {
    const r = repeatCommands(this.h, p);
    if (r) await this.run(r.cmds);
  }

  async warp(options: WarpOptions): Promise<void> {
    const shapes = this.shapes();
    const box = unionBox(shapes);
    if (!box) { this.h.notify('Select one or more paths first.'); return; }
    await this.run(shapes.map(s => updateGeometry(s.id, warpSubs(applyCorners(s.subs), options, box))));
  }

  async distort(options: DistortOptions): Promise<void> {
    const shapes = this.shapes();
    if (!shapes.length) { this.h.notify('Select one or more paths first.'); return; }
    await this.run(shapes.map(s => updateGeometry(s.id, distortSubs(applyCorners(s.subs), options))));
  }

  async textOnPath(text: string, size: number, offset: number): Promise<void> {
    const id = this.h.primary();
    await this.run(textOnPathCommands(this.h, id, text, size, offset));
  }

  async paintKind(target: Target, kind: 'solid' | 'linear' | 'radial'): Promise<void> {
    await this.run(setPaintKind(this.h, target, kind, this.shapes()));
  }

  async gradient(target: Target, change: (g: Gradient) => void): Promise<void> {
    await this.run(editGradient(this.h, target, this.shapes(), change));
  }

  async gradientAngle(target: Target, degrees: number): Promise<void> {
    await this.run(editGradient(this.h, target, this.shapes(), g => { const next = withAngle(g, degrees); g.p0 = next.p0; g.p1 = next.p1; }));
  }

  async widthPreset(preset: WidthPreset): Promise<void> {
    const shapes = this.shapes().filter(s => s.subs[0] && !s.subs[0].closed || preset === 'uniform');
    await this.run(shapes.flatMap(s => presetCommands(this.h.site(), s, preset)));
  }

  async widthFlip(): Promise<void> {
    const site = this.h.site();
    await this.run(this.shapes().flatMap(s => { const info = readWidth(site.nodes[s.id]); return info ? widthCommands(site, s, flipProfile(info.points)) : []; }));
  }
}
