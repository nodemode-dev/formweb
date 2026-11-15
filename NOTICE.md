# Notices

FormWeb · Copyright 2026 NodeAgentc, Inc. Licensed under Apache-2.0, see LICENSE.

FormDesign v0.19.0 and FormPath v0.23.0, supplied by the owner, were studied as read-only family architecture references. Their documents, source trees and git histories are not included in this new repository. The Apache license text is preserved from the supplied family repository. New identity SVG and starter website content are original to this build.

The section library in `library/` (page components, section templates, the formai.studio preset and the product-site starter) is ported from formai-xmental-webspun v3.1.0, NodeAgentc, Inc.'s own section pack, and is distributed here under Apache-2.0 with the owner's clearance of 2026-11-09. It bundles the Inter typeface (SIL Open Font License 1.1, Copyright (c) 2016 The Inter Project Authors), whose licence text sits beside the font in `library/presets/fonts/`.

Direct dependencies are registered in LICENSES.md. Build outputs and installed dependencies are omitted from source archives; installers use locked Rust/frontend versions and pinned direct Python requirements. Python transitive versions may change. Dependency notices must accompany any later compiled distribution.

## Demo media

The app ships three demo sites in `frontend/public/demos/` (Lowlight, Looking Back, Harbour Ferries), a preview file made from the same three sites (`preview.html`) and a cover picture for each. The tables list every picture stored in each site's `.fweb`, with its real status; the same rows, with the method and the licence basis, are in `frontend/public/demos/CREDITS.md`. No site contains a video and nothing is AI generated. NASA's media guidelines (https://www.nasa.gov/nasa-brand-center/images-and-media/) say NASA content "generally are not subject to copyright in the United States" and that "NASA should be acknowledged as the source of the material"; the credit lines below are the ones on each picture's own NASA page, read again on 15 November 2026, and the NASA Image and Video Library records (images.nasa.gov), which have no credit line, are credited NASA with the centre in brackets. No NASA insignia and no identifiable person is shown. One picture is not NASA-only: the Hubble Ultra Deep Field (`img_udf.webp`) is published by ESA/Hubble under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/, stated at https://esahubble.org/copyright/), which requires the full credit line to be shown; it was recorded before as public domain on the strength of its Wikimedia Commons page, which is not the original publisher's term. The file is a copy made through Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Hubble_ultra_deep_field.jpg, whose source is the March 2004 NASA/STScI release 2004/07 that ESA/Hubble published as heic0406a), resized to 1400 x 1400; its tone differs slightly from the ESA/Hubble JPEG. NASA publishes the same picture at https://science.nasa.gov/asset/hubble/hubble-ultra-deep-field-image-reveals-galaxies-galore/ (credit there: "NASA, ESA, S. Beckwith (STScI) and the HUDF Team"). "Own work" means the file was made for these demos and is part of FormWeb; its status is "Own work, Apache-2.0". A capture of a demo site is own work, and the outside pictures visible in it keep the credit and status of their own rows.

### Lowlight (`lowlight/site.fweb`): 24 pictures

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

### Looking Back (`looking-back/site.fweb`): 10 pictures

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

### Harbour Ferries (`harbour-ferries/site.fweb`): 1 picture

The site uses no photographs. Its harbour map and logo are inline SVG drawn for the demo, not stored pictures.

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `harbour-ferries-icon.png` | The site icon, 256 px | Own work: drawn for the demo | none | Own work, Apache-2.0 |

### Covers

| Stored name | What it shows | Author or source | Source URL | Licence or status |
| --- | --- | --- | --- | --- |
| `lowlight/cover.webp` | The top of the Lowlight home page | Own work: capture of the demo site | none | Own work, Apache-2.0 |
| `looking-back/cover.webp` | The top of the Looking Back home page, with the Earth of `ap-17.webp` | Own work: capture of the demo site | none | Own work, Apache-2.0 (capture); the picture in it is NASA (JSC), NASA content, not subject to copyright in the United States (NASA media guidelines) |
| `harbour-ferries/cover.webp` | The top of the Harbour Ferries home page with its drawn harbour map | Own work: capture of the demo site | none | Own work, Apache-2.0 |

### Pictures linked by code, not stored

The Lowlight orbit component's source (inside `lowlight/site.fweb` and `preview.html`) names twelve default picture addresses under `https://media.formai.studio/media/formvfx/` as a fallback. The demo does not use them: the page sets its own pictures (the stored NASA and ESA/Hubble files above), so nothing from those addresses loads or is stored. They are the owner's own captures (`LICENSES.md`, "Bundled content: section library").

### Demo fonts

Each demo site stores its fonts inside its `.fweb`, and `preview.html` carries the same files. All are under the SIL Open Font License 1.1; the licence text of each family ships beside the demos in `frontend/public/demos/licenses/`, taken unchanged from the family's `OFL.txt` in github.com/google/fonts. The font files are latin subsets copied from formvis (`frontend/public/fonts/`) and formtxt (`demo/assets/`, the @fontsource packages).

| Family | Used by | Copyright line of its licence | Licence text |
| --- | --- | --- | --- |
| Space Grotesk (400, 700) | Lowlight | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) | `licenses/OFL-SpaceGrotesk.txt` |
| IBM Plex Mono (400) | Lowlight, Looking Back, Harbour Ferries | Copyright (c) 2017 IBM Corp. with Reserved Font Name "Plex" | `licenses/OFL-IBMPlexMono.txt` |
| Inter (variable, latin) | Lowlight, through the formai.studio preset | Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter) | `library/presets/fonts/LICENSE-Inter.txt` |
| Playfair Display (400) | Looking Back | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display" | `licenses/OFL-PlayfairDisplay.txt` |
| Source Serif 4 (400, 400 italic, 700) | Looking Back | Copyright 2014 The Source Serif 4 Project Authors (https://github.com/adobe-fonts/source-serif) | `licenses/OFL-SourceSerif4.txt` |
| Oswald (400, 700) | Harbour Ferries | Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont) | `licenses/OFL-Oswald.txt` |
| Work Sans (400, 700) | Harbour Ferries | Copyright 2019 The Work Sans Project Authors (https://github.com/weiweihuanghuang/Work-Sans) | `licenses/OFL-WorkSans.txt` |

## Trademarks

Framer is a trademark of Framer B.V. Webflow is a trademark of Webflow, Inc. Adobe and Illustrator are either registered trademarks or trademarks of Adobe in the United States and/or other countries. Other names are the property of their owners. They are used only to describe research, compatibility and file formats; FormWeb is not affiliated with or endorsed by them. FormWeb's tools carry its own names (Shape Crafter, Fill Regions, Trace Image, Pin Warp) and no other product's sample files, presets or icons are bundled.

## Development-only tools

| Package | License | Notes |
| --- | --- | --- |
| pytest 9.1.1 (with iniconfig, packaging, pluggy, pygments) | MIT (pytest, iniconfig, pluggy), Apache-2.0 OR BSD-2-Clause (packaging), BSD-2-Clause (pygments) | runs `backend/tests` in CI (`backend/requirements-test.txt`); never installed in the app |
| Playwright for Python 1.63.0 | Apache-2.0 | runs `frontend/tests/window` (the window smoke) in CI; never installed in the app |
