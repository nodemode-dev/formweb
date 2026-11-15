// Scripted desktop (C17): icons, draggable windows, a taskbar and an assistant whose fake pointer does what it is asked.
// Ported from the FormSurface prompt section. Every colour, size and curve reads a token with a fallback.

const MEDIA = "https://media.formai.studio/media/formsurface/";

const STRINGS = {
  layers: "Layers",
  captures: "Captures",
  turntable: "Turntable",
  exports: "Exports",
  bin: "Bin",
  layersAria: "Layers, display only",
  capturesAria: "Captures, double click to open",
  turntableAria: "Turntable, double click to open",
  exportsAria: "Exports, display only",
  binFullAria: "Bin, full, double click to empty",
  binEmptyAria: "Bin, empty",
  badge: "3",
  deskTitle: " desk",
  assistantLabel: "Assistant",
  minimise: "Minimise",
  maximise: "Maximise",
  close: "Close",
  conversation: "Conversation",
  askLabel: "Ask the desk",
  askPlaceholder: "Ask for something to be done",
  send: "Send",
  suggestionsLabel: "Suggestions",
  start: "Start",
  taskDesk: "Desk",
  taskCaptures: "Captures",
  taskTurntable: "Turntable",
  capturesTitle: "Captures",
  turntableTitle: "Turntable",
  playLabel: "Play or pause the turntable",
  trackTitle: "Knot, base colour",
  trackSub: "One turn every 2.4 s",
  frameLabel: "A demo desktop with an assistant",
  discAlt: "A painted knot model from FormSurface, turning"
};

const REPLIES = {
  hello: "Ask me to tidy the desk, show captures, empty the bin or spin the turntable.",
  tidyStart: "Tidying the desk. Watch the pointer.",
  tidyDone: "All tidy. Four icons sit in the left column and the bin is at bottom right.",
  picsStart: "Opening Captures from the FormSurface app.",
  picsDone: "Three captures are on show. Drag the window by its title bar, or close it.",
  binEmpty: "The bin is empty now.",
  binAlready: "The bin is already empty, so there is nothing to do.",
  musicStart: "Starting the turntable.",
  musicDone: "The turntable is turning. Press the square button in its window to pause it.",
  resetDone: "Everything is back where it started, and the bin is full again.",
  other: "I can tidy the desk, show captures, empty the bin or spin the turntable. Try one of those.",
  layersOnly: "Layers is display only. Captures and the turntable both work.",
  exportsOnly: "Exports is display only. Captures and the turntable both work."
};

const SUGGESTIONS = [
  { label: "Tidy the desk", intent: "tidy" },
  { label: "Show captures", intent: "pics" },
  { label: "Empty the bin", intent: "bin" },
  { label: "Spin the turntable", intent: "music" }
];

const PATTERNS = {
  tidy: "tidy|clean|organi[sz]e|arrange|sort",
  pics: "picture|image|album|capture|photo",
  bin: "trash|bin|recycle|empty|delete",
  music: "music|song|play|tune|turntable|spin",
  reset: "mess|scatter|undo|reset"
};

const THUMBS = [
  { dark: MEDIA + "ui-viewport/a67b2d698097.w1024.webp", light: MEDIA + "ui-viewport-light/9e98bb3e5371.w1024.webp", alt: "A model in the FormSurface viewport, close on the left", altLight: "A model in the FormSurface viewport in the light theme, close on the left", origin: "18% 30%", w: 1024, h: 640 },
  { dark: MEDIA + "ui-viewport/a67b2d698097.w1024.webp", light: MEDIA + "ui-viewport-light/9e98bb3e5371.w1024.webp", alt: "The centre of the FormSurface viewport", altLight: "The centre of the FormSurface viewport in the light theme", origin: "50% 55%", w: 1024, h: 640 },
  { dark: MEDIA + "ui-viewport/a67b2d698097.w1024.webp", light: MEDIA + "ui-viewport-light/9e98bb3e5371.w1024.webp", alt: "The lower right of the FormSurface viewport", altLight: "The lower right of the FormSurface viewport in the light theme", origin: "84% 70%", w: 1024, h: 640 }
];

const MEDIA_DEFAULT = {
  capturesIconDark: MEDIA + "ui-layers/71f86adee225.w1024.webp",
  capturesIconLight: MEDIA + "ui-layers-light/210d57208743.w1024.webp",
  capturesIconW: 1024,
  capturesIconH: 640,
  knot: MEDIA + "ui-knot-2/7978aafbac31.w1024.webp",
  knotW: 1024,
  knotH: 576,
  knotAlt: "A painted knot model from FormSurface, turning",
  thumbs: THUMBS
};

const INIT = { docs: [4, 7], pics: [15, 44], music: [79, 34], mail: [5, 64], bin: [89, 7] };
const TIDY = { docs: [3, 6], pics: [3, 28], music: [3, 50], mail: [3, 72], bin: [90, 72] };
const ORDER = ["docs", "pics", "music", "mail", "bin"];

const CSS = `
.fwc-sd {
  --sd-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --sd-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --sd-ground: var(--ground, #14161b);
  --sd-pane: var(--pane, #1b1e25);
  --sd-float: var(--float, #242833);
  --sd-control: var(--control, #2b303c);
  --sd-ink: var(--ink, #eef0f4);
  --sd-soft: var(--ink-soft, #a4aab8);
  --sd-faint: var(--ink-faint, #6b7283);
  --sd-on: var(--on-ink, #14161b);
  --sd-edge: var(--edge, rgb(255 255 255 / 0.09));
  --sd-edge2: var(--edge-strong, rgb(255 255 255 / 0.18));
  --sd-mono: var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  --sd-out: var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  --sd-dur: var(--dur, 240ms);
  --sd-fast: var(--dur-fast, 140ms);
  --sd-s1: var(--sp-1, 4px);
  --sd-s2: var(--sp-2, 8px);
  --sd-s3: var(--sp-3, 12px);
  --sd-s4: var(--sp-4, 16px);
  --sd-shadow: var(--shadow-window, 0 1px 1px rgb(0 0 0 / 0.3), 0 28px 64px -28px rgb(0 0 0 / 0.8));
  --sd-z-base: var(--z-base, 0);
  --sd-z-raised: var(--z-raised, 100);
  --sd-z-drop: var(--z-dropdown, 400);
  --sd-z-over: var(--z-overlay, 600);
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  color: var(--sd-soft);
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: var(--fs-m, 1rem);
  line-height: 1.55;
  box-sizing: border-box;
}
.fwc-sd *, .fwc-sd *::before, .fwc-sd *::after { box-sizing: border-box; }
.fwc-sd p, .fwc-sd ul, .fwc-sd figure { margin: 0; padding: 0; }
.fwc-sd ul { list-style: none; }
.fwc-sd button, .fwc-sd input { font: inherit; }
.fwc-sd img { display: block; max-width: none; }
.fwc-sd .sd-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.fwc-sd[data-mode="light"] .sd-dark, .fwc-sd:not([data-mode="light"]) .sd-light { display: none !important; }
.fwc-sd .sd-form { color: var(--sd-ink); }
.fwc-sd .sd-suffix { color: var(--sd-hue); }
.fwc-sd .sd-field { position: relative; flex: 1 1 auto; min-height: 0; touch-action: pan-y; }
.fwc-sd .sd-ico {
  position: absolute; display: flex; flex-direction: column; align-items: center; gap: 6px;
  width: 84px; padding: 6px 4px; border: 1px solid transparent; background: transparent; color: var(--sd-soft);
  cursor: grab; touch-action: none; user-select: none;
  transition: left 0.55s var(--sd-ease), top 0.55s var(--sd-ease), transform 0.25s var(--sd-out), background-color var(--sd-fast), border-color var(--sd-fast);
}
.fwc-sd .sd-ico:hover { border-color: var(--sd-edge); background: color-mix(in srgb, var(--sd-ink) 6%, transparent); }
.fwc-sd .sd-ico:focus-visible { outline: 2px solid var(--sd-hue); outline-offset: 1px; }
.fwc-sd .sd-ico.sd-drag { transition: transform 0.25s var(--sd-out); cursor: grabbing; }
.fwc-sd .sd-ico.sd-lift { z-index: var(--sd-z-drop); transform: scale(1.1) rotate(-3deg); }
.fwc-sd .sd-ico.sd-lift .sd-gl { box-shadow: var(--sd-shadow); }
.fwc-sd .sd-gl { position: relative; display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid var(--sd-edge2); background: var(--sd-float); color: var(--sd-ink); }
.fwc-sd .sd-gl img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fwc-sd .sd-gl svg { width: 24px; height: 24px; }
.fwc-sd .sd-gl-sq { transform-origin: 50% 100%; }
.fwc-sd .sd-squash { animation: sd-squash 0.7s var(--sd-out); }
.fwc-sd .sd-ico[data-full="0"] .sd-full, .fwc-sd .sd-ico[data-full="1"] .sd-empty { display: none; }
.fwc-sd .sd-lb { font-family: var(--sd-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
.fwc-sd .sd-badge { position: absolute; top: 2px; right: 12px; min-width: 18px; padding: 0 4px; background: var(--sd-hue); color: var(--sd-on); font-family: var(--sd-mono); font-size: 10px; line-height: 18px; text-align: center; }
.fwc-sd .sd-bit { position: absolute; top: 21px; left: calc(50% - 4px); width: 8px; height: 8px; background: var(--sd-ink); opacity: 0; pointer-events: none; }
.fwc-sd .sd-bursting .sd-bit { animation: sd-bit 0.7s var(--sd-out) var(--d) both; }
.fwc-sd .sd-win {
  --sd-n: 0;
  position: absolute; z-index: calc(var(--sd-z-raised) + var(--sd-n)); display: flex; flex-direction: column;
  border: 1px solid var(--sd-edge2); border-radius: 12px; background: var(--sd-float); box-shadow: var(--sd-shadow); overflow: hidden;
  opacity: 0; visibility: hidden; transform: scale(0.6);
  transition: transform 0.5s var(--sd-spring), opacity 0.5s var(--sd-out), visibility 0s linear 0.5s;
}
.fwc-sd .sd-win[data-state="open"] { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
.fwc-sd .sd-ai {
  --w: min(420px, calc(100% - 24px));
  top: 7%; left: calc(50% - var(--w) / 2); width: var(--w); min-width: 280px; transform-origin: 50% 100%;
  transition: transform 0.55s var(--sd-ease), opacity 0.55s var(--sd-out), visibility 0s linear 0.55s;
}
.fwc-sd .sd-ai[data-state="min"] { transform: translateY(120%) scale(0.2); }
.fwc-sd .sd-ai[data-state="closed"] { transform: scale(0.8); }
.fwc-sd .sd-pic { top: 12%; right: 4%; width: min(300px, 40%); }
.fwc-sd .sd-mus { top: 50%; right: 4%; width: min(290px, 44%); }
.fwc-sd .sd-win[data-max] { position: fixed; inset: calc(var(--bar-h, 64px) + 8px) 8px 8px 8px; z-index: var(--sd-z-over); width: auto; height: auto; translate: none !important; transition-duration: 0.4s; }
.fwc-sd .sd-wt {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sd-s3); min-height: 34px; padding: 0 var(--sd-s2) 0 var(--sd-s3);
  border-bottom: 1px solid var(--sd-edge); color: var(--sd-ink); font-family: var(--sd-mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  cursor: grab; touch-action: none; user-select: none;
  transition: opacity var(--sd-dur) var(--sd-out), filter var(--sd-dur) var(--sd-out);
}
.fwc-sd .sd-win:not([data-active]) .sd-wt { opacity: 0.6; filter: saturate(0); }
.fwc-sd .sd-wc { display: flex; gap: 2px; }
.fwc-sd .sd-wc button { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: var(--sd-soft); cursor: pointer; }
.fwc-sd .sd-wc button:hover { background: var(--sd-control); color: var(--sd-ink); }
.fwc-sd .sd-wc button:focus-visible, .fwc-sd .sd-btn:focus-visible, .fwc-sd .sd-chips button:focus-visible, .fwc-sd .sd-in input:focus-visible, .fwc-sd .sd-tasks button:focus-visible { outline: 2px solid var(--sd-hue); outline-offset: 1px; }
.fwc-sd .sd-wc svg { width: 12px; height: 12px; }
.fwc-sd .sd-body { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; gap: var(--sd-s3); padding: var(--sd-s3); }
.fwc-sd .sd-log { display: flex; flex-direction: column; flex: 1 1 auto; gap: var(--sd-s2); height: 124px; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.fwc-sd .sd-win[data-max] .sd-log { height: auto; }
.fwc-sd .sd-m { max-width: 86%; padding: var(--sd-s2) var(--sd-s3); border: 1px solid var(--sd-edge); color: var(--sd-soft); font-size: var(--fs-s, 0.875rem); line-height: 1.4; animation: sd-rise 0.4s var(--sd-ease) backwards; }
.fwc-sd .sd-m.sd-user { align-self: flex-end; border-color: var(--sd-hue); color: var(--sd-ink); }
.fwc-sd .sd-typing { display: flex; gap: 4px; width: fit-content; }
.fwc-sd .sd-typing i { width: 5px; height: 5px; border-radius: 50%; background: var(--sd-soft); animation: sd-dots 1s ease-in-out infinite; }
.fwc-sd .sd-typing i:nth-child(2) { animation-delay: 0.15s; }
.fwc-sd .sd-typing i:nth-child(3) { animation-delay: 0.3s; }
.fwc-sd .sd-in { display: flex; gap: var(--sd-s2); }
.fwc-sd .sd-in input { flex: 1 1 auto; min-width: 0; height: 36px; padding: 0 var(--sd-s3); border: 0; border-bottom: 1px solid var(--sd-edge2); border-radius: 0; background: transparent; color: var(--sd-ink); font-size: var(--fs-s, 0.875rem); }
.fwc-sd .sd-in input::placeholder { color: var(--sd-faint); }
.fwc-sd .sd-in input:focus { border-color: var(--sd-hue); }
.fwc-sd .sd-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: var(--sd-s2); height: 36px; padding: 0 var(--sd-s4); border: 0; border-radius: 0;
  background: var(--sd-ink); color: var(--sd-on); font-family: var(--sd-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; overflow: hidden; cursor: pointer;
  transition: transform var(--sd-dur) var(--sd-out), filter var(--sd-dur) var(--sd-out), opacity var(--sd-dur) var(--sd-out);
}
.fwc-sd .sd-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, color-mix(in srgb, var(--sd-on) 30%, transparent) 50%, transparent 65%); transform: translateX(-120%); pointer-events: none; }
.fwc-sd .sd-btn:hover:not(:disabled) { transform: translateY(-1px) scale(1.04); filter: brightness(1.08); }
.fwc-sd .sd-btn:hover:not(:disabled)::after { transform: translateX(120%); transition: transform 0.75s var(--sd-out); }
.fwc-sd .sd-btn:active:not(:disabled) { transform: scale(0.95); }
.fwc-sd .sd-btn:disabled, .fwc-sd .sd-chips button:disabled, .fwc-sd .sd-in input:disabled { opacity: 0.45; filter: saturate(0.4); cursor: default; }
.fwc-sd .sd-chips { display: flex; flex-wrap: wrap; gap: var(--sd-s2); }
.fwc-sd .sd-chips li { padding: 0; border: 1px solid color-mix(in srgb, var(--sd-hue) 42%, transparent); border-radius: 0; color: var(--sd-hue); font-family: var(--sd-mono); font-size: var(--fs-xs, 0.8125rem); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; }
.fwc-sd .sd-chips button { padding: var(--sd-s1) var(--sd-s3); border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; transition: transform var(--sd-dur) var(--sd-out), background-color var(--sd-dur) var(--sd-out); }
.fwc-sd .sd-chips button:hover:not(:disabled) { transform: translateY(-2px); background: color-mix(in srgb, var(--sd-hue) 12%, transparent); }
.fwc-sd .sd-pics { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sd-s2); padding: var(--sd-s3); }
.fwc-sd .sd-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid var(--sd-edge); transition: transform 0.3s var(--sd-spring); }
.fwc-sd .sd-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scale(2.2); transform-origin: var(--o); }
.fwc-sd .sd-thumb:hover { z-index: var(--sd-z-base); transform: scale(1.12) rotate(-3deg); }
.fwc-sd .sd-win[data-state="open"] .sd-thumb { animation: sd-pop 0.5s var(--sd-spring) calc(var(--i) * 90ms + 0.2s) backwards; }
.fwc-sd .sd-deck { display: grid; grid-template-columns: 64px 1fr; gap: var(--sd-s3); padding: var(--sd-s3); }
.fwc-sd .sd-disc { position: relative; width: 64px; height: 64px; border: 1px solid var(--sd-edge2); border-radius: 50%; overflow: hidden; animation: sd-spin 2.4s linear infinite; animation-play-state: paused; }
.fwc-sd .sd-disc img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fwc-sd .sd-disc::after { content: ""; position: absolute; inset: calc(50% - 5px); border: 1px solid var(--sd-edge2); border-radius: 50%; background: var(--sd-ground); }
.fwc-sd .sd-mus[data-playing] .sd-disc, .fwc-sd .sd-mus[data-playing] .sd-eq i { animation-play-state: running; }
.fwc-sd.sd-idle .sd-disc, .fwc-sd.sd-idle .sd-eq i, .fwc-sd.sd-idle .sd-dot, .fwc-sd.sd-idle .sd-typing i { animation-play-state: paused !important; }
.fwc-sd .sd-trk { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; font-size: var(--fs-s, 0.875rem); }
.fwc-sd .sd-trk b { color: var(--sd-ink); font-weight: var(--weight-strong, 560); }
.fwc-sd .sd-trk span { color: var(--sd-soft); font-size: var(--fs-xs, 0.8125rem); }
.fwc-sd .sd-eq { grid-column: 1 / -1; display: flex; align-items: flex-end; gap: 3px; height: 34px; }
.fwc-sd .sd-eq i { flex: 1 1 0; height: 15%; background: var(--sd-hue); animation: sd-eq 0.9s ease-in-out calc(var(--i) * 0.13s) infinite alternate; animation-play-state: paused; }
.fwc-sd .sd-play { grid-column: 1 / -1; justify-self: start; }
.fwc-sd .sd-play .sd-pa, .fwc-sd .sd-mus[data-playing] .sd-play .sd-pl { display: none; }
.fwc-sd .sd-mus[data-playing] .sd-play .sd-pa { display: block; }
.fwc-sd .sd-play svg { width: 12px; height: 12px; }
.fwc-sd .sd-ptr { position: absolute; z-index: var(--sd-z-over); top: 85%; left: 50%; width: 0; height: 0; opacity: 0; pointer-events: none; transition: left 0.6s var(--sd-ease), top 0.6s var(--sd-ease), opacity 0.3s var(--sd-out); }
.fwc-sd .sd-ptr[data-on] { opacity: 1; }
.fwc-sd .sd-ptr svg { position: absolute; top: 0; left: 0; width: 18px; height: 18px; color: var(--sd-ink); filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.5)); }
.fwc-sd .sd-ptag { position: absolute; top: 18px; left: 18px; padding: 2px 6px; background: var(--sd-pane); border: 1px solid var(--sd-edge2); font-family: var(--sd-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
.fwc-sd .sd-ring { position: absolute; top: -14px; left: -14px; width: 28px; height: 28px; border: 2px solid var(--sd-hue); border-radius: 50%; opacity: 0; }
.fwc-sd .sd-click .sd-ring { animation: sd-ring 0.45s var(--sd-out); }
.fwc-sd .sd-task { display: flex; align-items: center; gap: var(--sd-s2); flex: none; height: 40px; padding: 0 var(--sd-s2); border-top: 1px solid var(--sd-edge2); background: var(--sd-pane); }
.fwc-sd .sd-task .sd-btn { height: 28px; }
.fwc-sd .sd-tasks { display: flex; flex: 1 1 auto; gap: var(--sd-s2); min-width: 0; }
.fwc-sd .sd-tasks button { height: 28px; padding: 0 var(--sd-s3); border: 1px solid var(--sd-edge2); border-radius: 0; background: transparent; color: var(--sd-soft); font-family: var(--sd-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
.fwc-sd .sd-tasks button[hidden] { display: none; }
.fwc-sd .sd-tasks button:hover { background: var(--sd-control); color: var(--sd-ink); }
.fwc-sd .sd-tasks button[data-on] { border-color: var(--sd-hue); color: var(--sd-ink); }
.fwc-sd .sd-tray { display: flex; align-items: center; gap: var(--sd-s3); padding-right: var(--sd-s2); color: var(--sd-soft); font-family: var(--sd-mono); font-size: 11px; letter-spacing: 0.1em; }
.fwc-sd .sd-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sd-hue); animation: sd-pulse 2s ease-in-out infinite; }
.fwc-sd .sd-clock { display: inline-block; min-width: 5ch; font-variant-numeric: tabular-nums; }
@keyframes sd-rise { from { opacity: 0; transform: translateY(18px); } }
@keyframes sd-pop { from { opacity: 0; transform: scale(0.5); } }
@keyframes sd-spin { to { transform: rotate(360deg); } }
@keyframes sd-eq { to { height: 95%; } }
@keyframes sd-ring { from { opacity: 1; transform: scale(0.3); } to { opacity: 0; transform: scale(1.6); } }
@keyframes sd-squash { 30% { transform: scale(1.25, 0.85); } 60% { transform: scale(0.9, 1.15); } }
@keyframes sd-bit { from { opacity: 1; transform: rotate(var(--a)) translateX(120px) scale(1); } to { opacity: 0; transform: rotate(var(--a)) translateX(0) scale(0); } }
@keyframes sd-dots { 50% { opacity: 0.25; } }
@keyframes sd-pulse { 50% { opacity: 0.35; } }
@media (max-width: 719px) {
  .fwc-sd .sd-chips li { font-size: 11px; letter-spacing: 0.04em; }
  .fwc-sd .sd-ai { --w: calc(100% - 24px); top: 4%; min-width: 0; }
  .fwc-sd .sd-pic, .fwc-sd .sd-mus { left: 15%; right: auto; width: 70%; }
  .fwc-sd .sd-pic { top: 20%; }
  .fwc-sd .sd-mus { top: 30%; }
  .fwc-sd .sd-ico { width: 66px; }
  .fwc-sd .sd-gl { width: 38px; height: 38px; }
  .fwc-sd .sd-bit { top: 17px; }
}
@media (prefers-reduced-motion: reduce) {
  .fwc-sd *, .fwc-sd *::before, .fwc-sd *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; transition-delay: 0s !important; }
}
.fwc-sd.sd-reduced *, .fwc-sd.sd-reduced *::before, .fwc-sd.sd-reduced *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; transition-delay: 0s !important; }
`;

const esc = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const merge = (base, extra) => {
  const out = Object.assign({}, base);
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const key of Object.keys(extra)) {
      if (extra[key] !== undefined && extra[key] !== null && extra[key] !== "") out[key] = extra[key];
    }
  }
  return out;
};

const SV = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const WV = 'viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"';

export function mount(root, props, ctx) {
  const P = props || {};
  const S = merge(STRINGS, P.strings);
  const T = merge(REPLIES, P.replies);
  const M = merge(MEDIA_DEFAULT, P.media);
  const thumbs = Array.isArray(M.thumbs) && M.thumbs.length ? M.thumbs : THUMBS;
  const chipsList = Array.isArray(P.suggestions) && P.suggestions.length ? P.suggestions : SUGGESTIONS;
  const patternSrc = merge(PATTERNS, P.patterns);
  const patterns = {};
  for (const key of Object.keys(PATTERNS)) {
    try {
      patterns[key] = new RegExp(patternSrc[key], "i");
    } catch (e) {
      patterns[key] = new RegExp(PATTERNS[key], "i");
    }
  }
  const form1 = esc(P.brandForm ?? "Form");
  const suffix1 = esc(P.brandSuffix ?? "Surface");
  const accent = typeof P.accent === "string" && P.accent ? P.accent : "var(--hue)";
  const url = (path) => esc(ctx.asset(path));
  const brand = '<span class="sd-form">' + form1 + '</span><span class="sd-suffix">' + suffix1 + "</span>";

  const style = document.createElement("style");
  style.textContent = CSS;
  const desk = document.createElement("div");
  desk.className = "fwc-sd";
  desk.style.setProperty("--sd-hue", accent);
  desk.setAttribute("data-mode", ctx.theme());
  if (ctx.reduced) desk.classList.add("sd-reduced");

  const thumbHtml = thumbs
    .map((t, i) => {
      const alt = t.alt || "";
      return (
        '<figure class="sd-thumb" style="--i:' + i + ";--o:" + esc(t.origin || "50% 50%") + '">' +
        '<img class="sd-dark" src="' + url(t.dark) + '" width="' + esc(t.w || 1024) + '" height="' + esc(t.h || 640) + '" alt="' + esc(alt) + '" decoding="async" loading="lazy">' +
        '<img class="sd-light" src="' + url(t.light || t.dark) + '" width="' + esc(t.w || 1024) + '" height="' + esc(t.h || 640) + '" alt="' + esc(t.altLight || alt) + '" decoding="async" loading="lazy">' +
        "</figure>"
      );
    })
    .join("");
  const eqHtml = Array.from({ length: 14 }, (_, i) => '<i style="--i:' + i + '"></i>').join("");
  const wcMax = '<button type="button" data-act="max" aria-label="' + esc(S.maximise) + '"><svg ' + WV + '><path d="M2.5 2.5h7v7h-7z"/></svg></button>';
  const wcClose = '<button type="button" data-act="close" aria-label="' + esc(S.close) + '"><svg ' + WV + '><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg></button>';
  const wcMin = '<button type="button" data-act="min" aria-label="' + esc(S.minimise) + '"><svg ' + WV + '><path d="M2.5 9h7"/></svg></button>';

  desk.innerHTML =
    '<div class="sd-field" role="group" aria-label="' + esc(S.frameLabel) + '">' +
    '<button class="sd-ico" type="button" data-ico="docs" aria-label="' + esc(S.layersAria) + '"><span class="sd-gl"><svg ' + SV + '><path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/></svg></span><span class="sd-lb">' + esc(S.layers) + "</span></button>" +
    '<button class="sd-ico" type="button" data-ico="pics" aria-label="' + esc(S.capturesAria) + '"><span class="sd-gl"><img class="sd-dark" src="' + url(M.capturesIconDark) + '" width="' + esc(M.capturesIconW) + '" height="' + esc(M.capturesIconH) + '" alt="" decoding="async" loading="lazy"><img class="sd-light" src="' + url(M.capturesIconLight) + '" width="' + esc(M.capturesIconW) + '" height="' + esc(M.capturesIconH) + '" alt="" decoding="async" loading="lazy"></span><span class="sd-lb">' + esc(S.captures) + "</span></button>" +
    '<button class="sd-ico" type="button" data-ico="music" aria-label="' + esc(S.turntableAria) + '"><span class="sd-gl"><img src="' + url(M.knot) + '" width="' + esc(M.knotW) + '" height="' + esc(M.knotH) + '" alt="" decoding="async" loading="lazy"></span><span class="sd-lb">' + esc(S.turntable) + "</span></button>" +
    '<button class="sd-ico" type="button" data-ico="mail" aria-label="' + esc(S.exportsAria) + '"><span class="sd-gl"><svg ' + SV + '><path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M4 15v4h16v-4"/></svg></span><span class="sd-badge">' + esc(S.badge) + '</span><span class="sd-lb">' + esc(S.exports) + "</span></button>" +
    '<button class="sd-ico" type="button" data-ico="bin" data-full="1" aria-label="' + esc(S.binFullAria) + '"><span class="sd-gl sd-gl-sq"><svg ' + SV + '><path d="M5 7h14"/><path d="M9 7V4h6v3"/><path d="M7 7l1 13h8l1-13"/><path class="sd-full" d="M10 11v6M14 11v6"/></svg></span><span class="sd-lb">' + esc(S.bin) + "</span></button>" +
    '<div class="sd-win sd-ai" data-win="ai" data-state="open" data-active role="dialog" aria-label="' + esc(S.assistantLabel) + '">' +
    '<div class="sd-wt"><span>' + brand + esc(S.deskTitle) + '</span><span class="sd-wc">' + wcMin + wcMax + wcClose + "</span></div>" +
    '<div class="sd-body"><div class="sd-log" role="log" aria-live="polite" aria-label="' + esc(S.conversation) + '"></div>' +
    '<form class="sd-in" autocomplete="off"><label class="sd-sr">' + esc(S.askLabel) + '</label><input type="text" aria-label="' + esc(S.askLabel) + '" placeholder="' + esc(S.askPlaceholder) + '"><button class="sd-btn sd-send" type="submit">' + esc(S.send) + "</button></form>" +
    '<ul class="sd-chips" aria-label="' + esc(S.suggestionsLabel) + '">' +
    chipsList.map((c, i) => '<li><button type="button" data-i="' + i + '">' + esc(c.label) + "</button></li>").join("") +
    "</ul></div></div>" +
    '<div class="sd-win sd-pic" data-win="pic" data-state="closed" role="dialog" aria-label="' + esc(S.capturesTitle) + '"><div class="sd-wt"><span>' + esc(S.capturesTitle) + '</span><span class="sd-wc">' + wcMax + wcClose + '</span></div><div class="sd-pics">' + thumbHtml + "</div></div>" +
    '<div class="sd-win sd-mus" data-win="mus" data-state="closed" role="dialog" aria-label="' + esc(S.turntableTitle) + '"><div class="sd-wt"><span>' + esc(S.turntableTitle) + '</span><span class="sd-wc">' + wcMax + wcClose + "</span></div>" +
    '<div class="sd-deck"><div class="sd-disc"><img src="' + url(M.knot) + '" width="' + esc(M.knotW) + '" height="' + esc(M.knotH) + '" alt="' + esc(M.knotAlt || S.discAlt) + '" decoding="async" loading="lazy"></div>' +
    '<p class="sd-trk"><b>' + esc(S.trackTitle) + "</b><span>" + esc(S.trackSub) + '</span></p><div class="sd-eq" aria-hidden="true">' + eqHtml + "</div>" +
    '<button class="sd-btn sd-play" type="button" aria-pressed="false" aria-label="' + esc(S.playLabel) + '"><svg class="sd-pl" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 2l7 4-7 4z" fill="currentColor"/></svg><svg class="sd-pa" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor"/></svg></button></div></div>' +
    '<div class="sd-ptr" aria-hidden="true"><svg viewBox="0 0 18 18"><path d="M3 2l12 6-5 1.5L8 15z" fill="currentColor" stroke="var(--sd-ground)" stroke-width="1"/></svg><i class="sd-ring"></i><span class="sd-ptag">' + brand + "</span></div>" +
    "</div>" +
    '<div class="sd-task"><button class="sd-btn sd-start" type="button">' + esc(S.start) + "</button>" +
    '<div class="sd-tasks"><button type="button" data-task="ai" data-on>' + esc(S.taskDesk) + '</button><button type="button" data-task="pic" hidden>' + esc(S.taskCaptures) + '</button><button type="button" data-task="mus" hidden>' + esc(S.taskTurntable) + "</button></div>" +
    '<div class="sd-tray"><span class="sd-dot" aria-hidden="true"></span><time class="sd-clock">00:00</time></div></div>';

  root.append(style, desk);

  const $ = (s, r = desk) => r.querySelector(s);
  const $$ = (s, r = desk) => [...r.querySelectorAll(s)];
  const dead = { v: false };
  const timers = new Set();
  const wait = (ms) =>
    new Promise((res) => {
      if (dead.v) return;
      const id = setTimeout(() => {
        timers.delete(id);
        res();
      }, ctx.reduced ? 0 : ms);
      timers.add(id);
    });

  const field = $(".sd-field");
  const ptr = $(".sd-ptr");
  const log = $(".sd-log");
  const form = $(".sd-in");
  const input = $(".sd-in input");
  const send = $(".sd-send");
  const chips = $$(".sd-chips button");
  const clock = $(".sd-clock");
  const WINS = { ai: $(".sd-ai"), pic: $(".sd-pic"), mus: $(".sd-mus") };
  const TASKS = {};
  for (const b of $$("[data-task]")) TASKS[b.dataset.task] = b;
  const icons = {};
  const pos = {};
  let running = false;
  let binFull = true;
  let drag = null;
  let zc = 10;
  let typing = null;

  const setPos = (id, x, y) => {
    pos[id] = [x, y];
    icons[id].style.left = x + "%";
    icons[id].style.top = y + "%";
  };
  for (const el of $$("[data-ico]")) icons[el.dataset.ico] = el;
  for (const id of ORDER) setPos(id, INIT[id][0], INIT[id][1]);

  const say = (who, text) => {
    const m = document.createElement("p");
    m.className = "sd-m sd-" + who;
    m.textContent = text;
    if (typing && typing.isConnected) typing.before(m);
    else log.append(m);
    const all = $$(".sd-m:not(.sd-typing)", log);
    while (all.length > 6) all.shift().remove();
    log.scrollTop = log.scrollHeight;
  };
  const showTyping = () => {
    typing = document.createElement("p");
    typing.className = "sd-m sd-bot sd-typing";
    typing.setAttribute("aria-hidden", "true");
    typing.innerHTML = "<i></i><i></i><i></i>";
    log.append(typing);
    log.scrollTop = log.scrollHeight;
  };
  const hideTyping = () => {
    if (typing) typing.remove();
    typing = null;
  };
  const busy = (on) => {
    input.disabled = on;
    send.disabled = on;
    for (const c of chips) c.disabled = on;
  };

  const raise = (win) => {
    win.style.setProperty("--sd-n", String(++zc));
    for (const w of Object.values(WINS)) {
      if (w === win) w.setAttribute("data-active", "");
      else w.removeAttribute("data-active");
    }
  };
  const syncTasks = () => {
    for (const [id, b] of Object.entries(TASKS)) {
      const st = WINS[id].dataset.state;
      if (id !== "ai") b.hidden = st === "closed";
      if (id === "ai") b.hidden = false;
      if (st === "open") b.setAttribute("data-on", "");
      else b.removeAttribute("data-on");
    }
  };
  const openWin = (id) => {
    const w = WINS[id];
    const was = w.dataset.state === "open";
    w.dataset.state = "open";
    TASKS[id].hidden = false;
    if (!was && id === "pic") {
      for (const t of $$(".sd-thumb", w)) {
        t.style.animation = "none";
        void t.offsetWidth;
        t.style.animation = "";
      }
    }
    raise(w);
    syncTasks();
  };
  const setPlaying = (on) => {
    if (on) WINS.mus.setAttribute("data-playing", "");
    else WINS.mus.removeAttribute("data-playing");
    $(".sd-play").setAttribute("aria-pressed", String(on));
  };
  const setBin = (full) => {
    binFull = full;
    icons.bin.dataset.full = full ? "1" : "0";
    icons.bin.setAttribute("aria-label", full ? S.binFullAria : S.binEmptyAria);
  };

  const ptrOn = () => ptr.setAttribute("data-on", "");
  const ptrOff = () => ptr.removeAttribute("data-on");
  const glide = (id) => {
    ptr.style.left = pos[id][0] + 3.2 + "%";
    ptr.style.top = pos[id][1] + 7 + "%";
  };
  const click = async () => {
    ptr.classList.remove("sd-click");
    void ptr.offsetWidth;
    ptr.classList.add("sd-click");
    await wait(260);
  };
  const burst = async () => {
    const el = icons.bin;
    for (const b of $$(".sd-bit", el)) b.remove();
    for (let i = 0; i < 7; i++) {
      const b = document.createElement("i");
      b.className = "sd-bit";
      b.style.setProperty("--a", i * 51 + "deg");
      b.style.setProperty("--d", i * 40 + "ms");
      el.append(b);
    }
    el.classList.add("sd-bursting");
    const gl = $(".sd-gl", el);
    gl.classList.remove("sd-squash");
    void gl.offsetWidth;
    gl.classList.add("sd-squash");
    await wait(700);
    el.classList.remove("sd-bursting");
    for (const b of $$(".sd-bit", el)) b.remove();
    setBin(false);
  };

  const ACTIONS = {
    async tidy() {
      say("bot", T.tidyStart);
      ptrOn();
      for (const id of ORDER) {
        glide(id);
        await wait(520);
        await click();
        icons[id].classList.add("sd-lift");
        setPos(id, TIDY[id][0], TIDY[id][1]);
        glide(id);
        await wait(560);
        icons[id].classList.remove("sd-lift");
      }
      say("bot", T.tidyDone);
    },
    async pics() {
      say("bot", T.picsStart);
      ptrOn();
      glide("pics");
      await wait(650);
      await click();
      await click();
      openWin("pic");
      await wait(500);
      say("bot", T.picsDone);
    },
    async bin() {
      ptrOn();
      glide("bin");
      await wait(650);
      if (binFull) {
        await click();
        await burst();
        say("bot", T.binEmpty);
      } else {
        say("bot", T.binAlready);
      }
    },
    async music() {
      say("bot", T.musicStart);
      ptrOn();
      glide("music");
      await wait(650);
      await click();
      await click();
      setPlaying(true);
      openWin("mus");
      await wait(300);
      say("bot", T.musicDone);
    },
    async reset() {
      for (const id of ORDER) setPos(id, INIT[id][0], INIT[id][1]);
      setBin(true);
      await wait(600);
      say("bot", T.resetDone);
    },
    async other() {
      say("bot", T.other);
    }
  };

  const intent = (text) => {
    for (const key of ["tidy", "pics", "bin", "music", "reset"]) {
      if (patterns[key].test(text)) return key;
    }
    return "other";
  };

  const run = async (raw, forced) => {
    const text = String(raw).trim();
    if (!text || running) return;
    const refocus = WINS.ai.contains(desk.getRootNode().activeElement || document.activeElement);
    running = true;
    input.value = "";
    say("user", text);
    showTyping();
    busy(true);
    await wait(350);
    try {
      await ACTIONS[forced && ACTIONS[forced] ? forced : intent(text)]();
    } finally {
      await wait(500);
      ptrOff();
      hideTyping();
      running = false;
      busy(false);
      if (refocus) input.focus({ preventScroll: true });
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    run(input.value);
  };
  form.addEventListener("submit", onSubmit);
  for (const c of chips) {
    c.addEventListener("click", () => {
      const item = chipsList[Number(c.dataset.i)] || {};
      run(c.textContent, item.intent);
    });
  }

  const activate = async (id) => {
    if (running) return;
    if (id === "pics") openWin("pic");
    else if (id === "music") {
      setPlaying(true);
      openWin("mus");
    } else if (id === "bin") {
      if (binFull) {
        running = true;
        await burst();
        running = false;
        say("bot", T.binEmpty);
      }
    } else {
      say("bot", id === "docs" ? T.layersOnly : T.exportsOnly);
    }
  };

  for (const id of Object.keys(icons)) {
    const el = icons[id];
    el.addEventListener("pointerdown", (e) => {
      if (running || e.button > 0) return;
      drag = { id, sx: e.clientX, sy: e.clientY, ox: pos[id][0], oy: pos[id][1], r: field.getBoundingClientRect(), on: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== id) return;
      const dx = ((e.clientX - drag.sx) / drag.r.width) * 100;
      const dy = ((e.clientY - drag.sy) / drag.r.height) * 100;
      if (!drag.on) {
        if (Math.abs(dx) + Math.abs(dy) <= 0.6) return;
        drag.on = true;
        el.classList.add("sd-drag", "sd-lift");
      }
      setPos(id, clamp(drag.ox + dx, 0, 92), clamp(drag.oy + dy, 0, 80));
    });
    const end = () => {
      if (!drag || drag.id !== id) return;
      el.classList.remove("sd-drag", "sd-lift");
      drag = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", () => activate(id));
    el.addEventListener("keydown", (e) => {
      if (running) return;
      if (e.key === "Enter") {
        e.preventDefault();
        activate(id);
      }
      const step = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
      if (step) {
        e.preventDefault();
        setPos(id, clamp(pos[id][0] + step[0], 0, 92), clamp(pos[id][1] + step[1], 0, 80));
      }
    });
  }

  const toggleMax = (win) => {
    if (win.hasAttribute("data-max")) win.removeAttribute("data-max");
    else win.setAttribute("data-max", "");
    raise(win);
  };

  for (const id of Object.keys(WINS)) {
    const win = WINS[id];
    win.addEventListener("pointerdown", () => raise(win), true);
    const bar = $(".sd-wt", win);
    let d = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || win.hasAttribute("data-max")) return;
      const cur = (win.style.translate || "0px 0px").split(" ").map(parseFloat);
      d = { sx: e.clientX, sy: e.clientY, x: cur[0] || 0, y: cur[1] || 0 };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!d) return;
      win.style.translate = d.x + e.clientX - d.sx + "px " + (d.y + e.clientY - d.sy) + "px";
    });
    const stop = () => {
      d = null;
    };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);
    bar.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      toggleMax(win);
    });
    for (const b of $$("[data-act]", win)) {
      b.addEventListener("click", () => {
        const a = b.dataset.act;
        if (a === "max") toggleMax(win);
        if (a === "min") {
          win.dataset.state = "min";
          win.removeAttribute("data-max");
          syncTasks();
        }
        if (a === "close") {
          win.dataset.state = "closed";
          win.removeAttribute("data-max");
          if (id === "mus") setPlaying(false);
          syncTasks();
        }
      });
    }
  }

  const restoreAi = () => {
    WINS.ai.dataset.state = "open";
    raise(WINS.ai);
    syncTasks();
  };
  $(".sd-start").addEventListener("click", restoreAi);
  for (const id of Object.keys(TASKS)) {
    TASKS[id].addEventListener("click", () => {
      if (id === "ai") restoreAi();
      else openWin(id);
    });
  }
  $(".sd-play").addEventListener("click", () => setPlaying(!WINS.mus.hasAttribute("data-playing")));

  const tick = () => {
    const d = new Date();
    clock.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  tick();
  const clockTimer = setInterval(tick, 15000);

  const offTheme = ctx.onTheme((mode) => desk.setAttribute("data-mode", mode));
  const offVisible = ctx.onVisible((v) => desk.classList.toggle("sd-idle", !v));
  if (!ctx.visible()) desk.classList.add("sd-idle");

  say("bot", T.hello);
  requestAnimationFrame(() => ctx.ready());

  return () => {
    dead.v = true;
    clearInterval(clockTimer);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    offTheme();
    offVisible();
    desk.remove();
    style.remove();
  };
}
