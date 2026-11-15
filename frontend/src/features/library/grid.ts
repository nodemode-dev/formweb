import { element, keyed, text } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { t, tn } from '../../i18n';
import { thumbBox, updateThumb } from './thumb';
import { KNOWN_CATEGORIES, categoryLabel, sectionName, sectionText, type LibComponent, type LibIndex, type LibSection, type LibraryHooks } from './types';

/**
 * The browse view: category chips, a search field and a grid of cards. Cards are built once per section id and reused
 * (keyed), filtering only toggles `hidden`, and every thumbnail sits in a fixed 16:10 box, so nothing moves while
 * pictures load, while the list grows or while a search narrows it.
 */
export class SectionGrid {
  readonly element = element('div', 'fw-lib-view fw-lib-list');
  private chips = element('div', 'fw-lib-chips');
  private search = element('input', 'fw-lib-search-input');
  private count = element('p', 'fw-lib-count');
  private grid = element('div', 'fw-lib-grid');
  private empty = element('p', 'fw-lib-empty');
  private retry = element('button', 'fw-lib-retry', t('Try again'));
  private scroller = element('div', 'fw-lib-scroll');
  private sections: LibSection[] = [];
  private codes = new Map<string, LibComponent>();
  private category = '';
  private opened = '';

  constructor(private hooks: LibraryHooks, private onOpen: (section: LibSection) => void, onRetry: () => void) {
    this.search.type = 'search';
    this.search.placeholder = t('Search sections');
    this.search.setAttribute('aria-label', t('Search sections'));
    this.search.autocomplete = 'off';
    this.search.spellcheck = false;
    this.search.addEventListener('input', () => this.filter());
    this.retry.type = 'button';
    this.retry.hidden = true;
    this.retry.addEventListener('click', onRetry);
    const field = element('label', 'fw-lib-search');
    field.append(icon('search'), this.search);
    this.chips.setAttribute('role', 'group');
    this.chips.setAttribute('aria-label', t('Categories'));
    this.count.setAttribute('aria-live', 'polite');
    const head = element('div', 'fw-lib-head');
    head.append(this.chips, field, this.count);
    this.empty.append(this.retry);
    this.scroller.append(this.grid, this.empty);
    this.element.append(head, this.scroller);
    this.setMessage(t('Loading the library...'), false);
    this.paintCategories(KNOWN_CATEGORIES);
  }

  private paintCategories(categories: string[]): void {
    keyed(this.chips, ['', ...categories], id => id || 'all', id => {
      const chip = element('button', 'fw-lib-chip');
      chip.type = 'button';
      chip.addEventListener('click', () => { this.category = this.category === id ? '' : id; this.paintChips(); this.filter(); });
      return chip;
    }, (node, id) => {
      node.dataset.category = id;
      text(node, id ? categoryLabel(id) : t('All'));
    });
    this.paintChips();
  }

  /** Shown when there is nothing to list (loading, a failed request or an empty library). The grid keeps its place. */
  setMessage(message: string, retry: boolean): void {
    const label = this.empty.firstChild && this.empty.firstChild.nodeType === 3 ? (this.empty.firstChild as Text) : null;
    if (label) { if (label.data !== message) label.data = message; } else this.empty.prepend(document.createTextNode(message));
    this.retry.hidden = !retry;
    this.empty.hidden = false;
  }

  setIndex(index: LibIndex): void {
    this.sections = index.sections;
    this.codes = new Map(index.components.map(item => [item.id, item]));
    if (this.category && !index.categories.includes(this.category)) this.category = '';
    this.paintCategories(index.categories);
    keyed(this.grid, this.sections, section => section.id, section => this.card(section), (node, section) => this.paintCard(node, section));
    this.filter();
  }

  /** Marks the card whose detail is open. */
  mark(id: string): void {
    this.opened = id;
    for (const node of Array.from(this.grid.children) as HTMLElement[]) node.classList.toggle('is-open', node.dataset.key === id);
  }

  private paintChips(): void {
    for (const node of Array.from(this.chips.children) as HTMLElement[]) {
      const on = (node.dataset.category || '') === this.category;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', String(on));
    }
  }

  private card(section: LibSection): HTMLElement {
    const card = element('button', 'fw-lib-card');
    card.type = 'button';
    const box = thumbBox();
    box.append(element('span', 'fw-lib-badge'));
    card.append(box, element('span', 'fw-lib-card-name'));
    card.addEventListener('click', () => { const found = this.sections.find(item => item.id === section.id); if (found) this.onOpen(found); });
    return card;
  }

  private paintCard(card: HTMLElement, section: LibSection): void {
    const name = sectionName(section);
    updateThumb(card.firstElementChild as HTMLElement, this.hooks, section, true);
    const parts = (section.components || []).map(id => this.codes.get(id)).filter((item): item is LibComponent => !!item);
    const badge = card.querySelector<HTMLElement>('.fw-lib-badge')!;
    const code = parts.map(item => item.code || item.name || item.id).join(' ');
    text(badge, code);
    if (badge.hidden === !!code) badge.hidden = !code;
    badge.title = parts.map(item => item.name || item.id).join(', ');
    text(card.querySelector<HTMLElement>('.fw-lib-card-name')!, name);
    card.title = name;
    card.setAttribute('aria-label', name);
    card.classList.toggle('is-open', section.id === this.opened);
  }

  /** The words a search looks in: name, tags, product, description and category, in English and in the shown language. */
  private haystack(section: LibSection): string {
    return [section.name, sectionName(section), ...(section.tags || []), section.product, section.description, sectionText(section), section.category, categoryLabel(section.category || '')]
      .filter(Boolean).join(' ').toLowerCase();
  }

  filter(): void {
    const words = this.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const cards = new Map((Array.from(this.grid.children) as HTMLElement[]).map(node => [node.dataset.key || '', node]));
    let shown = 0;
    for (const section of this.sections) {
      const node = cards.get(section.id);
      if (!node) continue;
      const hay = words.length ? this.haystack(section) : '';
      const visible = (!this.category || section.category === this.category) && words.every(word => hay.includes(word));
      if (node.hidden === visible) node.hidden = !visible;
      if (visible) shown++;
    }
    text(this.count, tn(shown, '{0} section', '{0} sections'));
    if (shown) {
      if (!this.empty.hidden) this.empty.hidden = true;
    } else this.setMessage(this.sections.length ? t('No sections match.') : t('The library has no sections yet.'), false);
  }
}
