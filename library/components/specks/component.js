// Specks backdrop (C2). Soft radial specks rise through the hero, nearer ones faster and bigger.
export function mount(root, props, ctx) {
  const num = (v, fallback, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  const count = Math.round(num(props.count ?? 46, 46, 0, 200));
  const parallax = num(props.parallax ?? 12, 12, 0, 80);
  const colorDark = String(props.colorDark ?? 'var(--ink)');
  const colorLight = String(props.colorLight ?? 'var(--hue)');

  const style = document.createElement('style');
  style.textContent = '.fwc-specks{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}'
    + '.fwc-specks-probe{display:none}';
  const cv = document.createElement('canvas');
  cv.className = 'fwc-specks';
  cv.setAttribute('aria-hidden', 'true');
  const probe = document.createElement('span');
  probe.className = 'fwc-specks-probe';
  root.append(style, cv, probe);

  const g = cv.getContext('2d');
  if (!g) {
    ctx.ready();
    return () => { style.remove(); cv.remove(); probe.remove(); };
  }

  const rgbOf = (css, fallback) => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#000';
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    } catch (e) {
      return fallback;
    }
  };
  let rgb = [255, 255, 255];
  const readTheme = (mode) => {
    const light = mode === 'light';
    probe.style.color = light ? colorLight : colorDark;
    rgb = rgbOf(getComputedStyle(probe).color, [255, 255, 255]);
    cv.style.mixBlendMode = light ? 'normal' : 'screen';
  };
  readTheme(ctx.theme());
  const offTheme = ctx.onTheme(readTheme);

  let W = 0;
  let H = 0;
  let dpr = 1;
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.max(2, Math.round(W * dpr));
    cv.height = Math.max(2, Math.round(H * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const offResize = ctx.onResize(size);

  if (ctx.reduced || count === 0) {
    ctx.ready();
    return () => { offTheme(); offResize(); style.remove(); cv.remove(); probe.remove(); };
  }

  const specks = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), ph: Math.random() * 6.283 }));
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  const onMove = (e) => {
    tx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
    ty = e.clientY / Math.max(1, window.innerHeight) - 0.5;
  };
  if (parallax > 0) window.addEventListener('pointermove', onMove, { passive: true });

  let last = 0;
  let drawn = false;
  const offFrame = ctx.onFrame((now) => {
    const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 0;
    last = now;
    if (!ctx.visible() && drawn) return;
    const k = 1 - Math.pow(0.95, dt * 60);
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
    g.clearRect(0, 0, W, H);
    for (const s of specks) {
      s.y -= dt * (0.006 + 0.018 * s.z);
      s.ph += 0.8 * dt;
      if (s.y < -0.05) {
        s.y = 1.05;
        s.x = Math.random();
      }
      const x = (s.x + Math.sin(s.ph) * 0.01) * W - cx * parallax * 2 * s.z;
      const y = s.y * H - cy * parallax * 2 * s.z;
      const r = 1 + 5 * s.z * s.z;
      const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
      const a = 0.55 - 0.25 * s.z;
      grad.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')');
      grad.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r * 2, 0, 6.2832);
      g.fill();
    }
    if (!drawn) {
      drawn = true;
      ctx.ready();
    }
  });

  return () => {
    offFrame();
    offTheme();
    offResize();
    window.removeEventListener('pointermove', onMove);
    style.remove();
    cv.remove();
    probe.remove();
  };
}
