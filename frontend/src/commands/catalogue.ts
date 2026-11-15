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
  'file.send-formpublisher': { description: 'Export the open site and hand it to FormPublisher, live when it runs or through its inbox folder otherwise.', flags: 'm', when: 'Use when the person asks to send the site to FormPublisher.' },
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
  'view.preview': { description: 'Toggle the live responsive preview: the exported site at the typed width, where the browser switches breakpoints itself.' },
  'view.refresh': { description: 'Refresh the live responsive preview.' },
  'view.theme': { description: 'Switch between the light and dark editor theme.' },
  'vector.rulers': { description: 'Show or hide the rulers along the vector editing area, in the SVG user units (Illustrator View > Rulers). Outside vector editing the key reloads the page.', when: 'Use to measure or to drag out guides while vector editing.' },
  'vector.guides.toggle': { description: 'Show or hide the guides of the edited SVG. The guides themselves are saved with the SVG (data-fw-guides) and are left out of exports; this toggle only changes the view.' },
  'vector.guides.lock': { description: 'Lock or unlock the guides so they cannot be moved or released. The lock is saved with the SVG and is one undo step.', flags: 'm' },
  'vector.guides.make': { description: 'Turn the selected shapes into path guides and remove the shapes from the SVG.', flags: 'm', when: 'Use to build construction guides from a drawn path.' },
  'vector.guides.release': { description: 'Turn the selected guides (or all path guides) back into path shapes.', flags: 'm' },
  'vector.guides.clear': { description: 'Remove every guide of the edited SVG.', flags: 'm' },
  'vector.export-screens': { description: 'Open Export for Screens (Illustrator File > Export > Export for Screens): export the edited SVG, or only the selected shapes, as PNG, JPG (quality), WebP and clean SVG at 0.5x, 1x, 2x, 3x and 4x with a file name suffix per scale and an optional background. "All artboards on this page" exports every svg drawn on the current page, each under its own name with the file name field as a prefix. Since v0.12.4 PDF is a format too: one vector page at 1x per drawing (paths, clips, opacity, symbols, text in Helvetica; gradients fall back to their first stop colour; images, masks and filters are left out). Files download from the browser.', when: 'Use to hand the artwork off as images, a clean SVG or a PDF.' },
  'vector.recolor': { description: 'Open Recolor Artwork (Edit > Edit Colors): lists every solid fill, stroke and gradient stop color of the selected shapes (or the whole edited SVG), lets you pick new colors, generate a harmony (complementary, analogous, triadic, split complementary, tetradic, monochromatic, shades), reduce to N colors or randomize, with a live canvas preview; OK is one undo step.', flags: 'm', when: 'Use to change the palette of artwork in one go.' },
  'vector.graphic-styles': { description: 'Open the Graphic Styles window: save the first selected shape as a named style (fill, stroke, weight, caps, joins, dash, opacity and live stroke options), apply a style to the selected shapes in one undo step, rename or delete it. The library is stored in the site setting vectorGraphicStyles and is shared by every SVG of the project.', flags: 'm', when: 'Use to reuse one look across shapes.' },
  'vector.grid.show': { description: 'Show or hide the document grid (72 units with 8 subdivisions by default) in the vector editing area.' },
  'vector.grid.snap': { description: 'Snap drawn and moved points to the grid; guides always snap while visible.' },
  'vector.grid.prefs': { description: 'Open the dialog for gridline spacing and subdivisions.' },
  'vector.outline': { description: 'Show the edited SVG as thin unfilled outlines without changing the document. Outside vector editing the key is Redo.', when: 'Use to inspect overlapping artwork.' },
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
  'vector.puppet': { description: 'Pin Warp tool: with shapes selected, three pins are placed automatically; click to add a pin, drag a pin to bend the selected paths while the other pins stay fixed, Alt-click a pin to remove it, Shift-click to select several pins. One undo step per drag. Pins are not saved.', flags: 'm' },
  'vector.reshape': { description: 'Reshape tool: with anchors selected, drag one selected anchor to move it fully and the other selected anchors in proportion to their distance along the path; with no anchors selected, drag a path segment to add an anchor and pull it with falloff to its neighbours.', flags: 'm' },
  'vector.blob-brush': { description: 'Blob Brush tool (Shift+B): drag to paint a filled, unstroked shape the width of the brush. A stroke that overlaps unstroked paths of the same fill color in the edited SVG is united with them into one path (only with selected paths when Merge Only with Selection is on). Double-click the canvas with the tool active for options (Size, Fidelity, Keep Selected, Merge Only with Selection); [ and ] change the size. One undo step per stroke.', flags: 'm' },
  'vector.live-paint-bucket': { description: 'Fill Regions Bucket tool: with two or more overlapping paths selected, the face under the pointer is highlighted; a click makes them a Fill Regions group (as vector.livepaint.make) and fills that face with the current fill color. With a Fill Regions group selected, a click fills or recolors the face under the pointer. Shift-click paints the clicked path\'s stroke with the current stroke color; with a Fill Regions group selected (v0.11.8) it strokes only the edge under the pointer, the stretch of one path between two crossings, with the current stroke color and weight, and no stroke removes that edge; the first painted edge moves every path stroke onto the edges and keeps the originals for Release; holding Shift over the group highlights the edge a click would stroke (v0.11.9). One undo step per click. Since v0.11.5 fills are live: they follow their faces when the paths change. No default shortcut (K is the Knife in FormWeb).', flags: 'm' },
  'vector.livepaint.make': { description: 'Make Fill Regions (Object > Make Fill Regions): groups the selected paths (same parent) into a live group; every face where they overlap starts with the fill of the topmost path over it, and the paths keep only their strokes. Faces are recomputed when any path changes; each fill stays with the face covered by the same paths (and holding its point, or the nearest such face), and is dropped when that face disappears. One undo step.', flags: 'm' },
  'vector.livepaint.expand': { description: 'Expand Fill Regions: the faces become ordinary filled paths in the group and the group is no longer live; the source paths stay with their strokes.', flags: 'm' },
  'vector.livepaint.release': { description: 'Release Fill Regions: removes the faces and gives the source paths back their original fills as ordinary paths.', flags: 'm' },
  'vector.artboard-tool': { description: 'Artboard tool (Shift+O): drag on empty canvas to draw a new artboard (an empty svg) at that rectangle under the page root; drag inside an existing artboard to move it, previewed live and committed on release; click an artboard to select it; Shift-click more artboards to add them to the selection (Shift-click a selected one to drop it), and dragging any of them moves them all together; Shift-drag on empty canvas selects every artboard the box touches; the arrow keys move the selected artboards 1 px (10 px with Shift), one undo step per burst of keys; drag one of the eight handles on the selected artboard to resize it from that edge or corner (the art keeps its place and size); hold Shift to keep proportions and Alt to resize from the center. One undo step per drag.', flags: 'm' },
  'vector.artboards.rearrange': { description: 'Rearrange All Artboards (as in Illustrator): opens a dialog for the artboards directly on the current page, in Artboards panel order. Layout: Grid by Row (Columns sets boards per row), Grid by Column (Rows sets boards per column), Arrange by Row (one row) or Arrange by Column (one column); Spacing between boards; Layout order Left to right or Right to left. Boards are placed from the top-left corner of the current group; the art inside each board always moves with it. One undo step. The panel rows also have Move up and Move down to change the order.', flags: 'm' },
  'vector.artboards': { description: 'Toggle the Artboards panel (Window > Artboards): every vector drawing (svg) on every page is an artboard with its name, size and page. Rename in place; Select selects it; Duplicate copies it with all its contents and internal references to the right; Fit to artwork shrinks it to the bounds of its paths (stroke included) without moving the art on the page; Resize sets the width and height from the size fields; Delete removes it. New artboard adds an empty svg of the chosen preset or custom size to the current page. Each action is one undo step.', when: 'Use to manage several drawings like Illustrator artboards.' },
  'vector.type.thread': { description: 'Thread text (Illustrator Type > Threaded Text > Create): select area type (or its shape) and one or more other closed shapes; the words that do not fit flow on into each shape in selection order, each holding a Threaded type text with the same font. Reflows when any shape in the thread changes; deleting a linked shape drops it from the thread. A boxed plus at the bottom right of the last shape marks words still left over. One undo step.', flags: 'm' },
  'vector.type.thread-release': { description: 'Release threaded text: the linked texts are removed and all the words roll back into the first shape. One undo step.', flags: 'm' },
  'vector.snap.pixel': { description: 'Snap to pixel grid (Figma): when on, a drawn or dragged point that snaps to nothing else lands on whole drawing units (whole page pixels for a new drawing). Off by default. Holding Control while drawing or dragging turns all snapping off for that moment.' },
  'vector.mask.use': { description: 'Use as mask (Figma): with two or more paths selected, the bottom one becomes the clipping shape and the paths above it are clipped; with masked content selected, removes the mask. One undo step. No default key: Figma\'s Ctrl+Alt+M is Make opacity mask here.', flags: 'm' },
  'vector.type.thread-release-selection': { description: 'Release selection from thread (Illustrator Type > Threaded Text > Release Selection): the selected shapes leave the thread, keeping their outlines but not their text, and the words flow on into the next shape; when the first shape is selected, the next linked shape becomes the first. One undo step.', flags: 'm' },
  'vector.type.thread-remove': { description: 'Remove threading (Illustrator Type > Threaded Text > Remove Threading): every shape in the thread keeps the words it shows now as its own area type, the last one keeping the overflow; nothing moves. One undo step. The in and out ports on selected area type link more shapes (click a port, then a closed shape or an empty spot) and break the thread (double-click a port).', flags: 'm' },
  'vector.type.area-edit': { description: 'Edit area type: with area type, one of its lines or the shape holding it selected, reopens the Area Type dialog with the current text, font and layout settings; Update text lays it out again in the same shape, one undo step. Area type placed before v0.11.2 has no stored settings and cannot be edited this way. In the editor (v0.12.0), double-clicking area type with the Selection or Direct Selection tool opens a text box over its shape for typing straight on the canvas; Esc or a click elsewhere lays the words out again, one undo step.', flags: 'm' },
  'vector.type.area': { description: 'Area type (Illustrator Area Type with Area Type Options): with a closed shape selected, opens a dialog for the text, font size, leading, family, weight, color, alignment, inset spacing, columns and gutter, then flows the words inside the shape as an svg text with one tspan per line, after the shape. Paragraphs follow line breaks; words that do not fit are reported as overflow. One undo step. Since v0.11.2 the text reflows whenever the shape is moved or reshaped in the editor, and vector.type.area-edit changes the text or settings later.', flags: 'm' },
  'vector.gradient.freeform': { description: 'Freeform gradient, Points mode (Illustrator Gradient panel > Freeform): turns the selected path into a live group with five colour stops, one in the fill colour and four turned around the hue wheel. With the Gradient tool (G) click inside the shape to add a stop, drag a stop to move it, drag its ring handle to change the spread, double-click it for colour and spread, and drag it outside the shape or press Backspace to remove it. Rendered as layered radial gradients over an average-colour base, so blends are close to Illustrator but not identical. Freeform draw Lines in the Gradient panel: each click inside the shape adds a stop joined to the previous one by a line, the colour and spread run along the line, and Escape ends the line (the next click starts a new one). Expand and Release work as for other live groups.', flags: 'm' },
  'vector.pattern.make': { description: 'Make pattern (Illustrator Object > Pattern > Make with Pattern Options): select the tile artwork, then the shape to fill last. Tile type Grid, Brick by Row or Brick by Column with a brick offset of 1/4 to 4/5, Hex by Column or Hex by Row (alternate columns or rows staggered by half a tile, 3/4 of a tile apart); Size Tile to Art with H and V spacing, or a fixed width and height. Adds an svg pattern holding copies of the artwork and sets the last shape\'s fill to it, in one undo step; the originals stay. The options are stored on the pattern so vector.pattern.edit can change them later.', flags: 'm' },
  'vector.pattern.edit': { description: 'Edit pattern: with a shape filled with a pattern selected, reopens Pattern Options with the pattern\'s stored tile type, offset, size and spacing; Update pattern rebuilds the tiles from the art of the first tile, keeping the pattern id so every shape using it updates. One undo step. Patterns made before v0.11.1 open as a Grid at their current size.', flags: 'm' },
  'vector.path.objects-on-path': { description: 'Attach objects to path (Illustrator Objects on Path, applied once): select the objects, then the path last. On an open path the first object goes to the start and the last to the end with even spacing between centers; on a closed path they are spaced evenly around it. Each object is centered on the path and rotated to its direction. One undo step; the placement is not live.', flags: 'm' },
  'vector.effect.tweak': { description: 'Open Tweak (Illustrator Effect > Distort & Transform > Tweak, applied to the paths): random horizontal and vertical moves, relative (percent of the size) or absolute, for anchor points, "In" control points and "Out" control points, with a seed and Preview. One undo step.', when: 'Use to roughen a shape by hand-drawn looking random curves.' },
  'vector.global-edit': { description: 'Toggle Global Edit: finds every shape in the SVG whose geometry matches the selected shape up to translation, highlights them, and mirrors paint changes (fill, stroke, weight, opacity) and geometry edits made to one of them to all the others in the same undo step. Run again or press Escape to stop.', flags: 'm', when: 'Use to restyle or reshape repeated copies of a shape at once.' },
  'vector.transform-again': { description: 'Repeat the last move, rotate, scale, reflect or shear on the current selection (vector tool active).', flags: 'm', when: 'Use after one transform to apply the same transform again, for example to build a radial pattern with Copy.' },
  'agents.toggle': { description: 'Switch outside agents (MCP clients and the terminal) on or off.', flags: 'r', when: 'Use only when the person asks to change agent access.' },
  'terminal.new': { description: 'Start a new shell session in the agent dock.' },
  'terminal.toggle': { description: 'Show or hide the agent dock.' },
  'claude.open': { description: 'Open Claude Code in the agent dock.' },
  'chat.open': { description: 'Open the Claude chat tab in the agent dock.' },
  'vector.pencil': { description: 'Pencil tool: drag to draw a freehand stroked path smoothed by the Fidelity setting; start on an end of the selected open path to continue it, hold Alt on release to close.', flags: 'm' },
  'vector.rect-grid': { description: 'Rectangular Grid tool: drag a box to draw a group with the frame and the horizontal and vertical dividers; double-click on the canvas for the divider counts.', flags: 'm' },
  'vector.polar-grid': { description: 'Polar Grid tool: drag a box to draw a group of concentric ellipses and radial dividers; double-click on the canvas for the counts.', flags: 'm' },
  'vector.path.add-anchors': { description: 'Add an anchor point at the midpoint of every segment of the selected paths, keeping the shape identical.', flags: 'm', when: 'Use with one or more selected paths.' },
  'vector.path.remove-anchors': { description: 'Delete the selected anchor points, refitting the neighbouring handles and keeping the path open or closed.', flags: 'm', when: 'Use after selecting anchors with the Direct Selection tool.' },
  'vector.path.divide-below': { description: 'Use the selected path as a cutter: split every filled shape beneath it that it overlaps into separate pieces, then remove the cutter.', flags: 'mr', when: 'Use with a cutter path selected above the shapes to divide.' },
  'vector.path.split-grid': { description: 'Open the Split Into Grid dialog (rows, columns, heights, widths, gutters) to replace each selected rectangle with a group of rectangles.', flags: 'm', when: 'Use with one or more rectangles selected.' },
  'vector.path.clean-up': { description: 'Open the Clean Up dialog to delete stray points, unpainted objects and empty text paths from the current vector and report the count.', flags: 'mr', when: 'Use when the current vector has leftover empty objects.' },
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
