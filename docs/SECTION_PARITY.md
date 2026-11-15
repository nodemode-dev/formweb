# Section parity

Every template in the section library was compared with the page it came from. This file records the result for release 0.19.2, with the rows re-run in 0.19.3 merged in. See [LIBRARY.md](LIBRARY.md) for what the templates are.

Re-run in 0.19.3: the header, the footer and 25 sections (every section whose variables became `%%name%%`, whose scene offset became `var(--bar-h)` or that dropped a workaround for the wider vocabulary) were shot again in all four runs and carry their 0.19.3 rows. The other 10 rows (formcel-feature-rows, formcut-feature-rows, formencoder-how-it-works, formpromo-use-cases, formskills-integrations, formslot-timeline, formbench-figures, formfabric-stories, formcompiler-cta and formtray-footer) keep their 0.19.2 rows, including their older run-cell format.

## How it was measured

For each section, with the formai.studio header and footer templates around it, the template was inserted into a fresh site, exported, and shot next to its original with `shoot.py` at 8 steps. The shots were taken in four runs: 1440 px wide in the dark theme, 1440 px in the light theme, 390 px in the dark theme, and 1440 px dark under a 4x slower CPU and a slow network. The originals come from formai-xmental-webspun v3.1.0, shot warm from a local cache of their captures. Side-by-side montages (original left, template right) were read frame by frame for layout, type scale, colours in both themes, motion states and interaction. Pictures on `media.formai.studio` were loaded on both sides, so a missing picture counts as a difference.

Each run cell holds four numbers separated by slashes: console entries, page errors, cumulative layout shift, and horizontal overflow (0 or n for none). Where the original's number differs from the template's it follows in parentheses or square brackets. The bar for a pass is no console errors and no page errors beyond pictures that fail on both sides, layout shift under 0.001, no horizontal overflow, and frames that match the original. "Pass with differences" meets the numeric bar and lists what still differs.

Summary: 37 rows (the header, the footer and 35 sections), 19 pass and 18 pass with differences. No row fails.

## Table

| id | route | 1440 dark | 1440 light | 390 dark | 1440 dark 4x | verdict | named differences |
| --- | --- | --- | --- | --- | --- | --- | --- |
| formai-header | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | search input carries spellcheck off, enterkeyhint search and inputmode search; bar height token unchanged (var(--bar-h), 64px in the preset) |
| formai-footer | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | unchanged by this turn; none visible |
| formcel-feature-rows | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formdam-capture-wall | none | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | scene offset is var(--bar-h) (was 65 px); same 390 header caveat |
| formpromo-use-cases | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | product icon is bundled (library/media) and loads |
| formmcp-faq | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | faq_open1 to faq_open4 are %%name%% scoped (two inserts proved independent); none visible |
| formcompiler-cta | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formtray-footer | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | real product icon restored (bundled webp) |
| formcut-feature-rows | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | bullet lists show all items at the first frame; the original reveals them one by one on scroll |
| formencoder-how-it-works | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | card bullet lists are visible at step 0; the original reveals them a step later |
| formskills-integrations | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | 34 icons plus the tile icon are bundled and load; the icon grid sits a few px higher in the panel |
| formslot-timeline | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | step terminals and copy are offset vertically by a few tens of px against the rail; the reveal timing of bullets and the button differs |
| formbench-figures | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formfabric-stories | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | tag icon is bundled and loads |
| formdeck-deckhand | physics-deck | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | scene offset is var(--bar-h) (the original pinned at bar plus 1 px); same 390 header caveat |
| formmorpheus-filmstrip | filmstrip | 0/0/3.5e-6/n | 0/0/0/n | 0/0/0/n | 0/0/5.6e-6/n | pass with differences | scene offset is var(--bar-h); at 390 the pinned stage top is the 64 px token while the header is 97 px until the header sets --bar-h there (see hand-back), so the stage's own bar slides 33 px under the header |
| formvis-tiles | tile-cut | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | scene offset is var(--bar-h); same 390 header caveat; scroll-margin-top reads the token |
| formcut-proxy-monitor | fog-wipe-monitor | 0/0/2.4e-5/n | 0/0/2.4e-5/n | 0/0/1.6e-4/n | 0/0/2.4e-5/n | pass with differences | scene offset is var(--bar-h); same 390 header caveat |
| formsculpt-viewport | glyph-lens | 4/0/0/n | 4/0/0/n | 4/0/0/n | 4/0/0/n | pass with differences | the 4 console entries are software-GL driver warnings; scene offset is var(--bar-h) (was 65 px); same 390 header caveat |
| formsurface-swatch | paint-sim | 4/0/0/n | 4/0/0/n | 4/0/0/n | 4/0/0/n | pass with differences | the 4 console entries are software-GL driver warnings (GPU stall due to ReadPixels) from --software-gl; scene offset is var(--bar-h); same 390 header caveat |
| formvfx-orbit | orbit-constellation | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | variables are %%orbitFilter%% and %%orbitShuffle%% (also passed as filterVariable and shuffleVariable props), so two inserts keep their own filter (proved with Playwright); the mobile chip row hides its scrollbar with scrollbar-width: none and the hard-coded 97 px top and height override is removed in favour of the scene offset var(--bar-h); the poster is a dark still so the first frame in light shows it until the component is ready; same 390 header caveat |
| formref-pinboard | infinite-board | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | page links use text-decoration with text-decoration-color, thickness and text-underline-offset (colour fade on hover) instead of a static underline; the first frame is still fading in; clock reads a different time |
| formdesign-spreads | page-turn | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | variables, table and formulas are %%name%% scoped (two inserts proved independent); email field carries autocomplete and spellcheck off; first frame fades in slightly later than the original |
| formvfx-vortex | tube-travel | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | variables are %%tubeOpen%%, %%tubeIndex%%, %%tubeShare%% (passed to the component as props); scene offset is var(--bar-h); frames sampled mid-scroll differ slightly in tube position and caption timing, as before |
| formtray-panes | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | view and shown variables are %%view%% and %%shown%%; none visible |
| formcad-plan | fold-plan | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | token-list custom property removed; none visible |
| formcel-foresheet | forecast-chart | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the first frame is shot before the component draws (the horizon picker and ask panel are absent); the typed prompt text is at a different character each frame; the unused token-list custom property is gone |
| format-casting | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | variables are %%name%% (two copies on one page stay independent); overflow-wrap anywhere and a scrollable conversation with scrollbar-width none replace break-word and a clipped list; the sidebar app icon, aurora panel and stage glow are restored from bundled media; none visible |
| formsurface-prompt | scripted-desktop | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the turntable desktop icon picture is blank in the first frame; the unused token-list custom property is gone |
| formmorpheus-prompt | glyph-lens, develop-frame | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the headline now wraps like the original ("moves." then "Watch the"); the vertical "Recent frames" label uses writing-mode vertical-rl and the ratio icons are rect elements; the unused token-list custom property is gone |
| formmd-prompt | noise-band | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | "note" and "back." are animated ink-to-hue gradient text (background-clip text with a registered --pt-x position loop); variables are %%fmd_*%% and stay independent per copy; the typed prompt is at a different character per frame |
| formmcp-prompt | token-prompt | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the headline's second line is now the animated ink-to-hue gradient text (background-clip text, -webkit-text-fill-color, a registered --kn-x position loop of 8 s); all 16 variables are %%name%% and stay independent per copy |
| format-prompt | specks | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the question field has resize none and the asked-question line uses overflow-wrap anywhere; pe_phase and pe_depth are %%name%% and stay independent per copy; none visible |
| formslot-support | starfield, ruler-slider | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | all 97 variables are %%name%% (a second copy on one page needs a doc with room: two inserts together take about 22 s in the engine); fine print is set to mono uppercase like the original; the large FormAI watermark is visibly stronger than the original's (nested opacity there makes it nearly invisible); totals are still counting at the first frame |
| formbench-support | ruler-slider | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | all 36 variables are %%name%% and the ruler's variable, yearsVariable, capVariable, liveVariables and odometer sources are passed as props; source links use text-decoration-color and text-underline-offset 3px; the years field has inputmode numeric and appearance none; the unused token-list custom property is gone; none visible |
| formtxt-404 | receipt-printer | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | address uses overflow-wrap: anywhere with word-break; search field carries spellcheck and enterkeyhint; receipt time differs |
| formpath-knockout | knockout-artboard | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the intro choreography runs at 0.3x, so the first frame is a transient; scene offset is var(--bar-h) and the component reads ctx.progress() as is (the offset-over-span compensation is gone, scroll-to subtracts the pinned top), so story phases sit about 64 px of scroll later than the original; the scattered floating shapes are absent in the second frame; same 390 header caveat |

## Notes

The 4x runs measure cumulative layout shift on a slow machine and a slow network, which is where late pictures and late component mounts would show up first. Every template stays under 0.001 there.

Several differences share a cause. Page components mount lazily, when their host comes within one viewport, so the first frame of a component section can show its poster or an earlier state than the original. Pictures that load after the shot leave a frame empty. Both are timing, not layout. See the known limits in [LIBRARY.md](LIBRARY.md).

The "same 390 header caveat" in the pinned scroll stories is from the first 0.19.3 shots, taken before the preset carried `pageBreakpoints`. The preset now sets `--bar-h` to 97px on phones, which is what those stories pin below; measured on the exported filmstrip after that change, the header is 98px tall at 390 (97 plus its 1px border) and 65px at 1440, and the stage pins at 97px and 64px, one pixel under the header's border, where the originals pin at the header's full measured height.
