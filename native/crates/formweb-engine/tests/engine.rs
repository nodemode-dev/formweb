use formweb_engine::Engine;
use formweb_model::Site;
use serde_json::{json, Value};

fn engine() -> Engine {
    let mut engine = Engine::new().unwrap();
    engine.reset("Fixture", false).unwrap();
    engine
}

fn add(engine: &mut Engine, id: &str, text: &str) -> Result<Value, String> {
    engine.execute("node.add", &json!({"parent": "work", "node": {"id": id, "tag": "p", "text": text}}), None)
}

fn snapshot(engine: &Engine) -> Site {
    engine.site.clone()
}

#[test]
fn undo_restores_the_exact_site_and_redo_restores_the_edit() {
    let mut engine = engine();
    let before = snapshot(&engine);
    add(&mut engine, "note", "hello").unwrap();
    let after = snapshot(&engine);
    assert_ne!(before, after);
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.site, before);
    engine.execute("history.redo", &json!({}), None).unwrap();
    assert_eq!(engine.site, after);
}

#[test]
fn undo_walks_back_through_every_step_in_order() {
    let mut engine = engine();
    let mut states = vec![snapshot(&engine)];
    for index in 0..5 {
        add(&mut engine, &format!("note-{index}"), "x").unwrap();
        states.push(snapshot(&engine));
    }
    for expected in states.iter().rev().skip(1) {
        engine.execute("history.undo", &json!({}), None).unwrap();
        assert_eq!(&engine.site, expected);
    }
    assert_eq!(engine.state()["canUndo"], json!(false));
    assert_eq!(engine.state()["canRedo"], json!(true));
    for expected in states.iter().skip(1) {
        engine.execute("history.redo", &json!({}), None).unwrap();
        assert_eq!(&engine.site, expected);
    }
    assert_eq!(engine.state()["canRedo"], json!(false));
}

#[test]
fn undo_and_redo_with_nothing_to_do_are_refused_and_change_nothing() {
    let mut engine = engine();
    let revision = engine.revision;
    assert!(engine.execute("history.undo", &json!({}), None).is_err());
    assert!(engine.execute("history.redo", &json!({}), None).is_err());
    assert_eq!(engine.revision, revision);
}

#[test]
fn a_new_edit_after_undo_discards_the_redo_branch() {
    let mut engine = engine();
    add(&mut engine, "first", "a").unwrap();
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.state()["canRedo"], json!(true));
    add(&mut engine, "second", "b").unwrap();
    assert_eq!(engine.state()["canRedo"], json!(false));
    assert!(engine.execute("history.redo", &json!({}), None).is_err());
}

#[test]
fn a_batch_is_one_undo_step() {
    let mut engine = engine();
    let before = snapshot(&engine);
    let commands: Vec<Value> = (0..4).map(|i| json!({"command": "node.add", "params": {"parent": "work", "node": {"id": format!("b-{i}"), "tag": "p", "text": "x"}}})).collect();
    engine.batch(&commands, None).unwrap();
    assert_eq!(engine.site.nodes.len(), before.nodes.len() + 4);
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.site, before);
}

#[test]
fn a_batch_with_one_bad_command_changes_nothing() {
    let mut engine = engine();
    let before = snapshot(&engine);
    let revision = engine.revision;
    let commands = vec![
        json!({"command": "node.add", "params": {"parent": "work", "node": {"id": "good", "tag": "p", "text": "x"}}}),
        json!({"command": "node.add", "params": {"parent": "work", "node": {"id": "bad", "tag": "script", "text": "x"}}}),
    ];
    assert!(engine.batch(&commands, None).is_err());
    assert_eq!(engine.site, before);
    assert_eq!(engine.revision, revision);
    assert_eq!(engine.state()["canUndo"], json!(false));
}

#[test]
fn history_commands_cannot_be_batched() {
    let mut engine = engine();
    add(&mut engine, "x", "x").unwrap();
    assert!(engine.batch(&[json!({"command": "history.undo", "params": {}})], None).is_err());
}

#[test]
fn an_empty_batch_is_refused() {
    let mut engine = engine();
    assert!(engine.batch(&[], None).is_err());
}

#[test]
fn commands_that_would_make_an_invalid_tree_are_refused_and_leave_the_site_alone() {
    let mut engine = engine();
    let before = snapshot(&engine);
    let attempts = [
        ("node.add", json!({"parent": "work", "node": {"tag": "iframe"}})),
        ("node.add", json!({"parent": "work", "node": {"tag": "a", "attrs": {"href": "javascript:run()"}}})),
        ("node.add", json!({"parent": "work", "node": {"tag": "p", "attrs": {"onclick": "x"}}})),
        ("node.add", json!({"parent": "nowhere", "node": {"tag": "p"}})),
        ("node.add", json!({"parent": "work", "node": {"id": "brand", "tag": "p"}})),
        ("node.update", json!({"id": "hero", "patch": {"styles": {"background": "url(https://evil.example/x)"}}})),
        ("node.update", json!({"id": "hero", "patch": {"id": "renamed"}})),
        ("node.move", json!({"id": "work", "parent": "work-grid"})),
        ("node.move", json!({"id": "root", "parent": "work"})),
        ("node.remove", json!({"id": "root"})),
        ("node.remove", json!({"id": "ghost"})),
        ("page.remove", json!({"id": "home"})),
        ("page.add", json!({"name": "Dup", "slug": "/"})),
        ("no.such.command", json!({})),
    ];
    for (command, params) in attempts {
        assert!(engine.execute(command, &params, None).is_err(), "{command} {params} should be refused");
        assert_eq!(engine.site, before, "{command} changed the site");
    }
    assert_eq!(engine.state()["canUndo"], json!(false));
}

#[test]
fn removing_a_node_removes_its_whole_subtree_and_undo_brings_it_back() {
    let mut engine = engine();
    let before = snapshot(&engine);
    assert!(engine.execute("node.remove", &json!({"id": "hero"}), None).is_err(), "the subtree holds a component source");
    assert_eq!(engine.site, before);
    engine.execute("node.remove", &json!({"id": "proof"}), None).unwrap();
    for gone in ["proof", "proof-1", "proof-2", "proof-3"] {
        assert!(!engine.site.nodes.contains_key(gone), "{gone}");
    }
    assert!(!engine.site.nodes["root"].children.contains(&"proof".to_string()));
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.site, before);
}

#[test]
fn a_command_that_changes_nothing_adds_no_history() {
    let mut engine = engine();
    engine.execute("token.set", &json!({"name": "brand", "value": "#112233"}), None).unwrap();
    let revision = engine.revision;
    engine.execute("token.set", &json!({"name": "brand", "value": "#112233"}), None).unwrap();
    assert_eq!(engine.revision, revision);
}

#[test]
fn a_stale_expected_revision_is_a_conflict_and_changes_nothing() {
    let mut engine = engine();
    add(&mut engine, "one", "x").unwrap();
    let before = snapshot(&engine);
    let stale = engine.revision - 1;
    let error = engine.execute("node.add", &json!({"parent": "work", "node": {"id": "two", "tag": "p"}}), Some(stale)).unwrap_err();
    assert!(error.contains("revision conflict"), "{error}");
    assert_eq!(engine.site, before);
    engine.execute("node.add", &json!({"parent": "work", "node": {"id": "two", "tag": "p"}}), Some(engine.revision)).unwrap();
}

#[test]
fn every_accepted_edit_raises_the_revision_by_one() {
    let mut engine = engine();
    let start = engine.revision;
    add(&mut engine, "a", "x").unwrap();
    assert_eq!(engine.revision, start + 1);
    engine.execute("history.undo", &json!({}), None).unwrap();
    assert_eq!(engine.revision, start + 2);
}

#[test]
fn a_checkpoint_restores_the_site_and_both_history_stacks_in_a_fresh_engine() {
    let mut engine = engine();
    add(&mut engine, "a", "x").unwrap();
    add(&mut engine, "b", "y").unwrap();
    add(&mut engine, "c", "z").unwrap();
    engine.execute("history.undo", &json!({}), None).unwrap();
    let checkpoint = engine.checkpoint();
    let mut other = Engine::new().unwrap();
    other.restore(&checkpoint, None, Some(engine.revision)).unwrap();
    assert_eq!(other.site, engine.site);
    assert_eq!(other.revision, engine.revision);
    assert_eq!(other.checkpoint(), engine.checkpoint());
    other.execute("history.redo", &json!({}), None).unwrap();
    engine.execute("history.redo", &json!({}), None).unwrap();
    assert_eq!(other.site, engine.site);
    for _ in 0..3 {
        other.execute("history.undo", &json!({}), None).unwrap();
        engine.execute("history.undo", &json!({}), None).unwrap();
        assert_eq!(other.site, engine.site);
    }
}

#[test]
fn a_checkpoint_with_history_from_another_site_is_refused() {
    let mut engine = engine();
    add(&mut engine, "a", "x").unwrap();
    let mut checkpoint = engine.checkpoint();
    checkpoint["undo"][0]["id"] = json!("another-site");
    let mut other = Engine::new().unwrap();
    assert!(other.restore(&checkpoint, None, None).is_err());
}

#[test]
fn a_checkpoint_with_an_invalid_site_or_unknown_key_or_schema_is_refused() {
    let mut engine = engine();
    add(&mut engine, "a", "x").unwrap();
    let good = engine.checkpoint();
    let mut other = Engine::new().unwrap();
    let before = other.site.clone();
    let mut bad = good.clone();
    bad["site"]["nodes"]["a"]["tag"] = json!("script");
    assert!(other.restore(&bad, None, None).is_err());
    let mut bad = good.clone();
    bad["extra"] = json!(1);
    assert!(other.restore(&bad, None, None).is_err());
    let mut bad = good.clone();
    bad["schemaVersion"] = json!(2);
    assert!(other.restore(&bad, None, None).is_err());
    assert_eq!(other.site, before);
}

#[test]
fn loading_an_invalid_document_is_refused_and_keeps_the_open_site() {
    let mut engine = engine();
    let before = snapshot(&engine);
    let mut broken = serde_json::to_value(&before).unwrap();
    broken["nodes"]["root"]["children"].as_array_mut().unwrap().push(json!("ghost"));
    assert!(engine.load(broken, None).is_err());
    assert_eq!(engine.site, before);
    assert!(engine.load(json!({"not": "a site"}), None).is_err());
    assert_eq!(engine.site, before);
}

#[test]
fn loading_a_valid_document_replaces_the_site_and_clears_history() {
    let mut engine = engine();
    add(&mut engine, "a", "x").unwrap();
    let mut other = formweb_model::starter("Other");
    other.id = "other-site".into();
    engine.load(serde_json::to_value(&other).unwrap(), None).unwrap();
    assert_eq!(engine.site, other);
    assert_eq!(engine.state()["canUndo"], json!(false));
}

#[test]
fn page_add_then_remove_returns_to_the_same_site() {
    let mut engine = engine();
    let before = snapshot(&engine);
    engine.execute("page.add", &json!({"id": "about", "root": "about-root", "name": "About", "slug": "/about"}), None).unwrap();
    assert_eq!(engine.site.pages.len(), 2);
    engine.execute("page.remove", &json!({"id": "about"}), None).unwrap();
    assert_eq!(engine.site.nodes.keys().collect::<Vec<_>>(), before.nodes.keys().collect::<Vec<_>>());
    assert_eq!(engine.site.pages, before.pages);
}

#[test]
fn the_audit_reports_a_missing_alt_text_and_a_placeholder_link() {
    let mut engine = engine();
    engine.execute("node.add", &json!({"parent": "work", "node": {"id": "pic", "tag": "img", "attrs": {"src": "/x.png"}}}), None).unwrap();
    engine.execute("node.add", &json!({"parent": "work", "node": {"id": "dead", "tag": "a", "text": "go", "attrs": {"href": "#"}}}), None).unwrap();
    let report = formweb_engine::audit(&engine.site);
    let codes: Vec<&str> = report["issues"].as_array().unwrap().iter().filter_map(|i| i["code"].as_str()).collect();
    assert!(codes.contains(&"a11y.alt"));
    assert!(codes.contains(&"link.placeholder"));
}
