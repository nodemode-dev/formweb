import { element, text, value } from '../ui/dom';
import type { AlignMode, AlignTo, DistributeMode } from './arrange';
import type { DistortKind, WarpPreset } from './distort';
import type { Editor } from './editor';
import { colorToHex, gradientCss, readFor, angleOf, stopColorAt, type Target } from './gradient';
import { vectorIcon, type VectorIcon } from './icons';
import { button, field, numberInput, section, segment } from './panel';
import type { StrokeAlign } from './store';
import { readWidth } from './stroke';
import type { WidthPreset } from './widthprofile';

const STOP_ROWS = 8;

function num(init: number, min: number, max: number, step: number): HTMLInputElement {
  const input = numberInput(min, max, step, () => undefined);
  input.value = String(init);
  return input;
}

const read = (input: HTMLInputElement, fallback: number): number => {
  const n = parseFloat(input.value);
  return Number.isFinite(n) ? n : fallback;
};

function check(label: string, on = false): { root: HTMLElement; input: HTMLInputElement } {
  const input = element('input', 'fw-v-check');
  input.type = 'checkbox';
  input.checked = on;
  const root = element('label', 'fw-v-checkrow');
  root.append(input, element('span', '', label));
  return { root, input };
}

function row(...children: HTMLElement[]): HTMLElement {
  const wrap = element('div', 'fw-v-row');
  wrap.append(...children);
  return wrap;
}

function grid(...children: HTMLElement[]): HTMLElement {
  const wrap = element('div', 'fw-v-grid');
  wrap.append(...children);
  return wrap;
}

interface StopRow { root: HTMLElement; color: HTMLInputElement; offset: HTMLInputElement; opacity: HTMLInputElement; remove: HTMLButtonElement }

export class ExtraSections {
  readonly sections: HTMLElement[] = [];
  private target: ReturnType<typeof segment<Target>>;
  private kind: ReturnType<typeof segment<'solid' | 'linear' | 'radial'>>;
  private spread: ReturnType<typeof segment<'pad' | 'reflect' | 'repeat'>>;
  private angle: HTMLInputElement;
  private bar = element('div', 'fw-v-gradbar');
  private rows: StopRow[] = [];
  private gradientBody = element('div', 'fw-v-stack');
  private align: ReturnType<typeof segment<StrokeAlign>>;
  private widthNote = element('p', 'fw-v-note');
  private alignTo: AlignTo = 'selection';
  private alignToSeg: ReturnType<typeof segment<AlignTo>>;
  private isoNote = element('p', 'fw-v-note');
  private isoExit: HTMLButtonElement;
  private snap = check('Snap to anchors, segments, centers and 45 degree angles', true);
  private eraser: HTMLInputElement;
  private guideNote = element('p', 'fw-v-note');

  constructor(private editor: Editor) {
    const ops = editor.ops, extras = editor.extras;

    const gradient = section('Gradient', true);
    this.target = segment<Target>([{ id: 'fill', label: 'Fill' }, { id: 'stroke', label: 'Stroke' }], id => { extras.target = id; editor.emit(); editor.render(); });
    this.kind = segment<'solid' | 'linear' | 'radial'>([{ id: 'solid', label: 'Solid' }, { id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }], id => { void ops.paintKind(extras.target, id); });
    this.spread = segment<'pad' | 'reflect' | 'repeat'>([{ id: 'pad', label: 'Pad' }, { id: 'reflect', label: 'Reflect' }, { id: 'repeat', label: 'Repeat' }], id => { void ops.gradient(extras.target, g => { g.spread = id; }); });
    this.angle = numberInput(-360, 360, 1, n => { void ops.gradientAngle(extras.target, n); });
    for (let i = 0; i < STOP_ROWS; i++) {
      const color = element('input', 'fw-v-color');
      color.type = 'color';
      const offset = numberInput(0, 100, 1, n => { void ops.gradient(extras.target, g => { if (g.stops[i]) g.stops[i].offset = n / 100; }); });
      const opacity = numberInput(0, 100, 1, n => { void ops.gradient(extras.target, g => { if (g.stops[i]) g.stops[i].opacity = n / 100; }); });
      const remove = button('', 'Remove this stop', () => { void ops.gradient(extras.target, g => { if (g.stops.length > 2) g.stops.splice(i, 1); }); }, 'close');
      color.addEventListener('change', () => { void ops.gradient(extras.target, g => { if (g.stops[i]) g.stops[i].color = color.value; }); });
      const rowEl = element('div', 'fw-v-stop');
      rowEl.hidden = true;
      rowEl.addEventListener('pointerdown', () => { extras.stop = i; editor.render(); editor.emit(); });
      rowEl.append(color, offset, opacity, remove);
      this.rows.push({ root: rowEl, color, offset, opacity, remove });
      this.gradientBody.append(rowEl);
    }
    this.gradientBody.prepend(this.bar);
    const addStop = button('Add stop', 'Add a stop in the widest gap', () => {
      void ops.gradient(extras.target, g => {
        if (g.stops.length >= STOP_ROWS) return;
        const sorted = g.stops.slice().sort((a, b) => a.offset - b.offset);
        let at = 0.5, gap = 0;
        for (let i = 1; i < sorted.length; i++) if (sorted[i].offset - sorted[i - 1].offset > gap) { gap = sorted[i].offset - sorted[i - 1].offset; at = (sorted[i].offset + sorted[i - 1].offset) / 2; }
        const c = stopColorAt(g.stops, at);
        g.stops.push({ color: c.color, offset: at, opacity: c.opacity });
      });
    }, 'add');
    const reverse = button('Reverse', 'Reverse the gradient', () => { void ops.gradient(extras.target, g => { g.stops.forEach(s => { s.offset = 1 - s.offset; }); }); }, 'convert');
    gradient.body.append(this.target.root, this.kind.root, field('Angle', this.angle), field('Spread', this.spread.root, true), this.gradientBody, grid(addStop, reverse),
      element('p', 'fw-v-note', 'Gradient tool (G): drag to set the line, drag the ends or stops, click the line to add a stop, Alt-click a stop to remove it.'));

    const stroke = section('Stroke align and width', false);
    this.align = segment<StrokeAlign>([{ id: 'center', label: 'Center' }, { id: 'inside', label: 'Inside' }, { id: 'outside', label: 'Outside' }], id => editor.applyPaint({ align: id }));
    const presets: { id: WidthPreset; label: string }[] = [{ id: 'uniform', label: 'Uniform' }, { id: 'taper-end', label: 'Taper end' }, { id: 'taper-both', label: 'Taper both' }, { id: 'bulge', label: 'Bulge' }, { id: 'ends', label: 'Wide ends' }];
    stroke.body.append(field('Stroke align', this.align.root, true), grid(...presets.map(p => button(p.label, `Width profile: ${p.label}`, () => { void ops.widthPreset(p.id); }))),
      grid(button('Flip profile', 'Reverse the width profile along the path', () => { void ops.widthFlip(); }, 'convert')), this.widthNote,
      element('p', 'fw-v-note', 'Width tool (Shift+W): drag from a point on the path to set the width there, drag a point to change it, Alt-click a point to remove it.'));

    const arrange = section('Group, clip and mask', false);
    this.isoExit = button('Exit isolation', 'Leave isolation mode', () => extras.exit());
    arrange.body.append(
      grid(button('Group', 'Group the selected paths', () => { void ops.group(); }, 'group'), button('Ungroup', 'Ungroup the selected group', () => { void ops.ungroup(); }, 'ungroup'), this.isoExit),
      grid(button('Make clip', 'Use the top path as a clipping mask', () => { void ops.makeMask('clip'); }, 'clip'), button('Make mask', 'Use the top path as an opacity mask (luminosity)', () => { void ops.makeMask('mask'); }, 'mask'), button('Release', 'Release the clipping or opacity mask', () => { void ops.releaseMask(); }, 'divide')),
      this.isoNote);

    const align = section('Align and distribute', false);
    this.alignToSeg = segment<AlignTo>([{ id: 'selection', label: 'Selection' }, { id: 'key', label: 'Key object' }, { id: 'artboard', label: 'Artboard' }], id => { this.alignTo = id; this.update(); });
    const alignButtons: { mode: AlignMode; label: string; icon: VectorIcon }[] = [
      { mode: 'left', label: 'Align left', icon: 'alignLeft' }, { mode: 'hcenter', label: 'Align horizontal centers', icon: 'alignCenter' }, { mode: 'right', label: 'Align right', icon: 'alignRight' },
      { mode: 'top', label: 'Align top', icon: 'alignTop' }, { mode: 'vmiddle', label: 'Align vertical centers', icon: 'alignMiddle' }, { mode: 'bottom', label: 'Align bottom', icon: 'alignBottom' }
    ];
    const spaceGap = num(0, -10000, 10000, 1);
    const useGap = check('Use a specific spacing');
    const distributeButtons: { mode: DistributeMode; label: string; icon: VectorIcon }[] = [
      { mode: 'left', label: 'Distribute left edges', icon: 'alignLeft' }, { mode: 'hcenter', label: 'Distribute horizontal centers', icon: 'alignCenter' }, { mode: 'right', label: 'Distribute right edges', icon: 'alignRight' },
      { mode: 'top', label: 'Distribute top edges', icon: 'alignTop' }, { mode: 'vmiddle', label: 'Distribute vertical centers', icon: 'alignMiddle' }, { mode: 'bottom', label: 'Distribute bottom edges', icon: 'alignBottom' },
      { mode: 'hspace', label: 'Distribute horizontal spacing', icon: 'spaceH' }, { mode: 'vspace', label: 'Distribute vertical spacing', icon: 'spaceV' }
    ];
    align.body.append(this.alignToSeg.root, grid(...alignButtons.map(b => button('', b.label, () => { void ops.align(b.mode, this.alignTo); }, b.icon))),
      grid(...distributeButtons.map(b => button('', b.label, () => { void ops.distribute(b.mode, useGap.input.checked ? read(spaceGap, 0) : null); }, b.icon))),
      row(field('Spacing', spaceGap), useGap.root),
      element('p', 'fw-v-note', 'With two or more anchors selected these act on anchors. The key object is the last selected path.'));

    const transform = section('Transform', false);
    const angle = num(15, -360, 360, 1), scale = num(120, 1, 10000, 1), scaleY = num(120, 1, 10000, 1), shear = num(20, -80, 80, 1), axis = num(0, -360, 360, 1), dx = num(10, -10000, 10000, 1), dy = num(0, -10000, 10000, 1);
    const copy = check('Copy'), strokes = check('Scale strokes'), uniform = check('Uniform scale', true);
    const base = () => ({ angle: read(angle, 0), sx: read(scale, 100), sy: read(scaleY, 100), axis: read(axis, 0), dx: read(dx, 0), dy: read(dy, 0), copy: copy.input.checked, strokes: strokes.input.checked, uniform: uniform.input.checked });
    transform.body.append(
      row(field('Angle', angle), field('Axis angle', axis)), row(field('Scale X %', scale), field('Scale Y %', scaleY)), row(field('Shear angle', shear), field('', element('span'))), row(field('Move X', dx), field('Move Y', dy)),
      row(copy.root, strokes.root), uniform.root,
      grid(button('Rotate', 'Rotate the selection about its center', () => { void ops.transform({ ...base(), kind: 'rotate' }); }),
        button('Scale', 'Scale the selection about its center', () => { void ops.transform({ ...base(), kind: 'scale' }); }),
        button('Reflect', 'Reflect across the axis angle through the center (0 is horizontal, 90 is vertical)', () => { void ops.transform({ ...base(), kind: 'reflect' }); }),
        button('Shear', 'Shear along the axis angle', () => { void ops.transform({ ...base(), kind: 'shear', angle: read(shear, 0) }); }),
        button('Move', 'Move by the distances', () => { void ops.transform({ ...base(), kind: 'move' }); })));

    const each = section('Transform each', false);
    const eSx = num(110, 1, 10000, 1), eSy = num(110, 1, 10000, 1), eRot = num(10, -360, 360, 1), eDx = num(0, -10000, 10000, 1), eDy = num(0, -10000, 10000, 1);
    const eRx = check('Reflect X'), eRy = check('Reflect Y'), eRand = check('Random'), eCopy = check('Copy');
    each.body.append(row(field('Scale X %', eSx), field('Scale Y %', eSy)), row(field('Rotate', eRot), field('', element('span'))), row(field('Move X', eDx), field('Move Y', eDy)), row(eRx.root, eRy.root), row(eRand.root, eCopy.root),
      button('Transform each', 'Apply to every selected path about its own center', () => {
        void ops.each({ sx: read(eSx, 100), sy: read(eSy, 100), angle: read(eRot, 0), dx: read(eDx, 0), dy: read(eDy, 0), reflectX: eRx.input.checked, reflectY: eRy.input.checked, random: eRand.input.checked, copy: eCopy.input.checked, strokes: false });
      }));

    const effects = section('Blend and repeat', false);
    const steps = num(5, 1, 60, 1);
    const repeatKind = { value: 'radial' as 'radial' | 'grid' | 'mirror' };
    const repeatSeg = segment<'radial' | 'grid' | 'mirror'>([{ id: 'radial', label: 'Radial' }, { id: 'grid', label: 'Grid' }, { id: 'mirror', label: 'Mirror' }], id => { repeatKind.value = id; repeatSeg.set(id); });
    repeatSeg.set('radial');
    const count = num(6, 2, 120, 1), radius = num(80, -5000, 5000, 1), cols = num(3, 1, 60, 1), rows = num(2, 1, 60, 1), gapX = num(10, -1000, 1000, 1), gapY = num(10, -1000, 1000, 1), offset = num(0, -1000, 1000, 1);
    const axisSeg = segment<'vertical' | 'horizontal'>([{ id: 'vertical', label: 'Vertical axis' }, { id: 'horizontal', label: 'Horizontal axis' }], id => { axisValue.value = id; axisSeg.set(id); });
    const axisValue = { value: 'vertical' as 'vertical' | 'horizontal' };
    axisSeg.set('vertical');
    effects.body.append(field('Blend steps', steps), button('Blend', 'Create steps between two selected paths', () => { void ops.blend(read(steps, 5)); }, 'blend'),
      repeatSeg.root, row(field('Copies', count), field('Radial offset', radius)), row(field('Columns', cols), field('Rows', rows)), row(field('Gap X', gapX), field('Gap Y', gapY)), axisSeg.root, field('Mirror offset', offset),
      button('Repeat', 'Create copies (expanded)', () => { void ops.repeat({ kind: repeatKind.value, count: read(count, 6), radius: read(radius, 80), cols: read(cols, 3), rows: read(rows, 2), gapX: read(gapX, 10), gapY: read(gapY, 10), axis: axisValue.value, offset: read(offset, 0) }); }, 'repeat'));

    const warp = section('Envelope and distort', false);
    const preset = { value: 'arc' as WarpPreset };
    const presetSeg = segment<WarpPreset>([{ id: 'arc', label: 'Arc' }, { id: 'bulge', label: 'Bulge' }, { id: 'flag', label: 'Flag' }, { id: 'wave', label: 'Wave' }], id => { preset.value = id; presetSeg.set(id); });
    presetSeg.set('arc');
    const bend = num(50, -100, 100, 5), hDist = num(0, -100, 100, 5), vDist = num(0, -100, 100, 5);
    const kindState = { value: 'pucker-bloat' as DistortKind };
    const kindSeg = segment<DistortKind>([{ id: 'pucker-bloat', label: 'Pucker/Bloat' }, { id: 'roughen', label: 'Roughen' }, { id: 'zigzag', label: 'Zig Zag' }, { id: 'twist', label: 'Twist' }], id => { kindState.value = id; kindSeg.set(id); });
    kindSeg.set('pucker-bloat');
    const amount = num(40, -360, 360, 5), size = num(6, 0, 500, 1), detail = num(4, 1, 40, 1), seed = num(7, 1, 9999, 1);
    const smooth = check('Smooth points');
    warp.body.append(presetSeg.root, row(field('Bend %', bend), field('Horizontal %', hDist)), field('Vertical %', vDist),
      button('Apply envelope', 'Warp the selected paths with the preset', () => { void ops.warp({ preset: preset.value, bend: read(bend, 0) / 100, horizontal: read(hDist, 0) / 100, vertical: read(vDist, 0) / 100 }); }, 'warp'),
      kindSeg.root, row(field('Amount (% or degrees)', amount), field('Size', size)), row(field('Detail', detail), field('Seed', seed)), smooth.root,
      button('Apply distort', 'Distort the selected paths', () => { void ops.distort({ kind: kindState.value, amount: kindState.value === 'twist' ? read(amount, 0) : read(amount, 0) / 100, size: read(size, 6), detail: read(detail, 4), smooth: smooth.input.checked, seed: read(seed, 7) }); }, 'warp'));

    const type = section('Type on a path', false);
    const label = element('input', 'fw-v-input');
    label.type = 'text';
    label.maxLength = 200;
    label.placeholder = 'Text';
    const typeSize = num(24, 1, 500, 1), typeOffset = num(0, 0, 100, 1);
    type.body.append(field('Text', label, true), row(field('Size', typeSize), field('Start offset %', typeOffset)),
      button('Set type on path', 'Place text along the selected path', () => { void ops.textOnPath(label.value, read(typeSize, 24), read(typeOffset, 0)); }, 'type'));

    const guides = section('Snapping and eraser', false);
    this.snap.input.addEventListener('change', () => { extras.snapping = this.snap.input.checked; if (!extras.snapping) extras.clearGuides(); });
    this.eraser = numberInput(1, 400, 1, n => { extras.eraserSize = n; });
    guides.body.append(this.snap.root, field('Eraser size', this.eraser), this.guideNote);

    this.sections.push(gradient.root, stroke.root, arrange.root, align.root, transform.root, each.root, effects.root, warp.root, type.root, guides.root);
  }

  update(): void {
    const e = this.editor;
    const extras = e.extras;
    this.target.set(extras.target);
    const shape = e.selection.map(id => e.shapeOf(id)).find(s => !!s);
    const found = shape ? readFor(e.host(), shape, extras.target) : undefined;
    const g = found?.gradient;
    this.kind.set(g ? g.kind : 'solid');
    this.spread.set(g ? g.spread : 'pad');
    this.angle.disabled = !g || g.kind !== 'linear';
    if (g) value(this.angle, String(Math.round(angleOf(g))));
    this.bar.hidden = !g;
    const css = g ? gradientCss(g) : '';
    if (this.bar.style.background !== css && css) this.bar.style.background = css;
    this.rows.forEach((r, i) => {
      const stop = g?.stops[i];
      if (r.root.hidden !== !stop) r.root.hidden = !stop;
      if (!stop) return;
      if (document.activeElement !== r.color) { const c = colorToHex(stop.color); if (r.color.value !== c) r.color.value = c; }
      value(r.offset, String(Math.round(stop.offset * 100)));
      value(r.opacity, String(Math.round(stop.opacity * 100)));
      r.remove.disabled = (g?.stops.length ?? 0) <= 2;
      r.root.dataset.on = String(i === extras.stop);
    });
    this.align.set(shape ? shape.paint.align : 'center');
    const width = shape ? readWidth(e.site().nodes[shape.id]) : undefined;
    text(this.widthNote, width ? `Variable width: ${width.points.length} point${width.points.length === 1 ? '' : 's'}` : 'Uniform width');
    this.alignToSeg.set(this.alignTo);
    this.isoExit.hidden = !extras.iso;
    text(this.isoNote, extras.iso ? 'Isolation mode: only this group is editable. Press Escape or double-click empty space to leave.' : 'Double-click a grouped path with the Selection tool to enter isolation mode.');
    if (document.activeElement !== this.eraser) value(this.eraser, String(extras.eraserSize));
    this.snap.input.checked = extras.snapping;
    text(this.guideNote, extras.snapping ? 'Smart guides are on.' : 'Smart guides are off.');
  }
}
