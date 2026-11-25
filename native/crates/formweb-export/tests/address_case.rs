use formweb_model::{blank_node, starter, Page, Seo, Site};
use serde_json::{json, Value};

fn add_page(site: &mut Site, id: &str, slug: &str) {
    let root = format!("{id}-root");
    site.nodes.insert(root.clone(), blank_node(&root, "main", id, "", &[]));
    site.pages.push(Page { id: id.into(), name: id.into(), slug: slug.into(), root, seo: Seo { title: id.into(), description: String::new(), noindex: false } });
}

fn warnings(site: &Site) -> Vec<String> {
    let output: Value = formweb_export::export(site, &json!({})).unwrap();
    output["warnings"].as_array().unwrap().iter().map(|w| w.as_str().unwrap().to_string()).collect()
}

#[test]
fn an_older_site_whose_addresses_differ_only_in_capitals_still_exports_with_a_warning_naming_both_folders() {
    let mut site = starter("Fixture");
    add_page(&mut site, "two", "/two");
    add_page(&mut site, "shout", "/TWO");
    formweb_model::validate(&site).unwrap();
    let said: Vec<_> = warnings(&site).into_iter().filter(|w| w.contains("capital letters")).collect();
    assert_eq!(said.len(), 1, "{said:?}");
    assert!(said[0].contains("two/index.html") && said[0].contains("TWO/index.html"), "{}", said[0]);
}

#[test]
fn a_site_with_distinct_addresses_gets_no_capital_letters_warning() {
    let mut site = starter("Fixture");
    add_page(&mut site, "two", "/two");
    add_page(&mut site, "three", "/three");
    assert!(warnings(&site).iter().all(|w| !w.contains("capital letters")));
}
