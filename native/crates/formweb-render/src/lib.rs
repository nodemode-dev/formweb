//! formweb-render: the form family's wgpu renderer pattern (formvis-render) applied to what a website builder needs from
//! a GPU. Pages themselves are drawn by the browser engine, so this crate works on captured page bitmaps:
//!
//! - `thumbnail`: an area-averaged downscale for page, component and release thumbnails, optionally with a viewport
//!   rectangle drawn on top, which is the canvas overview minimap.
//! - `diff`: a per-pixel comparison of two release captures, returning a heatmap and the share of pixels that changed,
//!   for the Releases panel.
//!
//! Every operation runs on the best wgpu adapter (Vulkan, Metal, Direct3D 12, or GL) and falls back to an identical CPU
//! path when there is no adapter, when the image exceeds the adapter's texture limit, or when the memory budget says no.
//! Results report which path ran, so callers never guess.

pub mod budget;
pub mod image;
mod gpu;

pub use gpu::{AdapterReport, Gpu};

/// Straight (not premultiplied) RGBA8 pixels, row-major, no padding.
#[derive(Clone, Debug, PartialEq)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl Rgba {
    pub fn new(width: u32, height: u32, pixels: Vec<u8>) -> Result<Rgba, String> {
        if width == 0 || height == 0 || pixels.len() != (width as usize) * (height as usize) * 4 {
            return Err(format!("image must be {width} x {height} RGBA8 ({} bytes), got {} bytes", width as usize * height as usize * 4, pixels.len()));
        }
        Ok(Rgba { width, height, pixels })
    }
    pub fn pixel_count(&self) -> u64 { self.width as u64 * self.height as u64 }
}

/// Where an operation ran.
#[derive(Clone, Debug, PartialEq)]
pub enum Path {
    Gpu(String),
    Cpu(String),
}

impl Path {
    pub fn describe(&self) -> String {
        match self { Path::Gpu(name) => format!("gpu: {name}"), Path::Cpu(reason) => format!("cpu: {reason}") }
    }
}

/// A viewport rectangle in source pixels, outlined on a thumbnail to make it a minimap.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Viewport { pub x: u32, pub y: u32, pub width: u32, pub height: u32 }

/// Thumbnail size that fits `max_side` while preserving the aspect ratio exactly as integers allow; never upscales.
pub fn fit(width: u32, height: u32, max_side: u32) -> (u32, u32) {
    let max_side = max_side.max(1);
    if width <= max_side && height <= max_side { return (width, height); }
    if width >= height {
        (max_side, ((height as u64 * max_side as u64 + width as u64 / 2) / width as u64).max(1) as u32)
    } else {
        (((width as u64 * max_side as u64 + height as u64 / 2) / height as u64).max(1) as u32, max_side)
    }
}

/// Changed-pixel threshold: the largest per-channel difference (0 to 255) that still counts as unchanged.
pub const DEFAULT_THRESHOLD: u32 = 16;
/// Heatmap colour for a changed pixel; unchanged pixels become a dimmed grey copy of the first image.
pub const CHANGED: [u8; 4] = [255, 64, 32, 255];
/// Viewport outline colour (the family accent, #f97316).
pub const OUTLINE: [u8; 4] = [249, 115, 22, 255];

pub struct DiffResult { pub heatmap: Rgba, pub changed: u64, pub total: u64, pub path: Path }
impl DiffResult { pub fn changed_fraction(&self) -> f64 { self.changed as f64 / self.total.max(1) as f64 } }

/// Downscale `src` to fit `max_side`, on the GPU when possible.
pub fn thumbnail(gpu: Option<&Gpu>, src: &Rgba, max_side: u32, viewport: Option<Viewport>) -> (Rgba, Path) {
    let (w, h) = fit(src.width, src.height, max_side);
    match gpu_eligible(gpu, &[src]) {
        Ok(g) => match g.thumbnail(src, w, h, viewport) {
            Ok(out) => (out, Path::Gpu(g.report().name)),
            Err(error) => (cpu_thumbnail(src, w, h, viewport), Path::Cpu(format!("gpu error: {error}"))),
        },
        Err(reason) => (cpu_thumbnail(src, w, h, viewport), Path::Cpu(reason)),
    }
}

/// Compare two captures of the same size, on the GPU when possible.
pub fn diff(gpu: Option<&Gpu>, a: &Rgba, b: &Rgba, threshold: u32) -> Result<DiffResult, String> {
    if a.width != b.width || a.height != b.height {
        return Err(format!("images differ in size: {} x {} and {} x {}; capture both at the same viewport", a.width, a.height, b.width, b.height));
    }
    let (heatmap, path) = match gpu_eligible(gpu, &[a, b]) {
        Ok(g) => match g.diff(a, b, threshold) {
            Ok(out) => (out, Path::Gpu(g.report().name)),
            Err(error) => (cpu_diff(a, b, threshold), Path::Cpu(format!("gpu error: {error}"))),
        },
        Err(reason) => (cpu_diff(a, b, threshold), Path::Cpu(reason)),
    };
    let changed = heatmap.pixels.chunks_exact(4).filter(|p| p == &CHANGED).count() as u64;
    Ok(DiffResult { heatmap, changed, total: a.pixel_count(), path })
}

fn gpu_eligible<'a>(gpu: Option<&'a Gpu>, images: &[&Rgba]) -> Result<&'a Gpu, String> {
    let gpu = gpu.ok_or_else(|| "no wgpu adapter on this machine".to_string())?;
    let limit = gpu.max_texture_side();
    if let Some(big) = images.iter().find(|i| i.width > limit || i.height > limit) {
        return Err(format!("{} x {} exceeds the adapter's {limit} px texture limit", big.width, big.height));
    }
    let pixels: u64 = images.iter().map(|i| i.pixel_count()).sum();
    let budget = budget::system_budget();
    if pixels > budget.max_pixels {
        return Err(format!("{pixels} pixels exceed the memory budget of {}", budget.max_pixels));
    }
    Ok(gpu)
}

/// Area average of the source pixels each target pixel covers (the reference the GPU shader matches).
pub fn cpu_thumbnail(src: &Rgba, w: u32, h: u32, viewport: Option<Viewport>) -> Rgba {
    let mut out = vec![0u8; (w * h * 4) as usize];
    for ty in 0..h {
        let y0 = (ty as u64 * src.height as u64 / h as u64) as u32;
        let y1 = (((ty + 1) as u64 * src.height as u64 / h as u64) as u32).max(y0 + 1);
        for tx in 0..w {
            let x0 = (tx as u64 * src.width as u64 / w as u64) as u32;
            let x1 = (((tx + 1) as u64 * src.width as u64 / w as u64) as u32).max(x0 + 1);
            let (sy, sx) = (step(y1 - y0), step(x1 - x0));
            let mut sum = [0u64; 4];
            let mut n = 0u64;
            let mut y = y0;
            while y < y1 {
                let mut x = x0;
                while x < x1 {
                    let i = ((y * src.width + x) * 4) as usize;
                    for c in 0..4 { sum[c] += src.pixels[i + c] as u64; }
                    n += 1;
                    x += sx;
                }
                y += sy;
            }
            let o = ((ty * w + tx) * 4) as usize;
            for c in 0..4 { out[o + c] = ((sum[c] + n / 2) / n) as u8; }
        }
    }
    if let Some(v) = viewport { outline(&mut out, w, h, src.width, src.height, v); }
    Rgba { width: w, height: h, pixels: out }
}

/// Sampling stride inside one footprint: at most 32 samples per axis, as the shader does, so huge downscales stay fast.
fn step(span: u32) -> u32 { ((span + 31) / 32).max(1) }

fn outline(out: &mut [u8], w: u32, h: u32, sw: u32, sh: u32, v: Viewport) {
    let x0 = (v.x as u64 * w as u64 / sw as u64) as u32;
    let y0 = (v.y as u64 * h as u64 / sh as u64) as u32;
    let x1 = (((v.x + v.width) as u64 * w as u64 / sw as u64) as u32).min(w.saturating_sub(1));
    let y1 = (((v.y + v.height) as u64 * h as u64 / sh as u64) as u32).min(h.saturating_sub(1));
    for y in y0..=y1 {
        for x in x0..=x1 {
            if x == x0 || x == x1 || y == y0 || y == y1 {
                let i = ((y * w + x) * 4) as usize;
                out[i..i + 4].copy_from_slice(&OUTLINE);
            }
        }
    }
}

pub fn cpu_diff(a: &Rgba, b: &Rgba, threshold: u32) -> Rgba {
    let mut out = vec![0u8; a.pixels.len()];
    for ((pa, pb), po) in a.pixels.chunks_exact(4).zip(b.pixels.chunks_exact(4)).zip(out.chunks_exact_mut(4)) {
        let delta = (0..4).map(|c| (pa[c] as i32 - pb[c] as i32).unsigned_abs()).max().unwrap_or(0);
        if delta > threshold { po.copy_from_slice(&CHANGED); }
        else {
            let grey = ((pa[0] as u32 * 54 + pa[1] as u32 * 183 + pa[2] as u32 * 19) >> 8) as u8;
            let dim = (grey as u32 * 35 / 100 + 20) as u8;
            po.copy_from_slice(&[dim, dim, dim, 255]);
        }
    }
    Rgba { width: a.width, height: a.height, pixels: out }
}
