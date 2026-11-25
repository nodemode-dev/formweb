import type { Collection, Page, Site } from '../types';
import { t } from '../i18n';

type ItemContext = { collection: string; item: Collection['items'][number]; ids: Record<string, string>; suffix: string };

const allowedTags = new Set(['div', 'main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'img', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'strong', 'em', 'small', 'b', 'i', 'br', 'hr', 'form', 'label', 'input', 'textarea', 'select', 'option', 'fieldset', 'legend', 'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'time', 'code', 'pre', 'sup', 'sub', 'tfoot', 'video', 'audio', 'source', 'wbr', 'svg', 'g', 'path', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'textPath', 'symbol', 'use', 'pattern', 'tspan', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const vectorTags = new Set(['svg', 'g', 'path', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'textPath', 'symbol', 'use', 'pattern', 'tspan', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const vectorAttributes = new Set(['d', 'viewBox', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'transform', 'vector-effect', 'opacity', 'visibility',
  'clip-path', 'mask', 'paint-order', 'clip-rule', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'x', 'y', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
  'clipPathUnits', 'maskUnits', 'maskContentUnits', 'patternUnits', 'patternTransform', 'font-size', 'font-family', 'font-weight', 'letter-spacing', 'text-anchor', 'startOffset', 'dy', 'dx', 'points', 'rx', 'ry']);
const referenceAttributes = new Set(['fill', 'stroke', 'clip-path', 'mask']);
function safeVectorValue(name: string, content: string): boolean {
  if (/^url\(#[A-Za-z0-9_-]{1,64}\)$/.test(content)) return referenceAttributes.has(name);
  return !/url\(|javascript:|[<>]/i.test(content);
}
const voidTags = new Set(['img', 'input', 'source', 'hr', 'br', 'wbr']);
const allowedAttributes = new Set(['id', 'class', 'title', 'role', 'href', 'src', 'alt', 'target', 'rel', 'type', 'name', 'value', 'placeholder', 'required', 'checked', 'disabled', 'multiple', 'selected', 'min', 'max', 'step', 'pattern', 'minlength', 'maxlength', 'autocomplete', 'for', 'loading', 'width', 'height', 'tabindex', 'open', 'datetime', 'colspan', 'rowspan', 'scope', 'controls', 'muted', 'loop', 'poster', 'preload', 'accept', 'playsinline', 'decoding', 'fetchpriority', 'srcset', 'sizes', 'hidden']);
function safeUrl(url: string): boolean {
  return !/^\/\//.test(url) && !/[\\<>"'\u0000-\u001f]/.test(url) && (/^(?:https?:\/\/|mailto:|tel:)/i.test(url) || !url.split(/[/?#]/)[0].includes(':'));
}
function safeStyle(name: string, content: string): boolean { return /^(?:--)?[a-zA-Z][\w-]*$/.test(name) && !/expression|javascript:|@import|url\(|[<>]/i.test(content); }
function cssName(name: string): string { return name.startsWith('--') ? name : name.replace(/[A-Z]/g, match => '-' + match.toLowerCase()); }
function subtreeIds(site: Site, root: string): Set<string> {
  const found = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const node = site.nodes[pending.pop()!];
    if (!node) continue;
    if (node.attrs.id) found.add(node.attrs.id);
    pending.push(...node.children);
  }
  return found;
}
function scopedFragment(url: string, ids: Record<string, string>): string {
  return url.startsWith('#') && ids[url.slice(1)] ? '#' + ids[url.slice(1)] : url;
}
const REVEAL_MS = 2000;
const REVEAL_MARGIN = 24;
function shift(start: number, end: number, low: number, high: number, center: boolean): number {
  const room = high - low;
  if (room <= 0) return 0;
  const margin = Math.min(REVEAL_MARGIN, Math.max(0, (room - (end - start)) / 2));
  if (center) return end - start + 2 * margin > room ? start - low - margin : (start + end - low - high) / 2;
  if (start >= low && end <= high) return 0;
  return start < low || end - start + margin > room ? start - low - margin : end - high + margin;
}

export class Canvas {
  readonly frame: HTMLIFrameElement;
  readonly outer: HTMLElement;
  readonly shell: HTMLElement;
  readonly label: HTMLElement;
  private doc?: Document;
  private nodes = new Map<string, HTMLElement>();
  private attrs = new Map<string, Set<string>>();
  private styles = new Map<string, Set<string>>();
  private textNodes = new Map<string, HTMLSpanElement>();
  private imageSources = new Map<string, string>();
  private scopes = new Map<string, Record<string, string>>();
  private last?: { site: Site; page: Page; selected: string; width: number; locale: string; scope: string };
  private scale = 1;
  private height = 860;
  private width = 1280;
  private ready: Promise<void>;
  private themeMode = '';
  private tokenOverride: Record<string, string> = {};
  private tokenNames = new Set<string>();
  private faceCss = '';
  private faceStyle?: HTMLStyleElement;
  private motionFrame: Record<string, Record<string, string>> | null = null;
  private posters: Record<string, string> = {};
  private posterLights: Record<string, string> = {};
  private posterNodes = new Map<string, HTMLElement>();
  private marked = new Set<string>();

  mark(ids: readonly string[]): void {
    this.marked = new Set(ids.length > 1 ? ids : []);
  }

  setMotionFrame(frame: Record<string, Record<string, string>> | null): void {
    const next = frame && Object.keys(frame).length ? frame : null;
    if (JSON.stringify(next) === JSON.stringify(this.motionFrame)) return;
    this.motionFrame = next;
    if (this.last) this.render(this.last.site, this.last.page, this.last.selected, this.last.width, this.last.locale, this.last.scope);
  }

  setPosters(posters: Record<string, string>, lights: Record<string, string> = {}): void {
    if (JSON.stringify(Object.entries(posters)) === JSON.stringify(Object.entries(this.posters)) && JSON.stringify(Object.entries(lights)) === JSON.stringify(Object.entries(this.posterLights))) return;
    this.posters = { ...posters };
    this.posterLights = { ...lights };
    if (this.last) this.render(this.last.site, this.last.page, this.last.selected, this.last.width, this.last.locale, this.last.scope);
  }

  private syncPoster(node: HTMLElement, key: string, id: string, tag: string): void {
    const doc = this.doc;
    if (!doc) return;
    const dark = Object.prototype.hasOwnProperty.call(this.posters, id) ? this.posters[id] : undefined;
    const light = this.themeMode === 'light' && dark !== undefined && this.posterLights[id] && safeUrl(this.posterLights[id]) ? this.posterLights[id] : '';
    const url = light || dark;
    const wanted = url === undefined || vectorTags.has(tag) || (url !== '' && !safeUrl(url)) ? '' : url === '' ? 'div' : 'img';
    let poster = this.posterNodes.get(key);
    if (poster && poster.localName !== wanted) { poster.remove(); this.posterNodes.delete(key); poster = undefined; }
    if (!wanted) return;
    if (!poster) {
      poster = doc.createElement(wanted);
      poster.setAttribute('data-fw-poster', '');
      this.posterNodes.set(key, poster);
      if (wanted === 'img') {
        poster.setAttribute('alt', '');
        poster.setAttribute('decoding', 'async');
        poster.setAttribute('draggable', 'false');
        poster.setAttribute('style', 'display:block;width:100%;height:100%;object-fit:cover;pointer-events:none');
      } else {
        poster.setAttribute('style', 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:48px;outline:1px dashed color-mix(in srgb, currentColor 40%, transparent);outline-offset:-1px;font-size:12px;pointer-events:none');
        poster.textContent = t('Component');
      }
    }
    if (wanted === 'img' && poster.getAttribute('src') !== url) poster.setAttribute('src', url!);
    if (poster.parentNode !== node || node.lastChild !== poster) node.append(poster);
  }

  /* Parent-side appearance for the canvas document: the theme being previewed (data-theme and that theme's token
     values) and the site's self-hosted font faces. No script runs inside the canvas. */
  setAppearance(mode: string, overrides: Record<string, string>, faces: string, rerender: boolean): void {
    const same = mode === this.themeMode && faces === this.faceCss && JSON.stringify(overrides) === JSON.stringify(this.tokenOverride);
    this.themeMode = mode;
    this.tokenOverride = overrides;
    this.faceCss = faces;
    if (same || !rerender || !this.last) return;
    this.render(this.last.site, this.last.page, this.last.selected, this.last.width, this.last.locale, this.last.scope);
  }

  constructor(private stage: HTMLElement, private onSelect: (id: string, event?: MouseEvent) => void, private onText: (id: string, text: string) => void) {
    this.outer = document.createElement('div');
    this.outer.className = 'frame-outer';
    this.label = document.createElement('div');
    this.label.className = 'frame-label';
    this.label.append(document.createElement('span'), document.createElement('span'));
    this.shell = document.createElement('div');
    this.shell.className = 'frame-shell';
    this.frame = document.createElement('iframe');
    this.frame.className = 'canvas-frame';
    this.frame.title = 'Website canvas';
    // WebKit runs no event listener, not even the editor's, in a frame sandboxed without scripts. The document's CSP blocks every script, and the frame never leaves that document: links carry data-fw-href, forms are refused, and bindEvents cancels any navigation.
    this.frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    this.shell.append(this.frame);
    this.outer.append(this.label, this.shell);
    stage.append(this.outer);
    this.ready = new Promise(resolve => {
      this.frame.addEventListener('load', () => {
        this.doc = this.frame.contentDocument || undefined;
        if (this.doc) this.bindEvents(this.doc);
        if (this.last) this.render(this.last.site, this.last.page, this.last.selected, this.last.width, this.last.locale, this.last.scope);
        resolve();
      }, { once: true });
    });
    this.frame.srcdoc = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data: blob:; media-src https: http: blob:; style-src \'unsafe-inline\'; font-src data: http: https:; form-action \'none\'"><style>*{box-sizing:border-box;scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}html,body{margin:0;min-height:100%}html{color-scheme:light}body{color:CanvasText;background:Canvas}button,input,select,textarea{font:inherit}img,video{max-width:100%}[data-fw-selected],[data-fw-marked]{outline:2px solid #f97316!important;outline-offset:2px}[data-fw-marked]{outline-style:dashed!important}[data-fw-reveal]{animation:fwReveal .5s ease-in-out 4 alternate}@keyframes fwReveal{from{outline-offset:2px}to{outline-offset:10px}}@media (prefers-reduced-motion:reduce){[data-fw-reveal]{animation:none;outline-offset:6px}}[data-fw-id]:hover{cursor:default}[data-fw-text][contenteditable=true]{outline:1px dashed #f97316;min-width:1em;display:inline-block}a{color:inherit}a[data-fw-href]{text-decoration:underline}a,button{cursor:default}input,textarea,select{max-width:100%}html[data-theme=dark] [data-fw-theme-only=light],html[data-theme=light] [data-fw-theme-only=dark],html:not([data-theme]) [data-fw-theme-only=light],body>[hidden]{display:none!important}</style></head><body></body></html>';
    new ResizeObserver(() => this.fit()).observe(stage);
  }

  async loaded(): Promise<void> { return this.ready; }

  reveal(id: string): void {
    const target = this.find(id);
    if (!target) return;
    this.bringInto(target, true);
    if (this.pulse) { window.clearTimeout(this.pulse.timer); this.pulse.node.removeAttribute('data-fw-reveal'); }
    void target.offsetWidth;
    target.setAttribute('data-fw-reveal', '');
    const timer = window.setTimeout(() => { target.removeAttribute('data-fw-reveal'); this.pulse = undefined; }, REVEAL_MS);
    this.pulse = { node: target, timer };
  }

  bring(id: string): void {
    const target = this.find(id);
    if (target) this.bringInto(target, false);
  }

  private pulse?: { node: HTMLElement; timer: number };

  private find(id: string): HTMLElement | undefined {
    if (!this.doc) return undefined;
    return [...this.doc.querySelectorAll<HTMLElement>(`[data-fw-id="${CSS.escape(id)}"]`)].find(node => node.getClientRects().length > 0);
  }

  private bringInto(target: HTMLElement, center: boolean): void {
    const view = this.doc?.defaultView;
    if (!view) return;
    const frame = this.frame.getBoundingClientRect(), stage = this.stage.getBoundingClientRect(), box = target.getBoundingClientRect();
    const top = Math.max(0, (stage.top - frame.top) / this.scale), bottom = Math.min(view.innerHeight, (stage.bottom - frame.top) / this.scale);
    const left = Math.max(0, (stage.left - frame.left) / this.scale), right = Math.min(view.innerWidth, (stage.right - frame.left) / this.scale);
    const dy = shift(box.top, box.bottom, top, bottom, center), dx = shift(box.left, box.right, left, right, center);
    if (dy || dx) view.scrollBy({ top: dy, left: dx, behavior: view.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // The width only sizes the frame. The styles drawn are those of `scope`, the breakpoint the person picked from the list; the width is never used to choose them.
  render(site: Site, page: Page, selected: string, width: number, locale: string, scope: string): void {
    this.last = { site, page, selected, width, locale, scope };
    this.width = width;
    if (!this.doc) return;
    if (this.doc.documentElement.lang !== locale) this.doc.documentElement.lang = locale;
    if (this.themeMode) { if (this.doc.documentElement.dataset.theme !== this.themeMode) this.doc.documentElement.dataset.theme = this.themeMode; }
    else if (this.doc.documentElement.hasAttribute('data-theme')) this.doc.documentElement.removeAttribute('data-theme');
    if (this.faceCss || this.faceStyle) {
      if (!this.faceStyle) { this.faceStyle = this.doc.createElement('style'); this.doc.head.append(this.faceStyle); }
      if (this.faceStyle.textContent !== this.faceCss) this.faceStyle.textContent = this.faceCss;
    }
    const names = new Set<string>();
    for (const [name, content] of Object.entries({ ...site.tokens, ...this.tokenOverride })) {
      const property = name.startsWith('--') ? name : '--' + name;
      if (safeStyle(name.replace(/^--/, ''), content)) { this.doc.documentElement.style.setProperty(property, content); names.add(property); }
    }
    for (const property of this.tokenNames) if (!names.has(property)) this.doc.documentElement.style.removeProperty(property);
    this.tokenNames = names;
    const visited = new Set<string>();
    const root = this.patch(site, page.root, selected, scope, locale, visited);
    if (root && root.parentNode !== this.doc.body) this.doc.body.append(root);
    const pageIds = new Set<string>();
    const collect = (id: string): void => {
      if (pageIds.has(id)) return;
      pageIds.add(id);
      site.nodes[id]?.children.forEach(collect);
    };
    collect(page.root);
    for (const [key, node] of this.nodes) {
      const id = node.dataset.fwId!;
      if (!site.nodes[id] || (pageIds.has(id) && !visited.has(key))) {
        node.remove(); this.nodes.delete(key); this.textNodes.delete(key); this.attrs.delete(key); this.styles.delete(key); this.posterNodes.delete(key);
      } else if (node.parentNode === this.doc.body) node.hidden = node !== root;
    }
    if (root) root.hidden = false;
    this.foreignSymbols(site, page.root);
    this.label.children[0].textContent = page.name;
    this.fit();
  }

  /* Symbols are shared across the site: a `use` on this page may point at a symbol defined on another page, which
     may never have been drawn here. Copies of those symbols live in one hidden svg, rebuilt only when they change,
     as the exporter does for published pages. */
  private foreignKey = '';
  private foreignHost: SVGSVGElement | null = null;

  private foreignSymbols(site: Site, root: string): void {
    if (!this.doc) return;
    const used = new Set<string>(), local = new Set<string>();
    const walk = (id: string, depth: number): void => {
      const node = site.nodes[id];
      if (!node || depth > 100) return;
      if (node.tag === 'use' && node.attrs.href) used.add(node.attrs.href.replace(/^#/, ''));
      if (node.tag === 'symbol' && node.attrs.id) local.add(node.attrs.id);
      node.children.forEach(child => walk(child, depth + 1));
    };
    walk(root, 0);
    const wanted = [...used].filter(id => !local.has(id)).map(id => Object.values(site.nodes).find(n => n.tag === 'symbol' && n.attrs.id === id)).filter((n): n is NonNullable<typeof n> => !!n);
    const dump = (id: string, depth: number): unknown => { const n = site.nodes[id]; return n && depth < 60 ? [n.tag, n.attrs, n.text, n.children.map(c => dump(c, depth + 1))] : null; };
    const key = JSON.stringify(wanted.map(n => dump(n.id, 0)));
    if (key === this.foreignKey) return;
    this.foreignKey = key;
    const NS = 'http://www.w3.org/2000/svg';
    if (!this.foreignHost) {
      this.foreignHost = this.doc.createElementNS(NS, 'svg');
      this.foreignHost.setAttribute('aria-hidden', 'true');
      this.foreignHost.setAttribute('width', '0');
      this.foreignHost.setAttribute('height', '0');
      this.foreignHost.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      this.doc.body.prepend(this.foreignHost);
    }
    const build = (id: string, depth: number): Element | null => {
      const n = site.nodes[id];
      if (!n || depth > 60) return null;
      const el = this.doc!.createElementNS(NS, n.tag);
      for (const [name, value] of Object.entries(n.attrs)) if (!/^on/i.test(name)) el.setAttribute(name, value);
      if (n.tag === 'symbol') el.setAttribute('overflow', 'visible');
      if (n.text && (n.tag === 'tspan' || n.tag === 'textPath')) el.textContent = n.text;
      n.children.forEach(c => { const child = build(c, depth + 1); if (child) el.append(child); });
      return el;
    };
    const defs = this.doc.createElementNS(NS, 'defs');
    wanted.forEach(n => { const el = build(n.id, 0); if (el) defs.append(el); });
    this.foreignHost.replaceChildren(defs);
  }

  private patch(site: Site, id: string, selected: string, scope: string, locale: string, visited: Set<string>, context?: ItemContext, skipRepeat = false): HTMLElement | undefined {
    const data = site.nodes[id];
    if (!this.doc || !data) return;
    const suffix = context?.suffix || '';
    const key = id + suffix;
    if (data.binding && !data.binding.field && !skipRepeat) {
      const listKey = key + ':list';
      if (visited.has(listKey)) return;
      visited.add(listKey);
      let list = this.nodes.get(listKey);
      if (!list) {
        list = this.doc.createElement('div');
        list.dataset.fwId = id;
        list.dataset.fwKey = listKey;
        list.style.display = 'contents';
        this.nodes.set(listKey, list);
      }
      const rendered = new Set<HTMLElement>();
      let previous: HTMLElement | null = null;
      const collection = site.collections[data.binding.collection];
      for (const item of collection?.items.filter(item => item.status === 'published') || []) {
        const segment = `-${collection.id}-${item.id}`;
        const ids = { ...context?.ids };
        for (const htmlId of subtreeIds(site, id)) ids[htmlId] = (ids[htmlId] || htmlId) + segment;
        const child = this.patch(site, id, selected, scope, locale, visited, { collection: collection.id, item, ids, suffix: suffix + segment }, true);
        if (!child) continue;
        const desired: ChildNode | null = previous ? previous.nextSibling : list.firstChild;
        if (child !== desired) list.insertBefore(child, desired);
        previous = child;
        rendered.add(child);
      }
      for (const child of Array.from(list.children)) if (!rendered.has(child as HTMLElement)) child.remove();
      return list;
    }
    if (visited.has(key)) return;
    visited.add(key);
    const tag = allowedTags.has(data.tag) ? data.tag : allowedTags.has(data.tag.toLowerCase()) ? data.tag.toLowerCase() : 'div';
    let node = this.nodes.get(key);
    if (!node || node.localName !== tag) {
      const replacement = (vectorTags.has(tag) ? this.doc.createElementNS('http://www.w3.org/2000/svg', tag) : this.doc.createElement(tag)) as HTMLElement;
      replacement.dataset.fwId = id;
      replacement.dataset.fwKey = key;
      if (node) { while (node.firstChild) replacement.append(node.firstChild); node.replaceWith(replacement); }
      node = replacement;
      this.nodes.set(key, node);
    }
    node.toggleAttribute('data-fw-selected', selected === id);
    node.toggleAttribute('data-fw-marked', this.marked.has(id) && selected !== id);
    this.scopes.set(key, context?.ids || {});
    const attributes = { ...data.attrs };
    let displayedText = site.locales[locale]?.[id] ?? data.text;
    if (data.binding?.field) {
      const collection = site.collections[data.binding.collection];
      const item = context?.collection === collection?.id ? context.item : collection?.items.find(item => item.status === 'published');
      const bound = item?.values[data.binding.field];
      const content = typeof bound === 'string' ? bound : bound == null ? '' : JSON.stringify(bound);
      if (tag === 'img' && bound != null) attributes.src = content;
      else displayedText = content;
    }
    const nextAttrs = new Set<string>();
    for (const [name, content] of Object.entries(attributes)) {
      const vectorAttribute = vectorTags.has(tag) && vectorAttributes.has(name) && safeVectorValue(name, content);
      if ((!allowedAttributes.has(name) && !vectorAttribute && !/^aria-[a-z-]+$/.test(name) && !/^data-[a-z-]+$/.test(name)) || (/^data-fw-/.test(name) && name !== 'data-fw-theme-only')) continue;
      if (['href', 'src', 'poster'].includes(name) && !safeUrl(content)) continue;
      if (name === 'srcset' && !content.split(',').every(candidate => safeUrl(candidate.trim().split(/\s+/)[0]))) continue;
      let actual = content;
      if (context) {
        if (['id', 'for'].includes(name)) actual = context.ids[content] || content;
        if (['aria-labelledby', 'aria-describedby'].includes(name)) actual = content.split(/\s+/).map(id => context.ids[id] || id).join(' ');
        if (name === 'href') actual = scopedFragment(content, context.ids);
        if (vectorTags.has(tag) && referenceAttributes.has(name)) actual = content.replace(/^url\(#([\w-]+)\)$/, (_match, ref: string) => `url(#${context.ids[ref] || ref})`);
      }
      const field = name === 'href' && tag === 'a' ? 'data-fw-href' : name;
      nextAttrs.add(field);
      if (name === 'src' && tag === 'img' && node.getAttribute(name) !== actual) {
        if (this.imageSources.get(key) !== actual) {
          this.imageSources.set(key, actual);
          const image = this.doc.createElement('img');
          image.src = actual;
          const swap = (): void => {
            if (this.imageSources.get(key) === actual && this.nodes.get(key) === node) node!.setAttribute('src', actual);
          };
          image.decode().then(swap).catch(swap);
        }
      } else if (node.getAttribute(field) !== actual) node.setAttribute(field, actual);
    }
    for (const previous of this.attrs.get(key) || []) if (!nextAttrs.has(previous)) {
      node.removeAttribute(previous);
      if (previous === 'src') this.imageSources.delete(key);
    }
    this.attrs.set(key, nextAttrs);
    const effective = { ...data.styles };
    const picked = site.breakpoints.find(breakpoint => breakpoint.id === scope);
    const matching = [...site.breakpoints].filter(breakpoint => breakpoint.maxWidth === 100000 || (picked !== undefined && breakpoint.maxWidth >= picked.maxWidth)).sort((a, b) => b.maxWidth - a.maxWidth);
    matching.forEach(breakpoint => Object.assign(effective, data.breakpoints?.[breakpoint.id]));
    const framed = this.motionFrame?.[id];
    if (framed) for (const [name, content] of Object.entries(framed)) {
      for (const own of Object.keys(effective)) if (cssName(own) === cssName(name)) delete effective[own];
      effective[name] = content;
    }
    const nextStyles = new Set<string>();
    for (const [name, content] of Object.entries(effective)) {
      const property = cssName(name);
      if (!safeStyle(property, content)) continue;
      nextStyles.add(property);
      if (node.style.getPropertyValue(property) !== content) node.style.setProperty(property, content);
    }
    for (const previous of this.styles.get(key) || []) if (!nextStyles.has(previous)) node.style.removeProperty(previous);
    this.styles.set(key, nextStyles);
    if (!voidTags.has(tag)) {
      if (['textarea', 'option'].includes(tag)) {
        if (this.doc.activeElement !== node && node.textContent !== displayedText) node.textContent = displayedText;
        return node;
      }
      let textNode = this.textNodes.get(key);
      if (!textNode) {
        textNode = (tag === 'textPath' || tag === 'tspan' ? this.doc.createElementNS('http://www.w3.org/2000/svg', 'tspan') : this.doc.createElement('span')) as HTMLSpanElement;
        textNode.dataset.fwText = id;
        this.textNodes.set(key, textNode);
      }
      if (displayedText) {
        if (textNode.parentNode !== node) node.insertBefore(textNode, node.firstChild);
        if (textNode.contentEditable !== 'true' && textNode.textContent !== displayedText) textNode.textContent = displayedText;
      } else if (textNode.parentNode === node && textNode.contentEditable !== 'true') textNode.remove();
      let previous: ChildNode | null = textNode.parentNode === node ? textNode : null;
      for (const childId of data.children) {
        const child = this.patch(site, childId, selected, scope, locale, visited, context);
        if (!child) continue;
        const desired: ChildNode | null = previous ? previous.nextSibling : node.firstChild;
        if (child !== desired) node.insertBefore(child, desired);
        previous = child;
      }
      for (const child of Array.from(node.children)) {
        const childId = (child as HTMLElement).dataset.fwId;
        if (childId && !data.children.includes(childId)) child.remove();
      }
      this.syncPoster(node, key, id, tag);
    }
    return node;
  }

  private bindEvents(doc: Document): void {
    (doc.defaultView as (Window & { navigation?: EventTarget }) | null)?.navigation?.addEventListener('navigate', event => { if (event.cancelable) event.preventDefault(); });
    doc.addEventListener('click', event => {
      const element = (event.target as Element).closest<HTMLElement>('[data-fw-id]');
      if (!element) return;
      const id = element.dataset.fwId!;
      event.preventDefault();
      event.stopPropagation();
      this.onSelect(id, event);
    });
    doc.addEventListener('mousedown', event => {
      if (event.shiftKey && !(event.target as Element).closest?.('[contenteditable="true"]')) event.preventDefault();
    });
    doc.addEventListener('dblclick', event => {
      const element = (event.target as Element).closest<HTMLElement>('[data-fw-id]');
      const id = element?.dataset.fwId;
      if (!id || !this.last?.site.nodes[id].text || this.last.site.nodes[id].binding || this.last.locale !== this.last.site.defaultLocale) return;
      const span = this.textNodes.get(element!.dataset.fwKey!);
      if (!span) return;
      span.contentEditable = 'true';
      span.focus({ preventScroll: true });
      const selection = doc.getSelection();
      selection?.selectAllChildren(span);
      span.addEventListener('blur', () => {
        span.contentEditable = 'false';
        this.onText(id, span.textContent || '');
      }, { once: true });
    });
    doc.addEventListener('submit', event => event.preventDefault());
    doc.addEventListener('keydown', event => {
      if (event.isComposing || (event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      const forwarded = new KeyboardEvent('keydown', { key: event.key, code: event.code, location: event.location, repeat: event.repeat, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, bubbles: true, cancelable: true, composed: true });
      if (!this.frame.dispatchEvent(forwarded)) event.preventDefault();
    });
  }

  private fit(): void {
    const available = Math.max(240, this.stage.clientWidth - 64);
    this.scale = Math.min(1, available / this.width);
    this.height = Math.max(760, Math.floor((this.stage.clientHeight - 64) / this.scale));
    this.outer.style.width = `${this.width * this.scale}px`;
    this.outer.style.height = `${this.height * this.scale + 24}px`;
    this.shell.style.width = `${this.width}px`;
    this.shell.style.height = `${this.height}px`;
    this.shell.style.transform = `scale(${this.scale})`;
    this.frame.style.width = `${this.width}px`;
    this.frame.style.height = `${this.height}px`;
    this.label.children[1].textContent = `${Math.round(this.scale * 100)}%`;
  }
}
