// fold-plan: a drawing sheet that folds from a flat plan into a tilted model. Ported from formai-xmental-webspun
// v3.1.0 assets/sections/formcad-plan (NodeAgentc, Inc., cleared by the owner 2026-11-09).
// The fold and the turn are two registered custom properties (--k and --spin) that CSS transitions; the sun slider
// rebuilds every shadow as the convex hull of each box swept along the sun direction for the chosen hour.

const CSS = `
@property --k {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}

@property --spin {
  syntax: "<angle>";
  inherits: true;
  initial-value: 0deg;
}

.fwc-fp {
  --fc-gut: clamp(16px, 2.4vw, 32px);
  --fc-h: max(680px, calc(100svh - var(--bar-h, 64px)));
  --S: min(56vw, calc((var(--fc-h) - 220px) / 0.64), 940px);
  --m: calc(var(--S) / 200);
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  isolation: isolate;
  overflow: clip;
  background: var(--ground, #14161b);
  color: var(--ink, #eef0f4);
  transition: --k 1.5s cubic-bezier(0.65, 0, 0.25, 1), --spin 1.5s cubic-bezier(0.65, 0, 0.25, 1);
}

.fwc-fp *,
.fwc-fp *::before,
.fwc-fp *::after {
  box-sizing: border-box;
}

.fwc-fp.is-turning {
  transition: --k 1.5s cubic-bezier(0.65, 0, 0.25, 1), --spin 0s;
}

.fwc-fp.is-axon {
  --k: 1;
}

.fwc-fp .fc-sr {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.fwc-fp .fc-ic {
  flex: none;
  display: block;
  inline-size: var(--icon-m, 20px);
  block-size: var(--icon-m, 20px);
}

.fwc-fp .fc-ic.fc-ic-s {
  inline-size: var(--icon-s, 16px);
  block-size: var(--icon-s, 16px);
}

.fwc-fp button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.fwc-fp :focus-visible {
  outline: 2px solid var(--focus, #eef0f4);
  outline-offset: 2px;
  border-radius: var(--radius-s, 6px);
}

.fwc-fp .fc-nav a,
.fwc-fp .fc-seg button,
.fwc-fp .fc-sun output,
.fwc-fp .fc-word-sub,
.fwc-fp .fc-row-meta,
.fwc-fp .fc-row-n,
.fwc-fp .fc-tip,
.fwc-fp .fc-coord,
.fwc-fp .fc-scale-lab,
.fwc-fp .fc-tblock,
.fwc-fp .fc-card-count,
.fwc-fp .fc-dl dt,
.fwc-fp .fc-copy,
.fwc-fp .fc-visit,
.fwc-fp .fc-tag {
  font-family: var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.fwc-fp .fc-head {
  position: absolute;
  inset: 0 0 auto;
  block-size: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5, 24px);
  padding-inline: var(--fc-gut);
  border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09));
  background: var(--ground, #14161b);
  z-index: var(--z-sticky, 200);
  animation: fc-fade 0.8s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-word {
  display: flex;
  align-items: center;
  gap: var(--sp-3, 12px);
  margin: 0;
  font-size: var(--fs-xl, 1.75rem);
  font-weight: var(--weight-display, 640);
  letter-spacing: var(--track-display, -0.035em);
}

.fwc-fp .fc-word-sub {
  color: var(--ink-faint, #6b7283);
}

.fwc-fp .fc-word img {
  inline-size: 28px;
  block-size: 28px;
}

.fwc-fp .fc-af {
  color: var(--ink, #eef0f4);
}

.fwc-fp .fc-as {
  color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-nav {
  display: flex;
  gap: var(--sp-5, 24px);
  margin-inline-start: auto;
}

.fwc-fp .fc-nav a {
  color: var(--ink-soft, #a4aab8);
  text-decoration: none;
  transition: color 0.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-nav a:hover {
  color: var(--ink, #eef0f4);
}

.fwc-fp .fc-tools {
  display: flex;
  align-items: center;
  gap: var(--sp-4, 16px);
}

.fwc-fp .fc-seg {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
}

.fwc-fp .fc-seg-thumb {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 50%;
  background: var(--ink, #eef0f4);
  transition: transform 0.5s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp.is-axon .fc-seg-thumb {
  transform: translateX(100%);
}

.fwc-fp .fc-seg button {
  position: relative;
  block-size: 36px;
  padding-inline: var(--sp-4, 16px);
  color: var(--ink-soft, #a4aab8);
  transition: color 0.3s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-seg button[aria-pressed="true"] {
  color: var(--on-ink, #14161b);
}

.fwc-fp .fc-sun {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
  color: var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-sun input {
  inline-size: 120px;
  accent-color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-sun output {
  min-inline-size: 5ch;
  color: var(--ink, #eef0f4);
}

.fwc-fp .fc-list {
  position: absolute;
  inset-inline-start: var(--fc-gut);
  inset-block-start: 96px;
  inline-size: 210px;
  margin: 0;
  padding: 0;
  list-style: none;
  z-index: var(--z-raised, 100);
}

.fwc-fp .fc-list li {
  animation: fc-rise 0.7s calc(0.3s + 0.06s * var(--n)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-row {
  display: grid;
  grid-template-columns: 30px 1fr;
  column-gap: var(--sp-2, 8px);
  inline-size: 100%;
  text-align: start;
  padding-block: var(--sp-3, 12px);
  border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09));
  transition: transform 0.35s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), color 0.35s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-row-n {
  grid-row: 1 / span 2;
  color: var(--ink-faint, #6b7283);
  padding-block-start: 3px;
}

.fwc-fp .fc-row-name {
  font-size: var(--fs-m, 1rem);
  font-weight: var(--weight-strong, 560);
  letter-spacing: var(--track-tight, -0.015em);
}

.fwc-fp .fc-row-meta {
  color: var(--ink-faint, #6b7283);
  font-size: 11px;
}

.fwc-fp .fc-row-meta b {
  margin-inline-start: var(--sp-2, 8px);
  padding: 0 var(--sp-1, 4px);
  font-weight: 500;
  color: var(--hue, #9a7bd8);
  box-shadow: inset 0 0 0 1px var(--hue, #9a7bd8);
}

.fwc-fp .fc-row.is-hot {
  transform: translateX(8px);
  color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-row.is-hot .fc-row-n,
.fwc-fp .fc-row.is-hot .fc-row-meta {
  color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-stage {
  position: absolute;
  inset: 70px 0 0;
  perspective: 5000px;
  overflow: clip;
  cursor: crosshair;
  touch-action: pan-y;
  user-select: none;
}

.fwc-fp.is-axon .fc-stage {
  cursor: grab;
}

.fwc-fp.is-turning .fc-stage {
  cursor: grabbing;
}

.fwc-fp .fc-anchor {
  position: absolute;
  inset-inline-start: 50%;
  inset-block-start: 50%;
  inline-size: 0;
  block-size: 0;
  transform-style: preserve-3d;
  --k2: calc(var(--k) * var(--k));
  --k3: calc(var(--k) * var(--k) * var(--k));
  --k4: calc(var(--k) * var(--k) * var(--k) * var(--k));
  transform: translate(calc(var(--S) * -1 * (0.11585 * var(--k) - 0.33253 * var(--k2) + 0.3637 * var(--k3) - 0.14656 * var(--k4))), calc(var(--S) * -1 * (-0.08598 * var(--k) + 0.16834 * var(--k2) - 0.09522 * var(--k3) + 0.01027 * var(--k4))));
}

.fwc-fp .fc-cam {
  position: absolute;
  inset-inline-start: calc(var(--S) / -2);
  inset-block-start: calc(var(--S) * -0.32);
  inline-size: var(--S);
  block-size: calc(var(--S) * 0.64);
  transform-style: preserve-3d;
  transform: scale(calc(1 - 0.1 * var(--k))) rotateX(calc(57deg * var(--k))) rotateZ(calc(-40deg * var(--k) + var(--spin)));
}

.fwc-fp .fc-pan {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}

.fwc-fp .fc-sheet {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
}

.fwc-fp .fc-ground {
  position: absolute;
  inset: 0;
  background-color: var(--pane, #1b1e25);
  background-image: linear-gradient(var(--edge-strong, rgb(255 255 255 / 0.18)) 1px, transparent 1px), linear-gradient(90deg, var(--edge-strong, rgb(255 255 255 / 0.18)) 1px, transparent 1px), linear-gradient(var(--edge, rgb(255 255 255 / 0.09)) 1px, transparent 1px), linear-gradient(90deg, var(--edge, rgb(255 255 255 / 0.09)) 1px, transparent 1px);
  background-size: calc(25 * var(--m)) calc(25 * var(--m)), calc(25 * var(--m)) calc(25 * var(--m)), calc(5 * var(--m)) calc(5 * var(--m)), calc(5 * var(--m)) calc(5 * var(--m));
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  animation: fc-wipe 1s 0.1s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-ground svg {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  color: var(--ink-faint, #6b7283);
  overflow: visible;
}

.fwc-fp .fc-drop {
  position: absolute;
  inset: 0;
  transform: translateZ(-2px);
  box-shadow: 0 calc(30 * var(--m)) calc(60 * var(--m)) calc(-10 * var(--m)) var(--shade-strong, rgb(0 0 0 / 0.8));
  opacity: calc(0.4 * var(--k));
  pointer-events: none;
}

.fwc-fp .fc-shadows {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
  overflow: visible;
}

.fwc-fp .fc-sh {
  fill: color-mix(in oklab, var(--ink, #eef0f4) 26%, transparent);
  transition: fill 0.3s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-sh.is-hot {
  fill: color-mix(in oklab, var(--hue, #9a7bd8) 40%, transparent);
}

.fwc-fp .fc-model {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  pointer-events: none;
}

.fwc-fp .fc-model .fc-f,
.fwc-fp .fc-model .fc-tag {
  animation: fc-fade 0.6s calc(0.5s + 0.08s * var(--n)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-box {
  --H: calc(var(--h) * 1.6 * var(--m) * var(--k));
  --E: calc(var(--z, 0) * 1.6 * var(--m) * var(--k));
  --RV: calc(var(--rise, 0) * 1.6 * var(--m) * var(--k));
  --HF: calc(var(--h) * 1.6 * var(--m));
  --RVF: calc(var(--rise, 0) * 1.6 * var(--m));
  --RLF: hypot(calc(var(--w) * var(--m) / 2), var(--RVF));
  --RR: calc(var(--RL) / var(--RLF));
  --RL: hypot(calc(var(--w) * var(--m) / 2), var(--RV));
  --RA: atan2(var(--RV), calc(var(--w) * var(--m) / 2));
  --ct: color-mix(in oklab, var(--ink, #eef0f4) 24%, var(--pane, #1b1e25));
  --cs: color-mix(in oklab, var(--ink, #eef0f4) 14%, var(--pane, #1b1e25));
  --ce: color-mix(in oklab, var(--ink, #eef0f4) 9%, var(--pane, #1b1e25));
  --cn: color-mix(in oklab, var(--ink, #eef0f4) 11%, var(--pane, #1b1e25));
  --cw: color-mix(in oklab, var(--ink, #eef0f4) 16%, var(--pane, #1b1e25));
  position: absolute;
  inset-inline-start: calc(var(--x) * var(--m));
  inset-block-start: calc(var(--y) * var(--m));
  inline-size: calc(var(--w) * var(--m));
  block-size: calc(var(--d) * var(--m));
  transform-style: preserve-3d;
  transform: translateZ(var(--E));
  pointer-events: none;
}

.fwc-fp .fc-box.m-b {
  --ct: color-mix(in oklab, var(--ink, #eef0f4) 32%, var(--pane, #1b1e25));
  --cs: color-mix(in oklab, var(--ink, #eef0f4) 20%, var(--pane, #1b1e25));
  --ce: color-mix(in oklab, var(--ink, #eef0f4) 13%, var(--pane, #1b1e25));
  --cn: color-mix(in oklab, var(--ink, #eef0f4) 16%, var(--pane, #1b1e25));
  --cw: color-mix(in oklab, var(--ink, #eef0f4) 22%, var(--pane, #1b1e25));
}

.fwc-fp .fc-box.m-c {
  --ct: color-mix(in oklab, var(--ink, #eef0f4) 18%, var(--pane, #1b1e25));
  --cs: color-mix(in oklab, var(--ink, #eef0f4) 10%, var(--pane, #1b1e25));
  --ce: color-mix(in oklab, var(--ink, #eef0f4) 6%, var(--pane, #1b1e25));
  --cn: color-mix(in oklab, var(--ink, #eef0f4) 8%, var(--pane, #1b1e25));
  --cw: color-mix(in oklab, var(--ink, #eef0f4) 11%, var(--pane, #1b1e25));
}

.fwc-fp .fc-f {
  position: absolute;
  backface-visibility: hidden;
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  pointer-events: auto;
}

.fwc-fp .fc-f::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--hue, #9a7bd8);
  opacity: 0;
  transition: opacity 0.25s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  pointer-events: none;
}

.fwc-fp .fc-top {
  inset: 0;
  transform: translateZ(var(--H));
  background: var(--ct);
}

.fwc-fp .fc-top::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(45deg, transparent 0 calc(1.6 * var(--m)), var(--ink, #eef0f4) calc(1.6 * var(--m)) calc(1.7 * var(--m)));
  opacity: calc(0.2 * (1 - var(--k)));
}

.fwc-fp .fc-s {
  inset-inline: 0;
  block-size: var(--HF);
  inset-block-start: calc(100% - var(--HF));
  transform-origin: bottom;
  transform: rotateX(-90deg) scaleY(var(--k));
  background-color: var(--cs);
}

.fwc-fp .fc-n {
  inset-inline: 0;
  block-size: var(--HF);
  inset-block-start: 0;
  transform-origin: top;
  transform: rotateX(90deg) scaleY(var(--k));
  background-color: var(--cn);
}

.fwc-fp .fc-e {
  inset-block: 0;
  inline-size: var(--HF);
  inset-inline-start: calc(100% - var(--HF));
  transform-origin: right;
  transform: rotateY(90deg) scaleX(var(--k));
  background-color: var(--ce);
}

.fwc-fp .fc-w {
  inset-block: 0;
  inline-size: var(--HF);
  inset-inline-start: 0;
  transform-origin: left;
  transform: rotateY(-90deg) scaleX(var(--k));
  background-color: var(--cw);
}

.fwc-fp .fc-box.m-c .fc-s,
.fwc-fp .fc-box.m-c .fc-n {
  background-image: repeating-linear-gradient(90deg, transparent 0 calc(3 * var(--m)), var(--edge-strong, rgb(255 255 255 / 0.18)) calc(3 * var(--m)) calc(3.25 * var(--m))), repeating-linear-gradient(0deg, transparent 0 calc(3 * var(--m)), var(--edge-strong, rgb(255 255 255 / 0.18)) calc(3 * var(--m)) calc(3.25 * var(--m)));
}

.fwc-fp .fc-box.m-b .fc-s,
.fwc-fp .fc-box.m-b .fc-n,
.fwc-fp .fc-box.m-b .fc-e,
.fwc-fp .fc-box.m-b .fc-w {
  background-image: repeating-linear-gradient(0deg, transparent 0 calc(2.4 * var(--m)), var(--edge-strong, rgb(255 255 255 / 0.18)) calc(2.4 * var(--m)) calc(2.6 * var(--m)));
}

.fwc-fp .fc-box.is-gab .fc-top {
  display: none;
}

.fwc-fp .fc-rw,
.fwc-fp .fc-re {
  inset-block: 0;
  inline-size: var(--RLF);
  background: var(--ct);
}

.fwc-fp .fc-rw {
  inset-inline-start: 0;
  transform-origin: left;
  transform: translateZ(var(--H)) rotateY(calc(-1 * var(--RA))) scaleX(var(--RR));
}

.fwc-fp .fc-re {
  inset-inline-start: calc(100% - var(--RLF));
  transform-origin: right;
  transform: translateZ(var(--H)) rotateY(var(--RA)) scaleX(var(--RR));
}

.fwc-fp .fc-gn,
.fwc-fp .fc-gs {
  inset-inline: 0;
  block-size: var(--RVF);
  background: var(--cn);
}

.fwc-fp .fc-gn {
  inset-block-start: 0;
  transform-origin: top;
  transform: translateZ(var(--H)) rotateX(90deg) scaleY(var(--k));
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}

.fwc-fp .fc-gs {
  inset-block-start: calc(100% - var(--RVF));
  transform-origin: bottom;
  transform: translateZ(var(--H)) rotateX(-90deg) scaleY(var(--k));
  clip-path: polygon(0 100%, 100% 100%, 50% 0);
  background: var(--cs);
}

.fwc-fp .fc-model.is-hot .fc-f::after {
  opacity: 0.3;
}

.fwc-fp .fc-model.is-hot .fc-top::after,
.fwc-fp .fc-model.is-hot .fc-rw::after,
.fwc-fp .fc-model.is-hot .fc-re::after {
  opacity: 0.62;
}

.fwc-fp.has-sel .fc-model:not(.is-sel) .fc-f {
  opacity: 0.55;
}

.fwc-fp.has-sel .fc-model.is-sel .fc-f::after {
  opacity: 0.3;
}

.fwc-fp.has-sel .fc-model.is-sel .fc-top::after,
.fwc-fp.has-sel .fc-model.is-sel .fc-rw::after,
.fwc-fp.has-sel .fc-model.is-sel .fc-re::after {
  opacity: 0.62;
}

.fwc-fp .fc-f {
  transition: opacity 0.3s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-tag {
  position: absolute;
  inset-inline-start: calc(var(--tx) * var(--m));
  inset-block-start: calc(var(--ty) * var(--m));
  inline-size: 24px;
  block-size: 24px;
  margin: -12px 0 0 -12px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--ink-soft, #a4aab8);
  color: var(--ink, #eef0f4);
  font-size: 11px;
  letter-spacing: 0;
  pointer-events: auto;
  transform: translateZ(calc(var(--tz) * 1.6 * var(--m) * var(--k) + 14px * var(--k))) rotateZ(calc(40deg * var(--k) - var(--spin))) rotateX(calc(-90deg * var(--k)));
  transition: background-color 0.25s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), color 0.25s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), box-shadow 0.25s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-model.is-hot .fc-tag,
.fwc-fp .fc-model.is-sel .fc-tag {
  background: var(--hue, #9a7bd8);
  color: var(--on-ink, #14161b);
  box-shadow: none;
}

.fwc-fp .fc-pin {
  position: absolute;
  inset-inline-start: calc((var(--x) - var(--r)) * var(--m));
  inset-block-start: calc((var(--y) - var(--r)) * var(--m));
  inline-size: calc(2 * var(--r) * var(--m));
  block-size: calc((2 * var(--r) + 0.9 * var(--r) * var(--k)) * var(--m));
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--ink-faint, #6b7283);
  background: color-mix(in oklab, var(--hue, #9a7bd8) 12%, transparent);
  transform-origin: 50% calc(2 * var(--r) * var(--m));
  transform: translateZ(calc(0.9 * var(--r) * var(--m) * var(--k))) rotateZ(calc(40deg * var(--k) - var(--spin))) rotateX(calc(-90deg * var(--k)));
  pointer-events: none;
  animation: fc-grow 0.8s calc(0.5s + 0.022s * var(--n)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-pin::after {
  content: "";
  position: absolute;
  inset-inline-start: 50%;
  inset-block-start: 100%;
  inline-size: 1px;
  block-size: calc(0.9 * var(--r) * var(--m));
  background: var(--ink-faint, #6b7283);
  opacity: var(--k);
}

.fwc-fp .fc-car {
  --h: 1.2;
  --d: 2.2;
  --w: 5;
  --ct: var(--hue, #9a7bd8);
  --cs: color-mix(in oklab, var(--hue, #9a7bd8) 70%, var(--pane, #1b1e25));
  --ce: color-mix(in oklab, var(--hue, #9a7bd8) 55%, var(--pane, #1b1e25));
  --cn: color-mix(in oklab, var(--hue, #9a7bd8) 62%, var(--pane, #1b1e25));
  --cw: color-mix(in oklab, var(--hue, #9a7bd8) 66%, var(--pane, #1b1e25));
  --x: 3;
  --y: 63.9;
}

.fwc-fp .fc-car.is-move {
  animation: fc-drive 24s linear infinite;
}

.fwc-fp.is-idle .fc-car.is-move {
  animation-play-state: paused;
}

.fwc-fp .fc-cross {
  position: absolute;
  background: var(--hue, #9a7bd8);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-cross-x {
  inset-inline: 0;
  inset-block-start: 0;
  block-size: 1px;
}

.fwc-fp .fc-cross-y {
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 1px;
}

.fwc-fp.is-cross .fc-cross {
  opacity: 0.55;
}

.fwc-fp .fc-tip {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  padding: var(--sp-2, 8px) var(--sp-3, 12px);
  background: var(--float, #242833);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  z-index: var(--z-tooltip, 900);
  transition: opacity 0.15s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-tip.is-on {
  opacity: 1;
}

.fwc-fp .fc-tip span {
  display: block;
  color: var(--ink-faint, #6b7283);
  font-size: 11px;
}

.fwc-fp .fc-coord {
  position: absolute;
  inset-inline-start: var(--fc-gut);
  inset-block-end: var(--fc-gut);
  color: var(--ink-faint, #6b7283);
  z-index: var(--z-raised, 100);
  transition: color 0.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-coord.is-live {
  color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-scale {
  position: absolute;
  inset-inline-start: var(--fc-gut);
  inset-block-end: calc(var(--fc-gut) + 30px);
  inline-size: calc(40 * var(--m));
  z-index: var(--z-raised, 100);
}

.fwc-fp .fc-scale-bar {
  display: flex;
  block-size: 6px;
  box-shadow: inset 0 0 0 1px var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-scale-bar i {
  display: block;
}

.fwc-fp .fc-scale-bar i:nth-child(odd) {
  background: var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-scale-lab {
  display: flex;
  justify-content: space-between;
  margin-block-start: var(--sp-1, 4px);
  color: var(--ink-faint, #6b7283);
  font-size: 11px;
  letter-spacing: 0.06em;
  inline-size: calc(100% + 3ch);
}

.fwc-fp .fc-north {
  position: absolute;
  inset-inline-start: var(--fc-gut);
  inset-block-end: calc(var(--fc-gut) + 76px);
  inline-size: 40px;
  block-size: 40px;
  display: grid;
  place-items: center;
  color: var(--ink-soft, #a4aab8);
  z-index: var(--z-raised, 100);
  transform: rotate(calc(-40deg * var(--k) + var(--spin)));
}

.fwc-fp .fc-north svg {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.fwc-fp .fc-north span {
  font-family: var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 10px;
  margin-block-start: 6px;
}

.fwc-fp .fc-tblock {
  position: absolute;
  inset-inline-end: var(--fc-gut);
  inset-block-end: var(--fc-gut);
  inline-size: 320px;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  z-index: var(--z-raised, 100);
  animation: fc-rise 0.8s 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-tb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp-3, 12px);
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09));
  color: var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-tb-head {
  color: var(--ink, #eef0f4);
}

.fwc-fp .fc-tb-name {
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: var(--fs-l, 1.125rem);
  font-weight: var(--weight-display, 640);
  letter-spacing: var(--track-display, -0.035em);
  text-transform: none;
}

.fwc-fp .fc-tb-row span {
  white-space: nowrap;
}

.fwc-fp .fc-tb-row span:first-child:not(.fc-dot):not(.fc-tb-name) {
  white-space: normal;
}

.fwc-fp .fc-tb-three span {
  flex: 1;
}

.fwc-fp .fc-tb-three span:nth-child(2) {
  text-align: center;
}

.fwc-fp .fc-tb-three span:last-child {
  text-align: end;
}

.fwc-fp .fc-tb-avail {
  justify-content: flex-start;
}

.fwc-fp .fc-dot {
  position: relative;
  inline-size: 8px;
  block-size: 8px;
  background: var(--hue, #9a7bd8);
  flex: none;
}

.fwc-fp .fc-dot::after {
  content: "";
  position: absolute;
  inset: -4px;
  border: 1px solid var(--hue, #9a7bd8);
  opacity: 0.4;
}

.fwc-fp .fc-tb-act {
  padding: 0;
  gap: 0;
  border-block-end: 0;
}

.fwc-fp .fc-copy,
.fwc-fp .fc-visit {
  block-size: 44px;
  display: grid;
  place-items: center;
  text-decoration: none;
  transition: background-color 0.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), color 0.2s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-copy {
  flex: 1;
  background: var(--control, #2b303c);
  color: var(--ink, #eef0f4);
}

.fwc-fp .fc-copy:hover {
  background: var(--hue, #9a7bd8);
  color: var(--on-ink, #14161b);
}

.fwc-fp .fc-copy.is-ok {
  background: var(--ink, #eef0f4);
  color: var(--on-ink, #14161b);
}

.fwc-fp .fc-visit {
  padding-inline: var(--sp-4, 16px);
  color: var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-visit:hover {
  background: var(--ink, #eef0f4);
  color: var(--on-ink, #14161b);
}

.fwc-fp .fc-card {
  position: absolute;
  inset-inline-end: var(--fc-gut);
  inset-block-start: 86px;
  inset-block-end: calc(var(--fc-gut) + 200px);
  inline-size: 320px;
  overflow: auto;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)), var(--shadow-window);
  border-radius: var(--radius-l, 16px);
  transform: translateX(calc(100% + 40px));
  transition: transform 0.7s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  z-index: var(--z-overlay, 600);
}

.fwc-fp .fc-card.is-open {
  transform: none;
}

.fwc-fp .fc-close {
  position: absolute;
  inset-block-start: var(--sp-3, 12px);
  inset-inline-end: var(--sp-3, 12px);
  inline-size: 36px;
  block-size: 36px;
  display: grid;
  place-items: center;
  background: var(--bar-veil, rgb(20 22 27 / 0.92));
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  color: var(--ink, #eef0f4);
  z-index: var(--z-raised, 100);
}

.fwc-fp .fc-close svg {
  transition: transform 0.4s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-close:hover svg {
  transform: rotate(90deg);
}

.fwc-fp .fc-card-in {
  animation: fc-fade 0.4s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-pic {
  position: relative;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  animation: fc-pic 0.8s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-pic img {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  animation: fc-pic-img 0.8s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) backwards;
}

.fwc-fp .fc-card-body {
  display: grid;
  gap: var(--sp-3, 12px);
  padding: var(--sp-4, 16px);
}

.fwc-fp .fc-card-count {
  margin: 0;
  color: var(--hue, #9a7bd8);
}

.fwc-fp .fc-card h2 {
  margin: 0;
  font-size: var(--fs-xl, 1.75rem);
  font-weight: var(--weight-display, 640);
  letter-spacing: var(--track-display, -0.035em);
  line-height: 1.05;
}

.fwc-fp .fc-card p {
  color: var(--ink-soft, #a4aab8);
  margin: 0;
}

.fwc-fp .fc-dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
  border-block-start: 1px solid var(--edge, rgb(255 255 255 / 0.09));
  border-inline-start: 1px solid var(--edge, rgb(255 255 255 / 0.09));
}

.fwc-fp .fc-dl div {
  padding: var(--sp-2, 8px) var(--sp-3, 12px);
  border-block-end: 1px solid var(--edge, rgb(255 255 255 / 0.09));
  border-inline-end: 1px solid var(--edge, rgb(255 255 255 / 0.09));
}

.fwc-fp .fc-dl dt {
  color: var(--ink-faint, #6b7283);
  font-size: 11px;
}

.fwc-fp .fc-dl dd {
  margin: 2px 0 0;
  font-size: var(--fs-s, 0.875rem);
}

.fwc-fp .fc-card-act {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
}

.fwc-fp .fc-card-act .fc-arrow {
  inline-size: 48px;
  block-size: 48px;
  display: grid;
  place-items: center;
  background: var(--inset, #101216);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  color: var(--ink-soft, #a4aab8);
}

.fwc-fp .fc-card-act .fc-arrow:hover {
  color: var(--ink, #eef0f4);
  background: var(--control, #2b303c);
}

.fwc-fp .fc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2, 8px);
  block-size: var(--control-h, 40px);
  padding-inline: var(--sp-4, 16px);
  border-radius: var(--radius-m, 10px);
  font-size: var(--fs-s, 0.875rem);
  font-weight: var(--weight-strong, 560);
  text-decoration: none;
  white-space: nowrap;
  background: var(--ink, #eef0f4);
  color: var(--on-ink, #14161b);
  transition: background-color var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), opacity var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-fp .fc-btn:hover {
  opacity: 0.88;
}

@keyframes fc-fade {
  from {
    opacity: 0;
  }
}

@keyframes fc-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@keyframes fc-wipe {
  from {
    clip-path: inset(0 100% 0 0);
  }
}

@keyframes fc-grow {
  from {
    scale: 0;
  }
}

@keyframes fc-drive {
  to {
    translate: calc(189 * var(--m)) 0;
  }
}

@keyframes fc-pic {
  from {
    clip-path: inset(0 0 100% 0);
  }
}

@keyframes fc-pic-img {
  from {
    transform: scale(1.08);
  }
}

@media (max-width: 1100px) {
  .fwc-fp {
    --S: min(62vw, calc((var(--fc-h) - 220px) / 0.64), 940px);
  }
}

@media (max-width: 1024px) {
  .fwc-fp .fc-nav {
    display: none;
  }

  .fwc-fp .fc-list {
    inline-size: 180px;
  }
}

@media (max-width: 767px) {
  .fwc-fp {
    --S: min(86vw, 600px);
    display: flex;
    flex-direction: column;
    padding-block-end: var(--sp-5, 24px);
  }

  .fwc-fp .fc-head {
    position: relative;
    block-size: auto;
    flex-wrap: wrap;
    padding-block: var(--sp-3, 12px);
  }

  .fwc-fp .fc-tools {
    inline-size: 100%;
    justify-content: space-between;
  }

  .fwc-fp .fc-stage {
    position: relative;
    inset: auto;
    block-size: calc(var(--S) * 0.95);
    flex: none;
  }

  .fwc-fp .fc-list {
    position: static;
    inline-size: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: var(--sp-5, 24px);
    padding-inline: var(--fc-gut);
    min-block-size: 252px;
    order: 3;
  }

  .fwc-fp .fc-tblock {
    position: static;
    inline-size: auto;
    margin: var(--sp-5, 24px) var(--fc-gut) 0;
    order: 4;
  }

  .fwc-fp .fc-coord,
  .fwc-fp .fc-north,
  .fwc-fp .fc-scale,
  .fwc-fp .fc-cross {
    display: none;
  }

  .fwc-fp .fc-card {
    position: fixed;
    inset: auto 10px 10px;
    inline-size: auto;
    max-block-size: 72svh;
    transform: translateY(calc(100% + 20px));
  }

  .fwc-fp .fc-card.is-open {
    transform: none;
  }
}

@media (hover: none) {
  .fwc-fp .fc-tip {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fwc-fp,
  .fwc-fp *,
  .fwc-fp *::before,
  .fwc-fp *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
  }
}

.fwc-fp.is-rm,
.fwc-fp.is-rm *,
.fwc-fp.is-rm *::before,
.fwc-fp.is-rm *::after {
  animation: none !important;
  transition-duration: 0.01ms !important;
  transition-delay: 0s !important;
}
`;

const DEFAULT_PARTS = [
  { t: "Bracket", type: "Part", ws: "Modelling", flag: "3D", img: { 640: "https://media.formai.studio/media/formcad/ui-hero-2/f0fcfc251ec1.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-hero-2/f0fcfc251ec1.w1024.webp" }, alt: "The FormCAD workspace with an L-shaped bracket with a gusset and three holes in the viewport and its feature tree at the right", d: "A parametric part with a feature tree on an OpenCascade kernel. Open any feature, change its radius or depth, and the rest of the part rebuilds.", exp: "STEP, IGES, STL", tag: [40, 46, 24],
    parts: [{ x: 22, y: 34, w: 36, d: 24, h: 4 }, { x: 22, y: 34, w: 36, d: 5, h: 22, m: "b" }, { x: 36, y: 39, w: 6, d: 19, z: 4, h: 10 }] },
  { t: "Feature tree", type: "Part", ws: "Features", flag: "3D", img: { 640: "https://media.formai.studio/media/formcad/ui-feature-tree-2/03115b51ed14.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-feature-tree-2/03115b51ed14.w1024.webp" }, alt: "The FormCAD feature tree open on a bent plate, with a fillet dialog over the viewport", d: "Roll back through the feature tree to see the part at any step. A failed feature is marked with its reason and never silently changes the model.", exp: "STEP, 3MF, GLB", tag: [87, 31, 16],
    parts: [{ x: 72, y: 16, w: 30, d: 30, h: 3 }, { x: 80, y: 24, w: 14, d: 14, z: 3, h: 12, m: "b" }, { x: 72, y: 16, w: 30, d: 4, z: 3, h: 8, m: "c" }] },
  { t: "Drawing sheet", type: "Layout", ws: "Drafting", flag: "2D", img: { 640: "https://media.formai.studio/media/formcad/ui-drawing-2/7263fab296b8.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-drawing-2/7263fab296b8.w1024.webp" }, alt: "A FormCAD drawing layout with front, top, side and isometric views of a bracket and a title block", d: "Place base, projected, section and detail views in first or third angle on a layout. Views update when the part changes.", exp: "PDF, PNG, SVG", tag: [151, 36, 13],
    parts: [{ x: 118, y: 14, w: 66, d: 44, h: 1, m: "c" }, { x: 122, y: 19, w: 18, d: 14, z: 1, h: 5 }, { x: 146, y: 19, w: 14, d: 14, z: 1, h: 11 }, { x: 164, y: 19, w: 16, d: 14, z: 1, h: 7, m: "b" }, { x: 122, y: 39, w: 58, d: 14, z: 1, h: 2 }] },
  { t: "Node graph", type: "Graph", ws: "Nodes", flag: "3D", img: { 640: "https://media.formai.studio/media/formcad/ui-graph-2/8c27f8b85e82.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-graph-2/8c27f8b85e82.w1024.webp" }, alt: "The FormCAD node graph: wired nodes for a plate with holes, with data flowing into cut, mesh and section length nodes", d: "Build geometry from wired nodes with data trees. The window, the command line and an MCP server all call the same commands.", exp: "DXF, SVG", tag: [52, 88, 16],
    parts: [{ x: 18, y: 78, w: 16, d: 10, h: 6 }, { x: 44, y: 74, w: 16, d: 10, h: 10, m: "b" }, { x: 44, y: 90, w: 16, d: 10, h: 6 }, { x: 70, y: 82, w: 16, d: 14, h: 12, g: 5, m: "c" }] },
  { t: "Surface", type: "Surface", ws: "NURBS", flag: "3D", img: { 640: "https://media.formai.studio/media/formcad/ui-surface-2/22c7c43d04d8.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-surface-2/22c7c43d04d8.w1024.webp" }, alt: "A FormCAD NURBS surface rendered with black and white zebra stripes to check continuity", d: "Loft, sweep, blend and match surfaces to G2, then read continuity at the seams with zebra, curvature, draft and deviation.", exp: "3DM, STEP", tag: [143, 89, 18],
    parts: [{ x: 118, y: 78, w: 10, d: 22, h: 6, m: "b" }, { x: 128, y: 78, w: 10, d: 22, h: 10, m: "b" }, { x: 138, y: 78, w: 10, d: 22, h: 12, g: 4, m: "b" }, { x: 148, y: 78, w: 10, d: 22, h: 10, m: "b" }, { x: 158, y: 78, w: 10, d: 22, h: 6, m: "b" }] },
  { t: "Light workspace", type: "Appearance", ws: "Light", flag: "3D", img: { 640: "https://media.formai.studio/media/formcad/ui-hero-light-2/580e29d14ea0.w640.webp", 1024: "https://media.formai.studio/media/formcad/ui-hero-light-2/580e29d14ea0.w1024.webp" }, alt: "The FormCAD workspace in the light appearance with the same bracket on a pale grid", d: "The same bracket in the light workspace. FormCAD runs on your own computer with no account, and saves its own .fcad projects.", exp: "STL, OBJ, PLY", tag: [183, 93, 18],
    parts: [{ x: 172, y: 84, w: 22, d: 18, h: 8, m: "c" }, { x: 177, y: 88, w: 12, d: 10, z: 8, h: 8 }] }
];

const DEFAULT_ICON = "data:image/webp;base64,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";

const DEFAULT_NAV = [
  { label: "Overview", href: "https://formai.studio/formcad/" },
  { label: "Apps", href: "https://formai.studio/apps/" },
  { label: "Download", href: "https://formai.studio/download/" },
  { label: "Docs", href: "https://formai.studio/docs/" }
];

const DEFAULT_TEXT = {
  view: "View",
  plan: "Plan",
  axon: "Axon",
  sun: "Sun time",
  parts: "Parts",
  hintTurn: "Drag to turn",
  hintMove: "Move over the sheet",
  copy: "Copy link",
  copied: "Copied",
  of: "of",
  drafting: "Drafting",
  modelling: "3D",
  type: "Type",
  workspace: "Workspace",
  saves: "Saves as",
  savesValue: ".fcad",
  exports: "Exports",
  prev: "Previous part",
  next: "Next part",
  close: "Close",
  about: "About FormCAD",
  download: "Download",
  north: "N",
  scaleUnit: "40 mm"
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = (n) => String(n).padStart(2, "0");

const ICON = (d) => `<svg class="fc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const SUN_PATHS = '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="M5.3 5.3l1.4 1.4"/><path d="M17.3 17.3l1.4 1.4"/><path d="M5.3 18.7l1.4-1.4"/><path d="M17.3 6.7l1.4-1.4"/>';

function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.slice().reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export function mount(root, props, ctx) {
  const pr = props || {};
  const P = Array.isArray(pr.parts) && pr.parts.length ? pr.parts : DEFAULT_PARTS;
  const NAV = Array.isArray(pr.nav) ? pr.nav : DEFAULT_NAV;
  const T = { ...DEFAULT_TEXT, ...(pr.text && typeof pr.text === "object" ? pr.text : {}) };
  const LINK = String(pr.link ?? "https://formai.studio/formcad/");
  const DL = String(pr.downloadHref ?? "https://formai.studio/download/");
  const name = String(pr.name ?? "FormCAD");
  const nm = /^(Form)(.+)$/.exec(name);
  const nameHtml = nm ? `<span class="fc-af">${esc(nm[1])}</span><span class="fc-as">${esc(nm[2])}</span>` : `<span class="fc-as">${esc(name)}</span>`;
  const icon = String(pr.icon || DEFAULT_ICON);
  const sunStart = Math.min(20, Math.max(6, Number(pr.sunStart ?? 17.5) || 17.5));
  const startMode = pr.startMode === "plan" ? "plan" : "axon";
  const N = P.length;

  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);

  const el = document.createElement("section");
  el.className = "fwc-fp fc-wrap" + (startMode === "axon" ? " is-axon" : "");
  el.setAttribute("aria-label", name + " drawing sheet");
  el.innerHTML = `
  <header class="fc-head">
    <p class="fc-word"><img src="${esc(ctx.asset(icon))}" width="28" height="28" alt="" decoding="async"><span class="fc-word-name">${nameHtml}</span><span class="fc-word-sub">${esc(pr.sub ?? "Sheet")}</span></p>
    <nav class="fc-nav" aria-label="${esc(name)}">${NAV.map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join("")}</nav>
    <div class="fc-tools">
      <div class="fc-seg" role="radiogroup" aria-label="${esc(T.view)}">
        <span class="fc-seg-thumb" aria-hidden="true"></span>
        <button type="button" aria-pressed="${startMode === "plan"}" data-mode="plan">${esc(T.plan)}</button>
        <button type="button" aria-pressed="${startMode === "axon"}" data-mode="axon">${esc(T.axon)}</button>
      </div>
      <label class="fc-sun">
        ${ICON(SUN_PATHS).replace('class="fc-ic"', 'class="fc-ic fc-ic-s"')}
        <span class="fc-sr">${esc(T.sun)}</span>
        <input type="range" class="fc-sun-in" min="6" max="20" step="0.25" value="${sunStart}" aria-label="${esc(T.sun)}">
        <output class="fc-sun-out"></output>
      </label>
    </div>
  </header>
  <ol class="fc-list" aria-label="${esc(T.parts)}"></ol>
  <div class="fc-stage">
    <div class="fc-anchor"><div class="fc-cam"><div class="fc-pan"><div class="fc-sheet"></div></div></div></div>
    <span class="fc-cross fc-cross-x" aria-hidden="true"></span>
    <span class="fc-cross fc-cross-y" aria-hidden="true"></span>
    <div class="fc-tip" aria-hidden="true"></div>
  </div>
  <div class="fc-coord" aria-live="off"></div>
  <div class="fc-north" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 4l3.5 9H8.5z"/></svg>
    <span>${esc(T.north)}</span>
  </div>
  <div class="fc-scale" aria-hidden="true">
    <div class="fc-scale-bar"><i style="flex:5"></i><i style="flex:5"></i><i style="flex:10"></i><i style="flex:20"></i></div>
    <div class="fc-scale-lab"><span>0</span><span>10</span><span>20</span><span>${esc(T.scaleUnit)}</span></div>
  </div>
  <div class="fc-tblock">
    <div class="fc-tb-row fc-tb-head"><span class="fc-tb-name">${nameHtml}</span><span class="fc-tb-desc">${esc(pr.descr ?? "CAD studio")}</span></div>
    <div class="fc-tb-row"><span>${esc(pr.note ?? "Parts, sheets and surfaces explored")}</span><span class="fc-tb-sheet">${esc(pr.sheet ?? "Sheet 01")}</span></div>
    <div class="fc-tb-row fc-tb-three"><span>${esc(pr.units ?? "Units mm")}</span><span class="fc-date">00.00.0000</span><span class="fc-time">00:00</span></div>
    <div class="fc-tb-row fc-tb-avail"><span class="fc-dot" aria-hidden="true"></span><span>${esc(pr.avail ?? "Free, no account needed")}</span></div>
    <div class="fc-tb-row fc-tb-act">
      <button type="button" class="fc-copy"><span class="fc-copy-label">${esc(T.copy)}</span></button>
      <a class="fc-visit" href="${esc(DL)}">${esc(T.download)}</a>
    </div>
  </div>
  <aside class="fc-card" aria-label="${esc(T.parts)}" inert>
    <button type="button" class="fc-close" aria-label="${esc(T.close)}">${ICON('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>')}</button>
    <div class="fc-card-in"></div>
  </aside>`;
  root.append(el);

  const q = (s) => el.querySelector(s);
  const stage = q(".fc-stage");
  const sheet = q(".fc-sheet");
  const list = q(".fc-list");
  const tip = q(".fc-tip");
  const card = q(".fc-card");
  let cardIn = q(".fc-card-in");
  const coord = q(".fc-coord");
  const crossX = q(".fc-cross-x");
  const crossY = q(".fc-cross-y");
  const offs = [];
  const on = (target, type, fn, opt) => {
    target.addEventListener(type, fn, opt);
    offs.push(() => target.removeEventListener(type, fn, opt));
  };
  const rm = () => ctx.reduced;
  const applyReduced = () => el.classList.toggle("is-rm", !!ctx.reduced);
  applyReduced();

  const rnd = ((s) => () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  })(7);

  const boxes = [];
  P.forEach((p, i) => (p.parts || []).forEach((b) => boxes.push({ ...b, mi: i, z: b.z || 0, g: b.g || 0 })));
  const blocks = P.flatMap((p) => p.parts || []).map((b) => [b.x - 4, b.y - 4, b.x + b.w + 4, b.y + b.d + 4]);
  const pins = [];
  let guard = 0;
  while (pins.length < 38 && guard++ < 4000) {
    const r = 1.1 + rnd() * 1.2;
    const x = 6 + rnd() * 188;
    const y = 6 + rnd() * 116;
    const inRoad = (y > 59 && y < 73) || (x > 101 && x < 115);
    const inPlaza = x > 42 && x < 82 && y > 104;
    const inPond = Math.hypot(x - 92, y - 114) < 10;
    const inBlock = blocks.some((b) => x > b[0] - r && x < b[2] + r && y > b[1] - r && y < b[3] + r);
    if (!inRoad && !inPlaza && !inPond && !inBlock) pins.push({ x, y, r });
  }

  const faceHtml = (b) => {
    const g = b.g > 0;
    return `<i class="fc-f fc-top"></i><i class="fc-f fc-s"></i><i class="fc-f fc-n"></i><i class="fc-f fc-e"></i><i class="fc-f fc-w"></i>${g ? '<i class="fc-f fc-rw"></i><i class="fc-f fc-re"></i><i class="fc-f fc-gn"></i><i class="fc-f fc-gs"></i>' : ""}`;
  };
  const boxEl = (b) => `<div class="fc-box ${b.m ? "m-" + esc(b.m) : ""} ${b.g > 0 ? "is-gab" : ""}" data-sv="--x:${+b.x};--y:${+b.y};--w:${+b.w};--d:${+b.d};--h:${+b.h};--z:${+b.z};--rise:${+b.g}">${faceHtml(b)}</div>`;

  const hatch = [
    [6, 6, 62, 20],
    [118, 106, 76, 16],
    [6, 106, 34, 16],
    [66, 50, 36, 8]
  ];
  const ground = `<svg viewBox="0 0 200 128" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><pattern id="fc-hp" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" stroke-width="0.3"/></pattern></defs>
${hatch.map((h) => `<rect x="${h[0]}" y="${h[1]}" width="${h[2]}" height="${h[3]}" fill="url(#fc-hp)" stroke="currentColor" stroke-width="0.3"/>`).join("")}
<rect x="44" y="106" width="36" height="16" fill="none" stroke="currentColor" stroke-width="0.3"/>
<circle cx="92" cy="114" r="7" fill="none" stroke="currentColor" stroke-width="0.3" stroke-dasharray="1.2 0.8"/>
<rect x="0" y="62" width="200" height="8" fill="none" stroke="currentColor" stroke-width="0.3"/>
<rect x="104" y="0" width="8" height="128" fill="var(--pane, #1b1e25)" stroke="none"/>
<path d="M104 0V62M104 70V128M112 0V62M112 70V128" stroke="currentColor" stroke-width="0.3" fill="none"/>
<path d="M0 66H200" stroke="currentColor" stroke-width="0.3" stroke-dasharray="4 1.2 0.8 1.2" fill="none"/>
<path d="M108 0V62M108 70V128" stroke="currentColor" stroke-width="0.3" stroke-dasharray="4 1.2 0.8 1.2" fill="none"/>
<path d="M0 60.5H104M112 60.5H200M0 71.5H104M112 71.5H200M102.5 0V60M102.5 72V128M113.5 0V60M113.5 72V128" stroke="currentColor" stroke-width="0.2" fill="none" opacity="0.6"/>
<g fill="none" stroke="currentColor" stroke-width="0.3"><rect x="38" y="58" width="8" height="4"/><rect x="90" y="46" width="8" height="16"/><rect x="140" y="58" width="8" height="4"/><rect x="28" y="70" width="8" height="8"/><rect x="140" y="70" width="8" height="8"/><rect x="180" y="70" width="8" height="14"/></g>
<rect x="3" y="3" width="194" height="122" fill="none" stroke="currentColor" stroke-width="0.35" stroke-dasharray="3 1.5"/></svg>`;

  const shadowSvg = `<svg class="fc-shadows" viewBox="0 0 200 128" preserveAspectRatio="none" aria-hidden="true" focusable="false">${boxes.map((b, i) => `<polygon class="fc-sh" data-m="${b.mi}" data-b="${i}"/>`).join("")}${pins.map((p, i) => `<circle class="fc-sh fc-sh-pin" data-p="${i}"/>`).join("")}</svg>`;

  const label = (i) => `${pad(i + 1)} ${P[i].t}, ${P[i].type}, ${P[i].ws}, ${P[i].flag}`;
  const models = P.map((p, i) => {
    const bs = boxes.filter((b) => b.mi === i);
    const t = p.tag || [0, 0, 0];
    return `<div class="fc-model" data-i="${i}" data-sv="--n:${i}">${bs.map((b) => boxEl(b)).join("")}<button type="button" class="fc-tag" tabindex="0" data-sv="--tx:${+t[0]};--ty:${+t[1]};--tz:${+t[2]}" aria-label="${esc(label(i))}">${pad(i + 1)}</button></div>`;
  }).join("");

  const carFaces = '<i class="fc-f fc-top"></i><i class="fc-f fc-s"></i><i class="fc-f fc-n"></i><i class="fc-f fc-e"></i><i class="fc-f fc-w"></i>';
  const cars = [
    `<div class="fc-box fc-car is-move" data-sv="--z:0">${carFaces}</div>`,
    `<div class="fc-box fc-car" data-sv="--x:40;--y:67.4;--z:0">${carFaces}</div>`,
    `<div class="fc-box fc-car" data-sv="--x:150;--y:63.8;--z:0">${carFaces}</div>`
  ].join("");

  sheet.innerHTML = `<div class="fc-drop"></div><div class="fc-ground">${ground}</div>${shadowSvg}${cars}${pins.map((p, i) => `<i class="fc-pin" data-sv="--x:${p.x.toFixed(2)};--y:${p.y.toFixed(2)};--r:${p.r.toFixed(2)};--n:${i}"></i>`).join("")}${models}`;

  list.innerHTML = P.map((p, i) => `<li data-sv="--n:${i}"><button type="button" class="fc-row" data-i="${i}" aria-label="${esc(label(i))}"><span class="fc-row-n">${pad(i + 1)}</span><span class="fc-row-name">${esc(p.t)}</span><span class="fc-row-meta">${esc(p.type)}, ${esc(p.ws)}<b>${esc(p.flag)}</b></span></button></li>`).join("");

  for (const node of el.querySelectorAll("[data-sv]")) {
    for (const decl of node.dataset.sv.split(";")) {
      const at = decl.indexOf(":");
      node.style.setProperty(decl.slice(0, at), decl.slice(at + 1));
    }
    node.removeAttribute("data-sv");
  }

  const polys = [...sheet.querySelectorAll("polygon.fc-sh")];
  const circles = [...sheet.querySelectorAll("circle.fc-sh")];

  function shadows(hour) {
    const f = (hour - 6) / 14;
    const az = ((90 + 180 * f) * Math.PI) / 180;
    const alt = (Math.max(6, 62 * Math.sin(Math.PI * f)) * Math.PI) / 180;
    const inv = 1 / Math.tan(alt);
    const vx = Math.sin(az + Math.PI) * inv;
    const vy = -Math.cos(az + Math.PI) * inv;
    boxes.forEach((b, i) => {
      const lo = b.z * 1.6;
      const hi = (b.z + b.h + 0.6 * b.g) * 1.6;
      const pts = [];
      for (const e of [lo, hi]) {
        for (const [cx, cy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]]) pts.push([cx + vx * e, cy + vy * e]);
      }
      polys[i].setAttribute("points", hull(pts).map((c) => c[0].toFixed(2) + "," + c[1].toFixed(2)).join(" "));
    });
    circles.forEach((c, i) => {
      const pn = pins[i];
      c.setAttribute("cx", (pn.x + vx * 2.2 * pn.r).toFixed(2));
      c.setAttribute("cy", (pn.y + vy * 2.2 * pn.r).toFixed(2));
      c.setAttribute("r", (0.9 * pn.r).toFixed(2));
    });
  }

  const sun = q(".fc-sun-in");
  const sunOut = q(".fc-sun-out");
  const fmtHour = (h) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;
  const onSun = () => {
    const h = Number(sun.value);
    sunOut.textContent = fmtHour(h);
    shadows(h);
  };
  on(sun, "input", onSun);
  onSun();

  let mode = startMode;
  let spin = 0;
  const segBtns = [...el.querySelectorAll("[data-mode]")];
  let drag = null;
  let glideId = 0;
  let glideV = 0;
  function stopGlide() {
    if (glideId) cancelAnimationFrame(glideId);
    glideId = 0;
    glideV = 0;
    if (!drag || !drag.on) el.classList.remove("is-turning");
  }
  function glide(v) {
    glideV = v;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(now - last, 32);
      last = now;
      spin += glideV * dt;
      glideV *= Math.exp(-dt / 260);
      el.style.setProperty("--spin", spin + "deg");
      if (Math.abs(glideV) < 0.002) {
        stopGlide();
        return;
      }
      glideId = requestAnimationFrame(frame);
    };
    glideId = requestAnimationFrame(frame);
  }
  function setMode(m) {
    mode = m;
    el.classList.toggle("is-axon", m === "axon");
    segBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    stopGlide();
    if (m === "plan") {
      spin = 0;
      el.style.setProperty("--spin", "0deg");
    }
    hideCross();
    setCoord(null);
  }
  segBtns.forEach((b) => on(b, "click", () => setMode(b.dataset.mode)));

  let hover = -1;
  let sel = -1;
  const modelEls = [...sheet.querySelectorAll(".fc-model")];
  const rows = [...list.querySelectorAll(".fc-row")];
  function paint() {
    modelEls.forEach((m, i) => {
      m.classList.toggle("is-hot", i === hover);
      m.classList.toggle("is-sel", i === sel);
    });
    rows.forEach((r, i) => r.classList.toggle("is-hot", i === hover || i === sel));
    polys.forEach((p) => p.classList.toggle("is-hot", Number(p.dataset.m) === hover || Number(p.dataset.m) === sel));
  }
  function setHover(i, e) {
    hover = i;
    paint();
    if (i >= 0 && sel < 0 && e && e.pointerType !== "touch") {
      const p = P[i];
      tip.innerHTML = `${pad(i + 1)} ${esc(p.t)}<span>${esc(p.type)}, ${esc(p.ws)}, ${esc(p.flag)}</span>`;
      tip.classList.add("is-on");
    } else tip.classList.remove("is-on");
  }

  on(stage, "pointerover", (e) => {
    const m = e.target.closest(".fc-model");
    if (m) setHover(Number(m.dataset.i), e);
  });
  on(stage, "pointerout", (e) => {
    const m = e.target.closest(".fc-model");
    if (m && !(e.relatedTarget && m.contains(e.relatedTarget))) setHover(-1);
  });
  on(sheet, "focusin", (e) => {
    const m = e.target.closest(".fc-model");
    if (m) setHover(Number(m.dataset.i));
  });
  on(sheet, "focusout", () => setHover(-1));
  rows.forEach((r, i) => {
    on(r, "pointerenter", (e) => e.pointerType !== "touch" && setHover(i, null));
    on(r, "pointerleave", () => setHover(-1));
    on(r, "focus", () => setHover(i, null));
    on(r, "blur", () => setHover(-1));
    on(r, "click", () => toggle(i));
  });

  const arrow = (d, paths) => `<button type="button" class="fc-arrow" data-d="${d}" aria-label="${esc(d < 0 ? T.prev : T.next)}">${ICON(paths)}</button>`;
  function renderCard() {
    const p = P[sel];
    const img = p.img || {};
    const big = ctx.asset(img[1024] || img[640] || "");
    const small = ctx.asset(img[640] || img[1024] || "");
    const fresh = cardIn.cloneNode(false);
    fresh.innerHTML = `<div class="fc-pic"><img src="${esc(big)}" srcset="${esc(small)} 640w, ${esc(big)} 1024w" sizes="320px" width="1024" height="640" alt="${esc(p.alt)}" decoding="async"></div><div class="fc-card-body"><p class="fc-card-count">${pad(sel + 1)} ${esc(T.of)} ${pad(N)}, ${esc(p.flag === "2D" ? T.drafting : T.modelling)}</p><h2>${esc(p.t)}</h2><p>${esc(p.d)}</p><dl class="fc-dl"><div><dt>${esc(T.type)}</dt><dd>${esc(p.type)}</dd></div><div><dt>${esc(T.workspace)}</dt><dd>${esc(p.ws)}</dd></div><div><dt>${esc(T.saves)}</dt><dd>${esc(T.savesValue)}</dd></div><div><dt>${esc(T.exports)}</dt><dd>${esc(p.exp)}</dd></div></dl><div class="fc-card-act">${arrow(-1, '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>')}${arrow(1, '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>')}<a class="fc-btn" href="${esc(p.flag === "2D" ? DL : LINK)}">${esc(p.flag === "2D" ? T.download : T.about)}</a></div></div>`;
    cardIn.replaceWith(fresh);
    cardIn = fresh;
    on(fresh, "click", (e) => {
      const b = e.target.closest("[data-d]");
      if (b) step(Number(b.dataset.d));
    });
  }

  function select(i) {
    const was = sel;
    sel = i;
    el.classList.toggle("has-sel", sel >= 0);
    card.classList.toggle("is-open", sel >= 0);
    card.inert = sel < 0;
    if (sel >= 0) {
      renderCard();
      card.setAttribute("aria-label", P[sel].t);
    }
    tip.classList.remove("is-on");
    paint();
    if (sel < 0 && was >= 0) rows[was].focus({ preventScroll: true });
  }
  function toggle(i) {
    select(sel === i ? -1 : i);
  }
  function step(d) {
    if (sel < 0) return;
    select((sel + d + N) % N);
  }
  on(q(".fc-close"), "click", () => select(-1));
  on(document, "keydown", (e) => {
    if (sel < 0) return;
    if (e.key === "Escape") select(-1);
    else if (e.target.tagName === "INPUT") return;
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  let dragEnd = -1000;
  on(stage, "pointerdown", (e) => {
    if (e.button !== 0) return;
    stopGlide();
    drag = { x: e.clientX, s: spin, on: false, id: e.pointerId, lx: e.clientX, lt: performance.now(), v: 0 };
  });
  on(stage, "pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    if (drag && drag.id === e.pointerId && mode === "axon") {
      const dx = e.clientX - drag.x;
      if (!drag.on && Math.abs(dx) > 4) {
        drag.on = true;
        el.classList.add("is-turning");
        try {
          stage.setPointerCapture(e.pointerId);
        } catch (err) {}
        tip.classList.remove("is-on");
      }
      if (drag.on) {
        spin = drag.s + 0.25 * dx;
        el.style.setProperty("--spin", spin + "deg");
        const nt = performance.now();
        const dt = nt - drag.lt;
        if (dt > 0) drag.v = drag.v * 0.6 + ((0.25 * (e.clientX - drag.lx)) / dt) * 0.4;
        drag.lx = e.clientX;
        drag.lt = nt;
      }
    }
    if (e.pointerType !== "touch") {
      tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
      if (mode === "plan" && !(drag && drag.on)) {
        crossX.style.transform = `translateY(${e.clientY - r.top}px)`;
        crossY.style.transform = `translateX(${e.clientX - r.left}px)`;
        el.classList.add("is-cross");
        const sr = sheet.getBoundingClientRect();
        const x = ((e.clientX - sr.left) / sr.width) * 200;
        const y = ((e.clientY - sr.top) / sr.height) * 128;
        if (x >= 0 && x <= 200 && y >= 0 && y <= 128) setCoord(`x ${x.toFixed(1)}  y ${y.toFixed(1)} mm`);
        else setCoord(null);
      }
    }
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const was = drag;
    drag = null;
    if (was.on) {
      dragEnd = performance.now();
      const idle = performance.now() - was.lt;
      const v = Math.max(-0.6, Math.min(0.6, was.v));
      if (!rm() && idle < 120 && Math.abs(v) > 0.01) glide(v);
      else el.classList.remove("is-turning");
    }
  };
  on(stage, "pointerup", endDrag);
  on(stage, "pointercancel", endDrag);
  on(stage, "pointerleave", () => {
    hideCross();
    if (!drag) setCoord(null);
  });
  on(stage, "click", (e) => {
    if (performance.now() - dragEnd < 80) return;
    const m = e.target.closest(".fc-model");
    if (m) toggle(Number(m.dataset.i));
  });

  function hideCross() {
    el.classList.remove("is-cross");
  }
  function setCoord(t) {
    coord.classList.toggle("is-live", !!t);
    coord.textContent = t || (mode === "plan" ? T.hintMove : T.hintTurn);
  }

  const dateEl = q(".fc-date");
  const timeEl = q(".fc-time");
  const tf = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const tick = () => {
    const d = new Date();
    dateEl.textContent = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    timeEl.textContent = tf.format(d);
  };
  tick();
  const clock = setInterval(tick, 15000);

  const copyBtn = q(".fc-copy");
  const copyLab = q(".fc-copy-label");
  let copyT = 0;
  const say = (t, ok, ms) => {
    clearTimeout(copyT);
    copyLab.textContent = t;
    copyBtn.classList.toggle("is-ok", ok);
    if (ms) copyT = setTimeout(() => say(T.copy, false, 0), ms);
  };
  on(copyBtn, "click", async () => {
    try {
      await navigator.clipboard.writeText(LINK);
      say(T.copied, true, 2000);
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = LINK;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err2) {}
      ta.remove();
      if (ok) say(T.copied, true, 2000);
      else {
        say(LINK, false, 6000);
        copyLab.style.userSelect = "all";
        const r = document.createRange();
        r.selectNodeContents(copyLab);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    }
  });

  setCoord(null);
  if (startMode === "plan") hideCross();

  offs.push(ctx.onVisible((v) => el.classList.toggle("is-idle", !v)));
  el.classList.toggle("is-idle", !ctx.visible());
  ctx.ready();

  return () => {
    clearInterval(clock);
    clearTimeout(copyT);
    stopGlide();
    for (const off of offs.splice(0)) off();
    el.remove();
    style.remove();
  };
}
