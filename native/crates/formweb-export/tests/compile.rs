use formweb_model::{blank_node, starter, Page, Seo, Site};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn add_page(site: &mut Site, id: &str, slug: &str, links: &[&str]) {
    let root = format!("{id}-root");
    site.nodes.insert(root.clone(), blank_node(&root, "main", id, "", &[]));
    site.nodes.insert(format!("{id}-h"), blank_node(&format!("{id}-h"), "h1", "Title", id, &[]));
    site.nodes.get_mut(&root).unwrap().children.push(format!("{id}-h"));
    for (index, href) in links.iter().enumerate() {
        let link = format!("{id}-link-{index}");
        let mut node = blank_node(&link, "a", "Link", "go", &[]);
        node.attrs.insert("href".into(), (*href).into());
        site.nodes.insert(link.clone(), node);
        site.nodes.get_mut(&root).unwrap().children.push(link);
    }
    site.pages.push(Page { id: id.into(), name: id.into(), slug: slug.into(), root, seo: Seo { title: format!("{id} title"), description: format!("{id} description"), noindex: false } });
}

fn fixture() -> Site {
    let mut site = starter("Fixture");
    site.nodes.get_mut("cta").unwrap().attrs.insert("href".into(), "/about".into());
    add_page(&mut site, "about", "/about", &["/", "/about/team", "#top", "https://example.org/x", "mailto:a@example.org"]);
    add_page(&mut site, "team", "/about/team", &["/about", "/", "/missing-page"]);
    formweb_model::validate(&site).unwrap();
    site
}

fn compile(site: &Site) -> BTreeMap<String, String> {
    let output = formweb_export::export(site, &json!({})).unwrap();
    output["files"].as_array().unwrap().iter().map(|f| (f["path"].as_str().unwrap().to_string(), f["content"].as_str().unwrap_or("").to_string())).collect()
}

fn hrefs(html: &str) -> Vec<String> {
    let mut found = vec![];
    let mut rest = html;
    while let Some(at) = rest.find(" href=\"") {
        rest = &rest[at + 7..];
        let end = rest.find('"').unwrap();
        found.push(rest[..end].to_string());
        rest = &rest[end..];
    }
    found
}

fn resolve(from: &str, href: &str) -> Option<String> {
    if href.is_empty() || href.starts_with('#') || href.contains(':') || href.starts_with("//") {
        return None;
    }
    let path = href.split(['?', '#']).next().unwrap();
    let mut parts: Vec<&str> = if path.starts_with('/') { vec![] } else { from.rsplit_once('/').map(|(dir, _)| dir.split('/').collect()).unwrap_or_default() };
    for piece in path.split('/') {
        match piece {
            "" | "." => {}
            ".." => { parts.pop(); }
            other => parts.push(other),
        }
    }
    let mut target = parts.join("/");
    if path.is_empty() || path.ends_with('/') || !parts.last().map(|p| p.contains('.')).unwrap_or(false) {
        if !target.is_empty() { target.push('/'); }
        target.push_str("index.html");
    }
    Some(target)
}

#[test]
fn the_compile_produces_one_file_per_page_and_the_site_files() {
    let files = compile(&fixture());
    for path in ["index.html", "about/index.html", "about/team/index.html", "assets/site.css", "assets/runtime.js", "sitemap.xml", "robots.txt", "routes.json", "site.formweb.json"] {
        assert!(files.contains_key(path), "{path} missing from {:?}", files.keys());
    }
    let routes: Value = serde_json::from_str(&files["routes.json"]).unwrap();
    let listed: BTreeSet<&str> = routes.as_array().unwrap().iter().map(|r| r["path"].as_str().unwrap()).collect();
    assert_eq!(listed, BTreeSet::from(["index.html", "about/index.html", "about/team/index.html"]));
}

#[test]
fn every_internal_link_and_asset_reference_lands_on_a_compiled_file() {
    let files = compile(&fixture());
    let mut checked = 0;
    for (path, html) in files.iter().filter(|(p, _)| p.ends_with(".html")) {
        for href in hrefs(html) {
            if let Some(target) = resolve(path, &href) {
                if href == "/missing-page" { continue; }
                assert!(files.contains_key(&target), "{path} links to {href}, which resolves to {target}, not in the export");
                checked += 1;
            }
        }
    }
    assert!(checked >= 8, "only {checked} links were checked");
}

#[test]
fn site_links_are_rewritten_relative_to_the_page_that_holds_them() {
    let files = compile(&fixture());
    assert!(hrefs(&files["index.html"]).contains(&"about/".to_string()));
    let team = hrefs(&files["about/team/index.html"]);
    assert!(team.contains(&"../../about/".to_string()) || team.contains(&"../../".to_string()), "{team:?}");
    assert!(team.contains(&"../../../".to_string()) || team.contains(&"../../".to_string()), "{team:?}");
    assert!(team.contains(&"../../assets/site.css".to_string()), "{team:?}");
}

#[test]
fn external_and_fragment_links_are_left_alone() {
    let files = compile(&fixture());
    let about = hrefs(&files["about/index.html"]);
    for kept in ["#top", "https://example.org/x", "mailto:a@example.org"] {
        assert!(about.contains(&kept.to_string()), "{kept} in {about:?}");
    }
}

#[test]
fn the_sitemap_lists_exactly_the_indexable_pages() {
    let mut site = fixture();
    site.pages[2].seo.noindex = true;
    let files = compile(&site);
    let sitemap = &files["sitemap.xml"];
    assert_eq!(sitemap.matches("<loc>").count(), 2);
    assert!(sitemap.contains("https://example.com/about/</loc>"));
    assert!(!sitemap.contains("about/team"));
    assert!(files["about/team/index.html"].contains("noindex"));
}

#[test]
fn the_compile_refuses_an_invalid_site() {
    let mut site = fixture();
    site.nodes.get_mut("about-link-0").unwrap().attrs.insert("href".into(), "javascript:run()".into());
    assert!(formweb_export::export(&site, &json!({})).is_err());
}

#[test]
fn the_compile_is_deterministic() {
    let site = fixture();
    assert_eq!(compile(&site), compile(&site));
}

#[test]
fn the_exported_source_document_is_the_site_that_was_compiled() {
    let site = fixture();
    let files = compile(&site);
    let back: Site = serde_json::from_str(&files["site.formweb.json"]).unwrap();
    assert_eq!(back, site);
}

#[test]
fn text_and_attributes_are_escaped_in_the_page() {
    let mut site = fixture();
    site.nodes.get_mut("about-h").unwrap().text = "<b>\"x\" & y</b>".into();
    let html = compile(&site)["about/index.html"].clone();
    assert!(!html.contains("<b>\"x\""));
    assert!(html.contains("&lt;b&gt;"));
}

fn css_rule(css: &str, id: &str) -> Vec<(usize, String)> {
    let needle = format!("[data-fw-node=\"{id}\"]{{");
    css.match_indices(&needle).map(|(at, _)| (at, css[at..].split_once('}').unwrap().0.to_string())).collect()
}

#[test]
fn breakpoints_cascade_from_the_widest_to_the_narrowest() {
    let css = compile(&fixture())["assets/site.css"].clone();
    let tablet = css.find("@media(max-width:991px)").expect("tablet block");
    let mobile = css.find("@media(max-width:767px)").expect("mobile block");
    assert!(tablet < mobile, "the narrower breakpoint must come later so it wins");
    let base = css_rule(&css, "hero");
    assert_eq!(base.len(), 2, "one base rule and one mobile rule");
    assert!(base[0].0 < tablet && base[1].0 > mobile);
    assert!(base[0].1.contains("grid-template-columns:1.5fr 1fr"));
    assert!(base[1].1.contains("grid-template-columns:1fr"));
}

#[test]
fn a_breakpoint_override_appears_only_inside_its_own_media_block() {
    let mut site = fixture();
    site.nodes.get_mut("hero").unwrap().breakpoints.insert("tablet".into(), [("gap".to_string(), "10px".to_string())].into());
    let css = compile(&site)["assets/site.css"].clone();
    let tablet = css.find("@media(max-width:991px)").unwrap();
    let mobile = css.find("@media(max-width:767px)").unwrap();
    let inside_tablet = &css[tablet..mobile];
    assert!(inside_tablet.contains("gap:10px"));
    assert!(!css[mobile..].contains("gap:10px"));
    assert!(!css[..tablet].contains("gap:10px"));
}

#[test]
fn the_widest_breakpoint_is_folded_into_the_base_rule_not_a_media_query() {
    let mut site = fixture();
    site.nodes.get_mut("hero").unwrap().breakpoints.insert("desktop".into(), [("padding".to_string(), "1px".to_string())].into());
    let css = compile(&site)["assets/site.css"].clone();
    assert!(!css.contains("max-width:100000px"));
    let rules = css_rule(&css, "hero");
    assert!(rules[0].1.contains("padding:1px"));
}

#[test]
fn media_blocks_follow_the_width_not_the_order_the_breakpoints_were_declared() {
    let mut site = fixture();
    site.breakpoints.reverse();
    let css = compile(&site)["assets/site.css"].clone();
    assert!(css.find("@media(max-width:991px)").unwrap() < css.find("@media(max-width:767px)").unwrap());
}

#[test]
fn tokens_are_exported_as_custom_properties() {
    let css = compile(&fixture())["assets/site.css"].clone();
    assert!(css.contains("--accent:#d6f05d;"));
}

fn runtime_fixture() -> Site {
    let mut site = fixture();
    site.extensions.insert("integrations".into(), json!({"widgets": {}}));
    formweb_model::validate(&site).unwrap();
    site
}

const RUNTIME_TOKEN: &str = "Rt0ken-for-one-publication_0123456789abcd";

#[test]
fn a_publication_token_reaches_every_page_config_and_no_other_file() {
    let output = formweb_export::export(&runtime_fixture(), &json!({"formsEndpoint": "http://127.0.0.1:8240/published/one/v1", "runtimeToken": RUNTIME_TOKEN})).unwrap();
    let mut pages = 0;
    for file in output["files"].as_array().unwrap() {
        let path = file["path"].as_str().unwrap();
        let content = file["content"].as_str().unwrap_or("");
        if path.ends_with(".html") && !path.starts_with("assets/") {
            let config = content.split("id=\"fw-config\">").nth(1).and_then(|rest| rest.split("</script>").next()).unwrap();
            let config: Value = serde_json::from_str(config).unwrap();
            assert_eq!(config["context"]["runtimeToken"], RUNTIME_TOKEN, "{path}");
            pages += 1;
        } else {
            assert!(!content.contains(RUNTIME_TOKEN), "{path} carries the publication token");
        }
    }
    assert_eq!(pages, 3);
}

#[test]
fn a_publication_token_that_is_short_or_not_url_safe_is_refused() {
    for token in ["short", "has a space and is long enough to pass the length test", "quote\"and<angle>brackets-make-this-long-enough"] {
        let refused = formweb_export::export(&runtime_fixture(), &json!({"runtimeToken": token}));
        assert!(refused.unwrap_err().contains("runtimeToken"), "{token}");
    }
}

#[test]
fn an_export_without_a_publication_token_carries_none() {
    let output = formweb_export::export(&runtime_fixture(), &json!({})).unwrap();
    let home = output["files"].as_array().unwrap().iter().find(|f| f["path"] == "index.html").unwrap()["content"].as_str().unwrap().to_string();
    assert!(!home.contains("runtimeToken"));
}
