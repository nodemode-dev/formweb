# Page background and theme colors

## Follow along

The examples use **Coldmere Plumbing** (**Help > Demos > Coldmere Plumbing**) and **Harbour Ferries** (**Help > Demos > Harbour Ferries**), on their Home pages.

## Why a new page is white

A page's background is the background of its top layer, the page itself (the first row in the Layers list). A new page has no background of its own, so it shows what a browser shows for a page with no colors: a white background and black text. That is true on the canvas and in the exported site alike.

So when you add a page to a site with a colored design, the new page starts white. Give it a background, or use **Apply to all pages** from a page that already has the one you want.

## Where the setting is

Choose **Page > Page background...**, or right-click an empty part of the page and choose **Page background**. The right panel opens the **Page** tab at its **Page background** section.

![The Page background section of Coldmere's Home page: Background reads var(--paper), with a Clear link; the note says this page uses var(--paper), which is #f6f4ef, and Clear returns it to the site background, white, the browser default; under it the Apply to all pages button and the Edit site theme colors link](images/background-page-field.webp)

- **Background** takes a color such as `#f3efe6`, a color name, a gradient, or one of the site's colors such as `var(--paper)`. Press Enter to keep it. The field does not check what you type, so type a single value.
- The note under the field says what the page uses now, and which other pages use the same value (for example "Home +7 uses var(--bg)").
- **Clear** (also **Page > Clear page background**) removes this page's own background. The page is white again.
- **Apply to all pages** (also **Page > Use this page background on all pages**) gives every page this page's background, in one undo step. The status line confirms it, for example "Background #f3efe6 applied to all 8 pages."
- The field always sets the page's base (Desktop) style, whatever breakpoint the canvas shows.

## Theme colors: change a color everywhere at once

Well-built sites do not repeat the same color code on every element. They name their colors once, as tokens, and use the name everywhere: `var(--paper)` means "the paper color", whatever it is set to. Change the token, and every element and page that uses it changes with it.

Coldmere's pages use `var(--paper)` as their background, which is `#f6f4ef`.

1. In the Page background section, click **Edit site theme colors**. The Design system tokens dialog opens. (It is also **Window > Design system...**.)
2. The list shows every token of the site with its value: `--accent`, `--btn-bg`, `--deep`, `--paper` and so on, and also fonts and sizes.

![The Design system tokens dialog of Coldmere Plumbing: the note Site tokens are exported as CSS custom properties. Use var(--token-name) in element style fields., then rows such as --accent #e0892b, --accent-ink #a1520c, --accent-soft #f2c48a, --btn-bg #0d5c63, --btn-bg-hover #0a474d, --btn-ink #ffffff and --deep #0f3b40](images/background-theme-colors.webp)

3. Find the token, type a new value in its field, and press Enter.

In Harbour Ferries the pages use `var(--bg)`, which is `#f3f6f7`. Setting `--bg` to `#efe8da` turns every page that uses it warm beige at once, on the canvas and in the export. Undo puts it back.

### Light and dark themes

Below the token list, the **Themes** block lets a site have a second set of values for the other theme (light or dark): fill a token there to give it another value in that theme, and leave it empty to keep the default. The moon and sun buttons above the canvas show the page in each theme. Visitors can switch themes, and their choice is remembered on their device.

## Next

[Preview](06-preview.md).
