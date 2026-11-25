mod common;
use common::*;
use formweb_engine::Engine;
use serde_json::json;

fn two() -> Engine {
    let mut engine = engine();
    run(&mut engine, "page.add", json!({"id": "two", "root": "two-root", "name": "Two", "slug": "/two"})).unwrap();
    engine
}

fn slugs(engine: &Engine) -> Vec<String> {
    engine.site.pages.iter().map(|page| page.slug.clone()).collect()
}

#[test]
fn a_new_page_cannot_take_an_address_that_differs_only_in_capital_letters_and_the_refusal_names_the_page() {
    let mut engine = two();
    let before = engine.site.clone();
    let refusal = run(&mut engine, "page.add", json!({"name": "Shouting", "slug": "/TWO"})).unwrap_err();
    assert!(refusal.contains("Two"), "{refusal}");
    assert!(refusal.contains("/two") && refusal.contains("/TWO"), "{refusal}");
    assert_eq!(engine.site, before);
}

#[test]
fn a_new_page_cannot_take_the_same_address_and_is_told_which_page_has_it() {
    let mut engine = two();
    let refusal = run(&mut engine, "page.add", json!({"name": "Again", "slug": "two/"})).unwrap_err();
    assert_eq!(refusal, "/two is already the address of Two. Choose another address.");
}

#[test]
fn changing_a_page_address_to_another_page_address_in_other_capitals_is_refused() {
    let mut engine = two();
    run(&mut engine, "page.add", json!({"id": "three", "root": "three-root", "name": "Three", "slug": "/three"})).unwrap();
    let before = engine.site.clone();
    let refusal = run(&mut engine, "page.update", json!({"id": "three", "patch": {"slug": "/Two"}})).unwrap_err();
    assert!(refusal.contains("Two") && refusal.contains("capital"), "{refusal}");
    assert_eq!(engine.site, before);
}

#[test]
fn a_page_may_change_the_capitals_of_its_own_address() {
    let mut engine = two();
    run(&mut engine, "page.update", json!({"id": "two", "patch": {"slug": "/Two"}})).unwrap();
    assert!(slugs(&engine).contains(&"/Two".to_string()));
}

#[test]
fn a_duplicate_cannot_take_an_address_in_other_capitals() {
    let mut engine = two();
    let before = engine.site.clone();
    assert!(run(&mut engine, "page.duplicate", json!({"id": "two", "slug": "/TWO"})).is_err());
    assert_eq!(engine.site, before);
}

#[test]
fn a_bulk_create_whose_rows_differ_only_in_capitals_creates_nothing() {
    let mut engine = two();
    let before = engine.site.clone();
    assert!(run(&mut engine, "page.bulk", json!({"template": "two", "rows": [{"slug": "/fares"}, {"slug": "/Fares"}]})).is_err());
    assert_eq!(engine.site, before);
}

#[test]
fn set_as_home_cannot_give_the_old_home_an_address_another_page_has_in_other_capitals() {
    let mut engine = two();
    run(&mut engine, "page.add", json!({"id": "about", "root": "about-root", "name": "About", "slug": "/Home"})).unwrap();
    let home = engine.site.pages[0].id.clone();
    let before = engine.site.clone();
    let swap = [json!({"command": "page.update", "params": {"id": home, "patch": {"slug": "/home"}}}), json!({"command": "page.update", "params": {"id": "two", "patch": {"slug": "/"}}})];
    let refusal = engine.batch(&swap, None).unwrap_err();
    assert!(refusal.contains("About"), "{refusal}");
    assert_eq!(engine.site, before);
}

#[test]
fn a_cms_item_cannot_take_a_slug_another_item_has_in_other_capitals_but_can_be_saved_unchanged() {
    let mut engine = engine();
    let item = |id: &str, slug: &str| json!({"collection": "projects", "item": {"id": id, "slug": slug, "status": "published", "values": {"title": "T", "summary": "S"}}});
    let before = engine.site.clone();
    assert!(run(&mut engine, "cms.upsert", item("new-one", "Field-Notes")).is_err());
    assert_eq!(engine.site, before);
    run(&mut engine, "cms.upsert", item("field-notes", "field-notes")).unwrap();
    run(&mut engine, "cms.upsert", item("new-one", "fresh-notes")).unwrap();
    assert!(run(&mut engine, "cms.upsert", item("new-one", "FIELD-NOTES")).is_err());
}

#[test]
fn an_older_site_with_two_addresses_in_different_capitals_still_opens_and_the_audit_names_the_clash() {
    let mut engine = two();
    let mut document = serde_json::to_value(&engine.site).unwrap();
    let mut copy = document["pages"][1].clone();
    copy["id"] = json!("shout");
    copy["name"] = json!("Shout");
    copy["slug"] = json!("/TWO");
    copy["root"] = json!("shout-root");
    document["nodes"]["shout-root"] = document["nodes"]["two-root"].clone();
    document["nodes"]["shout-root"]["id"] = json!("shout-root");
    document["pages"].as_array_mut().unwrap().push(copy);
    engine.load(document, None).unwrap();
    assert_eq!(slugs(&engine)[1..], ["/two".to_string(), "/TWO".to_string()]);
    let report = formweb_engine::audit(&engine.site);
    let clash: Vec<_> = report["issues"].as_array().unwrap().iter().filter(|issue| issue["code"] == "page.address-case").collect();
    assert_eq!(clash.len(), 1);
    assert_eq!(clash[0]["page"], "shout");
    let message = clash[0]["message"].as_str().unwrap();
    assert!(message.contains("Two") && message.contains("Shout"), "{message}");
    run(&mut engine, "page.update", json!({"id": "shout", "patch": {"name": "Loud"}})).unwrap();
    run(&mut engine, "page.update", json!({"id": "shout", "patch": {"slug": "/loud"}})).unwrap();
    assert!(formweb_engine::audit(&engine.site)["issues"].as_array().unwrap().iter().all(|issue| issue["code"] != "page.address-case"));
}
