//! The wgpu device and the two pipelines. Both draw one full-screen triangle into an RGBA8 target and read source pixels
//! with textureLoad, so results do not depend on sampler filtering and match the CPU reference in lib.rs.

use crate::{Rgba, Viewport, CHANGED, OUTLINE};

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// What the adapter is, for logs, `formweb-render probe` and the Releases panel.
#[derive(Clone, Debug)]
pub struct AdapterReport {
    pub name: String,
    pub backend: String,
    pub device_type: String,
    pub driver: String,
    pub max_texture_side: u32,
}

pub struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    info: wgpu::AdapterInfo,
    max_side: u32,
    thumb: wgpu::RenderPipeline,
    diff: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ThumbUniform { src: [u32; 2], dst: [u32; 2], viewport: [u32; 4], has_viewport: u32, _pad: [u32; 3], outline: [f32; 4] }

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct DiffUniform { threshold: u32, _pad: [u32; 3], changed: [f32; 4] }

const SHADER: &str = r#"
struct Thumb { src: vec2<u32>, dst: vec2<u32>, viewport: vec4<u32>, has_viewport: u32, p0: u32, p1: u32, p2: u32, outline: vec4<f32> };
struct Diff { threshold: u32, p0: u32, p1: u32, p2: u32, changed: vec4<f32> };
@group(0) @binding(0) var a_tex: texture_2d<f32>;
@group(0) @binding(1) var b_tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> thumb: Thumb;
@group(0) @binding(3) var<uniform> cmp: Diff;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}

fn bytes(c: vec4<f32>) -> vec4<u32> { return vec4<u32>(round(clamp(c, vec4(0.0), vec4(1.0)) * 255.0)); }
fn step_of(span: u32) -> u32 { return max((span + 31u) / 32u, 1u); }

@fragment fn fs_thumb(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let t = vec2<u32>(pos.xy);
  if (thumb.has_viewport == 1u) {
    let v = thumb.viewport;
    let inside = t.x >= v.x && t.x <= v.z && t.y >= v.y && t.y <= v.w;
    let edge = t.x == v.x || t.x == v.z || t.y == v.y || t.y == v.w;
    if (inside && edge) { return thumb.outline; }
  }
  let x0 = t.x * thumb.src.x / thumb.dst.x;
  let x1 = max((t.x + 1u) * thumb.src.x / thumb.dst.x, x0 + 1u);
  let y0 = t.y * thumb.src.y / thumb.dst.y;
  let y1 = max((t.y + 1u) * thumb.src.y / thumb.dst.y, y0 + 1u);
  let sx = step_of(x1 - x0);
  let sy = step_of(y1 - y0);
  var sum = vec4<u32>(0u);
  var n = 0u;
  for (var y = y0; y < y1; y = y + sy) {
    for (var x = x0; x < x1; x = x + sx) {
      sum = sum + bytes(textureLoad(a_tex, vec2<u32>(x, y), 0));
      n = n + 1u;
    }
  }
  let avg = (sum + vec4<u32>(n / 2u)) / vec4<u32>(n);
  return vec4<f32>(avg) / 255.0;
}

@fragment fn fs_diff(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<u32>(pos.xy);
  let a = bytes(textureLoad(a_tex, p, 0));
  let b = bytes(textureLoad(b_tex, p, 0));
  let d = max(a, b) - min(a, b);
  let delta = max(max(d.x, d.y), max(d.z, d.w));
  if (delta > cmp.threshold) { return cmp.changed; }
  let grey = (a.x * 54u + a.y * 183u + a.z * 19u) >> 8u;
  let dim = grey * 35u / 100u + 20u;
  return vec4<f32>(f32(dim) / 255.0, f32(dim) / 255.0, f32(dim) / 255.0, 1.0);
}
"#;

fn colour(c: [u8; 4]) -> [f32; 4] { [c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0, c[3] as f32 / 255.0] }

impl Gpu {
    /// The best adapter without a window (high performance first, then any, including software adapters). None when
    /// the machine offers no usable backend, which callers treat as the CPU path.
    pub fn new() -> Option<Gpu> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let adapter = [false, true].into_iter().find_map(|fallback| {
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: fallback,
                compatible_surface: None,
                apply_limit_buckets: false,
            })).ok()
        })?;
        let info = adapter.get_info();
        let limits = adapter.limits();
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor { label: Some("formweb-render"), required_limits: limits.clone(), ..Default::default() })).ok()?;
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("formweb-render"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
        let texture_entry = |binding| wgpu::BindGroupLayoutEntry { binding, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: false }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None };
        let uniform_entry = |binding| wgpu::BindGroupLayoutEntry { binding, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None };
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("formweb-render"), entries: &[texture_entry(0), texture_entry(1), uniform_entry(2), uniform_entry(3)] });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("formweb-render"), bind_group_layouts: &[Some(&layout)], ..Default::default() });
        let pipeline = |entry: &str| device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some(entry),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), buffers: &[], compilation_options: Default::default() },
            fragment: Some(wgpu::FragmentState { module: &module, entry_point: Some(entry), targets: &[Some(wgpu::ColorTargetState { format: FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })], compilation_options: Default::default() }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let thumb = pipeline("fs_thumb");
        let diff = pipeline("fs_diff");
        Some(Gpu { device, queue, info, max_side: limits.max_texture_dimension_2d, thumb, diff, layout })
    }

    pub fn report(&self) -> AdapterReport {
        AdapterReport { name: self.info.name.clone(), backend: format!("{:?}", self.info.backend), device_type: format!("{:?}", self.info.device_type), driver: format!("{} {}", self.info.driver, self.info.driver_info).trim().to_string(), max_texture_side: self.max_side }
    }

    pub fn max_texture_side(&self) -> u32 { self.max_side }

    fn upload(&self, image: &Rgba) -> wgpu::Texture {
        let size = wgpu::Extent3d { width: image.width, height: image.height, depth_or_array_layers: 1 };
        let texture = self.device.create_texture(&wgpu::TextureDescriptor { label: Some("source"), size, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: FORMAT, usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST, view_formats: &[] });
        self.queue.write_texture(texture.as_image_copy(), &image.pixels, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(image.width * 4), rows_per_image: Some(image.height) }, size);
        texture
    }

    fn uniform(&self, bytes: &[u8]) -> wgpu::Buffer {
        use wgpu::util::DeviceExt;
        self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("uniform"), contents: bytes, usage: wgpu::BufferUsages::UNIFORM })
    }

    fn run(&self, pipeline: &wgpu::RenderPipeline, a: &wgpu::Texture, b: &wgpu::Texture, thumb: ThumbUniform, cmp: DiffUniform, w: u32, h: u32) -> Result<Rgba, String> {
        let target = self.device.create_texture(&wgpu::TextureDescriptor { label: Some("target"), size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: FORMAT, usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC, view_formats: &[] });
        let (ua, ub) = (self.uniform(bytemuck::bytes_of(&thumb)), self.uniform(bytemuck::bytes_of(&cmp)));
        let (va, vb) = (a.create_view(&Default::default()), b.create_view(&Default::default()));
        let bind = self.device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("formweb-render"), layout: &self.layout, entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&va) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&vb) },
            wgpu::BindGroupEntry { binding: 2, resource: ua.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 3, resource: ub.as_entire_binding() },
        ] });
        let view = target.create_view(&Default::default());
        let mut encoder = self.device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("formweb-render"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store } })],
                ..Default::default()
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind, &[]);
            pass.draw(0..3, 0..1);
        }
        // Readback rows must be 256-byte aligned; strip the padding afterwards.
        let row = w * 4;
        let padded = row.div_ceil(256) * 256;
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor { label: Some("readback"), size: (padded * h) as u64, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
        encoder.copy_texture_to_buffer(target.as_image_copy(), wgpu::TexelCopyBufferInfo { buffer: &buffer, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(padded), rows_per_image: Some(h) } }, wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 });
        self.queue.submit([encoder.finish()]);
        let slice = buffer.slice(..);
        slice.map_async(wgpu::MapMode::Read, |_| {});
        self.device.poll(wgpu::PollType::wait_indefinitely()).map_err(|e| format!("{e:?}"))?;
        let data = slice.get_mapped_range().map_err(|e| format!("{e:?}"))?;
        let mut pixels = Vec::with_capacity((row * h) as usize);
        for y in 0..h as usize { pixels.extend_from_slice(&data[y * padded as usize..y * padded as usize + row as usize]); }
        drop(data);
        buffer.unmap();
        Rgba::new(w, h, pixels)
    }

    pub fn thumbnail(&self, src: &Rgba, w: u32, h: u32, viewport: Option<Viewport>) -> Result<Rgba, String> {
        let texture = self.upload(src);
        let mut uniform = ThumbUniform { src: [src.width, src.height], dst: [w, h], viewport: [0; 4], has_viewport: 0, _pad: [0; 3], outline: colour(OUTLINE) };
        if let Some(v) = viewport {
            // Same integer mapping as the CPU outline.
            let x0 = (v.x as u64 * w as u64 / src.width as u64) as u32;
            let y0 = (v.y as u64 * h as u64 / src.height as u64) as u32;
            let x1 = (((v.x + v.width) as u64 * w as u64 / src.width as u64) as u32).min(w.saturating_sub(1));
            let y1 = (((v.y + v.height) as u64 * h as u64 / src.height as u64) as u32).min(h.saturating_sub(1));
            uniform.viewport = [x0, y0, x1, y1];
            uniform.has_viewport = 1;
        }
        let cmp = DiffUniform { threshold: 0, _pad: [0; 3], changed: colour(CHANGED) };
        self.run(&self.thumb, &texture, &texture, uniform, cmp, w, h)
    }

    pub fn diff(&self, a: &Rgba, b: &Rgba, threshold: u32) -> Result<Rgba, String> {
        let (ta, tb) = (self.upload(a), self.upload(b));
        let thumb = ThumbUniform { src: [a.width, a.height], dst: [a.width, a.height], viewport: [0; 4], has_viewport: 0, _pad: [0; 3], outline: colour(OUTLINE) };
        let cmp = DiffUniform { threshold, _pad: [0; 3], changed: colour(CHANGED) };
        self.run(&self.diff, &ta, &tb, thumb, cmp, a.width, a.height)
    }
}
