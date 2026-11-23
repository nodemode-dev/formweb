# Demo media credits

Every picture inside the eight demo sites that FormWeb ships (`frontend/public/demos/<id>/site.fweb`), one table per site and one row per picture stored in that file, then the eight cover pictures. The single preview file `frontend/public/demos/preview.html` is an export of the same eight sites and carries the same pictures, so these credits cover it as well. The five whole-site starters added in 0.28.0 (Coldmere Plumbing, Northfold Studio, The Slow Allotment, Wenlow Type Day, Fernhollow Pottery) hold no photograph and no outside picture: every picture in them was drawn in code for the starter (SVG written by hand or by a short script with fixed seeds, and PNG made from that SVG in a headless browser), and every name, business, person and place in them is invented. No site contains a video. Nothing is AI generated. Fonts embedded in the sites are not covered by this file.

Each photograph is a byte-for-byte copy of a file in a Form family repository (formdeck `frontend/public/demos/nasa/`, credits in formdeck `demo/CREDITS.md`; form.md `demos/views/assets/media/`, credits in form.md `demos/views/CREDITS.md`), checked by SHA-256 against the name each `.fweb` stores it under. One file is a derived copy: `img_per_tiles.webp` is a 1245 x 1177 crop of `img_per.webp`, re-encoded as WebP for the tile scene. No picture was retouched; the pages crop with `object-fit` and the page components crop by their own settings.

Licence basis for NASA material: NASA content, not subject to copyright in the United States (NASA media guidelines, https://www.nasa.gov/nasa-brand-center/images-and-media/: NASA content "generally are not subject to copyright in the United States", and "NASA should be acknowledged as the source of the material"). The credit lines are the ones on each picture's own NASA page, read again on 15 November 2026; the pages carry no licence text of their own. The NASA Image and Video Library records (images.nasa.gov) have no credit line, only the NASA centre, so those rows say NASA with the centre in brackets. No NASA insignia and no identifiable person is shown.

One picture is not NASA-only: the Hubble Ultra Deep Field (`img_udf.webp`) is published by ESA/Hubble under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/, stated at https://esahubble.org/copyright/), which requires the full credit line to be shown. It was recorded before as public domain on the strength of its Wikimedia Commons page, which is not the original publisher's term. The file is a copy made through Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Hubble_ultra_deep_field.jpg, whose source is the March 2004 NASA/STScI release 2004/07 that ESA/Hubble published as heic0406a), resized to 1400 x 1400; its tone differs slightly from the ESA/Hubble JPEG. NASA publishes the same picture at https://science.nasa.gov/asset/hubble/hubble-ultra-deep-field-image-reveals-galaxies-galore/ (credit there: "NASA, ESA, S. Beckwith (STScI) and the HUDF Team").

"Own work" means the file was made for these demos and is part of FormWeb; its status is "Own work, Apache-2.0" (see `LICENSE`). A capture of a demo site is own work, and the outside pictures visible in it keep the credit and status of their own rows.

## Lowlight (`lowlight/site.fweb`): 24 pictures

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `img_rise.webp` | Earthrise, Apollo 8 (AS08-14-2383) | NASA/William Anders | https://www.nasa.gov/image-detail/moon-landing-l-7-months-10-apollo-8-earthrise-photo-as08-14-2383 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_set.webp` | A Breathtaking Earthset from Orion (art002e021278), 6 April 2026 | NASA | https://images.nasa.gov/details/art002e021278 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_dot.webp` | Solar System Portrait, Earth as Pale Blue Dot (PIA00452), Voyager 1 | NASA/JPL-Caltech | https://science.nasa.gov/photojournal/solar-system-portrait-earth-as-pale-blue-dot/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_smile.webp` | The Day the Earth Smiled (PIA17172) | NASA/JPL-Caltech/SSI | https://science.nasa.gov/photojournal/the-day-the-earth-smiled/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_sat.webp` | The Greatest Saturn Portrait ...Yet (PIA06193) | NASA/JPL/Space Science Institute | https://science.nasa.gov/photojournal/the-greatest-saturn-portrait-yet/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_edge.webp` | The Edge of the Night (PIA17199) | NASA/JPL-Caltech/Space Science Institute | https://science.nasa.gov/photojournal/the-edge-of-the-night/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_jup.webp` | Cassini Jupiter Portrait (PIA04866) | NASA/JPL/Space Science Institute | https://science.nasa.gov/photojournal/cassini-jupiter-portrait/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_cur.webp` | Looking Up at Mars Rover Curiosity in 'Buckskin' Selfie (PIA19808) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/looking-up-at-mars-rover-curiosity-in-buckskin-selfie/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_moj.webp` | Curiosity Self-Portrait at 'Mojave' Site on Mount Sharp (PIA19142) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/curiosity-self-portrait-at-mojave-site-on-mount-sharp/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_per.webp` | Perseverance's Selfie with Ingenuity (PIA24542) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/perseverances-selfie-with-ingenuity/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_per_tiles.webp` | The right-hand part of `img_per.webp`, cropped to 1245 x 1177 for the tile scene | NASA/JPL-Caltech/MSSS; crop made for the demo | https://science.nasa.gov/photojournal/perseverances-selfie-with-ingenuity/ | NASA content, not subject to copyright in the United States (NASA media guidelines); derived copy |
| `img_chey.webp` | Perseverance's Selfie With 'Cheyava Falls' (PIA26344) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/perseverances-selfie-with-cheyava-falls/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_udf.webp` | Hubble Ultra Deep Field (ESA/Hubble heic0406a) | NASA, ESA, and S. Beckwith (STScI) and the HUDF Team | https://esahubble.org/images/heic0406a/ | Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/ (stated at https://esahubble.org/copyright/); the full credit must be shown; NASA's own copy: https://science.nasa.gov/asset/hubble/hubble-ultra-deep-field-image-reveals-galaxies-galore/ |
| `lowlight-starfield-poster.webp` | Still of the site's starfield component, dark theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-starfield-poster-light.webp` | Still of the site's starfield component, light theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-specks-poster.webp` | Still of the site's specks component, dark theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-specks-poster-light.webp` | Still of the site's specks component, light theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-orbit-constellation-poster.webp` | Still of the site's orbit scene, dark theme; shows crops of the pictures above, among them the Hubble Ultra Deep Field | Own work: capture of the demo site running | none | Own work, Apache-2.0 (capture); the pictures in it keep the credit and status of their own rows above, including CC BY 4.0 for the Hubble Ultra Deep Field |
| `lowlight-orbit-constellation-poster-light.webp` | Still of the site's orbit scene, light theme; shows crops of the pictures above, among them the Hubble Ultra Deep Field | Own work: capture of the demo site running | none | Own work, Apache-2.0 (capture); the pictures in it keep the credit and status of their own rows above, including CC BY 4.0 for the Hubble Ultra Deep Field |
| `lowlight-tile-cut-poster.webp` | Still of the site's tile scene, dark theme; shows `img_per_tiles.webp` | Own work: capture of the demo site running | none | Own work, Apache-2.0 (capture); the picture in it is NASA/JPL-Caltech/MSSS, NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `lowlight-tile-cut-poster-light.webp` | Still of the site's tile scene, light theme; shows `img_per_tiles.webp` | Own work: capture of the demo site running | none | Own work, Apache-2.0 (capture); the picture in it is NASA/JPL-Caltech/MSSS, NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `lowlight-receipt-printer-poster.webp` | Still of the site's receipt printer component, dark theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-receipt-printer-poster-light.webp` | Still of the site's receipt printer component, light theme | Own work: capture of the demo site running | none | Own work, Apache-2.0 |
| `lowlight-icon.png` | The site icon, 256 px | Own work: drawn for the demo | none | Own work, Apache-2.0 |

## Looking Back (`looking-back/site.fweb`): 10 pictures

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `ap-17.webp` | View of the Earth seen by the Apollo 17 crew (as17-148-22727), 1972-12-07 | NASA (JSC) | https://images.nasa.gov/details/as17-148-22727 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `ap-10.webp` | Apollo 10 view of the Earth (as10-34-5013), 1969-05-18 | NASA (JSC) | https://images.nasa.gov/details/as10-34-5013 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `gt-11.webp` | Gulf Coast from Atchafalaya Bay to Apalachicola seen from Gemini 11 (s66-54563), 1966-09-14 | NASA (JSC) | https://images.nasa.gov/details/s66-54563 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `gt-9a.webp` | GEMINI-TITAN (GT)-9 - EARTH-SKY - AUGMENTED TARGET DOCKING ADAPTER (ATDA) (s66-37923), 1966-06-06 | NASA (JSC) | https://images.nasa.gov/details/s66-37923 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `gt-10.webp` | GEMINI-TITAN (GT)-10 - EARTH SKY - DOCKING - IN-SPACE (s66-46249), 1966-07-18 | NASA (JSC) | https://images.nasa.gov/details/s66-46249 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_rise.webp` | Earthrise, Apollo 8 (AS08-14-2383) | NASA/William Anders | https://www.nasa.gov/image-detail/moon-landing-l-7-months-10-apollo-8-earthrise-photo-as08-14-2383 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_set.webp` | A Breathtaking Earthset from Orion (art002e021278), 6 April 2026 | NASA | https://images.nasa.gov/details/art002e021278 | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_dot.webp` | Solar System Portrait, Earth as Pale Blue Dot (PIA00452), Voyager 1 | NASA/JPL-Caltech | https://science.nasa.gov/photojournal/solar-system-portrait-earth-as-pale-blue-dot/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `img_smile.webp` | The Day the Earth Smiled (PIA17172) | NASA/JPL-Caltech/SSI | https://science.nasa.gov/photojournal/the-day-the-earth-smiled/ | NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `looking-back-icon.png` | The site icon, 256 px | Own work: drawn for the demo | none | Own work, Apache-2.0 |

## Harbour Ferries (`harbour-ferries/site.fweb`): 1 picture

The site uses no photographs. Its harbour map and logo are inline SVG drawn for the demo, not stored pictures.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `harbour-ferries-icon.png` | The site icon, 256 px | Own work: drawn for the demo | none | Own work, Apache-2.0 |

## Coldmere Plumbing (`coldmere-plumbing/site.fweb`): 4 pictures

No photographs. The logo and the small icons are inline SVG in the page, not stored pictures.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `coldmere-house.svg` | Drawing of a house cut open to show its boiler, radiators, bath and pipes | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `coldmere-plumbing-icon.png` | The site icon, 256 px: a white water drop with an orange flame on teal | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `coldmere-plumbing-share.png` | The share picture (og:image), 1200 x 630: the site name in Inter on teal | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `coldmere-van.svg` | Drawing of the firm's teal van on a road | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |

## Northfold Studio (`northfold-studio/site.fweb`): 15 pictures

No photographs. The logo is inline SVG in the page, not a stored picture.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `northfold-lantern-books-cover.svg` | Generated poster for a project page (Lantern Books, cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-lantern-books-detail-1.svg` | Generated poster for a project page (Lantern Books, detail 1) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-lantern-books-detail-2.svg` | Generated poster for a project page (Lantern Books, detail 2) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-orchard-lane-cover.svg` | Generated poster for a project page (Orchard Lane, cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-orchard-lane-detail-1.svg` | Generated poster for a project page (Orchard Lane, detail 1) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-orchard-lane-detail-2.svg` | Generated poster for a project page (Orchard Lane, detail 2) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-quarry-theatre-cover.svg` | Generated poster for a project page (Quarry Theatre, cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-quarry-theatre-detail-1.svg` | Generated poster for a project page (Quarry Theatre, detail 1) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-quarry-theatre-detail-2.svg` | Generated poster for a project page (Quarry Theatre, detail 2) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-stavemoor-lido-cover.svg` | Generated poster for a project page (Stavemoor Lido, cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-stavemoor-lido-detail-1.svg` | Generated poster for a project page (Stavemoor Lido, detail 1) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-stavemoor-lido-detail-2.svg` | Generated poster for a project page (Stavemoor Lido, detail 2) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-studio-desk.svg` | Abstract grid of squares, circles and quarter-circles | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-studio-icon.png` | The site icon, 256 px: a white N on black with a red square | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `northfold-studio-share.png` | The share picture (og:image), 1200 x 630: the studio name in Space Grotesk and IBM Plex Mono beside red and black rings | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |

## The Slow Allotment (`slow-allotment/site.fweb`): 6 pictures

No photographs. The logo is inline SVG in the page, not a stored picture.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `allotment-frost-and-leeks.svg` | Drawing of a row of leeks in a frosty landscape (post cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `allotment-no-dig-bed.svg` | Drawing of a raised bed of seedlings under low hills (post cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `allotment-plot.svg` | Drawing of an allotment with a shed and a raised bed under low hills | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `allotment-saving-bean-seed.svg` | Drawing of climbing beans on poles (post cover) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `slow-allotment-icon.png` | The site icon, 256 px: a pale green leaf on dark green | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `slow-allotment-share.png` | The share picture (og:image), 1200 x 630: the blog name in Playfair Display and Source Serif 4 over green hills | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |

## Wenlow Type Day (`wenlow-type-day/site.fweb`): 10 pictures

No photographs. The logo and the small icons are inline SVG in the page, not stored pictures. The speakers have no portraits: each has an abstract pattern instead.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `typeday-letters.svg` | Drawn letters W and H over ruled lines | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-map.svg` | Drawn street map of the invented town of Wenlow | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-ada-morrow.svg` | Abstract pattern standing in for a speaker portrait (Ada Morrow) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-hana-sato.svg` | Abstract pattern standing in for a speaker portrait (Hana Sato) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-kofi-asante.svg` | Abstract pattern standing in for a speaker portrait (Kofi Asante) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-lena-vik.svg` | Abstract pattern standing in for a speaker portrait (Lena Vik) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-ruth-calder.svg` | Abstract pattern standing in for a speaker portrait (Ruth Calder) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `typeday-speaker-tom-reyes.svg` | Abstract pattern standing in for a speaker portrait (Tom Reyes) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `wenlow-type-day-icon.png` | The site icon, 256 px: a yellow W and a red dot on navy | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `wenlow-type-day-share.png` | The share picture (og:image), 1200 x 630: the event name and date in Oswald and IBM Plex Mono on navy | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |

## Fernhollow Pottery (`fernhollow-pottery/site.fweb`): 10 pictures

No photographs. The logo and the small icons are inline SVG in the page, not stored pictures.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `fernhollow-breakfast-bowl.svg` | Drawing of the breakfast bowl on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-bud-vase.svg` | Drawing of the bud vase on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-dinner-plate.svg` | Drawing of the dinner plate on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-everyday-mug.svg` | Drawing of the everyday mug on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-herb-planter.svg` | Drawing of the herb planter on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-kiln.svg` | Drawing of a brick kiln beside shelves of pots | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-pottery-icon.png` | The site icon, 256 px: a white pot on brown | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-pottery-share.png` | The share picture (og:image), 1200 x 630: the pottery name in Playfair Display and Work Sans beside a drawn jug | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-shelf.svg` | Drawing of four pots on a shelf | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |
| `fernhollow-tall-jug.svg` | Drawing of the tall jug on a plain ground (product picture) | Own work: drawn in code for the starter | none | Own work, Apache-2.0 |

## Covers

The picture each demo's card shows on Home, 640 x 360.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `lowlight/cover.webp` | The top of the Lowlight home page | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `looking-back/cover.webp` | The top of the Looking Back home page, with the Earth of `ap-17.webp` | Own work: capture of the demo site | none | Own work, Apache-2.0 (capture); the picture in it is NASA (JSC), NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `harbour-ferries/cover.webp` | The top of the Harbour Ferries home page with its drawn harbour map | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `coldmere-plumbing/cover.webp` | The top of the Coldmere Plumbing home page with its drawn house | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `northfold-studio/cover.webp` | The top of the Northfold Studio home page | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `slow-allotment/cover.webp` | The top of The Slow Allotment home page | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `wenlow-type-day/cover.webp` | The top of the Wenlow Type Day home page with its drawn letters | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `fernhollow-pottery/cover.webp` | The top of the Fernhollow Pottery home page with its drawn shelf of pots | Own work: capture of the demo site | none | Own work, Apache-2.0 |

## Pictures linked by code, not stored

The Lowlight orbit component's source (inside `lowlight/site.fweb` and `preview.html`) names twelve default picture addresses under `https://media.formai.studio/media/formvfx/` as a fallback. The demo does not use them: the page sets its own pictures (the stored NASA and ESA/Hubble files above), so nothing from those addresses loads or is stored. They are the owner's own captures (`LICENSES.md`, "Bundled content: section library").

## Fonts

Stored inside each `.fweb` and again inside `preview.html`. All SIL Open Font License 1.1; each family's licence text is in `licenses/` beside this file (Inter's is `library/presets/fonts/LICENSE-Inter.txt` in the repo).

| Family | Used by | Copyright line of its licence | Licence text |
| --- | --- | --- | --- |
| Space Grotesk (400, 700) | Lowlight, Northfold Studio | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) | `licenses/OFL-SpaceGrotesk.txt` |
| IBM Plex Mono (400) | Lowlight, Looking Back, Harbour Ferries, Northfold Studio, The Slow Allotment, Wenlow Type Day | Copyright (c) 2017 IBM Corp. with Reserved Font Name "Plex" | `licenses/OFL-IBMPlexMono.txt` |
| Inter (variable, latin) | Lowlight, through the formai.studio preset; Coldmere Plumbing | Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter) | `library/presets/fonts/LICENSE-Inter.txt` |
| Playfair Display (400) | Looking Back, The Slow Allotment, Fernhollow Pottery | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display" | `licenses/OFL-PlayfairDisplay.txt` |
| Source Serif 4 (400, 400 italic, 700) | Looking Back, The Slow Allotment | Copyright 2014 The Source Serif 4 Project Authors (https://github.com/adobe-fonts/source-serif) | `licenses/OFL-SourceSerif4.txt` |
| Oswald (400, 700) | Harbour Ferries, Wenlow Type Day | Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont) | `licenses/OFL-Oswald.txt` |
| Work Sans (400, 700) | Harbour Ferries, Wenlow Type Day, Fernhollow Pottery | Copyright 2019 The Work Sans Project Authors (https://github.com/weiweihuanghuang/Work-Sans) | `licenses/OFL-WorkSans.txt` |

The new starters use the same font files, byte for byte, as the three older demos. The share pictures (`<id>-share.png`) show text set in these fonts; a picture of text set in an OFL font is not the font and carries no licence condition of its own.
