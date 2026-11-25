import '../styles/reveal.css';

const FLASH_MS = 2000;
const FIELD_OF: Record<string, string> = { 'seo.title': 'seo.title', 'seo.description': 'seo.description', 'seo.base-url': 'site.baseUrl', 'seo.base-url-404': 'site.baseUrl', 'page.address-case': 'page.slug' };
const flashes = new WeakMap<Element, number>();

export const issueField = (code: string): string | undefined => FIELD_OF[code];

export function rowOf(list: HTMLElement, key: string): HTMLElement | null {
  return list.querySelector<HTMLElement>(`:scope > [data-key="${CSS.escape(key)}"]`);
}

export function scrollNearest(container: HTMLElement, child: Element | null): void {
  if (!child) return;
  const box = container.getBoundingClientRect(), item = child.getBoundingClientRect();
  if (!box.height || !item.height) return;
  if (item.top < box.top) container.scrollTop += item.top - box.top;
  else if (item.bottom > box.bottom) container.scrollTop += Math.min(item.bottom - box.bottom, item.top - box.top);
}

export function flash(node: HTMLElement): void {
  window.clearTimeout(flashes.get(node));
  node.classList.remove('fw-flash');
  void node.offsetWidth;
  node.classList.add('fw-flash');
  flashes.set(node, window.setTimeout(() => node.classList.remove('fw-flash'), FLASH_MS));
}
