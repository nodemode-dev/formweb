import { libraryMutate } from '../../api';
import { element, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { labelAttr, t } from '../../i18n';
import type { LibResult, LibraryHooks } from './types';
import { bringChoice } from './bring';

/**
 * Import HTML: paste a whole page (or pick an .html file) and optionally some CSS; the server turns it into one code
 * section placed like any other insert. The kit's reduced, onTheme and token helpers are provided there.
 */
export class HtmlImport {
  readonly element = element('div', 'fw-lib-view fw-lib-import');
  private name = element('input');
  private html = element('textarea', 'fw-lib-area fw-lib-code');
  private css = element('textarea', 'fw-lib-area fw-lib-code');
  private file = element('input');
  private note = element('p', 'fw-lib-note');
  private go = element('button', 'fw-lib-insert primary');
  private bring = bringChoice('Bring it in as');
  private busy = false;

  constructor(private hooks: LibraryHooks, openSite: () => void) {
    const scroller = element('div', 'fw-lib-scroll');
    const site = element('button', 'fw-lib-choose fw-lib-site-open', t('Import site from zip...'));
    site.type = 'button';
    site.prepend(icon('upload'));
    site.addEventListener('click', openSite);
    const help = element('p', 'fw-lib-help', t('Brings in one web page made somewhere else as a section of this page. Paste its HTML or choose the .html file: its styles and main script come along, and the script runs in Preview and on the published site.'));
    labelAttr(help, 'title', 'Turns one whole HTML page into a code section. Its styles and first module script come along, and the formai kit helpers reduced, onTheme and token are provided. A code section runs its own JavaScript in Preview and in exports.');
    scroller.append(
      element('h3', 'fw-lib-subhead', t('Import a whole site')),
      element('p', 'fw-lib-help', t('A .zip of a static site made elsewhere: every HTML file becomes a page, with its stylesheets, pictures and fonts. You review the pages before anything changes.')),
      site,
      element('h3', 'fw-lib-subhead', t('Import HTML')),
      help
    );
    this.name.type = 'text';
    this.name.maxLength = 120;
    this.name.setAttribute('aria-label', t('Section name'));
    this.name.placeholder = t('Taken from the page title');
    this.html.rows = 9;
    this.html.spellcheck = false;
    this.html.placeholder = '<!doctype html>';
    this.html.setAttribute('aria-label', t('HTML'));
    this.css.rows = 4;
    this.css.spellcheck = false;
    this.css.setAttribute('aria-label', t('Extra CSS'));
    this.file.type = 'file';
    this.file.accept = '.html,.htm,text/html';
    this.file.hidden = true;
    const pick = element('button', 'fw-lib-choose', t('Choose an .html file'));
    pick.type = 'button';
    pick.prepend(icon('folder'));
    pick.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => {
      const chosen = this.file.files?.[0];
      this.file.value = '';
      if (!chosen) return;
      chosen.text().then(body => { this.html.value = body; if (!this.name.value) this.name.value = chosen.name.replace(/\.html?$/i, ''); this.say(chosen.name, false); })
        .catch(error => this.say(error instanceof Error ? error.message : String(error), true));
    });
    const field = (label: string, control: HTMLElement): HTMLElement => {
      const wrap = element('div', 'field');
      wrap.append(element('span', 'field-label', label), control);
      return wrap;
    };
    const fields = element('div', 'fw-lib-fields');
    fields.append(field(t('Section name'), this.name), field(t('HTML'), this.html), pick, this.file, field(t('Extra CSS (optional)'), this.css));
    scroller.append(fields, this.bring.element);
    this.note.setAttribute('role', 'status');
    this.go.type = 'button';
    this.go.append(icon('plus'), element('span', '', t('Import as section')));
    this.go.addEventListener('click', () => void this.submit());
    const foot = element('div', 'fw-lib-foot');
    foot.append(this.note, this.go);
    this.element.append(scroller, foot);
  }

  private say(message: string, error: boolean): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    if (!this.html.value.trim()) { this.say(t('Paste a page or choose an .html file first.'), true); this.html.focus(); return; }
    this.busy = true;
    this.go.disabled = true;
    this.say('', false);
    try {
      const where = this.hooks.placement();
      const result = await libraryMutate<LibResult>('/api/library/import-html', {
        html: this.html.value, css: this.css.value || undefined, name: this.name.value.trim() || undefined,
        parent: where.parent, index: where.index, page: where.page
      });
      let message = result.warnings?.[0] || t('HTML section imported.');
      let note = t('HTML section imported.');
      if (result.root && this.bring.value() === 'elements') {
        this.say(t('Converting...'), false);
        try { const done = await this.hooks.convert([result.root]); message = note = done.message + ' ' + t('Undo once to get the pages back as code, twice to remove them.'); }
        catch (error) { message = note = t('HTML section imported.') + ' ' + t('The pages stayed code sections: {0}', [error instanceof Error ? error.message : String(error)]); }
      }
      if (result.root) this.hooks.select(result.root);
      this.say(message, false);
      this.hooks.notify(note, false);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.busy = false;
      this.go.disabled = false;
    }
  }
}
