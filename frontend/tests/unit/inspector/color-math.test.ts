import { describe, expect, it } from 'vitest';
import { hsvToRgb, parseColor, parseEntry, parseHex, parseRgb, rgbToHsv, toHex, type Rgba } from '../../../src/features/inspector/controls/color-math';

function read(parse: (text: string) => Rgba | null, text: string): Rgba {
  const color = parse(text);
  expect(color, `${text} should be read as a color`).not.toBeNull();
  return color!;
}

function channels(color: Rgba, r: number, g: number, b: number, a: number, text: string): void {
  for (const [name, seen, want] of [['red', color.r, r], ['green', color.g, g], ['blue', color.b, b]] as const) {
    expect(Math.abs(seen - want), `${text}: ${name} is ${seen}, CSS gives ${want}`).toBeLessThanOrEqual(0.5);
  }
  expect(color.a, `${text}: alpha`).toBeCloseTo(a, 4);
}

describe('hex colors in their four lengths', () => {
  it.each([
    ['#f00', 255, 0, 0, 1],
    ['#abc', 0xaa, 0xbb, 0xcc, 1],
    ['#ABC', 0xaa, 0xbb, 0xcc, 1],
    ['#f008', 255, 0, 0, 0x88 / 255],
    ['#0000', 0, 0, 0, 0],
    ['#336699', 0x33, 0x66, 0x99, 1],
    ['#C8F25A', 200, 242, 90, 1],
    ['#11223344', 0x11, 0x22, 0x33, 0x44 / 255],
    ['#ff000080', 255, 0, 0, 0x80 / 255],
    ['#ffffffff', 255, 255, 255, 1],
  ])('reads %s as its red, green, blue and alpha', (text, r, g, b, a) => {
    channels(read(parseHex, text), r, g, b, a, text);
  });

  it('reads a hex code typed in the entry with or without its hash', () => {
    channels(read(parseEntry, '5b4636'), 0x5b, 0x46, 0x36, 1, '5b4636');
    channels(read(parseEntry, '#5b4636'), 0x5b, 0x46, 0x36, 1, '#5b4636');
    channels(read(parseEntry, '  #5b4636  '), 0x5b, 0x46, 0x36, 1, 'padded #5b4636');
  });

  it.each(['', '#', '#12', '#12345', '#1234567', '#123456789', '#ggg', '#12345g', '##123', 'nonsense', '# 123'])('refuses %j as a hex color', text => {
    expect(parseHex(text)).toBeNull();
  });
});

describe('rgb() and rgba() in comma and space forms', () => {
  it.each([
    ['rgb(255, 0, 0)', 255, 0, 0, 1],
    ['rgb(255,0,0)', 255, 0, 0, 1],
    ['rgba(0, 128, 255, 0.5)', 0, 128, 255, 0.5],
    ['rgba(0, 128, 255, .25)', 0, 128, 255, 0.25],
    ['rgba(1, 2, 3)', 1, 2, 3, 1],
    ['rgb(1, 2, 3, 0.5)', 1, 2, 3, 0.5],
    ['rgb(0 128 255)', 0, 128, 255, 1],
    ['rgb(0 128 255 / 0.25)', 0, 128, 255, 0.25],
    ['rgb(0 128 255 / 25%)', 0, 128, 255, 0.25],
    ['rgba(91 70 54 / 1)', 91, 70, 54, 1],
    ['rgb(100%, 50%, 0%)', 255, 127.5, 0, 1],
    ['rgba(100%, 0%, 0%, 50%)', 255, 0, 0, 0.5],
    ['rgb(20% 40% 60% / 0.8)', 51, 102, 153, 0.8],
    ['RGB(91, 70, 54)', 91, 70, 54, 1],
  ])('reads %s as its red, green, blue and alpha', (text, r, g, b, a) => {
    channels(read(parseRgb, text), r, g, b, a, text);
    channels(read(parseEntry, text), r, g, b, a, `${text} in the entry`);
  });

  it.each(['rgb(1, 2)', 'rgb(a, b, c)', 'rgb(1, 2, 3', 'rgb 1, 2, 3', 'rgb(1, 2 3)', 'rgb()', 'rgbx(1, 2, 3)', 'rgb(1 2 3 4)', 'rgb(1 2 / 3)'])('refuses %j', text => {
    expect(parseRgb(text)).toBeNull();
    expect(parseEntry(text)).toBeNull();
  });
});

describe('text that is not a color', () => {
  it.each(['', 'nonsense', 'blue-ish', '#12', 'rgb(1, 2)', 'var(--accent)', 'linear-gradient(#fff, #000)', 'url(x.png)', '12px'])('is refused: %j', text => {
    expect(parseColor(text)).toBeNull();
    expect(parseEntry(text)).toBeNull();
  });
});

describe('hue, saturation and brightness', () => {
  it.each([
    ['#ff0000', 0],
    ['#ffff00', 60],
    ['#00ff00', 120],
    ['#00ffff', 180],
    ['#0000ff', 240],
    ['#ff00ff', 300],
  ])('%s is a full, bright color of hue %i', (hex, hue) => {
    const hsv = rgbToHsv(read(parseHex, hex));
    expect(hsv.h).toBeCloseTo(hue, 6);
    expect(hsv.s).toBeCloseTo(1, 6);
    expect(hsv.v).toBeCloseTo(1, 6);
    expect(hsv.a).toBe(1);
  });

  it('black has no brightness, white and grays have no saturation', () => {
    expect(rgbToHsv(read(parseHex, '#000000')).v).toBe(0);
    expect(rgbToHsv(read(parseHex, '#ffffff'))).toMatchObject({ s: 0, v: 1 });
    const gray = rgbToHsv(read(parseHex, '#808080'));
    expect(gray.s).toBe(0);
    expect(gray.v).toBeCloseTo(128 / 255, 6);
  });

  it('a half saturated, half bright blue is #404080', () => {
    expect(toHex(hsvToRgb({ h: 240, s: 0.5, v: 0.5, a: 1 }))).toBe('#404080');
  });

  it.each([
    '#000000', '#ffffff', '#808080', '#7f7f7f', '#010101', '#fefefe', '#c0c0c0',
    '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff',
    '#336699', '#c8f25a', '#5b4636', '#123456', '#fedcba', '#0b6f79', '#d6f05d', '#7f0001', '#010203',
    '#ff000080', '#12345678', '#00000000', '#abcdef01',
  ])('%s goes to hue, saturation and brightness and back to the same hex', hex => {
    expect(toHex(hsvToRgb(rgbToHsv(read(parseHex, hex))))).toBe(hex);
  });
});

describe('what is written for a free color', () => {
  it('an opaque color is written as lowercase #rrggbb', () => {
    expect(toHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000');
    expect(toHex({ r: 0xab, g: 0xcd, b: 0xef, a: 1 })).toBe('#abcdef');
    expect(toHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(toHex(read(parseHex, '#ABC'))).toBe('#aabbcc');
    expect(toHex(read(parseRgb, 'rgb(0, 128, 255)'))).toBe('#0080ff');
  });

  it('a color below full opacity is written as lowercase #rrggbbaa', () => {
    expect(toHex({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('#ff000080');
    expect(toHex({ r: 0xc8, g: 0xf2, b: 0x5a, a: 0x80 / 255 })).toBe('#c8f25a80');
    expect(toHex({ r: 0xab, g: 0xcd, b: 0xef, a: 0 })).toBe('#abcdef00');
    expect(toHex(read(parseRgb, 'rgba(255, 0, 0, 0.5)'))).toBe('#ff000080');
    expect(toHex(read(parseHex, '#F008'))).toBe('#ff000088');
  });

  it('every written color is seven or nine lowercase hex characters', () => {
    for (const text of ['#ABC', 'rgb(100%, 50%, 0%)', 'rgb(0 128 255 / 25%)', '#11223344', 'RGB(91, 70, 54)']) {
      expect(toHex(read(parseEntry, text))).toMatch(/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/);
    }
  });
});
