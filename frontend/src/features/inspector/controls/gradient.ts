import { label, labelAttr, t } from '../../../i18n';
import { element, keyed } from '../../../ui/dom';
import { icon } from '../../../ui/icons';
import { registerPickerTab, type ColorArea, type PickerApi } from './picker-api';
import type { ColorToken } from './types';
import {
  colorAt, isColor, normaliseAngle, parseGradient, reverseStops, round, serializeGradient, sortedStops, starterGradient, stopList, toRgba,
  type Gradient, type GradientStop, type RadialShape,
} from './gradient-model';
import '../../../styles/control-gradient.css';

interface TabStop extends GradientStop { id: number }
interface TabGradient extends Gradient { stops: TabStop[] }

const DIRECTIONS: readonly (readonly [number, string])[] = [
  [0, 'Up'], [45, 'Up right'], [90, 'Right'], [135, 'Down right'], [180, 'Down'], [225, 'Down left'], [270, 'Left'], [315, 'Up left'],
];
const SIDE_ANGLE: Record<string, number> = { top: 0, 'top right': 45, right: 90, 'bottom right': 135, bottom: 180, 'bottom left': 225, left: 270, 'top left': 315 };
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const TOKEN = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/;

function set(node: Element, name: string, next: string): void {
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}

function style(node: HTMLElement, name: string, next: string): void {
  if (node.style.getPropertyValue(name) !== next) node.style.setProperty(name, next);
}

function paint(color: string, tokens: readonly ColorToken[]): string {
  let text = color;
  for (let i = 0; i < 8 && TOKEN.test(text); i++) {
    text = text.replace(TOKEN, (_whole, name: string, fallback?: string) => {
      const token = tokens.find(item => item.css.replace(/\s+/g, '') === `var(${name})`);
      return token?.value.trim() || (fallback ?? '').trim() || 'transparent';
    });
  }
  return text;
}

function button(className: string, english: string): HTMLButtonElement {
  const node = element('button', className);
  node.type = 'button';
  label(node, english);
  return node;
}

function iconButton(className: string, name: 'plus' | 'trash' | 'arrow', english: string): HTMLButtonElement {
  const node = element('button', className);
  node.type = 'button';
  node.append(icon(name));
  labelAttr(node, 'aria-label', english);
  labelAttr(node, 'title', english);
  return node;
}

function numberEntry(className: string, english: string, min: number, max: number): HTMLInputElement {
  const node = element('input', className);
  node.type = 'number';
  node.min = String(min);
  node.max = String(max);
  node.step = '1';
  node.inputMode = 'decimal';
  labelAttr(node, 'aria-label', english);
  return node;
}

function mount(panel: HTMLElement, api: PickerApi): { open(value: string): boolean; close(): void } {
  let model: TabGradient | null = null;
  let selected = 0;
  let nextId = 1;
  let proposal = false;
  let held = false;
  let areaStart: string | null = null;
  const flight: string[] = [];
  let drag: { id: number; snapshot: TabGradient; moved: boolean; pointer: number; startX: number } | null = null;

  const root = element('div', 'fw-grad');
  root.dataset.ownKeys = '';

  const kinds = element('div', 'fw-grad-kinds');
  set(kinds, 'role', 'group');
  labelAttr(kinds, 'aria-label', 'Gradient type');
  const linear = button('fw-grad-choice', 'Linear');
  const radial = button('fw-grad-choice', 'Radial');
  kinds.append(linear, radial);

  const bar = element('div', 'fw-grad-bar');
  const fill = element('span', 'fw-grad-fill');
  const track = element('div', 'fw-grad-track');
  set(track, 'role', 'group');
  labelAttr(track, 'aria-label', 'Gradient stops');
  labelAttr(bar, 'title', 'Click to add a stop');
  bar.append(fill, track);

  const stopRow = element('div', 'fw-grad-row');
  const positionLabel = element('label', 'fw-grad-label');
  label(positionLabel, 'Position');
  const position = numberEntry('fw-grad-number', 'Stop position in percent', 0, 100);
  const percent = element('span', 'fw-grad-unit', '%');
  const add = iconButton('fw-grad-icon', 'plus', 'Add stop');
  const remove = iconButton('fw-grad-icon', 'trash', 'Remove stop');
  positionLabel.append(position);
  stopRow.append(positionLabel, percent, element('span', 'fw-grad-spacer'), add, remove);

  const area: ColorArea = api.colorArea({
    label: 'Stop color',
    input(color) { const stop = current(); if (!stop) return; areaStart ??= stop.color; stop.color = color; pending(); },
    commit(color) { const stop = current(); areaStart = null; if (!stop) return; stop.color = color; save(); },
  });
  area.element.classList.add('fw-grad-area');

  const shapeBox = element('div', 'fw-grad-shape');
  const angleGroup = element('div', 'fw-grad-angle');
  const angleRow = element('div', 'fw-grad-row');
  const angleLabel = element('label', 'fw-grad-label');
  label(angleLabel, 'Angle');
  const angle = numberEntry('fw-grad-number', 'Angle in degrees', 0, 360);
  angleLabel.append(angle);
  angleRow.append(angleLabel, element('span', 'fw-grad-unit', 'deg'));
  const directions = element('div', 'fw-grad-directions');
  set(directions, 'role', 'group');
  labelAttr(directions, 'aria-label', 'Direction');
  const directionButtons = DIRECTIONS.map(([degrees, name]) => {
    const node = iconButton('fw-grad-icon fw-grad-direction', 'arrow', name);
    node.style.setProperty('--fw-grad-turn', `${degrees - 90}deg`);
    node.addEventListener('click', () => {
      if (!model) return;
      model.angle = degrees;
      model.to = '';
      save();
    });
    directions.append(node);
    return node;
  });
  angleGroup.append(angleRow, directions);
  const radialGroup = element('div', 'fw-grad-radial');
  const shapeRow = element('div', 'fw-grad-row');
  const shapeLabel = element('span', 'fw-grad-label');
  label(shapeLabel, 'Shape');
  const shapes = element('div', 'fw-grad-kinds');
  set(shapes, 'role', 'group');
  labelAttr(shapes, 'aria-label', 'Shape');
  const circle = button('fw-grad-choice', 'Circle');
  const ellipse = button('fw-grad-choice', 'Ellipse');
  shapes.append(circle, ellipse);
  shapeRow.append(shapeLabel, shapes);
  radialGroup.append(shapeRow);
  shapeBox.append(angleGroup, radialGroup);

  const actions = element('div', 'fw-grad-row fw-grad-actions');
  const reverse = button('fw-grad-action', 'Reverse');
  const use = button('fw-grad-action fw-grad-use', 'Use gradient');
  actions.append(reverse, element('span', 'fw-grad-spacer'), use);

  root.append(kinds, bar, stopRow, area.element, shapeBox, actions);
  panel.append(root);

  const ordered = (): TabStop[] => model ? sortedStops(model.stops) : [];
  const shade = (color: string): string => {
    if (!/var\(/i.test(color)) return color;
    const found = api.resolve(color);
    return found ? `rgba(${Math.round(found.r)}, ${Math.round(found.g)}, ${Math.round(found.b)}, ${round(found.a)})` : paint(color, api.colors());
  };
  const current = (): TabStop | undefined => model?.stops.find(stop => stop.id === selected);
  const css = (): string => model ? serializeGradient(model) : '';
  const clone = (from: TabGradient): TabGradient => ({ ...from, stops: from.stops.map(stop => ({ ...stop })) });
  const adopt = (gradient: Gradient): TabGradient => {
    const ids = ordered().map(stop => stop.id);
    return { ...gradient, stops: gradient.stops.map((stop, i) => ({ ...stop, id: ids[i] ?? nextId++ })) };
  };

  function render(): void {
    if (!model) return;
    const stops = ordered();
    const kind = model.kind;
    set(linear, 'aria-pressed', String(kind === 'linear'));
    set(radial, 'aria-pressed', String(kind === 'radial'));
    style(fill, 'background-image', `linear-gradient(to right, ${stopList(stops.map(stop => ({ color: shade(stop.color), position: stop.position })))})`);
    const lasting = [...model.stops].sort((a, b) => a.id - b.id);
    const live = new Set(lasting.map(stop => String(stop.id)));
    const gone = (Array.from(track.children) as HTMLElement[]).filter(node => !live.has(node.dataset.key ?? ''));
    if (gone.some(node => node.contains(document.activeElement))) rescue(live);
    for (const node of gone) node.remove();
    keyed(track, lasting, stop => String(stop.id), () => {
      const handle = element('div', 'fw-grad-handle');
      handle.tabIndex = 0;
      set(handle, 'role', 'slider');
      set(handle, 'aria-valuemin', '0');
      set(handle, 'aria-valuemax', '100');
      set(handle, 'aria-orientation', 'horizontal');
      handle.append(element('span', 'fw-grad-chip'));
      return handle;
    }, (handle, stop) => {
      const index = stops.indexOf(stop);
      style(handle, 'left', `${stop.position}%`);
      style(handle, '--fw-grad-stop', shade(stop.color));
      set(handle, 'aria-valuenow', String(stop.position));
      set(handle, 'aria-valuetext', t('Stop {0} of {1}, {2} percent', [index + 1, stops.length, stop.position]));
      labelAttr(handle, 'aria-label', 'Gradient stop {0}', [index + 1]);
      handle.classList.toggle('is-selected', stop.id === selected);
    });
    const stop = current();
    if (stop && document.activeElement !== position) position.value = String(stop.position);
    const fixed = model.stops.length <= 2;
    if ((fixed && document.activeElement === remove) || (!proposal && document.activeElement === use)) rescue(live);
    remove.disabled = fixed;
    const nominal = model.to ? SIDE_ANGLE[model.to] : normaliseAngle(model.angle);
    if (document.activeElement !== angle) angle.value = String(nominal);
    directionButtons.forEach((node, i) => set(node, 'aria-pressed', String(DIRECTIONS[i][0] === nominal)));
    set(circle, 'aria-pressed', String(model.shape === 'circle'));
    set(ellipse, 'aria-pressed', String(model.shape === 'ellipse'));
    const hiding = kind === 'linear' ? radialGroup : angleGroup;
    if (hiding.contains(document.activeElement)) (kind === 'linear' ? linear : radial).focus({ preventScroll: true });
    angleGroup.hidden = kind !== 'linear';
    radialGroup.hidden = kind !== 'radial';
    root.classList.toggle('is-proposal', proposal);
    use.disabled = !proposal;
  }

  function rescue(live: ReadonlySet<string>): void {
    const handles = Array.from(track.children) as HTMLElement[];
    const target = handles.find(node => node.dataset.key === String(selected) && live.has(String(selected)))
      ?? handles.find(node => live.has(node.dataset.key ?? ''))
      ?? (model?.kind === 'radial' ? radial : linear);
    target.focus({ preventScroll: true });
  }

  function leave(): void {
    const dialog = panel.parentElement;
    if (dialog && root.contains(document.activeElement) && dialog.hasAttribute('tabindex')) dialog.focus({ preventScroll: true });
  }

  function focusSelected(): void {
    track.querySelector<HTMLElement>(`[data-key="${selected}"]`)?.focus({ preventScroll: true });
  }

  function select(id: number): void {
    selected = id;
    areaStart = null;
    const stop = current();
    if (stop) area.set(stop.color);
  }

  function pending(): void {
    render();
    api.show(css());
  }

  function resync(): void {
    const keep = ordered().findIndex(stop => stop.id === selected);
    load(api.field().value(), keep);
  }

  function save(): void {
    if (!model) return;
    proposal = false;
    render();
    const text = css();
    if (text === api.field().value().trim()) { api.field().restore(); return; }
    api.show(text);
    flight.push(text);
    api.commit(text).catch(resync).finally(() => { flight.splice(flight.indexOf(text), 1); });
  }

  function load(value: string, keepIndex = 0): boolean {
    const text = value.trim();
    const parsed = parseGradient(text);
    if (parsed) {
      const before = model;
      model = adopt(parsed);
      if (before && parsed.kind === 'radial') { model.angle = before.angle; model.to = before.to; }
      if (before && parsed.kind === 'linear') { model.shape = before.shape; model.size = before.size; model.at = before.at; }
      proposal = false;
    } else if (!text || isColor(text)) {
      model = adopt(starterGradient(text || api.field().inherited()));
      proposal = true;
    } else {
      model = null;
      return false;
    }
    const stops = ordered();
    const handleFocused = track.contains(document.activeElement);
    select(stops[Math.min(Math.max(keepIndex, 0), stops.length - 1)].id);
    if (handleFocused) focusSelected();
    render();
    if (handleFocused && !track.contains(document.activeElement)) focusSelected();
    return true;
  }

  function positionAt(clientX: number): number {
    const box = track.getBoundingClientRect();
    if (!box.width) return 0;
    return Math.round(Math.min(100, Math.max(0, (clientX - box.left) / box.width * 100)));
  }

  function newColor(at: number): string {
    if (!model) return '#000000';
    const stops = ordered();
    const after = stops.find(stop => stop.position >= at);
    const before = [...stops].reverse().find(stop => stop.position <= at);
    if (before && after && (before.color.includes('var(') || after.color.includes('var('))) {
      return at - before.position <= after.position - at ? before.color : after.color;
    }
    return colorAt(stops, at, color => toRgba(shade(color)));
  }

  function insert(at: number): TabStop | undefined {
    if (!model) return undefined;
    const stop: TabStop = { id: nextId++, color: newColor(at), position: at };
    model.stops.push(stop);
    select(stop.id);
    return stop;
  }

  function cancel(restore = true): void {
    if (!drag) return;
    model = drag.snapshot;
    if (track.hasPointerCapture(drag.pointer)) track.releasePointerCapture(drag.pointer);
    drag = null;
    root.classList.remove('is-dragging');
    const kept = model.stops.some(stop => stop.id === selected) ? selected : ordered()[0].id;
    select(kept);
    if (track.contains(document.activeElement)) focusSelected();
    if (restore) api.field().restore();
    render();
  }

  function finish(): void {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    root.classList.remove('is-dragging');
    if (moved) save();
  }

  function remover(): void {
    if (!model || model.stops.length <= 2) return;
    const stops = ordered();
    const index = stops.findIndex(stop => stop.id === selected);
    const handleFocused = track.contains(document.activeElement);
    model.stops = model.stops.filter(stop => stop.id !== selected);
    const rest = ordered();
    select(rest[Math.min(index, rest.length - 1)].id);
    if (handleFocused || rest.length <= 2) focusSelected();
    save();
  }

  function begin(event: PointerEvent, id: number, moved: boolean, snapshot: TabGradient): void {
    drag = { id, snapshot, moved, pointer: event.pointerId, startX: event.clientX };
    root.classList.add('is-dragging');
    track.setPointerCapture(event.pointerId);
  }

  track.addEventListener('pointerdown', event => {
    if (!model || event.button !== 0 || drag) return;
    event.preventDefault();
    const handle = (event.target as Element).closest<HTMLElement>('.fw-grad-handle');
    const snapshot = clone(model);
    if (handle) {
      const id = Number(handle.dataset.key);
      select(id);
      handle.focus({ preventScroll: true });
      render();
      begin(event, id, false, snapshot);
      return;
    }
    const stop = insert(positionAt(event.clientX));
    if (!stop) return;
    begin(event, stop.id, true, snapshot);
    pending();
    track.querySelector<HTMLElement>(`[data-key="${stop.id}"]`)?.focus({ preventScroll: true });
  });
  track.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer || !model) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 3) return;
    const stop = model.stops.find(item => item.id === drag?.id);
    if (!stop) return;
    const at = positionAt(event.clientX);
    if (at === stop.position && drag.moved) return;
    drag.moved = true;
    stop.position = at;
    pending();
  });
  track.addEventListener('pointerup', event => { if (drag && event.pointerId === drag.pointer) finish(); });
  track.addEventListener('pointercancel', event => { if (drag && event.pointerId === drag.pointer) cancel(); });
  track.addEventListener('lostpointercapture', event => { if (drag && event.pointerId === drag.pointer) finish(); });

  track.addEventListener('keydown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('.fw-grad-handle');
    if (!handle || !model || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const stop = current();
    if (!stop || Number(handle.dataset.key) !== selected) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remover();
      return;
    }
    if (!MOVE_KEYS.has(event.key)) return;
    event.preventDefault();
    const big = event.shiftKey || event.key === 'PageUp' || event.key === 'PageDown' ? 10 : 1;
    let next = stop.position;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown') next -= big;
    else next += big;
    next = round(Math.min(100, Math.max(0, next)));
    if (next === stop.position) return;
    stop.position = next;
    held = true;
    pending();
  });
  track.addEventListener('keyup', event => {
    if (!held || !MOVE_KEYS.has(event.key)) return;
    held = false;
    save();
  });
  track.addEventListener('focusin', event => {
    const handle = (event.target as Element).closest<HTMLElement>('.fw-grad-handle');
    const id = Number(handle?.dataset.key);
    if (!handle || !model || drag || id === selected || !model.stops.some(stop => stop.id === id)) return;
    select(id);
    render();
  });
  track.addEventListener('focusout', () => {
    if (!held) return;
    held = false;
    save();
  });

  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || drag) return;
    if (!area.cancel()) return;
    event.preventDefault();
    event.stopPropagation();
    const stop = current();
    if (stop && areaStart !== null) stop.color = areaStart;
    areaStart = null;
    api.field().restore();
    render();
  });

  linear.addEventListener('click', () => { if (model && model.kind !== 'linear') { model.kind = 'linear'; save(); } });
  radial.addEventListener('click', () => { if (model && model.kind !== 'radial') { model.kind = 'radial'; save(); } });
  const shape = (value: RadialShape): void => { if (model && model.shape !== value) { model.shape = value; save(); } };
  circle.addEventListener('click', () => shape('circle'));
  ellipse.addEventListener('click', () => shape('ellipse'));
  add.addEventListener('click', () => {
    if (!model) return;
    const stops = ordered();
    const index = stops.findIndex(stop => stop.id === selected);
    const from = stops[index] ?? stops[0];
    const to = stops[index + 1] ?? stops[index - 1] ?? from;
    insert(round(Math.round((from.position + to.position) / 2)));
    save();
  });
  remove.addEventListener('click', remover);
  reverse.addEventListener('click', () => {
    if (!model) return;
    model.stops = reverseStops(model.stops);
    save();
  });
  use.addEventListener('click', () => { if (proposal) save(); });
  position.addEventListener('change', () => {
    const stop = current();
    const value = Number(position.value);
    if (!stop || position.value.trim() === '' || !Number.isFinite(value)) { render(); return; }
    stop.position = round(Math.min(100, Math.max(0, value)));
    save();
  });
  angle.addEventListener('change', () => {
    const value = Number(angle.value);
    if (!model || angle.value.trim() === '' || !Number.isFinite(value)) { render(); return; }
    model.angle = normaliseAngle(value);
    model.to = '';
    save();
  });

  return {
    open(value: string): boolean {
      if (drag) cancel();
      const same = model && !proposal && (value.trim() === css() || flight.includes(value.trim()));
      if (same) { render(); return true; }
      const showing = root.getClientRects().length > 0;
      if (!load(value, ordered().findIndex(stop => stop.id === selected))) { leave(); return false; }
      return !proposal || showing;
    },
    close(): void {
      leave();
      cancel(false);
      held = false;
      areaStart = null;
    },
  };
}

export function register(): void {
  registerPickerTab({
    id: 'gradient',
    label: 'Gradient',
    accepts: key => key === 'background',
    mount,
  });
}
