import { label, labelAttr } from '../../../i18n';
import { element } from '../../../ui/dom';
import { registerControl } from './index';
import { parseTracks, sameTracks } from './grid-tracks';
import type { Control, ControlHost, StyleField } from './types';
import '../../../styles/control-grid.css';

type Axis = 'columns' | 'rows';
type Words = [string, string[]?];
interface Choice { css: string; name: Words }
interface Group { title: string; choices: Choice[]; stepper?: boolean; rows?: boolean }
interface GridHost extends ControlHost { commitStyles?(styles: Record<string, string>): Promise<void> }

const SVG = 'http://www.w3.org/2000/svg';
const MARGIN = 8;
const GAP = 4;
const MAX_EQUAL = 12;

function equal(axis: Axis, count: number): Choice {
  const one = axis === 'columns' ? 'One column' : 'One row';
  const many = axis === 'columns' ? '{0} columns' : '{0} rows';
  return { css: `repeat(${count}, 1fr)`, name: count === 1 ? [one] : [many, [String(count)]] };
}

function groupsFor(axis: Axis): Group[] {
  const equals = [1, 2, 3, 4, 5, 6].map(count => equal(axis, count));
  if (axis === 'rows') return [
    { title: 'Equal rows', choices: equals, stepper: true },
    { title: 'Header and footer', choices: [{ css: 'auto 1fr auto', name: ['Header, content, footer'] }, { css: 'auto 1fr', name: ['Header and content'] }] }
  ];
  return [
    { title: 'Equal columns', choices: equals, stepper: true },
    { title: 'Two columns', choices: [
      { css: '1fr 2fr', name: ['Narrow left, wide right'] },
      { css: '2fr 1fr', name: ['Wide left, narrow right'] },
      { css: '1fr 3fr', name: ['Slim left, wide right'] },
      { css: '3fr 1fr', name: ['Wide left, slim right'] },
      { css: '240px 1fr', name: ['Fixed sidebar on the left'] },
      { css: '1fr 240px', name: ['Fixed sidebar on the right'] }
    ] },
    { title: 'Three columns', choices: [{ css: '1fr 2fr 1fr', name: ['Wide middle'] }] },
    { title: 'As many as fit', rows: true, choices: [160, 200, 240, 320].map(min => ({ css: `repeat(auto-fit, minmax(${min}px, 1fr))`, name: ['At least {0} px each', [String(min)]] as Words })) }
  ];
}

interface Drawing { svg: SVGSVGElement; paint(sizes: number[] | null): void }

function drawing(axis: Axis, width: number, height: number): Drawing {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'fw-grid-draw');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.axis = axis;
  const frame = document.createElementNS(SVG, 'rect');
  frame.setAttribute('class', 'fw-grid-draw-frame');
  frame.setAttribute('x', '0.5');
  frame.setAttribute('y', '0.5');
  frame.setAttribute('width', String(width - 1));
  frame.setAttribute('height', String(height - 1));
  frame.setAttribute('rx', '1.5');
  svg.append(frame);
  const bars: SVGRectElement[] = [];
  const set = (node: Element, name: string, next: string): void => { if (node.getAttribute(name) !== next) node.setAttribute(name, next); };
  return {
    svg,
    paint(sizes) {
      const list = sizes && sizes.length ? sizes : [];
      const state = sizes === null ? 'none' : list.length ? 'tracks' : 'empty';
      if (svg.dataset.state !== state) svg.dataset.state = state;
      while (bars.length < list.length) {
        const bar = document.createElementNS(SVG, 'rect');
        bar.setAttribute('class', 'fw-grid-draw-bar');
        bar.setAttribute('rx', '1');
        svg.append(bar);
        bars.push(bar);
      }
      const long = axis === 'columns' ? width : height;
      const inset = 2;
      const gap = list.length > 12 ? 0.5 : 1.5;
      const room = long - inset * 2 - gap * Math.max(0, list.length - 1);
      let at = inset;
      bars.forEach((bar, index) => {
        if (index >= list.length) { set(bar, 'display', 'none'); return; }
        set(bar, 'display', 'inline');
        const size = Math.max(0.75, list[index] * room);
        const along = at.toFixed(2);
        const extent = size.toFixed(2);
        const across = String(inset);
        const thick = String((axis === 'columns' ? height : width) - inset * 2);
        set(bar, 'x', axis === 'columns' ? along : across);
        set(bar, 'y', axis === 'columns' ? across : along);
        set(bar, 'width', axis === 'columns' ? extent : thick);
        set(bar, 'height', axis === 'columns' ? thick : extent);
        at += size + gap;
      });
    }
  };
}

function displayIsGrid(field: StyleField): boolean | null {
  const scope = field.wrapper.closest('.inspector') || document;
  const group = scope.querySelector<HTMLElement>('.fw-seg[data-style="display"]');
  if (!group) return null;
  const own = group.querySelector<HTMLElement>('.fw-seg-btn.is-on') || group.querySelector<HTMLElement>('.fw-seg-btn.is-inherited');
  return /grid/.test(own?.dataset.value || '');
}

function gridControl(field: StyleField, host: GridHost): Control {
  const axis: Axis = field.key === 'grid-template-rows' ? 'rows' : 'columns';
  const opener = element('button', 'fw-grid-open');
  opener.type = 'button';
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-expanded', 'false');
  labelAttr(opener, 'aria-label', 'Choose {0}', [{ t: field.label }]);
  labelAttr(opener, 'title', 'Choose {0}', [{ t: field.label }]);
  const face = drawing(axis, 22, 16);
  opener.append(face.svg);
  field.lead.append(opener);

  const panel = element('div', 'fw-gridpick');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  labelAttr(panel, 'aria-label', 'Choose {0}', [{ t: field.label }]);
  panel.dataset.axis = axis;
  panel.dataset.ownKeys = '';

  const hint = element('div', 'fw-gridpick-hint');
  hint.hidden = true;
  const hintText = element('p', 'fw-gridpick-hint-text');
  label(hintText, "{0} only takes effect when this element's Display is Grid.", [{ t: field.label }]);
  const make = element('button', 'fw-gridpick-make');
  make.type = 'button';
  label(make, 'Make this element a grid');
  const makeCss = element('code', 'fw-gridpick-make-css');
  hint.append(hintText, make, makeCss);
  if (!host.commitStyles) { make.hidden = true; makeCss.hidden = true; }

  const entries: HTMLButtonElement[] = [];
  const body = element('div', 'fw-gridpick-body');
  let stepInput: HTMLInputElement | null = null;
  let stepEntry: HTMLButtonElement | null = null;
  let stepDraw: Drawing | null = null;
  let stepCode: HTMLElement | null = null;
  let counter = 0;
  const panelId = `fw-gridpick-${field.key}`;

  function entry(css: string, name: Words, size: [number, number]): { button: HTMLButtonElement; draw: Drawing; code: HTMLElement } {
    const button = element('button', 'fw-gridpick-entry');
    button.type = 'button';
    button.tabIndex = -1;
    button.dataset.css = css;
    button.setAttribute('aria-pressed', 'false');
    const draw = drawing(axis, size[0], size[1]);
    draw.paint(parseTracks(css));
    const words = element('span', 'fw-gridpick-name');
    label(words, name[0], name[1]);
    labelAttr(button, 'title', name[0], name[1]);
    const code = element('code', 'fw-gridpick-css', css);
    button.append(draw.svg, words, code);
    entries.push(button);
    return { button, draw, code };
  }

  for (const group of groupsFor(axis)) {
    const section = element('div', 'fw-gridpick-group');
    section.setAttribute('role', 'group');
    const head = element('div', 'fw-gridpick-head');
    head.id = `${panelId}-head-${++counter}`;
    label(head, group.title);
    section.setAttribute('aria-labelledby', head.id);
    const tiles = element('div', group.rows ? 'fw-gridpick-tiles is-rows' : 'fw-gridpick-tiles');
    for (const choice of group.choices) {
      const made = entry(choice.css, choice.name, group.rows ? [40, 20] : [44, 22]);
      if (group.rows) made.button.classList.add('fw-gridpick-entry-row');
      tiles.append(made.button);
    }
    section.append(head, tiles);
    if (group.stepper) {
      const row = element('div', 'fw-gridpick-step');
      const stepLabel = element('label', 'fw-gridpick-step-label');
      const words = element('span');
      label(words, axis === 'columns' ? 'Any number of columns' : 'Any number of rows');
      const input = element('input', 'fw-gridpick-step-input');
      input.type = 'number';
      input.min = '1';
      input.max = String(MAX_EQUAL);
      input.step = '1';
      input.value = '8';
      stepLabel.append(words, input);
      const made = entry('repeat(8, 1fr)', axis === 'columns' ? ['{0} columns', ['8']] : ['{0} rows', ['8']], [30, 18]);
      made.button.classList.add('fw-gridpick-entry-step');
      row.append(stepLabel, made.button);
      section.append(row);
      stepInput = input;
      stepEntry = made.button;
      stepDraw = made.draw;
      stepCode = made.code;
      const nameNode = made.button.querySelector<HTMLElement>('.fw-gridpick-name')!;
      input.addEventListener('input', () => {
        const count = Math.round(Number(input.value));
        if (!Number.isFinite(count) || count < 1 || count > MAX_EQUAL) return;
        const css = `repeat(${count}, 1fr)`;
        made.button.dataset.css = css;
        if (stepCode!.textContent !== css) stepCode!.textContent = css;
        const words = axis === 'columns' ? (count === 1 ? 'One column' : '{0} columns') : (count === 1 ? 'One row' : '{0} rows');
        label(nameNode, words, [String(count)]);
        labelAttr(made.button, 'title', words, [String(count)]);
        stepDraw!.paint(parseTracks(css));
        mark();
      });
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        input.dispatchEvent(new Event('input'));
        choose(made.button);
      });
    }
    body.append(section);
  }
  panel.append(hint, body);
  host.overlay.append(panel);

  let current = '';
  let picked: string | null = null;
  let notGrid = false;
  let active: HTMLButtonElement | null = null;

  function mark(): void {
    const pending = notGrid && !!host.commitStyles && picked !== null;
    const target = pending ? picked! : current;
    const matches = new Set(entries.filter(button => !!target.trim() && sameTracks(button.dataset.css || '', target)));
    if (stepEntry && matches.size > 1) matches.delete(stepEntry);
    for (const button of entries) {
      const on = matches.has(button);
      const pressed = String(on);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      const look = on && pending;
      if (button.classList.contains('is-picked') !== look) button.classList.toggle('is-picked', look);
    }
    if (!makeCss.hidden) {
      const columns = (picked ?? current).trim();
      const css = `display: grid;\n${columns ? `${field.key}: ${columns};` : ''}`;
      if (makeCss.textContent !== css) makeCss.textContent = css;
      if (makeCss.title !== css) makeCss.title = css;
    }
  }

  function setActive(button: HTMLButtonElement | null, focus: boolean): void {
    if (active && active !== button) active.tabIndex = -1;
    active = button;
    if (!button) return;
    button.tabIndex = 0;
    if (focus) button.focus({ preventScroll: false });
  }

  function refreshHint(): void {
    const grid = displayIsGrid(field);
    notGrid = grid === false;
    if (hint.hidden !== !notGrid) hint.hidden = !notGrid;
    mark();
  }

  function place(): void {
    const rect = opener.getBoundingClientRect();
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.maxHeight = '';
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const beside = rect.left - GAP - width >= MARGIN;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const under = below >= height || below >= above;
    const room = beside ? window.innerHeight - MARGIN * 2 : Math.max(160, under ? below : above);
    if (height > room) panel.style.maxHeight = `${room}px`;
    const shown = Math.min(height, room);
    let top = beside ? rect.top - MARGIN : under ? rect.bottom + GAP : rect.top - GAP - shown;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - shown - MARGIN));
    const left = beside ? rect.left - GAP - width : Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  const outside = (event: Event): void => {
    const target = event.target as Node;
    if (panel.contains(target) || opener.contains(target)) return;
    close(false);
  };
  const leave = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (panel.contains(next) || opener.contains(next))) return;
    close(false, false);
  };
  const resize = (): void => close(false);
  const scrolled = (event: Event): void => { if (!panel.contains(event.target as Node)) place(); };

  function open(): void {
    if (!panel.hidden) return;
    picked = null;
    if (stepInput) {
      const sizes = parseTracks(current);
      const even = sizes && sizes.length >= 1 && sizes.length <= MAX_EQUAL && /^repeat\(\s*\d+\s*,\s*1fr\s*\)$|^(1fr\s*)+$/i.test(current.trim());
      const next = even ? String(sizes!.length) : '8';
      if (stepInput.value !== next) { stepInput.value = next; stepInput.dispatchEvent(new Event('input')); }
    }
    refreshHint();
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    place();
    const chosen = entries.find(button => button.getAttribute('aria-pressed') === 'true' && button !== stepEntry) || entries.find(button => button.getAttribute('aria-pressed') === 'true') || entries[0];
    setActive(chosen, true);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', resize);
    document.addEventListener('scroll', scrolled, true);
    panel.addEventListener('focusout', leave);
  }

  function close(restore: boolean, fallback = true): void {
    if (panel.hidden) return;
    const hadFocus = fallback && panel.contains(document.activeElement);
    panel.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', resize);
    document.removeEventListener('scroll', scrolled, true);
    panel.removeEventListener('focusout', leave);
    picked = null;
    if ((restore || hadFocus && document.activeElement === document.body) && opener.isConnected) {
      opener.focus({ preventScroll: true });
      if (document.activeElement !== opener) field.input.focus({ preventScroll: true });
    }
  }

  function choose(button: HTMLButtonElement): void {
    const css = button.dataset.css || '';
    if (!css) return;
    if (notGrid && host.commitStyles) {
      picked = css;
      setActive(button, false);
      mark();
      return;
    }
    close(true);
    void field.commit(css).catch(() => undefined);
  }

  function makeGrid(): void {
    const commitStyles = host.commitStyles;
    if (!commitStyles) return;
    const columns = (picked ?? current).trim();
    const styles: Record<string, string> = { display: 'grid' };
    if (columns && columns !== field.value().trim()) styles[field.key] = columns;
    close(true);
    commitStyles(styles).catch(error => host.status(error instanceof Error ? error.message : String(error), true));
  }

  function nearest(from: HTMLButtonElement, key: string): HTMLButtonElement | null {
    const box = from.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    let best: HTMLButtonElement | null = null;
    let score = Infinity;
    for (const button of entries) {
      if (button === from) continue;
      const other = button.getBoundingClientRect();
      const ox = other.left + other.width / 2;
      const oy = other.top + other.height / 2;
      const dx = ox - cx;
      const dy = oy - cy;
      let main: number;
      let side: number;
      if (key === 'ArrowRight') { if (dx <= 1 || Math.abs(dy) > box.height / 2) continue; main = dx; side = 0; }
      else if (key === 'ArrowLeft') { if (dx >= -1 || Math.abs(dy) > box.height / 2) continue; main = -dx; side = 0; }
      else if (key === 'ArrowDown') { if (dy <= 1) continue; main = dy; side = Math.abs(dx); }
      else { if (dy >= -1) continue; main = -dy; side = Math.abs(dx); }
      const total = main * 4 + side;
      if (total < score) { score = total; best = button; }
    }
    if (best) return best;
    const at = entries.indexOf(from);
    if (key === 'ArrowRight' || key === 'ArrowDown') return entries[at + 1] || null;
    return entries[at - 1] || null;
  }

  opener.addEventListener('click', () => { if (panel.hidden) open(); else close(true); });
  make.addEventListener('click', makeGrid);
  panel.addEventListener('mousedown', event => { if (!(event.target as Element).closest('input')) event.preventDefault(); });
  panel.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.fw-gridpick-entry');
    if (button && panel.contains(button)) choose(button);
  });
  panel.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    const from = (event.target as Element).closest<HTMLButtonElement>('.fw-gridpick-entry');
    if (event.key === 'Tab') {
      const stops = [make, active, stepInput].filter((node): node is HTMLButtonElement | HTMLInputElement => !!node && !node.hidden && !node.closest('[hidden]'));
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement as HTMLButtonElement);
      const next = stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length];
      event.preventDefault();
      next.focus({ preventScroll: false });
      return;
    }
    if (!from) return;
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const next = nearest(from, event.key);
      if (next) setActive(next, true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? entries[0] : entries[entries.length - 1], true);
    }
  });

  return {
    sync(value: string, inherited: string): boolean {
      const sizes = parseTracks(value);
      if (sizes === null) {
        close(false);
        return false;
      }
      current = value;
      const shownSizes = sizes.length ? sizes : parseTracks(inherited) || [];
      face.paint(shownSizes);
      const look = sizes.length ? 'own' : shownSizes.length ? 'inherited' : 'empty';
      if (opener.dataset.look !== look) opener.dataset.look = look;
      if (!panel.hidden) queueMicrotask(refreshHint);
      else mark();
      return true;
    },
    cancel() {
      picked = null;
      if (!panel.hidden) close(panel.contains(document.activeElement));
      else mark();
    },
    setRaw(raw: boolean) {
      if (!raw || panel.hidden) return;
      const had = panel.contains(document.activeElement);
      close(false, false);
      if (had) field.input.focus({ preventScroll: true });
    }
  };
}

export function register(): void {
  registerControl(['grid-template-columns', 'grid-template-rows'], gridControl);
}
