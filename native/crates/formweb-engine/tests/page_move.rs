mod common;
use common::*;
use formweb_model::Site;
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn four_pages() -> formweb_engine::Engine {
    let mut engine = engine();
    with_pages(&mut engine, &["about", "team", "fares"]);
    assert_eq!(page_ids(&engine), ids(&["home", "about", "team", "fares"]));
    engine
}

fn keys(value: &Value) -> BTreeSet<String> {
    value.as_object().unwrap().keys().cloned().collect()
}

fn set(list: &[&str]) -> BTreeSet<String> {
    list.iter().map(|k| k.to_string()).collect()
}

#[test]
fn moving_a_page_to_the_start_puts_it_first_and_shifts_the_others_down() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    assert_eq!(page_ids(&engine), ids(&["fares", "home", "about", "team"]));
}

#[test]
fn moving_a_page_to_the_middle_lands_it_at_that_index() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "home", "index": 2})).unwrap();
    assert_eq!(page_ids(&engine), ids(&["about", "team", "home", "fares"]));
    run(&mut engine, "page.move", json!({"id": "fares", "index": 1})).unwrap();
    assert_eq!(page_ids(&engine), ids(&["about", "fares", "team", "home"]));
}

#[test]
fn moving_a_page_to_the_end_puts_it_last() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "home", "index": 3})).unwrap();
    assert_eq!(page_ids(&engine), ids(&["about", "team", "fares", "home"]));
}

#[test]
fn the_page_moved_to_the_start_becomes_the_first_page_which_is_the_home_page() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "team", "index": 0})).unwrap();
    assert_eq!(engine.state()["site"]["pages"][0]["id"], json!("team"));
}

#[test]
fn a_move_reports_the_new_order_in_the_state_it_returns() {
    let mut engine = four_pages();
    let reply = run(&mut engine, "page.move", json!({"id": "about", "index": 3})).unwrap();
    let order: Vec<&str> = reply["site"]["pages"].as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect();
    assert_eq!(order, ["home", "team", "fares", "about"]);
    assert_eq!(reply["canUndo"], json!(true));
}

#[test]
fn a_move_to_an_unknown_page_is_refused_with_a_reason_and_changes_nothing() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let revision = engine.revision;
    let reason = run(&mut engine, "page.move", json!({"id": "nowhere", "index": 0})).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
    assert_eq!(engine.revision, revision);
}

#[test]
fn a_move_to_a_negative_index_is_refused_with_a_reason_and_changes_nothing() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let reason = run(&mut engine, "page.move", json!({"id": "team", "index": -1})).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
}

#[test]
fn a_move_to_an_index_that_is_not_a_whole_number_is_refused_with_a_reason() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    for bad in [json!(1.5), json!("1"), json!(null), json!(true), json!([1]), json!({"at": 1})] {
        let reason = run(&mut engine, "page.move", json!({"id": "team", "index": bad})).unwrap_err();
        assert!(!reason.trim().is_empty(), "{bad}");
        assert_eq!(engine.site, before, "{bad}");
    }
    let reason = run(&mut engine, "page.move", json!({"id": "team"})).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
}

#[test]
fn a_move_to_an_index_past_the_end_is_refused_with_a_reason_and_changes_nothing() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let revision = engine.revision;
    for bad in [json!(4), json!(5), json!(1000), json!(u64::MAX)] {
        let reason = run(&mut engine, "page.move", json!({"id": "home", "index": bad})).unwrap_err();
        assert!(!reason.trim().is_empty(), "{bad}");
        assert_eq!(engine.site, before, "{bad}");
    }
    assert_eq!(engine.revision, revision);
    assert_eq!(engine.checkpoint()["undo"].as_array().unwrap().len(), 3);
}

#[test]
fn a_move_to_the_index_the_page_already_has_is_refused_and_adds_no_history() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let revision = engine.revision;
    let undo_steps_before = engine.checkpoint()["undo"].as_array().unwrap().len();
    for (id, index) in [("home", 0), ("about", 1), ("team", 2), ("fares", 3)] {
        let reason = run(&mut engine, "page.move", json!({"id": id, "index": index})).unwrap_err();
        assert!(!reason.trim().is_empty(), "{id}");
    }
    assert_eq!(engine.site, before);
    assert_eq!(engine.revision, revision);
    assert_eq!(engine.checkpoint()["undo"].as_array().unwrap().len(), undo_steps_before);
}

#[test]
fn the_three_kinds_of_refusal_give_different_reasons() {
    let mut engine = four_pages();
    let unknown = run(&mut engine, "page.move", json!({"id": "nowhere", "index": 0})).unwrap_err();
    let past_end = run(&mut engine, "page.move", json!({"id": "home", "index": 9})).unwrap_err();
    let same = run(&mut engine, "page.move", json!({"id": "home", "index": 0})).unwrap_err();
    assert_ne!(unknown, past_end);
    assert_ne!(past_end, same);
    assert_ne!(unknown, same);
}

#[test]
fn a_site_with_one_page_refuses_every_move() {
    let mut engine = engine();
    for index in [0, 1] {
        assert!(run(&mut engine, "page.move", json!({"id": "home", "index": index})).is_err());
    }
}

#[test]
fn a_move_is_one_undo_step_and_undo_restores_the_order_exactly() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let depth = undo_depth(&engine);
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    assert_ne!(engine.site, before);
    assert_eq!(undo_depth(&engine), depth + 1);
    undo(&mut engine);
    assert_eq!(undo_depth(&engine), depth);
    assert_eq!(page_ids(&engine), ids(&["home", "about", "team", "fares"]));
    assert_eq!(engine.site, before);
    assert_eq!(serde_json::to_string(&engine.site).unwrap(), serde_json::to_string(&before).unwrap());
}

#[test]
fn redo_reapplies_the_move_and_a_second_undo_walks_back_one_move_at_a_time() {
    let mut engine = four_pages();
    let start = engine.site.clone();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    let first = engine.site.clone();
    run(&mut engine, "page.move", json!({"id": "about", "index": 3})).unwrap();
    assert_eq!(page_ids(&engine), ids(&["fares", "home", "team", "about"]));
    undo(&mut engine);
    assert_eq!(engine.site, first);
    undo(&mut engine);
    assert_eq!(engine.site, start);
    assert_eq!(engine.state()["canRedo"], json!(true));
    redo(&mut engine);
    assert_eq!(engine.site, first);
    redo(&mut engine);
    assert_eq!(page_ids(&engine), ids(&["fares", "home", "team", "about"]));
}

#[test]
fn a_refused_move_leaves_redo_alone() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    undo(&mut engine);
    assert_eq!(engine.state()["canRedo"], json!(true));
    assert!(run(&mut engine, "page.move", json!({"id": "fares", "index": 99})).is_err());
    assert_eq!(engine.state()["canRedo"], json!(true));
}

#[test]
fn a_move_changes_nothing_else_in_the_site() {
    let mut engine = four_pages();
    let before = serde_json::to_value(&engine.site).unwrap();
    run(&mut engine, "page.move", json!({"id": "team", "index": 0})).unwrap();
    let after = serde_json::to_value(&engine.site).unwrap();
    let mut before_rest = before.clone();
    let mut after_rest = after.clone();
    before_rest["pages"] = Value::Null;
    after_rest["pages"] = Value::Null;
    assert_eq!(before_rest, after_rest);
    let mut before_pages = before["pages"].as_array().unwrap().clone();
    let mut after_pages = after["pages"].as_array().unwrap().clone();
    assert_ne!(before_pages, after_pages);
    before_pages.sort_by_key(|p| p["id"].as_str().unwrap().to_string());
    after_pages.sort_by_key(|p| p["id"].as_str().unwrap().to_string());
    assert_eq!(before_pages, after_pages);
}

#[test]
fn a_move_keeps_every_page_name_address_root_and_search_text() {
    let mut engine = four_pages();
    run(&mut engine, "page.update", json!({"id": "about", "patch": {"seo": {"title": "About us", "description": "Who we are", "noindex": true}}})).unwrap();
    let find = |engine: &formweb_engine::Engine, id: &str| engine.site.pages.iter().find(|p| p.id == id).unwrap().clone();
    let before: Vec<_> = ["home", "about", "team", "fares"].iter().map(|id| find(&engine, id)).collect();
    run(&mut engine, "page.move", json!({"id": "about", "index": 3})).unwrap();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    let after: Vec<_> = ["home", "about", "team", "fares"].iter().map(|id| find(&engine, id)).collect();
    assert_eq!(before, after);
}

#[test]
fn the_document_after_a_move_has_exactly_the_keys_an_older_engine_knows() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 1})).unwrap();
    let document = serde_json::to_value(&engine.site).unwrap();
    assert_eq!(
        keys(&document),
        set(&["schemaVersion", "id", "name", "pages", "nodes", "tokens", "breakpoints", "components", "collections", "locales", "defaultLocale", "settings", "extensions"])
    );
    for page in document["pages"].as_array().unwrap() {
        assert_eq!(keys(page), set(&["id", "name", "slug", "root", "seo"]));
        assert_eq!(keys(&page["seo"]), set(&["title", "description", "noindex"]));
    }
    for node in document["nodes"].as_object().unwrap().values() {
        assert!(keys(node).is_subset(&set(&["id", "tag", "name", "text", "children", "attrs", "styles", "breakpoints", "componentId", "componentSourceId", "overrides", "binding", "interactions"])), "{node}");
    }
}

#[test]
fn the_key_set_is_the_same_before_and_after_a_move() {
    let mut engine = four_pages();
    let before = serde_json::to_value(&engine.site).unwrap();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 1})).unwrap();
    let after = serde_json::to_value(&engine.site).unwrap();
    assert_eq!(keys(&before), keys(&after));
    assert_eq!(keys(&before["pages"][0]), keys(&after["pages"][0]));
}

#[test]
fn a_site_saved_after_a_move_reads_back_into_the_model_with_no_unknown_fields() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    let text = serde_json::to_string(&engine.site).unwrap();
    let read: Site = serde_json::from_str(&text).unwrap();
    assert_eq!(read, engine.site);
    assert_eq!(read.pages[0].id, "fares");
    let mut other = formweb_engine::Engine::new().unwrap();
    other.load(serde_json::from_str(&text).unwrap(), None).unwrap();
    assert_eq!(page_ids(&other), ids(&["fares", "home", "about", "team"]));
}

#[test]
fn a_site_with_an_extra_page_key_is_not_accepted_so_the_key_check_can_fail() {
    let mut engine = four_pages();
    let mut document = serde_json::to_value(&engine.site).unwrap();
    document["pages"][0]["position"] = json!(0);
    assert!(serde_json::from_value::<Site>(document.clone()).is_err());
    assert!(engine.load(document, None).is_err());
}

#[test]
fn the_page_order_survives_a_checkpoint_and_restore_in_a_fresh_engine() {
    let mut engine = four_pages();
    run(&mut engine, "page.move", json!({"id": "fares", "index": 0})).unwrap();
    let checkpoint = engine.checkpoint();
    let mut other = formweb_engine::Engine::new().unwrap();
    other.restore(&checkpoint, None, Some(engine.revision)).unwrap();
    assert_eq!(page_ids(&other), ids(&["fares", "home", "about", "team"]));
    undo(&mut other);
    assert_eq!(page_ids(&other), ids(&["home", "about", "team", "fares"]));
}

#[test]
fn a_move_inside_a_batch_with_other_edits_is_one_undo_step() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let commands = vec![
        json!({"command": "page.move", "params": {"id": "fares", "index": 0}}),
        json!({"command": "page.move", "params": {"id": "team", "index": 1}}),
        json!({"command": "page.update", "params": {"id": "home", "patch": {"name": "Start"}}}),
    ];
    let depth = undo_depth(&engine);
    engine.batch(&commands, None).unwrap();
    assert_eq!(page_ids(&engine), ids(&["fares", "team", "home", "about"]));
    assert_eq!(undo_depth(&engine), depth + 1);
    undo(&mut engine);
    assert_eq!(engine.site, before);
}

#[test]
fn a_batch_whose_second_move_is_refused_leaves_the_first_move_undone() {
    let mut engine = four_pages();
    let before = engine.site.clone();
    let commands = vec![
        json!({"command": "page.move", "params": {"id": "fares", "index": 0}}),
        json!({"command": "page.move", "params": {"id": "fares", "index": 0}}),
    ];
    assert!(engine.batch(&commands, None).is_err());
    assert_eq!(engine.site, before);
}
