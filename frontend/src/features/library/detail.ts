import { upload } from '../../api';
import { element, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { t } from '../../i18n';
import { thumbBox, updateThumb } from './thumb';
import { categoryLabel, sectionName, sectionText, type LibComponent, type LibField, type LibSection, type LibraryHooks } from './types';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const LIMIT: Record<string, number> = { text: 400, longtext: 4000 };

/** Reads one control back: a value to send, nothing to send (left at its default), or a problem to show. */
type Control = { name: string; spec: LibField; input: HTMLInputElement | HTMLTextAreaElement; read: () => { value?: string | number; error?: string } };

/** #rgb to #rrggbb, because the native colour input only takes the long form. */
export function longHex(value: string): string {
  const v = value.trim();
  return /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(c => c + c).join('') : v;
}

/** A colour field: the swatch (native picker) and the hex text beside it, kept in step. */
export function colorControl(initial: string, label: string): { row: HTMLElement; input: HTMLInputElement } {
  const row = element('div', 'fw-lib-color');
  const swatch = element('input', 'fw-lib-swatch');
  swatch.type = 'color';
  swatch.setAttribute('aria-label', label);
  const input = element('input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.maxLength = 7;
  input.setAttribute('aria-label', label);
  input.placeholder = '#ff9a3c';
  const set = (value: string): void => {
    input.value = value;
    if (HEX.test(value)) swatch.value = longHex(value).toLowerCase();
  };
  set(initial);
  swatch.addEventListener('input', () => { input.value = swatch.value; input.dispatchEvent(new Event('input', { bubbles: true })); });
  input.addEventListener('input', () => { if (HEX.test(input.value.trim())) swatch.value = longHex(input.value).toLowerCase(); });
  row.append(swatch, input);
  return { row, input };
}

/**
 * The detail view: larger thumbnail, description, the template's fields as inputs and Insert. It replaces the list in
 * the same panel (no overlay, no layout change around it). Each section's form is built once and kept, so what was
 * typed survives going back and forth.
 */
export class SectionDetail {
  readonly element = element('div', 'fw-lib-view fw-lib-detail');
  private back = element('button', 'fw-lib-back');
  private crumb = element('span', 'fw-lib-crumb');
  private scroller = element('div', 'fw-lib-scroll');
  private thumb = thumbBox('fw-lib-thumb-large');
  private title = element('h3', 'fw-lib-title');
  private about = element('p', 'fw-lib-about');
  private parts = element('div', 'fw-lib-parts');
  private form = element('div', 'fw-lib-fields');
  private note = element('p', 'fw-lib-note');
  private insert = element('button', 'fw-lib-insert primary');
  private label = element('span', '', t('Insert section'));
  private forms = new Map<string, Control[]>();
  private current: LibSection | null = null;
  private busy = false;

  constructor(private hooks: LibraryHooks, private components: () => LibComponent[], onBack: () => void, private onInsert: (section: LibSection, values: Record<string, string | number>) => Promise<string>) {
    this.back.type = 'button';
    this.back.append(icon('chevronLeft'), element('span', '', t('Library')));
    this.back.setAttribute('aria-label', t('Back to the library'));
    this.back.addEventListener('click', onBack);
    const bar = element('div', 'fw-lib-bar');
    bar.append(this.back, this.crumb);
    this.note.setAttribute('role', 'status');
    this.insert.type = 'button';
    this.insert.append(icon('plus'), this.label);
    this.insert.addEventListener('click', () => void this.submit());
    const foot = element('div', 'fw-lib-foot');
    foot.append(this.note, this.insert);
    this.scroller.append(this.thumb, this.title, this.about, this.parts, this.form);
    this.element.append(bar, this.scroller, foot);
  }

  show(section: LibSection): void {
    const changed = this.current?.id !== section.id;
    this.current = section;
    updateThumb(this.thumb, this.hooks, section, false);
    text(this.title, sectionName(section));
    text(this.about, sectionText(section));
    this.about.hidden = !this.about.textContent;
    text(this.crumb, categoryLabel(section.category || ''));
    const known = new Map(this.components().map(item => [item.id, item]));
    const ids = section.components || [];
    this.parts.replaceChildren(...ids.map(id => {
      const item = known.get(id);
      const chip = element('span', 'fw-lib-part');
      chip.append(element('span', 'fw-lib-part-code', item?.code || ''), element('span', '', item?.name || id));
      if (item?.description) chip.title = item.description;
      return chip;
    }));
    this.parts.hidden = !ids.length;
    this.form.replaceChildren(...this.controls(section).map(control => control.input.closest('.field') as HTMLElement));
    this.form.hidden = !this.forms.get(section.id)?.length;
    if (changed) { this.say('', false); this.scroller.scrollTop = 0; }
  }

  private controls(section: LibSection): Control[] {
    const made = this.forms.get(section.id);
    if (made) return made;
    const list: Control[] = [];
    for (const [name, spec] of Object.entries(section.fields || {})) {
      const kind = spec.type || 'text';
      const label = t(spec.label || name);
      const initial = spec.default === undefined || spec.default === null ? '' : String(spec.default);
      const wrap = element('div', 'field');
      wrap.append(element('span', 'field-label', label));
      let input: HTMLInputElement | HTMLTextAreaElement;
      if (kind === 'color') {
        const made = colorControl(initial, label);
        input = made.input;
        wrap.append(made.row);
      } else if (kind === 'longtext') {
        const area = element('textarea', 'fw-lib-area');
        area.rows = 4;
        area.value = initial;
        area.maxLength = LIMIT.longtext;
        area.setAttribute('aria-label', label);
        input = area;
        wrap.append(area);
      } else {
        const line = element('input');
        line.type = kind === 'number' ? 'number' : kind === 'url' ? 'url' : 'text';
        line.value = initial;
        if (LIMIT[kind]) line.maxLength = LIMIT[kind];
        line.setAttribute('aria-label', label);
        input = line;
        if (kind === 'asset') wrap.append(this.assetRow(line));
        else wrap.append(line);
      }
      input.dataset.field = `library.${section.id}.${name}`;
      list.push({
        name, spec, input,
        read: () => {
          const raw = input.value;
          const same = raw === initial;
          if (kind === 'color') {
            const value = raw.trim();
            if (!HEX.test(value)) return { error: t('Enter a hex color such as #ff9a3c.') };
            return same ? {} : { value };
          }
          if (kind === 'number') {
            if (raw.trim() === '') return {};
            const value = Number(raw);
            return Number.isFinite(value) ? (same ? {} : { value }) : { error: t('Enter a number.') };
          }
          return same ? {} : { value: raw };
        }
      });
    }
    this.forms.set(section.id, list);
    return list;
  }

  /** An asset field is a path or URL with an Upload button beside it. */
  private assetRow(line: HTMLInputElement): HTMLElement {
    const row = element('div', 'fw-lib-asset');
    const pick = element('input');
    pick.type = 'file';
    pick.accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';
    pick.hidden = true;
    const choose = element('button', 'fw-lib-choose', t('Upload'));
    choose.type = 'button';
    choose.addEventListener('click', () => pick.click());
    pick.addEventListener('change', () => {
      const file = pick.files?.[0];
      pick.value = '';
      if (!file) return;
      choose.disabled = true;
      upload(file).then(stored => { line.value = stored.url; this.say('', false); })
        .catch(error => this.say(error instanceof Error ? error.message : String(error), true))
        .finally(() => { choose.disabled = false; });
    });
    row.append(line, choose, pick);
    return row;
  }

  private say(message: string, error: boolean): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
  }

  private async submit(): Promise<void> {
    const section = this.current;
    if (!section || this.busy) return;
    const values: Record<string, string | number> = {};
    for (const control of this.controls(section)) {
      const result = control.read();
      control.input.setAttribute('aria-invalid', String(!!result.error));
      if (result.error) { this.say(`${t(control.spec.label || control.name)}: ${result.error}`, true); control.input.focus(); return; }
      if (result.value !== undefined) values[control.name] = result.value;
    }
    this.busy = true;
    this.insert.disabled = true;
    text(this.label, t('Inserting...'));
    this.say('', false);
    try {
      this.say(await this.onInsert(section, values), false);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.busy = false;
      this.insert.disabled = false;
      text(this.label, t('Insert section'));
    }
  }
}
