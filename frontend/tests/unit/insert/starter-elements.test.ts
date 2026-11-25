import { describe, expect, it } from 'vitest';
import { starterStyles, type StarterPart } from '../../../src/features/starter-elements';
import { makeSite } from '../site';

function rgb(hex: string): number[] {
  const full = hex.replace('#', '');
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16) / 255);
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function siteWith(tokens: Record<string, string>) {
  const site = makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], { root: { tag: 'main' } });
  site.tokens = tokens;
  return site;
}
function backgroundHex(site: ReturnType<typeof siteWith>, value: string): string {
  const token = /^var\(--([\w-]+)(?:,\s*(#[0-9a-f]{6}))?\)$/i.exec(value);
  if (!token) return value;
  return site.tokens[token[1]] ?? token[2] ?? '';
}

const ALL: StarterPart[] = ['section', 'heading', 'paragraph', 'button', 'link', 'form', 'formLabel', 'formInput', 'formSubmit', 'grid', 'gridItem', 'embed'];

describe('the styles an inserted element starts with', () => {
  it('a Section has no background of its own, only its spacing, so it shows the page it lands on', () => {
    const section = starterStyles(siteWith({ accent: '#d6f05d' })).section;
    expect(section.background).toBeUndefined();
    expect(section['background-color']).toBeUndefined();
    expect(section.color).toBeUndefined();
    expect(section.padding).toBeTruthy();
  });

  it('every part without a fill of its own takes its text colour from the page', () => {
    const styles = starterStyles(siteWith({ accent: '#d6f05d' }));
    for (const part of ALL) {
      const own = styles[part];
      const filled = own.background && own.background !== 'transparent';
      if (!filled) expect([undefined, 'inherit'], part).toContain(own.color);
    }
  });

  it.each([['a light accent', { accent: '#d6f05d' }], ['a dark accent', { accent: '#1a237e' }], ['no accent at all', {}]])('a filled button keeps readable text on %s', (_name, tokens) => {
    const site = siteWith(tokens);
    const styles = starterStyles(site);
    for (const part of ALL) {
      const own = styles[part];
      if (!own.background || own.background === 'transparent') continue;
      const fill = backgroundHex(site, own.background);
      expect(fill, part).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(own.color, fill), part).toBeGreaterThanOrEqual(4.5);
    }
  });
});
