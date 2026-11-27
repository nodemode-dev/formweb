import { describe, expect, it } from 'vitest';
import { parseGradient, reverseStops, serializeGradient, type Gradient, type GradientStop } from '../../../src/features/inspector/controls/gradient-model';

function read(text: string): Gradient {
  const gradient = parseGradient(text);
  expect(gradient, `${text} should be read as a gradient`).not.toBeNull();
  return gradient!;
}

const stops = (gradient: Gradient): [string, number][] => gradient.stops.map(stop => [stop.color, stop.position]);

function positions(gradient: Gradient): number[] {
  return gradient.stops.map(stop => stop.position);
}

function written(text: string): string {
  return serializeGradient(read(text));
}

describe('gradients the tab can show', () => {
  it('reads a linear gradient with an angle in degrees and its stops', () => {
    const gradient = read('linear-gradient(135deg, #5b3cc4 0%, #c0398f 50%, #a594df 100%)');
    expect(gradient.kind).toBe('linear');
    expect(gradient.angle).toBe(135);
    expect(stops(gradient)).toEqual([['#5b3cc4', 0], ['#c0398f', 50], ['#a594df', 100]]);
  });

  it.each(['top', 'right', 'bottom', 'left', 'top right', 'bottom left'])('reads a linear gradient towards %s and keeps that direction when written', side => {
    const gradient = read(`linear-gradient(to ${side}, #000000 10%, #ffffff 90%)`);
    expect(gradient.kind).toBe('linear');
    expect(stops(gradient)).toEqual([['#000000', 10], ['#ffffff', 90]]);
    expect(serializeGradient(gradient)).toBe(`linear-gradient(to ${side}, #000000 10%, #ffffff 90%)`);
  });

  it('reads a circle at a position', () => {
    const gradient = read('radial-gradient(circle at 20% 30%, #ffffff 0%, #000000 100%)');
    expect(gradient.kind).toBe('radial');
    expect(gradient.shape).toBe('circle');
    expect(stops(gradient)).toEqual([['#ffffff', 0], ['#000000', 100]]);
    expect(serializeGradient(gradient)).toMatch(/^radial-gradient\(circle at 20% 30%, #ffffff 0%, #000000 100%\)$/);
  });

  it('reads an ellipse, and a radial gradient with no shape is an ellipse as in CSS', () => {
    expect(read('radial-gradient(ellipse at center, red 0%, blue 100%)').shape).toBe('ellipse');
    const plain = read('radial-gradient(red, blue)');
    expect(plain.kind).toBe('radial');
    expect(plain.shape).toBe('ellipse');
    expect(stops(plain)).toEqual([['red', 0], ['blue', 100]]);
  });

  it('keeps an extent keyword of a radial gradient', () => {
    const gradient = read('radial-gradient(circle closest-side at 50% 50%, #ff0000 0%, #0000ff 100%)');
    expect(gradient.shape).toBe('circle');
    expect(serializeGradient(gradient)).toContain('closest-side');
    expect(serializeGradient(gradient)).toContain('at 50% 50%');
  });

  it('reads stops of every color form, three or more of them', () => {
    const gradient = read('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgba(0, 0, 255, 0.5) 25%, hsl(120 50% 50%) 50%, transparent 75%, rebeccapurple 100%)');
    expect(stops(gradient)).toEqual([['rgb(255, 0, 0)', 0], ['rgba(0, 0, 255, 0.5)', 25], ['hsl(120 50% 50%)', 50], ['transparent', 75], ['rebeccapurple', 100]]);
  });

  it('keeps a stop that is a token as var(--name) when read and written', () => {
    const gradient = read('linear-gradient(to right, var(--accent) 40%, rgba(255, 255, 255, .2) 100%)');
    expect(gradient.stops[0].color).toBe('var(--accent)');
    expect(serializeGradient(gradient)).toContain('var(--accent) 40%');
    const fallback = read('linear-gradient(90deg, var(--sea, #0b6f79), #ffffff)');
    expect(fallback.stops[0].color).toBe('var(--sea, #0b6f79)');
    expect(serializeGradient(fallback)).toContain('var(--sea, #0b6f79) 0%');
  });
});

describe('stop positions the way CSS fills them in', () => {
  it.each([
    ['linear-gradient(red, blue)', [0, 100]],
    ['linear-gradient(red, green, blue)', [0, 50, 100]],
    ['linear-gradient(red, orange, yellow, green, blue)', [0, 25, 50, 75, 100]],
    ['linear-gradient(red 20%, green, blue 80%)', [20, 50, 80]],
    ['linear-gradient(red, green 40%, blue, white)', [0, 40, 70, 100]],
    ['linear-gradient(red 30%, blue 60%)', [30, 60]],
    ['linear-gradient(red 10%, green, blue, white 70%)', [10, 30, 50, 70]],
  ])('%s puts its stops at %j', (text, want) => {
    expect(positions(read(text))).toEqual(want);
  });

  it.each([
    ['linear-gradient(red 50%, blue 20%)', [50, 50]],
    ['linear-gradient(red 40%, green, blue 10%)', [40, 40, 40]],
    ['linear-gradient(red 0%, green 60%, blue 30%, white 100%)', [0, 60, 60, 100]],
    ['linear-gradient(red 80%, green, blue 50%)', [80, 80, 80]],
  ])('%s clamps a position that goes back to %j', (text, want) => {
    expect(positions(read(text))).toEqual(want);
  });

  it('writes every position, so a gradient typed without positions means the same once written', () => {
    expect(written('linear-gradient(90deg, red, green, blue)')).toBe('linear-gradient(90deg, red 0%, green 50%, blue 100%)');
    expect(written('linear-gradient(90deg, red 50%, blue 20%)')).toBe('linear-gradient(90deg, red 50%, blue 50%)');
  });
});

describe('writing back', () => {
  const samples = [
    'linear-gradient(135deg, #5b3cc4 0%, #c0398f 50%, #a594df 100%)',
    'linear-gradient(to right, var(--accent) 40%, rgba(255, 255, 255, .2) 100%)',
    'linear-gradient(to bottom left, red, blue)',
    'linear-gradient(red 40%, green, blue 10%)',
    'linear-gradient(45deg, hsl(10 80% 50%), color-mix(in srgb, var(--sea) 55%, white) 70%, #000)',
    'radial-gradient(circle at 20% 30%, #ffffff 0%, #000000 100%)',
    'radial-gradient(ellipse, #5b3cc4, #a594df)',
    'radial-gradient(red 10%, green, blue)',
  ];

  it.each(samples)('%s means the same once written: same kind, direction, shape and stops', text => {
    const first = read(text);
    const again = read(serializeGradient(first));
    expect(again).toEqual(first);
  });

  it.each(samples)('%s written, read and written again gives the same text', text => {
    const once = written(text);
    expect(written(once)).toBe(once);
  });

  it.each(samples)('%s is written as one plain CSS gradient with every stop position in percent, sorted', text => {
    const out = written(text);
    expect(out).toMatch(/^(?:linear|radial)-gradient\(.*\)$/);
    expect(out).not.toMatch(/^repeating|conic/);
    const model = read(text);
    const found = positions(model);
    expect(found).toEqual([...found].sort((a, b) => a - b));
    expect(out.endsWith(`${model.stops.map(stop => `${stop.color} ${stop.position}%`).join(', ')})`), out).toBe(true);
  });
});

describe('gradients the tab leaves alone', () => {
  it.each([
    ['conic', 'conic-gradient(red, blue)'],
    ['conic with an angle', 'conic-gradient(from 90deg, red, blue)'],
    ['repeating linear', 'repeating-linear-gradient(90deg, red 0%, blue 20%)'],
    ['repeating radial', 'repeating-radial-gradient(circle, red 0%, blue 20%)'],
    ['two layers', 'linear-gradient(red, blue), linear-gradient(90deg, #fff, #000)'],
    ['a gradient over an image', 'linear-gradient(red, blue), url(x.png)'],
    ['a color hint', 'linear-gradient(red, 30%, blue)'],
    ['a calc() position', 'linear-gradient(red calc(10% + 5px), blue)'],
    ['a stop with two positions', 'linear-gradient(red 10% 20%, blue)'],
    ['a position over 100%', 'linear-gradient(red 0%, blue 120%)'],
    ['a position under 0%', 'linear-gradient(red -10%, blue 100%)'],
    ['a position in px', 'linear-gradient(red 10px, blue)'],
    ['a position in em', 'linear-gradient(red, blue 2em)'],
    ['an angle in turns', 'linear-gradient(0.25turn, red, blue)'],
    ['an angle in radians', 'linear-gradient(1rad, red, blue)'],
    ['an angle in grads', 'linear-gradient(100grad, red, blue)'],
    ['an interpolation color space', 'linear-gradient(in oklch, red, blue)'],
    ['an angle and an interpolation color space', 'linear-gradient(90deg in oklch, red, blue)'],
    ['a radial interpolation color space', 'radial-gradient(circle in hsl longer hue, red, blue)'],
    ['an unclosed gradient', 'linear-gradient(red, blue'],
    ['an unclosed stop color', 'linear-gradient(red, rgb(0, 0, 0)'],
    ['an extra closing parenthesis', 'linear-gradient(red, blue))'],
    ['one stop only', 'linear-gradient(red)'],
    ['text after the gradient', 'linear-gradient(red, blue) no-repeat'],
    ['a plain color', '#ff0000'],
    ['nothing', ''],
  ])('refuses %s', (_name, text) => {
    expect(parseGradient(text)).toBeNull();
  });
});

describe('reversing', () => {
  const start: GradientStop[] = [{ color: '#ff0000', position: 0 }, { color: 'var(--sea)', position: 30 }, { color: '#0000ff', position: 100 }];

  it('swaps the colors end for end, each stop mirrored along the line', () => {
    expect(reverseStops(start)).toEqual([{ color: '#0000ff', position: 0 }, { color: 'var(--sea)', position: 70 }, { color: '#ff0000', position: 100 }]);
  });

  it('reversing twice returns the start', () => {
    expect(reverseStops(reverseStops(start))).toEqual(start);
    const typed = read('radial-gradient(circle at 20% 30%, red 10%, green 25%, blue 90%)');
    expect(reverseStops(reverseStops(typed.stops))).toEqual(typed.stops);
  });
});
