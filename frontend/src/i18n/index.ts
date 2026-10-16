import { KEYS } from './keys';
import { LANG_NAMES, LANG_PARENT, isLang, type Lang } from './langs';

export type { Lang } from './langs';
export { isLang } from './langs';

type Table = Record<string, string>;
type Source = () => Promise<Table | readonly string[]>;
type Full = Exclude<Lang, 'en' | 'es-MX' | 'fr-CA'>;

const FAMILY: Record<Exclude<Lang, 'en'>, Source> = {
  es: () => import('./family/es').then(m => m.es), 'es-MX': () => import('./family/es-MX').then(m => m.esMX),
  'pt-BR': () => import('./family/pt-BR').then(m => m.ptBR), fr: () => import('./family/fr').then(m => m.fr),
  'fr-CA': () => import('./family/fr-CA').then(m => m.frCA), de: () => import('./family/de').then(m => m.de),
  it: () => import('./family/it').then(m => m.it), nl: () => import('./family/nl').then(m => m.nl),
  da: () => import('./family/da').then(m => m.da), fi: () => import('./family/fi').then(m => m.fi),
  nb: () => import('./family/nb').then(m => m.nb), sv: () => import('./family/sv').then(m => m.sv),
  ru: () => import('./family/ru').then(m => m.ru), pl: () => import('./family/pl').then(m => m.pl),
  cs: () => import('./family/cs').then(m => m.cs), hu: () => import('./family/hu').then(m => m.hu),
  uk: () => import('./family/uk').then(m => m.uk), tr: () => import('./family/tr').then(m => m.tr),
  'zh-CN': () => import('./family/zh-CN').then(m => m.zhCN), 'zh-TW': () => import('./family/zh-TW').then(m => m.zhTW),
  ja: () => import('./family/ja').then(m => m.ja), ko: () => import('./family/ko').then(m => m.ko),
  id: () => import('./family/id').then(m => m.id), th: () => import('./family/th').then(m => m.th),
  vi: () => import('./family/vi').then(m => m.vi)
};
const FAMILY_MORE: Record<Full, Source> = {
  es: () => import('./family/more/es').then(m => m.es), 'pt-BR': () => import('./family/more/pt-BR').then(m => m.ptBR),
  fr: () => import('./family/more/fr').then(m => m.fr), de: () => import('./family/more/de').then(m => m.de),
  it: () => import('./family/more/it').then(m => m.it), nl: () => import('./family/more/nl').then(m => m.nl),
  da: () => import('./family/more/da').then(m => m.da), fi: () => import('./family/more/fi').then(m => m.fi),
  nb: () => import('./family/more/nb').then(m => m.nb), sv: () => import('./family/more/sv').then(m => m.sv),
  ru: () => import('./family/more/ru').then(m => m.ru), pl: () => import('./family/more/pl').then(m => m.pl),
  cs: () => import('./family/more/cs').then(m => m.cs), hu: () => import('./family/more/hu').then(m => m.hu),
  uk: () => import('./family/more/uk').then(m => m.uk), tr: () => import('./family/more/tr').then(m => m.tr),
  'zh-CN': () => import('./family/more/zh-CN').then(m => m.zhCN), 'zh-TW': () => import('./family/more/zh-TW').then(m => m.zhTW),
  ja: () => import('./family/more/ja').then(m => m.ja), ko: () => import('./family/more/ko').then(m => m.ko),
  id: () => import('./family/more/id').then(m => m.id), th: () => import('./family/more/th').then(m => m.th),
  vi: () => import('./family/more/vi').then(m => m.vi)
};
const FAMILY_EXTRA: Record<Full, Source> = {
  es: () => import('./family/extra/es').then(m => m.es), 'pt-BR': () => import('./family/extra/pt-BR').then(m => m.ptBR),
  fr: () => import('./family/extra/fr').then(m => m.fr), de: () => import('./family/extra/de').then(m => m.de),
  it: () => import('./family/extra/it').then(m => m.it), nl: () => import('./family/extra/nl').then(m => m.nl),
  da: () => import('./family/extra/da').then(m => m.da), fi: () => import('./family/extra/fi').then(m => m.fi),
  nb: () => import('./family/extra/nb').then(m => m.nb), sv: () => import('./family/extra/sv').then(m => m.sv),
  ru: () => import('./family/extra/ru').then(m => m.ru), pl: () => import('./family/extra/pl').then(m => m.pl),
  cs: () => import('./family/extra/cs').then(m => m.cs), hu: () => import('./family/extra/hu').then(m => m.hu),
  uk: () => import('./family/extra/uk').then(m => m.uk), tr: () => import('./family/extra/tr').then(m => m.tr),
  'zh-CN': () => import('./family/extra/zh-CN').then(m => m.zhCN), 'zh-TW': () => import('./family/extra/zh-TW').then(m => m.zhTW),
  ja: () => import('./family/extra/ja').then(m => m.ja), ko: () => import('./family/extra/ko').then(m => m.ko),
  id: () => import('./family/extra/id').then(m => m.id), th: () => import('./family/extra/th').then(m => m.th),
  vi: () => import('./family/extra/vi').then(m => m.vi)
};
const OWN = import.meta.glob<Table | readonly string[]>('./locales/*.ts', { import: 'default' });

const PREF = 'formweb_language';
const tables = new Map<Lang, Table>([['en', {}]]);
const listeners = new Set<() => void>();

function readSaved(): Lang {
  try { const value = localStorage.getItem(PREF); return isLang(value) ? value : 'en'; } catch { return 'en'; }
}

const saved = readSaved();
let current: Lang = 'en';
let wanted: Lang = saved;

export const languages = (): ReadonlyArray<readonly [Lang, string]> => LANG_NAMES;
export const language = (): Lang => current;

function asTable(source: Table | readonly string[]): Table {
  if (!Array.isArray(source)) return source as Table;
  const table: Table = {};
  (source as readonly string[]).forEach((text, index) => { const key = KEYS[index]; if (key && text) table[key] = text; });
  return table;
}

async function part(source: Source | undefined): Promise<Table> {
  return source ? asTable(await source()) : {};
}

async function load(lang: Lang): Promise<void> {
  for (const code of [LANG_PARENT[lang], lang]) {
    if (!code || code === 'en' || tables.has(code)) continue;
    const own = OWN[`./locales/${code}.ts`];
    const full = code !== 'es-MX' && code !== 'fr-CA' ? code as Full : null;
    const [main, more, extra, mine] = await Promise.all([
      part(FAMILY[code]), part(full ? FAMILY_MORE[full] : undefined), part(full ? FAMILY_EXTRA[full] : undefined), part(own)
    ]);
    tables.set(code, { ...extra, ...more, ...main, ...mine });
  }
}

function lookup(english: string): string {
  if (current === 'en') return english;
  const tail = english.endsWith('...') ? '...' : english.endsWith(':') && !english.endsWith('::') ? ':' : '';
  const base = tail ? english.slice(0, -tail.length) : english;
  const parent = LANG_PARENT[current];
  const look = (key: string): string | undefined => tables.get(current)?.[key] ?? (parent ? tables.get(parent)?.[key] : undefined);
  const found = look(base) ?? (tail ? look(english) : undefined);
  if (found === undefined) return english;
  return tail && look(base) !== undefined ? `${found}${tail}` : found;
}

type Value = string | number | { t: string };
type Entry = { en: string; redo: () => string };
type Rec = { en: string; shown: string; redo?: () => string };

const made = new Map<string, Entry>();
const MADE_MAX = 3000;
const rules = new Map<string, Intl.PluralRules>();

function fill(text: string, values: readonly Value[], english: boolean): string {
  return text.replace(/\{(\d+)\}/g, (token, index: string) => {
    const value = values[Number(index)];
    if (value === undefined) return token;
    if (typeof value !== 'object') return String(value);
    return english ? value.t : lookup(value.t);
  });
}

function remember(shown: string, entry: Entry): void {
  made.delete(shown);
  made.set(shown, entry);
  if (made.size > MADE_MAX) made.delete(made.keys().next().value as string);
}

function category(lang: string, n: number): string {
  let found = rules.get(lang);
  if (!found) {
    try { found = new Intl.PluralRules(lang); } catch { found = new Intl.PluralRules('en'); }
    rules.set(lang, found);
  }
  return found.select(n);
}

export function t(english: string, values?: readonly Value[]): string {
  if (!values) {
    const plain = lookup(english);
    if (plain !== english) remember(plain, { en: english, redo: () => lookup(english) });
    return plain;
  }
  const render = (): string => fill(lookup(english), values, false);
  const shown = render();
  remember(shown, { en: fill(english, values, true), redo: render });
  return shown;
}

export function tn(n: number, one: string, other: string, values?: readonly Value[]): string {
  const args = values ?? [n];
  const pick = (lang: string): string => category(lang, n) === 'one' ? one : other;
  const render = (): string => fill(lookup(pick(current)), args, false);
  const shown = render();
  remember(shown, { en: fill(pick('en'), args, true), redo: render });
  return shown;
}

const known = (text: string): boolean => current !== 'en' && lookup(text) !== text;

export async function setLanguage(lang: Lang): Promise<void> {
  wanted = lang;
  try { localStorage.setItem(PREF, lang); } catch {}
  try { await load(lang); } catch { return; }
  if (wanted !== lang || lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  for (const fn of listeners) fn();
  translatePage();
}

export async function startLanguage(): Promise<void> {
  if (saved === 'en') return;
  try { await load(saved); } catch { return; }
  if (wanted !== saved) return;
  current = saved;
  document.documentElement.lang = saved;
}

export function onLanguage(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const ATTRS = ['title', 'aria-label', 'placeholder'] as const;
const SKIP = 'textarea, input, select option[data-user], script, style, canvas, iframe, pre, code, [contenteditable], [data-no-i18n], .xterm, .fw-term-body, .fw-chat-log, .layers-scroll, .page-list, .fw-crumbs, .inspector-name, .project-name, .frame-label';
const SKIP_ATTR = SKIP.replace('textarea, input, ', '');
const textEn = new WeakMap<Text, Rec>();
const attrEn = new WeakMap<Element, Map<string, Rec>>();
let observer: MutationObserver | null = null;

const skipped = (node: Node | null): boolean => {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  return !el || !!el.closest(SKIP);
};
const skippedAttr = (el: Element): boolean => !!el.closest(SKIP_ATTR);

function translateText(node: Text): void {
  const raw = node.data;
  const rec = textEn.get(node);
  if (rec && raw === rec.shown) {
    const next = rec.redo ? rec.redo() : t(rec.en);
    if (next !== raw) { rec.shown = next; node.data = next; }
    if (current === 'en' || next === rec.en) textEn.delete(node);
    return;
  }
  const trimmed = raw.trim();
  const entry = trimmed ? made.get(trimmed) : undefined;
  if (entry && !skipped(node)) {
    const lead = raw.slice(0, raw.indexOf(trimmed)), tail = raw.slice(lead.length + trimmed.length);
    const redo = (): string => lead + entry.redo() + tail;
    const next = redo();
    textEn.set(node, { en: lead + entry.en + tail, shown: next, redo });
    if (next !== raw) node.data = next;
    return;
  }
  if (!trimmed || trimmed.length > 240 || !known(trimmed) || skipped(node)) { if (rec) textEn.delete(node); return; }
  const next = raw.replace(trimmed, t(trimmed));
  textEn.set(node, { en: raw, shown: next });
  node.data = next;
}

function translateAttrs(el: Element): void {
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    let recs = attrEn.get(el);
    const rec = recs?.get(name);
    if (rec && value === rec.shown) {
      const next = rec.redo ? rec.redo() : t(rec.en);
      if (next !== value) { rec.shown = next; el.setAttribute(name, next); }
      continue;
    }
    const entry = made.get(value);
    if (entry && !skippedAttr(el)) {
      if (!recs) { recs = new Map(); attrEn.set(el, recs); }
      const next = entry.redo();
      recs.set(name, { en: entry.en, shown: next, redo: entry.redo });
      if (next !== value) el.setAttribute(name, next);
      continue;
    }
    if (!known(value) || skippedAttr(el)) { recs?.delete(name); continue; }
    if (!recs) { recs = new Map(); attrEn.set(el, recs); }
    const next = t(value);
    recs.set(name, { en: value, shown: next });
    el.setAttribute(name, next);
  }
}

function walk(root: Node): void {
  if (root instanceof Text) { translateText(root); return; }
  if (!(root instanceof Element)) return;
  if (root.closest(SKIP)) { if (root.matches('input, textarea')) translateAttrs(root); return; }
  translateAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (!(node instanceof Element) || !node.matches(SKIP)) return NodeFilter.FILTER_ACCEPT;
      if (node.matches('input, textarea')) translateAttrs(node);
      return NodeFilter.FILTER_REJECT;
    }
  });
  for (let node = it.nextNode(); node; node = it.nextNode()) {
    if (node instanceof Text) translateText(node);
    else if (node instanceof Element) translateAttrs(node);
  }
}

const OBSERVE: MutationObserverInit = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] };

function translatePage(): void {
  if (typeof document === 'undefined') return;
  observer?.disconnect();
  walk(document.body);
  observer?.observe(document.body, OBSERVE);
}

export function startPageTranslator(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(records => {
    if (current === 'en') return;
    observer?.disconnect();
    for (const record of records) {
      if (record.type === 'childList') record.addedNodes.forEach(node => walk(node));
      else if (record.type === 'characterData' && record.target instanceof Text) translateText(record.target);
      else if (record.type === 'attributes' && record.target instanceof Element) translateAttrs(record.target);
    }
    observer?.observe(document.body, OBSERVE);
  });
  translatePage();
}
