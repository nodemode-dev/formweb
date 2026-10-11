//! formweb-render CLI, used by `./formweb render` and the desktop shell. Every command prints one JSON line.
//!
//!   formweb-render probe
//!   formweb-render thumb IN.png OUT.png [--max 320] [--viewport x,y,w,h] [--cpu]
//!   formweb-render diff A.png B.png OUT.png [--threshold 16] [--cpu]

use formweb_render::{budget, diff, image, thumbnail, Gpu, Viewport, DEFAULT_THRESHOLD};
use std::path::Path;
use std::process::ExitCode;

fn quote(text: &str) -> String {
    let mut out = String::from("\"");
    for ch in text.chars() {
        match ch { '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), '\n' => out.push_str("\\n"), c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)), c => out.push(c) }
    }
    out.push('"');
    out
}

fn option(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn gpu_for(args: &[String]) -> Option<Gpu> { if args.iter().any(|a| a == "--cpu") { None } else { Gpu::new() } }

fn run(args: Vec<String>) -> Result<String, String> {
    let command = args.first().map(String::as_str).unwrap_or("help");
    match command {
        "probe" => {
            let b = budget::system_budget();
            Ok(match Gpu::new() {
                Some(g) => { let r = g.report(); format!("{{\"adapter\":{},\"backend\":{},\"deviceType\":{},\"driver\":{},\"maxTextureSide\":{},\"ramBytes\":{},\"maxPixels\":{}}}", quote(&r.name), quote(&r.backend), quote(&r.device_type), quote(&r.driver), r.max_texture_side, b.ram, b.max_pixels) }
                None => format!("{{\"adapter\":null,\"fallback\":\"cpu\",\"ramBytes\":{},\"maxPixels\":{}}}", b.ram, b.max_pixels),
            })
        }
        "thumb" => {
            let (input, output) = (args.get(1).ok_or("thumb needs IN.png OUT.png")?, args.get(2).ok_or("thumb needs IN.png OUT.png")?);
            let max = option(&args, "--max").map(|v| v.parse::<u32>().map_err(|_| "--max must be a number")).transpose()?.unwrap_or(320);
            let viewport = option(&args, "--viewport").map(|v| {
                let n: Vec<u32> = v.split(',').filter_map(|p| p.trim().parse().ok()).collect();
                if n.len() == 4 { Ok(Viewport { x: n[0], y: n[1], width: n[2], height: n[3] }) } else { Err("--viewport is x,y,width,height in source pixels".to_string()) }
            }).transpose()?;
            let src = image::read_png(Path::new(input))?;
            let gpu = gpu_for(&args);
            let (out, path) = thumbnail(gpu.as_ref(), &src, max, viewport);
            image::write_png(Path::new(output), &out)?;
            Ok(format!("{{\"output\":{},\"width\":{},\"height\":{},\"source\":[{},{}],\"path\":{}}}", quote(output), out.width, out.height, src.width, src.height, quote(&path.describe())))
        }
        "diff" => {
            let (a, b, output) = (args.get(1).ok_or("diff needs A.png B.png OUT.png")?, args.get(2).ok_or("diff needs A.png B.png OUT.png")?, args.get(3).ok_or("diff needs A.png B.png OUT.png")?);
            let threshold = option(&args, "--threshold").map(|v| v.parse::<u32>().map_err(|_| "--threshold must be 0 to 255")).transpose()?.unwrap_or(DEFAULT_THRESHOLD).min(255);
            let (ia, ib) = (image::read_png(Path::new(a))?, image::read_png(Path::new(b))?);
            let gpu = gpu_for(&args);
            let result = diff(gpu.as_ref(), &ia, &ib, threshold)?;
            image::write_png(Path::new(output), &result.heatmap)?;
            Ok(format!("{{\"output\":{},\"changed\":{},\"total\":{},\"changedFraction\":{:.6},\"threshold\":{},\"path\":{}}}", quote(output), result.changed, result.total, result.changed_fraction(), threshold, quote(&result.path.describe())))
        }
        _ => Err("usage: formweb-render probe | thumb IN.png OUT.png [--max N] [--viewport x,y,w,h] [--cpu] | diff A.png B.png OUT.png [--threshold N] [--cpu]".into()),
    }
}

fn main() -> ExitCode {
    match run(std::env::args().skip(1).collect()) {
        Ok(line) => { println!("{line}"); ExitCode::SUCCESS }
        Err(error) => { println!("{{\"error\":{}}}", quote(&error)); ExitCode::FAILURE }
    }
}
