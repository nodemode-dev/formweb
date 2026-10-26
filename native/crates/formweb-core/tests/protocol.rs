use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct Core {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

impl Core {
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_formweb-core")).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap();
        let input = child.stdin.take().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        Self { child, input, output }
    }

    fn raw(&mut self, line: &str) -> Value {
        writeln!(self.input, "{line}").unwrap();
        self.input.flush().unwrap();
        let mut reply = String::new();
        self.output.read_line(&mut reply).unwrap();
        serde_json::from_str(&reply).unwrap()
    }

    fn call(&mut self, id: u64, method: &str, params: Value) -> Value {
        self.raw(&json!({"id": id, "method": method, "params": params}).to_string())
    }
}

impl Drop for Core {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn hello_reports_the_crate_version_and_every_command() {
    let mut core = Core::start();
    let reply = core.call(1, "hello", json!({}));
    assert_eq!(reply["ok"], json!(true));
    assert_eq!(reply["id"], json!(1));
    assert_eq!(reply["result"]["version"], json!(env!("CARGO_PKG_VERSION")));
    assert_eq!(reply["result"]["commands"].as_array().unwrap().len(), formweb_engine::COMMANDS.len());
}

#[test]
fn a_reply_always_carries_the_request_id_and_the_revision() {
    let mut core = Core::start();
    let reply = core.call(41, "state", json!({}));
    assert_eq!(reply["id"], json!(41));
    assert_eq!(reply["rev"], reply["result"]["revision"]);
}

#[test]
fn malformed_requests_get_an_error_reply_and_the_engine_keeps_answering() {
    let mut core = Core::start();
    assert_eq!(core.raw("{not json")["ok"], json!(false));
    assert_eq!(core.raw(&json!({"id": "x", "method": "state", "params": {}}).to_string())["ok"], json!(false));
    assert_eq!(core.raw(&json!({"id": 2, "params": {}}).to_string())["ok"], json!(false));
    assert_eq!(core.call(3, "nope", json!({}))["ok"], json!(false));
    assert_eq!(core.raw(&json!({"id": 4, "method": "state", "params": []}).to_string())["ok"], json!(false));
    assert_eq!(core.call(5, "state", json!({}))["ok"], json!(true));
}

#[test]
fn an_edit_over_the_wire_validates_and_can_be_undone() {
    let mut core = Core::start();
    let before = core.call(1, "state", json!({}))["result"]["site"].clone();
    let bad = core.call(2, "exec", json!({"command": "node.add", "params": {"parent": "root", "node": {"tag": "script"}}}));
    assert_eq!(bad["ok"], json!(false));
    assert_eq!(core.call(3, "state", json!({}))["result"]["site"], before);
    let good = core.call(4, "exec", json!({"command": "node.add", "params": {"parent": "root", "node": {"id": "wire", "tag": "p", "text": "x"}}}));
    assert_eq!(good["ok"], json!(true));
    let undone = core.call(5, "exec", json!({"command": "history.undo", "params": {}}));
    assert_eq!(undone["result"]["site"], before);
}

#[test]
fn a_stale_expected_revision_is_reported_as_a_revision_conflict() {
    let mut core = Core::start();
    let reply = core.call(1, "exec", json!({"command": "token.set", "params": {"name": "a", "value": "#fff"}, "expectedRevision": 99}));
    assert_eq!(reply["ok"], json!(false));
    assert!(reply["error"].as_str().unwrap().to_lowercase().contains("revision conflict"));
}

#[test]
fn validate_refuses_an_invalid_site_and_accepts_the_engine_own_site() {
    let mut core = Core::start();
    let site = core.call(1, "state", json!({}))["result"]["site"].clone();
    assert_eq!(core.call(2, "validate", json!({"site": site}))["result"]["valid"], json!(true));
    let mut broken = site;
    broken["nodes"]["root"]["children"].as_array_mut().unwrap().push(json!("ghost"));
    assert_eq!(core.call(3, "validate", json!({"site": broken}))["ok"], json!(false));
}

#[test]
fn a_restored_checkpoint_resumes_with_its_history_in_a_new_process() {
    let mut first = Core::start();
    first.call(1, "exec", json!({"command": "node.add", "params": {"parent": "root", "node": {"id": "kept", "tag": "p", "text": "x"}}}));
    let state = first.call(2, "state", json!({}));
    let checkpoint = first.call(3, "checkpoint", json!({}))["result"].clone();
    let mut second = Core::start();
    let restored = second.call(1, "restore", json!({"checkpoint": checkpoint, "restoreRevision": state["result"]["revision"]}));
    assert_eq!(restored["result"]["site"], state["result"]["site"]);
    assert_eq!(restored["result"]["canUndo"], json!(true));
    let undone = second.call(2, "exec", json!({"command": "history.undo", "params": {}}));
    assert!(undone["result"]["site"]["nodes"].get("kept").is_none());
}

#[test]
fn the_export_method_compiles_the_open_site() {
    let mut core = Core::start();
    let reply = core.call(1, "export", json!({}));
    assert_eq!(reply["ok"], json!(true));
    let paths: Vec<&str> = reply["result"]["files"].as_array().unwrap().iter().map(|f| f["path"].as_str().unwrap()).collect();
    assert!(paths.contains(&"index.html") && paths.contains(&"routes.json"));
}
