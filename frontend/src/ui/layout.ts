import { element } from './dom';
import { icon, type Icon } from './icons';
import { commandList, runCommand } from './shell';

export interface RailItem { command: string; label: string; icon: Icon; active?: () => boolean }
export type DockState = 'open' | 'collapsed';
export interface LayoutState { rail: 'icons' | 'labels'; left: DockState; right: DockState }
export interface Preset { id: string; label: string; layout: LayoutState; sidebar: string; inspector: string }

export const PRESETS: Preset[] = [
  { id: 'design', label: 'Design', layout: { rail: 'icons', left: 'open', right: 'open' }, sidebar: 'pages', inspector: 'design' },
  { id: 'content', label: 'Content', layout: { rail: 'icons', left: 'open', right: 'open' }, sidebar: 'pages', inspector: 'content' },
  { id: 'build', label: 'Build', layout: { rail: 'labels', left: 'open', right: 'open' }, sidebar: 'insert', inspector: 'design' },
  { id: 'focus', label: 'Focus', layout: { rail: 'icons', left: 'collapsed', right: 'collapsed' }, sidebar: 'pages', inspector: 'design' }
];
const KEY = 'formweb_workspace';

function railButton(item: RailItem, withLabel: boolean): HTMLButtonElement {
  const node = element('button', 'fw-rail-btn');
  node.type = 'button';
  node.dataset.command = item.command;
  node.title = item.label;
  node.setAttribute('aria-label', item.label);
  node.append(icon(item.icon));
  if (withLabel) node.append(element('span', 'fw-rail-label', item.label));
  node.addEventListener('click', () => runCommand(item.command));
  return node;
}

export class Rail {
  readonly element = element('nav', 'fw-rail');
  private buttons: { node: HTMLButtonElement; item: RailItem }[] = [];

  constructor(top: RailItem[], bottom: RailItem[], toggle: RailItem) {
    this.element.setAttribute('aria-label', 'Workspace modes');
    const toggleButton = railButton(toggle, false);
    toggleButton.classList.add('fw-rail-toggle');
    const modes = element('div', 'fw-rail-modes');
    const foot = element('div', 'fw-rail-modes fw-rail-foot');
    for (const item of top) { const node = railButton(item, true); modes.append(node); this.buttons.push({ node, item }); }
    for (const item of bottom) { const node = railButton(item, true); foot.append(node); this.buttons.push({ node, item }); }
    this.element.append(toggleButton, modes, foot);
  }

  refresh(): void {
    const enabled = new Map(commandList().map(item => [item.id, !item.enabled || item.enabled()]));
    for (const { node, item } of this.buttons) {
      const on = !!item.active?.();
      if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
      const disabled = enabled.get(item.command) === false;
      if (node.disabled !== disabled) node.disabled = disabled;
    }
  }
}

export function dockStrip(side: 'left' | 'right', items: RailItem[], expand: RailItem): HTMLElement {
  const strip = element('div', 'fw-dock-strip');
  strip.dataset.side = side;
  const open = railButton(expand, false);
  open.classList.add('fw-strip-expand');
  strip.append(open, ...items.map(item => railButton(item, false)));
  return strip;
}

export function collapseButton(item: RailItem): HTMLButtonElement {
  const node = railButton(item, false);
  node.className = 'fw-dock-collapse';
  return node;
}

export class WorkspaceLayout {
  preset = 'design';
  state: LayoutState = { ...PRESETS[0].layout };
  private saved: Record<string, LayoutState> = {};

  constructor(private workspace: HTMLElement) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { preset?: string; layouts?: Record<string, LayoutState> } | null;
      if (raw?.layouts) this.saved = raw.layouts;
      if (raw?.preset && PRESETS.some(item => item.id === raw.preset)) this.preset = raw.preset;
    } catch {}
    this.state = { ...(this.saved[this.preset] || PRESETS.find(item => item.id === this.preset)!.layout) };
    this.apply();
  }

  presetInfo(): Preset { return PRESETS.find(item => item.id === this.preset) || PRESETS[0]; }

  usePreset(id: string): Preset {
    this.preset = PRESETS.some(item => item.id === id) ? id : 'design';
    this.state = { ...(this.saved[this.preset] || this.presetInfo().layout) };
    this.apply();
    this.persist();
    return this.presetInfo();
  }

  resetPreset(): void { delete this.saved[this.preset]; this.state = { ...this.presetInfo().layout }; this.apply(); this.persist(); }

  set(patch: Partial<LayoutState>): void {
    this.state = { ...this.state, ...patch };
    this.saved[this.preset] = { ...this.state };
    this.apply();
    this.persist();
  }

  private apply(): void {
    const data = this.workspace.dataset;
    if (data.rail !== this.state.rail) data.rail = this.state.rail;
    if (data.left !== this.state.left) data.left = this.state.left;
    if (data.right !== this.state.right) data.right = this.state.right;
  }

  private persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify({ preset: this.preset, layouts: this.saved })); } catch {}
  }
}
