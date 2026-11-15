import { element, keyed, text } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';
import type { Control, InspectorContext } from '../inspector/context';
import type { Icon } from '../../ui/icons';

// A choice whose name is English interface text (en) or a name taken from the site (anything else).
export interface Choice { id: string; name: string; en?: boolean; tag?: string; hidden?: boolean }

export const english = (list: { id: string; name: string }[]): Choice[] => list.map(item => ({ ...item, en: true }));

export function optionsOf(select: HTMLSelectElement, items: Choice[]): void {
  keyed(select, items, item => item.id, () => element('option'), (node, item) => {
    (node as HTMLOptionElement).value = item.id;
    if (item.en) label(node, item.name);
    else text(node, item.name);
  });
}

export function selectOf(ctx: InspectorContext, items: Choice[]): HTMLSelectElement {
  const node = ctx.select([]);
  optionsOf(node, items);
  return node;
}

export function fieldOf(ctx: InspectorContext, name: string, control: Control, full = false): HTMLElement {
  const root = ctx.field('', control, full);
  const caption = root.querySelector<HTMLElement>('.field-label');
  if (caption) label(caption, name);
  return root;
}

export function buttonOf(ctx: InspectorContext, name: string, symbol?: Icon, action?: () => unknown, className = ''): HTMLButtonElement {
  const node = ctx.button('', symbol, action, className);
  const caption = element('span');
  label(caption, name);
  node.append(caption);
  return node;
}

export function iconButtonOf(ctx: InspectorContext, name: string, symbol: Icon, action?: () => unknown, className = ''): HTMLButtonElement {
  const node = ctx.button('', symbol, action, className);
  labelAttr(node, 'title', name);
  labelAttr(node, 'aria-label', name);
  return node;
}

export function inputOf(ctx: InspectorContext, placeholder = '', className = ''): HTMLInputElement {
  const node = ctx.input('', className);
  if (placeholder) labelAttr(node, 'placeholder', placeholder);
  return node;
}

export function noteOf(className: string, name: string, tag: 'p' | 'span' = 'p'): HTMLElement {
  const node = element(tag, className);
  label(node, name);
  return node;
}
