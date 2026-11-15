import { libraryMutate } from '../../api';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { t, tn } from '../../i18n';
import { colorControl } from './detail';
import type { LibIndex, LibPreset, LibResult, LibSection, LibStarter, LibraryHooks } from './types';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ARM_MS = 5000;

/**
 * Design-system presets (Apply preset sets every value the preset owns) and starter sites (pages and their sections,
 * with one product name and tint for the whole site). Both are one batch, so one undo step. A starter asks for its two
 * values inline, in its own row; nothing opens over the panel.
 */
export class Kits {
  readonly element = element('div', 'fw-lib-view fw-lib-kits');
  private scroller = element('div', 'fw-lib-scroll');
  private presets = element('div', 'fw-lib-rows');
  private starters = element('div', 'fw-lib-rows');
  private note = element('p', 'fw-lib-note');
  private sections: LibSection[] = [];
  private busy = false;

  constructor(private hooks: LibraryHooks, private openPage: (page: string) => void) {
    this.note.setAttribute('role', 'status');
    const presetHead = element('h3', 'fw-lib-subhead', t('Presets'));
    const presetHelp = element('p', 'fw-lib-help', t('A preset holds tokens, light and dark values, fonts, text presets and page styles. Inserting a section adds only what your site lacks. Apply preset sets every value the preset owns.'));
    const starterHead = element('h3', 'fw-lib-subhead', t('Starters'));
    const starterHelp = element('p', 'fw-lib-help', t('A starter adds pages with their sections in one step. Pick one product name and tint for the whole site.'));
    this.scroller.append(presetHead, presetHelp, this.presets, starterHead, starterHelp, this.starters);
    const foot = element('div', 'fw-lib-foot fw-lib-foot-note');
    foot.append(this.note);
    this.element.append(this.scroller, foot);
  }

  setIndex(index: LibIndex): void {
    this.sections = index.sections;
    keyed(this.presets, index.presets, item => item.id, item => this.presetRow(item), (node, item) => {
      text(node.querySelector<HTMLElement>('.fw-lib-row-name')!, t(item.name || item.id));
      text(node.querySelector<HTMLElement>('.fw-lib-row-text')!, item.description ? t(item.description) : '');
    });
    keyed(this.starters, index.starters, item => item.id, item => this.starterRow(item), (node, item) => {
      const pages = item.pages || [];
      text(node.querySelector<HTMLElement>('.fw-lib-row-name')!, t(item.name || item.id));
      text(node.querySelector<HTMLElement>('.fw-lib-row-text')!, item.description ? t(item.description) : '');
      text(node.querySelector<HTMLElement>('.fw-lib-row-meta')!, `${tn(pages.length, '{0} page', '{0} pages')}: ${pages.map(page => page.name || page.slug || '').filter(Boolean).join(', ')}`);
    });
    this.presets.hidden = !index.presets.length;
    this.starters.hidden = !index.starters.length;
  }

  private say(message: string, error = false): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
    if (message) this.hooks.notify(message, error);
  }

  private row(name: string): HTMLElement {
    const row = element('div', 'fw-lib-row');
    row.dataset.row = name;
    row.append(element('span', 'fw-lib-row-name'), element('span', 'fw-lib-row-text'));
    return row;
  }

  private presetRow(item: LibPreset): HTMLElement {
    const row = this.row('preset');
    const apply = element('button', 'fw-lib-action', t('Apply preset'));
    apply.type = 'button';
    let armed = 0;
    const disarm = (): void => { clearTimeout(armed); armed = 0; text(apply, t('Apply preset')); apply.classList.remove('is-armed'); };
    apply.addEventListener('blur', disarm);
    apply.addEventListener('click', () => {
      if (!armed) {
        text(apply, t('Confirm: replace values'));
        apply.classList.add('is-armed');
        armed = window.setTimeout(disarm, ARM_MS);
        return;
      }
      disarm();
      void this.guard(apply, async () => {
        const result = await libraryMutate<LibResult>(`/api/library/presets/${encodeURIComponent(item.id)}/apply`, { mode: 'all', page: this.hooks.placement().page });
        this.say(result.changed === false ? t('The site already matches this preset.') : t('Preset applied.'));
      });
    });
    row.append(apply);
    return row;
  }

  private starterRow(item: LibStarter): HTMLElement {
    const row = this.row('starter');
    row.append(element('span', 'fw-lib-row-meta'));
    const open = element('button', 'fw-lib-action', t('Use starter'));
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    const form = element('div', 'fw-lib-starter-form');
    form.hidden = true;
    const names = this.defaults(item);
    const name = element('input');
    name.type = 'text';
    name.maxLength = 400;
    name.value = names.name;
    name.setAttribute('aria-label', t('Product name'));
    const tint = colorControl(names.tint, t('Tint'));
    const nameField = element('div', 'field');
    nameField.append(element('span', 'field-label', t('Product name')), name);
    const tintField = element('div', 'field');
    tintField.append(element('span', 'field-label', t('Tint')), tint.row);
    const add = element('button', 'fw-lib-insert primary', t('Add pages'));
    add.type = 'button';
    add.prepend(icon('plus'));
    form.append(nameField, tintField, add);
    open.addEventListener('click', () => {
      form.hidden = !form.hidden;
      open.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) { name.focus({ preventScroll: true }); form.scrollIntoView({ block: 'nearest' }); }
    });
    add.addEventListener('click', () => {
      const color = tint.input.value.trim();
      if (!HEX.test(color)) { this.say(t('Enter a hex color such as #ff9a3c.'), true); tint.input.focus(); return; }
      void this.guard(add, async () => {
        const result = await libraryMutate<LibResult>(`/api/library/starters/${encodeURIComponent(item.id)}/apply`, { values: { tint: color, name: name.value } });
        const pages = result.pages || [];
        if (pages[0]) this.openPage(pages[0]);
        this.say(tn(pages.length, 'Starter added: {0} page.', 'Starter added: {0} pages.'));
        if (result.warnings?.length) this.hooks.notify(result.warnings[0], false);
        form.hidden = true;
        open.setAttribute('aria-expanded', 'false');
      });
    });
    row.append(open, form);
    return row;
  }

  /** The tint and product name a starter begins with: those of its first section that has them (the chrome has no product). */
  private defaults(item: LibStarter): { name: string; tint: string } {
    const wanted = new Set((item.pages || []).flatMap(page => page.sections || []));
    const first = this.sections.find(section => wanted.has(section.id) && section.fields?.tint && section.fields?.name && section.category !== 'chrome');
    const name = first?.fields?.name?.default;
    const tint = first?.fields?.tint?.default;
    return { name: typeof name === 'string' ? name : '', tint: typeof tint === 'string' && HEX.test(tint) ? tint : '#ff9a3c' };
  }

  private async guard(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    button.disabled = true;
    this.say('');
    try { await action(); } catch (error) { this.say(error instanceof Error ? error.message : String(error), true); } finally { this.busy = false; button.disabled = false; }
  }
}
