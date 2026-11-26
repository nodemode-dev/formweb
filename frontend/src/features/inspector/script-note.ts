import '../../styles/page-script.css';
import { icon } from '../../ui/icons';
import { codeKind } from '../../ui/canvas';
import type { Site } from '../../types';
import { labeled } from './labeled';

export function layerGlyph(): HTMLElement {
  const glyph = icon('box');
  glyph.dataset.glyph = 'box';
  glyph.firstElementChild!.setAttribute('data-for', 'box');
  for (const name of ['code', 'script'] as const) {
    const svg = icon(name).firstElementChild!;
    svg.setAttribute('data-for', name);
    glyph.append(svg);
  }
  return glyph;
}

export function paintGlyph(glyph: Element, site: Site, id: string): void {
  const kind = codeKind(site, id) || 'box';
  if (glyph instanceof HTMLElement && glyph.dataset.glyph && glyph.dataset.glyph !== kind) glyph.dataset.glyph = kind;
}

export function isPageScript(site: Site, id: string): boolean {
  return codeKind(site, id) === 'script';
}

export function installScriptPanes(panes: HTMLElement[]): { update(script: boolean, tab: string): string } {
  const notes = panes.map(pane => {
    const note = labeled('p', 'micro fw-script-note', 'A page script has no box on the page, so these settings do not apply to it.');
    note.hidden = true;
    pane.prepend(note);
    return note;
  });
  let shown = false;
  let before = '';
  let offset = 0;
  const scroller = (): HTMLElement | null => panes[0].parentElement;
  return {
    update(script, tab) {
      if (script === shown) return tab;
      shown = script;
      panes.forEach((pane, index) => {
        pane.classList.toggle('fw-pane-script', script);
        notes[index].hidden = !script;
      });
      const box = scroller();
      if (script) {
        before = tab === 'design' || tab === 'motion' ? tab : '';
        offset = box?.scrollTop ?? 0;
        if (before || tab === 'content') queueMicrotask(() => {
          const code = box?.querySelector<HTMLElement>('[data-code-section]');
          if (box && code && code.getClientRects().length) box.scrollTop += code.getBoundingClientRect().top - box.getBoundingClientRect().top;
        });
        return before ? 'content' : tab;
      }
      const back = before && tab === 'content' ? before : tab;
      if (back !== tab) queueMicrotask(() => { if (box) box.scrollTop = offset; });
      before = '';
      return back;
    }
  };
}
