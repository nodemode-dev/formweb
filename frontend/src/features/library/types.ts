import { t } from '../../i18n';

/** Shapes of GET /api/library (backend/app/library.py index()). Every list may grow and every optional part may be missing. */
export type LibField = { label?: string; type?: 'text' | 'longtext' | 'color' | 'url' | 'asset' | 'number'; default?: string | number | null };
export type LibSection = {
  id: string;
  name?: string;
  category?: string;
  tags?: string[] | null;
  product?: string | null;
  description?: string | null;
  components?: string[] | null;
  preset?: string | null;
  fields?: Record<string, LibField> | null;
  thumb?: boolean;
};
export type LibComponent = { id: string; code?: string; name?: string; description?: string };
export type LibPreset = { id: string; name?: string; description?: string };
export type LibStarter = { id: string; name?: string; description?: string; preset?: string; pages?: { name?: string; slug?: string; sections?: string[] }[] };
export type LibIndex = { categories: string[]; sections: LibSection[]; components: LibComponent[]; presets: LibPreset[]; starters: LibStarter[] };
/** What a mutating library route adds to the batch state. */
export type LibResult = { root?: string; pages?: string[]; warnings?: string[]; changed?: boolean; outside?: SiteOutside[]; outsideMore?: number };
/** POST /api/library/import-site/review: what importing a site zip would do, nothing changed yet. */
export type SiteSkip = { file: string; reason: string };
/** A stylesheet or script a page loads from another host: named in the review, never fetched. */
export type SiteOutside = { kind: 'stylesheet' | 'script'; host: string; url: string };
export type SitePage = { file: string; name: string; title: string; description: string; route: string; newRoute: string; replaces: { id: string; name: string; safe: boolean } | null; bytes: number; warnings: string[]; outside?: SiteOutside[]; outsideMore?: number; outsideWarnings?: number[] };
export type SiteReview = { pages: SitePage[]; assets: { count: number; bytes: number }; supportFiles: number; skipped: SiteSkip[]; ignored: number; canReplace: boolean; replaceNote: string; notes: string[]; revision: number };
/** POST /api/library/import-site: the batch state plus the pages made, assets stored and files skipped. */
export type SiteResult = { pages?: string[]; assets?: number; skipped?: SiteSkip[]; warnings?: string[]; message?: string };

export type LibraryHooks = {
  /** Where an insert goes: the page, its parent, and the index after the selected top-level section (none means the end). */
  placement: () => { page: string; parent: string; index?: number };
  select: (id: string) => void;
  /** Opens a page in the editor by id (after a starter adds pages). */
  openPage: (page: string) => void;
  notify: (message: string, error?: boolean) => void;
  url: (path: string) => string;
  /** Turns imported code sections into editable elements in one undo step; answers with the result sentence. */
  convert: (hosts: string[]) => Promise<{ message: string; root: string | null }>;
};

export const thumbUrl = (hooks: LibraryHooks, id: string): string => hooks.url(`/api/library/thumbs/${encodeURIComponent(id)}.webp`);

const CATEGORY_LABEL: Record<string, () => string> = {
  'product-site': () => t('Product site'),
  'scroll-story': () => t('Scroll story'),
  'portfolio-hero': () => t('Portfolio hero'),
  'prompt-hero': () => t('Prompt hero'),
  support: () => t('Support'),
  'not-found': () => t('Not found'),
  chrome: () => t('Chrome')
};
/** The categories the bundled library ships, in its order: the chip row paints these at first paint, before the index arrives. */
export const KNOWN_CATEGORIES: string[] = Object.keys(CATEGORY_LABEL);
export function categoryLabel(id: string): string {
  const known = CATEGORY_LABEL[id];
  if (known) return known();
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

/** Name and description of a section: the template's English is the key, so a locale layer translates it and an unknown one stays English. */
export const sectionName = (section: LibSection): string => t(section.name || section.id);
export const sectionText = (section: LibSection): string => (section.description ? t(section.description) : '');
