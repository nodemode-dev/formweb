import { libraryMutate, request } from '../../api';
import { element } from '../../ui/dom';
import { label, labelAttr, t } from '../../i18n';
import { SectionDetail } from './detail';
import { SectionGrid } from './grid';
import { HtmlImport } from './importer';
import { SiteImport } from './site-import';
import { Kits } from './kits';
import type { LibIndex, LibResult, LibSection, LibraryHooks } from './types';
import '../../styles/library.css';

export type { LibraryHooks } from './types';
export type LibraryPanel = { element: HTMLElement; setVisible: (on: boolean) => void; showTab: (id: Tab) => void; importSite: () => void; importHtml: () => void };

type Tab = 'sections' | 'kits' | 'import';

/**
 * Library panel (left sidebar, Library rail mode): sections to browse and insert, design presets, starter sites and
 * Import HTML. One module, four views that swap by the `hidden` attribute inside one fixed-size pane, so opening a
 * detail or switching a tab moves nothing around it. The index is fetched when the panel opens and keyed into the
 * existing cards, so a library that grows shows the new sections without rebuilding what is already there.
 */
export function installLibrary(hooks: LibraryHooks): LibraryPanel {
  const root = element('div', 'fw-lib');
  root.hidden = true;
  let index: LibIndex = { categories: [], sections: [], components: [], presets: [], starters: [] };
  let tab: Tab = 'sections';
  let opened = '';
  let loading = false;
  let loaded = false;

  const grid = new SectionGrid(hooks, section => open(section), () => void load());
  const detail = new SectionDetail(hooks, () => index.components, () => close(), async (section, values) => {
    const where = hooks.placement();
    const result = await libraryMutate<LibResult>(`/api/library/sections/${encodeURIComponent(section.id)}/insert`, {
      parent: where.parent, index: where.index, page: where.page, values
    });
    if (result.root) hooks.select(result.root);
    const inserted = t('Inserted {0}.', [{ t: section.name || section.id }]);
    hooks.notify(inserted, false);
    return result.warnings?.[0] ? [inserted, ' ', result.warnings[0]] : [inserted];
  });
  const kits = new Kits(hooks, page => hooks.openPage(page));
  let site = false;
  const importer = new HtmlImport(hooks, () => importHtml(), () => importSite());
  const siteImport = new SiteImport(hooks, () => { site = false; settle(); paint(); }, () => { tab = 'import'; site = true; paint(); });
  /** A finished import is not kept for later: coming back finds the import view in its waiting state. */
  function settle(): void {
    if (!siteImport.finished) return;
    siteImport.reset();
    site = false;
  }

  const tabs = element('div', 'fw-seg fw-lib-tabs');
  tabs.setAttribute('role', 'tablist');
  const buttons = new Map<Tab, HTMLButtonElement>();
  for (const [id, english] of [['sections', 'Sections'], ['kits', 'Kits'], ['import', 'Import HTML']] as [Tab, string][]) {
    const button = element('button', 'fw-seg-btn');
    label(button, english);
    button.type = 'button';
    if (id === 'kits') labelAttr(button, 'title', 'Presets and starters');
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => { if (id === 'import' && tab !== 'import') settle(); tab = id; paint(); });
    buttons.set(id, button);
    tabs.append(button);
  }

  const views: [Tab, HTMLElement][] = [['sections', grid.element], ['kits', kits.element], ['import', importer.element]];
  root.append(tabs, grid.element, detail.element, kits.element, importer.element, siteImport.element);

  function paint(): void {
    buttons.forEach((button, id) => {
      const on = id === tab;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-selected', String(on));
    });
    for (const [id, view] of views) {
      const show = id === tab && !(id === 'sections' && opened) && !(id === 'import' && site);
      if (view.hidden === show) view.hidden = !show;
    }
    const showSite = tab === 'import' && site;
    if (siteImport.element.hidden === showSite) siteImport.element.hidden = !showSite;
    const showDetail = tab === 'sections' && !!opened;
    if (detail.element.hidden === showDetail) detail.element.hidden = !showDetail;
  }
  /** Both open the system file picker in the same click; HTML files with the import view behind it, a zip with the review view. */
  function importSite(): void {
    tab = 'import';
    site = true;
    paint();
    siteImport.choose('site');
  }
  function importHtml(): void {
    tab = 'import';
    site = false;
    paint();
    siteImport.choose('html');
  }
  function open(section: LibSection): void {
    opened = section.id;
    detail.show(section);
    grid.mark(opened);
    paint();
  }
  function close(): void {
    opened = '';
    paint();
    const card = Array.from(root.querySelectorAll<HTMLElement>('.fw-lib-card')).find(node => node.classList.contains('is-open'));
    card?.focus({ preventScroll: true });
  }
  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const next = await request<LibIndex>('/api/library');
      index = {
        categories: Array.isArray(next.categories) ? next.categories : [],
        sections: Array.isArray(next.sections) ? next.sections : [],
        components: Array.isArray(next.components) ? next.components : [],
        presets: Array.isArray(next.presets) ? next.presets : [],
        starters: Array.isArray(next.starters) ? next.starters : []
      };
      loaded = true;
      grid.setIndex(index);
      kits.setIndex(index);
      // An open detail keeps its form (a refresh must never rebuild inputs someone is typing in); it closes only if its section is gone.
      if (opened && !index.sections.some(section => section.id === opened)) { opened = ''; paint(); }
    } catch (error) {
      if (!loaded) grid.setMessage(t('The library could not be loaded.'), true, error instanceof Error ? ` ${error.message}` : '');
      else hooks.notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      loading = false;
    }
  }

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && opened && tab === 'sections' && !(event.target instanceof HTMLTextAreaElement)) { event.stopPropagation(); close(); }
  });
  paint();
  return {
    element: root,
    importSite,
    importHtml,
    setVisible(on: boolean): void {
      if (on && root.hidden) { settle(); paint(); }
      if (root.hidden === on) root.hidden = !on;
      if (on) void load();
    },
    showTab(id: Tab): void {
      tab = id;
      paint();
      buttons.get(id)?.focus({ preventScroll: true });
    }
  };
}
