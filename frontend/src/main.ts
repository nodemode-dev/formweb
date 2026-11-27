import { accept, apiBase, command, commands, connect, download, libraryMutate, mutateVia, readReference, reconnect, replace, request, requestBlob, state, subscribe, upload } from './api';
import type { AuditIssue, Collection, EditorState, Page, SiteNode } from './types';
import { Canvas } from './ui/canvas';
import { element, keyed, options, pieces, revealApp, text, value } from './ui/dom';
import { icon, type Icon } from './ui/icons';
import { THEMES, applyTheme, readChoice, setTheme } from './ui/themes';
import { BRAND_MARK, CommandSearch, Menubar, exposeToAgents, registerCommands, runCommand, setRunner } from './ui/shell';
import { commands as commandRegistry } from './commands/registry';
import { NativeMenus, desktopMac, menusInWindow, setMenusInWindow, wantsNativeMenus } from './ui/native-menu';
import { menuModel } from './ui/menus';
import { installKeymap } from './commands/keymap';
import { startCatalogue } from './commands/catalogue';
import { PRESETS, Rail, WorkspaceLayout, collapseButton, dockStrip } from './ui/layout';
import { HomeScreen, homePref, setHomePref } from './ui/home';
import { RECENT_MAX } from './ui/home-files';
import { demoCommands, openDemo, type DemoHooks } from './ui/demos';
import { DemoPreview } from './ui/demo-preview';
import { unsavedWork } from './ui/unsaved';
import { watchOpenedFiles } from './ui/opened-file';
import { Notice } from './ui/notice';
import { deliver, isBusy } from './ui/downloads';
import { flash, issueField, rowOf, scrollNearest } from './ui/reveal';
import { FeatureStudio } from './features/studio';
import { RuntimePreview } from './features/runtime-preview';
import { FullPreview } from './features/full-preview';
import { AgentConnect } from './features/agent-connect';
import { Dock } from './dock/dock';
import './dock/dock.css';
import { formwebDock } from './dock-adapter';
import { BrandKit, readBrand, type BrandEntry, type BrandReport } from './features/brand-kit';
import { TeamLibraries, type TeamLibrary, type TeamLibrarySummary } from './features/team-library';
import { BackgroundRemover, type BackgroundStatus } from './features/background-remover';
import { StockLibrary } from './features/stock-library';
import { AiWriter, SiteGenerator } from './features/ai-writer';
import { installVector } from './vector';
import { installWishlist } from './features/wishlist';
import { SECTIONS, STARTERS, STARTER_SITES, sectionCommands, type Command } from './features/sections';
import { starterStyles } from './features/starter-elements';
import { installInspector } from './features/inspector';
import { installPageBackground, startChoices, startCommands } from './features/inspector/page-background';
import { installCanvasMenu } from './features/canvas-menu';
import { installInspectorSearch, sectionId } from './features/inspector/search';
import { installControls } from './features/inspector/controls';
import { installTry } from './features/try';
import { installLibrary } from './features/library';
import { convertSections, installConvert } from './features/convert';
import { installInsertFlyout } from './features/panel/insert-flyout';
import { installCrumbs } from './features/crumbs';
import { watchFit } from './ui/fit';
import { anchorOf, ctrlClickOffMac, showContextMenu, type MenuEntry } from './ui/context-menu';
import { installPanel } from './features/panel';
import { canvasClick, installSelection, isMulti, isSelected, layerClick, topMost, pageClick, paintLayerRow, paintPageRow, selectedIds, selectedPageIds, selectNodes } from './features/selection';
import { anyCopyable, anyRemovable, canStep, copySelected, countLabel, cutSelected, deletePagesNote, deleteSelectedPages, duplicateSelected, holdsMany, installSelectionActions, pasteMany, removeSelected, selectionNote, selectionTitle, stepSelected } from './features/selection-actions';
import { installCanvasDrag } from './features/canvas-drag';
import { installHoverOutline } from './features/hover-outline';
import { installSelectMode, paintSelectMode } from './features/select-mode';
import { sectionToggle } from './features/panel/fold';
import { watchHelp } from './ui/help-fit';
import { installDecorativeImage } from './features/decorative-image';
import { installPageSlug } from './features/page-slug';
import { installScriptPanes, isPageScript, layerGlyph, paintGlyph } from './features/inspector/script-note';
import { isLang, label, labelAttr, labelText, language, languages, onLanguage, setLanguage, startLanguage, startPageTranslator, t } from './i18n';
import './styles/features.css';
import './styles/stage-head.css';
import './styles/lang-stable.css';

await startLanguage();

const app = document.querySelector<HTMLElement>('#app')!;
const overlay = document.querySelector<HTMLElement>('#overlay-root')!;
const notice = new Notice(overlay, action => run(action));
const importer = document.querySelector<HTMLInputElement>('#project-import')!;
const mediaInput = element('input');
mediaInput.type = 'file';
mediaInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
mediaInput.hidden = true;
document.body.append(mediaInput);
let selectedId = 'headline';
let pageId = 'home';
let breakpoint = 'desktop';
let locale = 'en';
let preview = false;
let agentsEnabled = false;
let activeInspector = 'design';
let activeSidebar = 'pages';
let collectionId = '';
let localeEditing = 'en';
let lastFocus: HTMLElement | null = null;
let dialogMode = '';
let lastState: EditorState | undefined;
const widths: Record<string, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const inspectorFields = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
const styleFields = new Map<string, HTMLInputElement | HTMLSelectElement>();
const segmentFields = new Map<string, HTMLButtonElement[]>();
const resetButtons = new Map<string, HTMLButtonElement>();
const attrsFields = new Map<string, HTMLInputElement>();

function button(label: string, symbol?: Icon, action?: () => unknown, className = ''): HTMLButtonElement {
  const node = element('button', className);
  node.type = 'button';
  if (symbol) node.append(icon(symbol));
  if (label) node.append(element('span', '', label));
  if (action) node.addEventListener('click', () => void run(action));
  return node;
}
function iconButton(title: string, symbol: Icon, action?: () => unknown, cmd = ''): HTMLButtonElement {
  const node = button('', symbol, action, 'icon-button');
  if (cmd) node.dataset.cmd = cmd;
  node.title = title;
  node.setAttribute('aria-label', title);
  return node;
}
function field(label: string, input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, full = false): HTMLElement {
  const wrapper = element('label', 'field' + (full ? ' full' : ''));
  wrapper.append(element('span', 'field-label', label), input);
  return wrapper;
}
function input(placeholder = '', className = ''): HTMLInputElement {
  const node = element('input', className);
  node.type = 'text';
  node.placeholder = placeholder;
  return node;
}
function select(items: { id: string; name: string }[]): HTMLSelectElement {
  const node = element('select');
  options(node, items);
  return node;
}
const NOTE_BELOW = 16;
function section(container: HTMLElement, title: string, hint = ''): HTMLElement {
  const node = element('section', 'inspector-section');
  node.dataset.section = sectionId(title);
  const head = element('div', 'section-title');
  const name = element('span');
  const chevron = icon('chevron');
  chevron.classList.add('fw-section-chevron');
  const caption = document.createTextNode('');
  labelText(caption, title);
  name.append(chevron, caption);
  head.append(name);
  if (hint) { const note = element('span', 'hint'); label(note, hint); head.append(note); head.classList.toggle('has-note', hint.length > NOTE_BELOW); }
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.dataset.ownKeys = '';
  head.setAttribute('aria-expanded', 'true');
  const toggle = (): void => { const collapsed = node.classList.toggle('is-collapsed'); head.setAttribute('aria-expanded', String(!collapsed)); };
  head.addEventListener('click', event => { if (!(event.target as Element).closest('button, input, select, a')) toggle(); });
  head.addEventListener('keydown', event => { if (event.target === head && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle(); } });
  node.append(head);
  container.append(node);
  return node;
}
function separator(container: HTMLElement): void { container.append(element('div', 'separator')); }
function uuid(prefix: string): string { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
function currentPage(): Page { return state().site.pages.find(page => page.id === pageId) || state().site.pages[0]; }
function currentNode(): SiteNode { return state().site.nodes[selectedId] || state().site.nodes[currentPage().root]; }
function parentOf(id: string): SiteNode | undefined { return Object.values(state().site.nodes).find(node => node.children.includes(id)); }
// Agents read formweb://selection from presence: report the selection while Agents is on (changes, plus a 30 s heartbeat).
let reportedSelection = '';
let reportedAt = 0;
function reportSelection(force = false): void {
  if (!agentsEnabled || !lastState) return;
  if (!force && reportedSelection === selectedId && Date.now() - reportedAt < 30000) return;
  reportedSelection = selectedId;
  reportedAt = Date.now();
  void request('/api/presence', { nodeId: selectedId }).catch(() => undefined);
}
window.setInterval(() => reportSelection(true), 30000);
function selectNode(id: string): void {
  if (!state().site.nodes[id]) return;
  selectedId = id;
  update(state());
}
function pickNode(id: string): void {
  selectNode(id);
  canvas.bring(id);
  scrollNearest(layersList, rowOf(layersList, id));
}
function openPage(id: string): void {
  if (!state().site.pages.some(page => page.id === id)) return;
  pageId = id;
  selectedId = currentPage().root;
  update(state());
}
function pageRowClick(event: MouseEvent, id: string): void { pageClick(event, id); }
function layerRowClick(event: MouseEvent, id: string): void {
  layerClick(event, id);
  if (event.shiftKey || event.ctrlKey || event.metaKey) return;
  canvas.bring(id);
  scrollNearest(layersList, rowOf(layersList, id));
}
function descendants(id: string, found = new Set<string>()): Set<string> {
  if (found.has(id)) return found;
  found.add(id);
  for (const child of state().site.nodes[id]?.children || []) descendants(child, found);
  return found;
}
function insertionParent(): string {
  const node = currentNode();
  return ['main', 'section', 'div', 'article', 'aside', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'li', 'figure'].includes(node.tag) ? node.id : parentOf(node.id)?.id || currentPage().root;
}
let statusActionRun: (() => unknown) | null = null;
function status(parts: string | readonly string[], error = false, action?: { label: string; run: () => unknown }): void {
  const message = typeof parts === 'string' ? parts : parts.filter(Boolean).join('');
  if (typeof parts === 'string') { text(statusMessage, parts); text(dialogStatus, parts); } else { pieces(statusMessage, parts); pieces(dialogStatus, parts); }
  statusMessage.classList.toggle('error', error);
  if (statusMessage.title !== message) statusMessage.title = message;
  if (dialogStatus.title !== message) dialogStatus.title = message;
  dialogStatus.classList.toggle('error', error);
  statusActionRun = action ? action.run : null;
  if (action) text(statusAction, action.label);
  if (statusAction.hidden === !!action) statusAction.hidden = !action;
  if (action) text(dialogStatusAction, action.label);
  if (dialogStatusAction.hidden === !!action) dialogStatusAction.hidden = !action;
}
async function run(action: () => unknown): Promise<void> {
  try { await action(); } catch (error) { status(error instanceof Error ? error.message : String(error), true); }
}
function nodePatch(patch: Record<string, unknown>): Promise<EditorState> { return command('node.update', { id: currentNode().id, patch }); }
function pagePatch(patch: Record<string, unknown>): Promise<EditorState> { return command('page.update', { id: currentPage().id, patch }); }
const BRAND_COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color']);
function setStyle(name: string, content: string): Promise<EditorState> {
  const entered = content.trim();
  // FW-067: with brand restriction on, color and font fields accept brand tokens (or clearing) only.
  if (lastState && readBrand(lastState).restricted && entered && (BRAND_COLOR_PROPS.has(name) || name === 'font-family')
    && !/^var\(--(?:brand|lib)-[a-z0-9-]+\)$/.test(entered) && !['inherit', 'transparent', 'currentcolor', 'none'].includes(entered.toLowerCase())) {
    const field = styleFields.get(name);
    const node = currentNode();
    if (field) field.value = (breakpoint === 'desktop' ? node.styles : node.breakpoints[breakpoint] || {})[name] || '';
    return Promise.reject(new Error('Brand restriction is on: pick a brand or team library value from the list (var(--brand-...) or var(--lib-...)), or ask a project manager to turn it off in Window > Brand kit.'));
  }
  const next = { [name]: entered || null };
  return controlKit.track(name, entered, nodePatch(breakpoint === 'desktop' ? { styles: next } : { breakpoints: { [breakpoint]: next } }));
}
function setAttribute(name: string, content: string): Promise<EditorState> {
  return nodePatch({ attrs: { [name]: content.trim() || null } });
}

const topbar = element('header', 'topbar');
const brand = element('div', 'brand');
brand.innerHTML = BRAND_MARK;
brand.append(element('span', 'brand-name', 'formweb'));
brand.title = 'formweb by nodemode.ai';
const menus = menuModel(commandRegistry);
const menubar = new Menubar(menus, overlay);
const titleTools = element('div', 'fw-title-tools');
const topActions = element('div', 'top-actions');
async function toggleAgents(): Promise<void> {
  const result = await request<{ enabled?: boolean; agentsEnabled?: boolean }>('/api/agents', { enabled: !agentsEnabled });
  agentsEnabled = result.agentsEnabled ?? result.enabled ?? !agentsEnabled;
  updateAgents();
  status(agentsEnabled ? 'Agents on. Outside MCP clients share this site engine.' : 'Agents off. Outside MCP clients are blocked; Claude Code and Chat from this editor still work.');
}
// Not shown in the title bar since v0.4.0: Agent Connect owns the switch. Kept as the agents.toggle command target.
const agentsButton = button('Agents off', 'bolt', toggleAgents, 'quiet');
const previewButton = button('Preview', 'eye', undefined, 'quiet');
previewButton.dataset.cmd = 'view.preview-full';
previewButton.setAttribute('aria-haspopup', 'dialog');
const refreshPreviewButton = iconButton('Refresh live responsive preview', 'redo', undefined, 'view.refresh');
previewButton.title = 'Preview as published';
previewButton.setAttribute('aria-label', previewButton.title);
const publishButton = button('Publish', 'arrow', undefined, 'primary');
publishButton.dataset.cmd = 'file.publish';
topActions.append(previewButton, refreshPreviewButton, publishButton);
const topbarGap = element('div');
topbar.append(brand, menubar.element, topbarGap, titleTools, topActions);
if (document.documentElement.classList.contains('has-overlay-titlebar')) {
  for (const part of [topbar, brand, topbarGap, titleTools, topActions]) part.setAttribute('data-tauri-drag-region', '');
}

const toolbar = element('div', 'toolbar');
const projectIdentity = element('div', 'project-identity');
const projectName = element('span', 'project-name', 'Connecting to site engine');
projectIdentity.append(icon('globe'), projectName);
const undoButton = iconButton('Undo (Ctrl/Cmd+Z)', 'undo', undefined, 'edit.undo');
const redoButton = iconButton('Redo (Ctrl/Cmd+Shift+Z)', 'redo', undefined, 'edit.redo');
undoButton.className = 'fw-tt-btn';
redoButton.className = 'fw-tt-btn';
const commandSearch = new CommandSearch(icon('search'));
const themeButton = button('', 'sun', undefined, 'fw-tt-btn');
themeButton.dataset.cmd = 'view.theme';
themeButton.title = 'Switch light or dark theme';
themeButton.setAttribute('aria-label', themeButton.title);
const settingsButton = button('', 'gear', undefined, 'fw-tt-btn');
settingsButton.dataset.cmd = 'edit.settings';
settingsButton.title = 'Settings';
settingsButton.setAttribute('aria-label', 'Settings');
titleTools.append(undoButton, redoButton, element('span', 'fw-tt-sep'), settingsButton, themeButton, commandSearch.button, commandSearch.popup);
const viewportActions = element('div', 'toolbar-group');
const viewportButtons = new Map<string, HTMLButtonElement>();
for (const [id, symbol] of [['desktop', 'desktop'], ['tablet', 'tablet'], ['mobile', 'mobile']] as [string, Icon][]) {
  const node = iconButton(id[0].toUpperCase() + id.slice(1) + ' breakpoint', symbol, undefined, 'view.' + id);
  viewportButtons.set(id, node);
  viewportActions.append(node);
}
const viewportSize = input('Width');
viewportSize.className = 'viewport-size';
viewportSize.type = 'number';
viewportSize.min = '240';
viewportSize.max = '3840';
viewportSize.setAttribute('aria-label', 'Canvas viewport width in pixels');
viewportSize.addEventListener('change', () => { widths[breakpoint] = Math.min(3840, Math.max(240, Number(viewportSize.value) || 1280)); update(state()); });
const localeSelect = select([{ id: 'en', name: 'EN' }]);
const breakpointSelect = select([{ id: 'desktop', name: 'Desktop' }, { id: 'tablet', name: 'Tablet' }, { id: 'mobile', name: 'Mobile' }]);
breakpointSelect.className = 'toolbar-select';
breakpointSelect.setAttribute('aria-label', 'Responsive breakpoint');
breakpointSelect.addEventListener('change', () => { breakpoint = breakpointSelect.value; update(state()); });
localeSelect.className = 'toolbar-select';
localeSelect.setAttribute('aria-label', 'Canvas locale');
localeSelect.addEventListener('change', () => { locale = localeSelect.value; update(state()); });
const exportButton = button('Export', 'code', undefined, 'quiet');
exportButton.dataset.cmd = 'file.export';
const auditButton = button('Audit', 'check', undefined, 'quiet');
auditButton.dataset.cmd = 'page.audit';
exportButton.title = 'Export';
auditButton.title = 'Audit';
toolbar.append(projectIdentity);
separator(toolbar);
toolbar.append(viewportActions, breakpointSelect, viewportSize, element('span', 'toolbar-label', 'px'), element('div', 'toolbar-spacer'), localeSelect, exportButton, auditButton);

const workspace = element('main', 'workspace');
const sidebar = element('aside', 'sidebar');
sidebar.setAttribute('aria-label', 'Pages and layers');
const sidebarTabs = element('div', 'sidebar-tabs');
const sidebarTitle = element('span', 'fw-panel-title', 'Pages and layers');
sidebarTabs.append(sidebarTitle, collapseButton({ command: 'window.toggle-left', label: 'Collapse left panel', icon: 'chevronsLeft' }));
const pagesPane = element('div');
pagesPane.style.display = 'contents';
const pagesHead = element('div', 'panel-head');
pagesHead.append(element('span', 'eyebrow', 'Pages'), button('', 'plus', () => openDialog('page')));
pagesHead.lastElementChild?.setAttribute('aria-label', 'Add page');
const pagesList = element('div', 'list page-list');
const layersHead = element('div', 'panel-head');
const nodeCount = element('span', 'row-detail');
const layersTitle = element('div', 'control-row');
layersTitle.append(element('span', 'eyebrow', 'Layers'), nodeCount);
const layersAdd = button('', 'plus', () => insertFlyout.toggle(layersAdd));
layersHead.append(layersTitle, layersAdd);
layersHead.lastElementChild?.setAttribute('aria-label', 'Insert element');
const layersList = element('div', 'list layers-scroll');
pagesPane.append(pagesHead, pagesList, layersHead, layersList);
sectionToggle(pagesHead.firstElementChild as HTMLElement, pagesList, 'pages');
sectionToggle(layersTitle.firstElementChild as HTMLElement, layersList, 'layers');
const insertPane = element('div', 'library-scroll');
insertPane.hidden = true;
const insertHead = element('div', 'panel-head');
insertHead.append(element('span', 'eyebrow', 'Elements'));
const insertGrid = element('div', 'insert-grid');
const INSERT_ELEMENTS: [string, Icon, string][] = [['Section', 'box', 'section'], ['Heading', 'text', 'heading'], ['Paragraph', 'text', 'paragraph'], ['Button', 'arrow', 'button'], ['Image', 'image', 'image'], ['Grid', 'grid', 'grid'], ['Form', 'box', 'form'], ['Link', 'globe', 'link'], ['Embed', 'eye', 'embed']];
for (const [label, symbol, kind] of INSERT_ELEMENTS) insertGrid.append(button(label, symbol, () => insertElement(kind), 'insert-card'));
insertGrid.append(button('Video', 'video', () => inspectorExt.insertVideo(), 'insert-card'));
const componentsHead = element('div', 'panel-head');
componentsHead.append(element('span', 'eyebrow', 'Components'));
const componentName = input('Component name');
const captureWrap = element('div', 'sidebar-note');
captureWrap.append(componentName, button('Capture selection', 'component', async () => {
  const name = componentName.value.trim() || currentNode().name;
  await command('component.create', { name, root: currentNode().id });
  status(`Component "${name}" captured. Insert an instance from the list.`);
}));
captureWrap.lastElementChild?.setAttribute('style', 'width:100%;margin-top:var(--space-2)');
const componentList = element('div', 'list');
// Prebuilt sections and starter pages (FW-186): ordinary nodes, one batch and one undo step per insert.
const SECTION_ICONS: Record<string, Icon> = { nav: 'layers', hero: 'text', features: 'grid', testimonial: 'text', pricing: 'grid', faq: 'text', cta: 'arrow', contact: 'box', footer: 'layers' };
const sectionsHead = element('div', 'panel-head');
sectionsHead.append(element('span', 'eyebrow', 'Sections'));
const sectionsGrid = element('div', 'insert-grid');
for (const entry of SECTIONS) {
  const card = button(entry.label, SECTION_ICONS[entry.id] || 'box', () => insertSection(entry.id), 'insert-card');
  card.dataset.section = entry.id;
  sectionsGrid.append(card);
}
const startersHead = element('div', 'panel-head');
startersHead.append(element('span', 'eyebrow', 'Starter pages'));
const startersGrid = element('div', 'insert-grid');
for (const entry of STARTERS) {
  const card = button(entry.label, 'page', () => insertStarter(entry.id), 'insert-card');
  card.dataset.starter = entry.id;
  startersGrid.append(card);
}
async function insertSection(id: string): Promise<void> {
  const root = currentPage().root;
  let anchor = selectedId;
  while (anchor && anchor !== root && parentOf(anchor)?.id !== root) anchor = parentOf(anchor)?.id || '';
  const siblings = state().site.nodes[root].children;
  const index = anchor && anchor !== root && siblings.includes(anchor) ? siblings.indexOf(anchor) + 1 : siblings.length;
  const made = sectionCommands(id, root, uuid);
  if (index < siblings.length) made.commands.push({ command: 'node.move', params: { id: made.root, parent: root, index } });
  await commands(made.commands);
  selectedId = made.root;
  update(state());
}
async function insertStarter(id: string): Promise<void> {
  const starter = STARTERS.find(entry => entry.id === id);
  if (!starter) return;
  const slugs = new Set(state().site.pages.map(page => page.slug));
  let slug = starter.slug;
  for (let n = 2; slugs.has(slug); n++) slug = `${starter.slug}-${n}`;
  const page = uuid('page');
  const root = uuid('page-root');
  const list: Command[] = [{ command: 'page.add', params: { name: starter.label, slug, id: page, root } }];
  for (const section of starter.sections) list.push(...sectionCommands(section, root, uuid).commands);
  await commands(list);
  pageId = page;
  selectedId = root;
  update(state());
}
async function insertComponent(id: string): Promise<void> {
  await command('component.insert', { component: id, parent: insertionParent() });
  status('Component instance inserted.');
}
insertPane.append(insertHead, insertGrid, element('div', 'sidebar-note', 'Elements insert into the selected container. Select a layer or click the canvas to edit it.'), sectionsHead, sectionsGrid, startersHead, startersGrid, element('div', 'sidebar-note', 'Sections insert after the selected section. Starter pages add a new page with its sections. Every insert is one undo step.'), componentsHead, captureWrap, componentList);
const insertFlyout = installInsertFlyout({
  host: overlay,
  groups: () => [
    { id: 'elements', title: 'Elements', items: [...INSERT_ELEMENTS.map(([name, symbol, kind]) => ({ id: kind, label: name, icon: symbol, run: () => insertElement(kind) })), { id: 'video', label: 'Video', icon: 'video' as Icon, run: () => inspectorExt.insertVideo() }] },
    { id: 'sections', title: 'Sections', items: SECTIONS.map(entry => ({ id: entry.id, label: entry.label, icon: SECTION_ICONS[entry.id] || 'box', run: () => insertSection(entry.id) })) },
    { id: 'components', title: 'Components', items: Object.values(state().site.components).map(entry => ({ id: entry.id, label: entry.name, icon: 'component' as Icon, raw: true, run: () => insertComponent(entry.id) })) }
  ],
  openAll: () => setSidebar('insert'),
  run
});
let agentDock: Dock<'antigravity'> | null = null;
const dockHost = formwebDock({
  dock: () => agentDock,
  context: () => `Open page: ${pageId}. Selected element id: ${selectedId}.`,
  notify: (message, error) => status(message, error),
  chordLabel: () => commandRegistry.keyLabel(commandRegistry.get('terminal.toggle')!),
  chatChord: () => commandRegistry.keyLabel(commandRegistry.get('chat.open')!),
  openSettings: () => void runCommand('window.agents'),
  room: () => workspace.clientWidth - rail.element.offsetWidth - sidebar.offsetWidth - inspector.offsetWidth - 360,
  changed: () => { void agentConnect.refresh().catch(() => undefined); }
});
titleTools.prepend(...dockHost.titleButtons(runCommand), element('span', 'fw-tt-sep'));
const agentConnect = new AgentConnect({
  toggleAgents,
  launch: preset => void dockHost.launch(preset),
  notify: (message, error) => status(message, error)
});
const agentsPane = agentConnect.element;
agentsPane.hidden = true;
// Section library (TURN_C_SPEC section 10): inserts land after the selected top-level section, or at the end of the page.
const libraryPanel = installLibrary({
  placement: () => {
    const root = currentPage().root;
    let anchor = selectedId;
    while (anchor && anchor !== root && parentOf(anchor)?.id !== root) anchor = parentOf(anchor)?.id || '';
    const siblings = state().site.nodes[root].children;
    const at = anchor && anchor !== root && siblings.includes(anchor) ? siblings.indexOf(anchor) + 1 : siblings.length;
    return { page: currentPage().id, parent: root, index: at < siblings.length ? at : undefined };
  },
  select: id => { selectNode(id); canvas.bring(id); },
  openPage: id => {
    const page = state().site.pages.find(entry => entry.id === id);
    if (!page) return;
    pageId = page.id;
    selectedId = page.root;
    update(state());
  },
  notify: (message, error) => status(message, error),
  url: path => apiBase + path,
  convert: hosts => convertSections(hosts, true)
});
sidebar.append(sidebarTabs, pagesPane, insertPane, agentsPane, libraryPanel.element);

const stagePanel = element('section', 'stage-panel');
const stageHead = element('div', 'stage-head');
const pageName = element('span', 'stage-page', 'Home');
pageName.dataset.noI18n = '';
const pagePath = element('span', 'stage-path', '/');
const viewportReadout = element('span', 'viewport-readout');
const readoutMode = element('span', 'readout-mode', 'Editing Desktop');
const readoutWidth = element('span', 'readout-width', '1280 px');
viewportReadout.append(readoutMode, readoutWidth);
const viewportHint = element('span', 'viewport-hint', 'Width is outside this breakpoint. Use the live responsive preview to see the switch.');
viewportHint.dataset.on = 'false';
const selectionPath = element('nav', 'fw-crumbs');
selectionPath.setAttribute('aria-label', 'Selection path');
const crumbs = installCrumbs(selectionPath, { host: overlay, pick: id => pickNode(id) });
stageHead.append(icon('page'), pageName, icon('chevron'), pagePath, selectionPath, viewportHint, viewportReadout);
const stage = element('div', 'stage');
stagePanel.append(stageHead, stage);
const canvas = new Canvas(stage, (id, event) => canvasClick(event, id), (id, next) => void run(async () => {
  await command('node.update', { id, patch: { text: next } });
  status('Text updated.');
}));

const inspector = element('aside', 'inspector');
inspector.setAttribute('aria-label', 'Element inspector');
const inspectorIdentity = element('div', 'inspector-identity');
const inspectorLabel = element('div');
const inspectorName = element('div', 'inspector-name', 'Selection');
const inspectorTag = element('div', 'inspector-tag');
inspectorLabel.append(inspectorName, inspectorTag);
inspectorIdentity.append(icon('box'), inspectorLabel, collapseButton({ command: 'window.toggle-right', label: 'Collapse right panel', icon: 'chevronsRight' }));
const inspectorTabs = element('div', 'inspector-tabs');
inspectorTabs.dataset.ownKeys = '';
const inspectorTabButtons = new Map<string, HTMLButtonElement>();
for (const id of ['design', 'motion', 'content', 'page']) {
  const node = button(id[0].toUpperCase() + id.slice(1), undefined, () => setInspector(id), 'quiet');
  inspectorTabButtons.set(id, node);
  inspectorTabs.append(node);
}
const inspectorScroll = element('div', 'inspector-scroll');
const designPane = element('div');
const contentPane = element('div');
const pagePane = element('div');
const motionPane = element('div');
motionPane.hidden = true;
inspectorScroll.append(designPane, motionPane, contentPane, pagePane);
const scriptPanes = installScriptPanes([designPane, motionPane]);
inspector.append(inspectorIdentity, inspectorTabs, inspectorScroll, dockStrip('right', [{ command: 'window.design', label: 'Design', icon: 'sliders' }, { command: 'window.content', label: 'Content', icon: 'text' }, { command: 'page.settings', label: 'Page', icon: 'page' }], { command: 'window.toggle-right', label: 'Expand right panel', icon: 'chevronsLeft' }));
const inspectorSearch = installInspectorSearch({
  after: inspectorTabs, scroll: inspectorScroll, select: setInspector,
  tabs: Object.entries({ design: designPane, motion: motionPane, content: contentPane, page: pagePane }).map(([id, pane]) => ({ id, pane, button: inspectorTabButtons.get(id)! }))
});
const rail = new Rail([
  { command: 'window.layers', label: 'Pages and layers', icon: 'layers', active: () => activeSidebar === 'pages' && layout.state.left === 'open' },
  { command: 'window.insert', label: 'Insert', icon: 'plus', active: () => activeSidebar === 'insert' && layout.state.left === 'open' },
  { command: 'window.library', label: 'Library', icon: 'grid', active: () => activeSidebar === 'library' && layout.state.left === 'open' },
  { command: 'window.tokens', label: 'Design system', icon: 'palette' },
  { command: 'window.brand', label: 'Brand kit', icon: 'image' },
  { command: 'window.team', label: 'Team libraries', icon: 'folder' },
  { command: 'cms.collections', label: 'CMS', icon: 'database' },
  { command: 'cms.locales', label: 'Localization', icon: 'globe' },
  { command: 'window.studio', label: 'Website studio', icon: 'wand' },
  { command: 'page.audit', label: 'SEO and accessibility', icon: 'check' },
  { command: 'file.publish', label: 'Publish', icon: 'upload' },
  { command: 'window.agents', label: 'Agent Connect', icon: 'bolt', active: () => activeSidebar === 'agents' && layout.state.left === 'open' },
  { command: 'view.terminal', label: 'Terminal', icon: 'code', active: () => agentDock?.isOpen() === true }
], [
  { command: 'edit.settings', label: 'Settings', icon: 'gear' }
], { command: 'window.toggle-rail', label: 'Show or hide rail labels', icon: 'chevronsRight' });
workspace.append(rail.element, sidebar, stagePanel, inspector);
const layout = new WorkspaceLayout(workspace);
const openDock = (side: 'left' | 'right'): void => { if (layout.state[side] !== 'open') layout.set({ [side]: 'open' }); };
const toggleLeft = (pane: string): void => {
  if (layout.state.left === 'open' && activeSidebar === pane) layout.set({ left: 'collapsed' });
  else { openDock('left'); setSidebar(pane); }
  agentConnect.setVisible(activeSidebar === 'agents' && layout.state.left === 'open');
  libraryPanel.setVisible(activeSidebar === 'library' && layout.state.left === 'open');
  rail.refresh();
};

const statusbar = element('footer', 'statusbar');
const statusConnection = element('div', 'status-connection');
const statusDot = element('span', 'status-dot offline');
const connectionLabel = element('span', '', 'Connecting to Rust engine');
statusConnection.append(statusDot, connectionLabel);
const statusMessage = element('span', 'status-message', 'Preparing your workspace');
const statusAction = element('button', 'status-action');
statusAction.type = 'button';
statusAction.hidden = true;
statusAction.addEventListener('click', () => { const act = statusActionRun; if (act) void run(act); });
const statusRevision = element('span', 'status-revision', '');
statusbar.append(statusConnection, statusMessage, statusAction, statusRevision);
app.append(topbar, toolbar, workspace, statusbar);
watchFit(app, topbar, inspector, menubar);

function addInspectorInput(container: HTMLElement, label: string, key: string, handler: (next: string) => unknown, choices?: string[], full = false, multiline = false): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const control = choices ? select(choices.map(id => ({ id, name: id || 'None' }))) : multiline ? element('textarea') : input();
  control.setAttribute('data-field', key);
  control.addEventListener('change', () => void run(() => handler(control.value)));
  inspectorFields.set(key, control);
  container.append(field(label, control, full));
  return control;
}
function resetButton(label: string, key: string): HTMLButtonElement {
  const reset = element('button', 'fw-reset', 'Reset');
  reset.type = 'button';
  labelAttr(reset, 'title', 'Reset {0} to the inherited value', [{ t: label }]);
  labelAttr(reset, 'aria-label', 'Reset {0} to the inherited value', [{ t: label }]);
  reset.dataset.reset = key;
  reset.hidden = true;
  reset.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const segments = segmentFields.get(key);
    const control = styleFields.get(key);
    (control ?? segments?.find(node => node.classList.contains('is-on')) ?? segments?.[0])?.focus({ preventScroll: true });
    if (control) control.value = '';
    void run(() => setStyle(key, ''));
  });
  resetButtons.set(key, reset);
  return reset;
}
function addStyle(container: HTMLElement, label: string, key: string, choices?: string[], full = false): void {
  const control = choices ? select(choices.map(id => ({ id, name: id || 'Inherit' }))) : input('Auto / inherit');
  control.setAttribute('data-style', key);
  control.addEventListener('change', () => void run(() => setStyle(key, control.value)));
  styleFields.set(key, control);
  const wrapper = field(label, control, full) as HTMLLabelElement;
  control.id = `fw-style-${key}`;
  wrapper.htmlFor = control.id;
  wrapper.querySelector('.field-label')!.append(resetButton(label, key));
  container.append(wrapper);
}
function addSegments(container: HTMLElement, label: string, key: string, choices: [string, string][]): void {
  const wrapper = element('div', 'field full');
  const head = element('span', 'field-label', label);
  head.append(resetButton(label, key));
  const group = element('div', 'fw-seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  group.dataset.style = key;
  const buttons = choices.map(([choice, name]) => {
    const node = element('button', 'fw-seg-btn', name);
    node.type = 'button';
    node.dataset.value = choice;
    labelAttr(node, 'title', '{0}: {1}', [{ t: label }, choice]);
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => void run(() => setStyle(key, node.classList.contains('is-on') ? '' : choice)));
    group.append(node);
    return node;
  });
  segmentFields.set(key, buttons);
  wrapper.append(head, group);
  container.append(wrapper);
}
const elementSection = section(designPane, 'Element');
const elementGrid = element('div', 'form-grid');
addInspectorInput(elementGrid, 'Name', 'name', name => nodePatch({ name }).then(() => status(t('Renamed to "{0}".', [name]))), undefined, true);
const HTML_TAGS = ['main', 'section', 'div', 'article', 'header', 'footer', 'nav', 'h1', 'h2', 'h3', 'p', 'span', 'a', 'button', 'img', 'form', 'label', 'input', 'textarea', 'ul', 'ol', 'li'];
const SVG_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop', 'use', 'symbol', 'mask']);
const tagSelect = addInspectorInput(elementGrid, 'HTML tag', 'tag', tag => nodePatch({ tag }), HTML_TAGS) as HTMLSelectElement;
const breakpointBadge = element('div', 'field');
breakpointBadge.append(element('span', 'field-label', 'Style scope'));
const scopeLabel = element('span', 'micro', 'Desktop base');
breakpointBadge.append(scopeLabel);
elementGrid.append(breakpointBadge);
elementSection.append(elementGrid);
const layoutSection = section(designPane, 'Layout', 'CSS values');
const layoutGrid = element('div', 'form-grid');
addSegments(layoutGrid, 'Display', 'display', [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid'], ['inline-flex', 'Inline flex'], ['inline-block', 'Inline'], ['none', 'Hidden']]);
addSegments(layoutGrid, 'Direction', 'flex-direction', [['row', 'Row'], ['column', 'Column'], ['row-reverse', 'Row rev.'], ['column-reverse', 'Col. rev.']]);
addSegments(layoutGrid, 'Align', 'align-items', [['stretch', 'Stretch'], ['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['baseline', 'Baseline']]);
addSegments(layoutGrid, 'Justify', 'justify-content', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Between'], ['space-around', 'Around'], ['space-evenly', 'Evenly']]);
addSegments(layoutGrid, 'Wrap', 'flex-wrap', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Reverse']]);
addStyle(layoutGrid, 'Width', 'width');
addStyle(layoutGrid, 'Height', 'height');
addStyle(layoutGrid, 'Gap', 'gap');
addStyle(layoutGrid, 'Padding', 'padding');
addStyle(layoutGrid, 'Grid columns', 'grid-template-columns', undefined, true);
addStyle(layoutGrid, 'Order', 'order');
addStyle(layoutGrid, 'Grid rows', 'grid-template-rows', undefined, true);
addStyle(layoutGrid, 'Grid column', 'grid-column');
addStyle(layoutGrid, 'Grid row', 'grid-row');
addStyle(layoutGrid, 'Align self', 'align-self', ['', 'auto', 'stretch', 'center', 'start', 'end']);
addStyle(layoutGrid, 'Justify self', 'justify-self', ['', 'auto', 'stretch', 'center', 'start', 'end']);
addStyle(layoutGrid, 'Flex', 'flex');
addStyle(layoutGrid, 'Max width', 'max-width');
addStyle(layoutGrid, 'Margin', 'margin');
layoutSection.append(layoutGrid);
const appearanceSection = section(designPane, 'Appearance');
const appearanceGrid = element('div', 'form-grid');
addStyle(appearanceGrid, 'Background', 'background', undefined, true);
addStyle(appearanceGrid, 'Color', 'color');
addStyle(appearanceGrid, 'Radius', 'border-radius');
addStyle(appearanceGrid, 'Border', 'border', undefined, true);
addStyle(appearanceGrid, 'Opacity', 'opacity');
addStyle(appearanceGrid, 'Object fit', 'object-fit', ['', 'cover', 'contain', 'fill']);
addStyle(appearanceGrid, 'Shadow', 'box-shadow', undefined, true);
appearanceSection.append(appearanceGrid);
const typeSection = section(designPane, 'Typography');
const typeGrid = element('div', 'form-grid');
addStyle(typeGrid, 'Font size', 'font-size');
addStyle(typeGrid, 'Weight', 'font-weight', ['', '400', '500', '600', '700', '800', '900']);
addStyle(typeGrid, 'Line height', 'line-height');
addStyle(typeGrid, 'Letter spacing', 'letter-spacing');
addSegments(typeGrid, 'Text alignment', 'text-align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']]);
addStyle(typeGrid, 'Family', 'font-family');
addStyle(typeGrid, 'Capitals', 'font-variant-caps', ['', 'normal', 'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps', 'unicase', 'titling-caps']);
addStyle(typeGrid, 'Kerning', 'font-kerning', ['', 'auto', 'normal', 'none']);
addStyle(typeGrid, 'Ligatures', 'font-variant-ligatures', undefined, true);
addStyle(typeGrid, 'Numbers', 'font-variant-numeric', undefined, true);
typeSection.append(typeGrid);
const positionSection = section(designPane, 'Position');
const positionGrid = element('div', 'form-grid');
addStyle(positionGrid, 'Position', 'position', ['', 'static', 'relative', 'absolute', 'sticky', 'fixed']);
addStyle(positionGrid, 'Overflow', 'overflow', ['', 'visible', 'hidden', 'auto', 'scroll']);
addStyle(positionGrid, 'Top', 'top');
addStyle(positionGrid, 'Left', 'left');
positionSection.append(positionGrid);
const resetOverrides = button('Clear breakpoint overrides', undefined, () => {
  return nodePatch({ breakpoints: { [breakpoint]: null } });
});
positionSection.append(element('div', 'micro', 'Use px, %, rem, CSS functions or var(--token). Empty fields inherit. Tablet and mobile overrides cascade from wider breakpoints.'), resetOverrides);
resetOverrides.style.marginTop = 'var(--space-3)';
resetOverrides.style.width = '100%';

const textSection = section(contentPane, 'Content');
const textGrid = element('div', 'form-grid');
addInspectorInput(textGrid, 'Text', 'text', next => nodePatch({ text: next }), undefined, true, true);
textSection.append(textGrid, element('p', 'micro', 'Double-click text on the canvas to edit the default locale. CMS and translations override base text in preview.'));
// FW-070: suggestions from the language model set in formvis, reviewed before they replace anything.
const aiWriter = new AiWriter({
  suggest: (node, action, tone, brief) => request('/api/ai/copy', { node, action, tone, brief }),
  apply: async (node, text) => { await commands([{ command: 'node.update', params: { id: node, patch: { text } } }]); },
  notify: (message, error) => status(message, error)
});
textSection.append(aiWriter.element);
const attributesSection = section(contentPane, 'HTML attributes');
const attributesGrid = element('div', 'form-grid');
for (const [name, label] of [['href', 'Link URL'], ['src', 'Image / media URL'], ['alt', 'Alternative text'], ['class', 'CSS classes'], ['id', 'HTML ID'], ['name', 'Form field name'], ['placeholder', 'Placeholder'], ['aria-label', 'Accessible label']]) {
  const control = input();
  control.dataset.attr = name;
  control.addEventListener('change', () => void run(() => setAttribute(name, control.value)));
  attrsFields.set(name, control);
  attributesGrid.append(field(label, control, true));
}
const decorativeImage = installDecorativeImage(attrsFields.get('alt')!, next => void run(() => nodePatch({ attrs: { alt: next } })));
// FW-072: shown for image elements only (toggled where the attribute fields refresh).
const removeBackgroundButton = button('Remove background...', 'wand', () => runCommand('image.remove-background'));
removeBackgroundButton.dataset.command = 'image.remove-background';
// FW-071: the round trip to formvis for editing; also image-only.
const editInFormvisButton = button('Edit in formvis', 'image', () => runCommand('image.edit-in-formvis'));
editInFormvisButton.dataset.command = 'image.edit-in-formvis';
const updateFromFormvisButton = button('Update from formvis', 'download', () => runCommand('image.update-from-formvis'));
updateFromFormvisButton.dataset.command = 'image.update-from-formvis';
attributesSection.append(attributesGrid, button('Upload image', 'image', () => {
  mediaInput.dataset.mode = 'replace';
  mediaInput.dataset.target = currentNode().id;
  mediaInput.click();
}), removeBackgroundButton, editInFormvisButton, updateFromFormvisButton);
const bindingSection = section(contentPane, 'CMS binding');
const bindingGrid = element('div', 'form-grid');
const bindingCollection = select([{ id: '', name: 'No collection' }]);
const bindingField = select([{ id: '', name: 'Repeat collection list' }]);
bindingCollection.addEventListener('change', () => void run(async () => {
  if (!bindingCollection.value) await nodePatch({ binding: null });
  else await nodePatch({ binding: { collection: bindingCollection.value } });
}));
bindingField.addEventListener('change', () => void run(() => nodePatch({ binding: { collection: bindingCollection.value, ...(bindingField.value ? { field: bindingField.value } : {}) } })));
bindingGrid.append(field('Collection', bindingCollection, true), field('Field', bindingField, true));
const bindingNote = element('p', 'micro', 'List bindings repeat published items in the canvas and export. Descendant fields use their current item. Image fields bind image sources.');
bindingSection.append(bindingGrid, bindingNote, button('Advanced bindings & queries', undefined, () => featureStudio.open('cms', 'cms-binding')));
// Scroll and pointer effects (FW-185): data-fw-effect and data-fw-effect-speed, run by the exported site's runtime.
const effectSection = section(contentPane, 'Scroll and pointer effect');
const effectKind = select([{ id: '', name: 'None' }, { id: 'parallax', name: 'Parallax' }, { id: 'scroll', name: 'Scroll transform' }, { id: 'mouse', name: 'Mouse parallax' }, { id: 'marquee', name: 'Marquee' }, { id: 'cursor', name: 'Cursor follow' }]);
effectKind.dataset.field = 'effect.kind';
const effectSpeed = input('1');
effectSpeed.type = 'number';
effectSpeed.step = '0.1';
effectSpeed.min = '-5';
effectSpeed.max = '5';
effectSpeed.dataset.field = 'effect.speed';
effectKind.addEventListener('change', () => void run(() => nodePatch({ attrs: { 'data-fw-effect': effectKind.value || null, ...(effectKind.value ? {} : { 'data-fw-effect-speed': null }) } })));
effectSpeed.addEventListener('change', () => void run(() => nodePatch({ attrs: { 'data-fw-effect-speed': effectSpeed.value.trim() || null } })));
const effectGrid = element('div', 'form-grid');
effectGrid.append(field('Effect', effectKind), field('Strength', effectSpeed));
effectSection.append(effectGrid, element('p', 'micro', 'Runs in Preview and on the published site, not on the canvas. Visitors who ask for reduced motion see no movement.'));
const interactionSection = section(contentPane, 'Interaction');
const interactionGrid = element('div', 'form-grid');
const interactionTrigger = select([{ id: 'click', name: 'Click' }, { id: 'hover', name: 'Hover' }, { id: 'scroll', name: 'Scroll into view' }]);
const interactionAction = select([{ id: '', name: 'None' }, { id: 'toggle-class', name: 'Toggle class' }, { id: 'navigate', name: 'Navigate' }, { id: 'fade-in', name: 'Fade in' }]);
const interactionClass = input('active');
const interactionUrl = input('/about');
const interactionDuration = input('500');
interactionDuration.type = 'number';
interactionDuration.min = '0';
interactionDuration.max = '10000';
async function saveInteraction(): Promise<void> {
  const remaining = currentNode().interactions?.slice(1) || [];
  const edited = { trigger: interactionTrigger.value, action: interactionAction.value, className: interactionClass.value || undefined, url: interactionUrl.value || undefined, duration: Number(interactionDuration.value) || 500 };
  await nodePatch({ interactions: interactionAction.value ? [edited, ...remaining] : remaining });
}
for (const control of [interactionTrigger, interactionAction, interactionClass, interactionUrl, interactionDuration]) control.addEventListener('change', () => void run(saveInteraction));
interactionGrid.append(field('Trigger', interactionTrigger), field('Action', interactionAction), field('Class', interactionClass), field('URL', interactionUrl), field('Duration (ms)', interactionDuration));
interactionSection.append(interactionGrid, element('p', 'micro', 'Preview runs the compiled website with forms and interactions. This inspector edits the first legacy action; Studio edits states, conditions, timelines and overlays.'));
const hierarchySection = section(contentPane, 'Hierarchy');
const hierarchyGrid = element('div', 'form-grid');
const parentSelect = select([]);
parentSelect.addEventListener('change', () => void run(() => command('node.move', { id: currentNode().id, parent: parentSelect.value })));
hierarchyGrid.append(field('Parent container', parentSelect, true));
const orderButtons = element('div', 'inspect-actions');
const upButton = button('Move up', undefined, () => moveLayer(-1));
const downButton = button('Move down', undefined, () => moveLayer(1));
orderButtons.append(upButton, downButton);
hierarchySection.append(hierarchyGrid, orderButtons);
orderButtons.style.marginTop = 'var(--space-3)';
const deleteNodeButton = button('Delete element', 'trash', () => command('node.remove', { id: currentNode().id }), 'danger');
deleteNodeButton.style.width = '100%';
deleteNodeButton.style.marginTop = 'var(--space-3)';
hierarchySection.append(deleteNodeButton);

const pageSection = section(pagePane, 'Page settings');
const pageGrid = element('div', 'form-grid');
addInspectorInput(pageGrid, 'Page name', 'page.name', name => pagePatch({ name }), undefined, true);
addInspectorInput(pageGrid, 'URL slug', 'page.slug', slug => pagePatch({ slug }), undefined, true);
pageSection.append(pageGrid);
const pageBackground = installPageBackground({ section: title => section(pagePane, title), input, button, page: currentPage, state: () => lastState, run, status, offer: (message, undo) => { status(message); notice.show(message, { action: { label: 'Undo', run: () => { notice.hide(); return undo(); } } }); }, showPageTab: () => { openDock('right'); setInspector('page'); } });
const seoSection = section(pagePane, 'Search & metadata');
const seoGrid = element('div', 'form-grid');
addInspectorInput(seoGrid, 'Title', 'seo.title', title => pagePatch({ seo: { ...currentPage().seo, title } }), undefined, true);
addInspectorInput(seoGrid, 'Description', 'seo.description', description => pagePatch({ seo: { ...currentPage().seo, description } }), undefined, true, true);
const noindex = element('input');
noindex.type = 'checkbox';
noindex.addEventListener('change', () => void run(() => pagePatch({ seo: { ...currentPage().seo, noindex: noindex.checked } })));
const noindexLabel = element('label', 'checkbox-field');
noindexLabel.append(noindex, element('span', '', 'Hide this page from search engines'));
seoSection.append(seoGrid, noindexLabel, element('p', 'micro', 'Export produces metadata, sitemap.xml and robots.txt. Run Audit for accessibility and SEO issues.'));
// Custom code (FW-178): the code extension group's siteCode and pageCode slots, written into exported pages only.
type CodeSlot = 'head' | 'bodyStart' | 'bodyEnd';
const CODE_SLOTS: CodeSlot[] = ['head', 'bodyStart', 'bodyEnd'];
const codeSection = section(pagePane, 'Custom code');
const codeScope = select([{ id: 'site', name: 'Whole site' }, { id: 'page', name: 'Page' }]);
const codeAreas = CODE_SLOTS.map(slot => {
  const area = element('textarea', 'fw-code-area');
  area.rows = 3;
  area.spellcheck = false;
  area.dataset.field = `code.${slot}`;
  area.addEventListener('change', () => void run(() => saveCustomCode(slot, area.value)));
  return area;
});
codeScope.setAttribute('aria-label', 'Custom code');
codeScope.addEventListener('change', () => fillCustomCode());
const codeGrid = element('div', 'form-grid');
const codeScopeField = element('div', 'field full');
codeScopeField.append(codeScope);
codeGrid.append(codeScopeField, field('<head>', codeAreas[0], true), field('<body>', codeAreas[1], true), field('</body>', codeAreas[2], true));
codeSection.append(codeGrid, element('p', 'micro', 'Written into exported and published pages as typed, site code first. It does not run on the canvas.'));
function codeGroup(): Record<string, unknown> { return { ...((state().site.extensions?.code || {}) as Record<string, unknown>) }; }
function codeSlots(group: Record<string, unknown>): Record<string, string> {
  const slots = codeScope.value === 'site' ? group.siteCode : (group.pageCode as Record<string, unknown> | undefined)?.[currentPage().id];
  return { ...((slots || {}) as Record<string, string>) };
}
function fillCustomCode(): void {
  const slots = codeSlots(codeGroup());
  CODE_SLOTS.forEach((slot, index) => value(codeAreas[index], slots[slot] || ''));
}
function saveCustomCode(slot: CodeSlot, content: string): Promise<EditorState> {
  const group = codeGroup();
  const slots = codeSlots(group);
  if (content.trim()) slots[slot] = content; else delete slots[slot];
  if (codeScope.value === 'site') {
    if (Object.keys(slots).length) group.siteCode = slots; else delete group.siteCode;
  } else {
    const pages = { ...((group.pageCode || {}) as Record<string, unknown>) };
    if (Object.keys(slots).length) pages[currentPage().id] = slots; else delete pages[currentPage().id];
    if (Object.keys(pages).length) group.pageCode = pages; else delete group.pageCode;
  }
  return command('extension.set', { group: 'code', value: group });
}
const passwordSection = section(pagePane, 'Password');
const passwordInput = element('input');
passwordInput.type = 'password';
passwordInput.autocomplete = 'new-password';
passwordInput.placeholder = 'At least 6 characters';
passwordInput.dataset.field = 'page.password';
const passwordState = element('p', 'micro', '');
const passwordRow = element('div', 'fw-favicon-row');
const passwordSet = button('Protect page', 'check', () => runCommand('page.password'));
passwordSet.dataset.command = 'page.password';
const passwordClear = button('Remove', 'trash', () => runCommand('page.password-remove'));
passwordClear.dataset.command = 'page.password-remove';
passwordRow.append(passwordSet, passwordClear);
passwordSection.append(field('Visitors must enter', passwordInput, true), passwordRow, passwordState, element('p', 'micro', 'Enforced when FormWeb serves your published site (Publish, then the /sites or /published link), for this page and pages under its path. A static export cannot protect pages, so export is refused while a password is set. Agents: set_page_password.'));
let passwordGates: string[] = [];
let passwordGatesFor = '';
async function loadPasswordGates(force = false): Promise<void> {
  const siteId = state().site.id;
  if (!force && passwordGatesFor === siteId) return;
  passwordGatesFor = siteId;
  const result = await request<{ gates: { route: string }[] }>('/api/page-passwords');
  passwordGates = result.gates.map(gate => gate.route);
  updatePasswordState();
}
function gateFor(slug: string): string | undefined {
  const route = '/' + slug.replace(/^\/+|\/+$/g, '');
  return passwordGates.filter(gate => gate === '/' || route === gate || route.startsWith(gate + '/')).sort((a, b) => b.length - a.length)[0];
}
function updatePasswordState(): void {
  if (!lastState) return;
  const page = currentPage();
  const gate = gateFor(page.slug);
  const own = gate === '/' + page.slug.replace(/^\/+|\/+$/g, '');
  const home = gateFor('/') !== undefined || page.slug.replace(/^\/+|\/+$/g, '') === '';
  const whole = page.slug.replace(/^\/+|\/+$/g, '') === '';
  text(passwordState, gate ? (whole && own ? 'The whole site is protected (the home page covers every page).' : own ? 'This page and the pages under its path are protected.' : `Protected through ${gate}.`) : whole ? 'Protecting the home page protects the whole site.' : 'Anyone with the link can open this page.');
  passwordClear.disabled = !own;
  text(passwordSet.querySelector('span:last-child') || passwordSet, own ? 'Change password' : whole && home ? 'Protect whole site' : 'Protect page');
}
async function setPagePassword(password: string | null): Promise<void> {
  const route = '/' + currentPage().slug.replace(/^\/+|\/+$/g, '');
  const result = await request<{ gates: { route: string }[] }>('/api/page-passwords', { route, password });
  passwordGates = result.gates.map(gate => gate.route);
  passwordInput.value = '';
  updatePasswordState();
  status(password === null ? `Password removed from ${route}.` : `${route} now asks visitors for a password on your published site.`);
}
const siteSection = section(pagePane, 'Whole site');
const baseUrlGrid = element('div', 'form-grid');
const baseUrlInput = addInspectorInput(baseUrlGrid, 'Base URL', 'site.baseUrl', next => command('site.update', { patch: { settings: { baseUrl: next.trim().replace(/\/+$/, '') || null } } }), undefined, true) as HTMLInputElement;
baseUrlInput.placeholder = 'https://example.com';
const baseUrlHelp = element('p', 'micro', 'The site\'s public address. Canonical links, the sitemap and the root 404.html use it. Agents: site.update with settings.baseUrl.');
const baseUrlTail = element('p', 'micro');
label(baseUrlTail, 'Leave it empty to keep the https://example.com placeholder.');
siteSection.append(baseUrlGrid, baseUrlHelp, baseUrlTail);
function openBaseUrlField(): void {
  openDock('right');
  setInspector('page');
  baseUrlInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  baseUrlInput.focus({ preventScroll: true });
}
const hideScrollbars = element('input');
hideScrollbars.type = 'checkbox';
hideScrollbars.addEventListener('change', () => void run(() => command('site.update', { patch: { settings: { hideScrollbars: hideScrollbars.checked ? 'true' : 'false' } } })));
const hideScrollbarsLabel = element('label', 'checkbox-field');
hideScrollbarsLabel.append(hideScrollbars, element('span', '', 'Hide scrollbars on the published site'));
siteSection.append(hideScrollbarsLabel, element('p', 'micro', 'Visitors can still scroll with wheel, touch and keyboard. Applies to Preview, export and publish. Agents: site.update with settings.hideScrollbars "true" or "false".'));
const embedClick = element('input');
embedClick.type = 'checkbox';
embedClick.dataset.field = 'site.embedClickToLoad';
embedClick.addEventListener('change', () => void run(() => command('site.update', { patch: { settings: { embedClickToLoad: embedClick.checked ? 'true' : 'false' } } })));
const embedClickLabel = element('label', 'checkbox-field');
embedClickLabel.append(embedClick, element('span', '', 'Load embeds only when visitors click'));
siteSection.append(embedClickLabel, element('p', 'micro', 'Videos, music and maps show a Load button and a link instead of contacting YouTube, Vimeo, Spotify or map servers on page load. X posts always work this way.'));
const faviconRow = element('div', 'fw-favicon-row');
faviconRow.style.marginTop = 'var(--space-3)';
const faviconPreview = element('img', 'fw-favicon-preview');
faviconPreview.alt = '';
faviconPreview.width = 24;
faviconPreview.height = 24;
faviconPreview.hidden = true;
const faviconButton = button('Site icon', 'image', () => runCommand('site.favicon'));
faviconButton.dataset.command = 'site.favicon';
const faviconDarkButton = button('Dark icon', 'image', () => runCommand('site.favicon-dark'));
faviconDarkButton.dataset.command = 'site.favicon-dark';
const faviconClear = button('Clear', 'trash', () => runCommand('site.favicon-clear'));
faviconClear.dataset.command = 'site.favicon-clear';
faviconRow.append(faviconPreview, faviconButton, faviconDarkButton, faviconClear);
siteSection.append(faviconRow, element('p', 'micro', 'Square PNG, 180px or larger. Export adds icon, apple-touch-icon and site.webmanifest. Agents: site.update with settings.favicon set to an /api/assets URL.'));
const pageActions = section(pagePane, 'Actions');
pageActions.append(button('Run site audit', 'check', auditSite), button('Delete page', 'trash', () => openDialog('delete-page'), 'danger'));
pageActions.lastElementChild?.setAttribute('style', 'margin-left:var(--space-2)');

const scrim = element('div', 'dialog-scrim');
scrim.hidden = true;
const dialog = element('section', 'dialog');
dialog.setAttribute('role', 'dialog');
dialog.setAttribute('aria-modal', 'true');
dialog.setAttribute('aria-labelledby', 'dialog-title');
const dialogHead = element('div', 'dialog-head');
const dialogTitle = element('span', 'dialog-title');
dialogTitle.id = 'dialog-title';
const dialogClose = button('', 'close', closeDialog);
dialogClose.setAttribute('aria-label', 'Close dialog');
dialogHead.append(dialogTitle, dialogClose);
const dialogBody = element('div', 'dialog-body');
const dialogFooter = element('div', 'dialog-footer');
const dialogStatus = element('span', 'dialog-status');
const dialogCancel = button('Close', undefined, closeDialog);
const dialogPrimary = button('Apply', undefined, () => performDialogAction(), 'primary');
const dialogStatusAction = element('button', 'dialog-status-action');
dialogStatusAction.type = 'button';
dialogStatusAction.hidden = true;
dialogStatusAction.addEventListener('click', () => { const act = statusActionRun; if (act) { closeDialog(); void run(act); } });
dialogFooter.append(dialogStatus, dialogStatusAction, dialogCancel, dialogPrimary);
onLanguage(() => queueMicrotask(() => { const shown = statusMessage.textContent || ''; if (dialogStatus.title !== shown && (dialogStatus.title || shown)) dialogStatus.title = shown; }));
dialog.append(dialogHead, dialogBody, dialogFooter);
scrim.append(dialog);
overlay.append(scrim);
scrim.addEventListener('click', event => { if (event.target === scrim) closeDialog(); });
const panes = new Map<string, HTMLElement>();
function dialogPane(id: string): HTMLElement {
  const pane = element('div');
  pane.hidden = true;
  panes.set(id, pane);
  dialogBody.append(pane);
  return pane;
}

const newPane = dialogPane('new');
const newName = input('My website');
const newStarter = select([{ id: '', name: 'Blank' }, ...STARTER_SITES.map(entry => ({ id: entry.id, name: entry.label }))]);
newStarter.dataset.field = 'new.starter';
newPane.append(element('p', 'empty-note', 'Start a new site in the Rust engine. Save your current project before creating a new one.'), field('Site name', newName), field('Start from', newStarter));
// Starter site (FW-186): one batch after the blank site exists, so a single undo returns to the blank site.
function starterSiteCommands(id: string): { commands: Command[]; first: string } {
  const site = STARTER_SITES.find(entry => entry.id === id);
  if (!site) return { commands: [], first: '' };
  const home = state().site.pages[0];
  const links = site.pages.slice(1).map(page => ({ text: page.name, href: page.slug }));
  const list: Command[] = [{ command: 'page.update', params: { id: home.id, patch: { name: site.pages[0].name } } }];
  site.pages.forEach((page, index) => {
    let root = home.root;
    if (index > 0) {
      root = uuid('page-root');
      list.push({ command: 'page.add', params: { name: page.name, slug: page.slug, id: uuid('page'), root } });
    }
    for (const section of page.sections) list.push(...sectionCommands(section, root, uuid, links).commands);
  });
  return { commands: list, first: home.id };
}
const pageDialogPane = dialogPane('page');
const newPageName = input('About');
const newPageSlug = input('/about');
const newPageGrid = element('div', 'form-grid');
const newPageLook = select([]);
newPageLook.dataset.field = 'page.start-background';
newPageGrid.append(field('Page name', newPageName), field('URL slug', newPageSlug), field('Background', newPageLook, true));
pageDialogPane.append(element('p', 'empty-note', 'Add a page with its own root container, content and metadata.'), newPageGrid);
const pageSlug = installPageSlug(newPageName, newPageSlug, pageDialogPane, () => state().site);
const bulkPane = dialogPane('bulk');
const bulkTemplate = select([]);
const bulkCsv = element('textarea');
bulkCsv.rows = 8;
bulkCsv.spellcheck = false;
bulkCsv.dataset.field = 'bulk.csv';
bulkTemplate.dataset.field = 'bulk.template';
bulkCsv.placeholder = 'slug,name,title,image\n/work/alpha,Alpha,Alpha project,/api/assets/...';
const bulkNote = element('p', 'micro', '');
const bulkGrid = element('div', 'form-grid');
bulkGrid.append(field('Template page', bulkTemplate, true), field('CSV rows (first row is the header)', bulkCsv, true));
bulkPane.append(element('p', 'empty-note', 'Create one page per row by duplicating a template. Write {{column}} in template text, attributes or SEO fields and each page gets that row\'s value. A slug column is required; name is optional. Up to 300 rows, one undo step.'), bulkGrid, bulkNote);
bulkCsv.addEventListener('input', () => { try { const rows = parseCsv(bulkCsv.value); text(bulkNote, `${rows.length} page${rows.length === 1 ? '' : 's'} ready.`); } catch (error) { text(bulkNote, error instanceof Error ? error.message : String(error)); } });
const qrPane = dialogPane('qr');
const qrUrl = input('https://example.com/');
qrUrl.dataset.field = 'qr.url';
const qrFormat = select([{ id: 'png', name: 'PNG image' }, { id: 'svg', name: 'SVG vector' }]);
qrFormat.dataset.field = 'qr.format';
const qrDark = element('input');
qrDark.type = 'color';
qrDark.value = '#000000';
qrDark.dataset.field = 'qr.dark';
const qrLight = element('input');
qrLight.type = 'color';
qrLight.value = '#ffffff';
qrLight.dataset.field = 'qr.light';
const qrGrid = element('div', 'form-grid');
qrGrid.append(field('Page address', qrUrl, true), field('Format', qrFormat), field('Foreground', qrDark), field('Background', qrLight));
qrPane.append(element('p', 'empty-note', 'Generated locally. Uses the published address when you have published in this session; otherwise the local preview address. Keep strong contrast so phones can scan it.'), qrGrid);
const embedPane = dialogPane('embed');
const embedUrl = input('https://www.youtube.com/watch?v=...');
embedUrl.dataset.field = 'embed.url';
const embedNote = element('p', 'micro', '');
embedPane.append(element('p', 'empty-note', 'Paste a share link or a provider\'s embed HTML (FormWeb keeps only its address). Supported: YouTube (privacy-enhanced), Vimeo, Loom, Spotify, Google Maps "Embed a map" links, OpenStreetMap embed links and X posts. The player renders in Preview, export and publish; X posts, and every embed when "Load embeds only when visitors click" is on, show a Load button and a link instead until the visitor chooses.'), field('Media URL', embedUrl, true), embedNote);
embedUrl.addEventListener('paste', () => setTimeout(() => { const src = /<iframe[^>]*\ssrc="([^"]+)"/i.exec(embedUrl.value)?.[1]; if (src) { value(embedUrl, src.replace(/&amp;/g, '&')); embedUrl.dispatchEvent(new Event('input')); } }));
embedUrl.addEventListener('input', () => text(embedNote, embedKind(embedUrl.value) ? `${embedKind(embedUrl.value)} detected.` : embedUrl.value.trim() ? 'Not a supported provider link yet.' : ''));
function embedKind(url: string): string {
  const match = /^https:\/\/(?:www\.|m\.)?([^/]+)\/([^?#]*)/.exec(url.trim());
  if (!match) return '';
  const [, host, path] = match;
  if (/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return 'YouTube video';
  if (/^(player\.)?vimeo\.com$/.test(host)) return 'Vimeo video';
  if (host === 'loom.com' && /^(share|embed)\//.test(path)) return 'Loom video';
  if (host === 'open.spotify.com') return 'Spotify player';
  if (/^(maps\.)?google\.com$/.test(host) && path === 'maps/embed') return 'Google map';
  if (host === 'openstreetmap.org' && path === 'export/embed.html') return 'OpenStreetMap';
  if (/^(x\.com|twitter\.com|mobile\.twitter\.com|mobile\.x\.com)$/.test(host) && /^[A-Za-z0-9_]{1,15}\/status\/\d{1,20}/.test(path)) return 'X post';
  return '';
}
const deletePagePane = dialogPane('delete-page');
const deletePageNote = element('p', 'empty-note');
deletePagePane.append(deletePageNote);
const projectsPane = dialogPane('projects');
const projectButtons = element('div', 'control-row');
projectButtons.append(button('New site', 'plus', () => openDialog('new')), button('Import .fweb or .fpub file', 'folder', () => importer.click()), button('Save current', 'save', saveProject));
const projectList = element('div');
const projectEmpty = element('p', 'empty-note', 'No saved projects yet. Save the current site to keep an editable snapshot.');
projectsPane.append(projectButtons, projectList, projectEmpty);
const publishPane = dialogPane('publish');
const publishSlug = input('my-website');
const publishOutput = element('p', 'empty-note', 'Publishes an immutable version on your local FormWeb server.');
const publishLink = element('a');
publishLink.target = '_blank';
publishLink.rel = 'noopener';
publishLink.hidden = true;
publishPane.append(field('Publication slug', publishSlug), publishOutput, publishLink, element('p', 'micro', 'This release provides local static publishing. Custom domains and external cloud hosting are not configured. Export a ZIP for deployment elsewhere.'));
const auditPane = dialogPane('audit');
const auditSummary = element('p', 'empty-note', 'Run the Rust engine audit to review this site.');
const auditList = element('div');
auditPane.append(auditSummary, auditList);

const cmsPane = dialogPane('cms');
const cmsLayout = element('div', 'dialog-pane');
const cmsNav = element('div', 'dialog-nav');
const cmsCollections = element('div', 'list');
const cmsNewName = input('Collection name');
const cmsNewFields = element('textarea', 'code-input');
cmsNewFields.placeholder = 'title:text\nimage:image\nsummary:text';
cmsNewFields.value = 'title:text\nsummary:text';
const cmsCreate = button('Create collection', 'plus', createCollection);
cmsCreate.style.width = '100%';
cmsNav.append(element('div', 'section-title', 'Collections'), cmsCollections, field('New collection', cmsNewName), field('Fields (name:type)', cmsNewFields), cmsCreate);
const cmsControls = element('div', 'dialog-controls');
const cmsSelectedName = element('div', 'section-title', 'Choose a collection');
const cmsItems = select([{ id: '', name: 'New item' }]);
const cmsItemId = input('Leave blank to create');
const cmsItemSlug = input('item-url-slug');
const cmsItemStatus = select([{ id: 'published', name: 'Published' }, { id: 'draft', name: 'Draft' }]);
const cmsValues = element('textarea', 'code-input large-textarea');
cmsValues.placeholder = '{ "title": "Article title", "summary": "Article summary" }';
const cmsItemGrid = element('div', 'form-grid');
cmsItemGrid.append(field('Item', cmsItems, true), field('Item ID', cmsItemId), field('Slug', cmsItemSlug), field('Status', cmsItemStatus, true), field('Field values (JSON object)', cmsValues, true));
const cmsDelete = button('Delete item', 'trash', async () => {
  if (!cmsItems.value) throw new Error('Choose an existing item first.');
  await command('cms.remove', { collection: collectionId, id: cmsItems.value });
  cmsItems.value = '';
  fillCmsItem();
}, 'danger');
const cmsNew = button('New item', 'plus', () => {
  cmsItems.value = '';
  fillCmsItem();
  cmsItemSlug.focus();
});
cmsControls.append(cmsSelectedName, cmsNew, cmsItemGrid, cmsDelete, element('p', 'micro', 'Bind a selected node in the Content inspector. Published items appear in exported collections; drafts remain editable.'));
cmsLayout.append(cmsNav, cmsControls);
cmsPane.append(cmsLayout);
cmsItems.addEventListener('change', fillCmsItem);

const localesPane = dialogPane('locales');
const localesLayout = element('div', 'dialog-pane');
const localesNav = element('div', 'dialog-nav');
const localeList = element('div', 'list');
const newLocaleCode = input('fr');
const localeCreate = button('Add locale', 'plus', async () => {
  const code = newLocaleCode.value.trim();
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(code)) throw new Error('Use a locale code such as fr or en-US.');
  await command('locale.set', { locale: code, translations: {} });
  localeEditing = code;
  updateLocales();
  fillLocale();
});
localesNav.append(element('div', 'section-title', 'Locales'), localeList, field('New locale code', newLocaleCode), localeCreate);
const localeControls = element('div', 'dialog-controls');
const localeEditingLabel = element('div', 'section-title', 'English');
const translations = element('textarea', 'code-input large-textarea');
translations.placeholder = '{ "headline": "Translated headline" }';
const localeDefault = button('Make default locale', undefined, () => command('site.update', { patch: { defaultLocale: localeEditing } }));
localeControls.append(localeEditingLabel, field('Translations by node ID (JSON object)', translations), element('p', 'micro', 'Keys are node IDs, displayed in the inspector. Page metadata uses pageID.title and pageID.description. Select a locale in the toolbar to preview it.'), localeDefault);
localesLayout.append(localesNav, localeControls);
localesPane.append(localesLayout);

const brandPane = dialogPane('brand');
const brandKit = new BrandKit({
  state,
  check: () => request<BrandReport>(`/api/brand/check?page=${encodeURIComponent(currentPage().id)}`),
  selectNode: id => { closeDialog(); selectNode(id); },
  commands: batch => commands(batch),
  pickLogo: dark => { mediaInput.dataset.mode = dark ? 'brandLogoDark' : 'brandLogo'; mediaInput.click(); },
  insertLogo: (url, dark) => insertImageAsset(url, dark ? 'Brand logo (dark)' : 'Brand logo'),
  notify: (message, error) => status(message, error),
  assetUrl: url => apiBase && url.startsWith('/') ? apiBase + url : url
});
brandPane.append(brandKit.element);
/** Closes the dialog and inserts an uploaded image at its natural size (brand logos, team library graphics). */
async function insertImageAsset(url: string, name: string): Promise<void> {
  closeDialog();
  const size = await new Promise<{ width: number; height: number }>(resolve => { const probe = new Image(); probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); probe.onerror = () => resolve({ width: 0, height: 0 }); probe.src = apiBase && url.startsWith('/') ? apiBase + url : url; });
  await insertElement('image', { url, name, width: size.width, height: size.height });
}
const teamPane = dialogPane('team');
const teamPath = (id: string, tail = ''): string => `/api/team-libraries/${encodeURIComponent(id)}${tail}`;
const teamLibraries = new TeamLibraries({
  state,
  list: () => request<{ libraries: TeamLibrarySummary[] }>('/api/team-libraries'),
  get: id => request<TeamLibrary>(teamPath(id)),
  create: (name, fromBrand) => request<TeamLibrary>('/api/team-libraries', { name, fromBrand }),
  save: (id, body) => request<TeamLibrary>(teamPath(id), body),
  share: (id, identityId, role) => request<TeamLibrary>(teamPath(id, '/share'), { identityId, role }),
  remove: id => request(teamPath(id), undefined, 'DELETE'),
  use: (id, action) => mutateVia<{ message: string; state: EditorState }>(teamPath(id, '/use'), { action }),
  assets: () => request<{ assets: { id: string; name: string }[] }>('/api/assets'),
  people: () => request<{ members: { identityId: string; name: string }[] }>('/api/access'),
  insertGraphic: (url, name) => insertImageAsset(url, name),
  notify: (message, error) => status(message, error),
  assetUrl: url => apiBase && url.startsWith('/') ? apiBase + url : url
});
teamPane.append(teamLibraries.element);
const backgroundPane = dialogPane('background');
const backgroundRemover = new BackgroundRemover({
  status: () => request<BackgroundStatus>('/api/background/status'),
  mask: async (node, method) => { const { blob, headers } = await requestBlob('/api/background/mask', { node, method }); return { blob, method: headers.get('X-FormWeb-Method') || method }; },
  image: async url => (await requestBlob(url)).blob,
  apply: (node, mask, feather) => mutateVia<{ message: string; state: EditorState }>('/api/background/apply', { node, mask, feather }),
  restore: node => mutateVia<{ message: string; state: EditorState }>('/api/background/restore', { node }),
  close: () => closeDialog(),
  notify: (message, error) => status(message, error)
});
backgroundPane.append(backgroundRemover.element);
const stockPane = dialogPane('stock');
const stockLibrary = new StockLibrary({
  icons: query => request(`/api/stock/icons?limit=240&q=${encodeURIComponent(query)}`),
  photos: query => request(`/api/stock/formlit?limit=60&q=${encodeURIComponent(query)}`),
  iconAsset: (name, color, stroke, size) => request(`/api/stock/icons/${encodeURIComponent(name)}`, { color, stroke, size }),
  photoAsset: id => request(`/api/stock/formlit/${id}`, {}),
  generators: () => request('/api/generate/generators'),
  generate: (prompt, generator, size, count) => request('/api/generate', { prompt, generator, size, count }),
  poll: job => request(`/api/generate/${encodeURIComponent(job)}`),
  insert: async (made, kind) => {
    closeDialog();
    if (!made.width || !made.height) {  // generated pictures: measure before inserting so width and height are real
      const size = await new Promise<{ width: number; height: number }>(resolve => { const probe = new Image(); probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight }); probe.onerror = () => resolve({ width: 1024, height: 1024 }); probe.src = apiBase + made.asset.url; });
      made = { ...made, ...size };
    }
    await insertElement('image', { url: made.asset.url, name: made.name, width: made.width, height: made.height, alt: made.alt,
      styles: kind === 'icon' ? { width: `${made.width}px`, height: `${made.height}px`, display: 'block' } : undefined });
  },
  url: path => apiBase + path,
  notify: (message, error) => status(message, error)
});
stockPane.append(stockLibrary.element);
// FW-069: a site outline from a description, reviewed, then built as new editable pages in one undo step.
const sitePane = dialogPane('generate-site');
const siteGenerator = new SiteGenerator({
  status: () => request('/api/ai/status'),
  plan: (prompt, pages, references, previous, instruction) => request('/api/ai/site/plan', { prompt, pages, references, previous, instruction }),
  read: file => readReference(file),
  build: plan => mutateVia<{ state: EditorState; message: string; pages: { page: string; name: string }[] }>('/api/ai/site/build', { plan }),
  opened: id => { const page = state().site.pages.find(entry => entry.id === id); closeDialog(); if (page) { pageId = page.id; selectedId = page.root; update(state()); } },
  notify: (message, error) => status(message, error)
});
sitePane.append(siteGenerator.element);
// Brand picker: the Design inspector's color and font fields suggest brand tokens through these datalists.
const brandColorList = element('datalist');
brandColorList.id = 'fw-brand-colors';
const brandFontList = element('datalist');
brandFontList.id = 'fw-brand-fonts';
document.body.append(brandColorList, brandFontList);
for (const key of ['color', 'background', 'border-color']) styleFields.get(key)?.setAttribute('list', 'fw-brand-colors');
styleFields.get('font-family')?.setAttribute('list', 'fw-brand-fonts');
function updateBrand(next: EditorState): void {
  const brand = readBrand(next);
  const fill = (list: HTMLDataListElement, entries: BrandEntry[], label: string) => keyed(list, entries, item => item.token, () => element('option'), (node, item) => {
    (node as HTMLOptionElement).value = `var(--${item.token})`;
    (node as HTMLOptionElement).label = `${label}${item.name} (${item.value.split(',')[0]})`;
  });
  // Brand kit values first, then linked team library values; labels say which.
  fill(brandColorList, [...brand.colors.map(item => ({ ...item, name: `Brand color ${item.name}` })), ...brand.teamColors.map(item => ({ ...item, name: `Team color ${item.name}` }))], '');
  fill(brandFontList, [...brand.fonts.map(item => ({ ...item, name: `Brand font ${item.name}` })), ...brand.teamFonts.map(item => ({ ...item, name: `Team font ${item.name}` }))], '');
  if (dialogMode === 'brand') brandKit.update(next);
}
const tokensPane = dialogPane('tokens');
const tokensList = element('div');
const tokenGrid = element('div', 'form-grid');
const tokenName = input('accent');
const tokenValue = input('#f97316');
tokenGrid.append(field('New token name', tokenName), field('CSS value', tokenValue));
tokensPane.append(element('p', 'empty-note', 'Site tokens are exported as CSS custom properties. Use var(--token-name) in element style fields.'), tokensList, tokenGrid, button('Add token', 'plus', () => command('token.set', { name: tokenName.value.trim(), value: tokenValue.value.trim() }).then(() => status(t('Token --{0} added.', [tokenName.value.trim().replace(/^--/, '')])))));
const inspectorExt = installInspector({
  section, field, select, input, button, addStyle, addSegments, setStyle, nodePatch, run, status, insertionParent, makeNode, selectNode, canvas,
  showLayers: () => setSidebar('pages'),
  breakpoint: () => breakpoint,
  editing: () => !preview && !fullPreview.isOpen,
  panes: { design: designPane, content: contentPane, tokens: tokensPane, motion: motionPane },
  anchors: { afterAttributes: attributesSection, stageBefore: viewportReadout }
});
const tryKit = installTry({
  canvas, overlay, fields: styleFields, segments: segmentFields,
  scope: () => `${currentNode().id}|${breakpoint}|${pageId}`,
  node: () => currentNode().id,
  exists: id => !!lastState?.site.nodes[id],
  stored: key => { const node = currentNode(); return (breakpoint === 'desktop' ? node.styles : node.breakpoints[breakpoint] || {})[key] || ''; },
  inherited: key => breakpoint === 'desktop' ? '' : currentNode().styles[key] || '',
  editing: () => !preview && !fullPreview.isOpen && !!scrim.hidden && !demoPreview.isOpen && !featureStudio.opened && !!home.root.hidden,
  setStyle,
  status: (message, error) => status(message, error)
});
const controlKit = installControls({
  fields: styleFields, overlay, state: () => lastState, setStyle, scope: key => `${currentNode().id}|${breakpoint}|${key}`,
  setStyles: styles => { const next = Object.fromEntries(Object.entries(styles).map(([name, content]) => [name, content.trim() || null])); return nodePatch(breakpoint === 'desktop' ? { styles: next } : { breakpoints: { [breakpoint]: next } }); },
  status: (message, error) => status(message, error),
  values: key => { const node = currentNode(); return { value: (breakpoint === 'desktop' ? node.styles : node.breakpoints[breakpoint] || {})[key] || '', inherited: node.styles[key] || '' }; },
  changed: () => { value(designFieldsSelect, controlKit.defaultRaw() ? 'css' : 'controls'); designFieldsAll.disabled = !controlKit.own(); },
  trial: { live: (key, value) => tryKit.live(key, value), settled: key => tryKit.settled(key) }
});
const settingsPane = dialogPane('settings');
applyTheme();
const themeSelect = select(Object.entries(THEMES).map(([id, profile]) => ({ id, name: profile.label })));
themeSelect.value = readChoice().theme;
themeSelect.addEventListener('change', () => setTheme(themeSelect.value));
const authToken = input('Optional server token');
authToken.type = 'password';
authToken.autocomplete = 'off';
try { authToken.value = sessionStorage.getItem('formweb_token') || ''; } catch {}
const languageSelect = select(languages().map(([id, name]) => ({ id, name })));
languageSelect.dataset.noI18n = '';
languageSelect.value = language();
languageSelect.addEventListener('change', () => { if (isLang(languageSelect.value)) void setLanguage(languageSelect.value); });
const autoShowHome = element('input');
autoShowHome.type = 'checkbox';
autoShowHome.checked = homePref();
autoShowHome.addEventListener('change', () => setHomePref(autoShowHome.checked));
const autoShowHomeLabel = element('label', 'checkbox-field');
autoShowHomeLabel.append(autoShowHome, element('span', '', 'Show the Home screen at launch'));
const designFieldsSelect = select([{ id: 'controls', name: 'Controls' }, { id: 'css', name: 'CSS text' }]);
designFieldsSelect.value = controlKit.defaultRaw() ? 'css' : 'controls';
designFieldsSelect.addEventListener('change', () => controlKit.setDefaultRaw(designFieldsSelect.value === 'css'));
const designFieldsAll = button('Use for all fields', undefined, () => { controlKit.clearRaw(); status('Every Design field now follows this setting.'); });
designFieldsAll.disabled = !controlKit.own();
const designFieldsNote = element('p', 'micro', 'Controls puts sliders, color swatches and choosers next to the Design fields; CSS text shows the typed value only. The switch in a field\'s label changes that field alone.');
const tryChoices = element('input');
tryChoices.type = 'checkbox';
tryChoices.checked = tryKit.enabled();
tryChoices.addEventListener('change', () => tryKit.setEnabled(tryChoices.checked));
const tryChoicesLabel = element('label', 'checkbox-field');
tryChoicesLabel.append(tryChoices, element('span', '', 'Try choices on the page before keeping them'));
const tryChoicesNote = element('p', 'micro', 'A clicked choice shows on the page and is written when you press Keep. With this off, choices are written at once.');
const prefsIcons: Record<string, Icon> = { General: 'pfGeneral', Interface: 'pfInterface', Plugins: 'pfPlugins' };
const prefsPages = element('div', 'fw-prefs-pages');
const prefsNav = element('div', 'fw-prefs-nav');
prefsNav.setAttribute('role', 'tablist');
const prefsSections = new Map<string, HTMLElement>();
let prefsCurrent = '';
let prefsSpyRaf = 0;
let prefsWireRaf = 0;
let prefsSpyMuted = 0;
let prefsWireD = '';
let prefsPortY = -1;
function prefsGroup(label: string, ...content: HTMLElement[]): HTMLElement {
  const group = element('section', 'fw-prefs-group');
  group.append(element('h3', 'fw-prefs-label', label), ...content);
  return group;
}
function prefsAdd(name: string, ...content: HTMLElement[]): void {
  const tab = element('button', 'fw-prefs-railtab');
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.dataset.section = name;
  tab.title = name;
  const tabIcon = element('span', 'fw-prefs-tabicon');
  tabIcon.append(icon(prefsIcons[name]));
  tab.append(tabIcon, element('span', 'fw-prefs-tablabel', name));
  tab.addEventListener('click', () => { prefsMark(name); prefsScrollTo(name, 'smooth'); });
  prefsNav.append(tab);
  const sec = element('section', 'fw-prefs-sec');
  sec.dataset.section = name;
  const head = element('button', 'fw-prefs-sechead');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'true');
  const secIcon = element('span', 'fw-prefs-secicon');
  secIcon.append(icon(prefsIcons[name]));
  const chev = element('span', 'fw-prefs-chev');
  chev.append(icon('chevronDown'));
  head.append(secIcon, element('span', 'fw-prefs-seclabel', name), chev);
  head.addEventListener('click', () => prefsFold(name));
  const body = element('div', 'fw-prefs-secbody');
  body.append(...content);
  sec.append(head, body);
  prefsPages.append(sec);
  prefsSections.set(name, sec);
}
function prefsMark(name: string): void {
  if (prefsCurrent === name) return;
  prefsCurrent = name;
  for (const [key, sec] of prefsSections) sec.classList.toggle('is-current', key === name);
  for (const tab of Array.from(prefsNav.children) as HTMLElement[]) {
    const on = tab.dataset.section === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  prefsQueueWire();
}
function prefsScrollTo(name: string, behavior: ScrollBehavior): void {
  const sec = prefsSections.get(name);
  if (!sec) return;
  if (sec.classList.contains('is-folded')) prefsFold(name);
  const top = sec.getBoundingClientRect().top - prefsPages.getBoundingClientRect().top + prefsPages.scrollTop - 12;
  prefsSpyMuted = performance.now() + 700;
  prefsPages.scrollTo({ top, behavior });
}
function prefsFold(name: string): void {
  const sec = prefsSections.get(name);
  if (!sec) return;
  const folded = !sec.classList.contains('is-folded');
  sec.classList.toggle('is-folded', folded);
  (sec.querySelector('.fw-prefs-secbody') as HTMLElement).hidden = folded;
  (sec.querySelector('.fw-prefs-sechead') as HTMLElement).setAttribute('aria-expanded', String(!folded));
  prefsQueueWire();
  prefsQueueSpy();
}
function prefsQueueSpy(): void {
  if (prefsSpyRaf) return;
  prefsSpyRaf = requestAnimationFrame(() => {
    prefsSpyRaf = 0;
    if (!prefsPages.clientHeight || performance.now() < prefsSpyMuted) return;
    const edge = prefsPages.getBoundingClientRect().top + 24;
    const names = Array.from(prefsSections.keys());
    let best = '';
    let bestD = Infinity;
    if (prefsPages.scrollHeight > prefsPages.clientHeight + 4 && prefsPages.scrollTop + prefsPages.clientHeight >= prefsPages.scrollHeight - 2) best = names[names.length - 1] || '';
    else for (const [key, sec] of prefsSections) {
      const top = sec.getBoundingClientRect().top;
      const d = top <= edge ? edge - top : top - edge + 100000;
      if (d < bestD) { bestD = d; best = key; }
    }
    if (best) prefsMark(best);
  });
}
function prefsQueueWire(): void {
  if (prefsWireRaf) return;
  prefsWireRaf = requestAnimationFrame(() => { prefsWireRaf = 0; prefsDrawWire(); });
}
function prefsDrawWire(): void {
  if (scrim.hidden || dialogMode !== 'settings') return;
  const F = dialog.getBoundingClientRect();
  const tab = prefsNav.querySelector<HTMLElement>('.fw-prefs-railtab.is-active');
  if (!F.width || !tab) return;
  const N = prefsNav.getBoundingClientRect();
  let T = tab.getBoundingClientRect();
  if (T.top < N.top || T.bottom > N.bottom) {
    prefsNav.scrollTop += T.top < N.top ? T.top - N.top - 6 : T.bottom - N.bottom + 6;
    T = tab.getBoundingClientRect();
  }
  const R = prefsRail.getBoundingClientRect();
  const H = dialogHead.getBoundingClientRect();
  const portY = Math.round(H.bottom - F.top);
  const sx = Math.round(T.right - F.left);
  const ty = Math.round(T.top - F.top + T.height / 2);
  const rr = R.right - F.left;
  const trunk = Math.round(rr - rr * 0.45);
  const dy = portY - ty;
  const r = 10;
  const dir = dy > 0 ? 1 : -1;
  const d = Math.abs(dy) < 2 * r ? `M ${sx} ${ty} H ${trunk} V ${portY} H -7` : `M ${sx} ${ty} H ${trunk - r} a ${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${r} ${dir * r} V ${portY - dir * r} a ${r} ${r} 0 0 ${dir > 0 ? 0 : 1} ${r} ${dir * r} H -7`;
  if (d !== prefsWireD) { prefsWireD = d; prefsWireShade.setAttribute('d', d); prefsWireLine.setAttribute('d', d); }
  if (portY !== prefsPortY) { prefsPortY = portY; prefsPort.style.transform = `translateY(${portY}px)`; }
}
const PREFS_RAIL_KEY = 'formweb.prefsRailCollapsed';
let prefsCollapsed = false;
try { prefsCollapsed = localStorage.getItem(PREFS_RAIL_KEY) === '1'; } catch { prefsCollapsed = false; }
const prefsFoldButton = element('button', 'fw-prefs-fold');
prefsFoldButton.type = 'button';
prefsFoldButton.append(icon('pfFold'));
function paintPrefsRail(): void {
  dialog.classList.toggle('is-rail-collapsed', prefsCollapsed);
  prefsFoldButton.title = prefsCollapsed ? 'Expand tabs' : 'Collapse tabs';
  prefsFoldButton.setAttribute('aria-label', prefsFoldButton.title);
  prefsFoldButton.setAttribute('aria-expanded', String(!prefsCollapsed));
}
prefsFoldButton.addEventListener('click', () => {
  prefsCollapsed = !prefsCollapsed;
  try { localStorage.setItem(PREFS_RAIL_KEY, prefsCollapsed ? '1' : '0'); } catch { }
  paintPrefsRail();
  prefsQueueWire();
});
paintPrefsRail();
const prefsRail = element('div', 'fw-prefs-rail');
prefsRail.append(prefsNav, prefsFoldButton);
const prefsWire = element('span', 'fw-prefs-wirebox');
prefsWire.innerHTML = '<svg class="fw-prefs-wire" aria-hidden="true"><path class="fw-prefs-wire-shade"></path><path class="fw-prefs-wire-line"></path></svg>';
const prefsWireShade = prefsWire.querySelector('.fw-prefs-wire-shade') as SVGPathElement;
const prefsWireLine = prefsWire.querySelector('.fw-prefs-wire-line') as SVGPathElement;
const prefsPort = element('span', 'fw-prefs-port');
prefsPort.setAttribute('aria-hidden', 'true');
const prefsHeadIcon = element('span', 'fw-prefs-headicon');
prefsHeadIcon.append(icon('gear'));
dialogHead.prepend(prefsHeadIcon);
dialog.append(prefsRail, prefsWire, prefsPort);
prefsPages.addEventListener('scroll', prefsQueueSpy, { passive: true });
new ResizeObserver(prefsQueueWire).observe(dialog);
window.addEventListener('resize', prefsQueueWire);
const resetPrefs = button('Reset All Preferences...', 'trash', undefined, 'fw-prefs-danger');
const resetNote = element('p', 'micro', 'Every FormWeb preference on this device goes back to its default and the editor reloads. Your sites and projects are kept.');
const resetConfirm = button('Reset', undefined, () => {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith('formweb.') || ['nodemode_ui_settings', 'formweb_theme', 'formweb_language', 'formweb_shortcuts', 'formweb_workspace', 'formweb_terminal', 'fw.vector.pathfinder'].includes(key)) localStorage.removeItem(key); } catch { }
  location.reload();
}, 'fw-prefs-danger');
const resetCancel = button('Cancel', undefined, () => { resetRow.hidden = true; resetPrefs.hidden = false; });
const resetRow = element('div', 'fw-prefs-confirm');
resetRow.hidden = true;
resetRow.append(resetNote, resetConfirm, resetCancel);
resetPrefs.addEventListener('click', () => { resetPrefs.hidden = true; resetRow.hidden = false; });
const tokenNote = element('p', 'micro', 'For a server launched with FORMWEB_AUTH_TOKEN, enter its token below. It is stored only for this browser tab.');
const endpointNote = element('p', 'micro', `API endpoint: ${apiBase || 'same origin'} /api. The API and MCP use the same authoritative Rust document.`);
prefsAdd('General', prefsGroup('Startup', autoShowHomeLabel), prefsGroup('Reset', resetPrefs, resetRow));
prefsAdd('Interface', prefsGroup('Theme', field('Editor theme', themeSelect)), prefsGroup('Language', field('Editor language', languageSelect)), prefsGroup('Design fields', field('Show in Design fields', designFieldsSelect), designFieldsNote, designFieldsAll, tryChoicesLabel, tryChoicesNote));
prefsAdd('Plugins', prefsGroup('Server access', tokenNote, field('Server access token', authToken), endpointNote));
settingsPane.append(prefsPages);
prefsMark('General');
const helpPane = dialogPane('help');
const helpGrid = element('div', 'help-grid');
for (const [heading, paragraph] of [
  ['Build visually', 'Select a layer or click an element. The Design inspector edits CSS in the active breakpoint. Double-click default-locale text to edit it in place.'],
  ['Save & export', 'Save keeps a local project snapshot. Download preserves editable .fweb source. Export creates static HTML, CSS, interactions, sitemap and robots files.'],
  ['Content & locales', 'CMS collections store typed fields and published or draft items. Content bindings render items on export. Locale dictionaries translate node text and page metadata.'],
  ['Shared agent control', 'Enable Agents to permit MCP tools to inspect and modify the current site. Commands, validation and undo are owned by the same Rust engine as the editor.'],
  ['Keyboard', 'Ctrl/Cmd+S saves. Ctrl/Cmd+Z undoes; add Shift to redo. Escape closes dialogs. Delete removes the selected element when a form control is not focused.'],
  ['Advanced studio', 'Studio opens persistent workflows for custom breakpoints, component properties and libraries, CMS queries and CSV, locale routes, motion, form delivery, release promotion, branch review and collaborator access. Review each example before applying it.'],
  ['Runtime & providers', 'Preview compiles the selected page and locale into an isolated runtime. Connected providers report their required server settings and actual transport result. Membership, consent, commerce and code components are authored in Studio; external provider completion requires configuration and independent verification.']
]) {
  const block = element('div');
  block.append(element('h3', '', heading), element('p', '', paragraph));
  helpGrid.append(block);
}
const helpGuide = element('a', 'help-guide-link');
helpGuide.href = 'https://github.com/nodemode-dev/formweb/tree/main/docs/guide';
helpGuide.target = '_blank';
helpGuide.rel = 'noopener';
helpGuide.append(icon('external'), element('span', '', 'Open the full guide'));
helpPane.append(helpGuide, helpGrid);

function setSidebar(id: string): void {
  activeSidebar = id;
  pagesPane.hidden = id !== 'pages';
  insertPane.hidden = id !== 'insert';
  agentsPane.hidden = id !== 'agents';
  text(sidebarTitle, id === 'insert' ? 'Insert' : id === 'agents' ? 'Agent Connect' : id === 'library' ? 'Library' : 'Pages and layers');
  agentConnect.setVisible(id === 'agents' && layout.state.left === 'open');
  libraryPanel.setVisible(id === 'library' && layout.state.left === 'open');
  rail.refresh();
}
function setInspector(id: string): void {
  activeInspector = id;
  designPane.hidden = id !== 'design';
  contentPane.hidden = id !== 'content';
  motionPane.hidden = id !== 'motion';
  pagePane.hidden = id !== 'page';
  inspectorTabButtons.forEach((node, key) => node.classList.toggle('active', key === id));
}
function updateAgents(): void {
  text(agentsButton.querySelector('span:last-child')!, agentsEnabled ? 'Agents on' : 'Agents off');
  agentsButton.classList.toggle('active', agentsEnabled);
  agentsButton.setAttribute('aria-pressed', String(agentsEnabled));
  agentsButton.title = agentsEnabled ? 'Agents on: MCP clients can edit this site' : 'Agents off: MCP clients are blocked';
  agentsButton.setAttribute('aria-label', agentsButton.title);
  agentConnect.setAgents(agentsEnabled);
  rail.refresh();
  rail.refresh();
}
function update(next: EditorState): void {
  lastState = next;
  const site = next.site;
  if (!site.pages.length) return;
  if (!site.breakpoints.some(item => item.id === breakpoint)) breakpoint = site.breakpoints.find(item => item.maxWidth === 100000)?.id || site.breakpoints[0]?.id || 'desktop';
  if (!widths[breakpoint]) widths[breakpoint] = Math.min(3840, site.breakpoints.find(item => item.id === breakpoint)?.maxWidth || 1280);
  options(breakpointSelect, site.breakpoints.map(item => ({ id: item.id, name: item.name })));
  value(breakpointSelect, breakpoint);
  if (!site.pages.some(page => page.id === pageId)) pageId = site.pages[0].id;
  const page = currentPage();
  if (!site.nodes[selectedId] || !descendants(page.root).has(selectedId)) selectedId = page.root;
  const node = currentNode();
  const parent = parentOf(node.id);
  text(projectName, site.name);
  text(pageName, page.name);
  text(pagePath, page.slug || '/');
  const trail: SiteNode[] = [];
  for (let at: SiteNode | undefined = node; at; at = parentOf(at.id)) trail.unshift(at);
  crumbs.update(trail.map(item => ({ id: item.id, name: item.name, tag: item.tag })), node.id);
  const pickedBreakpoint = site.breakpoints.find(item => item.id === breakpoint);
  label(readoutMode, 'Editing {0}', [pickedBreakpoint?.name || breakpoint]);
  text(readoutWidth, `${widths[breakpoint]} px`);
  // Quiet hint only: the typed width never changes which breakpoint's styles are drawn or edited.
  const narrower = site.breakpoints.filter(item => item.maxWidth < (pickedBreakpoint?.maxWidth ?? 0)).reduce((top, item) => Math.max(top, item.maxWidth), 0);
  const outside = !!pickedBreakpoint && (widths[breakpoint] > pickedBreakpoint.maxWidth || widths[breakpoint] <= narrower);
  viewportHint.dataset.on = String(outside);
  value(viewportSize, String(widths[breakpoint]));
  undoButton.disabled = !next.canUndo;
  redoButton.disabled = !next.canRedo;
  viewportButtons.forEach((control, id) => control.classList.toggle('active', id === breakpoint));
  options(localeSelect, Object.keys(site.locales).map(id => ({ id, name: id.toUpperCase() })));
  if (!site.locales[locale]) locale = site.defaultLocale;
  value(localeSelect, locale);
  text(statusRevision, `Rust engine · rev ${next.revision} · ${Object.keys(site.nodes).length} nodes`);
  keyed(pagesList, site.pages, page => page.id, () => {
    const row = button('', undefined, undefined, 'list-row');
    row.append(icon('page'), element('span', 'row-label'), element('span', 'row-detail'));
    row.addEventListener('click', event => pageRowClick(event, row.dataset.key!));
    panel.pageRow(row);
    return row;
  }, (row, item) => {
    text(row.children[1] as HTMLElement, item.name);
    text(row.children[2] as HTMLElement, item.id === site.pages[0].id ? 'Home' : '');
    row.classList.toggle('active', item.id === pageId);
    row.setAttribute('aria-current', item.id === pageId ? 'page' : 'false');
    paintPageRow(row, item.id);
  });
  const { rows: layers, total: layerTotal } = panel.layerRows();
  text(nodeCount, String(layerTotal));
  paintSelectMode();
  keyed(layersList, layers, item => item.node.id, () => {
    const row = button('', undefined, undefined, 'list-row layer-row');
    row.append(layerGlyph(), element('span', 'row-label'), element('span', 'row-detail'));
    row.addEventListener('click', event => layerRowClick(event, row.dataset.key!));
    row.addEventListener('contextmenu', event => showLayerMenu(event, row.dataset.key!));
    panel.layerRow(row, event => showLayerMenu(event, row.dataset.key!));
    return row;
  }, (row, item) => {
    paintGlyph(row.children[0], site, item.node.id);
    text(row.children[1] as HTMLElement, item.node.name);
    text(row.children[2] as HTMLElement, item.node.componentId ? 'instance' : item.node.tag);
    row.style.setProperty('--depth', String(item.depth));
    panel.paintLayer(row, item);
    row.classList.toggle('active', item.node.id === selectedId);
    paintLayerRow(row, item.node.id);
  });
  keyed(componentList, Object.values(site.components), item => item.id, () => {
    const row = button('', undefined, undefined, 'list-row');
    row.append(icon('component'), element('span', 'row-label'), icon('plus'));
    row.addEventListener('click', () => void run(async () => {
      await command('component.insert', { component: row.dataset.key, parent: insertionParent() });
      status('Component instance inserted.');
    }));
    return row;
  }, (row, item) => text(row.children[1] as HTMLElement, item.name));
  text(inspectorName, selectionTitle() ?? node.name);
  text(inspectorTag, selectionNote(node.name) ?? `<${node.tag}> · ${node.id}`);
  const inspectorValues: Record<string, string> = {
    name: node.name, tag: node.tag, text: node.text,
    'page.name': page.name, 'page.slug': page.slug,
    'site.baseUrl': site.settings.baseUrl ?? '',
    'seo.title': page.seo.title, 'seo.description': page.seo.description
  };
  const vectorTag = SVG_TAGS.has(node.tag.toLowerCase());
  options(tagSelect, (vectorTag ? [node.tag] : HTML_TAGS.includes(node.tag) ? HTML_TAGS : [node.tag, ...HTML_TAGS]).map(id => ({ id, name: id })));
  tagSelect.disabled = vectorTag;
  inspectorFields.forEach((control, key) => value(control, inspectorValues[key] || ''));
  text(scopeLabel, breakpoint === 'desktop' ? 'Desktop base' : breakpoint + ' override');
  const override = breakpoint === 'desktop' ? node.styles : node.breakpoints[breakpoint] || {};
  styleFields.forEach((control, name) => {
    value(control, controlKit.shown(name, override[name] || ''));
    if (control instanceof HTMLInputElement) control.placeholder = node.styles[name] || 'Auto / inherit';
  });
  controlKit.sync();
  tryKit.sync();
  segmentFields.forEach((buttons, name) => {
    const own = override[name] || '';
    const inherited = breakpoint === 'desktop' ? '' : node.styles[name] || '';
    for (const node of buttons) {
      const on = node.dataset.value === own, ghost = !own && node.dataset.value === inherited;
      if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
      if (node.classList.contains('is-inherited') !== ghost) node.classList.toggle('is-inherited', ghost);
      node.setAttribute('aria-pressed', String(on));
    }
  });
  resetButtons.forEach((reset, name) => { const hide = !override[name]; if (reset.hidden !== hide) reset.hidden = hide; });
  attrsFields.forEach((control, name) => value(control, node.attrs[name] || ''));
  decorativeImage.update(node);
  aiWriter.update(node.id);
  removeBackgroundButton.hidden = node.tag !== 'img';
  editInFormvisButton.hidden = updateFromFormvisButton.hidden = node.tag !== 'img';
  resetOverrides.disabled = breakpoint === 'desktop' || !Object.keys(node.breakpoints[breakpoint] || {}).length;
  options(bindingCollection, [{ id: '', name: 'No collection' }, ...Object.values(site.collections).map(collection => ({ id: collection.id, name: collection.name }))]);
  const cmsGroup = site.extensions?.cms as { bindings?: Record<string, { collection: string; field?: string }>; lists?: Record<string, { collection: string }> } | undefined;
  const advancedBinding = cmsGroup?.bindings?.[node.id] || cmsGroup?.lists?.[node.id];
  const activeBinding = advancedBinding || node.binding;
  value(bindingCollection, activeBinding?.collection || '');
  const collection = site.collections[activeBinding?.collection || ''];
  const boundField = 'field' in (activeBinding || {}) ? (activeBinding as { field?: string })?.field || '' : '';
  const boundFields = (collection?.fields || []).map(field => ({ id: field.name, name: `${field.name} (${field.type})` }));
  if (boundField && !boundFields.some(field => field.id === boundField)) boundFields.push({ id: boundField, name: boundField });
  options(bindingField, [{ id: '', name: 'Repeat collection list' }, ...boundFields]);
  value(bindingField, boundField);
  bindingCollection.disabled = !!advancedBinding;
  bindingField.disabled = !!advancedBinding || !node.binding;
  text(bindingNote, advancedBinding ? 'Advanced binding or query active. Edit it in Studio and review compiled Preview; these basic controls are reserved for the original binding.' : 'List bindings repeat published items in the canvas and export. Descendant fields use their current item. Image fields bind image sources.');
  const interaction = node.interactions?.[0];
  value(interactionTrigger, interaction?.trigger || 'click');
  value(interactionAction, interaction?.action || '');
  value(interactionClass, interaction?.className || '');
  value(interactionUrl, interaction?.url || '');
  value(interactionDuration, String(interaction?.duration || 500));
  value(effectKind, node.attrs['data-fw-effect'] || '');
  value(effectSpeed, node.attrs['data-fw-effect-speed'] || '');
  effectSpeed.disabled = !node.attrs['data-fw-effect'];
  inspectorExt.update(next, node, breakpoint);
  const invalidParents = descendants(node.id);
  options(parentSelect, Object.values(site.nodes).filter(item => !invalidParents.has(item.id) && descendants(page.root).has(item.id) && ['main', 'section', 'div', 'article', 'aside', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'li', 'figure'].includes(item.tag)).map(item => ({ id: item.id, name: item.name })));
  value(parentSelect, parent?.id || '');
  parentSelect.disabled = !parent;
  upButton.disabled = !parent || parent.children.indexOf(node.id) === 0;
  downButton.disabled = !parent || parent.children.indexOf(node.id) === parent.children.length - 1;
  deleteNodeButton.disabled = node.id === page.root;
  noindex.checked = !!page.seo.noindex;
  pageBackground.fill(next);
  fillCustomCode();
  hideScrollbars.checked = site.settings.hideScrollbars === 'true';
  embedClick.checked = site.settings.embedClickToLoad === 'true';
  const favicon = site.settings.favicon || '';
  faviconPreview.hidden = !favicon;
  if (favicon && faviconPreview.dataset.src !== favicon) { faviconPreview.dataset.src = favicon; faviconPreview.src = apiBase && favicon.startsWith('/') ? apiBase + favicon : favicon; }
  faviconClear.disabled = !favicon && !site.settings.faviconDark;
  updatePasswordState();
  if (passwordGatesFor !== site.id) void loadPasswordGates().catch(() => undefined);
  canvas.mark(selectedIds());
  canvas.render(site, page, selectedId, widths[breakpoint], locale, breakpoint);
  runtimePreview.update(preview, next, page.id, locale, widths[breakpoint]);
  if (refreshPreviewButton.classList.contains('active') !== preview) refreshPreviewButton.classList.toggle('active', preview);
  if (refreshPreviewButton.getAttribute('aria-pressed') !== String(preview)) refreshPreviewButton.setAttribute('aria-pressed', String(preview));
  fullPreview.follow(next.revision);
  if (dialogMode === 'cms') updateCms();
  if (dialogMode === 'locales') updateLocales();
  if (dialogMode === 'tokens') updateTokens();
  updateBrand(next);
  setInspector(scriptPanes.update(isPageScript(site, node.id) && selectedIds().length < 2, activeInspector));
  setSidebar(activeSidebar);
  reportSelection();
  revealApp();
}

async function saveProject(): Promise<void> {
  const result = await request<{ name: string; revision: number }>('/api/projects/save', {});
  status(`Saved "${result.name}" at revision ${result.revision}.`);
  if (dialogMode === 'projects') await updateProjects();
}
async function downloadProject(): Promise<void> {
  const file = state().site.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') + '.fweb';
  await deliver(file, { desktop: 'Saved {0} to your Downloads folder.', placed: 'Saved {0} to {1}.', browser: 'Downloaded {0}. Your browser lists it with its downloads.' }, notice, started => download('/api/project-file', file, started));
  status('Editable .fweb project downloaded.');
}
const NOT_FOUND_BASE_KEY = "The 404 page links its styles and pages from / because the base URL is still example.com. Set the base URL to the site's public address before you deploy it under a path.";
const LOCAL_FORM_KEY = 'The form on {0} posts to this computer and will not work once the site is on another host. Give it a scripted reply (Motion > Script, trigger Submit), or keep the site on this computer with Publish.';
function notFoundBaseWarning(warned?: string[]): string {
  if (warned) return warned.includes(NOT_FOUND_BASE_KEY) ? ' ' + t(NOT_FOUND_BASE_KEY) : '';
  const site = state().site;
  const base = (site.settings.baseUrl ?? 'https://example.com').replace(/\/+$/, '');
  if (base !== 'https://example.com' || !site.pages.some(page => page.slug.replace(/^\/+|\/+$/g, '') === '404')) return '';
  return ' ' + t(NOT_FOUND_BASE_KEY);
}
function localFormWarning(pages: readonly string[]): string {
  return pages.map(page => ' ' + t(LOCAL_FORM_KEY, [page])).join('');
}
function localFormHeader(headers: Headers): string[] {
  try {
    const listed: unknown = JSON.parse(decodeURIComponent(headers.get('X-FormWeb-Local-Forms') || '[]'));
    return Array.isArray(listed) ? listed.filter((page): page is string => typeof page === 'string') : [];
  } catch {
    return [];
  }
}
function baseUrlAction(warning: string): { label: string; run: () => unknown } | undefined {
  return warning ? { label: 'Set the base URL', run: openBaseUrlField } : undefined;
}
async function exportSite(): Promise<void> {
  const file = state().site.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-') + '-site.zip';
  const headers = await deliver(file, { desktop: 'Exported {0} to your Downloads folder.', placed: 'Exported {0} to {1}.', browser: 'Downloaded {0}. Your browser lists it with its downloads.' }, notice, started => download(`/api/export?locale=${encodeURIComponent(locale)}`, file, started), exportButton);
  const warning = notFoundBaseWarning();
  status([t('Static site exported for {0}.', [{ lang: locale }]), warning, localFormWarning(localFormHeader(headers))], false, baseUrlAction(warning));
}
async function sendToFormPublisher(): Promise<void> {
  try {
    const sent = await request<{ delivered: 'live' | 'inbox'; site?: string; revision?: string; path?: string; warnings?: string[]; localForms?: string[] }>(`/api/handoff/formpublisher?locale=${encodeURIComponent(locale)}`, {});
    const warning = notFoundBaseWarning(sent.warnings || []);
    const forms = localFormWarning(sent.localForms || []);
    if (sent.delivered === 'live') status([t('Sent to FormPublisher: {0} is now at revision {1}.', [state().site.name, sent.revision ?? '']), warning, forms], false, baseUrlAction(warning));
    else {
      const path = sent.path ?? '';
      const short = path.length > 44 ? `${path.slice(0, 14)}…${path.slice(-28)}` : path;
      status([t('FormPublisher is not running. The site was saved to its inbox ({0}) and imports when FormPublisher starts.', [short]), warning, forms], false, baseUrlAction(warning));
      statusMessage.title = [t('FormPublisher is not running. The site was saved to its inbox ({0}) and imports when FormPublisher starts.', [path]), warning, forms].filter(Boolean).join('');
    }
  } catch (error) {
    status(t('Could not send to FormPublisher: {0}', [error instanceof Error ? error.message : String(error)]), true);
  }
}
function parseCsv(source: string): { slug: string; name?: string; values: Record<string, string> }[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(item => item.trim() !== '')) records.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(item => item.trim() !== '')) records.push(row);
  if (quoted) throw new Error('CSV has an unclosed quote.');
  if (records.length < 2) throw new Error('Add a header row and at least one data row.');
  const header = records[0].map(name => name.trim());
  const slugIndex = header.indexOf('slug');
  if (slugIndex < 0) throw new Error('The header needs a slug column.');
  if (records.length - 1 > 300) throw new Error('Bulk create accepts up to 300 rows at a time.');
  return records.slice(1).map((cells, index) => {
    const values: Record<string, string> = {};
    header.forEach((name, column) => { if (name) values[name] = (cells[column] ?? '').trim(); });
    const slug = values.slug;
    if (!slug) throw new Error(`Row ${index + 2} has no slug.`);
    return { slug: slug.startsWith('/') ? slug : '/' + slug, name: values.name || undefined, values };
  });
}
function pageAddress(): string {
  const slug = currentPage().slug.replace(/^\/+/, '');
  const base = publishLink.hidden ? (apiBase || window.location.origin) + '/' : publishLink.href.replace(/[^/]*$/, '');
  return new URL(slug, base).toString();
}
async function downloadQr(): Promise<void> {
  const url = qrUrl.value.trim() || pageAddress();
  const format = qrFormat.value || 'png';
  const name = currentPage().slug.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  await download(`/api/qr?format=${format}&scale=10&dark=${encodeURIComponent(qrDark.value)}&light=${encodeURIComponent(qrLight.value)}&url=${encodeURIComponent(url)}`, `qr-${name}.${format}`);
  status(`QR code downloaded for ${url}.`);
}
async function moveLayer(direction: number): Promise<void> {
  const node = currentNode();
  const parent = parentOf(node.id);
  if (parent) await command('node.move', { id: node.id, parent: parent.id, index: parent.children.indexOf(node.id) + direction });
}
function makeNode(tag: string, name: string, content = '', styles: Record<string, string> = {}, attrs: Record<string, string> = {}): SiteNode {
  return { id: uuid(tag), tag, name, text: content, children: [], attrs, styles, breakpoints: {} };
}
async function insertElement(kind: string, asset?: { url: string; name: string; width: number; height: number; alt?: string; styles?: Record<string, string> }): Promise<void> {
  if (kind === 'image' && !asset) {
    mediaInput.dataset.mode = 'insert';
    mediaInput.dataset.parent = insertionParent();
    mediaInput.click();
    return;
  }
  const parent = kind === 'image' ? mediaInput.dataset.parent || insertionParent() : insertionParent();
  let node: SiteNode;
  const children: SiteNode[] = [];
  const look = starterStyles(state().site);
  if (kind === 'heading') node = makeNode('h2', 'Heading', 'A new perspective', look.heading);
  else if (kind === 'paragraph') node = makeNode('p', 'Paragraph', 'Write something worth reading.', look.paragraph);
  else if (kind === 'button') node = makeNode('a', 'Button', 'Get started', look.button, { href: '#' });
  else if (kind === 'link') node = makeNode('a', 'Link', 'Explore more', look.link, { href: '#' });
  else if (kind === 'image') {
    node = makeNode('img', asset!.name, '', asset!.styles || { width: '100%', height: '320px', 'object-fit': 'cover', 'border-radius': '12px' }, { src: asset!.url, ...(asset!.alt ? { alt: asset!.alt } : {}), width: String(asset!.width), height: String(asset!.height) });
  } else if (kind === 'form') {
    node = makeNode('form', 'Contact form', '', look.form, { name: 'contact' });
    children.push(makeNode('label', 'Email label', 'Email address', look.formLabel), makeNode('input', 'Email input', '', look.formInput, { type: 'email', name: 'email', placeholder: 'you@example.com', required: '', 'aria-label': 'Email address' }), makeNode('button', 'Submit button', 'Send message', look.formSubmit, { type: 'submit' }));
  } else if (kind === 'grid') {
    node = makeNode('div', 'Grid', '', look.grid);
    node.breakpoints.mobile = { 'grid-template-columns': '1fr' };
    for (const name of ['First idea', 'Second idea', 'Third idea']) children.push(makeNode('article', name, name, { ...look.gridItem }));
  } else if (kind === 'embed') {
    if (!asset) { openDialog('embed'); return; }
    node = makeNode('div', asset.name, `${asset.name}: ${asset.url}`, look.embed, { 'data-fw-embed': asset.url });
  } else node = makeNode('section', 'Section', '', look.section);
  await commands([{ command: 'node.add', params: { parent, node } }, ...children.map(child => ({ command: 'node.add', params: { parent: node.id, node: child } }))]);
  selectedId = node.id;
  setSidebar('pages');
  update(state());
  status(`${node.name} inserted. The operation is one undo step.`);
}

function openDialog(id: string): void {
  if (!lastState && !['settings', 'help'].includes(id)) return;
  if (scrim.hidden) lastFocus = document.activeElement as HTMLElement;
  dialogMode = id;
  const titles: Record<string, string> = { new: 'New website', page: 'Add page', bulk: 'Bulk create pages from CSV', embed: 'Embed media', qr: 'QR code', projects: 'Your projects', publish: 'Publish locally', cms: 'Content collections', locales: 'Localization', tokens: 'Design system tokens', brand: 'Brand kit', team: 'Team libraries', background: 'Remove background', stock: 'Stock library', 'generate-site': 'Generate pages from a description', audit: 'SEO & accessibility audit', settings: 'Preferences', help: 'Using FormWeb', 'delete-page': 'Delete page' };
  text(dialogTitle, titles[id] || id);
  panes.forEach((pane, key) => { pane.hidden = key !== id; });
  const primaryLabels: Record<string, string> = { new: 'Create site', page: 'Add page', bulk: 'Create pages', embed: 'Insert embed', qr: 'Download', publish: 'Publish version', cms: 'Save item', locales: 'Save translations', settings: 'Save & reconnect', 'delete-page': 'Delete page' };
  dialogPrimary.hidden = !primaryLabels[id];
  dialogPrimary.disabled = false;
  text(dialogPrimary.querySelector('span')!, primaryLabels[id] || 'Apply');
  dialogPrimary.classList.toggle('danger', id === 'delete-page');
  dialogPrimary.classList.toggle('primary', id !== 'settings');
  dialogCancel.classList.toggle('primary', id === 'settings');
  text(dialogCancel.querySelector('span')!, id === 'settings' ? 'Done' : 'Close');
  dialog.classList.toggle('fw-prefs-dlg', id === 'settings');
  text(dialogStatus, '');
  if (!dialogStatusAction.hidden) dialogStatusAction.hidden = true;
  scrim.hidden = false;
  if (id === 'settings') { prefsPages.scrollTop = 0; prefsQueueWire(); }
  if (id === 'projects') void run(updateProjects);
  if (id === 'cms') { updateCms(); fillCmsItem(); }
  if (id === 'locales') { localeEditing = locale; updateLocales(); fillLocale(); }
  if (id === 'tokens') updateTokens();
  if (id === 'page') { pageSlug.reset(); options(newPageLook, startChoices(state().site, currentPage().id)); newPageLook.value = ''; }
  if (id === 'brand') brandKit.update(state());
  if (id === 'team') void teamLibraries.refresh().catch(error => status(error instanceof Error ? error.message : String(error), true));
  if (id === 'stock') void stockLibrary.open().catch(error => status(error instanceof Error ? error.message : String(error), true));
  if (id === 'generate-site') void siteGenerator.open().catch(error => status(error instanceof Error ? error.message : String(error), true));
  if (id === 'background') {
    const node = currentNode();
    void backgroundRemover.open({ id: node.id, name: node.name, src: node.attrs.src || '', original: node.attrs['data-fw-original-src'] || '' })
      .catch(error => status(error instanceof Error ? error.message : String(error), true));
  }
  if (id === 'publish') value(publishSlug, state().site.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  if (id === 'qr') value(qrUrl, pageAddress());
  if (id === 'bulk') { options(bulkTemplate, state().site.pages.map(page => ({ id: page.id, name: `${page.name} (${page.slug})` }))); bulkTemplate.value = currentPage().id; text(bulkNote, ''); }
  if (id === 'delete-page') text(deletePageNote, deletePagesNote() ?? t('Delete "{0}" and its content? You can undo this operation.', [currentPage().name]));
  dialogClose.focus();
}
function closeDialog(): void {
  scrim.hidden = true;
  dialogMode = '';
  lastFocus?.focus();
}
async function createSite(name: string, starter: string): Promise<void> {
  await replace('/api/new', { name, blank: true });
  if (starter) await commands(starterSiteCommands(starter).commands);
  pageId = state().site.pages[0].id;
  selectedId = state().site.pages[0].root;
  update(state());
}
async function performDialogAction(): Promise<void> {
  if (dialogMode === 'new') {
    const name = newName.value.trim() || 'Untitled website', starter = newStarter.value;
    closeDialog();
    if (!(await mayReplace())) return;
    await createSite(name, starter);
    status('New site created.');
  } else if (dialogMode === 'page') {
    const before = new Set(state().site.pages.map(page => page.id));
    const look = startCommands(state().site, uuid('page-root'), state().site.pages.find(page => page.id === newPageLook.value));
    if (look.length) await commands([{ command: 'page.add', params: { name: newPageName.value.trim() || 'Untitled page', slug: pageSlug.resolve(), id: uuid('page'), root: look[0].params.id } }, ...look]);
    else await command('page.add', { name: newPageName.value.trim() || 'Untitled page', slug: pageSlug.resolve() });
    const page = state().site.pages.find(page => !before.has(page.id));
    if (page) { pageId = page.id; selectedId = page.root; update(state()); }
    closeDialog();
    status('Page added.');
  } else if (dialogMode === 'qr') {
    await downloadQr();
    closeDialog();
  } else if (dialogMode === 'embed') {
    const kind = embedKind(embedUrl.value);
    if (!kind) throw new Error('Paste a YouTube, Vimeo, Loom, Spotify, Google Maps embed or OpenStreetMap embed link.');
    closeDialog();
    await insertElement('embed', { url: embedUrl.value.trim(), name: kind, width: 0, height: 0 });
    value(embedUrl, '');
    text(embedNote, '');
  } else if (dialogMode === 'bulk') {
    const rows = parseCsv(bulkCsv.value);
    const before = new Set(state().site.pages.map(page => page.id));
    await command('page.bulk', { template: bulkTemplate.value, rows });
    const created = state().site.pages.filter(page => !before.has(page.id));
    if (created[0]) { pageId = created[0].id; selectedId = created[0].root; update(state()); }
    closeDialog();
    status(`${created.length} pages created from CSV. One undo step removes them all.`);
  } else if (dialogMode === 'delete-page') {
    if (await deleteSelectedPages()) { closeDialog(); return; }
    await command('page.remove', { id: currentPage().id });
    closeDialog();
    status('Page removed.');
  } else if (dialogMode === 'publish') {
    const result = await request<{ url: string; version: string }>('/api/publish', { slug: publishSlug.value.trim() || undefined });
    publishLink.href = apiBase && result.url.startsWith('/') ? apiBase + result.url : result.url;
    text(publishLink, result.url);
    publishLink.hidden = false;
    text(publishOutput, `Published immutable version ${result.version}. Open the link to view the exported site.`);
    status('Local site published.');
  } else if (dialogMode === 'cms') await saveCmsItem();
  else if (dialogMode === 'locales') {
    const translationsValue = JSON.parse(translations.value || '{}');
    if (!translationsValue || Array.isArray(translationsValue) || typeof translationsValue !== 'object' || Object.values(translationsValue).some(value => typeof value !== 'string')) throw new Error('Translations must be a JSON object containing string values.');
    await command('locale.set', { locale: localeEditing, translations: translationsValue });
    status(`Translations saved for ${localeEditing}.`);
  } else if (dialogMode === 'settings') {
    sessionStorage.setItem('formweb_token', authToken.value.trim());
    await reconnect();
    const system = await request<{ agentsEnabled: boolean }>('/api/system');
    agentsEnabled = system.agentsEnabled;
    updateAgents();
    status('Reconnected to the site engine with the new access token.');
  }
}
async function updateProjects(): Promise<void> {
  const result = await request<{ projects: { id: string; name: string; updatedAt: string }[] }>('/api/projects');
  projectEmpty.hidden = !!result.projects.length;
  keyed(projectList, result.projects, project => project.id, () => {
    const row = element('div', 'project-row');
    const label = element('div');
    label.append(element('span'), element('small'));
    const open = button('Open', 'folder', async () => {
      const id = row.dataset.key!;
      closeDialog();
      if (!(await mayReplace())) return;
      await replace(`/api/projects/${encodeURIComponent(id)}/open`, {});
      status('Project opened.');
    });
    row.append(label, open);
    return row;
  }, (row, project) => {
    text(row.children[0].children[0] as HTMLElement, project.name);
    text(row.children[0].children[1] as HTMLElement, new Date(project.updatedAt).toLocaleString());
  });
}
function showIssue(row: HTMLElement): void {
  const message = row.children[1].children[0].textContent || '';
  const field = row.dataset.node ? undefined : inspectorFields.get(issueField(row.dataset.code || '') || '');
  if (row.dataset.node) {
    canvas.reveal(selectedId);
    scrollNearest(layersList, rowOf(layersList, selectedId));
  } else if (field) {
    openDock('right');
    field.scrollIntoView({ block: 'center', inline: 'nearest' });
    field.focus({ preventScroll: true });
    flash(field);
  }
  const line = t('Selected {0}: {1}', [row.dataset.node ? currentNode().name : currentPage().name, message]);
  status(line);
  const key = row.dataset.key;
  notice.show(line, { error: true, action: { label: 'Show again', run: () => { if (row.isConnected && row.dataset.key === key) (row.children[2] as HTMLButtonElement).click(); } } });
}
async function auditSite(): Promise<void> {
  const result = await request<{ issues: AuditIssue[]; counts: Record<string, number> }>('/api/audit');
  openDialog('audit');
  text(auditSummary, result.issues.length === 1 ? '1 issue found. Select an element to resolve it in the inspector.' : result.issues.length ? t('{0} issues found. Select an element to resolve it in the inspector.', [result.issues.length]) : 'No issues found by the built-in audit. Review content and exported pages before release.');
  keyed(auditList, result.issues.map((issue, index) => ({ ...issue, key: `${issue.code}-${issue.page || ''}-${issue.node || ''}-${index}` })), issue => issue.key, () => {
    const row = element('div', 'audit-row');
    const description = element('div', 'audit-description');
    description.append(element('span'), element('small'));
    row.append(element('span', 'audit-severity'), description, button('Select', undefined, () => {
      const id = row.dataset.node;
      const page = state().site.pages.find(page => page.id === row.dataset.page || !!id && descendants(page.root).has(id)) ?? (issueField(row.dataset.code || '') ? currentPage() : undefined);
      if (page) {
        pageId = page.id;
        selectedId = id && state().site.nodes[id] ? id : page.root;
        if (!id) setInspector('page');
        closeDialog();
        update(state());
        showIssue(row);
      }
    }));
    return row;
  }, (row, issue) => {
    row.dataset.node = issue.node || '';
    row.dataset.page = issue.page || '';
    row.dataset.code = issue.code;
    text(row.children[0] as HTMLElement, issue.severity);
    const formPage = issue.code === 'forms.local-address' ? state().site.pages.find(page => page.id === issue.page)?.name : undefined;
    if (formPage !== undefined) label(row.children[1].children[0] as HTMLElement, LOCAL_FORM_KEY, [formPage]);
    else text(row.children[1].children[0] as HTMLElement, issue.message);
    text(row.children[1].children[1] as HTMLElement, `${issue.code}${issue.node ? ' · ' + issue.node : issue.page ? ' · ' + issue.page : ''}`);
    (row.children[2] as HTMLButtonElement).hidden = !issue.node && !issue.page && !issueField(issue.code);
  });
}
function updateCms(): void {
  const collections = Object.values(state().site.collections);
  if (!state().site.collections[collectionId]) collectionId = collections[0]?.id || '';
  keyed(cmsCollections, collections, collection => collection.id, () => {
    const row = button('', undefined, undefined, 'list-row');
    row.append(icon('database'), element('span', 'row-label'), element('span', 'row-detail'));
    row.addEventListener('click', () => { collectionId = row.dataset.key!; cmsItems.value = ''; updateCms(); fillCmsItem(); });
    return row;
  }, (row, collection) => {
    text(row.children[1] as HTMLElement, collection.name);
    text(row.children[2] as HTMLElement, String(collection.items.length));
    row.classList.toggle('active', collection.id === collectionId);
  });
  const collection = state().site.collections[collectionId];
  text(cmsSelectedName, collection ? collection.name : 'Create a collection to begin');
  options(cmsItems, [{ id: '', name: 'New item' }, ...(collection?.items || []).map(item => ({ id: item.id, name: `${item.slug || item.id} · ${item.status}` }))]);
  dialogPrimary.disabled = !collection;
}
function fillCmsItem(): void {
  const collection = state().site.collections[collectionId];
  const item = collection?.items.find(item => item.id === cmsItems.value);
  cmsItemId.value = item?.id || '';
  cmsItemId.readOnly = !!item;
  cmsItemSlug.value = item?.slug || '';
  cmsItemStatus.value = item?.status || 'published';
  cmsValues.value = JSON.stringify(item?.values || Object.fromEntries((collection?.fields || []).map(field => [field.name, field.type === 'number' ? 0 : field.type === 'boolean' ? false : ''])), null, 2);
  cmsDelete.disabled = !item;
}
async function createCollection(): Promise<void> {
  const fields = cmsNewFields.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, type = 'text'] = line.split(':');
    return { name: name.trim(), type: type.trim() };
  });
  if (!cmsNewName.value.trim() || !fields.length) throw new Error('Enter a collection name and at least one field.');
  const id = uuid('collection');
  await command('collection.create', { id, name: cmsNewName.value.trim(), fields });
  collectionId = id;
  updateCms();
  fillCmsItem();
  status('Collection created.');
}
async function saveCmsItem(): Promise<void> {
  const collection: Collection | undefined = state().site.collections[collectionId];
  if (!collection) throw new Error('Create or choose a collection first.');
  const values = JSON.parse(cmsValues.value || '{}');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Item values must be a JSON object.');
  const editing = cmsItems.value;
  const id = editing || cmsItemId.value.trim() || uuid('item');
  if (!editing && collection.items.some(existing => existing.id === id)) throw new Error('An item with this ID already exists. Choose it in the list to edit it, or use another ID.');
  const item = { id, slug: cmsItemSlug.value.trim(), values, status: cmsItemStatus.value };
  await command('cms.upsert', { collection: collectionId, item });
  updateCms();
  cmsItems.value = item.id;
  fillCmsItem();
  status('CMS item saved.');
}
function updateLocales(): void {
  const locales = Object.keys(state().site.locales);
  if (!locales.includes(localeEditing)) localeEditing = state().site.defaultLocale;
  keyed(localeList, locales, locale => locale, () => {
    const row = button('', undefined, undefined, 'list-row');
    row.append(icon('globe'), element('span', 'row-label'), element('span', 'row-detail'));
    row.addEventListener('click', () => { localeEditing = row.dataset.key!; updateLocales(); fillLocale(); });
    return row;
  }, (row, locale) => {
    text(row.children[1] as HTMLElement, locale.toUpperCase());
    text(row.children[2] as HTMLElement, locale === state().site.defaultLocale ? 'Default' : '');
    row.classList.toggle('active', locale === localeEditing);
  });
  label(localeEditingLabel, 'Translations · {0}', [localeEditing.toUpperCase()]);
  localeDefault.disabled = localeEditing === state().site.defaultLocale;
  dialogPrimary.disabled = false;
}
function fillLocale(): void { translations.value = JSON.stringify(state().site.locales[localeEditing] || {}, null, 2); }
function updateTokens(): void {
  keyed(tokensList, Object.entries(state().site.tokens), item => item[0], () => {
    const row = element('div', 'tokens-row');
    const name = element('span', 'micro');
    const control = input();
    control.addEventListener('change', () => void run(() => command('token.set', { name: row.dataset.key, value: control.value }).then(() => status(t('Token --{0} updated.', [row.dataset.key!.replace(/^--/, '')])))));
    row.append(name, control);
    return row;
  }, (row, [name, content]) => {
    text(row.children[0] as HTMLElement, `--${name.replace(/^--/, '')}`);
    value(row.children[1] as HTMLInputElement, content);
  });
  inspectorExt.updateTokens(state());
}

mediaInput.addEventListener('change', () => void run(async () => {
  const file = mediaInput.files?.[0];
  if (!file) return;
  const bitmap = await createImageBitmap(file);
  const asset = await upload(file);
  if (mediaInput.dataset.mode === 'insert') {
    await insertElement('image', { url: asset.url, name: file.name, width: bitmap.width, height: bitmap.height });
  } else if (mediaInput.dataset.mode === 'brandLogo' || mediaInput.dataset.mode === 'brandLogoDark') {
    const key = mediaInput.dataset.mode;
    await command('site.update', { patch: { settings: { [key]: asset.url } } });
    status(`${key === 'brandLogo' ? 'Brand logo' : 'Dark background logo'} saved in the brand kit.`);
  } else if (mediaInput.dataset.mode === 'favicon' || mediaInput.dataset.mode === 'faviconDark') {
    const key = mediaInput.dataset.mode;
    await command('site.update', { patch: { settings: { [key]: asset.url } } });
    status(`${key === 'favicon' ? 'Site icon' : 'Dark mode icon'} set${bitmap.width !== bitmap.height ? ' (square images look best)' : ''}. Exports include icon links and site.webmanifest.`);
  } else {
    await command('node.update', { id: mediaInput.dataset.target, patch: { attrs: { src: asset.url, width: String(bitmap.width), height: String(bitmap.height) } } });
    status('Image uploaded and attached. It is bundled in site exports.');
  }
  bitmap.close();
  mediaInput.value = '';
}));
async function loadProjectFile(file: Blob): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    await replace('/api/load', new Blob([file], { type: 'application/zip' }));
  } else {
    let data: { site?: unknown };
    try { data = JSON.parse(await file.text()); } catch { throw new Error('That file is not a .fweb project, a .fpub package or project JSON.'); }
    await replace('/api/load', data.site ? data : { site: data });
  }
}
importer.addEventListener('change', () => void run(async () => {
  const file = importer.files?.[0];
  importer.value = '';
  if (!file) return;
  closeDialog();
  if (!(await mayReplace())) return;
  await loadProjectFile(file);
  status(`Imported "${file.name}".`);
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !scrim.hidden) { closeDialog(); event.preventDefault(); return; }
  if (!scrim.hidden && event.key === 'Tab') {
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')).filter(node => !node.closest('[hidden]') && !(node as HTMLButtonElement).disabled);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
  }
});
const runtimePreview = new RuntimePreview(stage, canvas.outer, status);
const fullPreview = new FullPreview(overlay, { state, page: () => pageId, locale: () => locale, width: id => widths[id], back: previewButton, notify: status });
const featureStudio = new FeatureStudio({
  selection: () => ({ node: selectedId, page: pageId, breakpoint, locale, width: widths[breakpoint] }),
  notify: status,
  selectNode,
  selectPage: id => { pageId = id; selectedId = currentPage().root; update(state()); }
}, overlay);
document.addEventListener('fw:open-studio', event => { const detail = (event as CustomEvent<{ category: string; action: string }>).detail; featureStudio.open(detail.category, detail.action); });
const ready = (): boolean => !!lastState;
const notRoot = (): boolean => !!lastState && currentNode().id !== currentPage().root;
function insideLinkedInstance(id: string): boolean {
  const nodes = state().site.nodes;
  for (let at: SiteNode | undefined = nodes[id]; at; at = parentOf(at.id)) if (at.componentId || at.componentSourceId) return true;
  return false;
}
const canDuplicate = (): boolean => isMulti() ? anyCopyable() : notRoot() && !!scrim.hidden && !insideLinkedInstance(currentNode().id);
async function duplicateSelection(): Promise<void> {
  if (isMulti()) return duplicateSelected();
  const original = currentNode().id;
  const next = await command('node.duplicate', { id: original });
  const parent = Object.values(next.site.nodes).find(node => node.children.includes(original));
  const copy = parent?.children[parent.children.indexOf(original) + 1];
  if (copy) selectNode(copy);
  status('Element duplicated.');
}
const FRAGMENT_FORMAT = 'com.nodemode.formweb.fragment';
function parseFragment(raw: string): Record<string, unknown> | null {
  if (raw.length < 20 || raw.length > 9_000_000 || raw.trimStart()[0] !== '{') return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return value && value.format === FRAGMENT_FORMAT && value.version === 1 ? value : null;
  } catch { return null; }
}
// The browser keeps Mod+C and Mod+X while text is selected outside the canvas (panels, code views, the status line).
function panelTextSelected(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim() !== '' && !stage.contains(selection.anchorNode);
}
// Returns how many assets wait behind the clip link (they paste only on this computer) and how many are not carried at all.
async function copyFragment(): Promise<{ behind: number; left: number }> {
  const fragment = await request<Record<string, unknown>>('/api/fragment', { node: currentNode().id, embed: true, clip: true });
  if (!navigator.clipboard?.writeText) throw new Error('This browser does not allow writing to the clipboard here.');
  await navigator.clipboard.writeText(JSON.stringify(fragment));
  const clip = fragment.clip as { ids?: unknown } | null | undefined;
  const behindIds = clip && typeof clip === 'object' && Array.isArray(clip.ids) ? clip.ids : [];
  const notCarried = Array.isArray(fragment.notEmbedded) ? fragment.notEmbedded.filter(id => !behindIds.includes(id)) : [];
  return { behind: behindIds.length, left: notCarried.length };
}
const notEmbeddedNote = (count: number): string => count === 1 ? ' ' + t('One asset is too large to embed and will only paste on this FormWeb.') : count > 1 ? ' ' + t('{0} assets are too large to embed and will only paste on this FormWeb.', [count]) : '';
const behindClipNote = (count: number): string => count === 1 ? ' ' + t('One asset is too large to embed and will only paste on this computer.') : count > 1 ? ' ' + t('{0} assets are too large to embed and will only paste on this computer.', [count]) : '';
const copyNote = (copied: { behind: number; left: number }): string[] => [behindClipNote(copied.behind), notEmbeddedNote(copied.left)];
async function copySelection(): Promise<void> {
  if (isMulti()) return copySelected();
  if (!canDuplicate()) return;
  const copied = await copyFragment();
  status(['Element copied.', ...copyNote(copied)]);
}
async function cutSelection(): Promise<void> {
  if (isMulti()) return cutSelected();
  if (!canDuplicate()) return;
  const id = currentNode().id;
  const copied = await copyFragment();
  await command('node.remove', { id });
  status(['Element cut. Paste puts it back; Undo restores it in place.', ...copyNote(copied)]);
}
async function pasteFragmentText(raw: string): Promise<boolean> {
  if (await pasteMany(raw)) return true;
  const fragment = parseFragment(raw);
  if (!fragment) return false;
  const before = new Set(Object.keys(state().site.nodes));
  const selected = currentNode();
  const owner = selected.id === currentPage().root ? undefined : parentOf(selected.id);
  const parentId = owner ? owner.id : currentPage().root;
  const { embedded, clip, ...bare } = fragment;
  const body: Record<string, unknown> = { fragment: bare, parent: parentId };
  if (embedded && typeof embedded === 'object') body.embedded = embedded;
  if (clip && typeof clip === 'object') body.clip = clip;
  if (owner) body.index = owner.children.indexOf(selected.id) + 1;
  const result = await libraryMutate<{ state?: EditorState; root?: string }>('/api/paste', body);
  const next = 'site' in result ? (result as unknown as EditorState) : result.state ? accept(result.state) : state();
  const made = result.root && next.site.nodes[result.root] ? result.root : next.site.nodes[parentId]?.children.find(child => !before.has(child));
  if (made) selectNode(made);
  status('Element pasted.');
  return true;
}
async function pasteFromClipboard(): Promise<void> {
  if (!scrim.hidden || !ready()) return;
  if (!navigator.clipboard?.readText) throw new Error('This browser does not allow reading the clipboard here. Click in the page and paste with the keyboard instead.');
  let raw = '';
  try { raw = await navigator.clipboard.readText(); } catch { throw new Error('Allow clipboard access to paste an element, or paste with the keyboard in the page.'); }
  if (!(await pasteFragmentText(raw))) status('The clipboard does not hold a copied element.', true);
}
document.addEventListener('paste', event => {
  if (!scrim.hidden || !ready() || event.defaultPrevented) return;
  if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .xterm, .ft-dock, .ft-consent, .ft-tour, [data-no-keys]')) return;
  const raw = event.clipboardData?.getData('text/plain') || '';
  if (!parseFragment(raw) && !holdsMany(raw)) return;
  event.preventDefault();
  void run(() => pasteFragmentText(raw));
});
function showLayerMenu(event: MouseEvent | KeyboardEvent, id: string): void {
  event.preventDefault();
  if (event instanceof MouseEvent && ctrlClickOffMac(event)) return;
  if (!isSelected(id)) selectNode(id);
  const allowed = canDuplicate();
  const many = isMulti() ? topMost().length : 1;
  const rows: [string, string, string, boolean, () => Promise<void>][] = [
    ['edit.copy', countLabel('Copy element', 'Copy {0} elements', many), 'A page root or an element inside a linked component instance cannot be copied', allowed, copySelection],
    ['edit.cut', countLabel('Cut element', 'Cut {0} elements', many), 'A page root or an element inside a linked component instance cannot be cut', allowed, cutSelection],
    ['edit.paste', 'Paste element', 'Paste is not available while a dialog is open', !!scrim.hidden, pasteFromClipboard],
    ['edit.duplicate', countLabel('Duplicate', 'Duplicate {0} elements', many), 'A page root or an element inside a linked component instance cannot be duplicated', allowed, duplicateSelection]
  ];
  const entries: MenuEntry[] = rows.map(([commandId, english, blocked, enabledNow, action]) => ({ id: commandId, label: english, title: enabledNow ? english : blocked, enabled: enabledNow, keys: commandRegistry.keyLabel(commandRegistry.get(commandId)!), run: action }));
  entries.push(...panel.layerEntries(id), ...converter.entries(id));
  const row = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const anchor = !(event instanceof MouseEvent) ? row ?? { x: 0, y: 0 } : row ? anchorOf(event, row) : { x: event.clientX, y: event.clientY };
  showContextMenu(entries, anchor, { host: overlay, className: 'fw-layer-menu', run, returnFocus: row });
}
const setBreakpoint = (id: string): void => { breakpoint = id; update(state()); };
const insertKinds: [string, string][] = [['section', 'Section'], ['heading', 'Heading'], ['paragraph', 'Paragraph'], ['button', 'Button'], ['image', 'Image'], ['grid', 'Grid'], ['form', 'Form'], ['link', 'Link'], ['embed', 'Embed media']];
setRunner(run);
registerCommands([
  { id: 'file.home', label: 'Home', menu: 'File', keys: ['Alt+Mod+H'], run: () => home.show() },
  { id: 'file.new', label: 'New site...', menu: 'File', run: () => openDialog('new') },
  { id: 'file.projects', label: 'Open project...', menu: 'File', run: () => openDialog('projects'), enabled: ready },
  { id: 'file.import', label: 'Import .fweb or .fpub file...', menu: 'File', run: () => importer.click() },
  { id: 'file.import-html', label: 'Import HTML files...', menu: 'File', run: () => { if (home.isShown) home.dismiss(); if (layout.state.left !== 'open' || activeSidebar !== 'library') toggleLeft('library'); libraryPanel.importHtml(); }, enabled: ready },
  { id: 'file.import-site', label: 'Import site from zip...', menu: 'File', run: () => { if (home.isShown) home.dismiss(); if (layout.state.left !== 'open' || activeSidebar !== 'library') toggleLeft('library'); libraryPanel.importSite(); }, enabled: ready },
  { id: 'file.save', label: 'Save', menu: 'File', keys: ['Mod+S'], global: true, group: 1, run: saveProject, enabled: ready },
  { id: 'file.download', label: 'Download .fweb project', menu: 'File', group: 1, run: downloadProject, enabled: ready },
  { id: 'file.export', label: 'Export static site', menu: 'File', group: 2, run: exportSite, enabled: () => ready() && !isBusy(exportButton) },
  { id: 'file.send-formpublisher', label: 'Send to FormPublisher', menu: 'File', group: 2, run: sendToFormPublisher, enabled: ready },
  { id: 'file.publish', label: 'Publish...', menu: 'File', group: 2, run: () => openDialog('publish'), enabled: ready },
  { id: 'edit.undo', label: 'Undo', menu: 'Edit', keys: ['Mod+Z'], repeat: true, run: () => command('history.undo').then(() => status('Undone.')), enabled: () => !!lastState?.canUndo },
  { id: 'edit.redo', label: 'Redo', menu: 'Edit', keys: ['Mod+Shift+Z'], repeat: true, run: () => command('history.redo').then(() => status('Redone.')), enabled: () => !!lastState?.canRedo },
  { id: 'edit.copy', label: 'Copy element', menu: 'Edit', keys: ['Mod+C'], group: 1, run: copySelection, enabled: canDuplicate, native: panelTextSelected },
  { id: 'edit.cut', label: 'Cut element', menu: 'Edit', keys: ['Mod+X'], group: 1, run: cutSelection, enabled: canDuplicate, native: panelTextSelected },
  { id: 'edit.paste', label: 'Paste element', menu: 'Edit', keys: ['Mod+V'], group: 1, run: pasteFromClipboard, enabled: () => ready() && !!scrim.hidden, native: () => true },
  { id: 'edit.duplicate', label: 'Duplicate element', menu: 'Edit', keys: ['Mod+D', 'Shift+Mod+D'], group: 1, run: () => {
    const typed = window.event;
    const forced = typed instanceof KeyboardEvent && typed.shiftKey;
    const again = commandRegistry.get('vector.transform-again');
    if (!forced && again && commandRegistry.enabled(again)) { runCommand('vector.transform-again'); return; }
    return canDuplicate() ? duplicateSelection() : undefined;
  }, enabled: () => canDuplicate() || (() => { const again = commandRegistry.get('vector.transform-again'); return !!again && commandRegistry.enabled(again); })() },
  { id: 'edit.delete', label: 'Delete element', menu: 'Edit', keys: ['Delete', 'Backspace'], group: 1, run: () => isMulti() ? removeSelected() : command('node.remove', { id: currentNode().id }), enabled: () => (isMulti() ? anyRemovable() : notRoot()) && !!scrim.hidden },
  { id: 'image.remove-background', label: 'Remove background...', menu: 'Edit', group: 1, run: () => openDialog('background'), enabled: () => ready() && currentNode().tag === 'img' && /\/api\/assets\//.test(currentNode().attrs['data-fw-original-src'] || currentNode().attrs.src || '') },
  { id: 'image.edit-in-formvis', label: 'Edit in formvis', menu: 'Edit', group: 1, run: () => run(async () => { const result = await request<{ message: string }>('/api/formvis/send', { node: currentNode().id }); status(result.message); }), enabled: () => ready() && currentNode().tag === 'img' && /\/api\/assets\/[0-9a-f]{64}\.(png|jpg|gif|webp)/.test(currentNode().attrs.src || '') },
  { id: 'image.update-from-formvis', label: 'Update from formvis', menu: 'Edit', group: 1, run: () => run(async () => { const result = await mutateVia<{ message: string; state: EditorState }>('/api/formvis/update', { node: currentNode().id }); status(result.message); }), enabled: () => ready() && currentNode().tag === 'img' },
  { id: 'edit.settings', label: 'Settings...', menu: 'Edit', keys: ['Mod+,'], group: 2, run: () => openDialog('settings') },
  ...insertKinds.map(([kind, label]) => ({ id: `insert.${kind}`, label, menu: 'Insert', run: () => insertElement(kind), enabled: ready })),
  { id: 'insert.quick', label: 'Quick insert', menu: 'Insert', keys: ['Mod+Shift+L'], group: 1, run: () => { home.dismiss(); openDock('left'); setSidebar('pages'); insertFlyout.toggle(layersAdd); }, enabled: ready },
  { id: 'insert.panel', label: 'Elements and components', menu: 'Insert', group: 1, run: () => setSidebar('insert') },
  { id: 'insert.stock', label: 'Stock icons and photos...', menu: 'Insert', group: 1, run: () => openDialog('stock'), enabled: ready },
  { id: 'page.add', label: 'Add page...', menu: 'Page', run: () => openDialog('page'), enabled: ready },
  { id: 'page.generate', label: 'Generate pages from a description...', menu: 'Page', run: () => openDialog('generate-site'), enabled: ready },
  { id: 'page.settings', label: 'Page settings', menu: 'Page', run: () => { openDock('right'); setInspector('page'); }, enabled: ready },
  { id: 'page.password', label: 'Password protect this page', menu: 'Page', group: 2, run: async () => {
    if (passwordInput.value.length < 6) { openDock('right'); setInspector('page'); passwordInput.focus(); status('Type a password of at least 6 characters in Page settings > Password, then choose Protect page.', true); return; }
    await setPagePassword(passwordInput.value);
  }, enabled: ready },
  { id: 'page.password-remove', label: 'Remove page password', menu: 'Page', group: 2, run: () => setPagePassword(null), enabled: () => !!lastState && gateFor(currentPage().slug) === '/' + currentPage().slug.replace(/^\/+|\/+$/g, '') },
  { id: 'page.bulk', label: 'Bulk create from CSV...', menu: 'Page', run: () => openDialog('bulk'), enabled: ready },
  { id: 'page.qr', label: 'QR code for this page...', menu: 'Page', group: 2, run: () => openDialog('qr'), enabled: ready },
  { id: 'site.favicon', label: 'Set site icon...', menu: 'Page', group: 3, run: () => { mediaInput.dataset.mode = 'favicon'; mediaInput.click(); }, enabled: ready },
  { id: 'site.favicon-dark', label: 'Set dark mode icon...', menu: 'Page', group: 3, run: () => { mediaInput.dataset.mode = 'faviconDark'; mediaInput.click(); }, enabled: ready },
  { id: 'site.favicon-clear', label: 'Clear site icons', menu: 'Page', group: 3, run: async () => { await command('site.update', { patch: { settings: { favicon: '', faviconDark: '' } } }); status('Site icons cleared.'); }, enabled: () => !!lastState?.site.settings?.favicon || !!lastState?.site.settings?.faviconDark },
  { id: 'page.delete', label: 'Delete page...', menu: 'Page', group: 1, run: () => openDialog('delete-page'), enabled: () => !!lastState && lastState.site.pages.length > Math.max(1, selectedPageIds().length) },
  { id: 'page.audit', label: 'Run SEO and accessibility audit', menu: 'Page', group: 2, run: auditSite, enabled: ready },
  { id: 'arrange.up', label: 'Move layer up', menu: 'Arrange', run: () => isMulti() ? stepSelected(-1) : moveLayer(-1), enabled: () => isMulti() ? canStep(-1) : notRoot() },
  { id: 'arrange.down', label: 'Move layer down', menu: 'Arrange', run: () => isMulti() ? stepSelected(1) : moveLayer(1), enabled: () => isMulti() ? canStep(1) : notRoot() },
  { id: 'cms.collections', label: 'Collections...', menu: 'CMS', run: () => openDialog('cms'), enabled: ready },
  { id: 'cms.locales', label: 'Localization...', menu: 'CMS', run: () => openDialog('locales'), enabled: ready },
  { id: 'view.desktop', label: 'Desktop', menu: 'View', run: () => setBreakpoint('desktop'), checked: () => breakpoint === 'desktop', enabled: ready },
  { id: 'view.tablet', label: 'Tablet', menu: 'View', run: () => setBreakpoint('tablet'), checked: () => breakpoint === 'tablet', enabled: ready },
  { id: 'view.mobile', label: 'Mobile', menu: 'View', run: () => setBreakpoint('mobile'), checked: () => breakpoint === 'mobile', enabled: ready },
  { id: 'view.preview', label: 'Live responsive preview', menu: 'View', group: 1, run: () => { preview = !preview; update(state()); }, checked: () => preview, enabled: ready },
  { id: 'view.refresh', label: 'Refresh live responsive preview', menu: 'View', group: 1, run: () => { runtimePreview.refresh(); if (!preview) { preview = true; update(state()); } }, enabled: ready },
  { id: 'view.preview-full', label: 'Preview as published', menu: 'View', keys: ['Mod+Shift+P'], group: 1, run: () => fullPreview.toggle(), enabled: ready },
  { id: 'view.theme', label: 'Light theme', menu: 'View', group: 2, run: () => setTheme(readChoice().theme === 'light' ? 'studio' : 'light'), checked: () => readChoice().theme === 'light' },
  { id: 'view.design-controls', label: 'Show controls in Design fields', menu: 'View', group: 2, run: () => { controlKit.setDefaultRaw(!controlKit.defaultRaw()); status(controlKit.defaultRaw() ? 'Design fields show the CSS text only.' : 'Design fields show their controls.'); }, checked: () => !controlKit.defaultRaw() },
  { id: 'view.try-choices', label: 'Try choices before keeping them', menu: 'View', group: 2, run: () => { tryKit.setEnabled(!tryKit.enabled()); tryChoices.checked = tryKit.enabled(); status(tryKit.enabled() ? 'A clicked choice now shows on the page until you press Keep.' : 'Clicked choices are now written at once.'); }, checked: () => tryKit.enabled() },
  { id: 'view.search', label: 'Search commands', menu: 'View', keys: ['Mod+K'], global: true, group: 2, run: () => commandSearch.show() },
  { id: 'view.menus-in-window', label: 'Menus in Window', menu: 'View', group: 2, enabled: desktopMac, checked: menusInWindow, run: () => { const on = !menusInWindow(); setMenusInWindow(on); status(on ? 'The menus stay in the window from the next start.' : 'The menus go to the menu bar from the next start.'); } },
  { id: 'window.layers', label: 'Pages and layers', menu: 'Window', run: () => toggleLeft('pages'), checked: () => activeSidebar === 'pages' && layout.state.left === 'open' },
  { id: 'window.insert', label: 'Insert', menu: 'Window', run: () => toggleLeft('insert'), checked: () => activeSidebar === 'insert' && layout.state.left === 'open' },
  { id: 'window.library', label: 'Library', menu: 'Window', run: () => toggleLeft('library'), checked: () => activeSidebar === 'library' && layout.state.left === 'open' },
  { id: 'window.design', label: 'Design inspector', menu: 'Window', group: 1, run: () => { openDock('right'); setInspector('design'); }, checked: () => activeInspector === 'design' && layout.state.right === 'open' },
  { id: 'window.motion', label: 'Motion inspector', menu: 'Window', group: 1, run: () => { openDock('right'); setInspector('motion'); }, checked: () => activeInspector === 'motion' && layout.state.right === 'open' },
  { id: 'window.content', label: 'Content inspector', menu: 'Window', group: 1, run: () => { openDock('right'); setInspector('content'); }, checked: () => activeInspector === 'content' && layout.state.right === 'open' },
  { id: 'inspector.search', label: 'Search properties', menu: 'Window', keys: ['Mod+Alt+F'], global: true, group: 1, run: () => { openDock('right'); inspectorSearch.focus(); } },
  { id: 'window.toggle-left', label: 'Left panel', menu: 'Window', keys: ['Mod+['], global: true, group: 4, run: () => { layout.set({ left: layout.state.left === 'open' ? 'collapsed' : 'open' }); rail.refresh(); }, checked: () => layout.state.left === 'open' },
  { id: 'window.toggle-right', label: 'Right panel', menu: 'Window', keys: ['Mod+]'], global: true, group: 4, run: () => layout.set({ right: layout.state.right === 'open' ? 'collapsed' : 'open' }), checked: () => layout.state.right === 'open' },
  { id: 'window.toggle-rail', label: 'Rail labels', menu: 'Window', group: 4, run: () => layout.set({ rail: layout.state.rail === 'labels' ? 'icons' : 'labels' }), checked: () => layout.state.rail === 'labels' },
  ...PRESETS.map(preset => ({ id: `workspace.${preset.id}`, label: `${preset.label} workspace`, menu: 'Window', group: 5, run: () => usePreset(preset.id), checked: () => layout.preset === preset.id })),
  { id: 'workspace.reset', label: 'Reset this workspace', menu: 'Window', group: 5, run: () => { layout.resetPreset(); rail.refresh(); } },
  { id: 'window.tokens', label: 'Design system...', menu: 'Window', group: 2, run: () => openDialog('tokens'), enabled: ready },
  { id: 'window.brand', label: 'Brand kit...', menu: 'Window', group: 2, run: () => openDialog('brand'), enabled: ready },
  { id: 'window.team', label: 'Team libraries...', menu: 'Window', group: 2, run: () => openDialog('team'), enabled: ready },
  { id: 'window.studio', label: 'Website studio...', menu: 'Window', group: 2, run: () => featureStudio.button.click(), enabled: ready },
  { id: 'window.agents', label: 'Agent Connect', menu: 'Window', group: 3, run: () => toggleLeft('agents'), checked: () => activeSidebar === 'agents' && layout.state.left === 'open' },
  { id: 'agents.toggle', label: 'Allow agents (MCP and terminal)', menu: 'Window', group: 3, run: () => agentsButton.click(), checked: () => agentsEnabled },
  { id: 'view.terminal', label: 'Terminal', menu: 'View', keys: ['Mod+`'], global: true, group: 3, run: () => agentDock?.toggle(), checked: () => agentDock?.isOpen() === true },
  { id: 'terminal.new', label: 'New terminal session', menu: 'View', group: 3, run: () => dockHost.launch('shell') },
  { id: 'terminal.codex', label: 'Codex', menu: 'View', group: 3, run: () => dockHost.launch('codex') },
  { id: 'terminal.cursor', label: 'Cursor agent', menu: 'View', group: 3, run: () => dockHost.launch('cursor') },
  { id: 'terminal.doctor', label: 'formweb doctor', menu: 'View', group: 3, run: () => dockHost.launch('doctor') },
  { id: 'terminal.run-list', label: 'formweb run --list', menu: 'View', group: 3, run: () => dockHost.launch('run') },
  { id: 'terminal.toggle', label: 'Toggle agent dock', menu: 'View', keys: ['Mod+J'], global: true, group: 3, run: () => agentDock?.toggle(), checked: () => agentDock?.isOpen() === true },
  { id: 'claude.open', label: 'Claude Code', menu: 'View', keys: ['Mod+Shift+J'], global: true, group: 3, run: () => agentDock?.show('claude') },
  { id: 'chat.open', label: 'Chat with Claude', menu: 'View', keys: ['Mod+Alt+J'], global: true, group: 3, run: () => agentDock?.show('chat') },
  { id: 'help.guide', label: 'Using FormWeb', menu: 'Help', run: () => openDialog('help') }
]);
const panel = installPanel({ state, ready, command, commands, overlay, pagesList, layersList, run, status, pageId: () => pageId, openPage, selected: () => selectedId, select: selectNode, pageSettings: () => { openDock('right'); setInspector('page'); }, elementSettings: () => { openDock('right'); setInspector('design'); }, refresh: () => update(state()), gates: async () => { await loadPasswordGates(true); return passwordGates; } });
registerCommands(panel.commands);
installSelection({ ready, site: () => state().site, primary: () => selectedId, select: selectNode, pageId: () => pageId, openPage, pageRoot: () => currentPage().root, refresh: () => update(state()), layersList, pagesList });
installSelectionActions({ idle: () => !!scrim.hidden, pageRoot: () => currentPage().root, status, copyNote });
registerCommands(installSelectMode({ heads: [{ head: pagesHead, kind: 'pages' }, { head: layersHead, kind: 'layers' }], lists: [pagesList, layersList], frame: canvas.frame, loaded: canvas.loaded(), ready, status: message => status(message) }));
registerCommands(installCanvasDrag({ frame: canvas.frame, stage, overlay, loaded: () => canvas.loaded(), state, ready, editing: () => !preview, root: () => currentPage().root, selectionIds: selectedIds, select: selectNode, commands, run, status }).commands);
registerCommands(installHoverOutline({ frame: canvas.frame, loaded: () => canvas.loaded(), list: layersList, ready, editing: () => !preview && !fullPreview.isOpen, busy: () => insertFlyout.isOpen() || !scrim.hidden || tryKit.busy(), root: () => currentPage().root, selectionIds: selectedIds, status: message => status(message) }));
const vector = installVector({ canvas, getSelected: () => selectedId, select: selectNode, pageRoot: () => currentPage().root, notify: message => status(message, true), panelHost: document.body });
registerCommands(vector.commands);
const wishlist = installWishlist({ state, commands: batch => commands(batch), selected: () => selectedId, select: selectNode, notify: status, audit: () => request<{ issues: AuditIssue[] }>('/api/audit') });
registerCommands(wishlist.commands);
registerCommands(pageBackground.commands);
registerCommands(installCanvasMenu({ frame: canvas.frame, loaded: canvas.loaded(), overlay, ready, run, status, selected: () => selectedId, select: selectNode, selectionIds: selectedIds, topMost, selectNodes, pageRoot: () => currentPage().root, breakpoint: () => breakpoint, canDuplicate, copy: copySelection, cut: cutSelection, paste: pasteFromClipboard, duplicate: duplicateSelection, inspector: tab => { openDock('right'); setInspector(tab); }, field: (kind, key) => (kind === 'style' ? styleFields : attrsFields).get(key) }).commands);
subscribe(() => wishlist.refresh());
const converter = installConvert({ overlay, selected: () => selectedId, select: selectNode, ready, notify: (message, undo) => notice.show(message, undo ? { action: { label: 'Undo', run: undo } } : {}), status, run, undo: () => command('history.undo') });
registerCommands(converter.commands);
const mayReplace = async (): Promise<boolean> => !(await unsavedWork()) || home.askReplace(state().site.name);
const demoHooks: DemoHooks = { mayReplace: () => { demoPreview.close(); return mayReplace(); }, load: loadProjectFile, opened: () => home.dismiss(), notify: message => status(message), failed: message => { status(message, true); home.notice(message); } };
const demoPreview = new DemoPreview(id => void openDemo(demoHooks, id));
registerCommands(demoCommands(demoHooks, ready, { show: id => demoPreview.show(id), close: () => demoPreview.close(), isOpen: () => demoPreview.isOpen }));
commandRegistry.intercept = id => tryKit.intercept(id);
commandRegistry.gate = item => (!demoPreview.isOpen || item.id.startsWith('demo.')) && (!fullPreview.isOpen || item.id === 'view.preview-full');
menubar.build();
menubar.blocked = () => !scrim.hidden || featureStudio.opened || demoPreview.isOpen || fullPreview.isOpen;
if (wantsNativeMenus()) {
  const nativeMenus = new NativeMenus(commandRegistry, () => menus);
  void nativeMenus.build().catch(() => undefined);
  subscribe(() => nativeMenus.refresh());
  onLanguage(() => { void nativeMenus.build().catch(() => undefined); });
}
startPageTranslator();
watchHelp(inspector);
exposeToAgents();
installKeymap(commandRegistry, () => !!lastState && !featureStudio.opened);
document.addEventListener('click', event => {
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-cmd]');
  if (target && !(target as HTMLButtonElement).disabled) runCommand(target.dataset.cmd || '');
});
startCatalogue();
document.addEventListener('nm:ui-settings-changed', () => { themeSelect.value = readChoice().theme; themeButton.classList.toggle('is-on', readChoice().theme === 'light'); });
const workspaceSelect = select(PRESETS.map(preset => ({ id: preset.id, name: preset.label })));
workspaceSelect.className = 'fw-tt-select';
workspaceSelect.title = 'Workspace layout';
workspaceSelect.setAttribute('aria-label', 'Workspace layout');
workspaceSelect.addEventListener('change', () => usePreset(workspaceSelect.value));
titleTools.insertBefore(workspaceSelect, commandSearch.popup);
function usePreset(id: string): void {
  const preset = layout.usePreset(id);
  workspaceSelect.value = preset.id;
  setInspector(preset.inspector);
  setSidebar(preset.sidebar);
}
subscribe(update);
const home = new HomeScreen(app, {
  files: {
    list: async tab => (await request<{ projects: { id: string; name: string; updatedAt: string }[] }>('/api/projects')).projects.map(project => ({ key: project.id, name: project.name, kind: 'FWEB', size: 0, when: Date.parse(project.updatedAt) || 0 })).sort((a, b) => b.when - a.when).slice(0, tab === 'recent' ? RECENT_MAX : undefined),
    open: item => void run(async () => {
      if (!(await mayReplace())) return;
      await replace(`/api/projects/${encodeURIComponent(item.key)}/open`, {});
      home.dismiss();
      status('Project opened.');
    })
  },
  templates: STARTER_SITES.map(entry => ({ id: entry.id, name: entry.label, pages: entry.pages.length })),
  run: id => { runCommand(id); },
  create: id => void run(async () => {
    if (!(await mayReplace())) return;
    await createSite(id ? STARTER_SITES.find(entry => entry.id === id)?.label || 'Untitled website' : 'Untitled website', id);
    home.dismiss();
    status('New site created.');
  }),
  demo: id => void openDemo(demoHooks, id),
  preview: (id, opener) => demoPreview.show(id, opener)
});
subscribe(next => home.sync(next.site.id, next.site.name));
const brandButton = brand;
brandButton.setAttribute('role', 'button');
brandButton.tabIndex = 0;
brandButton.setAttribute('aria-label', 'Home');
brandButton.title = 'Home';
brandButton.addEventListener('click', () => home.show());
brandButton.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); home.show(); } });
workspaceSelect.value = layout.preset;
setInspector(layout.presetInfo().inspector);
setSidebar(layout.presetInfo().sidebar);
const dock = new Dock(dockHost.adapter);
agentDock = dock;
dock.onTab = () => { dockHost.syncButtons(); rail.refresh(); };
dock.onChange = () => { dockHost.syncButtons(); rail.refresh(); };
void run(async () => {
  await connect(connected => {
    statusDot.classList.toggle('offline', !connected);
    text(connectionLabel, connected ? 'Rust engine connected' : 'Live connection interrupted');
  });
  const system = await request<{ version: string; engine: string; agentsEnabled: boolean }>('/api/system');
  agentsEnabled = system.agentsEnabled;
  updateAgents();
  void agentConnect.refresh().catch(() => undefined);
  dock.mount(workspace);
  dockHost.syncButtons();
  status('Ready. Select an element, or open Insert to add content.');
  watchOpenedFiles(file => run(async () => {
    if (!(await mayReplace())) return;
    await loadProjectFile(file);
    status('Project opened.');
  }));
}).finally(() => { dock.mount(workspace); revealApp(); });
