import { label, onLanguage, tn, type Value } from '../i18n';
import { DEMOS, onDemoOpening } from './demos';
import { element, text } from './dom';
import { HomeFiles, sourced, type HomeFilesDeps } from './home-files';
import { icon, type Icon } from './icons';

export interface HomeTemplate {
  id: string;
  name: string;
  pages: number;
}

export interface HomeDeps {
  files: HomeFilesDeps;
  templates: HomeTemplate[];
  run: (command: string) => void;
  create: (templateId: string) => void;
  demo: (id: string) => void;
  preview: (id: string, opener: HTMLElement) => void;
}

type Page = 'start' | 'recent' | 'projects';

const FORMATS = ['FWEB', 'FPUB', 'JSON', 'HTML', 'CSS', 'SVG', 'PNG', 'JPEG', 'WEBP', 'GIF', 'CSV'];

const PREF_KEY = 'formweb.homePrefs';
const NAV_W_KEY = 'formweb.homeNav';
const NAV_HIDDEN_KEY = 'formweb.homeNavHidden';
const START_CARDS = 5;
export const GUIDE_URL = 'https://github.com/nodemode-dev/formweb/tree/main/docs/guide';

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

export function homePref(): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as { autoShowHome?: unknown };
    return typeof v.autoShowHome === 'boolean' ? v.autoShowHome : true;
  } catch { return true; }
}

export function setHomePref(on: boolean): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ autoShowHome: on })); } catch { }
}

function part<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
}

export class HomeScreen {
  readonly root = element('section', 'fw-home');
  private readonly pages = new Map<Page, HomeFiles>();
  private page: Page = 'start';
  private forced = false;
  private launch = homePref();
  private siteId: string | null = null;
  private readonly backs: HTMLElement[];
  private readonly openBox: HTMLElement;
  private readonly openName: HTMLElement;
  private readonly confirmRow: HTMLElement;
  private readonly confirmText: HTMLElement;
  private readonly confirmNo: HTMLButtonElement;
  private readonly confirmYes: HTMLButtonElement;
  private asked: ((answer: boolean) => void) | null = null;

  constructor(host: HTMLElement, private readonly d: HomeDeps) {
    this.root.setAttribute('aria-label', 'Home');
    this.root.hidden = true;
    const glyph = (name: Icon): string => icon(name).outerHTML;
    const navItem = (v: Page, ic: Icon, label: string): string => `<button class="fw-home-nav-item" type="button" data-v="${v}">${glyph(ic)}<span data-t>${label}</span>${v === 'start' ? '' : '<span class="fw-home-count" data-no-i18n>0</span>'}</button>`;
    const cmdItem = (cmd: string, ic: Icon, label: string): string => `<button class="fw-home-nav-item" type="button" data-run="${cmd}" title="${label}" data-ta>${glyph(ic)}<span data-t>${label}</span></button>`;
    const backItem = `<button class="fw-home-nav-item fw-home-back" type="button" data-back hidden>${glyph('chevronLeft')}<span data-t>Back to Editor</span></button>`;
    const formats = FORMATS.map(f => `<span class="fw-home-format">${f}</span>`).join('');
    const tiles = [{ id: '', name: 'Blank site', pages: 1 }, ...d.templates].map(t => `<button class="fw-card" type="button" data-template="${t.id}"><span class="fw-card-preview is-blank">${glyph(t.id ? 'page' : 'plus')}</span><span class="fw-card-body"><span class="fw-card-name" data-t>${t.name}</span><span class="fw-card-meta" data-pages="${t.pages}">&nbsp;</span></span></button>`).join('');
    const demos = DEMOS.length ? `<section class="fw-home-section" data-section="demos"><div class="fw-home-section-head"><h2 class="fw-home-section-title" data-t>Demos</h2><span class="fw-card-meta" data-t>Each opens as a new, unsaved site. Saved projects are not changed.</span></div><div class="fw-card-grid fw-demo-grid">${DEMOS.map(x => `<div class="fw-demo"><button class="fw-card" type="button" data-demo="${escapeHtml(x.id)}" aria-busy="false"><span class="fw-card-preview" aria-hidden="true"><img alt="" width="320" height="180" decoding="async" draggable="false" src="${escapeHtml(x.picture)}"></span><span class="fw-card-body"><span class="fw-card-name" id="fw-demo-name-${escapeHtml(x.id)}" translate="no" data-no-i18n>${escapeHtml(x.title)}</span><span class="fw-card-meta" title="${escapeHtml(x.line)}" data-t data-ta>${escapeHtml(x.line)}</span></span></button><button class="fw-home-btn fw-demo-preview" type="button" data-demo-preview="${escapeHtml(x.id)}" aria-labelledby="fw-demo-see-${escapeHtml(x.id)} fw-demo-name-${escapeHtml(x.id)}">${glyph('eye')}<span id="fw-demo-see-${escapeHtml(x.id)}" data-t>Preview</span></button></div>`).join('')}</div></section>` : '';
    this.root.innerHTML = `<nav class="fw-home-nav" aria-label="Home">
      <div class="fw-home-brand" data-no-i18n><img class="fw-mark" src="/formweb-logo.png" width="26" height="26" alt="" draggable="false">formweb <span translate="no">by nodemode.ai</span></div>
      ${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}
      <div class="fw-home-open" hidden><div class="fw-home-nav-sep"></div><div class="fw-home-nav-title" data-t>Open site</div><div class="fw-home-open-list"><button class="fw-home-nav-item" type="button" data-back>${glyph('globe')}<span class="fw-home-open-name" data-no-i18n></span></button></div></div>
      <div class="fw-home-nav-sep"></div>
      <div class="fw-home-nav-title" data-t>Create</div>
      ${cmdItem('file.new', 'plus', 'New site')}${cmdItem('file.projects', 'folder', 'Open project')}${cmdItem('file.import', 'upload', 'Import .fweb or .fpub file')}${cmdItem('page.generate', 'wand', 'Generate pages')}
      <div class="fw-home-nav-foot">${backItem}${cmdItem('edit.settings', 'gear', 'Preferences')}${cmdItem('help.guide', 'info', 'Help')}</div>
    </nav>
    <div class="fw-home-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the side panel" data-ta></div>
    <button class="fw-home-nav-hide" type="button" title="Hide the side panel" aria-label="Hide the side panel" data-ta>${glyph('chevronLeft')}</button>
    <button class="fw-home-nav-show" type="button" title="Show the side panel" aria-label="Show the side panel" data-ta>${glyph('chevron')}</button>
    <div class="fw-home-main">
      <div class="fw-home-narrow">${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}${backItem}${cmdItem('edit.settings', 'gear', 'Preferences')}${cmdItem('help.guide', 'info', 'Help')}</div>
      <div class="fw-home-confirm" role="alertdialog" aria-live="assertive" hidden><span class="fw-home-confirm-text"></span><button class="fw-home-btn" type="button" data-a="confirm-no"></button><button class="fw-home-btn is-danger" type="button" data-a="confirm-yes"></button></div>
      <div class="fw-home-page" data-page="start">
        <div class="fw-home-head"><div><h1 class="fw-home-title"></h1><p class="fw-home-sub" data-t>Open a website, or start a new one.</p></div><div class="fw-home-head-actions"><button class="fw-home-btn" type="button" data-run="file.projects">${glyph('folder')}<span data-t>Open project...</span></button><button class="fw-home-btn" type="button" data-template="">${glyph('plus')}<span data-t>Blank site</span></button></div></div>
        <div class="fw-home-hero">
          <span class="fw-home-hero-icon">${glyph('globe')}</span>
          <div class="fw-home-hero-text"><div class="fw-home-hero-title" data-t>Start a website</div>
            <div class="fw-home-hero-sub" data-t>Design responsive pages on a visual canvas, then export clean static HTML or publish a version locally. Projects are kept as editable .fweb source.</div>
            <div class="fw-home-formats" data-no-i18n>${formats}</div></div>
          <div class="fw-home-hero-actions">
            <button class="fw-home-action is-primary" type="button" data-run="file.new">${glyph('plus')}<span class="fw-home-label" data-t>New site...</span></button>
            <button class="fw-home-action" type="button" data-run="file.projects">${glyph('folder')}<span class="fw-home-label" data-t>Open...</span></button>
            <button class="fw-home-action is-ghost" type="button" data-run="page.generate">${glyph('wand')}<span class="fw-home-label" data-t>Generate from a description</span></button>
            <a class="fw-home-action is-ghost" href="${GUIDE_URL}" target="_blank" rel="noopener">${glyph('info')}<span class="fw-home-label" data-t>New to FormWeb? Read the guide</span></a>
          </div>
        </div>
        <section class="fw-home-section"><div class="fw-home-section-head"><h2 class="fw-home-section-title" data-t>Recent</h2><button class="fw-home-btn is-ghost" type="button" data-v="recent" data-t>See all</button></div><div class="fw-home-slot" data-slot="start"></div></section>
        ${demos}
        <section class="fw-home-section"><div class="fw-home-section-head"><h2 class="fw-home-section-title" data-t>New site</h2><button class="fw-home-btn is-ghost" type="button" data-run="file.new" data-t>More options...</button></div><div class="fw-card-grid fw-tpl-grid">${tiles}</div></section>
      </div>
      <div class="fw-home-page" data-page="recent" hidden><div class="fw-home-head"><div><h1 class="fw-home-title" data-t>Recent</h1><p class="fw-home-sub" data-t>Sites you opened or saved, newest first.</p></div></div><div class="fw-home-slot" data-slot="recent"></div></div>
      <div class="fw-home-page" data-page="projects" hidden><div class="fw-home-head"><div><h1 class="fw-home-title" data-t>Projects</h1><p class="fw-home-sub" data-t>Every saved project snapshot.</p></div></div><div class="fw-home-slot" data-slot="projects"></div></div>
    </div>`;
    sourced(this.root);
    this.backs = Array.from(this.root.querySelectorAll<HTMLElement>('.fw-home-back'));
    this.openBox = part(this.root, '.fw-home-open');
    this.openName = part(this.root, '.fw-home-open-name');
    this.confirmRow = part(this.root, '.fw-home-confirm');
    this.confirmText = part(this.root, '.fw-home-confirm-text');
    this.confirmNo = part<HTMLButtonElement>(this.root, '[data-a="confirm-no"]');
    this.confirmYes = part<HTMLButtonElement>(this.root, '[data-a="confirm-yes"]');
    onDemoOpening(id => { for (const card of Array.from(this.root.querySelectorAll<HTMLElement>('[data-demo]'))) { const busy = String(card.dataset.demo === id); if (card.getAttribute('aria-busy') !== busy) card.setAttribute('aria-busy', busy); } });
    const count = (v: Page) => (n: number): void => { for (const c of Array.from(this.root.querySelectorAll<HTMLElement>(`[data-v="${v}"] .fw-home-count`))) text(c, String(n)); };
    const mount = (slot: Page, tab: 'recent' | 'projects', options: { limit?: number; compact?: boolean }): void => {
      const files = new HomeFiles(d.files, { tab, ...options, onCount: count(slot === 'start' ? 'recent' : slot) });
      part(this.root, `[data-slot="${slot}"]`).appendChild(files.root);
      this.pages.set(slot, files);
    };
    mount('start', 'recent', { limit: START_CARDS, compact: true });
    mount('recent', 'recent', {});
    mount('projects', 'projects', {});
    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-back]')) { this.dismiss(); return; }
      const v = target.closest<HTMLElement>('[data-v]')?.dataset.v as Page | undefined;
      if (v) { this.show(v); return; }
      const answer = target.closest<HTMLElement>('[data-a]')?.dataset.a;
      if (answer === 'confirm-no' || answer === 'confirm-yes') { this.askClose(answer === 'confirm-yes'); return; }
      const see = target.closest<HTMLElement>('[data-demo-preview]');
      if (see) { this.d.preview(see.dataset.demoPreview ?? '', see); return; }
      const demo = target.closest<HTMLElement>('[data-demo]')?.dataset.demo;
      if (demo) { this.d.demo(demo); return; }
      const template = target.closest<HTMLElement>('[data-template]');
      if (template) { this.d.create(template.dataset.template ?? ''); return; }
      const run = target.closest<HTMLElement>('[data-run]')?.dataset.run;
      if (run) this.d.run(run);
    });
    host.appendChild(this.root);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || this.root.hidden || document.querySelector('.dialog-scrim:not([hidden])')) return;
      if (this.asked) { event.preventDefault(); this.askClose(false); return; }
      if (this.siteId !== null) this.dismiss();
    });
    this.sidePanel();
    onLanguage(() => this.paint());
    this.paint();
    this.apply();
  }

  private sidePanel(): void {
    const root = this.root;
    const bar = part(root, '.fw-home-resizer');
    const save = (): void => {
      try {
        localStorage.setItem(NAV_W_KEY, root.style.getPropertyValue('--fw-home-nav-w') || '232px');
        localStorage.setItem(NAV_HIDDEN_KEY, root.classList.contains('is-nav-hidden') ? '1' : '0');
      } catch { return; }
    };
    try {
      const width = (localStorage.getItem(NAV_W_KEY) ?? '').trim();
      if (/^\d{3}px$/.test(width)) root.style.setProperty('--fw-home-nav-w', width);
      if (localStorage.getItem(NAV_HIDDEN_KEY) === '1') root.classList.add('is-nav-hidden');
    } catch { }
    part(root, '.fw-home-nav-hide').addEventListener('click', () => { root.classList.add('is-nav-hidden'); save(); });
    part(root, '.fw-home-nav-show').addEventListener('click', () => { root.classList.remove('is-nav-hidden'); save(); });
    bar.addEventListener('pointerdown', event => {
      event.preventDefault();
      const x0 = event.clientX;
      const start = part(root, '.fw-home-nav').getBoundingClientRect().width || 232;
      bar.classList.add('is-dragging');
      const move = (ev: PointerEvent): void => {
        const raw = start + ev.clientX - x0;
        const collapse = raw < 120;
        if (root.classList.contains('is-nav-hidden') !== collapse) root.classList.toggle('is-nav-hidden', collapse);
        if (!collapse) root.style.setProperty('--fw-home-nav-w', `${Math.round(Math.max(180, Math.min(420, raw)))}px`);
      };
      const up = (): void => {
        bar.classList.remove('is-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        save();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  ask(english: string, values: readonly Value[], yes: string | null): Promise<boolean> {
    this.askClose(false);
    label(this.confirmText, english, values);
    label(this.confirmNo, yes === null ? 'Close' : 'Cancel');
    if (yes !== null) label(this.confirmYes, yes);
    if (this.confirmYes.hidden !== (yes === null)) this.confirmYes.hidden = yes === null;
    this.confirmRow.hidden = false;
    this.confirmNo.focus({ preventScroll: true });
    return new Promise(resolve => { this.asked = resolve; });
  }

  private askClose(answer: boolean): void {
    const done = this.asked;
    this.asked = null;
    if (!this.confirmRow.hidden) this.confirmRow.hidden = true;
    done?.(answer);
  }

  async askReplace(name: string): Promise<boolean> {
    const was = this.isShown;
    if (!was) this.show();
    const answer = await this.ask('"{0}" has changes that are not saved as a project. Opening another site replaces it.', [name], 'Replace');
    if (!answer && !was) this.dismiss();
    return answer;
  }

  notice(english: string): void {
    if (this.isShown) void this.ask(english, [], null);
  }

  private paint(): void {
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.fw-home-page'))) { const hide = n.dataset.page !== this.page; if (n.hidden !== hide) n.hidden = hide; }
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.fw-home-nav-item[data-v]'))) n.classList.toggle('is-active', n.dataset.v === this.page);
    const h = new Date().getHours();
    label(part(this.root, '[data-page="start"] .fw-home-title'), h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-pages]'))) text(n, tn(Number(n.dataset.pages), '{0} page', '{0} pages'));
  }

  private fill(): void {
    for (const f of this.pages.values()) void f.refresh();
  }

  get isShown(): boolean { return !this.root.hidden; }

  show(page?: Page): void {
    if (page && page !== this.page) { this.page = page; this.paint(); if (!this.root.hidden) this.fill(); }
    this.forced = true;
    this.apply();
  }

  dismiss(): void {
    this.forced = false;
    this.launch = false;
    this.apply();
  }

  sync(siteId: string | null, name = ''): void {
    if (siteId !== null && this.siteId !== null && siteId !== this.siteId) { this.forced = false; this.launch = false; }
    this.siteId = siteId;
    text(this.openName, name);
    this.apply();
  }

  private apply(): void {
    const on = this.forced || this.launch;
    if (on && this.root.hidden) { this.paint(); this.fill(); }
    if (!on) this.askClose(false);
    if (this.root.hidden === on) this.root.hidden = !on;
    document.body.classList.toggle('nm-home', on);
    const noSite = this.siteId === null;
    for (const back of this.backs) if (back.hidden !== noSite) back.hidden = noSite;
    if (this.openBox.hidden !== noSite) this.openBox.hidden = noSite;
  }
}
