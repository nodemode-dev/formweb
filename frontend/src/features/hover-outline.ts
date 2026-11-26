import { subscribe } from '../api';
import type { CommandDef } from '../ui/shell';
import '../styles/hover-outline.css';

export interface HoverOutlineHost {
  frame: HTMLIFrameElement;
  loaded: () => Promise<void>;
  list: HTMLElement;
  ready: () => boolean;
  editing: () => boolean;
  busy: () => boolean;
  root: () => string;
  selectionIds: () => string[];
  status: (message: string) => void;
}

const KEY = 'formweb.canvas.hover-outline';
const ATTR = 'data-fw-hover';
const IDLE = `html:not([data-fw-dragging]):not([data-fw-holding]) [${ATTR}]:not([data-fw-selected]):not([data-fw-marked]):not([data-fw-lifted]):not(body>*)`;
const CANVAS_RULE = `${IDLE},${IDLE}>[data-fw-poster=script]{outline:1px solid #f97316b3!important;outline-offset:1px}`;

function remembered(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

function remember(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { }
}

export function installHoverOutline(host: HoverOutlineHost): CommandDef[] {
  let on = remembered();
  let doc: Document | null = null;
  let shown = '';
  let shownRoot = '';
  let element: HTMLElement | null = null;
  let row: HTMLElement | null = null;
  let wanted = '';
  let frame = 0;

  const clear = (): void => {
    wanted = '';
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    paint('');
  };

  const blocked = (): boolean => {
    if (!on || !doc || !host.ready() || !host.editing() || host.busy()) return true;
    const html = doc.documentElement;
    if (html.hasAttribute('data-fw-dragging') || html.hasAttribute('data-fw-holding')) return true;
    if (doc.querySelector('[contenteditable="true"]')) return true;
    const body = document.body.classList;
    if (body.contains('fw-row-dragging') || body.contains('fw-row-holding') || body.contains('fw-canvas-dragging')) return true;
    return !!document.querySelector('.fw-menu:not([hidden])');
  };

  const canvasNode = (id: string): HTMLElement | null => {
    if (!doc) return null;
    for (const node of doc.querySelectorAll<HTMLElement>(`[data-fw-id="${CSS.escape(id)}"]`)) {
      if (node.getClientRects().length || node.querySelector(':scope>[data-fw-poster=script]')?.getClientRects().length) return node;
    }
    return null;
  };

  const layerRow = (id: string): HTMLElement | null => {
    for (const child of host.list.children) if ((child as HTMLElement).dataset.key === id) return child as HTMLElement;
    return null;
  };

  function paint(key: string): void {
    if (key === shown) return;
    element?.removeAttribute(ATTR);
    row?.removeAttribute(ATTR);
    element = row = null;
    shown = key;
    if (!key) return;
    shownRoot = host.root();
    const at = key.indexOf(':');
    const id = key.slice(at + 1);
    element = canvasNode(id);
    element?.setAttribute(ATTR, '');
    if (key.startsWith('canvas:')) { row = layerRow(id); row?.setAttribute(ATTR, ''); }
  }

  const want = (id: string, from: 'canvas' | 'layers'): void => {
    wanted = id && id !== host.root() && !host.selectionIds().includes(id) ? `${from}:${id}` : '';
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      paint(blocked() ? '' : wanted);
    });
  };

  const mouse = (event: PointerEvent): boolean => event.pointerType === 'mouse';

  host.list.addEventListener('pointermove', event => {
    if (!mouse(event)) { clear(); return; }
    const hit = (event.target as Element | null)?.closest?.<HTMLElement>('.layer-row');
    want(hit && hit.parentElement === host.list ? hit.dataset.key || '' : '', 'layers');
  });
  host.list.addEventListener('pointerleave', clear);
  host.list.addEventListener('pointerdown', clear, true);
  host.list.addEventListener('contextmenu', clear, true);
  new MutationObserver(() => {
    if (!shown) return;
    if (host.root() !== shownRoot || !element?.isConnected || (row && !row.isConnected)) clear();
  }).observe(host.list, { childList: true });
  subscribe(() => { if (shown || wanted) clear(); });
  window.addEventListener('blur', clear);
  document.documentElement.addEventListener('pointerleave', clear);

  void host.loaded().then(() => {
    const at = host.frame.contentDocument;
    if (!at) return;
    doc = at;
    const style = at.createElement('style');
    style.textContent = CANVAS_RULE;
    at.head.append(style);
    at.addEventListener('pointermove', event => {
      if (!mouse(event)) { clear(); return; }
      const hit = (event.target as Element | null)?.closest?.<HTMLElement>('[data-fw-id]');
      want(hit && hit.parentElement !== at.body ? hit.dataset.fwId || '' : '', 'canvas');
    }, { passive: true });
    at.addEventListener('pointerout', event => { if (!event.relatedTarget) clear(); });
    at.addEventListener('pointerdown', clear, true);
    at.addEventListener('dblclick', clear, true);
    at.addEventListener('contextmenu', clear, true);
  });

  const toggle = (): void => {
    on = !on;
    remember(on);
    if (!on) clear();
    host.status(on ? 'Hover outlines are on: pointing at a layer outlines its element on the canvas, and pointing at an element tints its layer.' : 'Hover outlines are off.');
  };
  return [
    { id: 'view.hover-outline', label: 'Show hover outlines', menu: 'View', group: 2, run: toggle, checked: () => on, enabled: host.ready }
  ];
}
