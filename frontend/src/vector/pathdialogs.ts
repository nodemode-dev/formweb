import { label, labelAttr, t, tn } from '../i18n';
import { element } from '../ui/dom';
import { gridOptions, setGridOptions } from './drawtools';
import type { Host } from './host';
import { cleanUp, gridTargets, splitGridCommands, type CleanOptions, type GridSpec } from './pathcmds';
import { applyCorners } from './corners';
import type { SubPath } from './geometry';
import { freshId, updateGeometry } from './store';
import { areaCommands, areaEditCommands, areaOptions, areaOptionsOf, areaTextFor, layoutArea, measurer, readArea, type AreaAlign } from './areatype';
import { defaultTweak, tweakSubs, type TweakOptions } from './tweak';
import { BLOB_MAX_SIZE, blobOptions, setBlobOptions } from './blob';
import { BRICK_OFFSETS, patternCommands, patternEdit, patternOptions, patternParts, repatternCommands, tileSize, type PatternEdit, type TileType } from './pattern';
import { rearrangeCommands, type RearrangeLayout } from './artboards';

interface Shell { root: HTMLElement; open(focus?: HTMLElement): void; close(): void }

function shell(title: string, body: HTMLElement[], submit: () => void, okLabel = 'OK', onCancel?: () => void): Shell {
  const root = element('div', 'fw-v-dialog');
  root.setAttribute('role', 'dialog');
  labelAttr(root, 'aria-label', title);
  root.hidden = true;
  const ok = element('button', 'fw-v-btn');
  label(ok, okLabel);
  ok.type = 'button';
  const cancel = element('button', 'fw-v-btn');
  label(cancel, 'Cancel');
  cancel.type = 'button';
  const actions = element('div', 'fw-v-row');
  actions.append(ok, cancel);
  const summary = element('div', 'fw-v-summary');
  label(summary, title);
  root.append(summary, ...body, actions);
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

function numberField(english: string, min: number, max: number, step = 1): { field: HTMLElement; input: HTMLInputElement } {
  const input = element('input', 'fw-v-input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const field = element('div', 'field');
  const caption = element('span', 'field-label');
  label(caption, english);
  field.append(caption, input);
  return { field, input };
}

const checkRow = (english: string): { row: HTMLElement; input: HTMLInputElement } => {
  const input = element('input', 'fw-v-check');
  input.type = 'checkbox';
  const row = element('label', 'fw-v-checkrow');
  const caption = element('span');
  label(caption, english);
  row.append(input, caption);
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
    const named = (field: HTMLElement, english: string): void => label(field.querySelector<HTMLElement>('.field-label')!, english);
    named(this.count.field, 'Number');
    named(this.size.field, sizeLabel);
    named(this.gutter.field, 'Gutter');
    named(this.total.field, 'Total');
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
  private rows = new Axis('Rows', 'Height');
  private cols = new Axis('Columns', 'Width');

  private build(): Shell {
    const head = (english: string): HTMLElement => { const node = element('div', 'field-label'); label(node, english); return node; };
    const note = element('p', 'fw-v-note');
    label(note, 'Replaces each selected rectangle with a group of rectangles that keep its fill and stroke.');
    return shell('Split Into Grid', [
      head(this.rows.title), this.rows.box,
      head(this.cols.title), this.cols.box,
      note
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
  private stray = checkRow('Stray points');
  private unpainted = checkRow('Unpainted objects');
  private text = checkRow('Empty text paths');

  private build(): Shell {
    const note = element('p', 'fw-v-note');
    label(note, 'Delete the checked kinds of object from the current vector.');
    return shell('Clean Up', [
      this.stray.row, this.unpainted.row, this.text.row,
      note
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
    const a = numberField(rect ? 'Horizontal dividers' : 'Concentric dividers', rect ? 0 : 1, 100);
    const b = numberField(rect ? 'Vertical dividers' : 'Radial dividers', 0, rect ? 100 : 360);
    const apply = (): void => {
      setGridOptions(rect ? { hdiv: parseFloat(a.input.value), vdiv: parseFloat(b.input.value) } : { rings: parseFloat(a.input.value), spokes: parseFloat(b.input.value) });
      entry.shell.close();
    };
    const entry = { shell: shell(rect ? 'Rectangular Grid Tool Options' : 'Polar Grid Tool Options', [a.field, b.field], apply), first: a.input, second: b.input };
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

const radioRow = (english: string, name: string): { row: HTMLElement; input: HTMLInputElement } => {
  const input = element('input', 'fw-v-check');
  input.type = 'radio';
  input.name = name;
  const row = element('label', 'fw-v-checkrow');
  const caption = element('span');
  label(caption, english);
  row.append(input, caption);
  return { row, input };
};

class TweakDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private base = new Map<string, SubPath[]>();
  private options: TweakOptions = { ...defaultTweak };
  private horizontal = numberField('Horizontal', 0, 100000, 0.1);
  private vertical = numberField('Vertical', 0, 100000, 0.1);
  private relative = radioRow('Relative', 'fw-tweak-mode');
  private absolute = radioRow('Absolute', 'fw-tweak-mode');
  private anchors = checkRow('Anchor points');
  private ins = checkRow('"In" control points');
  private outs = checkRow('"Out" control points');
  private seed = numberField('Seed', 1, 99999);
  private preview = checkRow('Preview');

  private build(): Shell {
    const amounts = element('div', 'fw-v-row');
    amounts.append(this.horizontal.field, this.vertical.field);
    const mode = element('div', 'fw-v-row');
    mode.append(this.relative.row, this.absolute.row);
    const shell_ = shell('Tweak', [amounts, mode, this.anchors.row, this.ins.row, this.outs.row, this.seed.field, this.preview.row], () => this.apply(), 'OK', () => this.cancel());
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
  private keep = checkRow('Keep Selected');
  private merge = checkRow('Merge Only with Selection');
  private fidelity = numberField('Fidelity', 0.5, 20, 0.5);
  private size = numberField('Size', 1, BLOB_MAX_SIZE);

  private build(): Shell {
    const note = element('p', 'fw-v-note');
    label(note, 'Lower fidelity follows the pointer closely; higher gives smoother shapes. [ and ] change the size.');
    return shell('Blob Brush Tool Options', [this.keep.row, this.merge.row, this.fidelity.field, this.size.field, note], () => this.apply());
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

function selectField(english: string, choices: [string, string][]): { field: HTMLElement; input: HTMLSelectElement } {
  const input = element('select', 'fw-v-input');
  for (const [value, name] of choices) { const option = element('option'); label(option, name); option.value = value; input.append(option); }
  const field = element('div', 'field');
  const caption = element('span', 'field-label');
  label(caption, english);
  field.append(caption, input);
  return { field, input };
}

class PatternDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private tile = selectField('Tile type', [['grid', 'Grid'], ['brick-row', 'Brick by Row'], ['brick-column', 'Brick by Column'], ['hex-column', 'Hex by Column'], ['hex-row', 'Hex by Row']]);
  private edit: PatternEdit | null = null;
  private note = element('p', 'fw-v-note', '');
  private offset = selectField('Brick offset', BRICK_OFFSETS.map(([v, name]) => [String(v), name]));
  private fit = checkRow('Size Tile to Art');
  private width = numberField('Width', 1, 100000, 0.1);
  private height = numberField('Height', 1, 100000, 0.1);
  private hSpace = numberField('H Spacing', -100000, 100000, 0.1);
  private vSpace = numberField('V Spacing', -100000, 100000, 0.1);

  private build(): Shell {
    const size = element('div', 'fw-v-row');
    size.append(this.width.field, this.height.field);
    const space = element('div', 'fw-v-row');
    space.append(this.hSpace.field, this.vSpace.field);
    const root = shell('Pattern Options', [this.tile.field, this.offset.field, this.fit.row, size, space, this.note], () => this.apply(), 'Make pattern');
    root.root.addEventListener('change', () => this.sync());
    return root;
  }

  private sync(): void {
    const brick = this.tile.input.value.startsWith('brick');
    if (this.offset.input.disabled === brick) this.offset.input.disabled = !brick;
    const fit = this.fit.input.checked;
    if (this.width.input.disabled !== fit) { this.width.input.disabled = fit; this.height.input.disabled = fit; }
    if (this.hSpace.input.disabled === fit) { this.hSpace.input.disabled = !fit; this.vSpace.input.disabled = !fit; }
  }

  open(host: Host, edit = false): void {
    const ed = edit ? patternEdit(host) : null;
    const parts = edit ? (ed ? { art: ed.art, target: ed.target, box: ed.box } : null) : patternParts(host);
    if (!parts) { host.notify(edit ? t('Select a shape filled with a pattern.') : t('Select the tile artwork, then the shape to fill last.')); return; }
    this.host = host;
    this.edit = ed;
    const o = ed ? ed.options : patternOptions;
    const [w, h] = tileSize(parts, { ...o, sizeToArt: true });
    this.dialog = this.dialog ?? this.build();
    const ok = this.dialog.root.querySelector('.fw-v-row:last-child .fw-v-btn');
    const okText = ed ? t('Update pattern') : t('Make pattern');
    if (ok && ok.textContent !== okText) ok.textContent = okText;
    const noteText = ed ? t('Changes the pattern of the selected shape; every shape using it updates.') : t('The last selected shape gets the pattern fill; the other selected shapes become the tile.');
    if (this.note.textContent !== noteText) this.note.textContent = noteText;
    this.tile.input.value = o.tile;
    this.offset.input.value = String(o.offset);
    this.fit.input.checked = o.sizeToArt;
    this.width.input.value = String(Math.round((o.sizeToArt ? w : o.width) * 100) / 100);
    this.height.input.value = String(Math.round((o.sizeToArt ? h : o.height) * 100) / 100);
    this.hSpace.input.value = String(o.hSpace);
    this.vSpace.input.value = String(o.vSpace);
    this.sync();
    this.dialog.open(this.tile.input);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const num = (input: { value: string }, fallback: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : fallback; };
    const chosen = {
      tile: this.tile.input.value as TileType, offset: num(this.offset.input, 0.5), sizeToArt: this.fit.input.checked,
      width: Math.max(1, num(this.width.input, 50)), height: Math.max(1, num(this.height.input, 50)), hSpace: num(this.hSpace.input, 0), vSpace: num(this.vSpace.input, 0)
    };
    this.host = null;
    this.dialog?.close();
    if (this.edit) {
      const ed = patternEdit(host);
      this.edit = null;
      if (ed) void host.commit(repatternCommands(host, ed, chosen), [ed.target.id]);
      return;
    }
    Object.assign(patternOptions, chosen);
    const parts = patternParts(host);
    if (!parts) return;
    const made = patternCommands(host, parts, patternOptions);
    void host.commit(made.cmds, [parts.target.id]);
  }
}

let patternDialog: PatternDialog | undefined;
export const openPattern = (host: Host, edit = false): void => { (patternDialog ??= new PatternDialog()).open(host, edit); };

/* Type > Area Type Options */

class AreaTypeDialog {
  private dialog: Shell | null = null;
  private host: Host | null = null;
  private text = element('textarea', 'fw-v-input');
  private size = numberField('Font size', 1, 1000, 0.5);
  private leading = numberField('Leading', 1, 2000, 0.5);
  private family = element('input', 'fw-v-input');
  private weight = selectField('Weight', ['300', '400', '500', '600', '700', '800'].map(w => [w, w]));
  private color = element('input', 'fw-v-input');
  private align = selectField('Alignment', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]);
  private inset = numberField('Inset spacing', 0, 1000, 0.5);
  private columns = numberField('Columns', 1, 12);
  private gutter = numberField('Gutter', 0, 1000, 0.5);

  private build(): Shell {
    this.text.rows = 5;
    labelAttr(this.text, 'aria-label', 'Text');
    this.color.type = 'color';
    labelAttr(this.color, 'aria-label', 'Color');
    const wrap = (english: string, input: HTMLElement): HTMLElement => { const f = element('div', 'field'); const caption = element('span', 'field-label'); label(caption, english); f.append(caption, input); return f; };
    const row = (...parts: HTMLElement[]): HTMLElement => { const r = element('div', 'fw-v-row'); r.append(...parts); return r; };
    const note = element('p', 'fw-v-note');
    label(note, 'Text flows inside the selected closed shape and reflows when the shape changes.');
    return shell('Area Type', [
      wrap('Text', this.text), row(this.size.field, this.leading.field), wrap('Font family', this.family),
      row(this.weight.field, wrap('Color', this.color)), this.align.field, this.inset.field, row(this.columns.field, this.gutter.field),
      note
    ], () => this.apply(), 'Place text');
  }

  private editing: string | null = null;

  open(host: Host, edit = false): void {
    const found = edit ? areaTextFor(host.site(), host.primary()) : null;
    if (edit && !found) { host.notify(t('Select area type or the shape that holds it.')); return; }
    const shape = host.shape(found ? found.spec.src : host.primary());
    if (!shape || !shape.subs.some(s => s.closed)) { host.notify(t('Select a closed shape to hold the text.')); return; }
    this.host = host;
    this.editing = found ? found.text.id : null;
    const o = found ? areaOptionsOf(found.text, found.spec) : areaOptions;
    this.dialog = this.dialog ?? this.build();
    const ok = this.dialog.root.querySelector<HTMLElement>('.fw-v-row:last-child .fw-v-btn');
    if (ok) label(ok, found ? 'Update text' : 'Place text');
    this.text.value = o.text;
    this.size.input.value = String(o.size);
    this.leading.input.value = String(o.leading);
    this.family.value = o.family;
    this.weight.input.value = o.weight;
    this.color.value = o.color;
    this.align.input.value = o.align;
    this.inset.input.value = String(o.inset);
    this.columns.input.value = String(o.columns);
    this.gutter.input.value = String(o.gutter);
    this.dialog.open(this.text);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const num = (input: { value: string }, fallback: number, min: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) && v >= min ? v : fallback; };
    Object.assign(areaOptions, {
      text: this.text.value.slice(0, 20000), size: num(this.size.input, 16, 1), leading: num(this.leading.input, 20, 1), family: this.family.value.replace(/[<>;{}\\@]/g, '').trim() || 'system-ui, sans-serif',
      weight: this.weight.input.value, color: /^#[0-9a-fA-F]{6}$/.test(this.color.value) ? this.color.value : '#1f1f1f', align: this.align.input.value as AreaAlign,
      inset: num(this.inset.input, 0, 0), columns: Math.round(num(this.columns.input, 1, 1)), gutter: num(this.gutter.input, 0, 0)
    });
    this.host = null;
    this.dialog?.close();
    if (this.editing) {
      const site = host.site();
      const text = site.nodes[this.editing];
      const spec = text ? readArea(text.attrs['data-fw-area']) : null;
      const src = spec ? host.shape(spec.src) : undefined;
      this.editing = null;
      if (!text || !spec || !src || !areaOptions.text.trim()) return;
      const made = areaEditCommands(site, text, spec, areaOptions);
      if (!made.lines) { host.notify(t('The text does not fit in this shape.')); return; }
      if (made.overflow) host.notify(tn(made.overflow, 'Overflow: {0} word did not fit in the shape.', 'Overflow: {0} words did not fit in the shape.'));
      void host.commit(made.cmds, [spec.src]);
      return;
    }
    const shape = host.shape(host.primary());
    if (!shape || !areaOptions.text.trim()) return;
    const { lines, overflow } = layoutArea(applyCorners(shape.subs), areaOptions, measurer(areaOptions));
    if (!lines.length) { host.notify(t('The text does not fit in this shape.')); return; }
    const site = host.site();
    const taken = new Set<string>();
    const textId = freshId(site, taken, 'text');
    const lineIds = lines.map(() => freshId(site, taken, 'tspan'));
    const parent = host.parentOf(shape.id) ?? shape.svg;
    const index = site.nodes[parent].children.indexOf(shape.id) + 1;
    if (overflow) host.notify(tn(overflow, 'Overflow: {0} word did not fit in the shape.', 'Overflow: {0} words did not fit in the shape.'));
    void host.commit(areaCommands(parent, index, textId, lineIds, lines, areaOptions, shape.id, overflow), [shape.id]);
  }
}

let areaDialog: AreaTypeDialog | undefined;
export const openAreaType = (host: Host, edit = false): void => { (areaDialog ??= new AreaTypeDialog()).open(host, edit); };

/* Freeform gradient stop: colour and spread, opened by double-clicking a stop with the Gradient tool. */

class FreeformStopDialog {
  private dialog: Shell | null = null;
  private color = element('input', 'fw-v-color');
  private spread = numberField('Spread (%)', 2, 100);
  private apply: ((color: string, spread: number) => void) | null = null;

  private build(): Shell {
    this.color.type = 'color';
    const field = element('div', 'field');
    const caption = element('span', 'field-label');
    label(caption, 'Color');
    field.append(caption, this.color);
    const note = element('p', 'fw-v-note');
    label(note, 'Click inside the shape to add a stop. Drag a stop outside the shape or press Backspace to remove it.');
    return shell('Freeform Gradient Stop', [field, this.spread.field, note], () => this.submit());
  }

  open(color: string, spread: number, apply: (color: string, spread: number) => void): void {
    this.dialog = this.dialog ?? this.build();
    this.apply = apply;
    this.color.value = color;
    this.spread.input.value = String(Math.round(spread * 100));
    this.dialog.open(this.spread.input);
  }

  private submit(): void {
    const n = parseFloat(this.spread.input.value);
    const spread = Number.isFinite(n) ? Math.max(2, Math.min(100, n)) / 100 : 0.5;
    this.apply?.(this.color.value, spread);
    this.dialog?.close();
  }
}

/* Artboards > Rearrange All Artboards: layout, columns or rows, spacing and layout order for the current page. */

class RearrangeDialog {
  private dialog: Shell | null = null;
  private layout = selectField('Layout', [['grid-row', 'Grid by Row'], ['grid-column', 'Grid by Column'], ['row', 'Arrange by Row'], ['column', 'Arrange by Column']]);
  private count = numberField('Columns', 1, 100);
  private spacing = numberField('Spacing', 0, 10000);
  private order = selectField('Layout order', [['ltr', 'Left to right'], ['rtl', 'Right to left']]);
  private host: Host | null = null;
  private parent = '';

  private build(): Shell {
    this.layout.input.addEventListener('change', () => this.label());
    return shell('Rearrange All Artboards', [this.layout.field, this.count.field, this.spacing.field, this.order.field], () => this.apply());
  }

  private label(): void {
    const v = this.layout.input.value;
    const span = this.count.field.querySelector<HTMLElement>('.field-label');
    if (span) label(span, v === 'grid-column' ? 'Rows' : 'Columns');
    this.count.input.disabled = v === 'row' || v === 'column';
  }

  open(host: Host, parent: string): void {
    this.host = host;
    this.parent = parent;
    this.dialog = this.dialog ?? this.build();
    if (!this.count.input.value) { this.count.input.value = '2'; this.spacing.input.value = '40'; }
    this.label();
    this.dialog.open(this.layout.input);
  }

  private apply(): void {
    const host = this.host;
    if (!host) return;
    const num = (input: HTMLInputElement, fallback: number): number => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : fallback; };
    const cmds = rearrangeCommands(host.site(), this.parent, { layout: this.layout.input.value as RearrangeLayout, count: num(this.count.input, 2), spacing: num(this.spacing.input, 40), rtl: this.order.input.value === 'rtl' });
    if (!cmds.length) { host.notify(t('No artboards on this page to rearrange.')); return; }
    void host.commit(cmds);
    this.dialog?.close();
  }
}

let rearrangeDialog: RearrangeDialog | undefined;
export const openRearrange = (host: Host, parent: string): void => { (rearrangeDialog ??= new RearrangeDialog()).open(host, parent); };

let stopDialog: FreeformStopDialog | undefined;
export const openFreeformStop = (color: string, spread: number, apply: (color: string, spread: number) => void): void => { (stopDialog ??= new FreeformStopDialog()).open(color, spread, apply); };
