import { arrange, backdropLayers, bodyQualified, carryAttrs, compact, emptyOutcome, families, guardSelector, KEEP_BYTES, KEEP_RULES, layerName, LINK_FORCED, mapTag, pickFonts, READ, reduceStyles, ROOT_FORCED, scopeSelector, scriptWords, selectorList, subjectClasses, VOID_TAGS, type FontFaceRule, type Outcome, type Part, type Run, type SiteFont } from './rules';
import { t } from '../../i18n';

export interface Source { html: string; css: string; js: string; module: boolean }
export interface Planned { id: string; parent: string; tag: string; name: string; text: string; attrs: Record<string, string>; styles: Record<string, string>; code?: { enabled: true; html: string; css?: string; js?: string; module?: boolean } }
export interface Plan { rootStyles: Record<string, string>; nodes: Planned[]; fonts: Record<string, SiteFont> | null; outcome: Outcome; rest?: { before: string; after: string; css: string; kept?: string } }
export interface Options { origin: string; keepScript: boolean; fonts: Record<string, SiteFont>; taken: (id: string) => boolean; limit: number; depth: number; seconds: number; scope?: string; siteNames?: Set<string> }

const SKIPPED = new Set(['STYLE', 'LINK', 'META', 'BASE', 'TITLE']);

/** The section's own HTML before and after one top-level block, written as it was (handlers and all). */
function split(html: string, only: number): { before: string; after: string } {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
  doc.body.querySelectorAll('style').forEach(node => node.remove());
  const block = Array.from(doc.body.children).filter(el => !SKIPPED.has(el.tagName))[only];
  if (!block) return { before: '', after: doc.body.innerHTML.trim() };
  const before = doc.createElement('div'), after = doc.createElement('div');
  let seen = false;
  for (const node of Array.from(doc.body.childNodes)) {
    if (node === block) { seen = true; continue; }
    (seen || node.nodeType !== 1 ? after : before).append(node);
  }
  return { before: before.innerHTML.trim(), after: after.innerHTML.trim() };
}

export const SCOPE = '__FWSCOPE__';
export interface Block { index: number; label: string; count: number }

/** A page past one conversion's limits; its message is the sentence a person reads, wherever it ends up. */
export class TooLarge extends Error {
  constructor(readonly reason: 'count' | 'depth' | 'time', readonly count: number, readonly limit: number) {
    super((reason === 'depth' ? t('This page nests elements more than {0} levels deep, more than one conversion takes.', [limit])
      : reason === 'time' ? t('Measuring this page took longer than {0} seconds.', [limit])
        : t('This page has more than {0} elements, more than one conversion makes.', [limit])) + ' ' + t('Convert it one part at a time; the rest stays code until you convert it too.'));
  }
}

/** The styles the exported page starts from (formweb-export stylesheet), so a baseline matches what visitors get. */
const EXPORT_BASE = '*{box-sizing:border-box}body{margin:0}img,video{max-width:100%}button,input,select,textarea{font:inherit}';
const HIDE = 'html{display:none!important}';
const PHRASING = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'button', 'sup', 'sub', 'code', 'time', 'legend', 'summary', 'caption', 'figcaption', 'dt', 'option']);
const KEEP_EXTRA = ['float', 'clear', 'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'background-image'];
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'data'];
/** Elements whose data: address opens a document that can run script, in the code kept for them. */
const FRAMED = new Set(['iframe', 'frame', 'object', 'embed']);

/** The page script and every handler or script link are left out of the measured copy; what is counted is said later. */
export function sanitize(source: Source): { doc: Document; css: string; scripted: number } {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${source.html}</body></html>`, 'text/html');
  const css = [source.css];
  for (const style of Array.from(doc.querySelectorAll('style'))) { css.push(style.textContent || ''); style.remove(); }
  doc.querySelectorAll('link, meta, base, title').forEach(node => node.remove());
  let scripted = 0;
  let index = 0;
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { el.removeAttribute(attr.name); scripted++; }
      else if (URL_ATTRS.includes(name) && /^\s*(javascript|vbscript):/i.test(attr.value)) { el.removeAttribute(attr.name); scripted++; if (name === 'href') el.setAttribute('data-fwk-link', ''); }
      else if (FRAMED.has(el.localName) && ['src', 'data'].includes(name) && /^\s*data:/i.test(attr.value)) { el.removeAttribute(attr.name); scripted++; }
      else if (['to', 'from', 'by', 'values'].includes(name) && /(javascript|vbscript):/i.test(attr.value)) { el.removeAttribute(attr.name); scripted++; }
      else if (name === 'srcdoc' || name.startsWith('data-fwk')) el.removeAttribute(attr.name);
    }
    if (doc.body.contains(el) && el !== doc.body) el.setAttribute('data-fwk-i', String(index++));
  }
  return { doc, css: css.filter(Boolean).join('\n'), scripted };
}

/** A reference the measuring frame may load: the site's own stored assets, or inline data. Nothing else, ever. */
function ownUrl(value: string, origin: string): boolean {
  const url = value.trim();
  if (/^data:/i.test(url) || url.startsWith('#')) return true;
  if (url.startsWith('/api/assets/')) return true;
  return url.startsWith(`${origin}/api/assets/`);
}

const escapeStyle = (css: string): string => css.replace(/<\/style/gi, '<\\/style');
const policy = (origin: string): string => `default-src 'none'; style-src 'unsafe-inline'; img-src ${origin}/api/assets/ data:; font-src 'none'; frame-src 'none'; form-action 'none'`;

function frameDocument(origin: string, css: string, body: string, bodyAttrs: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy(origin)}"><style>${escapeStyle(css)}</style><style>${HIDE}</style></head><body${bodyAttrs}>${body}</body></html>`;
}

/** A hidden, sandboxed frame with no scripts and no network beyond the site's own pictures; removed when done. */
async function openFrame(srcdoc: string, origin: string): Promise<{ doc: Document; frame: HTMLIFrameElement; close: () => void }> {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('csp', policy(origin));
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.referrerPolicy = 'no-referrer';
  frame.className = 'fw-convert-frame';
  const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.srcdoc = srcdoc;
  document.body.append(frame);
  await loaded;
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); throw new Error(t('The page could not be measured in this browser.')); }
  return { doc, frame, close: () => frame.remove() };
}

function read(view: Window, el: Element, names: readonly string[]): Record<string, string> {
  const style = view.getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const name of names) out[name] = style.getPropertyValue(name);
  return out;
}

function apply(el: Element, styles: Record<string, string>): void {
  const style = (el as HTMLElement).style;
  if (!style) return;
  for (const [name, value] of Object.entries(styles)) style.setProperty(name, value);
}

function serializeAttrs(el: Element): string {
  return Array.from(el.attributes).map(attr => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
}

interface Rules { responsive: number; effects: number; faces: FontFaceRule[] }

/** Rules come from the frame's own window, so their kind is read from the rule, not from this window's classes. */
const isStyle = (rule: CSSRule): rule is CSSStyleRule => rule.constructor.name === 'CSSStyleRule';
const isMedia = (rule: CSSRule): rule is CSSMediaRule => rule.constructor.name === 'CSSMediaRule';
const isFace = (rule: CSSRule): rule is CSSFontFaceRule => rule.constructor.name === 'CSSFontFaceRule';

function readRules(doc: Document): Rules {
  const found: Rules = { responsive: 0, effects: 0, faces: [] };
  const visit = (list: CSSRuleList, inMedia: boolean): void => {
    for (const rule of Array.from(list)) {
      if (isMedia(rule)) { found.responsive += Math.max(1, rule.cssRules.length); visit(rule.cssRules, true); }
      else if (isStyle(rule)) { if (!inMedia && /:(hover|focus|active)|::?(before|after)/.test(rule.selectorText)) found.effects++; }
      else if (isFace(rule)) found.faces.push({ family: rule.style.getPropertyValue('font-family'), src: rule.style.getPropertyValue('src'), weight: rule.style.getPropertyValue('font-weight'), style: rule.style.getPropertyValue('font-style') });
      else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) visit((rule as CSSGroupingRule).cssRules, inMedia);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try { visit(sheet.cssRules, false); } catch { /* a sheet the frame could not read is left out */ }
  }
  return found;
}

/** The page's stylesheet as text again, every selector kept inside the element `prefix` names. */
export function scopedCss(css: string, prefix: string): string {
  const imports = css.match(/@import\b[^;]*;/gi) || [];
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css.replace(/@import\b[^;]*;?/gi, ''));
  const out: string[] = [...imports];
  const visit = (list: CSSRuleList, into: string[]): void => {
    for (const rule of Array.from(list)) {
      if (isStyle(rule)) into.push(`${scopeSelector(rule.selectorText, prefix)}{${rule.style.cssText}}`);
      else if (isMedia(rule)) { const inner: string[] = []; visit(rule.cssRules, inner); into.push(`@media ${rule.conditionText}{${inner.join('')}}`); }
      else into.push(rule.cssText);
    }
  };
  visit(sheet.cssRules, out);
  return out.join('\n');
}

/** The measuring frame's height (`.fw-convert-frame` in convert.css), and the height it is read at a second time. */
const FRAME_H = 900, TALL = 1300;
const HEIGHTS = ['height', 'min-height', 'max-height'];
const round = (n: number): number => Math.round(n * 100) / 100;

/** A measured length that followed the frame's height, written in vh again (with a fixed part in calc() if it had one). */
function inVh(short: string, tall: string): string | null {
  const a = parseFloat(short), b = parseFloat(tall);
  if (!short.endsWith('px') || !tall.endsWith('px') || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 0.5) return null;
  const per = (b - a) * 100 / (TALL - FRAME_H), rest = a - per * FRAME_H / 100;
  if (Math.abs(rest) < 0.5) return `${round(per)}vh`;
  return `calc(${round(per)}vh ${rest < 0 ? '-' : '+'} ${round(Math.abs(rest))}px)`;
}

/**
 * Heights the page took from the window. The frame is measured with `html` hidden, so `100vh` reads as the frame's
 * 900 px and `height: 100%` stays a percentage that the element's new parent cannot resolve: the page collapsed to
 * its content, or kept 900 px on a taller canvas. Every written height that changes when the frame is made taller is
 * written in vh again, and a root whose height was a percentage of the window becomes a min-height in vh, with its
 * children's percentages of it, so the converted page fills the canvas and the preview as the original filled the
 * window.
 */
function fillWindow(view: Window, frame: HTMLIFrameElement, root: Record<string, string> | null, sized: [{ parent: string; styles: Record<string, string> }, Element][]): void {
  const doc = view.document;
  const entries: [Record<string, string>, Element][] = [...(root ? [[root, doc.body] as [Record<string, string>, Element]] : []), ...sized.map(([node, el]) => [node.styles, el] as [Record<string, string>, Element])]
    .filter(([styles]) => HEIGHTS.some(name => /px$|%$/.test(styles[name] || '')));
  if (!entries.length) return;
  const page = read(view, doc.documentElement, ['height']).height;
  const short = entries.map(([, el]) => read(view, el, HEIGHTS));
  frame.style.height = `${TALL}px`;
  void frame.offsetHeight;
  const tall = entries.map(([, el]) => read(view, el, HEIGHTS));
  const pageTall = read(view, doc.documentElement, ['height']).height;
  frame.style.height = '';
  entries.forEach(([styles], index) => {
    for (const name of HEIGHTS) {
      if (styles[name] !== short[index][name]) continue;
      const value = inVh(short[index][name], tall[index][name]);
      if (value) styles[name] = value;
    }
  });
  if (!root) return;
  const vhOf = (value: string | null | undefined): number => value && value.endsWith('vh') && !value.startsWith('calc') ? parseFloat(value) : NaN;
  const pageVh = page.endsWith('%') ? parseFloat(page) : vhOf(inVh(page, pageTall));
  if (!Number.isFinite(pageVh)) return;
  const share = (value: string | undefined, of: number): number => value?.endsWith('%') ? round(parseFloat(value) * of / 100) : NaN;
  const own = share(root.height, pageVh), least = share(root['min-height'], pageVh);
  const fill = Math.max(Number.isFinite(own) ? own : 0, Number.isFinite(least) ? least : 0);
  if (!fill) return;
  if (root.height?.endsWith('%')) delete root.height;
  if (!(vhOf(root['min-height']) >= fill)) root['min-height'] = `${fill}vh`;
  if (!Number.isFinite(own)) return;
  for (const [node] of sized) {
    if (node.parent !== '') continue;
    const child = Math.max(share(node.styles.height, own) || 0, share(node.styles['min-height'], own) || 0);
    if (!child) continue;
    if (node.styles.height?.endsWith('%')) delete node.styles.height;
    node.styles['min-height'] = `${child}vh`;
  }
}

export interface Kept { css: string; rules: number; all: boolean; over: number; clash: number }

/** How long checking which rules the converted elements use may take before every rule is kept unchecked. */
const MATCH_MS = 2000;
/** Added to a kept selector's subject so it cannot match a converted element (every element carries this attribute). */
const GUARD = ':where(:not([data-fw-node]))';
const GROUPS = new Set(['CSSMediaRule', 'CSSSupportsRule', 'CSSContainerRule', 'CSSLayerBlockRule']);
const kindOf = (rule: CSSRule): string => rule.constructor.name;

function groupHead(rule: CSSRule): string {
  const kind = kindOf(rule);
  if (kind === 'CSSMediaRule') return `@media ${(rule as CSSMediaRule).media.mediaText}`;
  if (kind === 'CSSSupportsRule') return `@supports ${(rule as CSSSupportsRule).conditionText}`;
  if (kind === 'CSSLayerBlockRule') return `@layer ${(rule as CSSLayerBlockRule).name}`.trim();
  const text = rule.cssText, at = text.indexOf('{');
  return at > 0 ? text.slice(0, at).trim() : '';
}

/**
 * The page's style rules kept for what its script builds. A selector is kept when it matched no converted element in
 * the measuring frame (the page as written, scripts not run), or when it did but its subject requires classes the
 * script names (the script may build more of them); the other selectors of a list are left out. Custom properties
 * of every rule stay, so kept rules still find their var() values. Each kept selector looks only inside the
 * converted root `tag` and is guarded so it cannot restyle a converted element. `@media`, `@supports`, `@container`
 * and `@layer` blocks keep only their kept rules, `@layer` statements only the layers kept blocks use, and `@import`
 * never stays (the browser's parse of a constructed sheet drops it). `@keyframes`, `@font-face` and `@property` reach
 * the whole page, so they stay only when a kept rule names them, and never take a name the site's own styles use
 * (`site`, lower case words): a clashing keyframes name gets the root's id as a suffix through the CSSOM, a clashing
 * font face or property is left out and counted. Parsing and serialising are the browser's, in the measuring
 * frame's realm; nothing is applied or fetched there.
 */
async function keepRules(view: Window, doc: Document, css: string, converted: Set<Element>, words: Set<string>, tag: string, site: Set<string>): Promise<Kept> {
  const Sheet = (view as unknown as { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet;
  const sheet = new Sheet(), scratch = new Sheet();
  const prefix = `[data-fw-node="${tag}"]`;
  const none: Kept = { css: '', rules: 0, all: false, over: 0, clash: 0 };
  let slice = performance.now();
  const breathe = async (): Promise<void> => { if (performance.now() - slice > 40) { await new Promise(resolve => setTimeout(resolve, 0)); slice = performance.now(); } };
  try { sheet.replaceSync(css); } catch { return none; }
  const styleRules: CSSStyleRule[] = [];
  const collect = (list: CSSRuleList): void => {
    for (let i = 0; i < list.length; i++) {
      const rule = list[i];
      if (isStyle(rule)) styleRules.push(rule);
      else if (GROUPS.has(kindOf(rule))) collect((rule as CSSGroupingRule).cssRules);
    }
  };
  collect(sheet.cssRules);
  if (!styleRules.length) return none;
  const used = (selector: string): boolean => {
    let found: NodeListOf<Element>;
    try { found = doc.querySelectorAll(selector); } catch { return false; }
    for (let i = 0; i < found.length; i++) if (converted.has(found[i])) return true;
    return false;
  };
  const lists = new Map<CSSStyleRule, string[]>();
  const keeps = new Map<CSSStyleRule, boolean[]>();
  const deadline = performance.now() + MATCH_MS;
  let all = false;
  for (const rule of styleRules) {
    const list = selectorList(rule.selectorText);
    lists.set(rule, list);
    const keep: boolean[] = [];
    for (const selector of list) {
      if (all) break;
      await breathe();
      if (performance.now() > deadline) { all = true; break; }
      const classes = subjectClasses(selector);
      keep.push(!used(selector) || (!!classes.length && classes.every(name => words.has(name))));
    }
    if (!all) keeps.set(rule, keep);
  }
  if (all) keeps.clear();
  const renamed = new Map<string, string>();
  for (let i = 0; i < sheet.cssRules.length; i++) {
    const rule = sheet.cssRules[i];
    if (kindOf(rule) !== 'CSSKeyframesRule' || !site.has((rule as CSSKeyframesRule).name.toLowerCase())) continue;
    const name = (rule as CSSKeyframesRule).name, fresh = `${name}-${tag}`;
    (rule as CSSKeyframesRule).name = fresh;
    renamed.set(name, fresh);
  }
  if (renamed.size) for (const rule of styleRules) {
    const names = rule.style.getPropertyValue('animation-name');
    if (!names) continue;
    const list = names.split(',').map(name => name.trim());
    if (list.some(name => renamed.has(name))) rule.style.setProperty('animation-name', list.map(name => renamed.get(name) || name).join(', '), rule.style.getPropertyPriority('animation-name'));
  }

  const encoder = new TextEncoder();
  let bytes = 0, rules = 0, over = 0;
  const valid = (text: string): boolean => { try { scratch.insertRule(text, 0); scratch.deleteRule(0); return true; } catch { return false; } };
  let full = false;
  const room = (text: string): boolean => {
    const size = encoder.encode(text).length + 1;
    if (rules >= KEEP_RULES || bytes + size > KEEP_BYTES) { full ||= rules >= KEEP_RULES || bytes > KEEP_BYTES - 256; return false; }
    bytes += size;
    return true;
  };
  const customsOf = (style: CSSStyleDeclaration): string[] => {
    const customs: string[] = [];
    for (let i = 0; i < style.length; i++) {
      const name = style.item(i);
      if (name.startsWith('--')) customs.push(`${name}:${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? ' !important' : ''}`);
    }
    return customs;
  };
  const styleTexts = (rule: CSSStyleRule): string[] => {
    const list = lists.get(rule)!, keep = keeps.get(rule) || list.map(() => true);
    const style = rule.style, scope = (selector: string): string => scopeSelector(selector, prefix);
    const customs = customsOf(style);
    const texts: string[] = [];
    if (customs.length) { const text = `${list.map(scope).join(', ')}{${customs.join(';')}}`; if (valid(text)) texts.push(text); }
    let kept = list.filter((selector, index) => keep[index] && !bodyQualified(selector)).map(scope).filter(selector => selector !== prefix).map(selector => guardSelector(selector, GUARD));
    const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
    const body = `{${style.cssText}${nested ? Array.from(nested).map(inner => inner.cssText).join('') : ''}}`;
    if (kept.length && !valid(kept.join(', ') + body)) kept = kept.filter(selector => valid(selector + body));
    if (kept.length && (style.length || nested?.length)) texts.push(kept.join(', ') + body);
    return texts;
  };
  const emit = async (list: CSSRuleList): Promise<string[]> => {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const rule = list[i];
      if (isStyle(rule)) {
        if (full) { if ((keeps.get(rule) || [true]).some(Boolean) || customsOf(rule.style).length) over++; continue; }
        await breathe();
        const texts = styleTexts(rule);
        if (!texts.length) continue;
        if (room(texts.join(''))) { out.push(...texts); rules++; } else over++;
      } else if (GROUPS.has(kindOf(rule))) {
        const inner = await emit((rule as CSSGroupingRule).cssRules), head = groupHead(rule);
        if (inner.length && head) { out.push(`${head}{${inner.join('\n')}}`); bytes += head.length + 2; if (kindOf(rule) === 'CSSLayerBlockRule') layers.add((rule as CSSLayerBlockRule).name); }
      }
    }
    return out;
  };
  const layers = new Set<string>();
  const body = await emit(sheet.cssRules);
  if (!body.length) return { ...none, over, all };
  const names = new Set<string>();
  scriptWords(body.join('\n').toLowerCase(), names, 200000);
  const named = (family: string, set: Set<string>): boolean => family.split(' ').every(word => set.has(word));
  const head: string[] = [];
  let clash = 0;
  for (let i = 0; i < sheet.cssRules.length; i++) {
    const rule = sheet.cssRules[i], kind = kindOf(rule);
    let text = rule.cssText;
    if (kind === 'CSSLayerStatementRule') {
      const list = Array.from((rule as CSSLayerStatementRule).nameList).filter(name => layers.has(name));
      if (!list.length) continue;
      text = `@layer ${list.join(', ')};`;
    } else if (kind === 'CSSPropertyRule') {
      const name = (rule as CSSPropertyRule).name.toLowerCase();
      if (!names.has(name)) continue;
      if (site.has(name)) { clash++; continue; }
    } else if (kind === 'CSSKeyframesRule') {
      if (!names.has((rule as CSSKeyframesRule).name.toLowerCase())) continue;
    } else if (kind === 'CSSFontFaceRule') {
      const list = families((rule as CSSFontFaceRule).style.getPropertyValue('font-family'));
      if (!list.some(family => named(family, names))) continue;
      if (list.some(family => named(family, site))) { clash++; continue; }
    } else continue;
    if (room(text)) head.push(text); else over++;
  }
  return { css: [...head, ...body].join('\n'), rules, all, over, clash };
}

/** The blocks a page too large for one conversion can be converted by, one at a time: its top-level elements. */
export function blocks(source: Source): { blocks: Block[]; total: number } {
  const { doc } = sanitize(source);
  const all = (el: Element): number => {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let count = 0;
    for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) if (node.nodeType === 1 || node.textContent!.trim()) count++;
    return count;
  };
  const list = Array.from(doc.body.children).map((el, index) => ({ index, label: layerName(el.tagName.toLowerCase(), { id: el.id, className: el.getAttribute('class') || '' }), count: all(el) }));
  return { blocks: list, total: list.reduce((sum, item) => sum + item.count, 0) };
}

/**
 * Measures the code section's HTML and CSS in two hidden frames (the page as written, and a bare copy built from the
 * new elements with only the export's base styles) and plans the elements: tags, own text, safe attributes and the
 * reduced base styles. Responsive rules, scripts and handlers are never measured or run.
 */
export async function measure(source: Source, options: Options, only?: number): Promise<Plan> {
  const started = performance.now();
  const { doc, css, scripted } = sanitize(source);
  const outcome = emptyOutcome();
  outcome.scripted = scripted;
  const frameBody = doc.body.cloneNode(true) as HTMLElement;
  for (const el of Array.from(frameBody.querySelectorAll('script'))) {
    const stub = doc.createElement('template');
    stub.setAttribute('data-fwk-i', el.getAttribute('data-fwk-i') || '');
    el.replaceWith(stub);
  }
  for (const el of Array.from(frameBody.querySelectorAll('*'))) {
    for (const name of ['src', 'srcset', 'poster', 'data', 'href', 'xlink:href', 'action', 'formaction', 'background']) {
      const value = el.getAttribute(name);
      if (value === null || (name === 'href' && el.tagName === 'A')) continue;
      if (name === 'srcset' || !ownUrl(value, options.origin)) el.removeAttribute(name);
    }
  }
  frameBody.querySelectorAll('[data-fwk-link]').forEach(el => el.setAttribute('href', '#'));
  const frameCss = css.replace(/@import\b[^;]*;?/gi, '').replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _quote, url: string) => ownUrl(url, options.origin) ? whole : 'url("about:invalid")');
  const [original, bare] = await Promise.all([
    openFrame(frameDocument(options.origin, frameCss, frameBody.innerHTML, serializeAttrs(frameBody) + (options.scope ? ` data-fw-node="${options.scope}"` : '')), options.origin),
    openFrame(frameDocument(options.origin, EXPORT_BASE, '', ''), options.origin)
  ]);
  try {
    const view = original.doc.defaultView!, bareView = bare.doc.defaultView!;
    const rules = readRules(original.doc);
    outcome.responsive = rules.responsive;
    outcome.effects = rules.effects;
    const sources = new Map<string, Element>();
    doc.querySelectorAll('[data-fwk-i]').forEach(el => sources.set(el.getAttribute('data-fwk-i')!, el));
    const nodes: Planned[] = [];
    const used = new Set<string>();
    const converted = new Set<Element>(), words = new Set<string>();
    let script: Planned | undefined;
    let serial = 0;
    const stem = `cv${Math.random().toString(36).slice(2, 7)}`;
    const fresh = (): string => { let id = `${stem}-${++serial}`; while (options.taken(id)) id = `${stem}-${++serial}`; return id; };
    const check = (depth: number): void => {
      if (nodes.length > options.limit) throw new TooLarge('count', nodes.length, options.limit);
      if (depth > options.depth) throw new TooLarge('depth', depth, options.depth);
      if ((performance.now() - started) / 1000 > options.seconds) throw new TooLarge('time', nodes.length, options.seconds);
    };
    /** Reduces until the bare twin measures like the original: a style set here (a font size) can move a default
     * that depends on it (a paragraph's 1em margin), so the twin is read again after each step. */
    const settle = (measured: Record<string, string>, twin: Element, forced: readonly string[]): Record<string, string> => {
      const first = reduceStyles(measured, read(bareView, twin, READ), forced);
      outcome.floats += first.floats;
      outcome.pictures += first.pictures;
      outcome.refused += first.refused;
      const own = { ...first.styles };
      apply(twin, own);
      for (let pass = 0; pass < 3; pass++) {
        const next = reduceStyles(measured, read(bareView, twin, READ), forced).styles;
        const extra = Object.fromEntries(Object.entries(next).filter(([name, value]) => own[name] !== value));
        if (!Object.keys(extra).length) break;
        Object.assign(own, extra);
        apply(twin, extra);
      }
      const styles = compact(own, measured);
      if (styles['font-family']) families(styles['font-family']).forEach(name => used.add(name));
      return styles;
    };

    /** Background pictures from the site's assets go behind the element's content as a picture element. */
    const backdrop = (measured: Record<string, string>, id: string, styles: Record<string, string>): void => {
      const found = backdropLayers(measured['background-image'] || '', measured['background-size'] || '', measured['background-position'] || '', options.origin);
      if (!found.layers.length) return;
      if (!found.dropped && found.layers.some(layer => layer.kind === 'picture')) outcome.pictures--;
      if (!styles.position && measured.position === 'static') styles.position = 'relative';
      styles.isolation = 'isolate';
      const behind = { position: 'absolute', inset: '0', 'z-index': '-1' };
      for (const layer of found.layers) nodes.push(layer.kind === 'picture'
        ? { id: fresh(), parent: id, tag: 'img', name: 'Background picture', text: '', attrs: { src: layer.src, alt: '' }, styles: { ...behind, width: '100%', height: '100%', 'max-width': 'none', 'object-fit': layer.fit, 'object-position': layer.position } }
        : { id: fresh(), parent: id, tag: 'div', name: 'Background', text: '', attrs: {}, styles: { ...behind, 'background-image': layer.image } });
    };

    const rootMeasured = read(view, original.doc.body, READ);
    if (/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(rootMeasured['background-color'])) {
      const page = read(view, original.doc.documentElement, ['background-color']);
      rootMeasured['background-color'] = page['background-color'];
    }
    const rootStyles = settle(rootMeasured, bare.doc.body, ROOT_FORCED);
    const sized: [{ parent: string; styles: Record<string, string> }, Element][] = [];

    const keptHtml = (from: Element, frameEl: Element, bareParent: Element): string => {
      const copy = from.cloneNode(true) as Element;
      converted.add(frameEl);
      frameEl.querySelectorAll('*').forEach(el => converted.add(el));
      const pairs: [Element, Element, Element][] = [];
      const twin = bare.doc.importNode(frameEl, true) as Element;
      twin.removeAttribute('style');
      twin.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
      bareParent.append(twin);
      const walkPairs = (a: Element, b: Element, c: Element): void => {
        pairs.push([a, b, c]);
        const ac = Array.from(a.children), bc = Array.from(b.children), cc = Array.from(c.children);
        for (let i = 0; i < Math.min(ac.length, bc.length, cc.length); i++) walkPairs(ac[i], bc[i], cc[i]);
      };
      walkPairs(copy, frameEl, twin);
      const names = [...READ, ...KEEP_EXTRA];
      for (const [target, measuredEl, bareEl] of pairs) {
        const measured = read(view, measuredEl, names), baseline = read(bareView, bareEl, names);
        const diff: Record<string, string> = {};
        for (const name of names) if (measured[name] && measured[name] !== baseline[name]) diff[name] = measured[name];
        apply(bareEl, diff);
        const text = Object.entries(diff).map(([name, value]) => `${name}:${value}`).join(';');
        if (text) target.setAttribute('style', text); else target.removeAttribute('style');
        target.removeAttribute('data-fwk-i');
        target.removeAttribute('data-fwk-link');
      }
      twin.remove();
      return copy.outerHTML;
    };

    const keep = (part: Part, from: Element, frameEl: Element, parent: string, bareParent: Element, parentTag: string): void => {
      if (part === 'script' && !options.keepScript) return;
      const html = part === 'script' ? (() => { const copy = from.cloneNode(true) as Element; copy.removeAttribute('data-fwk-i'); return copy.outerHTML; })() : keptHtml(from, frameEl, bareParent);
      outcome.parts[part] = (outcome.parts[part] || 0) + 1;
      nodes.push({ id: fresh(), parent, tag: PHRASING.has(parentTag) ? 'span' : 'div', name: part === 'script' ? 'Script' : `Code ${from.tagName.toLowerCase()}`, text: '', attrs: {}, styles: { display: 'contents' }, code: { enabled: true, html } });
      if (part === 'script') { script ??= nodes[nodes.length - 1]; scriptWords(from.textContent || '', words); }
    };

    const gather = (frameParent: Element, runs: Run<Element>[]): void => {
      for (const child of Array.from(frameParent.childNodes)) {
        if (child.nodeType === 3) { runs.push({ text: child.textContent || '' }); continue; }
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const from = sources.get(el.getAttribute('data-fwk-i') || '');
        const rule = mapTag(from ? from.tagName : el.tagName);
        if (rule.kind === 'drop') continue;
        if (rule.kind === 'unwrap') { gather(el, runs); continue; }
        runs.push({ el, inline: /^inline/.test(view.getComputedStyle(el).display) });
      }
    };

    const children = (frameEl: Element, bareEl: Element, parent: string, tag: string, depth: number): void => {
      check(depth);
      if (VOID_TAGS.has(tag)) return;
      const style = view.getComputedStyle(frameEl);
      const runs: Run<Element>[] = [];
      gather(frameEl, runs);
      const arranged = arrange(runs, { pre: /^pre|break-spaces/.test(style.whiteSpace), block: !/^inline/.test(style.display), boxed: /flex|grid/.test(style.display) });
      const own = nodes.find(node => node.id === parent);
      if (own && !['textarea'].includes(tag)) own.text = arranged.text;
      else if (!own && arranged.text) nodes.push({ id: fresh(), parent, tag: 'span', name: 'Text', text: arranged.text, attrs: {}, styles: {} });
      if (tag === 'textarea' || tag === 'option') { if (own) own.text = frameEl.textContent || ''; return; }
      for (const item of arranged.children) {
        check(depth);
        if ('text' in item) { nodes.push({ id: fresh(), parent, tag: 'span', name: 'Text', text: item.text, attrs: {}, styles: {} }); continue; }
        const el = item.el;
        const from = sources.get(el.getAttribute('data-fwk-i') || '') || el;
        const rule = mapTag(from.tagName);
        if (rule.kind === 'keep') { keep(rule.part, from, el, parent, bareEl, tag); continue; }
        if (rule.kind !== 'node') continue;
        const carried = carryAttrs(rule.tag, Array.from(from.attributes).filter(attr => attr.name !== 'data-fwk-i'));
        outcome.refused += carried.dropped;
        const twin = bare.doc.createElement(rule.tag);
        for (const [name, value] of Object.entries(carried.attrs)) if (!['href', 'src', 'srcset', 'poster', 'action', 'id'].includes(name)) twin.setAttribute(name, value);
        bareEl.append(twin);
        const measured = read(view, el, READ);
        const styles = settle(measured, twin, rule.tag === 'a' ? LINK_FORCED : []);
        const id = fresh();
        converted.add(el);
        nodes.push({ id, parent, tag: rule.tag, name: layerName(rule.tag, { id: from.id, className: from.getAttribute('class') || '' }), text: '', attrs: carried.attrs, styles });
        sized.push([nodes[nodes.length - 1], el]);
        if (!VOID_TAGS.has(rule.tag)) backdrop(measured, id, styles);
        children(el, twin, id, rule.tag, depth + 1);
      }
    };

    const ROOT = '';
    const top = only === undefined ? original.doc.body : original.doc.body.children[only];
    if (!top) throw new Error(t('That part of the page is no longer there.'));
    if (only === undefined) { converted.add(top); backdrop(rootMeasured, ROOT, rootStyles); children(original.doc.body, bare.doc.body, ROOT, 'body', 1); }
    else {
      const from = sources.get(top.getAttribute('data-fwk-i') || '') || top;
      const rule = mapTag(from.tagName);
      if (rule.kind !== 'node') throw new Error(t('That part of the page cannot become elements; it stays as code.'));
      const carried = carryAttrs(rule.tag, Array.from(from.attributes).filter(attr => attr.name !== 'data-fwk-i'));
      const twin = bare.doc.createElement(rule.tag);
      bare.doc.body.append(twin);
      const measured = read(view, top, READ);
      const styles = settle(measured, twin, rule.tag === 'a' ? LINK_FORCED : []);
      const id = fresh();
      converted.add(top);
      nodes.push({ id, parent: ROOT, tag: rule.tag, name: layerName(rule.tag, { id: from.id, className: from.getAttribute('class') || '' }), text: '', attrs: carried.attrs, styles });
      sized.push([nodes[nodes.length - 1], top]);
      if (!VOID_TAGS.has(rule.tag)) backdrop(measured, id, styles);
      children(top, twin, id, rule.tag, 2);
    }
    if (only === undefined && options.keepScript && source.js.trim()) {
      outcome.parts.script = (outcome.parts.script || 0) + 1;
      nodes.push({ id: fresh(), parent: ROOT, tag: 'div', name: 'Page script', text: '', attrs: {}, styles: { display: 'contents' }, code: { enabled: true, html: '', js: source.js, ...(source.module ? { module: true } : {}) } });
      script = nodes[nodes.length - 1];
      scriptWords(source.js, words);
    }
    fillWindow(view, original.frame, only === undefined ? rootStyles : null, sized);
    const scope = only === undefined ? options.scope : nodes.find(node => node.parent === ROOT)?.id;
    const hostScript = only !== undefined && options.keepScript && !!source.js.trim();
    if (hostScript) scriptWords(source.js, words);
    let keptCss = '';
    if ((script?.code || hostScript) && scope) {
      const kept = await keepRules(view, original.doc, css, converted, words, scope, options.siteNames || new Set());
      if (kept.css && script?.code) script.code.css = kept.css;
      else keptCss = kept.css;
      outcome.kept = kept.rules;
      outcome.keptAll = kept.all ? kept.rules : 0;
      outcome.keptOver = kept.over;
      outcome.keptClash = kept.clash;
    }
    outcome.converted = nodes.filter(node => !node.code).length;
    if (rootStyles['font-family']) families(rootStyles['font-family']).forEach(name => used.add(name));
    const fonts = pickFonts(rules.faces, used, options.fonts);
    const changed = JSON.stringify(fonts) !== JSON.stringify(options.fonts);
    const rest = only === undefined ? undefined : { ...split(source.html, only), css: scopedCss(css, `[data-fw-node="${SCOPE}"]`), kept: keptCss };
    return { rootStyles, nodes, fonts: changed ? fonts : null, outcome, rest };
  } finally {
    original.close();
    bare.close();
  }
}
