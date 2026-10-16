import { request, subscribe } from '../api';
import '../styles/commands.css';
import { commands, type Command, type CommandParam } from './registry';

export interface CatalogueEntry {
  id: string;
  label: string;
  keys: string[];
  group: string;
  menu: string | null;
  description: string;
  when: string;
  params: Record<string, CommandParam>;
  mutates: boolean;
  risky: boolean;
  enabled: boolean;
  checked: boolean | null;
}

interface Meta { description: string; flags?: string; when?: string }

const META: Record<string, Meta> = {
  'file.new': { description: 'Open the New site dialog to start an empty site in the engine.', flags: 'mr', when: 'Use when the person wants a blank site; it replaces the open site.' },
  'file.projects': { description: 'Open the saved projects list to load one.', flags: 'm', when: 'Use when switching to another saved project.' },
  'file.import': { description: 'Pick a .fweb project file from disk and load it into the editor.', flags: 'mr', when: 'Use when the person gives a project file to open; it replaces the open site.' },
  'file.save': { description: 'Save the open site as a local project.', flags: 'm', when: 'Use after a set of edits the person wants kept.' },
  'file.download': { description: 'Download the open site as a .fweb project file.' },
  'file.export': { description: 'Export the open site as a portable static HTML ZIP.', flags: 'm' },
  'file.publish': { description: 'Open the Publish dialog to create a published snapshot served by this backend.', flags: 'mr', when: 'Use only when the person asks to publish.' },
  'edit.undo': { description: 'Undo the last site change, like Ctrl+Z.', flags: 'm', when: 'Use to reverse the last edit.' },
  'edit.redo': { description: 'Redo the change that was undone.', flags: 'm' },
  'edit.delete': { description: 'Delete the selected element (not a page root).', flags: 'mr', when: 'Use when the person asks to remove the selected element.' },
  'edit.settings': { description: 'Open Settings (theme, workspace and editor options).' },
  'image.remove-background': { description: 'Open the background remover for the selected image.', flags: 'm' },
  'image.edit-in-formvis': { description: 'Send the selected image to the formvis window for editing.' },
  'image.update-from-formvis': { description: 'Bring the edited picture back from formvis into the selected image.', flags: 'm' },
  'insert.section': { description: 'Insert a section into the selected container.', flags: 'm' },
  'insert.heading': { description: 'Insert a heading into the selected container.', flags: 'm' },
  'insert.paragraph': { description: 'Insert a paragraph into the selected container.', flags: 'm' },
  'insert.button': { description: 'Insert a button into the selected container.', flags: 'm' },
  'insert.image': { description: 'Insert an image into the selected container.', flags: 'm' },
  'insert.grid': { description: 'Insert a grid into the selected container.', flags: 'm' },
  'insert.form': { description: 'Insert a form into the selected container.', flags: 'm' },
  'insert.link': { description: 'Insert a link into the selected container.', flags: 'm' },
  'insert.embed': { description: 'Insert an embed (media) element into the selected container.', flags: 'm' },
  'insert.panel': { description: 'Show the Elements and components panel.' },
  'insert.stock': { description: 'Open the stock icons and photos library.', flags: 'm' },
  'page.add': { description: 'Open the Add page dialog.', flags: 'm' },
  'page.generate': { description: 'Open the dialog that drafts pages from a description.', flags: 'm' },
  'page.settings': { description: 'Show the Page settings inspector (name, slug, SEO, password).' },
  'page.password': { description: 'Protect the open page with the password typed in Page settings.', flags: 'mr' },
  'page.password-remove': { description: 'Remove the password protection of the open page.', flags: 'mr' },
  'page.bulk': { description: 'Open the bulk page creator that makes one page per CSV row.', flags: 'm' },
  'page.qr': { description: 'Open the QR code dialog for the open page.' },
  'site.favicon': { description: 'Pick the site icon image.', flags: 'm' },
  'site.favicon-dark': { description: 'Pick the dark mode site icon image.', flags: 'm' },
  'site.favicon-clear': { description: 'Remove both site icons.', flags: 'mr' },
  'page.delete': { description: 'Open the delete page confirmation for the open page.', flags: 'mr', when: 'Use only when the person asks to delete a page.' },
  'page.audit': { description: 'Run the SEO and accessibility audit and list the findings.' },
  'arrange.up': { description: 'Move the selected layer up among its siblings.', flags: 'm' },
  'arrange.down': { description: 'Move the selected layer down among its siblings.', flags: 'm' },
  'cms.collections': { description: 'Open the CMS collections dialog.' },
  'cms.locales': { description: 'Open the localization dialog.' },
  'view.desktop': { description: 'Switch the canvas to the desktop breakpoint.' },
  'view.tablet': { description: 'Switch the canvas to the tablet breakpoint.' },
  'view.mobile': { description: 'Switch the canvas to the mobile breakpoint.' },
  'view.preview': { description: 'Toggle the compiled runtime preview.' },
  'view.refresh': { description: 'Refresh the compiled runtime preview.' },
  'view.theme': { description: 'Switch between the light and dark editor theme.' },
  'view.search': { description: 'Open the command search.' },
  'vector.lasso': { description: 'Lasso tool: drag a freehand loop to select the shapes (or anchors, in direct selection mode) inside it; Shift adds, Alt removes.' },
  'vector.wand': { description: 'Magic Wand tool: click a shape to select every shape in the same SVG with a similar fill, stroke, weight or opacity (tolerances in the Vector panel Select section).' },
  'vector.eyedropper': { description: 'Eyedropper tool: click a shape to copy its fill, stroke, weight, opacity and dash onto the selected shapes as one undo step.' },
  'vector.select.same-fill': { description: 'Select every shape in the SVG with the same fill color as the first selected shape.' },
  'vector.select.same-stroke': { description: 'Select every shape in the SVG with the same stroke color as the first selected shape.' },
  'vector.select.same-weight': { description: 'Select every shape in the SVG with the same stroke weight as the first selected shape.' },
  'vector.select.same-opacity': { description: 'Select every shape in the SVG with the same opacity as the first selected shape.' },
  'vector.select.same-fill-stroke': { description: 'Select every shape in the SVG with the same fill and stroke as the first selected shape.' },
  'vector.select.inverse': { description: 'Select every visible shape in the SVG that is not currently selected.' },
  'vector.transform-again': { description: 'Repeat the last move, rotate, scale, reflect or shear on the current selection (vector tool active).', flags: 'm', when: 'Use after one transform to apply the same transform again, for example to build a radial pattern with Copy.' },
  'agents.toggle': { description: 'Switch outside agents (MCP clients and the terminal) on or off.', flags: 'r', when: 'Use only when the person asks to change agent access.' },
  'terminal.new': { description: 'Start a new shell session in the agent dock.' },
  'terminal.toggle': { description: 'Show or hide the agent dock.' },
  'claude.open': { description: 'Open Claude Code in the agent dock.' },
  'chat.open': { description: 'Open the Claude chat tab in the agent dock.' },
  'help.guide': { description: 'Open the Using formweb guide.' }
};

function describe(command: Command, label: string): { description: string; when: string; mutates: boolean; risky: boolean } {
  const meta = META[command.id];
  const flags = meta?.flags || '';
  return {
    description: command.description || meta?.description || (command.menu ? `${command.menu}: ${label}.` : `${label}.`),
    when: command.when || meta?.when || '',
    mutates: command.mutates ?? flags.includes('m'),
    risky: command.risky ?? flags.includes('r')
  };
}

export function entryOf(command: Command): CatalogueEntry {
  const label = commands.label(command);
  const words = describe(command, label);
  let enabled = false;
  try { enabled = commands.enabled(command); } catch { enabled = false; }
  let checked: boolean | null = null;
  try { if (command.checked) checked = !!command.checked(); } catch { checked = null; }
  return { id: command.id, label, keys: [...(command.keys ?? [])], group: command.group || command.menu || 'General', menu: command.menu ?? null, ...words, params: command.params ?? {}, enabled, checked };
}

export function listCommands(filter = ''): CatalogueEntry[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const all = commands.all().map(entryOf);
  return words.length ? all.filter(item => words.every(word => `${item.id} ${item.label} ${item.group} ${item.description}`.toLowerCase().includes(word))) : all;
}

export function describeCommand(id: string): CatalogueEntry | undefined {
  const command = commands.get(id);
  return command ? entryOf(command) : undefined;
}

const confirmBox = document.createElement('div');
const confirmText = document.createElement('p');
const confirmAllow = document.createElement('button');
const confirmDeny = document.createElement('button');
let confirmDone: ((allowed: boolean) => void) | null = null;

function buildConfirm(): void {
  confirmBox.className = 'fw-agent-confirm';
  confirmBox.hidden = true;
  confirmBox.setAttribute('role', 'alertdialog');
  confirmBox.setAttribute('aria-label', 'Agent request');
  confirmAllow.type = 'button';
  confirmAllow.className = 'primary';
  confirmAllow.textContent = 'Allow';
  confirmDeny.type = 'button';
  confirmDeny.textContent = 'Deny';
  const actions = document.createElement('div');
  actions.className = 'fw-agent-confirm-actions';
  actions.append(confirmDeny, confirmAllow);
  confirmBox.append(confirmText, actions);
  document.body.append(confirmBox);
  confirmAllow.addEventListener('click', () => settle(true));
  confirmDeny.addEventListener('click', () => settle(false));
}

function settle(allowed: boolean): void {
  confirmBox.hidden = true;
  const done = confirmDone;
  confirmDone = null;
  done?.(allowed);
}

function confirmRisky(label: string): Promise<boolean> {
  if (confirmDone) settle(false);
  confirmText.textContent = `An agent wants to run "${label}", which cannot be undone with Undo.`;
  confirmBox.hidden = false;
  return new Promise(resolve => {
    confirmDone = resolve;
    window.setTimeout(() => { if (confirmDone === resolve) settle(false); }, 45000);
  });
}

export async function runFromBridge(id: string, params?: Record<string, unknown>, agent = true): Promise<{ ran: boolean; result?: unknown; error?: string }> {
  const command = commands.get(id);
  if (!command) return { ran: false, error: `No command with id "${id}".` };
  if (!commands.enabled(command)) return { ran: false, error: `"${commands.label(command)}" is not available right now.` };
  if (agent && describe(command, commands.label(command)).risky && !(await confirmRisky(commands.label(command)))) return { ran: false, error: `The person denied "${commands.label(command)}".` };
  const outcome = await commands.call(id, params);
  return outcome;
}

function plain(value: unknown): unknown {
  try { return value === undefined ? null : JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

let lastPushed = '';
let pushTimer = 0;

async function push(): Promise<void> {
  const body = JSON.stringify({ commands: listCommands() });
  if (body === lastPushed) return;
  lastPushed = body;
  try { await request('/api/commands/catalogue', JSON.parse(body)); } catch { lastPushed = ''; }
}

function schedule(): void {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), 400);
}

interface BridgeRequest { rid: string; id: string; params?: Record<string, unknown> }

async function bridge(): Promise<void> {
  for (;;) {
    try {
      const next = await request<{ request?: BridgeRequest }>('/api/commands/bridge?wait=25');
      const item = next.request;
      if (!item) continue;
      let reply: Record<string, unknown>;
      try {
        const outcome = await runFromBridge(item.id, item.params);
        reply = { rid: item.rid, ok: outcome.ran, result: plain(outcome.result), error: outcome.error || '' };
      } catch (error) {
        reply = { rid: item.rid, ok: false, result: null, error: error instanceof Error ? error.message : String(error) };
      }
      await request('/api/commands/bridge/result', reply);
      schedule();
    } catch {
      await new Promise(resolve => window.setTimeout(resolve, 3000));
    }
  }
}

export function startCatalogue(): void {
  buildConfirm();
  commands.onChange = schedule;
  subscribe(schedule);
  window.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
  void bridge();
}
