import { element } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { thumbUrl, type LibSection, type LibraryHooks } from './types';

/**
 * A fixed 16:10 box (the CSS owns the ratio, so nothing moves when a picture arrives). The placeholder icon is always
 * under the picture; a section with no thumbnail, or one that fails to load, simply keeps the placeholder.
 */
export function thumbBox(className = ''): HTMLElement {
  const box = element('div', `fw-lib-thumb ${className}`.trim());
  const placeholder = element('span', 'fw-lib-thumb-ph');
  placeholder.append(icon('image'));
  const picture = element('img', 'fw-lib-thumb-img');
  picture.alt = '';
  picture.width = 640;
  picture.height = 400;
  picture.decoding = 'async';
  picture.draggable = false;
  picture.hidden = true;
  picture.addEventListener('error', () => { picture.hidden = true; delete picture.dataset.src; });
  box.append(placeholder, picture);
  return box;
}

export function updateThumb(box: HTMLElement, hooks: LibraryHooks, section: LibSection, lazy: boolean): void {
  const picture = box.querySelector<HTMLImageElement>('.fw-lib-thumb-img');
  if (!picture) return;
  if (!section.thumb) {
    if (!picture.hidden) picture.hidden = true;
    return;
  }
  const wanted = thumbUrl(hooks, section.id);
  if (picture.dataset.src === wanted) return;
  picture.dataset.src = wanted;
  picture.loading = lazy ? 'lazy' : 'eager';
  picture.hidden = false;
  picture.src = wanted;
}
