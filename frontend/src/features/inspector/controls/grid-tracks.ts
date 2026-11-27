export const NOMINAL_WIDTH = 1000;
const CONTENT = 100;
const MAX_REPEAT = 100;

type Size = { fixed: number } | { fr: number; min?: number } | { content: true };
type Item = { size: Size } | { auto: 'auto-fit' | 'auto-fill'; sizes: Size[] };

function split(text: string, separator: RegExp): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') { depth--; if (depth < 0) return null; }
    else if (depth === 0 && separator.test(char)) {
      if (i > start) parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  if (text.length > start) parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function call(text: string, name: string): string[] | null {
  const match = new RegExp(`^${name}\\((.*)\\)$`, 'i').exec(text);
  return match ? split(match[1], /,/) : null;
}

function plain(text: string): Size | null {
  const lower = text.toLowerCase();
  if (lower === 'auto' || lower === 'min-content' || lower === 'max-content') return { content: true };
  if (lower === '0') return { fixed: 0 };
  const match = /^(\d+(?:\.\d+)?|\.\d+)(fr|px|%|rem|em)$/.exec(lower);
  if (!match) return null;
  const amount = Number(match[1]);
  if (match[2] === 'fr') return { fr: amount };
  if (match[2] === 'px') return { fixed: amount };
  if (match[2] === '%') return { fixed: amount * NOMINAL_WIDTH / 100 };
  return { fixed: amount * 16 };
}

function size(text: string): Size | null {
  const args = call(text, 'minmax');
  if (!args) return plain(text);
  if (args.length !== 2) return null;
  const low = plain(args[0]);
  const high = plain(args[1]);
  if (!low || !high || 'fr' in low) return null;
  if ('fr' in high) return 'fixed' in low && low.fixed > 0 ? { fr: high.fr, min: low.fixed } : high;
  if ('fixed' in high) return high;
  return low;
}

function items(text: string, nested: boolean): Item[] | null {
  const words = split(text, /\s/);
  if (!words) return null;
  const out: Item[] = [];
  for (const word of words) {
    const args = call(word, 'repeat');
    if (!args) {
      const one = size(word);
      if (!one) return null;
      out.push({ size: one });
      continue;
    }
    if (nested || args.length !== 2) return null;
    const inner = items(args[1], true);
    if (!inner || !inner.length) return null;
    const sizes = inner.map(item => 'size' in item ? item.size : null);
    if (sizes.some(item => !item)) return null;
    const count = args[0].toLowerCase();
    if (count === 'auto-fit' || count === 'auto-fill') {
      if (sizes.some(item => !item || !('fixed' in item && item.fixed > 0) && !('fr' in item && item.min))) return null;
      out.push({ auto: count, sizes: sizes as Size[] });
      continue;
    }
    if (!/^\d+$/.test(count)) return null;
    const times = Number(count);
    if (times < 1 || times > MAX_REPEAT) return null;
    for (let i = 0; i < times; i++) for (const item of sizes) out.push({ size: item! });
  }
  return out;
}

function autoCount(sizes: Size[], room: number): number {
  const each = sizes.reduce((sum, item) => sum + ('fixed' in item ? item.fixed : 'fr' in item ? item.min || 0 : 0), 0);
  return each > 0 ? Math.max(1, Math.min(MAX_REPEAT, Math.floor(room / each))) : 1;
}

export function parseTracks(value: string): number[] | null {
  const text = value.trim();
  if (!text) return [];
  const list = items(text, false);
  if (!list || !list.length) return null;
  const autos = list.filter(item => 'auto' in item);
  if (autos.length > 1) return null;
  const fixedOf = (item: Size): number => 'fixed' in item ? item.fixed : 'content' in item ? CONTENT : 0;
  const outside = list.reduce((sum, item) => sum + ('size' in item ? fixedOf(item.size) : 0), 0);
  const sizes: Size[] = [];
  for (const item of list) {
    if ('size' in item) { sizes.push(item.size); continue; }
    const times = autoCount(item.sizes, Math.max(NOMINAL_WIDTH - outside, 0));
    for (let i = 0; i < times; i++) sizes.push(...item.sizes);
  }
  const fixed = sizes.reduce((sum, item) => sum + fixedOf(item), 0);
  const fr = sizes.reduce((sum, item) => sum + ('fr' in item ? item.fr : 0), 0);
  const free = fr > 0 ? Math.max(NOMINAL_WIDTH - fixed, NOMINAL_WIDTH * 0.3) : 0;
  const widths = sizes.map(item => 'fr' in item ? free * item.fr / fr : fixedOf(item));
  const total = Math.max(NOMINAL_WIDTH, widths.reduce((sum, width) => sum + width, 0));
  return widths.map(width => width / total);
}

function canonical(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1');
}

function expand(value: string): string | null {
  const text = canonical(value);
  if (!text) return '';
  const words = split(text, /\s/);
  if (!words) return null;
  const out: string[] = [];
  for (const word of words) {
    const match = /^repeat\((\d+),(.*)\)$/.exec(word);
    if (!match) { out.push(word); continue; }
    const times = Number(match[1]);
    const inner = split(match[2], /\s/);
    if (!inner || times < 1 || times > MAX_REPEAT) return null;
    for (let i = 0; i < times; i++) out.push(...inner);
  }
  return out.join(' ');
}

export function sameTracks(a: string, b: string): boolean {
  if (canonical(a) === canonical(b)) return true;
  const left = expand(a);
  return left !== null && left === expand(b);
}
