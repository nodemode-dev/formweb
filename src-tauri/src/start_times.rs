use std::io::Write;
use std::sync::OnceLock;
use std::time::Duration;

pub static SERVICE_STARTED: OnceLock<Duration> = OnceLock::new();
pub static SERVICE_READY: OnceLock<Duration> = OnceLock::new();
pub static EDITOR_READY: OnceLock<Duration> = OnceLock::new();
pub static WINDOW_SHOWN: OnceLock<Duration> = OnceLock::new();

pub fn mark(moment: &OnceLock<Duration>) {
    let _ = moment.set(crate::reveal::since_launch());
}

pub fn report() {
    let text = line(SERVICE_STARTED.get().copied(), SERVICE_READY.get().copied(), EDITOR_READY.get().copied(), WINDOW_SHOWN.get().copied());
    let _ = writeln!(std::io::stderr(), "{text}");
}

/// The shell's start-up summary. A service that answered without being started is one the shell found already running.
pub fn line(started: Option<Duration>, ready: Option<Duration>, editor: Option<Duration>, shown: Option<Duration>) -> String {
    let moment = |name: &str, at: Option<Duration>| match at {
        Some(at) => format!("{name} {} ms", at.as_millis()),
        None => format!("{name} not reached"),
    };
    let first = match (started, ready) {
        (None, Some(_)) => "service already running".to_string(),
        _ => moment("service started", started),
    };
    format!("[formweb] start-up: {first}, {}, {}, {}", moment("service ready", ready), moment("editor ready", editor), moment("window shown", shown))
}
