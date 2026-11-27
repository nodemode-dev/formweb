export type GradientKind = 'linear' | 'radial';
export type RadialShape = 'circle' | 'ellipse';

export interface GradientStop {
  color: string;
  position: number;
}

export interface Gradient {
  kind: GradientKind;
  angle: number;
  to: string;
  shape: RadialShape;
  size: string;
  at: string;
  stops: GradientStop[];
}

export interface Rgba { r: number; g: number; b: number; a: number }

const SIDES = ['top', 'right', 'bottom', 'left'];
const SIDE_ANGLE: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'bottom right': 135, 'bottom left': 225, 'top left': 315 };
const EXTENTS = ['closest-side', 'closest-corner', 'farthest-side', 'farthest-corner'];
const POSITION_WORDS = ['center', 'top', 'right', 'bottom', 'left'];
const COLOR_FUNCTIONS = ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'var'];

const NAMED: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000',
  blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff', darkblue: '00008b',
  darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b',
  darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f',
  darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493',
  deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000',
  greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c',
  lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa',
  mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee',
  mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1',
  moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500',
  orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093',
  papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080',
  rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460',
  seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090',
  slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347',
  turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32',
};

function splitTop(text: string, separator: ',' | ' '): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth < 0) return null; }
    else if (depth === 0 && (separator === ',' ? c === ',' : /\s/.test(c))) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(text.slice(start));
  return separator === ' ' ? parts.filter(Boolean) : parts.map(part => part.trim());
}

function functionCall(text: string): { name: string; body: string } | null {
  const match = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(text.trim());
  if (!match) return null;
  const body = match[2];
  let depth = 0;
  for (const c of body) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return null;
  }
  return depth === 0 ? { name: match[1].toLowerCase(), body } : null;
}

export function isColor(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(value)) return true;
  if (value === 'transparent' || value === 'currentcolor' || value in NAMED) return true;
  const call = functionCall(value);
  if (!call || !COLOR_FUNCTIONS.includes(call.name) || !call.body.trim()) return false;
  if (call.name === 'var') return /^--[\w-]+(\s*,[\s\S]+)?$/.test(call.body.trim());
  return !/\bcalc\(/.test(call.body);
}

function parsePercent(text: string): number | null {
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))%$/.exec(text);
  if (match) return Number(match[1]);
  return /^(?:0+(?:\.0+)?|\.0+)$/.test(text) ? 0 : null;
}

function parseStop(text: string): { color: string; position: number | null } | null {
  const parts = splitTop(text, ' ');
  if (!parts || !parts.length || parts.length > 2) return null;
  const color = parts[0];
  if (!isColor(color)) return null;
  if (parts.length === 1) return { color, position: null };
  const position = parsePercent(parts[1]);
  if (position === null || position < 0 || position > 100) return null;
  return { color, position };
}

function parsePosition(words: string[]): string | null {
  if (!words.length || words.length > 4) return null;
  for (const word of words) {
    if (POSITION_WORDS.includes(word)) continue;
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(%|px|em|rem)$/.test(word) || /^0+$/.test(word)) continue;
    return null;
  }
  return words.join(' ');
}

function parseRadialHead(text: string, gradient: Gradient): boolean {
  const words = splitTop(text, ' ');
  if (!words || !words.length) return false;
  const atIndex = words.indexOf('at');
  const head = atIndex === -1 ? words : words.slice(0, atIndex);
  if (atIndex !== -1) {
    const at = parsePosition(words.slice(atIndex + 1));
    if (at === null) return false;
    gradient.at = at;
  }
  if (head.length > 2) return false;
  let shape = '';
  for (const word of head) {
    if ((word === 'circle' || word === 'ellipse') && !shape) shape = word;
    else if (EXTENTS.includes(word) && !gradient.size) gradient.size = word;
    else return false;
  }
  if (shape) gradient.shape = shape as RadialShape;
  return true;
}

function parseLinearHead(text: string, gradient: Gradient): boolean | null {
  const angle = /^(-?(?:\d+(?:\.\d+)?|\.\d+))deg$/.exec(text);
  if (angle) {
    gradient.angle = Number(angle[1]);
    return true;
  }
  const words = text.split(/\s+/);
  if (words[0] !== 'to') return isColor(splitTop(text, ' ')?.[0] ?? '') ? null : false;
  const sides = words.slice(1);
  if (!sides.length || sides.length > 2 || !sides.every(side => SIDES.includes(side))) return false;
  if (sides.length === 2 && (sides[0] === sides[1] || (SIDES.indexOf(sides[0]) % 2) === (SIDES.indexOf(sides[1]) % 2))) return false;
  const key = sides.length === 2 ? [sides.find(s => s === 'top' || s === 'bottom'), sides.find(s => s === 'left' || s === 'right')].join(' ') : sides[0];
  gradient.to = key;
  gradient.angle = SIDE_ANGLE[key];
  return true;
}

export function blankGradient(): Gradient {
  return { kind: 'linear', angle: 180, to: '', shape: 'ellipse', size: '', at: '', stops: [] };
}

export function parseGradient(text: string): Gradient | null {
  const call = functionCall(text.trim());
  if (!call || (call.name !== 'linear-gradient' && call.name !== 'radial-gradient')) return null;
  const parts = splitTop(call.body, ',');
  if (!parts || parts.some(part => !part)) return null;
  const gradient = blankGradient();
  gradient.kind = call.name === 'linear-gradient' ? 'linear' : 'radial';
  let first = parts[0].toLowerCase();
  if (gradient.kind === 'linear') {
    const head = parseLinearHead(first.trim(), gradient);
    if (head === false) return null;
    if (head) parts.shift();
  } else {
    first = first.trim();
    const words = splitTop(first, ' ') ?? [];
    if (!isColor(words[0] ?? '')) {
      if (!parseRadialHead(first, gradient)) return null;
      parts.shift();
    }
  }
  if (parts.length < 2) return null;
  const raw: { color: string; position: number | null }[] = [];
  for (const part of parts) {
    const stop = parseStop(part);
    if (!stop) return null;
    raw.push(stop);
  }
  if (raw[0].position === null) raw[0].position = 0;
  if (raw[raw.length - 1].position === null) raw[raw.length - 1].position = Math.max(100, ...raw.map(stop => stop.position ?? 0));
  let highest = 0;
  for (const stop of raw) if (stop.position !== null) { stop.position = Math.max(stop.position, highest); highest = stop.position; }
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].position !== null) continue;
    let j = i;
    while (raw[j].position === null) j++;
    const from = raw[i - 1].position as number;
    const to = raw[j].position as number;
    for (let k = i; k < j; k++) raw[k].position = from + (to - from) * (k - i + 1) / (j - i + 1);
  }
  if (raw.some(stop => (stop.position as number) > 100)) return null;
  gradient.stops = raw.map(stop => ({ color: stop.color, position: round(stop.position as number) }));
  return gradient;
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function number(value: number): string {
  return String(round(value));
}

export function normaliseAngle(angle: number): number {
  return round(((angle % 360) + 360) % 360);
}

export function sortedStops<T extends GradientStop>(stops: readonly T[]): T[] {
  return stops.map((stop, index) => ({ stop, index })).sort((a, b) => a.stop.position - b.stop.position || a.index - b.index).map(item => item.stop);
}

export function stopList(stops: readonly GradientStop[]): string {
  return sortedStops(stops).map(stop => `${stop.color.trim()} ${number(stop.position)}%`).join(', ');
}

export function serializeGradient(gradient: Gradient): string {
  const stops = stopList(gradient.stops);
  if (gradient.kind === 'linear') {
    const direction = gradient.to ? `to ${gradient.to}` : `${number(gradient.angle)}deg`;
    return `linear-gradient(${direction}, ${stops})`;
  }
  const head = [gradient.shape, gradient.size, gradient.at ? `at ${gradient.at}` : ''].filter(Boolean).join(' ');
  return `radial-gradient(${head}, ${stops})`;
}

function clamp(value: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function channel(text: string, scale: number): number | null {
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(%?)$/.exec(text);
  if (!match) return null;
  return match[2] ? Number(match[1]) / 100 * scale : Number(match[1]);
}

export function toRgba(text: string): Rgba | null {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = value.startsWith('#') ? value.slice(1) : NAMED[value];
  if (hex !== undefined) {
    if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return null;
    const full = hex.length <= 4 ? hex.split('').map(c => c + c).join('') : hex;
    const n = (i: number): number => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const call = functionCall(value);
  if (!call || !['rgb', 'rgba', 'hsl', 'hsla'].includes(call.name)) return null;
  const pieces = call.body.replace(/\//g, ' / ').split(/[\s,]+/).filter(piece => piece && piece !== '/');
  if (pieces.length < 3 || pieces.length > 4) return null;
  const alpha = pieces.length === 4 ? channel(pieces[3], 1) : 1;
  if (alpha === null) return null;
  if (call.name.startsWith('rgb')) {
    const rgb = pieces.slice(0, 3).map(piece => channel(piece, 255));
    if (rgb.some(c => c === null)) return null;
    const [r, g, b] = rgb as number[];
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(alpha) };
  }
  const h = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(deg)?$/.exec(pieces[0]);
  const s = channel(pieces[1], 1);
  const l = channel(pieces[2], 1);
  if (!h || s === null || l === null) return null;
  const [r, g, b] = hslToRgb(((Number(h[1]) % 360) + 360) % 360, clamp(s), clamp(l));
  return { r, g, b, a: clamp(alpha) };
}

export function toHex(color: Rgba): string {
  const part = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  const alpha = color.a >= 1 ? '' : part(color.a * 255);
  return `#${part(color.r)}${part(color.g)}${part(color.b)}${alpha}`;
}

export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const alpha = a.a + (b.a - a.a) * t;
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const c = (x: number, y: number): number => (x * a.a + (y * b.a - x * a.a) * t) / alpha;
  return { r: c(a.r, b.r), g: c(a.g, b.g), b: c(a.b, b.b), a: alpha };
}

export function colorAt(stops: readonly GradientStop[], position: number, resolve: (color: string) => Rgba | null = toRgba): string {
  const sorted = sortedStops(stops);
  if (!sorted.length) return '#000000';
  if (position <= sorted[0].position) return sorted[0].color;
  const last = sorted[sorted.length - 1];
  if (position >= last.position) return last.color;
  let i = 0;
  while (sorted[i + 1].position < position) i++;
  const before = sorted[i];
  const after = sorted[i + 1];
  if (after.position <= before.position) return after.color;
  const t = (position - before.position) / (after.position - before.position);
  const a = resolve(before.color);
  const b = resolve(after.color);
  if (!a || !b) return t < 0.5 ? before.color : after.color;
  return toHex(mix(a, b, t));
}

export function luminance(color: Rgba): number {
  const lin = (n: number): number => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

export const DEFAULT_START = '#5b3cc4';

export function starterGradient(color: string): Gradient {
  const gradient = blankGradient();
  gradient.angle = 135;
  const given = color.trim();
  const base = given && isColor(given) && toRgba(given)?.a !== 0 && given.toLowerCase() !== 'currentcolor' ? given : DEFAULT_START;
  const rgba = toRgba(base);
  let second: string;
  if (rgba) {
    const target = luminance(rgba) > 0.4 ? { r: 0, g: 0, b: 0, a: rgba.a } : { r: 255, g: 255, b: 255, a: rgba.a };
    second = toHex(mix(rgba, target, 0.45));
  } else {
    second = `color-mix(in srgb, ${base} 55%, white)`;
  }
  gradient.stops = [{ color: base, position: 0 }, { color: second, position: 100 }];
  return gradient;
}

export function reverseStops<T extends GradientStop>(stops: readonly T[]): T[] {
  return sortedStops(stops).reverse().map(stop => ({ ...stop, position: round(100 - stop.position) }));
}
