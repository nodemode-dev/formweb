import { describe, expect, it } from 'vitest';
import { bodyQualified, emptyOutcome, guardSelector, scriptWords, selectorList, subjectClasses, summary } from '../../../src/features/convert/rules';
import { t, tn } from '../../../src/i18n';

const GUARD = ':where(:not([data-fw-node]))';

function board(): HTMLElement {
  const root = document.createElement('section');
  root.setAttribute('data-fw-node', 'root');
  root.innerHTML = '<p data-fw-node="converted" id="converted">Converted</p><div data-fw-node="deck"><p id="built">Built</p><span class="card" id="card">Card</span></div>';
  document.body.replaceChildren(root);
  return root;
}

const ids = (root: Element, selector: string): string[] => Array.from(root.querySelectorAll(selector)).map(e => e.id);

describe('a selector list splits where CSS splits it', () => {
  it('at top-level commas only', () => {
    expect(selectorList('h1, .card > p,li')).toEqual(['h1', '.card > p', 'li']);
    expect(selectorList('  main  .card:hover  ')).toEqual(['main  .card:hover']);
  });

  it('not at the commas inside :is(), :not() or an :nth-child( of ) list', () => {
    expect(selectorList(':is(.a, .b) > p, :not(.c, .d), li:nth-child(2n+1 of .x, .y)')).toEqual([':is(.a, .b) > p', ':not(.c, .d)', 'li:nth-child(2n+1 of .x, .y)']);
  });

  it('not at a comma inside an attribute value, quoted either way, or an escaped comma in a class name', () => {
    expect(selectorList('a[title="x, y"], b[data-k=\'p,q\'], .one\\,two, c')).toEqual(['a[title="x, y"]', 'b[data-k=\'p,q\']', '.one\\,two', 'c']);
  });

  it('a closing style tag inside a quoted attribute value stays part of its selector', () => {
    expect(selectorList('a[title="</style><script>x()</script>, y"], b')).toEqual(['a[title="</style><script>x()</script>, y"]', 'b']);
  });
});

describe('the classes the subject of a selector requires', () => {
  it('are those of the compound after the last combinator', () => {
    expect(subjectClasses('.list .item.open')).toEqual(['item', 'open']);
    expect(subjectClasses('.a > .b + .c ~ .d')).toEqual(['d']);
    expect(subjectClasses('.card p')).toEqual([]);
  });

  it('include a class before a pseudo-class or pseudo-element, with one or two colons', () => {
    expect(subjectClasses('#top .card:hover')).toEqual(['card']);
    expect(subjectClasses('.pill::before')).toEqual(['pill']);
    expect(subjectClasses('.pill:after')).toEqual(['pill']);
  });

  it('leave out classes inside :not() and :is(), which a matching element need not carry', () => {
    expect(subjectClasses('div:not(.hidden)')).toEqual([]);
    expect(subjectClasses('.card:is(.a, .b)')).toEqual(['card']);
  });

  it('read a dot or a space inside an attribute value as part of the value', () => {
    expect(subjectClasses('.tag[title=".fake other"]')).toEqual(['tag']);
  });

  it('read an escaped character as part of the class name', () => {
    expect(subjectClasses('.md\\:wide')).toEqual(['md:wide']);
  });
});

describe('a guarded selector reaches what the script builds and never a converted element', () => {
  it('a type or id selector, guarded, matches the built paragraph and not the converted one', () => {
    const root = board();
    expect(ids(root, 'p')).toEqual(['converted', 'built']);
    expect(ids(root, guardSelector('p', GUARD))).toEqual(['built']);
    expect(ids(root, guardSelector('[data-fw-node="deck"] > #built', GUARD))).toEqual(['built']);
  });

  it('a rule written against the converted elements own attribute matches nothing once guarded', () => {
    const root = board();
    expect(ids(root, '[data-fw-node]').length).toBeGreaterThan(0);
    expect(ids(root, guardSelector('[data-fw-node]', GUARD))).toEqual([]);
  });

  it('a class subject is left able to match a converted element the script gives that class', () => {
    const root = board();
    const converted = root.querySelector('#converted')!;
    expect(converted.matches(guardSelector('.card', GUARD))).toBe(false);
    converted.classList.add('card');
    expect(converted.matches(guardSelector('.card', GUARD))).toBe(true);
  });

  it('the guard goes in front of a pseudo-element, so the selector still names it', () => {
    const root = board();
    const guarded = guardSelector('p::before', GUARD);
    expect(guarded.endsWith('::before')).toBe(true);
    expect(ids(root, guarded.slice(0, -'::before'.length))).toEqual(['built']);
  });
});

describe('a selector that asks more of the body than being the body', () => {
  it('is one with a class, id, pseudo-class or attribute on body, after an optional html or :root', () => {
    expect(bodyQualified('body.dark .card')).toBe(true);
    expect(bodyQualified('BODY#main p')).toBe(true);
    expect(bodyQualified('html > body:has(.open) p')).toBe(true);
    expect(bodyQualified(':root body[data-theme] p')).toBe(true);
  });

  it('is not plain body, a custom element whose name starts with body, or a class named body', () => {
    expect(bodyQualified('body .card')).toBe(false);
    expect(bodyQualified('body')).toBe(false);
    expect(bodyQualified('body-wrap .card')).toBe(false);
    expect(bodyQualified('main.body p')).toBe(false);
  });
});

describe('the words a script is written with', () => {
  it('are names and the words inside its strings, with hyphens and underscores kept', () => {
    const words = new Set<string>();
    scriptWords('el.classList.add(\'is-open\'); node.className = "card_2 pill";', words);
    for (const word of ['el', 'classList', 'add', 'is-open', 'node', 'className', 'card_2', 'pill']) expect(words.has(word)).toBe(true);
    expect(words.has('is')).toBe(false);
  });

  it('stop at the limit given', () => {
    const words = new Set<string>();
    scriptWords('alpha beta gamma delta epsilon', words, 3);
    expect(words.size).toBe(3);
  });
});

describe('the result sentence about kept rules', () => {
  it('says how many style rules were kept for what the script builds, in the singular for one', () => {
    expect(summary({ ...emptyOutcome(), converted: 20, parts: { script: 1 }, kept: 14 }, t, tn)).toBe('Converted 20 elements. 1 part stayed as code: a script. Kept 14 style rules for the content the page\'s script builds.');
    expect(summary({ ...emptyOutcome(), converted: 2, kept: 1 }, t, tn)).toBe('Converted 2 elements. Kept 1 style rule for the content the page\'s script builds.');
  });

  it('says when checking took too long and every rule was kept, without also claiming they were checked', () => {
    const said = summary({ ...emptyOutcome(), converted: 3, kept: 40, keptAll: 40 }, t, tn);
    expect(said).toBe('Converted 3 elements. Kept 40 style rules for the content the page\'s script builds without checking which ones the converted elements use: checking took too long, so every rule was kept.');
  });

  it('names the rules left out past the bounds of 3000 rules and 192 KiB', () => {
    const said = summary({ ...emptyOutcome(), converted: 1, kept: 3000, keptOver: 17000 }, t, tn);
    expect(said).toContain('Kept 3000 style rules for the content the page\'s script builds.');
    expect(said).toContain('17000 more style rules were left out: at most 3000 rules and 192 KiB are kept for a script.');
  });

  it('says when the kept rules were left out because the page code would be too large, and when names clashed with the site', () => {
    expect(summary({ ...emptyOutcome(), converted: 4, keptDropped: 30 }, t, tn)).toBe('Converted 4 elements. The 30 style rules kept for the content the page\'s script builds were left out because the page\'s code would be too large.');
    expect(summary({ ...emptyOutcome(), converted: 4, kept: 5, keptClash: 2 }, t, tn)).toContain('2 fonts or registered properties from the page\'s stylesheet were left out because the site already uses their names.');
  });

  it('says nothing about style rules when none were kept', () => {
    const said = summary({ ...emptyOutcome(), converted: 20, parts: { script: 1 } }, t, tn);
    expect(said).toBe('Converted 20 elements. 1 part stayed as code: a script.');
    expect(said).not.toContain('style rule');
  });
});

describe('hostile selectors and scripts', () => {
  const long = '.a '.repeat(66_667);

  it('a 200,000 character selector splits, gives its subject and is guarded without throwing', () => {
    expect(long.length).toBeGreaterThanOrEqual(200_000);
    expect(selectorList(long)).toHaveLength(1);
    expect(subjectClasses(long.trim())).toEqual(['a']);
    expect(guardSelector(long.trim() + ' p', GUARD).endsWith(`p${GUARD}`)).toBe(true);
    expect(bodyQualified(long)).toBe(false);
  });

  it('unbalanced brackets and an unclosed quote do not split the rest of the list or throw', () => {
    const open = 'a(' + 'b, '.repeat(70_000);
    expect(selectorList(open)).toEqual([open.trim()]);
    const quoted = 'a[title="' + 'x, '.repeat(70_000);
    expect(selectorList(quoted)).toEqual([quoted.trim()]);
    expect(() => subjectClasses(')))]]] .ok' + '['.repeat(100_000))).not.toThrow();
    expect(subjectClasses(')))]]] .ok')).toEqual(['ok']);
    expect(() => guardSelector('"'.repeat(200_001), GUARD)).not.toThrow();
  });

  it('a script of a million characters gives its words within the limit', () => {
    const words = new Set<string>();
    scriptWords('w'.repeat(500) + ' x-1;'.repeat(100_000) + 'y'.repeat(400_000), words);
    expect(words.has('x-1')).toBe(true);
    expect(words.has('w'.repeat(500))).toBe(false);
  });
});
