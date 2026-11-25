use formweb_engine::Engine;
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn site_with_pages() -> Engine {
    let mut engine = Engine::new().unwrap();
    engine.reset("Fixture", false).unwrap();
    for name in ["about", "team", "fares"] {
        engine.execute("page.add", &json!({"id": name, "root": format!("{name}-root"), "name": name, "slug": format!("/{name}")}), None).unwrap();
    }
    engine
}

fn compile(engine: &Engine) -> BTreeMap<String, String> {
    let output = formweb_export::export(&engine.site, &json!({})).unwrap();
    output["files"].as_array().unwrap().iter().map(|f| (f["path"].as_str().unwrap().to_string(), f["content"].as_str().unwrap_or("").to_string())).collect()
}

fn base_rule(css: &str, id: &str) -> String {
    let needle = format!("[data-fw-node=\"{id}\"]{{");
    let at = css.find(&needle).unwrap_or_else(|| panic!("no rule for {id}"));
    css[at..].split_once('}').unwrap().0.to_string()
}

fn set_background(engine: &mut Engine, root: &str, value: Value) -> Result<Value, String> {
    engine.execute("node.update", &json!({"id": root, "patch": {"styles": {"background": value}}}), None)
}

#[test]
fn a_background_set_with_node_update_on_a_page_root_appears_in_the_export_for_that_page_only() {
    let mut engine = site_with_pages();
    set_background(&mut engine, "about-root", json!("#102030")).unwrap();
    let files = compile(&engine);
    let css = &files["assets/site.css"];
    assert!(base_rule(css, "about-root").contains("background:#102030;"));
    assert_eq!(css.matches("#102030").count(), 1);
    for other in ["team-root", "fares-root"] {
        assert!(!base_rule(css, other).contains("background"), "{other}");
    }
    assert!(files["about/index.html"].contains("data-fw-node=\"about-root\""));
    assert!(!files["index.html"].contains("#102030"));
}

#[test]
fn a_page_added_in_the_engine_has_no_background_in_the_export() {
    let engine = site_with_pages();
    let css = compile(&engine)["assets/site.css"].clone();
    for root in ["about-root", "team-root", "fares-root"] {
        assert!(!base_rule(&css, root).contains("background"), "{root}");
    }
}

#[test]
fn clearing_a_page_background_with_node_update_removes_it_from_the_export() {
    let mut engine = site_with_pages();
    set_background(&mut engine, "team-root", json!("#445566")).unwrap();
    assert!(compile(&engine)["assets/site.css"].contains("#445566"));
    set_background(&mut engine, "team-root", Value::Null).unwrap();
    let css = compile(&engine)["assets/site.css"].clone();
    assert!(!css.contains("#445566"));
    assert!(!base_rule(&css, "team-root").contains("background"));
}

#[test]
fn applying_one_background_to_every_page_in_a_batch_is_one_undo_step_and_reaches_every_page() {
    let mut engine = site_with_pages();
    let before = engine.site.clone();
    let commands: Vec<Value> = ["root", "about-root", "team-root", "fares-root"].iter().map(|root| json!({"command": "node.update", "params": {"id": root, "patch": {"styles": {"background": "#778899"}}}})).collect();
    let depth = engine.checkpoint()["undo"].as_array().unwrap().len();
    engine.batch(&commands, None).unwrap();
    assert_eq!(engine.checkpoint()["undo"].as_array().unwrap().len(), depth + 1);
    let css = compile(&engine)["assets/site.css"].clone();
    for root in ["root", "about-root", "team-root", "fares-root"] {
        assert!(base_rule(&css, root).contains("background:#778899;"), "{root}");
    }
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.site, before);
    let css = compile(&engine)["assets/site.css"].clone();
    assert!(!css.contains("#778899"));
}

#[test]
fn a_background_that_is_not_a_safe_css_value_is_refused_and_the_export_is_unchanged() {
    let mut engine = site_with_pages();
    let before = compile(&engine);
    for bad in ["url(https://evil.example/x.png)", "red; color: blue", "red}body{display:none", "expression(alert(1))"] {
        assert!(set_background(&mut engine, "about-root", json!(bad)).is_err(), "{bad}");
    }
    assert_eq!(compile(&engine), before);
}

#[test]
fn the_export_of_a_site_is_the_same_after_a_page_move_and_its_undo() {
    let mut engine = site_with_pages();
    set_background(&mut engine, "about-root", json!("#102030")).unwrap();
    let before = compile(&engine);
    engine.execute("page.move", &json!({"id": "fares", "index": 0}), None).unwrap();
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(compile(&engine), before);
}

#[test]
fn the_export_of_a_site_is_the_same_after_two_moves_and_both_undone() {
    let mut engine = site_with_pages();
    let before = compile(&engine);
    engine.execute("page.move", &json!({"id": "fares", "index": 0}), None).unwrap();
    engine.execute("page.move", &json!({"id": "home", "index": 3}), None).unwrap();
    engine.execute("history.undo", &json!({}), None).unwrap();
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(compile(&engine), before);
}

#[test]
fn a_page_move_changes_no_page_file_and_not_the_stylesheet() {
    let mut engine = site_with_pages();
    set_background(&mut engine, "team-root", json!("#445566")).unwrap();
    let before = compile(&engine);
    engine.execute("page.move", &json!({"id": "team", "index": 0}), None).unwrap();
    let after = compile(&engine);
    for path in ["index.html", "about/index.html", "team/index.html", "fares/index.html", "assets/site.css"] {
        assert_eq!(before[path], after[path], "{path}");
    }
    assert_eq!(before.keys().collect::<Vec<_>>(), after.keys().collect::<Vec<_>>());
}

#[test]
fn after_a_page_is_moved_first_the_exported_index_is_still_the_page_with_the_root_address() {
    let mut engine = site_with_pages();
    engine.execute("page.move", &json!({"id": "about", "index": 0}), None).unwrap();
    assert_eq!(engine.site.pages[0].id, "about");
    let files = compile(&engine);
    assert!(files["index.html"].contains("Aster Studio"));
    assert!(files["index.html"].contains("data-fw-node=\"root\""));
    assert!(!files["index.html"].contains("data-fw-node=\"about-root\""));
    assert!(files["about/index.html"].contains("data-fw-node=\"about-root\""));
}

#[test]
fn the_routes_of_the_export_list_every_page_whatever_order_the_pages_are_in() {
    let mut engine = site_with_pages();
    engine.execute("page.move", &json!({"id": "fares", "index": 0}), None).unwrap();
    engine.execute("page.move", &json!({"id": "team", "index": 1}), None).unwrap();
    let files = compile(&engine);
    let routes: Value = serde_json::from_str(&files["routes.json"]).unwrap();
    let mut listed: Vec<&str> = routes.as_array().unwrap().iter().map(|r| r["path"].as_str().unwrap()).collect();
    listed.sort();
    assert_eq!(listed, ["about/index.html", "fares/index.html", "index.html", "team/index.html"]);
}

#[test]
fn a_page_duplicate_exports_a_page_of_its_own_with_the_same_background_as_the_original() {
    let mut engine = site_with_pages();
    set_background(&mut engine, "fares-root", json!("#334455")).unwrap();
    engine.execute("page.duplicate", &json!({"id": "fares", "slug": "/fares-copy"}), None).unwrap();
    let files = compile(&engine);
    assert!(files.contains_key("fares-copy/index.html"));
    let css = &files["assets/site.css"];
    assert_eq!(css.matches("background:#334455;").count(), 2);
    let copy_root = engine.site.pages.last().unwrap().root.clone();
    assert!(base_rule(css, &copy_root).contains("background:#334455;"));
    assert!(files["fares-copy/index.html"].contains(&format!("data-fw-node=\"{copy_root}\"")));
}

#[test]
fn a_pasted_batch_exports_as_many_copies_as_were_pasted_and_none_remain_after_undo() {
    let mut engine = site_with_pages();
    let before = compile(&engine);
    let fragment = engine.fragment("proof-1").unwrap();
    let commands: Vec<Value> = (0..3).map(|_| json!({"command": "node.paste", "params": {"fragment": fragment, "parent": "about-root"}})).collect();
    engine.batch(&commands, None).unwrap();
    let html = compile(&engine)["about/index.html"].clone();
    assert_eq!(html.matches("01 / Thoughtfully independent").count(), 3);
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(compile(&engine), before);
}
