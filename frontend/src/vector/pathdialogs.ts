import { t } from '../i18n';
import { element } from '../ui/dom';
import { gridOptions, setGridOptions } from './drawtools';
import type { Host } from './host';
import { cleanUp, gridTargets, splitGridCommands, type CleanOptions, type GridSpec } from './pathcmds';

interface Shell { root: HTMLElement; open(focus?: HTMLElement): void; close(): void }

function shell(title: string, body: HTMLElement[], submit: () => void, okLabel = t('OK')): Shell {
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
  cancel.addEventListener('click', close);
  root.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
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
