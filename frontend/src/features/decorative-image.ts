import { element } from '../ui/dom';
import { label, labelAttr } from '../i18n';
import type { SiteNode } from '../types';

export interface DecorativeImage {
  update(node: SiteNode): void;
}

/* An image's Alternative text has three honest states: a description, no alt at all (the audit asks for one), or
   alt="" on purpose for a decorative picture. The checkbox writes the third; the text field is off while it is on. */
export function installDecorativeImage(alt: HTMLInputElement, write: (value: string | null) => void): DecorativeImage {
  const box = element('input');
  box.type = 'checkbox';
  box.dataset.attr = 'decorative';
  const row = element('label', 'checkbox-field fw-decorative');
  const words = element('span');
  label(words, 'Decorative image (no description)');
  labelAttr(row, 'title', 'Screen readers skip a decorative image. Leave it off for a picture that carries meaning, and describe it above.');
  row.append(box, words);
  row.hidden = true;
  alt.closest('.field')?.after(row);
  box.addEventListener('change', () => write(box.checked ? '' : null));
  return {
    update(node) {
      const image = node.tag === 'img';
      if (row.hidden === image) row.hidden = !image;
      const decorative = image && node.attrs.alt === '';
      if (box.checked !== decorative) box.checked = decorative;
      if (alt.disabled !== decorative) alt.disabled = decorative;
    }
  };
}
