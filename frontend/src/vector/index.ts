import '../styles/vector.css';
import { subscribe } from '../api';
import type { CommandDef } from '../ui/shell';
import type { PathfinderOp } from './boolean';
import { Editor, type ToolId, type VectorContext } from './editor';
import { PATHFINDERS, TOOLS, VectorPanel } from './panel';

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

  const commandId: Record<ToolId, string> = {
    select: 'vector.select', direct: 'vector.direct', pen: 'vector.pen', curvature: 'vector.curvature', add: 'vector.add-anchor', delete: 'vector.delete-anchor',
    convert: 'vector.convert-anchor', scissors: 'vector.scissors', rect: 'vector.rect', ellipse: 'vector.ellipse', polygon: 'vector.polygon', star: 'vector.star',
    line: 'vector.line', arc: 'vector.arc', spiral: 'vector.spiral'
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
    { id: 'vector.exit', label: 'Leave vector editing', menu: MENU, keys: 'Esc', group: 0, run: () => editor.setTool(null), enabled: () => editor.tool !== null },
    { id: 'vector.panel', label: 'Vector panel', menu: MENU, group: 0, run: () => panel.toggle() },
    { id: 'vector.round-corner', label: 'Round corners', menu: MENU, keys: 'Shift R', group: 3, run: () => editor.applyCorner({ type: 'round', radius: Math.max(10, typeof editor.cornerState().radius === 'number' ? editor.cornerState().radius as number : 0) }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.round', label: 'Corner type: Round', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'round' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.inverted', label: 'Corner type: Inverted round', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'inverted' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.chamfer', label: 'Corner type: Chamfer', menu: MENU, group: 3, run: () => editor.applyCorner({ type: 'chamfer' }), enabled: () => editor.cornerRefs().length > 0 },
    { id: 'vector.corner.cycle', label: 'Cycle corner type', menu: MENU, group: 3, run: () => editor.cycleCorners(), enabled: () => editor.anchors.size > 0 },
    { id: 'vector.corner.expand', label: 'Expand corners', menu: MENU, group: 3, run: () => editor.bakeCorners(), enabled: hasShape },
    ...pathfinders,
    { id: 'vector.path.join', label: 'Join end anchors', menu: MENU, keys: 'Ctrl J', group: 4, run: () => editor.runPathOp('join'), enabled: () => editor.anchors.size === 2 },
    { id: 'vector.path.average', label: 'Average anchors', menu: MENU, group: 4, run: () => editor.runPathOp('average'), enabled: () => editor.anchors.size > 1 },
    { id: 'vector.path.simplify', label: 'Simplify path', menu: MENU, group: 4, run: () => editor.runPathOp('simplify', 1), enabled: hasShape },
    { id: 'vector.path.offset', label: 'Offset path', menu: MENU, group: 4, run: () => editor.runPathOp('offset', 8), enabled: hasShape },
    { id: 'vector.path.outline-stroke', label: 'Outline stroke', menu: MENU, group: 4, run: () => editor.runPathOp('outline'), enabled: hasShape },
    { id: 'vector.path.reverse', label: 'Reverse path direction', menu: MENU, group: 4, run: () => editor.runPathOp('reverse'), enabled: hasShape },
    { id: 'vector.compound.make', label: 'Make compound path', menu: MENU, keys: 'Ctrl 8', group: 4, run: () => editor.makeCompound(), enabled: hasPair },
    { id: 'vector.compound.release', label: 'Release compound path', menu: MENU, keys: 'Ctrl Alt 8', group: 4, run: () => editor.releaseCompound(), enabled: hasShape },
    { id: 'vector.svg.import', label: 'Import SVG...', menu: MENU, group: 5, run: () => panel.pickFile() },
    { id: 'vector.svg.export', label: 'Export selection as SVG', menu: MENU, group: 5, run: () => panel.download(), enabled: () => !!ctx.getSelected() }
  ];

  return {
    commands,
    refresh: () => editor.refresh(),
    setTool: tool => editor.setTool(tool),
    togglePanel: () => panel.toggle(),
    active: () => editor.tool !== null
  };
}
