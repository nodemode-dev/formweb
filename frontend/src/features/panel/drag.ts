import { element } from '../../ui/dom';
import type { DropZone } from './drop';

export interface RowDrag {
  list: HTMLElement;
  host: HTMLElement;
  ids: (row: HTMLElement) => string[];
  canStart: (row: HTMLElement, ids: string[]) => boolean;
  zone: (ids: string[], row: HTMLElement, fraction: number) => DropZone | null;
  drop: (ids: string[], over: string, zone: DropZone) => unknown;
}

const THRESHOLD = 4;
const EDGE = 28;
const SPEED = 12;

export function installRowDrag(options: RowDrag): void {
  const { list } = options;
  list.addEventListener('pointerdown', down => {
    if (down.button !== 0 || down.pointerType === 'touch') return;
    const row = (down.target as Element | null)?.closest<HTMLElement>('.list-row');
    if (!row || row.parentElement !== list || row.classList.contains('is-renaming')) return;
    const startX = down.clientX;
    const startY = down.clientY;
    let ids: string[] = [];
    let dragging = false;
    let pointerY = startY;
    let over: HTMLElement | null = null;
    let zone: DropZone | null = null;
    let frame = 0;
    const line = element('div', 'fw-drop-line');
    line.hidden = true;
    const mark = (next: HTMLElement | null, nextZone: DropZone | null): void => {
      if (over && (over !== next || nextZone !== 'into')) over.classList.remove('is-drop-into');
      over = next;
      zone = nextZone;
      if (!next || !nextZone) { line.hidden = true; return; }
      if (nextZone === 'into') { next.classList.add('is-drop-into'); line.hidden = true; return; }
      const box = next.getBoundingClientRect();
      const lead = next.querySelector<HTMLElement>('.icon')?.getBoundingClientRect().left ?? box.left;
      const area = list.getBoundingClientRect();
      const y = nextZone === 'before' ? box.top : box.bottom;
      line.hidden = y < area.top - 1 || y > area.bottom + 1;
      line.style.transform = `translate(${Math.round(lead)}px, ${Math.round(y - 1)}px)`;
      line.style.width = `${Math.max(0, Math.round(box.right - lead))}px`;
    };
    const locate = (): void => {
      const area = list.getBoundingClientRect();
      const x = Math.min(Math.max(area.left + 2, startX), area.right - 2);
      const y = Math.min(Math.max(area.top + 1, pointerY), area.bottom - 1);
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.list-row');
      if (!hit || hit.parentElement !== list) { mark(null, null); return; }
      const box = hit.getBoundingClientRect();
      const next = options.zone(ids, hit, (y - box.top) / Math.max(1, box.height));
      mark(next ? hit : null, next);
    };
    const tick = (): void => {
      frame = 0;
      if (!dragging) return;
      const area = list.getBoundingClientRect();
      const step = pointerY < area.top + EDGE ? -SPEED : pointerY > area.bottom - EDGE ? SPEED : 0;
      if (step) {
        const before = list.scrollTop;
        list.scrollTop += step;
        if (list.scrollTop !== before) { locate(); frame = requestAnimationFrame(tick); }
      }
    };
    const end = (): void => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('keydown', keys, true);
      if (frame) cancelAnimationFrame(frame);
      mark(null, null);
      line.remove();
      list.querySelectorAll('.is-drag-source').forEach(node => node.classList.remove('is-drag-source'));
      document.body.classList.remove('fw-row-dragging');
    };
    const swallowClick = (): void => {
      const stop = (click: Event): void => { click.preventDefault(); click.stopPropagation(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    };
    const move = (event: PointerEvent): void => {
      pointerY = event.clientY;
      if (!dragging) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < THRESHOLD) return;
        ids = options.ids(row);
        if (!options.canStart(row, ids)) { end(); return; }
        dragging = true;
        document.body.classList.add('fw-row-dragging');
        for (const id of ids) Array.from(list.children).find(node => (node as HTMLElement).dataset.key === id)?.classList.add('is-drag-source');
        options.host.append(line);
      }
      event.preventDefault();
      locate();
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const up = (): void => {
      const target = over?.dataset.key;
      const chosen = zone;
      const was = dragging;
      end();
      if (!was) return;
      swallowClick();
      if (target && chosen) void options.drop(ids, target, chosen);
    };
    const cancel = (): void => { const was = dragging; end(); if (was) swallowClick(); };
    const keys = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
      end();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    window.addEventListener('keydown', keys, true);
  });
}
