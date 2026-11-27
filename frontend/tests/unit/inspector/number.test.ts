import { describe, expect, it } from 'vitest';
import { SCALES, format, fraction, parse, range, slide, snap, step, type Amount } from '../../../src/features/inspector/controls/number';

const FIELDS = ['opacity', 'width', 'height', 'max-width', 'gap', 'padding', 'margin', 'border-radius', 'font-size', 'line-height', 'letter-spacing', 'top', 'left'];

function read(key: string, text: string): Amount {
  const amount = parse(key, text);
  expect(amount, `${key}: ${text} should be read as one number`).not.toBeNull();
  return amount!;
}

describe('reading one number with its unit', () => {
  it('reads a number and a known unit for every slider field', () => {
    expect(parse('width', '12px')).toEqual({ n: 12, unit: 'px' });
    expect(parse('width', '50%')).toEqual({ n: 50, unit: '%' });
    expect(parse('height', '40vh')).toEqual({ n: 40, unit: 'vh' });
    expect(parse('max-width', '65ch')).toEqual({ n: 65, unit: 'ch' });
    expect(parse('gap', '1.5rem')).toEqual({ n: 1.5, unit: 'rem' });
    expect(parse('padding', '2em')).toEqual({ n: 2, unit: 'em' });
    expect(parse('margin', '-8px')).toEqual({ n: -8, unit: 'px' });
    expect(parse('border-radius', '12px')).toEqual({ n: 12, unit: 'px' });
    expect(parse('font-size', '1.125rem')).toEqual({ n: 1.125, unit: 'rem' });
    expect(parse('letter-spacing', '-0.02em')).toEqual({ n: -0.02, unit: 'em' });
    expect(parse('top', '-.5rem')).toEqual({ n: -0.5, unit: 'rem' });
    expect(parse('left', '25%')).toEqual({ n: 25, unit: '%' });
  });

  it('reads opacity and line height as plain numbers without a unit', () => {
    expect(parse('opacity', '0.5')).toEqual({ n: 0.5, unit: '' });
    expect(parse('opacity', '1')).toEqual({ n: 1, unit: '' });
    expect(parse('line-height', '1.55')).toEqual({ n: 1.55, unit: '' });
  });

  it('reads a bare zero as zero in the field default unit', () => {
    expect(parse('width', '0')).toEqual({ n: 0, unit: 'px' });
    expect(parse('margin', '0')).toEqual({ n: 0, unit: 'px' });
  });

  it.each([
    ['padding', '8px 16px'],
    ['margin', '0 auto'],
    ['width', 'calc(100% - 2rem)'],
    ['font-size', 'clamp(1rem, 2vw, 2rem)'],
    ['gap', 'var(--gap)'],
    ['max-width', 'var(--page-max)'],
    ['width', 'auto'],
    ['width', 'inherit'],
    ['font-size', 'larger'],
    ['line-height', 'normal'],
    ['width', 'fit-content'],
    ['width', '10Q'],
    ['height', '12zz'],
    ['opacity', '0.5 !important'],
    ['width', '12px !important'],
    ['width', '12'],
    ['font-size', '16'],
    ['opacity', '50%'],
    ['width', 'px'],
  ])('refuses %s: %s, so the slider is hidden and the value is left as it is', (key, text) => {
    expect(parse(key, text)).toBeNull();
  });
});

describe('stepping a number', () => {
  it('keeps the unit of the value', () => {
    expect(step('width', read('width', '12%'), 1)).toBe('13%');
    expect(step('width', read('width', '120px'), 1)).toBe('121px');
    expect(step('width', read('width', '121px'), -10)).toBe('111px');
    expect(step('margin', read('margin', '-8px'), 1)).toBe('-7px');
    expect(step('padding', read('padding', '8rem'), 1)).toBe('8.25rem');
    expect(step('max-width', read('max-width', '60ch'), -1)).toBe('59ch');
  });

  it('writes 0.1 plus 0.2 as 0.3 and never shows binary rounding noise', () => {
    expect(step('letter-spacing', read('letter-spacing', '0.1px'), 2)).toBe('0.3px');
    expect(step('letter-spacing', read('letter-spacing', '0.7px'), 1)).toBe('0.8px');
    expect(step('opacity', read('opacity', '0.56'), 1)).toBe('0.57');
    expect(step('font-size', read('font-size', '1rem'), 1)).toBe('1.05rem');
    expect(step('font-size', read('font-size', '1.1rem'), 3)).toBe('1.25rem');
    expect(step('width', read('width', '13.3px'), 1)).toBe('14.3px');
    expect(slide('opacity', read('opacity', '0.1'), 2)).toBe('0.12');
    expect(slide('opacity', read('opacity', '0.29'), -20)).toBe('0.09');
    expect(slide('letter-spacing', read('letter-spacing', '0.1px'), 2)).toBe('0.3px');
  });

  it('ten single steps of 0.1px from zero end at exactly 1px', () => {
    let text = '0px';
    for (let i = 0; i < 10; i++) text = step('letter-spacing', read('letter-spacing', text), 1);
    expect(text).toBe('1px');
    for (let i = 0; i < 10; i++) text = step('letter-spacing', read('letter-spacing', text), -1);
    expect(text).toBe('0px');
  });

  it('stops where CSS stops: opacity at 1, sizes at zero, while margin and letter spacing go negative', () => {
    expect(step('opacity', read('opacity', '1'), 1)).toBe('1');
    expect(step('opacity', read('opacity', '0'), -1)).toBe('0');
    expect(step('width', read('width', '0px'), -1)).toBe('0px');
    expect(step('padding', read('padding', '0px'), -1)).toBe('0px');
    expect(step('margin', read('margin', '0px'), -1)).toBe('-1px');
    expect(step('letter-spacing', read('letter-spacing', '0px'), -1)).toBe('-0.1px');
  });
});

describe('changing the unit', () => {
  it.each([
    ['width', '12px', 'rem', '12rem'],
    ['width', '12px', '%', '12%'],
    ['width', '111rem', '%', '111%'],
    ['line-height', '1.5', 'px', '1.5px'],
    ['line-height', '1.5px', '', '1.5'],
    ['gap', '0.125rem', 'em', '0.125em'],
    ['margin', '-24px', 'vw', '-24vw'],
  ])('%s %s in %s keeps the number and does not convert it', (key, text, unit, wanted) => {
    const before = read(key, text);
    const after = format(before.n, unit, 6);
    expect(after).toBe(wanted);
    expect(read(key, after)).toEqual({ n: before.n, unit });
  });
});

describe('the scale of a slider', () => {
  it('is opacity 0 to 1 by 0.01 and width 0 to 1600 pixels by 1', () => {
    expect(range('opacity', read('opacity', '0.5').unit)).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(range('width', read('width', '120px').unit)).toEqual({ min: 0, max: 1600, step: 1 });
  });

  it.each(FIELDS)('for %s is the same in each unit whatever the value is', key => {
    const units = Object.keys(SCALES[key].units);
    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) {
      const spans = ['0', '0.5', '5', '120', '2000', '99999', '-50', '-3000'].map(n => range(key, read(key, `${n}${unit}`).unit));
      expect(spans[0], `${key} in ${unit || 'no unit'}`).not.toBeNull();
      for (const span of spans) expect(span, `${key} in ${unit || 'no unit'}`).toEqual(spans[0]);
    }
  });

  it('moves a small and a very large value by the same amount per step', () => {
    expect(step('width', read('width', '5px'), 1)).toBe('6px');
    expect(step('width', read('width', '1500px'), 1)).toBe('1501px');
    expect(step('width', read('width', '50000px'), 1)).toBe('50001px');
    expect(slide('width', read('width', '5px'), 1)).toBe('6px');
    expect(slide('width', read('width', '1000px'), 1)).toBe('1001px');
    expect(slide('font-size', read('font-size', '0.5rem'), 1)).toBe('0.55rem');
    expect(slide('font-size', read('font-size', '5rem'), 1)).toBe('5.05rem');
  });
});

describe('a value beyond the range', () => {
  const width = (): NonNullable<ReturnType<typeof range>> => range('width', 'px')!;

  it('puts the thumb at the end of the track', () => {
    expect(fraction(read('width', '2000px').n, width())).toBe(1);
    expect(fraction(read('width', '-50px').n, width())).toBe(0);
    expect(fraction(read('width', '800px').n, width())).toBe(0.5);
    expect(fraction(read('opacity', '0.25').n, range('opacity', '')!)).toBe(0.25);
  });

  it('is kept as typed: reading it does not clamp it and a slider key outward leaves it alone', () => {
    expect(read('width', '2000px')).toEqual({ n: 2000, unit: 'px' });
    expect(read('width', '-50px')).toEqual({ n: -50, unit: 'px' });
    expect(slide('width', read('width', '2000px'), 1)).toBe('2000px');
    expect(slide('width', read('width', '2000px'), 10)).toBe('2000px');
    expect(slide('width', read('width', '2000px'), -1)).toBe('1999px');
    expect(step('width', read('width', '2000px'), 1)).toBe('2001px');
  });
});

describe('a position on the track', () => {
  it('halfway along the opacity track writes 0.5', () => {
    expect(snap(0.5, range('opacity', '')!)).toBe(0.5);
  });

  it('lands on a whole step with no rounding noise and stays inside the range', () => {
    expect(snap(0.57, range('opacity', '')!)).toBe(0.57);
    expect(snap(0.5, range('width', 'px')!)).toBe(800);
    expect(snap(1, range('width', 'px')!)).toBe(1600);
    expect(snap(1.4, range('width', 'px')!)).toBe(1600);
    expect(snap(-0.2, range('margin', 'px')!)).toBe(-200);
    expect(snap(0.5, range('margin', 'px')!)).toBe(0);
  });
});
