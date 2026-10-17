// Scroll and pointer effects (FW-185). An element opts in with data-fw-effect: parallax, scroll, mouse, marquee or
// cursor, and data-fw-effect-speed sets the strength. Motion uses the CSS translate, scale and opacity properties, so
// an element's own transform is left alone. With reduced motion, nothing moves: marquees stay still and cursors stay
// native. One scroll listener and one pointer listener drive every element through requestAnimationFrame.
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const all = [...document.querySelectorAll('[data-fw-effect]')];
  if (!all.length) return;
  const speed = (el, fallback) => { const n = parseFloat(el.getAttribute('data-fw-effect-speed') || ''); return Number.isFinite(n) ? n : fallback; };
  const kind = el => el.getAttribute('data-fw-effect');
  const scrolled = all.filter(el => kind(el) === 'parallax' || kind(el) === 'scroll');
  const moved = all.filter(el => kind(el) === 'mouse');
  if (!reduced) {
    let queued = false;
    const frame = () => {
      queued = false;
      const view = innerHeight;
      for (const el of scrolled) {
        const box = el.getBoundingClientRect();
        if (box.bottom < -view || box.top > view * 2) continue;
        if (kind(el) === 'parallax') {
          el.style.translate = `0 ${Math.round(((box.top + box.height / 2) - view / 2) * -speed(el, 0.3))}px`;
        } else {
          const progress = Math.min(1, Math.max(0, (view - box.top) / (view * 0.6)));
          el.style.opacity = String(0.15 + 0.85 * progress);
          el.style.translate = `0 ${Math.round((1 - progress) * 80 * speed(el, 1))}px`;
          el.style.scale = String(0.92 + 0.08 * progress);
        }
      }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    // The first frame runs now, not on the next animation frame, so the starting positions are set before first paint
    // wherever the deferred script runs ahead of it.
    if (scrolled.length) { addEventListener('scroll', queue, { passive: true }); addEventListener('resize', queue); frame(); }
    if (moved.length) {
      let x = 0, y = 0, pending = false;
      addEventListener('pointermove', event => {
        x = event.clientX / innerWidth - 0.5; y = event.clientY / innerHeight - 0.5;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; for (const el of moved) { const s = 40 * speed(el, 1); el.style.translate = `${Math.round(x * s)}px ${Math.round(y * s)}px`; } });
      }, { passive: true });
    }
  }
  for (const el of all.filter(el => kind(el) === 'marquee')) {
    if (reduced || el.querySelector(':scope > .fw-marquee-track')) continue;
    const track = document.createElement('div');
    track.className = 'fw-marquee-track';
    const gap = getComputedStyle(el).columnGap;
    track.style.cssText = `display:flex;width:max-content;gap:${gap === 'normal' ? '48px' : gap};padding-right:${gap === 'normal' ? '48px' : gap}`;
    while (el.firstChild) track.append(el.firstChild);
    const copy = track.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
    const rail = document.createElement('div');
    rail.className = 'fw-marquee-rail';
    rail.style.cssText = 'display:flex;width:max-content';
    rail.append(track, copy);
    el.style.overflow = 'hidden';
    el.style.display = 'block';
    el.append(rail);
    const width = track.getBoundingClientRect().width || 600;
    const animation = rail.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: (width / Math.max(10, 60 * speed(el, 1))) * 1000, iterations: Infinity });
    el.addEventListener('pointerenter', () => animation.pause());
    el.addEventListener('pointerleave', () => animation.play());
  }
  for (const el of all.filter(el => kind(el) === 'cursor')) {
    if (reduced || matchMedia('(pointer: coarse)').matches) continue;
    const dot = document.createElement('div');
    const size = Math.round(28 * speed(el, 1));
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;background:${getComputedStyle(el).color};opacity:0;pointer-events:none;transition:opacity .15s;z-index:2147483000`;
    document.body.append(dot);
    el.style.cursor = 'none';
    el.addEventListener('pointermove', event => { dot.style.translate = `${event.clientX}px ${event.clientY}px`; dot.style.opacity = '1'; });
    el.addEventListener('pointerleave', () => { dot.style.opacity = '0'; });
  }
})();
