# Page background and theme colors

## Follow along

The examples use **Coldmere Plumbing** (**Help > Demos > Coldmere Plumbing**) and **Harbour Ferries** (**Help > Demos > Harbour Ferries**), on their Home pages.

## Why a new page is white

A page's background is the background of its top layer, the page itself (the first row in the Layers list). A new page has no background of its own, so it shows what a browser shows for a page with no colors: a white background and black text. That is true on the canvas and in the exported site alike.

So when you add a page to a site with a colored design, the new page starts white unless you choose otherwise. You decide where a page's background comes from:

- for the whole site, with a **site background**: one color that every page on it shows and that new pages start with (see [The site background](#the-site-background));
- when you add the page, with **Background** in the Add page dialog;
- afterwards, with **Same as another page...** in the Page background section;
- for every page at once, with **Apply to all pages**, or by changing a theme color the pages share (see below).

## Choose the background of a new page

The Add page dialog (the **+** next to PAGES, or **Add page...** in a page's right-click menu) has a **Background** list:

- **Site background**, chosen at first. When the site has a site background, this item shows its color, for example "Site background (#f3f6f7)", and the new page uses it. When it has none, it reads **Site background (white)**: the page has no background of its own, so it is white with black text.
- **Same as Home (home page)**: the new page starts with the home page's background and text color.
- **Same as** the page open now: the page you were on when you clicked **+**, for example "Same as Contact, the page open now". This item is there when the open page is not the home page.

Worked example in Harbour Ferries: open **Timetable and fares**, click the **+** next to PAGES, type `Winter timetable`, choose **Same as Home (home page)** and click **Add page**. The new page opens with Home's light grey-blue background, `var(--bg)`. Undo takes the new page away in one step.

![The Add page dialog in Harbour Ferries: Page name Winter timetable, URL slug /winter-timetable, and Background set to Same as Home (home page)](images/background-new-page.webp)

The new page gets a copy of the values, not a link: if you later type a new background on Home, the other page keeps its own. To change several pages together, give them a theme color, as described below.

## Where the setting is

Choose **Page > Page background...**, right-click an empty part of the page and choose **Page background**, or right-click the page in the PAGES list and choose **Page background...**. The right panel opens the **Page** tab at its **Page background** section.

The section starts with three choices. The one the page uses now is chosen:

- **Site background**: the page shows the site background, the one color for the whole site. See [The site background](#the-site-background).
- **Same as another page...**: shows the **Match another page** list, to copy another page's background.
- **This page only**: the page has a background of its own, typed in the **Background** field.

![The Page background section of Coldmere's Home page: This page only is chosen, Background reads var(--paper), with a Clear link; the note says this page uses var(--paper), which is #f6f4ef, and Clear returns it to the site background, white, the browser default; under it the Apply to all pages button and the Edit site theme colors link](images/background-page-field.webp)

With **This page only** chosen:

- **Background** takes a color such as `#f3efe6`, a color name, a gradient, or one of the site's colors such as `var(--paper)`. Press Enter to keep it. If the browser cannot read what you typed as a background (for example two values run together, like `var(--bg)#f3efe6`), the field goes back to what it was and the status line says why.
- This field takes typed values only. To pick the color or build a gradient with the mouse instead, click the page itself (the first row in the Layers list, **Page**) and use the swatch before **Background** in the Appearance section of the Design tab. With **Desktop** picked it sets the same background as this field. See [The color picker](04-right-panel.md#the-color-picker) and [Gradients](04-right-panel.md#gradients).
- The note under the field says what the page uses now, and which other pages use the same value (for example "Home +7 uses var(--bg)").
- **Clear** (also **Page > Clear page background**) removes this page's own background. The page is white again.
- If the color is so dark that black text cannot be read on it, and the page has no text color of its own, the page's text turns white in the same step. A notice at the bottom right says so, with **Undo** to put the text back as it was while keeping the new background. A light color, or **Clear**, later turns it back. Any other text color you chose yourself is never changed. On a site with light and dark themes the text is left alone, because one fixed color cannot suit both themes, and so are gradients, pictures and see-through colors. The same goes for the site background: pages on it, and new pages that start on it, get white text when it is dark.
- **Match another page** (under **Same as another page...**) gives this page the background and text color of the page you pick in the list. The home page comes first, marked "(home page)". The list goes back to "Choose a page..." and the status line confirms it, for example "The background and text color of "Home" are now used on "Hello"." It is one undo step. **Page > Use the home page background** does the same with the home page in one click.
- **Apply to all pages** (also **Page > Use this page background on all pages**) gives every page this page's background, in one undo step. The status line confirms it, for example "Background #f3efe6 applied to all 8 pages."
- The field always sets the page's base (Desktop) style, whatever breakpoint the canvas shows.

## The site background

The site background is one color for the whole site. Every page that uses it shows it, every page you add starts with it, and when you change it, all those pages change at once. It is saved with the site's theme colors as `--page-background`, so the exported site has it too.

A site does not have one until you set it. Until then, **Site background** means white, the browser default, as before, and opening an older site changes nothing. If the site already has a token called `--page-background` that holds something else, such as a size, FormWeb leaves it alone: the section says so, and you rename that token (in **Window > Design system**) before setting a site background.

1. Choose **Site background**. The section shows **Site background color**.
2. Type a color and press Enter. The site background is created, this page uses it, and the status line says, for example, "Site background #f3efe6 created. "Hello" uses it, and new pages start with it." It is one undo step.

If the site's design already has a page color, the section offers it as a link, such as **Use --bg (#f3f6f7), the theme page color**. Click it to make that color the site background instead of typing a second one: the site background then follows the theme color, and the field edits that color.

![The Page background section of Harbour Ferries' Timetable and fares page with Site background chosen: an empty Site background color field, the link Use --bg (#f3f6f7), the theme page color, the note that the page uses white, the browser default, and that a color gives the site a background that new pages start with](images/background-site-offer.webp)

Once the site has one:

- **Site background color** changes it. On a site with light and dark themes there are two fields, one per theme.
- The note says how many pages use it, for example "8 of 8 pages use the site background."
- **Use the site background on all pages** (also **Page > Use the site background on all pages**) puts every page on it, in one undo step. **Apply to all pages**, under **This page only**, still copies one page's own color to every page.
- Choosing **Site background** on another page puts that page on it at once.

Worked example in Harbour Ferries: open **Timetable and fares**, choose **Page > Page background...**, choose **Site background** and click **Use --bg (#f3f6f7), the theme page color**. Then click **Use the site background on all pages**: the status line says "All 8 pages use the site background, #f3f6f7." Add a page with the **+** next to PAGES: its Background list starts with **Site background (#f3f6f7)**, and the new page opens in that color.

![The same section after the worked example: Site background chosen, Site background color, Light reads #f3f6f7 and Site background color, Dark reads #061722; the note says 8 of 8 pages use the site background and that it follows --bg, so changing it changes that theme color everywhere it is used](images/background-site.webp)

## Theme colors: change a color everywhere at once

Well-built sites do not repeat the same color code on every element. They name their colors once, as tokens, and use the name everywhere: `var(--paper)` means "the paper color", whatever it is set to. Change the token, and every element and page that uses it changes with it.

Coldmere's pages use `var(--paper)` as their background, which is `#f6f4ef`.

1. In the Page background section, click **Edit site theme colors**. The Design system tokens dialog opens. (It is also **Window > Design system...**.)
2. The list shows every token of the site with its value: `--accent`, `--btn-bg`, `--deep`, `--paper` and so on, and also fonts and sizes.

![The Design system tokens dialog of Coldmere Plumbing: the note Site tokens are exported as CSS custom properties. Use var(--token-name) in element style fields., then rows such as --accent #e0892b, --accent-ink #a1520c, --accent-soft #f2c48a, --btn-bg #0d5c63, --btn-bg-hover #0a474d, --btn-ink #ffffff and --deep #0f3b40](images/background-theme-colors.webp)

3. Find the token, type a new value in its field, and press Enter.

The site's color tokens are also the **SITE COLORS** of the color picker beside the Color and Background fields of the Design tab. Click one there, and the element gets the token, such as `var(--paper)`, not a copy of its color code (see [The color picker](04-right-panel.md#the-color-picker)).

In Harbour Ferries the pages use `var(--bg)`, which is `#f3f6f7`. Setting `--bg` to `#efe8da` turns every page that uses it warm beige at once, on the canvas and in the export. Undo puts it back.

### Light and dark themes

Below the token list, the **Themes** block lets a site have a second set of values for the other theme (light or dark): fill a token there to give it another value in that theme, and leave it empty to keep the default. The moon and sun buttons above the canvas show the page in each theme. A site with no themes says so in the block: Default theme reads None, every visitor sees the one set of colors, and the moon and sun buttons are greyed out, because the published page has no other theme to show. Pick Dark or Light as the default theme to start a second set of values; picking None again removes the themes. Visitors can switch themes, and their choice is remembered on their device.

## Next

[Preview](06-preview.md).
