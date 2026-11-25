mod common;
use common::*;
use formweb_engine::Engine;
use formweb_model::Site;
use serde_json::json;
use std::collections::BTreeSet;

fn subtree(site: &Site, root: &str) -> Vec<String> {
    let mut order = vec![];
    let mut stack = vec![root.to_string()];
    while let Some(id) = stack.pop() {
        stack.extend(site.nodes[&id].children.iter().rev().cloned());
        order.push(id);
    }
    order
}

fn fixture() -> Engine {
    let mut engine = engine();
    with_pages(&mut engine, &["fares"]);
    add_div(&mut engine, "fares-root", "fares-box");
    add_p(&mut engine, "fares-box", "fares-a");
    add_p(&mut engine, "fares-box", "fares-b");
    add_p(&mut engine, "fares-root", "fares-c");
    run(&mut engine, "node.update", json!({"id": "fares-a", "patch": {"styles": {"color": "#112233"}, "text": "Adult single"}})).unwrap();
    engine
}

fn page<'a>(site: &'a Site, id: &str) -> &'a formweb_model::Page {
    site.pages.iter().find(|p| p.id == id).unwrap()
}

fn duplicate(engine: &mut Engine, id: &str, slug: &str) -> String {
    let before: BTreeSet<String> = engine.site.pages.iter().map(|p| p.id.clone()).collect();
    run(engine, "page.duplicate", json!({"id": id, "slug": slug})).unwrap();
    engine.site.pages.iter().map(|p| p.id.clone()).find(|id| !before.contains(id)).unwrap()
}

#[test]
fn a_duplicated_page_has_every_element_of_the_original_under_new_ids() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    let original = subtree(&engine.site, "fares-root");
    let copied = subtree(&engine.site, &page(&engine.site, &copy).root);
    assert_eq!(original.len(), 5);
    assert_eq!(copied.len(), original.len());
    let originals: BTreeSet<&String> = original.iter().collect();
    for id in &copied {
        assert!(!originals.contains(id), "{id} is shared with the original");
    }
    for (from, to) in original.iter().zip(&copied) {
        let (a, b) = (&engine.site.nodes[from], &engine.site.nodes[to]);
        assert_eq!((&a.tag, &a.text, &a.styles, &a.attrs, a.children.len()), (&b.tag, &b.text, &b.styles, &b.attrs, b.children.len()), "{from} vs {to}");
    }
}

#[test]
fn a_duplicated_page_gets_the_slug_it_was_given_and_the_original_keeps_its_own() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    assert_eq!(page(&engine.site, &copy).slug, "/fares-copy");
    assert_eq!(page(&engine.site, "fares").slug, "/fares");
    assert_ne!(page(&engine.site, &copy).id, "fares");
    assert_ne!(page(&engine.site, &copy).root, "fares-root");
}

#[test]
fn a_duplicated_page_is_named_copy_of_the_original_unless_a_name_is_given() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    assert_eq!(page(&engine.site, &copy).name, "fares copy");
    run(&mut engine, "page.duplicate", json!({"id": "fares", "slug": "/fares-two", "name": "Fares again"})).unwrap();
    assert!(engine.site.pages.iter().any(|p| p.name == "Fares again" && p.slug == "/fares-two"));
}

#[test]
fn a_duplicate_with_the_address_of_an_existing_page_is_refused_and_changes_nothing() {
    let mut engine = fixture();
    let before = engine.site.clone();
    for slug in ["/fares", "fares", "/fares/", "/", "", "/fares copy", "/a//b"] {
        let reason = run(&mut engine, "page.duplicate", json!({"id": "fares", "slug": slug})).unwrap_err();
        assert!(!reason.trim().is_empty(), "{slug:?}");
        assert_eq!(engine.site, before, "{slug:?}");
    }
    assert!(run(&mut engine, "page.duplicate", json!({"id": "ghost", "slug": "/ghost"})).is_err());
    assert_eq!(engine.site, before);
}

#[test]
fn changing_the_copy_does_not_change_the_original() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    let original = subtree(&engine.site, "fares-root");
    let copied = subtree(&engine.site, &page(&engine.site, &copy).root);
    let snapshot: Vec<_> = original.iter().map(|id| engine.site.nodes[id].clone()).collect();
    run(&mut engine, "node.update", json!({"id": copied[2], "patch": {"text": "Changed in the copy", "styles": {"color": "#ff0000"}, "attrs": {"title": "t"}}})).unwrap();
    run(&mut engine, "node.add", json!({"parent": copied[0], "node": {"id": "only-in-copy", "tag": "p", "text": "new"}})).unwrap();
    run(&mut engine, "node.remove", json!({"id": copied[4]})).unwrap();
    let now: Vec<_> = original.iter().map(|id| engine.site.nodes[id].clone()).collect();
    assert_eq!(snapshot, now);
    assert_eq!(subtree(&engine.site, "fares-root"), original);
}

#[test]
fn changing_the_original_does_not_change_the_copy() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    let copied = subtree(&engine.site, &page(&engine.site, &copy).root);
    let snapshot: Vec<_> = copied.iter().map(|id| engine.site.nodes[id].clone()).collect();
    run(&mut engine, "node.update", json!({"id": "fares-a", "patch": {"text": "Changed in the original", "styles": {"color": "#00ff00"}}})).unwrap();
    run(&mut engine, "node.remove", json!({"id": "fares-box"})).unwrap();
    add_p(&mut engine, "fares-root", "fares-late");
    let now: Vec<_> = copied.iter().map(|id| engine.site.nodes[id].clone()).collect();
    assert_eq!(snapshot, now);
    assert_eq!(subtree(&engine.site, &page(&engine.site, &copy).root), copied);
}

#[test]
fn removing_the_original_page_leaves_the_copy_whole() {
    let mut engine = fixture();
    let copy = duplicate(&mut engine, "fares", "/fares-copy");
    let copied = subtree(&engine.site, &page(&engine.site, &copy).root);
    run(&mut engine, "page.remove", json!({"id": "fares"})).unwrap();
    assert!(!engine.site.nodes.contains_key("fares-root"));
    for id in &copied {
        assert!(engine.site.nodes.contains_key(id), "{id}");
    }
}

#[test]
fn duplicating_a_page_is_one_undo_step_that_removes_the_copy_completely() {
    let mut engine = fixture();
    let before = engine.site.clone();
    let depth = undo_depth(&engine);
    duplicate(&mut engine, "fares", "/fares-copy");
    assert_eq!(engine.site.pages.len(), before.pages.len() + 1);
    assert_eq!(engine.site.nodes.len(), before.nodes.len() + 5);
    assert_eq!(undo_depth(&engine), depth + 1);
    undo(&mut engine);
    assert_eq!(engine.site, before);
}

#[test]
fn duplicating_twice_makes_two_separate_copies_with_their_own_addresses() {
    let mut engine = fixture();
    let first = duplicate(&mut engine, "fares", "/fares-copy");
    let second = duplicate(&mut engine, "fares", "/fares-copy-2");
    let a: BTreeSet<String> = subtree(&engine.site, &page(&engine.site, &first).root).into_iter().collect();
    let b: BTreeSet<String> = subtree(&engine.site, &page(&engine.site, &second).root).into_iter().collect();
    assert!(a.is_disjoint(&b));
    assert_eq!(a.len(), b.len());
    let slugs: BTreeSet<&str> = engine.site.pages.iter().map(|p| p.slug.as_str()).collect();
    assert_eq!(slugs.len(), engine.site.pages.len());
}

#[test]
fn the_copy_lands_after_the_other_pages_so_the_home_page_stays_first() {
    let mut engine = fixture();
    duplicate(&mut engine, "fares", "/fares-copy");
    assert_eq!(engine.site.pages[0].id, "home");
    assert_eq!(engine.site.pages[0].slug, "/");
}

#[test]
fn the_home_page_with_its_collection_bindings_can_be_duplicated_and_the_copy_validates() {
    let mut engine = engine();
    let original = subtree(&engine.site, "root");
    let before = engine.site.clone();
    run(&mut engine, "page.duplicate", json!({"id": "home", "slug": "/home-copy"})).unwrap();
    let copy = engine.site.pages.iter().find(|p| p.slug == "/home-copy").unwrap();
    let copied = subtree(&engine.site, &copy.root);
    assert_eq!(copied.len(), original.len());
    assert!(original.iter().all(|id| !copied.contains(id)));
    formweb_model::validate(&engine.site).unwrap();
    undo(&mut engine);
    assert_eq!(engine.site, before);
}
