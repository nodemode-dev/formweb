import { describe, expect, it } from 'vitest';
import { alignGuides, alignOf, gridCells, landing, lineDistance, nearestSlot, slotsOf, spacing, trackSizes } from '../../../src/features/layout-grid';
import { dropTarget } from '../../../src/features/panel/drop';
import { makeSite } from '../site';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const column = { axis: 'y' as const, reverse: false };
const row = { axis: 'x' as const, reverse: false };

describe('the landing slots of a container', () => {
  it('a column of three elements has a slot before the first, one in the middle of each gap and one after the last', () => {
    const kids = [box(0, 0, 100, 20), box(0, 30, 80, 20), box(0, 60, 100, 10)];
    expect(slotsOf(kids, column)).toEqual([
      { index: 0, lines: [{ axis: 'y', at: 0, from: 0, to: 100 }] },
      { index: 1, lines: [{ axis: 'y', at: 25, from: 0, to: 100 }] },
      { index: 2, lines: [{ axis: 'y', at: 55, from: 0, to: 100 }] },
      { index: 3, lines: [{ axis: 'y', at: 70, from: 0, to: 100 }] }
    ]);
  });

  it('a row of two elements has upright slots at its left edge, in the gap and at its right edge', () => {
    const kids = [box(0, 0, 50, 40), box(60, 0, 50, 40)];
    expect(slotsOf(kids, row).map(slot => slot.lines)).toEqual([
      [{ axis: 'x', at: 0, from: 0, to: 40 }],
      [{ axis: 'x', at: 55, from: 0, to: 40 }],
      [{ axis: 'x', at: 110, from: 0, to: 40 }]
    ]);
  });

  it('where a grid wraps to its next row the slot is drawn both after the last cell of the row and before the first cell of the next', () => {
    const kids = [box(0, 0, 40, 20), box(50, 0, 40, 20), box(0, 30, 40, 20)];
    expect(slotsOf(kids, row)[2].lines).toEqual([
      { axis: 'x', at: 90, from: 0, to: 20 },
      { axis: 'x', at: 0, from: 30, to: 50 }
    ]);
  });

  it('a reversed row starts its slots at the right edge of the first element in document order', () => {
    const kids = [box(60, 0, 40, 10), box(0, 0, 40, 10)];
    expect(slotsOf(kids, { axis: 'x', reverse: true }).map(slot => slot.lines[0].at)).toEqual([100, 50, 0]);
  });

  it('an empty container has no slots, because the element goes inside it', () => {
    expect(slotsOf([], column)).toEqual([]);
  });
});

describe('snapping the pointer to the nearest slot', () => {
  const slots = slotsOf([box(0, 0, 100, 20), box(0, 30, 80, 20), box(0, 60, 100, 10)], column);

  it('the slot nearest the pointer wins, and a tie goes to the earlier one', () => {
    expect(nearestSlot(slots, 50, 12)?.index).toBe(0);
    expect(nearestSlot(slots, 50, 12.5)?.index).toBe(0);
    expect(nearestSlot(slots, 50, 13)?.index).toBe(1);
    expect(nearestSlot(slots, 50, 41)?.index).toBe(2);
    expect(nearestSlot(slots, 50, 200)?.index).toBe(3);
  });

  it('every pointer height inside and around the container lands on a slot, so there is no dead zone', () => {
    for (let y = -40; y <= 120; y += 0.5) expect(nearestSlot(slots, 50, y)).not.toBeNull();
  });

  it('the distance to a slot counts how far the pointer is beyond the ends of its line', () => {
    const line = { axis: 'y' as const, at: 10, from: 0, to: 100 };
    expect(lineDistance(line, 50, 14)).toBe(4);
    expect(lineDistance(line, 130, 10)).toBe(30);
    expect(lineDistance(line, 130, 14)).toBeCloseTo(Math.hypot(30, 4), 10);
  });

  it('of a wrapped slot the line nearer the pointer is the one shown', () => {
    const wrapped = slotsOf([box(0, 0, 40, 20), box(50, 0, 40, 20), box(0, 30, 40, 20)], row);
    expect(nearestSlot(wrapped, 92, 10)).toEqual({ index: 2, line: { axis: 'x', at: 90, from: 0, to: 20 } });
    expect(nearestSlot(wrapped, 1, 40)).toEqual({ index: 2, line: { axis: 'x', at: 0, from: 30, to: 50 } });
  });
});

describe('the tracks of a CSS grid', () => {
  it('reads pixel track sizes from a computed template and skips line names', () => {
    expect(trackSizes('100px [main-start] 200.5px 0px')).toEqual([100, 200.5, 0]);
    expect(trackSizes('none')).toEqual([]);
  });

  it('lays the cells out from the content box with the column and row gaps between them', () => {
    expect(gridCells(box(10, 20, 300, 100), [100, 100], [40, 40], 20, 10)).toEqual([
      box(10, 20, 100, 40), box(130, 20, 100, 40),
      box(10, 70, 100, 40), box(130, 70, 100, 40)
    ]);
  });

  it('a grid with columns but no explicit rows has one row as tall as its content box', () => {
    expect(gridCells(box(0, 0, 90, 50), [40, 40], [], 10, 0)).toEqual([box(0, 0, 40, 50), box(50, 0, 40, 50)]);
  });
});

describe('alignment guides', () => {
  it('names the edge the container lines its children up on', () => {
    expect(alignOf('block', column, 'normal', 'normal')).toBe('start');
    expect(alignOf('flex', row, 'center', 'normal')).toBe('center');
    expect(alignOf('flex', column, 'normal', 'normal')).toBe('stretch');
    expect(alignOf('flex', row, 'safe flex-end', 'normal')).toBe('end');
    expect(alignOf('flex', row, 'flex-start', 'normal')).toBe('start');
    expect(alignOf('grid', column, 'center', 'end')).toBe('end');
    expect(alignOf('flex', row, 'baseline', 'normal')).toBeNull();
  });

  it('draws the shared left edge through the neighbours of a slot in a column', () => {
    const neighbours = [box(10, 0, 100, 20), box(10, 30, 60, 20)];
    expect(alignGuides(neighbours, column, 'start')).toEqual([{ axis: 'x', at: 10, from: 0, to: 50 }]);
  });

  it('with stretch alignment only the edges the neighbours really share are drawn', () => {
    expect(alignGuides([box(10, 0, 100, 20), box(10, 30, 60, 20)], column, 'stretch')).toEqual([{ axis: 'x', at: 10, from: 0, to: 50 }]);
    expect(alignGuides([box(10, 0, 100, 20), box(10, 30, 100, 20)], column, 'stretch').map(guide => guide.at)).toEqual([10, 110]);
  });

  it('a centred column gets a guide through the shared centre, and none when the centres differ', () => {
    expect(alignGuides([box(10, 0, 100, 20), box(30, 30, 60, 20)], column, 'center').map(guide => guide.at)).toEqual([60]);
    expect(alignGuides([box(10, 0, 100, 20), box(0, 30, 60, 20)], column, 'center')).toEqual([]);
  });

  it('the guide reaches the slot when the slot lies beyond the neighbours', () => {
    expect(alignGuides([box(10, 0, 100, 20)], column, 'start', { axis: 'y', at: 45, from: 10, to: 110 })).toEqual([{ axis: 'x', at: 10, from: 0, to: 45 }]);
  });

  it('no alignment means no guide', () => {
    expect(alignGuides([box(0, 0, 10, 10)], row, null)).toEqual([]);
  });
});

describe('spacing measures', () => {
  it('shows the gap from each neighbour towards the slot, a quarter of the way across the neighbour', () => {
    expect(spacing(box(0, 0, 100, 20), box(0, 40, 100, 20), column, 12, 12)).toEqual([
      { axis: 'y', from: 20, to: 32, at: 25, value: 12 },
      { axis: 'y', from: 28, to: 40, at: 25, value: 12 }
    ]);
  });

  it('a gap of zero shows nothing, and a missing neighbour shows nothing on its side', () => {
    expect(spacing(box(0, 0, 100, 20), box(0, 40, 100, 20), column, 0, 0)).toEqual([]);
    expect(spacing(null, box(0, 40, 100, 20), column, 8, 8)).toEqual([{ axis: 'y', from: 32, to: 40, at: 25, value: 8 }]);
  });

  it('in a reversed row the measures point the other way', () => {
    expect(spacing(box(60, 0, 40, 10), box(0, 0, 40, 10), { axis: 'x', reverse: true }, 8, 8)).toEqual([
      { axis: 'x', from: 52, to: 60, at: 2.5, value: 8 },
      { axis: 'x', from: 40, to: 48, at: 2.5, value: 8 }
    ]);
  });
});

describe('the landing place in words', () => {
  const site = makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], {
    root: { tag: 'main', children: ['section', 'empty'] },
    section: { tag: 'section', children: ['first', 'second'] },
    first: { tag: 'h2' },
    second: { tag: 'h2' },
    empty: { tag: 'div' }
  });

  it('a drop between two elements reads before the next one', () => {
    const target = dropTarget(site, 'root', ['empty'], 'second', 'before')!;
    expect(landing(site, ['empty'], target)).toEqual({ en: 'Before {0}', values: ['second'] });
  });

  it('a drop after the last element reads inside its container, at the end', () => {
    const target = dropTarget(site, 'root', ['first'], 'second', 'after')!;
    expect(landing(site, ['first'], target)).toEqual({ en: 'Inside {0}, at the end', values: ['section'] });
  });

  it('a drop into an empty container reads inside it', () => {
    const target = dropTarget(site, 'root', ['first'], 'empty', 'into')!;
    expect(landing(site, ['first'], target)).toEqual({ en: 'Inside {0}', values: ['empty'] });
  });
});
