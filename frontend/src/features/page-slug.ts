import { element, text } from '../ui/dom';
import { t } from '../i18n';
import type { Site } from '../types';

export interface PageSlug {
  reset(): void;
  resolve(): string;
}

export function slugOf(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const bare = (path: string): string => path.trim().replace(/^\/+|\/+$/g, '');

/* Add page: the slug follows the name until the person edits it, the note under the fields shows the address that
   will be used, and a taken or unusable address is said there and refused before the dialog closes. */
export function installPageSlug(name: HTMLInputElement, slug: HTMLInputElement, pane: HTMLElement, site: () => Site): PageSlug {
  let follow = true;
  const note = element('p', 'micro fw-page-address');
  note.setAttribute('role', 'status');
  pane.append(note);

  function path(): string {
    const own = bare(slug.value);
    return '/' + (own || slugOf(name.value) || 'untitled-page');
  }
  function problem(target: string): string {
    const key = bare(target);
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.includes('//')) return t('An address can use letters, digits, hyphens, underscores and slashes only.');
    const owner = site().pages.find(page => bare(page.slug).toLowerCase() === key.toLowerCase());
    return owner ? t('{0} is already the address of {1}. Choose another address.', [target, owner.name]) : '';
  }
  function show(): void {
    const target = path();
    const wrong = problem(target);
    const given = (site().settings?.baseUrl || '').replace(/\/+$/, '');
    const base = /^https?:\/\/(www\.)?example\.com$/i.test(given) ? '' : given;
    const message = wrong || t('The page will be at {0}', [base ? base + target : target]);
    text(note, message);
    if (note.title !== message) note.title = message;
    note.classList.toggle('error', !!wrong);
  }
  name.addEventListener('input', () => {
    const made = slugOf(name.value);
    if (follow) slug.value = made ? '/' + made : '';
    show();
  });
  slug.addEventListener('input', () => {
    follow = !slug.value.trim();
    show();
  });
  return {
    reset() {
      follow = true;
      name.value = '';
      slug.value = '';
      show();
    },
    resolve() {
      const target = path();
      const wrong = problem(target);
      if (wrong) { show(); throw new Error(wrong); }
      return target;
    }
  };
}
