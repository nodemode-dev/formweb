import { label, labelAttr, labelText, type Value } from '../../i18n';
import { element, options } from '../../ui/dom';
import type { Icon } from '../../ui/icons';
import type { Control, InspectorContext } from './context';

export function labeled<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, english: string, values?: readonly Value[]): HTMLElementTagNameMap[K] {
  const node = element(tag, className);
  label(node, english, values);
  return node;
}

export function fieldOf(ctx: InspectorContext, english: string, input: Control, full = false): HTMLElement {
  const wrapper = ctx.field(english, input, full);
  const head = wrapper.querySelector<HTMLElement>('.field-label');
  if (head) label(head, english);
  return wrapper;
}

export function buttonOf(ctx: InspectorContext, english: string, symbol?: Icon, action?: () => unknown, className = ''): HTMLButtonElement {
  const node = ctx.button(english, symbol, action, className);
  const caption = node.lastElementChild;
  if (caption instanceof HTMLElement && caption.tagName === 'SPAN' && !caption.classList.contains('icon')) label(caption, english);
  return node;
}

export type Choice = { id: string; name: string; en?: string; values?: readonly Value[] };

export function selectOf(ctx: InspectorContext, items: Choice[]): HTMLSelectElement {
  const node = ctx.select(items);
  items.forEach((item, index) => { const choice = node.options[index]; if (choice && item.en) label(choice, item.en, item.values); });
  return node;
}

export function optionsOf(select: HTMLSelectElement, items: Choice[]): void {
  options(select, items);
  items.forEach((item, index) => { const choice = select.options[index]; if (choice && item.en) label(choice, item.en, item.values); });
}

export function styleOf(ctx: InspectorContext, container: HTMLElement, english: string, key: string, choices?: string[], full = false): void {
  ctx.addStyle(container, english, key, choices, full);
  const wrapper = container.lastElementChild;
  const first = wrapper?.querySelector('.field-label')?.firstChild;
  if (first instanceof Text) labelText(first, english);
  const reset = wrapper?.querySelector('.fw-reset');
  if (reset) {
    labelAttr(reset, 'title', 'Reset {0} to the inherited value', [{ t: english }]);
    labelAttr(reset, 'aria-label', 'Reset {0} to the inherited value', [{ t: english }]);
  }
}

export function segmentsOf(ctx: InspectorContext, container: HTMLElement, english: string, key: string, choices: [string, string][]): void {
  ctx.addSegments(container, english, key, choices);
  const wrapper = container.lastElementChild;
  const first = wrapper?.querySelector('.field-label')?.firstChild;
  if (first instanceof Text) labelText(first, english);
  const reset = wrapper?.querySelector('.fw-reset');
  if (reset) {
    labelAttr(reset, 'title', 'Reset {0} to the inherited value', [{ t: english }]);
    labelAttr(reset, 'aria-label', 'Reset {0} to the inherited value', [{ t: english }]);
  }
  const group = wrapper?.querySelector('.fw-seg');
  if (!group) return;
  labelAttr(group, 'aria-label', english);
  group.querySelectorAll<HTMLElement>('.fw-seg-btn').forEach((node, index) => {
    const pair = choices[index];
    if (!pair) return;
    label(node, pair[1]);
    labelAttr(node, 'title', '{0}: {1}', [{ t: english }, pair[0]]);
  });
}
