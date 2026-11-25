export const DARK_INK = '#111111';
export const LIGHT_INK = '#ffffff';

export function rgb(content: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(content.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? hex.replace(/./g, c => c + c) : hex;
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16)) as [number, number, number];
}

export function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function inkOn(background: string): string | null {
  const color = rgb(background);
  if (!color) return null;
  const light = luminance(color);
  const dark = (light + 0.05) / (luminance(rgb(DARK_INK)!) + 0.05);
  const white = (luminance(rgb(LIGHT_INK)!) + 0.05) / (light + 0.05);
  return dark >= white ? DARK_INK : LIGHT_INK;
}
