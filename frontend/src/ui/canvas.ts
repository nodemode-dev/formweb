import type { Collection, Page, Site } from '../types';

type ItemContext = { collection: string; item: Collection['items'][number]; ids: Record<string, string>; suffix: string };

const allowedTags = new Set(['div', 'main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'img', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'strong', 'em', 'small', 'b', 'i', 'br', 'hr', 'form', 'label', 'input', 'textarea', 'select', 'option', 'fieldset', 'legend', 'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'time', 'code', 'pre', 'sup', 'sub', 'tfoot', 'video', 'audio', 'source', 'wbr', 'svg', 'g', 'path', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'textPath', 'symbol', 'use', 'pattern']);
const vectorTags = new Set(['svg', 'g', 'path', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'text', 'textPath', 'symbol', 'use', 'pattern']);
const vectorAttributes = new Set(['d', 'viewBox', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'transform', 'vector-effect', 'opacity', 'visibility',
  'clip-path', 'mask', 'paint-order', 'clip-rule', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'x', 'y', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
  'clipPathUnits', 'maskUnits', 'maskContentUnits', 'patternUnits', 'patternTransform', 'font-size', 'font-family', 'font-weight', 'letter-spacing', 'text-anchor', 'startOffset', 'dy']);
const referenceAttributes = new Set(['fill', 'stroke', 'clip-path', 'mask']);
function safeVectorValue(name: string, content: string): boolean {
  if (/^url\(#[A-Za-z0-9_-]{1,64}\)$/.test(content)) return referenceAttributes.has(name);
  return !/url\(|javascript:|[<>]/i.test(content);
}
const voidTags = new Set(['img', 'input', 'source', 'hr', 'br', 'wbr']);
const allowedAttributes = new Set(['id', 'class', 'title', 'role', 'href', 'src', 'alt', 'target', 'rel', 'type', 'name', 'value', 'placeholder', 'required', 'checked', 'disabled', 'multiple', 'selected', 'min', 'max', 'step', 'pattern', 'minlength', 'maxlength', 'autocomplete', 'for', 'loading', 'width', 'height', 'tabindex', 'open', 'datetime', 'colspan', 'rowspan', 'scope', 'controls', 'muted', 'loop', 'poster', 'preload', 'accept']);
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
  private last?: { site: Site; page: Page; selected: string; width: number; locale: string; preview: boolean };
  private scale = 1;
  private height = 860;
  private width = 1280;
  private ready: Promise<void>;

  constructor(private stage: HTMLElement, private onSelect: (id: string) => void, private onText: (id: string, text: string) => void, private onNavigate: (href: string) => void) {
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
    this.frame.setAttribute('sandbox', 'allow-same-origin');
    this.shell.append(this.frame);
    this.outer.append(this.label, this.shell);
    stage.append(this.outer);
    this.ready = new Promise(resolve => {
      this.frame.addEventListener('load', () => {
        this.doc = this.frame.contentDocument || undefined;
        if (this.doc) this.bindEvents(this.doc);
        if (this.last) this.render(this.last.site, this.last.page, this.last.selected, this.last.width, this.last.locale, this.last.preview);
        resolve();
      }, { once: true });
    });
    this.frame.srcdoc = '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data: blob:; media-src https: http: blob:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'"><style>*{box-sizing:border-box;scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}html,body{margin:0;min-height:100%;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}body{color:#edf0f5;background:#15171b}button,input,select,textarea{font:inherit}img,video{max-width:100%}[data-fw-selected]{outline:2px solid #f97316!important;outline-offset:2px}[data-fw-id]:hover{cursor:default}body[data-preview] [data-fw-id]:hover{cursor:auto}[data-fw-text][contenteditable=true]{outline:1px dashed #f97316;min-width:1em;display:inline-block}a{color:inherit}body:not([data-preview]) a,body:not([data-preview]) button{cursor:default}input,textarea,select{max-width:100%}.fw-fade{animation:fwFade .5s ease both}@keyframes fwFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}</style></head><body></body></html>';
    new ResizeObserver(() => this.fit()).observe(stage);
  }

  async loaded(): Promise<void> { return this.ready; }

  render(site: Site, page: Page, selected: string, width: number, locale: string, preview: boolean): void {
    this.last = { site, page, selected, width, locale, preview };
    this.width = width;
    if (!this.doc) return;
    this.doc.body.toggleAttribute('data-preview', preview);
    this.doc.documentElement.lang = locale;
    for (const [name, content] of Object.entries(site.tokens)) {
      if (safeStyle(name.replace(/^--/, ''), content)) this.doc.documentElement.style.setProperty(name.startsWith('--') ? name : '--' + name, content);
    }
    const visited = new Set<string>();
    const root = this.patch(site, page.root, selected, width, locale, visited);
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
        node.remove(); this.nodes.delete(key); this.textNodes.delete(key); this.attrs.delete(key); this.styles.delete(key);
      } else if (node.parentNode === this.doc.body) node.hidden = node !== root;
    }
    if (root) root.hidden = false;
    this.label.children[0].textContent = page.name + (preview ? ' · Preview' : '');
    this.fit();
  }

  private patch(site: Site, id: string, selected: string, width: number, locale: string, visited: Set<string>, context?: ItemContext, skipRepeat = false): HTMLElement | undefined {
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
        const child = this.patch(site, id, selected, width, locale, visited, { collection: collection.id, item, ids, suffix: suffix + segment }, true);
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
    node.toggleAttribute('data-fw-selected', selected === id && !this.last?.preview);
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
      if ((!allowedAttributes.has(name) && !vectorAttribute && !/^aria-[a-z-]+$/.test(name) && !/^data-[a-z-]+$/.test(name)) || /^data-fw-/.test(name)) continue;
      if (['href', 'src', 'poster'].includes(name) && !safeUrl(content)) continue;
      let actual = content;
      if (context) {
        if (['id', 'for'].includes(name)) actual = context.ids[content] || content;
        if (['aria-labelledby', 'aria-describedby'].includes(name)) actual = content.split(/\s+/).map(id => context.ids[id] || id).join(' ');
        if (name === 'href') actual = scopedFragment(content, context.ids);
        if (vectorTags.has(tag) && referenceAttributes.has(name)) actual = content.replace(/^url\(#([\w-]+)\)$/, (_match, ref: string) => `url(#${context.ids[ref] || ref})`);
      }
      nextAttrs.add(name);
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
      } else if (node.getAttribute(name) !== actual) node.setAttribute(name, actual);
    }
    for (const previous of this.attrs.get(key) || []) if (!nextAttrs.has(previous)) {
      node.removeAttribute(previous);
      if (previous === 'src') this.imageSources.delete(key);
    }
    this.attrs.set(key, nextAttrs);
    const effective = { ...data.styles };
    const matching = [...site.breakpoints].filter(breakpoint => breakpoint.maxWidth === 100000 || width <= breakpoint.maxWidth).sort((a, b) => b.maxWidth - a.maxWidth);
    matching.forEach(breakpoint => Object.assign(effective, data.breakpoints?.[breakpoint.id]));
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
        textNode = (tag === 'textPath' ? this.doc.createElementNS('http://www.w3.org/2000/svg', 'tspan') : this.doc.createElement('span')) as HTMLSpanElement;
        textNode.dataset.fwText = id;
        this.textNodes.set(key, textNode);
      }
      if (displayedText) {
        if (textNode.parentNode !== node) node.insertBefore(textNode, node.firstChild);
        if (textNode.contentEditable !== 'true' && textNode.textContent !== displayedText) textNode.textContent = displayedText;
      } else if (textNode.parentNode === node && textNode.contentEditable !== 'true') textNode.remove();
      let previous: ChildNode | null = textNode.parentNode === node ? textNode : null;
      for (const childId of data.children) {
        const child = this.patch(site, childId, selected, width, locale, visited, context);
        if (!child) continue;
        const desired: ChildNode | null = previous ? previous.nextSibling : node.firstChild;
        if (child !== desired) node.insertBefore(child, desired);
        previous = child;
      }
      for (const child of Array.from(node.children)) {
        const childId = (child as HTMLElement).dataset.fwId;
        if (childId && !data.children.includes(childId)) child.remove();
      }
    }
    return node;
  }

  private bindEvents(doc: Document): void {
    doc.addEventListener('click', event => {
      const element = (event.target as Element).closest<HTMLElement>('[data-fw-id]');
      if (!element) return;
      const id = element.dataset.fwId!;
      if (this.last?.preview) {
        const node = this.last.site.nodes[id];
        for (const interaction of node?.interactions || []) if (interaction.trigger === 'click') this.interact(element, interaction.action, interaction.className, interaction.url);
        const anchor = (event.target as Element).closest('a');
        if (anchor) { event.preventDefault(); const href = anchor.getAttribute('href'); if (href) this.navigate(href); }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.onSelect(id);
    });
    doc.addEventListener('dblclick', event => {
      if (this.last?.preview) return;
      const element = (event.target as Element).closest<HTMLElement>('[data-fw-id]');
      const id = element?.dataset.fwId;
      if (!id || !this.last?.site.nodes[id].text || this.last.site.nodes[id].binding || this.last.locale !== this.last.site.defaultLocale) return;
      const span = this.textNodes.get(element!.dataset.fwKey!);
      if (!span) return;
      span.contentEditable = 'true';
      span.focus();
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
    doc.addEventListener('mouseover', event => {
      if (!this.last?.preview) return;
      const element = (event.target as Element).closest<HTMLElement>('[data-fw-id]');
      if (!element) return;
      const from = event.relatedTarget as Node | null;
      if (from && element.contains(from)) return;
      const node = this.last.site.nodes[element.dataset.fwId!];
      for (const interaction of node?.interactions || []) if (interaction.trigger === 'hover') this.interact(element, interaction.action, interaction.className, interaction.url);
    });
  }

  private interact(element: HTMLElement, action: string, className?: string, url?: string): void {
    if (action === 'toggle-class' && className && /^[a-zA-Z_][\w-]*$/.test(className)) element.classList.toggle(className);
    if (action === 'fade-in') {
      element.classList.remove('fw-fade');
      requestAnimationFrame(() => element.classList.add('fw-fade'));
    }
    if (action === 'navigate' && url) this.navigate(scopedFragment(url, this.scopes.get(element.dataset.fwKey || '') || {}));
  }

  private navigate(url: string): void {
    const target = url.startsWith('#') ? this.doc?.getElementById(url.slice(1)) : undefined;
    if (target) target.scrollIntoView({ block: 'start' });
    else this.onNavigate(url);
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
