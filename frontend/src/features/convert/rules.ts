/**
 * The pure half of Convert to editable elements: which tags become which elements, which attributes travel, how a
 * measured style is reduced to what differs from the element's own default, and how the result is said in words.
 * Nothing here touches a document; `measure.ts` reads the browser and calls these.
 */

export type TagRule =
  | { kind: 'node'; tag: string }
  | { kind: 'unwrap' }
  | { kind: 'keep'; part: Part }
  | { kind: 'drop' };

export type Part = 'script' | 'frame' | 'vector' | 'object' | 'other';

/** The tags the engine takes (formweb-model validate_node), less the vector ones, which travel as code. */
export const ENGINE_TAGS = new Set(['div', 'main', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'button', 'img', 'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'strong', 'em', 'small', 'b', 'i', 'br', 'hr', 'form', 'label', 'input', 'textarea', 'select', 'option', 'fieldset', 'legend', 'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'time', 'code', 'pre', 'sup', 'sub', 'tfoot', 'video', 'audio', 'source', 'wbr']);
export const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'source', 'wbr']);

const AS_SPAN = new Set(['font', 'u', 's', 'strike', 'mark', 'abbr', 'cite', 'q', 'del', 'ins', 'kbd', 'samp', 'var', 'tt', 'big', 'bdi', 'bdo', 'data', 'dfn', 'nobr', 'label-text', 'output']);
const AS_DIV = new Set(['center', 'address', 'hgroup', 'search', 'menu', 'dir', 'marquee']);
const KEEP: Record<string, Part> = { script: 'script', iframe: 'frame', frame: 'frame', object: 'object', embed: 'object', applet: 'object', canvas: 'other', svg: 'vector', math: 'other', dialog: 'other', map: 'other', meter: 'other', progress: 'other' };
const DROP = new Set(['noscript', 'template', 'colgroup', 'col', 'datalist', 'track', 'param', 'style', 'link', 'meta', 'base', 'title', 'head', 'slot']);
const UNWRAP = new Set(['picture', 'optgroup']);

export function mapTag(raw: string): TagRule {
  const tag = raw.toLowerCase();
  if (tag in KEEP) return { kind: 'keep', part: KEEP[tag] };
  if (DROP.has(tag)) return { kind: 'drop' };
  if (UNWRAP.has(tag)) return { kind: 'unwrap' };
  if (tag.includes('-')) return { kind: 'keep', part: 'other' };
  if (ENGINE_TAGS.has(tag)) return { kind: 'node', tag };
  if (AS_SPAN.has(tag)) return { kind: 'node', tag: 'span' };
  if (AS_DIV.has(tag)) return { kind: 'node', tag: 'div' };
  return { kind: 'keep', part: 'other' };
}

const PLAIN_ATTRS = ['id', 'title', 'role', 'alt', 'type', 'name', 'value', 'placeholder', 'required', 'checked', 'disabled', 'multiple', 'selected', 'min', 'max', 'step', 'pattern', 'minlength', 'maxlength', 'for', 'tabindex', 'open', 'datetime', 'colspan', 'rowspan', 'scope', 'controls', 'muted', 'loop', 'preload', 'accept', 'sizes'];
const URL_ATTRS = ['href', 'src', 'poster', 'action'];
const SIZED = new Set(['img', 'video', 'audio']);
const BOOLEAN = new Set(['autoplay', 'playsinline', 'hidden']);

/** The engine's safe_url, mirrored so a refused link is left out before the batch instead of failing it. */
export function safeUrl(value: string): boolean {
  if (value.trim() !== value || value.length > 4096 || value.startsWith('//') || /[\u0000-\u001f\u007f\\<>"']/.test(value)) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return value.slice(lower.indexOf('://') + 3).length > 0;
  if (lower.startsWith('mailto:') || lower.startsWith('tel:')) return true;
  return !(value.split(/[/?#]/)[0] || '').includes(':');
}

export interface CarriedAttrs { attrs: Record<string, string>; dropped: number; scripted: number }

/** Attributes that travel to the new element: event handlers and script links never do, and URLs must be safe. */
export function carryAttrs(tag: string, source: Iterable<{ name: string; value: string }>): CarriedAttrs {
  const attrs: Record<string, string> = {};
  let dropped = 0;
  let scripted = 0;
  for (const { name: raw, value } of source) {
    const name = raw.toLowerCase();
    if (name.startsWith('on')) { scripted++; continue; }
    if (URL_ATTRS.includes(name)) {
      if (/^\s*(javascript|vbscript):/i.test(value)) { scripted++; continue; }
      if (name === 'action' && tag !== 'form') continue;
      if (!safeUrl(value)) { dropped++; continue; }
      attrs[name] = value;
    } else if (name === 'target') {
      if (['_blank', '_self', '_parent', '_top'].includes(value)) attrs.target = value;
    } else if (name === 'method') {
      if (['post', 'get'].includes(value.toLowerCase())) attrs.method = value.toLowerCase();
    } else if (name === 'width' || name === 'height') {
      if (SIZED.has(tag) && /^\d{1,5}$/.test(value)) attrs[name] = value;
    } else if (BOOLEAN.has(name)) {
      attrs[name] = '';
    } else if (name === 'loading') {
      if (['lazy', 'eager'].includes(value)) attrs.loading = value;
    } else if (name === 'srcset') {
      if (value.split(',').every(item => safeUrl(item.trim().split(/\s+/)[0] || ''))) attrs.srcset = value; else dropped++;
    } else if ((name.startsWith('aria-') || (name.startsWith('data-') && !name.startsWith('data-fw'))) && /^[a-z0-9_-]{1,90}$/.test(name.slice(5))) {
      attrs[name] = value;
    } else if (PLAIN_ATTRS.includes(name)) {
      if (name === 'id' && !/^[A-Za-z][\w-]{0,95}$/.test(value)) { dropped++; continue; }
      attrs[name] = value;
    }
  }
  return { attrs, dropped, scripted };
}

/** Computed properties read for every element. Longhands where the shorthand would hide a difference. */
export const READ = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow',
  'align-items', 'align-self', 'align-content', 'justify-content', 'justify-items', 'justify-self',
  'flex-grow', 'flex-shrink', 'flex-basis', 'flex-direction', 'flex-wrap', 'order',
  'overflow-x', 'overflow-y', 'box-sizing', 'vertical-align', 'visibility', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'white-space', 'color', 'text-shadow', 'list-style', 'word-break', 'overflow-wrap',
  'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-radius', 'box-shadow', 'object-fit', 'object-position', 'aspect-ratio', 'border-collapse', 'border-spacing', 'table-layout', 'transform'
] as const;

export const INHERITED = new Set(['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'white-space', 'color', 'text-shadow', 'list-style', 'word-break', 'overflow-wrap', 'visibility', 'border-collapse', 'border-spacing']);

/** Inherited values the root always states, because the canvas and the export give the page different defaults. */
export const ROOT_FORCED = ['color', 'font-family', 'font-size', 'line-height'];
/** The canvas draws links in their parent's colour, the export in the browser's blue: a link always states both. */
export const LINK_FORCED = ['color', 'text-decoration'];

const HELPERS = new Set(['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']);
const BACKGROUND_EXTRAS = ['background-size', 'background-position', 'background-repeat'];
const SIZES = ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height'];
const SIDES = ['top', 'right', 'bottom', 'left'];

export interface Reduced { styles: Record<string, string>; floats: number; pictures: number; refused: number }

function normal(name: string, value: string | undefined, all: Record<string, string>): string {
  const text = (value || '').trim();
  const side = /^border-(top|right|bottom|left)$/.exec(name);
  if (side && /^(none|hidden)$/.test(all[`border-${side[1]}-style`] || '')) return 'none';
  if (name === 'text-decoration' && /^none\b/.test(text)) return 'none';
  return text;
}

function sides(values: string[]): string {
  const [t, r, b, l] = values;
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

/**
 * The style an element needs: every read property whose measured value differs from what the element would have
 * with no styles of its own (`baseline`, measured with the parent already carrying its reduced style), limited to the
 * engine's properties. `forced` names inherited properties stated even when they match.
 */
export function reduceStyles(measured: Record<string, string>, baseline: Record<string, string>, forced: readonly string[] = []): Reduced {
  const styles: Record<string, string> = {};
  let floats = 0, pictures = 0, refused = 0;
  const image = normal('background-image', measured['background-image'], measured);
  const picture = /url\(/i.test(image);
  for (const name of READ) {
    if (HELPERS.has(name)) continue;
    const value = normal(name, measured[name], measured);
    if (!value) continue;
    const same = value === normal(name, baseline[name], baseline);
    if (same && !forced.includes(name)) continue;
    if (name === 'float') { if (value !== 'none') floats++; continue; }
    if (name === 'background-image' && picture) { pictures++; continue; }
    if (BACKGROUND_EXTRAS.includes(name) && (picture || image === 'none' || !image)) continue;
    if (/url\(|expression|javascript:|[;{}<>\\@]|\/\*/i.test(value)) { refused++; continue; }
    styles[name] = value;
  }
  return { styles, floats, pictures, refused };
}

/**
 * The final form of a reduced style: box-sizing only where a set size meets padding or a border (elsewhere the two
 * box models draw the same), and four equal sides, gaps and overflows written as one shorthand.
 */
export function compact(input: Record<string, string>, measured: Record<string, string>): Record<string, string> {
  const styles = { ...input };
  if ('box-sizing' in styles) {
    const sized = SIZES.some(name => name in styles && !/^(auto|none)$/.test(styles[name]));
    const boxed = SIDES.some(side => !/^0(px)?$/.test(measured[`padding-${side}`] || '0px')) || SIDES.some(side => normal(`border-${side}`, measured[`border-${side}`], measured) !== 'none');
    if (!sized || !boxed) delete styles['box-sizing'];
  }
  for (const box of ['margin', 'padding']) {
    const names = SIDES.map(side => `${box}-${side}`);
    if (names.every(name => name in styles)) {
      styles[box] = sides(names.map(name => styles[name]));
      names.forEach(name => delete styles[name]);
    }
  }
  const borders = SIDES.map(side => `border-${side}`);
  if (borders.every(name => name in styles) && borders.every(name => styles[name] === styles['border-top'])) {
    styles.border = styles['border-top'];
    borders.forEach(name => delete styles[name]);
  }
  if ('overflow-x' in styles && styles['overflow-x'] === styles['overflow-y']) {
    styles.overflow = styles['overflow-x'];
    delete styles['overflow-x'];
    delete styles['overflow-y'];
  }
  if ('row-gap' in styles && styles['row-gap'] === styles['column-gap']) {
    styles.gap = styles['row-gap'];
    delete styles['row-gap'];
    delete styles['column-gap'];
  }
  return styles;
}

export type Run<T> = { text: string } | { el: T; inline: boolean };

/**
 * Text and child elements of one element, the way a FormWeb element holds them: the text before the first child is
 * the element's own text, and every later run of text becomes a span child. White space collapses as the browser
 * collapses it (unless `pre`), is trimmed at the edges of a block, and between two children is kept only where one
 * of them is inline and the parent is not a flex or grid box.
 */
export function arrange<T>(runs: Run<T>[], options: { pre: boolean; block: boolean; boxed: boolean }): { text: string; children: ({ text: string } | { el: T })[] } {
  const items: Run<T>[] = [];
  for (const run of runs) {
    if ('text' in run) {
      const text = options.pre ? run.text : run.text.replace(/[\t\n\r\f ]+/g, ' ');
      const last = items[items.length - 1];
      if (last && 'text' in last) last.text += text; else if (text) items.push({ text });
    } else items.push(run);
  }
  if (!options.pre && options.block) {
    const first = items[0];
    if (first && 'text' in first) first.text = first.text.replace(/^ +/, '');
    const last = items[items.length - 1];
    if (last && 'text' in last) last.text = last.text.replace(/ +$/, '');
  }
  const kept = items.filter((item, index) => {
    if (!('text' in item)) return true;
    if (!item.text) return false;
    if (options.pre || item.text.trim()) return true;
    if (options.boxed) return false;
    const before = items[index - 1], after = items[index + 1];
    const inline = (run: Run<T> | undefined): boolean => !!run && !('text' in run) && run.inline;
    return !!before && !!after && (inline(before) || inline(after));
  });
  if (!options.pre && kept.length && options.block) {
    const first = kept[0];
    if ('text' in first) first.text = first.text.replace(/^ +/, '');
  }
  let text = '';
  const children: ({ text: string } | { el: T })[] = [];
  kept.forEach((item, index) => {
    if ('text' in item) { if (index === 0) text = item.text; else children.push({ text: item.text }); }
    else children.push({ el: item.el });
  });
  return { text, children };
}

const NAMES: Record<string, string> = { h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Paragraph', a: 'Link', img: 'Image', button: 'Button', ul: 'List', ol: 'List', li: 'List item', nav: 'Navigation', header: 'Header', footer: 'Footer', section: 'Section', article: 'Article', aside: 'Aside', main: 'Main', figure: 'Figure', figcaption: 'Caption', form: 'Form', input: 'Input', textarea: 'Text area', select: 'Select', option: 'Option', label: 'Label', table: 'Table', tr: 'Table row', td: 'Table cell', th: 'Table heading', thead: 'Table head', tbody: 'Table body', tfoot: 'Table foot', span: 'Text', strong: 'Bold text', b: 'Bold text', em: 'Italic text', i: 'Italic text', br: 'Line break', hr: 'Divider', blockquote: 'Quote', video: 'Video', audio: 'Audio', div: 'Container' };

/** A layer name a person recognises: the kind of element and its first class or id, as the original page called it. */
export function layerName(tag: string, original: { id?: string; className?: string }): string {
  const base = NAMES[tag] || tag.toUpperCase();
  const hint = original.id || (original.className || '').trim().split(/\s+/)[0] || '';
  return hint && /^[\w-]{1,40}$/.test(hint) ? `${base} ${hint}` : base;
}

export interface FontFaceRule { family: string; src: string; weight: string; style: string }
export interface SiteFont { family: string; src: string; weight?: string; style?: string; display?: string }

/** The site's self-hosted faces that a conversion adds: owned WOFF2 faces whose family a converted element uses. */
export function pickFonts(faces: FontFaceRule[], used: Set<string>, existing: Record<string, SiteFont>): Record<string, SiteFont> {
  const result: Record<string, SiteFont> = { ...existing };
  let room = 16 - Object.keys(existing).length;
  for (const face of faces) {
    const family = face.family.replace(/^["']|["']$/g, '').trim();
    const src = /\/api\/assets\/[0-9a-f]{64}\.woff2/.exec(face.src)?.[0];
    if (!src || !family || !used.has(family.toLowerCase()) || room <= 0) continue;
    if (Object.values(result).some(font => font.family === family && font.src === src)) continue;
    const id = `${family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font'}-${/^\d+$/.test(face.weight) ? face.weight : '400'}${face.style === 'italic' ? '-italic' : ''}`;
    if (id in result) continue;
    result[id] = { family, src, weight: /^\d{3}$/.test(face.weight) ? face.weight : '400', style: face.style === 'italic' ? 'italic' : 'normal', display: 'swap' };
    room--;
  }
  return result;
}

/** Family names a font-family value lists, lower case, without quotes. */
export function families(value: string): string[] {
  return value.split(',').map(name => name.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);
}

export interface Outcome {
  converted: number;
  parts: Partial<Record<Part, number>>;
  responsive: number;
  effects: number;
  floats: number;
  pictures: number;
  refused: number;
  scripted: number;
  left: number;
}

export function emptyOutcome(): Outcome {
  return { converted: 0, parts: {}, responsive: 0, effects: 0, floats: 0, pictures: 0, refused: 0, scripted: 0, left: 0 };
}

type Say = (english: string, values?: readonly (string | number)[]) => string;
type SayCount = (n: number, one: string, other: string, values?: readonly (string | number)[]) => string;

const PART_WORDS: Record<Part, [string, string]> = {
  script: ['a script', '{0} scripts'],
  frame: ['an inline frame', '{0} inline frames'],
  vector: ['a vector graphic', '{0} vector graphics'],
  object: ['an embedded object', '{0} embedded objects'],
  other: ['an element FormWeb has no element for', '{0} elements FormWeb has no element for']
};

/** The sentence shown after a conversion, built from translated pieces so every language reads whole sentences. */
export function summary(outcome: Outcome, say: Say, count: SayCount): string {
  const parts = (Object.keys(PART_WORDS) as Part[]).filter(part => outcome.parts[part]);
  const total = parts.reduce((sum, part) => sum + (outcome.parts[part] || 0), 0);
  const list = parts.map(part => count(outcome.parts[part]!, PART_WORDS[part][0], PART_WORDS[part][1], [outcome.parts[part]!])).join(', ');
  const lines = [count(outcome.converted, 'Converted 1 element.', 'Converted {0} elements.', [outcome.converted])];
  if (total) lines.push(count(total, '1 part stayed as code: {1}.', '{0} parts stayed as code: {1}.', [total, list]));
  if (outcome.responsive) lines.push(say('Responsive rules were not carried over.'), say('Check it at phone width in Preview, then adjust under each breakpoint.'));
  if (outcome.effects) lines.push(say('Hover effects and before or after decorations were not carried over.'));
  if (outcome.pictures) lines.push(count(outcome.pictures, '1 background picture was left out: FormWeb styles take no url() pictures.', '{0} background pictures were left out: FormWeb styles take no url() pictures.', [outcome.pictures]));
  if (outcome.floats) lines.push(count(outcome.floats, '1 float was left out: FormWeb has no float property.', '{0} floats were left out: FormWeb has no float property.', [outcome.floats]));
  if (outcome.scripted) lines.push(count(outcome.scripted, '1 event handler or script link was left out.', '{0} event handlers and script links were left out.', [outcome.scripted]));
  if (outcome.refused + outcome.left) lines.push(count(outcome.refused + outcome.left, '1 value the engine does not take was left out.', '{0} values the engine does not take were left out.', [outcome.refused + outcome.left]));
  return lines.join(' ');
}

/**
 * One selector list made to apply only inside the element `prefix` names: html, :root and a leading body compound
 * become the element itself, and every other selector looks inside it. Used for the code left over after a part of a
 * page is converted, so its stylesheet cannot restyle the new elements beside it.
 */
export function scopeSelector(list: string, prefix: string): string {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  parts.push(list.slice(start));
  return parts.map(raw => {
    let part = raw.trim();
    if (!part || part.startsWith(prefix)) return part;
    part = part.replace(/^(?:html|:root)(?:\s*>\s*|\s+|$)/i, '');
    const body = /^body(?:[.#:[][^\s>+~]*)?/i.exec(part);
    if (body) return (prefix + part.slice(body[0].length)).trim();
    return part ? `${prefix} ${part}` : prefix;
  }).filter(Boolean).join(', ');
}

export type Layer = { kind: 'picture'; src: string; fit: string; position: string } | { kind: 'paint'; image: string };

function layersOf(value: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) { out.push(value.slice(start, i).trim()); start = i + 1; }
  }
  out.push(value.slice(start).trim());
  return out;
}

/**
 * A measured background that holds url() pictures, as layers placed behind the element's content, bottom first: each
 * picture from the site's own assets sized cover or contain becomes a picture layer, and gradients between them
 * become paint layers. Other pictures are counted as dropped. No url() picture at all gives no layers.
 */
export function backdropLayers(image: string, size: string, position: string, origin: string): { layers: Layer[]; dropped: number } {
  const images = layersOf(image).filter(item => item && item !== 'none');
  if (!images.some(item => /^url\(/i.test(item))) return { layers: [], dropped: 0 };
  const sizes = layersOf(size), places = layersOf(position);
  const layers: Layer[] = [];
  let dropped = 0, paint: string[] = [];
  for (let i = images.length - 1; i >= 0; i--) {
    const found = /^url\(\s*(['"]?)(.*)\1\s*\)$/i.exec(images[i]);
    if (!found) { paint.unshift(images[i]); continue; }
    if (paint.length) { layers.push({ kind: 'paint', image: paint.join(', ') }); paint = []; }
    const src = found[2].startsWith(`${origin}/api/assets/`) ? found[2].slice(origin.length) : found[2];
    const fit = sizes[i % sizes.length] || '';
    if (!/^\/api\/assets\/[\w.-]+$/.test(src) || !/^(cover|contain)$/.test(fit)) { dropped++; continue; }
    layers.push({ kind: 'picture', src, fit, position: places[i % places.length] || '50% 50%' });
  }
  if (paint.length) layers.push({ kind: 'paint', image: paint.join(', ') });
  return { layers, dropped };
}

/** What to take out of the batch when the engine refuses it, read from the engine's message; null when unknown. */
export function refusal(message: string): { style?: string; attr?: string; node?: string; url?: boolean } | null {
  let found = /unsafe (?:responsive )?style ([\w-]+)(?: on ([\w-]+))?/.exec(message);
  if (found) return { style: found[1], node: found[2] };
  found = /unsupported attribute ([\w:-]+)/.exec(message);
  if (found) return { attr: found[1] };
  found = /unsafe URL on ([\w-]+)/.exec(message);
  if (found) return { url: true, node: found[1] };
  for (const attr of ['target', 'method', 'autoplay', 'playsinline', 'hidden', 'decoding', 'fetchpriority', 'srcset', 'sizes', 'autocomplete', 'spellcheck', 'inputmode', 'enterkeyhint']) {
    if (new RegExp(`\\b${attr}\\b`).test(message)) return { attr };
  }
  return null;
}
