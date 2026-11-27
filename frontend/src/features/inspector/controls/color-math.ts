export interface Rgba { r: number; g: number; b: number; a: number }
export interface Hsva { h: number; s: number; v: number; a: number }

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';

export function parseHex(text: string): Rgba | null {
  const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length <= 4) digits = digits.split('').map(digit => digit + digit).join('');
  const at = (index: number): number => parseInt(digits.slice(index, index + 2), 16);
  return { r: at(0), g: at(2), b: at(4), a: digits.length === 8 ? at(6) / 255 : 1 };
}

function args(text: string, names: string): string[] | null {
  const match = new RegExp(`^(?:${names})\\(\\s*([^()]*)\\)$`, 'i').exec(text.trim());
  if (!match) return null;
  const body = match[1].trim();
  const parts = body.includes(',') ? body.split(',').map(part => part.trim()) : body.split('/').length === 2
    ? [...body.split('/')[0].trim().split(/\s+/), body.split('/')[1].trim()] : body.split(/\s+/);
  if (body.includes(',') && body.includes('/')) return null;
  if (!body.includes(',')) return parts.length === (body.split('/').length === 2 ? 4 : 3) ? parts : null;
  return parts.length === 3 || parts.length === 4 ? parts : null;
}

function number(part: string, percentScale: number | null): number | null {
  const match = new RegExp(`^(${NUMBER})(%?)$`, 'i').exec(part);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (match[2]) return percentScale === null ? null : value / 100 * percentScale;
  return value;
}

function alpha(part: string | undefined): number | null {
  if (part === undefined) return 1;
  const value = number(part, 1);
  return value === null ? null : clamp(value, 0, 1);
}

export function parseRgb(text: string): Rgba | null {
  const parts = args(text, 'rgba?');
  if (!parts) return null;
  const channels = parts.slice(0, 3).map(part => number(part, 255));
  const a = alpha(parts[3]);
  if (channels.some(value => value === null) || a === null) return null;
  const [r, g, b] = channels.map(value => clamp(value as number, 0, 255));
  return { r, g, b, a };
}

function hue(part: string): number | null {
  const match = new RegExp(`^(${NUMBER})(deg|turn|rad|grad)?$`, 'i').exec(part);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] || 'deg').toLowerCase();
  const degrees = unit === 'turn' ? value * 360 : unit === 'rad' ? value * 180 / Math.PI : unit === 'grad' ? value * 0.9 : value;
  return ((degrees % 360) + 360) % 360;
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a };
}

export function parseHsl(text: string): Rgba | null {
  const parts = args(text, 'hsla?');
  if (!parts) return null;
  const h = hue(parts[0]);
  const s = number(parts[1].replace(/%$/, ''), null);
  const l = number(parts[2].replace(/%$/, ''), null);
  const a = alpha(parts[3]);
  if (h === null || s === null || l === null || a === null) return null;
  return hslToRgb(h, clamp(s / 100, 0, 1), clamp(l / 100, 0, 1), a);
}

export function parseColor(text: string): Rgba | null {
  const value = text.trim();
  if (value.startsWith('#')) return parseHex(value);
  if (/^rgba?\(/i.test(value)) return parseRgb(value);
  if (/^hsla?\(/i.test(value)) return parseHsl(value);
  return null;
}

export function parseEntry(text: string): Rgba | null {
  const value = text.trim();
  return /^rgba?\(/i.test(value) ? parseRgb(value) : parseHex(value);
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? delta / max : 0, v: max, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

const byte = (value: number): string => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');

export function toHex(color: Rgba): string {
  const opaque = Math.round(clamp(color.a, 0, 1) * 255) >= 255;
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}${opaque ? '' : byte(color.a * 255)}`;
}

export function toRgb(color: Rgba): string {
  const channels = [color.r, color.g, color.b].map(value => Math.round(clamp(value, 0, 255))).join(', ');
  const a = Math.round(clamp(color.a, 0, 1) * 1000) / 1000;
  return a >= 1 ? `rgb(${channels})` : `rgba(${channels}, ${a})`;
}

export function sameColor(one: Rgba | null, two: Rgba | null): boolean {
  if (!one || !two) return one === two;
  return toHex(one) === toHex(two);
}

export function hueStops(steps = 6): string {
  return Array.from({ length: steps + 1 }, (_, index) => toHex(hsvToRgb({ h: index * 360 / steps % 360, s: 1, v: 1, a: 1 }))).join(', ');
}

export function isGradient(text: string): boolean {
  const value = text.trim();
  return /^(?:repeating-)?(?:linear|radial|conic)-gradient\(.*\)$/is.test(value) && closesAtEnd(value);
}

function closesAtEnd(text: string): boolean {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')') { depth--; if (depth === 0) return index === text.length - 1; }
  }
  return false;
}

export function gradientColors(text: string): string[] {
  const value = text.trim();
  if (!isGradient(value)) return [];
  const inner = value.slice(value.indexOf('(') + 1, -1);
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index <= inner.length; index++) {
    const char = inner[index];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (index === inner.length || char === ',' && depth === 0) { parts.push(inner.slice(from, index).trim()); from = index + 1; }
  }
  return parts.map(part => part.replace(/(?:\s+[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:%|[a-z]+)?)+$/i, '').trim()).filter(Boolean);
}

export function varName(text: string): string | null {
  const match = /^var\(\s*(--[a-z0-9_-]+)\s*\)$/i.exec(text.trim());
  return match ? match[1] : null;
}
