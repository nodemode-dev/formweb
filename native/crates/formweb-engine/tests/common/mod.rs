#![allow(dead_code)]
use formweb_engine::Engine;
use serde_json::{json, Value};

pub fn engine() -> Engine {
    let mut engine = Engine::new().unwrap();
    engine.reset("Fixture", false).unwrap();
    engine
}

pub fn run(engine: &mut Engine, command: &str, params: Value) -> Result<Value, String> {
    engine.execute(command, &params, None)
}

pub fn undo(engine: &mut Engine) {
    engine.execute("history.undo", &json!({}), None).unwrap();
}

pub fn redo(engine: &mut Engine) {
    engine.execute("history.redo", &json!({}), None).unwrap();
}

pub fn page_ids(engine: &Engine) -> Vec<String> {
    engine.site.pages.iter().map(|page| page.id.clone()).collect()
}

pub fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|id| id.to_string()).collect()
}

pub fn with_pages(engine: &mut Engine, names: &[&str]) {
    for name in names {
        run(engine, "page.add", json!({"id": name, "root": format!("{name}-root"), "name": name, "slug": format!("/{name}")})).unwrap();
    }
}

pub fn children(engine: &Engine, id: &str) -> Vec<String> {
    engine.site.nodes[id].children.clone()
}

pub fn add_p(engine: &mut Engine, parent: &str, id: &str) {
    run(engine, "node.add", json!({"parent": parent, "node": {"id": id, "tag": "p", "text": id}})).unwrap();
}

pub fn add_div(engine: &mut Engine, parent: &str, id: &str) {
    run(engine, "node.add", json!({"parent": parent, "node": {"id": id, "tag": "div"}})).unwrap();
}

pub fn undo_depth(engine: &Engine) -> usize {
    engine.checkpoint()["undo"].as_array().unwrap().len()
}
