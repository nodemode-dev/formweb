use formweb_model::Site;
use serde_json::{json, Value};

pub fn spec<'a>(site: &'a Site, node: &str) -> Option<&'a Value> {
    let group = site.extensions.get("code")?;
    if group.get("allowSections").and_then(Value::as_bool) != Some(true) { return None; }
    let section = group.get("sections")?.get(node)?;
    (section.get("enabled").and_then(Value::as_bool) == Some(true) && site.nodes.contains_key(node)).then_some(section)
}

fn script(section: &Value) -> Option<&str> {
    section.get("js").and_then(Value::as_str).filter(|js| !js.is_empty())
}

pub fn html(section: &Value) -> &str {
    section.get("html").and_then(Value::as_str).unwrap_or("")
}

pub fn tag(site: &Site, node: &str, prefix: &str) -> Option<String> {
    let section = spec(site, node)?;
    script(section)?;
    if section.get("module").and_then(Value::as_bool) == Some(true) { return Some(format!("<script type=\"module\" src=\"{prefix}assets/sections/{node}.js\"></script>")); }
    Some(format!("<script src=\"{prefix}assets/sections/{node}.js\" defer></script>"))
}

pub fn used(site: &Site) -> Vec<String> {
    let Some(sections) = site.extensions.get("code").and_then(|v| v.get("sections")).and_then(Value::as_object) else { return Vec::new() };
    sections.keys().filter(|node| spec(site, node).and_then(script).is_some()).cloned().collect()
}

pub fn files(site: &Site) -> Vec<Value> {
    used(site).into_iter().filter_map(|node| {
        let section = spec(site, &node)?;
        let js = script(section)?;
        let content = if section.get("module").and_then(Value::as_bool) == Some(true) {
            format!("const host=document.querySelector('[data-fw-node=\"{node}\"]');\n{js}")
        } else {
            format!("(function(host){{\n{js}\n}})(document.querySelector('[data-fw-node=\"{node}\"]'));")
        };
        Some(json!({"path":format!("assets/sections/{node}.js"),"content":content}))
    }).collect()
}
