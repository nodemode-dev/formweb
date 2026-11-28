import { element, text as write } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';

export type Bring = 'elements' | 'code';
/** One sentence per choice, shown under the choice for the one picked; both hold their place so a pick moves nothing. */
export type BringWhy = Record<Bring, string>;
let made = 0;

const CHOICES: [Bring, string, string][] = [
  ['elements', 'Editable elements (recommended for editing)', 'Each heading, paragraph, picture and box becomes an element you can click, retype, restyle and drag. The look is measured at desktop width; responsive rules are not carried over, and scripts and frames stay as small code sections.'],
  ['code', 'Code sections (exact copy, edited as code)', 'The page stays exactly as written, scripts and responsive rules included, and runs in Preview and the export; on the canvas it is one block you edit as HTML, CSS and JavaScript.']
];

/** The "Bring pages in as" choice shared by Import HTML and Import site from zip; mounted once, painted by state. */
export function bringChoice(heading: string): { element: HTMLElement; value(): Bring; disable(on: boolean): void; heading(english: string): void; choose(value: Bring): void; explain(why: BringWhy | null): void } {
  const box = element('div', 'fw-lib-bring');
  const head = element('h3', 'fw-lib-subhead');
  label(head, heading);
  const group = element('div', 'fw-lib-bring-list');
  group.setAttribute('role', 'radiogroup');
  const why = element('div', 'fw-lib-bring-why');
  why.hidden = true;
  why.dataset.noI18n = '';
  const lines = { elements: element('p', 'fw-lib-row-meta'), code: element('p', 'fw-lib-row-meta') } as Record<Bring, HTMLElement>;
  made += 1;
  for (const [id, line] of Object.entries(lines)) { line.id = `fw-bring-why-${made}-${id}`; why.append(line); }
  let chosen: Bring = 'elements';
  const buttons = CHOICES.map(([id, title, note]) => {
    const button = element('button', 'fw-lib-bring-option');
    button.type = 'button';
    button.dataset.bring = id;
    button.setAttribute('role', 'radio');
    const name = element('span', 'fw-lib-row-name');
    label(name, title);
    const text = element('span', 'fw-lib-row-meta');
    label(text, note);
    button.append(name, text);
    button.addEventListener('click', () => { chosen = id; paint(); });
    group.append(button);
    return button;
  });
  const paint = (): void => {
    for (const button of buttons) {
      const on = button.dataset.bring === chosen;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
    }
    for (const [id, line] of Object.entries(lines)) {
      line.classList.toggle('is-on', id === chosen);
      line.setAttribute('aria-hidden', String(id !== chosen));
    }
    if (why.hidden) group.removeAttribute('aria-describedby');
    else group.setAttribute('aria-describedby', lines[chosen].id);
  };
  labelAttr(group, 'aria-label', heading);
  paint();
  box.append(head, group, why);
  let named = heading;
  return {
    element: box, value: () => chosen, disable: on => buttons.forEach(button => { button.disabled = on; }),
    choose: value => { chosen = value; paint(); },
    explain: given => {
      for (const [id, line] of Object.entries(lines)) write(line, given?.[id as Bring] || '');
      if (why.hidden === !given) return;
      why.hidden = !given;
      paint();
    },
    heading: english => {
      if (english === named) return;
      named = english;
      label(head, english);
      labelAttr(group, 'aria-label', english);
    }
  };
}
