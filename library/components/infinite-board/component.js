// Infinite board: sixteen captures on a free canvas. Drag pieces, pan, wheel and pinch zoom around the pointer, fit all,
// tidy into columns and open any capture full size. Ported from the formref-pinboard section of formai-xmental-webspun.
const CSS = `
@keyframes fwc-ib-fade{from{opacity:0}to{opacity:1}}
@keyframes fwc-ib-grow{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
.fwc-infinite-board{--ib-g:var(--g,clamp(14px,1.6vw,24px));--ib-sw:var(--shadow-window,0 1px 1px rgb(0 0 0/.3),0 28px 64px -28px rgb(0 0 0/.8))}
.fwc-infinite-board[data-theme="light"]{--ib-sw:var(--shadow-window,0 1px 1px rgb(40 32 20/.04),0 28px 64px -28px rgb(40 32 20/.3))}
.fwc-infinite-board.fwc-ib{--rot:0deg;position:absolute;inset:0;overflow:clip;background:var(--ground,#14161b);color:var(--ink,#eef0f4);font-family:var(--font-ui,system-ui,sans-serif)}
.fwc-infinite-board .fwc-ib-ic{flex:none;display:block;inline-size:var(--icon-s,16px);block-size:var(--icon-s,16px)}
.fwc-infinite-board .fwc-ib-ic.fwc-ib-ic-m{inline-size:var(--icon-m,20px);block-size:var(--icon-m,20px)}
.fwc-infinite-board .fwc-ib-stage{position:absolute;inset:0;z-index:var(--z-base,0);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;outline:none}
.fwc-infinite-board .fwc-ib-stage.fwc-ib-drag{cursor:grabbing}
.fwc-infinite-board .fwc-ib-stage::after{content:"";position:absolute;inset:72px var(--ib-g) 64px;border:1px dashed transparent;border-radius:var(--radius-l,16px);pointer-events:none}
.fwc-infinite-board .fwc-ib-stage:focus-visible::after{border-color:var(--edge-strong,rgb(255 255 255/.18))}
.fwc-infinite-board .fwc-ib-grid{position:absolute;inset:0;z-index:var(--z-behind,-1);inline-size:100%;block-size:100%;pointer-events:none;opacity:0;animation:fwc-ib-fade 1.2s var(--ease-out,cubic-bezier(.2,.7,.2,1)) .4s forwards}
.fwc-infinite-board .fwc-ib-lines{position:absolute;inset:0;z-index:var(--z-behind,-1);inline-size:100%;block-size:100%;pointer-events:none;opacity:0;animation:fwc-ib-fade 1.2s var(--ease-out,cubic-bezier(.2,.7,.2,1)) 1s forwards}
.fwc-infinite-board .fwc-ib-hair{stroke:var(--ink,#eef0f4);stroke-width:.75;opacity:.28;transition:opacity var(--dur,240ms) var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-card{position:absolute;inset-block-start:0;inset-inline-start:0;display:block;inline-size:120px;margin:0;padding:0;border:0;background:none;color:var(--ink,#eef0f4);font:inherit;cursor:inherit;z-index:calc(var(--z-base,0) + var(--o,8));will-change:transform;-webkit-tap-highlight-color:transparent}
.fwc-infinite-board .fwc-ib-card.fwc-ib-hid{visibility:hidden}
.fwc-infinite-board .fwc-ib-enter{display:block;animation:fwc-ib-grow 900ms cubic-bezier(.65,0,.35,1) calc(200ms + 55ms * var(--i)) both}
.fwc-infinite-board .fwc-ib-tilt{display:block;position:relative;transform:perspective(900px) rotateY(var(--rot)) scale(var(--ls,1));transition:opacity var(--dur,240ms) var(--ease-out,cubic-bezier(.2,.7,.2,1)),filter var(--dur,240ms) var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-frame{display:block;position:relative;overflow:hidden;aspect-ratio:var(--ar);border-radius:clamp(6px,.8vw,12px);background:var(--float,#242833);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255/.18)),var(--ib-sw);transition:transform .45s var(--ease-out,cubic-bezier(.2,.7,.2,1)),box-shadow .45s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-pic{position:absolute;inset:0;display:block;transition:transform .8s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-pic img,.fwc-infinite-board .fwc-ib-art img{position:absolute;display:block;inline-size:calc(var(--k) * 100%);block-size:auto;max-inline-size:none;inset-inline-start:calc(50% - var(--cx) * var(--k) * 100%);inset-block-start:calc(50% - var(--cy) * var(--hk) * 100%)}
.fwc-infinite-board[data-theme="light"] img.fwc-ib-d,.fwc-infinite-board:not([data-theme="light"]) img.fwc-ib-l{display:none}
.fwc-infinite-board .fwc-ib-card.fwc-ib-on .fwc-ib-frame,.fwc-infinite-board .fwc-ib-card.fwc-ib-held .fwc-ib-frame{transform:translateY(-6px);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255/.18)),var(--ib-sw),var(--shadow-frame,0 40px 100px -50px rgb(0 0 0/.9))}
.fwc-infinite-board .fwc-ib-card.fwc-ib-on .fwc-ib-pic{transform:scale(1.07)}
.fwc-infinite-board .fwc-ib-card.fwc-ib-dim .fwc-ib-tilt{opacity:.32;filter:grayscale(.7)}
.fwc-infinite-board .fwc-ib-cap{position:absolute;inset-inline:0;inset-block-start:calc(100% + var(--sp-2,8px));display:flex;align-items:center;gap:var(--sp-2,8px);color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.08em;line-height:1.2;text-transform:uppercase;white-space:nowrap;opacity:0;transform:translateY(4px);transition:opacity .3s var(--ease-out,cubic-bezier(.2,.7,.2,1)),transform .3s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board[data-mode="loose"] .fwc-ib-cap{inset-inline-end:auto}
.fwc-infinite-board .fwc-ib-cap-n{color:var(--ink-faint,#6b7283)}
.fwc-infinite-board .fwc-ib-cap-dot{inline-size:3px;block-size:3px;background:var(--ink-faint,#6b7283)}
.fwc-infinite-board .fwc-ib-cap-t{overflow:hidden;text-overflow:ellipsis}
.fwc-infinite-board .fwc-ib-card.fwc-ib-on .fwc-ib-cap,.fwc-infinite-board .fwc-ib-card:focus-visible .fwc-ib-cap{opacity:1;transform:none}
.fwc-infinite-board[data-mode="tidy"] .fwc-ib-cap{opacity:.6;transform:none}
.fwc-infinite-board[data-mode="tidy"] .fwc-ib-card.fwc-ib-on .fwc-ib-cap{opacity:1}
.fwc-infinite-board .fwc-ib-cats{position:absolute;inset:0;z-index:var(--z-raised,100);pointer-events:none}
.fwc-infinite-board .fwc-ib-cat{position:absolute;pointer-events:auto;display:inline-flex;align-items:flex-start;gap:2px;margin:0;padding:var(--sp-1,4px) var(--sp-2,8px);border:0;background:none;color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;opacity:0;animation:fwc-ib-fade 1s var(--ease-out,cubic-bezier(.2,.7,.2,1)) .9s forwards;transition:color .3s var(--ease-out,cubic-bezier(.2,.7,.2,1));inset-block-start:var(--top)}
.fwc-infinite-board .fwc-ib-cat[data-align="start"]{inset-inline-start:var(--ib-g)}
.fwc-infinite-board .fwc-ib-cat[data-align="end"]{inset-inline-end:var(--ib-g)}
.fwc-infinite-board .fwc-ib-cat[data-align="center"]{inset-inline:0;margin-inline:auto;inline-size:max-content}
.fwc-infinite-board .fwc-ib-cat-n{color:var(--hue,#eef0f4);font-size:.7em;line-height:1}
.fwc-infinite-board .fwc-ib-cat-u{position:absolute;inset-inline:var(--sp-2,8px);inset-block-end:2px;block-size:1px;background:currentColor;transform:scaleX(0);transform-origin:left;transition:transform .45s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-cat.fwc-ib-act .fwc-ib-cat-u{transform:scaleX(1)}
.fwc-infinite-board .fwc-ib-cat.fwc-ib-dim{color:var(--ink-faint,#6b7283)}
.fwc-infinite-board .fwc-ib-bot{position:absolute;inset-inline:0;inset-block-end:0;z-index:var(--z-chrome,300);display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:var(--sp-3,12px);padding:36px var(--ib-g) calc(var(--ib-g) + 4px);background:linear-gradient(to top,var(--ground,#14161b) 30%,transparent);pointer-events:none;opacity:0;animation:fwc-ib-fade 1s var(--ease-out,cubic-bezier(.2,.7,.2,1)) .8s forwards}
.fwc-infinite-board .fwc-ib-bot>*{pointer-events:auto}
.fwc-infinite-board .fwc-ib-clock{grid-column:1;display:flex;align-items:center;gap:var(--sp-2,8px);min-block-size:var(--control-h-compact,32px);color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase}
.fwc-infinite-board .fwc-ib-clock b{color:var(--ink,#eef0f4);font-weight:500;font-variant-numeric:tabular-nums}
.fwc-infinite-board .fwc-ib-sw{grid-column:2;display:inline-flex;align-items:center;gap:var(--sp-3,12px);min-block-size:var(--control-h-compact,32px);margin:0;padding:0 var(--sp-2,8px);border:0;background:none;color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.fwc-infinite-board .fwc-ib-sw .fwc-ib-wd{color:var(--ink-faint,#6b7283);transition:color .3s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-sw[aria-checked="false"] .fwc-ib-w-lo,.fwc-infinite-board .fwc-ib-sw[aria-checked="true"] .fwc-ib-w-ti{color:var(--ink,#eef0f4)}
.fwc-infinite-board .fwc-ib-track{position:relative;inline-size:36px;block-size:18px;background:var(--control,#2b303c);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255/.18))}
.fwc-infinite-board .fwc-ib-dot{position:absolute;inset-block-start:5px;inset-inline-start:5px;inline-size:8px;block-size:8px;background:var(--hue,#eef0f4);transition:transform .5s var(--ease-out,cubic-bezier(.2,.7,.2,1)),inline-size .3s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-sw[aria-checked="true"] .fwc-ib-dot{transform:translateX(18px)}
.fwc-infinite-board .fwc-ib-sw:active .fwc-ib-dot{inline-size:13px}
.fwc-infinite-board .fwc-ib-sw[aria-checked="true"]:active .fwc-ib-dot{transform:translateX(13px)}
.fwc-infinite-board .fwc-ib-right{grid-column:3;justify-self:end;display:flex;align-items:center;gap:var(--sp-4,16px)}
.fwc-infinite-board .fwc-ib-hint{color:var(--ink-faint,#6b7283);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase}
.fwc-infinite-board .fwc-ib-ctls{display:flex;align-items:center;gap:var(--sp-1,4px)}
.fwc-infinite-board .fwc-ib-cb{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2,8px);min-inline-size:var(--control-h-compact,32px);block-size:var(--control-h-compact,32px);margin:0;padding:0 var(--sp-2,8px);border:0;background:var(--control,#2b303c);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255/.18));color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:background .3s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-cb:hover{background:var(--control-hover,#343a48)}
.fwc-infinite-board .fwc-ib-zoom{min-inline-size:5ch;color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.08em;text-align:center;font-variant-numeric:tabular-nums}
.fwc-infinite-board.fwc-ib-lb{position:fixed;inset:0;z-index:var(--z-overlay,600);display:flex;align-items:center;justify-content:center;padding:64px 70px 96px;visibility:hidden;color:var(--ink,#eef0f4);font-family:var(--font-ui,system-ui,sans-serif)}
.fwc-infinite-board.fwc-ib-lb.fwc-ib-shown{visibility:visible}
.fwc-infinite-board .fwc-ib-lb-back{position:absolute;inset:0;background:color-mix(in srgb,var(--ground,#14161b) 96%,transparent);opacity:0;transition:opacity .45s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board.fwc-ib-lbon .fwc-ib-lb-back{opacity:1}
.fwc-infinite-board .fwc-ib-lb-close,.fwc-infinite-board .fwc-ib-lb-nav{opacity:0;transition:opacity .45s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board.fwc-ib-lbon .fwc-ib-lb-close,.fwc-infinite-board.fwc-ib-lbon .fwc-ib-lb-nav{opacity:1}
.fwc-infinite-board.fwc-ib-lb:not(.fwc-ib-lbon) .fwc-ib-lb-close,.fwc-infinite-board.fwc-ib-lb:not(.fwc-ib-lbon) .fwc-ib-lb-nav{transition-duration:.2s}
.fwc-infinite-board .fwc-ib-lb-close{position:absolute;inset-block-start:var(--ib-g);inset-inline-end:var(--ib-g);display:inline-flex;align-items:center;gap:var(--sp-2,8px);margin:0;padding:var(--sp-2,8px) var(--sp-3,12px);border:0;background:none;color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.fwc-infinite-board .fwc-ib-lb-close .fwc-ib-ic{transition:transform .5s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-lb-close:hover .fwc-ib-ic{transform:rotate(90deg)}
.fwc-infinite-board .fwc-ib-lb-nav{position:absolute;inset-block-start:50%;margin:-24px 0 0;display:inline-flex;align-items:center;justify-content:center;inline-size:48px;block-size:48px;padding:0;border:0;background:var(--control,#2b303c);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255/.18));color:var(--ink,#eef0f4);cursor:pointer}
.fwc-infinite-board .fwc-ib-lb-nav:hover{background:var(--control-hover,#343a48)}
.fwc-infinite-board .fwc-ib-lb-nav.fwc-ib-prev{inset-inline-start:var(--ib-g)}
.fwc-infinite-board .fwc-ib-lb-nav.fwc-ib-next{inset-inline-end:var(--ib-g)}
.fwc-infinite-board .fwc-ib-lb-fig{--ar:1;position:relative;inline-size:min(72vw,calc((100svh - 190px) * var(--ar)));margin:0;aspect-ratio:var(--ar);overflow:hidden;border-radius:14px;background:var(--float,#242833);box-shadow:var(--ib-sw),inset 0 0 0 1px var(--edge,rgb(255 255 255/.09));transform-origin:0 0}
.fwc-infinite-board .fwc-ib-art{position:absolute;inset:0;display:block}
.fwc-infinite-board .fwc-ib-art .fwc-ib-hi{opacity:0;transition:opacity .5s var(--ease-out,cubic-bezier(.2,.7,.2,1))}
.fwc-infinite-board .fwc-ib-lb-fig.fwc-ib-hion .fwc-ib-art .fwc-ib-hi{opacity:1}
.fwc-infinite-board .fwc-ib-lb-cap{position:absolute;inset-inline:0;inset-block-end:var(--sp-5,24px);display:flex;flex-direction:column;align-items:center;gap:2px;margin:0;padding-inline:var(--sp-4,16px);text-align:center}
.fwc-infinite-board .fwc-ib-lb-cap .fwc-ib-n,.fwc-infinite-board .fwc-ib-lb-cap .fwc-ib-fl{color:var(--ink-faint,#6b7283);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase}
.fwc-infinite-board .fwc-ib-lb-cap .fwc-ib-t{font-size:var(--fs-l,1.125rem);font-weight:var(--weight-display,640);letter-spacing:var(--track-tight,-.015em)}
.fwc-infinite-board .fwc-ib-lb-cap .fwc-ib-m{color:var(--ink-soft,#a4aab8);font-size:var(--fs-s,.875rem)}
@media (max-width:1179.98px){
.fwc-infinite-board .fwc-ib-hint{display:none}
}
@media (max-width:719.98px){
.fwc-infinite-board .fwc-ib-cat{font-size:9.5px;letter-spacing:.1em;inset-block-start:var(--top-m,var(--top))}
.fwc-infinite-board .fwc-ib-clock,.fwc-infinite-board .fwc-ib-zoom,.fwc-infinite-board .fwc-ib-zo,.fwc-infinite-board .fwc-ib-zi{display:none}
.fwc-infinite-board.fwc-ib-lb{padding:64px 12px 110px}
.fwc-infinite-board .fwc-ib-lb-fig{inline-size:min(calc(100vw - 24px),calc((100svh - 200px) * var(--ar)))}
.fwc-infinite-board .fwc-ib-lb-nav{inset-block-start:auto;inset-block-end:18px;margin:0}
.fwc-infinite-board .fwc-ib-lb-cap{inset-block-end:76px}
}
@media (prefers-reduced-motion:reduce){
.fwc-infinite-board .fwc-ib-enter,.fwc-infinite-board .fwc-ib-cat,.fwc-infinite-board .fwc-ib-bot,.fwc-infinite-board .fwc-ib-lines,.fwc-infinite-board .fwc-ib-grid{animation:none!important;opacity:1}
.fwc-infinite-board .fwc-ib-pic,.fwc-infinite-board .fwc-ib-frame,.fwc-infinite-board .fwc-ib-dot,.fwc-infinite-board .fwc-ib-cap{transition-duration:1ms!important}
}
.fwc-infinite-board[data-reduced] .fwc-ib-enter,.fwc-infinite-board[data-reduced] .fwc-ib-cat,.fwc-infinite-board[data-reduced] .fwc-ib-bot,.fwc-infinite-board[data-reduced] .fwc-ib-lines,.fwc-infinite-board[data-reduced] .fwc-ib-grid{animation:none!important;opacity:1}
.fwc-infinite-board[data-reduced] .fwc-ib-pic,.fwc-infinite-board[data-reduced] .fwc-ib-frame,.fwc-infinite-board[data-reduced] .fwc-ib-dot,.fwc-infinite-board[data-reduced] .fwc-ib-cap{transition-duration:1ms!important}
`;

const DEFAULT_LABELS = {
  loose: "Loose",
  tidy: "Tidy",
  tidyLayout: "Tidy layout",
  fit: "Fit",
  fitAll: "Fit all captures",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  close: "Close",
  viewer: "Capture viewer",
  previous: "Previous capture",
  next: "Next capture",
  capture: "Capture",
  local: "Local",
  tags: "Tags"
};

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON = {
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  fit: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  prev: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  next: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'
};

export function mount(root, props, ctx) {
  const P = props || {};
  const text = (v, f) => (typeof v === "string" ? v : f);
  const num = (v, f) => (typeof v === "number" && isFinite(v) ? v : f);
  const L = Object.assign({}, DEFAULT_LABELS, P.labels && typeof P.labels === "object" ? P.labels : {});
  const cardData = (Array.isArray(P.cards) ? P.cards : []).filter((d) => d && typeof d === "object" && text(d.dark, "") !== "");
  const catData = (Array.isArray(P.categories) ? P.categories : []).filter((d) => d && typeof d.id === "string");
  const metaSuffix = text(P.metaSuffix, "");
  const N = cardData.length;

  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const icon = (name, medium) => {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("class", "fwc-ib-ic" + (medium ? " fwc-ib-ic-m" : ""));
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.75");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.innerHTML = ICON[name];
    return s;
  };
  const span = (cls, t) => {
    const n = el("span", cls);
    if (t !== undefined) n.textContent = t;
    return n;
  };

  const style = el("style");
  style.textContent = CSS;
  root.appendChild(style);
  if (!N) {
    ctx.ready();
    return () => {};
  }

  const board = el("div", "fwc-infinite-board fwc-ib");
  board.dataset.mode = "loose";
  board.dataset.theme = ctx.theme();
  if (ctx.reduced) board.setAttribute("data-reduced", "");
  root.appendChild(board);

  const stage = el("div", "fwc-ib-stage", {
    tabindex: "0",
    role: "group",
    "aria-label": text(P.ariaLabel, "Reference table with " + N + " captures. Drag a capture to move it, drag the canvas to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, zero fits all.")
  });
  const grid = el("canvas", "fwc-ib-grid", { "aria-hidden": "true" });
  const gctx = grid.getContext("2d");
  const lines = document.createElementNS(SVG_NS, "svg");
  lines.setAttribute("class", "fwc-ib-lines");
  lines.setAttribute("aria-hidden", "true");
  lines.setAttribute("focusable", "false");
  stage.append(grid, lines);

  const pad = (n) => String(n).padStart(2, "0");
  const hairs = [];
  const cardEls = cardData.map((d, i) => {
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("class", "fwc-ib-hair");
    for (const k of ["x1", "y1", "x2", "y2"]) ln.setAttribute(k, "0");
    lines.appendChild(ln);
    hairs.push(ln);
    const b = el("button", "fwc-ib-card", { type: "button", "aria-label": text(d.title, "") + ", " + text(d.catname, "") });
    b.dataset.i = String(i);
    b.dataset.cat = text(d.cat, "");
    b.style.setProperty("--i", String(i));
    b.style.setProperty("--ar", String(num(d.ar, 1)));
    b.style.setProperty("--k", String(num(d.k, 1)));
    b.style.setProperty("--hk", String(num(d.hk, 1)));
    b.style.setProperty("--cx", String(num(d.cx, 0.5)));
    b.style.setProperty("--cy", String(num(d.cy, 0.5)));
    const enter = span("fwc-ib-enter");
    const tilt = span("fwc-ib-tilt");
    const frame = span("fwc-ib-frame");
    const pic = span("fwc-ib-pic");
    const mk = (src, cls, lazy) => {
      const im = el("img", cls);
      im.src = ctx.asset(src);
      im.width = 2400;
      im.height = 1500;
      im.alt = text(d.alt, text(d.title, ""));
      im.decoding = "async";
      if (lazy) im.loading = "lazy";
      return im;
    };
    const lightSrc = text(d.light, "");
    if (lightSrc && lightSrc !== d.dark) {
      pic.append(mk(d.dark, "fwc-ib-d", false), mk(lightSrc, "fwc-ib-l", true));
    } else {
      pic.append(mk(d.dark, "", false));
    }
    frame.appendChild(pic);
    const cap = span("fwc-ib-cap");
    cap.append(span("fwc-ib-cap-n", pad(i + 1)), el("i", "fwc-ib-cap-dot"), span("fwc-ib-cap-t", text(d.title, "")));
    tilt.append(frame, cap);
    enter.appendChild(tilt);
    b.appendChild(enter);
    stage.appendChild(b);
    return b;
  });

  const cats = el("nav", "fwc-ib-cats", { "aria-label": L.tags });
  const catEls = catData.map((c) => {
    const b = el("button", "fwc-ib-cat", { type: "button", "aria-pressed": "false" });
    b.dataset.cat = c.id;
    b.dataset.align = c.align === "end" || c.align === "center" ? c.align : "start";
    b.style.setProperty("--top", num(c.top, 30) + "%");
    if (typeof c.topPhone === "number") b.style.setProperty("--top-m", c.topPhone + "%");
    const n = cardData.filter((d) => d.cat === c.id).length;
    const sup = el("sup", "fwc-ib-cat-n");
    sup.textContent = String(n);
    b.append(span("fwc-ib-cat-t", text(c.label, c.id)), sup, span("fwc-ib-cat-u"));
    cats.appendChild(b);
    return b;
  });

  const bot = el("div", "fwc-ib-bot");
  const clock = el("div", "fwc-ib-clock");
  const cityEl = span("", L.local);
  const timeEl = el("b");
  timeEl.textContent = "00:00";
  clock.append(cityEl, timeEl);
  const sw = el("button", "fwc-ib-sw", { type: "button", role: "switch", "aria-checked": "false", "aria-label": L.tidyLayout });
  const track = span("fwc-ib-track");
  track.appendChild(span("fwc-ib-dot"));
  sw.append(span("fwc-ib-wd fwc-ib-w-lo", L.loose), track, span("fwc-ib-wd fwc-ib-w-ti", L.tidy));
  const right = el("div", "fwc-ib-right");
  const hint = el("div", "fwc-ib-hint");
  hint.textContent = text(P.hint, N + " captures · drag, scroll to zoom");
  const ctls = el("div", "fwc-ib-ctls");
  const zOut = el("button", "fwc-ib-cb fwc-ib-zo", { type: "button", "aria-label": L.zoomOut });
  zOut.appendChild(icon("minus"));
  const zVal = span("fwc-ib-zoom", "100%");
  const zIn = el("button", "fwc-ib-cb fwc-ib-zi", { type: "button", "aria-label": L.zoomIn });
  zIn.appendChild(icon("plus"));
  const zFit = el("button", "fwc-ib-cb fwc-ib-fit", { type: "button", "aria-label": L.fitAll });
  zFit.append(icon("fit"), span("", L.fit));
  ctls.append(zOut, zVal, zIn, zFit);
  right.append(hint, ctls);
  bot.append(clock, sw, right);
  board.append(stage, cats, bot);

  const lb = el("div", "fwc-infinite-board fwc-ib-lb", { role: "dialog", "aria-modal": "true", "aria-label": L.viewer });
  lb.setAttribute("inert", "");
  lb.dataset.theme = ctx.theme();
  const lbBack = el("div", "fwc-ib-lb-back");
  const lbClose = el("button", "fwc-ib-lb-close", { type: "button" });
  lbClose.append(span("", L.close), icon("close"));
  const lbFig = el("figure", "fwc-ib-lb-fig");
  const lbArt = el("div", "fwc-ib-art", { role: "img", "aria-label": L.capture });
  lbFig.appendChild(lbArt);
  const lbPrev = el("button", "fwc-ib-lb-nav fwc-ib-prev", { type: "button", "aria-label": L.previous });
  lbPrev.appendChild(icon("prev", true));
  const lbNext = el("button", "fwc-ib-lb-nav fwc-ib-next", { type: "button", "aria-label": L.next });
  lbNext.appendChild(icon("next", true));
  const lbCap = el("p", "fwc-ib-lb-cap", { "aria-live": "polite" });
  const lbN = span("fwc-ib-n");
  const lbT = span("fwc-ib-t");
  const lbM = span("fwc-ib-m");
  const lbF = span("fwc-ib-fl");
  lbCap.append(lbN, lbT, lbM, lbF);
  lb.append(lbBack, lbClose, lbFig, lbPrev, lbNext, lbCap);
  document.body.appendChild(lb);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const ZMIN = 0.5, ZMAX = 2.5;
  const reduced = () => ctx.reduced;

  let gridKey = "", dotInk = "";
  const readDot = () => {
    dotInk = ctx.token("edge-strong") || "rgb(255 255 255 / 0.18)";
    gridKey = "";
  };
  let dpr = 1;
  const drawGrid = (gx, gy, z) => {
    const W = grid.width, H = grid.height, d = dpr;
    gctx.clearRect(0, 0, W, H);
    gctx.fillStyle = dotInk;
    const minor = 32 * z * d, major = 160 * z * d;
    const ox = gx * d, oy = gy * d;
    if (minor >= 9) {
      const r = (1 + 0.3 * z) * d;
      gctx.globalAlpha = 0.6;
      for (let x = mod(ox + minor / 2, minor); x < W; x += minor) for (let y = mod(oy + minor / 2, minor); y < H; y += minor) gctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const r2 = (1.5 + 0.4 * z) * d;
    gctx.globalAlpha = 1;
    gctx.beginPath();
    for (let x = mod(ox + major / 2, major); x < W; x += major) {
      for (let y = mod(oy + major / 2, major); y < H; y += major) {
        gctx.moveTo(x + r2, y);
        gctx.arc(x, y, r2, 0, 6.2832);
      }
    }
    gctx.fill();
  };

  const catIds = catEls.map((c) => c.dataset.cat);
  const cards = cardEls.map((e, i) => {
    const d = cardData[i], s = num(d.s, 0.1);
    return {
      el: e, i, s, ar: num(d.ar, 1), u: num(d.u, 0.5), v: num(d.v, 0.5), cat: text(d.cat, ""),
      k: num(d.k, 1),
      depth: 0.72 + (s - 0.06) * 5.5,
      lx: 0, ly: 0, lw: 100, tx: 0, ty: 0, tw: 100,
      wx: 0, wy: 0, ww: 100, sx: 0, sy: 0, sw: 100, t0: -1e9,
      held: false, coast: false, cvx: 0, cvy: 0, lift: 0,
      pt: "", pw: -1, ls: "", o: -1, dim: false, on: false, op: -1, hi: false, hl: false, lk: ""
    };
  });
  const cam = { x: 0, y: 0, z: 1 };
  const anc = { ax: 0, ay: 0, wx: 0, wy: 0 };
  let zt = 1, vx = 0, vy = 0, anim = null, touched = false, ready = false, busy = false;
  let vw = 1, vh = 1, phone = false, mode = "loose";
  let hover = -1, labelHover = null, pinned = null;
  let paused = false, last = 0, active = null, tilt = 0;
  const cm = catEls.map(() => ({ rx: 0, ry: 0 }));

  const avail = (tidy) => {
    const top = phone ? 60 : tidy ? 124 : 84, bt = phone ? 64 : 80, side = phone ? 16 : tidy ? 132 : 36;
    return { top, w: vw - side * 2, h: vh - top - bt };
  };
  const fitRect = (x0, y0, x1, y1, tidy) => {
    const a = avail(tidy), bw = x1 - x0 + 32, bh = y1 - y0 + 32;
    const z = clamp(Math.min(a.w / bw, a.h / bh), ZMIN, ZMAX);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (a.top + a.h / 2 - vh / 2) / z, z };
  };
  const fitFor = (m) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    cards.forEach((c) => {
      const x = m === "tidy" ? c.tx : c.lx, y = m === "tidy" ? c.ty : c.ly, w = m === "tidy" ? c.tw : c.lw, h = w / c.ar;
      x0 = Math.min(x0, x - w / 2);
      x1 = Math.max(x1, x + w / 2);
      y0 = Math.min(y0, y - h / 2);
      y1 = Math.max(y1, y + h / 2);
    });
    return fitRect(x0, y0, x1, y1, m === "tidy");
  };
  const layoutLoose = () => {
    const W = phone ? { w: 760, h: 1500, k: 1250, a: 80, b: 190 } : { w: 1800, h: 1120, k: 1600, a: 100, b: 250 };
    cards.forEach((c) => {
      c.lx = (c.u - 0.5) * W.w;
      c.ly = (c.v - 0.5) * W.h;
      c.lw = clamp(c.s * W.k, W.a, W.b);
    });
  };
  const masonry = (cols, cw, gap, rowGap) => {
    const h = new Array(cols).fill(0);
    const r = cards.map((c) => {
      let j = 0;
      for (let q = 1; q < cols; q++) if (h[q] < h[j] - 0.5) j = q;
      const ch = cw / c.ar;
      const o = { x: j * (cw + gap) + cw / 2, y: h[j] + ch / 2, w: cw };
      h[j] += ch + rowGap;
      return o;
    });
    return { r, W: cols * cw + (cols - 1) * gap, H: Math.max(...h) - rowGap };
  };
  const layoutTidy = () => {
    const cw = phone ? 116 : 236, gap = phone ? 12 : 22, rowGap = phone ? 34 : 46;
    let best = null;
    for (const cols of phone ? [2, 3] : [3, 4, 5, 6]) {
      const m = masonry(cols, cw, gap, rowGap);
      const f = fitRect(-m.W / 2, -m.H / 2, m.W / 2, m.H / 2, true);
      if (!best || f.z > best.z + 0.01) best = { z: f.z, m };
    }
    const m = best.m;
    cards.forEach((c, i) => {
      c.tx = m.r[i].x - m.W / 2;
      c.ty = m.r[i].y - m.H / 2;
      c.tw = m.r[i].w;
    });
  };
  const startTween = (now, stag) => {
    const rm = reduced();
    cards.forEach((c, i) => {
      c.sx = c.wx;
      c.sy = c.wy;
      c.sw = c.ww;
      c.t0 = rm ? -1e9 : now + stag * i;
      c.coast = false;
      c.held = false;
      c.cvx = 0;
      c.cvy = 0;
    });
  };
  const animCam = (to, dur) => {
    vx = 0;
    vy = 0;
    if (reduced()) {
      cam.x = to.x;
      cam.y = to.y;
      cam.z = to.z;
      zt = to.z;
      anim = null;
      return;
    }
    anim = { t0: performance.now(), dur, from: { x: cam.x, y: cam.y, z: cam.z }, to };
  };
  const setAnchor = (ax, ay) => {
    anc.ax = ax;
    anc.ay = ay;
    anc.wx = cam.x + (ax - vw / 2) / cam.z;
    anc.wy = cam.y + (ay - vh / 2) / cam.z;
  };
  const stopAnim = () => {
    if (anim) {
      anim = null;
      zt = cam.z;
    }
  };
  const measure = () => {
    const pv = phone;
    vw = board.clientWidth || 1;
    vh = board.clientHeight || 1;
    phone = vw < 720;
    dpr = window.devicePixelRatio || 1;
    grid.width = Math.round(vw * dpr);
    grid.height = Math.round(vh * dpr);
    gridKey = "";
    catEls.forEach((e, j) => {
      cm[j].rx = e.offsetLeft + e.offsetWidth / 2;
      cm[j].ry = e.offsetTop + e.offsetHeight / 2;
    });
    layoutLoose();
    layoutTidy();
    if (!ready) {
      cards.forEach((c) => {
        c.wx = c.lx;
        c.wy = c.ly;
        c.ww = c.lw;
        c.sx = c.lx;
        c.sy = c.ly;
        c.sw = c.lw;
      });
      const f = fitFor(mode);
      cam.x = f.x;
      cam.y = f.y;
      cam.z = f.z;
      zt = f.z;
      ready = true;
      return;
    }
    if (pv !== phone) startTween(performance.now(), 20);
    if (!touched || pv !== phone) {
      const f = fitFor(mode);
      if (Math.abs(f.x - cam.x) + Math.abs(f.y - cam.y) + Math.abs(f.z - cam.z) > 0.5) animCam(f, 700);
    }
  };
  measure();

  const goal = (c) => (mode === "tidy" ? [c.tx, c.ty, c.tw] : [c.lx, c.ly, c.lw]);
  const setMode = (m) => {
    if (m === mode) return;
    mode = m;
    board.dataset.mode = m;
    sw.setAttribute("aria-checked", String(m === "tidy"));
    startTween(performance.now(), 24);
    touched = false;
    animCam(fitFor(m), 1050);
  };
  const fitAll = () => {
    touched = false;
    animCam(fitFor(mode), 900);
  };
  const zoomBy = (f) => {
    stopAnim();
    touched = true;
    zt = clamp(zt * f, ZMIN, ZMAX);
    setAnchor(vw / 2, vh / 2);
  };
  const applyState = () => {
    const lc = labelHover || pinned;
    active = lc || (hover >= 0 ? cards[hover].cat : null);
    cards.forEach((c) => {
      const dim = hover >= 0 ? c.i !== hover : lc ? c.cat !== lc : false;
      const on = c.i === hover;
      if (dim !== c.dim) {
        c.dim = dim;
        c.el.classList.toggle("fwc-ib-dim", dim);
      }
      if (on !== c.on) {
        c.on = on;
        c.el.classList.toggle("fwc-ib-on", on);
      }
    });
    catEls.forEach((e) => {
      e.classList.toggle("fwc-ib-act", lc === e.dataset.cat);
      e.classList.toggle("fwc-ib-dim", !!lc && lc !== e.dataset.cat);
      e.setAttribute("aria-pressed", String(pinned === e.dataset.cat));
    });
  };

  const offs = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  };

  on(sw, "click", (e) => {
    if (e.target.closest(".fwc-ib-w-lo")) setMode("loose");
    else if (e.target.closest(".fwc-ib-w-ti")) setMode("tidy");
    else setMode(mode === "tidy" ? "loose" : "tidy");
  });
  on(zFit, "click", fitAll);
  on(zIn, "click", () => zoomBy(1.25));
  on(zOut, "click", () => zoomBy(0.8));

  const ptrs = new Map();
  let down = false, moved = false, dragging = false, dragEnd = -1e9, pid = -1, sx = 0, sy = 0, px = 0, py = 0, lastMove = 0, movedFrame = false;
  let hold = null, offx = 0, offy = 0, pinch = null;
  const toWorld = (cx, cy) => {
    const r = stage.getBoundingClientRect();
    return { x: cam.x + (cx - r.left - vw / 2) / cam.z, y: cam.y + (cy - r.top - vh / 2) / cam.z };
  };
  cards.forEach((c) => {
    on(c.el, "pointerenter", (e) => {
      if (e.pointerType === "mouse" && !dragging) {
        hover = c.i;
        applyState();
      }
    });
    on(c.el, "pointerleave", (e) => {
      if (e.pointerType === "mouse" && hover === c.i) {
        hover = -1;
        applyState();
      }
    });
    on(c.el, "focus", () => {
      if (c.el.matches(":focus-visible")) {
        hover = c.i;
        applyState();
      }
    });
    on(c.el, "blur", () => {
      if (hover === c.i) {
        hover = -1;
        applyState();
      }
    });
    on(c.el, "click", () => openLb(c.i));
  });
  catEls.forEach((e) => {
    const id = e.dataset.cat;
    on(e, "pointerenter", (ev) => {
      if (ev.pointerType === "mouse") {
        labelHover = id;
        applyState();
      }
    });
    on(e, "pointerleave", () => {
      labelHover = null;
      applyState();
    });
    on(e, "focus", () => {
      if (e.matches(":focus-visible")) {
        labelHover = id;
        applyState();
      }
    });
    on(e, "blur", () => {
      labelHover = null;
      applyState();
    });
    on(e, "pointerdown", (ev) => {
      if (ev.pointerType !== "mouse") {
        labelHover = id;
        applyState();
      }
    });
    on(e, "click", () => {
      pinned = pinned === id ? null : id;
      if (!matchMedia("(hover:hover)").matches) labelHover = null;
      applyState();
    });
  });

  const endHold = (stale) => {
    const c = hold;
    hold = null;
    if (!c) return;
    if (stale > 90 || reduced()) {
      c.cvx = 0;
      c.cvy = 0;
    }
    c.held = false;
    c.coast = true;
  };
  const startPinch = () => {
    const [a, b] = [...ptrs.values()];
    const r = stage.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    stopAnim();
    touched = true;
    if (hold) endHold(0);
    down = false;
    moved = true;
    dragging = true;
    vx = 0;
    vy = 0;
    pinch = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), z: cam.z, wx: cam.x + (mx - vw / 2) / cam.z, wy: cam.y + (my - vh / 2) / cam.z };
    stage.classList.add("fwc-ib-drag");
  };
  on(stage, "pointerdown", (e) => {
    if (e.button > 0 || paused) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      startPinch();
      return;
    }
    if (ptrs.size > 2) return;
    down = true;
    moved = false;
    pid = e.pointerId;
    sx = px = e.clientX;
    sy = py = e.clientY;
    lastMove = e.timeStamp;
    const ce = e.target.closest(".fwc-ib-card");
    const c = ce ? cards[+ce.dataset.i] : null;
    hold = c && mode === "loose" && !busy ? c : null;
  });
  on(stage, "pointermove", (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      const r = stage.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const z = clamp(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), ZMIN, ZMAX);
      cam.z = z;
      zt = z;
      cam.x = pinch.wx - (mx - vw / 2) / z;
      cam.y = pinch.wy - (my - vh / 2) / z;
      return;
    }
    if (!down || e.pointerId !== pid) return;
    if (!moved) {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      moved = true;
      dragging = true;
      touched = true;
      stopAnim();
      zt = cam.z;
      try {
        stage.setPointerCapture(pid);
      } catch (err) {}
      stage.classList.add("fwc-ib-drag");
      if (hold) {
        const p0 = toWorld(sx, sy);
        offx = p0.x - hold.lx;
        offy = p0.y - hold.ly;
        hold.held = true;
        hold.coast = false;
        hold.cvx = 0;
        hold.cvy = 0;
        hover = -1;
        applyState();
      }
    }
    const dt = Math.max((e.timeStamp - lastMove) / 1000, 0.004);
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX;
    py = e.clientY;
    lastMove = e.timeStamp;
    if (hold) {
      const p = toWorld(e.clientX, e.clientY);
      const nx = clamp(p.x - offx, -1500, 1500), ny = clamp(p.y - offy, -1000, 1000);
      hold.cvx = 0.5 * hold.cvx + 0.5 * ((nx - hold.lx) / dt);
      hold.cvy = 0.5 * hold.cvy + 0.5 * ((ny - hold.ly) / dt);
      hold.lx = nx;
      hold.ly = ny;
    } else {
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      vx = 0.5 * vx + 0.5 * clamp(dx / dt, -3000, 3000);
      vy = 0.5 * vy + 0.5 * clamp(dy / dt, -3000, 3000);
    }
    movedFrame = true;
  });
  const endDrag = (e) => {
    ptrs.delete(e.pointerId);
    if (pinch) {
      if (ptrs.size < 2) {
        pinch = null;
        dragging = false;
        down = false;
        dragEnd = performance.now();
        stage.classList.remove("fwc-ib-drag");
      }
      return;
    }
    if (e.pointerId !== pid) return;
    down = false;
    if (moved) {
      const stale = e.timeStamp - lastMove;
      if (hold) endHold(stale);
      else if (stale > 90) {
        vx = 0;
        vy = 0;
      }
      dragging = false;
      dragEnd = performance.now();
      stage.classList.remove("fwc-ib-drag");
    } else {
      hold = null;
    }
  };
  on(stage, "pointerup", endDrag);
  on(stage, "pointercancel", endDrag);
  on(stage, "click", (e) => {
    if (moved || performance.now() - dragEnd < 120) {
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  on(stage, "wheel", (e) => {
    if (paused) return;
    e.preventDefault();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= vw;
      dy *= vh;
    }
    touched = true;
    stopAnim();
    if (!e.ctrlKey && (e.shiftKey || Math.abs(dx) > Math.abs(dy))) {
      const d = e.shiftKey && !dx ? dy : dx;
      cam.x += d / cam.z;
      vx = 0;
      setAnchor(anc.ax, anc.ay);
      return;
    }
    const r = stage.getBoundingClientRect();
    zt = clamp(zt * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)), ZMIN, ZMAX);
    setAnchor(e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  on(stage, "keydown", (e) => {
    if (e.target !== stage) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      stopAnim();
      touched = true;
      if (k === "ArrowLeft") vx = -700;
      else if (k === "ArrowRight") vx = 700;
      else if (k === "ArrowUp") vy = -700;
      else vy = 700;
    } else if (k === "+" || k === "=") zoomBy(1.25);
    else if (k === "-") zoomBy(0.8);
    else if (k === "0") fitAll();
    else return;
    e.preventDefault();
  });

  const loadHi = (c) => {
    c.hi = true;
    c.el.querySelectorAll("img").forEach((im) => {
      if (getComputedStyle(im).display === "none") return;
      const src = im.getAttribute("src") || "";
      if (!src.includes(".w1024.")) return;
      const big = src.replace(".w1024.", ".w2400.");
      const t = new Image();
      t.decoding = "async";
      t.onload = () => im.setAttribute("src", big);
      t.src = big;
    });
  };

  const frame = (t) => {
    if (paused || !ctx.visible()) {
      last = t;
      return;
    }
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
    last = t;
    const rm = reduced();
    if (anim) {
      const p = clamp((t - anim.t0) / anim.dur, 0, 1), e = ease(p);
      cam.x = lerp(anim.from.x, anim.to.x, e);
      cam.y = lerp(anim.from.y, anim.to.y, e);
      cam.z = Math.exp(lerp(Math.log(anim.from.z), Math.log(anim.to.z), e));
      if (p >= 1) {
        anim = null;
        zt = cam.z;
      }
    } else {
      if (!pinch) {
        if (!dragging) {
          const k = Math.exp(-(rm ? 30 : 3.4) * dt);
          vx *= k;
          vy *= k;
          if (Math.abs(vx) < 1.5) vx = 0;
          if (Math.abs(vy) < 1.5) vy = 0;
          if (vx || vy) {
            cam.x -= (vx * dt) / cam.z;
            cam.y -= (vy * dt) / cam.z;
            setAnchor(anc.ax, anc.ay);
          }
        } else if (!movedFrame) {
          vx *= Math.exp(-10 * dt);
          vy *= Math.exp(-10 * dt);
        }
      }
      movedFrame = false;
      if (Math.abs(zt - cam.z) > 1e-4) {
        cam.z += (zt - cam.z) * (1 - Math.exp(-(rm ? 60 : 11) * dt));
        if (Math.abs(zt - cam.z) < 1e-4) cam.z = zt;
        cam.x = anc.wx - (anc.ax - vw / 2) / cam.z;
        cam.y = anc.wy - (anc.ay - vh / 2) / cam.z;
      }
    }
    const z = cam.z;
    const tl = rm ? 0 : clamp(vx / 1400, -1, 1) * (dragging && !hold ? 1 : 0.7);
    tilt += (tl - tilt) * (1 - Math.exp(-6 * dt));
    if (Math.abs(tilt) < 0.001) tilt = 0;
    const rot = (tilt * 7).toFixed(2) + "deg";
    if (board.style.getPropertyValue("--rot") !== rot) board.style.setProperty("--rot", rot);
    const zt2 = Math.round(z * 100) + "%";
    if (zVal.textContent !== zt2) zVal.textContent = zt2;
    const gx = vw / 2 - cam.x * z, gy = vh / 2 - cam.y * z;
    const gk = gx.toFixed(2) + "," + gy.toFixed(2) + "," + z.toFixed(4);
    if (gk !== gridKey) {
      gridKey = gk;
      drawGrid(gx, gy, z);
    }
    let anyTween = false;
    cards.forEach((c, i) => {
      const g = goal(c);
      const p = c.t0 > -1e8 ? clamp((t - c.t0) / 900, 0, 1) : 1;
      if (p < 1) {
        anyTween = true;
        const e = ease(p);
        c.wx = lerp(c.sx, g[0], e);
        c.wy = lerp(c.sy, g[1], e);
        c.ww = lerp(c.sw, g[2], e);
      } else {
        c.t0 = -1e9;
        if (c.coast) {
          c.lx = clamp(c.lx + c.cvx * dt, -1500, 1500);
          c.ly = clamp(c.ly + c.cvy * dt, -1000, 1000);
          const kk = Math.exp(-(rm ? 30 : 5) * dt);
          c.cvx *= kk;
          c.cvy *= kk;
          if (Math.hypot(c.cvx, c.cvy) < 8) c.coast = false;
        }
        const f = 1 - Math.exp(-(rm ? 60 : 20) * dt);
        const dx = g[0] - c.wx, dy = g[1] - c.wy;
        if (Math.abs(dx) + Math.abs(dy) < 0.05) {
          c.wx = g[0];
          c.wy = g[1];
        } else {
          c.wx += dx * f;
          c.wy += dy * f;
        }
        c.ww = g[2];
      }
      const lifted = c.held || c.coast;
      c.lift += ((lifted ? 1 : 0) - c.lift) * (1 - Math.exp(-(lifted ? 14 : 7) * dt));
      if (c.lift < 0.002) c.lift = 0;
      const ls = (1 + 0.045 * c.lift).toFixed(4);
      if (ls !== c.ls) {
        c.ls = ls;
        c.el.style.setProperty("--ls", ls);
      }
      const hl = lifted || c.lift > 0.3;
      if (hl !== c.hl) {
        c.hl = hl;
        c.el.classList.toggle("fwc-ib-held", hl);
      }
      const w = c.ww * z, h = w / c.ar;
      const sxp = (c.wx - cam.x) * z + vw / 2, syp = (c.wy - cam.y) * z + vh / 2;
      if (Math.abs(w - c.pw) > 0.05) {
        c.pw = w;
        c.el.style.inlineSize = w.toFixed(2) + "px";
      }
      const tf = "translate3d(" + (sxp - w / 2).toFixed(2) + "px," + (syp - h / 2).toFixed(2) + "px,0)";
      if (tf !== c.pt) {
        c.pt = tf;
        c.el.style.transform = tf;
      }
      const o = lifted ? 60 : i === hover ? 50 : Math.round(c.depth * 10);
      if (o !== c.o) {
        c.o = o;
        c.el.style.setProperty("--o", String(o));
      }
      const ci = catIds.indexOf(c.cat);
      const m = ci >= 0 ? cm[ci] : null;
      const ln = hairs[i];
      const out = sxp < -40 || sxp > vw + 40 || syp < -40 || syp > vh + 40;
      if (m) {
        const lk = m.rx.toFixed(1) + "," + m.ry.toFixed(1) + "," + sxp.toFixed(1) + "," + syp.toFixed(1);
        if (lk !== c.lk) {
          c.lk = lk;
          ln.setAttribute("x1", m.rx.toFixed(1));
          ln.setAttribute("y1", m.ry.toFixed(1));
          ln.setAttribute("x2", sxp.toFixed(1));
          ln.setAttribute("y2", syp.toFixed(1));
        }
      }
      const op = !m || out ? 0 : active ? (c.cat === active ? 0.9 : 0.06) : 0.28;
      if (op !== c.op) {
        c.op = op;
        ln.style.opacity = String(op);
      }
      if (!c.hi && !out && c.k * w * dpr > 1000) loadHi(c);
    });
    busy = anyTween;
  };

  const offTheme = ctx.onTheme((m) => {
    board.dataset.theme = m;
    lb.dataset.theme = m;
    readDot();
    cards.forEach((c) => {
      c.hi = false;
    });
  });
  readDot();

  const cityName = (() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
    return (tz.split("/").pop() || L.local).replace(/_/g, " ");
  })();
  cityEl.textContent = cityName;
  const clockFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const tick = () => {
    timeEl.textContent = clockFmt.format(new Date());
  };
  tick();
  const clockTimer = setInterval(tick, 15000);

  let cur = 0, lbOpen = false, closing = false;
  const buildArt = (i) => {
    const e = cards[i].el, d = cardData[i];
    const light = ctx.theme() === "light";
    for (const k of ["--k", "--hk", "--cx", "--cy"]) lbArt.style.setProperty(k, e.style.getPropertyValue(k));
    lbArt.setAttribute("aria-label", text(d.alt, text(d.title, L.capture)));
    const mk = (src, cls) => {
      const im = new Image();
      im.src = src;
      im.width = 2400;
      im.height = 1500;
      im.alt = "";
      im.decoding = "async";
      if (cls) im.className = cls;
      return im;
    };
    const small = ctx.asset(light && d.light ? d.light : d.dark);
    const lo = mk(small, "");
    const hi = mk(small.replace(".w1024.", ".w2400."), "fwc-ib-hi");
    hi.addEventListener("load", () => lbFig.classList.add("fwc-ib-hion"));
    lbArt.replaceChildren(lo, hi);
  };
  const fillLb = (i) => {
    const d = cardData[i];
    lbFig.classList.remove("fwc-ib-hion");
    lbFig.style.setProperty("--ar", String(cards[i].ar));
    buildArt(i);
    lbN.textContent = pad(i + 1) + " / " + N;
    lbT.textContent = text(d.title, "");
    lbM.textContent = text(d.catname, "") + metaSuffix;
    lbF.textContent = text(d.file, "");
    if (!reduced()) lbCap.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay: 150, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
  };
  const frameRect = (i) => cards[i].el.querySelector(".fwc-ib-frame").getBoundingClientRect();
  const flip = (a0, to, dur, rev) => {
    const sxs = a0.width / to.width, sys = a0.height / to.height;
    const a = "translate(" + (a0.left - to.left) + "px," + (a0.top - to.top) + "px) scale(" + sxs + "," + sys + ")";
    const keys = rev ? [{ transform: "none" }, { transform: a }] : [{ transform: a }, { transform: "none" }];
    return lbFig.animate(keys, { duration: dur, easing: "cubic-bezier(.76,0,.18,1)", fill: "both" });
  };
  function openLb(i) {
    if (lbOpen) return;
    lbOpen = true;
    paused = true;
    cur = i;
    fillLb(i);
    lb.removeAttribute("inert");
    lb.classList.add("fwc-ib-shown");
    const src = frameRect(i);
    cards[i].el.classList.add("fwc-ib-hid");
    requestAnimationFrame(() => {
      lb.classList.add("fwc-ib-lbon");
      const to = lbFig.getBoundingClientRect();
      if (!reduced()) {
        const a = flip(src, to, 650, false);
        a.onfinish = () => a.cancel();
      }
      lbClose.focus();
    });
  }
  function closeLb() {
    if (!lbOpen || closing) return;
    closing = true;
    lb.classList.remove("fwc-ib-lbon");
    const finish = () => {
      lb.classList.remove("fwc-ib-shown");
      lb.setAttribute("inert", "");
      cards[cur].el.classList.remove("fwc-ib-hid");
      lbOpen = false;
      closing = false;
      paused = false;
      cards[cur].el.focus({ preventScroll: true });
    };
    if (reduced()) {
      finish();
      return;
    }
    const to = frameRect(cur);
    const src = lbFig.getBoundingClientRect();
    const a = flip(to, src, 520, true);
    a.onfinish = () => {
      a.cancel();
      finish();
    };
  }
  const step = (d) => {
    if (!lbOpen || closing) return;
    cards[cur].el.classList.remove("fwc-ib-hid");
    cur = mod(cur + d, N);
    cards[cur].el.classList.add("fwc-ib-hid");
    fillLb(cur);
  };
  on(lbClose, "click", closeLb);
  on(lbPrev, "click", () => step(-1));
  on(lbNext, "click", () => step(1));
  on(lbBack, "click", closeLb);
  on(lb, "click", (e) => {
    if (e.target === lb) closeLb();
  });
  let sw0 = null;
  on(lb, "pointerdown", (e) => {
    sw0 = { x: e.clientX, id: e.pointerId };
  });
  on(lb, "pointerup", (e) => {
    if (!sw0 || sw0.id !== e.pointerId) return;
    const d = e.clientX - sw0.x;
    sw0 = null;
    if (Math.abs(d) > 60) step(d < 0 ? 1 : -1);
  });
  on(document, "keydown", (e) => {
    if (!lbOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeLb();
    } else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Tab") {
      const f = [...lb.querySelectorAll("button")];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[mod(i + (e.shiftKey ? -1 : 1), f.length)].focus();
    }
  });

  const offResize = ctx.onResize(() => measure());
  applyState();
  frame(performance.now());
  const offFrame = ctx.onFrame(frame);
  ctx.ready();

  return () => {
    offFrame();
    offResize();
    offTheme();
    clearInterval(clockTimer);
    offs.forEach((f) => f());
    lb.remove();
  };
}
