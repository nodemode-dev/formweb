//! Downloads from the page (Export static site, Download project). Every platform's web view saves them straight to the
//! Downloads folder with no prompt and no download bar, so the shell tells the page where each file went (a
//! `formweb-download` event) and keeps the last saved path for the page's Show in folder button.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use tauri::webview::DownloadEvent;
use tauri::{Runtime, Webview};

static REQUESTED: Mutex<Vec<(String, PathBuf)>> = Mutex::new(Vec::new());
static LAST: Mutex<Option<PathBuf>> = Mutex::new(None);
const KEPT: usize = 16;

pub fn on_download<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            let mut requested = REQUESTED.lock().unwrap();
            if requested.len() >= KEPT {
                requested.remove(0);
            }
            requested.push((url.to_string(), destination.clone()));
        }
        DownloadEvent::Finished { url, path, success } => {
            let url = url.to_string();
            let asked = {
                let mut requested = REQUESTED.lock().unwrap();
                requested.iter().position(|(seen, _)| *seen == url).map(|at| requested.remove(at).1)
            };
            let saved = path.filter(|path| path.is_file()).or(asked);
            if success {
                if let Some(path) = &saved {
                    *LAST.lock().unwrap() = Some(path.clone());
                }
            }
            let detail = serde_json::json!({
                "url": url,
                "ok": success,
                "file": saved.as_deref().and_then(Path::file_name).map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
                "folder": saved.as_deref().and_then(Path::parent).map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default(),
            });
            let _ = webview.eval(format!("window.dispatchEvent(new CustomEvent('formweb-download', {{ detail: {detail} }}))"));
        }
        _ => {}
    }
    true
}

/// Shows the last file the page saved in the system file manager: selected in Finder and Explorer, its folder elsewhere.
#[tauri::command]
pub fn reveal_download() -> Result<(), String> {
    let path = LAST.lock().unwrap().clone().filter(|path| path.exists()).ok_or("The downloaded file is no longer there.")?;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(&path);
        command
    };
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg("/select,").arg(&path);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path.parent().unwrap_or(&path));
        command
    };
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
