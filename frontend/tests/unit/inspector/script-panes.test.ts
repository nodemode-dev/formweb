import { beforeEach, describe, expect, it } from 'vitest';
import { installScriptPanes, isPageScript, layerGlyph, paintGlyph } from '../../../src/features/inspector/script-note';
import type { Site } from '../../../src/types';
import { makeSite } from '../site';

const NOTE = 'A page script has no box on the page, so these settings do not apply to it.';

function siteWith(sections: Record<string, Record<string, string>>): Site {
  return makeSite([{ id: 'home', name: 'Home', slug: '/', root: 'root' }], {
    root: { tag: 'main', children: ['heading', 'node'] },
    heading: { tag: 'h1' },
    node: { tag: 'div', styles: { display: 'contents' } }
  }, { code: { allowSections: true, sections } });
}

describe('the layer icon of a page script', () => {
  it('a page script row shows the script icon, a code section the code icon and any other element the box icon', () => {
    const glyph = layerGlyph();
    paintGlyph(glyph, siteWith({ node: { html: '', css: '', js: 'run()' } }), 'node');
    expect(glyph.dataset.glyph).toBe('script');
    paintGlyph(glyph, siteWith({ node: { html: '<p>Hi</p>', css: '', js: '' } }), 'node');
    expect(glyph.dataset.glyph).toBe('code');
    paintGlyph(glyph, siteWith({}), 'heading');
    expect(glyph.dataset.glyph).toBe('box');
  });

  it('the icon element and its pictures stay the same nodes when the kind of the layer changes', () => {
    const glyph = layerGlyph();
    const row = document.createElement('div');
    row.append(glyph);
    const pictures = Array.from(glyph.children);
    const changes: MutationRecord[] = [];
    const watch = new MutationObserver(found => changes.push(...found));
    watch.observe(row, { childList: true, subtree: true });
    const kinds: Record<string, Record<string, string>>[] = [{ node: { html: '', css: '', js: 'run()' } }, { node: { html: '<p>Hi</p>', css: '', js: '' } }, {}];
    for (const sections of kinds) paintGlyph(row.children[0], siteWith(sections), 'node');
    changes.push(...watch.takeRecords());
    watch.disconnect();
    expect(row.children[0]).toBe(glyph);
    expect(Array.from(glyph.children)).toEqual(pictures);
    expect(changes).toEqual([]);
  });
});

describe('which selection is a page script for the inspector', () => {
  it('a code section with a script and no HTML is a page script', () => {
    expect(isPageScript(siteWith({ node: { html: '', css: '', js: 'run()' } }), 'node')).toBe(true);
  });

  it('a code section with HTML is not a page script, even with a script', () => {
    expect(isPageScript(siteWith({ node: { html: '<p>Hi</p>', css: '', js: 'run()' } }), 'node')).toBe(false);
  });

  it('an element with no code section is not a page script', () => {
    expect(isPageScript(siteWith({ node: { html: '', css: '', js: 'run()' } }), 'heading')).toBe(false);
  });

  it('a script stored the way sites were converted before 0.32.0, with no HTML field at all, is a page script and the site is not changed', () => {
    const old = siteWith({ node: { js: 'run()' } });
    const stored = structuredClone(old);
    expect(isPageScript(old, 'node')).toBe(true);
    paintGlyph(layerGlyph(), old, 'node');
    expect(old).toEqual(stored);
  });
});

describe('the Design and Motion panes while a page script is selected', () => {
  let scroller: HTMLElement;
  let design: HTMLElement;
  let motion: HTMLElement;
  let controls: HTMLElement[];
  let panes: ReturnType<typeof installScriptPanes>;

  beforeEach(() => {
    document.body.replaceChildren();
    scroller = document.createElement('div');
    design = document.createElement('div');
    motion = document.createElement('div');
    const content = document.createElement('div');
    const code = document.createElement('div');
    code.dataset.codeSection = '';
    content.append(code);
    controls = ['Background', 'Spacing', 'Animation'].map(name => {
      const section = document.createElement('div');
      section.className = 'inspector-section';
      section.textContent = name;
      return section;
    });
    design.append(controls[0], controls[1]);
    motion.append(controls[2]);
    scroller.append(design, motion, content);
    document.body.append(scroller);
    panes = installScriptPanes([design, motion]);
  });

  const notes = (): HTMLElement[] => [design, motion].map(pane => pane.querySelector<HTMLElement>('.fw-script-note')!);
  const visible = (pane: HTMLElement, child: HTMLElement): boolean => !child.hidden && (child.classList.contains('fw-script-note') || !pane.classList.contains('fw-pane-script'));
  const shown = (pane: HTMLElement): string[] => Array.from(pane.children).filter(child => visible(pane, child as HTMLElement)).map(child => child.textContent ?? '');

  it('with a page script selected, Design and Motion each say the settings do not apply and show no controls', () => {
    panes.update(true, 'design');
    expect(shown(design)).toEqual([NOTE]);
    expect(shown(motion)).toEqual([NOTE]);
  });

  it('selecting another element hides the note and brings the controls back', () => {
    panes.update(true, 'design');
    panes.update(false, 'content');
    expect(notes().map(note => note.hidden)).toEqual([true, true]);
    expect(shown(design)).toEqual(['Background', 'Spacing']);
    expect(shown(motion)).toEqual(['Animation']);
  });

  it('before any page script is selected the panes show only their controls', () => {
    panes.update(false, 'design');
    expect(shown(design)).toEqual(['Background', 'Spacing']);
    expect(shown(motion)).toEqual(['Animation']);
  });

  it('selecting a page script from Motion moves the inspector to Content, and selecting an element after it returns to Motion', () => {
    expect(panes.update(true, 'motion')).toBe('content');
    expect(panes.update(false, 'content')).toBe('motion');
  });

  it('selecting a page script from Design moves to Content, and returns to Design afterwards', () => {
    expect(panes.update(true, 'design')).toBe('content');
    expect(panes.update(false, 'content')).toBe('design');
  });

  it('a person who leaves Content for another tab while the script is selected stays on that tab', () => {
    expect(panes.update(true, 'motion')).toBe('content');
    expect(panes.update(false, 'design')).toBe('design');
  });

  it('selecting a page script from Content or Page keeps that tab', () => {
    expect(panes.update(true, 'content')).toBe('content');
    expect(panes.update(false, 'content')).toBe('content');
    expect(panes.update(true, 'page')).toBe('page');
    expect(panes.update(false, 'page')).toBe('page');
  });

  it('going in and out of a page script keeps every control mounted: no node is added or removed', () => {
    const before = [Array.from(design.children), Array.from(motion.children)];
    const changes: MutationRecord[] = [];
    const watch = new MutationObserver(found => changes.push(...found.filter(record => record.type === 'childList')));
    watch.observe(scroller, { childList: true, subtree: true });
    panes.update(true, 'motion');
    panes.update(false, 'content');
    panes.update(true, 'design');
    panes.update(false, 'design');
    changes.push(...watch.takeRecords().filter(record => record.type === 'childList'));
    watch.disconnect();
    expect(changes).toEqual([]);
    expect([Array.from(design.children), Array.from(motion.children)]).toEqual(before);
    expect(controls.every(control => control.isConnected)).toBe(true);
  });
});
