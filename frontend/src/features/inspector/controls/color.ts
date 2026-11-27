import { labelAttr } from '../../../i18n';
import { element } from '../../../ui/dom';
import { registerControl } from './index';
import { isGradient, varName, type Rgba } from './color-math';
import { colorPicker, resolveFor, type PickerTarget } from './color-picker';
import type { Control, ControlHost, StyleField } from './types';
import '../../../styles/control-color.css';

type Look = 'empty' | 'inherited' | 'color' | 'gradient';
interface Shown { look: Look; paint: string }

type Resolve = (value: string) => Rgba | null;

function paintOf(resolve: Resolve, value: string): string {
  const color = resolve(value);
  return color ? `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.round(color.a * 1000) / 1000})` : '';
}

function gradientPaint(resolve: Resolve, value: string): string {
  return value.trim().replace(/var\(\s*(--[a-z0-9_-]+)\s*\)/gi, (_whole, name: string) => paintOf(resolve, `var(${name})`) || 'transparent');
}

export function readColorValue(key: string, value: string, inherited: string, resolve: Resolve): Shown | null {
  const text = value.trim();
  const lower = text.toLowerCase();
  const fallback = (): Shown => {
    const paint = inherited.trim() && !isGradient(inherited) ? paintOf(resolve, inherited) : '';
    return paint ? { look: 'inherited', paint } : { look: 'empty', paint: '' };
  };
  if (!text || ['inherit', 'initial', 'unset', 'revert', 'currentcolor'].includes(lower) || key === 'background' && lower === 'none') return fallback();
  if (varName(text)) {
    const paint = paintOf(resolve, text);
    return paint ? { look: 'color', paint } : null;
  }
  if (key === 'background' && isGradient(text)) return { look: 'gradient', paint: gradientPaint(resolve, text) };
  if (/var\(|url\(/i.test(text)) return null;
  const paint = paintOf(resolve, text);
  return paint ? { look: 'color', paint } : null;
}

function colorControl(field: StyleField, host: ControlHost): Control {
  const swatch = element('button', 'fw-color-swatch');
  swatch.type = 'button';
  swatch.dataset.look = 'empty';
  swatch.setAttribute('aria-haspopup', 'dialog');
  swatch.setAttribute('aria-expanded', 'false');
  labelAttr(swatch, 'aria-label', 'Choose {0}', [{ t: field.label }]);
  labelAttr(swatch, 'title', 'Choose {0}', [{ t: field.label }]);
  const resolve: Resolve = value => resolveFor(host, value);
  const chip = element('span', 'fw-color-chip');
  swatch.append(chip);
  field.lead.append(swatch);

  const paint = (shown: Shown): void => {
    if (swatch.dataset.look !== shown.look) swatch.dataset.look = shown.look;
    if (shown.look === 'gradient') {
      if (chip.style.backgroundColor) chip.style.backgroundColor = '';
      if (chip.style.backgroundImage !== shown.paint) chip.style.backgroundImage = shown.paint;
    } else {
      if (chip.style.backgroundImage) chip.style.backgroundImage = '';
      if (chip.style.backgroundColor !== shown.paint) chip.style.backgroundColor = shown.paint;
    }
  };

  const target: PickerTarget = {
    key: field.key,
    label: field.label,
    anchor: swatch,
    field,
    value: () => field.value(),
    inherited: () => field.inherited(),
    show(value) {
      field.show(value);
      const shown = readColorValue(field.key, value, field.inherited(), resolve);
      if (shown) paint(shown);
    },
    restore() {
      field.restore();
      const shown = readColorValue(field.key, field.value(), field.inherited(), resolve);
      if (shown) paint(shown);
    },
    commit: value => field.commit(value)
  };
  const picker = colorPicker(host);
  swatch.addEventListener('click', () => picker.toggle(target));

  return {
    sync(value: string, inherited: string): boolean {
      const shown = readColorValue(field.key, value, inherited, resolve);
      if (!shown) {
        if (picker.isOpen(target)) picker.close(false);
        return false;
      }
      paint(shown);
      picker.refresh(target, value);
      return true;
    },
    setRaw(raw: boolean) {
      if (raw && picker.isOpen(target)) picker.close(false);
    },
    cancel() {
      picker.cancel(target);
    }
  };
}

export function register(): void {
  registerControl(['color', 'background'], colorControl);
}
