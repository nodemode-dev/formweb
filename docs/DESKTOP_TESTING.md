# Testing the desktop app by hand

These steps check four things that only the desktop app does, because it saves downloads itself and hands links to the system browser: the export notice, Show in folder, the " (1)" name for a second copy, and Open in browser. Run them on each system before a release and write the result in the table below.

## What has been run

| Date | System | How | What was checked | Result |
| --- | --- | --- | --- | --- |
| 2026-11-25 | Linux, Ubuntu 24.04 in a sandbox, WebKitGTK 2.52.6 | Debug build of the shell (`cargo build` in `src-tauri`) with the engine as its sidecar, under a virtual display (`xvfb-run`, 1600 x 1000, no window manager), its own home folder; real pointer clicks and keys sent to the window through the X test extension, commands run through the editor's agent bridge, the page read through the web inspector of the debug build, a stand-in `xdg-open` that records its arguments | Export notice, " (1)" names, Show in folder, a deleted file, Download .fweb project, a missing Downloads folder, a folder name with spaces, a comma and accents, Open in browser, page menu, Quick insert, dragging a layer, selecting, editing and dragging on the canvas | Passed after the fixes in this release; Show in folder and Open in browser were checked by the command the shell ran, not by a real file manager or browser |
| 2026-11-25 | Linux, the same sandbox | The `.deb` that `./build_app` made, unpacked and started under the same virtual display with its frozen engine; real clicks and keys only (no inspector in a release build) | Opening a demo from Home, two exports from the toolbar, Show in folder, a deleted file, Download .fweb project from the File menu, Preview as published from Mod+Shift+P and its Open in browser, Help's Open the full guide, the canvas menu on right-click | Passed; the package was not installed with apt |
| 2026-11-25 | Linux, the same sandbox | The built editor served by the service and opened in a plain WebKitGTK 2.52.6 window (the engine the shell uses), real clicks and keys | Canvas step 4 with a link to a published page whose code section runs script: before the fix, Open Link from the menu shown while editing the link text loaded that page into the canvas and its script changed the editor's title; after it, the menu has no Open Link, and a link put into the canvas by hand is stopped by the navigation guard. Hostile scripts put straight into the canvas document were all refused by its policy | Passed after the fix |
| 2026-11-25 | macOS | Not run | Nothing | Not verified |
| 2026-11-25 | Windows | Not run | Nothing | Not verified |

The Windows and macOS code of the shell was compiled for those systems on Linux (`cargo check` for `x86_64-pc-windows-gnu` and `aarch64-apple-darwin`), which shows that it builds, not that it works.

## Before you start (every system)

1. Install the app from the release package, or build it with `./build_app` (`build_app.bat` on Windows), and open it.
2. On Home, open a demo, for example Coldmere Plumbing. The editor shows its pages and the canvas.
3. Open your Downloads folder in the file manager and remove any older `coldmere-plumbing-heating-site.zip`, `coldmere-plumbing-heating-site (1).zip` and `coldmere-plumbing-heating.fweb`, so the names below come out as written.

## 1. The export notice

1. Choose File > Export static site (or the Export button in the toolbar).
2. While the file is made, the Export button shows a progress pointer.
3. Expect, at the bottom right, a notice with a green tick: "Exported coldmere-plumbing-heating-site.zip to" and the full path of your Downloads folder, with a Show in folder button and a close button. It stays about 12 seconds, longer while the pointer is on it.
4. Expect the file in the Downloads folder. No save dialog and no download bar appear.

The folder in the notice is:

- macOS: `/Users/<you>/Downloads`.
- Windows: `C:\Users\<you>\Downloads`, or the folder set as Downloads in the folder's Properties > Location.
- Linux: the folder named `XDG_DOWNLOAD_DIR` in `~/.config/user-dirs.dirs`, usually `~/Downloads` (or its translated name, such as `~/Téléchargements`). Without that entry the app saves to `~/Downloads` and makes the folder if it is missing. Setting `XDG_DOWNLOAD_DIR` in the environment does nothing; only the file counts.

## 2. The " (1)" name

1. Export again, without removing the first file.
2. Expect the notice to say "Exported coldmere-plumbing-heating-site (1).zip to" the same folder, and both files in the folder. A third export gives " (2)".
3. Choose File > Download .fweb project twice. Expect "Saved coldmere-plumbing-heating.fweb to" the folder, then "Saved coldmere-plumbing-heating (1).fweb to" it.

## 3. Show in folder

1. Export once more and press Show in folder in the notice.
2. Expect:
   - macOS: a Finder window on Downloads with the new zip selected.
   - Windows: a File Explorer window on Downloads with the new zip selected.
   - Linux: the Downloads folder opens in the file manager (the file is not selected; the app asks `xdg-open` to open the folder).
3. Export again, then delete the new zip in the file manager before the notice goes, and press Show in folder.
4. Expect the notice to turn red and say "coldmere-plumbing-heating-site (N).zip is no longer in <folder>. It was moved or deleted." No file manager opens.
5. On Windows, if your Downloads folder has a comma in its path (for example `D:\Files, 2026\Downloads`), repeat step 1 there: Explorer must still select the file.

## 4. Open in browser

1. Choose View > Preview as published (or Mod+Shift+P). The site fills the window with a bar on top.
2. Wait until the bar shows "Revision" and a number, then press Open in browser.
3. Expect your default browser (Safari, Edge, Firefox or another) to open a new tab on the same page at `http://127.0.0.1:<port>/preview/...`. Nothing opens inside the app, and the app window stays as it was.
4. In Help, press Open the full guide. Expect the guide to open in the same browser.

## 5. The canvas (quick check)

1. Close the preview. Click a heading on the canvas: it gets an orange outline and the right panel shows it.
2. Double-click a paragraph, type a word, click elsewhere: the status line says "Text updated."
3. With the heading selected, drag it a little down the page and let go: the status line says "Element moved", and no text on the canvas stays highlighted. Press Mod+Z to put it back.
4. Links never open inside the canvas. Double-click the text of a link in the navigation to edit it and right-click it: the menu that appears has no Open Link item. Press Escape and click elsewhere. Middle-click the link: nothing opens. The canvas still shows the page you are editing.

The canvas frame is allowed to run scripts because WebKit, which the desktop app uses on macOS and Linux, runs none of the editor's click, key and drag handlers in a frame that is not. No script from the site runs there: the canvas document's own policy blocks every script, the canvas never builds script, frame or plugin elements, and the frame never leaves that document, since canvas links have no `href` and every other navigation of the frame is cancelled. Step 4 checks the last part; the reasoning is in the wiki's Architecture page under "Canvas frame and scripts".

## When something fails

Write down the system and its version, what you pressed, what the notice or status line said, and the path of the file. On Linux, start the app from a terminal and copy its output.
