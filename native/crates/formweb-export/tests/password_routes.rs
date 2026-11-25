use formweb_model::{blank_node, starter, Page, Seo, Site};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const SECRET: &str = "Quillowbramble";

fn site() -> Site {
    let mut site = starter("Fixture");
    let home = site.pages[0].root.clone();
    for (id, tag) in [("find", "input"), ("found", "div"), ("found-one", "a")] {
        site.nodes.insert(id.into(), blank_node(id, tag, id, "", &[]));
        site.nodes.get_mut(&home).unwrap().children.push(id.into());
    }
    site.nodes.get_mut("find").unwrap().attrs.insert("aria-label".into(), "Search".into());
    site.nodes.get_mut("found-one").unwrap().attrs.insert("hidden".into(), "".into());
    for (id, slug, words) in [("staff", "/staff", format!("The {SECRET} rota")), ("rota", "/staff/rota", format!("{SECRET} week two")), ("fares", "/fares", "Adult single fares".to_string())] {
        let root = format!("{id}-root");
        site.nodes.insert(root.clone(), blank_node(&root, "main", id, "", &[]));
        site.nodes.insert(format!("{id}-p"), blank_node(&format!("{id}-p"), "p", "Text", &words, &[]));
        site.nodes.get_mut(&root).unwrap().children.push(format!("{id}-p"));
        site.pages.push(Page { id: id.into(), name: id.into(), slug: slug.into(), root, seo: Seo { title: id.into(), description: String::new(), noindex: false } });
    }
    site.extensions.insert("motion".into(), json!({"actions": {"find": [{"trigger": "input", "action": "search", "input": "find", "results": "found", "template": "found-one", "limit": 8}]}}));
    formweb_model::validate(&site).unwrap();
    site
}

fn files(site: &Site, params: Value) -> BTreeMap<String, String> {
    let output = formweb_export::export(site, &params).unwrap();
    output["files"].as_array().unwrap().iter().map(|f| (f["path"].as_str().unwrap().to_string(), f["content"].as_str().unwrap_or("").to_string())).collect()
}

fn indexed_paths(files: &BTreeMap<String, String>) -> Vec<String> {
    let entries: Vec<Value> = serde_json::from_str(&files["search-index.json"]).unwrap();
    entries.iter().map(|e| e["path"].as_str().unwrap().to_string()).collect()
}

#[test]
fn without_password_routes_every_page_is_in_the_search_index() {
    let out = files(&site(), json!({}));
    let paths = indexed_paths(&out);
    assert!(paths.contains(&"staff/".to_string()) && paths.contains(&"staff/rota/".to_string()) && paths.contains(&"fares/".to_string()), "{paths:?}");
}

#[test]
fn a_password_route_leaves_its_pages_and_the_pages_under_it_out_of_the_search_index() {
    let out = files(&site(), json!({"passwordRoutes": ["/staff"]}));
    let paths = indexed_paths(&out);
    assert!(!paths.iter().any(|p| p.starts_with("staff/")), "{paths:?}");
    assert!(paths.contains(&"fares/".to_string()));
    assert!(!out["search-index.json"].contains(SECRET));
    assert!(out["staff/index.html"].contains(SECRET));
}

#[test]
fn a_members_only_route_leaves_its_pages_out_of_the_search_index_and_keeps_the_page_itself() {
    let mut site = site();
    site.extensions.insert("integrations".into(), json!({"gates": [{"route": "/staff", "groups": ["crew"]}]}));
    formweb_model::validate(&site).unwrap();
    let out = files(&site, json!({"privateMembers": true}));
    let paths = indexed_paths(&out);
    assert_eq!(paths.iter().filter(|p| p.starts_with("staff/")).count(), 0, "{paths:?}");
    assert!(paths.contains(&"fares/".to_string()));
    assert!(!out["search-index.json"].contains(SECRET));
    assert!(out["staff/index.html"].contains(SECRET));
}

#[test]
fn a_password_on_the_whole_site_leaves_every_page_out_of_the_search_index() {
    let out = files(&site(), json!({"passwordRoutes": ["/"]}));
    assert_eq!(indexed_paths(&out), Vec::<String>::new());
}
