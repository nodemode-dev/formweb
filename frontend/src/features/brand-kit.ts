import type { Command, EditorState } from '../types';
import { element, keyed, text } from '../ui/dom';
import '../styles/brand-kit.css';

/**
 * Brand kit (FW-066). The kit lives in the site document so it travels with .fweb files and exports:
 * colors are typed color tokens named brand-[name], fonts are typed text tokens named brand-font-[name]
 * (both through token.define, so they export as CSS custom properties), and logos are site settings
 * brandLogo and brandLogoDark holding uploaded asset URLs. The inspector's color and font fields offer
 * the kit through datalists, so picking a brand value writes var(--brand-[name]).
 */
export type BrandEntry = { token: string; name: string; value: string };
export type Brand = { colors: BrandEntry[]; fonts: BrandEntry[]; logo: string; logoDark: string };
type Hooks = {
  state: () => EditorState;
  commands: (batch: Command[]) => Promise<unknown>;
  pickLogo: (dark: boolean) => void;
  insertLogo: (url: string, dark: boolean) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  assetUrl: (url: string) => string;
};

const FONT_STACKS = [
  'Inter, system-ui, sans-serif',
  'JetBrains Mono, ui-monospace, monospace',
  'Georgia, Times New Roman, serif',
  'system-ui, -apple-system, Segoe UI, sans-serif'
];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function readBrand(state: EditorState): Brand {
  const site = state.site as unknown as { extensions?: Record<string, { tokens?: Record<string, { type: string; value: string }> }>; settings: Record<string, string> };
  const typed = site.extensions?.design?.tokens || {};
  const colors: BrandEntry[] = [];
  const fonts: BrandEntry[] = [];
  for (const [token, item] of Object.entries(typed)) {
    if (token.startsWith('brand-font-') && item.type === 'text') fonts.push({ token, name: token.slice(11), value: item.value });
    else if (token.startsWith('brand-') && item.type === 'color') colors.push({ token, name: token.slice(6), value: item.value });
  }
  colors.sort((a, b) => a.name.localeCompare(b.name));
  fonts.sort((a, b) => a.name.localeCompare(b.name));
  return { colors, fonts, logo: site.settings.brandLogo || '', logoDark: site.settings.brandLogoDark || '' };
}

export class BrandKit {
  readonly element = element('div', 'fw-brand');
  private colorList = element('div', 'fw-brand-list');
  private fontList = element('div', 'fw-brand-list');
  private logoImg = element('img', 'fw-brand-logo');
  private logoDarkImg = element('img', 'fw-brand-logo is-dark');
  private colorName = element('input');
  private colorValue = element('input');
  private fontName = element('input');
  private fontValue = element('select');

  constructor(private hooks: Hooks) {
    this.colorName.placeholder = 'name, e.g. primary';
    this.colorName.dataset.field = 'brand.color-name';
    this.colorValue.type = 'color';
    this.colorValue.value = '#f97316';
    this.colorValue.dataset.field = 'brand.color-value';
    this.fontName.placeholder = 'name, e.g. heading';
    this.fontName.dataset.field = 'brand.font-name';
    this.fontValue.dataset.field = 'brand.font-value';
    for (const stack of FONT_STACKS) { const option = element('option', '', stack.split(',')[0]); option.value = stack; this.fontValue.append(option); }
    this.logoImg.alt = 'Brand logo';
    this.logoDarkImg.alt = 'Brand logo for dark backgrounds';
    this.element.append(
      element('p', 'empty-note', 'Your brand kit is saved in this site. Colors and fonts become design tokens (var(--brand-name)) that the Design inspector offers in its color and font fields; logos can be inserted anywhere.'),
      this.heading('Colors'), this.colorList, this.addRow(this.colorName, this.colorValue, 'Add color', 'brand.add-color', () => this.addColor()),
      this.heading('Fonts'), this.fontList, this.addRow(this.fontName, this.fontValue, 'Add font', 'brand.add-font', () => this.addFont()),
      this.heading('Logos'), this.logoRow(false), this.logoRow(true)
    );
  }

  private heading(label: string): HTMLElement { return element('h3', 'fw-brand-title', label); }

  private button(label: string, command: string, action: () => unknown, className = 'quiet'): HTMLButtonElement {
    const node = element('button', className, label);
    node.type = 'button';
    node.dataset.command = command;
    node.addEventListener('click', () => { Promise.resolve(action()).catch(error => this.hooks.notify(error instanceof Error ? error.message : String(error), true)); });
    return node;
  }

  private addRow(name: HTMLInputElement, value: HTMLElement, label: string, command: string, action: () => unknown): HTMLElement {
    const row = element('div', 'fw-brand-add');
    row.append(name, value, this.button(label, command, action));
    return row;
  }

  private logoRow(dark: boolean): HTMLElement {
    const row = element('div', 'fw-brand-logo-row');
    const img = dark ? this.logoDarkImg : this.logoImg;
    const label = element('span', 'fw-brand-label', dark ? 'Logo for dark backgrounds' : 'Logo');
    row.append(img, label,
      this.button('Upload', dark ? 'brand.logo-dark' : 'brand.logo', () => this.hooks.pickLogo(dark)),
      this.button('Insert', dark ? 'brand.insert-logo-dark' : 'brand.insert-logo', () => {
        const brand = readBrand(this.hooks.state());
        const url = dark ? brand.logoDark : brand.logo;
        if (!url) throw new Error('Upload a logo first.');
        return this.hooks.insertLogo(url, dark);
      }));
    return row;
  }

  private slug(raw: string): string {
    const name = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!SLUG.test(name)) throw new Error('Give it a short name using letters and numbers, like primary or accent.');
    return name;
  }

  private async addColor(): Promise<void> {
    const name = this.slug(this.colorName.value);
    await this.hooks.commands([{ command: 'token.define', params: { name: `brand-${name}`, type: 'color', value: this.colorValue.value } }]);
    this.colorName.value = '';
    this.hooks.notify(`Brand color ${name} saved as var(--brand-${name}).`);
  }

  private async addFont(): Promise<void> {
    const name = this.slug(this.fontName.value);
    await this.hooks.commands([{ command: 'token.define', params: { name: `brand-font-${name}`, type: 'text', value: this.fontValue.value } }]);
    this.fontName.value = '';
    this.hooks.notify(`Brand font ${name} saved as var(--brand-font-${name}).`);
  }

  private async remove(token: string): Promise<void> {
    const site = this.hooks.state().site as unknown as { extensions?: Record<string, Record<string, unknown>> };
    const design = { ...(site.extensions?.design || {}) } as Record<string, unknown>;
    const tokens = { ...((design.tokens as Record<string, unknown>) || {}) };
    delete tokens[token];
    design.tokens = tokens;
    await this.hooks.commands([{ command: 'token.set', params: { name: token, value: null } }, { command: 'extension.set', params: { group: 'design', value: design } }]);
    this.hooks.notify(`${token} removed from the brand kit. Elements still using var(--${token}) fall back to their inherited value.`);
  }

  private entryRow(kind: 'color' | 'font'): HTMLElement {
    const row = element('div', 'fw-brand-row');
    const swatch = element(kind === 'color' ? 'input' : 'span', 'fw-brand-swatch');
    if (swatch instanceof HTMLInputElement) {
      swatch.type = 'color';
      swatch.addEventListener('change', () => {
        const token = row.dataset.key || '';
        this.hooks.commands([{ command: 'token.define', params: { name: token, type: 'color', value: swatch.value } }]).catch(error => this.hooks.notify(String(error), true));
      });
    } else text(swatch, 'Aa');
    const remove = this.button('Remove', `brand.remove-${kind}`, () => this.remove(row.dataset.key || ''));
    row.append(swatch, element('span', 'fw-brand-name'), element('code', 'fw-brand-value'), remove);
    return row;
  }

  /** Called from the editor's update(); only text and attributes change in place. */
  update(state: EditorState): void {
    const brand = readBrand(state);
    keyed(this.colorList, brand.colors, item => item.token, () => this.entryRow('color'), (node, item) => {
      const swatch = node.querySelector('input') as HTMLInputElement;
      if (document.activeElement !== swatch && swatch.value !== item.value) swatch.value = item.value;
      text(node.querySelector('.fw-brand-name')!, item.name);
      text(node.querySelector('.fw-brand-value')!, `var(--${item.token})`);
    });
    keyed(this.fontList, brand.fonts, item => item.token, () => this.entryRow('font'), (node, item) => {
      (node.querySelector('.fw-brand-swatch') as HTMLElement).style.fontFamily = item.value;
      text(node.querySelector('.fw-brand-name')!, `${item.name}: ${item.value.split(',')[0]}`);
      text(node.querySelector('.fw-brand-value')!, `var(--${item.token})`);
    });
    for (const [img, url] of [[this.logoImg, brand.logo], [this.logoDarkImg, brand.logoDark]] as [HTMLImageElement, string][]) {
      img.dataset.empty = url ? 'false' : 'true';  // keeps its grid cell; hidden would collapse the row
      if (url && img.dataset.src !== url) { img.dataset.src = url; img.src = this.hooks.assetUrl(url); }
    }
  }
}
