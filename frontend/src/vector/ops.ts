import type { Command } from '../types';
import {
  alignCommands, distributeCommands, groupCommands, makeMaskCommands, maskHolder, maskOptionCommands, releaseMaskCommands, transformEach, transformSelection, ungroupCommands, unionBox,
  type AlignMode, type AlignTo, type DistributeMode, type EachParams, type MaskOptions, type RepeatParams, type TransformParams
} from './arrange';
import { applyCorners } from './corners';
import { distortSubs, warpSubs, type DistortOptions, type WarpOptions } from './distort';
import { editGradient, setPaintKind, withAngle, type Gradient, type Target } from './gradient';
import type { Host } from './host';
import type { PathfinderOp } from './boolean';
import { blendAttrs, compoundAttrs, effectAttrs, expandCommands, liveContainer, liveOf, readBlend, readRepeat, releaseCommands, removeEffectCommands, repeatAttrs, type BlendMode, type CompoundOp, type LiveKind } from './live';
import { rememberEach, rememberTransform } from './select';
import { pathIds, svgOf, updateAttrs, updateGeometry, type Shape } from './store';
import { breakCommands, defineCommands, placeCommands } from './symbols';
import { presetCommands, readWidth, widthCommands } from './stroke';
import { strokeCommands, strokeModelOf } from './strokecmd';
import type { StrokeModel } from './strokefx';
import { typeCommands, type TypeOptions } from './typepath';
import { meshFromWarp, meshGrid, readWarp, warpAttrs } from './warp';
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
    if (ids.some(id => liveOf(this.h.site(), id))) { await this.releaseLive(); return; }
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
    if (r.cmds.length) rememberTransform(p);
    await this.run(r.cmds, r.created.length ? r.created : undefined);
  }

  async each(p: EachParams): Promise<void> {
    const r = transformEach(this.h, p);
    if (r.cmds.length) rememberEach(p);
    await this.run(r.cmds, r.created.length ? r.created : undefined);
  }

  private ordered(): Shape[] {
    const svg = this.h.activeSvg();
    const order = svg ? pathIds(this.h.site(), svg) : [];
    return this.shapes().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  liveSelected(kind: LiveKind): string | undefined {
    try {
      const site = this.h.site();
      for (const id of this.h.selection()) { const found = liveOf(site, id); if (found && found.kind === kind) return found.group; }
    } catch { return undefined; }
    return undefined;
  }

  async blend(change: { mode: BlendMode; steps: number; distance: number }): Promise<void> {
    const site = this.h.site();
    const next = { mode: change.mode, steps: Math.max(1, Math.min(500, Math.round(change.steps))), distance: Math.max(0.5, Math.min(10000, change.distance)) };
    const group = this.liveSelected('blend');
    const spec = group ? readBlend(site.nodes[group].attrs['data-fw-blend']) : null;
    if (group && spec) { await this.run([updateAttrs(group, { 'data-fw-blend': JSON.stringify({ ...spec, ...next }) })]); return; }
    const shapes = this.ordered().slice(0, 16);
    if (shapes.length < 2) { this.h.notify('Select two or more paths to blend.'); return; }
    const ids = shapes.map(s => s.id);
    if (ids.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(ids.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(ids[0])) { this.h.notify('Blend needs paths that sit in the same group.'); return; }
    const made = blendAttrs(site, ids, next);
    const grouped = made && groupCommands(this.h, ids, 'Blend', { 'data-fw-blend': made.attr });
    if (made && grouped) await this.run([...grouped.cmds, ...liveContainer(site, new Set([grouped.group]), grouped.group, 'blend', made.outputs, 1)], ids);
  }

  async repeat(p: RepeatParams): Promise<void> {
    const site = this.h.site();
    const next = {
      kind: p.kind, count: Math.max(2, Math.min(120, Math.round(p.count))), radius: Math.max(-5000, Math.min(5000, p.radius)), cols: Math.max(1, Math.min(60, Math.round(p.cols))), rows: Math.max(1, Math.min(60, Math.round(p.rows))),
      gx: Math.max(-1000, Math.min(1000, p.gapX)), gy: Math.max(-1000, Math.min(1000, p.gapY)), angle: Math.max(-360, Math.min(360, p.angle)), brick: p.brick, offset: Math.max(-1000, Math.min(1000, p.offset))
    };
    const group = this.liveSelected('repeat');
    const spec = group ? readRepeat(site.nodes[group].attrs['data-fw-repeat']) : null;
    if (group && spec) { await this.run([updateAttrs(group, { 'data-fw-repeat': JSON.stringify({ ...spec, ...next }) })]); return; }
    const shapes = this.ordered().slice(0, 16);
    if (!shapes.length) { this.h.notify('Select one or more paths to repeat.'); return; }
    const ids = shapes.map(s => s.id);
    if (ids.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(ids.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(ids[0])) { this.h.notify('Repeat needs paths that sit in the same group.'); return; }
    const made = repeatAttrs(site, ids, next);
    const grouped = made && groupCommands(this.h, ids, `Repeat (${p.kind})`, { 'data-fw-repeat': made.attr });
    if (made && grouped) await this.run([...grouped.cmds, ...liveContainer(site, new Set([grouped.group]), grouped.group, 'repeat', made.outputs, ids.length)], ids);
  }

  async compound(op: CompoundOp): Promise<void> {
    const site = this.h.site();
    const ids = this.ordered().slice(0, 16).map(s => s.id);
    if (ids.length < 2) { this.h.notify('Select two or more paths first.'); return; }
    if (ids.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(ids.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(ids[0])) { this.h.notify('Live compound shapes need paths that sit in the same group.'); return; }
    const made = compoundAttrs(site, ids, op);
    if (!made || !made.outputs.length) { this.h.notify('The operation produced no shape.'); return; }
    const grouped = groupCommands(this.h, ids, 'Compound shape', { 'data-fw-compound': made.attr });
    if (grouped) await this.run([...grouped.cmds, ...ids.map(id => updateAttrs(id, { visibility: 'hidden' })), ...liveContainer(site, new Set([grouped.group]), grouped.group, 'compound', made.outputs, ids.length)], ids);
  }

  async expandLive(): Promise<void> {
    const group = this.liveSelected('blend') ?? this.liveSelected('repeat') ?? this.liveSelected('brush') ?? this.liveSelected('stroke') ?? this.liveSelected('compound') ?? this.liveSelected('warp') ?? this.liveSelected('effect');
    if (!group) { this.h.notify('Select a live blend or repeat first.'); return; }
    const site = this.h.site();
    const holder = site.nodes[group].children.find(id => site.nodes[id]?.attrs['data-fw-live']);
    await this.run(expandCommands(site, group), (site.nodes[group].attrs['data-fw-compound'] || site.nodes[group].attrs['data-fw-warp'] || site.nodes[group].attrs['data-fw-effect']) && holder ? site.nodes[holder].children.slice() : this.h.selection().slice());
  }

  async releaseLive(): Promise<void> {
    const fxGroup = this.liveSelected('effect');
    if (fxGroup) { await this.removeEffect(); return; }
    const group = this.liveSelected('blend') ?? this.liveSelected('repeat') ?? this.liveSelected('brush') ?? this.liveSelected('stroke') ?? this.liveSelected('compound') ?? this.liveSelected('warp');
    if (!group) { this.h.notify('Select a live blend or repeat first.'); return; }
    const made = releaseCommands(this.h.site(), group);
    this.leave();
    await this.run(made.cmds, made.sources);
  }

  async defineSymbol(name: string): Promise<void> {
    const made = defineCommands(this.h, name);
    if (made) await this.run(made.cmds, [made.use]);
  }

  async placeSymbol(symbol: string): Promise<void> {
    const made = placeCommands(this.h, symbol);
    if (made) await this.run(made.cmds, [made.use]);
  }

  async replaceSymbol(symbol: string): Promise<void> {
    const site = this.h.site();
    const target = site.nodes[symbol];
    const svg = this.h.activeSvg();
    const uses = this.h.selection().filter(id => site.nodes[id]?.tag === 'use');
    if (!target || target.tag !== 'symbol' || !svg) return;
    if (!uses.length) { this.h.notify('Select a symbol instance first.'); return; }
    if (uses.some(id => svgOf(site, id) !== svgOf(site, symbol))) { this.h.notify('Select something in the svg that holds this symbol first.'); return; }
    await this.run(uses.map(id => updateAttrs(id, { href: `#${target.attrs.id}` })), uses);
  }

  async breakLink(): Promise<void> {
    const id = this.h.selection().find(item => this.h.site().nodes[item]?.tag === 'use');
    if (!id) { this.h.notify('Select a symbol instance first.'); return; }
    const made = breakCommands(this.h, id);
    if (made) await this.run(made.cmds, made.created);
  }

  async warp(options: WarpOptions): Promise<void> {
    const shapes = this.shapes();
    const box = unionBox(shapes);
    if (!box) { this.h.notify('Select one or more paths first.'); return; }
    await this.run(shapes.map(s => updateGeometry(s.id, warpSubs(applyCorners(s.subs), options, box))));
  }

  async envelope(mode: 'warp' | 'top', options: WarpOptions): Promise<void> {
    const site = this.h.site();
    const pct = (n: number): number => Math.max(-100, Math.min(100, Math.round(n * 10000) / 100));
    const change = { style: options.preset, orient: options.orient ?? 'h', bend: pct(options.bend), hd: pct(options.horizontal), vd: pct(options.vertical) };
    const group = this.liveSelected('warp');
    const spec = group ? readWarp(site.nodes[group].attrs['data-fw-warp']) : null;
    if (group && spec) { await this.run([updateAttrs(group, { 'data-fw-warp': JSON.stringify({ ...spec, ...change }) })]); return; }
    const shapes = this.ordered().slice(0, 16);
    if (!shapes.length) { this.h.notify('Select one or more paths first.'); return; }
    let ids = shapes.map(s => s.id), env = '';
    if (mode === 'top') {
      const top = shapes[shapes.length - 1];
      if (shapes.length < 2 || !top.subs.some(s => s.closed)) { this.h.notify('Select a closed path above the shapes to use as the envelope.'); return; }
      env = top.id;
      ids = ids.slice(0, -1);
    }
    const all = env ? [...ids, env] : ids;
    if (all.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(all.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(all[0])) { this.h.notify('Envelope needs paths that sit in the same group.'); return; }
    const made = warpAttrs(site.nodes, ids, env, change);
    if (!made) { this.h.notify('The envelope produced no shape.'); return; }
    const grouped = groupCommands(this.h, all, 'Envelope', { 'data-fw-warp': made.attr });
    if (grouped) await this.run([...grouped.cmds, ...all.map(id => updateAttrs(id, { opacity: '0' })), ...liveContainer(site, new Set([grouped.group]), grouped.group, 'warp', made.outputs, all.length)], all);
  }

  async envelopeMesh(rows: number, cols: number, reset: boolean): Promise<void> {
    const site = this.h.site();
    const r = Math.max(1, Math.min(50, Math.round(rows))), c = Math.max(1, Math.min(50, Math.round(cols)));
    const group = this.liveSelected('warp');
    const spec = group ? readWarp(site.nodes[group].attrs['data-fw-warp']) : null;
    if (reset || (group && spec)) {
      if (!group || !spec) { this.h.notify('Select a live warp envelope first.'); return; }
      if (spec.mode === 'top') { this.h.notify('Select a live warp envelope first.'); return; }
      const attrs = spec.src.map(id => site.nodes[id]?.attrs);
      const mesh = spec.mode === 'mesh' ? meshGrid(r, c) : attrs.every(a => !!a) ? meshFromWarp(attrs as Record<string, string>[], null, spec, r, c) : null;
      if (!mesh) { this.h.notify('The envelope produced no shape.'); return; }
      await this.run([updateAttrs(group, { 'data-fw-warp': JSON.stringify({ ...spec, mode: 'mesh', rows: r, cols: c, mesh }) })]);
      return;
    }
    const shapes = this.ordered().slice(0, 16);
    if (!shapes.length) { this.h.notify('Select one or more paths first.'); return; }
    const ids = shapes.map(s => s.id);
    if (ids.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(ids.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(ids[0])) { this.h.notify('Envelope needs paths that sit in the same group.'); return; }
    const made = warpAttrs(site.nodes, ids, '', { style: 'arc', orient: 'h', bend: 0, hd: 0, vd: 0 }, { rows: r, cols: c });
    if (!made) { this.h.notify('The envelope produced no shape.'); return; }
    const grouped = groupCommands(this.h, ids, 'Envelope mesh', { 'data-fw-warp': made.attr });
    if (grouped) await this.run([...grouped.cmds, ...ids.map(id => updateAttrs(id, { opacity: '0' })), ...liveContainer(site, new Set([grouped.group]), grouped.group, 'warp', made.outputs, ids.length)], ids);
  }

  async pathfinderEffect(op: PathfinderOp): Promise<void> {
    const site = this.h.site();
    const current = this.liveSelected('effect');
    if (current) {
      const ids = site.nodes[current].children.filter(id => site.nodes[id]?.tag === 'path' && !site.nodes[id].attrs['data-fw-live']);
      const made = effectAttrs(site, ids, op);
      if (made) await this.run([updateAttrs(current, { 'data-fw-effect': JSON.stringify({ v: 1, fx: 'pathfinder', op, sig: '00000000' }) })]);
      return;
    }
    let ids = this.ordered().slice(0, 30).map(s => s.id);
    const only = ids.length === 1 ? this.h.parentOf(ids[0]) : undefined;
    const holder = only && site.nodes[only]?.tag === 'g' && !liveOf(site, ids[0]) ? only : undefined;
    if (holder) {
      ids = site.nodes[holder].children.filter(id => site.nodes[id]?.tag === 'path' && !site.nodes[id].attrs['data-fw-live']);
      if (ids.length < 2) { this.h.notify('Select two or more paths, or a group, first.'); return; }
      const made = effectAttrs(site, ids, op);
      if (made) await this.run([updateAttrs(holder, { 'data-fw-effect': made.attr, visibility: 'hidden' }), ...liveContainer(site, new Set([holder]), holder, 'effect', made.outputs, ids.length)], ids);
      return;
    }
    if (ids.length < 2) { this.h.notify('Select two or more paths, or a group, first.'); return; }
    if (ids.some(id => liveOf(site, id))) { this.h.notify('These paths already belong to a live blend or repeat.'); return; }
    if (new Set(ids.map(id => this.h.parentOf(id))).size !== 1 || !this.h.parentOf(ids[0])) { this.h.notify('Live compound shapes need paths that sit in the same group.'); return; }
    const made = effectAttrs(site, ids, op);
    if (!made) return;
    const grouped = groupCommands(this.h, ids, 'Pathfinder effect', { 'data-fw-effect': made.attr, visibility: 'hidden' });
    if (grouped) await this.run([...grouped.cmds, ...liveContainer(site, new Set([grouped.group]), grouped.group, 'effect', made.outputs, ids.length)], ids);
  }

  async removeEffect(): Promise<void> {
    const group = this.liveSelected('effect');
    if (!group) { this.h.notify('Select a group with a Pathfinder effect first.'); return; }
    const site = this.h.site();
    const ids = site.nodes[group].children.filter(id => site.nodes[id]?.tag === 'path' && !site.nodes[id].attrs['data-fw-live']);
    await this.run(removeEffectCommands(site, group), ids);
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

  private strokeQueue: Promise<void> = Promise.resolve();

  strokeFx(change: Partial<StrokeModel>): Promise<void> {
    const next = this.strokeQueue.then(async () => {
      const made = strokeCommands(this.h, change);
      if (made) await this.run(made.cmds, made.select);
    });
    this.strokeQueue = next.catch(() => undefined);
    return next;
  }

  strokeModel(): StrokeModel | null {
    try {
      const shape = this.shapes()[0];
      return shape ? strokeModelOf(this.h, shape.id) : null;
    } catch { return null; }
  }

  async widthFlip(): Promise<void> {
    const site = this.h.site();
    await this.run(this.shapes().flatMap(s => { const info = readWidth(site.nodes[s.id]); return info ? widthCommands(site, s, flipProfile(info.points)) : []; }));
  }
}
