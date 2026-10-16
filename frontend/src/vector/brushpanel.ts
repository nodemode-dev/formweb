import { element, text, value } from '../ui/dom';
import { defaultBrush, readBrush, type BrushKind, type BrushSettings } from './brush';
import { applyBrushCommands, blendChange, blendGroupOf, brushChange, brushDefs, defineBrush, deleteBrushCommands, removeSpineCommands, spineCommands, type BrushDef } from './brushcmd';
import type { Editor } from './editor';
import { readBlend } from './live';
import { button, field, numberInput, section, segment } from './panel';
import { useScaleRotation, useTransformCommand } from './symbols';

const BRUSH_ROWS = 12;
const KINDS: { id: BrushKind; label: string }[] = [{ id: 'calligraphic', label: 'Calligraphic' }, { id: 'scatter', label: 'Scatter' }, { id: 'art', label: 'Art' }, { id: 'pattern', label: 'Pattern' }];
const SHOWN: Record<BrushKind, string[]> = {
  calligraphic: ['angle', 'roundness', 'size'],
  scatter: ['scale', 'spacing', 'scatter', 'rotation', 'rotmode', 'rotrel', 'seed'],
  art: ['scale', 'stretch', 'flip', 'flipv'],
  pattern: ['scale', 'fit', 'spacing', 'flip', 'flipv']
};

function check(label: string): { root: HTMLElement; input: HTMLInputElement } {
  const input = element('input', 'fw-v-check');
  input.type = 'checkbox';
  const root = element('label', 'fw-v-checkrow');
  root.append(input, element('span', '', label));
  return { root, input };
}

const grid = (...children: HTMLElement[]): HTMLElement => {
  const wrap = element('div', 'fw-v-grid');
  wrap.append(...children);
  return wrap;
};

const clampOf = (input: HTMLInputElement, lo: number, hi: number, fallback: number): number => {
  const n = parseFloat(input.value);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

export class BrushSections {
  readonly sections: HTMLElement[] = [];
  private kind: BrushKind = 'calligraphic';
  private rotmode: 'fixed' | 'random' = 'fixed';
  private rotrel: 'page' | 'path' = 'path';
  private fit: 'stretch' | 'space' = 'stretch';
  private key = '';
  private controls = new Map<string, HTMLElement>();
  private angle = this.num(45, -180, 180, 1);
  private roundness = this.num(30, 1, 100, 1);
  private size = this.num(8, 0.1, 2000, 0.5);
  private scale = this.num(100, 1, 1000, 1);
  private spacing = this.num(20, 0, 1000, 1);
  private scatter = this.num(0, 0, 500, 1);
  private rotation = this.num(0, -180, 180, 1);
  private seed = this.num(7, 1, 99999, 1);
  private stretch = check('Stretch to fit stroke length');
  private flip = check('Flip along');
  private flipv = check('Flip across');
  private name = element('input', 'fw-v-input');
  private note = element('p', 'fw-v-note');
  private rows: { root: HTMLElement; apply: HTMLButtonElement; id: string }[] = [];
  private kindSeg: ReturnType<typeof segment<BrushKind>>;
  private rotmodeSeg: ReturnType<typeof segment<'fixed' | 'random'>>;
  private rotrelSeg: ReturnType<typeof segment<'page' | 'path'>>;
  private fitSeg: ReturnType<typeof segment<'stretch' | 'space'>>;
  private orientSeg: ReturnType<typeof segment<'page' | 'path'>>;
  private spineNote = element('p', 'fw-v-note');
  private useScale = this.numField(100, 1, 10000, 1);
  private useRotate = this.numField(0, -360, 360, 1);
  private useKey = '';

  constructor(private editor: Editor) {
    const h = (): ReturnType<Editor['host']> => editor.host();
    this.kindSeg = segment<BrushKind>(KINDS, id => { this.kind = id; this.kindSeg.set(id); this.show(); });
    this.rotmodeSeg = segment<'fixed' | 'random'>([{ id: 'fixed', label: 'Fixed' }, { id: 'random', label: 'Random' }], id => { this.rotmode = id; this.rotmodeSeg.set(id); this.live(); });
    this.rotrelSeg = segment<'page' | 'path'>([{ id: 'page', label: 'Page' }, { id: 'path', label: 'Path' }], id => { this.rotrel = id; this.rotrelSeg.set(id); this.live(); });
    this.fitSeg = segment<'stretch' | 'space'>([{ id: 'stretch', label: 'Stretch' }, { id: 'space', label: 'Add space' }], id => { this.fit = id; this.fitSeg.set(id); this.live(); });
    this.kindSeg.set('calligraphic');
    this.rotmodeSeg.set('fixed');
    this.rotrelSeg.set('path');
    this.fitSeg.set('stretch');
    this.stretch.input.checked = true;
    for (const c of [this.stretch, this.flip, this.flipv]) c.input.addEventListener('change', () => this.live());

    const brush = section('Brushes', false);
    this.name.type = 'text';
    this.name.maxLength = 60;
    this.name.placeholder = 'Brush name';
    const list = element('div', 'fw-v-symbols');
    for (let i = 0; i < BRUSH_ROWS; i++) {
      const row = element('div', 'fw-v-symbol');
      row.hidden = true;
      const apply = element('button', 'fw-v-btn');
      apply.type = 'button';
      apply.title = 'Apply this brush to the selected paths';
      apply.setAttribute('aria-label', 'Apply this brush to the selected paths');
      const entry = { root: row, apply, id: '' };
      apply.addEventListener('click', () => { if (entry.id) void this.apply(entry.id); });
      row.append(apply, button('', 'Delete this brush', () => { if (entry.id) void h().commit(deleteBrushCommands(entry.id)); }, 'close'));
      this.rows.push(entry);
      list.append(row);
    }
    const mark = (key: string, node: HTMLElement): HTMLElement => { this.controls.set(key, node); return node; };
    brush.body.append(
      field('Brush type', this.kindSeg.root, true),
      mark('angle', field('Angle', this.angle)), mark('roundness', field('Roundness %', this.roundness)), mark('size', field('Size', this.size)),
      mark('scale', field('Size %', this.scale)), mark('spacing', field('Spacing %', this.spacing)), mark('scatter', field('Scatter %', this.scatter)),
      mark('rotation', field('Rotation', this.rotation)), mark('rotmode', this.rotmodeSeg.root), mark('rotrel', field('Rotation relative to', this.rotrelSeg.root, true)),
      mark('seed', field('Seed', this.seed)), mark('fit', field('Fit', this.fitSeg.root, true)),
      mark('stretch', this.stretch.root), mark('flip', this.flip.root), mark('flipv', this.flipv.root),
      field('Brush name', this.name, true),
      grid(button('Define brush', 'Define a brush from the selected artwork and these options', () => { void this.define(); }, 'add'),
        button('Remove brush', 'Turn the selected brushed path back into a plain stroke', () => { void editor.ops.releaseLive(); }, 'divide'),
        button('Expand appearance', 'Turn the brushed result into ordinary paths', () => { void editor.ops.expandLive(); }, 'bake')),
      list, this.note);
    const fidelity = numberInput(0.1, 20, 0.1, () => undefined);
    fidelity.value = String(editor.fidelity);
    fidelity.title = 'Higher values smooth the freehand stroke more; lower values follow your hand closely.';
    fidelity.addEventListener('change', () => { editor.fidelity = clampOf(fidelity, 0.1, 20, 2.5); });
    brush.body.append(field('Fidelity', fidelity), element('p', 'fw-v-note', 'The Paintbrush draws with the last brush you applied or defined.'));
    this.show();

    const spine = section('Blend along a spine', false);
    this.orientSeg = segment<'page' | 'path'>([{ id: 'page', label: 'Align to Page' }, { id: 'path', label: 'Align to Path' }], id => {
      this.orientSeg.set(id);
      const group = blendGroupOf(h());
      if (group) void h().commit(blendChange(editor.site(), group, { orient: id }));
    });
    this.orientSeg.set('page');
    spine.body.append(this.orientSeg.root,
      grid(button('Replace spine', 'Use the selected extra path as the spine of the selected live blend', () => { const cmds = spineCommands(h()); if (cmds.length) void h().commit(cmds); }, 'blend'),
        button('Remove spine', 'Blend along a straight line again', () => { const cmds = removeSpineCommands(h()); if (cmds.length) void h().commit(cmds); }, 'close')),
      this.spineNote);

    const instance = section('Symbol instance', false);
    const push = (): void => { const id = this.instance(); const cmd = id && useTransformCommand(editor.site(), id, clampOf(this.useScale, 1, 10000, 100), clampOf(this.useRotate, -360, 360, 0)); if (cmd) void h().commit([cmd]); };
    this.useScale.addEventListener('change', push);
    this.useRotate.addEventListener('change', push);
    instance.body.append(grid(field('Size %', this.useScale), field('Rotation', this.useRotate)),
      element('p', 'fw-v-note', 'Select a symbol instance, then drag a corner to scale or the round handle to rotate.'));
    this.sections.push(brush.root, spine.root, instance.root);
  }

  private num(init: number, min: number, max: number, step: number): HTMLInputElement {
    const input = numberInput(min, max, step, () => undefined);
    input.value = String(init);
    input.addEventListener('change', () => this.live());
    return input;
  }

  private numField(init: number, min: number, max: number, step: number): HTMLInputElement {
    const input = numberInput(min, max, step, () => undefined);
    input.value = String(init);
    return input;
  }

  private instance(): string | undefined {
    try {
      const site = this.editor.site();
      return this.editor.selection.find(id => site.nodes[id]?.tag === 'use');
    } catch { return undefined; }
  }

  private settings(kind: BrushKind): BrushSettings {
    return {
      ...defaultBrush(kind), kind, angle: clampOf(this.angle, -180, 180, 45), roundness: clampOf(this.roundness, 1, 100, 30), size: clampOf(this.size, 0.1, 2000, 8),
      scale: clampOf(this.scale, 1, 1000, 100), spacing: clampOf(this.spacing, 0, 1000, 20), scatter: clampOf(this.scatter, 0, 500, 0), rotation: clampOf(this.rotation, -180, 180, 0),
      rotmode: this.rotmode, rotrel: this.rotrel, seed: Math.round(clampOf(this.seed, 1, 99999, 7)), stretch: this.stretch.input.checked ? 1 : 0,
      flip: this.flip.input.checked ? 1 : 0, flipv: this.flipv.input.checked ? 1 : 0, fit: this.fit
    };
  }

  private show(): void {
    const keep = new Set(SHOWN[this.kind]);
    this.controls.forEach((node, key) => { if (node.hidden === keep.has(key)) node.hidden = !keep.has(key); });
  }

  private group(): string | undefined {
    try { return this.editor.ops.liveSelected('brush'); } catch { return undefined; }
  }

  private live(): void {
    const group = this.group();
    const spec = group ? readBrush(this.editor.site().nodes[group]?.attrs['data-fw-brush']) : null;
    if (!group || !spec) return;
    void this.editor.host().commit(brushChange(this.editor.site(), group, { ...this.settings(spec.kind), kind: spec.kind, art: spec.art }));
  }

  private async define(): Promise<void> {
    const h = this.editor.host();
    const made = defineBrush(h, this.name.value, this.settings(this.kind));
    if (!made) return;
    this.name.value = '';
    this.editor.activeBrush = made.id;
    await h.commit(made.cmds);
  }

  private async apply(def: string): Promise<void> {
    const h = this.editor.host();
    this.editor.activeBrush = def;
    const made = applyBrushCommands(h, def);
    if (made) await h.commit(made.cmds, made.select);
  }

  update(): void {
    const e = this.editor;
    let defs: BrushDef[] = [];
    let spec: ReturnType<typeof readBrush> = null;
    let blend: ReturnType<typeof readBlend> = null;
    try {
      const site = e.site();
      defs = brushDefs(site, e.activeSvg());
      const group = this.group();
      spec = group ? readBrush(site.nodes[group]?.attrs['data-fw-brush']) : null;
      const bg = blendGroupOf(e.host());
      blend = bg ? readBlend(site.nodes[bg]?.attrs['data-fw-blend']) : null;
    } catch { defs = []; }
    const key = spec ? JSON.stringify({ ...spec, sig: '', src: '', color: '', weight: 0 }) : '';
    if (key !== this.key) {
      this.key = key;
      if (spec) {
        this.kind = spec.kind;
        this.kindSeg.set(spec.kind);
        this.rotmode = spec.rotmode;
        this.rotmodeSeg.set(spec.rotmode);
        this.rotrel = spec.rotrel;
        this.rotrelSeg.set(spec.rotrel);
        this.fit = spec.fit;
        this.fitSeg.set(spec.fit);
        for (const [input, n] of [[this.angle, spec.angle], [this.roundness, spec.roundness], [this.size, spec.size], [this.scale, spec.scale], [this.spacing, spec.spacing], [this.scatter, spec.scatter], [this.rotation, spec.rotation], [this.seed, spec.seed]] as [HTMLInputElement, number][]) value(input, String(n));
        this.stretch.input.checked = spec.stretch === 1;
        this.flip.input.checked = spec.flip === 1;
        this.flipv.input.checked = spec.flipv === 1;
        this.show();
      }
    }
    this.rows.forEach((r, i) => {
      const item = defs[i];
      if (r.root.hidden !== !item) r.root.hidden = !item;
      r.id = item ? item.id : '';
      if (item) text(r.apply, item.name);
    });
    text(this.note, spec ? 'Brushed path selected. Changes above update it.' : defs.length ? '' : 'Select a path with a brush to change its options, or choose a type and define a brush from the selection.');
    if (blend) this.orientSeg.set(blend.orient);
    text(this.spineNote, blend ? (blend.spine ? 'This blend follows a spine.' : 'Select one more path and choose Replace spine.') : 'Select a live blend and one more path to use as its spine.');
    const id = this.instance();
    const found = id ? useScaleRotation(e.site(), id) : null;
    const useKey = found ? `${id}|${found.scale}|${found.rotate}` : '';
    if (useKey !== this.useKey) {
      this.useKey = useKey;
      if (found) {
        value(this.useScale, String(Math.round(found.scale * 10000) / 100));
        value(this.useRotate, String(Math.round(found.rotate * 100) / 100));
      }
    }
  }
}
