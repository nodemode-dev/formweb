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
    if let Some(components)=scoped.extensions.get("components").and_then(|v|v.get("definitions")).and_then(serde_json::Value::as_object) { let used:BTreeSet<_>=scoped.nodes.values().filter_map(|node|node.component_id.as_ref()).collect();for(id,definition)in components{if used.contains(id){values.push(definition.to_string());}} }
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
    format!("{}{}",crate::stylesheet(&scoped),crate::advanced::styles(&scoped))
}
