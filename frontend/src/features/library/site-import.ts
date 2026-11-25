import { libraryMutate, request } from '../../api';
import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { label, t } from '../../i18n';
import type { LibraryHooks, SitePage, SiteResult, SiteReview, SiteSkip } from './types';
import { bringChoice } from './bring';
import { state } from '../../api';

type Mode = 'new' | 'replace';

const size = (bytes: number): string => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

/**
 * Import site from zip: pick a .zip holding a static site, read the server's review of it (pages and their routes,
 * assets, what is skipped and why), choose new pages or replacing matching routes, then import in one undo step.
 * Every block is mounted once and shown by `hidden`; the lists are keyed.
 */
export class SiteImport {
  readonly element = element('div', 'fw-lib-view fw-lib-import fw-lib-site');
  private file = element('input');
  private pick = element('button', 'fw-lib-choose');
  private chosen = element('p', 'fw-lib-site-file');
  private review = element('div', 'fw-lib-site-review');
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
  private current: File | null = null;
  private plan: SiteReview | null = null;
  private mode: Mode = 'new';
  private busy = false;
  private done = false;

  constructor(private hooks: LibraryHooks, back: () => void) {
    const scroller = element('div', 'fw-lib-scroll');
    const backButton = element('button', 'fw-lib-choose fw-lib-site-back');
    backButton.type = 'button';
    backButton.append(icon('chevronLeft'), element('span', '', t('Import HTML')));
    backButton.addEventListener('click', back);
    this.file.type = 'file';
    this.file.accept = '.zip,application/zip';
    this.file.hidden = true;
    this.file.addEventListener('change', () => {
      const picked = this.file.files?.[0];
      this.file.value = '';
      if (picked) void this.read(picked);
    });
    this.pick.type = 'button';
    this.pick.append(icon('folder'), element('span', '', t('Choose a .zip file')));
    this.pick.addEventListener('click', () => this.choose());
    this.chosen.setAttribute('aria-live', 'polite');
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
    this.review.append(
      element('h3', 'fw-lib-subhead', t('Review')), this.counts,
      element('h3', 'fw-lib-subhead', t('Pages')), this.pages,
      element('h3', 'fw-lib-subhead', t('Add them')), this.modes, this.modeNote,
      this.bring.element,
      this.skippedHead, this.skipped
    );
    scroller.append(
      backButton,
      element('h3', 'fw-lib-subhead', t('Import site from zip')),
      element('p', 'fw-lib-help', t('Brings a static site made elsewhere into this site: every HTML file in the zip becomes a page, with its stylesheets, pictures and WOFF2 fonts. After the review you choose whether the pages arrive as editable elements or as code sections. Links between the pages follow their new addresses, and outside links stay as they are.')),
      this.pick, this.file, this.chosen, this.review
    );
    this.note.setAttribute('role', 'status');
    this.go.type = 'button';
    this.go.disabled = true;
    this.go.append(icon('upload'), this.goLabel);
    this.go.addEventListener('click', () => void this.submit());
    const foot = element('div', 'fw-lib-foot');
    foot.append(this.note, this.go);
    this.element.append(scroller, foot);
    this.paint();
  }

  /** Opens the file picker; File > Import site from zip... lands here. */
  choose(): void {
    if (!this.busy) this.file.click();
  }

  private say(message: string, error: boolean): void {
    text(this.note, message);
    this.note.classList.toggle('is-error', error);
  }

  private setBusy(on: boolean): void {
    this.busy = on;
    this.pick.disabled = on;
    this.bring.disable(on);
    this.element.setAttribute('aria-busy', String(on));
    this.paint();
  }

  private async read(picked: File): Promise<void> {
    if (this.busy) return;
    this.current = picked;
    this.plan = null;
    this.mode = 'new';
    this.done = false;
    text(this.chosen, `${picked.name} (${size(picked.size)})`);
    if (picked.size > 64 * 1024 * 1024) {
      this.current = null;
      this.paint();
      this.say(t('The archive is larger than 64 MiB, the most a site import takes.'), true);
      return;
    }
    this.say(t('Reading the archive...'), false);
    this.setBusy(true);
    try {
      this.plan = await request<SiteReview>('/api/library/import-site/review', picked);
      this.say(this.plan.pages.length ? '' : t('The archive has no HTML page that can be imported.'), !this.plan.pages.length);
    } catch (error) {
      this.current = null;
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
    }
  }

  private paint(): void {
    const plan = this.plan;
    if (this.review.hidden === !!plan) this.review.hidden = !plan;
    const count = plan?.pages.length ?? 0;
    text(this.goLabel, this.done ? t('Imported') : count === 1 ? t('Import 1 page') : count ? t('Import {0} pages', [count]) : t('Import site'));
    this.go.disabled = this.busy || this.done || !plan || !count;
    if (!plan) { keyed(this.pages, [], () => '', () => element('div'), () => undefined); keyed(this.skipped, [], () => '', () => element('div'), () => undefined); return; }
    if (this.mode === 'replace' && !plan.canReplace) this.mode = 'new';
    const parts = [
      count === 1 ? t('1 page.') : t('{0} pages.', [count]),
      plan.assets.count === 1 ? t('1 asset ({0}).', [size(plan.assets.bytes)]) : t('{0} assets ({1}).', [plan.assets.count, size(plan.assets.bytes)]),
      plan.supportFiles === 1 ? t('1 stylesheet or script.') : plan.supportFiles ? t('{0} stylesheets and scripts.', [plan.supportFiles]) : '',
      plan.skipped.length === 1 ? t('1 file is skipped.') : plan.skipped.length ? t('{0} files are skipped.', [plan.skipped.length]) : '',
      plan.ignored ? t('{0} system files are ignored.', [plan.ignored]) : ''
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

  private async submit(): Promise<void> {
    const plan = this.plan;
    if (this.busy || !plan || !this.current) return;
    this.say(t('Importing...'), false);
    this.setBusy(true);
    try {
      const query = `?mode=${this.mode}&revision=${encodeURIComponent(String(plan.revision))}`;
      const result = await libraryMutate<SiteResult>('/api/library/import-site' + query, this.current);
      let message = result.message || t('Site imported.');
      this.done = true;
      this.current = null;
      if (this.bring.value() === 'elements' && result.pages?.length) {
        this.say(t('Converting...'), false);
        const site = state().site;
        const hosts = result.pages.flatMap(id => site.nodes[site.pages.find(page => page.id === id)?.root || '']?.children || []);
        try { message += ' ' + (await this.hooks.convert(hosts)).message; }
        catch (error) { message += ' ' + t('The pages stayed code sections: {0}', [error instanceof Error ? error.message : String(error)]); }
      }
      this.say(message, false);
      this.hooks.notify(message, false);
      if (result.pages?.[0]) this.hooks.openPage(result.pages[0]);
    } catch (error) {
      this.say(error instanceof Error ? error.message : String(error), true);
    } finally {
      this.setBusy(false);
    }
  }
}
