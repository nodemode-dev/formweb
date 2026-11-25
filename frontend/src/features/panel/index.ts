import type { EditorState, Page, SiteNode } from '../../types';
import type { Command as Batch } from '../sections';
import { commands as registry, formatKeys } from '../../commands/registry';
import type { CommandDef } from '../../ui/shell';
import { anchorOf, menuKeyPressed, showContextMenu, type MenuAnchor, type MenuEntry } from '../../ui/context-menu';
import { copyOfPage, homeCommands, stepPageCommands } from './pages';
import { startRename } from './rename';
import '../../styles/panel.css';

export interface PanelHost {
  state: () => EditorState;
  ready: () => boolean;
  command: (name: string, params: Record<string, unknown>) => Promise<EditorState>;
  commands: (list: Batch[]) => Promise<EditorState>;
  pageId: () => string;
  openPage: (id: string) => void;
  selected: () => string;
  select: (id: string) => void;
  status: (message: string, error?: boolean) => void;
  run: (action: () => unknown) => Promise<void>;
  overlay: HTMLElement;
  pagesList: HTMLElement;
  layersList: HTMLElement;
  pageSettings: () => void;
  elementSettings: () => void;
}

const KEY_RENAME = 'F2';
const KEY_UP = 'Alt+Up';
const KEY_DOWN = 'Alt+Down';

export function invoke(id: string, params?: Record<string, unknown>): void {
  const command = registry.get(id);
  if (!command) return;
  void registry.execute(() => command.run(params));
  registry.onRun?.(command, registry.label(command));
}

export function installPanel(host: PanelHost) {
  const site = () => host.state().site;
  const pageOf = (params?: Record<string, unknown>): Page | undefined => {
    const id = typeof params?.id === 'string' ? params.id : host.pageId();
    return site().pages.find(page => page.id === id);
  };
  const nodeOf = (params?: Record<string, unknown>): SiteNode | undefined => site().nodes[typeof params?.id === 'string' ? params.id : host.selected()];
  const parentOf = (id: string): SiteNode | undefined => Object.values(site().nodes).find(node => node.children.includes(id));
  const nameOf = (params?: Record<string, unknown>): string | null => typeof params?.name === 'string' ? params.name.trim() : null;
  const focusField = (key: string): void => document.querySelector<HTMLInputElement>(`[data-field="${key}"]`)?.focus();

  const rowIn = (list: HTMLElement, id: string): HTMLElement | undefined =>
    Array.from(list.children).find(row => (row as HTMLElement).dataset.key === id && (row as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
  function inPlace(row: HTMLElement | undefined, current: string, english: string, commit: (name: string) => Promise<unknown>): boolean {
    if (!row) return false;
    startRename(row, { host: host.overlay, current, refuse: () => host.status(english, true), commit: name => void host.run(() => commit(name)) });
    return true;
  }
  async function renamePage(params?: Record<string, unknown>): Promise<void> {
    const page = pageOf(params);
    if (!page) return;
    const name = nameOf(params);
    const write = (next: string): Promise<unknown> => host.command('page.update', { id: page.id, patch: { name: next } });
    if (name === null) {
      if (!inPlace(rowIn(host.pagesList, page.id), page.name, 'A page needs a name.', write)) { host.openPage(page.id); host.pageSettings(); focusField('page.name'); }
      return;
    }
    if (!name) { host.status('A page needs a name.', true); return; }
    if (name !== page.name) await write(name);
  }
  async function renameLayer(params?: Record<string, unknown>): Promise<void> {
    const node = nodeOf(params);
    if (!node) return;
    const name = nameOf(params);
    const write = (next: string): Promise<unknown> => host.command('node.update', { id: node.id, patch: { name: next } });
    if (name === null) {
      if (host.selected() !== node.id) host.select(node.id);
      if (!inPlace(rowIn(host.layersList, node.id), node.name, 'An element needs a name.', write)) { host.elementSettings(); focusField('name'); }
      return;
    }
    if (!name) { host.status('An element needs a name.', true); return; }
    if (name !== node.name) await write(name);
  }
  async function duplicatePage(params?: Record<string, unknown>): Promise<void> {
    const page = pageOf(params);
    if (!page) return;
    const before = new Set(site().pages.map(entry => entry.id));
    const copy = copyOfPage(site(), page);
    const next = await host.command('page.duplicate', { id: page.id, ...copy });
    const made = next.site.pages.find(entry => !before.has(entry.id));
    if (made) host.openPage(made.id);
    host.status(`Page duplicated as "${copy.name}" at ${copy.slug}.`);
  }
  async function batch(list: Batch[], done: string): Promise<void> {
    if (!list.length) return;
    await host.commands(list);
    host.status(done);
  }
  const setHome = (params?: Record<string, unknown>): Promise<void> => {
    const page = pageOf(params);
    return page ? batch(homeCommands(site(), page.id), `"${page.name}" is now the home page.`) : Promise.resolve();
  };
  const stepPage = (step: -1 | 1, params?: Record<string, unknown>): Promise<void> => {
    const page = pageOf(params);
    return page ? batch(stepPageCommands(site(), page.id, step), step < 0 ? 'Page moved up.' : 'Page moved down.') : Promise.resolve();
  };
  const pageIndex = (): number => site().pages.findIndex(page => page.id === host.pageId());
  const idParam = { id: { type: 'string' as const, description: 'Page id; the open page when left out.' } };

  const definitions: CommandDef[] = [
    { id: 'page.open', label: 'Open page', run: params => { const page = pageOf(params); if (page) host.openPage(page.id); }, enabled: host.ready, params: { id: { type: 'string', required: true, description: 'Page id.' } }, description: 'Open a page in the canvas and the layers list.' },
    { id: 'page.rename', label: 'Rename page...', menu: 'Page', group: 4, run: renamePage, enabled: host.ready, params: { ...idParam, name: { type: 'string', description: 'New name; without it the name opens for typing.' } }, mutates: true, description: 'Rename a page (its name in the editor, not its URL slug).' },
    { id: 'page.duplicate', label: 'Duplicate page', menu: 'Page', group: 4, run: duplicatePage, enabled: host.ready, params: idParam, mutates: true, description: 'Copy a page with everything on it under a free name and slug, such as "About copy" at /about-copy, and open the copy. One undo step.' },
    { id: 'page.set-home', label: 'Set as home page', menu: 'Page', group: 4, run: setHome, enabled: () => host.ready() && pageIndex() > 0, params: idParam, mutates: true, description: 'Make a page the home page: it moves to the top of the page list and takes the / address, and the old home page gets an address from its name. One undo step.' },
    { id: 'page.move-up', label: 'Move page up', menu: 'Page', group: 4, run: params => stepPage(-1, params), enabled: () => host.ready() && pageIndex() > 0, params: idParam, mutates: true, description: 'Move a page one place up in the page list. Moving a page to the top makes it the first page, which the editor marks Home.' },
    { id: 'page.move-down', label: 'Move page down', menu: 'Page', group: 4, run: params => stepPage(1, params), enabled: () => host.ready() && pageIndex() < site().pages.length - 1, params: idParam, mutates: true, description: 'Move a page one place down in the page list.' },
    { id: 'layer.rename', label: 'Rename element...', menu: 'Edit', group: 1, run: renameLayer, enabled: host.ready, params: { id: { type: 'string', description: 'Element id; the selected element when left out.' }, name: { type: 'string', description: 'New name; without it the name opens for typing.' } }, mutates: true, description: 'Rename an element in the layers list (its layer name, not its text).' }
  ];

  function pageEntries(id: string): MenuEntry[] {
    const pages = site().pages;
    const at = pages.findIndex(page => page.id === id);
    const target = { id };
    return [
      { id: 'page.open', label: 'Open', enabled: id !== host.pageId(), run: () => invoke('page.open', target) },
      { id: 'page.rename', label: 'Rename', keys: KEY_RENAME, run: () => invoke('page.rename', target) },
      { id: 'page.duplicate', label: 'Duplicate', run: () => invoke('page.duplicate', target) },
      { id: 'page.set-home', label: 'Set as home page', enabled: at > 0, title: at > 0 ? 'Set as home page' : 'This is the home page', run: () => invoke('page.set-home', target) },
      { separator: true },
      { id: 'page.move-up', label: 'Move up', keys: formatKeys(KEY_UP), enabled: at > 0, run: () => invoke('page.move-up', target) },
      { id: 'page.move-down', label: 'Move down', keys: formatKeys(KEY_DOWN), enabled: at < pages.length - 1, run: () => invoke('page.move-down', target) },
      { separator: true },
      { id: 'page.settings', label: 'Page settings', run: () => { host.openPage(id); invoke('page.settings'); } },
      { id: 'page.delete', label: 'Delete...', enabled: pages.length > 1, title: pages.length > 1 ? 'Delete page...' : 'A site keeps at least one page', run: () => { host.openPage(id); invoke('page.delete'); } }
    ];
  }

  function layerEntries(id: string): MenuEntry[] {
    const nodes = site().nodes;
    const parent = parentOf(id);
    const at = parent ? parent.children.indexOf(id) : -1;
    const locked = !!parent?.componentSourceId;
    const movable = !!parent && !locked;
    const removable = !!parent && registry.enabled(registry.get('edit.delete')!);
    return [
      { separator: true },
      { id: 'layer.rename', label: 'Rename', keys: KEY_RENAME, enabled: !!nodes[id], run: () => invoke('layer.rename', { id }) },
      { id: 'edit.delete', label: 'Delete', keys: registry.keyLabel(registry.get('edit.delete')!), enabled: removable, title: removable ? 'Delete element' : 'A page root cannot be deleted', run: () => invoke('edit.delete') },
      { separator: true },
      { id: 'arrange.up', label: 'Move up', keys: formatKeys(KEY_UP), enabled: movable && at > 0, title: locked ? 'Elements inside a linked component instance cannot be moved' : 'Move up', run: () => invoke('arrange.up') },
      { id: 'arrange.down', label: 'Move down', keys: formatKeys(KEY_DOWN), enabled: movable && at < (parent?.children.length ?? 0) - 1, title: locked ? 'Elements inside a linked component instance cannot be moved' : 'Move down', run: () => invoke('arrange.down') }
    ];
  }

  function showPageMenu(anchor: MenuAnchor, row: HTMLElement): void {
    const id = row.dataset.key;
    if (!id || !host.ready()) return;
    showContextMenu(pageEntries(id), anchor, { host: host.overlay, className: 'fw-layer-menu fw-page-menu', run: host.run, returnFocus: row });
  }

  const plainKey = (event: KeyboardEvent, key: string): boolean => event.key === key && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

  function pageRow(row: HTMLElement): void {
    row.addEventListener('contextmenu', event => { event.preventDefault(); showPageMenu(anchorOf(event, row), row); });
    row.addEventListener('dblclick', () => invoke('page.rename', { id: row.dataset.key }));
    row.addEventListener('keydown', event => {
      if (menuKeyPressed(event)) { event.preventDefault(); showPageMenu(row, row); }
      else if (plainKey(event, 'F2')) { event.preventDefault(); invoke('page.rename', { id: row.dataset.key }); }
    });
  }

  function layerRow(row: HTMLElement, menu: (event: KeyboardEvent) => void): void {
    row.addEventListener('dblclick', () => invoke('layer.rename', { id: row.dataset.key }));
    row.addEventListener('keydown', event => {
      if (menuKeyPressed(event)) { event.preventDefault(); menu(event); }
      else if (plainKey(event, 'F2')) { event.preventDefault(); invoke('layer.rename', { id: row.dataset.key }); }
    });
  }

  return { commands: definitions, pageRow, layerRow, layerEntries };
}
