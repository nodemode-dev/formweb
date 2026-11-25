mod common;
use common::*;
use formweb_engine::Engine;
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn fixture() -> Engine {
    let mut engine = engine();
    with_pages(&mut engine, &["about"]);
    add_div(&mut engine, "work", "lane");
    for id in ["i1", "i2", "i3", "i4", "i5"] {
        add_p(&mut engine, "lane", id);
    }
    add_div(&mut engine, "work", "bin");
    add_p(&mut engine, "bin", "j1");
    add_p(&mut engine, "bin", "j2");
    add_div(&mut engine, "work", "bin2");
    engine
}

fn mv(engine: &mut Engine, id: &str, parent: &str, index: Option<u64>) -> Result<Value, String> {
    match index {
        Some(index) => run(engine, "node.move", json!({"id": id, "parent": parent, "index": index})),
        None => run(engine, "node.move", json!({"id": id, "parent": parent})),
    }
}

fn drop_commands(engine: &Engine, moving: &[&str], parent: &str, anchor: Option<&str>) -> Vec<Value> {
    let mut lists: BTreeMap<String, Vec<String>> = engine.site.nodes.iter().map(|(id, node)| (id.clone(), node.children.clone())).collect();
    let mut commands = vec![];
    for id in moving {
        let from = lists.iter().find(|(_, list)| list.iter().any(|c| c == id)).map(|(parent, _)| parent.clone()).unwrap();
        lists.get_mut(&from).unwrap().retain(|c| c != id);
        let into = lists.get_mut(parent).unwrap();
        let index = anchor.and_then(|a| into.iter().position(|c| c == a)).unwrap_or(into.len());
        into.insert(index, id.to_string());
        commands.push(json!({"command": "node.move", "params": {"id": id, "parent": parent, "index": index}}));
    }
    commands
}

#[test]
fn moving_a_layer_before_a_sibling_puts_it_just_above_that_sibling() {
    let mut engine = fixture();
    mv(&mut engine, "i4", "lane", Some(1)).unwrap();
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i4", "i2", "i3", "i5"]));
}

#[test]
fn moving_a_layer_after_a_sibling_puts_it_just_below_that_sibling() {
    let mut engine = fixture();
    mv(&mut engine, "i1", "lane", Some(2)).unwrap();
    assert_eq!(children(&engine, "lane"), ids(&["i2", "i3", "i1", "i4", "i5"]));
    mv(&mut engine, "i5", "lane", Some(0)).unwrap();
    assert_eq!(children(&engine, "lane"), ids(&["i5", "i2", "i3", "i1", "i4"]));
    mv(&mut engine, "i5", "lane", Some(4)).unwrap();
    assert_eq!(children(&engine, "lane"), ids(&["i2", "i3", "i1", "i4", "i5"]));
}

#[test]
fn moving_a_layer_into_a_container_without_an_index_makes_it_the_last_child() {
    let mut engine = fixture();
    mv(&mut engine, "i2", "bin", None).unwrap();
    assert_eq!(children(&engine, "bin"), ids(&["j1", "j2", "i2"]));
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i3", "i4", "i5"]));
}

#[test]
fn moving_a_layer_into_a_container_at_an_index_inserts_it_there() {
    let mut engine = fixture();
    mv(&mut engine, "i2", "bin", Some(1)).unwrap();
    assert_eq!(children(&engine, "bin"), ids(&["j1", "i2", "j2"]));
    mv(&mut engine, "j1", "bin2", Some(0)).unwrap();
    assert_eq!(children(&engine, "bin2"), ids(&["j1"]));
    assert_eq!(children(&engine, "bin"), ids(&["i2", "j2"]));
}

#[test]
fn a_moved_container_takes_its_whole_subtree_with_it() {
    let mut engine = fixture();
    mv(&mut engine, "lane", "bin2", None).unwrap();
    assert_eq!(children(&engine, "bin2"), ids(&["lane"]));
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i2", "i3", "i4", "i5"]));
    assert!(!children(&engine, "work").contains(&"lane".to_string()));
}

#[test]
fn a_move_changes_only_the_two_child_lists_it_touches() {
    let mut engine = fixture();
    let before = engine.site.clone();
    mv(&mut engine, "i2", "bin", Some(1)).unwrap();
    let after = &engine.site;
    assert_eq!(before.nodes.keys().collect::<Vec<_>>(), after.nodes.keys().collect::<Vec<_>>());
    for (id, node) in &before.nodes {
        if id == "lane" || id == "bin" {
            continue;
        }
        assert_eq!(node, &after.nodes[id], "{id}");
    }
    assert_eq!(before.pages, after.pages);
    assert_eq!(before.tokens, after.tokens);
    assert_eq!(after.nodes["i2"], before.nodes["i2"]);
}

#[test]
fn undo_puts_a_moved_layer_back_exactly_and_redo_moves_it_again() {
    let mut engine = fixture();
    let before = engine.site.clone();
    mv(&mut engine, "i2", "bin", Some(0)).unwrap();
    let after = engine.site.clone();
    undo(&mut engine);
    assert_eq!(engine.site, before);
    redo(&mut engine);
    assert_eq!(engine.site, after);
    assert_eq!(children(&engine, "bin"), ids(&["i2", "j1", "j2"]));
}

#[test]
fn a_page_root_cannot_be_moved_anywhere() {
    let mut engine = fixture();
    let before = engine.site.clone();
    for (id, parent) in [("root", "work"), ("about-root", "work"), ("about-root", "bin"), ("root", "bin2")] {
        let reason = mv(&mut engine, id, parent, None).unwrap_err();
        assert!(!reason.trim().is_empty(), "{id}");
        assert_eq!(engine.site, before, "{id} into {parent}");
    }
    let reason = mv(&mut engine, "root", "root", Some(0)).unwrap_err();
    assert!(!reason.trim().is_empty());
    assert_eq!(engine.site, before);
}

#[test]
fn a_layer_cannot_be_moved_into_itself() {
    let mut engine = fixture();
    let before = engine.site.clone();
    for id in ["bin", "lane", "work"] {
        let reason = mv(&mut engine, id, id, None).unwrap_err();
        assert!(!reason.trim().is_empty(), "{id}");
        assert_eq!(engine.site, before, "{id}");
    }
}

#[test]
fn a_layer_cannot_be_moved_into_its_own_descendant() {
    let mut engine = fixture();
    add_div(&mut engine, "lane", "deep");
    add_div(&mut engine, "deep", "deeper");
    let before = engine.site.clone();
    for (id, parent) in [("lane", "deep"), ("lane", "deeper"), ("work", "deeper"), ("work", "i1"), ("deep", "deeper")] {
        let reason = mv(&mut engine, id, parent, None).unwrap_err();
        assert!(!reason.trim().is_empty(), "{id} into {parent}");
        assert_eq!(engine.site, before, "{id} into {parent}");
    }
}

#[test]
fn a_refused_move_adds_no_history_and_keeps_the_revision() {
    let mut engine = fixture();
    let revision = engine.revision;
    let steps = engine.checkpoint()["undo"].as_array().unwrap().len();
    assert!(mv(&mut engine, "root", "work", None).is_err());
    assert!(mv(&mut engine, "bin", "bin", None).is_err());
    assert_eq!(engine.revision, revision);
    assert_eq!(engine.checkpoint()["undo"].as_array().unwrap().len(), steps);
}

#[test]
fn a_move_to_an_unknown_layer_or_parent_or_a_bad_index_is_refused_and_changes_nothing() {
    let mut engine = fixture();
    let before = engine.site.clone();
    assert!(mv(&mut engine, "ghost", "bin", None).is_err());
    assert!(mv(&mut engine, "i1", "ghost", None).is_err());
    assert!(mv(&mut engine, "i1", "bin", Some(3)).is_err());
    assert!(mv(&mut engine, "i1", "bin", Some(99)).is_err());
    for bad in [json!(-1), json!(0.5), json!("0"), json!(null)] {
        assert!(run(&mut engine, "node.move", json!({"id": "i1", "parent": "bin", "index": bad})).is_err(), "{bad}");
    }
    assert_eq!(engine.site, before);
}

#[test]
fn a_layer_cannot_be_moved_into_an_element_that_cannot_hold_children() {
    let mut engine = fixture();
    run(&mut engine, "node.add", json!({"parent": "work", "node": {"id": "pic", "tag": "img", "attrs": {"src": "/x.png", "alt": "x"}}})).unwrap();
    let before = engine.site.clone();
    assert!(mv(&mut engine, "i1", "pic", None).is_err());
    assert_eq!(engine.site, before);
}

#[test]
fn a_batch_of_several_moves_is_one_undo_step() {
    let mut engine = fixture();
    let before = engine.site.clone();
    let commands = drop_commands(&engine, &["i2", "i4", "i5"], "bin", None);
    assert_eq!(commands.len(), 3);
    let depth = undo_depth(&engine);
    engine.batch(&commands, None).unwrap();
    assert_eq!(undo_depth(&engine), depth + 1);
    assert_eq!(children(&engine, "bin"), ids(&["j1", "j2", "i2", "i4", "i5"]));
    undo(&mut engine);
    assert_eq!(undo_depth(&engine), depth);
    assert_eq!(engine.site, before);
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i2", "i3", "i4", "i5"]));
    redo(&mut engine);
    assert_eq!(children(&engine, "bin"), ids(&["j1", "j2", "i2", "i4", "i5"]));
}

#[test]
fn several_moved_siblings_keep_their_relative_order_when_dropped_into_the_end_of_a_container() {
    let mut engine = fixture();
    let commands = drop_commands(&engine, &["i2", "i4", "i5"], "bin2", None);
    engine.batch(&commands, None).unwrap();
    assert_eq!(children(&engine, "bin2"), ids(&["i2", "i4", "i5"]));
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i3"]));
}

#[test]
fn several_moved_siblings_keep_their_relative_order_when_dropped_before_another_layer() {
    let mut engine = fixture();
    let commands = drop_commands(&engine, &["i3", "i5", "i2"], "lane", Some("i1"));
    engine.batch(&commands, None).unwrap();
    assert_eq!(children(&engine, "lane"), ids(&["i3", "i5", "i2", "i1", "i4"]));
}

#[test]
fn several_moved_siblings_keep_their_relative_order_when_dropped_inside_a_list_between_two_layers() {
    let mut engine = fixture();
    let commands = drop_commands(&engine, &["i1", "i2"], "bin", Some("j2"));
    engine.batch(&commands, None).unwrap();
    assert_eq!(children(&engine, "bin"), ids(&["j1", "i1", "i2", "j2"]));
    assert_eq!(children(&engine, "lane"), ids(&["i3", "i4", "i5"]));
}

#[test]
fn moved_layers_from_different_parents_land_in_the_order_they_were_picked() {
    let mut engine = fixture();
    let commands = drop_commands(&engine, &["j1", "i3", "j2"], "bin2", None);
    engine.batch(&commands, None).unwrap();
    assert_eq!(children(&engine, "bin2"), ids(&["j1", "i3", "j2"]));
    assert_eq!(children(&engine, "bin"), Vec::<String>::new());
    assert_eq!(children(&engine, "lane"), ids(&["i1", "i2", "i4", "i5"]));
}

#[test]
fn a_batch_with_one_refused_move_moves_nothing() {
    let mut engine = fixture();
    let before = engine.site.clone();
    let revision = engine.revision;
    let commands = vec![
        json!({"command": "node.move", "params": {"id": "i1", "parent": "bin2"}}),
        json!({"command": "node.move", "params": {"id": "i2", "parent": "bin2"}}),
        json!({"command": "node.move", "params": {"id": "root", "parent": "bin2"}}),
    ];
    assert!(engine.batch(&commands, None).is_err());
    assert_eq!(engine.site, before);
    assert_eq!(engine.revision, revision);
}

#[test]
fn a_moved_tree_is_still_a_valid_site_that_reads_back() {
    let mut engine = fixture();
    mv(&mut engine, "lane", "bin", Some(1)).unwrap();
    mv(&mut engine, "i3", "bin2", None).unwrap();
    let text = serde_json::to_string(&engine.site).unwrap();
    let mut other = Engine::new().unwrap();
    other.load(serde_json::from_str(&text).unwrap(), None).unwrap();
    assert_eq!(other.site, engine.site);
}
