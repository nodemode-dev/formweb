import { command, state } from '../api';
import { element, value } from '../ui/dom';
import type { BristleShape, BrushKind, BrushSettings } from './brush';
import { brushOptionsCommands, brushUsers, type BrushDef } from './brushcmd';
import type { Editor } from './editor';
import { field, numberInput, segment } from './panel';

export const SHOWN: Record<BrushKind, string[]> = {
  calligraphic: ['angle', 'roundness', 'size'],
  scatter: ['scale', 'spacing', 'scatter', 'rotation', 'rotmode', 'rotrel', 'seed'],
  art: ['scale', 'stretch', 'flip', 'flipv'],
  pattern: ['scale', 'fit', 'spacing', 'flip', 'flipv'],
  bristle: ['bshape', 'size', 'blen', 'bdens', 'bthick', 'bopac', 'bstiff', 'seed']
};

type NumKey = 'angle' | 'roundness' | 'size' | 'scale' | 'spacing' | 'scatter' | 'rotation' | 'seed' | 'blen' | 'bdens' | 'bthick' | 'bopac' | 'bstiff';
const NUMS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'angle', label: 'Angle', min: -180, max: 180, step: 1 }, { key: 'roundness', label: 'Roundness %', min: 1, max: 100, step: 1 }, { key: 'size', label: 'Size', min: 0.1, max: 2000, step: 0.5 },
  { key: 'scale', label: 'Size %', min: 1, max: 1000, step: 1 }, { key: 'spacing', label: 'Spacing %', min: 0, max: 1000, step: 1 }, { key: 'scatter', label: 'Scatter %', min: 0, max: 500, step: 1 },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1 }, { key: 'seed', label: 'Seed', min: 1, max: 99999, step: 1 },
  { key: 'blen', label: 'Bristle length %', min: 5, max: 100, step: 1 }, { key: 'bdens', label: 'Bristle density %', min: 1, max: 100, step: 1 }, { key: 'bthick', label: 'Bristle thickness', min: 0.1, max: 50, step: 0.1 },
  { key: 'bopac', label: 'Paint opacity %', min: 5, max: 100, step: 1 }, { key: 'bstiff', label: 'Stiffness %', min: 0, max: 100, step: 1 }
];
const FLAGS: { key: 'stretch' | 'flip' | 'flipv'; label: string }[] = [{ key: 'stretch', label: 'Stretch to fit stroke length' }, { key: 'flip', label: 'Flip along' }, { key: 'flipv', label: 'Flip across' }];

function toggle(label: string): { root: HTMLElement; input: HTMLInputElement } {
  const input = element('input', 'fw-v-check');
  input.type = 'checkbox';
  const root = element('label', 'fw-v-checkrow');
  root.append(input, element('span', '', label));
  return { root, input };
}

export class BrushDialog {
  private root: HTMLElement | null = null;
  private rows = new Map<string, HTMLElement>();
  private nums = new Map<NumKey, HTMLInputElement>();
  private flags = new Map<'stretch' | 'flip' | 'flipv', HTMLInputElement>();
  private segs = new Map<string, { set: (id: never) => void }>();
  private heading!: HTMLElement;
  private preview!: HTMLInputElement;
  private editor: Editor | null = null;
  private def: BrushDef | null = null;
  private users: string[] = [];
  private values!: BrushSettings;
  private steps = 0;
  private applied = '';
  private rev = -1;
  private dirty = false;
  private running: Promise<void> | null = null;

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog fw-v-brushdlg');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Brush Options');
    root.hidden = true;
    this.heading = element('div', 'fw-v-summary', 'Brush Options');
    const body = element('div', 'fw-v-dlgbody');
    const add = (key: string, node: HTMLElement): void => { this.rows.set(key, node); body.append(node); };
    const seg = <T extends string>(key: keyof BrushSettings, items: { id: T; label: string }[]): HTMLElement => {
      const s = segment<T>(items, id => { this.patch({ [key]: id } as Partial<BrushSettings>); s.set(id); });
      this.segs.set(key, s as unknown as { set: (id: never) => void });
      return s.root;
    };
    for (const n of NUMS) {
      const input = numberInput(n.min, n.max, n.step, v => { input.value = String(v); this.patch({ [n.key]: v } as Partial<BrushSettings>); });
      input.addEventListener('input', () => { const v = parseFloat(input.value); if (Number.isFinite(v) && v >= n.min && v <= n.max) this.patch({ [n.key]: v } as Partial<BrushSettings>); });
      this.nums.set(n.key, input);
      add(n.key, field(n.label, input));
    }
    add('bshape', field('Shape', seg<BristleShape>('bshape', [{ id: 'round', label: 'Round point' }, { id: 'flat', label: 'Flat' }, { id: 'fan', label: 'Fan' }, { id: 'angle', label: 'Angled' }]), true));
    add('rotmode', field('Rotation', seg<'fixed' | 'random'>('rotmode', [{ id: 'fixed', label: 'Fixed' }, { id: 'random', label: 'Random' }]), true));
    add('rotrel', field('Rotation relative to', seg<'page' | 'path'>('rotrel', [{ id: 'page', label: 'Page' }, { id: 'path', label: 'Path' }]), true));
    add('fit', field('Fit', seg<'stretch' | 'space'>('fit', [{ id: 'stretch', label: 'Stretch' }, { id: 'space', label: 'Add space' }]), true));
    for (const f of FLAGS) {
      const t = toggle(f.label);
      t.input.addEventListener('change', () => this.patch({ [f.key]: t.input.checked ? 1 : 0 } as Partial<BrushSettings>));
      this.flags.set(f.key, t.input);
      add(f.key, t.root);
    }
    const previewRow = toggle('Preview');
    this.preview = previewRow.input;
    this.preview.addEventListener('change', () => { if (this.preview.checked) this.schedule(); else void this.revert(); });
    const ok = element('button', 'fw-v-btn', 'OK');
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', 'Cancel');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    ok.addEventListener('click', () => { void this.accept(); });
    cancel.addEventListener('click', () => { void this.dismiss(); });
    root.append(this.heading, body, element('p', 'fw-v-note', 'Changes apply to every path that uses this brush.'), previewRow.root, actions);
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); void this.accept(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void this.dismiss(); }
    });
    document.body.append(root);
    return root;
  }

  private patch(change: Partial<BrushSettings>): void {
    if (!this.def) return;
    this.values = { ...this.values, ...change };
    this.schedule();
  }

  private schedule(): void {
    if (!this.preview.checked || !this.def) return;
    this.dirty = true;
    if (this.running) return;
    const run: Promise<void> = this.pump().finally(() => { if (this.running === run) this.running = null; });
    this.running = run;
  }

  private async pump(): Promise<void> {
    while (this.dirty && this.editor && this.def) {
      this.dirty = false;
      const key = JSON.stringify(this.values);
      if (key === this.applied) continue;
      const cmds = brushOptionsCommands(this.editor.site(), this.def, this.users, this.values, false);
      if (cmds.length && await this.editor.host().commit(cmds)) { this.steps++; this.applied = key; this.rev = state().revision; }
    }
  }

  private async settle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async revert(): Promise<void> {
    this.dirty = false;
    await this.settle();
    const count = this.steps;
    this.steps = 0;
    if (this.def) this.applied = JSON.stringify(this.def.settings);
    if (state().revision !== this.rev) return;
    for (let i = 0; i < count; i++) await command('history.undo');
  }

  private async accept(): Promise<void> {
    const editor = this.editor, def = this.def;
    if (!editor || !def) return;
    this.dirty = false;
    await this.revert();
    const users = this.users, values = this.values;
    this.finish();
    await editor.host().commit(brushOptionsCommands(editor.site(), def, users, values, true));
  }

  private async dismiss(): Promise<void> {
    await this.revert();
    this.finish();
  }

  private finish(): void {
    this.editor = null;
    this.def = null;
    this.users = [];
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }

  open(editor: Editor, def: BrushDef): void {
    const root = this.root ?? (this.root = this.build());
    if (this.def) return;
    this.editor = editor;
    this.def = def;
    this.users = brushUsers(editor.site(), def);
    this.values = { ...def.settings };
    this.steps = 0;
    this.applied = JSON.stringify(def.settings);
    this.rev = state().revision;
    this.dirty = false;
    this.preview.checked = true;
    const shown = new Set(SHOWN[def.settings.kind]);
    this.rows.forEach((node, key) => { if (node.hidden === shown.has(key)) node.hidden = !shown.has(key); });
    for (const n of NUMS) value(this.nums.get(n.key)!, String(def.settings[n.key]));
    for (const f of FLAGS) this.flags.get(f.key)!.checked = def.settings[f.key] === 1;
    for (const key of ['bshape', 'rotmode', 'rotrel', 'fit'] as const) this.segs.get(key)?.set(def.settings[key] as never);
    const label = `${def.name} (${def.settings.kind})`;
    if (this.heading.textContent !== label) this.heading.textContent = label;
    root.hidden = false;
    (this.nums.get(SHOWN[def.settings.kind].find(key => this.nums.has(key as NumKey)) as NumKey) ?? root).focus();
  }

  isOpen(): boolean { return !!this.root && !this.root.hidden; }
}
