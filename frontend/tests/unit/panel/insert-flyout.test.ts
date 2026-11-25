import { beforeEach, describe, expect, it } from 'vitest';
import { installInsertFlyout, type FlyoutGroup, type InsertFlyout } from '../../../src/features/panel/insert-flyout';

let host: HTMLElement;
let anchor: HTMLButtonElement;
let flyout: InsertFlyout;
let inserted: string[];
let openedAll: number;
let viaRun: number;

const item = (id: string, label: string) => ({ id, label, icon: 'plus' as const, raw: true, run: () => { inserted.push(id); } });
const groups = (): FlyoutGroup[] => [
  { id: 'elements', title: 'Elements', items: [item('heading', 'Heading'), item('text', 'Text'), item('image', 'Image'), item('button', 'Button')] },
  { id: 'sections', title: 'Sections', items: [item('hero', 'Hero section'), item('pricing', 'Pricing table')] },
  { id: 'components', title: 'Components', items: [item('badge', 'Ferry badge')] }
];

const panel = (): HTMLElement => host.querySelector<HTMLElement>('.fw-flyout')!;
const filter = (): HTMLInputElement => host.querySelector<HTMLInputElement>('.fw-flyout-filter')!;
const visibleRows = (): string[] => Array.from(host.querySelectorAll<HTMLElement>('.fw-flyout-items .fw-flyout-row')).filter(row => !row.hidden).map(row => row.textContent || '');
const highlighted = (): string => host.querySelector('.fw-flyout-row.is-active')?.textContent || '';
function type(value: string): void {
  filter().value = value;
  filter().dispatchEvent(new Event('input', { bubbles: true }));
}
function key(name: string): void {
  (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  document.body.replaceChildren();
  inserted = [];
  openedAll = 0;
  viaRun = 0;
  host = document.createElement('div');
  anchor = document.createElement('button');
  anchor.textContent = '+';
  document.body.append(anchor, host);
  flyout = installInsertFlyout({ host, groups, openAll: () => { openedAll++; }, run: action => { viaRun++; return action(); } });
  anchor.focus();
});

describe('opening Quick insert', () => {
  it('is not visible until opened', () => {
    expect(panel().hidden).toBe(true);
    expect(flyout.isOpen()).toBe(false);
  });

  it('lists elements, sections and components and gives the filter focus', () => {
    flyout.open(anchor);
    expect(panel().hidden).toBe(false);
    expect(Array.from(host.querySelectorAll('.fw-flyout-head')).map(head => head.textContent)).toEqual(['Elements', 'Sections', 'Components']);
    expect(visibleRows()).toEqual(['Heading', 'Text', 'Image', 'Button', 'Hero section', 'Pricing table', 'Ferry badge']);
    expect(document.activeElement).toBe(filter());
  });

  it('the first row is highlighted', () => {
    flyout.open(anchor);
    expect(highlighted()).toBe('Heading');
  });

  it('pressing the button again closes it', () => {
    flyout.toggle(anchor);
    flyout.toggle(anchor);
    expect(flyout.isOpen()).toBe(false);
  });
});

describe('filtering', () => {
  it('typing narrows the list to matching rows, case ignored', () => {
    flyout.open(anchor);
    type('IMA');
    expect(visibleRows()).toEqual(['Image']);
    expect(highlighted()).toBe('Image');
  });

  it('a group with no match is hidden', () => {
    flyout.open(anchor);
    type('ferry');
    const shownHeads = Array.from(host.querySelectorAll<HTMLElement>('.fw-flyout-group')).filter(group => !group.hidden).map(group => group.querySelector('.fw-flyout-head')!.textContent);
    expect(shownHeads).toEqual(['Components']);
  });

  it('no match says so and highlights the row that opens the full panel', () => {
    flyout.open(anchor);
    type('zzqx');
    expect(visibleRows()).toEqual([]);
    expect(host.querySelector<HTMLElement>('.fw-flyout-none')!.hidden).toBe(false);
    expect(highlighted()).toBe('All elements and components...');
  });

  it('opening again starts with an empty filter', () => {
    flyout.open(anchor);
    type('image');
    flyout.close();
    flyout.open(anchor);
    expect(filter().value).toBe('');
    expect(visibleRows().length).toBe(7);
  });
});

describe('inserting', () => {
  it('Enter inserts the highlighted row once, closes the flyout and returns focus to the button', () => {
    flyout.open(anchor);
    type('hero');
    key('Enter');
    expect(inserted).toEqual(['hero']);
    expect(viaRun).toBe(1);
    expect(flyout.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('Down moves the highlight and wraps past the last row to the first', () => {
    flyout.open(anchor);
    key('ArrowDown');
    expect(highlighted()).toBe('Text');
    for (let n = 0; n < 7; n++) key('ArrowDown');
    expect(highlighted()).toBe('Heading');
  });

  it('Up from the first row reaches the row that opens the full panel', () => {
    flyout.open(anchor);
    key('ArrowUp');
    expect(highlighted()).toBe('All elements and components...');
  });

  it('the last row opens the full Insert panel instead of inserting', () => {
    flyout.open(anchor);
    key('ArrowUp');
    key('Enter');
    expect(openedAll).toBe(1);
    expect(inserted).toEqual([]);
  });

  it('clicking a row inserts it', () => {
    flyout.open(anchor);
    Array.from(host.querySelectorAll<HTMLElement>('.fw-flyout-row')).find(row => row.textContent === 'Pricing table')!.click();
    expect(inserted).toEqual(['pricing']);
  });
});

describe('closing', () => {
  it('Escape closes without inserting and returns focus to the button', () => {
    flyout.open(anchor);
    key('Escape');
    expect(flyout.isOpen()).toBe(false);
    expect(inserted).toEqual([]);
    expect(document.activeElement).toBe(anchor);
  });

  it('Tab closes and returns focus to the button', () => {
    flyout.open(anchor);
    key('Tab');
    expect(flyout.isOpen()).toBe(false);
    expect(document.activeElement).toBe(anchor);
  });

  it('a press elsewhere closes it without inserting', () => {
    flyout.open(anchor);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(flyout.isOpen()).toBe(false);
    expect(inserted).toEqual([]);
  });
});
