import type { CommandDef } from '../../ui/shell';
import { element } from '../../ui/dom';
import { icon } from '../../ui/icons';
import '../../styles/wishlist.css';
import { buildCms } from './cms';
import type { Tab, WishlistContext } from './kit';
import { buildQuality } from './quality';
import { buildStructure } from './structure';

export type { WishlistContext } from './kit';

export interface Wishlist {
  commands: CommandDef[];
  refresh: () => void;
  open: (tab: string) => void;
}

export function installWishlist(ctx: WishlistContext): Wishlist {
  const host = ctx.host || document.body;
  const panel = element('aside', 'wl-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Creative tools');
  const head = element('div', 'wl-head');
  const close = element('button', 'wl-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close creative tools');
  close.append(icon('close'));
  head.append(element('h2', 'wl-heading', 'Creative tools'), close);
  const strip = element('div', 'wl-tabs');
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Creative tools');
  const body = element('div', 'wl-body');
  panel.append(head, strip, body);
  host.append(panel);

  const tabs: Tab[] = [...buildCms(ctx), ...buildStructure(ctx), ...buildQuality(ctx)];
  const buttons = new Map<string, HTMLButtonElement>();
  let active = tabs[0].id;
  let returnFocus: HTMLElement | null = null;

  for (const tab of tabs) {
    const button = element('button', 'wl-tab', tab.label);
    button.type = 'button';
    button.id = `wl-tab-${tab.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `wl-pane-${tab.id}`);
    button.addEventListener('click', () => show(tab.id));
    strip.append(button);
    buttons.set(tab.id, button);
    tab.element.id = `wl-pane-${tab.id}`;
    tab.element.setAttribute('role', 'tabpanel');
    tab.element.setAttribute('aria-labelledby', button.id);
    body.append(tab.element);
  }

  function show(id: string): void {
    active = id;
    for (const tab of tabs) {
      const on = tab.id === id;
      const button = buttons.get(tab.id) as HTMLButtonElement;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      if (tab.element.hidden === on) tab.element.hidden = !on;
    }
    if (!panel.hidden) tabs.find(tab => tab.id === id)?.refresh();
  }

  strip.addEventListener('keydown', event => {
    const index = tabs.findIndex(tab => tab.id === active);
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    show(target.id);
    buttons.get(target.id)?.focus();
  });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
  close.addEventListener('click', closePanel);

  let watcher = 0;
  let seenSelection = '';
  let seenState: unknown = null;
  function watch(): void {
    window.clearInterval(watcher);
    watcher = window.setInterval(() => {
      let current: unknown = null;
      try { current = ctx.state(); } catch { return; }
      const selection = ctx.selected();
      if (selection === seenSelection && current === seenState) return;
      seenSelection = selection;
      seenState = current;
      tabs.find(tab => tab.id === active)?.refresh();
    }, 150);
  }

  function closePanel(): void {
    if (panel.hidden) return;
    window.clearInterval(watcher);
    panel.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }

  function open(id: string): void {
    if (panel.hidden) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.hidden = false;
    show(tabs.some(tab => tab.id === id) ? id : tabs[0].id);
    seenSelection = ctx.selected();
    try { seenState = ctx.state(); } catch { seenState = null; }
    watch();
    buttons.get(active)?.focus();
  }

  show(active);
  const ready = () => { try { return !!ctx.state(); } catch { return false; } };
  const entry = (id: string, label: string, menu: string, tab: string, group = 4): CommandDef => ({ id: `wishlist.${id}`, label, menu, group, run: () => open(tab), enabled: ready });

  return {
    open,
    refresh() { if (!panel.hidden) tabs.find(tab => tab.id === active)?.refresh(); },
    commands: [
      entry('table', 'Table...', 'Insert', 'table'),
      entry('slider', 'Collection slider...', 'Insert', 'slider'),
      entry('steps', 'Multi-step form...', 'Insert', 'steps'),
      entry('filters', 'List filters and sorting...', 'CMS', 'filters'),
      entry('collections', 'Collection folders and order...', 'CMS', 'collections'),
      entry('validation', 'Form validation and uploads...', 'Page', 'validation'),
      entry('checks', 'Accessibility and semantic checks...', 'Page', 'checks'),
      entry('type', 'Superscript, subscript and baseline shift...', 'Edit', 'type'),
      entry('layout', 'Default layout gap and padding...', 'Arrange', 'layout')
    ]
  };
}
