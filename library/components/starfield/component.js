export function mount(root, props, ctx) {
  const P = props || {};
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v, d) => (typeof v === 'string' && v.trim() ? v : d);
  const seed = num(P.seed, 404);
  const reach = Math.max(10, num(P.reach, 220));
  const accentSrc = str(P.accent, 'var(--hue)');
  const sparkSrc = str(P.spark, 'var(--ink)');
  const lineSrc = str(P.line, 'var(--edge-strong)');

  const style = document.createElement('style');
  style.textContent = '.fwc-starfield{position:absolute;inset:0;pointer-events:none;overflow:hidden}.fwc-starfield canvas{display:block;width:100%;height:100%}';
  const wrap = document.createElement('div');
  wrap.className = 'fwc-starfield';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  wrap.append(canvas);
  root.append(style, wrap);
  const g = canvas.getContext('2d');
  if (!g) return () => {};

  const colorOf = (value) => {
    const t = document.createElement('i');
    t.style.color = value;
    wrap.append(t);
    const c = getComputedStyle(t).color;
    t.remove();
    return c;
  };
  const lcg = (s0) => {
    let s = s0 >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  let sq = [];
  let sprite = null;
  let blur = null;
  let glow = null;
  let sw = 1;
  let sh = 1;
  let dpr = 1;
  let intensity = 0;
  let target = 0;
  let px = -9999;
  let py = -9999;
  let lineColor = '';
  let drawn = false;

  const makeSprite = (color, blurPx, pad) => {
    const size = 17 + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.ceil(size * dpr);
    c.height = Math.ceil(size * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    if (blurPx) x.filter = 'blur(' + blurPx + 'px)';
    x.fillStyle = color;
    x.beginPath();
    if (x.roundRect) x.roundRect(pad, pad, 17, 17, 4);
    else x.rect(pad, pad, 17, 17);
    x.fill();
    return c;
  };

  const build = () => {
    const rect = wrap.getBoundingClientRect();
    sw = Math.max(1, rect.width);
    sh = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(sw * dpr);
    canvas.height = Math.round(sh * dpr);
    const hue = colorOf(accentSrc);
    lineColor = colorOf(lineSrc);
    sprite = makeSprite(hue, 0, 0);
    blur = makeSprite(hue, 5, 8);
    glow = makeSprite(colorOf(sparkSrc), 0, 0);
    const rnd = lcg(seed);
    const cols = Math.ceil(sw / 30);
    const rows = Math.ceil(sh / 30);
    sq = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fx = (c + 0.5) / cols;
        const edge = Math.abs(fx - 0.5) * 2;
        const wgt = Math.max(0, Math.min(1, (edge - 0.42) / (0.87 - 0.42)));
        const fy = Math.max(0, 1 - r / rows);
        const wave = 0.5 + 0.25 * Math.sin(c * 0.37 + r * 0.21) + 0.25 * Math.sin(c * 0.11 - r * 0.43 + 1.3);
        const a = rnd();
        const b = rnd();
        const d = rnd();
        const e = rnd();
        const strength = a * wave * wgt * fy * 1.2;
        if (strength > 0.05) sq.push({ x: c * 30 + 6.5, y: r * 30 + 6.5, base: Math.min(0.9, strength), speed: 0.4 + b * 0.9, phase: d * 6.283, soft: e < 0.35 });
      }
    }
  };

  const draw = (t, still) => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, sw, sh);
    g.globalAlpha = 0.5;
    g.strokeStyle = lineColor;
    g.lineWidth = 1;
    const cx = sw / 2;
    const cy = Math.min(sh * 0.78, 1100);
    [260, 420, 600, 800].forEach((rad) => {
      g.beginPath();
      g.arc(cx, cy, rad, 0, 6.2832);
      g.stroke();
    });
    const rect = wrap.getBoundingClientRect();
    const lx = px - rect.left;
    const ly = py - rect.top;
    for (const s of sq) {
      const pulse = still ? 0.7 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      let a = Math.min(0.9, s.base * pulse);
      let boost = 0;
      if (intensity > 0.001) {
        const d = Math.hypot(s.x + 8.5 - lx, s.y + 8.5 - ly);
        if (d < reach) boost = intensity * Math.pow(1 - d / reach, 1.6);
      }
      a = Math.min(1, a + boost * 0.85);
      const grow = 1 + boost * 0.28;
      const src = s.soft ? blur : sprite;
      const pad = s.soft ? 8 : 0;
      const size = 17 + pad * 2;
      g.globalAlpha = a;
      g.drawImage(src, s.x - pad - ((grow - 1) * size) / 2, s.y - pad - ((grow - 1) * size) / 2, size * grow, size * grow);
      if (boost > 0.1) {
        g.globalAlpha = Math.min(1, (boost - 0.1) * 0.85);
        g.drawImage(glow, s.x - ((grow - 1) * 17) / 2, s.y - ((grow - 1) * 17) / 2, 17 * grow, 17 * grow);
      }
    }
    g.globalAlpha = 1;
    if (!drawn) {
      drawn = true;
      ctx.ready();
    }
  };

  let offFrame = null;
  const start = () => {
    if (offFrame || ctx.reduced) return;
    offFrame = ctx.onFrame((ts) => {
      if (!ctx.visible()) return;
      intensity += (target - intensity) * 0.08;
      draw(ts / 1000, false);
    });
  };
  const stop = () => {
    if (offFrame) offFrame();
    offFrame = null;
  };
  const refresh = () => {
    build();
    if (ctx.reduced) {
      stop();
      draw(0, true);
    } else {
      draw(0, false);
      start();
    }
  };

  const onMove = (e) => {
    px = e.clientX;
    py = e.clientY;
    target = ctx.reduced ? 0 : 1;
  };
  const onLeave = () => { target = 0; };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);

  const offResize = ctx.onResize(() => refresh());
  const offTheme = ctx.onTheme(() => requestAnimationFrame(refresh));
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', refresh);

  refresh();

  return () => {
    stop();
    offResize();
    offTheme();
    mq.removeEventListener('change', refresh);
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    style.remove();
    wrap.remove();
  };
}
