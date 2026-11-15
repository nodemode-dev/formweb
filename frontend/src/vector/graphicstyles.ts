import { subscribe } from '../api';
import { t } from '../i18n';
import { element } from '../ui/dom';
import type { Command, Site } from '../types';
import { colorToHex, gradientNode } from './gradient';
import type { Host } from './host';
import { liveOf } from './live';
import { refOf, updateAttrs } from './store';
import { dashPairs, strokeCommands, strokeModelOf } from './strokecmd';
import { cleanModel, type StrokeModel } from './strokefx';

// Storage: the site setting `vectorGraphicStyles` (JSON list). It is site-level, so every svg of the project
// shares one library, it travels in the saved site, and the exporter never reads it. Validated in
// native/crates/formweb-model/src/vector.rs (validate_styles).
export const STYLE_SETTING = 'vectorGraphicStyles';
export const STYLE_KEYS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'fill-opacity', 'opacity', 'paint-order', 'data-fw-align', 'data-fw-weight'] as const;
const MAX_STYLES = 128;

export interface GraphicStyle { id: string; name: string; attrs: Record<string, string>; fx?: StrokeModel }

export function readStyles(site: Site): GraphicStyle[] {
  try {
    const list = JSON.parse(site.settings[STYLE_SETTING] || '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is GraphicStyle => !!s && typeof s.id === 'string' && typeof s.name === 'string' && !!s.attrs && typeof s.attrs === 'object');
  } catch { return []; }
}

const writeCommand = (styles: GraphicStyle[]): Command => ({ command: 'site.update', params: { patch: { settings: { [STYLE_SETTING]: styles.length ? JSON.stringify(styles) : null } } } });

function solid(site: Site, host: Host, id: string, attr: 'fill' | 'stroke', value: string): string {
  const ref = refOf(value);
  if (!ref) return value;
  const svg = host.shape(id)?.svg;
  const node = svg ? gradientNode(site, svg, ref) : undefined;
  const stop = node?.children.map(child => site.nodes[child]).find(s => s?.tag === 'stop');
  return stop?.attrs['stop-color'] ? colorToHex(stop.attrs['stop-color'], '#808080') : attr === 'fill' ? '#808080' : 'none';
}

export function captureStyle(host: Host, name: string): GraphicStyle | null {
  const site = host.site();
  const id = host.selection().find(item => site.nodes[item]?.tag === 'path');
  if (!id) return null;
  const node = site.nodes[id];
  const attrs: Record<string, string> = {};
  for (const key of STYLE_KEYS) {
    const raw = node.attrs[key];
    if (raw === undefined || raw === '') continue;
    attrs[key] = key === 'fill' || key === 'stroke' ? solid(site, host, id, key, raw) : raw;
  }
  const found = liveOf(site, id);
  const fx = found && found.kind === 'stroke' ? cleanModel(strokeModelOf(host, id)) : undefined;
  const used = new Set(readStyles(site).map(style => style.id));
  let styleId = '';
  do { styleId = `style-${Math.random().toString(36).slice(2, 10)}`; } while (used.has(styleId));
  return { id: styleId, name: name.trim().slice(0, 60) || t('Style'), attrs, ...(fx ? { fx } : {}) };
}

export function applyCommands(host: Host, style: GraphicStyle): { cmds: Command[]; select: string[] } | null {
  const site = host.site();
  const ids = host.selection().filter(id => site.nodes[id]?.tag === 'path');
  if (!ids.length) { host.notify(t('Select one or more shapes to apply a style.')); return null; }
  const cmds: Command[] = ids.map(id => {
    const patch: Record<string, string | null> = {};
    for (const key of STYLE_KEYS) patch[key] = style.attrs[key] ?? null;
    return updateAttrs(id, patch);
  });
  let select: string[] = [];
  if (style.fx) {
    if (ids.every(id => (host.shape(id)?.paint.stroke ?? 'none') !== 'none' || liveOf(site, id)?.kind === 'stroke')) {
      const made = strokeCommands(host, { ...style.fx, dash: style.fx.dash.length ? style.fx.dash : dashPairs(style.attrs['stroke-dasharray'] ?? '') });
      if (made) { cmds.push(...made.cmds); select = made.select; }
    } else host.notify(t('Arrow and dash options need a stroke first; apply the style again once the shape has a stroke.'));
  }
  return { cmds, select };
}

function swatch(style: GraphicStyle): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('class', 'fw-v-stylesw');
  const rect = document.createElementNS(ns, 'rect');
  const weight = Math.min(8, Math.max(0, parseFloat(style.attrs['data-fw-weight'] ?? style.attrs['stroke-width'] ?? '0') || 0));
  const draw = (key: string, value: string): void => { if (/^[#a-zA-Z0-9(),.%\s-]+$/.test(value)) rect.setAttribute(key, value); };
  rect.setAttribute('x', '6'); rect.setAttribute('y', '6'); rect.setAttribute('width', '20'); rect.setAttribute('height', '20'); rect.setAttribute('rx', '3');
  draw('fill', style.attrs.fill ?? '#000000');
  draw('stroke', style.attrs.stroke ?? 'none');
  if (style.attrs.stroke && style.attrs.stroke !== 'none') {
    rect.setAttribute('stroke-width', String(Math.max(1, Math.min(6, weight || 1))));
    for (const key of ['stroke-linecap', 'stroke-linejoin', 'stroke-dasharray'] as const) if (style.attrs[key]) draw(key, style.attrs[key]);
  }
  const opacity = parseFloat(style.attrs.opacity ?? '1');
  if (Number.isFinite(opacity)) rect.setAttribute('opacity', String(Math.max(0.05, Math.min(1, opacity))));
  svg.append(rect);
  return svg;
}

class StylesDialog {
  private root: HTMLElement | null = null;
  private list!: HTMLElement;
  private name!: HTMLInputElement;
  private host: Host | null = null;

  private button(label: string, run: () => void): HTMLButtonElement {
    const b = element('button', 'fw-v-btn', label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog fw-v-styles');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('Graphic Styles'));
    root.hidden = true;
    this.list = element('div', 'fw-v-stylelist');
    this.name = element('input', 'fw-v-input');
    this.name.type = 'text';
    this.name.maxLength = 60;
    this.name.placeholder = t('Style name');
    this.name.setAttribute('aria-label', t('Style name'));
    const save = this.button(t('Save from selection'), () => void this.save());
    const close = this.button(t('Close'), () => this.close());
    const row = element('div', 'fw-v-bar');
    row.append(this.name, save);
    root.append(element('div', 'fw-v-summary', t('Graphic Styles')), element('p', 'fw-v-note', t('Click a style to apply it to the selected shapes.')), this.list, row, close);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
      else if (event.key === 'Enter' && event.target === this.name) { event.preventDefault(); void this.save(); }
    });
    subscribe(() => this.refresh());
    document.body.append(root);
    return root;
  }

  open(host: Host): void {
    this.host = host;
    this.root ??= this.build();
    this.root.hidden = false;
    this.refresh();
  }

  close(): void { if (this.root) this.root.hidden = true; }

  private refresh(): void {
    const host = this.host;
    if (!host || !this.root || this.root.hidden) return;
    const styles = readStyles(host.site());
    const sig = JSON.stringify(styles);
    if (this.list.dataset.sig === sig) return;
    this.list.dataset.sig = sig;
    if (!styles.length) { this.list.replaceChildren(element('p', 'fw-v-note', t('No styles yet. Select a shape and save one.'))); return; }
    this.list.replaceChildren(...styles.map(style => {
      const row = element('div', 'fw-v-styleitem');
      row.dataset.style = style.id;
      const use = element('button', 'fw-v-stylebtn');
      use.type = 'button';
      use.title = t('{0} {1}', [{ t: 'Apply' }, style.name]);
      use.append(swatch(style), element('span', 'fw-v-stylename', style.name));
      use.addEventListener('click', () => void this.apply(style));
      const rename = this.button(t('Rename'), () => this.rename(style, row));
      const remove = this.button(t('Delete'), () => void this.remove(style));
      row.append(use, rename, remove);
      return row;
    }));
  }

  private async save(): Promise<void> {
    const host = this.host;
    if (!host) return;
    const styles = readStyles(host.site());
    if (styles.length >= MAX_STYLES) { host.notify(t('The style library is full.')); return; }
    const style = captureStyle(host, this.name.value);
    if (!style) { host.notify(t('Select a shape to save its style.')); return; }
    if (await host.commit([writeCommand([...styles, style])])) this.name.value = '';
  }

  private async apply(style: GraphicStyle): Promise<void> {
    const host = this.host;
    const made = host && applyCommands(host, style);
    if (host && made) await host.commit(made.cmds, made.select.length ? made.select : undefined);
  }

  private rename(style: GraphicStyle, row: HTMLElement): void {
    const host = this.host;
    const label = row.querySelector<HTMLElement>('.fw-v-stylename');
    if (!host || !label || row.querySelector('input')) return;
    const input = element('input', 'fw-v-input');
    input.type = 'text';
    input.maxLength = 60;
    input.value = style.name;
    input.setAttribute('aria-label', t('Style name'));
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      const next = input.value.trim().slice(0, 60);
      if (keep && next && next !== style.name) void host.commit([writeCommand(readStyles(host.site()).map(item => (item.id === style.id ? { ...item, name: next } : item)))]);
      else input.replaceWith(label);
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  private async remove(style: GraphicStyle): Promise<void> {
    const host = this.host;
    if (host) await host.commit([writeCommand(readStyles(host.site()).filter(item => item.id !== style.id))]);
  }
}

const dialog = new StylesDialog();

export function openGraphicStyles(host: Host): void { dialog.open(host); }
