import { afterEach, describe, expect, it } from 'vitest';
import { Canvas, codeKind } from '../../../src/ui/canvas';
import type { Site } from '../../../src/types';
import { makeSite } from '../site';

const SCRIPT = 'document.querySelector("#out").textContent = "ran";';

function pageWith(sections: Record<string, Record<string, string>>, instances: Record<string, { component: string }> = {}): Site {
  return makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], {
    root: { tag: 'main', children: ['heading', 'script', 'block', 'widget'] },
    heading: { tag: 'h1' },
    script: { tag: 'div', styles: { display: 'contents' } },
    block: { tag: 'div' },
    widget: { tag: 'div' }
  }, { code: { allowSections: true, sections, instances, components: { card: { name: 'Card' } } } });
}

let stage: HTMLElement | undefined;
afterEach(() => { stage?.remove(); stage = undefined; });

async function drawn(site: Site, posters: Record<string, string>): Promise<{ canvas: Canvas; doc: Document }> {
  stage = document.createElement('div');
  const canvas = new Canvas(stage, () => undefined, () => undefined);
  document.body.append(stage);
  canvas.setPosters(posters);
  canvas.render(site, site.pages[0], '', 1280, 'en', '');
  await canvas.loaded();
  return { canvas, doc: canvas.frame.contentDocument! };
}

const placeholder = (doc: Document, id: string): HTMLElement | null => doc.querySelector<HTMLElement>(`[data-fw-id="${id}"] > div[data-fw-poster]`);
const words = (poster: HTMLElement | null): string[] => !poster ? [] : poster.children.length ? Array.from(poster.children).filter(part => !(part as HTMLElement).hidden).map(part => part.textContent ?? '') : [poster.textContent ?? ''];

describe('which nodes are a page script', () => {
  const site = pageWith({ script: { html: '', css: '', js: SCRIPT }, block: { html: '<p id="out">waiting</p>', css: '', js: SCRIPT } });

  it('a code section with a script and no HTML is a page script', () => {
    expect(codeKind(site, 'script')).toBe('script');
  });

  it('a code section with HTML is a code section, not a page script, even when it also has a script', () => {
    expect(codeKind(site, 'block')).toBe('code');
  });

  it('a code section with HTML and no script is a code section', () => {
    const plain = pageWith({ block: { html: '<p>Hello</p>', css: 'p{color:red}', js: '' } });
    expect(codeKind(plain, 'block')).toBe('code');
  });

  it('a node with no code section is neither a page script nor a code section', () => {
    expect(codeKind(site, 'heading')).toBe('');
  });
});

describe('the canvas placeholder of a code section', () => {
  it('a script-only code section says Page script and that it runs in Preview and on the published site', async () => {
    const { doc } = await drawn(pageWith({ script: { html: '', css: '', js: SCRIPT } }), { script: '' });
    const poster = placeholder(doc, 'script');
    expect(poster?.getAttribute('data-fw-poster')).toBe('script');
    expect(words(poster)).toEqual(['Page script', 'Runs in Preview and on the published site, not on this canvas.']);
  });

  it('a code section with HTML says Code section and nothing more', async () => {
    const { doc } = await drawn(pageWith({ block: { html: '<p id="out">waiting</p>', css: '', js: SCRIPT } }), { block: '' });
    expect(words(placeholder(doc, 'block'))).toEqual(['Code section']);
  });

  it('a component without a picture still says Component', async () => {
    const { doc } = await drawn(pageWith({}, { widget: { component: 'card' } }), { widget: '' });
    expect(words(placeholder(doc, 'widget'))).toEqual(['Component']);
  });

  it('a script that gains HTML keeps the same placeholder on the canvas and only its words change, and back again', async () => {
    const scriptOnly = pageWith({ script: { html: '', css: '', js: SCRIPT } });
    const { canvas, doc } = await drawn(scriptOnly, { script: '' });
    const before = placeholder(doc, 'script')!;
    const parts = Array.from(before.children);
    const withHtml = pageWith({ script: { html: '<p id="out">waiting</p>', css: '', js: SCRIPT } });
    canvas.render(withHtml, withHtml.pages[0], '', 1280, 'en', '');
    expect(placeholder(doc, 'script')).toBe(before);
    expect(Array.from(before.children)).toEqual(parts);
    expect(words(before)).toEqual(['Code section']);
    canvas.render(scriptOnly, scriptOnly.pages[0], '', 1280, 'en', '');
    expect(placeholder(doc, 'script')).toBe(before);
    expect(words(before)).toEqual(['Page script', 'Runs in Preview and on the published site, not on this canvas.']);
  });

  it('a page script stored the way sites were converted before 0.32.0 is shown as a page script and the site is not changed', async () => {
    const old = pageWith({ script: { js: SCRIPT } });
    const stored = structuredClone(old);
    const { doc } = await drawn(old, { script: '' });
    expect(words(placeholder(doc, 'script'))[0]).toBe('Page script');
    expect(old).toEqual(stored);
  });
});
