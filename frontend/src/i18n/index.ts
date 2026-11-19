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

function lookup(english: string, lang: Lang = current): string {
  if (lang === 'en') return english;
  const tail = english.endsWith('...') ? '...' : english.endsWith(':') && !english.endsWith('::') ? ':' : '';
  const base = tail ? english.slice(0, -tail.length) : english;
  const parent = LANG_PARENT[lang];
  const look = (key: string): string | undefined => tables.get(lang)?.[key] ?? (parent ? tables.get(parent)?.[key] : undefined);
  const found = look(base) ?? (tail ? look(english) : undefined);
  if (found === undefined) return english;
  return tail && look(base) !== undefined ? `${found}${tail}` : found;
}

export type Value = string | number | { t: string } | { lang: string };
type Entry = { en: string; redo: () => string };
type Rec = { en: string; shown: string; redo?: () => string };

// Shown string back to its English source, scoped per language; null marks a string two sources share.
const made = new Map<string, Entry | null>();
const MADE_MAX = 20000;
const madeKey = (lang: string, shown: string): string => `${lang}\u0001${shown}`;
let KEYSET: Set<string> | null = null;
// Where unrecorded nodes were last drawn: the previous language while a switch is walking the page.
let from: Lang | null = null;
let settling = false;
let done = new WeakSet<Node>();
const rules = new Map<string, Intl.PluralRules>();

function fill(text: string, values: readonly Value[], english: boolean): string {
  return text.replace(/\{(\d+)\}/g, (token, index: string) => {
    const value = values[Number(index)];
    if (value === undefined) return token;
    if (typeof value !== 'object') return String(value);
    if ('lang' in value) return languageName(value.lang, english ? 'en' : current);
    return english ? value.t : lookup(value.t);
  });
}

const namers = new Map<string, Intl.DisplayNames | null>();
// A language code's name in the given interface language: Intl's names, else the language menu's own name, else the code.
export function languageName(code: string, lang: Lang = current): string {
  if (!namers.has(lang)) {
    try { namers.set(lang, new Intl.DisplayNames([lang], { type: 'language', fallback: 'none' })); } catch { namers.set(lang, null); }
  }
  let named: string | undefined;
  try { named = namers.get(lang)?.of(code); } catch { named = undefined; }
  return named || LANG_NAMES.find(([id]) => id.toLowerCase() === code.toLowerCase())?.[1] || code;
}

function remember(shown: string, entry: Entry, lang: Lang = current): void {
  const key = madeKey(lang, shown);
  const old = made.get(key);
  made.delete(key);
  made.set(key, old && old.en !== entry.en || old === null ? null : entry);
  if (made.size > MADE_MAX) made.delete(made.keys().next().value as string);
}

// An untranslated string on the page is its own source; a second source for it makes it ambiguous.
function own(shown: string): void {
  if (current !== 'en' && shown.length <= 400) remember(shown, { en: shown, redo: () => lookup(shown) });
}

// The English source of a shown string, unless the string is itself an untranslated key or is shared.
function source(shown: string): Entry | undefined {
  const lang = from ?? current;
  const entry = made.get(madeKey(lang, shown));
  if (!entry) return undefined;
  if (lang !== 'en') {
    KEYSET ??= new Set(KEYS);
    const base = shown.replace(/(\.\.\.|:)$/, '');
    if (KEYSET.has(shown) || KEYSET.has(base)) return undefined;
  }
  return entry;
}

function category(lang: string, n: number): string {
  let found = rules.get(lang);
  if (!found) {
    try { found = new Intl.PluralRules(lang); } catch { found = new Intl.PluralRules('en'); }
    rules.set(lang, found);
  }
  return found.select(n);
}

// A {t} value that is already translated goes back to its English source.
const unmade = (values: readonly Value[]): readonly Value[] =>
  values.map(v => typeof v === 'object' && 't' in v ? { t: source(v.t)?.en ?? v.t } : v);

export function t(english: string, given?: readonly Value[]): string {
  if (!given) {
    const plain = lookup(english);
    if (plain !== english) remember(plain, { en: english, redo: () => lookup(english) });
    return plain;
  }
  const values = unmade(given);
  const render = (): string => fill(lookup(english), values, false);
  const shown = render();
  remember(shown, { en: fill(english, values, true), redo: render });
  return shown;
}

export function tn(n: number, one: string, other: string, values?: readonly Value[]): string {
  const args = values ? unmade(values) : [n];
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
  drain(false);
  const previous = current;
  current = lang;
  document.documentElement.lang = lang;
  done = new WeakSet();
  for (const fn of listeners) fn();
  drain(true);
  from = previous;
  try { translatePage(); } finally { from = null; }
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
const SKIP = 'textarea, input, select option[data-user], script, style, canvas, iframe, pre, code, [contenteditable], [data-no-i18n], .xterm, .ft-term, .ft-notranslate, .fw-chat-log, .layers-scroll, .page-list, .fw-crumbs, .inspector-name, .project-name, .frame-label';
const SKIP_ATTR = SKIP.replace('textarea, input, ', '');
const textEn = new WeakMap<Text, Rec>();
const attrEn = new WeakMap<Element, Map<string, Rec>>();
let observer: MutationObserver | null = null;

// Sets a node's text through t() and records its English source on the text node, so a later switch re-translates from
// that source instead of mapping the shown string back (which fails when another key shares the translation).
export function labelText(node: Text, english: string, values?: readonly Value[]): void {
  const args = values ? unmade(values) : undefined;
  const render = (): string => args ? fill(lookup(english), args, false) : lookup(english);
  const shown = t(english, values);
  if (node.data !== shown) node.data = shown;
  textEn.set(node, { en: args ? fill(english, args, true) : english, shown, redo: render });
}

// The English source of a node's text, or null when another language is shown and the source is not recorded.
export function englishOf(node: HTMLElement): string | null {
  const child = node.firstChild;
  const rec = child instanceof Text && child === node.lastChild ? textEn.get(child) : undefined;
  if (rec) return rec.en.trim();
  const text = (node.textContent || '').trim();
  KEYSET ??= new Set(KEYS);
  return current === 'en' || known(text) || KEYSET.has(text) ? text : null;
}

export function label(node: HTMLElement, english: string, values?: readonly Value[]): void {
  const shown = t(english, values);
  if (node.textContent !== shown) node.textContent = shown;
  const child = node.firstChild;
  if (child instanceof Text && child === node.lastChild) labelText(child, english, values);
}

// The same for an attribute the translator watches (title, aria-label, placeholder).
export function labelAttr(el: Element, name: (typeof ATTRS)[number], english: string, values?: readonly Value[]): void {
  const args = values ? unmade(values) : undefined;
  const render = (): string => args ? fill(lookup(english), args, false) : lookup(english);
  const shown = t(english, values);
  if (el.getAttribute(name) !== shown) el.setAttribute(name, shown);
  let recs = attrEn.get(el);
  if (!recs) { recs = new Map(); attrEn.set(el, recs); }
  recs.set(name, { en: args ? fill(english, args, true) : english, shown, redo: render });
}

const skipped = (node: Node | null): boolean => {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  return !el || !!el.closest(SKIP);
};
const skippedAttr = (el: Element): boolean => !!el.closest(SKIP_ATTR);

function translateText(node: Text): void {
  if (from && done.has(node)) return;
  if (settling) done.add(node);
  const raw = node.data;
  const rec = textEn.get(node);
  if (rec && raw === rec.shown) {
    const next = rec.redo ? rec.redo() : t(rec.en);
    if (next !== raw) { rec.shown = next; node.data = next; }
    return;
  }
  const trimmed = raw.trim();
  const entry = trimmed ? source(trimmed) : undefined;
  if (entry && !skipped(node)) {
    const lead = raw.slice(0, raw.indexOf(trimmed)), tail = raw.slice(lead.length + trimmed.length);
    const redo = (): string => lead + entry.redo() + tail;
    const next = redo();
    textEn.set(node, { en: lead + entry.en + tail, shown: next, redo });
    if (next !== raw) node.data = next;
    return;
  }
  if (!trimmed || trimmed.length > 400 || !known(trimmed) || skipped(node)) {
    if (rec) textEn.delete(node);
    if (trimmed && !skipped(node)) own(trimmed);
    return;
  }
  const lead = raw.slice(0, raw.indexOf(trimmed)), tail = raw.slice(lead.length + trimmed.length);
  const redo = (): string => lead + t(trimmed) + tail;
  const next = redo();
  textEn.set(node, { en: raw, shown: next, redo });
  node.data = next;
}

function translateAttrs(el: Element): void {
  if (from && done.has(el)) return;
  if (settling) done.add(el);
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
    const entry = source(value);
    if (entry && !skippedAttr(el)) {
      if (!recs) { recs = new Map(); attrEn.set(el, recs); }
      const next = entry.redo();
      recs.set(name, { en: entry.en, shown: next, redo: entry.redo });
      if (next !== value) el.setAttribute(name, next);
      continue;
    }
    if (!known(value) || skippedAttr(el)) {
      recs?.delete(name);
      if (!skippedAttr(el)) own(value);
      continue;
    }
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

function apply(records: MutationRecord[]): void {
  observer?.disconnect();
  for (const record of records) {
    if (record.type === 'childList') record.addedNodes.forEach(node => walk(node));
    else if (record.type === 'characterData' && record.target instanceof Text) translateText(record.target);
    else if (record.type === 'attributes' && record.target instanceof Element) translateAttrs(record.target);
  }
  observer?.observe(document.body, OBSERVE);
}

// Handle queued changes now; after the listeners ran (settle) they are already drawn in the new language.
function drain(settle: boolean): void {
  if (!observer) return;
  const records = observer.takeRecords();
  if (!records.length || (!settle && current === 'en')) return;
  settling = settle;
  try { apply(records); } finally { settling = false; }
}

export function startPageTranslator(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(records => {
    if (current !== 'en') apply(records);
  });
  translatePage();
}
