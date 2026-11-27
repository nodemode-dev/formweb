# Guide

The user guide teaches FormWeb to a person who has never used it: plain words, numbered steps, a screenshot for every step, and a worked example on one of the eight demo sites (Help > Demos in the app). Its source is `docs/guide/` in the code repository, with its pictures in `docs/guide/images/`. The wiki workflow copies only `.docs/wiki/*.md`, so the guide is not copied here: the links below open it in the repository, where its pictures show.

- [Start here](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/README.md): what FormWeb is, a map of the window, how to open a demo.
- [Your first site](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/01-first-site.md): from an empty page to an exported zip.
- [Pages and layers](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/02-pages-and-layers.md)
- [Working on the canvas](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/03-canvas.md): select, the right-click menu, dragging with the layout grid it snaps to, View > Show layout outlines and View > Show hover outlines.
- [The right panel](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/04-right-panel.md): tabs, sliders, the color picker and gradients, the grid layout chooser, Search properties and breakpoints.
- [Page background and theme colors](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/05-background-and-theme-colors.md)
- [Preview](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/06-preview.md)
- [Audit](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/07-audit.md)
- [Export and publishing](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/08-export-and-publish.md)
- [Importing](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/09-importing.md)
- [Components and the Library](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/10-components-and-library.md)
- [Keyboard shortcuts](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/11-keyboard-shortcuts.md)
- [Coming from Dreamweaver or another visual builder](https://github.com/nodemode-dev/formweb/blob/main/docs/guide/12-coming-from-other-builders.md)

The whole folder: <https://github.com/nodemode-dev/formweb/tree/main/docs/guide>. In the app it opens from New to FormWeb? Read the guide on the Start screen (`GUIDE_URL` in `ui/home.ts`) and from Open the full guide in Help > Using FormWeb. The full reference is `docs/MANUAL.md`, which links the guide from its first section.

For contributors: every picture in the guide is a WebP screenshot of the running app at 1440 x 900 in the default dark theme, taken over the DevTools protocol in headless Chrome, never drawn by hand. Keep each file under 250 KB and the folder under 4 MB, give every picture alt text that says what it shows, and retake a picture when the screen it shows changes. Write a step only after doing it in the app, with the labels the app shows. The keyboard shortcut tables are generated from `window.formweb.commands()` in the running app.
