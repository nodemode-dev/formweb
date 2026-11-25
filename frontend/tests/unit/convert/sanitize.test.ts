import { describe, expect, it } from 'vitest';
import { sanitize } from '../../../src/features/convert/measure';

const source = (html: string) => ({ html, css: '', js: '', module: false });

describe('what is taken out of a page before it is measured or kept as code', () => {
  it('a frame or object that would open a data: document loses that address and it is counted as a script link', () => {
    const { doc, scripted } = sanitize(source('<iframe src="data:text/html,<script>top.x=1</script>"></iframe><object data="data:text/html,x"></object><img src="data:image/png;base64,AA" alt="">'));
    expect(doc.querySelector('iframe')!.hasAttribute('src')).toBe(false);
    expect(doc.querySelector('object')!.hasAttribute('data')).toBe(false);
    expect(doc.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AA');
    expect(scripted).toBe(2);
  });

  it('a vector animation that would set a javascript: address loses that value, and handlers go as before', () => {
    const { doc, scripted } = sanitize(source('<svg><a><animate attributeName="href" to="javascript:alert(1)"/><text>t</text></a><circle onclick="x()" r="2"/></svg>'));
    expect(doc.querySelector('animate')!.hasAttribute('to')).toBe(false);
    expect(doc.querySelector('circle')!.hasAttribute('onclick')).toBe(false);
    expect(scripted).toBe(2);
  });
});
