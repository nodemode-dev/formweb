import { command, upload } from '../../api';
import { element, keyed, text, value } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { labelAttr, t } from '../../i18n';
import { readFonts, type InspectorContext } from './context';
import { buttonOf, fieldOf, labeled, selectOf } from './labeled';
import type { DesignFont, EditorState } from '../../types';

const STYLES = ['normal', 'italic'];
const DISPLAYS = ['optional', 'swap', 'block', 'fallback'];
const MAX_FACES = 16;

export interface FontsHandle {
  fill(next: EditorState): void;
  css(next: EditorState): string;
}

function validWeight(weight: string): boolean { return /^\d{1,4}(?: \d{1,4})?$/.test(weight.trim()); }
function validFamily(family: string): boolean { return family.length > 0 && family.length <= 64 && !/["'{};\\]/.test(family); }

export function installFonts(ctx: InspectorContext): FontsHandle {
  let latest: EditorState | undefined;
  const block = element('div', 'fw-ext-block');
  const head = labeled('div', 'fw-ext-head', 'Fonts');
  const list = element('div', 'fw-font-list');
  const empty = labeled('p', 'micro', 'No fonts uploaded yet.');
  const grid = element('div', 'form-grid');
  const family = ctx.input('Inter Web');
  const weight = ctx.input('100 900');
  weight.value = '400';
  const style = selectOf(ctx, STYLES.map(id => { const en = id === 'normal' ? 'Normal' : 'Italic'; return { id, name: en, en }; }));
  const display = ctx.select(DISPLAYS.map(id => ({ id, name: id })));
  grid.append(fieldOf(ctx, 'Family name', family), fieldOf(ctx, 'Weight or range', weight), fieldOf(ctx, 'Style', style), fieldOf(ctx, 'Display', display));
  const picker = element('input');
  picker.type = 'file';
  picker.accept = '.woff2,font/woff2';
  picker.hidden = true;
  document.body.append(picker);
  const add = buttonOf(ctx, 'Upload WOFF2 and add', 'upload', () => {
    if (!validFamily(family.value.trim())) throw new Error(t('Enter a family name of up to 64 characters without quotes, braces, semicolons or backslashes.'));
    if (!validWeight(weight.value)) throw new Error(t('Weight is a number such as 400 or a range such as 100 900.'));
    if (Object.keys(readFonts(latest!)).length >= MAX_FACES) throw new Error(t('A site holds up to 16 font faces.'));
    picker.click();
  }, 'fw-ext-add');
  block.append(head, list, empty, grid, add, labeled('p', 'micro', 'WOFF2 only, up to 4 MiB. Fonts are stored in this project, drawn on the canvas, and bundled into exports. Use the family name in the Family style field.'));
  ctx.panes.tokens.append(block);

  function save(map: Record<string, DesignFont>): Promise<unknown> { return command('design.set', { key: 'fonts', value: map }); }
  picker.addEventListener('change', () => void ctx.run(async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file || !latest) return;
    ctx.status(t('Uploading font...'));
    const asset = await upload(file);
    const map = readFonts(latest);
    const base = family.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'font';
    let id = base;
    for (let n = 2; map[id]; n++) id = `${base}-${n}`;
    map[id] = { family: family.value.trim(), src: asset.url, weight: weight.value.trim(), style: style.value as DesignFont['style'], display: display.value as DesignFont['display'] };
    await save(map);
    ctx.status(t('Font added. Set it in the Family style field of any element.'));
  }));

  function fontRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const top = element('div', 'fw-font-top');
    const name = element('span', 'fw-font-name');
    const source = element('span', 'micro fw-font-src');
    const remove = ctx.button('', undefined, () => {
      const map = readFonts(latest!);
      delete map[row.dataset.key!];
      return save(map);
    }, 'icon-button');
    remove.append(icon('trash'));
    labelAttr(remove, 'title', 'Remove font');
    labelAttr(remove, 'aria-label', 'Remove font');
    top.append(name, source, remove);
    const fields = element('div', 'form-grid fw-font-fields');
    const rowWeight = ctx.input('400');
    const rowStyle = selectOf(ctx, STYLES.map(id => { const en = id === 'normal' ? 'Normal' : 'Italic'; return { id, name: en, en }; }));
    const rowDisplay = ctx.select(DISPLAYS.map(id => ({ id, name: id })));
    const edit = (patch: () => Partial<DesignFont>): void => void ctx.run(() => {
      const map = readFonts(latest!);
      const key = row.dataset.key!;
      map[key] = { ...map[key], ...patch() };
      return save(map);
    });
    rowWeight.addEventListener('change', () => {
      if (!validWeight(rowWeight.value)) { ctx.status(t('Weight is a number such as 400 or a range such as 100 900.'), true); value(rowWeight, readFonts(latest!)[row.dataset.key!]?.weight || ''); return; }
      edit(() => ({ weight: rowWeight.value.trim() }));
    });
    rowStyle.addEventListener('change', () => edit(() => ({ style: rowStyle.value as DesignFont['style'] })));
    rowDisplay.addEventListener('change', () => edit(() => ({ display: rowDisplay.value as DesignFont['display'] })));
    fields.append(fieldOf(ctx, 'Weight', rowWeight), fieldOf(ctx, 'Style', rowStyle), fieldOf(ctx, 'Display', rowDisplay));
    row.append(top, fields);
    return row;
  }

  return {
    fill(next) {
      latest = next;
      const fonts = readFonts(next);
      const entries = Object.entries(fonts);
      empty.hidden = entries.length > 0;
      keyed(list, entries, item => item[0], fontRow, (row, [, face]) => {
        text(row.querySelector('.fw-font-name') as HTMLElement, face.family);
        text(row.querySelector('.fw-font-src') as HTMLElement, face.src.split('/').pop() || face.src);
        const inputs = row.querySelectorAll('input, select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
        value(inputs[0], face.weight);
        value(inputs[1], face.style);
        value(inputs[2], face.display);
      });
    },
    css(next) {
      return Object.values(readFonts(next)).filter(face => validFamily(face.family) && /^(?:\/|https:\/\/)[^\s"'()\\]+$/.test(face.src)).map(face => {
        const src = face.src.startsWith('/') ? location.origin + face.src : face.src;
        return `@font-face{font-family:"${face.family}";src:url("${src}") format("woff2");font-weight:${validWeight(face.weight) ? face.weight : '400'};font-style:${face.style === 'italic' ? 'italic' : 'normal'};font-display:swap}`;
      }).join('\n');
    }
  };
}
