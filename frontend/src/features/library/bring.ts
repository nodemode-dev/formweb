import { element } from '../../ui/dom';
import { label, labelAttr } from '../../i18n';

export type Bring = 'elements' | 'code';

const CHOICES: [Bring, string, string][] = [
  ['elements', 'Editable elements (recommended for editing)', 'Each heading, paragraph, picture and box becomes an element you can click, retype, restyle and drag. The look is measured at desktop width; responsive rules are not carried over, and scripts and frames stay as small code sections.'],
  ['code', 'Code sections (exact copy, edited as code)', 'The page stays exactly as written, scripts and responsive rules included, and runs in Preview and the export; on the canvas it is one block you edit as HTML, CSS and JavaScript.']
];

/** The "Bring pages in as" choice shared by Import HTML and Import site from zip; mounted once, painted by state. */
export function bringChoice(heading: string): { element: HTMLElement; value(): Bring; disable(on: boolean): void; heading(english: string): void } {
  const box = element('div', 'fw-lib-bring');
  const head = element('h3', 'fw-lib-subhead');
  label(head, heading);
  const group = element('div', 'fw-lib-bring-list');
  group.setAttribute('role', 'radiogroup');
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
  };
  labelAttr(group, 'aria-label', heading);
  paint();
  box.append(head, group);
  let named = heading;
  return {
    element: box, value: () => chosen, disable: on => buttons.forEach(button => { button.disabled = on; }),
    heading: english => {
      if (english === named) return;
      named = english;
      label(head, english);
      labelAttr(group, 'aria-label', english);
    }
  };
}
