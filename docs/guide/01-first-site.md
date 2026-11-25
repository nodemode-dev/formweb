# Your first site

In this walkthrough you build one page for a made-up pottery studio, Mill Lane Pottery: a section with a heading, a line of text, a picture and a button. You color it, give it some space, check it on a phone, fix what the audit finds, and export it as a zip file.

It takes about fifteen minutes. You need FormWeb open in its window or in your browser, and one picture file (PNG, JPEG, WebP or GIF, up to 8 MiB).

## 1. Start a new site

1. Open Home. It shows when FormWeb starts; otherwise choose **File > Home**.
2. Click **New site...** in the Start a website box.
3. In **Site name** type `Mill Lane Pottery`.
4. Leave **Start from** on **Blank**. The other choices (Business site, Product launch, Portfolio) add finished pages that you would then change.
5. Click **Create site**. The status line says "New site created."

![The New website dialog with Mill Lane Pottery typed in Site name, Start from set to Blank, and the Close and Create site buttons](images/first-site-new-site.webp)

The site opens with one empty page, Home: its only layer is the page itself. In this walkthrough you leave it for later and build on a new page.

![The editor after Create site: the Home page is empty on the canvas, and the Layers list on the left holds only Page](images/first-site-sample-home.webp)

## 2. Add a page

1. In the left panel, click the **+** to the right of **PAGES**. The Add page dialog opens.
2. In **Page name** type `Classes`.
3. In **URL slug** type `/classes`. This is the page's address on your site. If you leave it empty the page gets `/new-page`.
4. Click **Add page**.

![The Add page dialog with Classes as the page name and /classes as the URL slug](images/first-site-add-page.webp)

The new page opens on the canvas. It is completely white: a new page has no background of its own, so it shows the browser's default white. You give it a color in step 8.

## 3. Add a section and its content

You add everything from the **+** in the **LAYERS** heading. It opens Quick insert, a short list of elements, sections and components.

1. Click the **+** to the right of **LAYERS**.
2. Click **Section**. A dark grey section appears on the page and is selected.

![The Quick insert list open under the plus button of the Layers heading, with a filter field and the elements Section, Heading, Paragraph, Button, Image, Grid, Form, Link, Embed and Video, then the sections Navigation bar, Hero, Feature grid and more](images/first-site-quick-insert.webp)

3. Click the **+** again and choose **Heading**. With the section selected, the heading goes inside it.
4. Click **+** again and choose **Paragraph**.
5. Click **+** again and choose **Image**. Your computer's file picker opens. Pick your picture. It is added under the paragraph, and its layer is named after the file.
6. Click **+** again and choose **Button**.

Each new element goes at the end of the section, after the element that was added last, so add them in the order you want them. You can always move them later (see [Pages and layers](02-pages-and-layers.md)).

![The Classes page with a dark section holding the heading "A new perspective", the text "Write something worth reading.", the pottery picture and a yellow Get started button; the Layers list shows Classes, Section, Heading, Paragraph, pottery-shelf.png and Button](images/first-site-inserted.webp)

The heading is hard to read: dark text on a dark section. You fix that in step 5.

Typing a few letters in the filter field at the top of Quick insert narrows the list. Up and Down move through it, and Enter inserts.

## 4. Write your own text

1. Click the heading on the canvas to select it.
2. Double-click it. The text becomes editable and is all selected.
3. Type `Pottery classes for beginners`.
4. Click an empty part of the canvas to keep the text. The status line says "Text updated."

![The heading being edited on the canvas: it reads Pottery classes for beginners inside a dashed frame](images/first-site-edit-text.webp)

Do the same for the paragraph (`Six Tuesday evenings at the wheel. Clay, glazes and two firings are included.`) and for the button (`Book a class`).

## 5. Set colors with Search properties

The right panel has hundreds of settings. You do not need to know where each one lives: type its name in **Search properties**, the field under the tabs.

1. In the Layers list, click **Section**.
2. Click **Search properties** and type `background`. The list shows the matching settings, grouped by tab and section.
3. Press Enter, or click **Background**. The panel jumps to the Background field and puts the cursor in it.
4. Select what is in the field, type `#f4ece1` and press Enter. The section turns light.

![The right panel with background typed in Search properties; the results list Design > Appearance with Background and Color, then Page > Page background](images/first-site-search-background.webp)

Now the paragraph text is too pale. Give it a darker color:

1. In the Layers list, click **Paragraph**.
2. In Search properties type `colour` (either spelling works).
3. Click **Color** in the results (Background is listed first, so do not just press Enter).
4. Type `#5b4636` and press Enter.

You can type a color as `#5b4636`, as a name such as `white`, or as one of the site's own colors such as `var(--paper)` (see [Page background and theme colors](05-background-and-theme-colors.md)).

## 6. Add space inside the section

1. Click **Section** in the Layers list.
2. In Search properties type `padding` and press Enter.
3. Type `64px` and press Enter.

![The Layout fields of the right panel: Gap reads 24px and Padding reads 64px, both with a Reset link](images/first-site-padding.webp)

The **Reset** link next to a field removes your value, so the field goes back to what it inherits.

## 7. Check the result on the canvas

![The Classes page on the canvas: a light section with the heading Pottery classes for beginners, the paragraph, the pottery picture and the Book a class button, on a beige page; the Section layer is selected](images/first-site-result.webp)

## 8. Set the page background

1. Choose **Page > Page background...**. The right panel opens the **Page** tab at its Page background field.
2. Type `#e9dccb` and press Enter.

![The Page background part of the Page tab: Background reads #e9dccb with a Clear link, a note saying this page uses #e9dccb and Clear returns it to the site background, white, the browser default, then the Apply to all pages button and the Edit site theme colors link](images/first-site-page-background.webp)

This colors this page only. **Apply to all pages** gives every page the same background. [Page background and theme colors](05-background-and-theme-colors.md) explains the rest.

## 9. See it as a visitor would

1. Click **Preview** (the eye, in the top bar), or press Ctrl+Shift+P (Cmd+Shift+P on a Mac). The site opens over the whole window as it will be published.
2. The bar along the top has a page list, then **Full width**, **Desktop 1280**, **Tablet 820** and **Mobile 390**. Click **Mobile 390** to see the page at a phone's width, in a device frame.

![Preview as published at Full width: the Classes page with its section, picture and Book a class button, and the preview bar on top with the page list, the width buttons, Revision 13, Open in browser and Close](images/first-site-preview-desktop.webp)

![Preview as published at Mobile 390, in a phone frame: the heading wraps onto four lines and the text is squeezed into a narrow column by the 64 px padding](images/first-site-preview-mobile.webp)

On the phone the 64 px padding leaves little room for the text. [The right panel](04-right-panel.md) shows how to give the Mobile breakpoint its own, smaller padding without changing the desktop page.

3. Click **Close**, or press Escape, to go back to the editor.

## 10. Run the audit and fix one issue

1. Click **Audit** at the right end of the second row of the top bar. The SEO & accessibility audit lists what it found on the whole site.

![The SEO & accessibility audit dialog: 6 issues found. Home needs a meta description; Home has 0 h1 headings, prefer one; Classes needs a meta description; Classes has 0 h1 headings, prefer one; Link needs a destination; Set the real public base URL before deployment. Each row has a Select button](images/first-site-audit.webp)

The first two issues are on the empty Home page; the next three are on your Classes page.

2. Click **Select** next to "Classes needs a meta description". The dialog closes, the **Page** tab opens, and the **Description** field is outlined with the cursor in it. The status line says "Selected Classes: Classes needs a meta description".

![The Page tab after Select: the Description field under Search & metadata is outlined in orange and empty, ready for typing](images/first-site-audit-select.webp)

3. Type a sentence that describes the page, for example `Beginner pottery classes on Tuesday evenings at Mill Lane: six weeks at the wheel, clay and firings included.`
4. Press Tab to keep it.
5. Click **Audit** again. It now says 5 issues found.

To fix the others later: select the heading and set **HTML tag** (Design tab, Element section) to `h1`; give Home a heading and a description the same way when you build it; give the button somewhere to go with **Link URL** on the Content tab (search `href`); and see [Audit](07-audit.md) for the base URL.

## 11. Export the site

1. Click **Export** in the top bar (or choose **File > Export static site**).
2. A notice at the bottom right names the file. In a browser it reads "Downloaded mill-lane-pottery-site.zip. Your browser lists it with its downloads.", and the file is in your browser's downloads folder.

![The notice at the bottom right of the window: Downloaded mill-lane-pottery-site.zip. Your browser lists it with its downloads.](images/first-site-export-notice.webp)

In the FormWeb desktop app the file goes straight to your Downloads folder, and the notice has a **Show in folder** button. That case is not pictured here.

The zip holds one folder per page (`index.html` for Home, `classes/index.html` for Classes), `assets/site.css`, `assets/runtime.js`, your picture, `sitemap.xml` and `robots.txt`, ready to upload to any web host. [Export and publishing](08-export-and-publish.md) says more.

## 12. Keep your work

The zip is the finished website, not your editable project. To keep working on the site later:

- **File > Save** (Ctrl+S, or Cmd+S on a Mac) keeps the project in FormWeb. Open it again from Home, under Recent or Projects.
- **File > Download .fweb project** gives you the project as a file you can copy, back up or send.

## What next

- [Pages and layers](02-pages-and-layers.md) to organise a bigger site.
- [Working on the canvas](03-canvas.md) to move and restyle things directly on the page.
