#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! FormWeb desktop shell, on the formvis and formlit pattern: a native window around the editor that the local FormWeb
//! service serves on 127.0.0.1:8240, plus the family GPU renderer exposed to the page through `invoke`.
//!
//! Start-up: if a FormWeb service already answers /api/health, the window opens on it. Otherwise the shell starts the
//! bundled formweb-engine sidecar beside its executable (built by ./build_app), or, in a source checkout, runs
//! `formweb serve` (formweb.bat on Windows) from the FormWeb folder (FORMWEB_ROOT, or the folder above the executable's
//! working directory that holds the launcher), waits up to 60 seconds for health, and stops that service on exit.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

mod render;
mod reveal;
mod text_edit;
mod traffic_lights;

const PORT: u16 = 8240;
const FALLBACK_LOGICAL: (f64, f64) = (1440.0, 900.0);
const MIN_LOGICAL: (f64, f64) = (1024.0, 680.0);
const SCREEN_FRACTION: f64 = 0.9;

struct Service(Mutex<Option<Child>>);

/// Project files the system asked the app to open (a double-click in Finder or Explorer), waiting for the page.
struct Opened(Mutex<Vec<PathBuf>>);

#[cfg(target_os = "macos")]
fn queue_file(handle: &tauri::AppHandle, path: PathBuf) {
    if !path.is_file() { return; }
    handle.state::<Opened>().0.lock().unwrap().push(path);
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.eval("window.dispatchEvent(new Event('formweb-open-file'))");
    }
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

/// True when the FormWeb service answers its health route.
fn healthy() -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_millis(400)) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    if stream.write_all(format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{PORT}\r\nConnection: close\r\n\r\n").as_bytes()).is_err() { return false; }
    let mut head = [0u8; 16];
    matches!(stream.read(&mut head), Ok(n) if n >= 12 && &head[9..12] == b"200")
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
fn start_service(root: &Path) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    // Its own process group, so stopping the launcher also stops the Python service it started.
    Command::new(root.join("formweb")).arg("serve").current_dir(root).process_group(0).spawn()
}

#[cfg(windows)]
fn start_service(root: &Path) -> std::io::Result<Child> {
    Command::new("cmd").args(["/C", "formweb.bat", "serve"]).current_dir(root).spawn()
}

fn sidecar() -> Option<PathBuf> {
    let name = if cfg!(windows) { "formweb-engine.exe" } else { "formweb-engine" };
    let path = std::env::current_exe().ok()?.parent()?.join(name);
    path.is_file().then_some(path)
}

#[cfg(unix)]
fn start_sidecar(path: &Path) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    Command::new(path).process_group(0).spawn()
}

#[cfg(windows)]
fn start_sidecar(path: &Path) -> std::io::Result<Child> {
    use std::os::windows::process::CommandExt;
    Command::new(path).creation_flags(0x0800_0000).spawn()
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
        let _ = Command::new("taskkill").args(["/T", "/F", "/PID", &child.id().to_string()]).status();
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn open_editor(handle: &tauri::AppHandle) {
    let url: tauri::Url = format!("http://127.0.0.1:{PORT}/").parse().expect("loopback url");
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
        Err(_) => reveal::close_splash(handle),
    }
}

fn main() {
    reveal::mark_launch();
    #[cfg(unix)]
    watch_signals();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Service(Mutex::new(None)))
        .manage(Opened(Mutex::new(std::env::args_os().skip(1).map(PathBuf::from).filter(|path| path.is_file()).take(1).collect())))
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
                if !healthy() {
                    let started = match sidecar() {
                        Some(path) => Some(start_sidecar(&path)),
                        None => formweb_root().map(|root| start_service(&root)),
                    };
                    match started {
                        Some(Ok(child)) => {
                            #[cfg(unix)]
                            SERVICE_GROUP.store(child.id() as i32, std::sync::atomic::Ordering::SeqCst);
                            handle.state::<Service>().0.lock().unwrap().replace(child); }
                        Some(Err(error)) => {
                            reveal::close_splash(&handle);
                            handle.dialog().message(format!("FormWeb could not start its local service: {error}")).blocking_show();
                            std::process::exit(1);
                        }
                        None => {
                            reveal::close_splash(&handle);
                            handle.dialog().message("FormWeb could not find its folder. Start it with ./formweb serve, or set FORMWEB_ROOT, then open the app again.").blocking_show();
                            std::process::exit(1);
                        }
                    }
                    let deadline = Instant::now() + Duration::from_secs(60);
                    while !healthy() {
                        if Instant::now() > deadline {
                            stop_service(&handle);
                            reveal::close_splash(&handle);
                            handle.dialog().message("The FormWeb service did not answer within 60 seconds. Run ./formweb doctor in the FormWeb folder.").blocking_show();
                            std::process::exit(1);
                        }
                        std::thread::sleep(Duration::from_millis(250));
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
