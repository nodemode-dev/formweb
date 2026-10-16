import { element } from '../ui/dom';
import type { Editor } from './editor';

type Axis = 'average-y' | 'average-x' | 'average';

const CHOICES: { id: Axis; label: string }[] = [{ id: 'average-y', label: 'Horizontal' }, { id: 'average-x', label: 'Vertical' }, { id: 'average', label: 'Both axes' }];

class AverageDialog {
  private root: HTMLElement | null = null;
  private radios = new Map<Axis, HTMLInputElement>();
  private editor: Editor | null = null;

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Average');
    root.hidden = true;
    const choices = element('div', 'fw-v-stack');
    for (const choice of CHOICES) {
      const input = element('input', 'fw-v-check');
      input.type = 'radio';
      input.name = 'fw-average-axis';
      input.value = choice.id;
      this.radios.set(choice.id, input);
      const row = element('label', 'fw-v-checkrow');
      row.append(input, element('span', '', choice.label));
      choices.append(row);
    }
    const ok = element('button', 'fw-v-btn', 'OK');
    ok.type = 'button';
    const cancel = element('button', 'fw-v-btn', 'Cancel');
    cancel.type = 'button';
    const actions = element('div', 'fw-v-row');
    actions.append(ok, cancel);
    root.append(element('div', 'fw-v-summary', 'Average'), element('p', 'fw-v-note', 'Average the selected anchors along the chosen axis'), choices, actions);
    const submit = (): void => {
      const editor = this.editor;
      const picked = CHOICES.find(choice => this.radios.get(choice.id)?.checked)?.id ?? 'average';
      this.close();
      editor?.runPathOp(picked);
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

  open(editor: Editor): void {
    const root = this.root ?? (this.root = this.build());
    this.editor = editor;
    const both = this.radios.get('average');
    if (both) both.checked = true;
    root.hidden = false;
    both?.focus();
  }

  close(): void {
    this.editor = null;
    if (this.root && !this.root.hidden) this.root.hidden = true;
  }
}

const dialog = new AverageDialog();

export function openAverage(editor: Editor): void {
  if (editor.anchors.size < 2) { editor.notify('Select two or more anchors to average.'); return; }
  dialog.open(editor);
}
