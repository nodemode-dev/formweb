import { describe, expect, it } from 'vitest';
import { NOMINAL_WIDTH, parseTracks, sameTracks } from '../../../src/features/inspector/controls/grid-tracks';

const COLUMN_LAYOUTS: Record<string, string> = {
  'One column': '1fr',
  '2 columns': '1fr 1fr',
  '3 columns': 'repeat(3, 1fr)',
  '4 columns': '1fr 1fr 1fr 1fr',
  '5 columns': '1fr 1fr 1fr 1fr 1fr',
  '6 columns': '1fr 1fr 1fr 1fr 1fr 1fr',
  'Narrow left, wide right': '1fr 2fr',
  'Wide left, narrow right': '2fr 1fr',
  'Slim left, wide right': '1fr 3fr',
  'Wide left, slim right': '3fr 1fr',
  'Fixed sidebar on the left': '240px 1fr',
  'Fixed sidebar on the right': '1fr 240px',
  'Wide middle': '1fr 2fr 1fr',
  'At least 160 px each': 'repeat(auto-fit, minmax(160px, 1fr))',
  'At least 200 px each': 'repeat(auto-fit, minmax(200px, 1fr))',
  'At least 240 px each': 'repeat(auto-fit, minmax(240px, 1fr))',
  'At least 320 px each': 'repeat(auto-fit, minmax(320px, 1fr))'
};

const ROW_LAYOUTS: Record<string, string> = {
  'One row': '1fr',
  '2 rows': '1fr 1fr',
  '3 rows': '1fr 1fr 1fr',
  'Header, content, footer': 'auto 1fr auto',
  'Header and content': 'auto 1fr'
};

const matching = (layouts: Record<string, string>, typed: string): string[] =>
  Object.entries(layouts).filter(([, css]) => sameTracks(typed, css)).map(([name]) => name);

const widths = (value: string): number[] => {
  const tracks = parseTracks(value);
  expect(tracks, `${value} should be drawn`).not.toBeNull();
  return tracks!;
};

describe('a hand-typed track list is matched to the one layout it means', () => {
  it.each([
    'repeat(3, 1fr)',
    '1fr 1fr 1fr',
    'repeat(3,1fr)',
    '  repeat( 3 , 1fr )  ',
    'REPEAT(3, 1FR)',
    '1fr  1fr\t1fr',
    '1FR 1fr 1Fr',
    '1fr repeat(2, 1fr)'
  ])('three equal columns written as %j match "3 columns" only', typed => {
    expect(matching(COLUMN_LAYOUTS, typed)).toEqual(['3 columns']);
  });

  it.each([
    ['1fr 2fr', 'Narrow left, wide right'],
    ['1FR  2FR', 'Narrow left, wide right'],
    ['2fr 1fr', 'Wide left, narrow right'],
    ['1fr 3fr', 'Slim left, wide right'],
    ['3fr 1fr', 'Wide left, slim right'],
    ['1fr 2fr 1fr', 'Wide middle']
  ])('the column ratio %j matches %j only, so left and right are never confused', (typed, name) => {
    expect(matching(COLUMN_LAYOUTS, typed)).toEqual([name]);
  });

  it.each([
    ['240px 1fr', 'Fixed sidebar on the left'],
    ['240PX   1fr', 'Fixed sidebar on the left'],
    ['1fr 240px', 'Fixed sidebar on the right']
  ])('the fixed sidebar %j matches %j only', (typed, name) => {
    expect(matching(COLUMN_LAYOUTS, typed)).toEqual([name]);
  });

  it.each([
    ['repeat(auto-fit, minmax(200px, 1fr))', 'At least 200 px each'],
    ['repeat( auto-fit , minmax( 200px , 1fr ) )', 'At least 200 px each'],
    ['REPEAT(AUTO-FIT, MINMAX(320PX, 1FR))', 'At least 320 px each'],
    ['repeat(auto-fit,minmax(160px,1fr))', 'At least 160 px each']
  ])('"as many as fit" written as %j matches %j only, by its minimum', (typed, name) => {
    expect(matching(COLUMN_LAYOUTS, typed)).toEqual([name]);
  });

  it.each([
    ['auto 1fr auto', 'Header, content, footer'],
    ['AUTO  1fr  Auto', 'Header, content, footer'],
    ['auto 1fr', 'Header and content'],
    ['repeat(3, 1fr)', '3 rows']
  ])('the rows %j match %j only', (typed, name) => {
    expect(matching(ROW_LAYOUTS, typed)).toEqual([name]);
  });

  it('two columns of equal width are not taken for three, nor three for two', () => {
    expect(matching(COLUMN_LAYOUTS, 'repeat(2, 1fr)')).toEqual(['2 columns']);
    expect(sameTracks('repeat(2, 1fr)', 'repeat(3, 1fr)')).toBe(false);
    expect(sameTracks('1fr 1fr', '1fr 1fr 1fr')).toBe(false);
  });
});

describe('a value the chooser does not offer matches nothing and is left alone', () => {
  it.each([
    '[full-start] 1fr [full-end]',
    'subgrid',
    'var(--cols)',
    'masonry',
    'repeat(3, minmax(0, 1fr))',
    'minmax(100px, 1fr) 2fr',
    'repeat(auto-fill, minmax(200px, 1fr))',
    'repeat(auto-fit, minmax(180px, 1fr))',
    '1fr 2fr 3fr',
    '250px 1fr',
    'repeat(3, 1fr',
    '1fr 2fr)',
    'calc(100% - 2rem) 1fr'
  ])('%j marks no column layout', typed => {
    expect(matching(COLUMN_LAYOUTS, typed)).toEqual([]);
  });

  it.each(['[full-start] 1fr [full-end]', 'subgrid', 'var(--cols)', 'masonry', 'repeat(3, 1fr', '1fr 2fr)', '(1fr 2fr', 'repeat(3, var(--track))'])(
    '%j cannot be drawn, so the chooser keeps its hands off it', typed => {
      expect(parseTracks(typed)).toBeNull();
    }
  );

  it('an empty value is drawn as no tracks at all and matches no layout', () => {
    expect(parseTracks('')).toEqual([]);
    expect(parseTracks('   ')).toEqual([]);
    expect(matching(COLUMN_LAYOUTS, '')).toEqual([]);
  });
});

describe('the drawing of a track list has the proportions CSS grid gives it', () => {
  it('three equal columns are drawn as three equal thirds however they are written', () => {
    for (const typed of ['repeat(3, 1fr)', '1fr 1fr 1fr', 'REPEAT(3, 1FR)', '1fr repeat(2, 1fr)']) {
      const tracks = widths(typed);
      expect(tracks, typed).toHaveLength(3);
      for (const track of tracks) expect(track, typed).toBeCloseTo(1 / 3, 3);
    }
  });

  it('fr shares divide the box in their ratio', () => {
    const half = widths('1fr 2fr');
    expect(half[0]).toBeCloseTo(1 / 3, 3);
    expect(half[1]).toBeCloseTo(2 / 3, 3);
    expect(widths('1fr 2fr 1fr').map(track => Number(track.toFixed(3)))).toEqual([0.25, 0.5, 0.25]);
  });

  it('a fixed sidebar keeps its pixels and the free track takes the rest of the box', () => {
    const left = widths('240px 1fr');
    expect(left[0]).toBeCloseTo(240 / NOMINAL_WIDTH, 3);
    expect(left[1]).toBeCloseTo(1 - 240 / NOMINAL_WIDTH, 3);
    const right = widths('1fr 240px');
    expect(right[1]).toBeCloseTo(240 / NOMINAL_WIDTH, 3);
  });

  it('"as many as fit" draws as many equal tracks as the minimum allows in the box', () => {
    for (const min of [160, 200, 240, 320]) {
      const tracks = widths(`repeat(auto-fit, minmax(${min}px, 1fr))`);
      expect(tracks, `${min}px`).toHaveLength(Math.floor(NOMINAL_WIDTH / min));
      for (const track of tracks) expect(track, `${min}px`).toBeCloseTo(1 / tracks.length, 3);
    }
  });

  it('header, content and footer rows draw the content row as the largest of three', () => {
    const tracks = widths('auto 1fr auto');
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toBeCloseTo(tracks[2], 6);
    expect(tracks[1]).toBeGreaterThan(tracks[0]);
  });
});
