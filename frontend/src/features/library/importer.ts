import { libraryMutate } from '../../api';
import { element, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { labelAttr, t } from '../../i18n';
import type { LibResult, LibraryHooks } from './types';
import { bringChoice, type Bring } from './bring';

/** One page into the open page as a code section, converted to elements when asked; answers with the sentence to show. */
export async function importSection(hooks: LibraryHooks, body: { html: string; css?: string; name?: string }, bring: Bring, progress: (message: string) => void, made?: (ids: string[]) => void): Promise<string> {
  const where = hooks.placement();
  const result = await libraryMutate<LibResult>('/api/library/import-html', { ...body, parent: where.parent, index: where.index, page: where.page });
  let message = result.warnings?.[0] || t('HTML section imported.');
  let note = t('HTML section imported.');
  let root = result.root;
  if (result.root && bring === 'elements') {
    progress(t('Converting...'));
    try { const done = await hooks.convert([result.root]); root = done.root || root; message = note = done.message + ' ' + t('Undo once to get the section back as code, twice to remove it.'); }
    catch (error) { message = note = t('HTML section imported.') + ' ' + t('The pages stayed code sections: {0}', [error instanceof Error ? error.message : String(error)]); }
  }
  if (root) hooks.select(root);
  made?.([result.root, root].filter((id): id is string => !!id));
  hooks.notify(note, false);
  return message;
}

/**
 * The Library's import view: three separate ways in, in this order. HTML files (one or several, picked and reviewed in
 * the site import view), a whole site in a .zip (the same review), and pasted HTML code, which the server turns into one
 * code section placed like any other insert. The kit's reduced, onTheme and token helpers are provided there.
 */
export class HtmlImport {
  readonly element = element('div', 'fw-lib-view fw-lib-import');
  private name = element('input');
  private html = element('textarea', 'fw-lib-area fw-lib-code');
  private css = element('textarea', 'fw-lib-area fw-lib-code');
  private note = element('p', 'fw-lib-note');
  private go = element('button', 'fw-lib-insert primary');
  private bring = bringChoice('Bring it in as');
  private busy = false;

  constructor(private hooks: LibraryHooks, openFiles: () => void, openSite: () => void) {
    const scroller = element('div', 'fw-lib-scroll');
    const part = (english: string, help: string, ...body: HTMLElement[]): HTMLElement => {
      const box = element('section', 'fw-lib-import-part');
      box.append(element('h3', 'fw-lib-subhead', t(english)), element('p', 'fw-lib-help', t(help)), ...body);
      return box;
    };
    const chooser = (english: string, run: () => void): HTMLButtonElement => {
      const button = element('button', 'fw-lib-choose', t(english));
      button.type = 'button';
      button.prepend(icon('folder'));
      button.addEventListener('click', run);
      return button;
    };
    const files = part('HTML files', 'Choose one or several .html files. Each becomes a new page, or a single file can go into this page as a section.', chooser('Choose .html files...', openFiles));
    files.querySelector('.fw-lib-choose')?.classList.add('fw-lib-files-open');
    const site = part('A whole site in a .zip', 'A .zip of a static site made elsewhere: every HTML file becomes a page, with its stylesheets, pictures and fonts. You review the pages before anything changes.', chooser('Choose a .zip file...', openSite));
    site.querySelector('.fw-lib-choose')?.classList.add('fw-lib-site-open');
    const paste = part('Paste HTML code', 'Paste the HTML of one page to add it to this page as a section. Its styles and main script come along, and the script runs in Preview and on the published site.');
    labelAttr(paste.querySelector('.fw-lib-help')!, 'title', 'Turns one whole HTML page into a code section. Its styles and first module script come along, and the formai kit helpers reduced, onTheme and token are provided. A code section runs its own JavaScript in Preview and in exports.');
    scroller.append(files, site, paste);
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
    const field = (label: string, control: HTMLElement): HTMLElement => {
      const wrap = element('div', 'field');
      wrap.append(element('span', 'field-label', label), control);
      return wrap;
    };
    const fields = element('div', 'fw-lib-fields');
    fields.append(field(t('Section name'), this.name), field(t('HTML'), this.html), field(t('Extra CSS (optional)'), this.css));
    this.note.setAttribute('role', 'status');
    this.go.type = 'button';
    this.go.append(icon('plus'), element('span', '', t('Import as section')));
    this.go.addEventListener('click', () => void this.submit());
    paste.append(fields, this.bring.element, this.go, this.note);
    this.element.append(scroller);
  }

  private say(message: string, error: boolean): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    if (!this.html.value.trim()) { this.say(t('Paste the HTML of a page first.'), true); this.html.focus(); return; }
    this.busy = true;
    this.go.disabled = true;
    this.say('', false);
    try {
      const body = { html: this.html.value, css: this.css.value || undefined, name: this.name.value.trim() || undefined };
      this.say(await importSection(this.hooks, body, this.bring.value(), message => this.say(message, false)), false);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.busy = false;
      this.go.disabled = false;
    }
  }
}
