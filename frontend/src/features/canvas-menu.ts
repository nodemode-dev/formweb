import { commands, state } from '../api';
import type { CommandDef } from '../ui/shell';
import { t } from '../i18n';
import { canContain } from './panel/drop';
import type { SiteNode } from '../types';

export interface CanvasMenuHost {
  frame: HTMLIFrameElement;
  loaded: Promise<void>;
  overlay: HTMLElement;
  ready(): boolean;
  run(action: () => unknown): Promise<void>;
  status(message: string, error?: boolean): void;
  selected(): string;
  select(id: string): void;
  pageRoot(): string;
  breakpoint(): string;
  canDuplicate(): boolean;
  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;
  duplicate(): Promise<void>;
  inspector(tab: 'design' | 'content'): void;
  field(kind: 'style' | 'attr', key: string): HTMLElement | undefined;
}

type Link = { id: string; label: string; tab: 'design' | 'content'; kind: 'style' | 'attr'; key: string; applies: (node: SiteNode) => boolean };

const VECTOR = new Set(['g', 'path', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'textPath', 'symbol', 'use', 'pattern', 'tspan', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'label', 'li', 'blockquote', 'figcaption', 'strong', 'em', 'small', 'b', 'i', 'summary', 'legend', 'dt', 'dd', 'td', 'th', 'caption', 'code', 'pre', 'time']);
const html = (node: SiteNode): boolean => !VECTOR.has(node.tag);
const LINKS: Link[] = [
  { id: 'inspector.text-style', label: 'Text style', tab: 'design', kind: 'style', key: 'font-size', applies: node => html(node) && node.tag !== 'svg' && (!!node.text || TEXT_TAGS.has(node.tag)) },
  { id: 'inspector.background', label: 'Background', tab: 'design', kind: 'style', key: 'background', applies: node => html(node) && node.tag !== 'img' && node.tag !== 'svg' },
  { id: 'inspector.spacing', label: 'Spacing', tab: 'design', kind: 'style', key: 'padding', applies: node => html(node) && node.tag !== 'svg' },
  { id: 'inspector.size', label: 'Size', tab: 'design', kind: 'style', key: 'width', applies: html },
  { id: 'inspector.link', label: 'Link', tab: 'content', kind: 'attr', key: 'href', applies: node => node.tag === 'a' || 'href' in node.attrs },
  { id: 'inspector.image', label: 'Image source and alt text', tab: 'content', kind: 'attr', key: 'src', applies: node => node.tag === 'img' }
];
const LINKED_MOVE = 'Elements inside a linked component instance cannot be moved';

export function installCanvasMenu(host: CanvasMenuHost): { commands: CommandDef[] } {
  const selectionIds = (): string[] => [host.selected()];
  const site = () => state().site;
  const parentOf = (id: string): SiteNode | undefined => Object.values(site().nodes).find(node => node.children.includes(id));
  const selectedNode = (): SiteNode | undefined => site().nodes[host.selected()];
  const isRoot = (id: string): boolean => site().pages.some(page => page.root === id);

  const doc = (): Document | null => host.frame.contentDocument;
  const elementOf = (id: string): HTMLElement | null => {
    const at = doc();
    if (!at) return null;
    const key = CSS.escape(id);
    return at.querySelector<HTMLElement>(`[data-fw-key="${key}"]`) || at.querySelector<HTMLElement>(`[data-fw-id="${key}"]`);
  };

  function textBlock(id: string): string {
    const node = site().nodes[id];
    if (!node?.text) return 'This element has no text of its own';
    if (node.binding) return 'This text comes from a CMS field';
    if (doc()?.documentElement.lang !== site().defaultLocale) return 'Switch to the default language to edit text on the canvas';
    return elementOf(id) ? '' : 'This element is not on the canvas';
  }
  function editText(target?: Element | null): void {
    const id = host.selected();
    if (textBlock(id)) return;
    const at = target ?? elementOf(id);
    const view = doc()?.defaultView;
    if (!at || !view) return;
    at.scrollIntoView({ block: 'nearest' });
    at.dispatchEvent(new view.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  }

  function wrapBlock(id: string): string {
    if (isRoot(id) || !site().nodes[id]) return 'A page root cannot be wrapped';
    const parent = parentOf(id);
    if (!parent || parent.componentSourceId) return LINKED_MOVE;
    return canContain(site(), parent.id) ? '' : 'Only an element inside a container can be wrapped';
  }
  async function wrap(): Promise<void> {
    const id = host.selected();
    const blocked = wrapBlock(id);
    if (blocked) { host.status(t(blocked), true); return; }
    const parent = parentOf(id)!;
    const ids = selectionIds().filter(each => parent.children.includes(each)).sort((a, b) => parent.children.indexOf(a) - parent.children.indexOf(b));
    const box: SiteNode = { id: `div-${crypto.randomUUID().slice(0, 8)}`, tag: 'div', name: 'Container', text: '', children: [], attrs: {}, styles: {}, breakpoints: {} };
    await commands([
      { command: 'node.add', params: { parent: parent.id, node: box } },
      { command: 'node.move', params: { id: box.id, parent: parent.id, index: parent.children.indexOf(ids[0]) } },
      ...ids.map((each, index) => ({ command: 'node.move', params: { id: each, parent: box.id, index } }))
    ]);
    host.select(box.id);
    host.status(t('Wrapped in a container. The operation is one undo step.'));
  }

  let styleClip: { styles: Record<string, string>; name: string } | null = null;
  const scopeOf = (node: SiteNode): Record<string, string> => host.breakpoint() === 'desktop' ? node.styles : node.breakpoints?.[host.breakpoint()] || {};
  const scopeName = (): string => site().breakpoints.find(each => each.id === host.breakpoint())?.name || host.breakpoint();
  function copyStyles(): void {
    const node = selectedNode();
    if (!node) return;
    styleClip = { styles: { ...scopeOf(node) }, name: node.name };
    host.status(t('Copied {0} styles from {1} ({2}).', [Object.keys(styleClip.styles).length, node.name, scopeName()]));
  }
  async function pasteStyles(): Promise<void> {
    if (!styleClip) return;
    const clip = styleClip.styles;
    const bp = host.breakpoint();
    const batch = selectionIds().map(id => site().nodes[id]).filter((node): node is SiteNode => !!node).flatMap(node => {
      const current = scopeOf(node);
      const patch: Record<string, string | null> = {};
      for (const name of Object.keys(current)) if (!(name in clip)) patch[name] = null;
      for (const [name, content] of Object.entries(clip)) if (current[name] !== content) patch[name] = content;
      if (!Object.keys(patch).length) return [];
      return [{ command: 'node.update', params: { id: node.id, patch: bp === 'desktop' ? { styles: patch } : { breakpoints: { [bp]: patch } } } }];
    });
    if (!batch.length) { host.status(t('The styles are already the same.')); return; }
    await commands(batch);
    host.status(t('Pasted the styles of {0} ({1}). The operation is one undo step.', [styleClip.name, scopeName()]));
  }

  function reveal(link: Link): void {
    host.inspector(link.tab);
    const control = host.field(link.kind, link.key);
    if (!control) return;
    const group = control.closest('.inspector-section');
    if (group?.classList.contains('is-collapsed')) group.querySelector<HTMLElement>('.section-title')?.click();
    requestAnimationFrame(() => {
      control.scrollIntoView({ block: 'nearest' });
      control.focus({ preventScroll: true });
    });
  }

  const notRoot = (): boolean => host.ready() && !!selectedNode() && !isRoot(host.selected());
  const definitions: CommandDef[] = [
    { id: 'edit.text', label: 'Edit text', menu: 'Edit', group: 1, run: () => editText(), enabled: () => host.ready() && !textBlock(host.selected()), description: 'Start editing the selected element\'s text on the canvas, as a double click does; the change is saved when the text loses focus. Only for an element with its own text in the default language that is not bound to a CMS field.' },
    { id: 'edit.select-parent', label: 'Select parent', menu: 'Edit', group: 1, run: () => { const parent = parentOf(host.selected()); if (parent) host.select(parent.id); }, enabled: notRoot, description: 'Select the element that contains the selected one (the page root at the top).' },
    { id: 'edit.wrap', label: 'Wrap in container', menu: 'Arrange', run: wrap, enabled: () => host.ready() && !wrapBlock(host.selected()), mutates: true, description: 'Put the selected element inside a new empty div at its place and select the div. Not for a page root, an element inside a linked component instance or an element whose parent cannot hold elements. One undo step.', when: 'Use when the person wants to group an element so it can be styled or moved as a block.' },
    { id: 'style.copy', label: 'Copy styles', menu: 'Edit', group: 1, run: copyStyles, enabled: () => host.ready() && !!selectedNode(), description: 'Remember the selected element\'s styles for the breakpoint picked in the toolbar (desktop is the base styles, other breakpoints their overrides). Kept in this window only, not in the system clipboard.' },
    { id: 'style.paste', label: 'Paste styles', menu: 'Edit', group: 1, run: pasteStyles, enabled: () => host.ready() && !!styleClip && !!selectedNode(), mutates: true, description: 'Give the selected element exactly the styles remembered by Copy styles, for the breakpoint picked in the toolbar: styles it has that the copy lacks are removed. One undo step.' },
    ...LINKS.map(link => ({ id: link.id, label: `${link.label} settings`, run: () => reveal(link), enabled: () => host.ready() && !!selectedNode() && link.applies(selectedNode()!), description: `Open the right panel on the ${link.tab === 'design' ? 'Design' : 'Content'} tab at the ${link.label} field of the selected element.` }))
  ];
  return { commands: definitions };
}
