import { element } from '../ui/dom';
import { pathfinderOptions } from './boolean';

const STORE = 'fw.vector.pathfinder';

function load(): void {
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return;
    const c = JSON.parse(raw) as Partial<typeof pathfinderOptions>;
    if (typeof c.precision === 'number' && Number.isFinite(c.precision) && c.precision >= 0.001 && c.precision <= 100) pathfinderOptions.precision = c.precision;
    if (typeof c.redundant === 'boolean') pathfinderOptions.redundant = c.redundant;
    if (typeof c.unpainted === 'boolean') pathfinderOptions.unpainted = c.unpainted;
  } catch { return; }
}

function save(): void {
  try { window.localStorage.setItem(STORE, JSON.stringify(pathfinderOptions)); } catch { return; }
}

load();

class OptionsDialog {
  private root: HTMLElement | null = null;
  private precision = element('input', 'fw-v-input');
  private redundant = element('input', 'fw-v-check');
  private unpainted = element('input', 'fw-v-check');

  private row(input: HTMLInputElement, label: string): HTMLElement {
    input.type = 'checkbox';
    const row = element('label', 'fw-v-checkrow');
    row.append(input, element('span', '', label));
    return row;
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Pathfinder Options');
    root.hidden = true;
    this.precision.type = 'number';
    this.precision.min = '0.001';
    this.precision.max = '100';
    this.precision.step = '0.001';
    const field = element('div', 'field');
    field.append(element('span', 'field-label', 'Precision (points)'), this.precision);
    const ok = element('button', 'fw-v-btn', 'OK');
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', 'Cancel');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    root.append(element('div', 'fw-v-summary', 'Pathfinder Options'), field, this.row(this.redundant, 'Remove redundant points'), this.row(this.unpainted, 'Divide and Outline will remove unpainted artwork'),
      element('p', 'fw-v-note', 'Lower precision values stay closer to the original paths. Saved in this browser.'), actions);
    const submit = (): void => {
      const n = parseFloat(this.precision.value);
      if (Number.isFinite(n)) pathfinderOptions.precision = Math.max(0.001, Math.min(100, n));
      pathfinderOptions.redundant = this.redundant.checked;
      pathfinderOptions.unpainted = this.unpainted.checked;
      save();
      this.close();
    };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => this.close());
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    });
    document.body.append(root);
    return root;
  }

  open(): void {
    const root = this.root ?? (this.root = this.build());
    this.precision.value = String(pathfinderOptions.precision);
    this.redundant.checked = pathfinderOptions.redundant;
    this.unpainted.checked = pathfinderOptions.unpainted;
    root.hidden = false;
    this.precision.focus();
  }

  close(): void {
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }
}

const dialog = new OptionsDialog();

export function openPathfinderOptions(): void {
  dialog.open();
}
