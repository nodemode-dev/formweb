//! How many pixels the renderer may hold at once, measured from the machine instead of a fixed cap. Same rule as
//! formvis-render: 60 percent of system memory, and a working pixel costs at most 16 bytes here (source texture, target
//! texture, the padded readback buffer and the decoded PNG, 4 bytes each). wgpu does not report video memory, so on
//! machines with a separate GPU this is the system-RAM bound only.

pub const SHARE: f64 = 0.6;
pub const BYTES_PER_PIXEL: u64 = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Budget {
    pub ram: u64,
    pub bytes: u64,
    pub max_pixels: u64,
}

pub fn budget_for(ram: u64) -> Budget {
    let bytes = (ram as f64 * SHARE) as u64;
    Budget { ram, bytes, max_pixels: bytes / BYTES_PER_PIXEL }
}

pub fn system_budget() -> Budget {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    budget_for(sys.total_memory())
}
