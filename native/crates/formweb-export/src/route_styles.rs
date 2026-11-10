use formweb_model::Site;
use std::collections::BTreeSet;

pub fn base(site: &Site) -> String { let mut empty = site.clone(); empty.nodes.clear(); empty.tokens.clear(); crate::stylesheet(&empty) }
pub fn render(site: &Site, root: &str) -> String {
    let mut ids = BTreeSet::new();
    let mut pending = vec![root.to_string()];
    while let Some(id) = pending.pop() { if ids.insert(id.clone()) { if let Some(node) = site.nodes.get(&id) { pending.extend(node.children.iter().cloned()); } } }
    let mut scoped = site.clone();
    scoped.nodes.retain(|id, _| ids.contains(id));
    if let Some(nodes) = scoped.extensions.get_mut("behaviors").and_then(|v|v.get_mut("nodes")).and_then(serde_json::Value::as_object_mut) { nodes.retain(|id, _|ids.contains(id)); }
    let mut needed = BTreeSet::new();
    let mut values: Vec<String> = scoped.nodes.values().flat_map(|node|node.styles.values().chain(node.breakpoints.values().flat_map(|map|map.values()))).cloned().collect();
    if let Some(behaviors)=scoped.extensions.get("behaviors") { values.push(behaviors.to_string()); }
    if let Some(motion)=scoped.extensions.get("motion") { values.push(motion.to_string()); }
    if let Some(themes)=scoped.extensions.get("design").and_then(|v|v.get("themes")) { values.push(themes.to_string()); }
    if let Some(components)=scoped.extensions.get("components").and_then(|v|v.get("definitions")).and_then(serde_json::Value::as_object) { let used:BTreeSet<_>=scoped.nodes.values().filter_map(|node|node.component_id.as_ref()).collect();for(id,definition)in components{if used.contains(id){values.push(definition.to_string());}} }
    // Page components and code sections read tokens from their own CSS and script, which no node style mentions.
    if let Some(code)=scoped.extensions.get("code") {
        for (host, instance) in code.get("instances").and_then(serde_json::Value::as_object).into_iter().flatten() {
            if !ids.contains(host) { continue; }
            values.push(instance.to_string());
            if let Some(definition)=instance.get("component").and_then(serde_json::Value::as_str).and_then(|id|code.get("components")?.get(id)) {
                values.push(definition.get("source").and_then(serde_json::Value::as_str).unwrap_or("").to_string());
                values.push(definition.get("props").map(|p|p.to_string()).unwrap_or_default());
            }
        }
        for (host, section) in code.get("sections").and_then(serde_json::Value::as_object).into_iter().flatten() {
            if ids.contains(host) { for key in ["css","js","html"] { values.push(section.get(key).and_then(serde_json::Value::as_str).unwrap_or("").to_string()); } }
        }
    }
    while let Some(value) = values.pop() {
        let mut tail = value.as_str();
        while let Some(index) = tail.find("var(--") {
            tail = &tail[index + 6..];
            let end = tail.find(|c:char|!c.is_ascii_alphanumeric()&&c!='-'&&c!='_').unwrap_or(tail.len());
            let name = tail[..end].to_string();
            if needed.insert(name.clone()) { if let Some(value) = site.tokens.get(&name).or_else(||site.tokens.get(&format!("--{name}"))) { values.push(value.clone()); } }
            tail = &tail[end..];
        }
    }
    scoped.tokens.retain(|key, _|needed.contains(key.trim_start_matches("--")));
    format!("{}{}{}",crate::stylesheet(&scoped),crate::advanced::styles(&scoped),extras(&scoped))
}
fn extras(site: &Site) -> String {
    let mut css = String::new();
    for (id, node) in &site.nodes {
        if let Some(reserve) = crate::variables::reserve(site, id) {
            let inline = ["span", "strong", "em", "b", "i", "small", "a", "code", "time", "label"].contains(&node.tag.as_str());
            css.push_str(&format!("[data-fw-node=\"{id}\"]{{font-variant-numeric:tabular-nums;min-width:{reserve}ch{}}}\n", if inline { ";display:inline-block" } else { "" }));
        }
    }
    let code = site.extensions.get("code");
    let hosts = code.and_then(|v| v.get("instances")).and_then(serde_json::Value::as_object).map(|map| map.iter().filter(|(host, _)| site.nodes.contains_key(*host)).any(|(_, instance)| {
        let definition = instance.get("component").and_then(serde_json::Value::as_str).and_then(|component| code?.get("components")?.get(component));
        definition.map(|d| d.get("enabled").and_then(serde_json::Value::as_bool) == Some(true) && d.get("mode").and_then(serde_json::Value::as_str) == Some("page")).unwrap_or(false)
    })).unwrap_or(false);
    if hosts { css.push_str(":where([data-fw-component]){position:relative}\n[data-fw-poster]{display:block;width:100%;height:100%;object-fit:cover}\n"); }
    if code.and_then(|v| v.get("allowSections")).and_then(serde_json::Value::as_bool) == Some(true) {
        if let Some(sections) = code.and_then(|v| v.get("sections")).and_then(serde_json::Value::as_object) {
            for id in site.nodes.keys() {
                if let Some(section) = sections.get(id) {
                    if section.get("enabled").and_then(serde_json::Value::as_bool) != Some(true) { continue; }
                    if let Some(text) = section.get("css").and_then(serde_json::Value::as_str) { if !text.is_empty() { css.push_str(text); css.push('\n'); } }
                }
            }
        }
    }
    css
}
