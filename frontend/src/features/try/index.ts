import { t } from '../../i18n';
import { mountBar } from './bar';
import { installSegments } from './segments';
import { installChoiceLists } from './choice-list';
import type { LayerFrame, Trial, TrialEnd, TrialOwner, TryKit, TryOptions } from './types';

const STORE = 'formweb.try-choices';
const PASS = new Set(['edit.copy', 'file.save', 'view.search', 'view.try-choices']);
const SURFACE = '.fw-menubar, .fw-menu, .fw-search-pop, [data-cmd]';
const MENU = '.fw-menubar, .fw-menu, .fw-search-pop';
const LANDING_MS = 30000;
const AIMED_MS = 15000;

type Live = { trial: Trial; owner: TrialOwner; node: string; scope: string; base: string; value: string | null; pending: boolean; over: boolean; detached: boolean; end(how: TrialEnd, message?: string): void };

function ended(owner: TrialOwner, how: TrialEnd): void {
  try { owner.ended(how); } catch (error) { console.error(error); }
}

function within(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && !!target.closest(selector);
}

function readOn(): boolean {
  try { return localStorage.getItem(STORE) !== '0'; } catch { return true; }
}

function tabbable(root: Document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
    .filter(node => node.tabIndex >= 0 && !(node as HTMLButtonElement).disabled && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0);
}

export function installTry(options: TryOptions): TryKit {
  let on = readOn();
  let current: Live | null = null;
  const landing = new Set<Live>();
  const lives = new Map<string, string>();
  let liveNode = '';
  let liveScope = '';
  let watching = 0;
  let aimed = 0;
  let said = '';
  let swallowing = false;
  let repeat = false;

  const say = (message: string, error = false): void => {
    said = message;
    options.status(message, error);
  };
  const unsay = (): void => {
    const line = document.querySelector('.status-message');
    if (said && line && line.textContent === said) options.status('');
    said = '';
  };

  const draw = (): void => {
    const frame: LayerFrame = {};
    const add = (node: string, key: string, value: string): void => { (frame[node] ||= {})[key] = value === '' ? null : value; };
    for (const [key, value] of lives) add(liveNode, key, value);
    for (const entry of landing) if (entry.value !== null) add(entry.node, entry.trial.key, entry.value);
    if (current && !current.over && current.value !== null) add(current.node, current.trial.key, current.value);
    options.canvas.setLayer('trial', Object.keys(frame).length ? frame : null);
  };

  const hidden = (entry: Live): boolean => !entry.owner.anchor.isConnected || entry.owner.anchor.getClientRects().length === 0;

  const check = (fromSync: boolean): void => {
    const scope = options.scope();
    const editing = options.editing();
    if (lives.size && (scope !== liveScope || !editing)) lives.clear();
    const entry = current;
    if (entry && entry.pending && (scope !== entry.scope || !editing)) retire();
    else if (entry && !entry.over && !entry.pending) {
      if (fromSync && options.exists && !options.exists(entry.node)) entry.end('dropped', t('The element was changed elsewhere, so the trial was dropped.'));
      else if (scope !== entry.scope || !editing) entry.end('dropped');
      else if (fromSync && options.stored(entry.trial.key) !== entry.base) entry.end('dropped', t('The element was changed elsewhere, so the trial was dropped.'));
      else if (!fromSync && hidden(entry)) entry.trial.revert();
    }
    draw();
  };

  const watch = (): void => {
    if (watching) return;
    const tick = (): void => {
      watching = 0;
      if (!current && !lives.size) return;
      check(false);
      if (current || lives.size) watching = requestAnimationFrame(tick);
    };
    watching = requestAnimationFrame(tick);
  };

  const bar = mountBar(options.overlay, {
    keep: () => { if (current && !current.pending) void current.trial.keep(); },
    revert: () => { if (current && !current.pending) current.trial.revert(); },
    leave: forward => {
      const entry = current;
      if (!entry) return;
      const anchor = entry.owner.anchor;
      if (!forward) { anchor.focus({ preventScroll: true }); return; }
      const inside = [anchor, ...(entry.owner.inside?.() ?? [])];
      const next = tabbable(document).find(node => !bar.element.contains(node) && !inside.some(part => part.contains(node)) && !!(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (next) next.focus();
      else { anchor.focus({ preventScroll: true }); if (!entry.pending) entry.trial.revert(); }
    }
  });

  const shelter = (entry: Live): void => {
    const active = document.activeElement;
    if (active && bar.element.contains(active)) entry.owner.anchor.focus({ preventScroll: true });
  };

  const create = (owner: TrialOwner): Live => {
    const entry: Live = {
      owner,
      node: options.node(),
      scope: options.scope(),
      base: options.stored(owner.key),
      value: null,
      pending: false,
      over: false,
      trial: undefined as unknown as Trial,
      detached: false,
      end(how, message) {
        if (entry.over) return;
        entry.over = true;
        entry.pending = false;
        landing.delete(entry);
        const shown = entry.value !== null;
        if (current === entry) {
          current = null;
          shelter(entry);
          bar.pending(false);
          bar.hide();
        }
        draw();
        if (message && how === 'refused') { said = ''; options.status(message, true); }
        else if (message) say(message);
        else if (how === 'reverted' && shown) say(t('Not kept: {0} is unchanged.', [{ t: owner.label }]));
        else if (how === 'kept') unsay();
        if (!entry.detached) ended(owner, how);
      }
    };
    entry.trial = {
      key: owner.key,
      get pending() { return entry.pending && !entry.detached; },
      get over() { return entry.over || entry.detached; },
      value: () => entry.value ?? options.stored(owner.key),
      put(value: string, name: string) {
        if (entry.over || entry.pending || current !== entry) return;
        entry.value = value;
        draw();
        bar.show(owner, name);
        watch();
      },
      async keep() {
        if (entry.over || entry.pending) return;
        try {
          if (entry.value === null) { entry.end('reverted'); return; }
          if (options.scope() !== entry.scope || options.node() !== entry.node || !options.editing()) { entry.end('dropped'); return; }
          const value = entry.value;
          if (value.trim() === options.stored(owner.key).trim()) { entry.end('reverted'); return; }
          entry.pending = true;
          shelter(entry);
          bar.pending(true);
          const late = setTimeout(() => {
            if (entry.over || !entry.pending) return;
            if (current === entry) retire();
            if (landing.delete(entry)) draw();
          }, LANDING_MS);
          let failure: unknown = null;
          try { await options.setStyle(owner.key, value); } catch (error) { failure = error ?? new Error(t('The change was refused.')); }
          clearTimeout(late);
          if (entry.over) return;
          if (failure) entry.end('refused', failure instanceof Error ? failure.message : String(failure));
          else entry.end('kept');
        } catch (error) {
          console.error(error);
          if (!entry.over) { entry.pending = false; entry.end('dropped'); }
        }
      },
      revert() {
        if (entry.over || entry.pending) return;
        entry.end('reverted');
      }
    };
    return entry;
  };

  const retire = (): void => {
    const entry = current;
    if (!entry) return;
    if (entry.pending) {
      landing.add(entry);
      current = null;
      entry.detached = true;
      shelter(entry);
      bar.pending(false);
      bar.hide();
      ended(entry.owner, 'dropped');
      return;
    }
    entry.trial.revert();
  };

  document.addEventListener('focusin', event => {
    const entry = current;
    if (!entry || entry.over || entry.pending) return;
    const target = event.target as Node | null;
    if (!target || target === document.body || within(target, '.fw-search-pop')) return;
    if (bar.element.contains(target) || entry.owner.anchor.contains(target) || (entry.owner.inside?.() ?? []).some(part => part.contains(target))) return;
    const shown = entry.value !== null;
    entry.trial.revert();
    aimed = shown && within(target, SURFACE) ? performance.now() : 0;
  }, true);

  document.addEventListener('pointerdown', event => { if (aimed && !within(event.target, MENU)) aimed = 0; }, true);
  document.addEventListener('input', event => { if (aimed && !within(event.target, MENU)) aimed = 0; }, true);
  document.addEventListener('keydown', event => {
    repeat = event.repeat;
    const undo = (event.ctrlKey || event.metaKey) && event.code === 'KeyZ';
    if (aimed && !undo && !['Control', 'Meta', 'Shift', 'Alt'].includes(event.key) && !within(event.target, MENU)) aimed = 0;
    if (!undo) swallowing = false;
  }, true);
  document.addEventListener('keyup', event => { if (event.code === 'KeyZ' || event.key === 'Control' || event.key === 'Meta') swallowing = false; }, true);

  document.addEventListener('focusout', event => {
    const entry = current;
    const left = event.target as HTMLElement | null;
    if (!entry || event.relatedTarget || !left) return;
    if (!bar.element.contains(left) && !entry.owner.anchor.contains(left) && !(entry.owner.inside?.() ?? []).some(part => part.contains(left))) return;
    setTimeout(() => {
      if (current !== entry || !document.hasFocus() || (document.activeElement && document.activeElement !== document.body)) return;
      (left.isConnected && left.getClientRects().length && !(left as HTMLButtonElement).disabled ? left : entry.owner.anchor).focus({ preventScroll: true });
    });
  }, true);

  const kit: TryKit = {
    enabled: () => on,
    setEnabled(next: boolean) {
      on = next;
      try { localStorage.setItem(STORE, next ? '1' : '0'); } catch {}
      if (!next && current) { if (current.pending) retire(); else current.end('dropped'); }
    },
    begin(owner: TrialOwner): Trial {
      aimed = 0;
      retire();
      const entry = create(owner);
      current = entry;
      return entry.trial;
    },
    active: () => current?.trial ?? null,
    busy: () => lives.size > 0 || landing.size > 0 || (!!current && current.value !== null),
    live(key: string, value: string | null) {
      if (value === null) {
        if (lives.delete(key)) draw();
        return;
      }
      if (current) retire();
      const scope = options.scope();
      if (scope !== liveScope) lives.clear();
      liveScope = scope;
      liveNode = options.node();
      lives.set(key, value);
      draw();
      watch();
    },
    settled(key: string) {
      if (lives.delete(key)) draw();
    },
    drop() {
      lives.clear();
      if (current?.pending) retire();
      else current?.end('dropped');
      draw();
    },
    intercept(command: string): boolean {
      if (PASS.has(command)) return false;
      const undo = command === 'edit.undo';
      const wasAimed = aimed && performance.now() - aimed < AIMED_MS;
      aimed = 0;
      if (undo && swallowing && repeat) return true;
      swallowing = false;
      const entry = current;
      if (!entry || entry.over || entry.pending) {
        if (undo && wasAimed) { swallowing = true; return true; }
        return false;
      }
      const shown = entry.value !== null;
      entry.trial.revert();
      if (undo && shown) { swallowing = true; return true; }
      return false;
    },
    sync() { check(true); }
  };

  installSegments(kit, options);
  installChoiceLists(kit, options);
  return kit;
}
