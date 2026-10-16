import type { Command } from '../types';
import {
  alignCommands, blendCommands, distributeCommands, groupCommands, makeMaskCommands, maskHolder, maskOptionCommands, releaseMaskCommands, repeatCommands, transformEach, transformSelection, ungroupCommands, unionBox,
  type AlignMode, type AlignTo, type DistributeMode, type EachParams, type MaskOptions, type RepeatParams, type TransformParams
} from './arrange';
import { applyCorners } from './corners';
import { distortSubs, warpSubs, type DistortOptions, type WarpOptions } from './distort';
import { editGradient, setPaintKind, withAngle, type Gradient, type Target } from './gradient';
import type { Host } from './host';
import { pathIds, updateGeometry, type Shape } from './store';
import { presetCommands, readWidth, widthCommands } from './stroke';
import { typeCommands, type TypeOptions } from './typepath';
import { flipProfile, profileFromSaved, profileToSaved, type SavedProfile, type WidthPoint, type WidthPreset } from './widthprofile';

export class Ops {
  private maskDefaults: MaskOptions = { clip: true, invert: false };

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
    await this.run(makeMaskCommands(this.h, kind, { ...this.maskDefaults }), ids.slice(0, -1));
  }

  maskState(): MaskOptions {
    return maskHolder(this.h.site(), this.h.selection())?.options ?? this.maskDefaults;
  }

  async maskOption(change: Partial<MaskOptions>): Promise<void> {
    const next = { ...this.maskState(), ...change };
    if (maskHolder(this.h.site(), this.h.selection())) await this.run(maskOptionCommands(this.h, next));
    else this.maskDefaults = next;
    this.h.emit();
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

  async textOnPath(options: TypeOptions): Promise<void> {
    const id = this.h.primary();
    await this.run(typeCommands(this.h.site(), id, options, message => this.h.notify(message)));
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

  async widthSaved(profile: SavedProfile): Promise<void> {
    const site = this.h.site();
    await this.run(this.shapes().flatMap(s => widthCommands(site, s, profileFromSaved(profile.points, Math.max(1, s.paint.strokeWidth)))));
  }

  currentProfile(): WidthPoint[] | null {
    const shape = this.shapes()[0];
    const info = shape && readWidth(this.h.site().nodes[shape.id]);
    return shape && info ? profileToSaved(info.points, Math.max(1, shape.paint.strokeWidth)) : null;
  }

  async widthFlip(): Promise<void> {
    const site = this.h.site();
    await this.run(this.shapes().flatMap(s => { const info = readWidth(site.nodes[s.id]); return info ? widthCommands(site, s, flipProfile(info.points)) : []; }));
  }
}
