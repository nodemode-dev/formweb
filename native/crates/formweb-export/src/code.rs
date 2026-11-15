use crate::escape;
use formweb_model::Site;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn hash(value: &str) -> String { Sha256::digest(value.as_bytes()).iter().map(|b|format!("{b:02x}")).collect() }
fn encode(value: &str) -> String { value.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect() }
pub fn files(site: &Site) -> Result<Vec<Value>, String> {
    let mut output = vec![];
    if let Some(components) = site.extensions.get("code").and_then(|v| v.get("components")).and_then(Value::as_object) {
        for (id, component) in components {
            if component.get("enabled").and_then(Value::as_bool) != Some(true) { continue; }
            let source = component.get("source").and_then(Value::as_str).ok_or("code source missing")?;
            let javascript = component.get("javascript").and_then(Value::as_str).ok_or("compiled code missing; build the component first")?;
            if component.get("sourceDigest").and_then(Value::as_str) != Some(hash(source).as_str()) || component.get("builtDigest").and_then(Value::as_str) != Some(hash(javascript).as_str()) { return Err(format!("code component {id} build hashes differ from source; rebuild before export")); }
            if component.get("mode").and_then(Value::as_str) == Some("page") {
                output.push(json!({"path":format!("assets/components/{id}.js"),"content":javascript}));
                continue;
            }
            let html = crate::isolated::document(javascript, component.get("props").unwrap_or(&json!({})));
            output.push(json!({"path":format!("assets/components/{id}.html"),"content":html}));
        }
    }
    Ok(output)
}
pub fn page_host(site: &Site, node: &str) -> Result<Option<(String, Option<String>)>, String> {
    let Some(instance) = site.extensions.get("code").and_then(|v| v.get("instances")).and_then(|v| v.get(node)) else { return Ok(None); };
    let component = instance.get("component").and_then(Value::as_str).ok_or("code component instance missing id")?;
    let definition = site.extensions.get("code").and_then(|v| v.get("components")).and_then(|v| v.get(component)).ok_or("code component not found")?;
    if definition.get("mode").and_then(Value::as_str) != Some("page") { return Ok(None); }
    if definition.get("enabled").and_then(Value::as_bool) != Some(true) { return Err("code component is not explicitly enabled".into()); }
    Ok(Some((component.to_string(), definition.get("poster").and_then(Value::as_str).filter(|p| !p.is_empty()).map(str::to_string))))
}
pub fn uses_page(site: &Site) -> bool {
    let Some(group) = site.extensions.get("code") else { return false };
    let Some(instances) = group.get("instances").and_then(Value::as_object) else { return false };
    instances.iter().any(|(node, instance)| site.nodes.contains_key(node) && instance.get("component").and_then(Value::as_str).and_then(|id| group.get("components")?.get(id)).map(|c| c.get("mode").and_then(Value::as_str) == Some("page") && c.get("enabled").and_then(Value::as_bool) == Some(true)).unwrap_or(false))
}
pub fn render(site: &Site, node: &str, prefix: &str) -> Result<Option<String>, String> {
    let Some(instance) = site.extensions.get("code").and_then(|v| v.get("instances")).and_then(|v| v.get(node)) else { return Ok(None); };
    let component = instance.get("component").and_then(Value::as_str).ok_or("code component instance missing id")?;
    let definition = site.extensions.get("code").and_then(|v| v.get("components")).and_then(|v| v.get(component)).ok_or("code component not found")?;
    if definition.get("enabled").and_then(Value::as_bool) != Some(true) { return Err("code component is not explicitly enabled".into()); }
    if definition.get("mode").and_then(Value::as_str) == Some("page") { return Ok(None); }
    let props = instance.get("props").cloned().unwrap_or_else(|| json!({}));
    let encoded = encode(&props.to_string());
    Ok(Some(format!("<iframe data-fw-code=\"{}\" src=\"{}assets/components/{}.html#{}\" sandbox=\"allow-scripts\" title=\"{}\" style=\"width:100%;height:240px;border:0;display:block\" loading=\"lazy\"></iframe>", escape(component), prefix, escape(component), encoded, escape(&format!("Code component {component}")))))
}
