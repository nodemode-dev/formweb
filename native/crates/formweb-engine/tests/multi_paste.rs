mod common;
use common::*;
use formweb_engine::Engine;
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn paste(fragment: &Value, parent: &str) -> Value {
    json!({"command": "node.paste", "params": {"fragment": fragment, "parent": parent}})
}

fn count(engine: &Engine) -> usize {
    engine.site.nodes.len()
}

#[test]
fn pasting_one_copied_element_adds_a_new_copy_of_it_under_new_ids() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    let size = fragment["nodes"].as_object().map(|m| m.len()).or_else(|| fragment["nodes"].as_array().map(|a| a.len())).unwrap();
    assert_eq!(size, 4);
    let before = count(&engine);
    let work = children(&engine, "work");
    run(&mut engine, "node.paste", json!({"fragment": fragment, "parent": "work"})).unwrap();
    assert_eq!(count(&engine), before + 4);
    let now = children(&engine, "work");
    assert_eq!(now.len(), work.len() + 1);
    let pasted = now.last().unwrap();
    assert!(!["proof"].contains(&pasted.as_str()));
    assert_eq!(engine.site.nodes[pasted].children.len(), 3);
    assert_eq!(engine.site.nodes[pasted].tag, "section");
    let texts: Vec<&str> = engine.site.nodes[pasted].children.iter().map(|c| engine.site.nodes[c].text.as_str()).collect();
    assert_eq!(texts, ["01 / Thoughtfully independent", "02 / Built around your ambition", "03 / Designed to keep growing"]);
}

#[test]
fn several_pastes_in_one_batch_add_every_copy_in_order() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    let before = count(&engine);
    let work = children(&engine, "work");
    let commands: Vec<Value> = (0..3).map(|_| paste(&fragment, "work")).collect();
    engine.batch(&commands, None).unwrap();
    assert_eq!(count(&engine), before + 12);
    let now = children(&engine, "work");
    assert_eq!(now.len(), work.len() + 3);
    assert_eq!(&now[..work.len()], &work[..]);
    let ids: BTreeSet<&String> = now.iter().collect();
    assert_eq!(ids.len(), now.len());
}

#[test]
fn one_undo_removes_every_node_pasted_in_a_batch_of_several_pastes() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    let before = engine.site.clone();
    let commands: Vec<Value> = (0..3).map(|_| paste(&fragment, "work")).collect();
    let depth = undo_depth(&engine);
    engine.batch(&commands, None).unwrap();
    assert_ne!(engine.site, before);
    assert_eq!(undo_depth(&engine), depth + 1);
    undo(&mut engine);
    assert_eq!(undo_depth(&engine), depth);
    assert_eq!(engine.site, before);
    assert_eq!(engine.state()["canUndo"], json!(false));
    redo(&mut engine);
    assert_eq!(count(&engine), before.nodes.len() + 12);
}

#[test]
fn pasting_several_times_one_by_one_takes_one_undo_step_each() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    let before = engine.site.clone();
    for _ in 0..3 {
        run(&mut engine, "node.paste", json!({"fragment": fragment, "parent": "work"})).unwrap();
    }
    undo(&mut engine);
    assert_eq!(count(&engine), before.nodes.len() + 8);
    undo(&mut engine);
    undo(&mut engine);
    assert_eq!(engine.site, before);
}

#[test]
fn a_batch_of_pastes_into_different_parents_is_one_undo_step() {
    let mut engine = engine();
    let fragment = engine.fragment("proof-1").unwrap();
    let before = engine.site.clone();
    let commands = vec![paste(&fragment, "work"), paste(&fragment, "contact"), paste(&fragment, "work-grid")];
    let depth = undo_depth(&engine);
    engine.batch(&commands, None).unwrap();
    assert_eq!(count(&engine), before.nodes.len() + 3);
    assert_eq!(undo_depth(&engine), depth + 1);
    undo(&mut engine);
    assert_eq!(engine.site, before);
}

#[test]
fn a_batch_of_pastes_with_one_refused_adds_none_of_them() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    let before = engine.site.clone();
    let revision = engine.revision;
    let commands = vec![paste(&fragment, "work"), paste(&fragment, "work"), paste(&fragment, "nowhere")];
    let reason = engine.batch(&commands, None).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
    assert_eq!(engine.revision, revision);
}

#[test]
fn a_paste_at_an_index_inside_a_batch_lands_there_and_the_later_paste_goes_before_it() {
    let mut engine = engine();
    let fragment = engine.fragment("proof-1").unwrap();
    let work = children(&engine, "work");
    let commands = vec![
        json!({"command": "node.paste", "params": {"fragment": fragment, "parent": "work", "index": 0}}),
        json!({"command": "node.paste", "params": {"fragment": fragment, "parent": "work", "index": 0}}),
    ];
    engine.batch(&commands, None).unwrap();
    let now = children(&engine, "work");
    assert_eq!(now.len(), work.len() + 2);
    assert_eq!(&now[2..], &work[..]);
    assert_eq!(engine.site.nodes[&now[0]].text, "01 / Thoughtfully independent");
    assert_ne!(now[0], now[1]);
}

#[test]
fn a_paste_into_an_index_past_the_end_is_refused_and_changes_nothing() {
    let mut engine = engine();
    let fragment = engine.fragment("proof-1").unwrap();
    let before = engine.site.clone();
    let reason = run(&mut engine, "node.paste", json!({"fragment": fragment, "parent": "work", "index": 50})).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
}

#[test]
fn a_fragment_of_a_page_root_cannot_be_copied_so_it_cannot_be_pasted() {
    let engine = engine();
    assert!(engine.fragment("root").is_err());
    assert!(engine.fragment("ghost").is_err());
}

#[test]
fn a_pasted_copy_is_independent_of_the_element_it_was_copied_from() {
    let mut engine = engine();
    let fragment = engine.fragment("proof").unwrap();
    run(&mut engine, "node.paste", json!({"fragment": fragment, "parent": "work"})).unwrap();
    let pasted = children(&engine, "work").last().unwrap().clone();
    let child = engine.site.nodes[&pasted].children[0].clone();
    run(&mut engine, "node.update", json!({"id": child, "patch": {"text": "changed copy"}})).unwrap();
    assert_eq!(engine.site.nodes["proof-1"].text, "01 / Thoughtfully independent");
}
