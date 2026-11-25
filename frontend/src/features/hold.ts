export const HOLD_MS = 350;
export const SLOP = 8;

export const isTouch = (event: PointerEvent): boolean => event.pointerType === 'touch';

export function startsDrag(event: PointerEvent): boolean {
  if (event.button !== 0) return false;
  return event.pointerType !== 'pen' || event.buttons === 1;
}

export function buzz(): void {
  try { if (typeof navigator.vibrate === 'function') navigator.vibrate(12); } catch { }
}

export function blockScroll(target: EventTarget, active: () => boolean): void {
  target.addEventListener('touchmove', event => { if (active() && event.cancelable) event.preventDefault(); }, { passive: false });
}

export function hushMenus(views: readonly Window[]): () => void {
  const stop = (event: Event): void => { event.preventDefault(); event.stopImmediatePropagation(); };
  for (const view of views) view.addEventListener('contextmenu', stop, true);
  return () => { for (const view of views) view.removeEventListener('contextmenu', stop, true); };
}

export function swallowClick(views: readonly Window[], within: number): void {
  const stop = (click: Event): void => { click.preventDefault(); click.stopImmediatePropagation(); };
  for (const view of views) {
    view.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => view.removeEventListener('click', stop, { capture: true }), within);
  }
}

export function openMenu(at: Element, x: number, y: number): void {
  const view = at.ownerDocument.defaultView;
  if (!view) return;
  at.dispatchEvent(new view.MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 2, buttons: 0, view }));
}
