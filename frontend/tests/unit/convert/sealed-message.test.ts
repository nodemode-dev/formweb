import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEALED, check, runSealed } from '../../../src/features/convert/sealed';

const ID = 'a'.repeat(32);
const ok = (extra: Record<string, unknown> = {}) => ({ id: ID, rules: [], elements: [], built: [], snapshot: '', width: 0, height: 0, ...extra });

describe('the one message the sealed frame may send back', () => {
  it('a message with another id is ignored', () => {
    expect(check(ok({ id: 'b'.repeat(32) }), ID, 3)).toBeNull();
  });

  it('a message that is not a plain object is ignored', () => {
    expect(check([ok()], ID, 3)).toBeNull();
    expect(check(Object.assign(Object.create({ polluted: 1 }), ok()), ID, 3)).toBeNull();
    expect(check('{"id":"x"}', ID, 3)).toBeNull();
  });

  it('an unknown key brings nothing of its own into the result', () => {
    const found = check(ok({ html: '<img src=x onerror=alert(1)>', rules: ['.a { color: red; }'] }), ID, 3)!;
    expect(Object.keys(found).sort()).toEqual(['built', 'elements', 'height', 'rules', 'snapshot', 'width']);
    expect(found.rules).toEqual(['.a { color: red; }']);
  });

  it('rules past the count and a rule over the length bound are dropped', () => {
    const many = Array.from({ length: SEALED.rules + 50 }, (_, n) => `.r${n} { top: 0; }`);
    expect(check(ok({ rules: many }), ID, 1)!.rules).toHaveLength(SEALED.rules);
    const long = '.x { content: "' + 'y'.repeat(SEALED.ruleChars) + '"; }';
    expect(check(ok({ rules: ['.a { top: 0; }', long, '.b { top: 1px; }'] }), ID, 1)!.rules).toEqual(['.a { top: 0; }', '.b { top: 1px; }']);
  });

  it('an element index out of range or given twice is applied once at most', () => {
    const found = check(ok({ elements: [[0, [['class', 'one']]], [0, [['class', 'two']]], [3, [['class', 'out']]], [-1, []], [1.5, []]] }), ID, 3)!;
    expect(found.elements).toEqual([[0, [['class', 'one']]]]);
  });
});

describe('what the sealed run applies to the page it measured', () => {
  afterEach(() => { document.querySelectorAll('iframe').forEach(el => el.remove()); });

  it('a URL attribute or an on* attribute handed back is never applied, a class is', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T) => { new Uint8Array((array as unknown as Uint8Array).buffer).fill(0xaa); return array; });
    const running = runSealed({ html: '<a class="start" href="/here">Go</a><img alt="x">', css: '', js: 'void 0', module: false });
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    const pairs = [['class', 'done'], ['href', 'https://evil.example/'], ['onclick', 'alert(1)'], ['src', 'https://evil.example/x.png']];
    window.dispatchEvent(new MessageEvent('message', { data: ok({ id: ID, elements: [[0, pairs], [1, [['alt', 'x'], ['src', 'https://evil.example/p.png'], ['onerror', 'alert(2)']]]] }), source: frame.contentWindow }));
    const result = (await running)!;
    expect(result).not.toBeNull();
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const link = doc.querySelector('a')!;
    expect(link.getAttribute('class')).toBe('done');
    expect(link.getAttribute('href')).toBe('/here');
    expect(link.hasAttribute('onclick')).toBe(false);
    expect(doc.querySelector('img')!.hasAttribute('src')).toBe(false);
    expect(doc.querySelector('img')!.hasAttribute('onerror')).toBe(false);
    expect(document.querySelector('iframe')).toBeNull();
  });
});
