import { pathBounds } from './geometry';
import type { Host } from './host';
import { areaEditCommands, areaOptionsOf, areaTextFor } from './areatype';

/* Whether a text colour is light, so the box behind it is dark; colours other than hex count as dark. */
function light(color: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/* Typing into area type on the canvas. A double-click on area type with a selection tool opens a text box over its
   first shape, holding the whole text of the thread in the text's own font at the canvas zoom; Esc or a click
   elsewhere lays the words out again through the shape (and its thread) as one undo step, and the selection tool
   stays active. The box is rectangular: the words only take the shape's outline once they are laid out. */
export class AreaTextEditor {
  private box: HTMLTextAreaElement | null = null;
  private target: { text: string; before: string } | null = null;

  constructor(private h: Host, private shell: HTMLElement) {}

  active(): boolean { return this.box !== null; }

  open(id: string): boolean {
    const site = this.h.site();
    const found = areaTextFor(site, id);
    if (!found) return false;
    const shape = this.h.shape(found.spec.src);
    const f = shape ? this.h.frame(shape.svg) : undefined;
    const b = shape ? pathBounds(shape.subs) : null;
    if (!shape || !f || !b) return false;
    this.close(false);
    const o = areaOptionsOf(found.text, found.spec);
    const [x0, y0] = this.h.toShell(f, [b.x, b.y]);
    const [x1, y1] = this.h.toShell(f, [b.x + b.w, b.y + b.h]);
    const box = document.createElement('textarea');
    box.className = 'fw-v-areaedit';
    box.setAttribute('aria-label', 'Area type text');
    box.spellcheck = true;
    box.value = found.spec.text;
    Object.assign(box.style, {
      left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.max(40, Math.abs(x1 - x0))}px`, height: `${Math.max(24, Math.abs(y1 - y0))}px`,
      fontSize: `${o.size * f.sx}px`, lineHeight: `${o.leading * f.sy}px`, fontFamily: o.family, fontWeight: o.weight, color: o.color,
      textAlign: o.align, padding: `${o.inset * f.sy}px ${o.inset * f.sx}px`,
      background: light(o.color) ? 'rgba(24, 24, 27, 0.92)' : 'rgba(255, 255, 255, 0.94)',
    });
    box.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(true); }
    });
    box.addEventListener('blur', () => this.close(true));
    this.shell.append(box);
    this.box = box;
    this.target = { text: found.text.id, before: found.spec.text };
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return true;
  }

  /* Ends editing; with `keep`, a changed text is laid out again in one commit. */
  close(keep: boolean): void {
    const box = this.box, target = this.target;
    if (!box || !target) return;
    this.box = null;
    this.target = null;
    const value = box.value.slice(0, 20000);
    box.remove();
    if (!keep || value === target.before) return;
    const site = this.h.site();
    const found = areaTextFor(site, target.text);
    if (!found) return;
    const made = areaEditCommands(site, found.text, found.spec, { ...areaOptionsOf(found.text, found.spec), text: value });
    void this.h.commit(made.cmds, [found.text.id]);
  }
}
