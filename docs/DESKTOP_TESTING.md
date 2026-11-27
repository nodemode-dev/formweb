# Testing the desktop app by hand

These steps check four things that only the desktop app does, because it saves downloads itself and hands links to the system browser: the export notice, Show in folder, the " (1)" name for a second copy, and Open in browser. Run them on each system before a release and write the result in the table below. Step 6 reads how long the app took to start, and step 7 checks where exports are saved (0.35.0).

## What has been run

| Date | System | How | What was checked | Result |
| --- | --- | --- | --- | --- |
| 2026-11-25 | Linux, Ubuntu 24.04 in a sandbox, WebKitGTK 2.52.6 | Debug build of the shell (`cargo build` in `src-tauri`) with the engine as its sidecar, under a virtual display (`xvfb-run`, 1600 x 1000, no window manager), its own home folder; real pointer clicks and keys sent to the window through the X test extension, commands run through the editor's agent bridge, the page read through the web inspector of the debug build, a stand-in `xdg-open` that records its arguments | Export notice, " (1)" names, Show in folder, a deleted file, Download .fweb project, a missing Downloads folder, a folder name with spaces, a comma and accents, Open in browser, page menu, Quick insert, dragging a layer, selecting, editing and dragging on the canvas | Passed after the fixes in this release; Show in folder and Open in browser were checked by the command the shell ran, not by a real file manager or browser |
| 2026-11-25 | Linux, the same sandbox | The `.deb` that `./build_app` made, unpacked and started under the same virtual display with its frozen engine; real clicks and keys only (no inspector in a release build) | Opening a demo from Home, two exports from the toolbar, Show in folder, a deleted file, Download .fweb project from the File menu, Preview as published from Mod+Shift+P and its Open in browser, Help's Open the full guide, the canvas menu on right-click | Passed; the package was not installed with apt |
| 2026-11-25 | Linux, the same sandbox | The built editor served by the service and opened in a plain WebKitGTK 2.52.6 window (the engine the shell uses), real clicks and keys | Canvas step 4 with a link to a published page whose code section runs script: before the fix, Open Link from the menu shown while editing the link text loaded that page into the canvas and its script changed the editor's title; after it, the menu has no Open Link, and a link put into the canvas by hand is stopped by the navigation guard. Hostile scripts put straight into the canvas document were all refused by its policy | Passed after the fix |
| 2026-11-25 | macOS | Not run | Nothing | Not verified |
| 2026-11-25 | Windows | Not run | Nothing | Not verified |

The Windows and macOS code of the shell was compiled for those systems on Linux (`cargo check` for `x86_64-pc-windows-gnu` and `aarch64-apple-darwin`), which shows that it builds, not that it works. The 0.32.0 start-up change (step 6) was checked the same way for `x86_64-pc-windows-msvc` only, and has not been run on any system. The 0.35.0 export folder (step 7) was compiled with `cargo check --locked` and `--tests` for `x86_64-pc-windows-msvc` and `aarch64-apple-darwin`; its pure functions (the safe file name, the " (1)" numbering, the folder check, the record file) were run in a separate crate, and the editor's side was run in a browser with a stand-in for the shell. The app itself, the system dialogs and the web views' handling of the chosen place have not been run on any system.

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

## 6. Start-up time

The app shows its window as soon as the editor is ready, after at least 0.5 s of the splash. When the window is shown it writes one line to its error output:

`[formweb] start-up: service started 120 ms, service ready 2140 ms, editor ready 2630 ms, window shown 2850 ms`

Each time is counted from the moment the app started: the local service was started, the service answered and the window could open, the editor reported that it was ready, and the window was shown. "Window shown" is normally "editor ready" plus about 220 ms, the time the splash bar takes to finish. A moment that never happened reads, for example, `editor ready not reached`, which means the window was shown by the 20-second fallback. When the app found a FormWeb service of the same version already running, the line starts with `service already running`.

Windows. The app has no console, so its error output must be sent to a file:

1. Quit FormWeb if it is running.
2. In PowerShell, run `Start-Process -FilePath "$env:LOCALAPPDATA\FormWeb\FormWeb.exe" -RedirectStandardError "$env:TEMP\formweb-start.txt" -Wait`, with the real path of the installed `FormWeb.exe` if yours is elsewhere.
3. Wait for the window, then quit the app.
4. Run `Select-String "start-up" $env:TEMP\formweb-start.txt`.

macOS:

1. Quit FormWeb if it is running.
2. Run `ls /Applications/FormWeb.app/Contents/MacOS/` and note the program that is not `formweb-engine`.
3. Start it from Terminal, for example `/Applications/FormWeb.app/Contents/MacOS/<that name> 2>&1 | grep start-up`, wait for the window, then quit the app.

On both, expect one line starting `[formweb] start-up:` with four values. Start the app twice and write down both lines, to compare a first start with a second one. When "service ready" is close to "editor ready", most of the wait is the service starting; on Windows that includes the service unpacking itself, between "service started" and "service ready". To see the `service already running` form, start a service first with `./formweb serve` from a copy of the source of the same version.

## 7. Where exports are saved

The app keeps the folder you choose in a small file of its own, `export-folder.json`, in its settings folder:

- macOS: `~/Library/Application Support/ai.nodemode.formweb/`.
- Windows: `%APPDATA%\ai.nodemode.formweb\`.

1. Open Edit > Settings... (Ctrl+, or Cmd+,), then General. Expect "Where exports are saved" with three choices: "The Downloads folder" is chosen, and "No folder chosen yet." shows under "A folder you choose".
2. Export static site. Expect the usual notice naming your Downloads folder, the file there, and Show in folder selecting it.
3. In Settings choose "A folder you choose". Expect the system folder dialog. Make a new folder with a space and an accent in its name (for example `Exports été`) and choose it. Expect its full path next to Choose folder..., the full path also as the tooltip, and `export-folder.json` in the settings folder holding that folder.
4. Export static site. Expect first "Saving coldmere-plumbing-heating-site.zip...", then "Exported coldmere-plumbing-heating-site.zip to" that folder. The file is in that folder; nothing new is in Downloads.
5. Press Show in folder. Expect Finder (macOS) or File Explorer (Windows) on that folder with the zip selected.
6. Export again. Expect `coldmere-plumbing-heating-site (1).zip` in the same folder and in the notice. Choose File > Download .fweb project twice: expect `coldmere-plumbing-heating.fweb`, then `coldmere-plumbing-heating (1).fweb` there.
7. Quit the app and open it again. Expect Settings still on "A folder you choose" with the same path, and the next export goes there.
8. Make the folder read-only (macOS: Get Info > Sharing & Permissions, everyone Read only; Windows: Properties > Security, deny Write for your user), then export. Expect the file in Downloads and a red notice: "The chosen folder <path> is missing or cannot be written, so coldmere-plumbing-heating-site.zip was saved to <Downloads>." Show in folder selects it in Downloads. Give the write permission back.
9. Delete or rename the chosen folder (or choose a folder on a USB stick and remove the stick), then export. Expect the same red notice and the file in Downloads.
10. Choose "Ask each time" and export. Expect the system save dialog before anything is saved, with `coldmere-plumbing-heating-site.zip` filled in. Choose the Desktop. Expect "Exported coldmere-plumbing-heating-site.zip to" the Desktop folder, and the file on the Desktop.
11. Export again in ask mode and press Cancel. Expect no file anywhere and the status line "Nothing was saved.". The Export button keeps the focus, so pressing Backspace now removes nothing.
12. In ask mode, rename the file in the dialog (for example `test.zip`). Expect the file saved under that name and the notice naming it.
13. In ask mode, choose the name of a file that already exists and confirm Replace. Note whether the old file is replaced or a " (1)" copy is made, and write it in the table (the web view decides this; neither is wrong).
14. In ask mode, press Export, choose a place, and at once choose File > Download .fweb project. Expect the second dialog only after the first file has started, and each file in the place chosen for it.
15. Edit > Settings..., General, Reset All Preferences..., Reset. Expect the editor to reload with "The Downloads folder" chosen, `export-folder.json` gone, and the next export in Downloads.
16. Choose a folder with a very long path (several nested folders, about 200 characters). Expect the path cut with "..." on one line, nothing in the dialog moving, and exports saved there.
17. In ask mode, edit a drawing (an SVG on a page) and choose Vector > Export for Screens... with PNG and SVG ticked, then Export. Press Cancel in the first save dialog: expect no second dialog, nothing saved, and "Nothing was saved." in the Export for Screens window. Run it again, save the first file and cancel the second: expect "Exported 1 file.".
18. With "A folder you choose", edit `export-folder.json` so it names another existing folder, quit and open the app, and export. Expect the file in that other folder, because the app reads its own file. Delete the file, quit and open the app: expect Settings on "The Downloads folder" and "No folder chosen yet.".

## When something fails

Write down the system and its version, what you pressed, what the notice or status line said, and the path of the file. On Linux, start the app from a terminal and copy its output.
