import { t } from '../../i18n';
import type { Trial, TrialOwner, TryKit, TryOptions } from './types';
import '../../styles/try-bar.css';

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const shown = (node: HTMLElement): boolean => node.isConnected && node.getClientRects().length > 0;

function shelter(): void {
  Array.from(document.querySelectorAll<HTMLElement>('.inspector-tabs button.active')).find(shown)?.focus({ preventScroll: true });
}

function installGroup(kit: TryKit, options: TryOptions, key: string, buttons: HTMLButtonElement[]): void {
  const group = buttons[0]?.parentElement;
  if (!group) return;
  group.dataset.ownKeys = '';
  if (!group.hasAttribute('tabindex')) group.tabIndex = -1;
  let trial: Trial | null = null;
  let tried: HTMLButtonElement | null = null;

  const live = (): Trial | null => (trial && !trial.over ? trial : null);
  const mark = (button: HTMLButtonElement | null): void => {
    if (tried && tried !== button) delete tried.dataset.trying;
    tried = button;
    if (button && button.dataset.trying === undefined) button.dataset.trying = '';
    const state = button ? '' : 'unset';
    if (group.dataset.trying !== state) group.dataset.trying = state;
  };
  const unmark = (): void => {
    if (tried) delete tried.dataset.trying;
    tried = null;
    delete group.dataset.trying;
  };

  const start = (): Trial => {
    const owner: TrialOwner = {
      key,
      get label() { return group.getAttribute('aria-label') || key; },
      anchor: group,
      ended() {
        if (trial !== mine) return;
        trial = null;
        unmark();
        if (group.contains(document.activeElement) && !shown(document.activeElement as HTMLElement)) {
          const stay = buttons.find(button => button.getAttribute('aria-pressed') === 'true' && shown(button)) ?? buttons.find(button => !button.disabled && shown(button));
          if (stay) stay.focus({ preventScroll: true }); else shelter();
        }
      }
    };
    const mine = kit.begin(owner);
    trial = mine;
    return mine;
  };

  const put = (button: HTMLButtonElement | null): void => {
    const current = live() ?? start();
    mark(button);
    current.put(button ? button.dataset.value || '' : '', button ? (button.textContent || '').trim() : t('Inherit'));
  };

  const usable = (): HTMLButtonElement[] => buttons.filter(button => !button.disabled && shown(button));

  group.addEventListener('focus', () => {
    const list = usable();
    const next = (tried && list.includes(tried) ? tried : null) ?? list.find(button => button.getAttribute('aria-pressed') === 'true') ?? list[0];
    next?.focus({ preventScroll: true });
  });

  group.addEventListener('click', event => {
    if (!kit.enabled()) return;
    const button = (event.target as Element | null)?.closest?.('button');
    if (!button || !buttons.includes(button as HTMLButtonElement)) return;
    event.stopPropagation();
    event.preventDefault();
    if (live()?.pending || button.disabled) return;
    const value = button.dataset.value || '';
    put(value === options.stored(key) ? null : button as HTMLButtonElement);
  }, true);

  group.addEventListener('keydown', event => {
    if (!kit.enabled() || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = live();
    const step = STEPS[event.key];
    const ends = event.key === 'Home' || event.key === 'End';
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); return; }
    if (current?.pending) {
      if (step || ends || event.key === 'Enter' || event.key === 'Escape' || event.key === ' ' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (step || ends) {
      if (event.shiftKey) return;
      event.preventDefault();
      const list = usable();
      if (!list.length) return;
      const stored = options.stored(key);
      const from = current && tried && list.includes(tried) ? list.indexOf(tried) : list.findIndex(button => button.dataset.value === stored);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1
        : from < 0 ? (step > 0 ? 0 : list.length - 1)
        : Math.max(0, Math.min(list.length - 1, from + step));
      const target = list[next];
      if (!current && target.dataset.value === stored) return;
      if (current && target === tried) return;
      put(target);
      if (document.activeElement !== target) target.focus();
      return;
    }
    if (!current) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void current.keep().catch(() => undefined);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      current.revert();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      const keep = document.querySelector<HTMLElement>('[data-try-bar]:not([hidden])')?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      if (!keep) return;
      event.preventDefault();
      keep.focus({ preventScroll: true });
    }
  });
}

export function installSegments(kit: TryKit, options: TryOptions): void {
  options.segments.forEach((buttons, key) => installGroup(kit, options, key, buttons));
}
