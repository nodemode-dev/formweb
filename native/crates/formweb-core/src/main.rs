use formweb_engine::{audit, Engine, COMMANDS};
use formweb_model::{starter, validate};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn expected(params: &Value) -> Result<Option<u64>, String> {
    params.get("expectedRevision").map(|value| value.as_u64().ok_or_else(|| "expectedRevision must be a nonnegative integer".into())).transpose()
}

fn dispatch(engine: &mut Engine, method: &str, params: &Value) -> Result<Value, String> {
    if !params.is_object() { return Err("params must be an object".into()); }
    match method {
        "hello" => Ok(json!({"version":env!("CARGO_PKG_VERSION"),"engine":"rust","schemaVersion":1,"commands":COMMANDS})),
        "state" => Ok(engine.state()),
        "new" => {
            let name = params.get("name").map(|v|v.as_str().ok_or("name must be a string")).transpose()?.unwrap_or("Untitled website");
            engine.reset(name)
        }
        "load" => {
            let restore_revision = params.get("restoreRevision").map(|value| value.as_u64().ok_or("restoreRevision must be a nonnegative integer")).transpose()?;
            engine.load(params.get("site").ok_or("site is required")?.clone(), restore_revision)
        }
        "exec" => {
            let command = params.get("command").and_then(Value::as_str).ok_or("command must be a string")?;
            engine.execute(command, params.get("params").ok_or("command params are required")?, expected(params)?)
        }
        "batch" => {
            let commands = params.get("commands").and_then(Value::as_array).ok_or("commands must be an array")?;
            engine.batch(commands, expected(params)?)
        }
        "export" => formweb_export::export(&engine.site, params),
        "audit" => Ok(audit(&engine.site)),
        "checkpoint" => Ok(engine.checkpoint()),
        "validate" => {
            let site=serde_json::from_value(params.get("site").ok_or("site required")?.clone()).map_err(|e|format!("invalid site: {e}"))?;
            validate(&site)?;
            Ok(json!({"valid":true}))
        }
        "restore" => {
            let revision=params.get("restoreRevision").map(|v|v.as_u64().ok_or("restoreRevision must be an integer")).transpose()?;
            engine.restore(params.get("checkpoint").ok_or("checkpoint required")?, expected(params)?, revision)
        }
        _ => Err(format!("unknown method {method}")),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version") { println!("formweb-core {}", env!("CARGO_PKG_VERSION")); return; }
    if args.iter().any(|a| a == "--selfcheck") {
        match validate(&starter("Selfcheck")) {
            Ok(()) => println!("{}", json!({"ok":true,"version":env!("CARGO_PKG_VERSION"),"engine":"rust","commands":COMMANDS.len()})),
            Err(error) => { eprintln!("{error}"); std::process::exit(1); }
        }
        return;
    }
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    let mut engine = match Engine::new() {
        Ok(engine) => engine,
        Err(error) => { eprintln!("{error}"); std::process::exit(1); }
    };
    for line in stdin.lock().lines() {
        let line = match line { Ok(line) => line, Err(error) => { eprintln!("input error: {error}"); break; } };
        if line.trim().is_empty() { continue; }
        let parsed = if line.len() > 64 * 1024 * 1024 { Err("request exceeds 64 MiB".to_string()) } else { serde_json::from_str::<Value>(&line).map_err(|e|format!("invalid JSON: {e}")) };
        let (id, result) = match parsed {
            Ok(request) => {
                let id = request.get("id").cloned().unwrap_or(Value::Null);
                let result = if !id.is_u64() { Err("id must be a nonnegative integer".into()) }
                else if let Some(method) = request.get("method").and_then(Value::as_str) {
                    dispatch(&mut engine, method, request.get("params").unwrap_or(&json!({})))
                } else { Err("method must be a string".into()) };
                (id, result)
            }
            Err(error) => (Value::Null, Err(error)),
        };
        let reply = match result {
            Ok(result) => json!({"id":id,"ok":true,"result":result,"rev":engine.revision}),
            Err(error) => json!({"id":id,"ok":false,"error":error,"rev":engine.revision}),
        };
        if serde_json::to_writer(&mut stdout, &reply).is_err() || writeln!(stdout).is_err() || stdout.flush().is_err() { break; }
    }
}
