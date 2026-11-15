import { labelText, t, type Value } from '../i18n';
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
const UI_FACES = ['400 13px Inter', '500 13px Inter', '600 13px Inter', '400 12px "JetBrains Mono"'];
const FONT_WAIT_MS = 4000;
let uiFaces: Promise<unknown> | null = null;
function loadUiFaces(): Promise<unknown> {
  uiFaces ??= Promise.race([
    Promise.allSettled(UI_FACES.map(face => document.fonts.load(face))),
    new Promise(resolve => setTimeout(resolve, FONT_WAIT_MS)),
  ]);
  return uiFaces;
}
void loadUiFaces();
export function revealApp(): void {
  if (document.body.classList.contains('app-ready')) return;
  void loadUiFaces().then(showApp);
}
function showApp(): void {
  if (document.body.classList.contains('app-ready')) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.add('app-ready');
    const tauri = (window as unknown as { __TAURI__?: { core?: { invoke(command: string): Promise<unknown> } } }).__TAURI__;
    if (!tauri?.core) return;
    requestAnimationFrame(() => {
      try {
        void tauri.core?.invoke('app_ready').catch(() => undefined);
      } catch {
        return;
      }
    });
  }));
}
export function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
export function pieces(node: HTMLElement, parts: readonly string[]): void {
  const kept = parts.filter(Boolean);
  if (node.textContent !== kept.join('')) node.replaceChildren(...kept.map(part => document.createTextNode(part)));
}
export type Piece = string | { en: string; values?: readonly Value[] };
export function labelPieces(node: HTMLElement, parts: readonly Piece[]): void {
  const kept = parts.filter(part => typeof part !== 'string' || part);
  const shown = kept.map(part => typeof part === 'string' ? part : t(part.en, part.values)).join('');
  if (node.textContent === shown) return;
  node.replaceChildren(...kept.map(part => {
    const piece = document.createTextNode('');
    if (typeof part === 'string') piece.data = part; else labelText(piece, part.en, part.values);
    return piece;
  }));
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
