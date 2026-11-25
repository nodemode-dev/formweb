export type Axis = 'x' | 'y';
export interface Flow { axis: Axis; reverse: boolean }
export interface Box { left: number; top: number; width: number; height: number }

export function flowOf(container: Element | null): Flow {
  const view = container?.ownerDocument.defaultView;
  if (!container || !view) return { axis: 'y', reverse: false };
  const style = view.getComputedStyle(container);
  if (style.display.includes('flex')) return { axis: style.flexDirection.startsWith('row') ? 'x' : 'y', reverse: style.flexDirection.endsWith('reverse') };
  if (style.display.includes('grid')) {
    const columns = style.gridTemplateColumns.split(/\s+/).filter(track => track && track !== 'none').length;
    return { axis: style.gridAutoFlow.startsWith('column') || columns > 1 ? 'x' : 'y', reverse: false };
  }
  return { axis: 'y', reverse: false };
}

export function nodeParent(element: Element): HTMLElement | null {
  for (let at = element.parentElement; at; at = at.parentElement) if (at.dataset.fwId && at.style.display !== 'contents') return at;
  return null;
}

export class FrameMap {
  constructor(private frame: HTMLIFrameElement, private stage: HTMLElement) {}

  private origin(): { left: number; top: number; scale: number } {
    const rect = this.frame.getBoundingClientRect();
    const scale = this.frame.offsetWidth ? rect.width / this.frame.offsetWidth : 1;
    return { left: rect.left + this.frame.clientLeft * scale, top: rect.top + this.frame.clientTop * scale, scale };
  }

  get scale(): number { return this.origin().scale; }

  toParent(x: number, y: number): { x: number; y: number } {
    const at = this.origin();
    return { x: at.left + x * at.scale, y: at.top + y * at.scale };
  }

  toFrame(x: number, y: number): { x: number; y: number } {
    const at = this.origin();
    return { x: (x - at.left) / at.scale, y: (y - at.top) / at.scale };
  }

  box(rect: DOMRect | Box): Box {
    const at = this.origin();
    return { left: at.left + rect.left * at.scale, top: at.top + rect.top * at.scale, width: rect.width * at.scale, height: rect.height * at.scale };
  }

  visible(): Box {
    const frame = this.frame.getBoundingClientRect();
    const stage = this.stage.getBoundingClientRect();
    const left = Math.max(frame.left, stage.left), top = Math.max(frame.top, stage.top);
    const right = Math.min(frame.right, stage.right), bottom = Math.min(frame.bottom, stage.bottom);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
}
