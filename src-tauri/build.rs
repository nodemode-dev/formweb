// The window shows the page the engine serves on 127.0.0.1, which Tauri treats as a remote origin: commands reach it
// only through a capability with a remote URL list, and an app command needs a generated "allow-<name>" permission.
const APP_COMMANDS: &[&str] = &[
    "render_probe",
    "render_thumbnail",
    "render_diff",
    "app_ready",
    "set_window_title",
    "text_edit",
    "take_opened_file",
    "reveal_download",
    "set_export_place",
    "choose_export_folder",
    "ask_export_place",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)))
        .expect("failed to run the Tauri build step");
}
