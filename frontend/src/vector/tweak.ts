import { inferKind, pathBounds, type Anchor, type Pt, type SubPath } from './geometry';

export interface TweakOptions { horizontal: number; vertical: number; relative: boolean; anchors: boolean; ins: boolean; outs: boolean; seed: number }

export const defaultTweak: TweakOptions = { horizontal: 10, vertical: 10, relative: true, anchors: true, ins: true, outs: true, seed: 7 };

function random(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tweakSubs(subs: SubPath[], options: TweakOptions): SubPath[] {
  const box = pathBounds(subs);
  if (!box) return subs;
  const h = options.relative ? (options.horizontal / 100) * box.w : options.horizontal;
  const v = options.relative ? (options.vertical / 100) * box.h : options.vertical;
  const rnd = random(options.seed);
  const offset = (): Pt => [(rnd() * 2 - 1) * h, (rnd() * 2 - 1) * v];
  return subs.map(sub => {
    const last = sub.nodes.length - 1;
    const nodes = sub.nodes.map((n, i): Anchor => {
      const a = offset(), di = offset(), dout = offset();
      const move: Pt = options.anchors ? a : [0, 0];
      const next: Anchor = {
        ...n,
        x: n.x + move[0],
        y: n.y + move[1],
        in: n.in ? [n.in[0] + move[0], n.in[1] + move[1]] : null,
        out: n.out ? [n.out[0] + move[0], n.out[1] + move[1]] : null
      };
      const useIn = options.ins && (sub.closed || i > 0);
      const useOut = options.outs && (sub.closed || i < last);
      if (useIn) { const base = next.in ?? [next.x, next.y]; next.in = [base[0] + di[0], base[1] + di[1]]; }
      if (useOut) { const base = next.out ?? [next.x, next.y]; next.out = [base[0] + dout[0], base[1] + dout[1]]; }
      if (useIn || useOut) next.kind = inferKind(next);
      return next;
    });
    return { closed: sub.closed, nodes };
  });
}
