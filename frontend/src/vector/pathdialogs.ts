import { t } from '../i18n';
import { element } from '../ui/dom';
import { gridOptions, setGridOptions } from './drawtools';
import type { Host } from './host';
import { cleanUp, gridTargets, splitGridCommands, type CleanOptions, type GridSpec } from './pathcmds';
import { applyCorners } from './corners';
import type { SubPath } from './geometry';
import { updateGeometry } from './store';
import { defaultTweak, tweakSubs, type TweakOptions } from './tweak';
import { BLOB_MAX_SIZE, blobOptions, setBlobOptions } from './blob';
import { BRICK_OFFSETS, patternCommands, patternOptions, patternParts, tileSize, type TileType } from './pattern';

interface Shell { root: HTMLElement; open(focus?: HTMLElement): void; close(): void }

function shell(title: string, body: HTMLElement[], submit: () => void, okLabel = t('OK'), onCancel?: () => void): Shell {
  const root = element('div', 'fw-v-dialog');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', title);
  root.hidden = true;
  const ok = element('button', 'fw-v-btn', okLabel);
  ok.type = 'button';
  const cancel = element('button', 'fw-v-btn', t('Cancel'));
  cancel.type = 'button';
  const actions = element('div', 'fw-v-row');
  actions.append(ok, cancel);
  root.append(element('div', 'fw-v-summary', title), ...body, actions);
  const close = (): void => { if (!root.hidden) root.hidden = true; };
  ok.addEventListener('click', () => { submit(); });
  const dismiss = (): void => { close(); onCancel?.(); };
  cancel.addEventListener('click', dismiss);
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
  });
  document.body.append(root);
  return { root, open: focus => { root.hidden = false; focus?.focus(); }, close };
}

function numberField(label: string, min: number, max: number, step = 1): { field: HTMLElement; input: HTMLInputElement } {
  const input = element('input', 'fw-v-input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const field = element('div', 'field');
  field.append(element('span', 'field-label', label), input);
  return { field, input };
}

const checkRow = (label: string): { row: HTMLElement; input: HTMLInputElement } => {
  const input = element('input', 'fw-v-check');
  input.type = 'checkbox';
  const row = element('label', 'fw-v-checkrow');
  row.append(input, element('span', '', label));
  return { row, input };
};

const round = (n: number): number => Math.round(n * 1000) / 1000;

/* Split Into Grid */

class Axis {
  readonly count = numberField('', 1, 100);
  readonly size = numberField('', 0.001, 100000, 0.01);
  readonly gutter = numberField('', 0, 100000, 0.01);
  readonly total = numberField('', 0.001, 100000, 0.01);
  readonly box = element('div', 'fw-v-row');
  base = 1;
  fit = true;

  constructor(readonly title: string, sizeLabel: string) {
    const label = (field: HTMLElement, text: string): void => { field.querySelector('.field-label')!.textContent = text; };
    label(this.count.field, t('Number'));
    label(this.size.field, sizeLabel);
    label(this.gutter.field, t('Gutter'));
    label(this.total.field, t('Total'));
    this.box.append(this.count.field, this.size.field, this.gutter.field, this.total.field);
    this.count.input.addEventListener('input', () => this.refit());
    this.gutter.input.addEventListener('input', () => this.refit());
    this.total.input.addEventListener('input', () => { this.fit = Math.abs(this.readTotal() - this.base) < 1e-6; this.refit(this.readTotal()); });
    this.size.input.addEventListener('input', () => {
      this.fit = false;
      this.total.input.value = String(round(this.n() * this.num(this.size.input) + (this.n() - 1) * this.num(this.gutter.input)));
    });
  }

  private num(input: HTMLInputElement): number { const v = parseFloat(input.value); return Number.isFinite(v) ? v : 0; }
  n(): number { return Math.max(1, Math.min(100, Math.round(this.num(this.count.input)))); }
  private readTotal(): number { return this.num(this.total.input); }

  private refit(total = this.fit ? this.base : this.readTotal() || this.base): void {
    const n = this.n(), g = this.num(this.gutter.input);
    this.size.input.value = String(round((total - g * (n - 1)) / n));
    this.total.input.value = String(round(total));
  }

  reset(base: number): void {
    this.base = base;
    this.fit = true;
    this.count.input.value = '2';
    this.gutter.input.value = '0';
    this.refit(base);
  }
}

class SplitGridDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private rows = new Axis(t('Rows'), t('Height'));
  private cols = new Axis(t('Columns'), t('Width'));

  private build(): Shell {
    return shell(t('Split Into Grid'), [
      element('div', 'field-label', this.rows.title), this.rows.box,
      element('div', 'field-label', this.cols.title), this.cols.box,
      element('p', 'fw-v-note', t('Replaces each selected rectangle with a group of rectangles that keep its fill and stroke.'))
    ], () => this.apply());
  }

  open(host: Host): void {
    const targets = gridTargets(host);
    if (!targets.length) { host.notify(t('Select a rectangle first.')); return; }
    this.host = host;
    const box = targets[0].box;
    this.rows.reset(round(box.h));
    this.cols.reset(round(box.w));
    this.dialog = this.dialog ?? this.build();
    this.dialog.open(this.rows.count.input);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const num = (input: HTMLInputElement): number => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : 0; };
    const spec: GridSpec = {
      rows: this.rows.n(), rowHeight: num(this.rows.size.input), rowGutter: num(this.rows.gutter.input),
      cols: this.cols.n(), colWidth: num(this.cols.size.input), colGutter: num(this.cols.gutter.input),
      fit: this.rows.fit && this.cols.fit
    };
    const made = splitGridCommands(host, spec);
    if (!made) return;
    this.dialog?.close();
    this.host = null;
    void host.commit(made.cmds, made.select);
  }
}

let split: SplitGridDialog | undefined;
export const openSplitGrid = (host: Host): void => { (split ??= new SplitGridDialog()).open(host); };

/* Clean Up */

class CleanUpDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private stray = checkRow(t('Stray points'));
  private unpainted = checkRow(t('Unpainted objects'));
  private text = checkRow(t('Empty text paths'));

  private build(): Shell {
    return shell(t('Clean Up'), [
      this.stray.row, this.unpainted.row, this.text.row,
      element('p', 'fw-v-note', t('Delete the checked kinds of object from the current vector.'))
    ], () => this.apply());
  }

  open(host: Host): void {
    if (!host.activeSvg()) { host.notify(t('Select a vector first.')); return; }
    this.host = host;
    this.stray.input.checked = this.unpainted.input.checked = this.text.input.checked = true;
    this.dialog = this.dialog ?? this.build();
    this.dialog.open(this.stray.input);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const options: CleanOptions = { stray: this.stray.input.checked, unpainted: this.unpainted.input.checked, emptyText: this.text.input.checked };
    this.dialog?.close();
    this.host = null;
    cleanUp(host, options);
  }
}

let clean: CleanUpDialog | undefined;
export const openCleanUp = (host: Host): void => { (clean ??= new CleanUpDialog()).open(host); };

/* Grid tool options */

class GridOptionsDialog {
  private dialogs = new Map<string, { shell: Shell; first: HTMLInputElement; second: HTMLInputElement }>();

  private make(tool: string): { shell: Shell; first: HTMLInputElement; second: HTMLInputElement } {
    const rect = tool === 'rgrid';
    const a = numberField(rect ? t('Horizontal dividers') : t('Concentric dividers'), rect ? 0 : 1, 100);
    const b = numberField(rect ? t('Vertical dividers') : t('Radial dividers'), 0, rect ? 100 : 360);
    const apply = (): void => {
      setGridOptions(rect ? { hdiv: parseFloat(a.input.value), vdiv: parseFloat(b.input.value) } : { rings: parseFloat(a.input.value), spokes: parseFloat(b.input.value) });
      entry.shell.close();
    };
    const entry = { shell: shell(rect ? t('Rectangular Grid Tool Options') : t('Polar Grid Tool Options'), [a.field, b.field], apply), first: a.input, second: b.input };
    this.dialogs.set(tool, entry);
    return entry;
  }

  open(tool: string): void {
    const entry = this.dialogs.get(tool) ?? this.make(tool);
    entry.first.value = String(tool === 'rgrid' ? gridOptions.hdiv : gridOptions.rings);
    entry.second.value = String(tool === 'rgrid' ? gridOptions.vdiv : gridOptions.spokes);
    entry.shell.open(entry.first);
  }
}

let gridDialog: GridOptionsDialog | undefined;
export const openGridOptions = (tool: string): void => { (gridDialog ??= new GridOptionsDialog()).open(tool); };

/* Effect > Distort & Transform > Tweak */

const radioRow = (label: string, name: string): { row: HTMLElement; input: HTMLInputElement } => {
  const input = element('input', 'fw-v-check');
  input.type = 'radio';
  input.name = name;
  const row = element('label', 'fw-v-checkrow');
  row.append(input, element('span', '', label));
  return { row, input };
};

class TweakDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private base = new Map<string, SubPath[]>();
  private options: TweakOptions = { ...defaultTweak };
  private horizontal = numberField(t('Horizontal'), 0, 100000, 0.1);
  private vertical = numberField(t('Vertical'), 0, 100000, 0.1);
  private relative = radioRow(t('Relative'), 'fw-tweak-mode');
  private absolute = radioRow(t('Absolute'), 'fw-tweak-mode');
  private anchors = checkRow(t('Anchor points'));
  private ins = checkRow(t('"In" control points'));
  private outs = checkRow(t('"Out" control points'));
  private seed = numberField(t('Seed'), 1, 99999);
  private preview = checkRow(t('Preview'));

  private build(): Shell {
    const amounts = element('div', 'fw-v-row');
    amounts.append(this.horizontal.field, this.vertical.field);
    const mode = element('div', 'fw-v-row');
    mode.append(this.relative.row, this.absolute.row);
    const shell_ = shell(t('Tweak'), [amounts, mode, this.anchors.row, this.ins.row, this.outs.row, this.seed.field, this.preview.row], () => this.apply(), t('OK'), () => this.cancel());
    shell_.root.addEventListener('input', () => this.update());
    shell_.root.addEventListener('change', () => this.update());
    return shell_;
  }

  open(host: Host): void {
    this.base.clear();
    for (const id of host.selection()) { const shape = host.shape(id); if (shape) this.base.set(id, applyCorners(shape.subs)); }
    if (!this.base.size) { host.notify(t('Select one or more paths first.')); return; }
    this.host = host;
    const o = this.options;
    this.horizontal.input.value = String(o.horizontal);
    this.vertical.input.value = String(o.vertical);
    this.relative.input.checked = o.relative;
    this.absolute.input.checked = !o.relative;
    this.anchors.input.checked = o.anchors;
    this.ins.input.checked = o.ins;
    this.outs.input.checked = o.outs;
    this.seed.input.value = String(o.seed);
    this.preview.input.checked = false;
    this.dialog = this.dialog ?? this.build();
    this.dialog.open(this.horizontal.input);
  }

  private read(): TweakOptions {
    const num = (input: HTMLInputElement, fallback: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) && v >= 0 ? v : fallback; };
    return {
      horizontal: num(this.horizontal.input, 0), vertical: num(this.vertical.input, 0), relative: this.relative.input.checked,
      anchors: this.anchors.input.checked, ins: this.ins.input.checked, outs: this.outs.input.checked, seed: Math.max(1, Math.round(num(this.seed.input, 7)))
    };
  }

  private update(): void {
    const host = this.host;
    if (!host) return;
    const options = this.read();
    const show = this.preview.input.checked;
    for (const [id, subs] of this.base) host.draft(id, show ? tweakSubs(subs, options) : subs);
    host.render();
  }

  private cancel(): void {
    const host = this.host;
    this.host = null;
    if (!host) return;
    for (const [id, subs] of this.base) host.draft(id, subs);
    host.clearDrafts();
    host.render();
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    this.options = this.read();
    this.host = null;
    this.dialog?.close();
    void host.commit([...this.base].map(([id, subs]) => updateGeometry(id, tweakSubs(subs, this.options))));
  }
}

let tweak: TweakDialog | undefined;
export const openTweak = (host: Host): void => { (tweak ??= new TweakDialog()).open(host); };

/* Blob Brush Tool Options */

class BlobDialog {
  private dialog: Shell | null = null;
  private keep = checkRow(t('Keep Selected'));
  private merge = checkRow(t('Merge Only with Selection'));
  private fidelity = numberField(t('Fidelity'), 0.5, 20, 0.5);
  private size = numberField(t('Size'), 1, BLOB_MAX_SIZE);

  private build(): Shell {
    return shell(t('Blob Brush Tool Options'), [this.keep.row, this.merge.row, this.fidelity.field, this.size.field, element('p', 'fw-v-note', t('Lower fidelity follows the pointer closely; higher gives smoother shapes. [ and ] change the size.'))], () => this.apply());
  }

  open(): void {
    this.keep.input.checked = blobOptions.keepSelected;
    this.merge.input.checked = blobOptions.mergeSelection;
    this.fidelity.input.value = String(blobOptions.fidelity);
    this.size.input.value = String(blobOptions.size);
    this.dialog = this.dialog ?? this.build();
    this.dialog.open(this.size.input);
  }

  private apply(): void {
    const num = (input: HTMLInputElement, fallback: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : fallback; };
    setBlobOptions({ keepSelected: this.keep.input.checked, mergeSelection: this.merge.input.checked, fidelity: num(this.fidelity.input, blobOptions.fidelity), size: num(this.size.input, blobOptions.size) });
    this.dialog?.close();
  }
}

let blobDialog: BlobDialog | undefined;
export const openBlobOptions = (): void => { (blobDialog ??= new BlobDialog()).open(); };

/* Object > Pattern > Make, Pattern Options */

function selectField(label: string, choices: [string, string][]): { field: HTMLElement; input: HTMLSelectElement } {
  const input = element('select', 'fw-v-input');
  for (const [value, text] of choices) { const option = element('option', '', text); option.value = value; input.append(option); }
  const field = element('div', 'field');
  field.append(element('span', 'field-label', label), input);
  return { field, input };
}

class PatternDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private tile = selectField(t('Tile type'), [['grid', t('Grid')], ['brick-row', t('Brick by Row')], ['brick-column', t('Brick by Column')]]);
  private offset = selectField(t('Brick offset'), BRICK_OFFSETS.map(([v, label]) => [String(v), label]));
  private fit = checkRow(t('Size Tile to Art'));
  private width = numberField(t('Width'), 1, 100000, 0.1);
  private height = numberField(t('Height'), 1, 100000, 0.1);
  private hSpace = numberField(t('H Spacing'), -100000, 100000, 0.1);
  private vSpace = numberField(t('V Spacing'), -100000, 100000, 0.1);

  private build(): Shell {
    const size = element('div', 'fw-v-row');
    size.append(this.width.field, this.height.field);
    const space = element('div', 'fw-v-row');
    space.append(this.hSpace.field, this.vSpace.field);
    const root = shell(t('Pattern Options'), [this.tile.field, this.offset.field, this.fit.row, size, space,
      element('p', 'fw-v-note', t('The last selected shape gets the pattern fill; the other selected shapes become the tile.'))], () => this.apply(), t('Make pattern'));
    root.root.addEventListener('change', () => this.sync());
    return root;
  }

  private sync(): void {
    const brick = this.tile.input.value !== 'grid';
    if (this.offset.input.disabled === brick) this.offset.input.disabled = !brick;
    const fit = this.fit.input.checked;
    if (this.width.input.disabled !== fit) { this.width.input.disabled = fit; this.height.input.disabled = fit; }
    if (this.hSpace.input.disabled === fit) { this.hSpace.input.disabled = !fit; this.vSpace.input.disabled = !fit; }
  }

  open(host: Host): void {
    const parts = patternParts(host);
    if (!parts) { host.notify(t('Select the tile artwork, then the shape to fill last.')); return; }
    this.host = host;
    const o = patternOptions;
    const [w, h] = tileSize(parts, { ...o, sizeToArt: true });
    this.tile.input.value = o.tile;
    this.offset.input.value = String(o.offset);
    this.fit.input.checked = o.sizeToArt;
    this.width.input.value = String(Math.round((o.sizeToArt ? w : o.width) * 100) / 100);
    this.height.input.value = String(Math.round((o.sizeToArt ? h : o.height) * 100) / 100);
    this.hSpace.input.value = String(o.hSpace);
    this.vSpace.input.value = String(o.vSpace);
    this.dialog = this.dialog ?? this.build();
    this.sync();
    this.dialog.open(this.tile.input);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const num = (input: { value: string }, fallback: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : fallback; };
    Object.assign(patternOptions, {
      tile: this.tile.input.value as TileType, offset: num(this.offset.input, 0.5), sizeToArt: this.fit.input.checked,
      width: Math.max(1, num(this.width.input, 50)), height: Math.max(1, num(this.height.input, 50)), hSpace: num(this.hSpace.input, 0), vSpace: num(this.vSpace.input, 0)
    });
    const parts = patternParts(host);
    this.host = null;
    this.dialog?.close();
    if (!parts) return;
    const made = patternCommands(host, parts, patternOptions);
    void host.commit(made.cmds, [parts.target.id]);
  }
}

let patternDialog: PatternDialog | undefined;
export const openPattern = (host: Host): void => { (patternDialog ??= new PatternDialog()).open(host); };
