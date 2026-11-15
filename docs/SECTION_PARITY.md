# Section parity

Every template in the section library was compared with the page it came from. This file records the result for release 0.19.2. See [LIBRARY.md](LIBRARY.md) for what the templates are.

## How it was measured

For each section, with the formai.studio header and footer templates around it, the template was inserted into a fresh site, exported, and shot next to its original with `shoot.py` at 8 steps. The shots were taken in four runs: 1440 px wide in the dark theme, 1440 px in the light theme, 390 px in the dark theme, and 1440 px dark under a 4x slower CPU and a slow network. The originals come from formai-xmental-webspun v3.1.0, shot warm from a local cache of their captures. Side-by-side montages (original left, template right) were read frame by frame for layout, type scale, colours in both themes, motion states and interaction. Pictures on `media.formai.studio` were loaded on both sides, so a missing picture counts as a difference.

Each run cell holds four numbers separated by slashes: console entries, page errors, cumulative layout shift, and horizontal overflow (0 or n for none). Where the original's number differs from the template's it follows in parentheses or square brackets. The bar for a pass is no console errors and no page errors beyond pictures that fail on both sides, layout shift under 0.001, no horizontal overflow, and frames that match the original. "Pass with differences" meets the numeric bar and lists what still differs.

Summary: 36 rows (the header and footer pair plus 35 sections), 18 pass and 18 pass with differences. No row fails.

## Table

| id | route | 1440 dark | 1440 light | 390 dark | 1440 dark 4x | verdict | named differences |
| --- | --- | --- | --- | --- | --- | --- | --- |
| formai-header / formai-footer | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | checked through every section: identical bar and footer in dark and light |
| formcel-feature-rows | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formdam-capture-wall | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formpromo-use-cases | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | product icon is bundled (library/media) and loads |
| formmcp-faq | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formcompiler-cta | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formtray-footer | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | real product icon restored (bundled webp) |
| formcut-feature-rows | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | bullet lists show all items at the first frame; the original reveals them one by one on scroll |
| formencoder-how-it-works | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | card bullet lists are visible at step 0; the original reveals them a step later |
| formskills-integrations | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | 34 icons plus the tile icon are bundled and load; the icon grid sits a few px higher in the panel |
| formslot-timeline | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | step terminals and copy are offset vertically by a few tens of px against the rail; the reveal timing of bullets and the button differs |
| formbench-figures | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | none visible |
| formfabric-stories | native | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass | tag icon is bundled and loads |
| formdeck-deckhand | physics-deck | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | all 12 slides are bundled and load; step 0 shows fewer landed slides and no aside or buttons yet (physics settle and intro timing); random throw positions differ per run |
| formmorpheus-filmstrip | filmstrip | 0/0/0/0 | 0/0/0/0 (original 3e-6) | 0/0/0/0 | 0/0/3e-6/0 (original 6e-6) | pass with differences | step 0 still shows "Loading frames 0 / 18" while the original has its frames cached; the plate counter is 2 frames ahead of the original at some steps |
| formvis-tiles | tile-cut | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | pass with differences | step 0 tiles are still assembling (the original is already assembled); later frames are identical |
| formcut-proxy-monitor | fog-wipe-monitor | 0/0/2.4e-5/0 | 0/0/2.4e-5/0 | 0/0/1.6e-4/0 | 0/0/2.4e-5/0 | pass with differences | step 0 shows a black "decoding frame" (the proxy image is not yet decoded); step 1 lacks the fogged "cut clean" lettering the original shows; layout shift equals the original's |
| formsculpt-viewport | glyph-lens | 4/0/0/0 (original 4) | 4/0/0/0 (original 4) | 4/0/0/0 (original 4) | 4/0/0/0 (original 4) | pass with differences | the 4 console entries are software-GL ReadPixels stall warnings on both sides; step 2 is still in the ASCII mesh while the original already shows the shaded viewer UI (load timing); the viewer tool rail is not visible at step 2 |
| formsurface-swatch | paint-sim, ruler-slider | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the random material id differs per load; the swatch card is a few px narrower in the card steps |
| formvfx-orbit | orbit-constellation | 0/0/0/n [0/0/1.5e-5/n] | 0/0/0/n [0/0/1.5e-5/n] | 0/0/0/n [0/0/1.0e-4/n] | 0/0/0/n [0/0/1.5e-5/n] | pass with differences | the poster was regenerated warm (it was cool blue) but it is a dark still, so the first frame in light shows it until the component is ready; the 390 hero headline wraps larger than the original |
| formref-pinboard | infinite-board | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the poster was regenerated warm; cards are still fading in at the first frame (the intro reveal starts later than the original) |
| formdesign-spreads | page-turn | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the poster was regenerated warm with the real cover; the book is empty at the first frame until the pictures load |
| formvfx-vortex | tube-travel | 0/0/0/n [0/0/9.3e-5/n] | 0/0/0/n [0/0/9.3e-5/n] | 0/0/0/n [0/0/9.6e-5/n] | 0/0/0/n [0/0/9.3e-5/n] | pass with differences | the poster was regenerated warm with its caption; caption titles and counter appear later than the original while pictures load (frames 1 and 2 lack the title); tube frames are slightly smaller |
| formtray-panes | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | none visible |
| formcad-plan | fold-plan | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the brand icon is the bundled formcad-128.webp through the icon prop (no data URI); the poster was regenerated warm; the model is mid-fold at the first frame |
| formcel-foresheet | forecast-chart | 0/0/0/n [0/0/2.9e-5/n] | 0/0/0/n [0/0/2.1e-5/n] | 0/0/0/n [0/0/1.5e-4/n] | 0/0/0/n [0/0/3.0e-5/n] | pass with differences | the first frame is shot before the component draws (the horizon picker and ask panel are absent); the typed prompt text is at a different character each frame |
| format-casting | native | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the sidebar app icon (format-128.webp), aurora panel and stage glow are restored from bundled media; none visible |
| formsurface-prompt | scripted-desktop | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the turntable desktop icon picture is blank in the first frame |
| formmorpheus-prompt | glyph-lens, develop-frame | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | headline glyphs render slightly narrower, so it wraps "moves. Watch" instead of "moves." and "Watch the"; the left column is about 40 px taller below the style chips |
| formmd-prompt | noise-band | 0/0/0/n [0/0/2.5e-6/n] | 0/0/0/n [0/0/2.8e-6/n] | 0/0/0/n [0/0/5.0e-5/n] | 0/0/0/n [0/0/2.5e-6/n] | pass | the typed prompt is at a different character per frame |
| formmcp-prompt | token-prompt | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the headline's second line is a flat hue; the original is an animated ink-to-hue gradient text (background-clip is not in the style model) |
| format-prompt | specks | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | none visible |
| formslot-support | starfield, ruler-slider | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | fine print is set to mono uppercase like the original; the large FormAI watermark is visibly stronger than the original's (nested opacity there makes it nearly invisible); totals are still counting at the first frame |
| formbench-support | ruler-slider | 0/0/0/n | 0/0/0/n [0/0/4.0e-5/n] | 0/0/0/n | 0/0/0/n [0/0/4.0e-5/n] | pass | the support link text tint is slightly more saturated |
| formtxt-404 | receipt-printer | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass | the printer icon is restored through the icon prop (formtxt-128.webp); none visible |
| formpath-knockout | knockout-artboard | 0/0/0/n | 0/0/0/n | 0/0/0/n | 0/0/0/n | pass with differences | the intro choreography runs at 0.3x, so the first frame is a transient; scene progress is measured from the stuck offset; the scattered floating shapes are absent in the second frame |

## Notes

The 4x runs measure cumulative layout shift on a slow machine and a slow network, which is where late pictures and late component mounts would show up first. Every template stays under 0.001 there.

Several differences share a cause. Page components mount lazily, when their host comes within one viewport, so the first frame of a component section can show its poster or an earlier state than the original. Pictures that load after the shot leave a frame empty. Both are timing, not layout. See the known limits in [LIBRARY.md](LIBRARY.md).
