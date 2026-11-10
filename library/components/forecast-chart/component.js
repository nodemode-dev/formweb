// Forecast chart prompt (C16). Ported from the formcel-foresheet section script.
// The ask panel lives in the host. The horizon picker, the result chart with its figures and the file-drop veil sit in a
// second absolute layer inside the enclosing section, because the original places them against the section edges.
// The component writes four custom properties on that section so native nodes can follow its state:
// --fc-done and --fc-busy (0 or 1) and --fc-px and --fc-py (pointer parallax in px).

const DEFAULT_PROMPTS = [
  'Predict weekly signups for 14 weeks',
  'Forecast column D revenue next quarter',
  'Project monthly invoice totals',
  "Estimate next month's export volume"
];
const DEFAULT_HORIZONS = [
  { n: 7, label: 'Short', note: '7 steps, fast' },
  { n: 14, label: 'Medium', note: '14 steps, default' },
  { n: 22, label: 'Long', note: '22 steps, wide band' }
];
const DEFAULT_TEMPLATES = [
  { id: 'budget', name: 'Monthly budget', feat: 'Conditional formatting', cols: 'A Category, B Planned, C Actual · 7 rows', fm: '=SUM(B2:B8)-SUM(C2:C8)', prompt: 'Compare planned and actual spend and flag any overspend' },
  { id: 'pipeline', name: 'Sales pipeline', feat: 'Formulas and data bars', cols: 'A Stage, B Deals, C Average value, D Chance, E Weighted · 5 rows', fm: 'E2 =B2*C2*D2, total =SUM(E2:E6)', prompt: 'Weight each pipeline stage by its chance to close' },
  { id: 'invoices', name: 'Invoice log', feat: 'Sort and filter', cols: 'A Invoice, B Month, C Amount, D Status · 18 rows', fm: '=SUMIF(D2:D19,"Overdue",C2:C19)', prompt: 'Total invoices by month and show what is overdue' },
  { id: 'habits', name: 'Habit tracker', feat: 'Colour scales', cols: 'A Habit, B to AC days 1 to 28 · 5 rows', fm: '=COUNTIF(B2:AC2,1)/28', prompt: 'Mark 28 days of five habits and shade the last seven' },
  { id: 'inventory', name: 'Inventory', feat: 'Conditional formatting and icon sets', cols: 'A Item, B In stock, C Reorder at, D Unit cost · 6 rows', fm: '=IF(B2<C2,"Reorder","OK")', prompt: 'Flag items below their reorder level and value the stock' },
  { id: 'grades', name: 'Grade book', feat: 'Formulas', cols: 'A Student, B Quiz, C Midterm, D Final, E Grade · 16 rows', fm: 'E2 =B2*0.3+C2*0.3+D2*0.4', prompt: 'Weight quiz, midterm and final into one grade' },
  { id: 'timeline', name: 'Project timeline', feat: 'Data bars', cols: 'A Task, B Start week, C Weeks, D End week · 6 rows', fm: 'D2 =B2+C2', prompt: 'Lay the project out by week and show how much is done' },
  { id: 'revenue', name: 'Revenue forecast', feat: 'Charts', cols: 'A Month, B Revenue · 36 rows', fm: 'Line fit plus seasonal average, 90 percent band', prompt: 'Forecast monthly revenue for the next quarter' },
  { id: 'pivot', name: 'Expense pivot', feat: 'PivotTable', cols: 'A Date, B Category, C Amount · 30 rows', fm: 'Rows: Category · Values: Sum of Amount', prompt: 'Pivot 30 expenses by category with each share' },
  { id: 'currency', name: 'Currency table', feat: 'Currencies data type', cols: 'A Code, B Rate per USD, C 1,000 USD, D 7-day change · 6 rows', fm: 'C2 =B2*1000', prompt: 'Convert 1,000 USD into six currencies with the 7-day move' },
  { id: 'loan', name: 'Loan schedule', feat: 'Formulas and charts', cols: 'A Month, B Balance, C Interest, D Principal · 48 rows', fm: 'C2 =B2*$F$1/12, B3 =B2-D2', prompt: 'Schedule an 18,000 loan over 48 months at 5.9 percent' },
  { id: 'workout', name: 'Workout log', feat: 'Charts', cols: 'A Date, B Exercise, C Top set in kg · 24 rows', fm: 'D2 =MAX(C$2:C2)', prompt: 'Log bench press top sets and track the best so far' },
  { id: 'guests', name: 'Guest list RSVP', feat: 'Sort and filter', cols: 'A Guest, B Group, C RSVP · 100 rows', fm: '=COUNTIF(C2:C101,"Yes")', prompt: 'Count RSVPs by group and show who has not replied' }
];
const DEFAULT_LABELS = {
  question: 'Your question', upload: 'Upload table', sample: 'Try sample data', go: 'Forecast', busy: 'Fitting',
  removeFile: 'Remove file', chooseFile: 'Choose a table file', free: 'Ask anything', startingPoint: 'Starting point',
  freeNote: 'Ask in your own words · Charts', freeCols: 'Reads one numeric column from a .csv, .tsv or .txt table',
  errType: 'Only csv, tsv or txt tables work.', errRead: 'That file could not be read.', errNone: 'No numeric column with four values.',
  drop: 'Drop a table here', horizon: 'Forecast horizon', now: 'Now',
  plotLabel: 'Forecast chart. Arrow keys move the read-out.', resultLabel: 'Result. Arrow keys move the read-out.',
  seriesFallback: 'Series from your prompt', confidence: 'Confidence', band: '90 percent band', meanVsLast: 'mean vs last row',
  steps: 'steps', ready: 'ready', forecast: 'Forecast', fmForecast: 'Line fit plus seasonal average, 90 percent band',
  featCharts: 'Charts', sampleName: 'weekly-signups.csv', samplePrompt: 'Predict weekly signups for the next {n} weeks',
  filePrompt: 'Predict {col} for the next {n} steps'
};

const CSS = `
.F{--pf-spring:cubic-bezier(0.34,1.45,0.64,1);--pf-out:cubic-bezier(0.16,1,0.3,1);--fc-wash:color-mix(in srgb,var(--hue,#3ecf8e) 14%,transparent);--fc-line:color-mix(in srgb,var(--hue,#3ecf8e) 42%,transparent);box-sizing:border-box;font-family:var(--font-ui,"Inter Web","Segoe UI",system-ui,sans-serif);font-size:var(--fs-m,1rem);line-height:1.55;color:var(--ink,#eef0f4);text-align:start}
.F *,.F *::before,.F *::after{box-sizing:border-box}
.F button,.F textarea{font:inherit;color:inherit;margin:0}
.F p{margin:0}
.F .pf-sro{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.F .ic{flex:none;display:block;width:var(--icon-m,20px);height:var(--icon-m,20px)}
.F.fc-ask{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:var(--sp-4,16px)}
.F.fc-out{position:absolute;inset:0;z-index:var(--z-dropdown,400);pointer-events:none}
.F.fc-ask .pf-panelwrap{animation:fwc-fc-in 1.3s .75s var(--pf-out) both}
.F.fc-ask .pf-tplwrap{animation:fwc-fc-in 1.2s .95s var(--pf-out) both}
.F.fc-out .pf-pick{animation:fwc-fc-rise 1.2s .6s var(--pf-out) both}
@keyframes fwc-fc-in{from{opacity:0;transform:translateY(18px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
@keyframes fwc-fc-rise{from{opacity:0}to{opacity:1}}
.F .pf-pick{position:absolute;top:var(--sp-3,12px);left:var(--sp-5,24px);pointer-events:auto}
.F .pf-pickbtn{display:inline-flex;align-items:center;gap:var(--sp-2,8px);height:var(--control-h,40px);padding:0 var(--sp-3,12px);border:1px solid var(--edge-strong,rgb(255 255 255 / .18));border-radius:0;background:var(--pane,#1b1e25);color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:border-color .3s var(--pf-spring)}
.F .pf-pickbtn:hover{border-color:var(--hue,#3ecf8e)}
.F .pf-dot{width:8px;height:8px;border-radius:50%;background:var(--hue,#3ecf8e)}
.F .pf-aform{color:var(--ink,#eef0f4)}
.F .pf-asuf{color:var(--hue,#3ecf8e)}
.F .pf-chev{width:14px;height:14px;transition:transform .4s var(--pf-spring)}
.F .pf-pickbtn[aria-expanded="true"] .pf-chev{transform:rotate(180deg)}
.F .pf-menu{position:absolute;top:calc(100% + var(--sp-1,4px));left:0;z-index:var(--z-dropdown,400);min-width:19rem;padding:var(--sp-1,4px);border:1px solid var(--edge-strong,rgb(255 255 255 / .18));background:var(--float,#242833);box-shadow:var(--shadow-window,0 1px 1px rgb(0 0 0 / .3),0 28px 64px -28px rgb(0 0 0 / .8));transform-origin:0 0;transform:translateY(-4px) scale(.92);opacity:0;pointer-events:none;transition:transform .35s var(--pf-spring),opacity .2s var(--ease-out,ease-out)}
.F .pf-menu.pf-open{transform:none;opacity:1;pointer-events:auto}
.F .pf-opt{display:flex;align-items:baseline;justify-content:space-between;gap:var(--sp-5,24px);width:100%;padding:var(--sp-2,8px) var(--sp-3,12px);border:0;border-radius:0;background:transparent;color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.1em;text-transform:uppercase;text-align:start;cursor:pointer}
.F .pf-opt small{color:var(--ink-faint,#6b7283);font-size:inherit}
.F .pf-opt:hover{background:var(--control,#2b303c)}
.F .pf-opt[aria-selected="true"]{background:var(--fc-wash);color:var(--hue,#3ecf8e)}
.F .pf-panelwrap{position:relative;width:100%}
.F .pf-panel{position:relative;display:grid;gap:var(--sp-3,12px);padding:var(--sp-3,12px);border:1px solid var(--edge-strong,rgb(255 255 255 / .18));background:var(--pane,#1b1e25);transition:border-color .4s var(--ease-out,ease-out)}
.F.fc-ask .pf-panel:focus-within,.F.fc-ask.pf-busy .pf-panel{border-color:var(--hue,#3ecf8e)}
.F .pf-xh{position:absolute;width:14px;height:14px;color:var(--ink-faint,#6b7283);pointer-events:none;transition:transform .5s var(--pf-spring),color .3s var(--ease-out,ease-out)}
.F .pf-xh::before,.F .pf-xh::after{content:"";position:absolute;background:currentColor}
.F .pf-xh::before{left:0;right:0;top:6.5px;height:1px}
.F .pf-xh::after{top:0;bottom:0;left:6.5px;width:1px}
.F .pf-xh-a{top:-7px;left:-7px}.F .pf-xh-b{top:-7px;right:-7px}.F .pf-xh-c{bottom:-7px;left:-7px}.F .pf-xh-d{bottom:-7px;right:-7px}
.F .pf-panelwrap:focus-within .pf-xh,.F.fc-ask.pf-busy .pf-xh{color:var(--hue,#3ecf8e)}
.F .pf-panelwrap:focus-within .pf-xh-a{transform:translate(-4px,-4px)}
.F .pf-panelwrap:focus-within .pf-xh-b{transform:translate(4px,-4px)}
.F .pf-panelwrap:focus-within .pf-xh-c{transform:translate(-4px,4px)}
.F .pf-panelwrap:focus-within .pf-xh-d{transform:translate(4px,4px)}
.F.fc-ask.pf-busy .pf-xh{animation:fwc-fc-pulse .6s ease-in-out infinite alternate}
@keyframes fwc-fc-pulse{to{scale:.6}}
.F .pf-field{position:relative;display:grid}
.F .pf-ta,.F .pf-ghost{grid-area:1/1;min-height:3.4rem;padding:var(--sp-2,8px) var(--sp-1,4px);font-family:var(--font-ui,system-ui,sans-serif);font-size:var(--fs-l,1.125rem);line-height:1.5}
.F .pf-ta{height:3.4rem;width:100%;resize:none;border:0;outline:0;border-radius:0;background:transparent;color:var(--ink,#eef0f4);caret-color:var(--hue,#3ecf8e)}
.F .pf-ghost{color:var(--ink-faint,#6b7283);pointer-events:none;overflow:hidden}
.F .pf-ghost.pf-off{visibility:hidden}
.F .pf-cur{display:inline-block;width:.55em;height:1.05em;margin-left:2px;vertical-align:text-bottom;background:var(--hue,#3ecf8e);opacity:.6;animation:fwc-fc-blink 1s steps(1) infinite}
@keyframes fwc-fc-blink{50%{opacity:0}}
.F .pf-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3,12px)}
.F .pf-row .pf-go{margin-left:auto}
.F .pf-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2,8px);height:48px;padding:0 var(--sp-5,24px);border:0;border-radius:0;font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);font-weight:500;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color var(--dur-fast,140ms) var(--ease-out,ease-out),opacity var(--dur-fast,140ms) var(--ease-out,ease-out),translate .3s var(--pf-spring),scale .3s var(--pf-spring)}
.F .pf-btn:hover{translate:0 -1px}
.F .pf-btn:active{scale:.96}
.F .pf-btn .ic{transition:translate .3s var(--pf-spring)}
.F .pf-go:hover .ic{translate:3px 0}
.F .pf-btn-quiet{background:transparent;color:var(--ink,#eef0f4);box-shadow:inset 0 0 0 1px var(--edge-strong,rgb(255 255 255 / .18))}
.F .pf-btn-quiet:hover{background:var(--control,#2b303c)}
.F .pf-btn-ink{background:var(--ink,#eef0f4);color:var(--on-ink,#14161b)}
.F .pf-btn-ink:hover{opacity:.88}
.F .pf-go[disabled]{opacity:.7;cursor:progress}
.F .pf-link{padding:0;border:0;background:transparent;color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;text-decoration:underline;text-decoration-color:var(--edge-strong,rgb(255 255 255 / .18));text-underline-offset:.3em;cursor:pointer;transition:color .3s var(--pf-spring)}
.F .pf-link:hover{color:var(--hue,#3ecf8e)}
.F .pf-spin{display:none;width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:fwc-fc-turn .7s linear infinite}
.F.fc-ask.pf-busy .pf-spin{display:block}
.F.fc-ask.pf-busy .pf-go .ic{display:none}
@keyframes fwc-fc-turn{to{rotate:360deg}}
.F .pf-file{display:flex}
.F .pf-file[hidden],.F .pf-up[hidden],.F .pf-link[hidden]{display:none}
.F .pf-chip{display:inline-flex;align-items:center;gap:var(--sp-2,8px);padding:var(--sp-1,4px) var(--sp-1,4px) var(--sp-1,4px) var(--sp-3,12px);border:1px solid var(--fc-line);color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);animation:fwc-fc-pop .45s var(--pf-spring) both}
.F .pf-chip button{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;background:transparent;color:var(--ink-soft,#a4aab8);cursor:pointer}
.F .pf-chip button:hover{color:var(--ink,#eef0f4)}
@keyframes fwc-fc-pop{from{opacity:0;scale:.7}to{opacity:1;scale:1}}
.F .pf-tplwrap{width:100%}
.F .pf-tpls{display:flex;gap:var(--sp-2,8px);overflow-x:auto;padding:3px 14px var(--sp-2,8px);scrollbar-width:thin;scrollbar-color:var(--edge-strong,rgb(255 255 255 / .18)) transparent;mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.F .pf-tc{flex:none;height:var(--control-h-compact,32px);padding:0 var(--sp-3,12px);border:1px solid var(--edge-strong,rgb(255 255 255 / .18));border-radius:0;background:var(--pane,#1b1e25);color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;cursor:pointer;transition:border-color .3s var(--pf-spring),color .3s var(--pf-spring),background-color .3s var(--ease-out,ease-out),translate .3s var(--pf-spring),scale .3s var(--pf-spring)}
.F .pf-tc:hover{color:var(--ink,#eef0f4);border-color:var(--hue,#3ecf8e);translate:0 -1px}
.F .pf-tc:active{scale:.96}
.F .pf-tc[aria-checked="true"]{color:var(--hue,#3ecf8e);border-color:var(--hue,#3ecf8e);background:var(--fc-wash)}
.F .pf-tn{min-height:2.9em;margin:0;color:var(--ink-soft,#a4aab8);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.06em;text-align:center}
.F .pf-tn span{display:block}
.F .pf-tn span+span{color:var(--ink-faint,#6b7283)}
.F .pf-err{min-height:1.4em;color:var(--fault,#ff5d6c);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.06em;text-align:center}
.F .pf-res{position:absolute;left:0;right:0;bottom:0;z-index:var(--z-raised,100);height:max(220px,34%);padding:0 4vw;opacity:0;pointer-events:none;transition:opacity .6s var(--ease-out,ease-out)}
.F.fc-out.pf-run .pf-res{opacity:1;pointer-events:auto}
.F .pf-stats{position:absolute;top:0;left:4vw;display:flex;gap:var(--sp-7,48px)}
.F .pf-stat{max-width:22rem;opacity:0}
.F.fc-out.pf-run .pf-stat{animation:fwc-fc-in 1s var(--pf-out) both}
.F.fc-out.pf-run .pf-stat+.pf-stat{animation-delay:.1s}
.F .pf-cap{display:block;overflow:hidden;color:var(--ink-faint,#6b7283);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}
.F .pf-big{display:block;color:var(--hue,#3ecf8e);font-size:var(--fs-2xl,clamp(1.875rem,1.3rem + 2.2vw,2.75rem));font-weight:var(--weight-display,640);letter-spacing:var(--track-display,-.035em);font-variant-numeric:tabular-nums;line-height:1.15}
.F .pf-big.pf-neg{color:var(--fault,#ff5d6c)}
.F .pf-rt{position:absolute;top:0;right:4vw;max-width:36vw;margin:0;font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.1em;text-align:end;pointer-events:none}
.F .pf-rt span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.F .pf-ft{color:var(--hue,#3ecf8e);text-transform:uppercase}
.F .pf-fm{color:var(--ink-faint,#6b7283);letter-spacing:.02em}
.F .pf-read{min-height:1.4em;color:var(--ink-soft,#a4aab8);text-transform:uppercase}
.F .pf-alt{position:absolute;left:4vw;right:4vw;bottom:var(--sp-3,12px);height:58%;display:none;font-family:var(--font-mono,ui-monospace,monospace);font-size:11px;letter-spacing:.04em;outline-offset:4px}
.F.pf-vz .pf-alt{display:block}
.F.pf-vz .pf-plot{visibility:hidden}
.F.pf-two .pf-band,.F.pf-two .pf-div,.F.pf-two .pf-now{display:none}
.F .pf-it{transition:background-color .2s var(--ease-out,ease-out)}
.F .pf-it.pf-hl{background:var(--fc-wash)}
.F .pf-cols{display:flex;gap:var(--sp-2,8px);height:100%}
.F .pf-cg{flex:1 1 0;min-width:0;display:flex;flex-direction:column}
.F .pf-bars{flex:1 1 0;min-height:0;display:flex;align-items:flex-end;justify-content:center;gap:3px;position:relative;border-bottom:1px solid var(--edge-strong,rgb(255 255 255 / .18))}
.F .pf-b{display:block;flex:1 1 0;max-width:34px;background:var(--hue,#3ecf8e);transform-origin:50% 100%}
.F .pf-b.pf-pl{background:transparent;border:1px solid var(--ink-faint,#6b7283)}
.F .pf-b.pf-bad,.F .pf-sgm.pf-bad{background:var(--fault,#ff5d6c)}
.F .pf-b.pf-soft,.F .pf-sgm.pf-soft{background:color-mix(in srgb,var(--ink,#eef0f4) 38%,transparent)}
.F .pf-stk{display:flex;flex-direction:column-reverse;flex:0 1 34px;transform-origin:50% 100%}
.F .pf-sgm{display:block;min-height:0;background:var(--hue,#3ecf8e)}
.F .pf-sgm.pf-wash{background:color-mix(in srgb,var(--hue,#3ecf8e) 38%,transparent)}
.F .pf-sgm.pf-out{background:transparent;box-shadow:inset 0 0 0 1px var(--ink-faint,#6b7283)}
.F .pf-mk{position:absolute;left:10%;right:10%;height:0;border-top:1px dashed var(--ink,#eef0f4)}
.F .pf-lb{display:block;padding-top:5px;overflow:hidden;color:var(--ink-faint,#6b7283);text-align:center;text-overflow:ellipsis;white-space:nowrap}
.F .pf-rows{display:flex;flex-direction:column;height:100%}
.F .pf-rw{flex:1 1 0;min-height:0;display:grid;grid-template-columns:7rem 1fr 7rem;align-items:center;gap:var(--sp-3,12px);padding:0 var(--sp-1,4px)}
.F .pf-rn{overflow:hidden;color:var(--ink-soft,#a4aab8);text-overflow:ellipsis;white-space:nowrap}
.F .pf-rv{color:var(--ink,#eef0f4);font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.F .pf-tk{position:relative;display:block;height:60%;max-height:14px}
.F .pf-heat .pf-tk{height:72%;max-height:none}
.F .pf-f{position:absolute;top:0;bottom:0;background:var(--hue,#3ecf8e);transform-origin:0 50%}
.F .pf-f.pf-mid{transform-origin:50% 50%}
.F .pf-f.pf-soft{background:color-mix(in srgb,var(--ink,#eef0f4) 38%,transparent)}
.F .pf-f.pf-out{background:transparent;box-shadow:inset 0 0 0 1px var(--ink-faint,#6b7283)}
.F .pf-td{position:absolute;top:-35%;bottom:-35%;border-left:1px dashed var(--ink,#eef0f4)}
.F .pf-sgs{position:absolute;top:0;bottom:0;left:0;display:flex;transform-origin:0 50%}
.F .pf-sgs .pf-sgm{height:100%}
.F .pf-cells{display:grid;grid-template-columns:repeat(28,1fr);gap:2px;height:100%}
.F .pf-c{display:block}
.F .pf-tbl .pf-rw{grid-template-columns:4.5rem 1fr 1fr 1fr}
.F .pf-tbl .pf-rw span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;text-align:end}
.F .pf-tbl .pf-rw span:first-child{text-align:start}
.F .pf-tbl .pf-hd{color:var(--ink-faint,#6b7283);text-transform:uppercase;border-bottom:1px solid var(--edge-strong,rgb(255 255 255 / .18))}
.F .pf-tbl .pf-up-v{color:var(--hue,#3ecf8e)}
.F .pf-tbl .pf-dn-v{color:var(--fault,#ff5d6c)}
.F.pf-run .pf-b,.F.pf-run .pf-stk{transform:scaleY(0)}
.F.pf-run .pf-f,.F.pf-run .pf-sgs{transform:scaleX(0)}
.F.pf-run .pf-c,.F.pf-run .pf-tbl .pf-rw{opacity:0}
.F.pf-done .pf-b,.F.pf-done .pf-stk{animation:fwc-fc-sy .9s calc(.2s + var(--i,0) * 70ms) var(--pf-out) forwards}
.F.pf-done .pf-f,.F.pf-done .pf-sgs{animation:fwc-fc-sx .9s calc(.2s + var(--i,0) * 70ms) var(--pf-out) forwards}
.F.pf-done .pf-c,.F.pf-done .pf-tbl .pf-rw{animation:fwc-fc-fadein .6s calc(.2s + var(--i,0) * 40ms) var(--ease-out,ease-out) forwards}
@keyframes fwc-fc-sy{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes fwc-fc-sx{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fwc-fc-fadein{from{opacity:0}to{opacity:1}}
.F .pf-plot{position:absolute;left:4vw;right:4vw;bottom:0;height:76%;cursor:crosshair}
.F .pf-plot svg{display:block;width:100%;height:100%;overflow:visible}
.F .pf-plot path,.F .pf-plot line{vector-effect:non-scaling-stroke}
.F .pf-hist{fill:none;stroke:var(--ink,#eef0f4);stroke-width:2;stroke-linejoin:round;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--ink,#eef0f4) 40%,transparent))}
.F .pf-fc{fill:none;stroke:var(--hue,#3ecf8e);stroke-width:2;stroke-linejoin:round;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--hue,#3ecf8e) 55%,transparent))}
.F .pf-area{stroke:none}
.F .pf-band{stroke:none;transform-box:fill-box;transform-origin:0 50%}
.F .pf-div{stroke:var(--edge-strong,rgb(255 255 255 / .18));stroke-width:1;stroke-dasharray:4 4}
.F .pf-hair{stroke:var(--hue,#3ecf8e);stroke-width:1;opacity:0}
.F .pf-hair.pf-on{opacity:1}
.F .pf-now{position:absolute;top:-1.6em;transform:translateX(-50%);color:var(--ink-faint,#6b7283);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-xs,.8125rem);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
.F.pf-run .pf-hist{stroke-dasharray:8000;stroke-dashoffset:8000;animation:fwc-fc-draw 1.3s var(--pf-out) forwards}
.F.pf-run .pf-area{opacity:0;animation:fwc-fc-fade 1s .6s var(--ease-out,ease-out) forwards}
.F.pf-run .pf-fc{stroke-dasharray:8000;stroke-dashoffset:8000}
.F.pf-run .pf-band,.F.pf-run .pf-div,.F.pf-run .pf-now{opacity:0}
.F.pf-done .pf-fc{animation:fwc-fc-draw 1.2s var(--pf-out) forwards}
.F.pf-done .pf-band{animation:fwc-fc-band 1.2s .3s var(--pf-out) forwards}
.F.pf-done .pf-div,.F.pf-done .pf-now{animation:fwc-fc-fade .8s .4s var(--ease-out,ease-out) forwards}
@keyframes fwc-fc-draw{to{stroke-dashoffset:0}}
@keyframes fwc-fc-fade{to{opacity:1}}
@keyframes fwc-fc-band{from{opacity:0;transform:scaleX(.6)}to{opacity:1;transform:scaleX(1)}}
.F .pf-drop{position:absolute;inset:var(--sp-3,12px);z-index:var(--z-overlay,600);display:grid;place-items:center;border:1px dashed var(--hue,#3ecf8e);background:color-mix(in srgb,var(--ground,#14161b) 82%,transparent);color:var(--ink,#eef0f4);font-family:var(--font-mono,ui-monospace,monospace);font-size:var(--fs-m,1rem);letter-spacing:.2em;text-transform:uppercase;opacity:0;pointer-events:none;transition:opacity .25s var(--ease-out,ease-out)}
.F .pf-drop.pf-on{opacity:1}
@media (max-width:700px){
.F .pf-pick{left:var(--sp-3,12px);width:132px}
.F .pf-pickbtn{width:100%}
.F .pf-rt{display:none}
.F .pf-rw{grid-template-columns:4.5rem 1fr 4.5rem;gap:var(--sp-2,8px)}
.F .pf-tbl .pf-rw{grid-template-columns:3rem 1fr 1fr 1fr}
.F .pf-tn{min-height:1.5em}
.F .pf-tn span+span{display:none}
.F .pf-stat{max-width:44vw}
.F .pf-big{font-size:var(--fs-xl,1.5rem)}
.F .pf-alt{height:60%}
.F .pf-row{justify-content:flex-start}
.F .pf-stats{gap:var(--sp-5,24px)}
}
.F.fc-reduced *,.F.fc-reduced *::before,.F.fc-reduced *::after{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}
`;

const ARROW = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
const UPLOAD = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 15V4"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5 19.5h14"/></svg>';
const CHEV = '<svg class="pf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));
const spct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const smoney = (v) => (v < 0 ? '−' : '+') + money(Math.abs(v));
const num = (v) => Math.round(v).toLocaleString('en-US');
const cnt = (x) => Math.round(x) + '';
const pc0 = (x) => Math.round(x) + '%';
const pc = (x, n, d) => Math.max(d || 0, (x / n) * 100).toFixed(1) + '%';
const mkCols = (g) => '<div class="pf-cols">' + g.map((x, i) => '<div class="pf-cg pf-it" data-r="' + esc(x.r) + '" data-st="--i:' + i + '"><div class="pf-bars">' + x.bars + '</div><span class="pf-lb">' + esc(x.lb) + '</span></div>').join('') + '</div>';
const mkRows = (g, cls) => '<div class="pf-rows' + (cls ? ' ' + cls : '') + '">' + g.map((x, i) => '<div class="pf-rw pf-it" data-r="' + esc(x.r) + '" data-st="--i:' + i + '"><span class="pf-rn">' + esc(x.n) + '</span><span class="pf-tk">' + x.t + '</span><span class="pf-rv">' + esc(x.v) + '</span></div>').join('') + '</div>';
const bar = (h, cls) => '<i class="pf-b' + (cls ? ' ' + cls : '') + '" data-st="height:' + h + '"></i>';
const html = (o) => Object.assign({ kind: 'html' }, o);

// Sample sheets for the starting-point chips. Each returns a result description; copy comes from the template meta m.
const BUILD = {
  budget(m) {
    const d = [['Rent', 'Rent', 1400, 1400], ['Groceries', 'Food', 520, 585], ['Transport', 'Move', 210, 164], ['Utilities', 'Util', 180, 203], ['Fun', 'Fun', 250, 312], ['Savings', 'Save', 400, 400], ['Health', 'Health', 120, 76]];
    const mx = Math.max(...d.map((x) => Math.max(x[2], x[3])));
    const pl = d.reduce((a, x) => a + x[2], 0), ac = d.reduce((a, x) => a + x[3], 0), over = d.filter((x) => x[3] > x[2]).length;
    return html({
      feat: m.feat, fm: m.fm, idle: 'Outline planned · solid actual · red is over plan',
      html: mkCols(d.map((x) => ({ r: x[0] + ' · planned ' + money(x[2]) + ' · actual ' + money(x[3]) + (x[3] > x[2] ? ' · over by ' + money(x[3] - x[2]) : ''), lb: x[1], bars: bar(pc(x[2], mx), 'pf-pl') + bar(pc(x[3], mx), x[3] > x[2] ? 'pf-bad' : '') }))),
      s1: { cap: 'Left this month', v: pl - ac, f: smoney, bad: pl - ac < 0, sub: 'planned ' + money(pl) + ' less actual ' + money(ac) },
      s2: { cap: 'Categories over plan', v: over, f: (x) => Math.round(x) + ' of ' + d.length, bad: false, sub: 'flagged in red' }
    });
  },
  pipeline(m) {
    const d = [['Lead', 120, 2400, 0.05], ['Qualified', 74, 3100, 0.15], ['Proposal', 41, 4200, 0.35], ['Negotiation', 22, 5200, 0.6], ['Won', 13, 5600, 1]];
    const w = d.reduce((a, x) => a + x[1] * x[2] * x[3], 0);
    return html({
      feat: m.feat, fm: m.fm, idle: 'Bar length is deal count · value is the weighted amount',
      html: mkRows(d.map((x) => {
        const wd = Math.max(4, (x[1] / d[0][1]) * 100);
        return { r: x[0] + ' · ' + x[1] + ' deals · ' + money(x[1] * x[2]) + ' at ' + Math.round(x[3] * 100) + '% = ' + money(x[1] * x[2] * x[3]), n: x[0], t: '<i class="pf-f pf-mid" data-st="left:' + (100 - wd) / 2 + '%;width:' + wd + '%"></i>', v: money(x[1] * x[2] * x[3]) };
      })),
      s1: { cap: 'Weighted pipeline', v: w, f: money, bad: false, sub: 'sum of deals x value x chance' },
      s2: { cap: 'Lead to won', v: (d[4][1] / d[0][1]) * 100, f: (x) => x.toFixed(1) + '%', bad: false, sub: d[4][1] + ' of ' + d[0][1] + ' leads' }
    });
  },
  invoices(m) {
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const d = [[[1200, 'P'], [800, 'P'], [450, 'P']], [[950, 'P'], [1400, 'P'], [600, 'P']], [[1100, 'P'], [700, 'P'], [1500, 'D']], [[900, 'P'], [1250, 'P'], [780, 'D']], [[1600, 'P'], [540, 'O'], [1020, 'O']], [[870, 'O'], [1330, 'O'], [410, 'O']]];
    const sum = (mo, s) => d[mo].filter((x) => x[1] === s).reduce((a, x) => a + x[0], 0);
    const tot = d.map((_, mo) => sum(mo, 'P') + sum(mo, 'O') + sum(mo, 'D'));
    const mx = Math.max(...tot);
    const open = d.flat().filter((x) => x[1] !== 'P'), late = d.flat().filter((x) => x[1] === 'D');
    return html({
      feat: m.feat, fm: m.fm, idle: 'Grey paid · green open · red overdue',
      html: mkCols(d.map((_, mo) => ({
        r: M[mo] + ' · paid ' + money(sum(mo, 'P')) + ' · open ' + money(sum(mo, 'O')) + ' · overdue ' + money(sum(mo, 'D')), lb: M[mo],
        bars: '<div class="pf-stk" data-st="height:' + pc(tot[mo], mx) + '">' + [['P', 'pf-soft'], ['O', ''], ['D', 'pf-bad']].filter((s) => sum(mo, s[0])).map((s) => '<i class="pf-sgm ' + s[1] + '" data-st="flex:' + sum(mo, s[0]) + ' 1 0"></i>').join('') + '</div>'
      }))),
      s1: { cap: 'Outstanding', v: open.reduce((a, x) => a + x[0], 0), f: money, bad: false, sub: 'open plus overdue, ' + open.length + ' invoices' },
      s2: { cap: 'Overdue', v: late.reduce((a, x) => a + x[0], 0), f: money, bad: true, sub: late.length + ' invoices past due' }
    });
  },
  habits(m) {
    const r = rng(hash('habit-grid'));
    const hb = [['Walk', 0.9], ['Read', 0.75], ['Water', 0.62], ['Stretch', 0.8], ['Sleep 8h', 0.45]];
    let all = 0, best = 0;
    const rows = hb.map((h) => {
      const d = Array.from({ length: 28 }, () => (r() < h[1] ? 1 : 0));
      let run = 0, top = 0;
      d.forEach((x) => { run = x ? run + 1 : 0; top = Math.max(top, run); });
      const done = d.reduce((a, b) => a + b, 0);
      all += done;
      best = Math.max(best, top);
      const cells = d.map((x, k) => {
        let c7 = 0;
        for (let q = Math.max(0, k - 6); q <= k; q++) c7 += d[q];
        const a = x ? Math.round(30 + (c7 / 7) * 70) : 0;
        return '<i class="pf-c" data-st="background:' + (x ? 'color-mix(in srgb, var(--hue) ' + a + '%, transparent)' : 'color-mix(in srgb, var(--ink) 9%, transparent)') + '"></i>';
      }).join('');
      return { r: h[0] + ' · ' + done + ' of 28 days · best streak ' + top, n: h[0], t: '<span class="pf-cells">' + cells + '</span>', v: done + ' / 28' };
    });
    return html({
      feat: m.feat, fm: m.fm, idle: 'Deeper green means a stronger last seven days',
      html: mkRows(rows, 'pf-heat'),
      s1: { cap: 'Best streak', v: best, f: (x) => Math.round(x) + ' days', bad: false, sub: 'longest run on any habit' },
      s2: { cap: 'Completion', v: (all / (hb.length * 28)) * 100, f: pc0, bad: false, sub: all + ' of ' + hb.length * 28 + ' check-ins' }
    });
  },
  inventory(m) {
    const d = [['Bolts M6', 240, 150, 0.12], ['Washers', 95, 120, 0.04], ['Hinges', 60, 40, 1.8], ['Brackets', 32, 50, 0.9], ['Screws', 410, 200, 0.07], ['Anchors', 18, 30, 0.35]];
    const mx = Math.max(...d.map((x) => x[1]));
    const low = d.filter((x) => x[1] < x[2]).length, val = d.reduce((a, x) => a + x[1] * x[3], 0);
    return html({
      feat: m.feat, fm: m.fm, idle: 'Dashed line is the reorder level · red is below it',
      html: mkCols(d.map((x) => ({ r: x[0] + ' · ' + x[1] + ' in stock · reorder at ' + x[2] + (x[1] < x[2] ? ' · Reorder' : ' · OK'), lb: x[0], bars: bar(pc(x[1], mx, 2), x[1] < x[2] ? 'pf-bad' : '') + '<i class="pf-mk" data-st="bottom:' + pc(x[2], mx) + '"></i>' }))),
      s1: { cap: 'Items to reorder', v: low, f: (x) => Math.round(x) + ' of ' + d.length, bad: low > 0, sub: 'stock below its reorder level' },
      s2: { cap: 'Stock value', v: val, f: money, bad: false, sub: 'in stock x unit cost' }
    });
  },
  grades(m) {
    const r = rng(hash('grade-book'));
    const g = Array.from({ length: 16 }, () => 0.3 * (52 + r() * 46) + 0.3 * (48 + r() * 48) + 0.4 * (45 + r() * 52));
    const L = [['A', '90 and up', 90], ['B', '80 to 89', 80], ['C', '70 to 79', 70], ['D', '60 to 69', 60], ['F', 'under 60', -1]];
    const n = L.map((l, i) => g.filter((x) => x >= l[2] && (i === 0 || x < L[i - 1][2])).length);
    const mx = Math.max(...n);
    const avg = g.reduce((a, b) => a + b, 0) / g.length;
    return html({
      feat: m.feat, fm: m.fm, idle: 'Students per letter grade',
      html: mkCols(L.map((l, i) => ({ r: 'Grade ' + l[0] + ' · ' + l[1] + ' · ' + n[i] + (n[i] === 1 ? ' student' : ' students'), lb: l[0], bars: bar(pc(n[i], mx, 2), i === 4 ? 'pf-bad' : i > 1 ? 'pf-soft' : '') }))),
      s1: { cap: 'Class average', v: avg, f: (x) => x.toFixed(1), bad: false, sub: 'weighted, ' + g.length + ' students' },
      s2: { cap: 'Passing', v: (g.filter((x) => x >= 60).length / g.length) * 100, f: pc0, bad: false, sub: 'grade of 60 or more' }
    });
  },
  timeline(m) {
    const d = [['Brief', 0, 2], ['Design', 1, 3], ['Build', 4, 5], ['Review', 8, 2], ['Fix', 9, 2], ['Launch', 11, 1]];
    const W = 12, today = 6;
    const done = d.filter((x) => x[1] + x[2] <= today).length;
    return html({
      feat: m.feat, fm: m.fm, idle: 'Dashed line is week ' + today + ' · grey done · green in progress',
      html: mkRows(d.map((x) => {
        const st = x[1] + x[2] <= today ? 'pf-soft' : x[1] < today ? '' : 'pf-out';
        return { r: x[0] + ' · weeks ' + x[1] + ' to ' + (x[1] + x[2]) + ' · ' + (st === 'pf-soft' ? 'done' : st === '' ? 'in progress' : 'not started'), n: x[0], t: '<i class="pf-f ' + st + '" data-st="left:' + (x[1] / W) * 100 + '%;width:' + (x[2] / W) * 100 + '%"></i><i class="pf-td" data-st="left:' + (today / W) * 100 + '%"></i>', v: 'wk ' + x[1] + ' to ' + (x[1] + x[2]) };
      })),
      s1: { cap: 'Project span', v: W, f: (x) => Math.round(x) + ' weeks', bad: false, sub: 'first start to last end' },
      s2: { cap: 'Tasks done', v: (done / d.length) * 100, f: pc0, bad: false, sub: done + ' of ' + d.length + ' at week ' + today }
    });
  },
  revenue(m, L) {
    const r = rng(hash('revenue-36'));
    const s = Array.from({ length: 36 }, (_, i) => Math.round(42000 * (1 + 0.012 * i) + 3200 * Math.sin((i / 12) * 2 * Math.PI) + (r() - 0.5) * 2200));
    return { kind: 'fc', series: s, name: 'Monthly revenue', feat: m.feat, fm: m.fm, idle: 'Revenue · B2:B37' };
  },
  pivot(m) {
    const r = rng(hash('expense-rows'));
    const C = [['Housing', 1, 600, 800], ['Food', 10, 20, 70], ['Transport', 6, 10, 60], ['Health', 3, 20, 130], ['Fun', 6, 15, 100], ['Other', 4, 10, 70]];
    const wsum = C.reduce((a, c) => a + c[1], 0);
    const sums = Object.fromEntries(C.map((c) => [c[0], 0]));
    const cts = Object.fromEntries(C.map((c) => [c[0], 0]));
    for (let i = 0; i < 30; i++) {
      let k = r() * wsum, c = C[0];
      for (const x of C) { if (k < x[1]) { c = x; break; } k -= x[1]; }
      sums[c[0]] += Math.round(c[2] + r() * (c[3] - c[2]));
      cts[c[0]]++;
    }
    const rows = C.map((c) => [c[0], sums[c[0]], cts[c[0]]]).filter((x) => x[2]).sort((a, b) => b[1] - a[1]);
    const tot = rows.reduce((a, x) => a + x[1], 0);
    return html({
      feat: m.feat, fm: m.fm, idle: '30 rows grouped into ' + rows.length + ' categories',
      html: mkRows(rows.map((x) => ({ r: x[0] + ' · ' + x[2] + ' rows · ' + money(x[1]) + ' · ' + ((x[1] / tot) * 100).toFixed(1) + '% of total', n: x[0], t: '<i class="pf-f" data-st="width:' + pc(x[1], rows[0][1], 1) + '"></i>', v: money(x[1]) + ' · ' + Math.round((x[1] / tot) * 100) + '%' }))),
      s1: { cap: 'Top: ' + rows[0][0], v: (rows[0][1] / tot) * 100, f: pc0, bad: false, sub: money(rows[0][1]) + ' of ' + money(tot) },
      s2: { cap: 'Rows pivoted', v: 30, f: cnt, bad: false, sub: 'into ' + rows.length + ' categories' }
    });
  },
  currency(m) {
    const d = [['EUR', 0.92, 0.4], ['GBP', 0.79, -0.2], ['JPY', 151.2, 0.9], ['CAD', 1.36, -0.5], ['CHF', 0.88, 0.1], ['AUD', 1.52, -0.8]];
    const rate = (v) => (v >= 100 ? v.toFixed(1) : v.toFixed(2));
    const row = (x, i) => '<div class="pf-rw pf-it" data-r="' + esc(x[0] + ' · ' + rate(x[1]) + ' per USD · ' + num(x[1] * 1000) + ' for 1,000 USD · ' + (x[2] > 0 ? '+' : '−') + Math.abs(x[2]).toFixed(1) + '% in 7 days') + '" data-st="--i:' + (i + 1) + '"><span class="pf-rn">' + x[0] + '</span><span>' + rate(x[1]) + '</span><span>' + num(x[1] * 1000) + '</span><span class="' + (x[2] >= 0 ? 'pf-up-v' : 'pf-dn-v') + '">' + (x[2] > 0 ? '+' : x[2] < 0 ? '−' : '') + Math.abs(x[2]).toFixed(1) + '%</span></div>';
    const big = d.reduce((a, x) => (Math.abs(x[2]) > Math.abs(a[2]) ? x : a), d[0]);
    return html({
      feat: m.feat, fm: m.fm, idle: 'Sample rates for the demo, not live quotes',
      html: '<div class="pf-rows pf-tbl"><div class="pf-rw pf-hd"><span>Code</span><span>Rate</span><span>1,000 USD</span><span>7 days</span></div>' + d.map(row).join('') + '</div>',
      s1: { cap: '1,000 USD in EUR', v: d[0][1] * 1000, f: (x) => 'EUR ' + num(x), bad: false, sub: 'sample rate ' + rate(d[0][1]) },
      s2: { cap: 'Largest 7-day move', v: big[2], f: spct, bad: big[2] < 0, sub: big[0] + ', sample data' }
    });
  },
  loan(m) {
    const P = 18000, r = 0.059 / 12, n = 48, pay = (P * r) / (1 - Math.pow(1 + r, -n));
    let bal = P, ci = 0;
    const a = [P], c = [0];
    for (let i = 0; i < n; i++) { const it = bal * r; bal -= pay - it; ci += it; a.push(Math.max(0, bal)); c.push(ci); }
    return {
      kind: 'two', a, b: c, step: false, feat: m.feat, fm: m.fm, idle: 'Ink is the balance · green is interest paid so far',
      read: (j) => 'Month ' + j + ' · balance ' + money(a[j]) + ' · interest paid ' + money(c[j]),
      s1: { cap: 'Monthly payment', v: pay, f: money, bad: false, sub: '18,000 over 48 months at 5.9%' },
      s2: { cap: 'Total interest', v: ci, f: money, bad: false, sub: 'paid across the schedule' }
    };
  },
  workout(m) {
    const r = rng(hash('bench-log'));
    const a = Array.from({ length: 24 }, (_, i) => Math.round((60 + i * 1.1 + (r() - 0.5) * 8) / 2.5) * 2.5);
    const b = a.map((_, i) => Math.max(...a.slice(0, i + 1)));
    return {
      kind: 'two', a, b, step: true, feat: m.feat, fm: m.fm, idle: 'Ink is each top set · green is the best so far',
      read: (j) => 'Session ' + (j + 1) + ' · top set ' + a[j] + ' kg · best ' + b[j] + ' kg',
      s1: { cap: 'Personal best', v: b[23], f: (x) => x.toFixed(1) + ' kg', bad: false, sub: 'bench press, 24 sessions' },
      s2: { cap: 'Gain since session 1', v: ((b[23] - a[0]) / a[0]) * 100, f: spct, bad: false, sub: 'best versus the first top set' }
    };
  },
  guests(m) {
    const d = [['Family', [14, 3, 2, 3]], ['Friends', [18, 5, 4, 7]], ['Work', [9, 4, 3, 6]], ['Neighbours', [3, 2, 2, 1]], ['College', [6, 2, 1, 5]]];
    const N = ['Yes', 'Maybe', 'No', 'No reply'], K = ['', 'pf-wash', 'pf-soft', 'pf-out'];
    const tot = d.map((x) => x[1].reduce((a, b) => a + b, 0));
    const mx = Math.max(...tot);
    const yes = d.reduce((a, x) => a + x[1][0], 0), none = d.reduce((a, x) => a + x[1][3], 0), all = tot.reduce((a, b) => a + b, 0);
    return html({
      feat: m.feat, fm: m.fm, idle: 'Green yes · pale maybe · grey no · outline no reply',
      html: mkRows(d.map((x, i) => ({ r: x[0] + ' · ' + x[1].map((v, k) => v + ' ' + N[k].toLowerCase()).join(' · '), n: x[0], t: '<span class="pf-sgs" data-st="width:' + pc(tot[i], mx) + '">' + x[1].map((v, k) => '<i class="pf-sgm ' + K[k] + '" data-st="flex:' + v + ' 1 0"></i>').join('') + '</span>', v: x[1][0] + ' yes of ' + tot[i] }))),
      s1: { cap: 'Confirmed', v: yes, f: cnt, bad: false, sub: 'of ' + all + ' invited' },
      s2: { cap: 'Replied', v: ((all - none) / all) * 100, f: pc0, bad: false, sub: none + ' guests have not replied' }
    });
  }
};

let uid = 0;

export function mount(root, props, ctx) {
  const P = props || {};
  const L = Object.assign({}, DEFAULT_LABELS, (P.labels && typeof P.labels === 'object') ? P.labels : {});
  const SUG = (Array.isArray(P.prompts) && P.prompts.length ? P.prompts : DEFAULT_PROMPTS).map(String);
  const HZ = (Array.isArray(P.horizons) && P.horizons.length ? P.horizons : DEFAULT_HORIZONS).map((h) => ({ n: Math.max(2, Number(h.n) || 14), label: String(h.label ?? ''), note: String(h.note ?? '') }));
  const TPLS = (Array.isArray(P.templates) && P.templates.length ? P.templates : DEFAULT_TEMPLATES).filter((t) => t && BUILD[t.id]);
  const nameForm = P.productForm ?? 'Form';
  const nameSuffix = P.productSuffix ?? 'Cel';
  const accent = typeof P.accent === 'string' && P.accent && P.accent !== 'var(--hue)' ? P.accent : '';
  const gid = 'fwc-fc-' + (++uid);

  const section = ctx.host.closest('section') || ctx.host.parentElement || ctx.host;
  const off = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };

  const style = document.createElement('style');
  style.textContent = CSS.split('.F').join('.fwc-forecast');
  root.append(style);

  const ask = document.createElement('div');
  ask.className = 'fwc-forecast fc-ask';
  if (accent) ask.style.setProperty('--hue', accent);
  ask.innerHTML =
    '<div class="pf-panelwrap">' +
    '<span class="pf-xh pf-xh-a" aria-hidden="true"></span><span class="pf-xh pf-xh-b" aria-hidden="true"></span><span class="pf-xh pf-xh-c" aria-hidden="true"></span><span class="pf-xh pf-xh-d" aria-hidden="true"></span>' +
    '<div class="pf-panel"><div class="pf-field">' +
    '<div class="pf-ghost" data-k="ghost" aria-hidden="true"><span data-k="gt"></span><i class="pf-cur"></i></div>' +
    '<label class="pf-sro" for="' + gid + '-ta">' + esc(L.question) + '</label>' +
    '<textarea class="pf-ta" id="' + gid + '-ta" data-k="ta" rows="2" spellcheck="false" autocomplete="off"></textarea></div>' +
    '<div class="pf-row">' +
    '<button class="pf-btn pf-btn-quiet pf-up" data-k="up" type="button">' + UPLOAD + '<span>' + esc(L.upload) + '</span></button>' +
    '<button class="pf-link" data-k="sample" type="button">' + esc(L.sample) + '</button>' +
    '<div class="pf-file" data-k="file" hidden><span class="pf-chip"><span data-k="fl"></span><button data-k="rm" type="button" aria-label="' + esc(L.removeFile) + '">' + CROSS + '</button></span></div>' +
    '<button class="pf-btn pf-btn-ink pf-go" data-k="go" type="button"><span data-k="gol">' + esc(L.go) + '</span>' + ARROW + '<i class="pf-spin" aria-hidden="true"></i></button>' +
    '</div>' +
    '<input class="pf-sro" data-k="pickfile" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" tabindex="-1" aria-label="' + esc(L.chooseFile) + '">' +
    '</div></div>' +
    '<div class="pf-tplwrap"><div class="pf-tpls" data-k="tpls" role="radiogroup" aria-label="' + esc(L.startingPoint) + '">' +
    '<button class="pf-tc" type="button" role="radio" aria-checked="true" tabindex="0" data-id="free">' + esc(L.free) + '</button>' +
    TPLS.map((t) => '<button class="pf-tc" type="button" role="radio" aria-checked="false" tabindex="-1" data-id="' + esc(t.id) + '">' + esc(t.name) + '</button>').join('') +
    '</div><p class="pf-tn"><span data-k="tn1">' + esc(L.freeNote) + '</span><span data-k="tn2">' + esc(L.freeCols) + '</span></p></div>' +
    '<p class="pf-err" data-k="err" role="alert"></p>';
  root.append(ask);

  const out = document.createElement('div');
  out.className = 'fwc-forecast fc-out';
  if (accent) out.style.setProperty('--hue', accent);
  const defH = Math.min(1, HZ.length - 1);
  out.innerHTML =
    '<div class="pf-pick" data-k="pick"><button class="pf-pickbtn" data-k="pk" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + gid + '-menu"><span class="pf-dot" aria-hidden="true"></span><span><span class="pf-aform">' + esc(nameForm) + '</span><span class="pf-asuf">' + esc(nameSuffix) + '</span> · <span data-k="pkl">' + esc(HZ[defH].label) + '</span></span>' + CHEV + '</button>' +
    '<div class="pf-menu" id="' + gid + '-menu" data-k="menu" role="listbox" aria-label="' + esc(L.horizon) + '">' +
    HZ.map((h, i) => '<button class="pf-opt" type="button" role="option" tabindex="-1" aria-selected="' + (i === defH) + '" data-n="' + h.n + '" data-l="' + esc(h.label) + '">' + esc(h.label) + ' <small>' + esc(h.note) + '</small></button>').join('') +
    '</div></div>' +
    '<div class="pf-res" data-k="res"><div class="pf-stats">' +
    '<div class="pf-stat"><span class="pf-cap" data-k="s1n">Series</span><span class="pf-big" data-k="s1v">0.0%</span><span class="pf-cap" data-k="s1c">' + esc(L.meanVsLast) + '</span></div>' +
    '<div class="pf-stat"><span class="pf-cap" data-k="s2n">' + esc(L.confidence) + '</span><span class="pf-big" data-k="s2v">0%</span><span class="pf-cap" data-k="s2c">' + esc(L.band) + '</span></div></div>' +
    '<p class="pf-rt"><span class="pf-ft" data-k="ft"></span><span class="pf-fm" data-k="fm"></span><span class="pf-read" data-k="read"></span></p>' +
    '<div class="pf-alt" data-k="alt" tabindex="0" role="group" aria-label="' + esc(L.resultLabel) + '"></div>' +
    '<div class="pf-plot" data-k="plot" tabindex="0" role="img" aria-label="' + esc(L.plotLabel) + '"><span class="pf-now" data-k="now">' + esc(L.now) + '</span>' +
    '<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="' + gid + '-ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ink,#eef0f4)" stop-opacity="0.16"/><stop offset="1" stop-color="var(--ink,#eef0f4)" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="' + gid + '-gb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--hue,#3ecf8e)" stop-opacity="0.02"/><stop offset="1" stop-color="var(--hue,#3ecf8e)" stop-opacity="0.34"/></linearGradient></defs>' +
    '<path class="pf-area" data-k="area" fill="url(#' + gid + '-ga)" d=""/><path class="pf-band" data-k="band" fill="url(#' + gid + '-gb)" d=""/>' +
    '<line class="pf-div" data-k="div" x1="0" x2="0" y1="0" y2="100"/><path class="pf-hist" data-k="hist" d=""/><path class="pf-fc" data-k="fcl" d=""/>' +
    '<line class="pf-hair" data-k="hair" x1="0" x2="0" y1="0" y2="100"/></svg></div></div>' +
    '<div class="pf-drop" data-k="drop" aria-hidden="true">' + esc(L.drop) + '</div>' +
    '<p class="pf-sro" data-k="live" aria-live="polite"></p>';
  section.append(out);
  off.push(() => out.remove());

  const $ = (k) => ask.querySelector('[data-k="' + k + '"]') || out.querySelector('[data-k="' + k + '"]');
  const both = [ask, out];
  const H = {
    add: (...c) => both.forEach((e) => e.classList.add(...c)),
    remove: (...c) => both.forEach((e) => e.classList.remove(...c)),
    toggle: (c, f) => both.forEach((e) => e.classList.toggle(c, f))
  };
  if (ctx.reduced) H.add('fc-reduced');
  const setVars = (done, busy) => {
    section.style.setProperty('--fc-done', done ? '1' : '0');
    section.style.setProperty('--fc-busy', busy ? '1' : '0');
  };
  setVars(false, false);
  section.style.setProperty('--fc-px', '0px');
  section.style.setProperty('--fc-py', '0px');

  const ta = $('ta'), ghost = $('ghost'), gt = $('gt'), go = $('go'), gol = $('gol'), err = $('err');
  let horizon = HZ[defH].n, state = 'idle', file = null, series = null, gi = 0, fc = null, hover = -1, geo = null, tplId = 'free', cur = null, idleText = '', items = [], altI = -1;
  let dead = false;
  const timers = new Set();
  const wait = (ms) => new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });

  let ghostRun = 0;
  const ghostLoop = async () => {
    const id = ++ghostRun;
    const live = () => !dead && id === ghostRun && ta.value === '' && state === 'idle';
    await wait(900);
    while (live()) {
      const s = SUG[gi];
      for (let i = 1; i <= s.length && live(); i++) {
        gt.textContent = s.slice(0, i);
        await wait(45 + Math.random() * 45);
      }
      if (!live()) break;
      await wait(2000);
      for (let i = s.length - 1; i >= 0 && live(); i--) {
        gt.textContent = s.slice(0, i);
        await wait(18);
      }
      if (!live()) break;
      await wait(400);
      gi = (gi + 1) % SUG.length;
    }
  };
  const ghostSync = () => {
    ghost.classList.toggle('pf-off', ta.value !== '');
    if (ta.value === '') {
      if (ctx.reduced) gt.textContent = SUG[gi];
      else ghostLoop();
    } else {
      ghostRun++;
    }
  };

  // horizon picker
  const pk = $('pk'), menu = $('menu'), opts = [...menu.querySelectorAll('.pf-opt')];
  const setOpen = (v) => {
    menu.classList.toggle('pf-open', v);
    pk.setAttribute('aria-expanded', String(v));
    opts.forEach((o) => o.setAttribute('tabindex', v ? '0' : '-1'));
  };
  on(pk, 'click', () => {
    const v = !menu.classList.contains('pf-open');
    setOpen(v);
    if (v) opts.find((o) => o.getAttribute('aria-selected') === 'true').focus({ preventScroll: true });
  });
  opts.forEach((o) => on(o, 'click', () => {
    opts.forEach((x) => x.setAttribute('aria-selected', String(x === o)));
    horizon = Number(o.dataset.n);
    $('pkl').textContent = o.dataset.l;
    setOpen(false);
    pk.focus({ preventScroll: true });
    if (state === 'done' && cur.kind === 'fc') recompute(false);
  }));
  on(window, 'pointerdown', (e) => { if (!$('pick').contains(e.target)) setOpen(false); });
  on(menu, 'keydown', (e) => {
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(opts.length - 1, i + 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(0, i - 1)].focus(); }
    if (e.key === 'Escape') { setOpen(false); pk.focus(); }
  });

  // pointer parallax for the native photo
  if (!ctx.reduced) {
    let pend = null, raf = 0;
    on(window, 'pointermove', (e) => {
      pend = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nx = pend.clientX / innerWidth - 0.5;
        const ny = pend.clientY / innerHeight - 0.5;
        section.style.setProperty('--fc-px', (-nx * 36).toFixed(1) + 'px');
        section.style.setProperty('--fc-py', (-ny * 20).toFixed(1) + 'px');
      });
    }, { passive: true });
    off.push(() => { if (raf) cancelAnimationFrame(raf); });
  }

  // table reading
  const letter = (c) => String.fromCharCode(65 + (c % 26));
  const isNum = (c) => c !== '' && Number.isFinite(Number(c));
  const parse = (text) => {
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^["']+|["']+$/g, '')));
    if (rows.length < 4) return null;
    let head = null;
    if (rows[0].some((c) => !isNum(c))) head = rows.shift();
    if (rows.length < 4) return null;
    const width = Math.max(...rows.map((r) => r.length));
    for (let c = width - 1; c >= 0; c--) {
      const vals = rows.map((r) => r[c] ?? '');
      const nums = vals.filter(isNum).map(Number);
      if (nums.length >= 4 && nums.length / rows.length >= 0.8) {
        return { values: nums.slice(-60), rows: rows.length, col: head && head[c] ? head[c] : 'Column ' + (c + 1), letter: letter(c) };
      }
    }
    return null;
  };
  const setFile = (f) => {
    file = f;
    $('file').hidden = !f;
    $('up').hidden = !!f;
    $('sample').hidden = !!f;
    if (f) $('fl').textContent = f.name + ' · ' + f.rows + ' rows · ' + f.letter + ' ' + f.col;
  };
  const isTplPrompt = (s) => TPLS.some((t) => t.prompt === s.trim());
  const load = async (blob, fname) => {
    const ext = (fname.split('.').pop() || '').toLowerCase();
    if (!['csv', 'tsv', 'txt'].includes(ext) && !(blob.type || '').startsWith('text/')) {
      err.textContent = L.errType;
      return false;
    }
    let text = '';
    try { text = await blob.text(); } catch (e) { err.textContent = L.errRead; return false; }
    const p = parse(text);
    if (!p) { err.textContent = L.errNone; return false; }
    err.textContent = '';
    setFile({ name: fname, ...p });
    chooseTpl('free', false);
    if (ta.value.trim() === '' || isTplPrompt(ta.value)) {
      ta.value = fill(L.filePrompt, { col: p.col, n: horizon });
      ghostSync();
    }
    return true;
  };
  on($('up'), 'click', () => $('pickfile').click());
  on($('pickfile'), 'change', (e) => {
    const f = e.target.files[0];
    if (f) load(f, f.name);
    e.target.value = '';
  });
  on($('rm'), 'click', () => { setFile(null); $('up').focus(); });
  on($('sample'), 'click', () => {
    let t = 'week,signups\n';
    for (let i = 0; i < 36; i++) t += 'W' + (i + 1) + ',' + Math.round(120 + i * 3.4 + 18 * Math.sin((i / 52) * 2 * Math.PI * 4.33) + ((i * 37) % 11)) + '\n';
    load(new Blob([t], { type: 'text/csv' }), L.sampleName).then(() => {
      ta.value = fill(L.samplePrompt, { n: horizon });
      ghostSync();
    });
  });

  let dc = 0;
  const drop = $('drop');
  on(window, 'dragenter', (e) => { e.preventDefault(); dc++; drop.classList.add('pf-on'); });
  on(window, 'dragover', (e) => e.preventDefault());
  on(window, 'dragleave', () => { dc = Math.max(0, dc - 1); if (!dc) drop.classList.remove('pf-on'); });
  on(window, 'drop', (e) => {
    e.preventDefault();
    dc = 0;
    drop.classList.remove('pf-on');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) load(f, f.name);
  });

  const generate = (text) => {
    const r = rng(hash(text));
    const base = 40 + r() * 60, drift = (r() - 0.35) * 0.9, amp = base * (0.05 + r() * 0.08);
    return Array.from({ length: 40 }, (_, i) => base + drift * i + amp * Math.sin((i / 12) * 2 * Math.PI) + (r() - 0.5) * base * 0.08);
  };
  const forecast = (v, h) => {
    const m = Math.min(24, v.length), w = v.slice(-m), n = v.length;
    const mx = (m - 1) / 2, my = w.reduce((a, b) => a + b, 0) / m;
    let sxy = 0, sxx = 0;
    w.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
    const slope = sxx ? sxy / sxx : 0, icpt = my - slope * mx;
    const res = w.map((y, i) => y - (icpt + slope * i));
    const seas = Array(12).fill(0);
    if (v.length >= 24) {
      const c = Array(12).fill(0);
      res.forEach((e, i) => { const k = (n - m + i) % 12; seas[k] += e; c[k]++; });
      for (let k = 0; k < 12; k++) seas[k] = c[k] ? seas[k] / c[k] : 0;
    }
    const rem = res.map((e, i) => e - seas[(n - m + i) % 12]);
    const sd = Math.sqrt(rem.reduce((a, b) => a + b * b, 0) / m);
    const vals = [], lo = [], hi = [];
    for (let i = 0; i < h; i++) {
      const x = m + i;
      const val = icpt + slope * x + seas[(n + i) % 12];
      const half = 1.64 * sd * Math.sqrt(1 + (i + 1) / 4);
      vals.push(val); lo.push(val - half); hi.push(val + half);
    }
    return { vals, lo, hi };
  };

  const hist = $('hist'), fcl = $('fcl'), band = $('band'), area = $('area'), divl = $('div'), hair = $('hair'), nowl = $('now');
  const draw = () => {
    const n = series.length, N = n + horizon;
    const all = series.concat(fc.lo, fc.hi);
    const mn = Math.min(...all), mxv = Math.max(...all), span = mxv - mn || 1;
    const X = (j) => ((j / (N - 1)) * 1000).toFixed(2);
    const Y = (v) => (96 - ((v - mn) / span) * 90).toFixed(2);
    const hp = series.map((v, j) => (j ? 'L' : 'M') + X(j) + ' ' + Y(v)).join('');
    hist.setAttribute('d', hp);
    area.setAttribute('d', hp + 'L' + X(n - 1) + ' 100L0 100Z');
    const last = 'M' + X(n - 1) + ' ' + Y(series[n - 1]);
    fcl.setAttribute('d', last + fc.vals.map((v, i) => 'L' + X(n + i) + ' ' + Y(v)).join(''));
    band.setAttribute('d', last + fc.hi.map((v, i) => 'L' + X(n + i) + ' ' + Y(v)).join('') + fc.lo.map((v, i) => 'L' + X(n + horizon - 1 - i) + ' ' + Y(fc.lo[horizon - 1 - i])).join('') + 'Z');
    divl.setAttribute('x1', X(n - 1));
    divl.setAttribute('x2', X(n - 1));
    nowl.style.left = ((n - 1) / (N - 1)) * 100 + '%';
    geo = {
      n, N,
      read: (j) => {
        const rel = j - (n - 1);
        const v = j < n ? series[j] : fc.vals[j - n];
        const lab = rel === 0 ? 'present' : rel < 0 ? 'present minus ' + -rel : 'present plus ' + rel;
        return (j < n ? 'Actual' : 'Forecast') + ' · ' + lab + ' · ' + fmt(v);
      }
    };
  };
  const drawTwo = (b) => {
    const a = b.a, c = b.b, N = a.length;
    const all = a.concat(c);
    const mn = Math.min(...all), mxv = Math.max(...all), span = mxv - mn || 1;
    const X = (j) => ((j / (N - 1)) * 1000).toFixed(2);
    const Y = (v) => (96 - ((v - mn) / span) * 62).toFixed(2);
    const hp = a.map((v, j) => (j ? 'L' : 'M') + X(j) + ' ' + Y(v)).join('');
    hist.setAttribute('d', hp);
    area.setAttribute('d', hp + 'L' + X(N - 1) + ' 100L0 100Z');
    let d = 'M' + X(0) + ' ' + Y(c[0]);
    for (let j = 1; j < N; j++) d += (b.step ? 'L' + X(j) + ' ' + Y(c[j - 1]) : '') + 'L' + X(j) + ' ' + Y(c[j]);
    fcl.setAttribute('d', d);
    band.setAttribute('d', '');
    geo = { n: N, N, read: (j) => b.read(j) };
  };

  const fcStats = () => {
    const n = series.length, last = series[n - 1];
    const mean = fc.vals.reduce((a, b) => a + b, 0) / horizon;
    const pct = last ? ((mean - last) / Math.abs(last)) * 100 : 0;
    const fin = fc.vals[horizon - 1];
    const rel = Math.abs(fin) > 1e-9 ? (fc.hi[horizon - 1] - fc.lo[horizon - 1]) / Math.abs(fin) : 1;
    const conf = Math.max(62, Math.min(97, 100 - 60 * rel));
    const nm = cur.name;
    return {
      s1: { cap: nm.length > 26 ? nm.slice(0, 25) + '…' : nm, v: pct, f: spct, bad: pct < 0, sub: L.meanVsLast + ' · ' + horizon + ' ' + L.steps },
      s2: { cap: L.confidence, v: conf, f: (x) => x.toFixed(0) + '%', bad: false, sub: L.band }
    };
  };
  const getStats = () => (cur.kind === 'fc' ? fcStats() : { s1: cur.s1, s2: cur.s2 });

  let cu = 0;
  const countUp = (anim) => {
    const st = getStats();
    const s1 = $('s1v'), s2 = $('s2v');
    s1.classList.toggle('pf-neg', st.s1.bad);
    s2.classList.toggle('pf-neg', st.s2.bad);
    $('s1n').textContent = st.s1.cap;
    $('s1c').textContent = st.s1.sub;
    $('s2n').textContent = st.s2.cap;
    $('s2c').textContent = st.s2.sub;
    const paint = (k) => {
      s1.textContent = st.s1.f(st.s1.v * k);
      s2.textContent = st.s2.f(st.s2.v * k);
    };
    cancelAnimationFrame(cu);
    if (!anim || ctx.reduced) { paint(1); return; }
    const t0 = performance.now();
    const step = (t) => {
      if (dead) return;
      const k = Math.min(1, (t - t0) / 1200);
      paint(1 - Math.pow(1 - k, 3));
      if (k < 1) cu = requestAnimationFrame(step);
    };
    cu = requestAnimationFrame(step);
  };
  const recompute = (anim) => {
    fc = forecast(series, horizon);
    draw();
    countUp(anim);
  };

  const meta = (id) => TPLS.find((t) => t.id === id);
  const freeBuild = (text) => {
    const s = file ? file.values.slice() : generate(text);
    return {
      kind: 'fc', series: s, name: file ? file.col : L.seriesFallback, feat: L.featCharts,
      fm: L.fmForecast,
      idle: file ? file.name + ' · ' + file.letter + '2:' + file.letter + (file.values.length + 1) : 'Prompt series · ' + s.length + ' rows',
      title: L.forecast
    };
  };

  const altEl = $('alt');
  const apply = (b) => {
    const alt = b.kind === 'html';
    H.toggle('pf-vz', alt);
    H.toggle('pf-two', b.kind === 'two');
    $('ft').textContent = b.feat;
    $('fm').textContent = b.fm;
    idleText = b.idle;
    $('read').textContent = idleText;
    hover = -1;
    altI = -1;
    hair.classList.remove('pf-on');
    if (alt) {
      altEl.innerHTML = b.html;
      altEl.querySelectorAll('[data-st]').forEach((n) => {
        n.dataset.st.split(';').forEach((d) => {
          const k = d.indexOf(':');
          if (k > 0) n.style.setProperty(d.slice(0, k).trim(), d.slice(k + 1).trim());
        });
      });
      items = [...altEl.querySelectorAll('.pf-it')];
      geo = null;
    } else if (b.kind === 'two') {
      items = [];
      drawTwo(b);
    } else {
      items = [];
      series = b.series;
      fc = forecast(series, horizon);
      draw();
    }
    const st = getStats();
    $('s1v').textContent = st.s1.f(0);
    $('s2v').textContent = st.s2.f(0);
    $('s1v').classList.remove('pf-neg');
    $('s2v').classList.remove('pf-neg');
    $('s1n').textContent = st.s1.cap;
    $('s1c').textContent = st.s1.sub;
    $('s2n').textContent = st.s2.cap;
    $('s2c').textContent = st.s2.sub;
  };

  const submit = () => {
    if (state === 'running') return;
    setOpen(false);
    let b;
    if (tplId === 'free') {
      let text = ta.value.trim();
      if (!text) text = SUG[gi];
      ta.value = text;
      ghostSync();
      b = freeBuild(text);
    } else {
      const m = meta(tplId);
      b = BUILD[tplId](m, L);
      b.title = m.name;
    }
    cur = b;
    state = 'running';
    H.remove('pf-run', 'pf-done', 'pf-busy');
    void out.offsetWidth;
    H.add('pf-run', 'pf-busy');
    setVars(false, true);
    go.disabled = true;
    gol.textContent = L.busy;
    apply(b);
    const t = setTimeout(() => {
      timers.delete(t);
      if (dead) return;
      state = 'done';
      H.add('pf-done');
      H.remove('pf-busy');
      setVars(true, false);
      go.disabled = false;
      gol.textContent = L.go;
      countUp(true);
      const st = getStats();
      $('live').textContent = b.title + ' ' + L.ready + '. ' + st.s1.cap + ' ' + st.s1.f(st.s1.v) + '. ' + st.s2.cap + ' ' + st.s2.f(st.s2.v) + '.';
    }, ctx.reduced ? 0 : 1400);
    timers.add(t);
  };
  on(go, 'click', submit);
  on(ta, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  on(ta, 'input', () => {
    if (tplId !== 'free') chooseTpl('free', false);
    ghostSync();
  });

  // chart read-out
  const plot = $('plot'), rd = $('read');
  const move = (e) => {
    if (!geo) return;
    const r = plot.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const j = Math.round(k * (geo.N - 1));
    if (j === hover) return;
    hover = j;
    const x = (j / (geo.N - 1)) * 1000;
    hair.setAttribute('x1', x);
    hair.setAttribute('x2', x);
    hair.classList.add('pf-on');
    rd.textContent = geo.read(j);
  };
  on(plot, 'pointermove', move);
  on(plot, 'pointerleave', () => {
    hover = -1;
    hair.classList.remove('pf-on');
    rd.textContent = idleText;
  });
  on(plot, 'keydown', (e) => {
    if (!geo || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(geo.N - 1, (hover < 0 ? geo.n - 1 : hover) + (e.key === 'ArrowRight' ? 1 : -1)));
    const r = plot.getBoundingClientRect();
    hover = -1;
    move({ clientX: r.left + (j / (geo.N - 1)) * r.width });
  });
  const hl = (i) => {
    items.forEach((x, k) => x.classList.toggle('pf-hl', k === i));
    altI = i;
    rd.textContent = i < 0 ? idleText : items[i].dataset.r;
  };
  on(altEl, 'pointermove', (e) => {
    const t = e.target.closest('.pf-it');
    const i = t ? items.indexOf(t) : -1;
    if (i !== altI) hl(i);
  });
  on(altEl, 'pointerleave', () => hl(-1));
  on(altEl, 'blur', () => hl(-1));
  on(altEl, 'keydown', (e) => {
    if (!items.length) return;
    const f = e.key === 'ArrowRight' || e.key === 'ArrowDown', b = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!f && !b) return;
    e.preventDefault();
    hl(Math.max(0, Math.min(items.length - 1, altI < 0 ? (f ? 0 : items.length - 1) : altI + (f ? 1 : -1))));
  });

  // starting-point chips
  const tpls = $('tpls'), chips = [...tpls.querySelectorAll('.pf-tc')];
  function chooseTpl(id, full) {
    tplId = id;
    chips.forEach((c) => {
      const v = c.dataset.id === id;
      c.setAttribute('aria-checked', String(v));
      c.tabIndex = v ? 0 : -1;
    });
    const t = id === 'free' ? null : meta(id);
    $('tn1').textContent = t ? t.name + ' · ' + t.feat : L.freeNote;
    $('tn2').textContent = t ? t.cols : L.freeCols;
    if (!full) return;
    const chip = chips.find((c) => c.dataset.id === id);
    chip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: ctx.reduced ? 'auto' : 'smooth' });
    if (!t) {
      if (isTplPrompt(ta.value)) { ta.value = ''; ghostSync(); }
      ta.focus({ preventScroll: true });
      return;
    }
    setFile(null);
    ta.value = t.prompt;
    ghostSync();
    err.textContent = '';
    submit();
  }
  chips.forEach((c) => on(c, 'click', () => {
    if (state === 'running') return;
    chooseTpl(c.dataset.id, true);
  }));
  on(tpls, 'keydown', (e) => {
    const i = chips.indexOf(document.activeElement);
    if (i < 0) return;
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = Math.min(chips.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = Math.max(0, i - 1);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = chips.length - 1;
    if (n === i) return;
    e.preventDefault();
    chips.forEach((c) => { c.tabIndex = -1; });
    chips[n].tabIndex = 0;
    chips[n].focus();
  });

  ghostSync();
  ctx.ready();

  return () => {
    dead = true;
    ghostRun++;
    cancelAnimationFrame(cu);
    timers.forEach((t) => clearTimeout(t));
    off.forEach((f) => f());
    ['--fc-done', '--fc-busy', '--fc-px', '--fc-py'].forEach((p) => section.style.removeProperty(p));
  };
}
