import { libraryMutate, request } from '../../api';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { label, t } from '../../i18n';
import type { LibraryHooks, SitePage, SiteResult, SiteReview, SiteSkip } from './types';
import { bringChoice } from './bring';
import { importSection } from './importer';
import { state, subscribe } from '../../api';

type Mode = 'new' | 'replace';
type Use = 'pages' | 'section';
type Loose = { name: string; html: string };

const size = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;
const HTML_ACCEPT = '.html,.htm,text/html';
const isHtml = (file: File): boolean => /\.html?$/i.test(file.name);
const isZip = (file: File): boolean => /\.zip$/i.test(file.name);

/**
 * Import HTML files or a site from a zip: pick one .zip holding a static site, or one or several loose .html files,
 * read the server's review (pages and their routes, assets, what is skipped and why), choose new pages or replacing
 * matching routes, then import in one undo step. A single loose file can instead go into the open page as a section.
 * Every block is mounted once and shown by `hidden`; the lists are keyed.
 */
export class SiteImport {
  readonly element = element('div', 'fw-lib-view fw-lib-import fw-lib-site');
  private file = element('input');
  private title = element('h3', 'fw-lib-subhead');
  private help = element('div', 'fw-lib-site-help');
  private helpHtml = element('p', 'fw-lib-help');
  private helpZip = element('p', 'fw-lib-help');
  private made: string[] = [];
  private pick = element('button', 'fw-lib-choose');
  private pickLabel = element('span');
  private chosen = element('div', 'fw-lib-site-files');
  private uses = element('div', 'fw-seg fw-lib-site-modes fw-lib-site-uses');
  private asPages = element('button', 'fw-seg-btn');
  private asSection = element('button', 'fw-seg-btn');
  private useNote = element('p', 'fw-lib-row-meta fw-lib-site-use-note');
  private section = element('p', 'fw-lib-help fw-lib-site-section');
  private scroller = element('div', 'fw-lib-scroll');
  private review = element('div', 'fw-lib-site-review');
  private reviewTail = element('div', 'fw-lib-site-skipped');
  private counts = element('p', 'fw-lib-row-text');
  private pages = element('div', 'fw-lib-site-list');
  private modes = element('div', 'fw-seg fw-lib-site-modes');
  private fresh = element('button', 'fw-seg-btn');
  private replace = element('button', 'fw-seg-btn');
  private modeNote = element('p', 'fw-lib-row-meta');
  private skippedHead = element('h3', 'fw-lib-subhead');
  private skipped = element('div', 'fw-lib-site-list');
  private note = element('p', 'fw-lib-note');
  private go = element('button', 'fw-lib-insert primary');
  private goLabel = element('span');
  private bring = bringChoice('Bring pages in as');
  private working = '';
  private current: File | null = null;
  private loose: Loose[] | null = null;
  private picked: File[] = [];
  private kind: 'html' | 'site' = 'site';
  private use: Use = 'pages';
  private plan: SiteReview | null = null;
  private mode: Mode = 'new';
  private busy = false;
  private done = false;

  constructor(private hooks: LibraryHooks, back: () => void, private show: () => void) {
    const scroller = this.scroller;
    const backButton = element('button', 'fw-lib-choose fw-lib-site-back');
    backButton.type = 'button';
    backButton.append(icon('chevronLeft'), element('span', '', t('Import HTML')));
    backButton.addEventListener('click', back);
    text(this.helpHtml, t('Each file becomes a new page at the address shown in the review, or a single file goes into the open page as a section.'));
    text(this.helpZip, t('Brings a static site made elsewhere into this site: every HTML file in the zip becomes a page, with its stylesheets, pictures and WOFF2 fonts. After the review you choose whether the pages arrive as editable elements or as code sections. Links between the pages follow their new addresses, and outside links stay as they are.'));
    this.help.append(this.helpHtml, this.helpZip);
    subscribe(next => { if (this.finished && this.made.length && !this.made.some(id => next.site.nodes[id] || next.site.pages.some(page => page.id === id))) this.reset(); });
    this.file.type = 'file';
    this.file.multiple = true;
    this.file.hidden = true;
    this.file.addEventListener('change', () => {
      const picked = Array.from(this.file.files || []);
      this.file.value = '';
      if (picked.length) void this.read(picked);
    });
    this.pick.type = 'button';
    this.pick.append(icon('folder'), this.pickLabel);
    this.pick.addEventListener('click', () => this.choose(this.kind));
    this.chosen.setAttribute('aria-live', 'polite');
    for (const [button, use, english] of [[this.asPages, 'pages', 'As new pages'], [this.asSection, 'section', 'As a section of this page']] as [HTMLButtonElement, Use, string][]) {
      button.type = 'button';
      label(button, english);
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => { if (!button.disabled) { this.use = use; this.paint(); } });
      this.uses.append(button);
    }
    this.uses.setAttribute('role', 'radiogroup');
    this.uses.setAttribute('aria-label', t('Bring the files in'));
    this.section.hidden = true;
    text(this.section, t('The page goes into the open page as one section, after the selected section. Its styles and main script come along.'));
    for (const [button, mode, english] of [[this.fresh, 'new', 'Add as new pages'], [this.replace, 'replace', 'Replace matching routes']] as [HTMLButtonElement, Mode, string][]) {
      button.type = 'button';
      label(button, english);
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => { if (!button.disabled) { this.mode = mode; this.paint(); } });
      this.modes.append(button);
    }
    this.modes.setAttribute('role', 'radiogroup');
    this.modes.setAttribute('aria-label', t('How to add the pages'));
    label(this.skippedHead, 'Skipped');
    this.review.hidden = true;
    this.reviewTail.hidden = true;
    this.bring.element.hidden = true;
    this.review.append(
      element('h3', 'fw-lib-subhead', t('Review')), this.counts,
      element('h3', 'fw-lib-subhead', t('Pages')), this.pages,
      element('h3', 'fw-lib-subhead', t('Add them')), this.modes, this.modeNote
    );
    this.reviewTail.append(this.skippedHead, this.skipped);
    scroller.append(backButton, this.title, this.help, this.pick, this.file, this.chosen, this.uses, this.useNote, this.review, this.section, this.bring.element, this.reviewTail, this.note);
    this.note.setAttribute('role', 'status');
    this.go.type = 'button';
    this.go.disabled = true;
    this.go.append(icon('upload'), this.goLabel);
    this.go.addEventListener('click', () => void this.submit());
    const foot = element('div', 'fw-lib-foot');
    foot.append(this.go);
    this.element.append(scroller, foot);
    this.paint();
  }

  /** Opens the file picker inside the caller's click: .html files only, or a .zip (loose .html files allowed too). */
  choose(kind: 'html' | 'site'): void {
    if (this.busy) return;
    this.reset();
    this.kind = kind;
    this.file.accept = kind === 'html' ? HTML_ACCEPT : `.zip,application/zip,${HTML_ACCEPT}`;
    this.file.click();
  }

  /** True once an import has finished: the view then holds nothing the person still needs. */
  get finished(): boolean { return this.done && !this.busy; }

  /** Back to the clean waiting state: no files, review, note or finished button, scrolled to the top. */
  reset(): void {
    if (this.busy) return;
    this.made = [];
    this.picked = [];
    this.current = null;
    this.loose = null;
    this.plan = null;
    this.mode = 'new';
    this.use = 'pages';
    this.done = false;
    this.say('', false);
    this.paint();
    this.scroller.scrollTop = 0;
  }

  private say(message: string, error: boolean): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
  }

  /** Work in progress reads on the import button, so the note changes only once, to the result. */
  private progress(message: string): void {
    this.working = message;
    text(this.goLabel, message);
  }

  private setBusy(on: boolean): void {
    this.busy = on;
    if (!on) this.working = '';
    this.pick.disabled = on;
    this.bring.disable(on);
    this.element.setAttribute('aria-busy', String(on));
    this.paint();
  }

  private async read(files: File[]): Promise<void> {
    if (this.busy) return;
    const zips = files.filter(isZip);
    const pages = files.filter(isHtml);
    this.picked = files;
    this.current = null;
    this.loose = null;
    this.plan = null;
    this.mode = 'new';
    this.use = 'pages';
    this.done = false;
    this.say('', false);
    this.show();
    if (zips.length + pages.length !== files.length || (zips.length && files.length > 1)) {
      this.paint();
      this.say(t('Choose one .zip file, or one or more .html files.'), true);
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) {
      this.paint();
      this.say(zips.length ? t('The archive is larger than 64 MiB, the most a site import takes.') : t('The files are larger than 64 MiB together, the most an import takes.'), true);
      return;
    }
    this.working = zips.length ? t('Reading the archive...') : t('Reading the files...');
    this.setBusy(true);
    try {
      if (zips.length) this.current = zips[0];
      else this.loose = await Promise.all(pages.map(async file => ({ name: file.name, html: await file.text() })));
      this.plan = await request<SiteReview>('/api/library/import-site/review', this.body());
      const empty = !this.plan.pages.length;
      this.say(empty ? (zips.length ? t('The archive has no HTML page that can be imported.') : t('None of the files is an HTML page that can be imported.')) : '', empty);
    } catch (error) {
      this.current = null;
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
    }
  }

  private body(): File | { files: Loose[] } {
    return this.current || { files: this.loose || [] };
  }

  private paint(): void {
    const plan = this.plan;
    const html = !!this.picked.length && this.picked.every(isHtml);
    const one = html && this.picked.length === 1;
    if (!one && this.use === 'section') this.use = 'pages';
    const section = this.use === 'section';
    text(this.title, html ? t('Import HTML files') : t('Import site from zip'));
    for (const [node, on] of [[this.helpHtml, html], [this.helpZip, !html]] as [HTMLElement, boolean][]) {
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-hidden', String(!on));
    }
    text(this.pickLabel, this.picked.length ? t('Choose other files...') : t('Choose a .zip file'));
    keyed(this.chosen, this.picked, file => file.name, () => {
      const node = element('div', 'fw-lib-site-chosen');
      node.append(element('span', 'fw-lib-site-chosen-name'), element('span', 'fw-lib-row-meta'));
      return node;
    }, (node, file) => {
      const [name, meta] = Array.from(node.children) as HTMLElement[];
      text(name, file.name);
      text(meta, size(file.size));
    });
    if (this.uses.hidden === html) this.uses.hidden = !html;
    this.asPages.disabled = this.done;
    this.asSection.disabled = this.done || !one;
    for (const [button, use] of [[this.asPages, 'pages'], [this.asSection, 'section']] as [HTMLButtonElement, Use][]) {
      button.classList.toggle('is-on', this.use === use);
      button.setAttribute('aria-checked', String(this.use === use));
    }
    text(this.useNote, html && !one ? t('A section takes one file. Choose a single file to add it to this page as a section.') : '');
    if (this.section.hidden === section) this.section.hidden = !section;
    const showReview = !!plan && !section;
    if (this.review.hidden === showReview) this.review.hidden = !showReview;
    if (this.reviewTail.hidden === showReview) this.reviewTail.hidden = !showReview;
    const showBring = showReview || section;
    this.bring.heading(section ? 'Bring it in as' : 'Bring pages in as');
    if (this.bring.element.hidden === showBring) this.bring.element.hidden = !showBring;
    const count = plan?.pages.length ?? 0;
    if (section) {
      text(this.goLabel, this.working || (this.done ? t('Imported') : t('Import as section')));
      this.go.disabled = this.busy || this.done || !this.loose?.length;
      return;
    }
    text(this.goLabel, this.working || (this.done ? t('Imported') : count === 1 ? t('Import 1 page') : count ? t('Import {0} pages', [count]) : html ? t('Import pages') : t('Import site')));
    this.go.disabled = this.busy || this.done || !plan || !count;
    if (!plan) { keyed(this.pages, [], () => '', () => element('div'), () => undefined); keyed(this.skipped, [], () => '', () => element('div'), () => undefined); return; }
    if (this.mode === 'replace' && !plan.canReplace) this.mode = 'new';
    const parts = [
      count === 1 ? t('1 page.') : t('{0} pages.', [count]),
      plan.assets.count === 1 ? t('1 asset ({0}).', [size(plan.assets.bytes)]) : t('{0} assets ({1}).', [plan.assets.count, size(plan.assets.bytes)]),
      plan.supportFiles === 1 ? t('1 stylesheet or script.') : plan.supportFiles ? t('{0} stylesheets and scripts.', [plan.supportFiles]) : '',
      plan.skipped.length === 1 ? t('1 file is skipped.') : plan.skipped.length ? t('{0} files are skipped.', [plan.skipped.length]) : '',
      plan.ignored === 1 ? t('1 file in a system or dependency folder is ignored.') : plan.ignored ? t('{0} files in system and dependency folders are ignored.', [plan.ignored]) : ''
    ];
    text(this.counts, parts.filter(Boolean).join(' '));
    this.fresh.disabled = this.done;
    this.replace.disabled = this.done || !plan.canReplace;
    for (const [button, mode] of [[this.fresh, 'new'], [this.replace, 'replace']] as [HTMLButtonElement, Mode][]) {
      button.classList.toggle('is-on', this.mode === mode);
      button.setAttribute('aria-checked', String(this.mode === mode));
    }
    text(this.modeNote, this.mode === 'replace' ? t('Matching pages keep their address and lose their current content. Undo brings it back.') : plan.canReplace ? t('Pages whose address is taken get a new one. Replace matching routes swaps their content instead.') : plan.replaceNote ? t(plan.replaceNote) : '');
    keyed(this.pages, plan.pages, page => page.file, () => this.row(), (node, page) => this.fillPage(node, page));
    keyed(this.skipped, plan.skipped, item => item.file, () => this.row(), (node, item) => this.fillSkip(node, item));
    if (this.skippedHead.hidden === !!plan.skipped.length) this.skippedHead.hidden = !plan.skipped.length;
  }

  private row(): HTMLElement {
    const node = element('div', 'fw-lib-site-item');
    node.append(element('span', 'fw-lib-row-name'), element('span', 'fw-lib-site-route'), element('span', 'fw-lib-row-meta'));
    return node;
  }

  private fillPage(node: HTMLElement, page: SitePage): void {
    const [name, route, meta] = Array.from(node.children) as HTMLElement[];
    text(name, page.name);
    const replacing = this.mode === 'replace' && page.replaces;
    text(route, `${page.file} → ${replacing ? page.route : page.newRoute}`);
    const notes = [replacing ? t('Replaces the content of {0}.', [page.replaces!.name]) : page.newRoute !== page.route ? t('{0} is taken, so it gets {1}.', [page.route, page.newRoute]) : '', ...page.warnings.map(item => t(item))].filter(Boolean);
    text(meta, notes.join(' '));
    meta.hidden = !notes.length;
  }

  private fillSkip(node: HTMLElement, item: SiteSkip): void {
    const [name, route, meta] = Array.from(node.children) as HTMLElement[];
    text(name, item.file);
    if (!route.hidden) route.hidden = true;
    text(meta, t(item.reason));
    if (meta.hidden) meta.hidden = false;
  }

  private async placeSection(): Promise<void> {
    const page = this.loose?.[0];
    if (this.busy || !page) return;
    this.working = t('Importing...');
    this.setBusy(true);
    try {
      const message = await importSection(this.hooks, { html: page.html, name: page.name.replace(/\.html?$/i, '') }, this.bring.value(), note => this.progress(note), ids => { this.made = ids; });
      this.done = true;
      this.say(message, false);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
      this.note.scrollIntoView({ block: 'nearest' });
    }
  }

  private async submit(): Promise<void> {
    if (this.use === 'section') return this.placeSection();
    const plan = this.plan;
    if (this.busy || !plan || (!this.current && !this.loose)) return;
    this.working = t('Importing...');
    this.setBusy(true);
    try {
      const query = `?mode=${this.mode}&revision=${encodeURIComponent(String(plan.revision))}`;
      const result = await libraryMutate<SiteResult>('/api/library/import-site' + query, this.body());
      let message = result.message || t('Site imported.');
      this.done = true;
      this.made = result.pages || [];
      this.current = null;
      this.loose = null;
      if (this.bring.value() === 'elements' && result.pages?.length) {
        this.progress(t('Converting...'));
        const site = state().site;
        const hosts = result.pages.flatMap(id => site.nodes[site.pages.find(page => page.id === id)?.root || '']?.children || []);
        try { message += ' ' + (await this.hooks.convert(hosts)).message + ' ' + t('Undo once to get the pages back as code, twice to remove them.'); }
        catch (error) { message += ' ' + t('The pages stayed code sections: {0}', [error instanceof Error ? error.message : String(error)]); }
      }
      this.say(message, false);
      this.hooks.notify(message, false);
      if (result.pages?.[0]) this.hooks.openPage(result.pages[0]);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
      this.note.scrollIntoView({ block: 'nearest' });
    }
  }
}
