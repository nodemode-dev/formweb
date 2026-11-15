import { element, text, value } from '../ui/dom';
import { label, tn } from '../i18n';
import type { AlignMode, AlignTo, DistributeMode, RepeatParams } from './arrange';
import { liveOf, readBlend, readRepeat, type BlendMode } from './live';
import { BrushSections } from './brushpanel';
import type { TfMode } from './freetransform';
import { symbolsOnPage } from './symbols';
import { WARP_PRESETS, type DistortKind, type WarpOptions, type WarpPreset } from './distort';
import { readWarp } from './warp';
import { openMeshDialog } from './meshdialog';
import type { Editor } from './editor';
import { colorToHex, gradientCss, readFor, angleOf, stopColorAt, type Target } from './gradient';
import { vectorIcon, type VectorIcon } from './icons';
import { button, field, numberInput, section, segment } from './panel';
import type { StrokeAlign } from './store';
import { readWidth } from './stroke';
import { loadProfiles, storeProfiles, type SavedProfile, type WidthPreset } from './widthprofile';
import { TYPE_ALIGNS, TYPE_EFFECTS, readType, typeHolder, type TypeAlign, type TypeEffect, type TypeOptions } from './typepath';
import { StrokeSection } from './strokepanel';
import { TraceSection } from './tracepanel';

const STOP_ROWS = 8;
const PROFILE_ROWS = 12;
const SYMBOL_ROWS = 12;

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
  private kind: ReturnType<typeof segment<'solid' | 'linear' | 'radial' | 'freeform'>>;
  private ffMode: ReturnType<typeof segment<'points' | 'lines'>>;
  private spread: ReturnType<typeof segment<'pad' | 'reflect' | 'repeat'>>;
  private angle: HTMLInputElement;
  private bar = element('div', 'fw-v-gradbar');
  private rows: StopRow[] = [];
  private gradientBody = element('div', 'fw-v-stack');
  private align: ReturnType<typeof segment<StrokeAlign>>;
  private widthNote = element('p', 'fw-v-note');
  private profileName = element('input', 'fw-v-input');
  private profiles: SavedProfile[] = loadProfiles();
  private profileRows: { root: HTMLElement; apply: HTMLButtonElement }[] = [];
  private maskClip = check('Clip', true);
  private maskInvert = check('Invert Mask');
  private typeLabel = element('input', 'fw-v-input');
  private typeSize = num(24, 1, 500, 1);
  private typeOffset = num(0, 0, 100, 1);
  private typeSpacing = num(0, -100, 100, 0.5);
  private typeFlip = check('Flip');
  private typeEffect: TypeEffect = 'rainbow';
  private typeAlign: TypeAlign = 'baseline';
  private typeKey = '';
  private effectSeg!: ReturnType<typeof segment<TypeEffect>>;
  private alignSeg!: ReturnType<typeof segment<TypeAlign>>;
  private alignTo: AlignTo = 'selection';
  private alignToSeg: ReturnType<typeof segment<AlignTo>>;
  private isoNote = element('p', 'fw-v-note');
  private isoExit: HTMLButtonElement;
  private snap = check('Snap to anchors, segments, centers and 45 degree angles', true);
  private eraser: HTMLInputElement;
  private guideNote = element('p', 'fw-v-note');
  private liveNote = element('p', 'fw-v-note');
  private symbolIds: string[] = [];
  private symbolRows: { root: HTMLElement; label: HTMLElement }[] = [];
  private symbolDone: HTMLButtonElement;
  private symbolNote = element('p', 'fw-v-note');
  private syncLive: () => void = () => undefined;
  private syncWarp: () => void = () => undefined;
  private brushes: BrushSections;

  constructor(private editor: Editor) {
    const ops = editor.ops, extras = editor.extras;

    const gradient = section('Gradient', true);
    this.target = segment<Target>([{ id: 'fill', label: 'Fill' }, { id: 'stroke', label: 'Stroke' }], id => { extras.target = id; editor.emit(); editor.render(); });
    this.kind = segment<'solid' | 'linear' | 'radial' | 'freeform'>([{ id: 'solid', label: 'Solid' }, { id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'freeform', label: 'Freeform' }], id => { void (id === 'freeform' ? ops.freeform() : ops.paintKind(extras.target, id)); });
    this.ffMode = segment<'points' | 'lines'>([{ id: 'points', label: 'Points' }, { id: 'lines', label: 'Lines' }], id => { extras.setFreeformMode(id); this.ffMode.set(id); });
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
    gradient.body.append(this.target.root, this.kind.root, field('Freeform draw', this.ffMode.root, true), field('Angle', this.angle), field('Spread', this.spread.root, true), this.gradientBody, grid(addStop, reverse),
      element('p', 'fw-v-note', 'Gradient tool (G): drag to set the line, drag the ends or stops, click the line to add a stop, Alt-click a stop to remove it.'));

    const stroke = section('Stroke align and width', false);
    this.align = segment<StrokeAlign>([{ id: 'center', label: 'Center' }, { id: 'inside', label: 'Inside' }, { id: 'outside', label: 'Outside' }], id => editor.applyPaint({ align: id }));
    const presets: { id: WidthPreset; label: string }[] = [{ id: 'uniform', label: 'Uniform' }, { id: 'taper-end', label: 'Taper end' }, { id: 'taper-both', label: 'Taper both' }, { id: 'bulge', label: 'Bulge' }, { id: 'ends', label: 'Wide ends' }];
    stroke.body.append(field('Stroke align', this.align.root, true), grid(...presets.map(p => button(p.label, '{0} {1}', () => { void ops.widthPreset(p.id); }, undefined, [{ t: 'Width profile:' }, { t: p.label }]))),
      grid(button('Flip profile', 'Reverse the width profile along the path', () => { void ops.widthFlip(); }, 'convert')), this.widthNote,
      element('p', 'fw-v-note', 'Width tool (Shift+W): drag from a point on the path to set the width there, drag a point to change it, Alt-drag changes one side, double-click a point for exact widths, Alt-click a point to remove it.'));
    this.profileName.type = 'text';
    this.profileName.maxLength = 40;
    this.profileName.placeholder = 'Profile name';
    const profileList = element('div', 'fw-v-profiles');
    for (let i = 0; i < PROFILE_ROWS; i++) {
      const apply = element('button', 'fw-v-btn');
      apply.type = 'button';
      apply.title = 'Apply this saved width profile';
      apply.setAttribute('aria-label', 'Apply this saved width profile');
      apply.addEventListener('click', () => { const saved = this.profiles[i]; if (saved) void ops.widthSaved(saved); });
      const remove = button('', 'Delete this saved profile', () => this.dropProfile(i), 'close');
      const rowEl = element('div', 'fw-v-profile');
      rowEl.hidden = true;
      rowEl.append(apply, remove);
      this.profileRows.push({ root: rowEl, apply });
      profileList.append(rowEl);
    }
    stroke.body.append(field('Saved profiles', profileList, true), field('Profile name', this.profileName, true),
      grid(button('Save profile', 'Save the width profile of the selected path under this name', () => this.saveProfile(), 'add')));
    this.renderProfiles();

    const arrange = section('Group, clip and mask', false);
    this.isoExit = button('Exit isolation', 'Leave isolation mode', () => extras.exit());
    arrange.body.append(
      grid(button('Group', 'Group the selected paths', () => { void ops.group(); }, 'group'), button('Ungroup', 'Ungroup the selected group', () => { void ops.ungroup(); }, 'ungroup'), this.isoExit),
      grid(button('Make clip', 'Use the top path as a clipping mask', () => { void ops.makeMask('clip'); }, 'clip'), button('Make mask', 'Use the top path as an opacity mask (luminosity)', () => { void ops.makeMask('mask'); }, 'mask'), button('Release', 'Release the clipping or opacity mask', () => { void ops.releaseMask(); }, 'divide')),
      grid(button('Edit Contents', 'Select and edit the clipped artwork while the clip stays', () => editor.editClipContents(), 'direct'), button('Edit Clipping Path', 'Select and reshape the clip path', () => editor.editClipPath(), 'direct')),
      row(this.maskClip.root, this.maskInvert.root),
      this.isoNote);
    this.maskClip.input.title = 'Add a black background so the artwork is cropped to the mask shape';
    this.maskInvert.input.title = 'Reverse the luminosity of the mask shape';
    this.maskClip.input.addEventListener('change', () => { void ops.maskOption({ clip: this.maskClip.input.checked }); });
    this.maskInvert.input.addEventListener('change', () => { void ops.maskOption({ invert: this.maskInvert.input.checked }); });

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

    const free = section('Free Transform', false);
    const tfSeg = segment<TfMode>([{ id: 'scale', label: 'Scale and rotate' }, { id: 'shear', label: 'Shear' }, { id: 'perspective', label: 'Perspective' }, { id: 'distort', label: 'Free Distort' }], id => {
      extras.tfMode = id;
      tfSeg.set(id);
      if (editor.tool !== 'transform') editor.setTool('transform');
    });
    tfSeg.set('scale');
    free.body.append(tfSeg.root, element('p', 'fw-v-note', 'Hold Ctrl while dragging a side handle to shear or a corner handle to free distort. Ctrl+Alt+Shift on a corner gives perspective. Shift constrains a distort to one axis and a shear to 15 degree steps.'));

    const symbols = section('Symbols', false);
    const symbolName = element('input', 'fw-v-input');
    symbolName.type = 'text';
    symbolName.maxLength = 60;
    symbolName.placeholder = 'Symbol name';
    const symbolList = element('div', 'fw-v-symbols');
    for (let i = 0; i < SYMBOL_ROWS; i++) {
      const label = element('span', 'fw-v-symbol-name');
      const place = button('', 'Place another instance of this symbol', () => { const id = this.symbolIds[i]; if (id) void ops.placeSymbol(id); }, 'add');
      const edit = button('', 'Edit this symbol, every instance updates', () => { const id = this.symbolIds[i]; if (id) editor.editSymbol(id); }, 'direct');
      const swap = button('', 'Replace the selected instance with this symbol', () => { const id = this.symbolIds[i]; if (id) void ops.replaceSymbol(id); }, 'convert');
      const rowEl = element('div', 'fw-v-symbol');
      rowEl.hidden = true;
      rowEl.append(label, place, swap, edit);
      this.symbolRows.push({ root: rowEl, label });
      symbolList.append(rowEl);
    }
    this.symbolDone = button('Done editing', 'Leave symbol editing', () => { editor.leaveSymbol(); editor.leaveClip(); });
    symbols.body.append(field('Symbol name', symbolName, true),
      grid(button('Define symbol', 'Turn the selected paths into a symbol', () => { void ops.defineSymbol(symbolName.value); symbolName.value = ''; }, 'group'), button('Break link', 'Turn the selected instance back into ordinary paths', () => { void ops.breakLink(); }, 'ungroup'), this.symbolDone),
      symbolList, this.symbolNote);

    const each = section('Transform each', false);
    const eSx = num(110, 1, 10000, 1), eSy = num(110, 1, 10000, 1), eRot = num(10, -360, 360, 1), eDx = num(0, -10000, 10000, 1), eDy = num(0, -10000, 10000, 1);
    const eRx = check('Reflect X'), eRy = check('Reflect Y'), eRand = check('Random'), eCopy = check('Copy');
    each.body.append(row(field('Scale X %', eSx), field('Scale Y %', eSy)), row(field('Rotate', eRot), field('', element('span'))), row(field('Move X', eDx), field('Move Y', eDy)), row(eRx.root, eRy.root), row(eRand.root, eCopy.root),
      button('Transform each', 'Apply to every selected path about its own center', () => {
        void ops.each({ sx: read(eSx, 100), sy: read(eSy, 100), angle: read(eRot, 0), dx: read(eDx, 0), dy: read(eDy, 0), reflectX: eRx.input.checked, reflectY: eRy.input.checked, random: eRand.input.checked, copy: eCopy.input.checked, strokes: false });
      }));

    const effects = section('Blend and repeat', false);
    const steps = num(5, 1, 500, 1), spacing = num(20, 1, 10000, 1);
    const blendMode = { value: 'steps' as BlendMode };
    const blendNow = (): { mode: BlendMode; steps: number; distance: number } => ({ mode: blendMode.value, steps: read(steps, 5), distance: read(spacing, 20) });
    const liveBlend = (): void => { if (ops.liveSelected('blend')) void ops.blend(blendNow()); };
    const modeSeg = segment<BlendMode>([{ id: 'color', label: 'Smooth Color' }, { id: 'steps', label: 'Specified Steps' }, { id: 'distance', label: 'Specified Distance' }], id => { blendMode.value = id; modeSeg.set(id); liveBlend(); });
    modeSeg.set('steps');
    steps.addEventListener('change', liveBlend);
    spacing.addEventListener('change', liveBlend);
    const repeatKind = { value: 'radial' as 'radial' | 'grid' | 'mirror' };
    const count = num(6, 2, 120, 1), radius = num(80, -5000, 5000, 1), cols = num(3, 1, 60, 1), rows = num(2, 1, 60, 1), gapX = num(10, -1000, 1000, 1), gapY = num(10, -1000, 1000, 1), offset = num(0, -1000, 1000, 1);
    const angleIn = num(90, -360, 360, 1);
    const brickValue = { value: 'none' as 'none' | 'row' | 'column' };
    const repeatNow = (): RepeatParams => ({ kind: repeatKind.value, count: read(count, 6), radius: read(radius, 80), cols: read(cols, 3), rows: read(rows, 2), gapX: read(gapX, 10), gapY: read(gapY, 10), angle: read(angleIn, 90), brick: brickValue.value, offset: read(offset, 0) });
    const liveRepeat = (): void => { if (ops.liveSelected('repeat')) void ops.repeat(repeatNow()); };
    const repeatSeg = segment<'radial' | 'grid' | 'mirror'>([{ id: 'radial', label: 'Radial' }, { id: 'grid', label: 'Grid' }, { id: 'mirror', label: 'Mirror' }], id => { repeatKind.value = id; repeatSeg.set(id); liveRepeat(); });
    repeatSeg.set('radial');
    const brickSeg = segment<'none' | 'row' | 'column'>([{ id: 'none', label: 'Aligned grid' }, { id: 'row', label: 'Offset rows' }, { id: 'column', label: 'Offset columns' }], id => { brickValue.value = id; brickSeg.set(id); liveRepeat(); });
    brickSeg.set('none');
    for (const control of [count, radius, cols, rows, gapX, gapY, offset, angleIn]) control.addEventListener('change', liveRepeat);
    const liveState = { key: '' };
    this.syncLive = () => {
      const site = editor.site();
      const bg = ops.liveSelected('blend'), rg = ops.liveSelected('repeat');
      const blend = bg ? readBlend(site.nodes[bg]?.attrs['data-fw-blend']) : null, repeat = rg ? readRepeat(site.nodes[rg]?.attrs['data-fw-repeat']) : null;
      const key = blend ? `b${blend.mode}|${blend.steps}|${blend.distance}` : repeat ? `r${JSON.stringify({ ...repeat, sig: '', src: [] })}` : '';
      text(this.liveNote, blend ? 'Live blend selected. Changes below update it.' : repeat ? 'Live repeat selected. Changes below update it.' : 'Select two paths and Blend, or paths and Repeat, to make live copies.');
      if (key === liveState.key) return;
      liveState.key = key;
      if (blend) {
        blendMode.value = blend.mode;
        modeSeg.set(blend.mode);
        value(steps, String(blend.steps));
        value(spacing, String(blend.distance));
      } else if (repeat) {
        repeatKind.value = repeat.kind;
        repeatSeg.set(repeat.kind);
        brickValue.value = repeat.brick;
        brickSeg.set(repeat.brick);
        for (const [input, n] of [[count, repeat.count], [radius, repeat.radius], [cols, repeat.cols], [rows, repeat.rows], [gapX, repeat.gx], [gapY, repeat.gy], [offset, repeat.offset], [angleIn, repeat.angle]] as [HTMLInputElement, number][]) value(input, String(n));
      }
    };
    effects.body.append(modeSeg.root, row(field('Blend steps', steps), field('Spacing', spacing)), button('Blend', 'Make a live blend between two selected paths', () => { void ops.blend(blendNow()); }, 'blend'),
      repeatSeg.root, row(field('Copies', count), field('Radial offset', radius)), field('Start angle or axis angle', angleIn), row(field('Columns', cols), field('Rows', rows)), row(field('Gap X', gapX), field('Gap Y', gapY)), brickSeg.root, field('Mirror offset', offset),
      button('Repeat', 'Make a live repeat of the selected paths', () => { void ops.repeat(repeatNow()); }, 'repeat'),
      grid(button('Expand', 'Bake the generated copies into ordinary paths', () => { void ops.expandLive(); }, 'bake'), button('Release', 'Remove the generated copies and keep the originals', () => { void ops.releaseLive(); }, 'divide')),
      this.liveNote);

    const warp = section('Envelope and distort', false);
    const preset = { value: 'arc' as WarpPreset, orient: 'h' as 'h' | 'v' };
    const warpLabels = ['Arc', 'Arc Lower', 'Arc Upper', 'Arch', 'Bulge', 'Shell Lower', 'Shell Upper', 'Flag', 'Wave', 'Fish', 'Rise', 'Fisheye', 'Inflate', 'Squeeze', 'Twist'];
    const styleSel = element('select', 'fw-v-input');
    WARP_PRESETS.forEach((id, i) => { const o = element('option', '', warpLabels[i]); o.value = id; styleSel.append(o); });
    styleSel.addEventListener('change', () => { preset.value = styleSel.value as WarpPreset; });
    const orientSeg = segment<'h' | 'v'>([{ id: 'h', label: 'Horizontal' }, { id: 'v', label: 'Vertical' }], id => { preset.orient = id; orientSeg.set(id); liveWarp(); });
    orientSeg.set('h');
    const bend = num(50, -100, 100, 5), hDist = num(0, -100, 100, 5), vDist = num(0, -100, 100, 5);
    const kindState = { value: 'pucker-bloat' as DistortKind };
    const kindSeg = segment<DistortKind>([{ id: 'pucker-bloat', label: 'Pucker/Bloat' }, { id: 'roughen', label: 'Roughen' }, { id: 'zigzag', label: 'Zig Zag' }, { id: 'twist', label: 'Twist' }], id => { kindState.value = id; kindSeg.set(id); });
    kindSeg.set('pucker-bloat');
    const amount = num(40, -360, 360, 5), size = num(6, 0, 500, 1), detail = num(4, 1, 40, 1), seed = num(7, 1, 9999, 1);
    const smooth = check('Smooth points');
    const warpNow = (): WarpOptions => ({ preset: preset.value, orient: preset.orient, bend: read(bend, 0) / 100, horizontal: read(hDist, 0) / 100, vertical: read(vDist, 0) / 100 });
    const liveWarp = (): void => { if (ops.liveSelected('warp')) void ops.envelope('warp', warpNow()); };
    for (const control of [styleSel, bend, hDist, vDist]) control.addEventListener('change', liveWarp);
    const warpNote = element('p', 'fw-v-note');
    const warpKey = { value: '' };
    this.syncWarp = () => {
      const group = ops.liveSelected('warp');
      const spec = group ? readWarp(editor.site().nodes[group]?.attrs['data-fw-warp']) : null;
      text(warpNote, spec ? 'Live envelope selected. Changes above update it.' : '');
      const key = spec ? `${spec.mode}|${spec.style}|${spec.orient}|${spec.bend}|${spec.hd}|${spec.vd}` : '';
      if (key === warpKey.value) return;
      warpKey.value = key;
      if (!spec) return;
      preset.value = spec.style;
      preset.orient = spec.orient;
      styleSel.value = spec.style;
      orientSeg.set(spec.orient);
      value(bend, String(spec.bend));
      value(hDist, String(spec.hd));
      value(vDist, String(spec.vd));
    };
    warp.body.append(field('Style', styleSel), orientSeg.root, row(field('Bend %', bend), field('Horizontal %', hDist)), field('Vertical %', vDist),
      button('Make with Warp', 'Make a live envelope with the chosen warp style', () => { void ops.envelope('warp', warpNow()); }, 'warp'),
      button('Make with Top Object', 'Use the top closed path as the envelope for the other selected paths', () => { void ops.envelope('top', warpNow()); }, 'warp'),
      grid(button('Make with Mesh', 'Make an envelope with a mesh of draggable points', () => openMeshDialog((r, c) => { void ops.envelopeMesh(r, c, false); }), 'warp'), button('Reset with Mesh', 'Convert the selected warp envelope into a mesh', () => openMeshDialog((r, c) => { void ops.envelopeMesh(r, c, true); }), 'warp')),
      grid(button('Expand', 'Bake the generated copies into ordinary paths', () => { void ops.expandLive(); }, 'bake'), button('Release', 'Remove the generated copies and keep the originals', () => { void ops.releaseLive(); }, 'divide')), warpNote,
      button('Apply envelope', 'Warp the selected paths with the preset', () => { void ops.warp(warpNow()); }, 'warp'),
      kindSeg.root, row(field('Amount (% or degrees)', amount), field('Size', size)), row(field('Detail', detail), field('Seed', seed)), smooth.root,
      button('Apply distort', 'Distort the selected paths', () => { void ops.distort({ kind: kindState.value, amount: kindState.value === 'twist' ? read(amount, 0) : read(amount, 0) / 100, size: read(size, 6), detail: read(detail, 4), smooth: smooth.input.checked, seed: read(seed, 7) }); }, 'warp'));

    const type = section('Type on a path', false);
    const label = this.typeLabel;
    label.type = 'text';
    label.maxLength = 200;
    label.placeholder = 'Text';
    const typeSize = this.typeSize, typeOffset = this.typeOffset, typeSpacing = this.typeSpacing, typeFlip = this.typeFlip;
    const collect = (): TypeOptions => ({ text: label.value, size: read(typeSize, 24), offset: read(typeOffset, 0), effect: this.typeEffect, flip: typeFlip.input.checked, align: this.typeAlign, spacing: read(typeSpacing, 0) });
    const live = (): void => { if (typeHolder(editor.site(), editor.ctx.getSelected())) void ops.textOnPath(collect()); };
    this.effectSeg = segment<TypeEffect>(TYPE_EFFECTS, id => { this.typeEffect = id; this.effectSeg.set(id); live(); });
    this.alignSeg = segment<TypeAlign>(TYPE_ALIGNS, id => { this.typeAlign = id; this.alignSeg.set(id); live(); });
    this.effectSeg.set('rainbow');
    this.alignSeg.set('baseline');
    for (const control of [label, typeSize, typeOffset, typeSpacing, typeFlip.input]) control.addEventListener('change', live);
    type.body.append(field('Text', label, true), row(field('Size', typeSize), field('Start offset %', typeOffset)), field('Effect', this.effectSeg.root, true), field('Align to path', this.alignSeg.root, true),
      row(field('Spacing', typeSpacing), field('', typeFlip.root)),
      button('Set type on path', 'Place text along the selected path', () => { void ops.textOnPath(collect()); }, 'type'),
      element('p', 'fw-v-note', 'Drag the round bracket at the middle of the text along the path to move it, or across the path to flip it.'));

    const builder = section('Shape Crafter', false);
    const gapPick = { value: 'off' };
    const gapCustom = num(5, 0.1, 500, 0.5);
    const gapSeg = segment<string>([{ id: 'off', label: 'Off' }, { id: '3', label: '3' }, { id: '6', label: '6' }, { id: '12', label: '12' }, { id: 'custom', label: 'Custom' }], id => {
      gapPick.value = id;
      gapSeg.set(id);
      extras.gap = id === 'off' ? 0 : id === 'custom' ? read(gapCustom, 5) : Number(id);
    });
    gapSeg.set('off');
    gapCustom.addEventListener('change', () => { if (gapPick.value === 'custom') extras.gap = read(gapCustom, 5); });
    const splitOpt = check('Click stroke splits the path');
    splitOpt.input.addEventListener('change', () => { extras.splitStroke = splitOpt.input.checked; });
    builder.body.append(field('Gap detection (pt)', gapSeg.root, true), field('Custom', gapCustom), splitOpt.root);

    const guides = section('Snapping and eraser', false);
    this.snap.input.addEventListener('change', () => { extras.snapping = this.snap.input.checked; if (!extras.snapping) extras.clearGuides(); });
    this.eraser = numberInput(1, 400, 1, n => { extras.eraserSize = n; });
    guides.body.append(this.snap.root, field('Eraser size', this.eraser), this.guideNote);

    this.brushes = new BrushSections(editor);
    this.sections.push(gradient.root, stroke.root, new StrokeSection(editor).root, arrange.root, align.root, transform.root, free.root, each.root, effects.root, symbols.root, ...this.brushes.sections, warp.root, type.root, builder.root, guides.root, new TraceSection(editor).root);
  }

  private renderProfiles(): void {
    this.profileRows.forEach((r, i) => {
      const saved = this.profiles[i];
      if (r.root.hidden !== !saved) r.root.hidden = !saved;
      if (saved && r.apply.textContent !== saved.name) r.apply.textContent = saved.name;
    });
  }

  private saveProfile(): void {
    const points = this.editor.ops.currentProfile();
    const name = this.profileName.value.trim().slice(0, 40);
    if (!points) { this.editor.notify('Give the selected path a variable width first.'); return; }
    if (!name) { this.editor.notify('Name the profile first.'); return; }
    this.profiles = [...this.profiles.filter(p => p.name !== name), { name, points }].slice(-PROFILE_ROWS);
    if (!storeProfiles(this.profiles)) this.editor.notify('Profiles could not be stored in this browser.');
    this.profileName.value = '';
    this.renderProfiles();
  }

  private dropProfile(index: number): void {
    this.profiles = this.profiles.filter((_, i) => i !== index);
    storeProfiles(this.profiles);
    this.renderProfiles();
  }

  update(): void {
    const e = this.editor;
    const extras = e.extras;
    this.target.set(extras.target);
    const shape = e.selection.map(id => e.shapeOf(id)).find(s => !!s);
    const found = shape ? readFor(e.host(), shape, extras.target) : undefined;
    const g = found?.gradient;
    let freeform = false;
    try { const site = e.host().site(); freeform = e.selection.some(id => liveOf(site, id)?.kind === 'freeform'); } catch { freeform = false; }
    this.kind.set(freeform ? 'freeform' : g ? g.kind : 'solid');
    this.ffMode.set(extras.ffMode);
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
    if (width) text(this.widthNote, tn(width.points.length, 'Variable width: {0} point', 'Variable width: {0} points'));
    else label(this.widthNote, 'Uniform width');
    this.alignToSeg.set(this.alignTo);
    let typed: ReturnType<typeof readType> = null;
    try { typed = readType(typeHolder(e.site(), e.ctx.getSelected())); } catch { typed = null; }
    const typeKey = typed ? JSON.stringify(typed) : '';
    if (typeKey !== this.typeKey) {
      this.typeKey = typeKey;
      if (typed) {
        this.typeEffect = typed.effect;
        this.typeAlign = typed.align;
        this.effectSeg.set(typed.effect);
        this.alignSeg.set(typed.align);
        if (document.activeElement !== this.typeLabel) value(this.typeLabel, typed.text);
        value(this.typeSize, String(typed.size));
        value(this.typeOffset, String(Math.round(typed.offset * 100) / 100));
        value(this.typeSpacing, String(typed.spacing));
        this.typeFlip.input.checked = typed.flip === 1;
      }
    }
    let mask = { clip: true, invert: false };
    try { mask = e.ops.maskState(); } catch { mask = { clip: true, invert: false }; }
    if (this.maskClip.input.checked !== mask.clip) this.maskClip.input.checked = mask.clip;
    if (this.maskInvert.input.checked !== mask.invert) this.maskInvert.input.checked = mask.invert;
    this.isoExit.hidden = !extras.iso;
    text(this.isoNote, extras.iso ? 'Isolation mode: only this group is editable. Press Escape or double-click empty space to leave.' : 'Double-click a grouped path with the Selection tool to enter isolation mode.');
    if (document.activeElement !== this.eraser) value(this.eraser, String(extras.eraserSize));
    this.snap.input.checked = extras.snapping;
    text(this.guideNote, extras.snapping ? 'Smart guides are on.' : 'Smart guides are off.');
    try { this.syncLive(); } catch { text(this.liveNote, ''); }
    try { this.syncWarp(); } catch { text(this.liveNote, ''); }
    let listed: ReturnType<typeof symbolsOnPage> = [];
    try { listed = symbolsOnPage(e.site(), e.panelSvg()); } catch { listed = []; }
    this.symbolIds = listed.map(s => s.id);
    this.symbolRows.forEach((r, i) => {
      const item = listed[i];
      if (r.root.hidden !== !item) r.root.hidden = !item;
      if (item) text(r.label, item.name);
    });
    try { this.brushes.update(); } catch { text(this.liveNote, ''); }
    this.symbolDone.hidden = !e.symbolEdit && !e.clipEdit;
    text(this.symbolNote, e.symbolEdit ? 'Editing a symbol: drag anchors with the Direct Selection tool. Escape or Done editing leaves.' : e.clipEdit ? 'Editing the clipping path: drag anchors with the Direct Selection tool. Escape or Done editing leaves.' : listed.length ? '' : 'No symbols in this svg yet.');
  }
}
