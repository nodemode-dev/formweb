import { t } from '../i18n';
import { element } from '../ui/dom';
import type { Command, Site } from '../types';
import { colorToHex, gradientNode } from './gradient';
import type { Host } from './host';
import { refOf, svgOf, updateAttrs } from './store';

export type Rule = 'complementary' | 'analogous' | 'triadic' | 'split' | 'tetradic' | 'monochromatic' | 'shades';
export const RULES: { id: Rule; label: string }[] = [
  { id: 'complementary', label: 'Complementary' }, { id: 'analogous', label: 'Analogous' }, { id: 'triadic', label: 'Triadic' },
  { id: 'split', label: 'Split complementary' }, { id: 'tetradic', label: 'Tetradic' }, { id: 'monochromatic', label: 'Monochromatic' }, { id: 'shades', label: 'Shades' }
];
const HUES: Record<Rule, number[]> = {
  complementary: [0, 180], analogous: [0, 30, -30], triadic: [0, 120, 240], split: [0, 150, 210], tetradic: [0, 90, 180, 270], monochromatic: [0], shades: [0]
};

type Rgb = [number, number, number];
type Hsl = [number, number, number];
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function toRgb(hex: string): Rgb { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
export function toHex(c: Rgb): string { return `#${c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`; }

export function toHsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function fromHsl([h, s, l]: Hsl): string {
  const hue = ((h % 360) + 360) % 360, sat = clamp(s, 0, 1), light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = light - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// Harmony: the i-th color (by usage) takes the i-th hue of the rule around the base color, keeping its own
// saturation and lightness. Greys keep their hue. Monochromatic keeps the base hue; shades also spreads lightness.
export function harmonize(colors: string[], base: string, rule: Rule): string[] {
  const [bh, bs] = toHsl(base);
  const hues = HUES[rule];
  if (rule === 'shades') {
    const order = colors.map((c, i) => ({ i, l: toHsl(c)[2] })).sort((a, b) => a.l - b.l);
    const out = new Array<string>(colors.length);
    order.forEach((item, k) => { out[item.i] = fromHsl([bh, bs, colors.length === 1 ? toHsl(base)[2] : 0.15 + (0.7 * k) / (colors.length - 1)]); });
    return out;
  }
  let k = 0;
  return colors.map(c => {
    const [, s, l] = toHsl(c);
    if (s < 0.06) return c;
    const sat = rule === 'monochromatic' ? clamp(s * (bs || 1), 0.05, 1) : s;
    return fromHsl([bh + hues[k++ % hues.length], sat, l]);
  });
}

const dist2 = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// k-means in RGB, weighted by use counts, deterministic farthest-first start.
export function reduceColors(colors: string[], counts: number[], n: number): string[] {
  if (n >= colors.length || colors.length === 0) return colors.slice();
  const pts = colors.map(toRgb);
  const centers: Rgb[] = [pts[counts.indexOf(Math.max(...counts))]];
  while (centers.length < n) {
    let best = 0, far = -1;
    pts.forEach((p, i) => { const d = Math.min(...centers.map(c => dist2(p, c))); if (d > far) { far = d; best = i; } });
    centers.push(pts[best]);
  }
  let owner = new Array<number>(pts.length).fill(0);
  for (let round = 0; round < 24; round++) {
    owner = pts.map(p => centers.reduce((best, c, k) => (dist2(p, c) < dist2(p, centers[best]) ? k : best), 0));
    let moved = false;
    centers.forEach((c, k) => {
      let w = 0; const sum: Rgb = [0, 0, 0];
      pts.forEach((p, i) => { if (owner[i] === k) { w += counts[i]; sum[0] += p[0] * counts[i]; sum[1] += p[1] * counts[i]; sum[2] += p[2] * counts[i]; } });
      if (!w) return;
      const next: Rgb = [sum[0] / w, sum[1] / w, sum[2] / w];
      if (dist2(next, c) > 0.25) moved = true;
      centers[k] = next;
    });
    if (!moved) break;
  }
  return owner.map(k => toHex(centers[k]));
}

export interface Use { id: string; attr: 'fill' | 'stroke' | 'stop-color'; raw: string | undefined }
export interface Palette { colors: string[]; counts: number[]; uses: Map<string, Use[]> }

let probe: HTMLElement | null = null;
function parseColor(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return colorToHex(v.length === 9 ? v.slice(0, 7) : v);
  if (/^rgba?\(/i.test(v)) return colorToHex(v, '') || null;
  if (!/^[a-z]+$/i.test(v) || /^(none|currentcolor|transparent|inherit|url)$/i.test(v)) return null;
  probe ??= document.createElement('span');
  probe.style.color = '';
  probe.style.color = v;
  if (!probe.style.color) return null;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return colorToHex(rgb, '') || null;
}

export function collectPalette(site: Site, roots: string[]): Palette {
  const uses = new Map<string, Use[]>();
  const seen = new Set<string>();
  const add = (id: string, attr: Use['attr']): void => {
    const node = site.nodes[id];
    const key = `${id}:${attr}`;
    if (!node || seen.has(key)) return;
    seen.add(key);
    const hex = parseColor(node.attrs[attr]);
    if (!hex) return;
    const list = uses.get(hex) ?? [];
    list.push({ id, attr, raw: node.attrs[attr] });
    uses.set(hex, list);
  };
  const gradient = (svg: string | undefined, ref: string): void => {
    const node = svg ? gradientNode(site, svg, ref) : undefined;
    node?.children.forEach(child => { if (site.nodes[child]?.tag === 'stop') add(child, 'stop-color'); });
  };
  const visit = (id: string, depth: number): void => {
    const node = site.nodes[id];
    if (!node || depth > 64) return;
    if (node.tag === 'stop') add(id, 'stop-color');
    else if (['svg', 'g', 'path', 'text', 'textPath', 'symbol', 'use'].includes(node.tag)) {
      for (const attr of ['fill', 'stroke'] as const) {
        const ref = refOf(node.attrs[attr]);
        if (ref) gradient(svgOf(site, id), ref); else add(id, attr);
      }
    }
    node.children.forEach(child => visit(child, depth + 1));
  };
  roots.forEach(root => visit(root, 0));
  const colors = [...uses.keys()].sort((a, b) => uses.get(b)!.length - uses.get(a)!.length);
  return { colors, counts: colors.map(c => uses.get(c)!.length), uses };
}

export function recolorCommands(palette: Palette, map: Map<string, string>): Command[] {
  const patches = new Map<string, Record<string, string>>();
  for (const [from, to] of map) {
    if (from === to) continue;
    for (const use of palette.uses.get(from) ?? []) patches.set(use.id, { ...patches.get(use.id), [use.attr]: to });
  }
  return [...patches].map(([id, attrs]) => updateAttrs(id, attrs));
}

class RecolorDialog {
  private root: HTMLElement | null = null;
  private rows!: HTMLElement;
  private rule!: HTMLSelectElement;
  private base!: HTMLInputElement;
  private reduce!: HTMLInputElement;
  private host: Host | null = null;
  private palette: Palette = { colors: [], counts: [], uses: new Map() };
  private target = new Map<string, string>();
  private touched: { el: Element; attr: string; raw: string | null }[] = [];

  private button(label: string, run: () => void): HTMLButtonElement {
    const b = element('button', 'fw-v-btn', label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  private build(): HTMLElement {
    const root = element('div', 'fw-v-dialog fw-v-recolor');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('Recolor Artwork'));
    root.hidden = true;
    this.rows = element('div', 'fw-v-recolor-rows');
    this.rule = element('select', 'fw-v-input');
    for (const r of RULES) { const o = element('option', '', t(r.label)); o.value = r.id; this.rule.append(o); }
    this.base = element('input', 'fw-v-color');
    this.base.type = 'color';
    this.base.setAttribute('aria-label', t('Base color'));
    this.reduce = element('input', 'fw-v-input');
    this.reduce.type = 'number';
    this.reduce.min = '1';
    this.reduce.step = '1';
    this.reduce.setAttribute('aria-label', t('Reduce colors to'));
    const harmony = element('div', 'fw-v-bar');
    harmony.append(this.base, this.rule, this.button(t('Apply harmony'), () => this.harmony()));
    const reduceRow = element('div', 'fw-v-bar');
    reduceRow.append(element('span', '', t('Reduce colors to')), this.reduce, this.button(t('Reduce'), () => this.shrink()));
    const tools = element('div', 'fw-v-bar');
    tools.append(this.button(t('Randomize order'), () => this.shuffle()), this.button(t('Reset'), () => this.reset()));
    const ok = this.button(t('OK'), () => this.accept());
    const cancel = this.button(t('Cancel'), () => this.cancel());
    const actions = element('div', 'fw-v-bar');
    actions.append(ok, cancel);
    root.append(element('div', 'fw-v-summary', t('Recolor Artwork')), element('p', 'fw-v-note', t('Current color, then new color. Changes preview live on the canvas.')), this.rows, harmony, reduceRow, tools, actions);
    this.reduce.addEventListener('change', () => this.shrink());
    root.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'SELECT') { event.preventDefault(); this.accept(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.cancel(); }
    });
    document.body.append(root);
    return root;
  }

  open(host: Host, roots: string[]): void {
    const palette = collectPalette(host.site(), roots);
    if (!palette.colors.length) { host.notify(t('No solid colors to recolor in this selection.')); return; }
    if (this.root && !this.root.hidden) this.cancel();
    this.host = host;
    this.palette = palette;
    this.root ??= this.build();
    this.target = new Map(palette.colors.map(c => [c, c]));
    this.base.value = palette.colors[0];
    this.reduce.max = String(palette.colors.length);
    this.reduce.value = String(palette.colors.length);
    this.paintRows();
    this.root.hidden = false;
    this.root.querySelector<HTMLElement>('button')?.focus();
  }

  private paintRows(): void {
    this.rows.replaceChildren(...this.palette.colors.map(from => {
      const row = element('div', 'fw-v-recolor-row');
      const old = element('span', 'fw-v-swatch');
      old.style.background = from;
      old.title = from;
      const input = element('input', 'fw-v-color');
      input.type = 'color';
      input.value = this.target.get(from) ?? from;
      input.setAttribute('aria-label', `${t('New color for')} ${from}`);
      input.addEventListener('input', () => { this.target.set(from, input.value.toLowerCase()); this.preview(); });
      row.append(old, element('span', 'fw-v-arrow', '→'), input, element('span', 'fw-v-note', `${from} (${this.palette.counts[this.palette.colors.indexOf(from)]})`));
      return row;
    }));
  }

  private assign(next: string[]): void {
    this.palette.colors.forEach((c, i) => this.target.set(c, next[i]));
    this.paintRows();
    this.preview();
  }

  private harmony(): void { this.assign(harmonize(this.palette.colors, this.base.value, this.rule.value as Rule)); }

  private shrink(): void {
    const n = clamp(Math.round(Number(this.reduce.value)) || this.palette.colors.length, 1, this.palette.colors.length);
    this.reduce.value = String(n);
    this.assign(reduceColors(this.palette.colors, this.palette.counts, n));
  }

  private shuffle(): void {
    const pool = this.palette.colors.map(c => this.target.get(c) ?? c);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.assign(pool);
  }

  private reset(): void {
    this.reduce.value = String(this.palette.colors.length);
    this.assign(this.palette.colors.slice());
  }

  private revert(): void {
    for (const item of this.touched.reverse()) { if (item.raw === null) item.el.removeAttribute(item.attr); else item.el.setAttribute(item.attr, item.raw); }
    this.touched = [];
  }

  private preview(): void {
    const host = this.host;
    if (!host) return;
    this.revert();
    for (const [from, to] of this.target) {
      if (from === to) continue;
      for (const use of this.palette.uses.get(from) ?? []) {
        const el = host.element(use.id);
        if (!el) continue;
        this.touched.push({ el, attr: use.attr, raw: el.getAttribute(use.attr) });
        el.setAttribute(use.attr, to);
      }
    }
  }

  private close(): void {
    this.revert();
    this.host = null;
    if (this.root) this.root.hidden = true;
  }

  private cancel(): void { this.close(); }

  private accept(): void {
    const host = this.host;
    const cmds = recolorCommands(this.palette, this.target);
    this.close();
    if (host && cmds.length) void host.commit(cmds);
  }
}

const dialog = new RecolorDialog();

export function openRecolor(host: Host, fallbackSvg: () => string | undefined): void {
  const site = host.site();
  const picked = host.selection().filter(id => site.nodes[id]);
  const roots = picked.length ? picked : [host.activeSvg() ?? fallbackSvg()].filter((id): id is string => !!id && !!site.nodes[id]);
  if (!roots.length) { host.notify(t('Select artwork, or open an SVG, to recolor.')); return; }
  dialog.open(host, roots);
}
