import { element, value } from '../../ui/dom';
import type { EditorState, SiteNode } from '../../types';
import { readMotion, type MotionContext, type MotionKind } from './context';
import { buttonOf, noteOf, optionsOf, type Choice } from './labels';

export type Rec = Record<string, unknown>;
export type Item = Choice;
export interface ActionLists {
  nodes: Item[];
  media: Item[];
  images: Item[];
  inputs: Item[];
  templates: Item[];
  variables: { id: string; type: string }[];
  scripts: Item[];
}

export function pageNodes(next: EditorState, node: SiteNode): Item[] {
  const site = next.site;
  const walk = (root: string): string[] => {
    const seen = new Set<string>();
    const order: string[] = [];
    const stack = [root];
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id) || !site.nodes[id]) continue;
      seen.add(id);
      order.push(id);
      const children = site.nodes[id].children;
      for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
    }
    return order;
  };
  let order: string[] = [];
  for (const page of site.pages) {
    const found = walk(page.root);
    if (found.includes(node.id)) { order = found; break; }
  }
  if (!order.length && site.pages[0]) order = walk(site.pages[0].root);
  return order.map(id => {
    const found = site.nodes[id];
    return { id, name: `${found.name || found.id} (${found.tag})`, tag: found.tag, hidden: 'hidden' in found.attrs };
  });
}

export function pageRoot(next: EditorState, node: SiteNode): string {
  for (const page of next.site.pages) {
    const stack = [page.root];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (id === node.id) return page.root;
      if (seen.has(id) || !next.site.nodes[id]) continue;
      seen.add(id);
      stack.push(...next.site.nodes[id].children);
    }
  }
  return next.site.pages[0]?.root || node.id;
}

export function actionLists(next: EditorState, nodes: Item[]): ActionLists {
  const extension = (next.site.extensions?.variables || {}) as { values?: Record<string, { type?: string }> };
  const values = extension.values || {};
  return {
    nodes,
    media: nodes.filter(item => item.tag === 'video' || item.tag === 'audio'),
    images: nodes.filter(item => item.tag === 'img'),
    inputs: nodes.filter(item => item.tag === 'input' || item.tag === 'textarea' || item.tag === 'select'),
    templates: nodes.filter(item => item.hidden),
    variables: Object.keys(values).sort().map(id => ({ id, type: values[id]?.type || 'text' })),
    scripts: Object.keys(readMotion(next).scripts).sort().map(id => ({ id, name: id }))
  };
}

export function withCurrent(items: Item[], current: string): Item[] {
  return current && !items.some(item => item.id === current) ? [...items, { id: current, name: current }] : items;
}

export function setSelect(select: HTMLSelectElement, items: Choice[], current: string): void {
  optionsOf(select, withCurrent(items as Item[], current));
  value(select, current);
}

export function pick(select: HTMLSelectElement): string {
  return select.value || (select.options[0] ? select.options[0].value : '');
}

export function show(node: HTMLElement, on: boolean): void {
  if (node.hidden === on) node.hidden = !on;
}

export function setChecked(box: HTMLInputElement, on: boolean): void {
  if (document.activeElement !== box && box.checked !== on) box.checked = on;
}

export function setDisabled(control: HTMLButtonElement | HTMLInputElement, off: boolean): void {
  if (control.disabled !== off) control.disabled = off;
}

export function numberInput(ctx: MotionContext, min: number, max: number, step = 1): HTMLInputElement {
  const input = ctx.input();
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

export function readNumber(input: HTMLInputElement, whole = false): number | undefined {
  if (input.value.trim() === '') return undefined;
  let number = Number(input.value);
  if (!Number.isFinite(number)) return undefined;
  const min = Number(input.min);
  const max = Number(input.max);
  if (input.min !== '' && number < min) number = min;
  if (input.max !== '' && number > max) number = max;
  return whole ? Math.round(number) : number;
}

export function setNumber(input: HTMLInputElement, next: unknown): void {
  value(input, typeof next === 'number' ? String(next) : '');
}

export function checkbox(name: string): { wrap: HTMLElement; box: HTMLInputElement } {
  const box = element('input');
  box.type = 'checkbox';
  const wrap = element('label', 'checkbox-field');
  wrap.append(box, noteOf('', name, 'span'));
  return { wrap, box };
}

export function group(): HTMLElement {
  return element('div', 'form-grid full-row');
}

export interface Shell { body: HTMLElement; list: HTMLElement; tools: HTMLElement; show(on: boolean): void }

export function shell(ctx: MotionContext, container: HTMLElement, title: string, hint: string, add: () => void, remove: () => void): Shell {
  const block = ctx.section(container, title, hint);
  const empty = element('div', 'fw-ext-group');
  empty.append(buttonOf(ctx, 'Add', 'plus', add, 'fw-ext-add'));
  const editor = element('div', 'fw-ext-group');
  const body = element('div', 'form-grid');
  const list = element('div', 'fw-font-list');
  const tools = element('div', 'fw-ext-actions');
  const bottom = element('div', 'fw-ext-actions');
  bottom.append(buttonOf(ctx, 'Remove', 'trash', remove));
  editor.append(body, list, tools, bottom);
  editor.hidden = true;
  block.append(empty, editor);
  return {
    body,
    list,
    tools,
    show(on) {
      if (editor.hidden === on) editor.hidden = !on;
      if (empty.hidden !== on) empty.hidden = on;
    }
  };
}

export function saver(ctx: MotionContext, kind: MotionKind, current: () => SiteNode | undefined): (next: unknown) => void {
  return next => {
    const node = current();
    if (node) void ctx.run(() => ctx.set(kind, node.id, next));
  };
}

export function remover(ctx: MotionContext, kind: MotionKind, current: () => SiteNode | undefined): () => void {
  return () => {
    const node = current();
    if (node) void ctx.run(() => ctx.remove(kind, node.id));
  };
}

export function clone<T>(source: T): T {
  return JSON.parse(JSON.stringify(source)) as T;
}
