import { arrange, carryAttrs, compact, emptyOutcome, families, layerName, LINK_FORCED, mapTag, pickFonts, READ, reduceStyles, ROOT_FORCED, scopeSelector, VOID_TAGS, type FontFaceRule, type Outcome, type Part, type Run, type SiteFont } from './rules';
import { t } from '../../i18n';

export interface Source { html: string; css: string; js: string; module: boolean }
export interface Planned { id: string; parent: string; tag: string; name: string; text: string; attrs: Record<string, string>; styles: Record<string, string>; code?: { enabled: true; html: string; js?: string; module?: boolean } }
export interface Plan { rootStyles: Record<string, string>; nodes: Planned[]; fonts: Record<string, SiteFont> | null; outcome: Outcome; rest?: { before: string; after: string; css: string } }
export interface Options { origin: string; keepScript: boolean; fonts: Record<string, SiteFont>; taken: (id: string) => boolean; limit: number; depth: number; seconds: number; scope?: string }

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

export class TooLarge extends Error {
  constructor(readonly reason: 'count' | 'depth' | 'time', readonly count: number, readonly limit: number) { super(reason); }
}

/** The styles the exported page starts from (formweb-export stylesheet), so a baseline matches what visitors get. */
const EXPORT_BASE = '*{box-sizing:border-box}body{margin:0}img,video{max-width:100%}button,input,select,textarea{font:inherit}';
const HIDE = 'html{display:none!important}';
const PHRASING = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'strong', 'em', 'b', 'i', 'small', 'label', 'button', 'sup', 'sub', 'code', 'time', 'legend', 'summary', 'caption', 'figcaption', 'dt', 'option']);
const KEEP_EXTRA = ['float', 'clear', 'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'background-image'];
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'data'];

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
async function openFrame(srcdoc: string, origin: string): Promise<{ doc: Document; close: () => void }> {
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
  return { doc, close: () => frame.remove() };
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

    const rootMeasured = read(view, original.doc.body, READ);
    if (/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(rootMeasured['background-color'])) {
      const page = read(view, original.doc.documentElement, ['background-color']);
      rootMeasured['background-color'] = page['background-color'];
    }
    const rootStyles = settle(rootMeasured, bare.doc.body, ROOT_FORCED);

    const keptHtml = (from: Element, frameEl: Element, bareParent: Element): string => {
      const copy = from.cloneNode(true) as Element;
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
        const styles = settle(read(view, el, READ), twin, rule.tag === 'a' ? LINK_FORCED : []);
        const id = fresh();
        nodes.push({ id, parent, tag: rule.tag, name: layerName(rule.tag, { id: from.id, className: from.getAttribute('class') || '' }), text: '', attrs: carried.attrs, styles });
        children(el, twin, id, rule.tag, depth + 1);
      }
    };

    const ROOT = '';
    const top = only === undefined ? original.doc.body : original.doc.body.children[only];
    if (!top) throw new Error(t('That part of the page is no longer there.'));
    if (only === undefined) children(original.doc.body, bare.doc.body, ROOT, 'body', 1);
    else {
      const from = sources.get(top.getAttribute('data-fwk-i') || '') || top;
      const rule = mapTag(from.tagName);
      if (rule.kind !== 'node') throw new Error(t('That part of the page cannot become elements; it stays as code.'));
      const carried = carryAttrs(rule.tag, Array.from(from.attributes).filter(attr => attr.name !== 'data-fwk-i'));
      const twin = bare.doc.createElement(rule.tag);
      bare.doc.body.append(twin);
      const styles = settle(read(view, top, READ), twin, rule.tag === 'a' ? LINK_FORCED : []);
      const id = fresh();
      nodes.push({ id, parent: ROOT, tag: rule.tag, name: layerName(rule.tag, { id: from.id, className: from.getAttribute('class') || '' }), text: '', attrs: carried.attrs, styles });
      children(top, twin, id, rule.tag, 2);
    }
    if (only === undefined && options.keepScript && source.js.trim()) {
      outcome.parts.script = (outcome.parts.script || 0) + 1;
      nodes.push({ id: fresh(), parent: ROOT, tag: 'div', name: 'Page script', text: '', attrs: {}, styles: { display: 'contents' }, code: { enabled: true, html: '', js: source.js, ...(source.module ? { module: true } : {}) } });
    }
    outcome.converted = nodes.filter(node => !node.code).length;
    if (rootStyles['font-family']) families(rootStyles['font-family']).forEach(name => used.add(name));
    const fonts = pickFonts(rules.faces, used, options.fonts);
    const changed = JSON.stringify(fonts) !== JSON.stringify(options.fonts);
    const rest = only === undefined ? undefined : { ...split(source.html, only), css: scopedCss(css, `[data-fw-node="${SCOPE}"]`) };
    return { rootStyles, nodes, fonts: changed ? fonts : null, outcome, rest };
  } finally {
    original.close();
    bare.close();
  }
}
