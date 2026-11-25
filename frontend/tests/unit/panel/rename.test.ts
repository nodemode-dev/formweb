import { beforeEach, describe, expect, it } from 'vitest';
import { renaming, startRename } from '../../../src/features/panel/rename';

let host: HTMLElement;
let list: HTMLElement;
let row: HTMLElement;
let saved: string[];
let refused: number;

function makeRow(key: string, name: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'list-row';
  item.dataset.key = key;
  item.tabIndex = 0;
  const label = document.createElement('span');
  label.className = 'row-label';
  label.textContent = name;
  item.append(label);
  return item;
}

function begin(current = 'Fares'): HTMLInputElement {
  startRename(row, { host, current, commit: name => { saved.push(name); }, refuse: () => { refused++; } });
  return host.querySelector<HTMLInputElement>('.fw-rename-input')!;
}
function key(field: HTMLInputElement, name: string): void {
  field.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
}
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  if (renaming()) document.querySelector<HTMLInputElement>('.fw-rename-input')?.blur();
  document.body.replaceChildren();
  saved = [];
  refused = 0;
  host = document.createElement('div');
  list = document.createElement('div');
  row = makeRow('fares', 'Fares');
  list.append(makeRow('home', 'Home'), row, makeRow('about', 'About'));
  document.body.append(list, host);
});

describe('renaming a row in place', () => {
  it('opens a field holding the current name, with focus', () => {
    const field = begin();
    expect(field.value).toBe('Fares');
    expect(document.activeElement).toBe(field);
    expect(renaming()).toBe(true);
  });

  it('Enter saves the new name and closes the field', () => {
    const field = begin();
    field.value = 'Timetable';
    key(field, 'Enter');
    expect(saved).toEqual(['Timetable']);
    expect(host.querySelector('.fw-rename-input')).toBeNull();
    expect(renaming()).toBe(false);
  });

  it('Enter returns focus to the row', () => {
    const field = begin();
    field.value = 'Timetable';
    key(field, 'Enter');
    expect(document.activeElement).toBe(row);
  });

  it('the name is saved without surrounding spaces', () => {
    const field = begin();
    field.value = '  Timetable  ';
    key(field, 'Enter');
    expect(saved).toEqual(['Timetable']);
  });

  it('Escape keeps the old name and closes the field', () => {
    const field = begin();
    field.value = 'Timetable';
    key(field, 'Escape');
    expect(saved).toEqual([]);
    expect(host.querySelector('.fw-rename-input')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('clicking away saves the new name', () => {
    const field = begin();
    field.value = 'Timetable';
    field.blur();
    expect(saved).toEqual(['Timetable']);
    expect(host.querySelector('.fw-rename-input')).toBeNull();
  });

  it('an empty name is refused with Enter and the field stays open', () => {
    const field = begin();
    field.value = '   ';
    key(field, 'Enter');
    expect(refused).toBe(1);
    expect(saved).toEqual([]);
    expect(field.isConnected).toBe(true);
  });

  it('an empty name is refused when clicking away and the old name stays', () => {
    const field = begin();
    field.value = '';
    field.blur();
    expect(refused).toBe(1);
    expect(saved).toEqual([]);
    expect(field.isConnected).toBe(false);
  });

  it('saving the same name changes nothing', () => {
    const field = begin();
    key(field, 'Enter');
    expect(saved).toEqual([]);
  });

  it('the field stays open when another row is added to the list', async () => {
    const field = begin();
    list.prepend(makeRow('new', 'New layer'));
    await settle();
    expect(field.isConnected).toBe(true);
  });

  it('the field closes without saving when its row is removed', async () => {
    const field = begin();
    field.value = 'Timetable';
    row.remove();
    await settle();
    expect(field.isConnected).toBe(false);
    expect(saved).toEqual([]);
  });
});
