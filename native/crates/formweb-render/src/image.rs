//! PNG in and out, as straight RGBA8. Captures from browsers and the desktop web view are PNG.

use crate::Rgba;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub fn read_png(path: &Path) -> Result<Rgba, String> {
    let file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut decoder = png::Decoder::new(std::io::BufReader::new(file));
    decoder.set_transformations(png::Transformations::normalize_to_color8() | png::Transformations::ALPHA);
    let mut reader = decoder.read_info().map_err(|e| format!("{}: {e}", path.display()))?;
    let mut buffer = vec![0; reader.output_buffer_size().ok_or("image too large to decode")?];
    let frame = reader.next_frame(&mut buffer).map_err(|e| format!("{}: {e}", path.display()))?;
    let (w, h) = (frame.width, frame.height);
    let data = &buffer[..frame.buffer_size()];
    let pixels = match frame.color_type {
        png::ColorType::Rgba => data.to_vec(),
        png::ColorType::GrayscaleAlpha => data.chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        other => return Err(format!("{}: unsupported PNG colour type {other:?}", path.display())),
    };
    Rgba::new(w, h, pixels)
}

pub fn write_png(path: &Path, image: &Rgba) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), image.width, image.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&image.pixels).map_err(|e| e.to_string())
}
