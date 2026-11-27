import { labelAttr } from '../../../i18n';
import { element } from '../../../ui/dom';
import { hsvToRgb, hueStops, parseEntry, rgbToHsv, sameColor, toHex, toRgb, type Hsva, type Rgba } from './color-math';
import type { ColorArea, ColorAreaOptions } from './picker-api';

export interface AreaOptions extends ColorAreaOptions {
  resolve(color: string): Rgba | null;
  cancel?(): void;
}
export interface Area extends ColorArea {
  dragging(): boolean;
  dropping(): boolean;
  relabel(name: string): void;
  cancel(): boolean;
}

interface EyeDropperResult { sRGBHex: string }
interface EyeDropperLike { open(): Promise<EyeDropperResult> }
type EyeDropperCtor = new () => EyeDropperLike;

const DROPPER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L17 9l-2-2 1.5-3.5Z"/><path d="m13 5 6 6M15 7l-8.5 8.5L5 19l3.5-1.5L17 9"/></svg>';
const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
const clamp = (value: number, low = 0, high = 1): number => Math.min(high, Math.max(low, value));
const tinted = (hsv: Hsva): Hsva => hsv.s < 0.05 || hsv.v < 0.05 ? { ...hsv, s: 0.7, v: 0.85 } : hsv;

export function eyeDropper(): EyeDropperCtor | null {
  const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === 'function' ? ctor : null;
}

function slider(className: string): HTMLElement {
  const node = element('div', className);
  node.tabIndex = 0;
  node.setAttribute('role', 'slider');
  node.append(element('span', 'fw-ca-thumb'));
  return node;
}

export function createColorArea(options: AreaOptions): Area {
  const root = element('div', 'fw-ca');
  const square = slider('fw-ca-square');
  square.setAttribute('aria-valuemin', '0');
  square.setAttribute('aria-valuemax', '100');
  const hue = slider('fw-ca-bar fw-ca-hue');
  hue.setAttribute('aria-valuemin', '0');
  hue.setAttribute('aria-valuemax', '360');
  hue.style.backgroundImage = `linear-gradient(to right, ${hueStops()})`;
  const alpha = slider('fw-ca-bar fw-ca-alpha');
  alpha.setAttribute('aria-valuemin', '0');
  alpha.setAttribute('aria-valuemax', '100');
  const alphaFill = element('span', 'fw-ca-fill');
  alpha.prepend(alphaFill);
  const white = toRgb({ r: 255, g: 255, b: 255, a: 1 });
  const clear = toRgb({ r: 255, g: 255, b: 255, a: 0 });
  const black = toRgb({ r: 0, g: 0, b: 0, a: 1 });
  const none = toRgb({ r: 0, g: 0, b: 0, a: 0 });
  square.style.backgroundImage = `linear-gradient(to top, ${black}, ${none}), linear-gradient(to right, ${white}, ${clear})`;
  const row = element('div', 'fw-ca-row');
  const preview = element('span', 'fw-ca-preview');
  preview.append(element('span', 'fw-ca-preview-fill'));
  const entry = element('input', 'fw-ca-entry');
  entry.type = 'text';
  entry.spellcheck = false;
  entry.autocomplete = 'off';
  const relabel = (name: string): void => {
    labelAttr(square, 'aria-label', 'Saturation and brightness of {0}', [{ t: name }]);
    labelAttr(hue, 'aria-label', 'Hue of {0}', [{ t: name }]);
    labelAttr(alpha, 'aria-label', 'Opacity of {0}', [{ t: name }]);
    labelAttr(entry, 'aria-label', 'Hex or rgb() value of {0}', [{ t: name }]);
  };
  relabel(options.label);
  row.append(preview, entry);
  const Dropper = eyeDropper();
  let dropping = false;
  if (Dropper) {
    const pick = element('button', 'fw-ca-dropper');
    pick.type = 'button';
    pick.innerHTML = DROPPER;
    labelAttr(pick, 'aria-label', 'Pick a color from the screen');
    labelAttr(pick, 'title', 'Pick a color from the screen');
    pick.addEventListener('click', () => {
      if (dropping) return;
      dropping = true;
      root.dataset.dropping = 'true';
      new Dropper().open().then(result => {
        const color = options.resolve(result.sRGBHex);
        if (!color) return;
        const keep = hsv.a;
        setRgba({ ...color, a: keep });
        options.commit(api.get());
      }, () => undefined).finally(() => { dropping = false; delete root.dataset.dropping; });
    });
    row.append(pick);
  }
  root.append(square, hue, alpha, row);

  let hsv: Hsva = { h: 0, s: 0, v: 0, a: 1 };
  let start = '';
  let drag: HTMLElement | null = null;
  let pending = false;

  function setRgba(color: Rgba): void {
    const next = rgbToHsv(color);
    if (next.s === 0 || next.v === 0) next.h = hsv.h;
    if (next.v === 0) next.s = hsv.s;
    hsv = next;
    paint();
  }

  function paint(): void {
    const color = hsvToRgb(hsv);
    const solid = toRgb({ ...color, a: 1 });
    square.style.backgroundColor = toRgb(hsvToRgb({ h: hsv.h, s: 1, v: 1, a: 1 }));
    square.style.setProperty('--x', String(hsv.s));
    square.style.setProperty('--y', String(1 - hsv.v));
    square.style.setProperty('--thumb', solid);
    hue.style.setProperty('--x', String(hsv.h / 360));
    alpha.style.setProperty('--x', String(hsv.a));
    alphaFill.style.backgroundImage = `linear-gradient(to right, ${toRgb({ ...color, a: 0 })}, ${solid})`;
    (preview.firstChild as HTMLElement).style.backgroundColor = toRgb(color);
    const s = Math.round(hsv.s * 100);
    const v = Math.round(hsv.v * 100);
    square.setAttribute('aria-valuenow', String(s));
    square.setAttribute('aria-valuetext', `${s}%, ${v}%`);
    hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    hue.setAttribute('aria-valuetext', `${Math.round(hsv.h)}°`);
    alpha.setAttribute('aria-valuenow', String(Math.round(hsv.a * 100)));
    alpha.setAttribute('aria-valuetext', `${Math.round(hsv.a * 100)}%`);
    if (document.activeElement !== entry) {
      const hex = toHex(color);
      if (entry.value !== hex) entry.value = hex;
    }
  }

  function moveTo(target: HTMLElement, event: PointerEvent): void {
    const box = target.getBoundingClientRect();
    const x = clamp((event.clientX - box.left) / Math.max(1, box.width));
    const y = clamp((event.clientY - box.top) / Math.max(1, box.height));
    if (target === square) hsv = { ...hsv, s: x, v: 1 - y };
    else if (target === hue) hsv = { ...tinted(hsv), h: Math.min(359.999, x * 360) };
    else hsv = { ...hsv, a: Math.round(x * 100) / 100 };
    paint();
    options.input(api.get());
  }

  function finish(commit: boolean): void {
    if (!drag) return;
    const target = drag;
    drag = null;
    delete root.dataset.dragging;
    if (target.hasPointerCapture?.(activePointer)) target.releasePointerCapture(activePointer);
    if (commit && api.get() !== start) options.commit(api.get());
  }

  let activePointer = -1;
  for (const target of [square, hue, alpha]) {
    target.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
      drag = target;
      activePointer = event.pointerId;
      start = api.get();
      root.dataset.dragging = 'true';
      target.setPointerCapture(event.pointerId);
      moveTo(target, event);
    });
    target.addEventListener('pointermove', event => { if (drag === target && event.pointerId === activePointer) moveTo(target, event); });
    target.addEventListener('pointerup', event => { if (drag === target && event.pointerId === activePointer) finish(true); });
    target.addEventListener('pointercancel', () => { if (drag === target) cancel(); });
    target.addEventListener('lostpointercapture', () => { if (drag === target) finish(true); });
    target.addEventListener('keydown', event => {
      if (!STEP_KEYS.has(event.key) || drag) return;
      event.preventDefault();
      if (!pending) start = api.get();
      const big = event.shiftKey || event.key === 'PageUp' || event.key === 'PageDown';
      const sign = event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown' ? -1 : 1;
      const written = api.get();
      for (let tries = 0; tries < 100; tries++) {
        const was = hsv;
        if (target === square) {
          const step = (big ? 0.1 : 0.01) * sign;
          if (event.key === 'Home') hsv = { ...hsv, s: 0 };
          else if (event.key === 'End') hsv = { ...hsv, s: 1 };
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') hsv = { ...hsv, v: clamp(hsv.v + step) };
          else hsv = { ...hsv, s: clamp(hsv.s + step) };
        } else if (target === hue) {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 359 : hsv.h + (big ? 10 : 1) * sign;
          hsv = { ...tinted(hsv), h: clamp(next, 0, 359) };
        } else {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : hsv.a + (big ? 0.1 : 0.01) * sign;
          hsv = { ...hsv, a: Math.round(clamp(next) * 100) / 100 };
        }
        if (api.get() !== written || hsv.h === was.h && hsv.s === was.s && hsv.v === was.v && hsv.a === was.a) break;
      }
      pending = true;
      paint();
      options.input(api.get());
    });
    target.addEventListener('keyup', event => { if (STEP_KEYS.has(event.key)) settle(); });
    target.addEventListener('blur', settle);
  }

  function settle(): void {
    if (!pending) return;
    pending = false;
    if (api.get() !== start) options.commit(api.get());
  }

  function cancel(): boolean {
    if (!drag) return false;
    const target = drag;
    drag = null;
    delete root.dataset.dragging;
    if (target.hasPointerCapture?.(activePointer)) target.releasePointerCapture(activePointer);
    const before = options.resolve(start);
    if (before) setRgba(before);
    if (options.cancel) options.cancel(); else options.input(start);
    return true;
  }

  let entered = '';
  function typed(): void {
    const text = entry.value.trim();
    if (text === entered) return;
    const color = parseEntry(text);
    entry.removeAttribute('aria-invalid');
    if (!color) { entry.value = api.get(); entered = entry.value; return; }
    setRgba(color);
    entry.value = api.get();
    entered = entry.value;
    options.commit(api.get());
  }
  entry.addEventListener('focus', () => { entered = entry.value.trim(); });
  entry.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); typed(); }
  });
  entry.addEventListener('input', () => {
    if (parseEntry(entry.value) || !entry.value.trim()) entry.removeAttribute('aria-invalid'); else entry.setAttribute('aria-invalid', 'true');
  });
  entry.addEventListener('change', typed);
  entry.addEventListener('blur', () => { entry.removeAttribute('aria-invalid'); paint(); });

  const api: Area = {
    element: root,
    set(color: string) {
      const parsed = options.resolve(color);
      if (!parsed || drag || sameColor(parsed, hsvToRgb(hsv))) return;
      setRgba(parsed);
    },
    get: () => toHex(hsvToRgb(hsv)),
    dragging: () => !!drag,
    dropping: () => dropping,
    relabel,
    cancel
  };
  paint();
  return api;
}
