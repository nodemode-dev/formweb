//! Downloads from the page (Export static site, Download project). Every platform's web view saves them straight to the
//! Downloads folder with no prompt and no download bar, so the shell tells the page where each file went (a
//! `formweb-download` event) and keeps the last saved path for the page's Show in folder button.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::webview::DownloadEvent;
#[cfg(target_os = "linux")]
use tauri::Manager;
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
            #[cfg(target_os = "linux")]
            let saved = saved.map(|path| settle(&webview, path));
            if success {
                if let Some(path) = &saved {
                    *LAST.lock().unwrap() = Some(path.clone());
                }
            }
            let editor = webview.url().is_ok_and(|page| page.scheme() == "http" && page.host_str() == Some("127.0.0.1") && page.port() == Some(crate::ENGINE_PORT.load(Ordering::SeqCst)));
            if !editor {
                return true;
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

/// WebKitGTK picks the folder itself, from ~/.config/user-dirs.dirs, and without a Downloads entry there it saves into
/// the folder the app was started from. Such a file is moved to ~/Downloads; anything that fails leaves it where it is.
#[cfg(target_os = "linux")]
fn settle<R: Runtime>(webview: &Webview<R>, path: PathBuf) -> PathBuf {
    let (Err(_), Ok(home), Some(name)) = (webview.path().download_dir(), webview.path().home_dir(), path.file_name().and_then(|name| name.to_str())) else { return path };
    let folder = home.join("Downloads");
    if !path.is_file() || path.parent() == Some(folder.as_path()) || std::fs::create_dir_all(&folder).is_err() {
        return path;
    }
    let target = free(&folder, &unnumbered(name));
    if std::fs::rename(&path, &target).is_ok() || (std::fs::copy(&path, &target).is_ok() && std::fs::remove_file(&path).is_ok()) {
        target
    } else {
        path
    }
}

/// The base name and extension, split at the first dot as the web view does.
#[cfg(target_os = "linux")]
fn split(name: &str) -> (&str, &str) {
    name.find('.').map_or((name, ""), |at| name.split_at(at))
}

/// The name without the " (2)" the web view added for a file of that name in the folder it used.
#[cfg(target_os = "linux")]
fn unnumbered(name: &str) -> String {
    let (base, ext) = split(name);
    let kept = base.rsplit_once(" (").filter(|(_, n)| n.strip_suffix(')').is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))).map_or(base, |(kept, _)| kept);
    format!("{kept}{ext}")
}

/// `name` in `folder`, or "base (1).ext", "base (2).ext" and so on when that is taken, as the web views do.
#[cfg(target_os = "linux")]
fn free(folder: &Path, name: &str) -> PathBuf {
    let (base, ext) = split(name);
    let mut path = folder.join(name);
    let mut count = 1;
    while path.exists() {
        path = folder.join(format!("{base} ({count}){ext}"));
        count += 1;
    }
    path
}

/// Shows the last file the page saved in the system file manager: selected in Finder and Explorer, its folder elsewhere.
#[tauri::command]
pub fn reveal_download() -> Result<(), String> {
    let path = LAST.lock().unwrap().clone().ok_or("No file has been saved yet.")?;
    if !path.exists() {
        let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
        let folder = path.parent().map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default();
        return Err(format!("{name} is no longer in {folder}. It was moved or deleted."));
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(&path);
        command
    };
    // Explorer splits its command line at commas and does not follow the usual quoting rules, so the path goes in one
    // argument, always quoted (a Windows file name cannot hold a quote).
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut select = std::ffi::OsString::from("/select,\"");
        select.push(&path);
        select.push("\"");
        let mut command = Command::new("explorer");
        command.raw_arg(select);
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
