use formweb_model::{blank_node, starter, Page, Seo, Site};
use serde_json::json;
use std::collections::BTreeMap;

fn add_page(site: &mut Site, id: &str, slug: &str) {
    let root = format!("{id}-root");
    site.nodes.insert(root.clone(), blank_node(&root, "main", id, "", &[("min-height", "100vh"), ("padding", "64px")]));
    site.nodes.insert(format!("{id}-h"), blank_node(&format!("{id}-h"), "h1", "Title", &format!("{id} heading"), &[]));
    site.nodes.get_mut(&root).unwrap().children.push(format!("{id}-h"));
    site.pages.push(Page { id: id.into(), name: id.into(), slug: slug.into(), root, seo: Seo { title: id.into(), description: String::new(), noindex: false } });
}

fn fixture() -> Site {
    let mut site = starter("Fixture");
    add_page(&mut site, "about", "/about");
    add_page(&mut site, "team", "/team");
    add_page(&mut site, "fares", "/fares");
    formweb_model::validate(&site).unwrap();
    site
}

fn compile(site: &Site) -> BTreeMap<String, String> {
    let output = formweb_export::export(site, &json!({})).unwrap();
    output["files"].as_array().unwrap().iter().map(|f| (f["path"].as_str().unwrap().to_string(), f["content"].as_str().unwrap_or("").to_string())).collect()
}

fn base_rule(css: &str, id: &str) -> String {
    let needle = format!("[data-fw-node=\"{id}\"]{{");
    let at = css.find(&needle).unwrap_or_else(|| panic!("no rule for {id}"));
    css[at..].split_once('}').unwrap().0.to_string()
}

fn declares_background(rule: &str) -> bool {
    rule.split(['{', ';']).any(|part| part.trim_start().starts_with("background"))
}

fn set_background(site: &mut Site, root: &str, value: &str) {
    site.nodes.get_mut(root).unwrap().styles.insert("background".into(), value.into());
}

#[test]
fn a_page_background_is_in_the_exported_css_for_that_pages_root() {
    let mut site = fixture();
    set_background(&mut site, "about-root", "#102030");
    let css = compile(&site)["assets/site.css"].clone();
    let rule = base_rule(&css, "about-root");
    assert!(rule.contains("background:#102030;"), "{rule}");
}

#[test]
fn a_page_background_is_in_the_exported_css_for_no_other_page() {
    let mut site = fixture();
    set_background(&mut site, "about-root", "#102030");
    let files = compile(&site);
    let css = &files["assets/site.css"];
    assert_eq!(css.matches("#102030").count(), 1);
    for other in ["team-root", "fares-root"] {
        assert!(!declares_background(&base_rule(css, other)), "{other}");
    }
    assert!(!base_rule(css, "root").contains("#102030"));
    assert!(files["team/index.html"].contains("data-fw-node=\"team-root\""));
    assert!(!files["team/index.html"].contains("about-root"));
}

#[test]
fn each_page_keeps_its_own_background_when_several_pages_set_one() {
    let mut site = fixture();
    set_background(&mut site, "about-root", "#102030");
    set_background(&mut site, "team-root", "linear-gradient(#fff, #eee)");
    let css = compile(&site)["assets/site.css"].clone();
    assert!(base_rule(&css, "about-root").contains("background:#102030;"));
    assert!(base_rule(&css, "team-root").contains("background:linear-gradient(#fff, #eee);"));
    assert!(!base_rule(&css, "team-root").contains("#102030"));
    assert!(!base_rule(&css, "about-root").contains("linear-gradient"));
    assert!(!declares_background(&base_rule(&css, "fares-root")));
}

#[test]
fn a_page_with_no_background_exports_no_background_declaration_for_its_root() {
    let site = fixture();
    let css = compile(&site)["assets/site.css"].clone();
    for page in ["about-root", "team-root", "fares-root"] {
        let rule = base_rule(&css, page);
        assert!(!rule.contains("background"), "{page}: {rule}");
    }
    assert!(base_rule(&css, "root").contains("background:var(--paper);"));
}

#[test]
fn removing_the_background_from_a_page_root_removes_the_declaration_from_the_export() {
    let mut site = fixture();
    set_background(&mut site, "about-root", "#102030");
    assert!(compile(&site)["assets/site.css"].contains("#102030"));
    site.nodes.get_mut("about-root").unwrap().styles.remove("background");
    let css = compile(&site)["assets/site.css"].clone();
    assert!(!css.contains("#102030"));
    assert!(!base_rule(&css, "about-root").contains("background"));
}

#[test]
fn a_token_background_exports_as_a_variable_reference_next_to_the_token_definition() {
    let mut site = fixture();
    site.tokens.insert("sand".into(), "#e9dccb".into());
    set_background(&mut site, "fares-root", "var(--sand)");
    let css = compile(&site)["assets/site.css"].clone();
    assert!(base_rule(&css, "fares-root").contains("background:var(--sand);"));
    assert!(css.contains("--sand:#e9dccb"), "{}", &css[..css.len().min(400)]);
    assert!(!declares_background(&base_rule(&css, "team-root")));
}

#[test]
fn a_mobile_background_override_is_written_only_inside_the_mobile_block_for_that_page() {
    let mut site = fixture();
    site.nodes.get_mut("team-root").unwrap().breakpoints.insert("mobile".into(), [("background".to_string(), "#abcdef".to_string())].into());
    let css = compile(&site)["assets/site.css"].clone();
    let mobile = css.find("@media(max-width:767px)").unwrap();
    assert_eq!(css.matches("#abcdef").count(), 1);
    assert!(css[mobile..].contains("#abcdef"));
    assert!(!declares_background(&base_rule(&css, "team-root")));
    assert!(!declares_background(&base_rule(&css, "about-root")));
}

#[test]
fn the_pages_html_does_not_change_when_only_another_pages_background_changes() {
    let site = fixture();
    let before = compile(&site);
    let mut changed = site.clone();
    set_background(&mut changed, "about-root", "#102030");
    let after = compile(&changed);
    for path in ["index.html", "team/index.html", "fares/index.html", "about/index.html"] {
        assert_eq!(before[path], after[path], "{path}");
    }
    assert_ne!(before["assets/site.css"], after["assets/site.css"]);
}

#[test]
fn a_page_background_that_is_not_a_safe_css_value_is_refused_by_the_export() {
    let mut site = fixture();
    set_background(&mut site, "about-root", "url(https://evil.example/x.png)");
    assert!(formweb_export::export(&site, &json!({})).is_err());
}
