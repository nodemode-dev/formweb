import { command } from '../../api';
import { element, keyed, text, value } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { labelAttr, t } from '../../i18n';
import type { InspectorContext } from './context';
import { buttonOf, fieldOf, labeled } from './labeled';
import type { EditorState } from '../../types';

interface Registered { syntax: string; inherits: boolean; initial?: string }

const SYNTAXES = ['<number>', '<integer>', '<length>', '<percentage>', '<length-percentage>', '<color>', '<angle>', '<time>', '*'];

function readProperties(next: EditorState): Record<string, Registered> {
  const design = (next.site.extensions?.design || {}) as { properties?: Record<string, Registered> };
  const out: Record<string, Registered> = {};
  for (const [key, item] of Object.entries(design.properties || {})) out[key] = { ...item };
  return out;
}

export function installProperties(ctx: InspectorContext): { fill(next: EditorState): void } {
  let latest: EditorState | undefined;
  const block = element('div', 'fw-ext-block');
  const head = labeled('div', 'fw-ext-head', 'Registered properties');
  const list = element('div', 'fw-font-list');
  const empty = labeled('p', 'micro', 'No registered properties yet.');
  const grid = element('div', 'form-grid');
  const name = ctx.input('fold');
  grid.append(fieldOf(ctx, 'Property name', name, true));
  const add = buttonOf(ctx, 'Add property', 'plus', () => {
    const key = name.value.trim().replace(/^--/, '');
    if (!key) throw new Error(t('Enter a property name.'));
    const map = readProperties(latest!);
    map[key] = { syntax: '<number>', inherits: false, initial: '0' };
    return save(map).then(() => { name.value = ''; });
  }, 'fw-ext-add');
  block.append(head, list, empty, grid, add, labeled('p', 'micro', 'Registered properties get a type, so they can be animated and transitioned. Use them as var(--name) in any style value.'));
  ctx.panes.tokens.append(block);

  function save(map: Record<string, Registered>): Promise<unknown> { return command('design.set', { key: 'properties', value: map }); }

  function propertyRow(): HTMLElement {
    const row = element('div', 'fw-font-row');
    const top = element('div', 'fw-font-top');
    const label = element('span', 'fw-font-name');
    const remove = ctx.button('', undefined, () => {
      const map = readProperties(latest!);
      delete map[row.dataset.key!];
      return save(map);
    }, 'icon-button');
    remove.append(icon('trash'));
    labelAttr(remove, 'title', 'Remove property');
    labelAttr(remove, 'aria-label', 'Remove property');
    top.append(label, remove);
    top.children[0].classList.add('fw-font-src');
    const fields = element('div', 'form-grid');
    const syntax = ctx.select(SYNTAXES.map(id => ({ id, name: id })));
    const initial = ctx.input('0');
    const inherits = element('input');
    inherits.type = 'checkbox';
    const inheritsLabel = element('label', 'checkbox-field');
    inheritsLabel.append(inherits, labeled('span', '', 'Inherits'));
    const error = element('p', 'micro error', '');
    error.hidden = true;
    const commit = (): void => void ctx.run(async () => {
      try {
        const map = readProperties(latest!);
        const item: Registered = { syntax: syntax.value, inherits: inherits.checked };
        if (initial.value.trim()) item.initial = initial.value.trim();
        map[row.dataset.key!] = item;
        await save(map);
        error.hidden = true;
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : String(failure);
        text(error, message);
        error.hidden = false;
        throw failure;
      }
    });
    syntax.addEventListener('change', commit);
    initial.addEventListener('change', commit);
    inherits.addEventListener('change', commit);
    fields.append(fieldOf(ctx, 'Syntax', syntax), fieldOf(ctx, 'Initial value', initial), inheritsLabel);
    row.append(top, fields, error);
    return row;
  }

  return {
    fill(next) {
      latest = next;
      const entries = Object.entries(readProperties(next));
      empty.hidden = entries.length > 0;
      keyed(list, entries, item => item[0], propertyRow, (row, [key, item]) => {
        text(row.querySelector('.fw-font-name') as HTMLElement, `--${key}`);
        const syntax = row.querySelector('select') as HTMLSelectElement;
        const initial = row.querySelector('input[type="text"]') as HTMLInputElement;
        const inherits = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
        value(syntax, item.syntax);
        value(initial, item.initial || '');
        if (document.activeElement !== inherits && inherits.checked !== !!item.inherits) inherits.checked = !!item.inherits;
      });
    }
  };
}
