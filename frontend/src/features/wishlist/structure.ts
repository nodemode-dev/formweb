import type { EditorState } from '../../types';
import { text as setText } from '../../ui/dom';
import { element } from '../../ui/dom';
import { ancestorWhere, btn, check, containerFor, field, note, number, parentOf, row, section, select, setChecked, setValue, text, type Tab, type WishlistContext } from './kit';

type Cell = { table: string; row: number; col: number; rows: number; cols: number };

function locate(state: EditorState, id: string): Cell | null {
  const cell = ancestorWhere(state, id, node => ['td', 'th', 'tr', 'table'].includes(node.tag));
  const table = cell && (cell.tag === 'table' ? cell : ancestorWhere(state, cell.id, node => node.tag === 'table'));
  if (!table) return null;
  const rows: string[] = [];
  for (const childId of table.children) {
    const child = state.site.nodes[childId];
    if (child.tag === 'tr') rows.push(childId);
    else if (['thead', 'tbody', 'tfoot'].includes(child.tag)) rows.push(...child.children.filter(r => state.site.nodes[r].tag === 'tr'));
  }
  const cols = rows.length ? state.site.nodes[rows[0]].children.filter(c => ['td', 'th'].includes(state.site.nodes[c].tag)).length : 0;
  let rowIndex = -1;
  let colIndex = -1;
  if (cell.tag === 'tr') rowIndex = rows.indexOf(cell.id);
  if (cell.tag === 'td' || cell.tag === 'th') {
    const owner = parentOf(state, cell.id) || '';
    rowIndex = rows.indexOf(owner);
    colIndex = state.site.nodes[owner]?.children.filter(c => ['td', 'th'].includes(state.site.nodes[c].tag)).indexOf(cell.id) ?? -1;
  }
  return { table: table.id, row: rowIndex, col: colIndex, rows: rows.length, cols };
}

export function buildStructure(ctx: WishlistContext): Tab[] {
  const run = (command: string, params: Record<string, unknown>) => { void ctx.commands([{ command, params }]); };

  const rows = number(1, 100);
  const cols = number(1, 30);
  const header = element('input');
  const caption = text('Caption, for example Pricing by plan');
  const tableNote = note();
  const rowAbove = btn('Add row above', () => undefined);
  const rowBelow = btn('Add row below', () => undefined);
  const rowRemove = btn('Remove row', () => undefined, 'wl-danger');
  const colLeft = btn('Add column left', () => undefined);
  const colRight = btn('Add column right', () => undefined);
  const colRemove = btn('Remove column', () => undefined, 'wl-danger');
  const tablePane = element('div', 'wl-pane');
  tablePane.append(
    section('Insert a table', row(field('Rows', rows), field('Columns', cols)), check('Header row', header), field('Caption', caption), btn('Insert table', () => {
      run('table.insert', { parent: containerFor(ctx.state(), ctx.selected()), rows: Number(rows.value) || 3, cols: Number(cols.value) || 3, header: header.checked, caption: caption.value.trim() });
    }, 'wl-primary')),
    section('Edit the selected table', tableNote, row(rowAbove, rowBelow, rowRemove), row(colLeft, colRight, colRemove))
  );
  const tableTab: Tab = {
    id: 'table', label: 'Table', element: tablePane,
    refresh() {
      const where = locate(ctx.state(), ctx.selected());
      setChecked(header, header.dataset.touched ? header.checked : true);
      setValue(rows, rows.value || '3');
      setValue(cols, cols.value || '3');
      setText(tableNote, where ? `Table with ${where.rows} rows and ${where.cols} columns. ${where.row >= 0 ? `Selected row ${where.row + 1}${where.col >= 0 ? `, column ${where.col + 1}` : ''}.` : 'Select a cell or row to target it.'}` : 'Select a table, row or cell to edit it.');
      const hasRow = !!where && where.row >= 0;
      const hasCol = !!where && where.col >= 0;
      rowAbove.disabled = !hasRow; rowBelow.disabled = !hasRow; rowRemove.disabled = !hasRow || (where?.rows ?? 0) < 2;
      colLeft.disabled = !hasCol; colRight.disabled = !hasCol; colRemove.disabled = !hasCol || (where?.cols ?? 0) < 2;
      rowAbove.onclick = () => where && run('table.row.add', { table: where.table, index: where.row });
      rowBelow.onclick = () => where && run('table.row.add', { table: where.table, index: where.row + 1 });
      rowRemove.onclick = () => where && run('table.row.remove', { table: where.table, index: where.row });
      colLeft.onclick = () => where && run('table.col.add', { table: where.table, index: where.col });
      colRight.onclick = () => where && run('table.col.add', { table: where.table, index: where.col + 1 });
      colRemove.onclick = () => where && run('table.col.remove', { table: where.table, index: where.col });
    }
  };
  header.addEventListener('change', () => { header.dataset.touched = '1'; });

  const scriptNote = note();
  const shift = text('-0.2em or 3px');
  const glyphs = element('input');
  const inline = ['span', 'sup', 'sub'];
  const modes: [string, string, HTMLButtonElement][] = [['super', 'Superscript', btn('Superscript', () => undefined)], ['sub', 'Subscript', btn('Subscript', () => undefined)], ['none', 'Normal', btn('Normal', () => undefined)]];
  const markWords = text('Words inside the selected text');
  const mark = (mode: string) => {
    const state = ctx.state();
    const id = ctx.selected();
    const node = state.site.nodes[id];
    const word = markWords.value;
    if (!node || !word || node.children.length || !node.text.includes(word)) { ctx.notify('Select a text element that contains those words and has no nested elements.', true); return; }
    const at = node.text.indexOf(word);
    const stamp = Date.now().toString(36);
    const piece = (suffix: string, value: string) => ({ command: 'node.add', params: { parent: id, node: { id: `${id}-${suffix}-${stamp}`, tag: 'span', name: node.name || node.tag, text: value, attrs: {}, styles: {}, breakpoints: {}, children: [] } } });
    const batch: { command: string; params: Record<string, unknown> }[] = [{ command: 'node.update', params: { id, patch: { text: '' } } }];
    if (at > 0) batch.push(piece('a', node.text.slice(0, at)));
    batch.push(piece('mark', word));
    if (at + word.length < node.text.length) batch.push(piece('b', node.text.slice(at + word.length)));
    batch.push({ command: 'text.script', params: { id: `${id}-mark-${stamp}`, mode, trueGlyphs: glyphs.checked } });
    markWords.value = '';
    void ctx.commands(batch).then(() => ctx.select(`${id}-mark-${stamp}`));
  };
  const markSuper = btn('Mark superscript', () => mark('super'));
  const markSub = btn('Mark subscript', () => mark('sub'));
  const typePane = element('div', 'wl-pane');
  typePane.append(
    section('Mark words in a text element', field('Words to mark', markWords), row(markSuper, markSub)),
    section('Superscript and subscript', scriptNote, row(...modes.map(([, , button]) => button)), check('Use the font’s own superscript glyphs when it has them', glyphs)),
    section('Baseline shift', field('Shift (positive raises, negative lowers)', shift), row(btn('Apply shift', () => {
      const value = shift.value.trim();
      if (!/^-?\d+(\.\d+)?(px|em|rem|%)$/.test(value)) { ctx.notify('Use a number with px, em, rem or %, for example -0.2em.', true); return; }
      run('text.script', { id: ctx.selected(), mode: 'keep', shift: value });
    }, 'wl-primary'), btn('Clear shift', () => run('text.script', { id: ctx.selected(), mode: 'keep', shift: null }))))
  );
  const typeTab: Tab = {
    id: 'type', label: 'Type', element: typePane,
    refresh() {
      const node = ctx.state().site.nodes[ctx.selected()];
      const ok = !!node && inline.includes(node.tag) && !node.componentSourceId;
      setText(scriptNote, ok ? `Selected: ${node.name || node.tag} (${node.tag}).` : 'Select an inline text element (a span, sup or sub) to set superscript or subscript, or mark words in a text element above.');
      const markable = !!node && !!node.text && !node.children.length && !node.componentSourceId && ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span', 'sup', 'sub', 'a', 'blockquote', 'figcaption', 'div'].includes(node.tag);
      markSuper.disabled = !markable;
      markSub.disabled = !markable;
      markWords.disabled = !markable;
      const kept = node?.styles['vertical-align'] && !['super', 'sub', 'baseline'].includes(node.styles['vertical-align']) ? node.styles['vertical-align'] : '';
      for (const [mode, , button] of modes) { button.disabled = !ok; button.onclick = () => run('text.script', mode === 'none' || !kept ? { id: ctx.selected(), mode, trueGlyphs: glyphs.checked } : { id: ctx.selected(), mode, shift: kept, trueGlyphs: glyphs.checked }); }
      setValue(shift, shift.value || kept);
    }
  };

  const gap = text('16px');
  const padding = text('16px');
  const columns = number(1, 12);
  const layoutNote = note();
  const layoutPane = element('div', 'wl-pane');
  const convert = (mode: string, direction: string) => run('layout.convert', { id: ctx.selected(), mode, direction });
  const rowFlex = btn('Flex row', () => convert('flex', 'row'));
  const columnFlex = btn('Flex column', () => convert('flex', 'column'));
  const grid = btn('Grid', () => convert('grid', 'row'));
  layoutPane.append(
    section('Default layout values', element('p', 'wl-hint', 'Stored with the site. Used whenever you convert an element to flex or grid here, and by the layout.convert command for agents.'), row(field('Gap', gap), field('Padding', padding), field('Grid columns', columns)), btn('Save defaults', () => {
      const lengths = /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)$|^0$/;
      const paddings = padding.value.trim().split(/\s+/);
      if (!lengths.test(gap.value.trim()) || !paddings.length || paddings.length > 4 || paddings.some(p => !lengths.test(p))) { ctx.notify('Use CSS lengths such as 16px or 1.5rem; padding takes one to four.', true); return; }
      run('site.update', { patch: { settings: { layoutGap: gap.value.trim(), layoutPadding: padding.value.trim(), layoutColumns: String(Math.min(12, Math.max(1, Number(columns.value) || 3))) } } });
    }, 'wl-primary')),
    section('Convert the selected element', layoutNote, row(rowFlex, columnFlex, grid))
  );
  const layoutTab: Tab = {
    id: 'layout', label: 'Layout', element: layoutPane,
    refresh() {
      const state = ctx.state();
      const node = state.site.nodes[ctx.selected()];
      setValue(gap, state.site.settings.layoutGap || '16px');
      setValue(padding, state.site.settings.layoutPadding || '16px');
      setValue(columns, state.site.settings.layoutColumns || '3');
      const ok = !!node && !['img', 'input', 'br', 'hr', 'source', 'wbr'].includes(node.tag) && !node.componentSourceId;
      setText(layoutNote, ok ? `Selected: ${node.name || node.tag}. Gap ${state.site.settings.layoutGap || '16px'}, padding only when the element has none.` : 'Select a container element.');
      for (const button of [rowFlex, columnFlex, grid]) button.disabled = !ok;
    }
  };
  return [tableTab, typeTab, layoutTab];
}
