import '../styles/vector.css';
import { subscribe } from '../api';
import type { CommandDef } from '../ui/shell';
import type { PathfinderOp } from './boolean';
import { openAverage } from './averagedialog';
import { openGraphicStyles } from './graphicstyles';
import { openRecolor } from './recolor';
import { spineCommands } from './brushcmd';
import { Editor, type ToolId, type VectorContext } from './editor';
import { PATHFINDERS, TOOLS, VectorPanel } from './panel';
import { selectCommands } from './select';
import { runTrace } from './tracepanel';
import { addAnchorCommands, divideBelowCommands, removeAnchorCommands } from './pathcmds';
import { openExportScreens, pageArtboards } from './exportscreens';
import { openAreaType, openCleanUp, openPattern, openRearrange, openSplitGrid, openTweak } from './pathdialogs';
import { areaTextFor, releaseSelectionCommands, releaseThreadCommands, removeThreadingCommands, threadSelection } from './areatype';
import { t } from '../i18n';
import { objectsOnPathCommands } from './objectsonpath';
import { ArtboardsPanel } from './artboards';
import { viewCommands } from './view';

export type { VectorContext, ToolId } from './editor';

export interface VectorHandle {
  commands: CommandDef[];
  refresh(): void;
  setTool(tool: ToolId | null): void;
  togglePanel(): void;
  active(): boolean;
}

const MENU = 'Vector';

export function installVector(ctx: VectorContext, options: { shortcuts?: boolean } = {}): VectorHandle {
  const editor = new Editor(ctx);
  editor.shortcuts = options.shortcuts !== false;
  const panel = new VectorPanel(editor, ctx.panelHost ?? document.body);
  subscribe(() => editor.refresh());
  const artboards = new ArtboardsPanel(editor.host(), id => ctx.select(id), () => ctx.pageRoot(), () => openRearrange(editor.host(), ctx.pageRoot()));

  const commandId: Record<ToolId, string> = {
    select: 'vector.select', direct: 'vector.direct', pen: 'vector.pen', curvature: 'vector.curvature', add: 'vector.add-anchor', delete: 'vector.delete-anchor',
    convert: 'vector.convert-anchor', scissors: 'vector.scissors', rect: 'vector.rect', ellipse: 'vector.ellipse', polygon: 'vector.polygon', star: 'vector.star',
    line: 'vector.line', arc: 'vector.arc', spiral: 'vector.spiral', knife: 'vector.knife', eraser: 'vector.eraser', shapebuilder: 'vector.shape-builder',
    width: 'vector.width', gradient: 'vector.gradient', transform: 'vector.free-transform', paintbrush: 'vector.paintbrush', pencil: 'vector.pencil', rgrid: 'vector.rect-grid', pgrid: 'vector.polar-grid',
    lasso: 'vector.lasso', wand: 'vector.wand', eyedropper: 'vector.eyedropper', puppet: 'vector.puppet', reshape: 'vector.reshape', blob: 'vector.blob-brush', livepaint: 'vector.live-paint-bucket', artboard: 'vector.artboard-tool'
  };
  const tools: CommandDef[] = TOOLS.map((tool, index) => ({
    id: commandId[tool.id],
    label: tool.label,
    menu: MENU,
    keys: tool.keys,
    group: index < 8 ? 0 : 1,
    run: () => editor.setTool(editor.tool === tool.id ? null : tool.id),
    checked: () => editor.tool === tool.id
  }));

  const hasShape = (): boolean => editor.selection.some(id => !!editor.shapeOf(id));
  const hasPair = (): boolean => editor.selection.filter(id => !!editor.shapeOf(id)).length >= 2;
  const pathfinders: CommandDef[] = PATHFINDERS.map(item => ({
    id: `vector.pathfinder.${item.op}`,
    label: `Pathfinder: ${item.label}`,
    menu: MENU,
    group: 2,
    run: () => editor.runPathfinder(item.op as PathfinderOp),
    enabled: hasPair
  }));

  const commands: CommandDef[] = [
    ...tools,
    { id: 'vector.exit', label: 'Leave vector editing', menu: MENU, keys: 'Escape', group: 0, run: () => editor.setTool(null), enabled: () => editor.tool !== null },
    { id: 'vector.panel', label: 'Vector panel', menu: MENU, group: 0, run: () => panel.toggle() },
    { id: 'vector.round-corner', label: 'Round corners', menu: MENU, keys: 'Shift+R', group: 3, run: () => editor.applyCorner({ type: 'round', radius: Math.max(10, typeof editor.cornerState().radius === 'number' ? editor.cornerState().radius as number : 0) }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.round', label: 'Corner type: Round', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'round' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.inverted', label: 'Corner type: Inverted round', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'inverted' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.chamfer', label: 'Corner type: Chamfer', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'chamfer' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.cycle', label: 'Cycle corner type', menu: MENU, group: 3, run: () => editor.cycleCorners(), enabled: () => editor.anchors.size > 0 },
    { id: 'vector.corner.expand', label: 'Expand corners', menu: MENU, group: 3, run: () => editor.bakeCorners(), enabled: hasShape },
    ...pathfinders,
    ...selectCommands(editor),
    {
      id: 'vector.global-edit', label: () => (editor.globalEdit.active ? 'Stop Global Edit' : 'Start Global Edit'), menu: MENU, group: 9, mutates: true,
      run: () => { if (!editor.globalEdit.active && editor.tool === null) editor.setTool('select'); editor.globalEdit.toggle(); },
      enabled: () => { try { return editor.globalEdit.active || hasShape() || !!editor.shapeOf(ctx.getSelected()); } catch { return false; } },
      checked: () => editor.globalEdit.active
    },
    { id: 'vector.path.join', label: 'Join end anchors', menu: MENU, keys: 'Mod+Alt+Shift+J', group: 4, run: () => editor.runPathOp('join'), enabled: () => editor.anchors.size === 2 },
    { id: 'vector.path.average', label: 'Average anchors', menu: MENU, keys: 'Mod+Alt+Shift+A', group: 4, run: () => openAverage(editor), enabled: () => editor.anchors.size > 1 },
    { id: 'vector.path.join-average', label: 'Join and average end anchors', menu: MENU, keys: 'Mod+Alt+Shift+K', group: 4, run: () => editor.runPathOp('join-average'), enabled: () => editor.anchors.size === 2 },
    { id: 'vector.path.add-anchors', label: 'Add anchor points', menu: MENU, group: 4, run: () => { const cmds = addAnchorCommands(editor.host()); if (cmds.length) void editor.commit(cmds); }, enabled: hasShape },
    { id: 'vector.path.remove-anchors', label: 'Remove anchor points', menu: MENU, group: 4, run: () => { const cmds = removeAnchorCommands(editor.host()); if (cmds.length) void editor.commit(cmds); }, enabled: () => editor.anchors.size > 0 },
    { id: 'vector.path.divide-below', label: 'Divide objects below', menu: MENU, group: 4, run: () => { const made = divideBelowCommands(editor.host()); if (made) void editor.commit(made.cmds, made.select); }, enabled: hasShape },
    { id: 'vector.path.split-grid', label: 'Split into grid...', menu: MENU, group: 4, run: () => openSplitGrid(editor.host()), enabled: hasShape },
    { id: 'vector.path.clean-up', label: 'Clean up...', menu: MENU, group: 4, run: () => openCleanUp(editor.host()), enabled: () => { try { return !!editor.activeSvg(); } catch { return false; } } },
    { id: 'vector.path.objects-on-path', label: 'Attach objects to path', menu: MENU, group: 4, mutates: true, run: () => { const cmds = objectsOnPathCommands(editor.host()); if (cmds.length) void editor.commit(cmds); }, enabled: hasPair },
    { id: 'vector.type.area', label: 'Area type...', menu: MENU, group: 7, mutates: true, run: () => openAreaType(editor.host()), enabled: hasShape },
    { id: 'vector.type.area-edit', label: 'Edit area type...', menu: MENU, group: 7, mutates: true, run: () => openAreaType(editor.host(), true), enabled: () => { try { const h = editor.host(); return !!areaTextFor(h.site(), h.primary()); } catch { return false; } } },
    { id: 'vector.type.thread', label: 'Thread text', menu: MENU, group: 7, mutates: true, run: () => { const h = editor.host(); const made = threadSelection(h); if (typeof made === 'string') h.notify(t(made)); else void editor.commit(made); }, enabled: () => { try { return editor.host().selection().length >= 2; } catch { return false; } } },
    { id: 'vector.type.thread-release', label: 'Release threaded text', menu: MENU, group: 7, mutates: true, run: () => { const h = editor.host(); const found = areaTextFor(h.site(), h.primary()); const cmds = found ? releaseThreadCommands(h.site(), found.text, found.spec) : []; if (cmds.length) void editor.commit(cmds); else h.notify(t('This area type is not threaded.')); }, enabled: () => { try { const h = editor.host(); return !!areaTextFor(h.site(), h.primary())?.spec.chain?.length; } catch { return false; } } },
    { id: 'vector.type.thread-release-selection', label: 'Release selection from thread', menu: MENU, group: 7, mutates: true, run: () => { const h = editor.host(); const site = h.site(); const ids = h.selection(); const found = ids.map(id => areaTextFor(site, id)).find(Boolean); const cmds = found?.spec.chain?.length ? releaseSelectionCommands(site, found.text, found.spec, new Set(ids)) : []; if (cmds.length) void editor.commit(cmds); else h.notify(t('This area type is not threaded.')); }, enabled: () => { try { const h = editor.host(); const site = h.site(); return h.selection().some(id => !!areaTextFor(site, id)?.spec.chain?.length); } catch { return false; } } },
    { id: 'vector.type.thread-remove', label: 'Remove threading', menu: MENU, group: 7, mutates: true, run: () => { const h = editor.host(); const found = areaTextFor(h.site(), h.primary()); const cmds = found ? removeThreadingCommands(h.site(), found.text, found.spec) : []; if (cmds.length) void editor.commit(cmds); else h.notify(t('This area type is not threaded.')); }, enabled: () => { try { const h = editor.host(); return !!areaTextFor(h.site(), h.primary())?.spec.chain?.length; } catch { return false; } } },
    { id: 'vector.pattern.make', label: 'Make pattern...', menu: MENU, group: 7, run: () => openPattern(editor.host()), enabled: hasPair },
    { id: 'vector.pattern.edit', label: 'Edit pattern...', menu: MENU, group: 7, mutates: true, run: () => openPattern(editor.host(), true), enabled: hasShape },
    { id: 'vector.gradient.freeform', label: 'Freeform gradient', menu: MENU, group: 7, mutates: true, run: () => { void editor.ops.freeform(); }, enabled: hasShape },
    { id: 'vector.effect.tweak', label: 'Tweak...', menu: MENU, group: 7, run: () => openTweak(editor.host()), enabled: hasShape },
    { id: 'vector.path.simplify', label: 'Simplify path', menu: MENU, group: 4, run: () => editor.runPathOp('simplify', 1), enabled: hasShape },
    { id: 'vector.path.offset', label: 'Offset path', menu: MENU, group: 4, run: () => editor.runPathOp('offset', 8), enabled: hasShape },
    { id: 'vector.path.outline-stroke', label: 'Outline stroke', menu: MENU, keys: 'Mod+Shift+O', group: 4, run: () => editor.runPathOp('outline'), enabled: hasShape },
    { id: 'vector.path.reverse', label: 'Reverse path direction', menu: MENU, group: 4, run: () => editor.runPathOp('reverse'), enabled: hasShape },
    { id: 'vector.compound.make', label: 'Make compound path', menu: MENU, keys: 'Mod+8', group: 4, run: () => editor.makeCompound(), enabled: hasPair },
    { id: 'vector.compound.release', label: 'Release compound path', menu: MENU, keys: 'Mod+Alt+8', group: 4, run: () => editor.releaseCompound(), enabled: hasShape },
    { id: 'vector.group', label: 'Group', menu: MENU, keys: 'Mod+G', group: 6, run: () => { void editor.ops.group(); }, enabled: hasPair },
    { id: 'vector.ungroup', label: 'Ungroup', menu: MENU, keys: 'Mod+Shift+G', group: 6, run: () => { void editor.ops.ungroup(); }, enabled: hasShape },
    { id: 'vector.clip.make', label: 'Make clipping mask', menu: MENU, keys: 'Mod+7', group: 6, run: () => { void editor.ops.makeMask('clip'); }, enabled: hasPair },
    /* Figma's Use as mask: the bottom selected layer masks the layers above it; run again on masked content to
       remove the mask. No default key: Figma's Ctrl+Alt+M is Make opacity mask here. */
    { id: 'vector.mask.use', label: 'Use as mask', menu: MENU, group: 6, run: () => { if (hasPair()) void editor.ops.makeMask('clip', 'bottom'); else void editor.ops.releaseMask(); }, enabled: hasShape },
    { id: 'vector.clip.release', label: 'Release clipping or opacity mask', menu: MENU, keys: 'Mod+Alt+7', group: 6, run: () => { void editor.ops.releaseMask(); }, enabled: hasShape },
    { id: 'vector.mask.make', label: 'Make opacity mask', menu: MENU, keys: 'Mod+Alt+M', group: 6, run: () => { void editor.ops.makeMask('mask'); }, enabled: hasPair },
    { id: 'vector.isolate.exit', label: 'Exit isolation mode', menu: MENU, group: 6, run: () => editor.extras.exit(), enabled: () => editor.extras.iso !== null },
    { id: 'vector.blend', label: 'Blend selected paths', menu: MENU, keys: 'Mod+Alt+B', group: 7, run: () => { void editor.ops.blend({ mode: 'steps', steps: 5, distance: 20 }); }, enabled: () => hasPair() || !!editor.ops.liveSelected('blend') },
    { id: 'vector.livepaint.make', label: 'Make Live Paint', menu: MENU, group: 7, mutates: true, run: () => { void editor.ops.livePaint(); }, enabled: hasPair },
    { id: 'vector.livepaint.expand', label: 'Expand Live Paint', menu: MENU, group: 7, mutates: true, run: () => { void editor.ops.expandLive(); }, enabled: () => !!editor.ops.liveSelected('livepaint') },
    { id: 'vector.livepaint.release', label: 'Release Live Paint', menu: MENU, group: 7, mutates: true, run: () => { void editor.ops.releaseLive(); }, enabled: () => !!editor.ops.liveSelected('livepaint') },
    { id: 'vector.blend.expand', label: 'Expand blend or repeat', menu: MENU, group: 7, run: () => { void editor.ops.expandLive(); }, enabled: () => !!(editor.ops.liveSelected('blend') ?? editor.ops.liveSelected('repeat')) },
    { id: 'vector.blend.release', label: 'Release blend or repeat', menu: MENU, group: 7, run: () => { void editor.ops.releaseLive(); }, enabled: () => !!(editor.ops.liveSelected('blend') ?? editor.ops.liveSelected('repeat')) },
    { id: 'vector.brush.remove', label: 'Remove brush', menu: MENU, group: 7, run: () => { void editor.ops.releaseLive(); }, enabled: () => !!editor.ops.liveSelected('brush') },
    { id: 'vector.brush.expand', label: 'Expand brush appearance', menu: MENU, group: 7, run: () => { void editor.ops.expandLive(); }, enabled: () => !!editor.ops.liveSelected('brush') },
    { id: 'vector.blend.spine', label: 'Replace blend spine', menu: MENU, group: 7, run: () => { const cmds = spineCommands(editor.host()); if (cmds.length) void editor.host().commit(cmds); } },
    { id: 'vector.repeat.radial', label: 'Repeat radial', menu: MENU, group: 7, run: () => { void editor.ops.repeat({ kind: 'radial', count: 6, radius: 80, cols: 3, rows: 2, gapX: 10, gapY: 10, angle: 90, brick: 'none', offset: 0 }); }, enabled: hasShape },
    { id: 'vector.symbol.define', label: 'Define symbol', menu: MENU, group: 7, run: () => { void editor.ops.defineSymbol(''); }, enabled: hasShape },
    { id: 'vector.symbol.break', label: 'Break link to symbol', menu: MENU, group: 7, run: () => { void editor.ops.breakLink(); }, enabled: () => { try { return editor.selection.some(id => editor.site().nodes[id]?.tag === 'use'); } catch { return false; } } },
    { id: 'vector.stroke.inside', label: 'Align stroke inside', menu: MENU, group: 7, run: () => editor.applyPaint({ align: 'inside' }), enabled: hasShape },
    { id: 'vector.stroke.center', label: 'Align stroke to center', menu: MENU, group: 7, run: () => editor.applyPaint({ align: 'center' }), enabled: hasShape },
    { id: 'vector.stroke.outside', label: 'Align stroke outside', menu: MENU, group: 7, run: () => editor.applyPaint({ align: 'outside' }), enabled: hasShape },
    ...(['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom'] as const).map(mode => ({
      id: `vector.align.${mode}`, label: `Align ${mode === 'hcenter' ? 'horizontal centers' : mode === 'vmiddle' ? 'vertical centers' : mode}`, menu: MENU, group: 8, run: () => { void editor.ops.align(mode, 'selection'); }, enabled: hasPair
    })),
    { id: 'vector.distribute.hspace', label: 'Distribute horizontal spacing', menu: MENU, group: 8, run: () => { void editor.ops.distribute('hspace', null); }, enabled: () => editor.selection.length >= 3 },
    { id: 'vector.distribute.vspace', label: 'Distribute vertical spacing', menu: MENU, group: 8, run: () => { void editor.ops.distribute('vspace', null); }, enabled: () => editor.selection.length >= 3 },
    { id: 'vector.snap.toggle', label: 'Smart guides and snapping', menu: MENU, keys: 'Mod+Shift+;', group: 8, run: () => { editor.extras.snapping = !editor.extras.snapping; editor.emit(); }, checked: () => editor.extras.snapping },
    { id: 'vector.recolor', label: 'Recolor artwork...', menu: 'Edit', group: 3, run: () => openRecolor(editor.host(), () => editor.panelSvg()), enabled: () => { try { return !!(editor.activeSvg() ?? editor.panelSvg()); } catch { return false; } } },
    { id: 'vector.graphic-styles', label: 'Graphic styles', menu: 'Window', group: 6, run: () => openGraphicStyles(editor.host()) },
    { id: 'vector.artboards', label: 'Artboards', menu: 'Window', group: 6, run: () => artboards.toggle() },
    { id: 'vector.artboards.rearrange', label: 'Rearrange All Artboards', menu: MENU, group: 7, mutates: true, run: () => openRearrange(editor.host(), ctx.pageRoot()) },
    ...viewCommands(editor.view, () => editor.tool !== null, () => editor.render()),
    { id: 'vector.svg.import', label: 'Import SVG...', menu: MENU, group: 5, run: () => panel.pickFile() },
    { id: 'vector.trace', label: 'Image Trace', menu: MENU, keys: 'Mod+Alt+Shift+T', group: 5, run: () => runTrace() },
    { id: 'vector.export-screens', label: 'Export for Screens...', menu: MENU, keys: 'Mod+Alt+E', group: 5, run: () => openExportScreens(editor.host()), enabled: () => { try { return !!editor.activeSvg() || pageArtboards(editor.host()).length > 0; } catch { return false; } } },
    { id: 'vector.svg.export',label: 'Export selection as SVG', menu: MENU, group: 5, run: () => panel.download(), enabled: () => !!ctx.getSelected() }
  ];

  return {
    commands,
    refresh: () => editor.refresh(),
    setTool: tool => editor.setTool(tool),
    togglePanel: () => panel.toggle(),
    active: () => editor.tool !== null
  };
}
