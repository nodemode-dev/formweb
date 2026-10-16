import { element } from '../ui/dom';

export interface WidthRequest {
  side1: number;
  side2: number;
  apply: (side1: number, side2: number, adjoining: boolean) => void;
}

const round = (n: number): number => Math.round(n * 100) / 100;

export class WidthDialog {
  private root: HTMLElement | null = null;
  private side1!: HTMLInputElement;
  private side2!: HTMLInputElement;
  private total!: HTMLInputElement;
  private adjoin!: HTMLInputElement;
  private request: WidthRequest | null = null;

  private input(): HTMLInputElement {
    const input = element('input', 'fw-v-input');
    input.type = 'number';
    input.min = '0';
    input.max = '10000';
    input.step = '0.5';
    return input;
  }

  private labelled(label: string, control: HTMLElement): HTMLElement {
    const wrap = element('div', 'field');
    wrap.append(element('span', 'field-label', label), control);
    return wrap;
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Width point options');
    root.hidden = true;
    this.side1 = this.input();
    this.side2 = this.input();
    this.total = this.input();
    const check = element('label', 'fw-v-checkrow');
    this.adjoin = element('input', 'fw-v-check');
    this.adjoin.type = 'checkbox';
    check.append(this.adjoin, element('span', '', 'Adjust adjoining width points'));
    const ok = element('button', 'fw-v-btn', 'OK');
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', 'Cancel');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    const fields = element('div', 'fw-v-row');
    fields.append(this.labelled('Side 1', this.side1), this.labelled('Side 2', this.side2));
    root.append(element('div', 'fw-v-summary', 'Width point options'), fields, this.labelled('Total width', this.total), check, actions);
    const read = (input: HTMLInputElement): number => { const n = parseFloat(input.value); return Number.isFinite(n) ? Math.max(0, Math.min(10000, n)) : 0; };
    const sync = (): void => { this.total.value = String(round(read(this.side1) + read(this.side2))); };
    this.side1.addEventListener('input', sync);
    this.side2.addEventListener('input', sync);
    this.total.addEventListener('input', () => {
      const old = read(this.side1) + read(this.side2), next = read(this.total);
      if (old > 1e-6) { this.side1.value = String(round((read(this.side1) / old) * next)); this.side2.value = String(round((read(this.side2) / old) * next)); }
      else { this.side1.value = String(round(next / 2)); this.side2.value = String(round(next / 2)); }
    });
    const submit = (): void => {
      const request = this.request;
      this.close();
      request?.apply(read(this.side1), read(this.side2), this.adjoin.checked);
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

  open(request: WidthRequest): void {
    const root = this.root ?? (this.root = this.build());
    this.request = request;
    this.side1.value = String(round(request.side1));
    this.side2.value = String(round(request.side2));
    this.total.value = String(round(request.side1 + request.side2));
    this.adjoin.checked = false;
    root.hidden = false;
    this.side1.focus();
    this.side1.select();
  }

  close(): void {
    this.request = null;
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }

  isOpen(): boolean { return !!this.root && !this.root.hidden; }
}
