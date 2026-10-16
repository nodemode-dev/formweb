export type Pt = [number, number];
export type AnchorKind = 'corner' | 'smooth' | 'symmetric';
export type CornerType = 'round' | 'inverted' | 'chamfer';
export type CornerMode = 'absolute' | 'relative';
export interface Corner { type: CornerType; radius: number; mode: CornerMode }
export interface Anchor { x: number; y: number; in: Pt | null; out: Pt | null; kind: AnchorKind; corner?: Corner }
export interface SubPath { nodes: Anchor[]; closed: boolean }
export interface Box { x: number; y: number; w: number; h: number }
export interface Seg { sub: number; i: number; j: number; p0: Pt; c1: Pt; c2: Pt; p3: Pt; line: boolean }

export const EPS = 1e-6;

export const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
};
const ptStr = (p: Pt): string => `${fmt(p[0])} ${fmt(p[1])}`;
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

export function inferKind(n: { x: number; y: number; in: Pt | null; out: Pt | null }): AnchorKind {
  if (!n.in || !n.out) return 'corner';
  const ax = n.x - n.in[0], ay = n.y - n.in[1], bx = n.out[0] - n.x, by = n.out[1] - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPS || lb < EPS) return 'corner';
  const cross = (ax * by - ay * bx) / (la * lb), dot = (ax * bx + ay * by) / (la * lb);
  if (Math.abs(cross) > 0.02 || dot < 0) return 'corner';
  return Math.abs(la - lb) < 0.04 * Math.max(la, lb) ? 'symmetric' : 'smooth';
}

class Parser {
  readonly subs: SubPath[] = [];
  private cur: SubPath | null = null;
  private i = 0;
  px = 0;
  py = 0;
  private sx = 0;
  private sy = 0;
  constructor(private readonly s: string) {}
  private skip(): void { while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++; }
  peekNum(): boolean { this.skip(); return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]); }
  peekCmd(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[a-zA-Z]/.test(c)) { this.i++; return c; }
    return null;
  }
  done(): boolean { this.skip(); return this.i >= this.s.length; }
  num(): number {
    this.skip();
    NUM.lastIndex = this.i;
    const m = NUM.exec(this.s);
    if (!m) throw new Error('bad number');
    this.i = NUM.lastIndex;
    return parseFloat(m[0]);
  }
  flag(): number { this.skip(); return this.s[this.i++] === '1' ? 1 : 0; }
  start(x: number, y: number): void {
    this.cur = { nodes: [{ x, y, in: null, out: null, kind: 'corner' }], closed: false };
    this.subs.push(this.cur);
    this.sx = x; this.sy = y; this.px = x; this.py = y;
  }
  private sub(): SubPath {
    if (!this.cur || this.cur.closed) this.start(this.px, this.py);
    return this.cur as SubPath;
  }
  line(x: number, y: number): void {
    this.sub().nodes.push({ x, y, in: null, out: null, kind: 'corner' });
    this.px = x; this.py = y;
  }
  cubic(c1: Pt, c2: Pt, x: number, y: number): void {
    const sp = this.sub();
    sp.nodes[sp.nodes.length - 1].out = c1;
    sp.nodes.push({ x, y, in: c2, out: null, kind: 'corner' });
    this.px = x; this.py = y;
  }
  close(): void {
    const sp = this.cur;
    if (sp && !sp.closed) {
      const n = sp.nodes;
      const f = n[0], l = n[n.length - 1];
      if (n.length > 1 && Math.abs(f.x - l.x) < 1e-3 && Math.abs(f.y - l.y) < 1e-3) { f.in = l.in; n.pop(); }
      sp.closed = true;
    }
    this.px = this.sx; this.py = this.sy;
  }
}

function arcToCubics(p0: Pt, p1: Pt, rx: number, ry: number, rotDeg: number, large: number, sweep: number): Array<[Pt, Pt, Pt]> {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  if (!rx || !ry) return [[p0, p1, p1]];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = den ? Math.sqrt(Math.max(num / den, 0)) : 0;
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1) / ry, cyp = (-coef * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const t0 = Math.atan2((y1 - cyp) / ry, (x1 - cxp) / rx);
  let dt = Math.atan2((-y1 - cyp) / ry, (-x1 - cxp) / rx) - t0;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  else if (!sweep && dt > 0) dt -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => { const x = rx * Math.cos(t), y = ry * Math.sin(t); return [cx + x * cp - y * sp, cy + x * sp + y * cp]; };
  const dv = (t: number): Pt => { const x = -rx * Math.sin(t), y = ry * Math.cos(t); return [x * cp - y * sp, x * sp + y * cp]; };
  const out: Array<[Pt, Pt, Pt]> = [];
  let t = t0;
  for (let i = 0; i < n; i++) {
    const a = at(t), b = at(t + step), da = dv(t), db = dv(t + step);
    out.push([[a[0] + k * da[0], a[1] + k * da[1]], [b[0] - k * db[0], b[1] - k * db[1]], b]);
    t += step;
  }
  return out;
}

export function parsePath(d: string | undefined | null): SubPath[] {
  const p = new Parser(d ?? '');
  let cmd = '';
  let lastC: Pt | null = null, lastQ: Pt | null = null;
  try {
    while (!p.done()) {
      const c = p.peekCmd();
      if (c) cmd = c;
      else if (!cmd || !p.peekNum()) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const ox = rel ? p.px : 0, oy = rel ? p.py : 0;
      const pt = (): Pt => [ox + p.num(), oy + p.num()];
      let nc: Pt | null = null, nq: Pt | null = null;
      if (C === 'Z') { p.close(); cmd = ''; lastC = lastQ = null; continue; }
      if (C === 'M') { const [x, y] = pt(); p.start(x, y); cmd = rel ? 'l' : 'L'; lastC = lastQ = null; continue; }
      if (C === 'L') { const [x, y] = pt(); p.line(x, y); }
      else if (C === 'H') p.line((rel ? p.px : 0) + p.num(), p.py);
      else if (C === 'V') p.line(p.px, (rel ? p.py : 0) + p.num());
      else if (C === 'C') { const c1 = pt(), c2 = pt(), e = pt(); p.cubic(c1, c2, e[0], e[1]); nc = c2; }
      else if (C === 'S') { const c1: Pt = lastC ? [2 * p.px - lastC[0], 2 * p.py - lastC[1]] : [p.px, p.py]; const c2 = pt(), e = pt(); p.cubic(c1, c2, e[0], e[1]); nc = c2; }
      else if (C === 'Q' || C === 'T') {
        const q: Pt = C === 'Q' ? pt() : lastQ ? [2 * p.px - lastQ[0], 2 * p.py - lastQ[1]] : [p.px, p.py];
        const e = pt();
        const s0: Pt = [p.px, p.py];
        p.cubic([s0[0] + (2 / 3) * (q[0] - s0[0]), s0[1] + (2 / 3) * (q[1] - s0[1])], [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], e[0], e[1]);
        nq = q;
      } else if (C === 'A') {
        const rx = Math.abs(p.num()), ry = Math.abs(p.num()), rot = p.num(), large = p.flag(), sweep = p.flag();
        const e = pt();
        for (const [c1, c2, q] of arcToCubics([p.px, p.py], e, rx, ry, rot, large, sweep)) p.cubic(c1, c2, q[0], q[1]);
        p.px = e[0]; p.py = e[1];
      } else break;
      lastC = nc;
      lastQ = nq;
    }
  } catch {
    return finish(p.subs);
  }
  return finish(p.subs);
}

function finish(subs: SubPath[]): SubPath[] {
  const out = subs.filter(s => s.nodes.length > 0);
  for (const s of out) for (const n of s.nodes) n.kind = inferKind(n);
  return out;
}

export function formatPath(subs: SubPath[]): string {
  const out: string[] = [];
  const seg = (a: Anchor, b: Anchor): string => (a.out || b.in ? `C${ptStr(a.out ?? [a.x, a.y])} ${ptStr(b.in ?? [b.x, b.y])} ${ptStr([b.x, b.y])}` : `L${ptStr([b.x, b.y])}`);
  for (const sp of subs) {
    const n = sp.nodes;
    if (!n.length) continue;
    out.push(`M${ptStr([n[0].x, n[0].y])}`);
    for (let i = 1; i < n.length; i++) out.push(seg(n[i - 1], n[i]));
    if (sp.closed) {
      if (n.length > 1 && (n[n.length - 1].out || n[0].in)) out.push(seg(n[n.length - 1], n[0]));
      out.push('Z');
    }
  }
  return out.join(' ');
}

export function cloneAnchor(n: Anchor): Anchor {
  return { x: n.x, y: n.y, in: n.in ? [n.in[0], n.in[1]] : null, out: n.out ? [n.out[0], n.out[1]] : null, kind: n.kind, corner: n.corner ? { ...n.corner } : undefined };
}
export function clonePath(subs: SubPath[]): SubPath[] {
  return subs.map(s => ({ closed: s.closed, nodes: s.nodes.map(cloneAnchor) }));
}
export function mapPath(subs: SubPath[], fn: (p: Pt) => Pt): SubPath[] {
  return subs.map(s => ({
    closed: s.closed,
    nodes: s.nodes.map(n => { const [x, y] = fn([n.x, n.y]); return { x, y, in: n.in ? fn(n.in) : null, out: n.out ? fn(n.out) : null, kind: n.kind, corner: n.corner ? { ...n.corner } : undefined }; })
  }));
}

export function segments(subs: SubPath[]): Seg[] {
  const out: Seg[] = [];
  subs.forEach((sp, si) => {
    const n = sp.nodes;
    const count = sp.closed ? n.length : n.length - 1;
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % n.length;
      if (j === i) continue;
      const a = n[i], b = n[j];
      const p0: Pt = [a.x, a.y], p3: Pt = [b.x, b.y];
      out.push({ sub: si, i, j, p0, c1: a.out ?? p0, c2: b.in ?? p3, p3, line: !a.out && !b.in });
    }
  });
  return out;
}

export function bezierAt(s: Pick<Seg, 'p0' | 'c1' | 'c2' | 'p3'>, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * s.p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p3[0], a * s.p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p3[1]];
}

function extremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const A = p1 - p0, B = p2 - p1, C = p3 - p2;
  const a = A - 2 * B + C, b = 2 * (B - A), c = A;
  const out: number[] = [];
  if (Math.abs(a) < EPS) { if (Math.abs(b) > EPS) out.push(-c / b); }
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) { const r = Math.sqrt(disc); out.push((-b + r) / (2 * a), (-b - r) / (2 * a)); }
  }
  return out.filter(t => t > 0 && t < 1);
}

export function pathBounds(subs: SubPath[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p: Pt): void => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const sp of subs) for (const n of sp.nodes) add([n.x, n.y]);
  for (const s of segments(subs)) {
    if (s.line) continue;
    for (const t of [...extremaT(s.p0[0], s.c1[0], s.c2[0], s.p3[0]), ...extremaT(s.p0[1], s.c1[1], s.c2[1], s.p3[1])]) add(bezierAt(s, t));
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export function nearestOnPath(subs: SubPath[], p: Pt): { seg: Seg; t: number; at: Pt; d: number } | null {
  let best: { seg: Seg; t: number; at: Pt; d: number } | null = null;
  for (const s of segments(subs)) {
    let t = 0;
    if (s.line) {
      const vx = s.p3[0] - s.p0[0], vy = s.p3[1] - s.p0[1];
      const l2 = vx * vx + vy * vy;
      t = l2 > EPS ? Math.max(0, Math.min(1, ((p[0] - s.p0[0]) * vx + (p[1] - s.p0[1]) * vy) / l2)) : 0;
    } else {
      let bd = Infinity;
      for (let k = 0; k <= 32; k++) { const d = dist(bezierAt(s, k / 32), p); if (d < bd) { bd = d; t = k / 32; } }
      let lo = Math.max(0, t - 1 / 32), hi = Math.min(1, t + 1 / 32);
      for (let k = 0; k < 24; k++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (dist(bezierAt(s, m1), p) < dist(bezierAt(s, m2), p)) hi = m2; else lo = m1;
      }
      t = (lo + hi) / 2;
    }
    const at = s.line ? lerp(s.p0, s.p3, t) : bezierAt(s, t);
    const d = dist(at, p);
    if (!best || d < best.d) best = { seg: s, t, at, d };
  }
  return best;
}

export function splitBezier(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): [[Pt, Pt, Pt, Pt], [Pt, Pt, Pt, Pt]] {
  const p01 = lerp(p0, c1, t), p12 = lerp(c1, c2, t), p23 = lerp(c2, p3, t);
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t), q = lerp(p012, p123, t);
  return [[p0, p01, p012, q], [q, p123, p23, p3]];
}

export function splitAt(subs: SubPath[], seg: Seg, t: number): number {
  const sp = subs[seg.sub];
  const a = sp.nodes[seg.i], b = sp.nodes[seg.j];
  let node: Anchor;
  if (seg.line) {
    const q = lerp(seg.p0, seg.p3, t);
    node = { x: q[0], y: q[1], in: null, out: null, kind: 'corner' };
  } else {
    const [l, r] = splitBezier(seg.p0, seg.c1, seg.c2, seg.p3, t);
    a.out = l[1];
    b.in = r[2];
    node = { x: l[3][0], y: l[3][1], in: l[2], out: r[1], kind: 'smooth' };
  }
  const at = seg.j === 0 ? sp.nodes.length : seg.j;
  sp.nodes.splice(at, 0, node);
  return at;
}

export function openAt(subs: SubPath[], seg: Seg): void {
  const sp = subs[seg.sub];
  if (!sp.closed) {
    const head = sp.nodes.slice(0, seg.i + 1), tail = sp.nodes.slice(seg.j);
    head[head.length - 1].out = null;
    tail[0].in = null;
    subs.splice(seg.sub, 1, { closed: false, nodes: head }, { closed: false, nodes: tail });
    return;
  }
  const n = sp.nodes;
  const rot = [...n.slice(seg.j), ...n.slice(0, seg.j)];
  rot[rot.length - 1].out = null;
  rot[0].in = null;
  sp.nodes = rot;
  sp.closed = false;
}

export function setKind(sp: SubPath, i: number, kind: AnchorKind): void {
  const n = sp.nodes[i];
  n.kind = kind;
  const len = sp.nodes.length;
  const prev = sp.closed || i > 0 ? sp.nodes[(i - 1 + len) % len] : null;
  const next = sp.closed || i < len - 1 ? sp.nodes[(i + 1) % len] : null;
  if (kind === 'corner') { n.in = null; n.out = null; return; }
  let dx = 0, dy = 0;
  if (n.in && n.out) { dx = n.out[0] - n.in[0]; dy = n.out[1] - n.in[1]; }
  if (Math.hypot(dx, dy) < EPS) {
    const a: Pt = prev ? [prev.x, prev.y] : [n.x, n.y], b: Pt = next ? [next.x, next.y] : [n.x, n.y];
    dx = b[0] - a[0]; dy = b[1] - a[1];
  }
  const l = Math.hypot(dx, dy);
  if (l < EPS) return;
  dx /= l; dy /= l;
  const li = n.in ? dist([n.x, n.y], n.in) : prev ? dist([n.x, n.y], [prev.x, prev.y]) / 3 : 0;
  const lo = n.out ? dist(n.out, [n.x, n.y]) : next ? dist([next.x, next.y], [n.x, n.y]) / 3 : 0;
  const avg = (li + lo) / 2 || Math.max(li, lo);
  const a = kind === 'symmetric' ? avg : li || avg, b = kind === 'symmetric' ? avg : lo || avg;
  n.in = prev && a > EPS ? [n.x - dx * a, n.y - dy * a] : null;
  n.out = next && b > EPS ? [n.x + dx * b, n.y + dy * b] : null;
}

export function moveHandle(n: Anchor, which: 'in' | 'out', p: Pt, independent = false): void {
  n[which] = p;
  const other = which === 'in' ? 'out' : 'in';
  const o = n[other];
  if (independent) { n.kind = 'corner'; return; }
  if (n.kind === 'corner' || !o) return;
  const dx = n.x - p[0], dy = n.y - p[1];
  const l = Math.hypot(dx, dy);
  if (l < EPS) return;
  const keep = n.kind === 'symmetric' ? l : dist(o, [n.x, n.y]);
  n[other] = [n.x + (dx / l) * keep, n.y + (dy / l) * keep];
}

export function moveAnchor(n: Anchor, x: number, y: number): void {
  const dx = x - n.x, dy = y - n.y;
  n.x = x; n.y = y;
  if (n.in) n.in = [n.in[0] + dx, n.in[1] + dy];
  if (n.out) n.out = [n.out[0] + dx, n.out[1] + dy];
}

export function translate(subs: SubPath[], dx: number, dy: number): SubPath[] {
  return mapPath(subs, p => [p[0] + dx, p[1] + dy]);
}

export function polyPath(points: Pt[], closed: boolean): SubPath {
  return { closed, nodes: points.map(([x, y]) => ({ x, y, in: null, out: null, kind: 'corner' as AnchorKind })) };
}

export function autoSmooth(sp: SubPath): void {
  const n = sp.nodes;
  const len = n.length;
  if (len < 2) return;
  for (let i = 0; i < len; i++) {
    const cur = n[i];
    const prev = sp.closed || i > 0 ? n[(i - 1 + len) % len] : null;
    const next = sp.closed || i < len - 1 ? n[(i + 1) % len] : null;
    if (!prev || !next) {
      const other = prev ?? next;
      if (!other) continue;
      const k = 1 / 3;
      const h: Pt = [cur.x + (other.x - cur.x) * k, cur.y + (other.y - cur.y) * k];
      cur.in = prev ? h : null;
      cur.out = next ? h : null;
      cur.kind = 'smooth';
      continue;
    }
    const dp = dist([prev.x, prev.y], [cur.x, cur.y]), dn = dist([next.x, next.y], [cur.x, cur.y]);
    let tx = next.x - prev.x, ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    cur.in = [cur.x - tx * dp / 3, cur.y - ty * dp / 3];
    cur.out = [cur.x + tx * dn / 3, cur.y + ty * dn / 3];
    cur.kind = 'smooth';
  }
}

export function rectPath(x: number, y: number, w: number, h: number): SubPath {
  return polyPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): SubPath {
  const k = 0.5522847498307936;
  const a = (x: number, y: number, ix: number, iy: number, ox: number, oy: number): Anchor => ({ x, y, in: [x + ix, y + iy], out: [x + ox, y + oy], kind: 'symmetric' });
  return {
    closed: true,
    nodes: [
      a(cx + rx, cy, 0, -k * ry, 0, k * ry),
      a(cx, cy + ry, k * rx, 0, -k * rx, 0),
      a(cx - rx, cy, 0, k * ry, 0, -k * ry),
      a(cx, cy - ry, -k * rx, 0, k * rx, 0)
    ]
  };
}

export function polygonPath(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2): SubPath {
  const n = Math.max(3, Math.min(120, Math.round(sides)));
  return polyPath(Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rotation + (i * 2 * Math.PI) / n), cy + r * Math.sin(rotation + (i * 2 * Math.PI) / n)] as Pt), true);
}

export function starPath(cx: number, cy: number, r: number, points: number, ratio: number, rotation = -Math.PI / 2): SubPath {
  const n = Math.max(3, Math.min(120, Math.round(points)));
  const inner = r * Math.max(0.02, Math.min(1, ratio));
  return polyPath(Array.from({ length: n * 2 }, (_, i) => {
    const rr = i % 2 === 0 ? r : inner;
    const a = rotation + (i * Math.PI) / n;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as Pt;
  }), true);
}

export function linePath(a: Pt, b: Pt): SubPath {
  return polyPath([a, b], false);
}

export function arcPath(x: number, y: number, w: number, h: number, slope: number, closed: boolean): SubPath {
  const k = 0.5522847498307936;
  const s = Math.max(-1, Math.min(1, slope));
  const start: Pt = [x, y + h], end: Pt = [x + w, y];
  const lineOut = lerp(start, end, 1 / 3), lineIn = lerp(start, end, 2 / 3);
  const convexOut: Pt = [x, y + h - k * h], convexIn: Pt = [x + w - k * w, y];
  const concaveOut: Pt = [x + k * w, y + h], concaveIn: Pt = [x + w, y + k * h];
  const target = (convex: Pt, concave: Pt, line: Pt): Pt => (s >= 0 ? lerp(line, convex, s) : lerp(line, concave, -s));
  const a: Anchor = { x: start[0], y: start[1], in: null, out: target(convexOut, concaveOut, lineOut), kind: 'corner' };
  const b: Anchor = { x: end[0], y: end[1], in: target(convexIn, concaveIn, lineIn), out: null, kind: 'corner' };
  return { closed, nodes: [a, b] };
}

export function spiralPath(cx: number, cy: number, radius: number, decay: number, turns: number, clockwise = true): SubPath {
  const quarter = Math.max(1, Math.round(turns * 4));
  const factor = Math.max(0.05, Math.min(0.99, decay)) ** (1 / 4);
  const pts: Pt[] = [];
  const tangents: Pt[] = [];
  let r = radius;
  const dir = clockwise ? 1 : -1;
  for (let i = 0; i <= quarter; i++) {
    const a = (i * Math.PI) / 2 * dir;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    tangents.push([-Math.sin(a) * dir, Math.cos(a) * dir]);
    r *= factor;
  }
  const k = 0.5522847498307936;
  const nodes: Anchor[] = pts.map(([x, y]) => ({ x, y, in: null, out: null, kind: 'smooth' as AnchorKind }));
  let rr = radius;
  for (let i = 0; i < quarter; i++) {
    const hOut = rr * k, hIn = rr * factor * k;
    nodes[i].out = [nodes[i].x + tangents[i][0] * hOut, nodes[i].y + tangents[i][1] * hOut];
    nodes[i + 1].in = [nodes[i + 1].x - tangents[i + 1][0] * hIn, nodes[i + 1].y - tangents[i + 1][1] * hIn];
    rr *= factor;
  }
  return { closed: false, nodes };
}

export interface VectorModel { v: 1; subs: SubPath[] }

const r2 = (v: number): number => Math.round(v * 100) / 100;
const rp = (p: Pt | null): Pt | null => (p ? [r2(p[0]), r2(p[1])] : null);

export function encodeModel(subs: SubPath[]): string {
  const model = {
    v: 1,
    subs: subs.map(s => ({
      closed: s.closed,
      nodes: s.nodes.map(n => {
        const out: Record<string, unknown> = { x: r2(n.x), y: r2(n.y), kind: n.kind };
        if (n.in) out.in = rp(n.in);
        if (n.out) out.out = rp(n.out);
        if (n.corner && n.corner.radius > 0) out.corner = { type: n.corner.type, radius: r2(n.corner.radius), mode: n.corner.mode };
        return out;
      })
    }))
  };
  return JSON.stringify(model);
}

function pt(value: unknown): Pt | null {
  return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v)) ? [value[0], value[1]] : null;
}

export function decodeModel(text: string | undefined): SubPath[] | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { v?: number; subs?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.subs)) return null;
    const subs: SubPath[] = [];
    for (const s of raw.subs as { closed?: boolean; nodes?: unknown }[]) {
      if (!Array.isArray(s.nodes)) return null;
      const nodes: Anchor[] = [];
      for (const n of s.nodes as Record<string, unknown>[]) {
        if (typeof n.x !== 'number' || typeof n.y !== 'number' || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
        const kind: AnchorKind = n.kind === 'smooth' || n.kind === 'symmetric' ? n.kind : 'corner';
        const anchor: Anchor = { x: n.x, y: n.y, in: pt(n.in), out: pt(n.out), kind };
        const c = n.corner as Partial<Corner> | undefined;
        if (c && typeof c.radius === 'number' && c.radius > 0) {
          anchor.corner = { type: c.type === 'inverted' || c.type === 'chamfer' ? c.type : 'round', radius: c.radius, mode: c.mode === 'relative' ? 'relative' : 'absolute' };
        }
        nodes.push(anchor);
      }
      subs.push({ closed: !!s.closed, nodes });
    }
    return subs;
  } catch { return null; }
}
