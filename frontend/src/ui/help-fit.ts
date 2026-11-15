import { englishOf } from '../i18n';

const HELP = 'p.micro, div.micro';
// No shipped language needs more than 1.5 times the English lines, plus one for short notes, at any inspector width.
const GROWTH = 1.5;
const SHORT_NOTE = 4;
// Measured as if a classic scrollbar is always there, so the reserve does not depend on whether it shows.
const SCROLLBAR = 15;

function px(value: string): number { return parseFloat(value) || 0; }

export function watchHelp(inspector: HTMLElement): void {
  const scroll = inspector.querySelector<HTMLElement>('.inspector-scroll');
  if (!scroll) return;
  const probe = document.createElement('p');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('data-no-i18n', '');
  probe.style.cssText = 'position:fixed;left:0;top:0;margin:0;padding:0;visibility:hidden;pointer-events:none;overflow-wrap:break-word';
  document.body.append(probe);
  const fit = (): void => {
    const section = inspector.querySelector<HTMLElement>('.inspector-section');
    const sectionStyle = section ? getComputedStyle(section) : null;
    const room = scroll.offsetWidth - SCROLLBAR - (sectionStyle ? px(sectionStyle.paddingLeft) + px(sectionStyle.paddingRight) : 0);
    if (room <= 0) return;
    for (const item of Array.from(inspector.querySelectorAll<HTMLElement>(HELP))) {
      const text = englishOf(item);
      if (text === null) continue;
      if (!text) { if (item.style.minBlockSize) item.style.minBlockSize = ''; continue; }
      const style = getComputedStyle(item);
      const line = px(style.lineHeight);
      if (!line) continue;
      probe.style.width = `${Math.min(item.clientWidth || room, room)}px`;
      probe.style.font = style.font;
      probe.style.lineHeight = style.lineHeight;
      probe.style.letterSpacing = style.letterSpacing;
      probe.textContent = text;
      const lines = Math.max(1, Math.round(probe.offsetHeight / line));
      const reserve = Math.ceil(lines * GROWTH) + (lines <= SHORT_NOTE ? 1 : 0);
      const want = `${reserve * line}px`;
      if (item.style.minBlockSize !== want) item.style.minBlockSize = want;
    }
  };
  let queued = 0;
  const later = (): void => {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; fit(); });
  };
  fit();
  new ResizeObserver(later).observe(scroll);
  new MutationObserver(later).observe(inspector, { subtree: true, childList: true, characterData: true });
  void document.fonts?.ready.then(later);
  document.fonts?.addEventListener('loadingdone', later);
}
