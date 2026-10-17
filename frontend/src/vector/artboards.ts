import { subscribe } from '../api';
import { t } from '../i18n';
import type { Command, Site, SiteNode } from '../types';
import { element, keyed, text, value } from '../ui/dom';
import { pathBounds } from './geometry';
import type { Host } from './host';
import { addSvg, freshId, moveNode, pathIds, readShape, removeNode } from './store';

export interface Board { id: string; name: string; page: string; w: number; h: number; vb: [number, number, number, number]; left: number; top: number }

export const ARTBOARD_PRESETS: [string, number, number][] = [['1080 × 1080', 1080, 1080], ['1920 × 1080', 1920, 1080], ['1200 × 628', 1200, 628], ['A4 595 × 842', 595, 842], ['Letter 612 × 792', 612, 792], ['800 × 600', 800, 600]];

const num = (v: string | undefined, fallback = 0): number => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : fallback; };
const r2 = (n: number): string => String(Math.round(n * 100) / 100);

export function boards(site: Site): Board[] {
  const out: Board[] = [];
  for (const page of site.pages) {
    const visit = (id: string): void => {
      const node = site.nodes[id];
      if (!node) return;
      if (node.tag === 'svg') {
        const vb = (node.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
        const w = num(node.attrs.width, vb[2] || 100), h = num(node.attrs.height, vb[3] || 100);
        out.push({ id, name: node.name, page: page.name, w, h, vb: vb.length === 4 && vb.every(Number.isFinite) ? [vb[0], vb[1], vb[2], vb[3]] : [0, 0, w, h], left: num(node.styles.left), top: num(node.styles.top) });
        return;
      }
      node.children.forEach(visit);
    };
    visit(page.root);
  }
  return out;
}

function parentOf(site: Site, id: string): string | undefined {
  for (const node of Object.values(site.nodes)) if (node.children.includes(id)) return node.id;
  return undefined;
}

/* Artboards panel order is document order. Move up or down swaps a board with its neighbour board in the same parent. */
export function reorderCommands(site: Site, id: string, dir: -1 | 1): Command[] | null {
  const parent = parentOf(site, id);
  if (!parent) return null;
  const kids = site.nodes[parent].children;
  const peers = kids.filter(k => site.nodes[k]?.tag === 'svg');
  const at = peers.indexOf(id), other = peers[at + dir];
  if (at < 0 || !other) return null;
  return [moveNode(id, parent, kids.indexOf(other))];
}

export type RearrangeLayout = 'grid-row' | 'grid-column' | 'row' | 'column';
export interface RearrangeOptions { layout: RearrangeLayout; count: number; spacing: number; rtl: boolean }

/* Rearrange All Artboards for the boards directly under one parent, in panel order, starting at their top-left
   corner. Grid by Row fills rows of `count` boards, Grid by Column fills columns of `count`; Arrange by Row and by
   Column put all in one row or column. Right to left fills each row from the right. Art lives inside each board,
   so it always moves with it. */
export function rearrangeCommands(site: Site, parent: string, o: RearrangeOptions): Command[] {
  const list = boards(site).filter(b => parentOf(site, b.id) === parent);
  if (!list.length) return [];
  const n = list.length;
  const count = Math.max(1, Math.min(n, Math.round(o.count)));
  const perRow = o.layout === 'row' ? n : o.layout === 'column' ? 1 : o.layout === 'grid-row' ? count : Math.ceil(n / count);
  const rowsOf = (i: number): [number, number] => (o.layout === 'grid-column' ? [i % count, Math.floor(i / count)] : [Math.floor(i / perRow), i % perRow]);
  const cells = list.map((b, i) => ({ b, r: rowsOf(i)[0], c: rowsOf(i)[1] }));
  const rows = Math.max(...cells.map(x => x.r)) + 1, cols = Math.max(...cells.map(x => x.c)) + 1;
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...cells.filter(x => x.c === c).map(x => x.b.w)));
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...cells.filter(x => x.r === r).map(x => x.b.h)));
  const x0 = Math.min(...list.map(b => b.left)), y0 = Math.min(...list.map(b => b.top));
  const gap = Math.max(0, o.spacing);
  const colX = colW.map((_, c) => x0 + colW.slice(0, c).reduce((a, w) => a + w + gap, 0));
  const total = colW.reduce((a, w) => a + w, 0) + gap * (cols - 1);
  const rowY = rowH.map((_, r) => y0 + rowH.slice(0, r).reduce((a, h) => a + h + gap, 0));
  return cells.map(({ b, r, c }) => {
    const left = o.rtl ? x0 + total - (colX[c] - x0) - colW[c] : colX[c];
    return { command: 'node.update', params: { id: b.id, patch: { styles: { left: `${r2(left)}px`, top: `${r2(rowY[r])}px` } } } } as Command;
  });
}

function subtree(site: Site, id: string, out: SiteNode[] = []): SiteNode[] {
  const node = site.nodes[id];
  if (!node) return out;
  out.push(node);
  node.children.forEach(child => subtree(site, child, out));
  return out;
}

export function duplicateCommands(site: Site, board: Board): { cmds: Command[]; id: string } | null {
  const parent = parentOf(site, board.id);
  if (!parent) return null;
  const nodes = subtree(site, board.id);
  const taken = new Set<string>();
  const map = new Map<string, string>();
  for (const node of nodes) map.set(node.id, freshId(site, taken, node.tag === 'svg' ? 'vector' : node.tag.toLowerCase().replace(/[^a-z]/g, '') || 'node'));
  const remap = (raw: string): string => raw
    .replace(/url\(#([A-Za-z0-9_-]+)\)/g, (m, id: string) => (map.has(id) ? `url(#${map.get(id)})` : m))
    .replace(/^#([A-Za-z0-9_-]+)$/, (m, id: string) => (map.has(id) ? `#${map.get(id)}` : m))
    .replace(/"([A-Za-z0-9_-]+)"/g, (m, id: string) => (map.has(id) ? `"${map.get(id)}"` : m));
  const cmds: Command[] = [];
  for (const node of nodes) {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.attrs)) attrs[k] = k === 'id' ? (map.get(v) ?? v) : remap(v);
    const styles: Record<string, string> = { ...node.styles };
    let name = node.name;
    if (node.id === board.id) { styles.left = `${r2(board.left + board.w + 40)}px`; name = `${node.name} copy`; }
    cmds.push({ command: 'node.add', params: { parent: node.id === board.id ? parent : map.get(parentOf(site, node.id) ?? '')!, node: { id: map.get(node.id)!, tag: node.tag, name, text: node.text, attrs, styles } } });
  }
  return { cmds, id: map.get(board.id)! };
}

export function fitCommands(site: Site, board: Board): Command[] | null {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  for (const id of pathIds(site, board.id)) {
    const shape = readShape(site, id);
    const b = shape ? pathBounds(shape.subs) : null;
    if (!shape || !b) continue;
    const pad = shape.paint.stroke === 'none' ? 0 : shape.paint.strokeWidth / 2;
    const next = { x0: b.x - pad, y0: b.y - pad, x1: b.x + b.w + pad, y1: b.y + b.h + pad };
    box = box ? { x0: Math.min(box.x0, next.x0), y0: Math.min(box.y0, next.y0), x1: Math.max(box.x1, next.x1), y1: Math.max(box.y1, next.y1) } : next;
  }
  if (!box) return null;
  const sx = board.w / (board.vb[2] || 1), sy = board.h / (board.vb[3] || 1);
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  return [{
    command: 'node.update',
    params: {
      id: board.id,
      patch: {
        attrs: { viewBox: `${r2(box.x0)} ${r2(box.y0)} ${r2(w)} ${r2(h)}`, width: r2(w * sx), height: r2(h * sy) },
        styles: { left: `${r2(board.left + (box.x0 - board.vb[0]) * sx)}px`, top: `${r2(board.top + (box.y0 - board.vb[1]) * sy)}px` }
      }
    }
  }];
}

export function resizeCommands(board: Board, w: number, h: number): Command[] {
  const sx = board.w / (board.vb[2] || 1), sy = board.h / (board.vb[3] || 1);
  return [{ command: 'node.update', params: { id: board.id, patch: { attrs: { width: r2(w), height: r2(h), viewBox: `${r2(board.vb[0])} ${r2(board.vb[1])} ${r2(w / sx)} ${r2(h / sy)}` } } } }];
}

export class ArtboardsPanel {
  private root: HTMLElement | null = null;
  private list = element('div', 'fw-v-boardlist');
  private preset = element('select', 'fw-v-input');
  private w = element('input', 'fw-v-input');
  private h = element('input', 'fw-v-input');
  private empty = element('p', 'fw-v-note');

  constructor(private host: Host, private select: (id: string) => void, private pageRoot: () => string, private rearrange: () => void = () => undefined) {
    subscribe(() => { if (this.root && !this.root.hidden) this.refresh(); });
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog fw-v-artboards');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('Artboards'));
    root.hidden = true;
    const head = element('div', 'fw-v-row');
    const close = element('button', 'fw-v-btn', t('Close'));
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    head.append(element('div', 'fw-v-summary', t('Artboards')), close);
    for (const [label, w, h] of ARTBOARD_PRESETS) { const o = element('option', '', label); o.value = `${w}x${h}`; this.preset.append(o); }
    const custom = element('option', '', t('Custom')); custom.value = 'custom'; this.preset.append(custom);
    this.preset.setAttribute('aria-label', t('Size'));
    for (const [input, label] of [[this.w, t('Width')], [this.h, t('Height')]] as const) { input.type = 'number'; input.min = '1'; input.max = '20000'; input.setAttribute('aria-label', label); }
    this.preset.addEventListener('change', () => { const [w, h] = this.preset.value.split('x'); if (h) { this.w.value = w; this.h.value = h; } });
    const add = element('button', 'fw-v-btn', t('New artboard'));
    add.type = 'button';
    add.addEventListener('click', () => void this.create());
    const size = element('div', 'fw-v-row');
    size.append(this.w, this.h);
    this.empty.textContent = t('No artboards on any page yet.');
    const area = element('div', 'fw-v-boardarea');
    area.append(this.list, this.empty);
    const arrange = element('button', 'fw-v-btn', t('Rearrange...'));
    arrange.type = 'button';
    arrange.addEventListener('click', () => this.rearrange());
    root.append(head, area, this.preset, size, add, arrange);
    root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); } });
    document.body.append(root);
    this.preset.value = '1080x1080';
    this.w.value = '1080';
    this.h.value = '1080';
    return root;
  }

  toggle(): void {
    this.root = this.root ?? this.build();
    if (this.root.hidden) { this.refresh(); this.root.hidden = false; } else this.close();
  }

  private close(): void { if (this.root && !this.root.hidden) this.root.hidden = true; }

  refresh(): void {
    let site: Site;
    try { site = this.host.site(); } catch { return; }
    const items = boards(site);
    if (this.empty.hidden !== items.length > 0) this.empty.hidden = items.length > 0;
    keyed(this.list, items, b => b.id, () => this.row(), (row, b) => {
      value(row.querySelector('input') as HTMLInputElement, b.name);
      text(row.querySelector('.fw-v-boardsize') as HTMLElement, `${r2(b.w)} × ${r2(b.h)} · ${b.page}`);
    });
  }

  private row(): HTMLElement {
    const row = element('div', 'fw-v-board');
    const name = element('input', 'fw-v-input');
    name.setAttribute('aria-label', t('Artboard name'));
    name.addEventListener('change', () => { const id = row.dataset.key!; const next = name.value.trim().slice(0, 120); if (next) void this.host.commit([{ command: 'node.update', params: { id, patch: { name: next } } }]); });
    const actions = element('div', 'fw-v-row');
    const act = (label: string, run: (b: Board) => void): void => {
      const btn = element('button', 'fw-v-btn', label);
      btn.type = 'button';
      btn.addEventListener('click', () => { const b = boards(this.host.site()).find(x => x.id === row.dataset.key); if (b) run(b); });
      actions.append(btn);
    };
    act(t('Select'), b => this.select(b.id));
    act(t('Move up'), b => { const cmds = reorderCommands(this.host.site(), b.id, -1); if (cmds) void this.host.commit(cmds); });
    act(t('Move down'), b => { const cmds = reorderCommands(this.host.site(), b.id, 1); if (cmds) void this.host.commit(cmds); });
    act(t('Duplicate'), b => { const made = duplicateCommands(this.host.site(), b); if (made) void this.host.commit(made.cmds).then(ok => { if (ok) this.select(made.id); }); });
    act(t('Fit to artwork'), b => { const cmds = fitCommands(this.host.site(), b); if (cmds) void this.host.commit(cmds); else this.host.notify(t('This artboard has no paths to fit.')); });
    act(t('Resize'), b => { const w = parseFloat(this.w.value), h = parseFloat(this.h.value); if (w >= 1 && h >= 1 && w <= 20000 && h <= 20000) void this.host.commit(resizeCommands(b, w, h)); });
    act(t('Delete'), b => void this.host.commit([removeNode(b.id)]));
    row.append(name, element('span', 'fw-v-boardsize'), actions);
    return row;
  }

  private async create(): Promise<void> {
    const w = parseFloat(this.w.value), h = parseFloat(this.h.value);
    if (!(w >= 1 && h >= 1 && w <= 20000 && h <= 20000)) { this.host.notify(t('Width and height must be between 1 and 20000.')); return; }
    const site = this.host.site();
    const parent = this.pageRoot();
    const existing = boards(site).filter(b => parentOf(site, b.id) === parent);
    const left = existing.length ? Math.max(...existing.map(b => b.left + b.w)) + 40 : 40;
    const id = freshId(site, new Set<string>(), 'vector');
    const cmds: Command[] = [];
    if (!site.nodes[parent]?.styles.position) cmds.push({ command: 'node.update', params: { id: parent, patch: { styles: { position: 'relative' } } } });
    cmds.push(addSvg(parent, id, { left, top: 40, width: w, height: h }, t('Artboard')));
    if (await this.host.commit(cmds)) this.select(id);
  }
}
