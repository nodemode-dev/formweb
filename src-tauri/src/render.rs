//! The GPU renderer as Tauri commands. The adapter is created once and kept; every command reports which path ran
//! (GPU adapter name or the CPU reason), so the editor can show it.
//!
//! From the page: `window.__TAURI__.core.invoke('render_thumbnail', { input, output, maxSide })`.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use formweb_render::{budget, diff, image, thumbnail, Gpu, Viewport};
use serde::Serialize;

static GPU: OnceLock<Option<Gpu>> = OnceLock::new();

fn gpu() -> Option<&'static Gpu> { GPU.get_or_init(Gpu::new).as_ref() }

/// Only absolute .png paths: the page names files the service or the person chose, never relative guesses.
fn png_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() || path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")) != Some(true) {
        return Err(format!("{raw}: use an absolute path to a .png file"));
    }
    Ok(path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe { adapter: Option<String>, backend: Option<String>, device_type: Option<String>, max_texture_side: Option<u32>, max_pixels: u64 }

#[tauri::command]
pub fn render_probe() -> Probe {
    let b = budget::system_budget();
    match gpu() {
        Some(g) => { let r = g.report(); Probe { adapter: Some(r.name), backend: Some(r.backend), device_type: Some(r.device_type), max_texture_side: Some(r.max_texture_side), max_pixels: b.max_pixels } }
        None => Probe { adapter: None, backend: None, device_type: None, max_texture_side: None, max_pixels: b.max_pixels },
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rendered { output: String, width: u32, height: u32, path: String, changed_fraction: Option<f64> }

#[tauri::command]
pub async fn render_thumbnail(input: String, output: String, max_side: Option<u32>, viewport: Option<[u32; 4]>) -> Result<Rendered, String> {
    let (src_path, out_path) = (png_path(&input)?, png_path(&output)?);
    tauri::async_runtime::spawn_blocking(move || {
        let src = image::read_png(Path::new(&src_path))?;
        let viewport = viewport.map(|v| Viewport { x: v[0], y: v[1], width: v[2], height: v[3] });
        let (out, path) = thumbnail(gpu(), &src, max_side.unwrap_or(320), viewport);
        image::write_png(&out_path, &out)?;
        Ok(Rendered { output: out_path.display().to_string(), width: out.width, height: out.height, path: path.describe(), changed_fraction: None })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn render_diff(before: String, after: String, output: String, threshold: Option<u32>) -> Result<Rendered, String> {
    let (a_path, b_path, out_path) = (png_path(&before)?, png_path(&after)?, png_path(&output)?);
    tauri::async_runtime::spawn_blocking(move || {
        let (a, b) = (image::read_png(&a_path)?, image::read_png(&b_path)?);
        let result = diff(gpu(), &a, &b, threshold.unwrap_or(formweb_render::DEFAULT_THRESHOLD).min(255))?;
        image::write_png(&out_path, &result.heatmap)?;
        Ok(Rendered { output: out_path.display().to_string(), width: a.width, height: a.height, path: result.path.describe(), changed_fraction: Some(result.changed_fraction()) })
    }).await.map_err(|e| e.to_string())?
}
