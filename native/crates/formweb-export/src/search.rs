use crate::routing::{self, Route};
use formweb_model::Site;
use serde_json::{json, Value};

fn uses_search(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.get("action").and_then(Value::as_str) == Some("search") || map.values().any(uses_search),
        Value::Array(list) => list.iter().any(uses_search),
        _ => false,
    }
}

fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn node_text(site: &Site, locale: &str, id: &str) -> String {
    let Some(node) = site.nodes.get(id) else { return String::new() };
    if node.attrs.contains_key("hidden") { return String::new(); }
    if let Some(text) = crate::variables::output_text(site, node) { return text; }
    crate::translation(site, locale, &node.id, &node.text)
}

fn walk(site: &Site, locale: &str, id: &str, texts: &mut Vec<String>, headings: &mut Vec<String>, seen: &mut usize, chrome: bool) {
    let Some(node) = site.nodes.get(id) else { return };
    if node.attrs.contains_key("hidden") || *seen > 20000 { return; }
    *seen += 1;
    let chrome = chrome || ["nav", "footer"].contains(&node.tag.as_str());
    let own = collapse(&node_text(site, locale, id));
    if !own.is_empty() {
        if ["h1", "h2", "h3"].contains(&node.tag.as_str()) && headings.len() < 50 { headings.push(own.clone()); }
        if !chrome { texts.push(own); }
    }
    for child in &node.children { walk(site, locale, child, texts, headings, seen, chrome); }
}

pub fn index(site: &Site, routes: &[Route]) -> Option<String> {
    let motion = site.extensions.get("motion")?;
    let used = ["actions", "scenes"].iter().any(|key| motion.get(*key).map(uses_search).unwrap_or(false));
    if !used { return None; }
    let entries: Vec<Value> = routes.iter().filter(|route| route.page.slug.trim_matches('/') != "404").map(|route| {
        let (title, _, _) = routing::metadata(site, route);
        let mut texts = Vec::new();
        let mut headings = Vec::new();
        let mut seen = 0;
        walk(site, &route.locale, &route.page.root, &mut texts, &mut headings, &mut seen, false);
        let text: String = collapse(&texts.join(" ")).chars().take(4000).collect();
        let slug = route.slug.trim_matches('/');
        let path = if slug.is_empty() { String::new() } else { format!("{slug}/") };
        json!({"path": path, "locale": route.locale, "title": title, "headings": headings, "text": text})
    }).collect();
    serde_json::to_string(&entries).ok()
}
