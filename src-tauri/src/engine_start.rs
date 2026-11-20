use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub const APP: &str = "FormWeb";
pub const SHELL_ENV: &str = "FORMWEB_SHELL_PID";
pub const ADDRESS_WAIT: Duration = Duration::from_secs(90);
pub const KEY_WAIT: Duration = Duration::from_secs(10);
pub const ADDRESS_STEP: Duration = Duration::from_millis(250);
pub const KEY_STEP: Duration = Duration::from_millis(50);
pub const EXIT_WAIT: Duration = Duration::from_secs(1);
pub const EXIT_STEP: Duration = Duration::from_millis(50);
pub const BUSY_CODE: i32 = 2;
const HOME_ENV: &str = "FORMWEB_HOME";
const HOME_NAME: &str = "FormWeb";
const DATA_NAME: &str = "Data";
const DATA_ENV: &str = "FORMWEB_DATA_DIR";
const LOG_FOLDER: &str = "logs";
const LOG_NAME: &str = "formweb-engine.log";
const KEY_MARK: &str = "window-key";
const TAIL_LINES: usize = 12;
const LINE_CHARS: usize = 300;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Wait {
    Address,
    Key,
}

impl Wait {
    pub fn limit(self) -> Duration {
        match self {
            Wait::Address => ADDRESS_WAIT,
            Wait::Key => KEY_WAIT,
        }
    }

    pub fn step(self) -> Duration {
        match self {
            Wait::Address => ADDRESS_STEP,
            Wait::Key => KEY_STEP,
        }
    }

    pub fn what(self) -> &'static str {
        match self {
            Wait::Address => "its engine to answer on its address",
            Wait::Key => "its engine to hand over the key for the window",
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Failure {
    Missing,
    NotStarted(String),
    Stopped(Option<i32>),
    TimedOut(Wait),
    Window,
}

#[derive(Default)]
pub struct Tail(VecDeque<String>);

impl Tail {
    pub const fn new() -> Self {
        Tail(VecDeque::new())
    }

    pub fn push(&mut self, line: &str) {
        if line.contains(KEY_MARK) {
            return;
        }
        let clean: String = line.chars().filter(|c| !c.is_control()).take(LINE_CHARS).collect();
        if clean.trim().is_empty() {
            return;
        }
        if self.0.len() == TAIL_LINES {
            self.0.pop_front();
        }
        self.0.push_back(clean);
    }

    pub fn lines(&self) -> Vec<String> {
        self.0.iter().cloned().collect()
    }
}

pub fn wait_for(wait: Wait, limit: Duration, step: Duration, ready: &mut dyn FnMut() -> bool, ended: &mut dyn FnMut() -> Option<Option<i32>>) -> Result<(), Failure> {
    let began = Instant::now();
    loop {
        if ready() {
            return Ok(());
        }
        if let Some(code) = ended() {
            return Err(Failure::Stopped(code));
        }
        if began.elapsed() >= limit {
            return Err(Failure::TimedOut(wait));
        }
        std::thread::sleep(step);
    }
}

pub fn until(wait: Wait, ready: &mut dyn FnMut() -> bool, ended: &mut dyn FnMut() -> Option<Option<i32>>) -> Result<(), Failure> {
    wait_for(wait, wait.limit(), wait.step(), ready, ended)
}

pub fn sentence(failure: &Failure) -> String {
    match failure {
        Failure::Missing => format!("{APP} could not start: its engine program is missing from the install. Installing {APP} again puts it back. A copy that runs from its source folder is started with ./formweb serve, or finds that folder through FORMWEB_ROOT."),
        Failure::NotStarted(reason) => format!("{APP} could not start its engine: {reason}"),
        Failure::Stopped(Some(BUSY_CODE)) => format!("{APP} could not start: another copy of its engine holds its data folder."),
        Failure::Stopped(Some(code)) => format!("{APP} could not start: its engine stopped with code {code} before the window could open."),
        Failure::Stopped(None) => format!("{APP} could not start: its engine stopped before the window could open."),
        Failure::TimedOut(wait) => format!("{APP} could not start: it waited {} seconds for {} and that did not happen.", wait.limit().as_secs(), wait.what()),
        Failure::Window => format!("{APP} could not open its window."),
    }
}

pub fn message(failure: &Failure, tail: &[String], log: Option<&Path>) -> String {
    let mut text = sentence(failure);
    if !tail.is_empty() {
        text.push_str("\n\nThe engine's last lines:\n");
        text.push_str(&tail.join("\n"));
    } else if matches!(failure, Failure::Stopped(_) | Failure::TimedOut(_)) {
        text.push_str("\n\nThe engine wrote nothing before that.");
    }
    if let Some(path) = log {
        text.push_str("\n\nThe engine's log: ");
        text.push_str(&path.to_string_lossy());
    }
    text
}

pub fn data_folder(var: &dyn Fn(&str) -> Option<String>, home: Option<&Path>) -> Option<PathBuf> {
    if let Some(raw) = var(DATA_ENV) {
        return Some(PathBuf::from(raw));
    }
    let root = match var(HOME_ENV) {
        Some(raw) => PathBuf::from(raw),
        None => home?.join(HOME_NAME),
    };
    Some(root.join(DATA_NAME))
}

pub fn log_path(var: &dyn Fn(&str) -> Option<String>, home: Option<&Path>) -> Option<PathBuf> {
    data_folder(var, home).map(|folder| folder.join(LOG_FOLDER).join(LOG_NAME))
}

pub fn engine_log() -> Option<PathBuf> {
    log_path(&|name| std::env::var(name).ok(), std::env::home_dir().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn only(name: &'static str, value: &'static str) -> impl Fn(&str) -> Option<String> {
        move |asked| (asked == name).then(|| value.to_string())
    }

    #[test]
    fn the_tail_keeps_the_last_lines_and_never_the_window_key() {
        let mut tail = Tail::new();
        for n in 0..15 {
            tail.push(&format!("line {n}"));
        }
        tail.push("formweb-window-key: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
        tail.push("   ");
        tail.push(&"x".repeat(1000));
        let lines = tail.lines();
        assert_eq!(lines.len(), TAIL_LINES);
        assert_eq!(lines[0], "line 4");
        assert_eq!(lines[TAIL_LINES - 1].len(), LINE_CHARS);
        assert!(lines.iter().all(|line| !line.contains("window-key")));
    }

    #[test]
    fn every_failure_has_its_sentence_the_last_lines_and_the_log() {
        let log = Path::new("/data/logs/formweb-engine.log");
        let said = vec!["formweb is already running on /data (engine process 7).".to_string()];
        let busy = message(&Failure::Stopped(Some(BUSY_CODE)), &said, Some(log));
        assert!(busy.starts_with("FormWeb could not start: another copy of its engine holds its data folder."));
        assert!(busy.contains("The engine's last lines:\nformweb is already running on /data (engine process 7)."));
        assert!(busy.ends_with("The engine's log: /data/logs/formweb-engine.log"));
        assert!(message(&Failure::Stopped(Some(3)), &[], Some(log)).contains("stopped with code 3"));
        assert!(message(&Failure::Stopped(None), &[], None).ends_with("The engine wrote nothing before that."));
        assert!(message(&Failure::Missing, &[], None).ends_with("through FORMWEB_ROOT."));
        assert!(sentence(&Failure::NotStarted("Access is denied.".to_string())).ends_with("its engine: Access is denied."));
        assert_eq!(sentence(&Failure::Window), "FormWeb could not open its window.");
    }

    #[test]
    fn a_wait_that_runs_out_says_how_long_and_for_what() {
        assert!(sentence(&Failure::TimedOut(Wait::Address)).contains("waited 90 seconds for its engine to answer on its address"));
        assert!(sentence(&Failure::TimedOut(Wait::Key)).contains("waited 10 seconds for its engine to hand over the key for the window"));
    }

    #[test]
    fn a_wait_ends_when_the_engine_is_ready_when_it_stops_and_when_the_limit_runs_out() {
        let step = Duration::from_millis(5);
        let mut asked = 0;
        let ready = wait_for(Wait::Address, Duration::from_secs(5), step, &mut || { asked += 1; asked == 3 }, &mut || None);
        assert_eq!(ready, Ok(()));
        assert_eq!(asked, 3);
        let mut seen = 0;
        let stopped = wait_for(Wait::Address, Duration::from_secs(5), step, &mut || false, &mut || { seen += 1; (seen == 2).then_some(Some(2)) });
        assert_eq!(stopped, Err(Failure::Stopped(Some(2))));
        assert_eq!(wait_for(Wait::Key, Duration::from_secs(5), step, &mut || false, &mut || Some(None)), Err(Failure::Stopped(None)));
        assert_eq!(wait_for(Wait::Key, Duration::from_secs(5), step, &mut || true, &mut || Some(Some(0))), Ok(()));
        let began = Instant::now();
        let late = wait_for(Wait::Key, Duration::from_millis(60), step, &mut || false, &mut || None);
        assert_eq!(late, Err(Failure::TimedOut(Wait::Key)));
        assert!(began.elapsed() >= Duration::from_millis(60) && began.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn the_log_is_where_the_engine_writes_it() {
        let home = Path::new("/home/u");
        let none = |_: &str| None;
        let end = Path::new("logs").join("formweb-engine.log");
        assert_eq!(log_path(&none, Some(home)), Some(home.join("FormWeb").join("Data").join(&end)));
        assert_eq!(log_path(&only("FORMWEB_HOME", "/x/web"), Some(home)), Some(Path::new("/x/web").join("Data").join(&end)));
        assert_eq!(log_path(&only("FORMWEB_HOME", "/x/web"), None), Some(Path::new("/x/web").join("Data").join(&end)));
        assert_eq!(log_path(&only("FORMWEB_DATA_DIR", "/d/x"), None), Some(Path::new("/d/x").join(&end)));
        assert_eq!(log_path(&none, None), None);
    }
}
