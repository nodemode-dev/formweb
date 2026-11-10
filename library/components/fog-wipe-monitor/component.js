const CSS = `
.fwc-fogwipe {
  --pm-bar: clamp(7px, 0.8vw, 12px);
  --pm-grip: clamp(90px, 16vh, 150px);
  --pm-rim: clamp(7px, 0.9vw, 14px);
  position: absolute;
  inset: 0;
  overflow: hidden;
  isolation: isolate;
  background: var(--black, #000);
  color: var(--footage-ink, #fff);
  font-family: var(--font-ui, system-ui, sans-serif);
  cursor: crosshair;
  touch-action: pan-y;
  text-align: start;
}
.fwc-fogwipe.is-static { cursor: default; }
.fwc-fogwipe *, .fwc-fogwipe *::before, .fwc-fogwipe *::after { box-sizing: border-box; }
.fwc-fogwipe .pm-still, .fwc-fogwipe .pm-glass {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  display: block;
}
.fwc-fogwipe .pm-still { z-index: var(--z-behind, -1); object-fit: cover; }
.fwc-fogwipe .pm-glass { z-index: var(--z-base, 0); }
.fwc-fogwipe .pm-glass[hidden] { display: none; }
.fwc-fogwipe .pm-frame {
  position: absolute;
  inset: 0;
  z-index: var(--z-raised, 100);
  pointer-events: none;
  transform-origin: 50% 56%;
  will-change: transform, opacity;
}
.fwc-fogwipe .pm-frame i { position: absolute; display: block; }
.fwc-fogwipe .pm-rim {
  inset: 0;
  border: var(--pm-rim) solid var(--shade-strong, rgb(0 0 0 / 0.8));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.3), inset 0 0 22px 2px rgb(0 0 0 / 0.55);
}
.fwc-fogwipe .pm-v, .fwc-fogwipe .pm-h { box-shadow: 0 0 14px 1px rgb(0 0 0 / 0.5); }
.fwc-fogwipe .pm-v {
  inset-block: 0;
  inline-size: var(--pm-bar);
  transform: translateX(-50%);
  background: linear-gradient(90deg, rgb(255 255 255 / 0.34) 0, rgb(255 255 255 / 0.1) 1px, var(--shade-mid, rgb(0 0 0 / 0.45)) 2px, var(--shade-strong, rgb(0 0 0 / 0.8)) 34%, var(--shade-strong, rgb(0 0 0 / 0.8)) 66%, var(--shade-mid, rgb(0 0 0 / 0.45)) calc(100% - 2px), rgb(255 255 255 / 0.08) calc(100% - 1px), rgb(255 255 255 / 0.2) 100%);
}
.fwc-fogwipe .pm-v1 { inset-inline-start: 33.333%; }
.fwc-fogwipe .pm-v2 { inset-inline-start: 66.667%; }
.fwc-fogwipe .pm-h {
  inset-inline: 0;
  inset-block-start: 31%;
  block-size: var(--pm-bar);
  transform: translateY(-50%);
  background: linear-gradient(180deg, rgb(255 255 255 / 0.34) 0, rgb(255 255 255 / 0.1) 1px, var(--shade-mid, rgb(0 0 0 / 0.45)) 2px, var(--shade-strong, rgb(0 0 0 / 0.8)) 34%, var(--shade-strong, rgb(0 0 0 / 0.8)) 66%, var(--shade-mid, rgb(0 0 0 / 0.45)) calc(100% - 2px), rgb(255 255 255 / 0.08) calc(100% - 1px), rgb(255 255 255 / 0.2) 100%);
}
.fwc-fogwipe .pm-sq {
  position: absolute;
  inset-inline: -1.5%;
  inset-block-start: 0;
  block-size: 16px;
  margin-block-start: -8px;
  z-index: var(--z-raised, 100);
  pointer-events: none;
  opacity: 0;
  will-change: transform;
}
.fwc-fogwipe .pm-blade {
  position: absolute;
  inset: 0;
  display: block;
  background: var(--shade-strong, rgb(0 0 0 / 0.8));
  box-shadow: inset 0 1px 0 var(--footage-edge, rgb(255 255 255 / 0.55)), 0 0 0 1px var(--footage-line, rgb(255 255 255 / 0.16));
}
.fwc-fogwipe .pm-grip {
  position: absolute;
  display: block;
  inset-inline-start: 50%;
  inset-block-end: 100%;
  inline-size: 22px;
  block-size: var(--pm-grip);
  transform: translateX(-50%);
  background: var(--shade-strong, rgb(0 0 0 / 0.8));
  box-shadow: 0 0 0 1px var(--footage-line, rgb(255 255 255 / 0.16));
}
.fwc-fogwipe .pm-fx {
  position: absolute;
  z-index: var(--z-field, 150);
  will-change: opacity, transform;
}
.fwc-fogwipe .pm-top {
  inset-inline: 40px;
  inset-block-start: 24px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--sp-4, 16px);
  padding-block-end: var(--sp-3, 12px);
  border-block-end: 1px solid var(--footage-line, rgb(255 255 255 / 0.16));
  color: var(--footage-soft, rgb(255 255 255 / 0.78));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  pointer-events: none;
}
.fwc-fogwipe .pm-top > * {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 1s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform 1s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc(var(--d) * 1s);
}
.fwc-fogwipe.pm-in .pm-top > * { opacity: 1; transform: none; }
.fwc-fogwipe .pm-form { color: var(--footage-ink, #fff); }
.fwc-fogwipe .pm-suffix { color: var(--fwc-accent, var(--footage-hue, #ffae2b)); }
.fwc-fogwipe .pm-mid { color: var(--footage-ink, #fff); }
.fwc-fogwipe .pm-ctr {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2, 8px);
}
.fwc-fogwipe .pm-ctr output {
  display: inline-block;
  min-inline-size: 5ch;
  padding: 2px var(--sp-2, 8px);
  border: 1px solid var(--fwc-accent, var(--footage-hue, #ffae2b));
  color: var(--fwc-accent, var(--footage-hue, #ffae2b));
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.fwc-fogwipe .pm-hlw {
  inset-inline-start: 48px;
  inset-block-end: 130px;
  pointer-events: none;
}
.fwc-fogwipe .pm-hl {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: 8vw;
  font-weight: var(--weight-display, 640);
  letter-spacing: var(--track-display, -0.035em);
  line-height: 0.86;
  color: var(--footage-ink, #fff);
  text-shadow: 0 2px 30px var(--shade-mid, rgb(0 0 0 / 0.45));
}
.fwc-fogwipe .pm-ln {
  display: block;
  overflow: hidden;
  padding-block-end: 0.12em;
  margin-block-end: -0.12em;
}
.fwc-fogwipe .pm-ln > span {
  display: block;
  transform: translateY(110%);
  transition: transform 1.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc(var(--d) * 1s);
}
.fwc-fogwipe.pm-in .pm-ln > span { transform: none; }
.fwc-fogwipe .pm-ln.is-hue { color: var(--fwc-accent, var(--footage-hue, #ffae2b)); }
.fwc-fogwipe .pm-subw {
  inset-inline-start: 48px;
  inset-block-end: 44px;
  max-inline-size: min(380px, 36vw);
}
.fwc-fogwipe .pm-subw > *, .fwc-fogwipe .pm-dockw > * {
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 1.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform 1.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc(var(--d) * 1s);
}
.fwc-fogwipe.pm-in .pm-subw > *, .fwc-fogwipe.pm-in .pm-dockw > * { opacity: 1; transform: none; }
.fwc-fogwipe .pm-card {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--footage-line, rgb(255 255 255 / 0.16));
  border-radius: var(--radius-m, 10px);
  background: var(--footage-glass, rgb(10 12 13 / 0.45));
  color: var(--footage-ink, #fff);
  font-size: 13px;
  line-height: 1.5;
  min-block-size: 4.6em;
}
.fwc-fogwipe .pm-card .m-touch, .fwc-fogwipe .pm-card .m-pointer { display: none; }
.fwc-fogwipe[data-input="pointer"] .m-pointer, .fwc-fogwipe[data-input="touch"] .m-touch { display: inline; }
.fwc-fogwipe .pm-card[hidden] { display: none; }
.fwc-fogwipe .pm-credit {
  inset-inline-start: 48px;
  inset-block-end: 14px;
  margin: 0;
  color: var(--footage-faint, rgb(255 255 255 / 0.5));
  font-size: 11px;
  pointer-events: none;
}
.fwc-fogwipe .pm-dockw { inset-inline-end: 40px; inset-block-end: 44px; }
.fwc-fogwipe .pm-dock { display: inline-flex; gap: var(--sp-2, 8px); }
.fwc-fogwipe .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2, 8px);
  block-size: 48px;
  padding: 0 var(--sp-5, 24px);
  margin: 0;
  border: 0;
  border-radius: 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), opacity var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}
.fwc-fogwipe .btn-hue { background: var(--hue, #ffae2b); color: var(--on-ink, #14161b); }
.fwc-fogwipe .btn-hue:hover { opacity: 0.88; }
.fwc-fogwipe .btn-quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)); color: var(--ink, #eef0f4); }
.fwc-fogwipe .btn-quiet:hover { background: var(--control, #2b303c); }
.fwc-fogwipe .btn:disabled { opacity: 0.45; cursor: default; }
.fwc-fogwipe .ic { inline-size: var(--icon-s, 16px); block-size: var(--icon-s, 16px); flex: none; }
.fwc-fogwipe :focus-visible { outline: 1px solid var(--footage-ink, #fff); outline-offset: 2px; }
.fwc-fogwipe .pm-note {
  inset-inline-start: 50%;
  inset-block-end: 80px;
  margin: 0;
  padding: 10px 18px;
  border: 1px solid var(--footage-line, rgb(255 255 255 / 0.16));
  border-radius: var(--radius-m, 10px);
  background: var(--footage-glass, rgb(10 12 13 / 0.45));
  color: var(--footage-ink, #fff);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}
.fwc-fogwipe .pm-note span { color: var(--fwc-accent, var(--footage-hue, #ffae2b)); }
.fwc-fogwipe .pm-final {
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay, 600);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  gap: var(--sp-4, 16px);
  padding: 48px 48px 44px;
  background: linear-gradient(to top, var(--shade-strong, rgb(0 0 0 / 0.8)), var(--shade-mid, rgb(0 0 0 / 0.45)) 45%, transparent 85%);
  opacity: 0;
  pointer-events: none;
  will-change: opacity, transform;
}
.fwc-fogwipe .pm-final.is-live { pointer-events: auto; cursor: default; }
.fwc-fogwipe .pm-kick {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2, 8px);
  color: var(--footage-soft, rgb(255 255 255 / 0.78));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.fwc-fogwipe .pm-kick::before {
  content: "";
  inline-size: 8px;
  block-size: 8px;
  background: var(--fwc-accent, var(--footage-hue, #ffae2b));
}
.fwc-fogwipe .pm-final h2 {
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: clamp(48px, 9vw, 150px);
  font-weight: var(--weight-display, 640);
  letter-spacing: var(--track-display, -0.035em);
  line-height: 0.9;
  color: var(--footage-ink, #fff);
}
.fwc-fogwipe .pm-final h2 em { font-style: normal; color: var(--fwc-accent, var(--footage-hue, #ffae2b)); }
.fwc-fogwipe .pm-body {
  margin: 0;
  max-inline-size: 52ch;
  color: var(--footage-soft, rgb(255 255 255 / 0.78));
  font-size: var(--fs-m, 1rem);
  line-height: 1.55;
}
.fwc-fogwipe .pm-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2, 8px);
  margin-block-start: var(--sp-6, 32px);
}
.fwc-fogwipe .pm-loader {
  position: absolute;
  inset: 0;
  z-index: var(--z-popover, 700);
  display: grid;
  place-items: center;
  pointer-events: none;
  color: var(--footage-soft, rgb(255 255 255 / 0.78));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.fwc-fogwipe .pm-loader[hidden] { display: none; }
@media (max-width: 699px) {
  .fwc-fogwipe { --pm-bar: 7px; }
  .fwc-fogwipe .pm-v1 { inset-inline-start: 50%; }
  .fwc-fogwipe .pm-v2 { display: none; }
  .fwc-fogwipe .pm-h { inset-block-start: 25%; }
  .fwc-fogwipe .pm-top { inset-inline: 16px; grid-template-columns: 1fr auto; inset-block-start: 20px; }
  .fwc-fogwipe .pm-mid { display: none; }
  .fwc-fogwipe .pm-hlw { inset-block-start: calc(25% + 20px); inset-block-end: auto; inset-inline-start: 22px; }
  .fwc-fogwipe .pm-hl { font-size: clamp(44px, 12.5vw, 64px); }
  .fwc-fogwipe .pm-credit { inset-inline-start: 22px; inset-block-end: 4px; }
  .fwc-fogwipe .pm-subw { inset-inline: 11px; max-inline-size: none; inset-block-end: 84px; }
  .fwc-fogwipe .pm-dockw { inset-inline: 16px; inset-block-end: 22px; }
  .fwc-fogwipe .pm-dock { inline-size: 100%; justify-content: center; }
  .fwc-fogwipe .pm-note { max-inline-size: calc(100% - 24px); white-space: normal; text-align: center; inset-block-end: 150px; }
  .fwc-fogwipe .pm-final { padding: 24px 22px 28px; }
  .fwc-fogwipe .pm-final h2 { font-size: clamp(48px, 15vw, 72px); }
}
@media (prefers-reduced-motion: reduce) {
  .fwc-fogwipe .pm-top > *, .fwc-fogwipe .pm-ln > span, .fwc-fogwipe .pm-subw > *, .fwc-fogwipe .pm-dockw > * { transition: none; }
}
`;

const CHEVRON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
const ARROW_UP = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';

export function mount(root, props, ctx) {
  const prop = (name, fallback) => {
    const v = props && props[name];
    return v === undefined || v === null ? fallback : v;
  };
  const text = (name, fallback) => String(prop(name, fallback));
  const RM = !!ctx.reduced;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const phone = () => matchMedia("(max-width: 699px)").matches;

  const mkEl = (tag, cls, txt) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (txt !== undefined) el.textContent = txt;
    return el;
  };

  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);

  const stage = mkEl("div", "fwc-fogwipe");
  stage.setAttribute("role", "region");
  stage.setAttribute("aria-label", text("ariaLabel", "FormCut clip monitor. Wipe the glass with the pointer, or use the buttons to clear it."));
  stage.dataset.input = matchMedia("(pointer: coarse)").matches ? "touch" : "pointer";
  const accent = text("accent", "");
  if (accent) stage.style.setProperty("--fwc-accent", accent);
  root.append(stage);

  const still = mkEl("img", "pm-still");
  still.alt = text("stillAlt", "");
  still.decoding = "async";
  still.width = 1280;
  still.height = 534;
  const glass = mkEl("canvas", "pm-glass");
  glass.setAttribute("aria-hidden", "true");

  const frameEl = mkEl("div", "pm-frame");
  frameEl.setAttribute("aria-hidden", "true");
  const rim = mkEl("i", "pm-rim");
  const v1 = mkEl("i", "pm-v pm-v1");
  const v2 = mkEl("i", "pm-v pm-v2");
  const hb = mkEl("i", "pm-h");
  frameEl.append(rim, v1, v2, hb);

  const sq = mkEl("div", "pm-sq");
  sq.setAttribute("aria-hidden", "true");
  sq.append(mkEl("i", "pm-grip"), mkEl("i", "pm-blade"));

  const top = mkEl("div", "pm-fx pm-top");
  const topA = mkEl("span");
  topA.style.setProperty("--d", "0");
  topA.append(mkEl("span", "pm-form", text("brandForm", "Form")), mkEl("span", "pm-suffix", text("brandSuffix", "Cut")), document.createTextNode(" / " + text("clip", "A002")));
  const topB = mkEl("span", "pm-mid", text("monitorLabel", "Clip monitor"));
  topB.style.setProperty("--d", "0.08");
  const topC = mkEl("span", "pm-ctr");
  topC.style.setProperty("--d", "0.16");
  const pctEl = mkEl("output", "", "00%");
  pctEl.setAttribute("aria-live", "off");
  topC.append(document.createTextNode(text("counterLabel", "Frame graded") + " "), pctEl);
  top.append(topA, topB, topC);

  const hlw = mkEl("div", "pm-fx pm-hlw");
  const h1 = mkEl("h1", "pm-hl");
  const l1 = mkEl("span", "pm-ln");
  const l1s = mkEl("span", "", text("headlineA", "Wipe the proxy"));
  l1s.style.setProperty("--d", "0.2");
  l1.append(l1s);
  const l2 = mkEl("span", "pm-ln is-hue");
  const l2s = mkEl("span", "", text("headlineB", "clear"));
  l2s.style.setProperty("--d", "0.3");
  l2.append(l2s);
  h1.append(l1, l2);
  hlw.append(h1);

  const subw = mkEl("div", "pm-fx pm-subw");
  const sub = mkEl("p", "pm-card");
  sub.style.setProperty("--d", "0.6");
  sub.append(mkEl("span", "m-pointer", text("hintPointer", "")), mkEl("span", "m-touch", text("hintTouch", "")));
  const err = mkEl("p", "pm-card", text("errorText", ""));
  err.hidden = true;
  err.style.setProperty("--d", "0.6");
  subw.append(sub, err);

  const credit = mkEl("p", "pm-fx pm-credit", text("credit", ""));

  const dockw = mkEl("div", "pm-fx pm-dockw");
  const dock = mkEl("div", "pm-dock");
  dock.style.setProperty("--d", "0.7");
  const fogBtn = mkEl("button", "btn btn-quiet", text("resetLabel", "Reset proxy"));
  fogBtn.type = "button";
  fogBtn.disabled = true;
  const clearBtn = mkEl("button", "btn btn-hue", text("runLabel", "Run the grade"));
  clearBtn.type = "button";
  clearBtn.insertAdjacentHTML("beforeend", CHEVRON);
  dock.append(fogBtn, clearBtn);
  dockw.append(dock);

  const note = mkEl("p", "pm-fx pm-note", text("noteLead", "Grading pass running") + " ");
  note.append(mkEl("span", "", text("noteTail", "across the frame")));

  const fin = mkEl("div", "pm-final");
  fin.setAttribute("inert", "");
  fin.append(mkEl("p", "pm-kick", text("finalKicker", "")));
  const h2 = mkEl("h2");
  const lines = prop("finalTitle", ["Graded frame", "ready to"]);
  (Array.isArray(lines) ? lines : [String(lines)]).forEach((ln) => {
    h2.append(document.createTextNode(String(ln)), document.createElement("br"));
  });
  h2.append(mkEl("em", "", text("finalEmphasis", "export")));
  fin.append(h2, mkEl("p", "pm-body", text("finalBody", "")));
  const actions = mkEl("div", "pm-actions");
  const cta = mkEl("a", "btn btn-hue", text("finalCta", "About FormCut"));
  cta.href = text("finalHref", "https://formai.studio/formcut/");
  const backBtn = mkEl("button", "btn btn-quiet", text("backLabel", "Back to proxy") + " ");
  backBtn.type = "button";
  backBtn.insertAdjacentHTML("beforeend", ARROW_UP);
  actions.append(cta, backBtn);
  fin.append(actions);

  const loader = mkEl("div", "pm-loader", text("loaderText", "Decoding frame"));

  stage.append(still, glass, frameEl, sq, top, hlw, subw, credit, dockw, note, fin, loader);

  let gx = null;
  let stillOnly = false;
  let ready = false;
  let W = 1;
  let H = 1;
  let scale = 1;
  let q = 1;
  let cs = 4;
  let gw = 1;
  let gh = 1;
  let cw = 1;
  let ch = 1;
  let wipe = new Float32Array(1);
  let word = new Float32Array(1);
  let wordMin = 0;
  let wordMax = 1;
  let wordProg = 0;
  let wordStart = -1;
  let wordDone = false;
  let sum = 0;
  let zoom = 1;
  let bladeY = -40;
  let frameO = 1;
  let frameS = 1;
  let barPx = 8;
  let rimPx = 10;
  let barX = [];
  let barY = 0;
  const drops = [];
  const DROP_CAP = 64;
  let destroyed = false;
  const offs = [];
  const timers = [];

  const mk = () => document.createElement("canvas");
  const layer = mk();
  const lx = layer.getContext("2d");
  const bead = mk();
  const bx = bead.getContext("2d");
  const beadStatic = mk();
  const sx2 = beadStatic.getContext("2d");
  const maskCv = mk();
  const mctx = maskCv.getContext("2d");
  const rimCv = mk();
  const rctx = rimCv.getContext("2d");
  const mfCv = mk();
  const mfx = mfCv.getContext("2d");
  const trailCv = mk();
  const tx = trailCv.getContext("2d");
  const trailRim = mk();
  const trx = trailRim.getContext("2d");
  const sprite = mk();
  sprite.width = 128;
  sprite.height = 128;
  const mistCv = mk();
  mistCv.width = 480;
  mistCv.height = 200;
  let maskData = null;
  let rimData = null;
  let vignette = null;
  let sheen = null;
  let edgeV = null;
  let edgeH = null;
  let trailAge = 0;

  const hash = (a, b) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  const buildSprite = () => {
    const x = sprite.getContext("2d");
    const c = 64;
    x.clearRect(0, 0, 128, 128);
    const body = x.createRadialGradient(c, c, 14, c, c, 62);
    body.addColorStop(0, "rgba(0,0,0,0.04)");
    body.addColorStop(0.62, "rgba(0,0,0,0.22)");
    body.addColorStop(0.9, "rgba(4,8,12,0.62)");
    body.addColorStop(1, "rgba(4,8,12,0.74)");
    x.fillStyle = body;
    x.beginPath();
    x.arc(c, c, 61, 0, 6.2832);
    x.fill();
    const cau = x.createLinearGradient(0, 78, 0, 124);
    cau.addColorStop(0, "rgba(255,255,255,0)");
    cau.addColorStop(1, "rgba(255,255,255,0.5)");
    x.save();
    x.beginPath();
    x.arc(c, c, 61, 0, 6.2832);
    x.clip();
    x.fillStyle = cau;
    x.fillRect(0, 78, 128, 50);
    x.restore();
    x.lineWidth = 3.4;
    x.strokeStyle = "rgba(255,255,255,0.72)";
    x.beginPath();
    x.arc(c, c, 61.6, 0, 6.2832);
    x.stroke();
    x.lineWidth = 2.2;
    x.strokeStyle = "rgba(0,0,0,0.38)";
    x.beginPath();
    x.arc(c, c, 58.8, 3.5, 5.6);
    x.stroke();
    const sp = x.createRadialGradient(40, 38, 0, 40, 38, 15);
    sp.addColorStop(0, "rgba(255,255,255,0.95)");
    sp.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = sp;
    x.beginPath();
    x.arc(40, 38, 15, 0, 6.2832);
    x.fill();
  };

  const buildMist = () => {
    const x = mistCv.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    if (typeof x.filter === "string") {
      x.filter = "blur(9px) saturate(0.45) contrast(0.8) brightness(1.12)";
      x.drawImage(still, -30, -14, 540, 228);
      x.filter = "none";
    } else {
      const a = mk();
      a.width = 120;
      a.height = 50;
      a.getContext("2d").drawImage(still, 0, 0, 120, 50);
      const b = mk();
      b.width = 40;
      b.height = 17;
      b.getContext("2d").drawImage(a, 0, 0, 40, 17);
      x.drawImage(b, 0, 0, 480, 200);
      x.globalCompositeOperation = "saturation";
      x.globalAlpha = 0.6;
      x.fillStyle = "rgb(128,128,128)";
      x.fillRect(0, 0, 480, 200);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
    x.globalAlpha = 0.36;
    x.fillStyle = "rgb(186,194,200)";
    x.fillRect(0, 0, 480, 200);
    x.globalAlpha = 1;
    const tg = x.createLinearGradient(0, 0, 0, 200);
    tg.addColorStop(0, "rgba(236,241,245,0.16)");
    tg.addColorStop(1, "rgba(236,241,245,0)");
    x.fillStyle = tg;
    x.fillRect(0, 0, 480, 200);
    for (let i = 0; i < 16; i++) {
      const px = hash(i, 1.7) * 480;
      const py = hash(i, 8.3) * 200;
      const pr = 40 + hash(i, 4.1) * 70;
      const g = x.createRadialGradient(px, py, 0, px, py, pr);
      const dark = hash(i, 6.6) > 0.55;
      g.addColorStop(0, dark ? "rgba(70,80,88,0.1)" : "rgba(240,244,247,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
  };

  const toStill = () => {
    stillOnly = true;
    glass.hidden = true;
    stage.classList.add("is-static");
    sub.hidden = true;
    err.hidden = false;
    fogBtn.disabled = true;
    loader.hidden = true;
  };

  const place = (iw, ih, z) => {
    const s = Math.max(cw / iw, ch / ih) * z;
    const dw = iw * s;
    const dh = ih * s;
    return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
  };

  const buildBeads = () => {
    beadStatic.width = cw;
    beadStatic.height = ch;
    const x = sx2;
    x.clearRect(0, 0, cw, ch);
    const cell = 8;
    for (let j = 0; j * cell < H + cell; j++) {
      for (let i = 0; i * cell < W + cell; i++) {
        if (hash(i, j) >= 0.42) continue;
        const r = lerp(0.8, 2.8, Math.pow(hash(i + 3.3, j + 5.1), 3));
        const cx = (i + 0.15 + 0.7 * hash(i + 7.7, j + 1.3)) * cell * scale;
        const cy = (j + 0.15 + 0.7 * hash(i + 2.2, j + 9.9)) * cell * scale;
        const rr = r * scale;
        x.fillStyle = "rgba(255,255,255,0.1)";
        x.beginPath();
        x.arc(cx, cy, rr, 0, 6.2832);
        x.fill();
        x.strokeStyle = "rgba(0,0,0,0.3)";
        x.lineWidth = Math.max(0.6, rr * 0.28);
        x.beginPath();
        x.arc(cx + rr * 0.1, cy + rr * 0.1, rr * 0.86, 0.1, 1.5);
        x.stroke();
        x.fillStyle = "rgba(255,255,255,0.6)";
        x.beginPath();
        x.arc(cx - rr * 0.35, cy - rr * 0.38, Math.max(0.5, rr * 0.28), 0, 6.2832);
        x.fill();
      }
    }
  };

  const keepSize = (cv, w, h) => {
    if (cv.width === w && cv.height === h) return;
    if (cv.width > 1 && cv.height > 1 && (cv.width !== 300 || cv.height !== 150)) {
      const t = mk();
      t.width = cv.width;
      t.height = cv.height;
      t.getContext("2d").drawImage(cv, 0, 0);
      cv.width = w;
      cv.height = h;
      cv.getContext("2d").drawImage(t, 0, 0, w, h);
    } else {
      cv.width = w;
      cv.height = h;
    }
  };

  const sizeCanvases = () => {
    scale = Math.min(window.devicePixelRatio || 1, 2) * q;
    cw = Math.round(W * scale);
    ch = Math.round(H * scale);
    glass.width = cw;
    glass.height = ch;
    layer.width = cw;
    layer.height = ch;
    bead.width = cw;
    bead.height = ch;
    mfCv.width = cw;
    mfCv.height = ch;
    keepSize(trailCv, cw, ch);
    keepSize(trailRim, cw, ch);
    gx.imageSmoothingEnabled = true;
    gx.imageSmoothingQuality = "high";
    lx.imageSmoothingEnabled = true;
    mfx.imageSmoothingEnabled = true;
    const d = Math.hypot(cw, ch) / 2;
    vignette = gx.createRadialGradient(cw / 2, ch / 2, d * 0.55, cw / 2, ch / 2, d);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.2)");
    sheen = gx.createLinearGradient(0, 0, cw * 0.62, ch);
    sheen.addColorStop(0, "rgba(255,255,255,0.1)");
    sheen.addColorStop(0.22, "rgba(255,255,255,0.035)");
    sheen.addColorStop(0.34, "rgba(255,255,255,0.0)");
    sheen.addColorStop(0.56, "rgba(255,255,255,0.045)");
    sheen.addColorStop(0.64, "rgba(255,255,255,0)");
    edgeV = gx.createLinearGradient(0, 0, 9 * scale, 0);
    edgeV.addColorStop(0, "rgba(255,255,255,0.42)");
    edgeV.addColorStop(0.12, "rgba(255,255,255,0.16)");
    edgeV.addColorStop(1, "rgba(255,255,255,0)");
    edgeH = gx.createLinearGradient(0, 0, 0, 9 * scale);
    edgeH.addColorStop(0, "rgba(255,255,255,0.42)");
    edgeH.addColorStop(0.12, "rgba(255,255,255,0.16)");
    edgeH.addColorStop(1, "rgba(255,255,255,0)");
    buildBeads();
  };

  const fontStack = () => {
    const f = ctx.token("font-ui");
    return f || "'Inter Web', 'Inter Fallback', sans-serif";
  };

  const rasterWord = () => {
    const ph = phone();
    const fs = ph ? Math.min(0.25 * W, 120) : Math.min(0.13 * W, 0.26 * H, 230);
    const c = mk();
    c.width = gw * 2;
    c.height = gh * 2;
    const x = c.getContext("2d", { willReadFrequently: true });
    const k = 2 / cs;
    x.font = "700 " + fs * k + "px " + fontStack();
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineJoin = "round";
    x.lineWidth = fs * k * 0.06;
    x.fillStyle = "#fff";
    x.strokeStyle = "#fff";
    const cx = (W / 2) * k;
    const cy = (ph ? 0.47 : 0.5) * H * k;
    const full = text("word", "cut clean");
    const parts = ph ? full.split(/\s+/).filter(Boolean) : [full];
    parts.forEach((part, n) => {
      const yy = cy + (n - (parts.length - 1) / 2) * fs * k;
      x.fillText(part, cx, yy);
      x.strokeText(part, cx, yy);
    });
    const d = x.getImageData(0, 0, gw * 2, gh * 2).data;
    word = new Float32Array(gw * gh);
    wordMin = gw;
    wordMax = 0;
    const stride = gw * 2;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const o = j * 2 * stride + i * 2;
        const a = (d[o * 4 + 3] + d[(o + 1) * 4 + 3] + d[(o + stride) * 4 + 3] + d[(o + stride + 1) * 4 + 3]) / 1020;
        word[j * gw + i] = a;
        if (a > 0.3) {
          if (i < wordMin) wordMin = i;
          if (i > wordMax) wordMax = i;
        }
      }
    }
    if (wordMax <= wordMin) {
      wordMin = 0;
      wordMax = gw;
    }
  };

  const clearTrails = () => {
    tx.clearRect(0, 0, trailCv.width, trailCv.height);
    trx.clearRect(0, 0, trailRim.width, trailRim.height);
  };

  const sz = () => clamp(W / 1440, 0.72, 1.15);
  const spawnDrop = (x, y, r, delay, run, life) => {
    if (drops.length >= DROP_CAP) return null;
    const d = {
      x,
      y,
      r,
      rt: r,
      crit: rnd(8.5, 13.5) * sz(),
      delay: delay || 0,
      v: 0,
      run: run || 0,
      ph: Math.random() * 6.283,
      wf: rnd(2, 3.4),
      age: 0,
      acc: 0,
      next: rnd(14, 26),
      sq: 0,
      a: 0,
      die: false,
      life: life || 0
    };
    drops.push(d);
    return d;
  };
  const seedDrops = () => {
    const k = sz();
    for (let i = 0; i < 26; i++) {
      const r = lerp(2.4, 12.5, Math.pow(Math.random(), 1.9)) * k;
      const x = rnd(0.02, 0.98) * W;
      const y = rnd(0.04, 0.94) * H;
      if (y < bladeY) continue;
      if (drops.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 3)) continue;
      const d = spawnDrop(x, y, r, 0);
      if (d) d.a = 1;
    }
  };

  const resetGlass = () => {
    wipe = new Float32Array(gw * gh);
    drops.length = 0;
    if (gx) clearTrails();
    if (!RM && gx) seedDrops();
  };

  const sizeAll = () => {
    W = stage.clientWidth;
    H = stage.clientHeight;
    cs = clamp(W / 320, 3, 5);
    gw = Math.ceil(W / cs);
    gh = Math.ceil(H / cs);
    maskCv.width = gw;
    maskCv.height = gh;
    rimCv.width = gw;
    rimCv.height = gh;
    maskData = mctx.createImageData(gw, gh);
    rimData = rctx.createImageData(gw, gh);
    for (let i = 0; i < gw * gh; i++) {
      rimData.data[i * 4] = 255;
      rimData.data[i * 4 + 1] = 255;
      rimData.data[i * 4 + 2] = 255;
    }
    barX = [v1.offsetLeft];
    if (v2.offsetParent) barX.push(v2.offsetLeft);
    barY = hb.offsetTop;
    barPx = parseFloat(getComputedStyle(v1).inlineSize) || 8;
    rimPx = parseFloat(getComputedStyle(rim).borderTopWidth) || 10;
    if (!stillOnly && gx) sizeCanvases();
    rasterWord();
  };

  let lastW = 0;
  let lastH = 0;
  const onResize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    sizeAll();
    resetGlass();
  };

  const stamp = (x, y, rad, str, inner) => {
    const i0 = Math.max(0, Math.floor((x - rad) / cs));
    const i1 = Math.min(gw - 1, Math.ceil((x + rad) / cs));
    const j0 = Math.max(0, Math.floor((y - rad) / cs));
    const j1 = Math.min(gh - 1, Math.ceil((y + rad) / cs));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot((i + 0.5) * cs - x, (j + 0.5) * cs - y) / rad;
        if (d > 1) continue;
        const t = clamp((d - inner) / (1 - inner));
        const w = str * (1 - t * t * (3 - 2 * t));
        const k = j * gw + i;
        if (w > wipe[k]) wipe[k] = w;
      }
    }
  };
  const stampLine = (x0, y0, x1, y1, rad, str, inner) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(rad / 4, 1.5);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) stamp(lerp(x0, x1, i / n), lerp(y0, y1, i / n), rad, str, inner);
  };
  const clearAt = (x, y) => {
    const i = clamp(Math.floor(x / cs), 0, gw - 1);
    const j = clamp(Math.floor(y / cs), 0, gh - 1);
    return wipe[j * gw + i];
  };

  const spawnFog = () => {
    const k = sz();
    for (let t = 0; t < 10; t++) {
      const r = lerp(2.4, 6.5, Math.random()) * k;
      const x = rnd(0.02, 0.98) * W;
      const y = rnd(0, 0.8) * H;
      if (y < bladeY + 10 || clearAt(x, y) > 0.2) continue;
      if (drops.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 3)) continue;
      spawnDrop(x, y, r, 0);
      return;
    }
  };
  const trailTo = (x0, y0, x1, y1, w) => {
    tx.lineCap = "round";
    tx.strokeStyle = "#fff";
    tx.lineWidth = w * scale;
    tx.beginPath();
    tx.moveTo(x0 * scale, y0 * scale);
    tx.lineTo(x1 * scale, y1 * scale);
    tx.stroke();
    trx.lineCap = "round";
    trx.strokeStyle = "rgba(255,255,255,0.7)";
    trx.lineWidth = (w + 3) * scale;
    trx.beginPath();
    trx.moveTo(x0 * scale, y0 * scale);
    trx.lineTo(x1 * scale, y1 * scale);
    trx.stroke();
    trx.globalCompositeOperation = "destination-out";
    trx.lineWidth = w * scale;
    trx.beginPath();
    trx.moveTo(x0 * scale, y0 * scale);
    trx.lineTo(x1 * scale, y1 * scale);
    trx.stroke();
    trx.globalCompositeOperation = "source-over";
  };
  const stepDrops = (dt) => {
    trailAge += dt;
    if (trailAge > 0.25) {
      trailAge = 0;
      tx.globalCompositeOperation = "destination-out";
      tx.fillStyle = "rgba(0,0,0,0.045)";
      tx.fillRect(0, 0, trailCv.width, trailCv.height);
      tx.globalCompositeOperation = "source-over";
      trx.globalCompositeOperation = "destination-out";
      trx.fillStyle = "rgba(0,0,0,0.045)";
      trx.fillRect(0, 0, trailRim.width, trailRim.height);
      trx.globalCompositeOperation = "source-over";
    }
    const k = sz();
    for (let n = drops.length - 1; n >= 0; n--) {
      const d = drops[n];
      if (d.delay > 0) {
        d.delay -= dt;
        continue;
      }
      d.age += dt;
      if (!d.die && (d.y < bladeY || (d.age > 0.4 && clearAt(d.x, d.y) > 0.65))) d.die = true;
      d.a = d.die ? d.a - dt * 7 : Math.min(1, d.a + dt * 3);
      if (d.a <= 0 && d.die) {
        drops.splice(n, 1);
        continue;
      }
      if (d.life > 0) {
        d.life -= dt;
        if (d.life < 1.4) d.rt = Math.min(d.rt, Math.max(0, d.r * 0.96 - dt * 0.9));
        if (d.life <= 0) d.die = true;
      }
      d.r += (d.rt - d.r) * (1 - Math.exp(-dt * 12));
      d.sq *= Math.exp(-dt * 5);
      if (d.v < 2 && d.run <= 0) {
        if (!d.life && d.r < d.crit) d.rt += dt * rnd(0.12, 0.34) * k;
        const p = clamp((d.r / k - 3.2) / 9) * 0.45 * dt;
        if (d.r >= d.crit) d.run = rnd(120, 380) * k;
        else if (Math.random() < p) d.run = rnd(14, 70) * (d.r / (4 * k));
      }
      const tv = d.run > 0 ? 34 + 30 * d.r : 0;
      d.v += (tv - d.v) * (1 - Math.exp(-dt * (tv > d.v ? 4.5 : 8)));
      if (d.v < 0.4 && d.run <= 0) d.v = 0;
      if (d.v > 0) {
        const dy = d.v * dt;
        const dx = Math.sin(d.age * d.wf + d.ph) * 0.075 * d.v * dt + Math.sin(d.age * 6.1 + d.ph * 2) * 0.018 * d.v * dt;
        const w = Math.max(1.6, d.r * 1.05);
        if (!RM) trailTo(d.x, d.y, d.x + dx, d.y + dy, w);
        d.x += dx;
        d.y += dy;
        d.run -= dy;
        d.acc += dy;
        if (d.acc >= d.next) {
          d.acc = 0;
          d.next = rnd(14, 26);
          if (d.r > 3.1 * k) {
            const br = d.r * rnd(0.16, 0.26);
            d.rt = Math.cbrt(Math.max(0, d.rt ** 3 - br ** 3));
            spawnDrop(d.x + rnd(-0.5, 0.5) * d.r, d.y - d.r * 0.9, br, 0, 0, rnd(5, 11));
          }
        }
      }
      if (d.y - d.r > H || d.r < 1.1) d.die = true;
    }
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (a.delay > 0 || a.die) continue;
      for (let j = i + 1; j < drops.length; j++) {
        const b = drops[j];
        if (b.delay > 0 || b.die) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * 0.8) continue;
        const big = a.rt >= b.rt ? a : b;
        const small = big === a ? b : a;
        const ma = big.rt ** 3;
        const mb = small.rt ** 3;
        big.v = (big.v * ma + small.v * mb) / (ma + mb);
        big.x = lerp(big.x, small.x, mb / (ma + mb) * 0.6);
        big.y = lerp(big.y, small.y, mb / (ma + mb) * 0.6);
        big.rt = Math.cbrt(ma + mb);
        big.sq = Math.min(1, big.sq + 0.6);
        if (small.run > big.run) big.run = small.run;
        small.die = true;
        small.a = Math.min(small.a, 0.4);
        small.rt = 0;
        break;
      }
    }
  };

  const lens = (d, pl) => {
    const k = d.sq;
    const st = 1 + Math.min(d.v / 190, 0.3) + k * 0.2;
    const X = d.x * scale;
    const Y = d.y * scale;
    const RX = d.r * (1 - k * 0.08) * scale;
    const RY = d.r * st * scale;
    if (RX < 0.8) return;
    gx.save();
    gx.globalAlpha = d.a;
    gx.fillStyle = "rgba(0,0,0,0.2)";
    gx.beginPath();
    gx.ellipse(X + RX * 0.06, Y + RY * 0.14, RX * 1.1, RY * 1.1, 0, 0, 6.2832);
    gx.fill();
    if (d.r > 2.3) {
      const iw = still.naturalWidth || 1280;
      const ih = still.naturalHeight || 534;
      const mag = 2.3;
      const sw = ((RX * 2) / mag / pl.w) * iw;
      const sh = ((RY * 2) / mag / pl.h) * ih;
      const cx = ((X - pl.x) / pl.w) * iw;
      const cy = ((Y + RY * 0.35 - pl.y) / pl.h) * ih;
      const sx = clamp(cx - sw / 2, 0, Math.max(0, iw - sw));
      const sy = clamp(cy - sh / 2, 0, Math.max(0, ih - sh));
      gx.beginPath();
      gx.ellipse(X, Y, RX, RY, 0, 0, 6.2832);
      gx.clip();
      gx.translate(X, Y);
      gx.rotate(Math.PI);
      gx.drawImage(still, sx, sy, sw, sh, -RX, -RY, RX * 2, RY * 2);
      gx.rotate(-Math.PI);
      gx.translate(-X, -Y);
    }
    gx.restore();
    gx.save();
    gx.globalAlpha = d.a;
    gx.drawImage(sprite, X - RX * 1.04, Y - RY * 1.04, RX * 2.08, RY * 2.08);
    gx.restore();
  };

  const drawDrops = (pl) => {
    for (const d of drops) {
      if (d.delay > 0 || d.a <= 0) continue;
      lens(d, pl);
    }
  };

  const glassFx = () => {
    if (frameO < 0.01) return;
    const bw = (barPx / 2) * scale;
    const rw = rimPx * scale;
    gx.save();
    gx.globalAlpha = frameO;
    gx.fillStyle = sheen;
    gx.fillRect(0, 0, cw, ch);
    gx.translate(cw / 2, ch * 0.56);
    gx.scale(frameS, frameS);
    gx.translate(-cw / 2, -ch * 0.56);
    const strip = (x, y, flipX, flipY, g, w, h) => {
      gx.save();
      gx.translate(x, y);
      gx.scale(flipX, flipY);
      gx.fillStyle = g;
      gx.fillRect(0, 0, w, h);
      gx.restore();
    };
    strip(rw, 0, 1, 1, edgeV, 9 * scale, ch);
    strip(cw - rw, 0, -1, 1, edgeV, 9 * scale, ch);
    strip(0, rw, 1, 1, edgeH, cw, 9 * scale);
    strip(0, ch - rw, 1, -1, edgeH, cw, 9 * scale);
    for (const bx0 of barX) {
      const x = bx0 * scale;
      strip(x + bw, 0, 1, 1, edgeV, 9 * scale, ch);
      strip(x - bw, 0, -1, 1, edgeV, 9 * scale, ch);
    }
    const y = barY * scale;
    strip(0, y + bw, 1, 1, edgeH, cw, 9 * scale);
    strip(0, y - bw, 1, -1, edgeH, cw, 9 * scale);
    gx.restore();
  };

  const dripsFromWord = (n) => {
    const cands = [];
    for (let j = 0; j < gh - 1; j++) {
      for (let i = 0; i < gw; i++) {
        if (word[j * gw + i] > 0.6 && word[(j + 1) * gw + i] < 0.25) cands.push([i, j]);
      }
    }
    const k = sz();
    for (let n2 = 0; n2 < n && cands.length; n2++) {
      const [i, j] = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
      spawnDrop((i + 0.5) * cs, (j + 1) * cs, rnd(7, 10) * k, rnd(0, 1.2), rnd(160, 420) * k);
    }
  };
  const refog = () => {
    wipe.fill(0);
    drops.length = 0;
    if (gx) clearTrails();
    if (!RM && gx) seedDrops();
  };

  let prev = null;
  let accDist = 0;
  let held = false;
  let touching = false;
  const radius = (e) => (e.pointerType === "touch" ? 40 : held ? 58 : 38);
  const wipeTo = (x, y, rad) => {
    if (!prev || Math.hypot(x - prev.x, y - prev.y) > 220) {
      stamp(x, y, rad, 1.35, 0.8);
    } else {
      stampLine(prev.x, prev.y, x, y, rad, 1.35, 0.8);
      accDist += Math.hypot(x - prev.x, y - prev.y);
      while (accDist >= 130) {
        accDist -= 130;
        if (!RM) {
          const sx = x + rnd(-0.6, 0.6) * rad;
          const sy = y + rad * 1.25;
          if (sy > bladeY) spawnDrop(sx, sy, rnd(5.5, 9) * sz(), rnd(0.1, 0.7), rnd(120, 380));
        }
      }
    }
    prev = { x, y };
  };
  const onUi = (t) => !!(t && t.closest && t.closest("button, a"));
  const on = (el, type, fn, opts) => {
    el.addEventListener(type, fn, opts);
    offs.push(() => el.removeEventListener(type, fn, opts));
  };
  on(stage, "pointermove", (e) => {
    if (stillOnly || !ready) return;
    if (onUi(e.target) || (e.pointerType !== "touch" && e.target.closest && e.target.closest(".pm-final.is-live"))) {
      prev = null;
      return;
    }
    if (e.pointerType === "touch" && e.buttons === 0 && !touching) return;
    const r = stage.getBoundingClientRect();
    held = e.buttons > 0 && e.pointerType !== "touch";
    wipeTo(e.clientX - r.left, e.clientY - r.top, radius(e));
  }, { passive: true });
  on(stage, "pointerdown", (e) => {
    if (stillOnly || !ready || onUi(e.target)) return;
    const r = stage.getBoundingClientRect();
    if (e.pointerType === "touch") touching = true;
    held = e.pointerType !== "touch";
    prev = null;
    wipeTo(e.clientX - r.left, e.clientY - r.top, radius(e));
  }, { passive: true });
  const lift = () => {
    prev = null;
    held = false;
    touching = false;
  };
  on(stage, "pointerup", lift, { passive: true });
  on(stage, "pointercancel", lift, { passive: true });
  on(stage, "pointerleave", () => {
    prev = null;
  }, { passive: true });

  // Scroll geometry. The native scene owns the pin and the progress; the track is the scene node and the
  // sticky node is the nearest ancestor that sticks.
  let trackEl = null;
  let pinEl = null;
  const findScene = () => {
    if (trackEl && pinEl && trackEl.isConnected) return true;
    const m = globalThis.__formwebMotion;
    const key = m && m.sceneOf ? m.sceneOf(ctx.host) : null;
    if (!key) return false;
    const t = document.querySelector('[data-fw-node="' + key + '"]');
    if (!t) return false;
    let n = ctx.host;
    while (n && n !== t) {
      if (getComputedStyle(n).position === "sticky") break;
      n = n.parentElement;
    }
    trackEl = t;
    pinEl = n && n !== t ? n : ctx.host;
    return true;
  };
  const pinTop = () => parseFloat(getComputedStyle(pinEl).top) || 0;
  const totalScroll = () => trackEl.offsetHeight - pinEl.offsetHeight;
  const rawProgress = () => {
    if (!findScene()) return 0;
    const r = trackEl.getBoundingClientRect();
    return clamp((pinTop() - r.top) / Math.max(totalScroll(), 1));
  };
  const discrete = (p) => (p < 0.25 ? 0 : p < 0.75 ? 0.52 : 1);

  const cache = new Map();
  const put = (el, o, y, extra) => {
    const k = o.toFixed(3) + "|" + y.toFixed(1) + (extra || "");
    if (cache.get(el) === k) return;
    cache.set(el, k);
    el.style.opacity = o.toFixed(3);
    el.style.transform = (extra ? extra + " " : "") + (y === 0 ? "" : "translateY(" + y.toFixed(1) + "px)");
  };
  let finalLive = false;
  let hudLive = true;
  const applyScroll = (p) => {
    const h = (i) => ss(0.04 + 0.015 * i, 0.1 + 0.015 * i, p);
    const a = h(0);
    const b = h(1);
    const c = h(2);
    const d = h(3);
    put(l1, 1 - a, -20 * a);
    put(l2, 1 - b, -20 * b);
    put(subw, 1 - c, -20 * c);
    put(credit, 1 - c, -20 * c);
    put(dockw, 1 - d, -20 * d);
    const live = d < 0.98;
    if (live !== hudLive) {
      hudLive = live;
      dockw.toggleAttribute("inert", !live);
      dockw.style.pointerEvents = live ? "" : "none";
    }
    const bp = ss(0.1, 0.48, p);
    bladeY = lerp(-40, H + 40, bp);
    const vis = bp > 0 && bp < 1;
    put(sq, vis ? 1 : 0, 0, "translate3d(0," + bladeY.toFixed(1) + "px,0)");
    const inn = ss(0.16, 0.22, p);
    const out = ss(0.44, 0.49, p);
    put(note, inn * (1 - out), 14 * (1 - inn) - 14 * out, "translateX(-50%)");
    zoom = 1 + 0.35 * ss(0.55, 0.92, p);
    const u = clamp((p - 0.55) / 0.3);
    const e = u * u;
    frameO = 1 - e;
    frameS = 1 + 1.6 * e;
    const fk = e.toFixed(3);
    if (cache.get(frameEl) !== fk) {
      cache.set(frameEl, fk);
      frameEl.style.opacity = (1 - e).toFixed(3);
      frameEl.style.transform = "scale(" + (1 + 1.6 * e).toFixed(3) + ")";
    }
    const fo = ss(0.9, 0.97, p);
    put(fin, fo, 30 * (1 - fo));
    const fl = p >= 0.9;
    if (fl !== finalLive) {
      finalLive = fl;
      fin.classList.toggle("is-live", fl);
      fin.toggleAttribute("inert", !fl);
    }
  };

  let tween = null;
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const scrollTo = (y, dur, done) => {
    if (RM) {
      window.scrollTo(0, y);
      if (done) done();
      return;
    }
    tween = { y0: window.scrollY, y1: y, t0: performance.now(), dur, done };
  };
  const progY = (p) => {
    if (!findScene()) return window.scrollY;
    return trackEl.getBoundingClientRect().top + window.scrollY - pinTop() + p * totalScroll();
  };
  on(fogBtn, "click", refog);
  on(clearBtn, "click", () => scrollTo(progY(0.52), 2000));
  on(backBtn, "click", () =>
    scrollTo(progY(0), 2400, () => {
      refog();
      if (!RM) dripsFromWord(4);
    })
  );

  let pctT = 0;
  const buildMask = () => {
    const bladeRow = Math.floor(bladeY / cs);
    const f0 = wordStart < 0 ? 0 : wordProg;
    const front = wordMin + f0 * (wordMax - wordMin + 8);
    const d = maskData.data;
    const rd = rimData.data;
    let s = 0;
    for (let j = 0; j < gh; j++) {
      const above = j < bladeRow;
      const edge = j === bladeRow ? 0.95 : j === bladeRow + 1 ? 0.45 : 0;
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        let v = above ? 1 : wipe[k];
        const wv = word[k];
        if (wv > 0) {
          const t = wv * clamp((front - i) / 8);
          if (t > v) v = t;
        }
        v = v > 1 ? 1 : v;
        s += v;
        d[k * 4 + 3] = v * v * (3 - 2 * v) * 255;
        let b = 4 * v * (1 - v);
        b = b * b;
        if (edge > b && v < 0.5) b = edge;
        rd[k * 4 + 3] = b * 255;
      }
    }
    sum = s / (gw * gh);
    mctx.putImageData(maskData, 0, 0);
    rctx.putImageData(rimData, 0, 0);
  };

  const render = () => {
    const iw = still.naturalWidth || 1280;
    const ih = still.naturalHeight || 534;
    const pl = place(iw, ih, zoom);
    gx.globalCompositeOperation = "source-over";
    gx.globalAlpha = 1;
    const mp = place(mistCv.width, mistCv.height, zoom);
    gx.drawImage(mistCv, mp.x, mp.y, mp.w, mp.h);
    gx.globalAlpha = 0.85;
    gx.drawImage(rimCv, 0, 0, cw, ch);
    gx.globalAlpha = 0.8;
    gx.drawImage(trailRim, 0, 0);
    gx.globalAlpha = 1;
    mfx.globalCompositeOperation = "source-over";
    mfx.clearRect(0, 0, cw, ch);
    mfx.drawImage(maskCv, 0, 0, cw, ch);
    mfx.drawImage(trailCv, 0, 0);
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, cw, ch);
    lx.drawImage(still, pl.x, pl.y, pl.w, pl.h);
    lx.globalCompositeOperation = "destination-in";
    lx.drawImage(mfCv, 0, 0);
    gx.drawImage(layer, 0, 0);
    bx.globalCompositeOperation = "source-over";
    bx.clearRect(0, 0, cw, ch);
    bx.drawImage(beadStatic, 0, 0);
    bx.globalCompositeOperation = "destination-out";
    bx.drawImage(mfCv, 0, 0);
    gx.drawImage(bead, 0, 0);
    drawDrops(pl);
    gx.fillStyle = vignette;
    gx.fillRect(0, 0, cw, ch);
    glassFx();
  };

  let lastNow = 0;
  let ambT = rnd(0.9, 2.5);
  let ft = 0;
  let fcount = 0;
  let ps = 0;
  let announced = false;
  const frame = (now) => {
    if (destroyed) return;
    if (!lastNow) lastNow = now;
    const dt = clamp((now - lastNow) / 1000, 0, 0.05);
    const rawDt = now - lastNow;
    lastNow = now;
    if (tween) {
      const k = clamp((now - tween.t0) / tween.dur);
      window.scrollTo(0, lerp(tween.y0, tween.y1, easeIO(k)));
      if (k >= 1) {
        const dn = tween.done;
        tween = null;
        if (dn) dn();
      }
    }
    ps = RM ? discrete(rawProgress()) : ctx.progress();
    applyScroll(ps);
    if (!announced && started) {
      announced = true;
      ctx.ready();
    }
    if (stillOnly || !gx || !ready || document.hidden || !ctx.visible()) return;
    if (wordStart < 0) wordStart = now;
    if (!wordDone) {
      const tt = (now - wordStart) / 1000;
      const dur = RM ? 0.01 : 2.4;
      const delay = RM ? 0 : 0.5;
      const k = clamp((tt - delay) / dur);
      wordProg = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (k >= 1) {
        wordDone = true;
        if (!RM) dripsFromWord(5);
      }
    }
    for (let i = 0; i < wipe.length; i++) {
      const v = wipe[i];
      if (v > 0) {
        const n = v - (RM ? 0.08 : 0.13) * dt;
        wipe[i] = n > 0 ? n : 0;
      }
    }
    if (!RM) {
      ambT -= dt;
      if (ambT <= 0) {
        ambT = rnd(0.5, 1.5);
        if (drops.length < Math.floor(38 * q)) spawnFog();
      }
      stepDrops(dt);
    } else stepDrops(0);
    buildMask();
    render();
    if (now - pctT > 250) {
      pctT = now;
      const t = String(Math.round(sum * 100)).padStart(2, "0") + "%";
      if (pctEl.textContent !== t) pctEl.textContent = t;
    }
    if (!RM) {
      ft += rawDt;
      fcount++;
      if (fcount % 30 === 0) {
        const avg = ft / 30;
        ft = 0;
        const nq = avg > 40 ? Math.max(0.6, q - 0.15) : avg < 20 ? Math.min(1, q + 0.05) : q;
        if (Math.abs(nq - q) > 0.01) {
          q = nq;
          sizeCanvases();
        }
      }
    }
  };

  const loaded = () =>
    new Promise((res, rej) => {
      if (still.complete && still.naturalWidth) res();
      else {
        still.addEventListener("load", res, { once: true });
        still.addEventListener("error", rej, { once: true });
      }
    });

  let started = false;
  const start = async () => {
    try {
      await Promise.race([document.fonts.load("700 40px " + fontStack()), new Promise((r) => timers.push(setTimeout(r, 2000)))]);
    } catch (e) {}
    if (destroyed) return;
    let ok = true;
    try {
      await loaded();
      gx = glass.getContext("2d", { alpha: false });
      if (!gx) ok = false;
    } catch (e) {
      ok = false;
    }
    if (destroyed) return;
    if (!ok) {
      stillOnly = true;
      toStill();
    } else {
      buildMist();
      buildSprite();
    }
    lastW = 0;
    onResize();
    if (!stillOnly) {
      ready = true;
      loader.hidden = true;
      fogBtn.disabled = false;
    }
    started = true;
  };

  offs.push(ctx.onResize(onResize));
  offs.push(ctx.onFrame(frame));
  still.src = ctx.asset(text("still", ""));
  if (RM) stage.classList.add("pm-in");
  else timers.push(setTimeout(() => stage.classList.add("pm-in"), 150));
  start();

  return () => {
    destroyed = true;
    for (const t of timers) clearTimeout(t);
    for (const off of offs) {
      try {
        off();
      } catch (e) {}
    }
    style.remove();
    stage.remove();
  };
}
