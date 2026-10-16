import { element } from '../ui/dom';

class MeshDialog {
  private root: HTMLElement | null = null;
  private rows = element('input', 'fw-v-input');
  private cols = element('input', 'fw-v-input');
  private apply: (rows: number, cols: number) => void = () => undefined;
  private last = { rows: 4, cols: 4 };

  private count(input: HTMLInputElement, fallback: number): number {
    const n = Math.round(parseFloat(input.value));
    return Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : fallback;
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Envelope Mesh');
    root.hidden = true;
    for (const input of [this.rows, this.cols]) {
      input.type = 'number';
      input.min = '1';
      input.max = '50';
      input.step = '1';
    }
    const rowsField = element('div', 'field');
    rowsField.append(element('span', 'field-label', 'Rows'), this.rows);
    const colsField = element('div', 'field');
    colsField.append(element('span', 'field-label', 'Columns'), this.cols);
    const ok = element('button', 'fw-v-btn', 'OK');
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', 'Cancel');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    root.append(element('div', 'fw-v-summary', 'Envelope Mesh'), rowsField, colsField, element('p', 'fw-v-note', 'Drag the mesh points with Direct Selection.'), actions);
    const submit = (): void => {
      this.last = { rows: this.count(this.rows, 4), cols: this.count(this.cols, 4) };
      const run = this.apply;
      this.close();
      run(this.last.rows, this.last.cols);
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

  open(apply: (rows: number, cols: number) => void): void {
    const root = this.root ?? (this.root = this.build());
    this.apply = apply;
    this.rows.value = String(this.last.rows);
    this.cols.value = String(this.last.cols);
    root.hidden = false;
    this.rows.focus();
  }

  close(): void {
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }
}

const dialog = new MeshDialog();

export function openMeshDialog(apply: (rows: number, cols: number) => void): void {
  dialog.open(apply);
}
