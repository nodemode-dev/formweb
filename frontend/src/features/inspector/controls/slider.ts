import { labelAttr, t } from '../../../i18n';
import { element } from '../../../ui/dom';
import { registerControl } from './index';
import { SCALES, format, fraction, parse, places, range, rest, slide, snap, step, type Amount } from './number';
import type { Control, StyleField } from './types';
import '../../../styles/control-slider.css';

const PAUSE_MS = 700;
const UNITLESS = '×';
const SLIDE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

function set(node: Element, name: string, next: string): void {
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}

function create(field: StyleField): Control {
  const key = field.key;
  const table = SCALES[key];
  const units = Object.keys(table.units);
  const slider = element('div', 'fw-slider');
  const track = element('span', 'fw-slider-track');
  const thumb = element('span', 'fw-slider-thumb');
  track.append(element('span', 'fw-slider-fill'));
  slider.append(track, thumb);
  slider.tabIndex = 0;
  slider.dataset.ownKeys = '';
  slider.dataset.state = 'unset';
  set(slider, 'role', 'slider');
  set(slider, 'aria-orientation', 'horizontal');
  labelAttr(slider, 'aria-label', field.label);
  field.below.append(slider);

  const chooser = units.length > 1 ? element('select', 'fw-unit') : null;
  if (chooser) {
    for (const unit of units) {
      const option = element('option', '', unit || UNITLESS);
      option.value = unit;
      chooser.append(option);
    }
    labelAttr(chooser, 'aria-label', 'Unit for {0}', [{ t: field.label }]);
    labelAttr(chooser, 'title', 'Unit for {0}', [{ t: field.label }]);
    field.trail.append(chooser);
  }

  let raw = false;
  let shown: Amount = { n: rest(key, table.unit), unit: table.unit };
  let chosen: string | null = null;
  let drag: { id: number; text: string } | null = null;
  let held: string | null = null;
  let flying: string | null = null;
  let muted = false;
  let timer = 0;

  const paint = (amount: Amount, state: 'set' | 'inherited' | 'unset', label: string): void => {
    shown = amount;
    const span = range(key, amount.unit)!;
    const at = fraction(amount.n, span);
    const n = Math.min(span.max, Math.max(span.min, amount.n));
    if (slider.style.getPropertyValue('--at') !== String(at)) slider.style.setProperty('--at', String(at));
    if (slider.dataset.state !== state) slider.dataset.state = state;
    set(slider, 'aria-valuemin', String(span.min));
    set(slider, 'aria-valuemax', String(span.max));
    set(slider, 'aria-valuenow', String(n));
    set(slider, 'aria-valuetext', label);
    if (chooser && chooser.value !== amount.unit) chooser.value = amount.unit;
  };
  const showing = (value: string, inherited: string): boolean => {
    const own = value.trim();
    if (own) {
      const amount = parse(key, own);
      if (!amount) return false;
      chosen = null;
      paint(amount, 'set', own);
      return true;
    }
    const from = parse(key, inherited);
    if (from && (chosen === null || chosen === from.unit)) paint(from, 'inherited', t('Inherited: {0}', [inherited.trim()]));
    else {
      const unit = chosen ?? table.unit;
      paint({ n: rest(key, unit), unit }, 'unset', t('Not set'));
    }
    return true;
  };
  const again = (): void => { showing(field.input.value, field.inherited()); };
  const commit = (text: string): void => {
    if (text === (flying ?? field.value().trim())) { field.restore(); if (flying === null) again(); return; }
    flying = text;
    void field.commit(text).catch(() => undefined).then(() => {
      if (flying !== text) return;
      flying = null;
      if (!drag && held === null) again();
    });
  };
  const pending = (text: string): void => {
    field.show(text);
    const amount = parse(key, text);
    if (amount) paint(amount, 'set', text);
  };
  const flush = (): void => {
    window.clearTimeout(timer);
    if (held === null) return;
    const text = held;
    held = null;
    commit(text);
  };
  const hold = (text: string): void => {
    held = text;
    pending(text);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, PAUSE_MS);
  };
  const abandon = (): void => {
    muted = held !== null || muted;
    window.clearTimeout(timer);
    held = null;
    flying = null;
    if (drag && slider.hasPointerCapture(drag.id)) { const id = drag.id; drag = null; slider.releasePointerCapture(id); }
    drag = null;
  };
  const cancel = (): void => {
    abandon();
    field.restore();
    again();
  };

  const at = (event: PointerEvent): string => {
    const box = slider.getBoundingClientRect();
    const size = thumb.offsetWidth;
    const span = range(key, shown.unit)!;
    const n = snap((event.clientX - box.left - size / 2) / Math.max(1, box.width - size), span);
    return format(n, shown.unit, places(span.step));
  };
  slider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    event.preventDefault();
    flush();
    slider.focus({ preventScroll: true });
    slider.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, text: at(event) };
    pending(drag.text);
  });
  slider.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const text = at(event);
    if (text === drag.text) return;
    drag.text = text;
    pending(text);
  });
  slider.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const text = drag.text;
    drag = null;
    if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
    commit(text);
  });
  slider.addEventListener('lostpointercapture', () => { if (drag) cancel(); });
  slider.addEventListener('pointercancel', () => { if (drag) cancel(); });
  slider.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (drag || held !== null)) { event.preventDefault(); event.stopPropagation(); cancel(); return; }
    if (drag || !SLIDE_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (muted && event.repeat) return;
    muted = false;
    const base = held === null && flying !== null ? parse(key, flying) : null;
    if (base) paint(base, 'set', flying!);
    const span = range(key, shown.unit)!;
    const up = event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp';
    const times = (event.shiftKey || event.key.startsWith('Page') ? 10 : 1) * (up ? 1 : -1);
    const digits = places(span.step);
    const text = event.key === 'Home' ? format(span.min, shown.unit, digits) : event.key === 'End' ? format(span.max, shown.unit, digits) : slide(key, shown, times);
    hold(text);
  });
  slider.addEventListener('keyup', event => { if (SLIDE_KEYS.has(event.key)) { muted = false; flush(); } });
  slider.addEventListener('blur', flush);

  field.input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && held !== null) { event.preventDefault(); cancel(); return; }
    if (raw || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const amount = parse(key, field.input.value);
    if (!amount) return;
    event.preventDefault();
    if (muted && event.repeat) return;
    muted = false;
    const text = step(key, amount, (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1));
    hold(text);
  });
  field.input.addEventListener('keyup', event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { muted = false; flush(); } });
  field.input.addEventListener('blur', flush);

  chooser?.addEventListener('change', () => {
    const unit = chooser.value;
    flush();
    const amount = parse(key, field.input.value);
    if (!field.input.value.trim() || !amount) { chosen = unit; again(); return; }
    const text = format(amount.n, unit, 6);
    pending(text);
    commit(text);
  });

  return {
    sync(value, inherited) {
      if (drag || held !== null) return parse(key, value) !== null;
      return showing(value, inherited);
    },
    cancel: abandon,
    setRaw(next) {
      raw = next;
      if (next && drag) cancel();
      if (next) flush();
    },
  };
}

export function register(): void {
  registerControl(Object.keys(SCALES), create);
}
