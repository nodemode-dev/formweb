#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! FormWeb desktop shell, on the formvis and formlit pattern: a native window around the editor that the local FormWeb
//! service serves on 127.0.0.1:8240, plus the family GPU renderer exposed to the page through `invoke`.
//!
//! Start-up: if a FormWeb service of this version already answers /api/health on 8240 (named by `app` and `version` in
//! the reply), the window opens on it. If something else holds 8240, the shell starts its own service on the first free
//! port above it, up to 8279. Otherwise the shell starts the bundled formweb-engine sidecar beside its executable (built by
//! ./build_app), or, in a source checkout, runs `formweb serve` (formweb.bat on Windows) from the FormWeb folder
//! (FORMWEB_ROOT, or the folder above the executable's working directory that holds the launcher), waits up to 90
//! seconds for health, and stops that service on exit. FORMWEB_PORT, between 8240 and 8279, replaces 8240 as the first
//! choice.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

mod engine_start;
mod render;
mod reveal;
mod text_edit;
mod traffic_lights;
#[cfg(windows)]
mod win_job;

const DEFAULT_PORT: u16 = 8240;
const LAST_PORT: u16 = 8279;
const VERSION: &str = env!("CARGO_PKG_VERSION");
const FALLBACK_LOGICAL: (f64, f64) = (1440.0, 900.0);
const MIN_LOGICAL: (f64, f64) = (1024.0, 680.0);
const SCREEN_FRACTION: f64 = 0.9;

static ENGINE_PORT: AtomicU16 = AtomicU16::new(DEFAULT_PORT);

struct Service(Mutex<Option<Child>>);

/// Project files the system asked the app to open (a double-click in Finder or Explorer), waiting for the page.
struct Opened(Mutex<Vec<PathBuf>>);

/// A `.fweb` project or a `.fpub` package that exists: the two kinds the page loads through File > Import.
fn is_project(path: &Path) -> bool {
    path.is_file() && path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("fweb") || ext.eq_ignore_ascii_case("fpub"))
}

/// The first project file among command-line arguments; a relative one is read from `base`, the folder the launch came from.
fn project_arg(args: impl IntoIterator<Item = OsString>, base: Option<&Path>) -> Option<PathBuf> {
    args.into_iter().skip(1).map(PathBuf::from).map(|path| match base { Some(base) if path.is_relative() => base.join(path), _ => path }).find(|path| is_project(path))
}

fn queue_file(handle: &tauri::AppHandle, path: PathBuf) {
    if !is_project(&path) { return; }
    handle.state::<Opened>().0.lock().unwrap().push(path);
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.eval("window.dispatchEvent(new Event('formweb-open-file'))");
    }
}

/// A second launch (a file opened from the file manager while the app runs) hands its arguments here and exits.
fn second_launch(handle: &tauri::AppHandle, args: Vec<String>, cwd: String) {
    if let Some(path) = project_arg(args.into_iter().map(OsString::from), Some(Path::new(&cwd))) { queue_file(handle, path); }
    if let Some(window) = handle.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

/// One running window per login, or per data folder when FORMWEB_HOME says where the data lives (the Linux hand-off
/// is keyed by a D-Bus name, so a second data folder gets its own).
fn single_instance() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let plugin = tauri_plugin_single_instance::Builder::<tauri::Wry>::new().callback(second_launch);
    #[cfg(target_os = "linux")]
    let plugin = match std::env::var("FORMWEB_HOME").ok().filter(|home| !home.is_empty()) {
        Some(home) => {
            let hash = home.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x100000001b3));
            plugin.dbus_id(format!("ai.nodemode.formweb.d{hash:016x}"))
        }
        None => plugin,
    };
    plugin.build()
}

/// The bytes of the oldest waiting file, or nothing. The page loads them the way File > Import does.
#[tauri::command]
fn take_opened_file(opened: tauri::State<Opened>) -> tauri::ipc::Response {
    let path = { let mut list = opened.0.lock().unwrap(); if list.is_empty() { None } else { Some(list.remove(0)) } };
    tauri::ipc::Response::new(path.and_then(|path| std::fs::read(path).ok()).unwrap_or_default())
}

/// A link the page opens in a new window goes to the system browser: the web view opens no window of its own.
fn open_outside(url: &str) {
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("rundll32");
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    if let Ok(mut child) = command.arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}

#[cfg(unix)]
static SERVICE_GROUP: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(0);

#[cfg(unix)]
extern "C" {
    fn signal(signum: i32, handler: usize) -> usize;
    fn kill(pid: i32, sig: i32) -> i32;
    fn _exit(code: i32) -> !;
}

/// A terminate, interrupt or hangup signal skips Tauri's exit event, so stop the service's process group here.
#[cfg(unix)]
extern "C" fn on_signal(_: i32) {
    let group = SERVICE_GROUP.load(std::sync::atomic::Ordering::SeqCst);
    unsafe {
        if group > 0 { kill(-group, 15); }
        _exit(0)
    }
}

#[cfg(unix)]
fn watch_signals() {
    for number in [1, 2, 15] {
        unsafe { signal(number, on_signal as *const () as usize); }
    }
}

#[derive(PartialEq)]
enum Probe {
    /// Nothing listens on the port.
    Free,
    /// A FormWeb service of this version answers its health route.
    Ours,
    /// Something else holds the port: another program, another FormWeb version, or a reply that is not FormWeb's.
    Taken,
}

/// Asks the port's health route who answers. Only a reply naming `formweb` and this version counts as ours.
fn probe(port: u16) -> Probe {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(400)) else { return Probe::Free };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    if stream.write_all(format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").as_bytes()).is_err() { return Probe::Taken; }
    let mut reply = Vec::new();
    let _ = (&stream).take(16384).read_to_end(&mut reply);
    let Some(split) = reply.windows(4).position(|window| window == b"\r\n\r\n") else { return Probe::Taken };
    if reply.len() < 12 || &reply[9..12] != b"200" { return Probe::Taken; }
    let Ok(body) = serde_json::from_slice::<serde_json::Value>(&reply[split + 4..]) else { return Probe::Taken };
    if body["app"] == "formweb" && body["version"] == VERSION { Probe::Ours } else { Probe::Taken }
}

/// The port to try first: FORMWEB_PORT when it names a port in FormWeb's range, else 8240.
fn first_port() -> u16 {
    std::env::var("FORMWEB_PORT").ok().and_then(|port| port.trim().parse::<u16>().ok()).filter(|port| (DEFAULT_PORT..=LAST_PORT).contains(port)).unwrap_or(DEFAULT_PORT)
}

/// The first port in FormWeb's range after `taken` (then from the start of the range) that nothing listens on.
fn free_port(taken: u16) -> Option<u16> {
    (taken + 1..=LAST_PORT).chain(DEFAULT_PORT..taken).find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

/// The FormWeb folder: FORMWEB_ROOT, else the nearest ancestor of the working directory that holds the launcher.
fn formweb_root() -> Option<PathBuf> {
    if let Ok(root) = std::env::var("FORMWEB_ROOT") { return Some(PathBuf::from(root)); }
    let launcher = if cfg!(windows) { "formweb.bat" } else { "formweb" };
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(launcher).is_file() && dir.join("backend").is_dir() { return Some(dir); }
        if !dir.pop() { return None; }
    }
}

#[cfg(unix)]
fn start_service(root: &Path, port: u16) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    // Its own process group, so stopping the launcher also stops the Python service it started.
    Command::new(root.join("formweb")).arg("serve").env("FORMWEB_PORT", port.to_string()).current_dir(root).process_group(0).spawn()
}

#[cfg(windows)]
fn start_service(root: &Path, port: u16) -> std::io::Result<Child> {
    let child = Command::new("cmd").args(["/C", "formweb.bat", "serve"]).env("FORMWEB_PORT", port.to_string()).current_dir(root).spawn()?;
    win_job::hold(&child);
    Ok(child)
}

fn sidecar() -> Option<PathBuf> {
    let name = if cfg!(windows) { "formweb-engine.exe" } else { "formweb-engine" };
    let path = std::env::current_exe().ok()?.parent()?.join(name);
    path.is_file().then_some(path)
}

#[cfg(unix)]
fn start_sidecar(path: &Path, port: u16) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    Command::new(path).env("FORMWEB_PORT", port.to_string()).env("FORMWEB_WINDOW_KEY_STDOUT", "1").env(engine_start::SHELL_ENV, std::process::id().to_string()).stdout(Stdio::piped()).stderr(Stdio::piped()).process_group(0).spawn()
}

#[cfg(windows)]
fn start_sidecar(path: &Path, port: u16) -> std::io::Result<Child> {
    use std::os::windows::process::CommandExt;
    let child = Command::new(path).env("FORMWEB_PORT", port.to_string()).env("FORMWEB_WINDOW_KEY_STDOUT", "1").env(engine_start::SHELL_ENV, std::process::id().to_string()).stdout(Stdio::piped()).stderr(Stdio::piped()).creation_flags(0x0800_0000).spawn()?;
    win_job::hold(&child);
    Ok(child)
}

static WINDOW_KEY: Mutex<Option<String>> = Mutex::new(None);
static KEY_EXPECTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn window_key_line(line: &str) -> Option<String> {
    let key = line.trim_end().strip_prefix("formweb-window-key: ")?;
    (key.len() >= 32 && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')).then(|| key.to_string())
}

static TAIL: Mutex<engine_start::Tail> = Mutex::new(engine_start::Tail::new());
static READERS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn forward_lines<R: Read + Send + 'static>(stream: R, keyed: bool) {
    READERS.fetch_add(1, Ordering::SeqCst);
    std::thread::spawn(move || {
        use std::io::BufRead;
        for bytes in std::io::BufReader::new(stream).split(b'\n') {
            let Ok(bytes) = bytes else { break };
            let text = String::from_utf8_lossy(&bytes);
            let line = text.trim_end_matches('\r');
            if let Some(key) = window_key_line(line) {
                if keyed { WINDOW_KEY.lock().unwrap().get_or_insert(key); }
                continue;
            }
            TAIL.lock().unwrap().push(line);
            let _ = if keyed { writeln!(std::io::stdout(), "{line}") } else { writeln!(std::io::stderr(), "{line}") };
        }
        READERS.fetch_sub(1, Ordering::SeqCst);
    });
}

fn capture_window_key(child: &mut Child) {
    if let Some(err) = child.stderr.take() { forward_lines(err, false); }
    let Some(out) = child.stdout.take() else { return };
    KEY_EXPECTED.store(true, Ordering::SeqCst);
    forward_lines(out, true);
}

fn engine_ended(handle: &tauri::AppHandle) -> Option<Option<i32>> {
    let state = handle.state::<Service>();
    let mut slot = state.0.lock().unwrap();
    let status = slot.as_mut()?.try_wait().ok().flatten()?;
    Some(status.code())
}

fn engine_failed(handle: &tauri::AppHandle, failure: engine_start::Failure, packaged: bool) -> ! {
    if matches!(failure, engine_start::Failure::Stopped(_)) {
        let mut waited = Duration::ZERO;
        while READERS.load(Ordering::SeqCst) > 0 && waited < engine_start::EXIT_WAIT {
            std::thread::sleep(engine_start::EXIT_STEP);
            waited += engine_start::EXIT_STEP;
        }
    }
    let text = match (&failure, packaged) {
        (engine_start::Failure::Missing | engine_start::Failure::Window, _) => engine_start::sentence(&failure),
        (_, true) => engine_start::message(&failure, &TAIL.lock().unwrap().lines(), engine_start::engine_log().as_deref()),
        (_, false) => format!("{}\n\nRun ./formweb doctor in the FormWeb folder.", engine_start::sentence(&failure)),
    };
    handle.dialog().message(text).title(engine_start::APP).kind(tauri_plugin_dialog::MessageDialogKind::Error).blocking_show();
    reveal::close_splash(handle);
    stop_service(handle);
    std::process::exit(1)
}

fn stop_service(handle: &tauri::AppHandle) {
    if let Some(mut child) = handle.state::<Service>().0.lock().unwrap().take() {
        #[cfg(unix)]
        {
            let group = child.id() as i32;
            unsafe { kill(-group, 15); }
            let deadline = Instant::now() + Duration::from_secs(5);
            while matches!(child.try_wait(), Ok(None)) && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(100));
            }
            unsafe { kill(-group, 9); }
        }
        #[cfg(windows)]
        if !win_job::end() {
            let _ = Command::new("taskkill").args(["/T", "/F", "/PID", &child.id().to_string()]).status();
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn open_editor(handle: &tauri::AppHandle) {
    let url: tauri::Url = format!("http://127.0.0.1:{}/", ENGINE_PORT.load(Ordering::SeqCst)).parse().expect("loopback url");
    let (width, height) = handle
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            ((size.width as f64 / scale) * SCREEN_FRACTION, (size.height as f64 / scale) * SCREEN_FRACTION)
        })
        .unwrap_or(FALLBACK_LOGICAL);
    let builder = WebviewWindowBuilder::new(handle, "main", WebviewUrl::External(url))
        .title("FormWeb")
        .inner_size(width, height)
        .min_inner_size(MIN_LOGICAL.0, MIN_LOGICAL.1)
        .center()
        .visible(reveal::BUILD_VISIBLE)
        .background_color(reveal::BACKGROUND);
    let origin = format!("http://127.0.0.1:{}", ENGINE_PORT.load(Ordering::SeqCst));
    let builder = match WINDOW_KEY.lock().unwrap().clone() {
        Some(key) => builder.initialization_script(format!("if (window.location.origin === {origin:?}) {{ window.__FORMWEB_WINDOW_KEY = {key:?}; }}")),
        None => builder,
    };
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    // The macOS and Linux web views cancel a download unless a handler is set; with one the file goes to Downloads.
    #[cfg(not(windows))]
    let builder = builder.on_download(|_webview, _event| true);
    let builder = builder.on_new_window(|url, _features| {
        if matches!(url.scheme(), "http" | "https") {
            open_outside(url.as_str());
        }
        tauri::webview::NewWindowResponse::Deny
    });
    let builder = builder.on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            traffic_lights::place(&window.as_ref().window());
        }
    });
    match builder.build() {
        Ok(window) => {
            reveal::conceal(&window);
            traffic_lights::place(&window.as_ref().window());
        }
        Err(_) => {
            let handle = handle.clone();
            std::thread::spawn(move || {
                engine_failed(&handle, engine_start::Failure::Window, true);
            });
        }
    }
}

fn main() {
    reveal::mark_launch();
    #[cfg(unix)]
    watch_signals();
    let app = tauri::Builder::default()
        // First, as the plugin asks: a second launch is detected before the rest of the set-up runs.
        .plugin(single_instance())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Service(Mutex::new(None)))
        .manage(Opened(Mutex::new(project_arg(std::env::args_os(), None).into_iter().collect())))
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::Resized(_)
                        | tauri::WindowEvent::Focused(_)
                        | tauri::WindowEvent::ThemeChanged(_)
                        | tauri::WindowEvent::ScaleFactorChanged { .. }
                )
            {
                traffic_lights::place(window);
            }
        })
        .invoke_handler(tauri::generate_handler![render::render_probe, render::render_thumbnail, render::render_diff, reveal::app_ready, traffic_lights::set_window_title, text_edit::text_edit, take_opened_file])
        .setup(|app| {
            reveal::round_splash(app.handle());
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let first = first_port();
                let mut port = first;
                let mut found = probe(first);
                if found == Probe::Taken {
                    match free_port(first) {
                        Some(other) => { port = other; found = Probe::Free; }
                        None => {
                            handle.dialog().message(format!("Another program is using port {first} and no other port from {DEFAULT_PORT} to {LAST_PORT} is free, so FormWeb cannot start its local service. Quit that program, then open FormWeb again.")).blocking_show();
                            reveal::close_splash(&handle);
                            std::process::exit(1);
                        }
                    }
                }
                ENGINE_PORT.store(port, Ordering::SeqCst);
                if found != Probe::Ours {
                    let program = sidecar();
                    let packaged = program.is_some();
                    let started = match program {
                        Some(path) => start_sidecar(&path, port).map_err(|error| engine_start::Failure::NotStarted(error.to_string())),
                        None => match formweb_root() {
                            Some(root) => start_service(&root, port).map_err(|error| engine_start::Failure::NotStarted(error.to_string())),
                            None => Err(engine_start::Failure::Missing),
                        },
                    };
                    let mut child = match started {
                        Ok(child) => child,
                        Err(failure) => engine_failed(&handle, failure, packaged),
                    };
                    capture_window_key(&mut child);
                    #[cfg(unix)]
                    SERVICE_GROUP.store(child.id() as i32, std::sync::atomic::Ordering::SeqCst);
                    handle.state::<Service>().0.lock().unwrap().replace(child);
                    let waited = engine_start::until(engine_start::Wait::Address, &mut || probe(port) == Probe::Ours, &mut || engine_ended(&handle)).and_then(|()| {
                        if KEY_EXPECTED.load(Ordering::SeqCst) {
                            engine_start::until(engine_start::Wait::Key, &mut || WINDOW_KEY.lock().unwrap().is_some(), &mut || engine_ended(&handle))
                        } else {
                            Ok(())
                        }
                    });
                    if let Err(failure) = waited {
                        engine_failed(&handle, failure, packaged);
                    }
                }
                let main_thread = handle.clone();
                let _ = handle.run_on_main_thread(move || open_editor(&main_thread));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri app should build");

    app.run(|handle, event| {
        match event {
            // The last window closing ends the app; the service the shell started goes with it.
            RunEvent::WindowEvent { event: tauri::WindowEvent::Destroyed, .. } if handle.webview_windows().is_empty() => handle.exit(0),
            RunEvent::Exit => stop_service(handle),
            #[cfg(target_os = "macos")]
            RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path() { queue_file(handle, path); }
                }
            }
            _ => {}
        }
    });
}
