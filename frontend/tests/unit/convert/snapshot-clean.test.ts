import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { picture } from '../../../src/features/convert/snapshot';

let drawn: string[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public width = 0, public height = 0) {}
  set src(value: string) { drawn.push(value); setTimeout(() => this.onload?.(), 0); }
}

/** The markup the picture is drawn from, read back out of the image address it was handed. */
const drawnMarkup = (): string => decodeURIComponent(drawn[0].slice('data:image/svg+xml;charset=utf-8,'.length));

beforeEach(() => {
  drawn = [];
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done: BlobCallback) { done(new Blob(['png'], { type: 'image/png' })); });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the copy of what a script built that the canvas picture is drawn from', () => {
  it('a style naming an outside url, expression, @import or javascript: is dropped, a plain one kept', async () => {
    const snapshot = [
      '<div style="color: rgb(1, 2, 3);">plain</div>',
      '<div style="background-image: url(https://evil.example/p.png);">a</div>',
      '<div style="width: expression(alert(1));">b</div>',
      '<div style="@import \'x.css\';">c</div>',
      '<div style="background: url(javascript:alert(1));">d</div>',
    ].join('');
    expect(await picture(snapshot, 200, 100)).not.toBeNull();
    const markup = drawnMarkup();
    expect(markup).toContain('color: rgb(1, 2, 3);');
    for (const bad of ['evil.example', 'expression', '@import', 'javascript:']) expect(markup).not.toContain(bad);
    expect(markup).toContain('>d<');
  });

  it('script, svg and img elements are left out with what they hold', async () => {
    expect(await picture('<p>kept</p><script>alert(1)</script><svg><text>svgtext</text></svg><img src="x.png" alt="pic">', 200, 100)).not.toBeNull();
    const markup = drawnMarkup();
    expect(markup).toContain('kept');
    for (const bad of ['<script', 'alert(1)', '<svg:svg', 'svgtext', '<img', 'x.png']) expect(markup).not.toContain(bad);
  });

  it('more than 300 elements gives no picture at all', async () => {
    expect(await picture('<span>x</span>'.repeat(300), 200, 100)).not.toBeNull();
    drawn = [];
    expect(await picture('<span>x</span>'.repeat(301), 200, 100)).toBeNull();
    expect(drawn).toEqual([]);
  });
});
