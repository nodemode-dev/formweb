import type { Site } from '../../types';

export type Ease = (t: number) => number;
export interface Keyframe { at: number; styles?: Record<string, string> }
export interface SceneTrack { node?: string; parent?: string; stagger?: number; keyframes?: Keyframe[]; easing?: string }
export interface Scene { stage?: string; length?: number; offset?: string; smoothing?: number; tracks?: SceneTrack[]; distribute?: SceneTrack[]; reducedAt?: number; progressVar?: boolean }
type Sampled = Map<string, { at: number; v: string }[]>;

const SAFE = /^(opacity|transform|translate|scale|rotate|filter|backdrop-filter|clip-path|color|background-color|border-color|box-shadow|--.+)$/;
const KEYWORDS: Record<string, [number, number, number, number]> = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const kebab = (k: string): string => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));
const entries = (map: unknown): [string, unknown][] => Object.entries(map && typeof map === 'object' ? map as Record<string, unknown> : {});

function bezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number): number => ((ay * t + by) * t + cy) * t;
  const dx = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const e = sx(t);
      if (Math.abs(e - x) < 1e-6) break;
      if (e < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

function spring(stiffness: number, damping: number): Ease {
  const w0 = Math.sqrt(stiffness), z = damping / (2 * w0);
  let raw: (s: number) => number;
  let settle: number;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    settle = Math.min(6 / (z * w0), 20);
    raw = s => 1 - Math.exp(-z * w0 * s) * (Math.cos(wd * s) + (z * w0 / wd) * Math.sin(wd * s));
  } else if (z === 1) {
    settle = Math.min(8 / w0, 20);
    raw = s => 1 - Math.exp(-w0 * s) * (1 + w0 * s);
  } else {
    const q = Math.sqrt(z * z - 1), r1 = -w0 * (z - q), r2 = -w0 * (z + q);
    settle = Math.min(6 / -r1, 20);
    raw = s => 1 - (r2 * Math.exp(r1 * s) - r1 * Math.exp(r2 * s)) / (r2 - r1);
  }
  const end = raw(settle);
  return t => (t <= 0 ? 0 : t >= 1 ? 1 : raw(t * settle) + (1 - end) * t);
}

const easings = new Map<string, Ease>();
export function easing(name?: string): Ease {
  const key = String(name || 'linear').trim();
  let fn = easings.get(key);
  if (fn) return fn;
  const args = (/\(([^)]*)\)/.exec(key)?.[1] || '').split(',').map(Number);
  if (key === 'linear') fn = t => t;
  else if (KEYWORDS[key]) fn = bezier(...KEYWORDS[key]);
  else if (key.startsWith('cubic-bezier') && args.length === 4 && args.every(Number.isFinite)) fn = bezier(args[0], args[1], args[2], args[3]);
  else if (key.startsWith('spring') && args.length === 2 && args.every(Number.isFinite) && args[0] > 0 && args[1] > 0) fn = spring(args[0], args[1]);
  else fn = t => t;
  easings.set(key, fn);
  return fn;
}

function hex(s: string): string {
  return s.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi, (_, h: string) => {
    if (h.length < 6) h = [...h].map(c => c + c).join('');
    const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
    return h.length === 8 ? `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${Math.round(n(6) / 255 * 1000) / 1000})` : `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
  });
}

interface Parsed { parts: string[]; nums: number[]; units: string[] }
const parsed = new Map<string, Parsed>();
function parse(str: string): Parsed {
  let p = parsed.get(str);
  if (p) return p;
  p = { parts: [], nums: [], units: [] };
  const re = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z%]*)/gi;
  const s = hex(str);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    p.parts.push(s.slice(last, m.index));
    p.nums.push(parseFloat(m[1]));
    p.units.push(m[2]);
    last = m.index + m[0].length;
  }
  p.parts.push(s.slice(last));
  parsed.set(str, p);
  return p;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

export function interpolate(a: unknown, b: unknown, t: number): string {
  const from = String(a), to = String(b);
  if (from === to) return from;
  const pa = parse(from), pb = parse(to);
  const n = pa.nums.length;
  let ok = n === pb.nums.length && n > 0 && pa.parts.every((s, i) => s === pb.parts[i]);
  const units: string[] = [];
  for (let i = 0; ok && i < n; i++) {
    const ua = pa.units[i], ub = pb.units[i];
    if (ua === ub) units.push(ua);
    else if (pa.nums[i] === 0 && ua === '') units.push(ub);
    else if (pb.nums[i] === 0 && ub === '') units.push(ua);
    else ok = false;
  }
  if (!ok) return t < 0.5 ? from : to;
  let out = pa.parts[0];
  for (let i = 0; i < n; i++) out += round(pa.nums[i] + (pb.nums[i] - pa.nums[i]) * t) + units[i] + pa.parts[i + 1];
  return out;
}

export function sampleProps(keyframes: Keyframe[] | undefined): Sampled {
  const props: Sampled = new Map();
  for (const kf of [...(keyframes || [])].sort((a, b) => a.at - b.at)) {
    for (const [k, v] of entries(kf.styles)) {
      const key = kebab(k);
      if (!SAFE.test(key)) continue;
      let list = props.get(key);
      if (!list) { list = []; props.set(key, list); }
      list.push({ at: Number(kf.at) || 0, v: String(v) });
    }
  }
  return props;
}

export function sample(props: Sampled, p: number, ease: Ease): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, arr] of props) {
    let v: string;
    const last = arr.length - 1;
    if (p <= arr[0].at) v = arr[0].v;
    else if (p >= arr[last].at) v = arr[last].v;
    else {
      let i = 0;
      while (i < last - 1 && arr[i + 1].at <= p) i++;
      const span = arr[i + 1].at - arr[i].at;
      v = interpolate(arr[i].v, arr[i + 1].v, span > 0 ? ease((p - arr[i].at) / span) : 1);
    }
    out[key] = v;
  }
  return out;
}

export function distributeProgress(p: number, index: number, count: number, stagger: number): number {
  const den = Math.max(1 - (count - 1) * stagger, 0.01);
  return clamp((p - index * stagger) / den, 0, 1);
}

export function readScenes(site: Site): Record<string, Scene> {
  const motion = (site.extensions?.motion || {}) as { scenes?: Record<string, Scene> };
  return motion.scenes && typeof motion.scenes === 'object' ? motion.scenes : {};
}

export function frameFor(site: Site, sceneKey: string, progress: number): Record<string, Record<string, string>> {
  const scene = readScenes(site)[sceneKey];
  const frame: Record<string, Record<string, string>> = {};
  if (!scene) return frame;
  const p = clamp(Number(progress) || 0, 0, 1);
  const put = (id: string, values: Record<string, string>): void => {
    if (!Object.keys(values).length) return;
    frame[id] = { ...frame[id], ...values };
  };
  for (const track of scene.tracks || []) {
    if (track.node && site.nodes[track.node]) put(track.node, sample(sampleProps(track.keyframes), p, easing(track.easing || 'linear')));
  }
  for (const track of scene.distribute || []) {
    const parent = track.parent ? site.nodes[track.parent] : undefined;
    if (!parent) continue;
    const props = sampleProps(track.keyframes);
    const ease = easing(track.easing || 'linear');
    const stagger = Number(track.stagger || 0);
    const kids = parent.children;
    kids.forEach((child, index) => put(child, sample(props, distributeProgress(p, index, kids.length, stagger), ease)));
  }
  return frame;
}
