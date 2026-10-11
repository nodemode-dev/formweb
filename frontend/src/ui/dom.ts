export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
export function revealApp(): void {
  if (document.body.classList.contains('app-ready')) return;
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('app-ready')));
}
export function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
export function value(node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, next: string): void {
  if (document.activeElement !== node && node.value !== next) node.value = next;
}
export function keyed<T>(container: HTMLElement, items: T[], key: (item: T) => string, create: (item: T) => HTMLElement, update: (node: HTMLElement, item: T) => void): void {
  const nodes = new Map(Array.from(container.children).map(node => [(node as HTMLElement).dataset.key || '', node as HTMLElement]));
  let previous: HTMLElement | null = null;
  for (const item of items) {
    const id = key(item);
    let node = nodes.get(id);
    if (node) nodes.delete(id);
    else { node = create(item); node.dataset.key = id; }
    update(node, item);
    const position: ChildNode | null = previous ? previous.nextSibling : container.firstChild;
    if (node !== position) container.insertBefore(node, position);
    previous = node;
  }
  nodes.forEach(node => node.remove());
}
export function options(select: HTMLSelectElement, items: { id: string; name: string }[]): void {
  keyed(select, items, item => item.id, () => element('option'), (node, item) => {
    (node as HTMLOptionElement).value = item.id;
    text(node, item.name);
  });
}
