import { afterEach, describe, expect, it } from 'vitest';
import { Canvas } from '../../../src/ui/canvas';
import type { Site } from '../../../src/types';
import { makeSite } from '../site';

const BREAKPOINTS = [{ id: 'desktop', name: 'Desktop', maxWidth: 100000 }, { id: 'tablet', name: 'Tablet', maxWidth: 991 }, { id: 'mobile', name: 'Mobile', maxWidth: 767 }];

function siteWith(styles: Record<string, string>, breakpoints: Record<string, Record<string, string>> = {}): Site {
  const site = makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], {
    root: { tag: 'main', children: ['box', 'other'] },
    box: { tag: 'div', styles },
    other: { tag: 'p', styles: { color: 'olive' } }
  });
  site.breakpoints = BREAKPOINTS.map(breakpoint => ({ ...breakpoint }));
  site.nodes.box.breakpoints = structuredClone(breakpoints);
  return site;
}

let stage: HTMLElement | undefined;
afterEach(() => { stage?.remove(); stage = undefined; });

async function drawn(site: Site, scope = ''): Promise<{ canvas: Canvas; node: () => HTMLElement }> {
  stage = document.createElement('div');
  const canvas = new Canvas(stage, () => undefined, () => undefined);
  document.body.append(stage);
  canvas.render(site, site.pages[0], '', 1280, 'en', scope);
  await canvas.loaded();
  const doc = canvas.frame.contentDocument!;
  return { canvas, node: () => doc.querySelector<HTMLElement>('[data-fw-id="box"]')! };
}

const own = (node: HTMLElement, property: string): string => node.style.getPropertyValue(property);

describe('a trial layer on the canvas', () => {
  it('a trial value shows on the element and clearing the layer puts back exactly the stored value', async () => {
    const { canvas, node } = await drawn(siteWith({ textAlign: 'left', color: 'red' }));
    const stored = node().getAttribute('style');
    expect(own(node(), 'text-align')).toBe('left');
    canvas.setLayer('trial', { box: { 'text-align': 'center' } });
    expect(own(node(), 'text-align')).toBe('center');
    expect(own(node(), 'color')).toBe('red');
    canvas.setLayer('trial', null);
    expect(own(node(), 'text-align')).toBe('left');
    expect(node().getAttribute('style')).toBe(stored);
  });

  it('a layer value for a property the element does not store is removed again when the layer is cleared', async () => {
    const { canvas, node } = await drawn(siteWith({ color: 'red' }));
    const stored = node().getAttribute('style');
    canvas.setLayer('play', { box: { opacity: '0.25' } });
    expect(own(node(), 'opacity')).toBe('0.25');
    canvas.setLayer('play', null);
    expect(own(node(), 'opacity')).toBe('');
    expect(node().getAttribute('style')).toBe(stored);
  });

  it('a layer changes only the element it names', async () => {
    const { canvas } = await drawn(siteWith({ color: 'red' }));
    const other = canvas.frame.contentDocument!.querySelector<HTMLElement>('[data-fw-id="other"]')!;
    const before = other.getAttribute('style');
    canvas.setLayer('trial', { box: { color: 'blue' } });
    expect(other.getAttribute('style')).toBe(before);
  });

  it('the trial layer wins over the play layer, which wins over the motion frame, which wins over the stored value', async () => {
    const { canvas, node } = await drawn(siteWith({ opacity: '0.1' }));
    canvas.setMotionFrame({ box: { opacity: '0.2' } });
    expect(own(node(), 'opacity')).toBe('0.2');
    canvas.setLayer('play', { box: { opacity: '0.3' } });
    expect(own(node(), 'opacity')).toBe('0.3');
    canvas.setLayer('trial', { box: { opacity: '0.4' } });
    expect(own(node(), 'opacity')).toBe('0.4');
    canvas.setLayer('play', { box: { opacity: '0.35' } });
    expect(own(node(), 'opacity')).toBe('0.4');
    canvas.setMotionFrame({ box: { opacity: '0.25' } });
    expect(own(node(), 'opacity')).toBe('0.4');
    canvas.setLayer('trial', null);
    expect(own(node(), 'opacity')).toBe('0.35');
    canvas.setLayer('play', null);
    expect(own(node(), 'opacity')).toBe('0.25');
    canvas.setMotionFrame(null);
    expect(own(node(), 'opacity')).toBe('0.1');
  });

  it('a null value under a narrower breakpoint shows what the wider breakpoint stores', async () => {
    const { canvas, node } = await drawn(siteWith({ color: 'red' }, { tablet: { color: 'blue' }, mobile: { color: 'green' } }), 'mobile');
    expect(own(node(), 'color')).toBe('green');
    canvas.setLayer('trial', { box: { color: null } });
    expect(own(node(), 'color')).toBe('blue');
    canvas.setLayer('trial', null);
    expect(own(node(), 'color')).toBe('green');
  });

  it('a null value under a narrower breakpoint with nothing stored above it falls back to the base value', async () => {
    const { canvas, node } = await drawn(siteWith({ color: 'red' }, { tablet: { color: 'blue' } }), 'tablet');
    expect(own(node(), 'color')).toBe('blue');
    canvas.setLayer('trial', { box: { color: null } });
    expect(own(node(), 'color')).toBe('red');
  });

  it('a null value at the base breakpoint leaves the element with no own value for that property', async () => {
    const { canvas, node } = await drawn(siteWith({ color: 'red', opacity: '0.5' }));
    canvas.setLayer('trial', { box: { color: null } });
    expect(own(node(), 'color')).toBe('');
    expect(own(node(), 'opacity')).toBe('0.5');
    canvas.setLayer('trial', null);
    expect(own(node(), 'color')).toBe('red');
  });

  it('setting and clearing a layer keeps the same element object, parent and place on the canvas', async () => {
    const { canvas, node } = await drawn(siteWith({ color: 'red' }));
    const before = node();
    const parent = before.parentElement;
    const index = Array.from(parent!.children).indexOf(before);
    canvas.setLayer('trial', { box: { color: 'blue', display: 'flex' } });
    canvas.setLayer('play', { box: { opacity: '0' } });
    expect(node()).toBe(before);
    canvas.setLayer('trial', null);
    canvas.setLayer('play', null);
    expect(node()).toBe(before);
    expect(before.parentElement).toBe(parent);
    expect(Array.from(parent!.children).indexOf(before)).toBe(index);
  });

  it.each([
    ['a url() value', '--picture', 'url(https://example.invalid/a.png)'],
    ['a url() holding a javascript: address', '--link', 'url(javascript:alert(1))'],
    ['an expression()', '--size', 'expression(alert(1))']
  ])('%s that the canvas refuses as a stored style is refused in a layer too', async (_what, property, value) => {
    const { canvas, node } = await drawn(siteWith({ '--plain': '4px', [property]: value }));
    expect(own(node(), '--plain')).toBe('4px');
    expect(own(node(), property)).toBe('');
    canvas.setLayer('trial', { box: { '--plain': '8px', [property]: value } });
    expect(own(node(), '--plain')).toBe('8px');
    expect(own(node(), property)).toBe('');
    canvas.setLayer('play', { box: { [property]: value } });
    expect(own(node(), property)).toBe('');
  });

  it('a new stored value drawn while a layer is on stays under the layer and shows once the layer is cleared', async () => {
    const site = siteWith({ color: 'red' });
    const { canvas, node } = await drawn(site);
    const before = node();
    canvas.setLayer('trial', { box: { color: 'blue' } });
    const next = structuredClone(site);
    next.nodes.box.styles.color = 'purple';
    canvas.render(next, next.pages[0], '', 1280, 'en', '');
    expect(own(node(), 'color')).toBe('blue');
    canvas.setLayer('trial', null);
    expect(own(node(), 'color')).toBe('purple');
    expect(node()).toBe(before);
  });
});
