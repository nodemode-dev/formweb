import { describe, expect, it } from 'vitest';
import { arrange, backdropLayers, carryAttrs, compact, emptyOutcome, mapTag, pickFonts, reduceStyles, refusal, scopeSelector, summary, type Run } from '../../../src/features/convert/rules';
import { t, tn } from '../../../src/i18n';

const attrs = (pairs: Record<string, string>) => Object.entries(pairs).map(([name, value]) => ({ name, value }));

describe('which tags become which elements', () => {
  it('an old font, u or center tag becomes an element the engine takes, with its look left to the styles', () => {
    expect(mapTag('FONT')).toEqual({ kind: 'node', tag: 'span' });
    expect(mapTag('u')).toEqual({ kind: 'node', tag: 'span' });
    expect(mapTag('CENTER')).toEqual({ kind: 'node', tag: 'div' });
    expect(mapTag('h2')).toEqual({ kind: 'node', tag: 'h2' });
  });

  it('scripts, inline frames, vector graphics, embedded objects and custom elements stay as code', () => {
    expect(mapTag('script')).toEqual({ kind: 'keep', part: 'script' });
    expect(mapTag('iframe')).toEqual({ kind: 'keep', part: 'frame' });
    expect(mapTag('svg')).toEqual({ kind: 'keep', part: 'vector' });
    expect(mapTag('embed')).toEqual({ kind: 'keep', part: 'object' });
    expect(mapTag('my-widget')).toEqual({ kind: 'keep', part: 'other' });
  });

  it('a picture element gives way to its image and a noscript block is left out', () => {
    expect(mapTag('picture')).toEqual({ kind: 'unwrap' });
    expect(mapTag('noscript')).toEqual({ kind: 'drop' });
  });
});

describe('which attributes travel to the new element', () => {
  it('event handlers and javascript: links never travel, and each one is counted', () => {
    const carried = carryAttrs('a', attrs({ href: 'javascript:alert(1)', onclick: 'go()', onmouseover: 'x()', title: 'Hi' }));
    expect(carried.attrs).toEqual({ title: 'Hi' });
    expect(carried.scripted).toBe(3);
  });

  it('a page link, an outside link and an image source travel as written', () => {
    expect(carryAttrs('a', attrs({ href: '/about#team', target: '_blank' })).attrs).toEqual({ href: '/about#team', target: '_blank' });
    expect(carryAttrs('a', attrs({ href: 'https://example.com/x' })).attrs).toEqual({ href: 'https://example.com/x' });
    expect(carryAttrs('img', attrs({ src: '/api/assets/abc.png', alt: 'Harbour', width: '600', height: '360' })).attrs).toEqual({ src: '/api/assets/abc.png', alt: 'Harbour', width: '600', height: '360' });
  });

  it('classes and presentational sizes on table cells stay behind, since the styles carry the look', () => {
    expect(carryAttrs('td', attrs({ class: 'style1', width: '180', bgcolor: '#ddd', colspan: '2' })).attrs).toEqual({ colspan: '2' });
  });

  it('a data: link and an unknown link target are left out', () => {
    const carried = carryAttrs('a', attrs({ href: 'data:text/html,hi', target: 'popup' }));
    expect(carried.attrs).toEqual({});
    expect(carried.dropped).toBe(1);
  });
});

describe('reducing a measured style to what the element needs', () => {
  const plain = { display: 'block', color: 'rgb(0, 0, 0)', 'font-size': '16px', 'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px', 'background-image': 'none', float: 'none' };

  it('a value equal to the element default is left out and a different one is kept', () => {
    const reduced = reduceStyles({ ...plain, color: 'rgb(18, 52, 59)' }, plain);
    expect(reduced.styles).toEqual({ color: 'rgb(18, 52, 59)' });
  });

  it('a forced value is stated even when it equals the default', () => {
    expect(reduceStyles(plain, plain, ['color']).styles).toEqual({ color: 'rgb(0, 0, 0)' });
  });

  it('a url() background picture is left out and counted, and a gradient is kept', () => {
    const picture = reduceStyles({ ...plain, 'background-image': 'url("https://example.com/bg.png")', 'background-size': 'cover' }, { ...plain, 'background-size': 'auto' });
    expect(picture.styles).toEqual({});
    expect(picture.pictures).toBe(1);
    const gradient = reduceStyles({ ...plain, 'background-image': 'linear-gradient(red, blue)' }, plain);
    expect(gradient.styles).toEqual({ 'background-image': 'linear-gradient(red, blue)' });
  });

  it('a float is counted and left out, because the engine has no float property', () => {
    const reduced = reduceStyles({ ...plain, float: 'left' }, plain);
    expect(reduced.styles).toEqual({});
    expect(reduced.floats).toBe(1);
  });

  it('a border whose style is none counts as no border whatever its colour', () => {
    const none = { ...plain, 'border-top': '0px none rgb(255, 0, 0)', 'border-top-style': 'none' };
    expect(reduceStyles(none, { ...plain, 'border-top': '0px none rgb(0, 0, 0)', 'border-top-style': 'none' }).styles).toEqual({});
  });

  it('four margins that all differ become one shorthand, and a box model with no size set is dropped', () => {
    const measured = { ...plain, 'margin-top': '8px', 'margin-right': '8px', 'margin-bottom': '8px', 'margin-left': '8px', 'box-sizing': 'content-box' };
    const reduced = reduceStyles(measured, { ...plain, 'box-sizing': 'border-box' });
    expect(compact(reduced.styles, measured)).toEqual({ margin: '8px' });
  });

  it('the box model stays where a set width meets padding', () => {
    const measured = { ...plain, width: '580px', 'padding-top': '16px', 'box-sizing': 'content-box' };
    const reduced = reduceStyles(measured, { ...plain, width: 'auto', 'padding-top': '0px', 'box-sizing': 'border-box' });
    expect(compact(reduced.styles, measured)).toEqual({ width: '580px', 'padding-top': '16px', 'box-sizing': 'content-box' });
  });
});

describe('text and child elements', () => {
  const el = (name: string, inline: boolean): Run<string> => ({ el: name, inline });

  it('the text before the first child is the element text and later text becomes its own span', () => {
    const result = arrange<string>([{ text: 'Hello ' }, el('strong', true), { text: ' again' }], { pre: false, block: true, boxed: false });
    expect(result).toEqual({ text: 'Hello ', children: [{ el: 'strong' }, { text: ' again' }] });
  });

  it('white space collapses, and is trimmed at the edges of a block', () => {
    expect(arrange<string>([{ text: '\n   Two   words \n' }], { pre: false, block: true, boxed: false })).toEqual({ text: 'Two words', children: [] });
  });

  it('a space between two links is kept, a space between two blocks or in a flex box is not', () => {
    expect(arrange<string>([el('a', true), { text: ' ' }, el('a', true)], { pre: false, block: true, boxed: false }).children).toEqual([{ el: 'a' }, { text: ' ' }, { el: 'a' }]);
    expect(arrange<string>([el('div', false), { text: '\n  ' }, el('div', false)], { pre: false, block: true, boxed: false }).children).toEqual([{ el: 'div' }, { el: 'div' }]);
    expect(arrange<string>([el('a', true), { text: ' ' }, el('a', true)], { pre: false, block: true, boxed: true }).children).toEqual([{ el: 'a' }, { el: 'a' }]);
  });

  it('preformatted text keeps its spaces and line breaks', () => {
    expect(arrange<string>([{ text: '  a\n  b' }], { pre: true, block: true, boxed: false }).text).toBe('  a\n  b');
  });
});

describe('the result sentence', () => {
  it('says how many elements were converted, which parts stayed as code, that responsive rules were not carried over and what to do about phone widths', () => {
    const outcome = { ...emptyOutcome(), converted: 48, parts: { script: 1, frame: 1, vector: 1 }, responsive: 4 };
    expect(summary(outcome, t, tn)).toBe('Converted 48 elements. 3 parts stayed as code: a script, an inline frame, a vector graphic. Responsive rules were not carried over. Check it at phone width in Preview, then adjust under each breakpoint.');
  });

  it('says nothing about phone widths when the page had no responsive rules', () => {
    const outcome = { ...emptyOutcome(), converted: 3 };
    expect(summary(outcome, t, tn)).toBe('Converted 3 elements.');
  });

  it('names every kind of loss it counted, and nothing it did not', () => {
    const outcome = { ...emptyOutcome(), converted: 1, pictures: 2, floats: 1, scripted: 3, refused: 1, left: 1 };
    expect(summary(outcome, t, tn)).toBe('Converted 1 element. 2 background pictures were left out: FormWeb styles take no url() pictures. 1 float was left out: FormWeb has no float property. 3 event handlers and script links were left out. 2 values the engine does not take were left out.');
  });
});

describe('keeping left-over code to itself', () => {
  it('every selector is kept inside the code element, and the page body becomes the element itself', () => {
    const scope = '[data-fw-node="x"]';
    expect(scopeSelector('body', scope)).toBe(scope);
    expect(scopeSelector('html body .card, p', scope)).toBe(`${scope} .card, ${scope} p`);
    expect(scopeSelector('body > main', scope)).toBe(`${scope} > main`);
    expect(scopeSelector(`${scope} h2`, scope)).toBe(`${scope} h2`);
  });
});

describe('what an engine refusal takes out', () => {
  it('a refused style names the property and the element, a refused attribute names the attribute', () => {
    expect(refusal('command 4: unsafe style grid-row on cv-12')).toEqual({ style: 'grid-row', node: 'cv-12' });
    expect(refusal('unsupported attribute lang')).toEqual({ attr: 'lang' });
    expect(refusal('page root is missing')).toBeNull();
  });
});

describe('fonts that come with the page', () => {
  const sha = 'a'.repeat(64);

  it('a stored WOFF2 face a converted element uses is added to the site fonts', () => {
    const fonts = pickFonts([{ family: '"Brand Sans"', src: `url("/api/assets/${sha}.woff2") format("woff2")`, weight: '700', style: 'normal' }], new Set(['brand sans']), {});
    expect(fonts).toEqual({ 'brand-sans-700': { family: 'Brand Sans', src: `/api/assets/${sha}.woff2`, weight: '700', style: 'normal', display: 'swap' } });
  });

  it('a face no element uses, or one from another website, is not added', () => {
    expect(pickFonts([{ family: 'Unused', src: `url(/api/assets/${sha}.woff2)`, weight: '400', style: 'normal' }], new Set(['brand sans']), {})).toEqual({});
    expect(pickFonts([{ family: 'Remote', src: 'url(https://fonts.example/r.woff2)', weight: '400', style: 'normal' }], new Set(['remote']), {})).toEqual({});
  });
});

describe('background pictures behind the content', () => {
  const origin = 'http://127.0.0.1:8000';
  const hero = `${origin}/api/assets/${'b'.repeat(64)}.jpg`;

  it('a cover picture from the site assets under a dark gradient becomes the picture with the gradient above it', () => {
    const found = backdropLayers(`linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45)), url("${hero}")`, 'auto, cover', '0% 0%, 50% 50%', origin);
    expect(found).toEqual({ dropped: 0, layers: [
      { kind: 'picture', src: `/api/assets/${'b'.repeat(64)}.jpg`, fit: 'cover', position: '50% 50%' },
      { kind: 'paint', image: 'linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45))' }
    ] });
  });

  it('a picture from another website or a tiled pattern is dropped and counted, and a plain gradient is left to the styles', () => {
    expect(backdropLayers('url("https://cdn.example/a.jpg")', 'cover', '50% 50%', origin)).toEqual({ layers: [], dropped: 1 });
    expect(backdropLayers(`url("${hero}")`, 'auto', '0% 0%', origin)).toEqual({ layers: [], dropped: 1 });
    expect(backdropLayers('linear-gradient(red, blue)', 'auto', '0% 0%', origin)).toEqual({ layers: [], dropped: 0 });
  });
});
