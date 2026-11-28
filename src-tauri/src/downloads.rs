//! Downloads from the page (Export static site, Download project). Every platform's web view saves them without a prompt
//! or a download bar, so the shell decides the place in `Requested` (the Downloads folder, the folder the person chose,
//! or the place the save dialog gave just before), tells the page where each file went (a `formweb-download` event) and
//! keeps the last saved path for the page's Show in folder button.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_dialog::DialogExt;

struct Request {
    url: String,
    destination: PathBuf,
    placed: bool,
    unusable: Option<PathBuf>,
    refused: bool,
}

#[derive(Clone, Debug, PartialEq)]
enum Place {
    Downloads,
    Folder(PathBuf),
    Ask,
}

/// A place the save dialog gave for the file the page is about to download, used once by the next download of that name.
struct Answer {
    name: String,
    path: PathBuf,
    at: Instant,
}

static REQUESTED: Mutex<Vec<Request>> = Mutex::new(Vec::new());
static LAST: Mutex<Option<PathBuf>> = Mutex::new(None);
static PLACE: Mutex<Place> = Mutex::new(Place::Downloads);
static ANSWERS: Mutex<Vec<Answer>> = Mutex::new(Vec::new());
/// The folder the person picked in the shell's folder dialog: `None` until the record file has been read.
static CHOSEN: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);
const RECORD: &str = "export-folder.json";
const KEPT: usize = 16;
const ANSWERS_KEPT: usize = 4;
const ANSWER_LIFE: Duration = Duration::from_secs(30 * 60);
const PATH_MAX: usize = 4096;
const NAME_MAX: usize = 200;
const NUMBER_MAX: u32 = 9999;
const FALLBACK_NAME: &str = "download";

pub fn on_download<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            let mut requested = REQUESTED.lock().unwrap();
            if requested.len() >= KEPT {
                requested.remove(0);
            }
            let raw = destination.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
            let name = clean(&web_name(&raw, destination.parent()));
            let reserved: Vec<String> = requested.iter().map(|request| folded(&request.destination)).collect();
            let taken = |path: &Path| occupied(path) || reserved.contains(&folded(path));
            let place = PLACE.lock().unwrap().clone();
            let mut unusable = None;
            let mut chosen = None;
            match place {
                Place::Folder(folder) => match usable(&folder) {
                    true => chosen = Some(free(&folder, &name, taken)),
                    false => unusable = Some(folder),
                },
                Place::Ask => match take_answer(&name).or_else(|| take_answer(&clean(&raw))) {
                    Some(path) => match path.parent().filter(|folder| usable(folder)) {
                        Some(_) => chosen = Some(path),
                        None => unusable = path.parent().map(Path::to_path_buf),
                    },
                    None => {
                        requested.push(Request { url: url.to_string(), destination: destination.clone(), placed: true, unusable: None, refused: true });
                        drop(requested);
                        tell(&webview, serde_json::json!({ "url": url.to_string(), "ok": false, "reason": "not-asked", "file": name, "folder": "", "unusable": "" }));
                        return false;
                    }
                },
                Place::Downloads => {}
            }
            let placed = chosen.is_some() || clean(&raw) != raw;
            match chosen {
                Some(path) => *destination = path,
                None if placed => {
                    if let Some(folder) = destination.parent().map(Path::to_path_buf) {
                        *destination = free(&folder, &name, taken);
                    }
                }
                None => {}
            }
            requested.push(Request { url: url.to_string(), destination: destination.clone(), placed, unusable, refused: false });
        }
        DownloadEvent::Finished { url, path, success } => {
            let url = url.to_string();
            let asked = {
                let mut requested = REQUESTED.lock().unwrap();
                requested.iter().position(|request| request.url == url).map(|at| requested.remove(at))
            };
            if asked.as_ref().is_some_and(|request| request.refused) {
                return true;
            }
            let placed = asked.as_ref().is_some_and(|request| request.placed);
            let unusable = asked.as_ref().and_then(|request| request.unusable.as_ref()).map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default();
            let saved = path.filter(|path| path.is_file()).or(asked.map(|request| request.destination));
            #[cfg(target_os = "linux")]
            let saved = saved.map(|path| if placed { path } else { settle(&webview, path) });
            #[cfg(not(target_os = "linux"))]
            let _ = placed;
            if success {
                if let Some(path) = &saved {
                    *LAST.lock().unwrap() = Some(path.clone());
                }
            }
            tell(&webview, serde_json::json!({
                "url": url,
                "ok": success,
                "file": saved.as_deref().and_then(Path::file_name).map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
                "folder": saved.as_deref().and_then(Path::parent).map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default(),
                "unusable": unusable,
            }));
        }
        _ => {}
    }
    true
}

/// Sends a `formweb-download` event to the page, only when the page is the editor this shell started.
fn tell<R: Runtime>(webview: &Webview<R>, detail: serde_json::Value) {
    let editor = webview.url().is_ok_and(|page| page.scheme() == "http" && page.host_str() == Some("127.0.0.1") && page.port() == Some(crate::ENGINE_PORT.load(Ordering::SeqCst)));
    if editor {
        let _ = webview.eval(format!("window.dispatchEvent(new CustomEvent('formweb-download', {{ detail: {detail} }}))"));
    }
}

/// A path is taken when anything is there, a dangling link included.
fn occupied(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// A path as Windows and macOS compare names: without regard to case.
fn folded(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

/// The suggested name without the " (n)" the web view added because that name was taken in its own folder; a number
/// that was part of the page's name stays.
fn web_name(raw: &str, folder: Option<&Path>) -> String {
    let plain = unnumbered(raw);
    if plain != raw && folder.is_some_and(|folder| occupied(&folder.join(&plain))) {
        plain
    } else {
        raw.to_string()
    }
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
    let target = free(&folder, &unnumbered(name), occupied);
    if std::fs::rename(&path, &target).is_ok() || (std::fs::copy(&path, &target).is_ok() && std::fs::remove_file(&path).is_ok()) {
        target
    } else {
        path
    }
}

/// The base name and extension, split at the first dot as the web view does.
fn split(name: &str) -> (&str, &str) {
    name.find('.').map_or((name, ""), |at| name.split_at(at))
}

/// The name without the " (2)" the web view added for a file of that name in the folder it used.
fn unnumbered(name: &str) -> String {
    let (base, ext) = split(name);
    let kept = base.rsplit_once(" (").filter(|(_, n)| n.strip_suffix(')').is_some_and(|n| !n.is_empty() && n.len() <= 6 && n.bytes().all(|b| b.is_ascii_digit()))).map_or(base, |(kept, _)| kept);
    format!("{kept}{ext}")
}

/// `name` in `folder`, or "base (1).ext", "base (2).ext" and so on when that is taken, as the web views do.
fn free(folder: &Path, name: &str, taken: impl Fn(&Path) -> bool) -> PathBuf {
    let (base, ext) = split(name);
    let mut path = folder.join(name);
    let mut count = 1;
    while taken(&path) && count <= NUMBER_MAX {
        path = folder.join(format!("{base} ({count}){ext}"));
        count += 1;
    }
    if taken(&path) {
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|time| time.as_millis()).unwrap_or_default();
        path = folder.join(format!("{base} ({stamp}){ext}"));
    }
    path
}

const RESERVED: &[&str] = &["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"];

/// A device name Windows reserves in every folder, whatever follows its first dot.
fn reserved(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").trim_end_matches(' ').to_ascii_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        return true;
    }
    let digit = stem.get(3..).unwrap_or("");
    (stem.starts_with("COM") || stem.starts_with("LPT")) && matches!(digit, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "\u{b9}" | "\u{b2}" | "\u{b3}")
}

/// The file name a download may use: the last part of what the page or the web view suggested, without separators,
/// drive letters, characters Windows refuses, control and direction characters, leading dots, trailing dots and
/// spaces, or a device name, and at most `NAME_MAX` bytes with its short extension kept. Anything left empty is
/// `FALLBACK_NAME`.
fn clean(suggested: &str) -> String {
    let last = suggested.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name: String = last
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{feff}'))
        .map(|c| if matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') { '_' } else { c })
        .collect();
    name = name.trim_start_matches(['.', ' ']).trim_end_matches(['.', ' ']).to_string();
    if name.len() > NAME_MAX {
        let ext = name.rfind('.').map(|at| &name[at..]).filter(|ext| ext.len() <= 16).unwrap_or("").to_string();
        let mut end = NAME_MAX - ext.len();
        while !name.is_char_boundary(end) {
            end -= 1;
        }
        name = format!("{}{ext}", name[..end].trim_end_matches(['.', ' ']));
    }
    if name.is_empty() || name.starts_with('.') {
        return FALLBACK_NAME.to_string();
    }
    if reserved(&name) {
        name.insert(0, '_');
    }
    name
}

/// A folder the shell may save into now: absolute, an existing directory, and one where a new file can be created.
fn usable(folder: &Path) -> bool {
    if !folder.is_absolute() || !folder.is_dir() {
        return false;
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|time| time.as_nanos()).unwrap_or_default();
    let probe = folder.join(format!(".formweb-write-check-{}-{stamp}", std::process::id()));
    match std::fs::OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(file) => {
            drop(file);
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// The dialog's answer for a file of this name, if one is waiting and fresh; it is used once.
fn take_answer(name: &str) -> Option<PathBuf> {
    let mut answers = ANSWERS.lock().unwrap();
    answers.retain(|answer| answer.at.elapsed() < ANSWER_LIFE);
    let at = answers.iter().position(|answer| answer.name == name)?;
    Some(answers.remove(at).path)
}

/// The page names a mode; a folder is only ever the one the person picked in the shell's own dialog (`recorded`), and
/// a path the page sends must name that folder. Anything else means Downloads.
fn place_of(mode: &str, path: &str, recorded: Option<&Path>) -> Place {
    match (mode, recorded) {
        ("folder", Some(folder)) if path.is_empty() || (path.len() <= PATH_MAX && Path::new(path) == folder) => Place::Folder(folder.to_path_buf()),
        ("ask", _) => Place::Ask,
        _ => Place::Downloads,
    }
}

/// The recorded folder in the record file's JSON; any error, an empty or relative path, or an oversized file means none.
fn read_record(file: &Path) -> Option<PathBuf> {
    let bytes = std::fs::read(file).ok().filter(|bytes| bytes.len() <= PATH_MAX * 2 + 64)?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let folder = value.get("folder")?.as_str().filter(|folder| !folder.is_empty() && folder.len() <= PATH_MAX)?;
    Some(PathBuf::from(folder)).filter(|folder| folder.is_absolute())
}

/// Writes the record through a temporary file and a rename, so a crash leaves the old record or the new one; `None`
/// removes it.
fn write_record(file: &Path, folder: Option<&Path>) -> bool {
    let Some(folder) = folder else { return std::fs::remove_file(file).is_ok() || !occupied(file) };
    let Some(parent) = file.parent() else { return false };
    let body = serde_json::json!({ "folder": folder.to_string_lossy() }).to_string();
    let temporary = parent.join(format!("{RECORD}.{}.tmp", std::process::id()));
    let written = std::fs::create_dir_all(parent).is_ok() && std::fs::write(&temporary, body).is_ok() && std::fs::rename(&temporary, file).is_ok();
    if !written {
        let _ = std::fs::remove_file(&temporary);
    }
    written
}

fn record_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|folder| folder.join(RECORD))
}

fn recorded<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let mut chosen = CHOSEN.lock().unwrap();
    chosen.get_or_insert_with(|| record_file(app).and_then(|file| read_record(&file))).clone()
}

fn record<R: Runtime>(app: &AppHandle<R>, folder: Option<PathBuf>) {
    if let Some(file) = record_file(app) {
        write_record(&file, folder.as_deref());
    }
    *CHOSEN.lock().unwrap() = Some(folder);
}

/// What the shell will do: the mode it took and the folder it has on record, for the page to show.
#[derive(serde::Serialize)]
pub struct ExportPlace {
    mode: &'static str,
    folder: String,
}

/// Where the page's downloads go, as the person chose in Preferences. A folder must be the one recorded by
/// `choose_export_folder`; `forget` drops that record (Reset All Preferences). Waiting dialog answers are dropped.
#[tauri::command]
pub fn set_export_place<R: Runtime>(app: AppHandle<R>, mode: String, path: String, forget: Option<bool>) -> ExportPlace {
    if forget == Some(true) {
        record(&app, None);
    }
    let folder = recorded(&app);
    let place = place_of(&mode, &path, folder.as_deref());
    let mode = match place {
        Place::Downloads => "downloads",
        Place::Folder(_) => "folder",
        Place::Ask => "ask",
    };
    *PLACE.lock().unwrap() = place;
    ANSWERS.lock().unwrap().clear();
    ExportPlace { mode, folder: folder.map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default() }
}

fn start_folder<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    recorded(app).filter(|path| path.is_dir()).or_else(|| app.path().download_dir().ok().filter(|path| path.is_dir()))
}

/// The system folder dialog. The folder the person picks is recorded by the shell (the only way a folder gets there)
/// and returned for the page to show; nothing after Cancel.
#[tauri::command]
pub async fn choose_export_folder<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let mut dialog = app.dialog().file().set_can_create_directories(true);
    if let Some(folder) = start_folder(&app) {
        dialog = dialog.set_directory(folder);
    }
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let folder = dialog.blocking_pick_folder()?.into_path().ok().filter(|folder| folder.is_absolute())?;
    let text = folder.to_string_lossy().into_owned();
    if text.len() > PATH_MAX {
        return None;
    }
    record(&app, Some(folder));
    Some(text)
}

/// The system save dialog for the file the page is about to download, before the download starts. The place is kept
/// for the next download of that name within `ANSWER_LIFE` and used once; false after Cancel, and then nothing is kept.
#[tauri::command]
pub async fn ask_export_place<R: Runtime>(app: AppHandle<R>, name: String) -> bool {
    let suggested = clean(&name);
    let name = suggested.clone();
    let mut dialog = app.dialog().file().set_file_name(suggested.clone()).set_can_create_directories(true);
    if let Some(folder) = app.path().download_dir().ok().filter(|path| path.is_dir()) {
        dialog = dialog.set_directory(folder);
    }
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(path) = dialog.blocking_save_file().and_then(|path| path.into_path().ok()) else { return false };
    let Some(folder) = path.parent().filter(|folder| folder.is_absolute()).map(Path::to_path_buf) else { return false };
    let file = path.file_name().map(|file| clean(&file.to_string_lossy())).unwrap_or(suggested);
    let mut answers = ANSWERS.lock().unwrap();
    answers.retain(|answer| answer.at.elapsed() < ANSWER_LIFE && answer.name != name);
    if answers.len() >= ANSWERS_KEPT {
        answers.remove(0);
    }
    answers.push(Answer { name, path: folder.join(file), at: Instant::now() });
    true
}

/// What went wrong, as a stable code the page turns into a sentence in the person's language, with the file's name and
/// folder and, for a file manager that did not start, the system's own reason.
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct RevealError {
    code: &'static str,
    file: String,
    folder: String,
    detail: String,
}

fn reveal_error(code: &'static str, path: Option<&Path>, detail: String) -> RevealError {
    let file = path.and_then(Path::file_name).map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let folder = path.and_then(Path::parent).map(|folder| folder.to_string_lossy().into_owned()).unwrap_or_default();
    RevealError { code, file, folder, detail }
}

/// Shows the last file the page saved in the system file manager: selected in Finder and Explorer, its folder elsewhere.
#[tauri::command]
pub fn reveal_download() -> Result<(), RevealError> {
    let path = LAST.lock().unwrap().clone().ok_or_else(|| reveal_error("download.none", None, String::new()))?;
    if !path.exists() {
        return Err(reveal_error("download.moved", Some(&path), String::new()));
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
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| reveal_error("download.reveal-failed", Some(&path), error.to_string()))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn show_in_folder_answers_codes_with_the_file_and_folder_for_the_page_to_put_in_words() {
        *LAST.lock().unwrap() = None;
        assert_eq!(serde_json::to_value(reveal_download().unwrap_err()).unwrap()["code"], "download.none");
        let gone = std::env::temp_dir().join("formweb-reveal-test").join("site export.zip");
        *LAST.lock().unwrap() = Some(gone.clone());
        let answer = serde_json::to_value(reveal_download().unwrap_err()).unwrap();
        assert_eq!(answer, serde_json::json!({"code": "download.moved", "file": "site export.zip", "folder": gone.parent().unwrap().to_string_lossy(), "detail": ""}));
    }
}
