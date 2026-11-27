import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../../../src/features/motion/play';
import type { Canvas } from '../../../src/ui/canvas';

type Frame = Record<string, Record<string, string | null>> | null;

const TWO_MINUTES = 120_000;

function recorder(): { canvas: Canvas; sent: Frame[] } {
  const sent: Frame[] = [];
  const canvas = { frame: { contentDocument: document }, setLayer: (name: string, frame: Frame) => { if (name === 'play') sent.push(frame === null ? null : structuredClone(frame)); } };
  return { canvas: canvas as unknown as Canvas, sent };
}

function element(id: string, style = ''): HTMLElement {
  const node = document.createElement('div');
  node.dataset.fwId = id;
  node.setAttribute('style', style);
  document.body.append(node);
  return node;
}

const reveal = (from: Record<string, string>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ from, duration: 600, delay: 0, stagger: 0, children: false, easing: 'ease-out', ...extra });
const drawnFrames = (sent: Frame[]): Record<string, Record<string, string | null>>[] => sent.filter((frame): frame is NonNullable<Frame> => frame !== null);
const lastDrawn = (sent: Frame[]): NonNullable<Frame> => drawnFrames(sent).at(-1)!;
const opacityOf = (frame: NonNullable<Frame>, id: string): number => Number(frame[id]?.opacity);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('playing a reveal once on the canvas', () => {
  it('a fade up starts at its from values and its last frame is exactly the stored look, then the layer is cleared', () => {
    element('box', 'opacity: 0.8; translate: 4px 2px');
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    expect(player.play('box', 'reveals', reveal({ opacity: '0', translate: '0 24px' }), [])).toBe(true);
    expect(player.playing()).toBe('box');
    expect(sent[0]).toEqual({ box: { opacity: '0', translate: '0 24px' } });
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.at(-1)).toBeNull();
    expect(lastDrawn(sent)).toEqual({ box: { opacity: '0.8', translate: '4px 2px' } });
    expect(player.playing()).toBe('');
    const between = drawnFrames(sent).map(frame => opacityOf(frame, 'box')).filter(value => value > 0 && value < 0.8);
    expect(between.length).toBeGreaterThan(0);
  });

  it('the opacity of an ease-out fade only rises on its way from the from value to the stored value', () => {
    element('box', 'opacity: 0.6');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('box', 'reveals', reveal({ opacity: '0' }), []);
    vi.advanceTimersByTime(TWO_MINUTES);
    const values = drawnFrames(sent).map(frame => opacityOf(frame, 'box'));
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(0.6);
    values.forEach((value, index) => { if (index) expect(value).toBeGreaterThanOrEqual(values[index - 1]); });
  });

  it('nothing more is sent to the canvas once the layer has been cleared', () => {
    element('box', 'opacity: 1');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('box', 'reveals', reveal({ opacity: '0' }), []);
    vi.advanceTimersByTime(TWO_MINUTES);
    const count = sent.length;
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.length).toBe(count);
    expect(sent.at(-1)).toBeNull();
  });

  it('a delay holds the element at its from look before it moves', () => {
    element('box', 'opacity: 1');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('box', 'reveals', reveal({ opacity: '0' }, { delay: 1000 }), []);
    vi.advanceTimersByTime(900);
    expect(new Set(drawnFrames(sent).map(frame => frame.box.opacity))).toEqual(new Set(['0']));
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(lastDrawn(sent)).toEqual({ box: { opacity: '1' } });
    expect(sent.at(-1)).toBeNull();
  });

  it('stagger children plays each child after the one before it and ends with every child at its stored look', () => {
    const kids = ['one', 'two', 'three'];
    kids.forEach(id => element(id, 'opacity: 0.9'));
    element('list');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('list', 'reveals', reveal({ opacity: '0' }, { children: true, stagger: 200 }), kids);
    vi.advanceTimersByTime(TWO_MINUTES);
    const frames = drawnFrames(sent);
    const firstMoved = kids.map(id => frames.findIndex(frame => opacityOf(frame, id) > 0));
    expect(firstMoved[0]).toBeGreaterThan(-1);
    expect(firstMoved[1]).toBeGreaterThan(firstMoved[0]);
    expect(firstMoved[2]).toBeGreaterThan(firstMoved[1]);
    for (const frame of frames) {
      expect(opacityOf(frame, 'one')).toBeGreaterThanOrEqual(opacityOf(frame, 'two'));
      expect(opacityOf(frame, 'two')).toBeGreaterThanOrEqual(opacityOf(frame, 'three'));
    }
    expect(lastDrawn(sent)).toEqual({ one: { opacity: '0.9' }, two: { opacity: '0.9' }, three: { opacity: '0.9' } });
    expect(sent.at(-1)).toBeNull();
  });
});

describe('looping presets shown once', () => {
  it('spin turns the element and ends at the rotation it started from, then the layer is cleared', () => {
    element('box', 'rotate: 15deg');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('box', 'loops', { type: 'spin', duration: 8000, amount: 360, easing: 'linear' }, []);
    vi.advanceTimersByTime(TWO_MINUTES);
    const angles = drawnFrames(sent).map(frame => parseFloat(frame.box.rotate!));
    expect(angles.some(angle => angle > 100)).toBe(true);
    expect(lastDrawn(sent)).toEqual({ box: { rotate: '15deg' } });
    expect(sent.at(-1)).toBeNull();
  });

  it('float moves the element and ends where it began, then the layer is cleared', () => {
    element('box', 'translate: 0px 10px');
    const { canvas, sent } = recorder();
    createPlayer(canvas, () => true).play('box', 'loops', { type: 'float', duration: 3000, amount: 12, easing: 'ease-in-out' }, []);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(drawnFrames(sent).some(frame => frame.box.translate !== '0px 10px')).toBe(true);
    expect(lastDrawn(sent)).toEqual({ box: { translate: '0px 10px' } });
    expect(sent.at(-1)).toBeNull();
  });
});

describe('stopping a playback', () => {
  it('stop clears the layer at once and nothing more is drawn afterwards', () => {
    element('box', 'opacity: 1');
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    player.play('box', 'reveals', reveal({ opacity: '0' }, { duration: 5000 }), []);
    vi.advanceTimersByTime(1000);
    expect(opacityOf(lastDrawn(sent), 'box')).toBeLessThan(1);
    player.stop();
    expect(sent.at(-1)).toBeNull();
    expect(player.playing()).toBe('');
    const count = sent.length;
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.length).toBe(count);
  });

  it('when the canvas stops being shown during playback the layer is cleared on the next frame', () => {
    element('box', 'opacity: 1');
    const { canvas, sent } = recorder();
    let shown = true;
    createPlayer(canvas, () => shown).play('box', 'reveals', reveal({ opacity: '0' }, { duration: 5000 }), []);
    vi.advanceTimersByTime(1000);
    expect(opacityOf(lastDrawn(sent), 'box')).toBeLessThan(1);
    shown = false;
    vi.advanceTimersByTime(100);
    expect(sent.at(-1)).toBeNull();
    const count = sent.length;
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.length).toBe(count);
  });

  it('nothing is drawn when the canvas is not being shown', () => {
    element('box', 'opacity: 1');
    const { canvas, sent } = recorder();
    expect(createPlayer(canvas, () => false).play('box', 'reveals', reveal({ opacity: '0' }), [])).toBe(false);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent).toEqual([]);
  });

  it('a second play restarts from the from values and still ends at the stored look', () => {
    element('box', 'opacity: 0.7');
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    player.play('box', 'reveals', reveal({ opacity: '0' }, { duration: 2000 }), []);
    vi.advanceTimersByTime(1000);
    const at = sent.length;
    player.play('box', 'reveals', reveal({ opacity: '0' }, { duration: 2000 }), []);
    expect(sent.slice(at)).toEqual([null, { box: { opacity: '0' } }]);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(lastDrawn(sent)).toEqual({ box: { opacity: '0.7' } });
    expect(sent.at(-1)).toBeNull();
  });
});

describe('a hostile motion entry still ends with the stored look', () => {
  it.each([
    ['a duration of 1e12', { duration: 1e12 }],
    ['an infinite duration', { duration: Infinity }],
    ['a duration that is not a number', { duration: NaN }],
    ['a duration written as text', { duration: 'Infinity' }],
    ['a negative duration', { duration: -5 }],
    ['a delay of 1e12', { delay: 1e12 }],
    ['an infinite delay', { delay: Infinity }],
    ['a negative infinite delay', { delay: -Infinity }],
    ['an easing name of 50,000 letters', { easing: 'e'.repeat(50_000) }]
  ])('%s ends within two minutes with the layer cleared', (_what, extra) => {
    element('box', 'opacity: 0.8');
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    player.play('box', 'reveals', reveal({ opacity: '0' }, extra), []);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.at(-1)).toBeNull();
    expect(lastDrawn(sent)).toEqual({ box: { opacity: '0.8' } });
    expect(player.playing()).toBe('');
  });

  it('a from text of 50,000 characters ends within two minutes with the layer cleared and the other properties at their stored look', () => {
    element('box', 'opacity: 0.8; translate: 4px 2px; filter: blur(1px)');
    const { canvas, sent } = recorder();
    const long = '1'.repeat(50_000);
    const player = createPlayer(canvas, () => true);
    player.play('box', 'reveals', reveal({ opacity: '0', translate: `${long}px 0`, filter: `blur(${long}px)` }), []);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.at(-1)).toBeNull();
    const last = lastDrawn(sent);
    expect(last.box.opacity).toBe('0.8');
    for (const [key, value] of Object.entries(last.box)) expect(value).toBe({ opacity: '0.8', translate: '4px 2px', filter: 'blur(1px)' }[key]);
    expect(player.playing()).toBe('');
  });

  it.each([
    ['2,000 children with a stagger of 1e9', { stagger: 1e9 }],
    ['2,000 children with an infinite stagger and a duration of 1e12', { stagger: Infinity, duration: 1e12 }],
    ['2,000 children with an ordinary stagger', { stagger: 80 }]
  ])('%s end within two minutes with every child drawn at its stored look and the layer cleared', (_what, extra) => {
    const kids = Array.from({ length: 2000 }, (_, index) => `kid-${index}`);
    kids.forEach(id => element(id, 'opacity: 0.5'));
    element('list');
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    player.play('list', 'reveals', reveal({ opacity: '0' }, { children: true, ...extra }), kids);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.at(-1)).toBeNull();
    const last = lastDrawn(sent);
    expect(Object.keys(last).length).toBeGreaterThan(0);
    for (const [id, values] of Object.entries(last)) {
      expect(kids).toContain(id);
      expect(values).toEqual({ opacity: '0.5' });
    }
    expect(player.playing()).toBe('');
  });

  it.each([
    ['spin with an infinite amount and a negative duration', { type: 'spin', amount: Infinity, duration: -5 }, 'rotate', '15deg', 'rotate: 15deg'],
    ['float with an amount of 1e300 and a duration that is not a number', { type: 'float', amount: 1e300, duration: NaN }, 'translate', '0px 10px', 'translate: 0px 10px']
  ])('%s ends within two minutes where it began', (_what, entry, key, stored, style) => {
    element('box', style);
    const { canvas, sent } = recorder();
    const player = createPlayer(canvas, () => true);
    player.play('box', 'loops', entry, []);
    vi.advanceTimersByTime(TWO_MINUTES);
    expect(sent.at(-1)).toBeNull();
    expect(lastDrawn(sent)).toEqual({ box: { [key]: stored } });
    expect(player.playing()).toBe('');
  });
});
