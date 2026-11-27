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

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(value: u64) -> Option<Duration> {
        Some(Duration::from_millis(value))
    }

    #[test]
    fn the_start_up_line_names_the_four_moments_in_milliseconds_in_order() {
        assert_eq!(
            line(ms(140), ms(1980), ms(2510), ms(2735)),
            "[formweb] start-up: service started 140 ms, service ready 1980 ms, editor ready 2510 ms, window shown 2735 ms"
        );
    }

    #[test]
    fn a_service_found_already_running_is_said_to_be_already_running() {
        assert_eq!(
            line(None, ms(40), ms(610), ms(830)),
            "[formweb] start-up: service already running, service ready 40 ms, editor ready 610 ms, window shown 830 ms"
        );
    }

    #[test]
    fn an_editor_that_never_reported_ready_is_named_as_not_reached_when_the_fallback_shows_the_window() {
        assert_eq!(
            line(ms(118), ms(2201), None, ms(22150)),
            "[formweb] start-up: service started 118 ms, service ready 2201 ms, editor ready not reached, window shown 22150 ms"
        );
    }

    #[test]
    fn every_moment_that_was_never_reached_is_named_as_not_reached() {
        assert_eq!(
            line(None, None, None, None),
            "[formweb] start-up: service started not reached, service ready not reached, editor ready not reached, window shown not reached"
        );
        assert_eq!(
            line(ms(90), None, None, None),
            "[formweb] start-up: service started 90 ms, service ready not reached, editor ready not reached, window shown not reached"
        );
    }

    #[test]
    fn a_part_of_a_millisecond_is_cut_off_and_never_rounded_up() {
        assert_eq!(
            line(Some(Duration::from_micros(99_999)), ms(0), ms(1), ms(2)),
            "[formweb] start-up: service started 99 ms, service ready 0 ms, editor ready 1 ms, window shown 2 ms"
        );
    }

    #[test]
    fn a_moment_already_recorded_keeps_its_first_time_when_it_is_marked_again() {
        let moment = OnceLock::new();
        moment.set(Duration::from_secs(86_400)).unwrap();
        mark(&moment);
        assert_eq!(moment.get(), Some(&Duration::from_secs(86_400)));
        let fresh = OnceLock::new();
        mark(&fresh);
        assert!(fresh.get().is_some());
    }
}
