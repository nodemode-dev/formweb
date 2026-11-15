// Knockout artboard (C7). Drag vector shapes onto an artboard, hold to subtract them from the fill, and scroll to rinse
// the sheet down to single-colour artwork with clean holes. Ported from the FormPath knockout section; the story
// progress comes from the native scene on the template, everything else is the original algorithm.

const CSS = `
.fwc-knockout {
  --lt: 0;
  --pw: 400px;
  --ph: 500px;
  --cx: 700px;
  --cy: 400px;
  --kn-k: 0.3;
  --kn-wash: color-mix(in srgb, var(--hue, #ff8a4c) 14%, transparent);
  --kn-line: color-mix(in srgb, var(--hue, #ff8a4c) 42%, transparent);
  --kn-glow: 0 0 var(--sp-3, 12px) color-mix(in srgb, var(--hue, #ff8a4c) 30%, transparent), 0 var(--sp-2, 8px) var(--sp-7, 48px) calc(var(--sp-2, 8px) * -1) color-mix(in srgb, var(--hue, #ff8a4c) 62%, transparent);
  position: absolute;
  inset: 0;
  isolation: isolate;
  overflow: clip;
  background: var(--terminal, #0c0f10);
  color: var(--ink, #eef0f4);
  font-family: var(--font-ui, system-ui, sans-serif);
  font-weight: var(--weight-body, 420);
  line-height: 1.55;
  -webkit-user-select: none;
  user-select: none;
  touch-action: pan-y;
}

.fwc-knockout h1,
.fwc-knockout h2,
.fwc-knockout p {
  margin: 0;
}

.fwc-knockout button {
  font: inherit;
  color: inherit;
}

.fwc-knockout :focus-visible {
  outline: 2px solid var(--focus, #eef0f4);
  outline-offset: 2px;
}

.fwc-knockout .kn-table {
  position: absolute;
  inset: 0;
  z-index: var(--z-behind, -1);
  background:
    repeating-linear-gradient(0deg, var(--edge, rgb(255 255 255 / 0.09)) 0 1px, transparent 1px 48px),
    repeating-linear-gradient(90deg, var(--edge, rgb(255 255 255 / 0.09)) 0 1px, transparent 1px 48px),
    var(--inset, #101216);
}

.fwc-knockout .kn-bar {
  position: absolute;
  inset-inline: 0;
  inset-block-start: 0;
  z-index: var(--z-chrome, 300);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  block-size: 48px;
  padding-inline: 32px;
  border-block-end: 1px solid color-mix(in srgb, var(--terminal-ink, #f3ebe3) calc(var(--lt) * 18%), var(--edge, rgb(255 255 255 / 0.09)));
  color: color-mix(in srgb, var(--terminal-ink, #f3ebe3) calc(var(--lt) * 100%), var(--ink, #eef0f4));
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.fwc-knockout .kn-bar > * {
  transition: opacity calc(1s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform calc(1s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc((var(--i) * 0.08s + 0.15s) * var(--kn-k));
}

.fwc-knockout:not(.kn-ready) .kn-bar > * {
  opacity: 0;
  transform: translateY(-8px);
}

.fwc-knockout .kn-name {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
  letter-spacing: var(--track-tight, -0.015em);
  text-transform: none;
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: var(--fs-m, 1rem);
  font-weight: var(--weight-display, 640);
}

.fwc-knockout .kn-name img {
  display: block;
  inline-size: 24px;
  block-size: 24px;
}

.fwc-knockout .kn-app-form {
  color: color-mix(in srgb, var(--terminal-ink, #f3ebe3) calc(var(--lt) * 100%), var(--ink, #eef0f4));
}

.fwc-knockout .kn-app-suffix {
  color: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-mid {
  justify-self: center;
  display: flex;
  gap: var(--sp-2, 8px);
}

.fwc-knockout .kn-mid span {
  color: color-mix(in srgb, var(--terminal-faint, #88827b) calc(var(--lt) * 100%), var(--ink-faint, #6b7283));
}

.fwc-knockout .kn-end {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
}

.fwc-knockout .kn-count {
  display: inline-flex;
  align-items: baseline;
  gap: var(--sp-1, 4px);
  padding: 2px var(--sp-2, 8px);
  border: 1px solid var(--kn-line);
  color: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-count b {
  font-weight: var(--weight-strong, 560);
  color: inherit;
}

.fwc-knockout .kn-sheet {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  z-index: var(--z-base, 0);
  inline-size: var(--pw);
  block-size: var(--ph);
  translate: calc(var(--cx) - var(--pw) / 2) calc(var(--cy) - var(--ph) / 2);
  transform-origin: 50% 50%;
  will-change: transform;
}

.fwc-knockout .kn-sheet-in {
  position: absolute;
  inset: 0;
  transition: opacity calc(1.6s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform calc(1.6s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc(0.3s * var(--kn-k));
}

.fwc-knockout:not(.kn-ready) .kn-sheet-in {
  opacity: 0;
  transform: translateY(30px) rotate(-2deg);
}

.fwc-knockout .kn-basin {
  position: absolute;
  inset: -7% -9%;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18)), var(--kn-shadow-window);
  opacity: 0;
}

.fwc-knockout .kn-clip {
  position: absolute;
  inset: -7% -9%;
  overflow: hidden;
  pointer-events: none;
}

.fwc-knockout .kn-water {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(135deg, var(--kn-line) 0 1px, transparent 1px 9px),
    var(--kn-wash);
  transform: translateY(101%);
  will-change: transform;
}

.fwc-knockout .kn-wave {
  position: absolute;
  inset-inline: 0;
  inset-block-start: -10px;
  block-size: 10px;
  background: linear-gradient(135deg, transparent 44%, var(--hue, #ff8a4c) 44% 56%, transparent 56%) 0 0 / 12px 10px repeat-x;
  animation: kn-slide 2.4s linear infinite;
}

.fwc-knockout .kn-crest {
  position: absolute;
  inset-inline: -9%;
  inset-block-start: calc(100% + 9%);
  block-size: 10px;
  background: linear-gradient(135deg, transparent 44%, var(--hue, #ff8a4c) 44% 56%, transparent 56%) 0 0 / 12px 10px repeat-x;
  opacity: 0;
  animation: kn-slide 2.4s linear infinite;
}

@keyframes kn-slide {
  to { background-position-x: 120px; }
}

.fwc-knockout .kn-back {
  position: absolute;
  inset: 0;
  box-shadow: var(--kn-shadow-window);
}

.fwc-knockout .kn-print {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
}

.fwc-knockout .kn-peg {
  position: absolute;
  inset-block-start: -2%;
  inline-size: 14px;
  block-size: 14px;
  background: var(--ink, #eef0f4);
  box-shadow: 0 0 0 1px var(--hue, #ff8a4c);
  opacity: 0;
}

.fwc-knockout .kn-peg-a { inset-inline-start: calc(22% - 7px); }
.fwc-knockout .kn-peg-b { inset-inline-end: calc(22% - 7px); }

.fwc-knockout .kn-cuts {
  position: absolute;
  inset: 0;
  z-index: var(--z-raised, 100);
  pointer-events: none;
}

.fwc-knockout .kn-cut {
  --sx: 0px;
  --sy: 4px;
  --sb: 8px;
  --sa: 30%;
  --sc: 1;
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  inline-size: calc(var(--ph) * var(--sz));
  aspect-ratio: 1;
  pointer-events: none;
  touch-action: none;
}

.fwc-knockout .kn-cut:focus-visible {
  outline: none;
}

.fwc-knockout .kn-cut:focus-visible svg {
  filter: drop-shadow(0 0 7px var(--hue, #ff8a4c)) drop-shadow(0 0 2px var(--hue, #ff8a4c));
}

.fwc-knockout .kn-rot {
  position: absolute;
  inset: 0;
  transition: transform 0.35s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-knockout .kn-ent {
  position: absolute;
  inset: 0;
  transition: opacity calc(1.3s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform calc(1.3s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc((var(--i) * 0.07s + 0.55s) * var(--kn-k));
}

.fwc-knockout:not(.kn-ready) .kn-ent {
  opacity: 0;
  transform: translateY(-40px) rotate(-8deg);
}

.fwc-knockout .kn-lift {
  position: absolute;
  inset: 0;
  will-change: transform, opacity;
}

.fwc-knockout .kn-cut svg {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  overflow: visible;
  opacity: var(--o);
  filter: drop-shadow(var(--sx) var(--sy) var(--sb) color-mix(in srgb, var(--black, #000) var(--sa), transparent));
  transform: scale(var(--sc));
  transition: filter 0.24s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform 0.24s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-knockout .kn-cut path {
  fill: var(--ink, #eef0f4);
  fill-rule: evenodd;
  pointer-events: none;
}

.fwc-knockout .kn-cut .kn-hit {
  fill: transparent;
  pointer-events: all;
  cursor: grab;
}

.fwc-knockout .kn-cut.held svg {
  --sy: 14px;
  --sb: 24px;
  --sa: 40%;
  --sc: 1.04;
}

.fwc-knockout .kn-cut.held .kn-hit {
  cursor: grabbing;
}

.fwc-knockout .kn-cut.gone,
.fwc-knockout .kn-cut.gone .kn-hit {
  pointer-events: none;
}

.fwc-knockout.kn-sun .kn-cut {
  --sy: 0px;
  --sb: 0px;
  --sa: 0%;
}

.fwc-knockout.kn-sun .kn-cut.held {
  --sy: 14px;
  --sb: 24px;
  --sa: 40%;
}

.fwc-knockout .kn-sweep {
  position: absolute;
  inset: 0;
  z-index: var(--z-sticky, 200);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  background:
    repeating-linear-gradient(135deg, var(--kn-line) 0 1px, transparent 1px 12px),
    radial-gradient(70% 80% at 100% 0%, var(--kn-wash), transparent 70%);
}

.fwc-knockout.kn-sun .kn-sweep {
  opacity: 1;
}

.fwc-knockout .kn-ui {
  position: absolute;
  z-index: var(--z-field, 150);
}

.fwc-knockout .kn-head {
  inset-inline-start: 44px;
  inset-block-start: 81px;
  margin: 0;
  font-size: clamp(3.4rem, 6.6vw, 6.5rem);
  font-weight: var(--weight-display, 640);
  line-height: 0.92;
  letter-spacing: var(--track-display, -0.035em);
  pointer-events: none;
}

.fwc-knockout .kn-line {
  display: block;
  overflow: hidden;
  padding-block-end: 0.14em;
  margin-block-end: -0.14em;
}

.fwc-knockout .kn-ln {
  display: block;
  transition: transform calc(1.6s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc((var(--i) * 0.1s + 0.35s) * var(--kn-k));
}

.fwc-knockout:not(.kn-ready) .kn-ln {
  transform: translateY(110%);
}

.fwc-knockout .kn-line-b {
  color: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-fade {
  transition: opacity calc(1.2s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), transform calc(1.2s * var(--kn-k)) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
  transition-delay: calc((var(--i) * 0.1s + 0.9s) * var(--kn-k));
}

.fwc-knockout:not(.kn-ready) .kn-fade {
  opacity: 0;
  transform: translateY(10px);
}

.fwc-knockout .kn-sc {
  will-change: transform, opacity;
}

.fwc-knockout .kn-copy {
  inset-inline-start: 44px;
  inset-block-start: calc(81px + 2.05 * clamp(3.4rem, 6.6vw, 6.5rem));
  inline-size: min(300px, 26vw);
  pointer-events: none;
}

.fwc-knockout .kn-copy p {
  min-block-size: calc(1.55em * 6);
  color: var(--ink-soft, #a4aab8);
  font-size: var(--fs-s, 0.875rem);
  line-height: 1.55;
}

.fwc-knockout .kn-holdw {
  inset-inline-start: 44px;
  inset-block-end: 40px;
}

.fwc-knockout .kn-hold {
  position: relative;
  inline-size: 108px;
  block-size: 108px;
  padding: 0;
  border: 0;
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  color: var(--ink, #eef0f4);
  cursor: pointer;
  touch-action: none;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: 0.14em;
  line-height: 1.5;
  text-transform: uppercase;
  transition: transform var(--dur, 240ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), box-shadow var(--dur, 240ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-knockout .kn-hold:focus-visible {
  outline: 2px solid var(--hue, #ff8a4c);
  outline-offset: 4px;
}

.fwc-knockout.kn-sun .kn-hold {
  transform: scale(0.96);
  box-shadow: inset 0 0 0 1px var(--kn-line), var(--kn-glow);
}

.fwc-knockout .kn-hold svg {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
}

.fwc-knockout .kn-ring {
  fill: none;
  stroke: var(--hue, #ff8a4c);
  stroke-width: 3;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}

.fwc-knockout .kn-hl {
  position: relative;
  display: block;
  pointer-events: none;
}

.fwc-knockout .kn-hl-b {
  display: none;
}

.fwc-knockout.kn-sun .kn-hl-a {
  display: none;
}

.fwc-knockout.kn-sun .kn-hl-b {
  display: block;
  color: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-dockw {
  inset-inline-end: 32px;
  inset-block-end: 40px;
}

.fwc-knockout .kn-dock {
  display: flex;
  gap: var(--sp-2, 8px);
}

.fwc-knockout .kn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2, 8px);
  block-size: 48px;
  padding: 0 var(--sp-5, 24px);
  border: 0;
  border-radius: 0;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)), opacity var(--dur-fast, 140ms) var(--ease-out, cubic-bezier(0.2, 0.7, 0.2, 1));
}

.fwc-knockout .kn-btn-ink {
  background: var(--ink, #eef0f4);
  color: var(--on-ink, #14161b);
}

.fwc-knockout .kn-btn-ink:hover {
  opacity: 0.88;
}

.fwc-knockout .kn-btn-quiet {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  color: var(--ink, #eef0f4);
}

.fwc-knockout .kn-btn-quiet:hover {
  background: var(--control, #2b303c);
}

.fwc-knockout .kn-btn svg {
  flex: none;
  display: block;
  inline-size: var(--icon-s, 16px);
  block-size: var(--icon-s, 16px);
}

.fwc-knockout .kn-cap {
  inset-inline-start: 50%;
  inset-block-end: 48px;
  translate: -50% 0;
  inline-size: max-content;
  max-inline-size: min(620px, calc(100% - 32px));
  padding: var(--sp-3, 12px) var(--sp-5, 24px);
  background: var(--pane, #1b1e25);
  box-shadow: inset 0 0 0 1px var(--edge-strong, rgb(255 255 255 / 0.18));
  font-size: var(--fs-s, 0.875rem);
  font-weight: var(--weight-strong, 560);
  text-align: center;
  opacity: 0;
  pointer-events: none;
}

.fwc-knockout .kn-cap em {
  color: var(--hue, #ff8a4c);
  font-style: normal;
}

.fwc-knockout .kn-fin {
  --ground: var(--terminal, #0c0f10);
  --ink: var(--terminal-ink, #f3ebe3);
  --on-ink: var(--terminal, #0c0f10);
  --ink-soft: var(--terminal-faint, #88827b);
  --ink-faint: var(--terminal-faint, #88827b);
  --edge: color-mix(in srgb, var(--terminal-ink, #f3ebe3) 14%, transparent);
  --edge-strong: color-mix(in srgb, var(--terminal-ink, #f3ebe3) 34%, transparent);
  --control: color-mix(in srgb, var(--terminal-ink, #f3ebe3) 12%, transparent);
  --focus: var(--terminal-ink, #f3ebe3);
  position: absolute;
  inset: 0;
  z-index: var(--z-overlay, 600);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  gap: var(--sp-4, 16px);
  padding: 0 0 54px 64px;
  color: var(--ink);
  opacity: 0;
  pointer-events: none;
}

.fwc-knockout .kn-fin > * {
  max-inline-size: min(460px, 38vw);
}

.fwc-knockout .kn-k {
  display: flex;
  align-items: center;
  gap: var(--sp-2, 8px);
  color: var(--ink-soft);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.fwc-knockout .kn-k i {
  display: block;
  inline-size: 8px;
  block-size: 8px;
  background: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-fin > h2 {
  max-inline-size: none;
  white-space: nowrap;
  font-size: clamp(3rem, 5.2vw, 5.75rem);
  font-weight: var(--weight-display, 640);
  line-height: 0.92;
  letter-spacing: var(--track-display, -0.035em);
}

.fwc-knockout .kn-fin h2 span {
  display: block;
}

.fwc-knockout .kn-fin h2 span + span {
  color: var(--hue, #ff8a4c);
}

.fwc-knockout .kn-fin .kn-b {
  min-block-size: calc(1.55em * 5);
  color: var(--ink-soft);
  font-size: var(--fs-s, 0.875rem);
  line-height: 1.55;
}

.fwc-knockout .kn-fin .kn-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2, 8px);
  max-inline-size: none;
}

.fwc-knockout .kn-fin .kn-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.fwc-knockout .kn-fine {
  color: var(--ink-faint);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-xs, 0.8125rem);
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.fwc-knockout .kn-fin a {
  color: var(--ink);
  text-decoration-color: var(--edge-strong);
  text-underline-offset: 0.2em;
}

.fwc-knockout.mid .kn-copy {
  display: none;
}

.fwc-knockout.mob .kn-bar {
  grid-template-columns: 1fr auto;
  padding-inline: 16px;
}

.fwc-knockout.mob .kn-mid {
  display: none;
}

.fwc-knockout.mob .kn-head {
  inset-inline-start: 16px;
  inset-block-start: 62px;
  font-size: clamp(2.5rem, 11vw, 3.5rem);
  white-space: nowrap;
}

.fwc-knockout.mob .kn-line {
  display: inline-block;
  margin-inline-end: 0.22em;
}

.fwc-knockout.mob .kn-copy {
  inset-inline-start: 108px;
  inset-inline-end: 16px;
  inset-block-start: auto;
  inset-block-end: 104px;
  inline-size: auto;
}

.fwc-knockout.mob .kn-copy p {
  min-block-size: calc(1.55em * 5);
  font-size: 11.5px;
}

.fwc-knockout.mob .kn-holdw {
  inset-inline-start: 16px;
  inset-block-end: 18px;
}

.fwc-knockout.mob .kn-hold {
  inline-size: 80px;
  block-size: 80px;
  font-size: 9px;
  letter-spacing: 0.08em;
}

.fwc-knockout.mob .kn-dockw {
  inset-inline-start: 108px;
  inset-inline-end: 16px;
  inset-block-end: 30px;
}

.fwc-knockout.mob .kn-dock {
  justify-content: flex-end;
}

.fwc-knockout.mob .kn-dock .kn-btn {
  block-size: var(--control-h, 40px);
  padding-inline: var(--sp-3, 12px);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.fwc-knockout.mob .kn-cap {
  inset-block-end: 112px;
  padding: var(--sp-2, 8px) var(--sp-4, 16px);
  font-size: var(--fs-xs, 0.8125rem);
}

.fwc-knockout.mob .kn-fin {
  padding: 0 20px 22px;
}

.fwc-knockout.mob .kn-fin > * {
  max-inline-size: none;
}

.fwc-knockout.mob .kn-fin > h2 {
  font-size: clamp(2.5rem, 11vw, 3.5rem);
}

.fwc-knockout.mob .kn-fin .kn-b {
  min-block-size: calc(1.55em * 5);
  font-size: 12.5px;
}

.fwc-knockout.kn-rm .kn-ln,
.fwc-knockout.kn-rm .kn-bar > *,
.fwc-knockout.kn-rm .kn-fade,
.fwc-knockout.kn-rm .kn-sheet-in,
.fwc-knockout.kn-rm .kn-ent {
  transition: none;
}

.fwc-knockout.kn-rm .kn-wave,
.fwc-knockout.kn-rm .kn-crest {
  animation: none;
}
`;

const SVGNS = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 1000;
const WT = 1 - Math.exp(-0.03);
const SHADOW_DARK = '0 1px 1px rgb(0 0 0 / 0.3), 0 28px 64px -28px rgb(0 0 0 / 0.8)';
const SHADOW_LIGHT = '0 1px 1px rgb(40 32 20 / 0.04), 0 28px 64px -28px rgb(40 32 20 / 0.3)';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
const eio = (t) => {
  t = clamp(t);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};
const pad2 = (n) => String(n).padStart(2, '0');
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const el = (tag, cls, attrs, kids) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (kids) for (const k of kids) e.append(k);
  return e;
};
const sv = (tag, attrs) => {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
};
const txt = (s) => document.createTextNode(String(s));
const lines = (s) => {
  const out = [];
  String(s).split('\n').forEach((part, i) => {
    if (i) out.push(document.createElement('br'));
    out.push(txt(part));
  });
  return out;
};

export function mount(root, props, ctx) {
  const pr = props || {};
  const P = (k, d) => (pr[k] === undefined || pr[k] === null ? d : pr[k]);
  const RM = ctx.reduced;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const shapes = (Array.isArray(pr.shapes) ? pr.shapes : []).concat(Array.isArray(pr.shapesMore) ? pr.shapesMore : []);
  const hint = String(P('shapeHint', 'Drag to move, arrow keys nudge, R turns it.'));

  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);

  // Build the DOM.
  const K = el('div', 'fwc-knockout' + (RM ? ' kn-rm' : ''));
  const table = el('div', 'kn-table', { 'aria-hidden': 'true' });

  const nameForm = el('span', 'kn-app-form');
  nameForm.textContent = String(P('nameForm', 'Form'));
  const nameSuffix = el('span', 'kn-app-suffix');
  nameSuffix.textContent = String(P('nameSuffix', 'Path'));
  const iconSrc = String(P('icon', 'https://media.formai.studio/media/icons/formpath-128.webp'));
  const nameWrap = el('span', 'kn-name', { style: '--i:0' });
  if (iconSrc) nameWrap.append(el('img', '', { src: iconSrc, width: '24', height: '24', alt: '' }));
  nameWrap.append(el('span', '', null, [nameForm, nameSuffix]));
  const midSub = el('span');
  midSub.textContent = String(P('barSub', 'Artboard 1'));
  const mid = el('span', 'kn-mid', { style: '--i:1' }, [txt(String(P('barTitle', 'Knockout')) + ' '), midSub]);
  const cnt = el('b');
  cnt.textContent = '00';
  const unit = el('span');
  unit.textContent = String(P('barUnit', 'sec'));
  const renderLabel = el('span');
  renderLabel.textContent = String(P('barRender', 'Render'));
  const end = el('span', 'kn-end', { style: '--i:2' }, [renderLabel, el('span', 'kn-count', null, [cnt, unit])]);
  const sbar = el('div', 'kn-bar', null, [nameWrap, mid, end]);

  const basin = el('div', 'kn-basin');
  const print = el('canvas', 'kn-print', { width: String(W), height: String(H), role: 'img', 'aria-label': String(P('canvasLabel', 'An artboard filled with a tinted fill. Shapes you place are subtracted from it, and the rinse leaves single-colour artwork.')) });
  const water = el('div', 'kn-water', null, [el('div', 'kn-wave')]);
  const pegA = el('div', 'kn-peg kn-peg-a');
  const pegB = el('div', 'kn-peg kn-peg-b');
  const crest = el('div', 'kn-crest');
  const sheet = el('div', 'kn-sheet', null, [el('div', 'kn-sheet-in', null, [basin, el('div', 'kn-back'), print, el('div', 'kn-clip', null, [water]), pegA, pegB, crest])]);

  const cutsEl = el('div', 'kn-cuts');
  const cuts = shapes.map((s, i) => {
    const desk = s.desk || [0, 0, 0, 0.5];
    const op = Number(s.op ?? 1);
    const holder = sv('g', { class: 'kn-gl' });
    const gs = Number(s.gs ?? 1);
    if (gs !== 1) holder.setAttribute('transform', 'scale(' + gs + ')');
    const ds = Array.isArray(s.d) ? s.d : [];
    ds.forEach((d) => holder.append(sv('path', { d })));
    const vw = Number(s.vw);
    const vh = Number(s.vh);
    const svg = sv('svg', { viewBox: '0 0 ' + vw + ' ' + vh, 'aria-hidden': 'true' });
    svg.append(sv('rect', { class: 'kn-hit', width: String(vw), height: String(vh) }), holder);
    const lift = el('div', 'kn-lift', null, [svg]);
    const ent = el('div', 'kn-ent', null, [lift]);
    const rot = el('div', 'kn-rot', null, [ent]);
    const cut = el('div', 'kn-cut', { role: 'group', tabindex: '0', 'aria-label': String(s.label || s.name || 'Shape') + '. ' + hint }, [rot]);
    cut.style.cssText = '--i:' + i + ';--sz:' + desk[3] + ';--o:' + op;
    cutsEl.append(cut);
    let paths = [];
    try {
      paths = ds.map((d) => new Path2D(d));
    } catch (e) {
      paths = [];
    }
    return { el: cut, rot, lift, op, name: s.name || '', paths, vw, vh, gs };
  });

  const sweep = el('div', 'kn-sweep', { 'aria-hidden': 'true' });
  const head = el('h1', 'kn-ui kn-head kn-sc');
  const lnA = el('span', 'kn-ln', { style: '--i:0' });
  lnA.textContent = String(P('headA', 'Cut out'));
  const lnB = el('span', 'kn-ln', { style: '--i:1' });
  lnB.textContent = String(P('headB', 'your art'));
  head.append(el('span', 'kn-line', null, [lnA]), el('span', 'kn-line kn-line-b', null, [lnB]));
  const copyP = el('p');
  copyP.textContent = String(coarse
    ? P('copyTouch', 'Drag the shapes onto the artboard, then hold to subtract them from the fill. Tap a shape to turn it, or focus one and use the arrow keys.')
    : P('copy', 'Drag the shapes onto the artboard, then hold to subtract them from the fill. Click a shape to turn it, or focus one and use the arrow keys.'));
  const copy = el('div', 'kn-ui kn-copy kn-sc', null, [el('div', 'kn-fade', { style: '--i:0' }, [copyP])]);

  const ring = sv('path', { class: 'kn-ring', pathLength: '1', d: 'M50 1.5H98.5V98.5H1.5V1.5H50' });
  const ringSvg = sv('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  ringSvg.append(ring);
  const holdB = el('button', 'kn-hold', { type: 'button', 'aria-label': String(P('holdLabel', 'Hold to subtract the shapes from the fill')) }, [
    ringSvg,
    el('span', 'kn-hl kn-hl-a', null, lines(P('holdText', 'Hold to\nsubtract'))),
    el('span', 'kn-hl kn-hl-b', null, lines(P('holdingText', 'Cutting\nout'))),
  ]);
  const holdw = el('div', 'kn-ui kn-holdw kn-sc', null, [el('div', 'kn-fade', { style: '--i:1' }, [holdB])]);

  const fresh = el('button', 'kn-btn kn-btn-quiet', { type: 'button' });
  fresh.textContent = String(P('freshLabel', 'Fresh sheet'));
  const torinse = el('button', 'kn-btn kn-btn-quiet', { type: 'button' });
  torinse.textContent = String(P('rinseLabel', 'Go to rinse'));
  const dockw = el('div', 'kn-ui kn-dockw kn-sc', null, [el('div', 'kn-fade', { style: '--i:2' }, [el('div', 'kn-dock', null, [fresh, torinse])])]);

  const capA = el('span');
  capA.textContent = String(P('capA', 'Fill rinsed away,'));
  const capB = el('em');
  capB.textContent = String(P('capB', 'the shapes you placed stay behind as holes.'));
  const cap = el('p', 'kn-ui kn-cap kn-sc', { 'aria-hidden': 'true' }, [capA, txt(' '), capB]);

  const kick = el('span');
  kick.textContent = String(P('finKicker', 'Subtracted, rinsed, ready to save'));
  const auto = el('span', '', { hidden: '' });
  const finA = el('span');
  finA.textContent = String(P('finTitleA', 'One colour,'));
  const finB = el('span');
  finB.textContent = String(P('finTitleB', 'clean holes'));
  const bForm = el('span', 'kn-app-form');
  bForm.textContent = String(P('nameForm', 'Form'));
  const bSuffix = el('span', 'kn-app-suffix');
  bSuffix.textContent = String(P('nameSuffix', 'Path'));
  const finBody = el('p', 'kn-b', null, [auto, txt(String(P('finBodyA', 'Pathfinder does this on curves in '))), bForm, bSuffix, txt(String(P('finBodyB', ': your shapes are subtracted from the fill, and what remains is single-colour artwork. Save it as a 1600 by 2000 PNG, or start another sheet.')))]);
  const saveB = el('button', 'kn-btn kn-btn-ink', { type: 'button' });
  saveB.textContent = String(P('saveLabel', 'Save the print'));
  const againLabel = el('span');
  againLabel.textContent = String(P('againLabel', 'Make another'));
  const upIcon = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  upIcon.append(sv('path', { d: 'M12 19V5' }), sv('path', { d: 'M6 11l6-6 6 6' }));
  const another = el('button', 'kn-btn kn-btn-quiet', { type: 'button' }, [againLabel, upIcon]);
  const link = el('a', '', { href: String(P('finLinkUrl', 'https://formai.studio/formpath/')) });
  link.textContent = String(P('finLinkText', 'About FormPath'));
  const fin = el('div', 'kn-fin', { inert: '' }, [
    el('p', 'kn-k', null, [el('i', '', { 'aria-hidden': 'true' }), kick]),
    el('h2', '', null, [finA, finB]),
    finBody,
    el('div', 'kn-row', null, [saveB, another]),
    el('p', 'kn-fine', null, [link, txt(String(P('finNote', ', which exports SVG, PDF, EPS, DXF, PNG, JPEG and WebP.')))]),
  ]);

  K.append(table, sbar, sheet, cutsEl, sweep, head, copy, holdw, dockw, cap, fin);
  root.append(K);

  // Canvases.
  const coatMask = mk(W, H);
  const coatCol = mk(W, H);
  const expo = mk(W, H);
  const frame = mk(W, H);
  const tS = mk(W, H);
  const tD = mk(W, H);
  const g2 = print.getContext('2d');
  const eg = expo.getContext('2d');
  const fg = frame.getContext('2d');

  const probe = document.createElement('i');
  probe.style.display = 'none';
  K.append(probe);
  const rc = (v) => {
    probe.style.color = v;
    return getComputedStyle(probe).color;
  };
  let pal = {};
  const palette = () => {
    pal = {
      paper: rc('var(--pane, #1b1e25)'),
      coat: rc('color-mix(in srgb, var(--hue, #ff8a4c) 16%, var(--pane, #1b1e25))'),
      hatch: rc('color-mix(in srgb, var(--hue, #ff8a4c) 34%, var(--pane, #1b1e25))'),
      slate: rc('color-mix(in srgb, var(--ink, #eef0f4) 46%, var(--pane, #1b1e25))'),
      deep: rc('var(--ink, #eef0f4)'),
      foot: rc('color-mix(in srgb, var(--ink, #eef0f4) 70%, transparent)'),
    };
  };
  const shadowWindow = () => {
    const v = ctx.token('shadow-window');
    K.style.setProperty('--kn-shadow-window', v || (ctx.theme() === 'light' ? SHADOW_LIGHT : SHADOW_DARK));
  };

  const buildCoat = () => {
    const g = coatMask.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgb(0 0 0)';
    g.fillRect(70, 100, 660, 800);
  };
  const buildCoatColour = () => {
    const g = coatCol.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.drawImage(coatMask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = pal.coat;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = pal.hatch;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let x = -H; x < W; x += 14) {
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  };

  // Layout and shape positions.
  let pos = [];
  let geo = { sw: 1, sh: 1, H: 1, W: 1, cx: 0, cy: 0 };
  let fins = { s: 1, cx: 0, cy: 0 };
  let mobile = null;
  let lastCur = -1;
  const resetPos = (m) => {
    pos = shapes.map((s) => {
      const a = (m ? s.mob : s.desk) || s.desk || [0, 0, 0, 0.5];
      return { u: a[0], v: a[1], rot: a[2], size: a[3] };
    });
  };
  const place = (i) => {
    const c = cuts[i];
    const p = pos[i];
    const w = p.size * geo.H;
    c.el.style.setProperty('--sz', p.size);
    c.el.style.transform = 'translate(' + (geo.cx + p.u * geo.H - w / 2).toFixed(2) + 'px,' + (geo.cy + p.v * geo.H - w / 2).toFixed(2) + 'px)';
    c.rot.style.transform = 'rotate(' + p.rot + 'deg)';
  };
  const layout = () => {
    const sw = K.clientWidth;
    const sh = K.clientHeight;
    if (!sw || !sh) return;
    const m = sw < 700;
    let h, w, cx, cy, fs, fcx, fcy;
    if (!m) {
      h = Math.min(0.74 * sh, 0.36 * sw * 1.25);
      w = 0.8 * h;
      cx = 0.585 * sw;
      cy = sh / 2 + 22;
      fs = (0.8 * sh) / h;
      fcx = 0.66 * sw;
      fcy = sh / 2;
    } else {
      w = Math.min(0.7 * sw, 0.34 * sh);
      h = 1.25 * w;
      cx = sw / 2;
      cy = 0.21 * sh + h / 2;
      fs = (0.72 * sw) / w;
      fcx = sw / 2;
      fcy = 0.3 * sh;
    }
    geo = { sw, sh, H: h, W: w, cx, cy };
    fins = { s: fs, cx: fcx - cx, cy: fcy - cy };
    K.classList.toggle('mob', m);
    K.classList.toggle('mid', !m && sw <= 1000);
    K.style.setProperty('--pw', w + 'px');
    K.style.setProperty('--ph', h + 'px');
    K.style.setProperty('--cx', cx + 'px');
    K.style.setProperty('--cy', cy + 'px');
    if (mobile !== m) {
      mobile = m;
      resetPos(m);
    }
    for (let i = 0; i < cuts.length; i++) place(i);
    lastCur = -1;
  };

  // Subtraction.
  const drawCut = (g, i) => {
    const p = pos[i];
    g.save();
    g.translate(W / 2 + p.u * H, H / 2 + p.v * H);
    g.rotate((p.rot * Math.PI) / 180);
    const s = (p.size * H) / 100;
    g.scale(s, s);
    const c = cuts[i];
    const kk = 100 / Math.max(c.vw, c.vh);
    g.translate((-c.vw * kk) / 2, (-c.vh * kk) / 2);
    g.scale(kk * c.gs, kk * c.gs);
    g.fillStyle = 'rgb(0 0 0)';
    for (const pth of c.paths) g.fill(pth, 'evenodd');
    g.restore();
  };

  let dirty = true;
  let held = 0;
  let lastRin = -1;
  let rin = 0;
  let tintOld = true;
  let tintKind = 0;

  const step = () => {
    fg.globalCompositeOperation = 'source-over';
    fg.globalAlpha = 1;
    fg.clearRect(0, 0, W, H);
    fg.drawImage(coatMask, 0, 0);
    fg.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < cuts.length; i++) {
      const q = pos[i];
      const rr = q.size * H * 0.75;
      const px = W / 2 + q.u * H;
      const py = H / 2 + q.v * H;
      if (px < -rr || px > W + rr || py < -rr || py > H + rr) continue;
      fg.globalAlpha = cuts[i].op;
      drawCut(fg, i);
    }
    fg.globalAlpha = 1;
    fg.globalCompositeOperation = 'source-over';
    eg.globalAlpha = WT;
    eg.drawImage(frame, 0, 0);
    eg.globalAlpha = 1;
    dirty = true;
    tintOld = true;
  };

  const tints = { S: [tS, 'slate'], D: [tD, 'deep'] };
  const tint = (which) => {
    const [c, key] = tints[which];
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = pal[key];
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(expo, 0, 0);
    g.globalCompositeOperation = 'source-over';
  };

  const compose = (g, S, r) => {
    const w = W * S;
    const h = H * S;
    g.clearRect(0, 0, w, h);
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, w, h);
    const fy = (1 - r) * h;
    if (tintOld) {
      if (fy > 0) tint('S');
      if (fy < h) tint('D');
      tintOld = false;
      tintKind = (fy > 0 ? 1 : 0) + (fy < h ? 2 : 0);
    } else {
      const need = (fy > 0 ? 1 : 0) + (fy < h ? 2 : 0);
      if (need & ~tintKind & 1) tint('S');
      if (need & ~tintKind & 2) tint('D');
      tintKind |= need;
    }
    if (fy > 0) {
      g.save();
      g.beginPath();
      g.rect(0, 0, w, fy);
      g.clip();
      g.globalAlpha = 0.92;
      g.drawImage(coatCol, 0, 0, w, h);
      g.globalAlpha = 0.92;
      g.drawImage(tS, 0, 0, w, h);
      g.restore();
    }
    if (fy < h) {
      g.save();
      g.beginPath();
      g.rect(0, fy, w, h - fy);
      g.clip();
      g.drawImage(tD, 0, 0, w, h);
      g.globalAlpha = 0.85;
      g.drawImage(tD, 0, 0, w, h);
      g.restore();
    }
  };

  const redraw = () => {
    dirty = false;
    compose(g2, 1, rin);
    lastRin = rin;
  };

  const sm = mk(40, 50);
  const smg = sm.getContext('2d', { willReadFrequently: true });
  const sm2 = mk(40, 50);
  const smg2 = sm2.getContext('2d', { willReadFrequently: true });
  let coatSum = 1;
  const sampleSum = () => {
    smg2.clearRect(0, 0, 40, 50);
    smg2.drawImage(coatMask, 0, 0, 40, 50);
    const d = smg2.getImageData(0, 0, 40, 50).data;
    let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i];
    return s;
  };
  const avgExpo = () => {
    smg.clearRect(0, 0, 40, 50);
    smg.drawImage(expo, 0, 0, 40, 50);
    const d = smg.getImageData(0, 0, 40, 50).data;
    let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i];
    return s / coatSum;
  };

  // Hold to subtract.
  const setReadout = () => {
    cnt.textContent = pad2(Math.min(99, Math.floor(held)));
    ring.style.strokeDashoffset = String(1 - Math.min(1, held / 12));
  };
  let holding = false;
  let stepAcc = 0;
  const setHold = (b) => {
    if (b === holding) return;
    holding = b;
    K.classList.toggle('kn-sun', b);
  };
  const clearSheet = () => {
    eg.clearRect(0, 0, W, H);
    tintOld = true;
    held = 0;
    stepAcc = 0;
    auto.hidden = true;
    auto.textContent = '';
    dirty = true;
    setReadout();
    redraw();
  };

  const offs = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    offs.push(() => target.removeEventListener(type, fn, opts));
  };

  on(fresh, 'click', clearSheet);
  on(holdB, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    holdB.setPointerCapture(e.pointerId);
    setHold(true);
  });
  on(holdB, 'contextmenu', (e) => e.preventDefault());
  on(window, 'pointerup', () => setHold(false));
  on(window, 'pointercancel', () => setHold(false));
  on(window, 'blur', () => setHold(false));
  on(document, 'visibilitychange', () => {
    if (document.hidden) setHold(false);
  });
  on(holdB, 'keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) setHold(true);
    }
  });
  on(holdB, 'keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setHold(false);
    }
  });
  on(holdB, 'blur', () => setHold(false));

  // Dragging the shapes.
  let drag = null;
  cuts.forEach((c, i) => {
    const node = c.el;
    on(node, 'pointerdown', (e) => {
      if (e.button !== 0 || node.classList.contains('gone')) return;
      e.preventDefault();
      cutsEl.append(node);
      e.target.setPointerCapture(e.pointerId);
      node.classList.add('held');
      const r = K.getBoundingClientRect();
      drag = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, ox: e.clientX - r.left - (geo.cx + pos[i].u * geo.H), oy: e.clientY - r.top - (geo.cy + pos[i].v * geo.H) };
      node.focus({ preventScroll: true });
    });
    on(node, 'pointermove', (e) => {
      if (!drag || drag.i !== i || drag.id !== e.pointerId) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) <= 6) return;
      drag.moved = true;
      const r = K.getBoundingClientRect();
      const x = clamp(e.clientX - r.left - drag.ox, 0, geo.sw);
      const y = clamp(e.clientY - r.top - drag.oy, 0, geo.sh);
      pos[i].u = (x - geo.cx) / geo.H;
      pos[i].v = (y - geo.cy) / geo.H;
      place(i);
    });
    const endDrag = (e) => {
      if (!drag || drag.i !== i || (e && drag.id !== e.pointerId)) return;
      if (!drag.moved && e && e.type === 'pointerup') {
        pos[i].rot += 30;
        place(i);
      }
      node.classList.remove('held');
      drag = null;
    };
    on(node, 'pointerup', endDrag);
    on(node, 'pointercancel', endDrag);
    on(node, 'keydown', (e) => {
      const k = e.key;
      const st = e.shiftKey ? 0.08 : 0.02;
      let hit = true;
      if (k === 'ArrowLeft') pos[i].u -= st;
      else if (k === 'ArrowRight') pos[i].u += st;
      else if (k === 'ArrowUp') pos[i].v -= st;
      else if (k === 'ArrowDown') pos[i].v += st;
      else if (k === 'r' || k === 'R') pos[i].rot += e.shiftKey ? -30 : 30;
      else hit = false;
      if (hit) {
        e.preventDefault();
        place(i);
      }
    });
  });

  // Story progress. The native scene supplies it; the geometry below is the same maths for reduced motion and for use
  // without a scene.
  const stageEl = ctx.host;
  const sceneEl = () => {
    const m = globalThis.__formwebMotion;
    const key = m && m.sceneOf ? m.sceneOf(stageEl) : null;
    return key ? document.querySelector('[data-fw-node="' + globalThis.CSS.escape(key) + '"]') : stageEl.parentElement;
  };
  const span = (track) => track.offsetHeight - stageEl.offsetHeight;
  const stuckTop = () => parseFloat(getComputedStyle(stageEl).top) || 0;
  const scrollP = () => {
    const track = sceneEl();
    if (!track) return 0;
    const sp = span(track);
    return sp > 0 ? clamp(-track.getBoundingClientRect().top / sp) : 0;
  };
  const hasScene = () => {
    const m = globalThis.__formwebMotion;
    return !!(m && m.sceneOf && m.sceneOf(stageEl));
  };
  const targetP = () => {
    let p = !RM && hasScene() ? clamp(ctx.progress()) : scrollP();
    if (RM) p = p < 0.25 ? 0 : p < 0.75 ? 0.5 : 1;
    return p;
  };

  let tween = null;
  const scrollToP = (p, dur, done) => {
    const track = sceneEl();
    if (!track) return;
    const to = track.getBoundingClientRect().top + scrollY + p * Math.max(0, span(track)) - (hasScene() ? stuckTop() : 0);
    if (RM) {
      scrollTo(0, to);
      if (done) done();
      return;
    }
    tween = { t0: performance.now(), from: scrollY, to, dur: dur * 1000, done };
  };
  const tweenStep = (ts) => {
    if (!tween) return;
    const k = clamp((ts - tween.t0) / tween.dur);
    scrollTo(0, tween.from + (tween.to - tween.from) * eio(k));
    if (k >= 1) {
      const d = tween.done;
      tween = null;
      if (d) d();
    }
  };
  on(window, 'wheel', () => { tween = null; }, { passive: true });
  on(window, 'touchstart', () => { tween = null; }, { passive: true });
  on(torinse, 'click', () => scrollToP(0.5, 2));
  on(another, 'click', () => scrollToP(0, 2.4, clearSheet));

  // Save the print.
  on(saveB, 'click', () => {
    if (saveB.disabled) return;
    saveB.disabled = true;
    const label = saveB.textContent;
    saveB.textContent = String(P('savingLabel', 'Saving'));
    const c = mk(1600, 2000);
    const g = c.getContext('2d');
    compose(g, 2, 1);
    g.font = '22px ' + ctx.token('font-mono');
    g.textBaseline = 'bottom';
    g.fillStyle = pal.foot;
    g.textAlign = 'left';
    g.fillText(String(P('footLeft', 'formpath / knockout')), 100, 1960);
    g.textAlign = 'right';
    g.fillText(String(P('footRight', '{n} sec render')).replace('{n}', pad2(Math.floor(held))), 1500, 1960);
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = String(P('saveName', 'knockout-print.png'));
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        saveB.disabled = false;
        saveB.textContent = label;
      }, 500);
    }, 'image/png');
  });

  // Scroll-driven state.
  const els = { head, copy, dockw, holdw, cap, fin, table, basin, water, crest, pegA, pegB };
  const cache = new Map();
  const put = (node, tr, op) => {
    const k = tr + '|' + op;
    if (cache.get(node) === k) return;
    cache.set(node, k);
    node.style.transform = tr;
    node.style.opacity = op;
  };
  let autoDone = false;
  let cur = 0;

  const apply = (p) => {
    [els.head, els.copy, els.dockw, els.holdw].forEach((node, i) => {
      const f = clamp((p - (0.03 + 0.012 * i)) / 0.06);
      put(node, 'translateY(' + (-20 * f).toFixed(2) + 'px)', (1 - f).toFixed(3));
      const off = f > 0.98;
      if (node.inert !== off) node.inert = off;
      const v = f >= 1 ? 'hidden' : 'visible';
      if (node.style.visibility !== v) node.style.visibility = v;
    });
    if (p > 0.15 && holding) setHold(false);
    cuts.forEach((c, i) => {
      const e0 = clamp((p - (0.05 + 0.006 * i)) / 0.07);
      const e = e0 * e0;
      put(c.lift, 'translateY(' + (-110 * e).toFixed(2) + '%) rotate(' + ((i % 2 ? -1 : 1) * (12 + (i % 3)) * e).toFixed(2) + 'deg)', (1 - e).toFixed(3));
      const gone = e0 > 0.001;
      if (c.el.classList.contains('gone') !== gone) {
        c.el.classList.toggle('gone', gone);
        c.el.tabIndex = gone ? -1 : 0;
        c.el.setAttribute('aria-hidden', gone ? 'true' : 'false');
        if (gone && drag && drag.i === i) {
          c.el.classList.remove('held');
          drag = null;
        }
      }
      const vis = e0 >= 1 ? 'hidden' : 'visible';
      if (c.el.style.visibility !== vis) c.el.style.visibility = vis;
    });
    els.basin.style.opacity = (clamp((p - 0.08) / 0.04) - clamp((p - 0.48) / 0.04)).toFixed(3);
    const rise = ss((p - 0.1) / 0.2);
    const drain = clamp((p - 0.4) / 0.08);
    els.water.style.transform = 'translateY(' + (((1 - rise) + drain) * 112).toFixed(2) + '%)';
    els.crest.style.opacity = (clamp((p - 0.48) / 0.07) * 0.5).toFixed(3);
    rin = ss((p - 0.13) / 0.23);
    const ci = clamp((p - 0.18) / 0.05);
    const co = clamp((p - 0.44) / 0.05);
    put(els.cap, 'translateY(' + ((1 - ci) * 14 - co * 14).toFixed(2) + 'px)', (ci * (1 - co)).toFixed(3));
    els.table.style.opacity = (1 - clamp((p - 0.54) / 0.14)).toFixed(3);
    const lt = ss((p - 0.6) / 0.1).toFixed(3);
    if (K.style.getPropertyValue('--lt') !== lt) K.style.setProperty('--lt', lt);
    const e = eio((p - 0.55) / 0.3);
    const gt = 'translate(' + (fins.cx * e).toFixed(2) + 'px,' + (fins.cy * e).toFixed(2) + 'px) scale(' + (1 + (fins.s - 1) * e).toFixed(4) + ')';
    if (sheet.style.transform !== gt) sheet.style.transform = gt;
    const fa = clamp((p - 0.8) / 0.12);
    const fb = clamp((p - 0.82) / 0.12);
    put(els.pegA, 'translateY(' + (-30 * (1 - fa)).toFixed(2) + 'px)', fa.toFixed(3));
    put(els.pegB, 'translateY(' + (-30 * (1 - fb)).toFixed(2) + 'px)', fb.toFixed(3));
    const o = clamp((p - 0.9) / 0.07);
    els.fin.style.opacity = o.toFixed(3);
    els.fin.style.transform = 'translateY(' + (30 * (1 - o)).toFixed(2) + 'px)';
    const live = o > 0.5;
    if (els.fin.inert === live) els.fin.inert = !live;
    els.fin.style.pointerEvents = live ? 'auto' : 'none';
    if (p < 0.03) autoDone = false;
    if (!autoDone && p > 0.09) {
      autoDone = true;
      if (avgExpo() < 0.1) {
        for (let i = 0; i < 90; i++) step();
        held = 9;
        setReadout();
        auto.textContent = String(P('autoNote', 'With nothing held, the sheet was given 9 seconds of subtraction. '));
        auto.hidden = false;
      }
    }
  };

  // Frame loop.
  let lastT = performance.now();
  const onFrame = (now) => {
    const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016);
    lastT = now;
    tweenStep(now);
    if (!ctx.visible()) return;
    const tp = targetP();
    if (RM) cur = tp;
    else cur += (tp - cur) * (1 - Math.exp(-Math.min(0.05, dt) * 5));
    if (holding) {
      stepAcc += dt;
      while (stepAcc >= 0.1) {
        stepAcc -= 0.1;
        step();
        held += 0.1;
      }
      setReadout();
    }
    if (Math.abs(cur - lastCur) > 1e-5 || lastCur < 0) {
      apply(cur);
      lastCur = cur;
    }
    if (dirty || Math.abs(rin - lastRin) > 0.0004) redraw();
  };

  // Start.
  palette();
  shadowWindow();
  buildCoat();
  buildCoatColour();
  coatSum = Math.max(1, sampleSum());
  layout();
  setReadout();
  redraw();
  cur = targetP();
  apply(cur);
  lastCur = cur;
  redraw();

  const offTheme = ctx.onTheme(() => {
    palette();
    shadowWindow();
    buildCoatColour();
    tintOld = true;
    dirty = true;
    redraw();
  });
  const offResize = ctx.onResize(layout);
  const offFrame = ctx.onFrame(onFrame);
  const readyTimer = setTimeout(() => K.classList.add('kn-ready'), RM ? 0 : 150);
  ctx.ready();

  return () => {
    clearTimeout(readyTimer);
    if (typeof offFrame === 'function') offFrame();
    if (typeof offResize === 'function') offResize();
    if (typeof offTheme === 'function') offTheme();
    for (const off of offs) off();
    tween = null;
    setHold(false);
    root.textContent = '';
  };
}
