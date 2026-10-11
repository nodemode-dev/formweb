//! Phase 9 exit check: render a thumbnail headlessly on whatever adapter this machine has and say which one.
//! cargo run --release --example thumbnail -- [OUT_DIR]
//! Draws a 1280 x 2400 test page (header band, three cards, footer) in memory, thumbnails it on the GPU and on the CPU,
//! compares the two, makes a minimap with a viewport outline, and diffs the page against a changed copy.

use formweb_render::{cpu_thumbnail, diff, fit, image, thumbnail, Gpu, Rgba, Viewport};
use std::path::PathBuf;

fn page(accent: [u8; 3]) -> Rgba {
    let (w, h) = (1280u32, 2400u32);
    let mut px = vec![0u8; (w * h * 4) as usize];
    for y in 0..h {
        for x in 0..w {
            let mut c = [244u8, 243, 237];
            if y < 120 { c = [17, 17, 17]; }
            if (200..520).contains(&y) && (120..1160).contains(&x) { c = accent; }
            for i in 0..3 { let x0 = 120 + i * 360; if (640..1040).contains(&y) && (x0..x0 + 320).contains(&x) { c = [223, 227, 212]; } }
            if y > 2240 { c = [34, 40, 32]; }
            let o = ((y * w + x) * 4) as usize;
            px[o..o + 4].copy_from_slice(&[c[0], c[1], c[2], 255]);
        }
    }
    Rgba::new(w, h, px).unwrap()
}

fn main() {
    let out = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| ".".into()));
    std::fs::create_dir_all(&out).unwrap();
    let gpu = Gpu::new();
    match &gpu {
        Some(g) => { let r = g.report(); println!("adapter: {} ({} backend, {}, max texture {} px)", r.name, r.backend, r.device_type, r.max_texture_side); }
        None => println!("adapter: none found; every operation uses the CPU path"),
    }
    let src = page([249, 115, 22]);
    let (thumb, path) = thumbnail(gpu.as_ref(), &src, 320, None);
    image::write_png(&out.join("thumbnail.png"), &thumb).unwrap();
    println!("thumbnail: {} x {} via {}", thumb.width, thumb.height, path.describe());
    let (w, h) = fit(src.width, src.height, 320);
    let reference = cpu_thumbnail(&src, w, h, None);
    let mismatched = thumb.pixels.chunks_exact(4).zip(reference.pixels.chunks_exact(4)).filter(|(a, b)| a.iter().zip(b.iter()).any(|(x, y)| x.abs_diff(*y) > 1)).count();
    println!("gpu vs cpu reference: {mismatched} of {} pixels differ by more than 1 level", w * h);
    let (minimap, path) = thumbnail(gpu.as_ref(), &src, 160, Some(Viewport { x: 0, y: 600, width: 1280, height: 800 }));
    image::write_png(&out.join("minimap.png"), &minimap).unwrap();
    println!("minimap: {} x {} via {}", minimap.width, minimap.height, path.describe());
    let changed = page([29, 53, 87]);
    let result = diff(gpu.as_ref(), &src, &changed, 16).unwrap();
    image::write_png(&out.join("diff.png"), &result.heatmap).unwrap();
    println!("diff: {} of {} pixels changed ({:.2}%) via {}", result.changed, result.total, result.changed_fraction() * 100.0, result.path.describe());
}
