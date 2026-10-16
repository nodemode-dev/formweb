import { element, text, value } from '../ui/dom';
import type { Editor } from './editor';
import { button, field, numberInput, section } from './panel';
import { ARROWS, type Arrow, type ArrowTip, type DashMode } from './strokefx';

const ARROW_LABELS: Record<Arrow, string> = { none: 'None', simple: 'Simple arrow', filled: 'Filled triangle', open: 'Open triangle', circle: 'Circle', square: 'Square', bar: 'Bar' };
const PAIRS = 3;

function choice(label: string, pick: () => void): HTMLButtonElement {
  const b = element('button', 'fw-v-btn', label);
  b.type = 'button';
  b.title = label;
  b.addEventListener('click', pick);
  return b;
}

export class StrokeSection {
  readonly root: HTMLDetailsElement;
  private dashed = element('input', 'fw-v-check');
  private dashes: HTMLInputElement[] = [];
  private gaps: HTMLInputElement[] = [];
  private modes = new Map<DashMode, HTMLButtonElement>();
  private tips = new Map<ArrowTip, HTMLButtonElement>();
  private starts = element('select', 'fw-v-input');
  private ends = element('select', 'fw-v-input');
  private scaleStart: HTMLInputElement;
  private scaleEnd: HTMLInputElement;
  private note = element('p', 'fw-v-note');
  private remove: HTMLButtonElement;

  constructor(private editor: Editor) {
    const ops = editor.ops;
    const { root, body } = section('Stroke options', false);
    this.root = root;
    this.dashed.type = 'checkbox';
    const check = element('label', 'fw-v-checkrow');
    check.append(this.dashed, element('span', '', 'Dashed line'));
    this.dashed.addEventListener('change', () => {
      if (this.dashed.checked && !this.dashes[0].value.trim()) { this.dashes[0].value = '12'; this.gaps[0].value = '12'; }
      this.sendDash();
    });
    body.append(check);
    for (let i = 0; i < PAIRS; i++) {
      const dash = numberInput(0, 10000, 0.5, () => undefined);
      const gap = numberInput(0, 10000, 0.5, () => undefined);
      dash.addEventListener('change', () => { if (dash.value.trim() && !this.dashed.checked) this.dashed.checked = true; this.sendDash(); });
      gap.addEventListener('change', () => this.sendDash());
      this.dashes.push(dash);
      this.gaps.push(gap);
      const pair = element('div', 'fw-v-row');
      pair.append(field('Dash', dash), field('Gap', gap));
      body.append(pair);
    }
    const mode = element('div', 'fw-v-stack');
    for (const [id, label] of [['preserve', 'Preserve exact dash and gap lengths'], ['align', 'Align dashes to corners and path ends, adjusting lengths to fit']] as [DashMode, string][]) {
      const b = choice(label, () => { void ops.strokeFx({ mode: id, ...this.dashModel() }); });
      this.modes.set(id, b);
      mode.append(b);
    }
    body.append(mode);
    for (const select of [this.starts, this.ends]) {
      for (const id of ARROWS) {
        const option = element('option', '', ARROW_LABELS[id]);
        option.value = id;
        select.append(option);
      }
    }
    this.starts.addEventListener('change', () => { void ops.strokeFx({ a0: this.starts.value as Arrow }); });
    this.ends.addEventListener('change', () => { void ops.strokeFx({ a1: this.ends.value as Arrow }); });
    this.scaleStart = numberInput(1, 1000, 5, n => { void ops.strokeFx({ s0: n }); });
    this.scaleEnd = numberInput(1, 1000, 5, n => { void ops.strokeFx({ s1: n }); });
    const arrows = element('div', 'fw-v-row');
    arrows.append(field('Start arrowhead', this.starts), field('End arrowhead', this.ends), field('Scale start %', this.scaleStart), field('Scale end %', this.scaleEnd));
    body.append(arrows);
    const tip = element('div', 'fw-v-stack');
    for (const [id, label] of [['extend', 'Extend arrow tip beyond end of path'], ['end', 'Place arrow tip at end of path']] as [ArrowTip, string][]) {
      const b = choice(label, () => { void ops.strokeFx({ tip: id }); });
      this.tips.set(id, b);
      tip.append(b);
    }
    body.append(tip);
    this.remove = button('Remove dashes and arrowheads', 'Return the selected path to a plain stroke', () => { void ops.releaseLive(); });
    const grid = element('div', 'fw-v-stack');
    grid.append(button('Width tool', 'Open the Width tool to shape the stroke profile', () => editor.setTool('width'), 'width'), this.remove);
    body.append(grid, this.note);
    editor.listeners.add(() => this.update());
    this.update();
  }

  private dashModel(): { dash: number[] } {
    const dash: number[] = [];
    if (this.dashed.checked) {
      for (let i = 0; i < PAIRS; i++) {
        const d = parseFloat(this.dashes[i].value);
        if (!Number.isFinite(d)) break;
        const g = parseFloat(this.gaps[i].value);
        dash.push(d, Number.isFinite(g) ? g : d);
      }
    }
    return { dash };
  }

  private sendDash(): void {
    void this.editor.ops.strokeFx(this.dashModel());
  }

  update(): void {
    const model = this.editor.ops.strokeModel();
    text(this.note, model ? '' : 'Select a path with a stroke to set dashes and arrowheads.');
    const m = model ?? { dash: [], mode: 'preserve' as DashMode, a0: 'none' as Arrow, a1: 'none' as Arrow, s0: 100, s1: 100, tip: 'extend' as ArrowTip };
    this.dashed.checked = m.dash.length > 0;
    for (let i = 0; i < PAIRS; i++) {
      value(this.dashes[i], m.dash[i * 2] === undefined ? '' : String(m.dash[i * 2]));
      value(this.gaps[i], m.dash[i * 2 + 1] === undefined ? '' : String(m.dash[i * 2 + 1]));
    }
    for (const [id, b] of this.modes) { b.classList.toggle('is-on', id === m.mode); b.setAttribute('aria-pressed', String(id === m.mode)); }
    for (const [id, b] of this.tips) { b.classList.toggle('is-on', id === m.tip); b.setAttribute('aria-pressed', String(id === m.tip)); }
    value(this.starts, m.a0);
    value(this.ends, m.a1);
    value(this.scaleStart, String(m.s0));
    value(this.scaleEnd, String(m.s1));
    this.remove.disabled = !this.editor.ops.liveSelected('stroke');
  }
}
