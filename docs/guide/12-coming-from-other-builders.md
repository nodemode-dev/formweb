# Coming from Dreamweaver or another visual builder

If you have built sites with Dreamweaver or a similar visual editor, most of what you know carries over. This page tells you where to find the familiar things in FormWeb, and the few ideas that work differently.

## Where things are

| You look for | In FormWeb |
| --- | --- |
| A panel listing the site's pages and files | The left panel, **Pages and layers**: the PAGES list holds every page with its address. Pictures and fonts are not loose files in a folder: they are uploaded with the element that uses them (Insert > Image, or the Content tab) and stored with the project. |
| The document structure, or tag tree | The LAYERS list under PAGES: every element of the page as a tree you can fold, rename, drag and select. See [Pages and layers](02-pages-and-layers.md). |
| A properties inspector for the selected element | The right panel: Design, Motion, Content and Page tabs. See [The right panel](04-right-panel.md). |
| Finding the field for a CSS property | **Search properties** at the top of the right panel. Type the CSS name (`border-radius`, `padding`, `font-size`) or an everyday word (`rounded`, `spacing`). |
| An insert bar or insert menu | The **+** next to LAYERS (Quick insert, also Ctrl+Shift+L), the **Insert** panel in the rail, or the **Insert** menu. |
| Editing text in the page | Double-click the text on the canvas. |
| Media queries | Breakpoints: Desktop, Tablet and Mobile in the second row of the top bar. You pick the one you edit, and styles set there apply to that range of widths only. |
| A live view of the real page | **Preview** (Preview as published, Ctrl+Shift+P) for the whole site over the window, or **View > Live responsive preview** inside the canvas. See [Preview](06-preview.md). |
| Code view | There is no code view of the whole page: the page is a tree of elements that FormWeb writes out as HTML and CSS when you export. For your own code, use a code section (**File > Import HTML...**, see [Importing](09-importing.md)) or the **Custom code** section of the Page tab. |
| Site-wide colors and fonts | Design tokens: **Window > Design system...**. A token such as `var(--paper)` used everywhere changes everywhere at once. See [Page background and theme colors](05-background-and-theme-colors.md). |
| Templates or repeating regions | Components: build a part once (for example a header) and place linked instances on every page; a change to the original changes them all. To start a whole site from a design, use **New site** with **Start from**, or a demo such as Coldmere Plumbing. See [Components and the Library](10-components-and-library.md). |
| Snippets or a library of ready-made blocks | The **Library**: finished sections, design presets and starter sites. |
| Checking links and accessibility | **Audit**. See [Audit](07-audit.md). |
| Publishing to a server (FTP and the like) | FormWeb does not upload to your server. **Export** gives you a zip of plain HTML, CSS and JavaScript to upload with your host's tools, or **File > Send to FormPublisher** hands the site to FormPublisher. See [Export and publishing](08-export-and-publish.md). |
| The site definition, or local site folder | The project. **File > Save** keeps it in FormWeb (open it again from Home), and **File > Download .fweb project** gives you one file to back up or move. |
| Bringing an existing site in | **File > Import site from zip...** turns each HTML page into a page, as **Editable elements** (headings, paragraphs, pictures, tables and boxes you click, retype, restyle and drag) or as **Code sections** (an exact copy edited as code). Pages built with tables, inline styles and `<font>` tags convert too. |
| History and undo | **Edit > Undo** and **Edit > Redo** (Ctrl+Z, Ctrl+Shift+Z). Each step, even a large one such as an import, is one undo step. |

## What works differently

- **You do not edit HTML files.** FormWeb keeps your site as a structured document and writes the HTML, CSS and JavaScript only when you export or preview. That is why the same site can be previewed at any width, exported many times, and edited by more than one tool at once.
- **Layout follows the page's flow.** Elements sit one after another in their container, or in a row or grid you set in the Layout section. You move them by dragging into a new place in that order, not to a free x and y position. Nothing ends up overlapping by accident. That order is the grid elements snap to: while you drag, the canvas outlines the containers and marks every place in them, and **View > Show layout outlines** shows the same structure at any time ([Working on the canvas](03-canvas.md#snap-and-grid-in-a-page-layout)).
- **The canvas is for editing.** It does not run scripts, forms or animations. Use Preview to try those.
- **The canvas never changes breakpoint on its own.** You choose Desktop, Tablet or Mobile; resizing only changes the frame. See [The right panel](04-right-panel.md).
- **Code you bring in can become elements.** Import HTML and Import site from zip bring pages in as editable elements by default; a page kept as a code section can be converted later with **Convert to editable elements...** (right-click it). The conversion keeps the desktop look; responsive rules, hover effects, url() background pictures and floats are not carried over, and scripts and inline frames stay as small code sections. See [Importing](09-importing.md#convert-a-code-section-to-elements).

## Where to go next

Work through [Your first site](01-first-site.md): it takes about fifteen minutes and touches every part of the window.

---

Dreamweaver is a trademark of Adobe. It is named here only to help you find your way; FormWeb is not affiliated with or endorsed by Adobe.
