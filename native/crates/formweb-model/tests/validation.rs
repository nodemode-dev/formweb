use formweb_model::{blank, blank_node, starter, validate, Site};

fn refused(site: &Site) -> String {
    validate(site).expect_err("the invalid site must be refused")
}

fn with_node(site: &mut Site, parent: &str, id: &str, tag: &str) {
    site.nodes.insert(id.into(), blank_node(id, tag, id, "", &[]));
    site.nodes.get_mut(parent).unwrap().children.push(id.into());
}

#[test]
fn the_starter_and_the_blank_site_are_valid() {
    validate(&starter("Fixture")).unwrap();
    validate(&blank("Fixture")).unwrap();
}

#[test]
fn a_site_survives_a_json_round_trip_unchanged() {
    let site = starter("Fixture");
    let text = serde_json::to_string(&site).unwrap();
    let back: Site = serde_json::from_str(&text).unwrap();
    assert_eq!(site, back);
    assert_eq!(text, serde_json::to_string(&back).unwrap());
}

#[test]
fn unknown_fields_in_a_document_are_refused() {
    let mut value = serde_json::to_value(starter("Fixture")).unwrap();
    value.as_object_mut().unwrap().insert("surprise".into(), serde_json::json!(1));
    assert!(serde_json::from_value::<Site>(value).is_err());
}

#[test]
fn a_child_that_does_not_exist_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("root").unwrap().children.push("ghost".into());
    refused(&site);
}

#[test]
fn a_node_with_two_parents_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("footer").unwrap().children.push("brand".into());
    refused(&site);
}

#[test]
fn a_node_listed_twice_under_one_parent_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("nav").unwrap().children.push("nav-work".into());
    refused(&site);
}

#[test]
fn a_node_outside_every_page_tree_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.insert("orphan".into(), blank_node("orphan", "p", "orphan", "", &[]));
    refused(&site);
}

#[test]
fn a_cycle_in_the_tree_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.insert("a".into(), blank_node("a", "div", "a", "", &[]));
    site.nodes.insert("b".into(), blank_node("b", "div", "b", "", &[]));
    site.nodes.get_mut("a").unwrap().children.push("b".into());
    site.nodes.get_mut("b").unwrap().children.push("a".into());
    refused(&site);
}

#[test]
fn nesting_deeper_than_one_hundred_is_refused() {
    let mut site = blank("Fixture");
    let mut parent = "root".to_string();
    for index in 0..102 {
        let id = format!("deep-{index}");
        with_node(&mut site, &parent, &id, "div");
        parent = id;
    }
    refused(&site);
}

#[test]
fn a_page_root_that_is_missing_or_has_a_parent_is_refused() {
    let mut site = starter("Fixture");
    site.pages[0].root = "nowhere".into();
    refused(&site);
    let mut site = starter("Fixture");
    site.nodes.get_mut("hero").unwrap().children.push("root".into());
    refused(&site);
}

#[test]
fn a_node_key_that_differs_from_its_id_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("brand").unwrap().id = "other".into();
    refused(&site);
}

#[test]
fn script_style_and_unknown_tags_are_refused() {
    for tag in ["script", "style", "iframe", "object", "embed", "marquee"] {
        let mut site = starter("Fixture");
        with_node(&mut site, "root", "bad", tag);
        refused(&site);
    }
}

#[test]
fn event_handler_attributes_are_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("cta").unwrap().attrs.insert("onclick".into(), "x".into());
    refused(&site);
}

#[test]
fn unsafe_link_targets_are_refused() {
    for url in ["javascript:run()", "JaVaScRiPt:run()", " https://example.org", "//evil.example/x", "data:text/html,x", "https://a.example/\"x"] {
        let mut site = starter("Fixture");
        site.nodes.get_mut("cta").unwrap().attrs.insert("href".into(), url.into());
        refused(&site);
    }
}

#[test]
fn ordinary_link_targets_are_accepted() {
    for url in ["/about", "about/", "#top", "?q=1", "https://example.org/a?b=c#d", "mailto:a@example.org", "tel:+15550100"] {
        let mut site = starter("Fixture");
        site.nodes.get_mut("cta").unwrap().attrs.insert("href".into(), url.into());
        validate(&site).unwrap();
    }
}

#[test]
fn unsafe_styles_are_refused_on_a_node_and_on_a_breakpoint() {
    for (name, value) in [("background", "url(https://evil.example/x.png)"), ("color", "red; position: fixed"), ("width", "expression(1)"), ("content", "\"a\" }"), ("behavior", "x"), ("padding", "@import")] {
        let mut site = starter("Fixture");
        site.nodes.get_mut("hero").unwrap().styles.insert(name.into(), value.into());
        refused(&site);
        let mut site = starter("Fixture");
        site.nodes.get_mut("hero").unwrap().breakpoints.get_mut("mobile").unwrap().insert(name.into(), value.into());
        refused(&site);
    }
}

#[test]
fn a_breakpoint_override_for_an_unknown_breakpoint_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("hero").unwrap().breakpoints.insert("watch".into(), [("gap".to_string(), "1px".to_string())].into());
    refused(&site);
}

#[test]
fn void_elements_cannot_hold_content() {
    let mut site = starter("Fixture");
    with_node(&mut site, "root", "pic", "img");
    site.nodes.get_mut("pic").unwrap().text = "caption".into();
    refused(&site);
}

#[test]
fn duplicate_page_slugs_and_ids_are_refused() {
    let mut site = starter("Fixture");
    let mut page = site.pages[0].clone();
    page.id = "second".into();
    page.root = "second-root".into();
    site.nodes.insert("second-root".into(), blank_node("second-root", "main", "Second", "", &[]));
    site.pages.push(page);
    refused(&site);
    site.pages[1].slug = "/two".into();
    validate(&site).unwrap();
    site.pages[1].id = "home".into();
    refused(&site);
}

#[test]
fn a_site_needs_a_page_a_breakpoint_and_a_known_schema() {
    let mut site = starter("Fixture");
    site.pages.clear();
    refused(&site);
    let mut site = starter("Fixture");
    site.breakpoints.clear();
    refused(&site);
    let mut site = starter("Fixture");
    site.schema_version = 2;
    refused(&site);
}

#[test]
fn a_site_over_eight_mebibytes_is_refused() {
    let mut big = starter("Fixture");
    for index in 0..9 {
        let id = format!("blob-{index}");
        with_node(&mut big, "root", &id, "p");
        big.nodes.get_mut(&id).unwrap().text = "x".repeat(100_000);
    }
    validate(&big).unwrap();
    for index in 0..90 {
        let id = format!("more-{index}");
        with_node(&mut big, "root", &id, "p");
        big.nodes.get_mut(&id).unwrap().text = "x".repeat(100_000);
    }
    assert!(refused(&big).contains("8 MiB"));
}

#[test]
fn a_collection_item_must_match_its_field_types() {
    let mut site = starter("Fixture");
    let collection = site.collections.get_mut("projects").unwrap();
    collection.items.push(formweb_model::Item { id: "one".into(), slug: "one".into(), values: [("title".to_string(), serde_json::json!(5))].into(), status: "published".into() });
    refused(&site);
    let item = site.collections.get_mut("projects").unwrap().items.last_mut().unwrap();
    item.values.insert("title".into(), serde_json::json!("Five"));
    item.values.insert("summary".into(), serde_json::json!("Summary"));
    validate(&site).unwrap();
    site.collections.get_mut("projects").unwrap().items.last_mut().unwrap().status = "live".into();
    refused(&site);
}

#[test]
fn a_binding_to_an_unknown_collection_is_refused() {
    let mut site = starter("Fixture");
    site.nodes.get_mut("project-card").unwrap().binding = Some(formweb_model::Binding { collection: "nope".into(), field: None });
    refused(&site);
}
