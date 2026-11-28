# Audit

The audit reads your whole site and lists what could stop people or search engines from using it well. It is a helper, not a certificate: read your pages yourself too.

## Follow along

The example uses **Harbour Ferries** (**Help > Demos > Harbour Ferries**). Out of the box the demo passes the audit, so first make a small mistake on purpose:

1. Click **Routes** in the PAGES list.
2. Open the **Page** tab of the right panel and find the **Description** field in its **Search & metadata** section. (Typing `description` in Search properties lists it as **Description · Page > Search & metadata**.)
3. Click in the field, select its text, delete it, and press Tab.
4. Click **Home** in the PAGES list to go back to the home page.

## Run the audit

1. Click **Audit** at the right end of the second row of the top bar (or choose **Page > Run SEO and accessibility audit**).
2. The SEO & accessibility audit dialog lists each issue with its kind (WARNING), a sentence, a short code and the page or element it is about.

![The SEO & accessibility audit dialog of Harbour Ferries: 1 issue found. Select an element to resolve it in the inspector. One warning: Routes needs a meta description, seo.description, p-routes, with a Select button](images/audit-results.webp)

## Go straight to the problem with Select

1. Click **Select** next to the issue.
2. The dialog closes and FormWeb takes you there: it opens the Routes page, opens the **Page** tab, scrolls the empty **Description** field to the middle of the panel, puts the cursor in it and outlines it. The status line says "Selected Routes: Routes needs a meta description", and a notice at the bottom right says the same, so you do not have to remember it.

![After Select: the Routes page of Harbour Ferries is open on the canvas, the Routes page is highlighted in the PAGES list, the Description field in the right panel is outlined in orange, and the notice at the bottom right reads Selected Routes: Routes needs a meta description, with a Show again button](images/audit-select.webp)

The notice stays for about 30 seconds, and as long as your pointer is on it. **Show again** takes you back to the same place (the page, the element or the field) if you have clicked elsewhere meanwhile; you do not need to open the audit again. The cross closes the notice.

3. Type a description and press Tab. Run the audit again: the issue is gone.

For an issue about an element, Select opens its page, selects the element, scrolls the canvas to it and makes its outline pulse for about two seconds.

## See the issues on the page: audit markers

Audit markers put a small marker on every element of the open page that has an issue, so you can see where the problems are without opening the list. They are off at first.

1. On the Home page of Harbour Ferries, click the **See the routes** button on the canvas, open the **Content** tab, type `#` in **Link URL** and press Tab. The button now links nowhere, which the audit reports.
2. Click **Audit**. Above the list, tick **Show audit markers on the page**. The sentence under it reads "Puts a small marker on each element of this page that has an issue. Markers show on the page when this dialog is closed. Click a marker to select the element."; when some issues are about the whole page or site, such as a missing description, it also says how many have no marker.
3. Close the dialog. A marker with the number 1 sits on the top right corner of the **See the routes** button, centred on the corner, so half of it lies outside the button and the button's text stays readable. **View > Show audit markers** turns the markers on and off from the menu too.

![The Harbour Ferries home page on the canvas with audit markers on: a yellow diamond with 1 centred on the top right corner of the See the routes button, and a yellow diamond with 2 centred on the top right corner of a small picture beside it](images/audit-markers.webp)

Each marker shows how many issues its element has. A yellow diamond is a warning and a blue circle a note. Point at a marker to read its issues in a tooltip; pointing changes nothing. Click it (or press Enter or Space on it) to select its element: the status line and the notice at the bottom right name the issue, as Select in the dialog does, and when the element has several issues a small list under the marker shows each one. In the picture above, the marker with 2 belongs to a picture from another website that has no alt text; its list names both issues. Escape or a click elsewhere closes the list.

4. With the button selected, type `/routes` back into **Link URL** and press Tab. Within a moment the marker goes; you do not need to run the audit again. Make a new mistake and a marker appears the same way.

Markers follow the page as you scroll, zoom, resize the window, change breakpoint or open another page. A marker whose corner is out of view is hidden; it is never moved to the edge of the canvas. They are hidden while you preview the page, drag on the canvas, try a choice, edit text or have a dialog open, and come back afterwards. At most 200 markers are drawn on a page; the dialog says so when there are more. Your choice is remembered in this browser only; it is never saved with the site or exported, and Reset All Preferences turns it off. With the markers off, the audit runs only when you ask for it.

## What it checks

These are the checks the audit runs in this version, with the sentence you will see:

**Search engines**

- A page without a title, or without a description ("... needs a meta description").
- A site whose base URL is not set yet ("Set the real public base URL before deployment"). Set it in the Page tab, **Whole site** section, once you know your site's address. A site with a 404 page also gets a note about its links.
- Two pages whose addresses differ only in capital letters, such as `/two` and `/TWO`, which a site saved by an older FormWeb can have. On a Mac or a Windows computer they would be one folder. Select opens the second page's settings at its URL slug: give it another address.

**People using a keyboard, a screen reader or a small screen**

- Pages with no h1 heading, or more than one ("... has 0 h1 headings; prefer one"), and headings that skip a level.
- Text whose color is too close to its background ("Text contrast 4.47:1 is below the 4.5:1 minimum").
- Pictures with no alt text at all ("Image needs alt text (empty alt is valid for decoration)").
- Buttons and links with no text or name, and links that go nowhere ("Link needs a destination").
- Form fields without a label, repeated HTML ids, tables without header cells or a caption, and drawings (SVG) without a label.
- Hover effects, as a reminder to make them work with a keyboard and touch too.

**Export**

- Pictures loaded from another website, which are not copied into your zip.
- A form that sends its answers to this computer, which will not work once the site is on another host (see [Export and publishing](08-export-and-publish.md)).

A picture you insert from a file starts with no alt text, so the audit lists it until you describe it in the Content tab, **Alternative text** (search `alt`). Clearing that field takes the description away again. A picture that is only decoration, such as a pattern or a divider, needs no description: tick **Decorative image (no description)** under the field. That writes an empty alt text on purpose, screen readers skip the picture, and the audit no longer flags it.

## Next

[Export and publishing](08-export-and-publish.md).
