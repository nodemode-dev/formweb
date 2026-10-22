import { element, text } from './dom';
import { HomeFiles, type HomeFilesDeps } from './home-files';
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
}

type Page = 'start' | 'recent' | 'projects';

const FORMATS = ['FWEB', 'JSON', 'HTML', 'CSS', 'SVG', 'PNG', 'JPEG', 'WEBP', 'GIF', 'CSV'];

const PREF_KEY = 'formweb.homePrefs';

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
  private readonly back: HTMLElement;

  constructor(host: HTMLElement, private readonly d: HomeDeps) {
    this.root.setAttribute('aria-label', 'Home');
    this.root.hidden = true;
    const glyph = (name: Icon): string => icon(name).outerHTML;
    const navItem = (v: Page, ic: Icon, label: string): string => `<button class="fw-home-nav-item" type="button" data-v="${v}">${glyph(ic)}<span>${label}</span>${v === 'start' ? '' : '<span class="fw-home-count">0</span>'}</button>`;
    const cmdItem = (cmd: string, ic: Icon, label: string): string => `<button class="fw-home-nav-item" type="button" data-run="${cmd}">${glyph(ic)}<span>${label}</span></button>`;
    const formats = FORMATS.map(f => `<span class="fw-home-format">${f}</span>`).join('');
    const tiles = [{ id: '', name: 'Blank site', pages: 1 }, ...d.templates].map(t => `<button class="fw-home-size" type="button" data-template="${t.id}"><span class="fw-home-size-box"><span style="aspect-ratio: 4 / 3"></span></span><span class="fw-home-size-name">${t.name}</span><span class="fw-home-size-meta">${t.pages} ${t.pages === 1 ? 'page' : 'pages'}</span></button>`).join('');
    this.root.innerHTML = `<nav class="fw-home-nav" aria-label="Home">
      <div class="fw-home-brand">formweb <span>by NodeMode</span></div>
      ${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}
      <div class="fw-home-nav-sep"></div>
      <div class="fw-home-nav-title">Create</div>
      ${cmdItem('file.new', 'plus', 'New site')}${cmdItem('file.projects', 'folder', 'Open project')}${cmdItem('file.import', 'upload', 'Import .fweb file')}${cmdItem('page.generate', 'wand', 'Generate pages')}
      <div class="fw-home-nav-foot"><button class="fw-home-nav-item fw-home-back" type="button" data-back hidden>${glyph('chevronLeft')}<span>Back to Editor</span></button>${cmdItem('edit.settings', 'gear', 'Preferences')}${cmdItem('help.guide', 'info', 'Help')}</div>
    </nav>
    <div class="fw-home-main">
      <div class="fw-home-narrow">${navItem('start', 'image', 'Start')}${navItem('recent', 'history', 'Recent')}${navItem('projects', 'folder', 'Projects')}</div>
      <div class="fw-home-page" data-page="start">
        <div class="fw-home-head"><div><h1 class="fw-home-title"></h1><p class="fw-home-sub">Open a website, or start a new one.</p></div></div>
        <div class="fw-home-hero">
          <span class="fw-home-hero-icon">${glyph('globe')}</span>
          <div class="fw-home-hero-text"><div class="fw-home-hero-title">Start a website</div>
            <div class="fw-home-hero-sub">Design responsive pages on a visual canvas, then export clean static HTML or publish a version locally. Projects are kept as editable .fweb source.</div>
            <div class="fw-home-formats">${formats}</div></div>
          <div class="fw-home-hero-actions">
            <button class="fw-home-action is-primary" type="button" data-run="file.new">${glyph('plus')}<span class="fw-home-label">New site...</span></button>
            <button class="fw-home-action" type="button" data-run="file.projects">${glyph('folder')}<span class="fw-home-label">Open...</span></button>
            <button class="fw-home-action is-ghost" type="button" data-run="page.generate">${glyph('wand')}<span class="fw-home-label">Generate from a description</span></button>
          </div>
        </div>
        <section class="fw-home-section"><div class="fw-home-section-head"><h2 class="fw-home-section-title">Recent</h2><button class="fw-home-btn is-ghost" type="button" data-v="recent">See all</button></div><div class="fw-home-slot" data-slot="start"></div></section>
        <section class="fw-home-section"><div class="fw-home-section-head"><h2 class="fw-home-section-title">New site</h2><button class="fw-home-btn is-ghost" type="button" data-run="file.new">More options...</button></div><div class="fw-home-sizes">${tiles}</div></section>
      </div>
      <div class="fw-home-page" data-page="recent" hidden><div class="fw-home-head"><div><h1 class="fw-home-title">Recent</h1><p class="fw-home-sub">Sites you opened or saved, newest first.</p></div></div><div class="fw-home-slot" data-slot="recent"></div></div>
      <div class="fw-home-page" data-page="projects" hidden><div class="fw-home-head"><div><h1 class="fw-home-title">Projects</h1><p class="fw-home-sub">Every saved project snapshot.</p></div></div><div class="fw-home-slot" data-slot="projects"></div></div>
    </div>`;
    this.back = part(this.root, '[data-back]');
    const count = (v: Page) => (n: number): void => { for (const c of Array.from(this.root.querySelectorAll<HTMLElement>(`[data-v="${v}"] .fw-home-count`))) text(c, String(n)); };
    const mount = (slot: Page, tab: 'recent' | 'projects', options: { limit?: number; compact?: boolean }): void => {
      const files = new HomeFiles(d.files, { tab, ...options, onCount: count(slot === 'start' ? 'recent' : slot) });
      part(this.root, `[data-slot="${slot}"]`).appendChild(files.root);
      this.pages.set(slot, files);
    };
    mount('start', 'recent', { limit: 8, compact: true });
    mount('recent', 'recent', {});
    mount('projects', 'projects', {});
    this.root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-back]')) { this.dismiss(); return; }
      const v = target.closest<HTMLElement>('[data-v]')?.dataset.v as Page | undefined;
      if (v) { this.show(v); return; }
      const template = target.closest<HTMLElement>('[data-template]');
      if (template) { this.d.create(template.dataset.template ?? ''); return; }
      const run = target.closest<HTMLElement>('[data-run]')?.dataset.run;
      if (run) this.d.run(run);
    });
    host.appendChild(this.root);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.siteId !== null && !this.root.hidden && !document.querySelector('.dialog-scrim:not([hidden])')) this.dismiss(); });
    this.paint();
    this.apply();
  }

  private paint(): void {
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.fw-home-page'))) { const hide = n.dataset.page !== this.page; if (n.hidden !== hide) n.hidden = hide; }
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.fw-home-nav-item[data-v]'))) n.classList.toggle('is-active', n.dataset.v === this.page);
    const h = new Date().getHours();
    text(part(this.root, '[data-page="start"] .fw-home-title'), h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
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

  sync(siteId: string | null): void {
    if (siteId !== null && this.siteId !== null && siteId !== this.siteId) { this.forced = false; this.launch = false; }
    this.siteId = siteId;
    this.apply();
  }

  private apply(): void {
    const on = this.forced || this.launch;
    if (on && this.root.hidden) { this.paint(); this.fill(); }
    if (this.root.hidden === on) this.root.hidden = !on;
    const noSite = this.siteId === null;
    if (this.back.hidden !== noSite) this.back.hidden = noSite;
  }
}
