import { fitCurve, simplifyPolyline } from './fit';
import { formatPath, inferKind, polyPath, type Anchor, type Pt, type SubPath } from './geometry';

export type TracePreset = 'bw' | 'gray' | 'color';
export type TraceQuant = 'kmeans' | 'median';
export type TraceMethod = 'abutting' | 'overlapping';
export type TraceOutput = 'color' | 'region';

export interface TraceOptions {
  preset: TracePreset;
  threshold: number;
  levels: number;
  colors: number;
  quant: TraceQuant;
  paths: number;
  corners: number;
  noise: number;
  ignoreWhite: boolean;
  method: TraceMethod;
  output: TraceOutput;
}

export interface TraceShape { fill: string; d: string }
export interface TraceResult { width: number; height: number; shapes: TraceShape[]; truncated: boolean }

export const MAX_SIDE = 1024;
export const defaultTrace: TraceOptions = { preset: 'color', threshold: 128, levels: 6, colors: 8, quant: 'kmeans', paths: 70, corners: 50, noise: 12, ignoreWhite: false, method: 'abutting', output: 'color' };

const MAX_COLOR_REGIONS = 5000;
const MAX_REGION_PATHS = 1500;
const D_LIMIT = 200000;
const SAMPLES = 40000;
const NONE = 32767;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const lum = (r: number, g: number, b: number): number => (r * 299 + g * 587 + b * 114) / 1000;
const hex = (c: number[]): string => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

function sample(px: Uint8ClampedArray, n: number): Uint8Array {
  const step = Math.max(1, Math.floor(n / SAMPLES));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) if (px[i * 4 + 3] >= 128) out.push(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  return Uint8Array.from(out);
}

function medianCut(samples: Uint8Array, k: number): number[][] {
  const count = samples.length / 3;
  if (!count) return [[0, 0, 0]];
  const boxes: number[][] = [Array.from({ length: count }, (_, i) => i)];
  while (boxes.length < k) {
    let best = -1, bestRange = 0, bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const i of box) { const v = samples[i * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = index; bestChannel = c; }
      }
    });
    if (best < 0) break;
    const sorted = boxes[best].slice().sort((a, b) => samples[a * 3 + bestChannel] - samples[b * 3 + bestChannel]);
    const mid = sorted.length >> 1;
    boxes.splice(best, 1, sorted.slice(0, mid), sorted.slice(mid));
  }
  return boxes.map(box => {
    let r = 0, g = 0, b = 0;
    for (const i of box) { r += samples[i * 3]; g += samples[i * 3 + 1]; b += samples[i * 3 + 2]; }
    const m = box.length || 1;
    return [Math.round(r / m), Math.round(g / m), Math.round(b / m)];
  });
}

function refine(samples: Uint8Array, centers: number[][], rounds: number): void {
  const k = centers.length, count = samples.length / 3;
  for (let round = 0; round < rounds; round++) {
    const sum = new Float64Array(k * 4);
    for (let i = 0; i < count; i++) {
      const r = samples[i * 3], g = samples[i * 3 + 1], b = samples[i * 3 + 2];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (r - centers[c][0]) ** 2 + (g - centers[c][1]) ** 2 + (b - centers[c][2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      sum[bi * 4] += r; sum[bi * 4 + 1] += g; sum[bi * 4 + 2] += b; sum[bi * 4 + 3]++;
    }
    for (let c = 0; c < k; c++) {
      const m = sum[c * 4 + 3];
      if (m) centers[c] = [Math.round(sum[c * 4] / m), Math.round(sum[c * 4 + 1] / m), Math.round(sum[c * 4 + 2] / m)];
    }
  }
}

interface Labeled { labels: Int16Array; fills: number[][]; ignored: boolean[] }

function labelPixels(px: Uint8ClampedArray, w: number, h: number, o: TraceOptions): Labeled {
  const n = w * h;
  const labels = new Int16Array(n).fill(-1);
  let palette: number[][];
  if (o.preset === 'bw') {
    palette = [[0, 0, 0], [255, 255, 255]];
    const cut = clamp(o.threshold, 0, 255);
    for (let i = 0; i < n; i++) if (px[i * 4 + 3] >= 128) labels[i] = lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < cut ? 0 : 1;
  } else if (o.preset === 'gray') {
    const levels = Math.round(clamp(o.levels, 2, 16));
    const sum = new Float64Array(levels * 2);
    for (let i = 0; i < n; i++) {
      if (px[i * 4 + 3] < 128) continue;
      const l = lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      const bin = Math.min(levels - 1, Math.floor(l * levels / 256));
      labels[i] = bin;
      sum[bin * 2] += l;
      sum[bin * 2 + 1]++;
    }
    palette = Array.from({ length: levels }, (_, bin) => {
      const v = sum[bin * 2 + 1] ? sum[bin * 2] / sum[bin * 2 + 1] : (bin + 0.5) * 256 / levels;
      return [v, v, v];
    });
  } else {
    const k = Math.round(clamp(o.colors, 2, 32));
    const samples = sample(px, n);
    palette = medianCut(samples, k);
    if (o.quant === 'kmeans') refine(samples, palette, 6);
    let pr = -1, pg = -1, pb = -1, prev = -1;
    for (let i = 0; i < n; i++) {
      if (px[i * 4 + 3] < 128) continue;
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      if (r !== pr || g !== pg || b !== pb) {
        let bd = Infinity;
        for (let c = 0; c < palette.length; c++) {
          const d = (r - palette[c][0]) ** 2 + (g - palette[c][1]) ** 2 + (b - palette[c][2]) ** 2;
          if (d < bd) { bd = d; prev = c; }
        }
        pr = r; pg = g; pb = b;
      }
      labels[i] = prev;
    }
  }
  const order = palette.map((_, i) => i).sort((a, b) => lum(palette[b][0], palette[b][1], palette[b][2]) - lum(palette[a][0], palette[a][1], palette[a][2]));
  const rank = new Int16Array(palette.length);
  order.forEach((old, index) => { rank[old] = index; });
  const fills = order.map(old => palette[old].map(v => Math.round(v)));
  const ignored = fills.map(c => o.ignoreWhite && c[0] >= 232 && c[1] >= 232 && c[2] >= 232);
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l < 0) continue;
    const r = rank[l];
    labels[i] = ignored[r] ? -1 : r;
  }
  return { labels, fills, ignored };
}

interface Components { comp: Int32Array; sizes: number[]; seeds: number[] }

function components(values: ArrayLike<number>, w: number, h: number, skip: number): Components {
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const sizes: number[] = [], seeds: number[] = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0 || values[s] === skip) continue;
    const id = sizes.length, v = values[s];
    let top = 0, size = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      if (x > 0 && comp[p - 1] < 0 && values[p - 1] === v) { comp[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && comp[p + 1] < 0 && values[p + 1] === v) { comp[p + 1] = id; stack[top++] = p + 1; }
      if (p >= w && comp[p - w] < 0 && values[p - w] === v) { comp[p - w] = id; stack[top++] = p - w; }
      if (p < n - w && comp[p + w] < 0 && values[p + w] === v) { comp[p + w] = id; stack[top++] = p + w; }
    }
    sizes.push(size);
    seeds.push(s);
  }
  return { comp, sizes, seeds };
}

function despeckle(labels: Int16Array, w: number, h: number, noise: number, k: number): void {
  if (noise <= 1) return;
  const { comp, sizes, seeds } = components(labels, w, h, NONE);
  const mark = new Int32Array(w * h);
  const tally = new Int32Array(k + 2);
  for (let c = 0; c < sizes.length; c++) {
    if (sizes[c] >= noise) continue;
    tally.fill(0);
    const list = [seeds[c]];
    mark[seeds[c]] = c + 1;
    for (let at = 0; at < list.length; at++) {
      const p = list[at], x = p % w;
      const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * h - w ? p + w : -1];
      for (const q of near) {
        if (q < 0) continue;
        if (comp[q] === c) { if (mark[q] !== c + 1) { mark[q] = c + 1; list.push(q); } } else tally[labels[q] + 1]++;
      }
    }
    let best = -1, count = 0;
    for (let i = 0; i < tally.length; i++) if (tally[i] > count) { count = tally[i]; best = i; }
    if (best < 0) continue;
    for (const p of list) labels[p] = best - 1;
  }
}

function turnAngle(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)) * 180 / Math.PI;
}

function loopToPath(v: number[], o: TraceOptions): string | null {
  const n = v.length / 2;
  if (n < 4) return null;
  const at = (k: number): Pt => { const i = ((k % n) + n) % n; return [v[i * 2], v[i * 2 + 1]]; };
  const span = Math.max(1, Math.min(3, Math.floor(n / 4)));
  const theta = Math.max(35, 105 - clamp(o.corners, 0, 100) * 0.75);
  const turn = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const p = at(k), a = at(k - span), b = at(k + span);
    turn[k] = turnAngle(p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]);
  }
  const corner: number[] = [];
  for (let k = 0; k < n; k++) {
    if (turn[k] < theta) continue;
    let top = true;
    for (let j = 1; j <= span && top; j++) if (turn[(k - j + n) % n] >= turn[k] || turn[(k + j) % n] > turn[k]) top = false;
    if (top) corner.push(k);
  }
  const sharp = corner.length > 0;
  const joints = sharp ? corner : [0, n >> 1];
  const near = new Int32Array(n).fill(1 << 20);
  if (sharp) {
    for (const c of corner) for (let j = 0; j < n; j++) { const d = Math.min((j - c + n) % n, (c - j + n) % n); if (d < near[j]) near[j] = d; }
  }
  const reach = o.paths >= 85 ? 1 : o.paths < 35 ? 3 : 2;
  const smooth: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const w = Math.min(reach, near[k]);
    let sx = 0, sy = 0;
    for (let j = -w; j <= w; j++) { const p = at(k + j); sx += p[0]; sy += p[1]; }
    smooth.push([sx / (2 * w + 1), sy / (2 * w + 1)]);
  }
  const err = 0.35 + (100 - clamp(o.paths, 0, 100)) / 100 * 2.2;
  const pieces: SubPath[] = [];
  for (let j = 0; j < joints.length; j++) {
    const a = joints[j];
    let b = joints[(j + 1) % joints.length];
    if (b <= a) b += n;
    const raw: Pt[] = [];
    for (let t = a; t <= b; t++) raw.push(smooth[t % n]);
    const last = raw.length - 1, from = Math.min(2, last >> 2), to = Math.min(last, from + 6);
    const ends: [Pt, Pt] = [[raw[to][0] - raw[from][0], raw[to][1] - raw[from][1]], [raw[last - to][0] - raw[last - from][0], raw[last - to][1] - raw[last - from][1]]];
    const usable = ends.every(e => Math.hypot(e[0], e[1]) > 1e-9);
    const core = raw.slice(from, raw.length - from);
    pieces.push(core.length >= 2 && simplifyPolyline(core, err * 0.8).length === 2 ? polyPath([raw[0], raw[last]], false) : fitCurve(simplifyPolyline(raw, err * 0.3), err, usable ? ends : undefined));
  }
  const nodes: Anchor[] = [];
  pieces.forEach((piece, j) => {
    const prev = pieces[(j + pieces.length - 1) % pieces.length];
    const head = piece.nodes[0], tail = prev.nodes[prev.nodes.length - 1];
    const joint: Anchor = { x: head.x, y: head.y, in: tail.in, out: head.out, kind: 'corner' };
    if (!sharp && joint.in && joint.out) {
      const tx = joint.out[0] - joint.in[0], ty = joint.out[1] - joint.in[1], tl = Math.hypot(tx, ty);
      if (tl > 1e-9) {
        const li = Math.hypot(joint.in[0] - joint.x, joint.in[1] - joint.y), lo = Math.hypot(joint.out[0] - joint.x, joint.out[1] - joint.y);
        joint.in = [joint.x - tx / tl * li, joint.y - ty / tl * li];
        joint.out = [joint.x + tx / tl * lo, joint.y + ty / tl * lo];
      }
    }
    joint.kind = inferKind(joint);
    nodes.push(joint, ...piece.nodes.slice(1, -1));
  });
  if (nodes.length < 2) return null;
  return formatPath([{ nodes, closed: true }]);
}

function traceLayer(mask: Uint8Array, comp: Int32Array, keep: Uint8Array, w: number, h: number, o: TraceOptions, used: Uint8Array): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const W1 = w + 1;
  const ins = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] !== 0;
  const has = (x: number, y: number, d: number): boolean => {
    if (d === 0) return ins(x, y) && !ins(x, y - 1);
    if (d === 1) return ins(x - 1, y) && !ins(x, y);
    if (d === 2) return ins(x - 1, y - 1) && !ins(x - 1, y);
    return ins(x, y - 1) && !ins(x - 1, y - 1);
  };
  used.fill(0);
  const limit = 4 * W1 * (h + 1);
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const a = ins(x - 1, y - 1), b = ins(x, y - 1), c = ins(x - 1, y), d = ins(x, y);
      if (a === b && b === c && c === d) continue;
      for (let dir = 0; dir < 4; dir++) {
        if (used[(y * W1 + x) * 4 + dir] || !has(x, y, dir)) continue;
        const px = dir === 0 || dir === 3 ? x : x - 1, py = dir === 0 || dir === 1 ? y : y - 1;
        const id = comp[py * w + px];
        const loop: number[] = [];
        let cx = x, cy = y, cd = dir;
        do {
          used[(cy * W1 + cx) * 4 + cd] = 1;
          loop.push(cx, cy);
          cx += DX[cd];
          cy += DY[cd];
          let nd = (cd + 1) & 3;
          if (!has(cx, cy, nd)) { nd = cd; if (!has(cx, cy, nd)) nd = (cd + 3) & 3; }
          cd = nd;
        } while ((cx !== x || cy !== y || cd !== dir) && loop.length < limit);
        if (px < 0 || py < 0 || id < 0 || !keep[id]) continue;
        const d2 = loopToPath(loop, o);
        if (!d2) continue;
        const list = out.get(id);
        if (list) list.push(d2); else out.set(id, [d2]);
      }
    }
  }
  return out;
}

export function traceBitmap(rgba: Uint8ClampedArray, w: number, h: number, options: TraceOptions, progress?: (value: number) => void): TraceResult {
  const o: TraceOptions = { ...options };
  const report = (v: number): void => { if (progress) progress(Math.min(1, v)); };
  const n = w * h;
  const { labels, fills, ignored } = labelPixels(rgba, w, h, o);
  report(0.1);
  despeckle(labels, w, h, Math.round(clamp(o.noise, 0, 1000)), fills.length);
  report(0.2);
  const shapes: TraceShape[] = [];
  const used = new Uint8Array((w + 1) * (h + 1) * 4);
  const mask = new Uint8Array(n);
  const cap = o.output === 'region' ? MAX_REGION_PATHS : MAX_COLOR_REGIONS;
  const perLayer = Math.max(50, Math.floor(cap / Math.max(1, fills.length)));
  let truncated = false;
  fills.forEach((fill, k) => {
    if (!ignored[k]) {
      let any = false;
      for (let i = 0; i < n; i++) {
        const on = o.method === 'overlapping' ? labels[i] >= k : labels[i] === k;
        mask[i] = on ? 1 : 0;
        if (on) any = true;
      }
      if (any) {
        const { comp, sizes } = components(mask, w, h, 0);
        const keep = new Uint8Array(sizes.length);
        const ranked = sizes.map((size, id) => ({ size, id })).sort((a, b) => b.size - a.size);
        ranked.slice(0, perLayer).forEach(item => { keep[item.id] = 1; });
        if (ranked.length > perLayer) truncated = true;
        const loops = traceLayer(mask, comp, keep, w, h, o, used);
        const ids = Array.from(loops.keys()).sort((a, b) => sizes[b] - sizes[a]);
        const color = hex(fill);
        if (o.output === 'region') {
          for (const id of ids) {
            const d = loops.get(id)!.join(' ');
            if (d.length > D_LIMIT) { truncated = true; continue; }
            shapes.push({ fill: color, d });
          }
        } else {
          let batch: string[] = [], length = 0;
          for (const id of ids) {
            const d = loops.get(id)!.join(' ');
            if (d.length > D_LIMIT) { truncated = true; continue; }
            if (length + d.length > D_LIMIT && batch.length) { shapes.push({ fill: color, d: batch.join(' ') }); batch = []; length = 0; }
            batch.push(d);
            length += d.length + 1;
          }
          if (batch.length) shapes.push({ fill: color, d: batch.join(' ') });
        }
      }
    }
    report(0.2 + 0.8 * (k + 1) / fills.length);
  });
  if (shapes.length > MAX_REGION_PATHS * 2) { shapes.length = MAX_REGION_PATHS * 2; truncated = true; }
  return { width: w, height: h, shapes, truncated };
}
