import { parsePath, segments, type Pt, type SubPath } from './geometry';

/**
 * Vector PDF export (Figma's Export as PDF: one page, 1x, PDF 1.7). The rendered svg in the canvas is walked element
 * by element: paths, rects, circles, ellipses, lines, polylines and polygons become PDF paths with their computed fill,
 * stroke, dash, cap, join, fill rule and opacity; clip-path groups clip their contents; `use` instances draw their
 * symbol; text is set in Helvetica (one of the PDF base fonts, so nothing is embedded) at its size, colour and anchor.
 * Not carried: gradients and patterns (the first gradient stop colour stands in; patterns are skipped), images,
 * masks, filters and blend modes. One drawing unit is one PDF point.
 */

type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const at = (m: Mat, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
const scaleOf = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const n = (v: number): string => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };

const SKIP = new Set(['defs', 'clippath', 'mask', 'pattern', 'symbol', 'lineargradient', 'radialgradient', 'title', 'desc', 'style', 'marker', 'metadata', 'filter', 'script', 'foreignobject', 'image']);
const KAPPA = 0.5522847498;

function localMatrix(el: Element): Mat {
  const list = (el as SVGGraphicsElement).transform?.baseVal;
  const m = list && list.numberOfItems ? list.consolidate()?.matrix : null;
  return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : ID;
}

const num = (el: Element, name: string): number => { const v = parseFloat(el.getAttribute(name) ?? ''); return Number.isFinite(v) ? v : 0; };

function ellipse(cx: number, cy: number, rx: number, ry: number): SubPath[] {
  const k = KAPPA;
  const node = (x: number, y: number, inP: Pt, outP: Pt) => ({ x, y, in: inP, out: outP, kind: 'smooth' as const });
  return [{ closed: true, nodes: [
    node(cx + rx, cy, [cx + rx, cy - ry * k], [cx + rx, cy + ry * k]),
    node(cx, cy + ry, [cx + rx * k, cy + ry], [cx - rx * k, cy + ry]),
    node(cx - rx, cy, [cx - rx, cy + ry * k], [cx - rx, cy - ry * k]),
    node(cx, cy - ry, [cx - rx * k, cy - ry], [cx + rx * k, cy - ry]),
  ] }];
}

const corner = (x: number, y: number) => ({ x, y, in: null, out: null, kind: 'corner' as const });

function geometry(el: Element): SubPath[] | null {
  switch (el.localName.toLowerCase()) {
    case 'path': return parsePath(el.getAttribute('d'));
    case 'rect': { const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height'); return w > 0 && h > 0 ? [{ closed: true, nodes: [corner(x, y), corner(x + w, y), corner(x + w, y + h), corner(x, y + h)] }] : null; }
    case 'circle': { const r = num(el, 'r'); return r > 0 ? ellipse(num(el, 'cx'), num(el, 'cy'), r, r) : null; }
    case 'ellipse': { const rx = num(el, 'rx'), ry = num(el, 'ry'); return rx > 0 && ry > 0 ? ellipse(num(el, 'cx'), num(el, 'cy'), rx, ry) : null; }
    case 'line': return [{ closed: false, nodes: [corner(num(el, 'x1'), num(el, 'y1')), corner(num(el, 'x2'), num(el, 'y2'))] }];
    case 'polyline': case 'polygon': {
      const v = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      const nodes = []; for (let i = 0; i + 1 < v.length; i += 2) nodes.push(corner(v[i], v[i + 1]));
      return nodes.length > 1 ? [{ closed: el.localName.toLowerCase() === 'polygon', nodes }] : null;
    }
    default: return null;
  }
}

function pathOps(subs: SubPath[], m: Mat): string {
  const out: string[] = [];
  const segs = segments(subs);
  subs.forEach((sp, si) => {
    if (!sp.nodes.length) return;
    const [x, y] = at(m, [sp.nodes[0].x, sp.nodes[0].y]);
    out.push(`${n(x)} ${n(y)} m`);
    for (const s of segs) {
      if (s.sub !== si) continue;
      const p3 = at(m, s.p3);
      if (s.line) out.push(`${n(p3[0])} ${n(p3[1])} l`);
      else { const c1 = at(m, s.c1), c2 = at(m, s.c2); out.push(`${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p3[0])} ${n(p3[1])} c`); }
    }
    if (sp.closed) out.push('h');
  });
  return out.join('\n');
}

interface Rgba { r: number; g: number; b: number; a: number }

class Writer {
  private ops: string[] = [];
  private alphas = new Map<string, string>();
  private probe = document.createElement('canvas').getContext('2d');
  usedFont = false;

  constructor(private doc: Document) {}

  /** A computed paint value as an RGB colour; a url() paint uses its gradient's first stop. */
  color(value: string, opacity: number): Rgba | null {
    if (!value || value === 'none' || value === 'transparent') return null;
    let css = value;
    const ref = /url\(["']?#([^"')]+)["']?\)/.exec(value);
    if (ref) {
      const target = this.doc.getElementById(ref[1]);
      const stop = target?.querySelector('stop');
      if (!stop) return null;
      const style = this.doc.defaultView?.getComputedStyle(stop);
      css = style?.stopColor || stop.getAttribute('stop-color') || 'black';
      opacity *= parseFloat(style?.stopOpacity || stop.getAttribute('stop-opacity') || '1');
    }
    const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(css);
    let r = 0, g = 0, b = 0, a = 1;
    if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; a = rgb[4] !== undefined ? +rgb[4] : 1; }
    else if (this.probe) {
      this.probe.fillStyle = '#000';
      this.probe.fillStyle = css;
      const hex = /^#([0-9a-f]{6})$/i.exec(String(this.probe.fillStyle));
      if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
      else return this.color(String(this.probe.fillStyle), opacity);
    }
    return { r: r / 255, g: g / 255, b: b / 255, a: Math.max(0, Math.min(1, a * opacity)) };
  }

  private gs(fill: number, stroke: number): string {
    const key = `${n(fill)}|${n(stroke)}`;
    let name = this.alphas.get(key);
    if (!name) { name = `GS${this.alphas.size}`; this.alphas.set(key, name); }
    return `/${name} gs`;
  }

  push(op: string): void { this.ops.push(op); }

  shape(subs: SubPath[], m: Mat, style: CSSStyleDeclaration, alpha: number): void {
    const fill = this.color(style.fill, parseFloat(style.fillOpacity || '1') * alpha);
    const width = parseFloat(style.strokeWidth || '1');
    const stroke = width > 0 ? this.color(style.stroke, parseFloat(style.strokeOpacity || '1') * alpha) : null;
    if (!fill && !stroke) return;
    const body = pathOps(subs, m);
    if (!body) return;
    const out = ['q'];
    if ((fill && fill.a < 1) || (stroke && stroke.a < 1)) out.push(this.gs(fill?.a ?? 1, stroke?.a ?? 1));
    if (fill) out.push(`${n(fill.r)} ${n(fill.g)} ${n(fill.b)} rg`);
    if (stroke) {
      const k = scaleOf(m);
      out.push(`${n(stroke.r)} ${n(stroke.g)} ${n(stroke.b)} RG`, `${n(width * k)} w`, `${{ round: 1, square: 2 }[style.strokeLinecap as 'round'] ?? 0} J`, `${{ round: 1, bevel: 2 }[style.strokeLinejoin as 'round'] ?? 0} j`, `${n(parseFloat(style.strokeMiterlimit || '4'))} M`);
      const dash = (style.strokeDasharray || 'none') === 'none' ? [] : style.strokeDasharray.split(/[\s,]+/).map(v => parseFloat(v) * k).filter(v => Number.isFinite(v) && v >= 0);
      if (dash.length && dash.some(v => v > 0)) out.push(`[${dash.map(n).join(' ')}] ${n(parseFloat(style.strokeDashoffset || '0') * k)} d`);
    }
    out.push(body);
    const odd = style.fillRule === 'evenodd';
    out.push(fill && stroke ? (odd ? 'B*' : 'B') : fill ? (odd ? 'f*' : 'f') : 'S', 'Q');
    this.ops.push(out.join('\n'));
  }

  text(raw: string, x: number, y: number, size: number, anchor: string, width: number, m: Mat, fill: Rgba): void {
    const chars = Array.from(raw.replace(/\s+/g, ' ')).map(c => { const code = c.codePointAt(0) ?? 63; return code < 256 ? c : '?'; }).join('');
    if (!chars.trim()) return;
    const shift = anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0;
    const p = at(m, [x - shift, y]);
    const k = scaleOf(m);
    const str = chars.replace(/[\\()]/g, c => `\\${c}`);
    this.usedFont = true;
    const out = ['q'];
    if (fill.a < 1) out.push(this.gs(fill.a, 1));
    out.push(`${n(fill.r)} ${n(fill.g)} ${n(fill.b)} rg`, 'BT', `/F1 ${n(size * k)} Tf`, `1 0 0 -1 ${n(p[0])} ${n(p[1])} Tm`, `(${str}) Tj`, 'ET', 'Q');
    this.ops.push(out.join('\n'));
  }

  resources(): string {
    const gs = [...this.alphas.entries()].map(([key, name]) => { const [f, s] = key.split('|'); return `/${name} << /Type /ExtGState /ca ${f} /CA ${s} >>`; }).join(' ');
    return `<< ${this.usedFont ? '/Font << /F1 5 0 R >> ' : ''}${gs ? `/ExtGState << ${gs} >> ` : ''}>>`;
  }

  content(): string { return this.ops.join('\n'); }
}

export interface PdfSource { live: SVGSVGElement; vb: number[]; width: number; height: number; wanted?: Set<string> }

/** Walk the rendered svg into PDF drawing operations. */
function walk(w: Writer, el: Element, m: Mat, alpha: number, src: PdfSource, inside: boolean, depth: number): void {
  if (depth > 40) return;
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  for (const child of Array.from(el.children)) {
    const tag = child.localName.toLowerCase();
    if (SKIP.has(tag)) continue;
    const style = view?.getComputedStyle(child);
    if (!style || style.display === 'none') continue;
    const id = child.getAttribute('data-fw-id') ?? '';
    const chosen = inside || !src.wanted || src.wanted.has(id);
    const cm = mul(m, localMatrix(child));
    const a = alpha * parseFloat(style.opacity || '1');
    const clipRef = /url\(["']?#([^"')]+)["']?\)/.exec(style.clipPath || '');
    const clip = clipRef ? doc.getElementById(clipRef[1]) : null;
    const open = (): void => {
      if (!clip) return;
      const parts = Array.from(clip.children).map(c => { const g = geometry(c); return g ? pathOps(g, mul(cm, localMatrix(c))) : ''; }).filter(Boolean);
      const rule = clip.firstElementChild ? view?.getComputedStyle(clip.firstElementChild).clipRule : 'nonzero';
      w.push(['q', ...parts, rule === 'evenodd' ? 'W* n' : 'W n'].join('\n'));
    };
    const close = (): void => { if (clip) w.push('Q'); };
    if (tag === 'g' || tag === 'svg' || tag === 'a') {
      open();
      walk(w, child, cm, a, src, chosen && (inside || !!src.wanted?.has(id)), depth + 1);
      close();
      continue;
    }
    if (tag === 'use') {
      const href = child.getAttribute('href') ?? child.getAttribute('xlink:href') ?? '';
      const target = href.startsWith('#') ? doc.getElementById(href.slice(1)) : null;
      if (!target || !chosen) continue;
      open();
      walk(w, target, mul(cm, [1, 0, 0, 1, num(child, 'x'), num(child, 'y')]), a, src, true, depth + 1);
      close();
      continue;
    }
    if (!chosen || style.visibility === 'hidden') continue;
    if (tag === 'text') {
      const fill = w.color(style.fill, parseFloat(style.fillOpacity || '1') * a);
      if (!fill) continue;
      /* Each laid-out line is a direct tspan child with its own x and y. */
      const lines = Array.from(child.children).filter(c => c.localName.toLowerCase() === 'tspan');
      const runs = lines.length ? lines : [child];
      for (const run of runs) {
        const runStyle = view?.getComputedStyle(run) ?? style;
        const size = parseFloat(runStyle.fontSize || '16');
        const content = run.textContent ?? '';
        let width = content.length * size * 0.5;
        try { width = (run as SVGTextContentElement).getComputedTextLength(); } catch { /* not rendered */ }
        w.text(content, num(run, 'x') || num(child, 'x'), num(run, 'y') || num(child, 'y'), size, runStyle.textAnchor || style.textAnchor, width, cm, fill);
      }
      continue;
    }
    const subs = geometry(child);
    if (!subs) continue;
    open();
    w.shape(subs, cm, style, a);
    close();
  }
}

/** One-page vector PDF of the drawing, or of the chosen shapes, cropped to `vb`. */
export function svgToPdf(src: PdfSource): Blob {
  const W = Math.max(1, src.width), H = Math.max(1, src.height);
  const [vx, vy, vw, vh] = src.vb;
  const sx = W / vw, sy = H / vh;
  const w = new Writer(src.live.ownerDocument);
  w.push(`${n(sx)} 0 0 ${n(-sy)} ${n(-vx * sx)} ${n(H + vy * sy)} cm`);
  walk(w, src.live, ID, 1, src, false, 0);
  const stream = w.content();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources ${w.resources()} /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.7\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
