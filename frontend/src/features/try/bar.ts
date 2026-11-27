import { element } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';
import { formatKeys } from '../../commands/registry';
import type { TrialOwner, TryBar, TryBarActions } from './types';
import '../../styles/try-bar.css';

const GAP = 6;
const MARGIN = 8;
const WAIT_MS = 300;
const FOCUSABLE = 'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

type Box = { top: number; right: number; bottom: number; left: number };

function button(name: string, keys: string, className: string): HTMLButtonElement {
  const node = element('button', 'fw-try-btn ' + className);
  node.type = 'button';
  const text = element('span', 'fw-try-btn-name');
  label(text, name);
  const key = element('span', 'fw-try-key', formatKeys(keys));
  key.dataset.noI18n = '';
  node.append(text, key);
  return node;
}

function spinner(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'fw-try-wait');
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '12');
  ring.setAttribute('cy', '12');
  ring.setAttribute('r', '8');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'currentColor');
  ring.setAttribute('stroke-width', '2');
  ring.setAttribute('stroke-linecap', 'round');
  ring.setAttribute('stroke-dasharray', '14 40');
  svg.append(ring);
  return svg;
}

function scroller(node: HTMLElement): HTMLElement | null {
  for (let at = node.parentElement; at && at !== document.body; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return at;
  }
  return null;
}

function visible(node: HTMLElement): boolean {
  return node.isConnected && node.getClientRects().length > 0;
}

export function mountBar(overlay: HTMLElement, actions: TryBarActions): TryBar {
  const root = element('div', 'fw-try-bar');
  root.hidden = true;
  root.tabIndex = -1;
  root.dataset.tryBar = '';
  root.dataset.ownKeys = '';
  root.setAttribute('role', 'group');
  labelAttr(root, 'aria-label', 'Trial');
  const text = element('span', 'fw-try-text');
  text.setAttribute('aria-live', 'polite');
  const keep = button('Keep', 'Enter', 'fw-try-keep');
  const revert = button('Revert', 'Escape', 'fw-try-revert');
  keep.querySelector('.fw-try-key')!.append(spinner());
  root.append(text, keep, revert);
  overlay.append(root);

  let owner: TrialOwner | null = null;
  let clip: HTMLElement | null = null;
  let shownName = '';
  let last: Box | null = null;
  let width = 0;
  let frame = 0;
  let waiting = 0;
  let busy = false;

  const boxOf = (node: HTMLElement): Box => {
    const box = node.getBoundingClientRect();
    return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
  };
  const same = (a: Box | null, b: Box): boolean => !!a && a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right;

  const place = (force: boolean): void => {
    if (!owner) return;
    const anchor = boxOf(owner.anchor);
    const size = root.offsetWidth;
    if (!force && same(last, anchor) && size === width) return;
    last = anchor;
    width = size;
    const height = root.offsetHeight;
    const keepClear = { ...anchor };
    for (const node of owner.inside?.() ?? []) {
      if (!visible(node)) continue;
      const box = node.getBoundingClientRect();
      keepClear.top = Math.min(keepClear.top, box.top);
      keepClear.bottom = Math.max(keepClear.bottom, box.bottom);
      keepClear.left = Math.min(keepClear.left, box.left);
      keepClear.right = Math.max(keepClear.right, box.right);
    }
    const below = window.innerHeight - keepClear.bottom - GAP - MARGIN;
    const above = keepClear.top - GAP - MARGIN;
    let top = below >= height || below >= above ? keepClear.bottom + GAP : keepClear.top - GAP - height;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
    if (clip) {
      const view = clip.getBoundingClientRect();
      if (anchor.bottom <= view.top) top = Math.max(top, view.top + GAP);
      else if (anchor.top >= view.bottom) top = Math.min(top, view.bottom - height - GAP);
    }
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - size - MARGIN));
    const x = `${Math.round(left)}px`;
    const y = `${Math.round(top)}px`;
    if (root.style.left !== x) root.style.left = x;
    if (root.style.top !== y) root.style.top = y;
  };

  const follow = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; place(false); });
  };
  const listen = (on: boolean): void => {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('scroll', follow, { capture: true, passive: true } as AddEventListenerOptions);
    window[method]('resize', follow, { passive: true } as AddEventListenerOptions);
  };

  const rescue = (): void => {
    if (!root.contains(document.activeElement)) return;
    const anchor = owner?.anchor;
    const target = !anchor || !visible(anchor) ? null
      : anchor.matches(FOCUSABLE) ? anchor
      : anchor.querySelector<HTMLElement>('[data-trying]:not(:disabled)') ?? anchor.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)') ?? anchor.querySelector<HTMLElement>(FOCUSABLE);
    const tab = target ? null : Array.from(document.querySelectorAll<HTMLElement>('.inspector-tabs button.active')).find(visible);
    (target ?? tab)?.focus({ preventScroll: true });
  };

  const pending = (on: boolean): void => {
    if (busy === on) return;
    busy = on;
    clearTimeout(waiting);
    if (on) {
      if (keep === document.activeElement || revert === document.activeElement) root.focus({ preventScroll: true });
      root.setAttribute('aria-busy', 'true');
      waiting = window.setTimeout(() => root.classList.add('is-waiting'), WAIT_MS);
    } else {
      root.removeAttribute('aria-busy');
      root.classList.remove('is-waiting');
    }
    keep.disabled = on;
    revert.disabled = on;
  };

  const hide = (): void => {
    if (root.hidden) return;
    rescue();
    pending(false);
    root.hidden = true;
    owner = null;
    clip = null;
    last = null;
    shownName = '';
    text.textContent = '';
    listen(false);
    cancelAnimationFrame(frame);
    frame = 0;
  };

  keep.addEventListener('click', () => { if (!busy) actions.keep(); });
  revert.addEventListener('click', () => { if (!busy) actions.revert(); });
  root.addEventListener('keydown', event => {
    if (event.isComposing) return;
    const mods = event.ctrlKey || event.metaKey || event.altKey;
    if (event.key === 'Escape' && !mods) {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) actions.revert();
    } else if (event.key === 'Enter' && !mods) {
      if (event.target !== keep) return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) actions.keep();
    } else if (event.key === 'Tab' && !mods) {
      const forward = !event.shiftKey;
      const at = event.target;
      if (at === root || (forward && at === revert) || (!forward && at === keep)) {
        event.preventDefault();
        event.stopPropagation();
        actions.leave(forward);
      }
    }
  });

  return {
    element: root,
    show(next, name) {
      const again = owner === next && !root.hidden;
      if (!again) {
        owner = next;
        last = null;
        clip = scroller(next.anchor);
        if (root.hidden) {
          root.style.left = '0px';
          root.style.top = '0px';
          root.hidden = false;
          listen(true);
        }
      }
      if (shownName !== name || !again) {
        label(text, 'Trying: {0}', [{ t: name }]);
        shownName = name;
      }
      place(!again);
    },
    pending,
    hide,
    focusKeep() {
      if (root.hidden) return;
      (keep.disabled ? root : keep).focus({ preventScroll: true });
    }
  };
}
