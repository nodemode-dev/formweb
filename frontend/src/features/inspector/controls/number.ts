export interface Range { readonly min: number; readonly max: number; readonly step: number }
export interface Scale {
  readonly units: Readonly<Record<string, Range>>;
  readonly unit: string;
  readonly rest: number;
  readonly floor: number;
  readonly ceiling: number;
}
export interface Amount { readonly n: number; readonly unit: string }

const r = (min: number, max: number, step: number): Range => ({ min, max, step });
const scale = (unit: string, units: Record<string, Range>, rest = 0, floor = 0, ceiling = Infinity): Scale => ({ units, unit, rest, floor, ceiling });
const SIGNED = -Infinity;

export const SCALES: Readonly<Record<string, Scale>> = {
  'opacity': scale('', { '': r(0, 1, 0.01) }, 1, 0, 1),
  'width': scale('px', { px: r(0, 1600, 1), '%': r(0, 100, 1), rem: r(0, 100, 0.25), em: r(0, 100, 0.25), vw: r(0, 100, 1), vh: r(0, 100, 1) }),
  'height': scale('px', { px: r(0, 1200, 1), '%': r(0, 100, 1), rem: r(0, 75, 0.25), em: r(0, 75, 0.25), vh: r(0, 100, 1), vw: r(0, 100, 1) }),
  'max-width': scale('px', { px: r(0, 1920, 1), '%': r(0, 100, 1), rem: r(0, 120, 0.25), em: r(0, 120, 0.25), ch: r(0, 120, 1), vw: r(0, 100, 1) }),
  'gap': scale('px', { px: r(0, 160, 1), rem: r(0, 10, 0.25), em: r(0, 10, 0.25), '%': r(0, 20, 1) }),
  'padding': scale('px', { px: r(0, 200, 1), rem: r(0, 12, 0.25), em: r(0, 12, 0.25), '%': r(0, 50, 1), vw: r(0, 20, 0.5), vh: r(0, 20, 0.5) }),
  'margin': scale('px', { px: r(-200, 200, 1), rem: r(-12, 12, 0.25), em: r(-12, 12, 0.25), '%': r(-50, 50, 1), vw: r(-20, 20, 0.5), vh: r(-20, 20, 0.5) }, 0, SIGNED),
  'border-radius': scale('px', { px: r(0, 200, 1), rem: r(0, 12, 0.25), em: r(0, 12, 0.25), '%': r(0, 50, 1) }),
  'font-size': scale('px', { px: r(8, 96, 1), rem: r(0.5, 6, 0.05), em: r(0.5, 6, 0.05), '%': r(50, 400, 5), vw: r(0.5, 10, 0.1) }, 16),
  'line-height': scale('', { '': r(0.8, 3, 0.05), px: r(8, 120, 1), rem: r(0.5, 8, 0.05), em: r(0.5, 3, 0.05), '%': r(80, 300, 5) }, 1.2),
  'letter-spacing': scale('px', { px: r(-5, 20, 0.1), em: r(-0.1, 0.5, 0.005), rem: r(-0.1, 0.5, 0.005) }, 0, SIGNED),
  'top': scale('px', { px: r(-200, 1200, 1), '%': r(-100, 100, 1), rem: r(-12, 75, 0.25), em: r(-12, 75, 0.25), vh: r(-50, 100, 1), vw: r(-50, 100, 1) }, 0, SIGNED),
  'left': scale('px', { px: r(-200, 1600, 1), '%': r(-100, 100, 1), rem: r(-12, 100, 0.25), em: r(-12, 100, 0.25), vw: r(-50, 100, 1), vh: r(-50, 100, 1) }, 0, SIGNED),
};

const NUMBER = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i;

export function parse(key: string, text: string): Amount | null {
  const table = SCALES[key];
  const match = NUMBER.exec(text.trim());
  if (!table || !match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(n)) return null;
  if (unit in table.units) return { n, unit };
  return unit === '' && n === 0 ? { n: 0, unit: table.unit } : null;
}

export function range(key: string, unit: string): Range | null {
  return SCALES[key]?.units[unit] ?? null;
}

export function places(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

export function format(n: number, unit: string, digits: number): string {
  const fixed = Number(n.toFixed(Math.min(digits, 6)));
  return `${Object.is(fixed, -0) ? 0 : fixed}${unit}`;
}

export function fraction(n: number, span: Range): number {
  if (span.max <= span.min) return 0;
  return Math.min(1, Math.max(0, (n - span.min) / (span.max - span.min)));
}

export function snap(at: number, span: Range): number {
  const raw = span.min + Math.min(1, Math.max(0, at)) * (span.max - span.min);
  const n = span.min + Math.round((raw - span.min) / span.step) * span.step;
  return Number(Math.min(span.max, Math.max(span.min, n)).toFixed(places(span.step)));
}

export function step(key: string, amount: Amount, times: number): string {
  const table = SCALES[key];
  const span = table.units[amount.unit];
  const digits = Math.max(places(span.step), places(Math.abs(amount.n)));
  const next = Math.min(table.ceiling, Math.max(table.floor, amount.n + times * span.step));
  return format(next, amount.unit, digits);
}

export function slide(key: string, amount: Amount, times: number): string {
  const span = SCALES[key].units[amount.unit];
  let next = amount.n + times * span.step;
  if (times > 0 && next > span.max) next = Math.max(amount.n, span.max);
  if (times < 0 && next < span.min) next = Math.min(amount.n, span.min);
  return format(next, amount.unit, Math.max(places(span.step), places(Math.abs(amount.n))));
}

export function rest(key: string, unit: string): number {
  const table = SCALES[key];
  const span = table.units[unit];
  return Math.min(span.max, Math.max(span.min, unit === table.unit ? table.rest : 0));
}
