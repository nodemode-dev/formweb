import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRowDrag } from '../../../src/features/panel/drag';

let list: HTMLElement;
let row: HTMLElement;
let menus: number;
let dropped: unknown[];

function pointer(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, pointerId: 7, clientX: 50, clientY: 20, button: 0, buttons: 1, ...init });
}
const press = (init: PointerEventInit): boolean => row.dispatchEvent(pointer('pointerdown', init));
const move = (dx: number, dy: number, init: PointerEventInit = {}): boolean => document.dispatchEvent(pointer('pointermove', { clientX: 50 + dx, clientY: 20 + dy, button: -1, ...init }));
const release = (dx = 0, dy = 0, init: PointerEventInit = {}): boolean => document.dispatchEvent(pointer('pointerup', { clientX: 50 + dx, clientY: 20 + dy, buttons: 0, ...init }));
const lifted = (): boolean => row.classList.contains('is-lifted');
const dragging = (): boolean => document.body.classList.contains('fw-row-dragging');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.className = '';
  document.body.replaceChildren();
  list = document.createElement('div');
  list.className = 'list';
  for (const key of ['a', 'b', 'c']) {
    const item = document.createElement('div');
    item.className = 'list-row';
    item.dataset.key = key;
    item.textContent = key;
    list.append(item);
  }
  document.body.append(list);
  row = list.children[0] as HTMLElement;
  row.setPointerCapture = () => {};
  menus = 0;
  dropped = [];
  row.addEventListener('contextmenu', () => { menus += 1; });
  installRowDrag({ list, host: document.body, ids: r => [r.dataset.key || ''], canStart: () => true, zone: () => 'after', drop: (...args) => { dropped.push(args); } });
});

afterEach(() => {
  release();
  vi.useRealTimers();
});

describe('a finger on a row', () => {
  it('a row is not lifted after a quarter of a second of holding', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(250);
    expect(lifted()).toBe(false);
  });

  it('a row lifts once it is held still for about a third of a second', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    expect(lifted()).toBe(true);
  });

  it('a wobble of two pixels while holding still lets the row lift', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(100);
    move(2, 1);
    vi.advanceTimersByTime(350);
    expect(lifted()).toBe(true);
  });

  it('a swipe before the hold time ends the press, so the row never lifts and nothing is dragged', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(100);
    move(0, 30);
    vi.advanceTimersByTime(600);
    move(0, 60);
    expect(lifted()).toBe(false);
    expect(dragging()).toBe(false);
    release(0, 60);
    expect(dropped).toEqual([]);
  });

  it('a hold released without moving opens the menu of the row exactly once', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    release();
    expect(menus).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(menus).toBe(1);
    expect(lifted()).toBe(false);
  });

  it('a quick tap opens no menu and lifts nothing', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(80);
    release();
    vi.advanceTimersByTime(1000);
    expect(menus).toBe(0);
    expect(lifted()).toBe(false);
  });

  it('a second finger during the hold cancels it: nothing stays lifted and no menu opens', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    expect(lifted()).toBe(true);
    list.children[2].dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 8, isPrimary: false }));
    expect(lifted()).toBe(false);
    release();
    expect(menus).toBe(0);
    expect(dropped).toEqual([]);
  });

  it('a touch the system takes over cancels the hold', () => {
    press({ pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    document.dispatchEvent(pointer('pointercancel', { pointerType: 'touch', buttons: 0 }));
    expect(lifted()).toBe(false);
    expect(dragging()).toBe(false);
    expect(menus).toBe(0);
  });
});

describe('a pen on a row', () => {
  it('a pen drags like a mouse once it moves a few pixels, without any hold', () => {
    press({ pointerType: 'pen' });
    move(0, 12, { pointerType: 'pen', buttons: 1 });
    expect(dragging()).toBe(true);
  });

  it('a pen press with the barrel button held never starts a drag', () => {
    press({ pointerType: 'pen', buttons: 3 });
    move(0, 40, { pointerType: 'pen', buttons: 3 });
    vi.advanceTimersByTime(1000);
    move(0, 80, { pointerType: 'pen', buttons: 3 });
    expect(dragging()).toBe(false);
    expect(lifted()).toBe(false);
  });

  it('a pen press with only the barrel button never starts a drag', () => {
    press({ pointerType: 'pen', button: 5, buttons: 32 });
    move(0, 40, { pointerType: 'pen', buttons: 32 });
    expect(dragging()).toBe(false);
  });
});

describe('a mouse on a row', () => {
  it('a mouse never waits for a hold and opens no menu on a long press', () => {
    press({ pointerType: 'mouse' });
    vi.advanceTimersByTime(1000);
    expect(lifted()).toBe(false);
    release();
    expect(menus).toBe(0);
  });
});
