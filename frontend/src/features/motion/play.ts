import type { Canvas } from '../../ui/canvas';
import type { SiteNode } from '../../types';
import { MOTION_SAFE, type MotionGroup, type MotionKind } from './context';
import { clamp, easing, interpolate, type Ease } from './interpolate';

export type PlayKind = 'reveals' | 'loops';

interface Track { id: string; key: string; from: string; via: string; end: string; start: number; length: number; ease: Ease; shape?: (p: number) => string }

export interface Player {
  play(id: string, kind: PlayKind, entry: unknown, children: readonly string[]): boolean;
  stop(): void;
  playing(): string;
}

const SAFE = new Set<string>(MOTION_SAFE);
const NAMED = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);
const LOOP_MAX = 2000;
const kebab = (key: string): string => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

export function playableKind(group: MotionGroup, node: SiteNode, first?: MotionKind): PlayKind | '' {
  const reveal = group.reveals[node.id] as { from?: Record<string, unknown> } | undefined;
  const loop = group.loops[node.id] as { type?: string } | undefined;
  const reveals = !!reveal && typeof reveal === 'object' && Object.keys(reveal.from || {}).some(key => SAFE.has(kebab(key)));
  const loops = !!loop && typeof loop === 'object' && (loop.type === 'spin' || loop.type === 'float');
  if (first === 'loops' && loops) return 'loops';
  return reveals ? 'reveals' : loops ? 'loops' : '';
}

function revealEase(name: unknown): Ease {
  const key = String(name || 'ease-out').trim();
  return easing(NAMED.has(key) || key.startsWith('cubic-bezier(') || key.startsWith('spring(') ? key : 'ease-out');
}

function identity(key: string, from: string): string {
  const zero = (text: string): string => text.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, '0');
  const one = (text: string): string => text.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, '1');
  if (key === 'opacity') return '1';
  if (key === 'scale') return one(from);
  if (key === 'translate' || key === 'rotate') return zero(from);
  if (key === 'filter' || key === 'backdrop-filter' || key === 'transform') {
    let whole = true;
    const out = from.replace(/([a-z-]+)\(([^()]*)\)/gi, (_all, name: string, args: string) => {
      const fn = name.toLowerCase();
      if (/^(blur|hue-rotate|grayscale|sepia|invert|translate[xyz3d]*|rotate[xyz3d]*|skew[xy]?)$/.test(fn)) return `${name}(${zero(args)})`;
      if (/^(brightness|contrast|saturate|opacity|scale[xyz3d]*)$/.test(fn)) return `${name}(${one(args)})`;
      whole = false;
      return _all;
    });
    return whole ? out : '';
  }
  return '';
}

const fits = (a: string, b: string): boolean => a === b || interpolate(a, b, 0.25) !== a;

export function createPlayer(canvas: Canvas, live: () => boolean): Player {
  let tracks: Track[] = [];
  let frame = 0;
  let begun = 0;
  let total = 0;
  let current = '';
  let ending = false;

  const doc = (): Document | null => { try { return canvas.frame.contentDocument; } catch { return null; } };
  const nodeOf = (id: string): HTMLElement | null => doc()?.querySelector<HTMLElement>(`[data-fw-id="${CSS.escape(id)}"]`) ?? null;
  const ownValue = (el: HTMLElement, key: string): string => {
    const own = el.style.getPropertyValue(key).trim();
    if (own) return own;
    return (el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(key) || '').trim();
  };

  function stop(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const was = current || tracks.length;
    tracks = [];
    current = '';
    ending = false;
    if (was) canvas.setLayer('play', null);
  }

  function draw(elapsed: number, last: boolean): void {
    const out: Record<string, Record<string, string>> = {};
    for (const track of tracks) {
      const local = track.length > 0 ? clamp((elapsed - track.start) / track.length, 0, 1) : elapsed >= track.start ? 1 : 0;
      const shown = last || local >= 1 ? track.end : track.shape ? track.shape(local) : local <= 0 ? track.from : interpolate(track.from, track.via, track.ease(local));
      (out[track.id] ||= {})[track.key] = shown;
    }
    canvas.setLayer('play', out);
  }

  function tick(now: number): void {
    frame = 0;
    if (!current) return;
    if (!live()) { stop(); return; }
    if (ending) { stop(); return; }
    const elapsed = Math.max(0, now - begun);
    if (elapsed >= total) { draw(total, true); ending = true; }
    else draw(elapsed, false);
    frame = requestAnimationFrame(tick);
  }

  function revealTracks(id: string, entry: Record<string, unknown>, children: readonly string[]): Track[] {
    const from = (entry.from && typeof entry.from === 'object' ? entry.from : {}) as Record<string, unknown>;
    const keys = Object.keys(from).map(key => [kebab(key), String(from[key])] as const).filter(([key]) => SAFE.has(key));
    const duration = Math.max(0, Number(entry.duration ?? 600) || 0);
    const delay = Math.max(0, Number(entry.delay || 0) || 0);
    const stagger = Math.max(0, Number(entry.stagger || 0) || 0);
    const ease = revealEase(entry.easing);
    const targets = entry.children ? children : [id];
    const out: Track[] = [];
    targets.forEach((target, index) => {
      const el = nodeOf(target);
      if (!el) return;
      for (const [key, start] of keys) {
        const end = ownValue(el, key);
        const neutral = !el.style.getPropertyValue(key).trim() ? identity(key, start) : '';
        const via = fits(start, end) ? end : neutral && fits(start, neutral) ? neutral : end;
        out.push({ id: target, key, from: start, via, end, start: delay + index * stagger, length: duration, ease });
      }
    });
    return out;
  }

  function loopTracks(id: string, entry: Record<string, unknown>): Track[] {
    const el = nodeOf(id);
    if (!el) return [];
    const amount = Number(entry.amount ?? (entry.type === 'spin' ? 360 : 12)) || 0;
    const period = clamp(Number(entry.duration) || (entry.type === 'spin' ? 8000 : 4000), 100, 120000);
    const there = (p: number): number => 1 - Math.abs(2 * p - 1);
    if (entry.type === 'spin') {
      const end = ownValue(el, 'rotate');
      const base = Number(/^(-?(?:\d+\.?\d*|\.\d+))deg$/.exec(el.style.getPropertyValue('rotate').trim())?.[1] || 0);
      const whole = amount % 360 === 0;
      return [{ id, key: 'rotate', from: `${base}deg`, via: end, end, start: 0, length: Math.min(LOOP_MAX, period), ease: easing('linear'), shape: p => `${Math.round((base + amount * (whole ? p : there(p))) * 1000) / 1000}deg` }];
    }
    const end = ownValue(el, 'translate');
    const parts = el.style.getPropertyValue('translate').trim().split(/\s+/);
    const px = (part: string | undefined): number => Number(/^(-?(?:\d+\.?\d*|\.\d+))(px)?$/.exec(part || '0')?.[1] || 0);
    const x = px(parts[0]), y = px(parts[1]);
    const ease = easing('ease-in-out');
    return [{ id, key: 'translate', from: `${x}px ${y}px`, via: end, end, start: 0, length: Math.min(LOOP_MAX, period * 2), ease, shape: p => `${x}px ${Math.round((y - amount * ease(there(p))) * 1000) / 1000}px` }];
  }

  return {
    play(id, kind, entry, children) {
      stop();
      if (!entry || typeof entry !== 'object' || !live()) return false;
      const next = kind === 'reveals' ? revealTracks(id, entry as Record<string, unknown>, children) : loopTracks(id, entry as Record<string, unknown>);
      if (!next.length) return false;
      tracks = next;
      total = Math.max(...next.map(track => track.start + track.length));
      current = id;
      begun = performance.now();
      draw(0, false);
      frame = requestAnimationFrame(tick);
      return true;
    },
    stop,
    playing: () => current
  };
}
