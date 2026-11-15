// develop-frame: a prompt that dims the whole page while a frame develops from its darkest areas (a threshold filter chain
// that opens up over a tinted base), then keeps the finished result in a strip of recent frames.
// Ported from formai-xmental-webspun v3.1.0 assets/sections/formmorpheus-prompt. The section's own nodes carry the copy and
// layout and are found by their data-dev attributes inside the nearest data-dev="scope" element; this module owns the
// behaviour, the dim (token overrides on the page root, softened by registered colour properties) and the strip.
export function mount(root, props, ctx) {
  const P = (k, d) => (props && props[k] != null && props[k] !== '' ? props[k] : d);
  const arr = (k, d) => (Array.isArray(props && props[k]) && props[k].length ? props[k] : d);
  const scope = ctx.host.closest('[data-dev="scope"]') || ctx.host.parentElement;
  const q = (role, from = scope) => from.querySelector('[data-dev="' + role + '"]');
  const qa = (role, from = scope) => [...from.querySelectorAll('[data-dev="' + role + '"]')];
  const html = document.documentElement;
  const R = !!ctx.reduced;

  const PICS = arr('pictures', [
    { url: 'https://media.formai.studio/media/formmorpheus/ui-hero-2/69106ccf033c.w1024.webp', alt: 'The FormMorpheus Stage showing a spinning gem and the word FORMAI, with the Timeline of tracks below', re: 'stage|timeline|movie|track|frame' },
    { url: 'https://media.formai.studio/media/formmorpheus/ui-onion-2/b7244c7bfbdf.w1024.webp', alt: 'A FormMorpheus flipbook with a drawn gem, its onion skin ghosts and the frame strip below', re: 'onion|skin|ghost|draw|flipbook|bounc' },
    { url: 'https://media.formai.studio/media/formmorpheus/ui-writeon-2/9a290fdb0b47.w1024.webp', alt: 'FormMorpheus in Keyframe mode with motion paths on the Stage and ease lanes under the tracks', re: 'write|title|text|keyframe|path|ease|perform' },
    { url: 'https://media.formai.studio/media/formmorpheus/ui-export-2/e5b2f1c564e7.w1024.webp', alt: 'The FormMorpheus Export dialog offering Video, Animated GIF, Frames as images, Current frame and Sprite sheet', re: 'export|gif|mp4|loop|render|save|webm' },
    { url: 'https://media.formai.studio/media/formmorpheus/ui-hero-light-2/ac666c8ae572.w1024.webp', alt: 'The FormMorpheus window in its light theme with the Stage above the Timeline', re: 'light|bright|day|theme' }
  ]).map((p) => ({ url: String(p.url), alt: String(p.alt || ''), re: new RegExp(String(p.re || '$^'), 'i') }));
  const TEST_ORDER = arr('matchOrder', [2, 1, 3, 4, 0]);
  const PROMPTS = arr('prompts', ['A title writes itself on over a dark stage', 'Onion skins ghosting a hand drawn bouncing ball', 'Export the finished movie as a looping GIF', 'The same movie again in a bright light theme']).map(String);
  const RATIOS = arr('ratios', [['4:5', 0.8], ['1:1', 1], ['3:2', 1.5]]);
  const STYLES = arr('styles', ['Soft', 'Crisp', 'Glow']).map(String);
  const DUR = Number(P('duration', 4200)) || 4200;
  const T = {
    animate: String(P('animateLabel', 'Animate')),
    animating: String(P('animatingLabel', 'Animating')),
    wait: String(P('waitingLabel', 'Waiting for a prompt')),
    progress: String(P('progressLabel', 'In progress')),
    done: String(P('doneLabel', 'Done')),
    show: String(P('showResultLabel', 'Show result:')),
    empty: String(P('emptyLabel', 'Finished results collect here'))
  };

  const style = document.createElement('style');
  style.textContent = `
html.fwc-develop-frame { transition: --ground 1.4s var(--ease-out, ease-out), --inset 1.4s var(--ease-out, ease-out), --pane 1.4s var(--ease-out, ease-out), --float 1.4s var(--ease-out, ease-out), --edge 1.4s var(--ease-out, ease-out), --edge-strong 1.4s var(--ease-out, ease-out), --ink 1.4s var(--ease-out, ease-out), --ink-soft 1.4s var(--ease-out, ease-out), --ink-faint 1.4s var(--ease-out, ease-out), --on-ink 1.4s var(--ease-out, ease-out), --bar-veil 1.4s var(--ease-out, ease-out); }
html.fwc-develop-frame-dark, html.fwc-develop-frame-dark[data-theme="light"] {
  --ground: color-mix(in oklab, var(--fwc-dev-hue) 8%, #040306);
  --inset: color-mix(in oklab, var(--fwc-dev-hue) 6%, #030205);
  --pane: color-mix(in oklab, var(--fwc-dev-hue) 11%, #060509);
  --float: color-mix(in oklab, var(--fwc-dev-hue) 14%, #07060b);
  --edge: color-mix(in srgb, var(--fwc-dev-hue) 24%, transparent);
  --edge-strong: color-mix(in srgb, var(--fwc-dev-hue) 44%, transparent);
  --ink: color-mix(in oklab, var(--fwc-dev-hue) 45%, #f6f3ff);
  --ink-soft: color-mix(in oklab, var(--fwc-dev-hue) 55%, #c4c0e0);
  --ink-faint: color-mix(in oklab, var(--fwc-dev-hue) 60%, #8c88aa);
  --on-ink: color-mix(in oklab, var(--fwc-dev-hue) 8%, #040306);
  --bar-veil: color-mix(in srgb, color-mix(in oklab, var(--fwc-dev-hue) 8%, #040306) 92%, transparent);
}
html.fwc-develop-frame [data-dev="glow"] { transition: opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame-dark [data-dev="glow"] { opacity: 1; animation: fwc-df-pulse 3s ease-in-out 1.4s infinite; }
html.fwc-develop-frame [data-dev="input"] { transition: border-color 1.4s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame [data-dev="submit"] { transition: transform var(--dur, 240ms) var(--ease-out, ease-out), background-color 1.4s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame [data-dev="submit"]:hover:not(:disabled) { transform: scale(1.05); }
html.fwc-develop-frame [data-dev="submit"]:active:not(:disabled) { transform: scale(0.95); }
html.fwc-develop-frame [data-dev="submit"]:disabled { cursor: wait; }
html.fwc-develop-frame [data-dev="swin"] { transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame [data-dev="submit"]:hover:not(:disabled) [data-dev="swin"] { transform: translateY(-50%); }
html.fwc-develop-frame-dark [data-dev="submit"] { background: var(--fwc-dev-hue); color: var(--on-ink); }
html.fwc-develop-frame-dark [data-dev="dot"], .fwc-df-busy [data-dev="dot"] { animation: fwc-df-blink 0.8s steps(1) infinite; }
[data-dev="ratio"], [data-dev="style"] { transition: transform var(--dur, 240ms) var(--ease-out, ease-out), background-color var(--dur, 240ms) var(--ease-out, ease-out), color var(--dur, 240ms) var(--ease-out, ease-out); }
html.fwc-develop-frame [data-dev="ratio"][aria-checked="true"], html.fwc-develop-frame [data-dev="style"][aria-checked="true"] { border-color: var(--ink); background: var(--ink); color: var(--on-ink); }
html.fwc-develop-frame [data-dev="ratio"]:hover:not(:disabled), html.fwc-develop-frame [data-dev="style"]:hover:not(:disabled) { transform: translateY(-2px); }
html.fwc-develop-frame [data-dev="ratio"]:disabled, html.fwc-develop-frame [data-dev="style"]:disabled, html.fwc-develop-frame [data-dev="idea"]:disabled { opacity: 0.55; cursor: wait; }
html.fwc-develop-frame [data-dev="ratio"]:focus-visible, html.fwc-develop-frame [data-dev="style"]:focus-visible, html.fwc-develop-frame [data-dev="submit"]:focus-visible, html.fwc-develop-frame [data-dev="idea"]:focus-visible, .fwc-df-th:focus-visible { outline: 2px solid var(--hue); outline-offset: 2px; }
html.fwc-develop-frame [data-dev="idea"] { transition: transform var(--dur, 240ms) var(--ease-out, ease-out), color var(--dur, 240ms) var(--ease-out, ease-out); }
html.fwc-develop-frame [data-dev="idea"]:hover:not(:disabled) { transform: translateX(8px); color: var(--ink); }
html.fwc-develop-frame [data-dev="tray"] { transition: box-shadow 1.2s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame-dark [data-dev="tray"] { box-shadow: inset 0 0 0 1px var(--edge-strong); }
html.fwc-develop-frame [data-dev="traybg"] { transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame-dark [data-dev="traybg"] { opacity: 1; }
html.fwc-develop-frame [data-dev="card"] { transition: transform 0.9s cubic-bezier(0.34, 1.5, 0.64, 1), box-shadow 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
html.fwc-develop-frame:not(.fwc-develop-frame-dark) [data-dev="scope"][data-seen] [data-dev="card"] { transform: none; }
html.fwc-develop-frame-dark [data-dev="card"] { transform: scale(0.96); box-shadow: none; }
html.fwc-develop-frame [data-dev="card"].fwc-df-lift { animation: fwc-df-lift 1.1s cubic-bezier(0.34, 1.5, 0.64, 1); }
html.fwc-develop-frame [data-dev="scope"][data-seen] [data-dev="ph"] { display: none; }
html.fwc-develop-frame [data-dev="rv"] { transition: filter 0.3s var(--ease-out, ease-out); }
html.fwc-develop-frame [data-dev="scope"][data-seen] [data-dev="rv"] { opacity: 1; }
html.fwc-develop-frame [data-dev="rv"][data-style="0"] { filter: contrast(1.05) saturate(0.85) hue-rotate(-6deg); }
html.fwc-develop-frame [data-dev="rv"][data-style="1"] { filter: contrast(1.2) saturate(1.1); }
html.fwc-develop-frame [data-dev="rv"][data-style="2"] { filter: saturate(1.6) brightness(1.08) blur(0.6px); }
html.fwc-develop-frame [data-dev="scope"][data-done] [data-dev="att"] { opacity: 1; transition: opacity 0.6s var(--ease-out, ease-out) 0.5s; }
html.fwc-develop-frame .fwc-df-busy [data-dev="stati"], html.fwc-develop-frame[class] .fwc-df-busy [data-dev="stati"] { background: var(--hue); animation: fwc-df-blink 0.8s steps(1) infinite; }
html.fwc-develop-frame [data-dev="scope"][data-done] [data-dev="stati"] { background: var(--hue); }
html.fwc-develop-frame .fwc-df-nofx [data-dev="thr"], html.fwc-develop-frame .fwc-df-nofx [data-dev="cast"] { display: none; }
html.fwc-develop-frame .fwc-df-nofx [data-dev="rv"][data-run] [data-dev="base"] { animation: fwc-df-plain 4.2s ease-out both; }
.fwc-df-sweep { position: absolute; inset-block: 0; inset-inline-start: 0; inline-size: 50%; background: linear-gradient(105deg, transparent 20%, color-mix(in srgb, var(--hue) 22%, transparent) 50%, transparent 80%); opacity: 0; pointer-events: none; }
html.fwc-develop-frame-dark .fwc-df-sweep { opacity: 1; animation: fwc-df-sweep 3s ease-in-out infinite alternate; }
.fwc-df-th { position: relative; flex: none; block-size: 62px; aspect-ratio: var(--ar); padding: 0; border: 1px solid var(--edge-strong); background: var(--inset); overflow: hidden; cursor: pointer; transform: rotate(var(--tilt)); transition: transform 0.4s cubic-bezier(0.34, 1.5, 0.64, 1); animation: fwc-df-drop 0.7s cubic-bezier(0.34, 1.5, 0.64, 1) backwards; }
.fwc-df-th img { display: block; inline-size: 100%; block-size: 100%; object-fit: cover; }
.fwc-df-th:hover:not(:disabled) { transform: translateY(-6px) scale(1.08); }
.fwc-df-busy .fwc-df-th { cursor: wait; }
@keyframes fwc-df-blink { 50% { opacity: 0.15; } }
@keyframes fwc-df-pulse { 50% { opacity: 0.8; } }
@keyframes fwc-df-sweep { from { transform: translateX(-20%); } to { transform: translateX(110%); } }
@keyframes fwc-df-lift { from { opacity: 0.4; transform: translateY(20px) scale(0.96); } }
@keyframes fwc-df-drop { from { opacity: 0; transform: translateY(-60px) rotate(12deg) scale(1.4); } }
@keyframes fwc-df-plain { from { filter: brightness(2.4) contrast(0.5) hue-rotate(40deg); opacity: 0.2; } }
@media (prefers-reduced-motion: reduce) {
  html.fwc-develop-frame, html.fwc-develop-frame * , .fwc-df-sweep { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; transition-delay: 0s !important; }
}
`;
  const sweep = document.createElement('div');
  sweep.className = 'fwc-df-sweep';
  sweep.setAttribute('aria-hidden', 'true');
  root.append(style, sweep);
  html.classList.add('fwc-develop-frame');

  const form = q('form'), input = q('input'), sub = q('submit'), card = q('card'), rv = q('rv'), wob = q('w');
  const base = q('base'), thr = q('thr'), cast = q('cast'), cap = q('cap'), phl = q('phl'), stt = q('stt'), ths = q('ths');
  const sl1 = q('sl1'), sl2 = q('sl2');
  const ratioBtns = qa('ratio'), styleBtns = qa('style'), ideaBtns = qa('idea');

  const S = { ratio: 0, style: 0, busy: false, cur: null, strip: [], ph: 0, rot: 0, id: 0 };
  let raf = 0, ticker = 0, liftTimer = 0, dead = false, resolveRun = null;
  const fx = typeof CSS !== 'undefined' && CSS.supports('mix-blend-mode', 'multiply') && CSS.supports('filter', 'contrast(2)');
  if (!fx) scope.classList.add('fwc-df-nofx');

  const pill = (btns, i) => btns.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
  const label = () => (RATIOS[S.ratio] ? RATIOS[S.ratio][0] : '') + ' / ' + STYLES[S.style];
  const setLabel = () => { if (phl) phl.textContent = label(); };

  const setRatio = (i) => {
    S.ratio = i;
    card.style.setProperty('--ar', String(RATIOS[i][1]));
    pill(ratioBtns, i);
    setLabel();
  };
  const setStyle = (i) => {
    S.style = i;
    rv.dataset.style = String(i);
    pill(styleBtns, i);
    setLabel();
  };
  const setPic = (rec) => {
    const p = PICS[rec.pic];
    for (const im of [base, thr]) im.src = p.url;
    base.alt = p.alt;
    cap.textContent = rec.prompt;
  };

  const setReveal = (p, tint, t, lin = p) => {
    const Tn = 0.02 + (0.6 * p + 0.4 * lin) * 1.05;
    const done = p >= 0.9995;
    thr.style.display = done ? 'none' : '';
    cast.style.display = tint >= 1 ? 'none' : '';
    if (!done) thr.style.filter = 'grayscale(1) brightness(' + (0.5 / Tn).toFixed(3) + ') contrast(12) invert(1)';
    const a = 1 * Math.max(0, 1 - p / 0.9);
    wob.style.transform = done ? '' : 'translate(' + (a * Math.sin(t * 5.2)).toFixed(3) + '%, ' + (a * Math.cos(t * 4.4)).toFixed(3) + '%)';
    wob.style.filter = done ? '' : 'brightness(' + (0.82 + 0.18 * Math.min(1, p * 1.2)).toFixed(3) + ')';
    cast.style.opacity = String(((1 - tint) * 0.75).toFixed(3));
  };

  const reveal = (instant) =>
    new Promise((res) => {
      resolveRun = res;
      if (R || instant) {
        setReveal(1, 1, 0);
        return res();
      }
      if (!fx) {
        rv.removeAttribute('data-run');
        void rv.offsetWidth;
        rv.setAttribute('data-run', '');
        return setTimeout(res, DUR);
      }
      const t0 = performance.now();
      setReveal(0, 0, 0);
      const tick = (now) => {
        if (dead) return;
        const e = Math.min(now - t0, DUR);
        const p = 1 - Math.pow(1 - e / DUR, 2.2);
        setReveal(p, Math.max(0, (e - DUR * 0.75) / (DUR * 0.25)), e / 1000, e / DUR);
        if (e < DUR) raf = requestAnimationFrame(tick);
        else res();
      };
      raf = requestAnimationFrame(tick);
    });

  const setBusy = (on) => {
    S.busy = on;
    scope.classList.toggle('fwc-df-busy', on);
    input.disabled = on;
    sub.disabled = on;
    for (const b of [...ratioBtns, ...styleBtns, ...ideaBtns, ...qa('th', ths)]) b.disabled = on;
    for (const b of ths.querySelectorAll('.fwc-df-th')) b.disabled = on;
    if (sl1) sl1.textContent = on ? T.animating : T.animate;
    if (sl2) sl2.textContent = on ? T.animating : T.animate;
  };

  const pickPic = (text) => {
    for (const i of TEST_ORDER) if (PICS[i] && PICS[i].re.test(text)) return i;
    const i = S.rot % PICS.length;
    S.rot += 1;
    return i;
  };

  const emptyEl = q('empty');
  const renderStrip = (freshFirst) => {
    for (const el of [...ths.querySelectorAll('.fwc-df-th')]) el.remove();
    if (!S.strip.length) { if (emptyEl) emptyEl.style.display = ''; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    S.strip.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fwc-df-th';
      b.disabled = S.busy;
      b.style.setProperty('--ar', String(RATIOS[r.ratio][1]));
      b.style.setProperty('--tilt', ((i * 37) % 7) - 3 + 'deg');
      b.setAttribute('aria-label', T.show + ' ' + r.prompt);
      const im = document.createElement('img');
      im.src = PICS[r.pic].url;
      im.width = 1024; im.height = 640; im.alt = ''; im.decoding = 'async';
      b.append(im);
      if (!(freshFirst && i === 0)) b.style.animation = 'none';
      b.addEventListener('click', () => showFromStrip(i));
      ths.append(b);
    });
  };

  const statusDone = () => { stt.textContent = T.done + ', ' + RATIOS[S.cur.ratio][0] + ', ' + STYLES[S.cur.style]; };

  function showFromStrip(i) {
    if (S.busy) return;
    const rec = S.strip[i];
    S.strip[i] = S.cur;
    S.cur = rec;
    setRatio(rec.ratio);
    setStyle(rec.style);
    setPic(rec);
    cancelAnimationFrame(raf);
    setReveal(1, 1, 0);
    scope.setAttribute('data-done', '');
    statusDone();
    renderStrip(false);
  }

  const dimOn = () => {
    const hue = getComputedStyle(scope).getPropertyValue('--hue').trim() || '#857cf3';
    html.style.setProperty('--fwc-dev-hue', hue);
    html.classList.add('fwc-develop-frame-dark');
  };
  const dimOff = () => { html.classList.remove('fwc-develop-frame-dark'); };

  const generate = async (raw) => {
    if (S.busy || dead) return;
    const text = String(raw).trim() || PROMPTS[S.ph];
    const rec = { id: ++S.id, pic: pickPic(text), prompt: text, ratio: S.ratio, style: S.style };
    if (S.cur) S.strip = [S.cur, ...S.strip.filter((r) => r.id !== S.cur.id)].slice(0, 6);
    const fresh = !!S.cur;
    S.cur = rec;
    S.ph = (S.ph + 1) % PROMPTS.length;
    input.placeholder = PROMPTS[S.ph];
    input.value = '';
    setBusy(true);
    renderStrip(fresh);
    setPic(rec);
    scope.removeAttribute('data-done');
    scope.setAttribute('data-seen', '');
    dimOn();
    card.classList.remove('fwc-df-lift');
    setReveal(0, 0, 0);
    const t0 = performance.now();
    stt.textContent = T.progress + ' 0.0s';
    clearInterval(ticker);
    ticker = setInterval(() => { stt.textContent = T.progress + ' ' + ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
    await reveal(false);
    if (dead) return;
    clearInterval(ticker);
    dimOff();
    setBusy(false);
    scope.setAttribute('data-done', '');
    rv.removeAttribute('data-run');
    setReveal(1, 1, 0);
    void card.offsetWidth;
    card.classList.add('fwc-df-lift');
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => card.classList.remove('fwc-df-lift'), 1200);
    statusDone();
  };

  const onSubmit = (e) => { e.preventDefault(); generate(input.value); };
  form.addEventListener('submit', onSubmit);
  const offs = [];
  ratioBtns.forEach((b, i) => { const f = () => { if (!S.busy) setRatio(i); }; b.addEventListener('click', f); offs.push(() => b.removeEventListener('click', f)); });
  styleBtns.forEach((b, i) => { const f = () => { if (!S.busy) setStyle(i); }; b.addEventListener('click', f); offs.push(() => b.removeEventListener('click', f)); });
  ideaBtns.forEach((b, i) => {
    const t = q('ideat', b);
    if (t && PROMPTS[i]) t.textContent = PROMPTS[i];
    const f = () => generate(PROMPTS[i] || (t ? t.textContent : ''));
    b.addEventListener('click', f);
    offs.push(() => b.removeEventListener('click', f));
  });

  input.placeholder = PROMPTS[S.ph];
  setLabel();
  setReveal(0, 0, 0);
  renderStrip(false);
  ctx.ready();

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    clearInterval(ticker);
    clearTimeout(liftTimer);
    form.removeEventListener('submit', onSubmit);
    offs.forEach((f) => f());
    html.classList.remove('fwc-develop-frame', 'fwc-develop-frame-dark');
    html.style.removeProperty('--fwc-dev-hue');
    if (resolveRun) resolveRun();
    sweep.remove();
    style.remove();
  };
}
