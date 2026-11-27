import { labelAttr } from '../i18n';
import { element, keyed, text } from '../ui/dom';
import { icon } from '../ui/icons';
import { showContextMenu } from '../ui/context-menu';

export interface CrumbItem { id: string; name: string; tag: string }
export interface CrumbHooks {
  host: HTMLElement;
  pick: (id: string) => void;
}
export interface Crumbs {
  update: (trail: CrumbItem[], current: string) => void;
  fit: () => void;
}

const MORE = '\u0000more';

export function installCrumbs(nav: HTMLElement, hooks: CrumbHooks): Crumbs {
  let trail: CrumbItem[] = [];
  const more = element('button', 'fw-crumb fw-crumb-more');
  more.type = 'button';
  more.hidden = true;
  more.setAttribute('aria-haspopup', 'menu');
  labelAttr(more, 'aria-label', 'Show the hidden part of the selection path');
  labelAttr(more, 'title', 'Show the hidden part of the selection path');
  more.append(icon('more'));

  const crumbs = (): HTMLElement[] => Array.from(nav.children).filter(node => node !== more) as HTMLElement[];
  const overflows = (): boolean => nav.scrollWidth > nav.clientWidth + 0.5;
  const show = (node: HTMLElement, on: boolean): void => { if (node.hidden === on) node.hidden = !on; };

  function fit(): void {
    const all = crumbs();
    all.forEach(node => show(node, true));
    show(more, false);
    nav.classList.remove('is-tight');
    if (!nav.clientWidth || !overflows() || all.length < 2) {
      if (all.length && overflows()) nav.classList.add('is-tight');
      return;
    }
    const order = [...all.slice(1, -1), all[0]];
    show(more, true);
    for (const node of order) {
      show(node, false);
      if (!overflows()) return;
    }
    nav.classList.add('is-tight');
  }

  more.addEventListener('click', () => {
    const hidden = new Set(crumbs().filter(node => node.hidden).map(node => node.dataset.key));
    const entries = trail.filter(item => hidden.has(item.id)).map(item => ({ id: item.id, label: item.name, title: `${item.name} <${item.tag}>`, raw: true, run: () => hooks.pick(item.id) }));
    if (entries.length) showContextMenu(entries, more, { host: hooks.host, className: 'fw-crumbs-menu', returnFocus: more });
  });
  new ResizeObserver(() => fit()).observe(nav);

  return {
    fit,
    update(next, current) {
      trail = next;
      const entries: (CrumbItem | null)[] = next.length ? [next[0], null, ...next.slice(1)] : [];
      keyed(nav, entries, item => item ? item.id : MORE, item => {
        if (!item) return more;
        const crumb = element('button', 'fw-crumb');
        crumb.type = 'button';
        crumb.append(element('span', 'fw-crumb-name'));
        crumb.addEventListener('click', () => hooks.pick(crumb.dataset.key!));
        return crumb;
      }, (crumb, item) => {
        if (!item) return;
        text(crumb.firstElementChild as HTMLElement, item.name);
        crumb.title = `Select ${item.name} <${item.tag}>`;
        const on = item.id === current;
        crumb.classList.toggle('is-current', on);
        if (on) crumb.setAttribute('aria-current', 'true'); else crumb.removeAttribute('aria-current');
      });
      fit();
    }
  };
}
